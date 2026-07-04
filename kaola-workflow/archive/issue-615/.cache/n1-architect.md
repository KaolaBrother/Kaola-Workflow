evidence-binding: n1-architect 41ee316ae6b6
## (a) Diagnosis confirmed — file:line evidence

The mixed serial-write + lane-group deadlock is real and reproduces from these exact seams.

**Structural manufacturer of the mixture — `scripts/kaola-workflow-adaptive-node.js`**
- `runOpenReady` branch `else if (liveNodes.length === 0 && writeNodes.length > 0)` at **line 4266** forms a lane group at **4282–4283** (`if (legCoupled && writeNodes.length >= 2)` → `tryFormLaneGroup`) *whenever the running set is empty*, with **no** inspection of parent working-tree production dirt.
- This branch already carries two serial-degrade fallbacks — overlap → `toOpen = [writeNodes[0]]` at **4312–4315**, and effective-cap `< 2` → **4296–4298** — so serial-degrade is an established, in-pattern outcome of this exact branch, not a new mechanism.

**Group-barrier base excludes uncommitted serial work — `adaptive-node.js:4388–4411`**
- `baseRev = git rev-parse HEAD` in the feature worktree at group open (**4390**), threaded into `provisionLeg(...baseRev)` (**4399**) and anchored `update-ref legBaseRef(project, n.id) baseRev` (**4411**). Since serial nodes never commit (finalize-owned-commit contract), this HEAD **excludes** the accumulated uncommitted serial dirt. Confirms the diagnosis' baseline claim exactly.

**Parent-clean fence is ledger-blind — `scripts/kaola-workflow-plan-validator.js:2576` (`--parent-clean-check`)**
- `git status --porcelain --untracked-files=all` (**2604**) → `production = dirtyPaths.filter(p => !barrierExemptPath(p, fenceProject))` (**2617**) → refuse `parent_dirty` (**2618**). It consults **only** `barrierExemptPath` (`:307–309` = workflow-artifact ∪ barrier-invisible docs/`kaola-workflow/**` ∪ test bands); it never reads the ledger or any `complete` node's declared write set. A closed serial sibling's uncommitted production file is therefore flagged `parent_dirty`.

**The attribution the fence lacks (the confirmed asymmetry) — `plan-validator.js:2846–2853`**
- The finalize `unattributed_change` sweep builds `completeDeclared` = ∪ writeSet over ledger-`complete` nodes (**2848–2851**), then `unattributed = changed.filter(p => … && !completeDeclared.has(p))` (**2852–2853**). This arm **does** treat a `complete` node's declared write set as attributed. The parent-clean fence does **not** mirror it — the precise gap named in the diagnosis.

**Commit-based group barrier — `plan-validator.js:2464–2551` (`--group-barrier --merge-commit M`)**
- base resolved from the anchored leg-base ref (**2500–2515**, = parent HEAD at group open); `diff-tree base mSha` (**2545**) → `barrierCheck(content, actualPaths, { groupMembers })` (**2547**). In `barrierCheck`, `outOfAllow = production.filter(p => !declared.has(p))` (**1099–1101**) → `reason = 'write_set_overflow'` (**1140–1156**). If serial work is committed into M to clear parent-clean, those paths land in `actualPaths`, are outside the group union → `write_set_overflow`.

**Where the two fences collide — `adaptive-node.js:4991–5014` (last-member close, `if (liveLegs)`)**
- (i) `--parent-clean-check` at **4994**, refuse `parent_dirty` at **4996**; (ii) `synthesizeLevel` octopus `git merge --no-ff` into HEAD (**3908**) at **5001**; (iii) `--group-barrier --merge-commit` at **5011**. (i) and (iii) impose the contradictory requirement.

**Why the serial path tolerates prior dirt (the known-good degrade target) — `plan-validator.js`**
- `--record-base` uses `snapshotWorktree` = `git write-tree` (**2299**, **1983**): a full-worktree TREE snapshot that *includes* prior uncommitted dirt. `--barrier-check` diffs `base → snapshotWorktree(now)` (**2395 / 2887–2890**), so accumulated serial dirt is present on *both* sides and invisible. A serial open over a dirty parent is structurally sound today.

**The deadlock, both horns:**
- *Horn A (do nothing):* close-time `--parent-clean-check` (4994) sees the uncommitted serial production files → `parent_dirty` → the run cannot advance.
- *Horn B (commit the serial work to clear the fence):* M now descends from a commit carrying those files → `diff-tree base→M` includes them → outside the group union → `write_set_overflow` (validator 1099–1101).

Contradictory requirements on the same paths ⇒ structurally unsatisfiable. Confirmed.

