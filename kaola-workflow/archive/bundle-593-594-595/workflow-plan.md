# Workflow Plan — bundle-593-594-595

<!-- plan_hash: db6f27b3b5dced0a8844bf08bec1b8c83e1d692d0a97a5db5b935af604fb2095 -->

Same-scope bundle: three running-set scheduler hardening changes in the adaptive engine.

**#595 (bug, area:scripts):** in `acquireProjectLock` (`kaola-workflow-adaptive-schema.js`, the
byte-identical-×4 drift anchor) a `writeFileSync`/`fsyncSync` that throws immediately after a
successful `openSync(lockPath, 'wx')` orphans the just-created EMPTY lockfile — the held-lock marker
is never set, so neither the `finally` release nor the exit hook cleans it, and later acquires get
wrong-flavor `scheduler_locked` refusals until the 24h mtime fallback flips it stale. Fix: wrap the
payload write in try/catch and `unlinkSync(lockPath)` before rethrowing/refusing. Race-free: the
file was created by OUR `'wx'` in this same call, so we provably own it (no stale-verdict unlink of
another process's lock — the no-takeover invariant is untouched).

**#594 (enhancement, area:scripts):** the parallel-batch retirement removed the only writer of
`active-batch.json`, but the mutation-guard coordination layer still carries the dead `batch_active`
probe/refusal + its `OPERATOR_HINT_REGISTRY` entry + doc references. Nothing the current product can
produce can fire it. Remove the dead guard/hint/doc references; no behavior change for any producible
state.

**#593 (enhancement, area:scripts):** write co-open eligibility proves disjointness at
top-level-directory granularity, so every cross-edition antichain (both nodes under `plugins/`)
serial-degrades even when exactly-path-disjoint — authored parallelism that can never open. Fix
(full normative design in the issue): make the `coarse` arm of `writeOverlapRelaxable` (the
`--parallel-safe` callsite in `kaola-workflow-plan-validator.js`) RELAX BY DEFAULT under the SAME
retained-net invariants that already gate shared-infra — NET-1 (a code-reviewer/synthesizer gate
post-dominates the legs) and NET-2 (no PROTECTED concrete file in either set). Classifier verdict
purity is UNCHANGED (`disjointWriteSets` keeps emitting `red / kind:'coarse'`; the downgrade lives
at the callsite). `exact` NEVER relaxes (same path or case-collision still serial-degrades).
Resolvability fallback: a non-exactly-resolvable entry (directory-shaped/glob) keeps today's
coarse-area refusal. `write_overlap_policy`/`--write-overlap-consent` become vestigial at this seam
but stay parsed for frozen-plan back-compat.

Cross-edition (#307): `kaola-workflow-adaptive-node.js` + `kaola-workflow-plan-validator.js` are
GENERATED_AGGREGATORS (canonical + codex byte-twin + gitlab/gitea rename-generated forge ports);
`kaola-workflow-classifier.js` is a COMMON_SCRIPT with rename-normalized forge ports;
`kaola-workflow-adaptive-schema.js` is the byte-identical-×4 anchor (canonical name in all four
trees). All four `npm run test:kaola-workflow:*` chains must be green (run sequentially) before
finalize. #593's operator-facing co-open prose changes → the SIX plan-run routing surfaces
propagate together.

## Meta

labels: bug, enhancement, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-schema-fix | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-adaptive-node.js | 5 | sequence | sonnet |
| n2-scheduler | tdd-guide | n1-schema-fix | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/simulate-workflow-walkthrough.js, scripts/test-adaptive-node.js, scripts/test-commit-node.js | 15 | sequence | opus |
| n3-adversarial | adversarial-verifier | n2-scheduler | — | 1 | sequence | opus |
| n4-docs | doc-updater | n2-scheduler | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, docs/conventions.md, docs/plan-run-cards/frontier-batch.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md, CHANGELOG.md, docs/decisions/D-593-01.md, docs/decisions/D-594-01.md, docs/decisions/D-595-01.md | 15 | sequence | sonnet |
| n5-review | code-reviewer | n3-adversarial, n4-docs | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### DAG shape / scheduling rationale
- **Why #594 and #593 are ONE node (n2-scheduler):** both edit the SAME generated aggregator
  `kaola-workflow-adaptive-node.js` (#594 removes the `batch_active` guard; #593 updates the
  `runOpenReady`/`tryFormLaneGroup` co-open comments). A generated aggregator + its codex twin +
  forge ports must move atomically in one node (generated_port_split wall), and a forge-port write
  must be downstream of ALL root edits (forge-port ordering wall) — so two sequential nodes each
  carrying the ×4 aggregator set are out of grammar by construction (the earlier node's port writes
  can never be downstream of the later node's root edit). The sanctioned shape is one atomic node.
  #593 additionally owns `kaola-workflow-plan-validator.js` ×4 (the `writeOverlapRelaxable`
  callsite — another aggregator). Internally sequence #594 (dead-code removal, small/contained)
  FIRST, then #593 (the co-open refinement) on the cleaned file, then regenerate all forge ports
  together.
- **Why #595 is a SEPARATE first node (n1-schema-fix):** it edits a DIFFERENT surface — the
  byte-identical-×4 `kaola-workflow-adaptive-schema.js` (NOT a generated aggregator, no forge
  rename), so it carries no forge-port ordering coupling to n2. It is a distinct bug with a clean
  RED-first oracle (inject a write failure after the O_EXCL create). n2 depends on n1 ONLY because
  both write `scripts/test-adaptive-node.js` (a genuine shared file → they serialize; they are not
  a co-openable antichain). There is no other write-parallelism to expose in this bundle: all three
  changes concentrate in the same scheduler files, so a forced fan-out would serial-degrade anyway.
- **n3-adversarial ∥ n4-docs (antichain):** both depend only on n2; n3 is read-only
  (`declared_write_set: —`), n4 writes docs + routing surfaces only. They are disjoint (n3 empty) →
  n3 co-opens as a read-only sibling while n4 writes. n5 (code-reviewer) then post-dominates every
  code-producing node (n1, n2, n4) on every path to the sink — G1.
- **No security-reviewer** (no security label; this is concurrency/scheduler hardening of
  workflow-internal state files, not a sensitive surface — same posture as the prior lock work).
  **No main-session-gate** (every acceptance check — the four chains, the RED-first tests, the
  real-git co-open test, grep-absence — is delegable/machine-verifiable). **No knowledge-lookup**
  (all behavior confirmable locally: Node `fs` O_EXCL/`unlinkSync` semantics are already used
  in-repo; the co-open net + classifier verdict semantics live in this repo).
- **speculative_open_policy stays default-off:** no read-only node has a sole-gate unsatisfied
  predecessor (n3's predecessor n2 is an implement, not a gate; n5 has two deps).

### n1-schema-fix (tdd-guide, sonnet) — #595 lock-orphan unlink-on-write-failure
- RED first: inject a write failure (fault seam or fs stub) so `writeFileSync`/`fsyncSync` throws
  right after `openSync(lockPath, 'wx')` succeeds. Current code: the empty lockfile persists and a
  follow-up `acquireProjectLock` refuses (`scheduler_locked`, fresh-mtime empty payload = "live
  mid-write holder"). Post-fix: the lockfile is gone and the follow-up acquire succeeds.
- Fix: wrap the payload write in try/catch; on failure `unlinkSync(lockPath)` before
  rethrowing/refusing. Keep it additive — do NOT touch the release `finally`, the exit hook, the
  stale-PID probe, or any other acquire path. Existing lock tests (live-refuse, stale-refuse,
  zero-acquisition race, release) must stay green.
- No-takeover invariant preserved: the new `unlink` runs ONLY in the same call that created the
  file (before returning), so it can never remove another process's lock. State this explicitly in
  evidence (it is AC #2).
- Cross-edition: `kaola-workflow-adaptive-schema.js` moves as a byte-identical ×4 group (canonical
  name in all four trees — NOT forge-renamed). After editing canonical, byte-copy the codex twin +
  the two forge copies; `validate-script-sync.js` / `edition-sync.js --check` must pass.

### n2-scheduler (tdd-guide, opus) — #594 removal + #593 co-open refinement, internally sequenced
**Part 1 — #594 (do first): remove the dead `batch_active` guard.**
- Remove the `batch_active` coordination probe/refusal from the mutation-guard layer, its
  `OPERATOR_HINT_REGISTRY` entry, and the `.cache/active-batch.json` reads that ONLY the dead guard
  consumes. Verify against the dispatcher which reads (if any) are the guard's alone vs. the
  separate `active_batch_exists` plan-repair-reopen path — decide that path's fate by reading the
  code, and record the decision in evidence (the issue's headline scope is `batch_active`; expand to
  `active_batch_exists` only if it too is provably dead for producible state).
- No natural failing unit test exists for pure dead-code removal; the proof is grep-absence in live
  scheduler code + the reason/hint inventory PLUS the full suite + walkthrough staying green (no
  producible state regresses). Update/remove any `test-adaptive-node.js` fixtures that exercised the
  guard.
- OUT OF SCOPE: the `validate-workflow-contracts.js:721` comment mentions `active-batch.json` only
  as a historical example of durable files the `writeFileAtomicReplace` helper protects — that is a
  different concern (atomic-replace), not the batch_active reason/hint inventory. Do NOT touch it
  (it is intentionally excluded from the write set); if the reviewer judges otherwise, route it back
  as a finding rather than an out-of-set write.

**Part 2 — #593: exact-path co-open relaxation (implements the issue's normative design).**
- Change the `coarse` arm of `writeOverlapRelaxable(dj, setA, setB, policy, consent, gatePresent)`
  in `kaola-workflow-plan-validator.js` from policy+consent-gated to DEFAULT-RELAX, gated on the two
  retained-net invariants already gating shared-infra: NET-1 = `gatePresent` (code-reviewer gate
  post-dominates the legs); NET-2 = neither set contains a PROTECTED concrete file. The downgrade
  lives ONLY at this callsite.
- `disjointWriteSets` (classifier) verdict/kind emission stays byte-identical (`red / kind:'coarse'`)
  — verdict-only readers (`scanClaimedOverlap`, the G-SEL-4 select-arm check, the freeze
  concurrent-sibling antichain loop) MUST behave identically (AC5 purity; the walkthrough's
  freeze-time coarse "must ask" assertions must stay green unchanged).
- `exact` NEVER relaxes (same path or case-collision → refuse/serial-degrade). No policy value or
  consent flag may bypass the net or the exact check (AC2/AC3).
- Resolvability fallback (AC4): if either set has a non-exactly-resolvable entry (directory-shaped
  `path/` or glob), exact-path disjointness is unprovable → keep today's coarse-area refusal.
- Update the `runOpenReady`/`tryFormLaneGroup` consent-forwarding comments in
  `kaola-workflow-adaptive-node.js` to match (coarse now relaxes by default under the net; consent
  vestigial at this seam). Keep `write_overlap_policy`/`--write-overlap-consent` PARSED for
  frozen-plan back-compat; document them as redundant at this seam. Do NOT repurpose either as a
  net-bypass; do NOT squat `write_overlap_policy: exact` (reserved for the deferred overlap-tolerance
  axis).
- Tests: the AC1 real-git co-open happy path lives in `scripts/test-adaptive-node.js` (two-node
  write antichain, exactly-disjoint sets both under `plugins/`, net holding → provision → per-leg
  barriers → octopus merge → union barrier). Add AC2/AC3/AC4/AC6 (serial byte-identity +
  `KAOLA_PARALLEL_WRITES=0`) coverage there. `scripts/simulate-workflow-walkthrough.js` is declared
  DEFENSIVELY — the freeze behavior is unchanged so it should stay GREEN as-is; touch it only if a
  runtime co-open integration assertion is warranted (it is canonical-only, NEVER synced to the
  codex/forge walkthroughs).
- `scripts/kaola-workflow-classifier.js` (×4) is declared DEFENSIVELY for a possible shared
  resolvability helper; if verdict purity is kept and no helper lands there, those four are simply
  not written (declared-but-unwritten is legal — the barrier refuses only OUT-of-set writes). If
  edited, all four (canonical + codex twin + two forge rename ports) move together.

**Cross-edition mechanics (both parts):** after editing canonicals, regenerate the forge ports for
the GENERATED_AGGREGATORS (`kaola-workflow-adaptive-node.js`, `kaola-workflow-plan-validator.js`)
via the edition-sync mechanism (gitlab/gitea `kaola-{forge}-workflow-*.js` are generated, never
hand-edited) and byte-copy the codex twins; `edition-sync.js --check` + `validate-script-sync.js`
must pass before the node closes. Opus tier: the co-open relaxation is a concurrency-safety change
(when writes co-open) with a subtle layered-net argument and high rework cost.

### n3-adversarial (adversarial-verifier, opus, read-only) — attack all three fixes
Refute, at minimum: (a) #593 coarse relaxation permitting an UNSAFE co-open (a case where NET-1 or
NET-2 is not actually enforced, or where `exact`/case-collision slips through as relaxable); (b) the
resolvability fallback failing to catch a directory-shaped/glob entry; (c) verdict-purity regression
— any verdict-only reader (scanClaimedOverlap, G-SEL-4, the freeze antichain loop) behaving
differently; (d) #595 unlink removing anything other than the file this call created (no-takeover
regression) OR a remaining error path that still orphans the lockfile; (e) #594 removal breaking a
LIVE path (a reachable state that legitimately needed the guard) or leaving a dangling reference;
(f) any serial-path / envelope / exit-code behavior change the suites would miss. Bash available:
may re-run `node scripts/test-adaptive-node.js` / the walkthrough / targeted repros read-only. Use
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` if invoking run-chains on this host (the auto concurrency
SIGKILLs the octopus-merge test).

### n4-docs (doc-updater, sonnet) — all prose, cross-edition-consistent
- **The SIX plan-run routing surfaces** (3 Claude commands + 3 Codex SKILLs) carry the STALE claim
  that `--write-overlap-consent` is required for coarse co-open. Update all six IN LOCKSTEP: coarse
  (exact-disjoint, same non-shared top-level area) frontiers now co-open BY DEFAULT under the
  retained net (post-dominating gate + no PROTECTED file); genuinely-overlapping (same exact path /
  case-collision) writes still serial-degrade; `--write-overlap-consent` + `write_overlap_policy`
  are now redundant at this seam (still parsed for back-compat). PRESERVE every existing route pin
  (e.g. `<!-- PIN: frontier unit -->` and the other pinned tokens the route-reachability contract
  asserts on all six). Keep the surfaces forge-neutral (no `gh`/`glab`, no forge brand) and
  provenance-free (no `#NNN`, `D-NNN-NN`). Run `node scripts/test-route-reachability.js` +
  the four `validate-*-contracts.js` to confirm parity before the node closes.
- `docs/conventions.md` (freeze-time write-set hygiene / disjointness section) + planner
  surface-map guidance: exact-path is the granularity of truth; hidden shared surfaces
  (`package.json` pins, walkthrough needles, `install.sh`/registration blocks, validator
  prompt-needle pins) turn "disjoint" pairs into secret sharers → planners must declare them up
  front so the overlap is visible and correctly serializes.
- `docs/plan-run-cards/frontier-batch.md`: update the co-open / `--write-overlap-consent` reason-code
  coverage to the new default-relax semantics.
- `docs/api.md`: REMOVE the `batch_active` reason entry (the #594 removal). Do NOT disturb the
  closure-contract / forge-parity concepts the contract validator `assertConcept`s.
- `docs/architecture.md`: the co-open eligibility story shifts from top-level-area to exact-path
  (coarse relaxes by default under the net).
- `CHANGELOG.md` under `[Unreleased]`: one entry per issue — `### Fixed` for #595 (lock-orphan
  unlink) and (if classed as a fix) the #594 dead-guard removal; `### Changed`/`### Fixed` for #593
  co-open exact-path relaxation. Reference the cross-edition four-chain obligation + the decision
  records.
- `docs/decisions/D-593-01.md`, `D-594-01.md`, `D-595-01.md` (all three series verified FREE against
  `docs/decisions/` on 2026-07-02 → next-free is `-01` each).

### n5-review (code-reviewer, opus) — G1 gate
Post-dominates n1, n2, n4. Verify: RED-first evidence for #595 and #593; #594 dead-code removal is
truly dead for producible state (grep-absence + green suite); AC1–AC7 for #593 (co-open happy path,
net enforcement, genuine-overlap-unchanged, resolvability fallback, verdict purity, serial
byte-identity, suites); edition parity (`edition-sync.js --check`, `validate-script-sync.js`,
route-reachability across the 6 surfaces); all four chains green (run SEQUENTIALLY — a green claude
chain alone is insufficient; use `KAOLA_RUN_CHAINS_CONCURRENCY=serial` on this host if run-chains is
used); docs match shipped behavior; no contract-validator needle broken; routing surfaces
forge-neutral + provenance-free.

### n6-finalize (sink)
Docs/state bookkeeping only (CHANGELOG attribution touch-ups if needed). The four-chain #307
evidence must be recorded before finalize per the validation_command. Bundle sink lane: closure of
all three members runs at sink-merge — pass BOTH `--issue <primary>` and the member set so the
`--issue-numbers` closure path (recently landed via #592) closes every member, not just the primary.

## Node Ledger

| id | status |
| --- | --- |
| n1-schema-fix | complete |
| n2-scheduler | complete |
| n3-adversarial | complete |
| n4-docs | complete |
| n5-review | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-schema-fix) | subagent-invoked | evidence-binding: n1-schema-fix a9861fafa36f | |
| tdd-guide (n2-scheduler) | subagent-invoked | evidence-binding: n2-scheduler 740e98328048 | |
| adversarial-verifier (n3-adversarial) | subagent-invoked | evidence-binding: n3-adversarial c691d13c8f87 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs ffd4a4c68e7f | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 9215ae7cb1e8 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize b4d152b2a7b8 | |
