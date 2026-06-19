# Workflow Plan — bundle-532-533-534-535-536

<!-- plan_hash: be5b31219fef1975fc5da4ff37f1767b95a479eb0f1bd338d1171adf7086f0fc -->

## Meta

labels: workflow:in-progress, area:scripts, documentation
goal: Fix all open opencode-edition audit (#530) follow-up issues as a single bundle

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-rewrite-constructs | implementer | — | scripts/sync-opencode-edition.js, .opencode/command/kaola-workflow-adapt.md, .opencode/command/kaola-workflow-auto.md, .opencode/command/kaola-workflow-fast.md, .opencode/command/kaola-workflow-finalize.md, .opencode/command/kaola-workflow-phase1.md, .opencode/command/kaola-workflow-phase2.md, .opencode/command/kaola-workflow-phase3.md, .opencode/command/kaola-workflow-phase4.md, .opencode/command/kaola-workflow-phase5.md, .opencode/command/kaola-workflow-plan-run.md, .opencode/command/workflow-init.md, .opencode/command/workflow-next.md | 13 | sequence | sonnet |
| n2-content-reachability | implementer | n1-rewrite-constructs | scripts/test-opencode-edition.js | 1 | sequence | sonnet |
| n3-plugin-portability | implementer | n2-content-reachability | .opencode/plugins/kaola-workflow-hooks.js, scripts/test-opencode-edition.js | 2 | sequence | sonnet |
| n4-classifier-decouple | tdd-guide | — | scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, scripts/test-claim-hardening.js | 3 | sequence | sonnet |
| n5-docs-discoverability | doc-updater | — | README.md, docs/README.md, CLAUDE.md | 3 | sequence | sonnet |
| n6-review | code-reviewer | n3-plugin-portability, n4-classifier-decouple | — | 1 | sequence | opus |
| n7-finalize | finalize | n5-docs-discoverability, n6-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

**Bundle shape.** Five #530-audit follow-ups, each surgical (scripts / generated opencode output / tests / docs). The critical ordering is **#534 → #532** (operator mandate): #534 finalizes the generated `.opencode/command/*.md` output, and #532 asserts content-reachability *against that same generated output* — running them concurrently or out-of-order makes #532 assert stale targets. #535 also shares `scripts/test-opencode-edition.js` with #532, so it is sequenced after n2. #536 and #533 are file-disjoint from the #534/#532/#535 chain (and from each other), so they form a parallel ready frontier with n1. Every write-bearing antichain pair is exact-file disjoint (verified), so the plan needs no `write_overlap_policy` override.

**Issue → node map.**
- **n1 = #534** (P1/P2/P3 rewrite of leaked Claude constructs). Edit the generator `transformCommandBody` + `OPENCODE_BADGE_BLOCK` in `scripts/sync-opencode-edition.js`, then `--write` to regenerate the committed `.opencode/command/*.md`. Three defects: (P1, medium) scoped `Agent(` → `task` dispatch-literal rewrite — a CAREFUL, SCOPE-NARROW regex that rewrites the dispatch-card `Agent(...)` invocation and NEVER touches prose mentions of the word "agent"; (P2, low-medium) `Claude Code agent` → opencode-neutral prose rewrite (~16× across commands); (P3, low) rename the `## Agent Model Badge` heading inside `OPENCODE_BADGE_BLOCK` (sync-opencode-edition.js:172) to `## Effort Variant Resolution` (the block body is already opencode-correct; only the heading is a Claude relic). Write set = the generator + the regenerated command tree. `implementer` with `non_tdd_reason`: the dedicated content-reachability regression suite is issue #532 (node n2), deliberately sequenced AFTER n1 by the operator's ordering constraint, so n1 cannot be TDD-driven by n2's tests; n1 self-verifies by regenerating and grep-confirming the three constructs are gone/renamed in the committed output.
- **n2 = #532** (content-reachability assertions per D-530-01 (existing)). Add ~15–20 PRESENCE assertions to `scripts/test-opencode-edition.js` for the PIN/literal wiring tokens on the 6 generated commands (adapt, plan-run, auto, fast, finalize, phase1) — e.g. `<!-- PIN: closure-audit -->`, `result: escalate`, `--write-overlap-consent`, `--speculative-consent`, `fast_compliance_unresolved`, `path_requires_explicit_opt_in`, `frontier unit`. NOT joining the forge T-sets (D-530-01 (existing) rejected Candidate A; opencode is non-forge). `implementer` with `non_tdd_reason`: deliverable is a characterization/lock-in suite for wiring tokens that already exist post-n1 — the assertions are GREEN on arrival (they lock correct behavior in), not RED-first behavioral tests.
- **n3 = #535** (plugin portability + dispatch-log agent_id). (R1, low) thread opencode `sessionID`/`callID` into the dispatch-log payload `agent_id` in `.opencode/plugins/kaola-workflow-hooks.js` (today hardcoded `agent_id: ""` at :137). (R2, low-medium) resolved via the **guard-A11** path (NOT the committed-`.opencode/package.json` path): `.opencode/package.json` is ignored by the *nested* `.opencode/.gitignore:2`, and per the issue "production runs under Bun (auto-detects ESM) so it is not a runtime defect, but the test is Node-version-fragile" — the only real problem is Node-20 / pre-22.12 `detect-module` test fragility in A11, so make A11's `node --check` robust to the Node version rather than committing new ESM-infra (cheapest sufficient mechanism; decouples n3 from #534's generator and avoids a `.gitignore` + new-tracked-file churn). (S1, low) add a structural smoke assertion in `scripts/test-opencode-edition.js` that the zhipu config uses the `reasoningEffort` option key with the `max` variant (extends the existing A12 zhipu assertion), confirming the variant is honored by config-shape (a live provider call is non-hermetic). `implementer` with `non_tdd_reason`: mix of payload wiring (R1 is non-blocking data degradation — attestation keys on agent_type+cwd), a test-robustness guard (R2), and a structural config-shape assertion (S1).
- **n4 = #536** (decouple test-claim-hardening from `$HOME` config). `kaola-workflow-classifier.js:693` bypasses the classifier whenever `config.parallel_mode !== 'auto'` (read from `$HOME/.config/kaola-workflow/config.json`), so a contributor with a non-`auto` global config sees `npm run test:kaola-workflow:claude` FAIL at `test-claim-hardening.js` (~10 failures, "parallel_mode=on; bypassing classifier"). Note `test-claim-hardening.js` already has a `#531` hermetic-HOME sandbox pinning `parallel_mode:'auto'` for the parent process — the remaining gap is the spawned-classifier config read / a test-overridable bypass hook; RED = reproduce under a hostile parallel_mode, GREEN = fix the bypass in `classifier.js` so the claude chain's 103 assertions pass regardless of contributor global config. `tdd-guide`. Optional R3 cosmetic fold-in (~/.claude/ path in a non-Claude runtime) may ride along in the same files.
- **n5 = #533** (docs discoverability). README `### Choose an edition` (line 206) → add the opencode edition entry; link `docs/opencode-edition.md` from the `docs/README.md` index; one-line opencode note in `CLAUDE.md` Documentation Map (optionally Validation Policy per D-530-02 (existing), clarifying opencode is additive). Respect the CLAUDE.md 200-line cap (currently 121 lines). `doc-updater`; all writes are `.md` → not code-producing → no G1. Zero runtime risk.
- **n6 = code-reviewer** (G1 convergence gate, opus). Single convergence reviewer post-dominating every code-producing node (n1, n2, n3 via n3; n4) — reviews the full bundle diff against the per-issue acceptance criteria. Per the model-tier guidance, the one opus node is the gate over sonnet implementers. n5 (docs-only) bypasses it straight to finalize (no G1 needed).
- **n7 = finalize** (unique sink). Writes only `CHANGELOG.md` (docs/state). Records the all_or_nothing bundle closure.

**Disjointness.** Write-bearing antichain pairs are all exact-file disjoint: {n1: generator+commands} vs {n4: classifier+test-claim} vs {n5: README+docs/README+CLAUDE}; n2/n3 are ordered under n1 (n1→n2→n3) so their shared `scripts/test-opencode-edition.js` is a serialized, non-concurrent overlap (transitive reachability skips them in the antichain check). No `write_overlap_policy` override required (default `off` is satisfied).

**Decision records.** D-530-01 (existing) and D-530-02 (existing) are referenced above for context only; NO decision record is hardcoded in any write set, and no node creates one. The finalize sink writes only `CHANGELOG.md`.

**Edition scope.** This bundle is opencode-edition-local and forge-NEUTRAL repo work: it touches no forge-port mirror, no cross-edition aggregator, and no `plugins/kaola-workflow-{gitlab,gitea}/` tree, so the four-chain (#307) cross-edition gate does not engage. Verification is the claude chain (`npm run test:kaola-workflow:claude`, incl. `test-opencode-edition.js` + `test-claim-hardening.js`) plus `node scripts/simulate-workflow-walkthrough.js`; CI/CD is not a gate (#501).

## Node Ledger

| id | status |
| --- | --- |
| n1-rewrite-constructs | pending |
| n2-content-reachability | pending |
| n3-plugin-portability | pending |
| n4-classifier-decouple | pending |
| n5-docs-discoverability | pending |
| n6-review | pending |
| n7-finalize | pending |
