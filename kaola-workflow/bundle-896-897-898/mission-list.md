# Close the post-#895 residue: #896 (sink run_not_finalized gap), #897 (three surviving issueIsClosed regressions), #898 (release-prep carry-over coverage exposure)

Branch `workflow/bundle-896-897-898`, worktree `.kw/worktrees/bundle-896-897-898`. All three were
filed by the #888–#895 run as recorded-not-fixed residue; none has a `.roadmap/issue-*.md` source.
Two of the three explicitly permit "establish it needs nothing" as a legitimate close — verify the
premise before building.

---

item: #896 — decide the `run_not_finalized` gap on the `--sink` path. `assertNoLiveWorkflowFolder`
(`scripts/kaola-workflow-claim.js:274-300`) is the measurement; it is wired into the legacy path
only, at `:2488`. `sinkPreflight` (`scripts/kaola-workflow-sink-merge.js:1615`) has no equivalent.
The issue names two acceptable outcomes: port the measurement, or establish the shape is unreachable
on `--sink`. Reachability is the thing to measure first — do not port before proving it reachable.
Explicitly NOT proposed and already rejected under #893: adding `mission-list.md` to bucket 2's
`projStateFiles`, because bucket 2 tests existence and acts by `unlinkSync`, which would license
deleting main's newer run record.
status: done
dispatched: investigator subagent "m896-reach", read-only over the main checkout, measuring whether an
unfinalized run can actually enter `--sink`. Output lands at
`kaola-workflow/bundle-896-897-898/.cache/m896-reach.md`.
result: CLOSE #896 UNDER ITS OWN OUTCOME (b) — reachable, but not a gap. Report at
`.cache/m896-reach.md`, measured at 3e2019f6.
#896's two code claims name the WRONG FILE, verified by me directly: `assertNoLiveWorkflowFolder` is
`scripts/kaola-workflow-sink-merge.js:319-346` (not `claim.js:274-300`) and its only call site is
`sink-merge.js:2572` (not `claim.js:2488`); no `claim.js` in any of the four editions contains the
symbol. `sinkPreflight` is at `:1324`, not `:1615`. TRUE: it is legacy-path-only — `main():2474` routes
`--sink` to `runSinkTransaction` and returns at `:2517`, while the legacy precondition block starts at
`:2571`; of five legacy preconditions only `assertWorktreeClean` runs on `--sink`.
The shape IS reachable and the sink handles it correctly: on a byte-identical unfinalized fixture the
legacy leg stops with `run_not_finalized`/exit 1, and the `--sink` leg exits 0 with `status: sinked`,
main's `workflow-state.md` ABSENT and `kaola-workflow/archive/<p>/` a tree. `SINK_STEPS` carries its
own `finalize` step calling `archiveProjectDir` — **the sink IS the finalizer**, and a live folder on
the branch is the sole-archiver posture every `test-sink-merge` scenario (c)(d)(e)(f)(h) uses. Porting
the measurement would stop the routed finishing flow, and `sinkPreflight`'s only handler (`:1685`)
hardcodes `result:'refuse'`, so a correct port is ~20 lines across 4 files plus a new report arm — and
it would refuse, which "Nothing refuses" forbids. Do not port.
NEW DEFECT, separate door, not #896 — see the next item.

item: #897 — add the three missing assertions to `testActiveFoldersExcludesClosedIssue895` in
`scripts/simulate-workflow-walkthrough.js`: (1) an unreachable probe read as "closed" still excludes,
(2) an empty answer read as "closed" still excludes, (3) removal of the `KAOLA_WORKFLOW_OFFLINE`
short-circuit goes unnoticed. `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` is frozen
at module load in `scripts/kaola-workflow-active-folders.js`, which is the whole reason the scenario
pays for a subprocess driver — and it then never asserts on that path. Behaviour is correct and
unchanged; this is coverage only. Test custody: the test author writes it, and each new assertion is
mutation-proven armed, because a scenario that could not fail is exactly what caused #895.
status: done
dispatched: tdd-guide subagent "m897-tests", working IN the worktree
`.kw/worktrees/bundle-896-897-898`, writing `scripts/simulate-workflow-walkthrough.js` there and a
mutation-proof record at `kaola-workflow/bundle-896-897-898/.cache/m897-tests.md` in the MAIN
checkout. It owns that walkthrough file for the duration — nothing else writes it until it closes.
result: DELIVERED, all three mutation-proven armed. Report at `.cache/m897-tests.md`; baseline
3e2019f6. Verified present by me in the worktree: `+78/-3` in
`scripts/simulate-workflow-walkthrough.js`, test-only, production `kaola-workflow-active-folders.js`
untouched, not committed. Three sub-cases on `testActiveFoldersExcludesClosedIssue895` plus
`callReadActiveFolders(root, binDir, offlineFlag)` at `:1404` making the driver's OFFLINE flag
settable — C `:1510` failed probe, D `:1530` empty answer (roles INVERTED against C, preserving the
parity defence), E `:1557` one fixture and one shim run twice, online excluding issue 10 and offline
keeping both. Each mutation was run against BOTH the pre-change and the new scenario, on a scratch
mirror, exit codes from `$?`: `catch(_) false→true` old 0 / new 1; `if(!raw) false→true` old 0 / new
1; OFFLINE short-circuit deleted old 0 / new 1. Attribution proven for the third —
`testProbeIssueStateOffline` stays exit 0 under that mutation, so only the new sub-case catches it.
Full walkthrough in the worktree: exit 0, 184/184, run twice against the delivered bytes.
HONEST NEGATIVE, recorded not papered over: removing the OFFLINE guard from `issueIsClosed` ALONE, or
from `prefetchIssueStates` ALONE, is behaviourally INERT — `ghExec`'s own guard masks each and the
output is identical to correct behaviour, so no `readActiveFolders` assertion can distinguish them.
That is production redundancy, not a coverage hole; do not chase it with a test.

