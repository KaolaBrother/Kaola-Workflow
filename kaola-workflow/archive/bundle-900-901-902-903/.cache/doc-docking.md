# Documentation docking — bundle-900-901-902-903

## Verdict: DOCKED

## Changed files reviewed

44 files. Unique production surface is 6 canonical files (+1361 / −91); the remaining production files
are edition copies whose convergence was separately measured byte-for-byte. Tests are +6250 / −8 across
eight suites from five authors. Docs and prose: `README.md`, `docs/api.md`, `docs/conventions.md`,
`CHANGELOG.md`, `CLAUDE.md`, two `templates/routing/` authoring surfaces and 12 rendered surfaces.

## Documents checked

`README.md` · `docs/api.md` · `docs/architecture.md` · `docs/conventions.md` · `CHANGELOG.md` ·
`CLAUDE.md` · `templates/routing/{finalize.skeleton.md,slots.js}` · the 6 tracked rendered surfaces ·
the 6 dot-dir edition surfaces · the four issue statements (#900, #901, #902, #903) · the issue comments,
including the two second-reproduction comments added mid-run.

## Public behaviour → where it is documented

- **`record` subcommand** (#900) → `docs/api.md:447-469`, all 14 consumer surfaces, `README.md:958`,
  `CHANGELOG.md [Unreleased] ### Added`.
- **The required `validated_candidate_hash` field** → all 14 surfaces (was 0/14), and now *enforced* by
  `validate-workflow-contracts.js` so a future surface cannot silently omit it.
- **Sink durability + three new fields** (#901) → `docs/api.md`, changelog `### Fixed`.
- **`pending_mirror` + the `authority` block** (#902) → `docs/api.md:219-222`; skeleton `:349` wording
  corrected. The five-field diagnostic block was deliberately **not** added to agent-facing surfaces —
  the observed failure was a false obligation in `reasons`, and nothing demanded a diagnostic block in a
  prompt surface.
- **Scoped closure audit** (#903) → `docs/api.md:856-859`, `slots.js:126` → 12 invocation sites,
  changelog `### Added`. `current_project_clean` documented as **fail-closed**.
- **Edition parity restored** → `docs/api.md:990` ("GitLab ships … with the same contract and JSON
  shape") **was false before this bundle and is true now**; the code was changed to match the
  documentation rather than the reverse.

## Gaps found and fixed during docking

1. `docs/api.md:211` understated the sync as worktree→main only — now typed in **both** directions.
2. `docs/api.md:957` and the skeleton understated the scoped verdict — `project_unresolved` now stated.
3. The consumer recipe omitted where the record lands on a worktree run — sentence added, propagated to 12 surfaces.
4. `docs/api.md:971` was vague about the required set — now names `workflow-state.md` as the only unconditionally required artifact.

## Explicit no-impact reasons

- `docs/architecture.md` — unchanged; see `doc-updater.md`. Its consumer-validation description remains
  accurate and no structure changed.
- `.env.example` — not present in this repository; no environment surface changed.
- `kaola-workflow/ROADMAP.md` — generated from `.roadmap/issue-*.md`; closure owns it, and it is never hand-edited.

## Untraceable structured sections

None. Every flag set, output key and exit-code table was measured from live `--json`/`--help` output.
