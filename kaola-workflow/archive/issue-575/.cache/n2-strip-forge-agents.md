evidence-binding: n2-strip-forge-agents a6e3e4b8cf7b
# n2-strip-forge-agents — evidence

Stripped design-rationale provenance from the forge-edition agent `.toml` profiles (4 roles × 3 editions = 12 files). No rule meaning changed; the three editions remain byte-identical.

## Changed files (12; verified by `git status` = exactly the declared set)
contractor.toml (6 refs), implementer.toml (2), tdd-guide.toml (2), workflow-planner.toml (40) — each across plugins/kaola-workflow{,-gitlab,-gitea}/agents/.

## Byte-identical confirmation
For all 4 roles: `diff codex==gitlab` EMPTY and `diff codex==gitea` EMPTY. Mirrors stay byte-identical.

## Representative clause-rewrites (meaning preserved)
- `Hard boundary (issue #44, #255 — never dispatch...)` → `Hard boundary (never dispatch...)`.
- `(the #291 defect pattern)` clause removed; `write_set_overflow`-by-construction rule kept.
- `#306 symbol-grep` → `the cross-edition symbol-grep` (descriptive, not provenance).
- Scheduler-default posture: dropped `D-419-01` ×2 + `#542/D-542-01`; `KAOLA_PARALLEL_WRITES=0` functional content kept.
- `validator-derived ([INV-17])` → `validator-derived`.

## Residual grep (`#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|\[INV-[0-9]+\]|ADR-[0-9]+`)
Zero across all 12 files. Note: `D-<issue>-NN` template placeholders (literal `<issue>`, not digits) and bare `INV-17` (no brackets) correctly do not match and were left as-is.

## TOML / functional tokens
TOML intact (name + developer_instructions triple-quote delimiters verified). Preserved: KAOLA_PARALLEL_WRITES, FANOUT_CAP=4, LOOP_CAP=5, parallelWritesDefaultOn, target_set_mismatch, target_set_indeterminate, write_set_granularity, main-session-gate, validation_command, simulate-kaola-workflow-walkthrough.js.

verdict: pass
