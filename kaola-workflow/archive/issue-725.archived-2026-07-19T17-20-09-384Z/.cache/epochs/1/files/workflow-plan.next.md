# Workflow Plan — issue #725 (epic Phase B: receipt diet — epoch 2 repair: diff-scope false-green + timeout contract)

<!-- plan_hash: d39f89af03fab7a5511d2cdf7fb97b7c719162e87b47b896e5a9dc51c77384cd -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
epoch_lineage_id: a51a6b4bd9b931c3d59f860bc99d07b68a1fa826583a70fb922843cf123bac12
plan_epoch: 2
parent_plan_hash: 3628c722ce42946dc80f16c00be32532b2f3b9eb65d88cb9a15af702fa7a1813
parent_snapshot_manifest_digest: 93928d5165f3a576b74333419f46337514a169d0f1ba3e2286bc86c0d49e30a1
claim_root_base_digest: 82b2a3a5c27f82d36d19411370283412ce6ebeb62dc696c0f0cc47a560af8f8b
transition_reason: review_repair_requires_replan
source_evidence_digest: 38148ae13687a9642beb3580aacd4eba1b45864fb6cf752e5b2aa4f52fd245a2
planner_binding: 1b338e97ff59
validation_command: npm test
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: c2-code-review
security_certifier: none
inherited_frontier_digest: 54f4cd3cd9cfc8c8c097f64f4aa18f3fca89b9bda16acca6425e3bbc9b9c46a2
inherited_frontier_classes: code

## Plan Notes

Epoch-2 REPAIR of Phase B ("receipt diet") of epic #725. The epoch-1 code-reviewer gate returned
`verdict: fail` with two open blocking findings whose producer slice spans both completed producers
(n1 code, n2 docs), so the run entered the claim-preserving re-plan transaction. Epoch 1's accepted
work (B0 per-step timings, B1 diff-scoping, B2 hoist, the strictly-additive receipt, four-edition
parity, the n2 docs delta) is ALREADY in the working tree and is NOT redone or reverted; this epoch
lands only the two fixes on top and re-gates the full accumulated candidate.

Findings repaired (from kaola-workflow/issue-725/.cache/n3-code-review.md):
- R1 (HIGH, fail-open): the B1 diff-scope classifier under-approximates the ROOT cross-edition READ
  surface, so a diff confined to a root file that a non-claude chain's contract validator asserts
  byte-parity on (e.g. commands/workflow-init.md, asserted only by the codex chain; and
  .agents/plugins/marketplace.json) is misclassified claude-only and yields a false-green finalize
  receipt where the pre-candidate all-four run would go red. Fix: broaden the classifier to
  recognize the CLASS of root cross-edition read surfaces, fail-closed by construction.
- R2 (LOW, contract drift): runChainSteps passes the full per-CHAIN timeout to every step spawn, so
  the documented KAOLA_RUN_CHAINS_TIMEOUT_MS per-chain bound becomes per-step (aggregate = steps x
  timeout). Fix: enforce the per-chain wall-clock bound across the chain's steps as documented.
- R3 (MEDIUM, deferred): the >=50% common-case cut is unmet as measured (~20% honest). Per the
  recorded user decision (kaola-workflow/issue-725/.cache/acb-decision.md) the target is
  re-attributed to Phase E of the epic; it is a deferred follow-up, NOT an in-scope fix here, and is
  NOT a blocking clause of this epoch's gate. The finalize Run-gaps sweep carries it forward.

Shape — deliberately SERIAL, single producer under a code-reviewer wall. R1 and R2 both land in the
SAME cohesive four-edition run-chains write set (canonical + codex byte twin + gitlab/gitea
rename-normalized ports + their tests), which must move atomically — no antichain to fan out. The
code-reviewer (c2) is the sole change gate and the code certifier; it post-dominates the single code
producer (c1) and carries the inherited code frontier to a reachable certifier (the epoch inherits a
code frontier from the refuted epoch-1 candidate). A code-reviewer wall, NOT an adversarial-verifier
change gate, per the interim schema-2 guidance (an AV gate over a producer set has a documented
antichain-wedge repair hazard). No separate design node: c1 is the architect and the change is
finalize-gate-critical, so it is reasoning-tier and its brief is binding.

