# Documentation docking — bundle-1090 (#1090)

Candidate: `workflow/bundle-1090` @ `bd0d11ba` (implementation `83358a74` + evidence `bd0d11ba`).
Checklist: AGENTS.md § Documentation.

| file | outcome |
|---|---|
| `CHANGELOG.md` | fixed on branch: `[Unreleased]` › `### Changed` › "Codex subagent binding moves to Luna 6 (#1090)" |
| `README.md` | no impact: states no Codex model binding (`grep -niE "luna\|gpt-\|model_reasoning_effort" README.md` returns 0 hits) |
| `docs/api.md` | fixed on branch (3 × `gpt-6-luna`, 0 × `gpt-5.6-luna`) |
| `docs/architecture.md` | fixed on branch (1 / 0) |
| `docs/README.md` | fixed on branch (1 / 0) |
| `docs/conventions.md` | fixed on branch (1 / 0) |
| `docs/runtime-capabilities.md` | fixed on branch (1 / 0) |
| `docs/opencode-edition.md` | fixed on branch (1 / 0) |
| `docs/decisions/0021-…`, `0025-…` | current-binding claims fixed on branch (2 / 0; 3 / 0) |
| `docs/decisions/0019-…` | current-binding claim fixed; one historical matrix row keeps `gpt-5.6-luna` (Host ruling: immutable history) |
| `docs/decisions/D-687-01.md` | current-binding claim fixed; the superseded #1010 contract line keeps `gpt-5.6-luna` (Host ruling) |
| public-interface comments | `CODEX_PINNED_MODEL` / preflight / validator messages carry `gpt-6-luna` (see the branch diff) |
| examples | no executable example names the Codex pin |

Remaining `gpt-5.6-luna` on live surfaces: the 5 Host-ruled historical lines (3 released CHANGELOG
entries, the ADR 0019 matrix, the D-687-01 contract) and nothing else.

DOCKED
