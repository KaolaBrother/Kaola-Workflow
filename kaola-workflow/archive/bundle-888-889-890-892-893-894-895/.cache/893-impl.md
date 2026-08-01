# #893 — implementation: the sink stops refusing its own archive mirror

**Verification tier:** `tests-green`
**Worktree:** `.kw/worktrees/bundle-888-889-890-892-893-894-895`
**Baseline commit:** `fa5157b3f62caab0ff8bc13d330d994c0962ceed`
**Test artifact:** `scripts/test-sink-merge.js` — read and run, **never written**. `git diff --stat` on it
shows only the test author's 242 insertions; my write-set never included it.

---

## Files changed (the whole write-set, nothing else)

| file | md5 before | md5 after |
|---|---|---|
| `scripts/kaola-workflow-sink-merge.js` | `cae3e4be3a4f3bc0869664b4c50f6cb9` | `007998d32b3bb576a8031572e7051644` |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | `cae3e4be3a4f3bc0869664b4c50f6cb9` | `007998d32b3bb576a8031572e7051644` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | `d169ad78da6eb7747481e467fd475c95` | `a821542c350e45039e58f10e01cb7ab4` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | `1adfd05961cefb5984a2ea892dbe55d1` | `4f07e3e7a1244dd47e6bd579f2158e10` |

---

## The implementation

In `sinkPreflight`, `scripts/kaola-workflow-sink-merge.js:1386-1417` — a new exemption sitting
**immediately after** `SINK_RECEIPT_EXEMPT` (`:1384-1385`) and **before** the `isWorktreePath`
exclusion and bucket 3's `foreignDirt.push(filePath)`.

```js
const ownArchivePrefix = 'kaola-workflow/archive/' + project + '/';
if (xy === '??' && filePath.startsWith(ownArchivePrefix)) {
  const archiveKey = branchless ? 'HEAD' : branch;
  let branchBytes = null;
  try {
    branchBytes = execFileSync('git', ['-C', mainRoot, 'show', archiveKey + ':' + filePath],
      { maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {}
  if (branchBytes === null) continue;
  let workBytes = null;
  try { workBytes = fs.readFileSync(path.join(mainRoot, filePath)); } catch (_) {}
  if (workBytes !== null && branchBytes.equals(workBytes)) continue;
  // Divergent (or unreadable) — no continue: it stays foreign dirt below.
}
```

The three-way branch consult, exactly as ruled:

- **absent on the branch → exempt.** The observed shape. `archiveProjectDir`
  (`scripts/kaola-workflow-claim.js:2474-2486`) states outright that on a linked run the archive lands
  under MAIN's root and the feature branch never carries the archive path, because `cmdFinalize` cannot
  stage a path outside its own worktree and defers the commit to the sink.
- **present and byte-equal → exempt.** A duplicate of what the branch already carries.
- **present and DIVERGENT → falls through to bucket 3.** Two archives disagreeing must refuse loudly
  rather than let one side silently win.

`git show` is used rather than bucket 2's `cat-file -e` deliberately. `cat-file -e` answers only *does
the branch carry this path*, which is false in the observed shape — an exemption keyed on it can never
fire on the actual bug. Comparison is on raw `Buffer`s (`execFileSync` with no `encoding`), so it is
binary-safe; `GIT_MAX_BUFFER` (64 MiB, `:51`) matches every other git read in the file.

### Placement relative to the existing buckets and `SINK_RECEIPT_EXEMPT`

Placed after `SINK_RECEIPT_EXEMPT` so the `#715` exemption is provably untouched. This matters because
the two path sets intersect at `kaola-workflow/archive/<project>/.cache/sink-receipt.json`. The new
rule only ever `continue`s or **falls through** — it never pushes to `foreignDirt` and never
`break`s — so on the divergent branch control reaches every check below it unchanged. `#715`'s
unconditional exemption therefore still wins for the receipt path, and the `isWorktreePath` exclusion
still runs. Ordering against `isWorktreePath` is behaviourally inert for the same reason (both
outcomes of the new rule leave that check reachable or already-satisfied), so the choice was made on
readability: it belongs with the other exemptions, not interleaved with the worktree bookkeeping.