## (b) Selected direction — Direction 1 (prevent the mixture at scheduling), with rationale

Decision, ordered by the CLAUDE.md precedence (accuracy → automation/efficiency → cheapest sufficient):

**1. Accuracy (non-negotiable).** Direction 1 removes the deadlock by never entering the unsatisfiable state — a fail-safe. It leaves *both* fences fully armed: the parent-clean fence still catches a floated own-lane slip (the hole it was purpose-built for, validator 2577–2584), and the commit barrier still measures committed-only content with its no-silent-loss ancestor checks (2527–2543). No correctness property is weakened; a currently-deadlocked run instead completes serially (the known-good path, proven above at record-base/barrier-check).

**2. Contract preservation.** Direction 1 forces **no** commits, so the user-owned "commits are finalize-owned" serial contract is untouched — no escalation-gated contract change required. Direction 2 either forces serial commits (a direct contract violation) *or* relaxes the parent-clean fence so the octopus `git merge --no-ff` (3908) runs against a **dirty** parent tree. The task's own flag — "verify the synthesizer's octopus merge still needs a clean parent tree" — is decisive here: `git merge` refusing/tolerating a dirty-but-disjoint worktree is version- and case-dependent behavior we must not guess (CLAUDE.md: verify, don't fabricate), and relaxing the fence re-opens the floated-slip hole for the group's *own* slips. Direction 2 also touches two fences plus `barrierCheck`. More surface, more risk, weaker contract story.

**3. Cheapest sufficient mechanism.** Direction 1 is the smallest change — one guard in one function (`runOpenReady`), reusing the *exact* fence the last-member close will later apply (`--parent-clean-check`), so producer and consumer classification can never drift. Its only cost is parallelism *in the narrow mixed shape that deadlocks today* — and parallelism is explicitly a means, not a goal. Critically, it loses **no** parallelism that is currently safe: a pure-parallel run or a group-first plan has no prior production dirt, so the fence passes and the group forms normally; the degrade bites *only* the genuinely-mixed shape, converting a hard deadlock into a correct serial completion. Strictly better.

**Direction 3 rejected on the merits:** it misdiagnoses the anchor. The group-barrier base is *already* parent HEAD at group open (4390). The overflow does not come from a wrong base — it comes from the merge commit M carrying the *committed* serial work between base and M. Re-anchoring cannot exclude that without moving base off the legs' shared branch-point, which breaks the leg-base ancestor invariants (`leg_baseline_split` 2516–2519, `merge_base_unreachable` 2520–2526). Direction 3 does not resolve the contradiction.

## (c) Implementation guidance for n2-fix (TDD)

**Fix point — `scripts/kaola-workflow-adaptive-node.js`, `runOpenReady`, the `else if (liveNodes.length === 0 && writeNodes.length > 0)` branch at line 4266.**

Add a single precondition to the group-formation gate at 4282: form a lane group only when the parent worktree is clean of out-of-allowband production dirt; otherwise fall through to the existing serial-degrade (`toOpen = [writeNodes[0]]; openKind = 'write';`). Concretely, gate `tryFormLaneGroup` on a new local so the existing `else` at 4316–4319 catches the degrade:

```js
// #615 (D-615-01): a lane group cannot co-open over a parent worktree that already carries
// out-of-allowband production dirt (uncommitted work from already-closed SERIAL siblings — the
// finalize-owned-commit accumulation). Such a group's last-member close is structurally
// unsatisfiable: the parent-clean fence (validator --parent-clean-check) demands the dirt
// committed/removed, but committing it lands it in the merge commit → write_set_overflow at the
// commit-based group barrier. Serial-degrade avoids the deadlock; the serial per-node barrier
// tolerates prior dirt (its base is a full-worktree snapshot at open). Parallelism is a means,
// not a goal (CLAUDE.md precedence #3). Reuses the EXACT fence the last-member close applies, so
// producer/consumer classification cannot drift.
const parentClean = !parentCarriesProductionDirt(planPath, project, shell);
if (legCoupled && writeNodes.length >= 2 && parentClean) {
  const grp = tryFormLaneGroup(writeNodes, planPath, shell, opts.writeOverlapConsent);
  // … existing 4284–4315 unchanged …
} else {
  toOpen = [writeNodes[0]];
  openKind = 'write';
}
```

Helper (module scope, beside `tryFormLaneGroup` ~3676), reusing the same `shell(validatorPath, …)` invocation form already proven at line 4994:

