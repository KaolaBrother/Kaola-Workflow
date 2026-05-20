# Code Explorer — issue-122

## GitHub Baseline: readConfig() Pattern

`scripts/kaola-workflow-sink-pr.js` lines 34-47:
```js
function readConfig() {
  const configPath = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');
  let raw = '{}';
  try { raw = fs.readFileSync(configPath, 'utf8'); } catch (_) {}
  let config;
  try { config = JSON.parse(raw); } catch (_) { config = {}; }
  if (typeof config !== 'object' || config === null) config = {};
  const defaults = { pr_auto_merge: false };
  return Object.assign({}, defaults, config);
}
```

Config consumed at lines 111 and 190-197:
```js
const config = readConfig();
// ... later ...
if (config.pr_auto_merge === true) {
  try {
    ghExec(['pr', 'merge', prUrl, '--auto', '--squash', '--delete-branch']);
  } catch (mergeErr) {
    process.stderr.write('Warning: pr auto-merge failed: ' + mergeErr.message + '\n');
  }
}
```
- Config path: `~/.config/kaola-workflow/config.json`
- Default: `{ pr_auto_merge: false }`
- Non-fatal: wrapped in try/catch

## Gitea Sink: kaola-gitea-workflow-sink-pr.js

**Accepted flags** (lines 41-46, parseArgs): `--auto-merge`, `--squash`, `--remove-source-branch` are parsed but never sent by dispatch.
**Config reading: NONE.**
**Auto-merge trigger path** (lines 191-199): `mergePullRequest()` called when `args.merge` is set with `autoMerge`, `squash`, `removeSourceBranch`.

## GitLab Sink: kaola-gitlab-workflow-sink-mr.js

Same gap. `--auto-merge`, `--squash`, `--remove-source-branch` parsed but never sent. No config read. Auto-merge via `mergeMergeRequest(mrIid, { autoMerge, squash, removeSourceBranch })` → `glab mr merge --auto-merge`.

## Phase 6 Dispatch (both plugins)

Gitea: `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md:576`:
```bash
node "$SINK_PR_JS" --branch "$SINK_BRANCH" $SINK_ISSUE_FLAG --project {project}
```
Only `--branch`, `--issue`, `--project` — NO auto-merge flags.

GitLab: `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md:577`: identical.

Both Codex skills (kaola-workflow-finalize/SKILL.md) also omit auto-merge flags.

## Forge Layer (no changes needed)

- `kaola-gitea-forge.js`: `mergePullRequest(project, prNumber, opts)` — accepts `autoMerge`, `squash`, `removeSourceBranch`; already wired
- `kaola-gitlab-forge.js`: `mergeMergeRequest(mrIid, opts)` — same; uses `glab mr merge --auto-merge`

## Test Files

- Gitea: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- GitLab: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- No existing tests for config-driven auto-merge. `withForge()` helper is the scaffold.

## Key Architecture Decision

**The fix belongs entirely in the two sink scripts.** The dispatch (phase6.md commands and skills) should NOT change — the GitHub model reads config internally. The `--auto-merge` CLI flag in the sink scripts is a dead code path that will remain dead.

Config keys:
- Gitea: `pr_auto_merge` (consistent with phase6.md docs and GitHub baseline)
- GitLab: `mr_auto_merge` (consistent with phase6.md docs)