item: #898 — decide the release-prep carry-over coverage exposure. Measured in a scratch mirror: a
narrow carry-over re-added to `evaluateReleaseReceipt` (receipt commit an ancestor, intervening diff
confined to `RELEASE_FILES`) went live on both entry points and left every authored suite EXIT=0. A
broad relaxation is caught, but by exactly one test — the `#651 (4)` OLDER-SHA scenario at
`scripts/simulate-workflow-walkthrough.js:1109-1133` — which the fast gate samples at a rotating 1/12
shard. The issue proposes no mechanism and names the cheapest honest fence if one is ever wanted: an
assertion that the pass envelope carries no binding route other than exact `headSha` equality. Under
derive-additively, "record it on the #878 watch list and close" is a legitimate outcome; the tension
is that the exposure was *observed*, not derived, which is the condition #878 says arms a row. Decide
and say which, with the reasoning.
status: done
dispatched: investigator subagent "m898-fence", read-only over the main checkout, re-measuring the
claim and costing both outcomes. Output lands at
`kaola-workflow/bundle-896-897-898/.cache/m898-fence.md`. The decision itself stays with me.
result: MEASURED — two of #898's four claims are FALSE. Report (423 lines) at `.cache/m898-fence.md`,
measured at 3e2019f6 on a mirror with a private TMPDIR; real repo untouched (kernel hash
f426052054624557 before and after).
TRUE: the carry-over deletion (reconstructed verbatim from `git show 6fdbf714`, proved live —
release-check exit 1→0), and "a narrow re-add leaves everything EXIT=0" (reproduced across 11 suites
including a full-scope walkthrough).
FALSE #1: "broad is caught by exactly ONE test" — `#651 (9b)` at `simulate-workflow-walkthrough.js:1190-1192`
also catches it, proved by neutering (4) in the mirror. The issue's own line cite is off too: `#651 (4)`
is really `:1117-1129`, assertion at `:1125-1128`.
FALSE #2, and this is the one that matters: "~1-in-12 odds the defender ran" — `test-kernel-conformance.js`
is fast-gate step 16/40 and spawns the walkthrough **UNSHARDED** (`:463-470`, no `--shard`), asserting
exit 0. Measured EXIT=1 under broad. So a broad relaxation reds the fast gate with probability **1.0**,
not 1/12. (The directly-sampled run does miss it — the scenario is ordinal 146 → shard 3, while
`auto/12` resolves to shard 12 at HEAD — so the conformance spawn is the actual covering vehicle.)
BINDING ROUTES: 12 branches in `evaluateReleaseReceipt` (`adaptive-schema.js:1450-1550`), exactly ONE
`ok:true` at `:1548`. Exact `headSha` equality (`:1491-1496`) is genuinely the only route.
THE ISSUE'S PROPOSED FENCE CANNOT BE BUILT AS WORDED: `run-chains.js:831-833` rebuilds the pass
envelope key-by-key, so its keys are `["result","mode","candidate","chains"]` under pristine AND narrow
AND broad alike — an envelope-shape assertion is structurally unarmable, and a kernel-level
`binding`-key check would only catch a re-adder who also adds the key.
A BEHAVIOURAL assertion does work: 16 lines (11 code, 5 comment, +3 assertions) in
`test-finalize-door.js` T5 before T5i at `:715`, reusing the existing fixture — no new file, no
propagation, fast-gate step 18. Mutation-proven armed: pristine 0 / narrow 1 / broad 1 / pristine-again 0.
OBSERVED-OR-DERIVED: the coverage gap is OBSERVED and reproduces; the harm is DERIVED. The class is
not cleanly #878-shaped — #878's rows are mechanisms never built for classes with no history here,
whereas #881 DID ship this route and it read as live for weeks.
Noise, not a repo fact: a sibling agent's cleanup deleted this agent's scratch mirror mid-run and
produced 5 spurious reds; everything above is from clean serial re-runs.
MY DECISION: BUILD THE 16-LINE ASSERTION — see the next item for the reasoning.

