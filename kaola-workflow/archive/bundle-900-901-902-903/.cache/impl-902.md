# Implementation — issue #902 (`finalize --check` predicts the authority the transaction constructs)

## Task

Converge `finalize --check` with the immediate finalize execution on the ordinary linked-worktree
topology: `--check` reported `archive_authority_missing` + exit 1 for an authority the transaction's
own Step-8a mirror creates one statement later. Premise was already fully measured in
`premise-902.md`; no re-investigation was done.

## Verification tier

`tests-green` — the four named suites plus `validate-script-sync.js` pass, and the behaviour change is
proven live in this repo and in five fixture legs including two mandatory fail-closed negatives and
two mutants. **No test file was written or edited** (custody is `tdd-guide`'s). See "Where tests are
needed".

## Files changed

Exactly the briefed byte-lockstep pair, kept byte-identical (`cmp` exit 0):

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/scripts/kaola-workflow-claim.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/plugins/kaola-workflow/scripts/kaola-workflow-claim.js`

Nothing else. The gitlab/gitea ports, `sink-merge.js`, `closure-audit.js`, `validation-runner.js`,
`adaptive-schema.js`, `templates/routing/`, rendered surfaces, `README.md`, `CHANGELOG.md` and `docs/`
were not touched. The #901 agent's uncommitted work in the same file is untouched — my diff is
confined to lines 3315–3717 and contains no reformatting.

## Functions changed (line refs are post-change, `scripts/kaola-workflow-claim.js`)

### 1. `probeFinalizeMirror` (`:3372`) — the dest-absent bit

New `destAbsent` field on **every** return (`:3374`, `:3375`, `:3382`, `:3384`, `:3386`, `:3391`,
`:3400`, `:3403`). `!fs.existsSync(destDir)` is hoisted to one `const destAbsent` at `:3380` and the
`skipped_post_archive` branch now reads it; branch order is unchanged (the function's contract
comment promises it mirrors `mirrorFinalizationArtifacts` "minus every write", and it still does —
only a read was hoisted, and the probe writes nothing between the two points).

Contract comment extended at `:3368-3371` to state why the bit is needed: `'ready'` is returned from
three distinct situations (no source record, safe compare, compare threw — `compareLedgers` fails open
on a null dest, `kaola-workflow-ledger-compare.js:51-53`), so `'ready'` **alone** never means "the
mirror will create the destination"; `'ready'` **and** `destAbsent` does.

### 2. `predictFinalizeAuthority` (`:3485`) — new, unexported

Placed beside the resolution it wraps, after `finalizeAuthorityHint`. Not added to `module.exports`,
so `FORGE_EXPORT_SUPERSET_FAMILY` (`validate-script-sync.js:485-486`) is unaffected — same approach
the #901 agent took. `validate-script-sync.js` exits 0 (see suites).

```js
function predictFinalizeAuthority(root, project, mirror)   // → { authority, pending, topology }
```

Behaviour: resolves normally, then — **only** when all four hold — re-resolves over the source the
mirror is about to copy:

1. `resolved.innerReason === 'archive_authority_missing'` (nothing else is converted),
2. `mirror.mainRoot` truthy (a linked worktree; an in-place run is left alone),
3. `mirror.state === 'ready'` (the mirror will actually run — not `source_absent`, not
   `skipped_post_archive`, not `sync_failed`),
4. `mirror.destAbsent` (the mirror will **create** the destination, not merge into one),

and then only if `resolveFinalizeAuthority(mirror.mainRoot, project).livePresent` — a source that
itself resolves to an archive or to nothing promises no construction. Any failure of any condition
leaves the original resolution, and therefore the original refusal, exactly as it was.

The authority is **not relocated to main**: `dest_dir` is `projectDir(root, project)`, the tree
execution reads. Only the state file the mirror will copy is read out of the source, because that is
the file the post-mirror resolution finds. (I did not widen the live probe, per the brief — and the
brief is right: widening would make `--check` name main as the authority while execution names the
worktree, which is the same defect inverted.)

### 3. `evaluateFinalizePreconditions` (`:3622`)

- `:3653-3660` — consumes the prediction. `authority.innerReason` still goes into `checks` **and**
  `reasons` unchanged; a *pending* construction with no inner reason sets `checks.workflow_state =
  'pending_mirror'` and pushes **nothing** into `reasons`. This is the existing mechanism, not a new
  one: identical to how `sync_required` is reported (`:3388-3390`, restated `:3613-3617`).
- `:3695` — returns `{ checks, reasons, authority: prediction.topology }`.
- Contract comment rewritten at `:3599-3617` to document the new token, the new return key, and the
  rule in one sentence: *"What a reader acts on is `reasons`; what the script still owes itself is a
  state token in `checks`."*
- `:3682-3685` — comment corrected: the validation measurement is no longer lost when the authority
  is predicted, because the predicted authority carries the same `.cache/` the mirror will copy.

### 4. `cmdFinalize` `--check` emit (`:3712-3715`)

Adds `authority: report.authority` to the envelope. Comment at `:3702-3707` updated so the stated
shape stays accurate. **No `operator_hint` was added** — see "What I deliberately did not change".

## New / changed output keys

`checks.workflow_state` gains one value:

| value | semantics |
|---|---|
| `pending_mirror` | An authority does not exist in this tree yet **and Step 8a will construct it** from the main checkout. Script-owned pending step, not an operator obligation. Never appears in `reasons`; does not make `ok` false. |

Unchanged: `ok`, `archive_authority_missing`, `archive_authority_ambiguous`,
`archive_authority_invalid_type`, `state_missing`, `state_unreadable`, `state_invalid_type`,
`archive_state_not_closed` — all still reported in `checks` **and** `reasons`, still exit 1.

New top-level envelope key `authority` (`--check` only):

| key | semantics |
|---|---|
| `main_root` | Absolute realpath of the main checkout. Falls back to the run root when unresolvable (same fail-open as `resolveMainRoot`). |
| `linked_root` | Absolute realpath of the linked worktree the run was invoked from; `null` on an in-place (main-root) run. |
| `source` | `'live'` \| `'archive'` \| `'pending_mirror'` \| `'none'` — where the authority is proven **today**. `'none'` means no single authority could be proven (absent, or ambiguous). |
| `source_dir` | Absolute path of the directory that proves the authority today, or `null`. On `pending_mirror` this is the **main-resident** run folder the mirror will copy. |
| `dest_dir` | Absolute path of the directory the transaction will read the authority from. Equals `source_dir` except on `pending_mirror`, where it is `<linked_root>/kaola-workflow/<project>`. `null` when `source` is `'none'`. |

`checks.mirror`'s vocabulary is **unchanged** — `destAbsent` is internal to the probe and is not
emitted; it is consumed by the prediction and surfaces as `authority.source: 'pending_mirror'`.

## Live before/after, both cwds

Project `bundle-900-901-902-903`; main-resident ledger; worktree does not carry it; no archive.
Both runs use the **same** script (the worktree copy) so only cwd varies. Real exit codes via bare
`echo $?`, never through a pipe.

### Before (worktree copy of claim.js, pre-change)

| cwd | exit | `checks.workflow_state` | `checks.validation` | `reasons` |
|---|---|---|---|---|
| main root | **0** | `ok` | `chains_unverified` | `[]` |
| linked worktree | **1** | `archive_authority_missing` | `not_checked` | `["archive_authority_missing"]` |

```json
{"project":"bundle-900-901-902-903","ok":false,"checks":{"mirror":"ready","workflow_state":"archive_authority_missing","implementation_commit":"not_checked","staging_guard":"ok","validation":"not_checked","changed_paths":[],"dirty_paths":[<18 sibling-agent files>]},"reasons":["archive_authority_missing"]}
```

### After

| cwd | exit | `checks.workflow_state` | `checks.validation` | `reasons` |
|---|---|---|---|---|
| main root | **0** | `ok` | `chains_unverified` | `[]` |
| linked worktree | **0** | `pending_mirror` | `chains_unverified` | `[]` |

main root (unchanged in `checks`/`reasons`, plus the new block):
```json
{"project":"bundle-900-901-902-903","ok":true,"checks":{"mirror":"not_needed","workflow_state":"ok","implementation_commit":"not_checked","staging_guard":"ok","validation":"chains_unverified","changed_paths":[],"dirty_paths":[]},"reasons":[],"authority":{"main_root":"/Users/ylpromax5/Workspace/Kaola-Workflow","linked_root":null,"source":"live","source_dir":"/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-900-901-902-903","dest_dir":"/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-900-901-902-903"}}
```

linked worktree (`dirty_paths` elided — 18 sibling agents' uncommitted files):
```json
{"project":"bundle-900-901-902-903","ok":true,"checks":{"mirror":"ready","workflow_state":"pending_mirror","implementation_commit":"not_checked","staging_guard":"ok","validation":"chains_unverified","changed_paths":[],"dirty_paths":["<18 sibling files>"]},"reasons":[],"authority":{"main_root":"/Users/ylpromax5/Workspace/Kaola-Workflow","linked_root":"/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903","source":"pending_mirror","source_dir":"/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-900-901-902-903","dest_dir":"/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903/kaola-workflow/bundle-900-901-902-903"}}
```

**The two cwds now also agree on `checks.validation`** (`chains_unverified` both sides) — before the
change the worktree lost the measurement to `not_checked`.

The real (non-`--check`) finalize was **never** run against this live project.

### `--keep-worktree` live, after: exit **1**, and that is correct

`reasons: ["implementation_commit_missing"]`, `checks.workflow_state: "pending_mirror"`. Verified
independently: `git diff --name-only main...HEAD | grep -cv '^kaola-workflow/'` = **0** — this
bundle's implementation (mine and the sibling agents') is genuinely uncommitted, so the rung is
right. `archive_authority_missing` is gone. This is the criterion-5 shape in one envelope: one
actionable token in `reasons`, one script-owned pending step as a state token in `checks`.
(The premise report saw `implementation_commit: not_applicable` here because the tree was clean at
that time; that difference is the tree changing, not this fix.)

### `--check` still read-only

Tight-window proof (both `--check` invocations back to back, snapshot immediately before and after):
an **8286-entry** `stat -f '%N %z %m'` listing of both project folders plus `git rev-parse HEAD` in
both roots — `diff` exit **0**, byte-identical.

A wider-window snapshot taken earlier differed by exactly two entries, both attributable to
**concurrent sibling agents** (`impl-903.md` appearing in `.cache/`, and an edit to
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`) — neither is a path
`--check` writes; the tight-window run removes that confound. Every fixture leg independently prints
`wt project folder exists AFTER check: <unchanged>`.

