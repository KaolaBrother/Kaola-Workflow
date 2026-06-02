## Documentation Docking — issue-219

### Changed code/config/test/workflow files reviewed
- `scripts/kaola-workflow-sink-merge.js` — added REMOTE_TIMEOUT_MS + ghExec timeout
- `scripts/kaola-workflow-sink-pr.js` — added REMOTE_TIMEOUT_MS + ghExec timeout
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — identical copy
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` — identical copy

### Documents checked
- `README.md` line 551 — KAOLA_GH_REMOTE_TIMEOUT_MS env var table: UPDATED to include "sink-merge/sink-pr gh calls". Traceable to the IIFE constant that reads `process.env.KAOLA_GH_REMOTE_TIMEOUT_MS` — verified by grep.
- `.env.example` — `KAOLA_GH_REMOTE_TIMEOUT_MS` already present (line 6). No change needed.
- `CHANGELOG.md` — no impact: internal robustness parity fix, no user-visible behavior change.
- `docs/api.md` — no impact: no API, schema, or contract change.
- `docs/architecture.md` — no impact: no structural change.
- Inline comments — no public interface changed.

### Gaps found and fixed
- README env-var table description was incomplete (did not mention sink operations). Fixed by doc-updater.

### Explicit no-impact reasons
- CHANGELOG: internal parity/robustness fix, no public behavior change, no release event.
- API docs: no API surface touched.
- Architecture docs: no structural change.
- .env.example: var already listed.

### Final verdict: DOCKED