```js
// #615 (D-615-01): true iff the parent worktree carries out-of-allowband production dirt — the
// precondition that makes a lane-group close unsatisfiable. Shells the SAME --parent-clean-check
// the last-member close runs; a `parent_dirty` refuse is the degrade signal. Any OTHER refuse
// (e.g. root_mismatch) also degrades to serial (fail-closed: never co-open on an uncertain parent).
function parentCarriesProductionDirt(planPath, project, shell) {
  const fence = shell(validatorPath, [planPath, '--parent-clean-check', '--project', project, '--json']);
  return !(fence && fence.result === 'pass');
}
```

Notes for the implementer:
- `project`, `shell` are already destructured in `runOpenReady` (4116–4118); `validatorPath` is module-level (used at 3681, 4994). No new plumbing.
- Root-pin: `--parent-clean-check` asserts cwd == git toplevel (validator 2587). The closeGroupMember call at 4994 uses this identical form and relies on the process cwd being the feature-worktree root — mirror that; do not re-derive. If the test harness runs the validator with a different cwd, pass `--skip-root-pin` (the check still targets `git -C root status`; the pin is only a safety assertion).
- No false-degrade from workflow churn: `barrierExemptPath` exempts `kaola-workflow/{project}/**`, docs, tests, and workflow artifacts, so plan/ledger/`.cache` churn never trips the fence — only genuine production dirt does.
- The degrade is self-terminating: the remaining write nodes open one-at-a-time serially, each accumulating invisible-to-its-own-barrier dirt, and finalize's `unattributed_change` sweep (validator 2846–2853) credits every `complete` node's declared writes. The run completes correctly, just serially.

**RED reproduction sketch (primary — assert at the fix point; hermetic, no octopus merge needed).**

Mirror the existing open-ready fixture harness at `scripts/simulate-workflow-walkthrough.js:1592–1635` (`runNode(adaptiveNodeScript, ['open-ready', '--project', <p>, '--json'], tmp)` over a temp git worktree), and the lane_group manifest shapes at 6979–7040.

1. Freeze a plan whose DAG is: two **serial** write nodes (`sequence`, e.g. `sA`→`sB`) followed by two **disjoint parallel** write nodes (a `parallel_safe` / fanout antichain `pA`, `pB` with non-overlapping declared write sets), then the sink.
2. Drive the two serial nodes to `complete` in the ledger, and leave a **production** file declared by a `complete` serial node **uncommitted** in `tmp` (the shared worktree) — e.g. write `src/a.js` (declared by `sA`) and do not commit. This is the canonical serial-accumulation state.
3. Call `open-ready` on the now-ready parallel frontier `{pA, pB}`.
   - **RED (today):** the response forms a lane group — `opened.length === 2`, each carries a `group_id`, and a `lane_group` manifest is written (branch 4266→4282). Assert this is what happens today, then assert the desired post-fix outcome fails.
   - **GREEN (post-fix):** `open-ready` degrades — `opened.length === 1`, `opened[0].kind === 'write'`, **no** `group_id` / no `lane_group` manifest. Assert this.

Primary RED assertion: *"with a `complete` serial node's production file uncommitted in the parent, `open-ready` over a disjoint write frontier must NOT form a lane group — it must open a single serial write."*

**Optional corroborating RED (proves it is a genuine two-horned deadlock, heavier):** with the group forced to form (old behavior / `KAOLA_PARALLEL_WRITES=1` and no guard), drive the last-member `close-node` and assert `result:'refuse', reason:'parent_dirty'` (Horn A, from 4996); then commit the serial file and re-run the close and assert `reason:'write_set_overflow'` (Horn B, from validator 1099–1101 via 5011). This documents the trap but is not required for the fix's TDD loop — the scheduling-boundary RED is the sufficient failing test.

Validation for n2: this is a Claude-tree script edit only (`adaptive-node.js` is a COMMON/generated aggregator — confirm whether the edit needs edition regen via `sync:editions` and the #307 four-chain per the Validation Policy; a change to shared `adaptive-node.js` logic typically does). At minimum, `node scripts/simulate-workflow-walkthrough.js` must stay green with the new RED→GREEN case added.

Relevant files:
- `scripts/kaola-workflow-adaptive-node.js` (fix point `runOpenReady` 4266; leg anchor 4388–4411; last-member close 4991–5014; `tryFormLaneGroup` 3676; `synthesizeLevel` 3875)
- `scripts/kaola-workflow-plan-validator.js` (parent-clean fence 2576–2618; commit group barrier 2464–2551; `unattributed_change` attribution model 2846–2853; `barrierCheck` overflow 1042–1160; `barrierExemptPath` 307–309; `snapshotWorktree` 1973–1983; `--record-base` 2299)
- `scripts/simulate-workflow-walkthrough.js` (open-ready fixture harness 1592–1635; lane_group manifest fixtures 6979–7040)
