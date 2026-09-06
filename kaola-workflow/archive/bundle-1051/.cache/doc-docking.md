# Documentation docking for issue #1051

status: DOCKED
candidate: 715c9f92ebcd660e5c600e7bf1e1e66b278100c9

README.md, docs/architecture.md, docs/conventions.md, docs/runtime-capabilities.md, CHANGELOG `[Unreleased]`,
ADR 0022/0023 supersession notes, and docs/api.md match the compacted global contract at this HEAD:
daily governance remains in the machine-global source without Next/Finalize; four fields / three writes /
immutable results remain; compact recovery embeds the exact global contract once and reloads Next without
intake/claim; project instructions supplement verified local facts and constraints with scoped exceptions
that must not weaken higher-priority instructions or host safety; `priority_top_tier_labels` is the
existing config interface, not a new CLI. See doc-updater.md for checked paths.
