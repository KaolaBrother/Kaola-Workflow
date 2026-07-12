# Workflow Plan — bundle-664-665

<!-- plan_hash: f41a43cb62a63f40a795c6151449ff44d18edd1f8630873431317fd9dc9acdac -->

## Meta
speculative_open_policy: auto
labels: workflow:in-progress, area:scripts
validation_command: npm test

Bundle of two DIAGNOSED post-ship-audit bug fixes (both reproduced at HEAD v6.22.1, 2026-07-12), each
carrying an explicit roadmap next-step with exact line numbers and a prescribed fix direction — a build
DAG, not a shape-first investigation. #664 completes #658's collective adversarial-fan-out fold on the
REPAIR path (adaptive-node.js repair-node); #665 completes #660's fence semantics in two residual
consumers (adaptive-schema.locateSection and release.unreleasedSection). Both are bug fixes → test-first
(`tdd-guide`, RED reproduction then GREEN). They touch DIFFERENT production files (#664 → adaptive-node.js;
#665 → adaptive-schema.js + release.js) but SHARE the CLAUDE-only test surfaces `scripts/test-adaptive-node.js`
and `scripts/simulate-workflow-walkthrough.js`, so their write sets OVERLAP and they are NOT co-open-safe —
the two implement nodes are SEQUENCED (n2 depends_on n1), not a parallel antichain. Correctness is the driver
(precedence #1): #664 is a gate-integrity fix (stale round-1 votes must no longer satisfy `--verdict-check`
after a writer repair) and the four-chain suite is partly CIRCULAR here (`npm test` exercises the very
adaptive-node repair/reopen machinery under change), so a passing unit test can mask an incomplete fold —
hence a read-only `adversarial-verifier` that RUNS both reproductions and asks "root-cause fixed, or
symptom-masked green?" as a non-redundant gate after the reviewer. Cross-edition GENERATED/byte-anchor class
⟹ the four-chain obligation binds at finalize.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-repair-fold | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 6 | sequence | standard | — |
| n2-fence-parse | tdd-guide | n1-repair-fold | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js, scripts/test-adaptive-node.js, scripts/test-release.js, scripts/simulate-workflow-walkthrough.js | 11 | sequence | standard | — |
| n3-review | code-reviewer | n2-fence-parse | — | 1 | sequence | reasoning | — |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning | — |
| n5-finalize | finalize | n4-adversary | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Two SEQUENCED implement nodes, not a parallel antichain (shared test-file lane).** #664 and #665
  edit disjoint PRODUCTION files, but both add regressions to the CLAUDE-only `scripts/test-adaptive-node.js`
  (and defensively `scripts/simulate-workflow-walkthrough.js`), so their declared write sets overlap on those
  surfaces. Overlapping writes are not co-open-safe — `n2-fence-parse` depends_on `n1-repair-fold` so they run
  serially on the shared lane. NEVER hand-add `parallel_safe`. There is no makespan cost: both fixes sit on
  the `scripts/`+`plugins/` lane regardless, and the critical path is dominated by the shared four-chain gate.
- **CLAUDE-ONLY test surfaces (no edition copies).** `scripts/test-adaptive-node.js`, `scripts/test-release.js`,
  and `scripts/simulate-workflow-walkthrough.js` are CLAUDE-chain-only — the codex/forge walkthroughs test
  DIFFERENT surfaces and are NEVER byte-synced, so NO edition copies of these three are declared. The
  walkthrough is declared defensively in both implement nodes (each fix plausibly forces an integration
  assertion there); under-write with a skip-reason is safe if a declared file proves untouched.
- **Edition-sync classes differ per base — declare accordingly:**
  - `kaola-workflow-adaptive-node.js` (n1) is a GENERATED_AGGREGATOR — `generated_port_split` forces the
    canonical + codex twin + two rename-normalized forge ports (`kaola-gitlab-/kaola-gitea-workflow-adaptive-node.js`)
    into the SAME node (all four declared). Edit canonical, then `npm run sync:editions` regenerates the three
    ports; the gitlab/gitea chains' `edition-sync.js --check` verifies parity.
  - `kaola-workflow-adaptive-schema.js` (n2) is a 4-tree BYTE-IDENTICAL group (`validate-script-sync.js`
    "adaptive-schema constant copies"), NOT a GENERATED_AGGREGATOR — it is NOT regenerated by `sync:editions`;
    apply the SAME bytes to all four locations (they must stay byte-identical). It CANNOT import the classifier
    (byte-identity + no-cross-dep contract) — the fence-transition check is implemented LOCALLY (~3 lines).
  - `kaola-workflow-release.js` (n2) is canonical↔codex byte-identical + gitlab/gitea RENAME_NORMALIZED ports
    (`kaola-{gitlab,gitea}-workflow-release.js`). Update the canonical + codex byte-identically and mirror the
    same logic into the two rename-normalized forge ports; `validate-script-sync.js` verifies both families.
- **n1-repair-fold (tdd-guide, standard) — #664, RED-first.** The repair-node gate-reset loop
  (`scripts/kaola-workflow-adaptive-node.js:3744-3767`) folds only gates that INDIVIDUALLY post-dominate the
  repaired writer; a parallel adversarial skeptic never individually post-dominates, so a COMPLETED
  `{sk-a, sk-b}` fan-out group downstream of the repaired writer keeps its round-1 votes and later satisfies
  `--verdict-check` on code that changed after it voted. Fix: MIRROR reopen-node's collective fold
  (`:3388-3403` group branch + the fold-back/purge section ~`:3413-3470`): when a descendant node is an
  `adversarial-verifier` fan-out (`shape.kind==='fanout'`, `cardinality==='1'`), resolve its group via
  `resolveAdversarialFanoutGroup` (imported from `kaola-workflow-plan-validator`) and treat the WHOLE group as
  one post-dominating unit when all members are descendants of the repaired node — then reset ALL member rows
  to pending and purge the exact-group `.cache/adversarial-verifier-*.md` receipts (and stale baselines), exactly
  as reopen-node already does. RED (in `test-adaptive-node.js`): repair-path variant of the #658 regression —
  writer repair downstream of a completed `{sk-a, sk-b}` group resets both skeptic rows AND purges both
  receipts; the reclose requires FRESH votes; stale round-1 votes can no longer satisfy `--verdict-check`; a
  MIXED shape (group + singleton gate) folds BOTH; `would_orphan_in_progress` for mid-vote groups is UNCHANGED.
  `standard` because the fix is a mechanical mirror of an existing, cited pattern (reopen-node), with the
  reasoning-tier gates below as the safety net.
- **n2-fence-parse (tdd-guide, standard) — #665, RED-first, two consumers.**
  - `locateSection` (`scripts/kaola-workflow-adaptive-schema.js:1127-1162`): the closing-fence checks at
    `:1139`/`:1155` are FAMILY-ONLY (`f === fam`). Adopt the classifier's transition semantics LOCALLY —
    capture the OPENING fence run-length and require the closer to be same-family AND run-length ≥ opener AND
    an empty/whitespace closer suffix; FIRST-HIT heading selection; DUPLICATE-heading ambiguity → structural
    refusal or documented fallback (match the classifier's decision). No classifier import (byte-identity).
    RED (in `test-adaptive-node.js`): the reproduced plan — a 5-backtick Node-Briefs fence enclosing a
    3-backtick line and then a `## Node Ledger` DECOY — run END-TO-END through open → splice → close → resume,
    asserting the runtime ledger path now selects the GENUINE ledger (agreeing with `classifier.sectionBody`),
    NOT the fenced decoy, so no hash-mismatch wedge on resume/barrier.
  - `unreleasedSection` (`scripts/kaola-workflow-release.js`): currently terminates the section at
    `/^##[ \t]+/m` with NO fence awareness. Make termination fence-aware (mirror the locateSection/classifier
    transition check) so only a fence-depth-0 `## ` line ends `[Unreleased]`. RED (in `test-release.js`): a
    fenced column-0 `## ` line inside `[Unreleased]` — assert BOTH accounting directions: no spurious
    `changelog_incomplete` for a ref documented AFTER the fence, and an UNKNOWN ref after the fence is NOT
    hidden from the `changelog_unknown_reference` guard.
  - `standard` — both are well-specified mirrors of shipped semantics (#660 classifier / locateSection),
    guarded by the reasoning gates.
- **n3-review (code-reviewer, reasoning)** post-dominates BOTH code nodes n1 and n2 (G1 — the sequenced chain
  routes every path through it). `reasoning` because the correctness is subtle and cross-edition: confirm the
  repair fold eliminates stale votes in the mixed shape AND leaves `would_orphan_in_progress` unchanged; confirm
  the locateSection run-length/empty-suffix/first-hit/duplicate semantics match the classifier without a
  classifier import and preserve the ×4 byte-identity; confirm the release parser change is fence-correct in
  both accounting directions. Runs `validation_command` (the four chains — the cross-edition obligation, since
  the diff touches the edition trees).
- **n4-adversary (adversarial-verifier, reasoning)** — read-only with Bash; RUNS both reproductions (the #664
  completed-group repair path → fresh-vote-required, stale votes rejected by `--verdict-check`; the #665
  5-backtick/3-backtick decoy plan end-to-end → genuine ledger selected) and asks "root cause fixed, or symptom
  masked?" Non-redundant with n3 (diff-reading) and with the four-chain suite (partly CIRCULAR — `npm test`
  exercises the very adaptive-node repair/reopen machinery under change). Its SOLE unsatisfied dependency is the
  n3 review gate ⟹ speculative-open-eligible under `auto` (read-only node → keep-or-discard on a `verdict: fail`).
- **n5-finalize (finalize)** — unique docs/state sink; writes ONLY `CHANGELOG.md` (`[Unreleased]` entries for
  #664 and #665; the completed fence coverage retroactively makes the prior #660 CHANGELOG sentence accurate, so
  no history edit is required). The four-chain green receipt is the cross-edition finalization obligation.
- **No doc-updater (compact posture).** Both fixes complete already-shipped decisions (#658 collective fold /
  #660 fence-aware scanner) with NO new public interface, schema, or architectural contract — consistent with
  #658 and #660 themselves shipping without an ADR. No decision record is authored; the CHANGELOG entries at
  finalize are the durable record.
- **No security-reviewer (G2):** labels carry no security sensitivity (internal workflow-engine parsing/fold
  fixes; no auth/crypto/secret/untrusted-external-input surface). **No main-session-gate (G3):** acceptance is
  fully machine-checkable — RED-first reproductions, the four chains, and the adversarial re-runs; no
  GPU/visual/device/human-signoff hinge. **No knowledge-lookup:** every fix is confirmable in-repo (the cited
  line numbers, reopen-node's fold precedent, the #660 classifier semantics).

## Node Ledger

| id | status |
| --- | --- |
| n1-repair-fold | complete |
| n2-fence-parse | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-repair-fold) | subagent-invoked | evidence-binding: n1-repair-fold 7c50240a9817 | |
| tdd-guide (n2-fence-parse) | subagent-invoked | evidence-binding: n2-fence-parse 404302258587 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review fd1635959afd | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary 50a84c683944 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize b8c7ffac301b | |
