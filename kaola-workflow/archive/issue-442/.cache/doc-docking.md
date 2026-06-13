# Documentation Docking — issue-442

## Changed code/config/test files reviewed
- `scripts/kaola-workflow-release.js` (new aggregator)
- `scripts/test-release.js` (new test suite)
- `plugins/kaola-workflow/scripts/kaola-workflow-release.js` (codex byte-mirror)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js` (forge ports)
- `scripts/validate-script-sync.js` (registration: COMMON_SCRIPTS + rename-normalized family)
- `package.json` (claude test chain wiring)

## Documents checked / updated
- `docs/decisions/D-442-01.md` — NEW decision record (n1): the settled `--verify`/`--cut`/`--push` envelope, registration-surface verdict, forge-neutrality, crash-resume.
- `docs/conventions.md` — NEW `### Release cutting (kaola-workflow-release.js)` subsection under `## Release` (n6 + orchestrator accuracy fix: non-monotonic measured vs the last release tag, not package.json).
- `README.md` — `## Release versioning`: kaola-workflow-release.js paragraph (n6).
- `docs/README.md` — decision index: D-442-01 entry (n6).
- `CHANGELOG.md` — `[Unreleased] ### Added`: #442 entry (finalize node).

## Gaps found and fixed
- doc-updater's conventions line stated non-monotonic is measured vs `package.json`; the real guard compares vs the last `kaola-workflow--v*` tag. Orchestrator corrected the clause (within n6's declared write set). No other drift.

## No-impact reasons for skipped document classes
- `docs/api.md` — no new external API/schema surface beyond the CLI flags documented in conventions/README; the typed-refusal vocabulary is described in conventions.
- `docs/architecture.md` — no structural/data-flow change (a maintainer release tool, not a workflow-runtime component).
- `.env.example` — no new environment variables consumed at runtime (KAOLA_RELEASE_ROOT/KAOLA_RELEASE_DATE are test-injection knobs documented inline).

## Anti-fabrication check
doc-updater read `docs/decisions/D-442-01.md` + `scripts/kaola-workflow-release.js` in full and transcribed real flags/refusal reasons/step keys; orchestrator verified the monotonic-comparison clause against the code (line 376 `lastTagVersion`).

## Verdict
DOCKED
