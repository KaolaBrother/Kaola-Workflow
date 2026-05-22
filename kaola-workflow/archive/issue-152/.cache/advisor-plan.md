# Advisor Gate — Phase 3 Plan: issue-152

## Verdict

Blueprint is sound. One blocker corrected via architect-revision-1.

## Blocker: Validator coverage only covered root files

Original TASK D asserted only the 3 root command files. Phase 2 committed to 15 assertions covering all 9 files (root + gitlab + gitea × phase4/5/6) because `validate-script-sync.js` does not cover plugin command file sync — the new assertions are the only enforcement net for missed forks.

Routed to architect-revision-1. Corrected TASK D uses a 9-file `routedFixFiles` array, producing 9×2 + 6×1 = 24 assertion calls.

## What's Strong

- Phase 4 correctly identified as one-block (not two) — tdd-guide already in Step 1.
- Anchor spans deliberately include the cache-path fence to avoid the phase6 `final-validation` vs `final-validation-fix-{n}` substring collision.
- Phase 5 prose wrap (`goes\nto:`) flagged correctly — different old_string from phase4/6.
- `test-install-model-rendering.js` assertions use full multi-line `subagent_type=…\n  model="sonnet",` pattern — stronger than bare `model="sonnet",`.
- Build sequence is dependency-safe: Wave 1 (A/B/C) edits command files → Wave 2 (D/E) adds assertions that check Wave 1's output.

## Non-blocking Notes

- `description="Routed fix: task {n}"` reads slightly off for Phase 6's final-validation context (no per-task numbering there), but it's template-shaped and matches convention. No churn.
- Render test only runs `--forge=github`. Plugin renders untested at install time, but source-text assertions in TASK D are the appropriate guard. Leave it.

## Build Sequence Assessment

Dependency-safe:
1. TASK A, B, C (parallel) — command file edits; no deps
2. TASK D, E (parallel) — scripts assert against Wave 1 content; must follow Wave 1
3. Validate — sequential

Could a developer implement this from the plan alone? Yes — exact old_string/new_string pairs provided, exact assertion code provided, exact insert location specified.
