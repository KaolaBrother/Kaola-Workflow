# Documentation Docking — issue-524

## Changed files reviewed (git show --stat HEAD = 02345094)
- `agents/issue-scout.md` — priority-first ranking prose (root/github edition)
- `plugins/kaola-workflow/agents/issue-scout.toml` — mirror (codex)
- `plugins/kaola-workflow-gitlab/agents/issue-scout.toml` — mirror (forge-neutral)
- `plugins/kaola-workflow-gitea/agents/issue-scout.toml` — mirror (forge-neutral)
- `CHANGELOG.md` — `## [Unreleased]` → `### Fixed` entry for #524
- `docs/decisions/D-524-01.md` — new ADR

Pure agent-instruction prose; **no code path** changed (validator/script counts untouched).

## Documents checked vs change
| Doc class | Impact | Disposition |
|-----------|--------|-------------|
| `CHANGELOG.md` | yes | Updated — `### Fixed` entry under `[Unreleased]`, references #524, names the 3-tier model + frontier-blocked rule + `priority_basis`, notes pure-prose + 4-edition gate (#307). |
| `docs/decisions/D-524-01.md` | yes | New ADR — Context (cohesion-only mis-rank, vrpai-cli #82/#652 over #488/#502/#561), Decision (priority>cohesion>actionability, explicit-frontier-blocked, `priority_basis`, scout-only locus), Alternatives, Consequences. |
| `README.md` | no | Describes `issue-scout` at the **role level** only (read-only, advisory, "recommends same-scope sets", "reads forge issues / local roadmap / active folders"). The priority-first change refines internal ranking reasoning; the documented role/contract is unchanged and "reads the local roadmap" already subsumes reading its priority signals. No contradiction. |
| `docs/architecture.md` | no | Documents the scout's role + the `backlog_empty`/`goal_progress` output payloads + advisory-only constraints — not the full `scope/confidence/rationale/risks` schema and not the ranking criteria. Adding the `priority_basis` field does not contradict the documented payloads; the scout stays read-only/advisory. |
| `docs/api.md` | no | Only references the scout re `KAOLA_BUNDLE_MAX_ISSUES` cap (unchanged). |
| `docs/conventions.md` | no | Names the scout file as part of the cross-edition bundle-lane surface (the 4-chain rule still applies — satisfied via the finalize gate). No ranking-criteria description to update. |
| `.env.example` | no | No new environment variables introduced. |
| API / schema / migration | no | None — internal agent-reasoning prose. |
| Inline comments | n/a | Markdown/TOML agent prose, no code interfaces. |

## Gaps found and fixed
None. The two impacted doc classes (CHANGELOG, ADR) were authored by node n4-docs and verified by the n3-review gate (`verdict: pass`, `findings_blocking: 0`).

## Final verdict
DOCKED
