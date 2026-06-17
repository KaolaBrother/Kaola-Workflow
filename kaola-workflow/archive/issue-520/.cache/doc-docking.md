# Documentation Docking — issue-520

## Changed files reviewed (git diff)
- scripts/kaola-workflow-sink-merge.js (canonical) — archive_commit `:(exclude)` pathspecs
- plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js (codex twin, byte-identical)
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js (gitlab port)
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js (gitea port)
- scripts/simulate-workflow-walkthrough.js (claude chain test home — tracked-status assertion)
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js (#520 test block)
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js (#520 test block)
- CHANGELOG.md ([Unreleased] entry, finalize node write)

## Documents checked
- CHANGELOG.md — entry added under [Unreleased]. ✓
- README.md — no change (no install / feature / env-var / usage impact).
- docs/api.md — no change (no public API / schema / event contract change; archive_commit is internal sink choreography).
- docs/architecture.md — no change (no structural change; same archive_commit step, narrower pathspec).
- docs/conventions.md — no change.
- .env.example — no change (no new env var).
- Inline comments — the fix's intent is documented inline in each edition (#520 comment).

## Gaps found and fixed
- None. CHANGELOG is the only doc class with impact; entry added.

## No-impact reasons for skipped document classes
- README / api / architecture / conventions / .env.example: this is an internal behavior fix to the sink transaction's staging pathspec (excludes two disposable crash-resume journals from the archive commit). No public interface, schema, setup step, env var, or architectural structure changed.

## Final verdict: DOCKED
