# Phase 6 — Final Validation: issue-250

All commands run against the final candidate state (after the docs node + CHANGELOG entry). Exit codes captured directly via `$?` (never piped tail).

## Adaptive script-enforced barrier (all 4 gates blocking)
| Gate | Exit | Result |
|------|------|--------|
| `plan-validator --resume-check` | 0 | ok; plan_hash ca3f0a58 (re-frozen after plan repair) |
| `plan-validator --gate-verify` | 0 | ok; unsatisfied:[] (review post-dominates all implement nodes — G1 satisfied) |
| `plan-validator --barrier-check` | 0 | pass; sensitiveHits:[]; outOfAllow:[] (all production writes in the declared union) |
| `plan-validator --verdict-check` | 0 | ok; checked:["review"]; verdict pass / findings_blocking 0 |

## Full suite
| Command | Exit |
|---------|------|
| `npm test` (claude + codex + gitlab + gitea) | 0 |

npm test detail: validate-script-sync (14 common + 5 byte-identical groups), validate-vendored-agents (13 agents), resolver/install-rendering/upgrade tests, validate-workflow-contracts, simulate-workflow-walkthrough (incl. new implementer in-grammar+G1 assertions), test-next-action, test-commit-node, test-adaptive-handoff, test-release-surface-drift, test-fast-audit; codex + gitlab + gitea contract validators + walkthroughs (count 12→13 confirmed). All PASSED.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

Result: ALL PASS. No routed fixes required at Phase 6.
