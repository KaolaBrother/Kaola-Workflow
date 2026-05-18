# Phase 3 - Advisor Gate (issue-62)

## Verdict

Blueprint is sound. Two gaps to address before finalizing.

## Gaps identified

### Gap 1: AC #5 (documentation) was missed

The reopened issue's AC includes:
> Document the mechanism in `commands/kaola-workflow-phase6.md` so future agents understand why the cwd matters.

Phase 1 listed it as affected; Phase 2 did not defer it; Phase 3 architect skipped it. Add Task 4.

Docking set (verified via `grep -l "cmdFinalize\|archiveProjectDir\|linked worktree" commands/*.md plugins/*/skills/*/SKILL.md docs/*.md`):

- `commands/kaola-workflow-phase6.md` (source of truth)
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (Codex mirror)
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` (GitLab mirror — gets the fix in Task 2, so needs the same doc note)

### Gap 2: try/catch scope is too wide

The architect's `try { ... } catch (_) {}` swallows `fs.rmSync` errors silently. `rmSync` with `force: true` already absorbs ENOENT, so a real throw means something is genuinely wrong — that should fail loudly. Narrow the catch to only the path-resolution layer:

```js
let mainRoot, linkedRoot;
try {
  mainRoot = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
  linkedRoot = fs.realpathSync(root);
} catch (_) { mainRoot = null; }
if (mainRoot && mainRoot !== linkedRoot) {
  const mainLive = path.join(mainRoot, 'kaola-workflow', project);
  if (fs.existsSync(mainLive)) fs.rmSync(mainLive, { recursive: true, force: true });
}
```

## Simulator mirror requirement

Verified via `npm test` script and `scripts/validate-script-sync.js`:

- `scripts/simulate-workflow-walkthrough.js` and `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` are **explicitly NOT byte-synced** (commented in validate-script-sync.js).
- The Codex simulator (68 lines) does not test finalize/archive today.
- The GitLab simulators are wrappers around `test-gitlab-*.js` files; none tests archive.
- Adding ONE comprehensive regression test in `scripts/simulate-workflow-walkthrough.js` is sufficient.
- GitLab regression test deferred to a follow-up (GitLab tests are not in default `npm test`, GitLab tree has no existing archive test pattern, and the fix is byte-identical to GitHub).

## Decision

Proceed with Phase 3 plan including Task 4 (docs across 3 files), narrowed try/catch scope, and explicit deferral of GitLab regression test.