### Scoping to THIS project, on a segment boundary

The prefix is `'kaola-workflow/archive/' + project + '/'` — the **trailing slash is the segment
boundary**. A plain `startsWith` against that string cannot match a sibling segment:

- `kaola-workflow/archive/issue-89303-sibling/mission-list.md` does not start with
  `kaola-workflow/archive/issue-89303/` → stays bucket-3.
- `kaola-workflow/archive/issue-89393/...` shares no prefix at all → stays bucket-3.

A plain string test (not a regex) is used so a project name containing regex metacharacters cannot
widen the match. Mutation proof M1 below shows the boundary is load-bearing, not decorative.

### Proof it is classification-only

Three independent facts:

1. **Control flow.** The only actions in the block are `continue` and falling out of the `if`. The
   path is never appended to `projDuplicates`, whose action at `:1449-1454` is `fs.unlinkSync`. Nothing
   in the block writes, moves, or removes anything on disk; the only side effects are two reads
   (`git show`, `fs.readFileSync`).
2. **The tests pin the no-loss claim from both directions.** `w1` asserts each of the four mirrored
   files is present **at HEAD** carrying the mirrored content after `status: sinked` — main holds the
   run's only copy, so a bucket-2-style removal would have made those four assertions fail with
   `null`. `w2` and `w3` assert each mirrored/sibling file is byte-untouched on disk after a refusal,
   and that `git status --porcelain -uall` is byte-identical before and after.
3. **The zero-mutation invariant is upstream of the exemption.** `sinkPreflight` performs no mutation
   at all until after the `foreignDirt.length > 0` early return (`:1422-1429`), so a refusal that
   happens to contain exempted paths still mutates nothing.

### Untracked-only (`xy === '??'`)

The exemption requires `??`, mirroring bucket 2. finalize's mirror is untracked by construction; a
tracked modification (` M`) or deletion (` D`) under the archive path is a local edit to *committed*
content, which is genuinely foreign dirt and must keep refusing. This narrows the widening rather
than expanding it.

### `#711` branchless handling

The canonical script keys on `branchless ? 'HEAD' : branch`, matching bucket 2's `catKey` derivation
at `:1355`. The two forge ports do not carry the `#711` branchless work at all (`grep branchless`
returns nothing in either), so they key on `branch` directly — matching each port's own bucket 2
(`kaola-gitea-…:1354`, `kaola-gitlab-…:1361`). Porting the branchless split into them would be a
behaviour change outside this issue.

---

## Forge-port treatment

Checked with `md5` **before** editing:

- `scripts/…` and `plugins/kaola-workflow/scripts/…` were **byte-identical** (`cae3e4be…`), 2590 lines
  each. Relationship preserved: the canonical file was edited and `cp`'d verbatim to the plugin twin,
  and both now hash to `007998d3…`.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` (2039 lines) and
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (2045 lines) are
  **genuine ports**: different basenames, different line counts, condensed one-line bodies and
  condensed comments, and no `#711` branchless handling. Each received a real per-forge edit written in
  its own local idiom (condensed comment block, one-line `try`/`catch`), not a paste of the canonical
  text. This region of `sinkPreflight` contains no forge nouns — it is pure git plumbing — so the
  logic is identical while the surrounding style is each port's own.

All four pass `node --check`. `node scripts/edition-sync.js --check` → **exit 0**, unchanged from
baseline (`8 forge aggregator ports in parity with canonical` · `committed kernel parity verified at
HEAD`). `edition-sync.js --write` was **not** run.

---

## Verification

| command | before | after |
|---|---|---|
| `node scripts/test-sink-merge.js` | exit **1** — `16 failed, 192 passed` | exit **0** — `passed: 208 assertions` |
| `node scripts/edition-sync.js --check` | exit **0** | exit **0** |
| `node --check` × 4 sink files | — | all OK |

Before, verbatim:

```
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 16 failed, 192 passed.
```

After, verbatim:

```
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite passed: 208 assertions.
```

