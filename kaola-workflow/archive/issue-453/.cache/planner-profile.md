evidence-binding: planner-profile 64367cf3ceb8

doc-updater node: rescoped the per-node FILE_CEILING guidance in the workflow-planner profile (.md canonical + 3 byte-identical .toml mirrors) to the #453 semantic-grouping rubric, preserving the cross-edition-cohesion intent while removing every file-count-ceiling framing. Mechanical prose rescoping applied inline by the orchestrator against verbatim source (no fabrication — the .toml is a single 5000-char line where a drift-prone subagent edit was the higher risk).

Edits (agents/workflow-planner.md):
1. Removed the "FILE_CEILING = 6 paths per node" cap sentence; kept the exact-path rule and folded "(root-level and dot-leading paths count as real writes for G1 classification)" into it. Replaced the "When a lane needs more than FILE_CEILING files, SPLIT into sequenced same-role nodes / do not raise the ceiling" guidance with: no per-node file-count ceiling (#453); keep a cohesive write set in ONE node even when large; cross-edition mirrors + generated-aggregator siblings move atomically; fan out only for genuinely-independent disjoint work; the other walls still bind (exact-path shapes, concurrent-sibling disjointness, generated_port_split, barrier actual-write refusal).
2. #309 clause: "spans N editions and fits under FILE_CEILING → ONE node; when the ceiling forces a split…" → "spans N editions → ONE node (no file-count ceiling forces a split, #453); if you split a genuinely-independent lane, give every member a shared canonical spec…".
3. #447/#448 clause: "FILE_CEILING interaction: …exceed one node's six-file ceiling, so split…" → "Test-node grouping: keep …as a cohesive test-update set in a dedicated test node …(no file-count ceiling forces this split, #453 — but the cohesion still recommends it)".

The 3 plugin .toml mirrors (plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/agents/workflow-planner.toml): applied the same 4 logical rescopings to the codex .toml, then copied it to the gitlab/gitea twins to preserve byte-identity.

Verification (all exit 0):
- FILE_CEILING count after change: .md=0, all 3 .toml=0 (fully removed).
- 3 .toml byte-identical: md5 868103affa4dc2ee324fd9534a9a613b (all three).
- node scripts/test-agent-profile-parity.js → "agent-profile parity tests passed (9 assertions)" exit 0.
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only <changed toml> → passed exit 0.
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only <changed toml> → passed exit 0.

write_set: agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml
