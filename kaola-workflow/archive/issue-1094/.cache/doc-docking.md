# Documentation docking — issue-1094 (#1094)

Candidate: `workflow/issue-1094` @ `edcca0f8` (the Host-accepted diff, sha256 prefix `e257a0826047f7a0`).
Checklist: AGENTS.md § Documentation.

| file | outcome |
|---|---|
| `CHANGELOG.md` | fixed on branch: `[Unreleased]` › `### Changed` › three #1094 entries (PR/MR sink closes the whole claimed set; one request-sink noun per forge claim; finalize/next prose) |
| `README.md` | fixed on branch: the delivery paragraph states both routes close every claimed issue once the change merges |
| `docs/api.md` | fixed on branch: PR sink `Usage` (`--issue-numbers A,B`) and `Closure` bullets; `KAOLA_SINK` noun normalization; Gitea sink exports `parseArgs` / `resolveMemberSet` / `closesBody` (same three on the GitHub and GitLab sinks) |
| `docs/architecture.md` | fixed on branch: PR sink flow names one `Closes #n` per member; selection names the per-forge noun normalization |
| `docs/README.md` | no impact: no document added, moved, or renamed |
| ADRs | no impact: no design record changes; the behavior matches the existing closure contract (#369 all-or-nothing, #336 keep-open merge-sink-only) |
| public-interface comments | `#1094` comments on `resolveMemberSet` (3 sinks) and `canonicalSink` (3 claims) state the behavior |
| routing surfaces | regenerated from `templates/routing/` (`generate-routing-surfaces --check`: 24 surfaces byte-match) |
| examples | no executable example invokes sink-pr / sink-mr or `--sink mr` |

No release: no version bump, tag, or publish; CHANGELOG stays under `[Unreleased]`.

DOCKED
