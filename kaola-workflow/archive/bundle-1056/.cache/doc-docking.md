# Documentation docking — bundle-1056 (candidate ac307a25)

| file | checked | result |
|---|---|---|
| `CHANGELOG.md` | `[Unreleased]` › `### Fixed`: per-call env contract for `defaultBranch`, the hand-port re-export from their own kernel copy, the timeout env now honoured by gitlab/gitea (default unchanged), the regression suite (40 assertions, 10 RED pre-fix) | fixed |
| `docs/api.md` | claim export paragraph: three-stage probe + contract (env read per call, clamp 1..600000 default 30000, ports re-export from their byte-identical copy); Timeouts entry widened to the two git probes in all three editions | fixed |
| `docs/architecture.md` | ownership paragraph from #1055 still accurate (kernel owns `defaultBranch`, claim re-exports) | no impact |
| `README.md`, `docs/README.md` | do not enumerate the function or the suite | no impact |
| ADR | no design change | no impact |
| public-interface comments | `adaptive-schema.js` contract comment above `offlineNow`/`remoteTimeoutMsNow` and on `defaultBranch`; one-line delegation comment in each hand-port | fixed |
| archived #1055 records | `kaola-workflow/archive/bundle-1055/corrections.md` appended; NULs replaced; #1055 comment posted | fixed |

DOCKED