item: NEW, found during Step 2 freshness — verify and route a suspected #892 propagation miss. #892
deleted `docs/mission-list.md` and repointed the prose at `docs/decisions/0017-the-mission-list.md`,
claiming the dead pointer "reached twelve installed `next` surfaces across four runtimes". But
`.opencode/command/workflow-next.md:136` and `.kimi/skills/workflow-next/SKILL.md:137` in this
repository still read "is `docs/mission-list.md`; read it there rather than…". Meanwhile
`generate-routing-surfaces.js --check` reports all 18 surfaces byte-match: the registry is 3 topics x
6 (command+skill x 3 forges) — the Claude plugin trees only — and per its own comment the opencode and
kimi editions "render their own tree FROM these rows" at install time. So establish which is true:
the checked-in edition trees are stale build products that install regenerates (cosmetic), or they
are what actually ships to those runtimes (a live dead pointer #892 missed). `grep` here is ugrep and
SKIPS dot-directories, so name `.opencode`/`.kimi` explicitly in any sweep. Route the outcome; do not
fold a fix into this bundle without saying so.
status: done
dispatched: investigator subagent "m-edition-pointer", read-only over the main checkout, establishing
the provenance of the checked-in `.opencode/` and `.kimi/` trees. Output lands at
`kaola-workflow/bundle-896-897-898/.cache/m-edition-pointer.md`.
result: COSMETIC — my premise was wrong and #892 is complete. Report at `.cache/m-edition-pointer.md`.
All six edition trees are **gitignored with zero tracked files** (`git ls-files .opencode .kimi` = 0,
verified by me directly); `npm pack --dry-run` ships 273 files and none under them; and
`install-opencode.sh:141-142` / `install-kimi.sh:128-129` run `sync-<ed>-edition.js --check || --write`
BEFORE the copy under `set -euo pipefail`, sourcing content from the tracked `commands/*.md`, which
carry no dead pointer. So a cloner gets no tree, npm ships none, and an installer regenerates first.
The staleness was real — both `--check` runs exited 1, naming `workflow-next` AND `workflow-init` in
each tree, 6 untracked files — but blast radius is **one maintainer-facing file on this box**
(`.opencode/` doubles as opencode's own project layout here; `.kimi/` had zero live readers).
#892's "twelve installed next surfaces" claim is accurate, counted post-install.
RESIDUAL, not fixed here: `sync-*-edition.js --check` is armed and does catch this, but **no npm
script invokes it**, and both edition suites run `--write` in their preamble before asserting — they
self-heal before observing, so they went green on the stale tree. That is this repo's recurring
"guard that cannot fail" shape. Separately, no check asserts that a consumer-facing `docs/…` path
resolves. Both are recorded here and routed to the user, not built.

item: USER-AUTHORIZED 2026-08-01 — delete the tracked `kaola-workflow/dp/` folder. It holds exactly
one tracked file, `.cache/run-progress.json`, a `node_ledger` written 2026-07-29 by the DAG executor
ADR 0017 deleted. No `workflow-state.md`, so it is not a resumable run, but it sits in the
active-folder inventory a successor reads first. Delete on the branch (in the worktree), not in
main's checkout — the merge carries the removal.
status: done
dispatched: self, in the worktree `.kw/worktrees/bundle-896-897-898` via `git rm`.
result: `git rm -r kaola-workflow/dp/` staged on the branch — one file removed,
`kaola-workflow/dp/.cache/run-progress.json`. Swept `scripts/ docs/ templates/ .claude .opencode
.kimi` (dot-dirs named explicitly, since ugrep skips them) for `kaola-workflow/dp` and for `dp` as a
quoted literal: zero references, so no fixture or doc depended on it. Removal carries to main on the
merge; main's own checkout still shows the folder until then, which is correct.

item: USER-AUTHORIZED 2026-08-01 — fold the edition dead-pointer fix into this bundle. Blocked on the
`m-edition-pointer` investigation returning: the fix's shape depends on whether the checked-in
`.opencode/`/`.kimi/` trees are install-time build products or shipped source, and on whether any
guard should have caught it. Apply the fix in the worktree once that lands. Fixing a rendered surface
by hand is forbidden where a skeleton owns it — if the registry owns those trees, the edit goes in
`templates/routing/` and regenerates; if nothing owns them, that absence is itself the finding.
status: done
dispatched: self — resolved by the `m-edition-pointer` result rather than by an edit.
result: NOTHING TO FOLD IN. The authorization was granted on my report of a shipping defect, and that
premise collapsed under measurement: the trees are gitignored build products regenerated at install,
so there is no tracked file to fix and no user reads the stale copy. Manufacturing an edit here would
be inventing work to match an authorization. The user was told the premise collapsed and asked
whether to spend this bundle's scope on the two residuals instead (the unarmed `sync-*-edition
--check`, and the absent consumer-facing `docs/…` path resolution check).

item: #898's outcome — build the 16-line behavioural assertion in `test-finalize-door.js` T5.
MY REASONING, since #898 explicitly permits "record and close" instead: the decisive fact is that
`evaluateReleaseReceipt` has exactly one `ok:true` route and exact `headSha` equality is it — and
CLAUDE.md already states that as a rule ("A release tag always requires the full, unwaived four-chain
receipt, bound to the tagged commit by exact `headSha` equality"). Pinning an invariant the project has
already WRITTEN DOWN is not deriving a mechanism from an unobserved failure; it is covering a stated
contract that currently has zero direct coverage. It also sits in front of an irreversible published
act, where axiom 1 (Correct first) outranks axiom 3 (spend little), and the price is 16 lines in an
existing fixture with no new file and no cross-edition propagation. Against it: the harm is derived,
five prose surfaces already say do not bring the route back, and the sink's archive commit makes it
unreachable in practice — real, but cheaper to insure than to re-litigate.
NOTE the investigation's correction: do NOT write the envelope-shape assertion #898 proposed. It is
structurally unarmable because `run-chains.js:831-833` rebuilds the pass envelope key-by-key.
status: done
dispatched: tdd-guide subagent "m898-door-test", worktree `.kw/worktrees/bundle-896-897-898`, owning
`scripts/test-finalize-door.js` ALONE. Record at `.cache/m898-door-test.md`.
result: DELIVERED as `T5j` (`scripts/test-finalize-door.js:720-735`, `+17/-0`). Report at
`.cache/m898-door-test.md`. Verified by me: `test-finalize-door.js` EXIT=0 and T5j is present at the
reported lines. THE NARROW LEG REDS — that is the whole point, since narrow is the case every authored
suite was blind to.
It asserts behaviourally, not structurally: a green / unwaived / four-chain / clean receipt stamped at a
DIRECT ANCESTOR, whose entire intervening diff is a version-only `package.json` bump plus a
`CHANGELOG.md` rewrite — both `RELEASE_FILES`, i.e. precisely the deleted carry-over's shape — must
still refuse `chains_stale`. Reuses T5's existing fixture; no new file, no production code.
FOUR LEGS on a private mirror with a private TMPDIR, serial, `--materialize-kernel` on each, with the 6
carry-over hunks reverse-applied from `6fdbf714` (the 3 unrelated #888 hunks excluded): pristine EXIT 0
(156 assertions) / NARROW EXIT 1 / BROAD EXIT 1 / pristine again EXIT 0 with the kernel byte-identical
to leg 1. The failure text is `got 0` and `{"result":"pass"}` — that is the GATE ITSELF flipping, which
proves the mutation went live rather than being a dead patch. Only T5j's 2 assertions fail; the other
154 hold.
ATTRIBUTION UNDER NARROW, the number that justifies the 16 lines: `test-finalize-door.js` reds ALONE.
Green under narrow were the full unsharded walkthrough (184/184), `test-kernel-conformance.js` (254),
`--only testReleaseCheckPreTagGate`, `test-release.js`, `test-run-chains.js`, `test-oracle-kernel.js`
and `validate-workflow-contracts.js`. Detection of the narrow route goes 0.0 → 1.0. The BROAD green is
unconfounded too: `test-finalize-door.js` is not one of kernel-conformance's three vehicles.
TWO DEVIATIONS, both accepted: T5j was placed AFTER T5i rather than before, and all four legs were
re-run on those final reordered bytes rather than the investigation's ordering; and #898's proposed
envelope-shape assertion was deliberately NOT written, being unarmable as measured.
Recorded for a successor: if a carry-over is ever deliberately re-introduced, T5j is DELETED with it,
never repaired — a test falls out with its mechanism.

item: NEW DEFECT found by `m896-reach` while measuring #896 — a failed archive reports success and
pushes live run state to `origin/main`. In `runSinkTransaction`'s finalize step, when
`archiveProjectDir` throws WITHOUT returning `archive_incomplete`, the catch at
`scripts/kaola-workflow-sink-merge.js:1964-1968` rethrows only `TypeError`/`ReferenceError` (the #555
export-drift class) and swallows everything else — so an `EACCES` leaves `receipt.archive_dest`
UNSET. The #700 guard at `:2121` reads `if (receipt.archive_dest && !archiveAtHead && …)`, scoped to a
SET dest, so it cannot fire on the swallowed case. All three structural claims verified by me
directly. Constructed three ways, including plain `chmod 555 kaola-workflow/archive` with no env var:
exit 0, `status: sinked`, live `workflow-state.md` AND `mission-list.md` pushed to `origin/main`, the
issue closed, main left dirty. This is the project's own stated floor being breached — "an operation
that would DESTROY something still fails loudly" — since a wholly failed archive currently reports
success. USER ROUTED 2026-08-01: fold the fix in ("All three").
Note for whoever implements: `kaola-workflow-sink-merge.js` exists in FOUR editions (`scripts/` plus
`plugins/kaola-workflow{,-gitlab,-gitea}/scripts/`), with the gitea/gitlab ports at DIFFERENT line
numbers (`assertNoLiveWorkflowFolder` is `:286` and `:287` there). A fix landing in one copy is
cross-edition drift, and an edition-touching diff owes all four chains at finalize.
Making a failed archive fail loudly is NOT a new refusal under "Nothing refuses" — that rule converts
verdicts about the WORK; this is the destroy-something floor the same section carves out explicitly.
status: done
dispatched: TEST CUSTODY, two stages. Stage 1 now: tdd-guide subagent "m899-archive-tests", writing
`scripts/test-sink-merge.js` in the worktree `.kw/worktrees/bundle-896-897-898` and proving the tests
RED on the unfixed baseline; record at `.cache/m899-archive-tests.md`. Stage 2 after it closes:
implementer, four sink-merge copies, forbidden from touching the test file.
STAGE 1 DONE — tests are RED on baseline 3e2019f6, verified twice with `$?` captured directly:
`node scripts/test-sink-merge.js` → exit 1, "8 failed, 274 passed" against an untouched baseline of
exit 0 / 257 passed. All 8 failures are the new `(x1)`; nothing pre-existing moved. Added ONLY
`scripts/test-sink-merge.js`, uncommitted. `(x1)` at `:2385` is THE PIN — `buildSoleArchiverFixture`
plus `chmod 555 kaola-workflow/archive`, mode restored in a `finally` with no fixture leak, six
clauses: envelope emitted / not `sinked` / non-zero exit / the envelope NAMES the archive failure
(routable token, shape-tolerant) / `origin/main` untouched with both live files absent from the remote
and no issue close / journal survives with finalize NOT done. `(x2)` at `:2493` and `(x3)` at `:2540`
are green fences. I KEPT both extras the author offered to drop: `(x1)` clause 6 pins resumability, and
`(x3)` pins that the #555 `TypeError`/`ReferenceError` rethrow stays armed — which is precisely what
the stage-2 fix is about to edit, so it is the fence that protects the fix from itself. `(x3)` also
carries an undoctored CONTROL run so it cannot pass vacuously.
Legitimate cases: (a) already covered by `#893 w1`, (c) by `#832 q` + `#893 w10`, both verified green
inside the red run; (b) had NO coverage and is what `(x2)` adds.
STAGE 2 DISPATCHED — see the `dispatched` note above; implementer "m899-archive-fix" owns the four
sink-merge copies and is forbidden from touching `scripts/test-sink-merge.js`.
result: FIXED across all four editions. Report at `.cache/m899-archive-fix.md`. Verified by me:
`test-sink-merge.js` EXIT=0, `validate-script-sync.js` EXIT=0, `test-spawn-classification.js` EXIT=0,
and the diff is `+216/-10` spread over all four sink-merge copies.
THE FIX AVOIDS THE TRAP: it keys on what `archiveProjectDir` SAID it did, never on the dest. A single
`archiveFailure` var is set from two places — the catch's non-`TypeError`/`ReferenceError` arm, which
now RECORDS instead of swallowing, and a positive confirmation after the return, where `archived ===
true` is the only "it happened" and `skipped === 'source-missing'` the only "none was needed", with
anything else a failure. That is exactly what separates the defect from legitimate cases (a) and (b):
all three are indistinguishable in the RECEIPT and fully distinguishable in the RETURN. The dest block
is additionally gated on `!archiveFailure` so `persistSinkClosureMetadata` cannot stamp closure
metadata into a failed archive. The stop emits `{result:'refuse', reason:'sink_incomplete',
step:'finalize', archive_refusal}` at exit 1, BEFORE `stepDone('finalize')`, so the run stays resumable.
REPRO CLOSED, measured on a purpose-built harness independent of the suite, pre-fix HEAD versus shipped
against the same fixture: BEFORE exit 0 / `sinked` / origin/main advanced / `workflow-state.md` and
`mission-list.md` on the remote / issue closed. AFTER exit 1 / `sink_incomplete` / `archive_exception` /
remote untouched / no gh calls / journal survives with finalize `pending`.
`KAOLA_WORKFLOW_FORCE_ARCHIVE_REFUSAL` ALSO CLOSED — the return-path door, not just the throw — and
measured the same way: BEFORE exit 0/sinked/pushed/closed, AFTER exit 1 with
`archive_refusal: "archive_forced_refusal"`. Nothing depended on it succeeding; its only two consumers
(`walkthrough:9746`, `:9779`) drive `claim.js`, never the sink, and `claim.js` was not touched.
Editions ported BY MEANING, not line offset: canonical, the github plugin byte mirror copied wholesale,
and gitlab + gitea which each had a one-line inline catch expanded to a block with their own require
paths and comment density.
It also ran the FULL-scope walkthrough unasked (184/184, EXIT=0) because the sink is driven ~155x
there — that discharges the full-scope run `m-docs-path` left owed, though it predates
`m898-door-test`'s edit and will be re-run at docking.
MY OWN ADVERSARIAL READ of the diff, because a green suite has certified an unimplemented fix in this
repo before. I enumerated `archiveProjectDir`'s ACTUAL returns in `kaola-workflow-claim.js` rather than
trusting the fix's premise, and every one of the six is classified correctly by the new rule:
`{skipped:'source-missing'}` (`:2402`) → no archive needed; `{archived:true,…}` (`:2565`, `:2576`) →
archived; `{archived:false, reason:'archive_forced_refusal'}` (`:2406`) and
`{archived:false, reason:'archive_exception', detail}` (`:2612`) → failure; and
`{skipped:undefined, archived:false, archive_incomplete:true, …}` (`:2496`) → failure, though it never
reaches the new check because an earlier arm emits and returns on `archive_incomplete` first.
The load-bearing discovery: `archiveProjectDir` has its OWN internal catch that RETURNS
`{archived:false, reason:'archive_exception'}` rather than throwing. So for the `chmod 555` repro the
failure arrives as a RETURN, and a fix written only at sink-merge's catch arm — the obvious reading of
the defect, and the one I very nearly briefed — would not have caught the original reproduction at all.
The return-path confirmation is what actually closes it.

item: USER ROUTED 2026-08-01 — arm the edition sync guard. `sync-opencode-edition.js --check` /
`sync-kimi-edition.js --check` detect edition-tree drift (both exited 1 on the real drift this run
found) but **no npm script invokes either**, and both edition suites run `--write` in their preamble
(`scripts/test-opencode-edition.js:45-56`) before asserting — they self-heal, then observe, so they
went green on a stale tree. Fix both halves: wire `--check` into the edition suites/npm surface, and
stop the suites repairing the thing they are measuring. Owns `package.json`.
status: done
dispatched: tdd-guide subagent "m-sync-guard", worktree `.kw/worktrees/bundle-896-897-898`, owning
`scripts/test-opencode-edition.js`, `scripts/test-kimi-edition.js` and `package.json`. Record at
`.cache/m-sync-guard.md`.
result: DELIVERED, mutation-proven armed in BOTH editions. Report at `.cache/m-sync-guard.md`.
The scratch-render split I suggested turned out to be unreachable from a test file — `REPO` in both
sync modules is `__dirname`-derived with no override (`sync-opencode-edition.js:74`), so redirecting a
render would need a production edit a test author may not make. Solved by ORDERING instead: `--check`
per forge runs BEFORE the existing `--write`, and a drifted tree EXITS the suite right there. That exit
is the load-bearing part — counting it as an ordinary failure would let control reach `--write`, repair
the tree, and leave the NEXT run green: a red that deletes its own cause.
RED proof (opencode; kimi identical): dirtying `.opencode/command/workflow-next.md` → exit 1,
`D0[github]: .opencode is present on disk and has DRIFTED`. The tree hash AFTER the failing run equals
the dirty hash, so there is no self-heal and a re-run stays red. Restore → exit 0.
THE DELTA IS ATTRIBUTED, not assumed: the HEAD: versions of both suites were run against the identical
dirty tree — opencode exit 0 (490 passed), kimi exit 0 (505 passed), and BOTH self-healed the file back
to clean. The defect I reported reproduced exactly.
ABSENT-TREE case proven on a fresh-clone mirror: both suites exit 0 with three `D0: SKIPPED — <tree> is
absent` lines and a final line reading `[drift-check: NO tree verified; 3 ABSENT, not checked]` versus
`[drift-check: 3 tree(s) in parity]`. Absent and verified never print the same thing.
It also caught a defect in its OWN first version by mutation: D1, the anti-vacuity guard, restated the
probe path instead of calling it, so pointing D0's probe nowhere left D0 skipping all three forges with
D1 PASSING and exit 0. Both now route through one `treeRootFor`, re-mutated, both editions exit 1.
`package.json` UNMODIFIED — I ACCEPT this call. `test:kaola-workflow:editions` (line 45) already runs
both suites and is the owner-ruled editions surface; CLAUDE.md says opencode and kimi are additive
editions absent from `npm test` that "run its own suite", so bolting a bare `--check` step on would
both violate that and false-red every fresh clone. Consequence to note for anyone auditing later:
`grep -c '--check'` in `package.json` stays 0 while the check genuinely runs.
Unexplained and NOT attributed: this agent's scratch mirror was wiped mid-session, did not reproduce
across ~12 later full runs, and every `rmSync` in both suites targets `mkdtemp`/`os.tmpdir`. Recorded
as unexplained rather than blamed on the suites. Shared worktree untouched; nothing committed.

item: USER ROUTED 2026-08-01 — assert that consumer-facing `docs/…` pointers resolve. #892 shipped a
pointer to a deleted `docs/mission-list.md` across twelve installed surfaces and was caught only by a
person reading; nothing would catch the recurrence. Add the check to a validator the chains ALREADY
run — `validate-workflow-contracts.js` — so it needs no new npm entry. Must NOT touch `package.json`
(the sync-guard item owns it). Scope it honestly: a consumer-facing surface may not point at a
repo-only path.
status: done
dispatched: implementer subagent "m-docs-path", worktree `.kw/worktrees/bundle-896-897-898`, owning
`scripts/validate-workflow-contracts.js`. Record at `.cache/m-docs-path.md`.
result: DELIVERED as `CONSUMER_DOCS_PATH` (`scripts/validate-workflow-contracts.js:1028+`),
mutation-proven armed. Report at `.cache/m-docs-path.md`. Verified by me: canonical validator EXIT=0,
and it already runs in the `claude` chain — it is listed in BOTH `test:kaola-workflow:claude` and
`:full` in `package.json`, so no new npm entry was needed.
The design is the good part: the ALLOWANCE is DERIVED, not enumerated — parsed from the `docs/`
scaffold tree in `init.skeleton.md`, so *allowed == what `/workflow-init` actually creates in the
reader's repo* (5 entries, printed on failure). The SCAN is universal over 21 surfaces (18
`GENERATED_SURFACES` rows + 3 skeletons), so it covers all three forges, not just github. A missing
surface asserts loudly at `:1105` rather than skipping, and an unreadable scaffold fails loudly at
`:1091` — neither degrades to a silent pass.
Six mutations, honest results. M1 (next topic, 7 sites) RED; M2 (finalize topic) RED, proving coverage
follows the registry rather than the one topic the author had in mind; M3 restored #892's exact
repoint `docs/decisions/0017-….md` and went RED even though `docs/decisions/` IS allowed — membership
is exact-string, so a prefix rule would have let the real defect through. M4 found a REAL HOLE in the
first implementation (backticked but extension-less slipped, EXIT=0); it was widened to two OR'd
signals and everything re-run.
THREE ACCEPTED LIMITS, decided by me: (1) the second file
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` is a MANDATED byte mirror —
`validate-script-sync.js` runs in the claude chain and exited 1 until it was copied; it now EXITS 0.
Not new scope. (2) `agents/*.md` EXCLUDED — measured, not assumed: 4 sites, all conditional
conventions about the reader's own tree ("if it exists, regenerate it"), none a "go read this"
pointer; including them would buy 4 exemptions for 4 non-defects. (3) M5's remaining limit stands and
is recorded in the code comment: unbackticked AND extension-less is NOT caught, being indistinguishable
from prose. False-negative was chosen over false-positive deliberately.
NO test file authored (custody). I decided not to dispatch one for the scaffold parse: its failure
modes are already loud (both asserts above), and M3 is direct evidence the membership rule is exact.
Adding a test here would be derived from no observed failure.
OWED AT DOCKING: full-scope walkthrough. It was skipped because siblings were mid-edit, so a run would
have measured them; the 3 walkthrough scenarios touching this validator were run as equivalents and
all hold.

item: CHAIN BLOCKER found by `m-sync-guard` in another agent's file —
`node scripts/test-spawn-classification.js` FAILS on this worktree with 2 violations, reproduced by me:
`scripts/test-sink-merge.js:2566` carries trailing prose after `spawn-class: cli-contract` ("— the
mirrored module must be loaded in a FRESH process to observe"), and the vocabulary is CLOSED to
`cli-contract / concurrency / crash / durable-handoff / environment`; consequently the spawn at `:2568`
reads as unclassified and the file sits at 4 unclassified against a ceiling of 3 (the other three —
`:116`, `:251`, `:814` — are pre-existing). Fixing the annotation should resolve both violations at
once. The tool says explicitly "Raising the ceiling is not a fix", so do not.
status: done
dispatched: back to the ORIGINAL test author, subagent "m899-archive-tests" (idle, holds custody of
`scripts/test-sink-merge.js`), via SendMessage — comment-annotation edit ONLY, no behavioural change,
because implementer "m899-archive-fix" is concurrently RUNNING that suite as its oracle. Appends to
`.cache/m899-archive-tests.md`.
result: FIXED, comment-only, one edit. Verified by me: `node scripts/test-spawn-classification.js`
EXIT=0 ("591 spawn sites across 60 files, 169 classified, 136 slots of slack").
The cause was TWO overlapping rules, verified rather than assumed: `CLASS_MARK`
(`test-spawn-classification.js:60`) captures everything after `spawn-class:` to end of line as the
token, so the trailing prose WAS the token; and `enumerateFile:194` accepts an annotation only on the
spawn line or the one IMMEDIATELY above (`annotation[i] || annotation[i-1]`), so the rationale running
onto a second comment line meant even a well-formed token on the first line would not have reached
`:2568`. One move had to fix both. Rationale now sits on its own comment lines above, with a bare
`// spawn-class: cli-contract` as the last line before the `spawnSync`. Ceiling NOT raised, spawn NOT
converted in-process — `(x3)` genuinely needs the fresh process.
Signature intact: `node scripts/test-sink-merge.js` still EXIT=1 at "8 failed, 274 passed", and the
eight FAIL lines were diffed against the pre-edit run — identical except the per-run fixture SHAs in
the `origin/main must NOT advance` message, which are non-deterministic by construction.
Worth recording: that reading was taken against a tree where `scripts/kaola-workflow-sink-merge.js` was
ALREADY dirty with the implementer's in-progress edits, so it is a live reading of their WIP, not a
stale one — the fix had not yet closed the 8 at that moment.

item: dock the run — CHANGELOG `[Unreleased]` entries for whatever actually changed, README/docs/ADR
updates if any surface moved, then the chain receipt. Write CHANGELOG BEFORE the receipt run or it
records `chains_stale`. Pass `--project bundle-896-897-898` to `run-chains.js` or the receipt lands
where finalize never looks. The diff is edition-touching (four sink-merge copies), so finalize will
demand all four chains — expect the long run, and on this box export
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` (concurrent mode SIGKILLs the octopus merge).
Also owed here, found by `m896-reach`: `docs/api.md:495-511` is stale. It lists four "pre-merge
guards" when only `worktree_dirty` actually runs on `--sink`, and it still says
`assertNoLiveWorkflowFolder` "refuses" although it was converted to a report, with a stale `HEAD:`
probe description. No issue number is being filed for the archive defect — it was found while
measuring #896 and the CHANGELOG will cite it that way.
Open, NOT constructed: `assertBranchHasNonWorkflowChanges` is legacy-only too. Unlike #896's premise
that one survives, since no finalize step repairs an implementation-free branch — but it is a
call-site sweep only, never constructed. Record it; do not build on it.
status: done
dispatched: self, in the worktree. Doing it in three passes so the critical path is short.
PASS 1 DONE — `docs/api.md:495-511` corrected. It was wrong on three counts, all verified by me
against source before editing: it presented four "pre-merge guards" as if uniform when `--sink`
returns at `:2517` and never reaches the legacy precondition block at `:2520`, so only
`worktree_dirty` runs there; it said `assertNoLiveWorkflowFolder` "refuses" when it is a CONVERTED
guard emitting `result:'report'` / `status:'not_merged'` at exit 1; and it described the probe as
`git cat-file -e HEAD:{path}` when #346 rescoped it to the branch tip `{branch}:{path}` precisely so
it can run BEFORE the destructive worktree removal. Also documented the KEEP-versus-CONVERTED
distinction and that `assertBranchHasNonWorkflowChanges` is additionally skipped under OFFLINE.
PASS 2 DONE — seven `[Unreleased]` entries written under `### Changed`: the archive fix, #898's T5j,
#897's three assertions, `CONSUMER_DOCS_PATH`, the edition drift-check arming, the `docs/api.md`
correction, and the `dp` removal. #896 gets NO entry of its own beyond the api.md correction, because it
produced no behavioural change — the answer was that the sink is already correct. `docs/api.md` also
gained a bullet documenting that the finalize step's archive is confirmed rather than assumed, and why
it cannot key on `archive_dest`.
PASS 3 IN PROGRESS. Full-scope walkthrough: **184/184, EXIT=0, zero FAILED lines** (log at
`scratchpad/walkthrough-full.log`, spawn-census 1958). Committed at **6eed9801**, 13 files,
`+1105/-32`, message deliberately free of any `close|fix|resolve` keyword ADJACENT to an issue number
so nothing auto-closes ahead of finalization. Four chains now running in background `bxjwqdoy1` with
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` (concurrent mode SIGKILLs the octopus merge on this box) and
`--project bundle-896-897-898` so the receipt lands where finalize will look; the diff touches
`plugins/*` so it is edition-touching and owes all four.
result: DOCKED. Receipt at
`.kw/worktrees/bundle-896-897-898/kaola-workflow/bundle-896-897-898/.cache/chain-receipt.json` — note
it landed in the WORKTREE's project folder, not main's, because the chains ran from the worktree; that
matches the `run_posture: worktree` flow (finalize with `--keep-worktree`, then `sink-merge --sink`).
JUDGED BY CONTENT, not the exit code, and after dumping the real schema rather than guessing field
names: `headSha` `6eed9801dfd8505f49902c206178d14d5145f623` equals the commit; all four chains —
`claude` (222.3s), `codex` (5.8s), `gitlab` (57.1s), `gitea` (56.2s) — carry `exitCode: 0`,
`accepted_red: false`, `accepted_red_issue: null`, `attempts: 1`, `retried_transient: false`,
`timed_out: false`, `signal: null`, and EVERY step within them is `exitCode: 0`. The codex chain is
genuinely only two steps; that is its real content, not a skip.
The `claude` chain runs the walkthrough at `--shard auto/12` (sampled), so on its own it would NOT
verify the suite — but full scope is discharged twice independently: my own pre-commit run (184/184,
EXIT=0) and `test-kernel-conformance.js` inside the chain (106.2s), which spawns the walkthrough
unsharded.
Nothing is waived and nothing is stale. The run is ready to finalize; the merge/close decision is the
user's and is NOT taken here.