`grep -c '^FAIL:'` on the after-run is **0**. Exactly the 16 baseline failures flipped; nothing else
moved. Per-scenario this matches the test author's prediction (w1 8 · w2 4 · w3 4 = 16 new-behaviour
assertions; w4's 4 were already green as a fence and stayed green).

The full walkthrough was **not** run, per the brief.

---

## Mutation proofs

Both run against a **scratch mirror**, never the worktree. The mirror is
`/private/tmp/claude-501/…/scratchpad/mut/`: every worktree-root entry symlinked in, with `scripts/`
replaced by a real recursive copy so the suite's `repoRoot = path.resolve(__dirname, '..')`
(`test-sink-merge.js:81`) and `sinkMergeScript` (`:82`) resolve to the mutable copy. No
`git checkout --` and no `git stash` was used anywhere.

**Control** — unmutated scratch mirror: `exit 0`, `passed: 208 assertions`. The harness is known-good
in the mirror, so a red below is the mutation and not the mirror.

### M1 — segment boundary removed

`'kaola-workflow/archive/' + project + '/'` → `'kaola-workflow/archive/' + project` (bare prefix, no
boundary). Everything else identical.

```
EXIT=1
FAIL: #893 w3: foreign_dirt must list kaola-workflow/archive/issue-89303-sibling/mission-list.md — the widening is keyed on THIS project only; got [...]
Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 1 failed, 207 passed.
```

The prefix look-alike is the *only* assertion that moves — precisely the fence the test author planted
for it. A boundary-less prefix passes the headline case and silently swallows
`issue-89303-sibling`; the suite catches it.

### M2 — exemption widened to the whole archive band

`'kaola-workflow/archive/' + project + '/'` → `'kaola-workflow/archive/'` (branch verification kept,
so this isolates the project scoping alone).

```
EXIT=1
FAIL: #715 l: sink must refuse (non-zero exit) on sibling non-receipt dirt; got 0
FAIL: #715 l: reason must be sink_blocked; got undefined
FAIL: #715 l: foreign_dirt must list the exact path kaola-workflow/archive/sibling-71592/workflow-state.md; got undefined
FAIL: #715 l: foreign_dirt must list the exact path kaola-workflow/archive/sibling-71592/.cache/sink-receipt.json.tmp; got undefined
FAIL: #715 l: foreign_dirt must list the exact path kaola-workflow/archive/sibling-71592/x/.cache/sink-receipt.json; got undefined
FAIL: #715 l: foreign_dirt must list the exact path kaola-workflow/archive/sibling-71592/.cache/sink-receipt.json/inner.txt; got undefined
FAIL: #893 w3: sink must refuse on a sibling project's archive tree; got 0
FAIL: #893 w3: reason must be sink_blocked; got undefined
FAIL: #893 w3: foreign_dirt must list kaola-workflow/archive/issue-89393/mission-list.md — the widening is keyed on THIS project only; got undefined
FAIL: #893 w3: foreign_dirt must list kaola-workflow/archive/issue-89393/.cache/origin/selection-record.json — the widening is keyed on THIS project only; got undefined
FAIL: #893 w3: foreign_dirt must list kaola-workflow/archive/issue-89303-sibling/mission-list.md — the widening is keyed on THIS project only; got undefined
FAIL: #893 w3: kaola-workflow/archive/issue-89303/.cache/origin/selection-record.json is this sink's own mirror and must NOT be listed; got undefined
FAIL: #893 w3: kaola-workflow/archive/issue-89303/finalization-summary.md is this sink's own mirror and must NOT be listed; got undefined
FAIL: #893 w3: kaola-workflow/archive/issue-89303/mission-list.md is this sink's own mirror and must NOT be listed; got undefined
FAIL: #893 w3: kaola-workflow/archive/issue-89303/workflow-state.md is this sink's own mirror and must NOT be listed; got undefined
FAIL: #893 w3: git status must be unchanged after sink_blocked refuse
Sink-merge (…/#893) test suite FAILED: 16 failed, 192 passed.
```

Both predicted classes red: **all** of `w3`'s sibling and look-alike clauses, **and** the pre-existing
`#715 (l)` over-exemption guard. The never-touches-another-project invariant is armed by two
independent suites, not one.

### Restore, verified

