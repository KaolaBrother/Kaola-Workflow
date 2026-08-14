# Implementer record — issue #978: the sink stops silently destroying three shapes of uncommitted work

Implementer role. Production files only; no test file touched. Ground truth read first:
`premise-978.md` and `tests-978.md` in this directory. All experiments ran in a scratch mirror
(`…/scratchpad/impl978-mirror`, a clone at `51db5d2d`), never against the real checkout.

## Mechanism chosen, per shape

**Shapes j + k — two record shapes are kept as dirt in `worktreeDirtRecords`, before the
classifier is consulted.** One line per copy:

```js
if (rel && !rel.includes('\\') && !rel.endsWith('/') && isParkedLanePath(rel, [])) continue;
```

- **(j) backslash name:** a decoded porcelain rel containing `\` is never exempted. git emits `/`
  as the only separator in porcelain records (premise-978 measured the C-quote round-trip under
  both `core.quotePath` settings), so a backslash in a decoded rel is always a literal filename
  character — `kaola-workflow\proj\x.md` is ONE root-level file, and only the classifier's `\`→`/`
  normalisation ever read a lane there. Kept as dirt → the existing `assertWorktreeClean` refusal
  fires: non-zero exit, worktree intact, name in the output. Refusal is the mechanism the repo
  already sanctions for destruction protection ("an operation that would destroy something still
  fails loudly") — zero new machinery.
- **(k) embedded repository:** a decoded rel ending `/` is never exempted. Under `-uall` git
  reports untracked files one record per file EXCEPT an embedded repository, which it will not
  descend into and reports as ONE collapsed `?? kaola-workflow/<seg>/` record (premise-978 control:
  a plain foreign-lane dir reports per-file). So a trailing-slash record stands for a population
  the per-file exemption never saw — kept as dirt → same refusal.
- Both fixes sit in the guard both entry points share (`assertWorktreeClean` → `worktreeDirtRecords`),
  so the tests record's flagged gap — "a --sink-only repair would leave the legacy route destroying
  j/k" — does not arise.

**Shape l — the legacy route reuses the --sink route's existing rescue, verbatim pattern.**
No new mechanism: legacy Step 3 now stages `<wt>/kaola-workflow/<project>/` with `sinkCopyDir`
into a `mkdtemp` dir immediately before `removeWorktree` (mirroring sink-merge's `--sink` merge
step), and after the FF merge succeeds — immediately before `postMergeCleanup` — lands it with
`sinkLandStagedUnion` (per-file union: checkout-resolved files win, worktree-only files land),
then removes the stage dir. Best-effort try/catch-swallowed exactly like the --sink stage, so a
stage failure never stops a sink — the (i-control)/(l)-completion constraint holds.

## Files changed, and parity

Exactly four files; insertions plus the one guard line per copy (git stat: 166 insertions, 4 deletions):

- `scripts/kaola-workflow-sink-merge.js` (root)
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (codex) — kept in parity by
  copying the edited root file wholesale; verified byte-identical post-edit
  (`shasum -a 256`: both `430650f8e4c3…`, matching the pre-edit byte-identity of the pair)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — hand-port, same
  three edits in the port's idiom (`adaptiveSchema.` prefix, top-level `worktreePathFor` import,
  function-scoped legacy route)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — same as gitlab

**The kernel is untouched.** `kaola-workflow-adaptive-schema.js` still hashes `0ac70c1d3fb8…` in
all four trees — the same hash premise-978 recorded — so no `--materialize-kernel`, and
`isParkedLanePath`/`parsePorcelainPaths` behave exactly as before for every other caller. The diff
is still edition-touching (three plugin trees), so finalize owes the four-chain run regardless.

## Verification (all runs in the worktree unless marked mirror)

| run | command | result |
|---|---|---|
| before | `node scripts/test-sink-merge.js` | exit 1 — **20 failed, 994 passed**; all 20 = #978 (j)(k)×2pins + (l)×1pin, ×4 editions (`impl978-baseline.log`) |
| after | `node scripts/test-sink-merge.js` | exit 0 — **test suite passed: 1014 assertions** (`impl978-after.log`); (e)(f)(g)(h)(i)(i-control) all green, probe flags untouched (no `--ignored`) |
| mutation A (mirror) | fix minus the j/k guard (guard string stripped from all four copies; legacy rescue kept) | exit 1 — **16 failed, 998 passed**: exactly (j)+(k), both pins, all four editions; (l) green (`impl978-mutA.log`) |
| mutation B (mirror) | pristine 51db5d2d files + the j/k guard only (no legacy stage/land) | exit 1 — **4 failed, 1010 passed**: exactly (l) on all four editions (`impl978-mutB.log`) |

The two mutations partition the fix: each half is independently load-bearing and each pin set goes
red again when its mechanism alone is removed. Logs and the mirror live under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad/`
(`impl978-{baseline,after,mutA,mutB}.log`, `impl978-mirror/`).