The `computeCodeTreeHash` → `snapshotWorktree` caveat the premise report named still applies (blobs
land in `.git/objects` under an out-of-repo `GIT_INDEX_FILE`); nothing about that changed here.

## Fixture legs

Builder: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/impl902/fixture.js`
— the premise report's builder (modelled on `mk837`), pointed at the **worktree** copy of `claim.js`,
with `LEG=A|B|C|D|E`. Real `git worktree add`, self-host `package.json`, implementation commit on the
branch, main-resident ledger + `.cache/chain-receipt.json` bound to the worktree HEAD,
`KAOLA_WORKFLOW_OFFLINE=1`. Every leg runs `--check` and then the **real** transaction from the same
cwd. Logs: `after-legA.log` … `after-legE.log` in that directory.

| leg | topology | `--check` | execute | agree? |
|---|---|---|---|---|
| **A** | #902: main-resident folder, worktree does NOT carry it, no archive | exit **0**, `workflow_state: pending_mirror`, `validation: chains_green`, `changed_paths: ["impl.txt"]`, `reasons: []`, `authority.source: pending_mirror` | exit **0**, `archived: true`, `validation.classification: chains_green`, `closure_invariants.ok: true`, `finalize_transaction.mirror: mirrored` | **yes** |
| **B** | CONTROL — worktree folder seeded (the shape every existing test builds) | exit **0**, `workflow_state: **ok**`, `authority.source: live`, `reasons: []` | exit **0**, `archived: true` | **yes**, and identical to pre-change behaviour |
| **C** | NEGATIVE, unrepairable — no live folder in **either** root, no archive | exit **1**, `mirror: source_absent`, `workflow_state: archive_authority_missing`, `reasons: ["archive_authority_missing"]`, `authority.source: none` | exit **1**, `finalize_gate_unverified`, `inner_reason: archive_authority_missing` | **yes — fails closed** |
| **D** | NEGATIVE, ambiguous — two matching archives in main, no live folder | exit **1**, `mirror: skipped_post_archive`, `workflow_state: archive_authority_ambiguous`, `authority.source: none` | exit **1**, `inner_reason: archive_authority_ambiguous` | **yes — fails closed** |
| **E** | main source present but **without** `workflow-state.md` — the mirror constructs a dest whose authority is still invalid | exit **1**, `workflow_state: **state_missing**`, `reasons: ["state_missing"]`, `authority.source: pending_mirror` | exit **1**, `inner_reason: **state_missing**` | **yes** |

Leg C is the mandatory fail-closed negative: `archive_authority_missing` is **reserved** for a
condition execution cannot repair, and it still fires there, on both surfaces, with the same token.

Leg E is worth noting as a second correctness gain: **before** the change `--check` said
`archive_authority_missing` while execute said `state_missing` — the check and the transaction named
different tokens for the same tree. The prediction now produces execute's exact token.

## Arming mutation proofs

Both via a **scratch mirror** of the whole `scripts/` tree (`…/impl902/mirror`, `…/impl902/mirror2`),
never by editing and reverting the live file — reverting would destroy sibling agents' work.

**M1 — blanket suppression** (`reasons.push` skipped for `archive_authority_missing`, i.e. the
regression the brief warns about):

| leg | with M1 | correct behaviour |
|---|---|---|
| C | exit **0**, `reasons: []`, `workflow_state: archive_authority_missing` | exit 1, `reasons: ["archive_authority_missing"]` |
| A | exit 0 (unchanged) | exit 0 |

So **leg C detects a blanket suppression and leg A does not** — which is exactly why the negative leg
is mandatory: my fix and a blanket suppression are indistinguishable on leg A alone.

**M2 — the fix disabled** (`const destAbsent = false`):

| leg | with M2 | with the fix |
|---|---|---|
| A | exit **1**, `archive_authority_missing`, `validation: not_checked` | exit 0, `pending_mirror`, `chains_green` |
| E | exit **1**, `archive_authority_missing`, `validation: not_checked` | exit 1, `state_missing`, `chains_green` |
| C | exit 1, `archive_authority_missing` (unchanged) | unchanged |

M2 reproduces the original defect exactly, so the new `destAbsent` bit is load-bearing for A and E
and is inert for C — the guard is armed, and the fix is not a suppression.

## `checks.validation` — recovered

**Yes.** The second defect closes as a consequence of the first. On the #902 topology
`checks.validation` went `not_checked` → a real measurement:

- live, worktree cwd: `not_checked` → `chains_unverified`, matching the main-root run exactly;
- fixture leg A: `not_checked` → `chains_green`, matching the transaction's
  `validation.classification: chains_green` over the identical tree;
- `checks.changed_paths` recovered with it: `[]` → `["impl.txt"]`, matching execute's `changed_paths`.

Mechanism: the validation probe is gated on `authority.authorityDir` (`:3686`); the predicted
authority carries the very `.cache/` the mirror is about to copy, so the measurement is available
from the same content execution will read. No new plumbing was needed.

## Suites — real exit codes (bare `echo $?`, never through a pipe)

Run from the worktree, **serially** (this suite set is spawn-bound; parallel runs give false reds).

| suite | before | after |
|---|---|---|
| `node scripts/test-claim-hardening.js` | **0** | **0** |
| `node scripts/test-finalize-door.js` | **0** | **0** |
| `node scripts/test-bundle-finalize.js` | **0** | **0** |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, not the 1/12 shard) | **0** — 184/184 scenarios | **0** — 184/184 scenarios |
| `node scripts/validate-script-sync.js` | **0** | **0** |

`validate-script-sync.js` exits **0**, not 1: the sibling `closure-audit.js` drift the brief warned
about had already converged by the time I ran the baseline (both before and after report
"OK: 15 common scripts, 27 byte-identical groups, … 6 forge export-superset families in sync" +
"committed kernel parity: 4 Oracle Kernel copies identical at HEAD"). My pair is byte-identical
(`cmp` exit 0) and no new canonical export was added.

Logs: `…/impl902/before-*.log`, `…/impl902/after-*.log`, summaries in `before-summary.txt` /
`after-summary.txt`.

## What I deliberately did **not** change, and why

1. **The gitlab/gitea ports.** Out of scope per the brief; they carry the same defect
   (`kaola-gitlab-workflow-claim.js:3181`, `kaola-gitea-workflow-claim.js:3178` per the premise
   report) and a later agent ports to them. **They are still defective.**
2. **No `operator_hint` on the `--check` envelope.** The premise report flagged its absence, but the
   brief's item 5 says to prefer the existing "state in `checks`, never a token in `reasons`"
   mechanism over new vocabulary, and additive derivation says add only what the observed failure
   demands. The observed failure was a false obligation, and it is gone. A reader that wants prose
   for a real refusal still gets `finalizeAuthorityHint` from the transaction. Recorded, not built.
3. **No new severity / `owner` / `actionable` field.** Same reason; `reasons` vs `checks` already
   carries the distinction, and `authority.source` names the pending step explicitly.
4. **`checks.mirror`'s token vocabulary.** `destAbsent` is internal. Adding a `ready_create` token
   would have changed an emitted vocabulary that `test-claim-hardening.js:1429` and prose depend on,
   for no gain the prediction does not already deliver.
5. **The transaction's ladder and emit.** The transaction already gets this right by ordering; the
   `authority` block is `--check`-only. Adding it to the transaction emit was not demanded.
6. **The live probe was not widened to search the main root** — explicitly, per the brief. It would
   make `--check` name main as the authority while execution names the worktree.
7. **No refusal added anywhere.** This change only removes a false stop.

## Where tests are needed (for `tdd-guide`)

Nothing here is covered today: per the premise report `archive_authority_missing` has **no test
anywhere**, and all three `--check` fixtures (`mk837:3180`, `mk816`, `mk941:3955`) seed the project
folder into **both** roots, so `livePresent` is always true and this branch is unreachable from them.
The gaps a suite should close, in priority order:

1. **The #902 topology (leg A)** — a `mk837`-shaped fixture with the worktree project folder
   **deliberately unseeded**: `--check` from the worktree must exit 0 with
   `checks.workflow_state === 'pending_mirror'`, `reasons` empty, and `archive_authority_missing`
   absent. This is the one axis no existing fixture varies.
2. **The fail-closed negative (leg C)** — no live folder in either root, no archive: `--check` must
   still exit 1 with `reasons` containing `archive_authority_missing`. **Without this arm, arm 1
   passes identically against a blanket suppression** — proven above by mutant M1.
3. **check-vs-execute agreement on a topology where they used to differ** — legs A and E. The
   existing T2a/T2b arms (`test-claim-hardening.js:1414-1495`) already assert agreement, but only on
   a destination that exists, i.e. only where it already held.
4. **The ambiguous arm (leg D)** — two matching archives, no live folder: `archive_authority_ambiguous`
   must survive the mirror prediction untouched.
5. **`checks.validation` on the #902 topology** — must carry a real classification, and the same one
   the transaction reports over the identical tree.
6. **The `authority` block** — `linked_root` non-null only on a linked worktree, `source` cycling
   through `live` / `archive` / `pending_mirror` / `none`, and `dest_dir !== source_dir` exactly on
   `pending_mirror`.
7. **The cwd axis** — `runFinalize816`/`runFinalize837` hard-code `cwd: fx.wtRoot` (`:1352`, `:3274`).
   A fixture that runs `--check` from **both** cwds and asserts they agree would have caught this
   defect directly, and is the arm with the widest reach.

## Documentation follow-ups (I did not touch these — `docs/`, templates and CHANGELOG are off my brief)

- `docs/api.md:219-222` documents the envelope as `{ project, ok, checks, reasons }` and lists the
  `checks` keys. It now needs `authority` and the `pending_mirror` token. I checked: no test pins this
  list — `validate-kaola-workflow-contracts.js:191` / `validate-workflow-contracts.js:374` assert
  *concepts* about the closure contract, not the check-envelope keys — so nothing is red, the doc is
  merely stale in detail. (Note `docs/api.md` is test-consumed, so editing it re-stales a chain
  receipt; sequence it accordingly.)
- `templates/routing/finalize.skeleton.md:349` says of `--check`: *"clear everything it lists, then
  run the transaction once."* With `pending_mirror` (as already with `sync_required`) `checks` can list
  a state the operator must **not** try to clear. The precise rule is "clear everything in `reasons`";
  the skeleton is the authoring surface, so this is a skeleton edit + regenerate, never a rendered one.
- `CHANGELOG.md` `[Unreleased]` needs the user-visible entry (new `pending_mirror` token, new
  `authority` block, `--check` no longer exits 1 on the ordinary linked-worktree topology).

## Anything I could not verify

- **The gitlab / gitea / plugin-gitlab / plugin-gitea editions.** Not measured — out of scope, and
  the port agent will need this record. The github plugin copy IS verified (byte-identical pair).
- **A symlinked `workflow-state.md` in the main source.** `mergeCopyDir` skips symlinks
  (`:3081`), so execution would land on `state_missing` while the prediction resolves the symlink and
  could report `state_invalid_type`. Both fail closed and both exit 1, but the *token* could differ in
  that one shape. I did not build it; the pre-existing behaviour on that shape was
  `archive_authority_missing`, which agreed with neither.
- **Non-linked-worktree reachability.** Unchanged from the premise report: both paths short-circuit
  to `not_needed` when `mainRoot === realpath(root)`, and the prediction additionally requires
  `mirror.mainRoot`, so an in-place run cannot enter it. Not separately measured.
- **Blast radius beyond `--check`** — which callers treat a nonzero `--check` exit as a stop. I
  enumerated the consumers (`README.md`, `CHANGELOG.md`, `package.json`,
  `templates/routing/finalize.skeleton.md`) and found no *programmatic* consumer that parses the
  envelope, but I did not audit every rendered surface's prose.
