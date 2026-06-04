# version-codex node evidence — issue-242

## Before / After

| File | Before | After |
|------|--------|-------|
| plugins/kaola-workflow/.codex-plugin/plugin.json | `"version": "1.14.0"` | `"version": "2.0.0"` |
| plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json | `"version": "1.14.0"` | `"version": "2.0.0"` |
| plugins/kaola-workflow-gitea/.codex-plugin/plugin.json | `"version": "1.14.0"` | `"version": "2.0.0"` |

## JSON-parse gate results

| File | Exit code |
|------|-----------|
| plugins/kaola-workflow/.codex-plugin/plugin.json | 0 |
| plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json | 0 |
| plugins/kaola-workflow-gitea/.codex-plugin/plugin.json | 0 |

All three files parse as valid JSON with `"version": "2.0.0"`.
