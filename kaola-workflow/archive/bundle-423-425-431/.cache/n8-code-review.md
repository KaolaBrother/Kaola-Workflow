evidence-binding: n8-code-review cee13a147854
verdict: pass
findings_blocking: 0

# G1 code-reviewer gate — adaptive bundle-423-425-431 (n8, post-dominates n1-n7)

## Test evidence (all green)
- node scripts/simulate-workflow-walkthrough.js => exit 0; includes testAdaptiveLedgerHeaderInvalid425 PASSED, testAdaptiveGeneratedPortSplit431 PASSED, testHarnessSelfCheck PASSED
- node scripts/test-bash-block-guards.js => exit 0; 17 assertions (incl. new no-plan scenario D #423)
- npm run test:kaola-workflow:claude => exit 0
- npm run test:kaola-workflow:codex => exit 0 (Kaola-Workflow walkthrough simulation passed)
- npm run test:kaola-workflow:gitlab => exit 0 (GitLab + GitLab Codex walkthrough passed)
- npm run test:kaola-workflow:gitea => exit 0 (Gitea + Gitea Codex walkthrough passed)
- node scripts/edition-sync.js --check => exit 0 (12 forge aggregator ports in rename-normalized parity)
- codex byte-identity: scripts/kaola-workflow-plan-validator.js == plugins/kaola-workflow/scripts/... (IDENTICAL); adaptive-node IDENTICAL

## Correctness (verified behaviorally, not by inspection alone)
- #425 ledger_header_invalid: plan with `| node | status |` header => result:refuse naming ledger_header_invalid; `--freeze --repair` => result:in-grammar, frozen:true, header_normalized:true, on-disk header rewritten to `| id | status |`. Order is sound: reconcileLedger() normalizes header into toFreeze, then freezePlan() re-validates the NORMALIZED content so the wall does not re-fire. Freeze-only (revalidateForResume untouched) so legacy in-flight plans never brick.
- #431 generated_port_split: canonical+codex-only node => refuse naming generated_port_split; all-4-editions node => in-grammar. Sibling paths built via editionSync.forgeRel + a local codexRel that exactly matches edition-sync.js; dual-gated (editionSync require-able AND scripts/edition-sync.js exists under opts.root) so forge/codex/user installs are graceful no-ops (zero false positives). opts.root flows from findRepoRoot(planPath) in main().
- #425 adaptive-node diagnostic: purely additive `diagnostic` field on spliceLedgerNode/runOpenNext refusal; the refusal reason node_not_in_ledger is unchanged. No behavior regression.
- #423 contractor guard: `[ -f "$PLAN_PATH" ]` presence check skips ledger-compare and emits `ledger_compare_skipped: no_plan` when the plan is absent (full/fast-path). Correct fix for the #423 red fixture.

## Edge cases examined (no defect)
- Cross-node canonical/port split and forge-port-only node both pass the freeze-wall (it is canonical-anchored, same-node-scoped). These are caught DOWNSTREAM by the per-node barrier (write_set_overflow) and the gitlab/gitea `edition-sync --check` chains. This is the documented intended composition (workflow-plan.md "Aggregator coupling" lines 75-76: split = write_set_overflow-by-construction). The freeze-wall is the authoring-time early catch for the same-node-incomplete case; it composes with the barrier, it does not replace it.

## Parity
- All 4 plan-validator editions carry the new logic (12 token matches each); plan-validator + adaptive-node codex copies byte-identical to canonical; edition-sync --check confirms forge ports.
- adaptive-node diagnostic present in gitlab + gitea ports (3 markers each).
- contractor: executable Step-8a bash block lives only in agents/contractor.md (canonical); the 3 contractor.toml mirrors carry the prose method (ledger_compare_skipped: no_plan) — correct md(bash)/toml(prose) boundary, not a gap.
- Prose propagation (#400): plan-run prose on all 4 surfaces (command + 3 SKILL packs, 5 matches each); planner rules on md + 3 tomls.
- Forge walkthroughs correctly assert the INVERSE for #431 (wall intentionally inert in forge tree => zero-false-positive anchor contract) and the SAME for #425 (no edition-sync dependency => fires in all editions).

## Scope and security
- No scope creep: all 25 changed files map to #423/#425/#431; no unrelated tokens in the diff.
- Sensitive-data sweep CLEAN: no credentials/secrets/keys in the 1814-line diff.

## Findings
(none)

verdict: pass
findings_blocking: 0
