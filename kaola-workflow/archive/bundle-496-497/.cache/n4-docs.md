evidence-binding: n4-docs d8bdc3f853b4

## Files updated

1. `CHANGELOG.md` — added `## [Unreleased]` section above `## [6.3.0]` with two `### Fixed`
   bullets (#496 `assertWorktreeClean` fail-closed, #497 `push_main`/`closure` refuse envelope)
   and one `### Changed` bullet (D-497-01 closure-audit x6 surface wiring with T6 pin).

2. `docs/api.md` — added "sink_incomplete refuse envelope (issue #497)" subsection immediately
   before the "`sink:pr` deferral" paragraph within the existing `### sink-merge closure receipt`
   section. Documents both `step:"push_main"` and `step:"closure"` envelopes with real JSON shapes
   grounded against actual emit in `scripts/kaola-workflow-sink-merge.js` (lines 1033-1040,
   1118-1124). Also documents `assertWorktreeClean` / #496 as a thrown Error (not a JSON envelope).

3. `docs/decisions/D-497-01.md` — new ADR authored. Decision: WIRE `closure-audit.js` into all
   six finalize-route surfaces (3 Claude commands + 3 Codex SKILLs) as defense-in-depth complement
   to the #497 inline emit fix; machine-pinned by T6 assertion in `test-route-reachability.js`.

## Verification

- `npm run test:kaola-workflow:claude` ran green (exit 0) after writing all three files.
- All 6 surfaces confirmed to carry `<!-- PIN: closure-audit -->` before writing the ADR
  (verified by grep against live files in the worktree).
- T6 assertion in `scripts/test-route-reachability.js` (lines ~173-194) confirmed to reference
  the exact 6 surfaces and use fail-closed `assert()`, not an advisory warn-gate.
- API fields in `docs/api.md` grounded against `scripts/kaola-workflow-sink-merge.js` emit
  (no fabricated fields; #496 documented as thrown Error, not JSON reason code).
