# Phase 1 - Research / Discovery: issue-62

## Deliverable

Eliminate the main-worktree live folder duplicate that survives Phase 6
finalize + sink-merge in `KAOLA_WORKTREE_NATIVE=1` mode. After `cmdFinalize`
archives the linked-worktree copy and the feature branch merges into main,
the main repo must contain only `kaola-workflow/archive/{project}/` — never
both `archive/{project}/` AND a live `kaola-workflow/{project}/`.

## Why

The duplicate poisons classifier and startup routing for future sessions
(see #62 body and #51 Finding 1). It also accumulates as long-lived
untracked clutter in the main repo across every workflow cycle.

## Affected Area

- `scripts/kaola-workflow-claim.js` — `archiveProjectDir` (414), `cmdFinalize` (436), `cmdRelease` (455)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical mirror (validator-enforced)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — same bug shape, no `mainRootFromCoord` helper yet (line 373)
- `scripts/simulate-workflow-walkthrough.js` — regression assertion target
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — mirror
- `commands/kaola-workflow-phase6.md` — documentation of the cwd mechanism
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — mirror

## Key Patterns Found

1. **`mainRootFromCoord` helper** at `scripts/kaola-workflow-claim.js:58` — already maps `coordRoot` (`.git`-or-common-dir) → `mainRoot` parent. The cleanup path will reuse this.
2. **`getCoordRoot`** at `scripts/kaola-workflow-claim.js:42-56` — resolves `git --git-common-dir`; safe entry point to find the shared `.git` from any worktree cwd.
3. **`archiveProjectDir`** at `scripts/kaola-workflow-claim.js:414-433` — the rename's atomic unit. Called from 3 sites: `cmdFinalize`, `cmdRelease`, sink-fallback (`scripts/kaola-workflow-claim.js:587, 591` — verify).
4. **`projectDir(root, project)`** — standard `path.join(root, 'kaola-workflow', project)` used everywhere.
5. **No existing main-worktree cleanup pattern** — searched for `rm`-of-`kaola-workflow/`, no match. This is genuinely new behavior.

## Test Patterns

- Framework: hand-rolled `assert.strictEqual` in `scripts/simulate-workflow-walkthrough.js`.
- Location: each test is a `function testFoo() {...}` near the top, registered in the bottom `function main()`.
- Structure: setup with `tmpdir()` + `seedFakeRepo()`, invoke `claim.js` subcommand via `execFileSync`, assert filesystem state with `fs.existsSync` and content reads.
- Existing finalize-related tests: `testStartupJsonAndSiblingWorktrees`, `testClassifierCurrentClaimMarkerBlocks`, `finalize should remove legacy lease blocks before archive`.

## Config & Env

- `KAOLA_WORKTREE_NATIVE` env var — when `=1`, linked worktree at `<repo>.kw/{project}`; when unset/0, main repo IS the worktree.
- No other config flags touched.

## External Docs

None needed — internal Node `fs` and existing helpers cover everything.

## GitHub Issue

`KaolaBrother/Kaola-Workflow#62` — reopened 2026-05-18 with regression
trace and original Part A fix proposal.

## Completeness Score

10/10

- Goal clarity: 3 (issue body + reopen comment are explicit)
- Expected outcome: 3 (concrete file states after finalize+merge)
- Scope boundaries: 2 (only `KAOLA_WORKTREE_NATIVE=1` + merge sink; PR sink and existing code unrelated to archive untouched)
- Constraints: 2 (verify-then-delete, no-op when main root == linked root, byte-identical plugin mirror)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | skipped | issue body + direct inspection of `scripts/kaola-workflow-claim.js` lines 58, 414-433, 436-447, 455-465 | Issue body has more mechanism detail than a code-explorer pass would produce; remaining gap was only verifying current line numbers, which the main session resolved by reading the file directly |
| docs-lookup | N/A | no external library or framework docs needed | All work uses internal Node `fs` and existing helpers |

## Notes / Future Considerations

- Stash `stale-pre-issue-62-cleanup-2026-05-18` holds 42 modified files unrelated to #62 (user confirmed #92 was already finished). After #62 lands, the stash can be dropped without recovery.
- The advisor flagged Phase 2 discriminator: cleanup belongs in `archiveProjectDir` (atomic with rename, also benefits `cmdRelease/discard`) rather than `cmdFinalize` only. Phase 2 will evaluate explicitly.