Scratch restored from `mut-pristine.js`; `md5` of the restored scratch, the worktree canonical, and
the plugin twin all read `007998d32b3bb576a8031572e7051644` — identical, so neither mutation ever
reached the worktree.

---

## The `projStateFiles` finding — REPORTED, NOT FIXED

The issue is right that bucket 2's hard-coded list (`scripts/kaola-workflow-sink-merge.js:1345-1350`)
predates ADR 0017 and never names `mission-list.md`. Before my change `mission-list` appeared **zero**
times in the sink and appears **zero** times in `kaola-workflow-claim.js`. I did **not** add it.
Investigating whether the omission could bite on the live (non-archive) path:

**It cannot bite in isolation, and adding the name would create a data-loss route.** Four findings,
each with evidence.

**1. The normal route never reaches bucket 2's live path at all.** `archiveProjectDir` deletes MAIN's
live folder on both postures. Linked run: `scripts/kaola-workflow-claim.js:2499-2504` —
`const mainLive = path.join(mainRoot, 'kaola-workflow', project); … fs.rmSync(mainLive, {recursive:
true, force: true})`. In-place run: `:2511-2515` — `fs.renameSync(src, dest)` relocates the whole
folder. After any finalize, no `kaola-workflow/<project>/…` path survives in main for preflight to
classify. That is exactly why #893's observed failure was on the *archive* path and not this one.

**2. Reaching it requires an unfinalized run — and then the omission is not the differentiator.** The
live folder only survives to sink time if finalize never ran, i.e. the branch still carries
`kaola-workflow/<project>/workflow-state.md` — the condition `assertNoLiveWorkflowFolder`
(`:274-300`) names `run_not_finalized`. That precondition is wired **only** into the legacy path
(`:2488`); the `--sink` transaction (`sinkPreflight` at `:1615`) has no equivalent, so the shape is
reachable on `--sink`. But in that shape the four-name list under-covers the live folder by far more
than one file. This repo's own live folder, measured just now:

```
?? kaola-workflow/bundle-888-889-890-892-893-894-895/.cache/892-surface-map.md      off-list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/.cache/893-test-baseline.md    off-list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/.cache/894-site1.md            off-list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/.cache/895-mutation-proof.md   off-list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/.cache/dispatch-log.jsonl      ON list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/.cache/origin/selection-record.json  off-list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/mission-list.md                off-list
?? kaola-workflow/bundle-888-889-890-892-893-894-895/workflow-state.md              ON list
```

Six of eight are off-list (`git ls-files` on that folder returns 0 — all untracked). Adding
`mission-list.md` turns a refusal listing six paths into a refusal listing five. The outcome —
`sink_blocked` — is unchanged. No observed failure is fixed by the addition.

**3. Adding it would create a data-loss route that #893's own fix exists to avoid.** Bucket 2's action
is `fs.unlinkSync` (`:1449-1454`) and its superset test is `cat-file -e` (`:1358`) — an **existence**
probe that does **not** compare content. So a branch copy that merely exists at that path, at any
bytes, licenses deleting main's copy. Main is where the orchestrator writes the run record (observed
above: 26,995 bytes, untracked, main only). The mission list is written continuously across a run, so
a branch copy committed mid-run is *guaranteed* stale relative to main's. Adding the name would
convert "the branch holds a stale run record" into silent loss of the newest one. That is the precise
failure mode #893's implementation was written to avoid, which is why the new archive exemption is
`continue`-only and content-comparing rather than a bucket-2 entry.

**4. Recommendation.** Leave the list alone — derive additively; no failure has demanded it. If the
orchestrator later wants the live path covered, the right shape is *not* a fifth name on a deletion
list: it is either the same classification-only content-compare applied to the live prefix, or fixing
the real gap, which is that `--sink` never runs the `run_not_finalized` measurement the legacy path
runs. Both are separate decisions and separate issues.

---

## Out of scope, flagged not done

This is a user-visible behaviour change to the sink, so `CHANGELOG.md` under `[Unreleased]` (and
possibly `docs/api.md`'s `sinkPreflight` description) will want a line. Both are outside my write-set
and other agents hold them right now, so I did not touch either. The orchestrator should route it.