## Chosen NOT to do (each deliberate)

1. **No kernel change.** Every `isParkedLanePath` call site (grepped: claim.js `assertCleanWorktree`
   ×4 editions, sink-merge main-root preflight ×4, `worktreeDirtRecords` ×4, walkthrough tests)
   feeds porcelain-derived paths, so the `\`→`/` normalisation has no caller for which backslash is
   a separator — a kernel fix would have been defensible. But it mutates the byte-identical drift
   anchor and changes every caller's behaviour at once, wider than #978's filed scope. Consequence
   kept: **the main-root preflight seam still exempts a backslash name in the MAIN root** (premise
   record lists it "not measured", out of filed scope). That residue is a candidate follow-up, not
   part of this fix.
2. **No probe change.** `-uall` stands; `--ignored` not added (arm (g) is the sole tripwire and it
   is green).
3. **No refusal on the legacy route for shape l** — refusing over lane content refuses every legacy
   sink ((i-control)); survival via the existing stage/land is the only outcome holding both pins.
4. **`sinkLandStagedUnion`'s basename skip of `sink-receipt.json`/`sink-fallback.json` is inherited
   as-is** on the legacy landing — #520/#707 define those as cycle-local scratch that must not land;
   the (l) fixture's journal content survives via its other file, which is the pinned result.
5. **Red-stop corner inherited from --sink, not repaired:** a legacy (or --sink) run that removes
   the worktree and then stops before the merge completes (chains_red / non-FF) leaves the staged
   copy in the OS tmpdir un-landed and un-deleted — better than the destruction it replaces, short
   of a landing. Same asymmetry the --sink route has carried since #619(4); not widened, not fixed.
6. **Docs not updated** (CHANGELOG/README): left to the bundle's documentation pass; the lead should
   route it.

## Addendum — the test author's residual (legacy-route coverage of j/k), answered by measurement

The residual: (j)/(k) drive `--sink` only, so the pins cannot distinguish a guard-level repair
(covers both routes) from a transaction-body repair (leaves the legacy route destroying both
shapes). The shipped repair is guard-level — `worktreeDirtRecords`, inside the
`assertWorktreeClean` both entry points call before their removal (legacy Step 2 calls it
immediately before Step 3's `removeWorktree`; the `--sink` transaction calls it in its
preconditions). Beyond the code-path argument, measured (`scratchpad/smoke978/`): a fixture
worktree carrying all three populations probed with the guard's own flag form emits

```
?? kaola-workflow/crashed9/            ← embedded repo: TRAILING SLASH confirmed on the real string
?? kaola-workflow/issue-9/.cache/n1.md
?? "kaola-workflow\\proj9\\notes.md"
```

and the SHIPPED `worktreeDirtRecords` — extracted verbatim from the edited root file, run with the
real schema helpers — returns exactly the two #978 records as dirt and exempts the ordinary lane
file. So `rel.endsWith('/')` was keyed against the real porcelain trailing slash, not an assumed
one, and the same classification governs whichever entry point reaches the guard. Shape l alone
uses the rescue route, and it is the shape whose arm drives the legacy entry point directly.

## R1 — the stage's own failure mode (arms (m)/(n)): refuse-on-throw at both stage sites

The reviewer-demonstrated defect: a dangling or self-referential symlink inside
`kaola-workflow/<project>/` makes the stage copy THROW; the `try/catch` swallowed it and the sink
destroyed the journal at exit 0. Two sites, both pinned: the legacy stage this run added (arm m)
and the `--sink` merge step's pre-existing identical swallow (arm n).

**Mechanism: refuse-on-throw at each site, scoped to "the journal directory exists AND the stage
attempt threw".** A missing worktree or absent journal dir stages nothing and proceeds exactly as
before — so ordinary runs, (l), (i-control), (f)–(i) are untouched.

- **Legacy (m):** the stage catch sets `wtStageErr` aside; after the resolution block — checked
  OUTSIDE the swallowing catch, before `removeWorktree` — a set error throws in the KEEP style of
  the Step 2 guards: `sink-merge refused: could not stage … before worktree removal`. Non-zero
  exit, worktree and journal intact.
- **--sink (n):** same set-aside; the removal call becomes `if (!wtStageErr) removeWt(…)`, and
  after the catch a set error emits a typed envelope (`result:'refuse'`, `reason:'stage_failed'`,
  `step:'merge'`, exit 1) and returns — the merge step is left NOT done (the transaction's own
  refusal pattern, as the push_upstream refusal does), worktree intact. `stage_failed` is not on
  (n)'s unrelated-reason list.

Why refuse-on-throw and not a link-aware copy (considered, rejected): (1) the contract is "cannot
preserve must surface", for ANY cause — a link-aware `sinkCopyDir` fixes only the fixtured trigger
and leaves EACCES/mkdtemp faults destroying silently; (2) a faithful link copy would also force
changing `sinkLandStagedUnion` (its `fs.existsSync(d)` destination probe misreads a dangling-link
destination), touching #707-pinned landing semantics; (3) two site-level repairs partition the two
routes exactly as the pins expect. Trade-off accepted: a lane dir carrying a broken link now
refuses the sink until the operator removes it — loud and safe, one manual step.

Files: the same four sink copies as before (root + codex byte-identical, verified: both
`55a724ce6fbf…`; gitlab/gitea hand-ports carrying the same semantic change). Kernel untouched
(#976's schema change left alone).

R1 verification:

| run | result |
|---|---|
| before (worktree) | exit 1 — **8 failed, 1050 passed**: exactly (m)+(n) ×4 editions (`impl978-r2-baseline.log`) |
| after (worktree) | exit 0 — **1058 assertions** (`impl978-r2-after.log`) |
| mutation C (mirror2, legacy throw disabled, --sink repair kept) | exit 1 — **exactly the 4 (m) pins**, (n) green (`impl978-mutC.log`) |
| mutation D (mirror2, --sink repair disabled + removal unconditional, legacy kept) | exit 1 — **exactly the 4 (n) pins**, (m) green (`impl978-mutD.log`) |

The mirror for C/D (`scratchpad/impl978-mirror2/`) is a full copy of the CURRENT worktree tree, so
the mutants ran against the post-#976 kernel and the current test file. The clean mutation
partition means the two routes are covered by two separately load-bearing repairs — the case "one
repair reds both pins" did not occur.

## Output contract summary

- **task**: implement #978 — the sink must not silently destroy the three measured shapes (j)(k)(l)
  while keeping arms (e)–(i) green on all four editions.
- **verification tier**: `tests-green` (authored suite passes at full scope), plus mirror mutation
  proofs both directions.
- **files changed**: the four sink-merge copies listed above; nothing else.
- **verification commands**: `node scripts/test-sink-merge.js` — before exit 1 (20/994), after
  exit 0 (1014); mirror mutation runs exit 1 with exactly the expected pin sets (16 / 4).