Sensitivity/editions: no sensitive surface or label (run-chains touches no auth/secret/fs-segment/CI
path), so security_certifier: none and no G2 node. run-chains has NO opencode/kimi edition copy and
is not in edition-sync's mirror set, so no opencode/kimi re-sync — validation_command: npm test (the
four chains) is the complete gate. The repair diff touches the edition trees, so this run's own
diff-scoped run-chains correctly self-selects all four chains at finalize (a built-in end-to-end
self-test that also exercises the R1 fix on the repair's own diff).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| c1-scope-timeout-fix | tdd-guide | — | scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js, scripts/test-run-chains.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js, plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js | 7 | sequence | — | reasoning | — | — | — | — | — | — |
| c2-code-review | code-reviewer | c1-scope-timeout-fix | — | 1 | sequence | — | reasoning | — | — | the receipt diet is correct and finalize-gate-safe with the two epoch-1 review-gate defects repaired: (R1) the diff-scope classifier now recognizes root cross-edition READ surfaces that a non-claude chain's contract validator asserts byte-parity on (e.g. commands/workflow-init.md asserted by the codex-chain validate-kaola-workflow-contracts.js, and .agents/plugins/marketplace.json), so any diff touching such a root path fails closed to all four chains and never yields a false-green claude-only finalize receipt, and the fix closes the CLASS of root read surfaces not merely the two reported files; the classifier stays fail-closed by construction (unresolved base or git error -> all four) and records the scope decision plus touched-path diff evidence in the receipt; (R2) the KAOLA_RUN_CHAINS_TIMEOUT_MS bound is enforced per-CHAIN wall-clock as documented in the run-chains header (a decomposed multi-step chain whose cumulative wall-clock passes the bound is killed and marked timed_out), not silently widened to steps-times-timeout, and the header doc matches the code; every executed step still records a per-step wall-clock duration; the receipt stays strictly ADDITIVE so the existing chains[] verdict contract (name, exitCode, accepted_red, headSha, workTreeHash) that plan-validator --finalize-check, release-check, and the walkthrough/test-release synthetic fixtures read is unchanged; release.js --release-check still requires an unconditional all-four receipt; each hoisted cross-chain repeat runs exactly once while every chain stays individually runnable standalone; the #547 code-tree freshness hash still validates a scoped receipt; all four run-chains editions stay in parity (byte-identical claude<->codex, rename-normalized gitlab/gitea) with all four chains green; the >=50% common-case cut is NOT a blocking clause of this gate — it is re-attributed to Phase E of the epic per the recorded user decision (kaola-workflow/issue-725/.cache/acb-decision.md) with the honestly-measured ~20% common-case cut recorded and carried forward as a deferred follow-up; and the CLAUDE.md/CHANGELOG documentation delta describes only shipped behavior with no provenance leakage and CLAUDE.md under 200 lines | the full candidate: the run-chains four-edition family (canonical scripts/ copy, the codex byte twin under plugins/kaola-workflow/scripts/, the gitlab and gitea rename-normalized ports), its test surfaces (test-run-chains.js and the two forge test ports test-gitlab-run-chains.js / test-gitea-run-chains.js), and the n2 documentation delta (CLAUDE.md Validation Policy + CHANGELOG), reviewed against the accumulated diff vs the claim root base f92ec240 and n1's before/after timing evidence, with particular attention to the R1 diff-scope classifier coverage of root cross-edition read surfaces and the R2 per-chain timeout enforcement | sequence | — |
| c3-finalize | finalize | c2-code-review | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Ledger

| id | status |
| --- | --- |
| c1-scope-timeout-fix | pending |
| c2-code-review | pending |
| c3-finalize | pending |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (c1-scope-timeout-fix) | pending | | |
| code-reviewer (c2-code-review) | pending | | |
| finalize (c3-finalize) | pending | | |

## Node Briefs

### c1-scope-timeout-fix

Repair the two open review-gate findings on top of the accepted-and-landed Phase B work already in
the working tree (n1's B0-B3 + n2's docs; do NOT redo or revert them). RED-first for BOTH findings;
land the change in all four run-chains editions in lockstep. Read the gate evidence
`kaola-workflow/issue-725/.cache/n3-code-review.md` and n1's evidence `n1-receipt-diet.md` before
starting.

R1 (HIGH, fail-open false-green): the finalize diff-scope classifier under-approximates the root
cross-edition READ surface. `isEditionCouplingPath` in `scripts/kaola-workflow-run-chains.js`
(around line 585) currently returns true only for `plugins/` paths, `package.json`,
forge-chain-referenced `.js`/`.sh` scripts, and root `scripts/*.js|.sh` files mirrored into the codex
tree — so a diff confined to a ROOT NON-script file that a non-claude chain's contract validator
asserts byte-parity on is misclassified claude-only, skips that chain, and produces a false-green
finalize receipt where the pre-candidate all-four run would go red. Reported instances:
`commands/workflow-init.md` (asserted by `validate-kaola-workflow-contracts.js`, which runs ONLY in
the codex chain) and `.agents/plugins/marketplace.json`. Fix: broaden the classifier to recognize
the CLASS of root cross-edition read surfaces (not just the two named files) so any such diff forces
all four chains — fail-closed by construction, self-contained (no cross-script import a forge port
could not resolve; detect via the same filesystem-existence / edition-tree-counterpart technique the
existing codex-mirror check uses, or an embedded canonical list of the root paths the codex/gitlab/
gitea contract validators read for byte-parity). Reason about the COMPLETE read surface those
contract validators assert — grep their assertions across the edition trees — so the fix closes the
fail-open CLASS, not just the reported paths. RED tests in `scripts/test-run-chains.js` (mirrored to
the two forge test ports): a diff editing `commands/workflow-init.md` -> all-four; a diff editing
`.agents/plugins/marketplace.json` -> all-four; a genuinely claude-only diff -> claude-only
(unchanged); fail-closed to all-four on an unresolved base still holds.

R2 (LOW, contract drift): `runChainSteps` (`scripts/kaola-workflow-run-chains.js` around line 360)
passes the full `timeoutMs` to EVERY step spawn, so the documented per-CHAIN
`KAOLA_RUN_CHAINS_TIMEOUT_MS` bound (header around line 49) effectively becomes per-step and the
aggregate is steps x timeout. Fix: enforce the per-chain wall-clock bound across the chain's ordered
steps — track cumulative elapsed and pass the REMAINING budget to each step's spawn, so once the
chain's cumulative wall-clock reaches the bound the next step is killed and the chain is marked
`_timedOut`/`timed_out: true`. Restore the documented per-chain contract and keep the header doc and
the code consistent. RED test: a decomposed multi-step chain whose steps each finish under the
timeout but whose total exceeds it is killed once cumulative wall-clock passes the bound
(`timed_out: true`), not run to completion.

Cross-edition parity (HARD): canonical `scripts/kaola-workflow-run-chains.js` and the codex twin
`plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js` are BYTE-IDENTICAL; the gitlab/gitea
ports are RENAME-NORMALIZED (`kaola-workflow-*` -> `kaola-{forge}-workflow-*`). Regenerate the ports
via the rename transform; `validate-script-sync` + `edition-sync --check` must stay green. Keep the
forge ports' `require()` of their forge classifier's `isTransientFetchStderr` intact. Do NOT edit
`package.json` (each chain must stay standalone-runnable; the step lists are parsed read-only). Do
NOT touch the docs in this node — `CLAUDE.md`/`CHANGELOG.md` stay accurate under these fixes (the
CLAUDE.md diff-scope prose and the CHANGELOG entry are unchanged: R1 only makes the classifier
correctly recognize more edition-touching paths under the already-documented rule, and R2 restores
the run-chains header's own per-chain contract). Validation: `npm test` (all four chains green — the
change touches edition ports). Reasoning tier: R1 requires reasoning about the complete cross-edition
read surface so the fix closes the fail-open class rather than patching the two reported files.

### c2-code-review

Gate the FULL candidate (the accumulated diff vs the claim root base f92ec240 = n1's B0-B3 + n2's
docs + c1's R1/R2 fixes) against the gate_claim. Read c1's evidence, n1's evidence (including its
before/after timing numbers), the prior gate evidence
`kaola-workflow/issue-725/.cache/n3-code-review.md`, and the user decision
`kaola-workflow/issue-725/.cache/acb-decision.md` before reviewing. Verify BOTH repaired findings
independently by re-execution in the worktree, not from prose: (R1) construct a diff touching
`commands/workflow-init.md` (and `.agents/plugins/marketplace.json`) and confirm `classifyScope` now
selects all-four with an edition-coupling reason; confirm a genuinely claude-only diff still selects
claude-only; confirm fail-closed to all-four on an unresolved base/git error; confirm the fix covers
the CLASS of root cross-edition read surfaces, not only the two reported paths (spot-check other root
files the codex/forge contract validators assert on). (R2) confirm a decomposed multi-step chain is
killed once its cumulative wall-clock passes `KAOLA_RUN_CHAINS_TIMEOUT_MS` (`timed_out: true`), and
the header doc matches the code. Re-confirm the accepted mechanism is intact: per-step timings
recorded; receipt strictly additive (chains[] verdict contract preserved); `release.js
--release-check` still unconditional all-four; each hoisted repeat runs exactly once while every
chain stays individually runnable; the #547 freshness hash validates a scoped receipt; four-edition
parity holds; all four chains green. The >=50% cut is NOT a blocking clause — it is re-attributed to
Phase E per `acb-decision.md`; classify any residual shortfall as a deferred follow-up
(status=deferred) consistent with the user decision, NOT an in-scope open fix; the reviewer's verdict
on every other clause remains entirely its own. Confirm the CLAUDE.md/CHANGELOG delta describes only
shipped behavior, no provenance in CLAUDE.md prose, CLAUDE.md < 200 lines. This is the sole change
gate (a code-reviewer wall, no adversarial-verifier, per the interim schema-2 guidance). Reasoning
tier.

### c3-finalize

Terminal sink, run main-session-direct. The candidate touches the edition trees (the run-chains
four-edition family + its tests), so four-chain verification is required — the diff-scoped run-chains
self-selects all four chains for this run; record the all-four GREEN chain receipt. The Run-gaps
sweep MUST carry the deferred gap: AC-B >=50% common-case cut is re-attributed to Phase E of #725 per
the recorded user decision (`kaola-workflow/issue-725/.cache/acb-decision.md` is the citation), with
the honestly-measured ~20% common-case cut recorded. PARTIAL close: leave #725 OPEN (Phase C and the
later epic phases remain); do NOT close #718 or any other issue. Sink per the standard adaptive
finalize path (feature commit -> run-chains receipt -> cmdFinalize --keep-worktree/--keep-open ->
push branch -> sink-merge from the main root), verifying the issue stays OPEN afterward.
