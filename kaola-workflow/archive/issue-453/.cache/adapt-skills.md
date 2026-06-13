evidence-binding: adapt-skills c90740bee444

doc-updater node: rescoped the FILE_CEILING cap lines in the 3 kaola-workflow-adapt Codex SKILL packs (github-codex + gitlab + gitea) to the #453 semantic-grouping rubric. The FILE_CEILING region (the caps list + the "splits into sequenced same-role nodes" guidance) was byte-identical across all three packs, so the same verbatim edit was applied to each.

Change (identical in all 3 SKILL.md):
- Removed `FILE_CEILING` (**6** paths …) from the caps list after LOOP_CAP; added "There is no per-node file-count ceiling (#453) — keep a cohesive write set in ONE node even when large (root-level + dot-leading paths count as real writes)".
- Replaced "a lane needing more than FILE_CEILING files splits into sequenced same-role nodes (each ≤ ceiling …)" with "semantically-coupled cross-edition mirrors and generated-aggregator siblings stay in ONE node (they move atomically), and a fan-out splits only genuinely-independent disjoint work — never a directory grant".
- Preserved the exact-path rule, the #381 directory refusal, and the #404 bare-directory warning unchanged.

Verification (all exit 0):
- FILE_CEILING count after change: 0 in all 3 SKILL packs (ALL CLEAN).
- node scripts/test-route-reachability.js → "Route-reachability test passed (50 assertions)." exit 0 (the #400 six-surface routing contract still green).
- gitlab/gitea --forbidden-only on each changed SKILL → passed exit 0 (no forge-specific tokens introduced).

write_set: plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md
