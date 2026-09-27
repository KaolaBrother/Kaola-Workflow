# Documentation docking — issue #1109

Candidate: `97727b678ed6e0794383da84214cb806fff1a86b` (branch `workflow/issue-1109`, rebased on 531cc3ee)

## Changed behavior

`install-codex-agent-profiles.js` `mergeHooks()` now replaces each `kaola-workflow:` hook entry in
place by `id`, appends only a managed entry that is new, and still drops a managed entry the
template no longer carries; entries without an `id` and foreign entries keep their index. An
unchanged reinstall leaves `~/.codex/hooks.json` byte-identical and reports `unchanged`. The CLI,
flags, exit codes and report-line formats are unchanged; `config.toml` `hooks.state` handling is
unchanged.

## AGENTS.md documentation checklist

| Surface | Checked | Action |
|---|---|---|
| `README.md` | `grep -c "hooks.json" README.md` = 0 | No impact: README does not describe the hooks.json merge. |
| `docs/api.md` | `install-codex-agent-profiles.js` row (:2056) | No impact: the row says the installer installs the global compact hook and describes the #1108 backup; it does not describe entry order or the merge. |
| `docs/installation.md` | Codex installer paragraph (:104) | FIXED: a reinstall updates each `kaola-workflow:` entry where it stands, appends only a new one, keeps every other entry's index (only removing a retired managed entry shifts later ones), because Codex records hook trust by position; an unchanged reinstall reports `unchanged` and is byte-identical. Read together with the #1108 backup paragraph that follows it: no contradiction (an unchanged reinstall writes nothing, so no backup is made). |
| `CHANGELOG.md` | top of file | FIXED: #1109 entry under the single `## [Unreleased]` / `### Fixed`, shared with #1107 and #1108 (`grep -c "^## \[Unreleased\]"` = 1). |
| Architecture / ADR docs | no design change | No impact: merge-internal ordering fix; no ADR covers hooks.json merge order. |
| Public-interface comments | `mergeHooks` header comment | Updated: R3 wording and a #1109 note on position-keyed trust. |
| `docs/README.md` index | no new page | No impact. |

## Verdict

DOCKED
