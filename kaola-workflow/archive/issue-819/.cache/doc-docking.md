# Documentation Docking — issue-819

verdict: DOCKED

## Changed files reviewed

All 16 files in `git diff 8d881aaf HEAD -- . ':!kaola-workflow'`: the four `adaptive-node` editions,
`scripts/test-adaptive-node.js`, the routing skeleton + `required-blocks.js` + the six rendered
plan-run surfaces, `docs/api.md`, `CHANGELOG.md`, `docs/decisions/D-819-01.md`.

## Documents checked against the project CLAUDE.md checklist

| Checklist item | Verdict | Basis |
| --- | --- | --- |
| `README.md` — feature list, usage, env vars | No impact | No new command, flag, env var, or install step. `substitute-role` already existed; this repairs its reachability. No new subcommand was added (the mechanism deliberately reused the existing one). |
| API docs — endpoint/behaviour descriptions | DOCKED | `docs/api.md` gained a `substitute-role` reason-code subsection covering all seven refusal codes including the two new ones, the three-way `classifyEvidenceBody` classification, the task-identity derivation, and the close-time asymmetry. `n6` additionally corrected two pre-existing stale `SPLIT_GUARDED_SUBCOMMANDS` catalogs (12 entries documented vs 16 shipped). |
| `CHANGELOG.md` — `[Unreleased]` entry | DOCKED | New `[Unreleased] / Fixed` entry. The previous `[Unreleased]` had been renamed at the v8.0.1 cut, so a fresh section was correct. |
| Architecture docs | No impact | No structural change. The repair is contained to `runSubstituteRole` and `codexTaskNameForNode` within one script (plus its three generated ports); no new module, layer, or data flow. |
| `.env.example` | No impact | No new environment variables. |
| Inline comments | DOCKED | `n4` documented the comment-tolerance clause (why the regex is anchored at both ends) and the `CAPABILITY_GAP_MARKERS` rationale, including why the close-time vocabulary deliberately excludes the marker. |
| Decision record | DOCKED | `docs/decisions/D-819-01.md` (198 lines) records the mechanism chosen, the alternative rejected, reset ownership, the task-identity derivation and its byte-identity constraint, and an explicit statement of what P5 still guarantees vs no longer guarantees. It also records the honest history: the originally-stated rationale was measured false mid-run. |
| Agent-facing routing prose | DOCKED | The `role-capability-coverage` PIN region and the task-identity rule were updated in `templates/routing/plan-run.skeleton.md` and rendered to all six surfaces. Provenance deliberately excluded from these surfaces per the project rule; four pinned tokens added to `required-blocks.js` so prose and pin land together. |

## Gaps found and fixed

- Two pre-existing stale subcommand catalogs in `docs/api.md` (found by `n1`, fixed by `n6`,
  re-measured by `n7` against the shipped `SPLIT_GUARDED_SUBCOMMANDS`).

## Gaps found and NOT fixed (filed)

- Role count understated as "15 roles" where the manifest has 18 entries — `CHANGELOG.md` and
  `D-819-01.md`. Filed as #823. Deliberately not corrected at the sink: both files had already been
  certified by `n7`/`n8`, and editing certified content during finalization is a worse practice
  than carrying a documented understatement.
- `docs/api.md` `worktree_authority_split` roster names `record-evidence --stdin` where the code
  exempts only `--verify`. Pre-existing, untouched by this diff. Filed as #823.

## Anti-fabrication

No structured API/schema/CLI section was authored from description. `n6` verified every refusal
code, constant, and function name against `git diff HEAD -- scripts/kaola-workflow-adaptive-node.js`
directly, and `n7` independently re-measured the corrected catalogs against the shipped code.
