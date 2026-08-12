# impl-961 — delete scripts/fixtures-orphan-legality.js

**Task**: issue #961 — remove the 102-line shared anti-drift fixture whose two importers are already
gone, plus the now-stale exclusion-comment line in both byte-paired install-manifest copies, plus a
`CHANGELOG.md` `[Unreleased]` entry.

**Tree**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-956-957-958-959-960-961-962/`
on branch `workflow/bundle-956-957-958-959-960-961-962` (confirmed by `git rev-parse --abbrev-ref HEAD`).

**Verification tier**: `build-green`. This is an inert deletion — no behaviour changes and no test
exists that could go red (both custodian tests were deleted with their mechanisms in `1fc33c9d` and
`c0b48043`). Per the dispatch, no suite or chain was run: the tree is transiently inconsistent while
other agents edit `scripts/test-parallel.js`, `docs/architecture.md` and `docs/conventions.md`, so a
suite run now would carry no signal. Suite verification is the orchestrator's.

## Files changed

| file | change |
|---|---|
| `scripts/fixtures-orphan-legality.js` | **deleted** (`git rm`, 102 lines, staged as `D`) |
| `scripts/kaola-workflow-install-manifest.js` | 1 line removed (line 55, exclusion comment) |
| `plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js` | same 1 line, byte-identical edit |
| `CHANGELOG.md` | new `### Removed` under `## [Unreleased]` |

Nothing else touched. `git status --short`:

```
 M CHANGELOG.md
 M docs/architecture.md              <- other agent, not mine
 M docs/conventions.md               <- other agent, not mine
 M plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
D  scripts/fixtures-orphan-legality.js
 M scripts/kaola-workflow-install-manifest.js
 M scripts/test-parallel.js          <- other agent, not mine
```

## Byte pairing — before and after

`shasum -a 256`, both copies:

| | `scripts/…install-manifest.js` | `plugins/kaola-workflow/scripts/…install-manifest.js` | equal |
|---|---|---|---|
| before | `2a8224efacd193a3a86d0f4a24905b88c059769fd4a5d04fc8c6f28ebd2aa619` | `2a8224efacd193a3a86d0f4a24905b88c059769fd4a5d04fc8c6f28ebd2aa619` | yes |
| after | `df56e45bdeaa080d6aa02382fc55034f008b7c24f7159ac65aeaddb2d803c81d` | `df56e45bdeaa080d6aa02382fc55034f008b7c24f7159ac65aeaddb2d803c81d` | yes |

They were equal before the edit, so no STOP condition was triggered. `diff` between the two copies
after the edit exits 0. Independently, `git diff` shows both files moving `9487424d → 8b404589` —
the same pre- and post-image blob ids, which is byte identity at the object level, not just at the
hash of the working copy.

Removed line, identical in both (was line 55 in each, verified before cutting):

```
//   kaola-workflow-fixtures-orphan-legality.js — CI-only fixture validator
```

## CHANGELOG entry

Added as a new `### Removed` section under `## [Unreleased]` (the section did not exist; `[Unreleased]`
itself already did, carrying #953 under `Added` and #954 under `Changed`). Placed after `### Changed`
and before `## [9.6.0] - 2026-08-11`, per Keep-a-Changelog ordering. Exactly one `### Removed` heading
exists under `[Unreleased]` after the edit (checked for a concurrent duplicate).

```markdown
### Removed

- **`scripts/fixtures-orphan-legality.js`, a 102-line shared fixture whose consumers are all gone —
  #961.** Both importers were deleted with their mechanisms (`test-parallel-batch.js` in `1fc33c9d`,
  `test-adaptive-node.js` in `c0b48043`), leaving all eight exports unreferenced by live code; the
  now-stale install-manifest exclusion comment goes with it in both byte-paired copies.
```

## Verification commands

| command | exit | result |
|---|---|---|
| `git rev-parse --abbrev-ref HEAD` | 0 | `workflow/bundle-956-957-958-959-960-961-962` |
| `shasum -a 256` on both manifest copies (before) | 0 | equal, `2a8224ef…` |
| `git rm scripts/fixtures-orphan-legality.js` | 0 | `rm 'scripts/fixtures-orphan-legality.js'` |
| `shasum -a 256` on both manifest copies (after) | 0 | equal, `df56e45b…` |
| `diff` between the two manifest copies | 0 | identical |
| `node --check` on both manifest copies | 0 | syntax OK |
| `git grep -n 'fixtures-orphan-legality\|ORPHAN_LEGALITY_\|TOPUP_INCOMPLETE_' -- scripts/ plugins/` | 1 | **zero hits** |
| `git grep -ln` same pattern, repo-wide | 0 | 17 files, all history/prose (below) |
| `node -e` require both copies, compare `supportScripts(forge)` | 0 | 17/19/19 github/gitlab/gitea, identical between copies, fixture absent from all |

Repo-wide survivors, all deliberately left per the dispatch: `CHANGELOG.md` (history lines + my new
entry), `docs/audits/2026-08-11-subtraction-audit.md`, `kaola-workflow/.roadmap/issue-961.md`,
`kaola-workflow/ROADMAP.md`, and 13 files under `kaola-workflow/archive/**` (issue-293,
bundle-414-418-422, bundle-952-953-954-955). No `scripts/`, `plugins/`, test, docs/api, docs/architecture
or `package.json` reference remains.

## Before / after

- **Before**: fixture present and tracked (102 lines); both manifest copies sha256-equal at `2a8224ef…`
  and carrying the exclusion comment; no `### Removed` under `[Unreleased]`. No suite run (see tier).
- **After**: fixture deleted and staged; both manifest copies sha256-equal at `df56e45b…`, both parse
  under `node --check`, both emit byte-identical per-forge support sets (17/19/19) with the fixture
  absent from every one; `### Removed` entry present. No suite run (see tier).

## Contradictions to the premise

None. Every fact in `premise-961.md` reproduced:

- 102 lines, tracked, exactly one tracked copy — `find` for `kaola-workflow-install-manifest.js`
  returned exactly the two paired copies and no gitlab/gitea plugin sibling, matching the premise's
  ×1 multiplier reasoning for the fixture.
- Both manifest copies were sha256-equal *before* the edit, at the exact digest the premise recorded
  (`2a8224ef…`), and the stale line was at line 55 in each.
- The fixture was absent from `SUPPORT_SCRIPTS`: the post-deletion emission check shows it in none of
  the three forge sets, so the install manifest — and therefore the opencode/kimi FA9 manifest-exactness
  assertions — never saw it.
- No test was created, deleted, repaired or touched. No file outside the four listed above was modified.

One observation worth recording, not a contradiction: the removed comment named the file under a
`kaola-workflow-` prefix it never had. The line was cut rather than corrected, exactly as dispatched.
