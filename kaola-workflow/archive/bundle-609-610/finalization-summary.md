# Finalization - Summary: bundle-609-610

## Delivered
- #609 — B2 Claude-model-noun purge from non-Claude runtimes: codex TOML profiles + adapt/plan-run SKILL packs ×3 trees rewritten in tier/effort vocabulary; opencode generator root-cause fix (rewriteClaudeModelNouns in renderAgent + transformCommandBody, S2 guard narrowed to a body-wide case-sensitive sweep); six workflow-init surfaces gain the runtime-neutral-vocabulary constraint; negative B2 assertions in all four contract validators + route-reachability lockstep.
- #610 — runtime-neutral plan tier tokens: NODE_MODEL_TIERS {reasoning, standard} with legacy opus/sonnet aliases via normalizeTier; alias-aware TIER_RANK/dispatchEffort/mapTier/dispatchEffortOpencode; new dispatchModelClaude + additive runtime-native model_display envelope field; validator/next-action/resolve-agent-model normalize; prose on the routing/planner surfaces authors neutral tokens with one per-edition mapping sentence; enforcement pins updated; ADR D-610-01 supersedes the portable-vocabulary ruling; docs/opencode-edition.md + api.md + architecture.md docked. Back-compat: frozen plans keep bytes, hash unchanged, efforts byte-identical — adversarially verified NOT-REFUTED.

## Files Changed
7 commits over abb6a941: 2 leg commits + kw-synth merge (000976cb) + n4 schema commit (171351d7) + n5 prose commit + n7 docs commit (7c50737b) + n9 CHANGELOG commit (5abd1692). ~50 files.

## Test Coverage
Hand-rolled assert suites. test-adaptive-node 1362; test-next-action 116; test-adaptive-handoff 122; route-reachability 260; agent-profile-parity 27; opencode 499; walkthrough full incl. #610 legacy-alias fixture.

## Final Validation Evidence
- n8 gate: four chains green over 7c50737b (claude 838s / codex 18s / gitlab 222s / gitea 225s, timed_out false ×4) + opencode 499 + holistic AC review (12/12 MET) — .cache/n8-final-review.md.
- Binding receipt: four chains RE-RUN over HEAD 5abd1692 after the n9 CHANGELOG commit (chain-asserted doc → prior receipt superseded); receipt at .cache/chain-receipt.json, verified fresh + HEAD-bound + all green before the contractor was dispatched.
- Validation reuse boundary: the n8 review covers code/test impact through 7c50737b; the only later change is the CHANGELOG entry (docs-only), re-bound by the fresh receipt run.
- Adaptive barriers at finalize: recorded below after execution (resume/gate/barrier/verdict must all be 0).

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
None blocking. Noise-level notes for the post-completion audit: n8 R1 (opencode planner mirror carries a lowercase Claude-labeled mapping sentence — accepted by D-610-01), n8 R2 / n6 R1 (model_invalid message text mentions aliases — cosmetic), n5's out-of-set note (test-opencode-edition.js stale comments describing the old vocabulary — comments only, suite green).

## Run gaps
(sweep clean — sweptClasses [], --check pass)

## Closure Decision
None needed — no deferred items, no partial implementation, no user-decision items. Both issues' ACs verified MET by n8 (12/12). Bundle closure all_or_nothing: #609 + #610.

## Commit And Push
Pending final Git gate (contractor Step 8 + sink-merge --sink; final hash reported after push).

## GitHub Issue
#609, #610 — to be closed by the bundle sink (--issue 609 --issue-numbers 609,610).

## Roadmap
Regenerated at closure by cmdFinalize (no .roadmap sources existed for #609/#610 — filed post-v6.19.0; closure unlink no-op expected).

## Archive
Pending — kaola-workflow/archive/bundle-609-610/ via cmdFinalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | subagent-invoked (n7-docs plan node) | .cache/n7-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | pending cmdFinalize | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean except workflow band; upstream origin | final gate runs after this file is committed |

## Status
ARCHIVED AFTER FINAL GIT GATE
