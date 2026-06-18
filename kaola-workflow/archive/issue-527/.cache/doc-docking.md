# Documentation Docking — issue-527

## Changed files reviewed (impl commit da3b59fb)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — orient `--summary` smoke-test spawn redirected to a `$TMPDIR` cwd + `finally` cleanup (gitlab edition)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — mirror twin (gitea edition)
- `CHANGELOG.md` — `## [Unreleased]` → `### Fixed` entry for #527

Test-hygiene fix only; **no production code path** changed (the shared `orient` source is untouched; no validator/script counts touched). No decision record warranted (trivial test-local scratch-redirect, no architecture/value call).

## Documents checked vs change
| Doc class | Impact | Disposition |
|-----------|--------|-------------|
| `CHANGELOG.md` | yes | Updated — `### Fixed` entry under `[Unreleased]`, references #527, names the `$TMPDIR`-cwd + finally-cleanup fix, the preserved #446 `--summary` sentinel, the rejected direction (c), and the 4-edition gate (#307). |
| `README.md` | no | Does not document the gitlab/gitea edition test internals or the `orient` smoke-test fixtures. No contradiction. |
| `docs/architecture.md` | no | Describes `orient` at the role/data-flow level (read-only re-check); the documented read-only contract is unchanged — the fix makes the TEST stop relying on the cwd side-effect, it does not change `orient`'s behavior. No update needed. |
| `docs/api.md` | no | No API/schema/event/CLI contract change. |
| `docs/conventions.md` | no | The cross-edition 4-chain rule (#307) still applies and is satisfied via the finalize gate; no convention text to change. |
| `.env.example` | no | No new environment variables. |
| API / schema / migration | no | None — test-fixture-local change. |
| Inline comments | yes | A `#527` inline comment was added at each redirected spawn explaining the read-only-orient scratch redirect (inside the two test files). |

## Gaps found and fixed
None. The only impacted doc class (CHANGELOG) was authored at the n4-finalize node and the code change was verified by the n2-review gate (`verdict: pass`, `findings_blocking: 0`) and the n3-fourchain main-session gate (4 chains green + no scratch leak).

## Final verdict
DOCKED
