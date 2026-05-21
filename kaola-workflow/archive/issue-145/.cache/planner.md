# Planner Output — issue-145

## Files to Touch
1. `README.md` — fix stale version strings in release versioning table (lines 378-380)
2. `scripts/validate-workflow-contracts.js` — add drift-guard assertion

## Exact Changes

### README.md (lines 378-380)
Old:
```
- Claude Code command install, GitHub edition: `3.10.0`
- Claude Code command install, GitLab edition: `3.10.0`
- Claude Code command install, Gitea edition: `3.10.0`
```
New:
```
- Claude Code command install, GitHub edition: `3.12.0`
- Claude Code command install, GitLab edition: `3.12.0`
- Claude Code command install, Gitea edition: `3.12.0`
```
Lines 381-383 (Codex manifests `1.5.0`) — verified accurate, do not touch.

### scripts/validate-workflow-contracts.js
Insert after line 229 (after packageJson.files assertions, reusing existing `packageJson`, `assertIncludes`, `read`, `assert` helpers):
```js
const rootVersion = packageJson.version;
for (const edition of ['GitHub', 'GitLab', 'Gitea']) {
  assertIncludes(
    'README.md',
    'Claude Code command install, ' + edition + ' edition: `' + rootVersion + '`'
  );
}
for (const forge of ['gitlab', 'gitea']) {
  const manifest = JSON.parse(read('plugins/kaola-workflow-' + forge + '/.claude-plugin/plugin.json'));
  assert(
    manifest.version === rootVersion,
    'plugins/kaola-workflow-' + forge + '/.claude-plugin/plugin.json version (' +
      manifest.version + ') must match package.json version (' + rootVersion + ')'
  );
}
```

## Acceptance Check Commands
1. `node scripts/validate-workflow-contracts.js`
2. `node scripts/simulate-workflow-walkthrough.js`

## Out of Scope
- README lines 381-383 (Codex manifest `1.5.0`) — accurate
- `.codex-plugin/plugin.json` files — accurate
- `package.json` version — already `3.12.0`
- `.claude-plugin/plugin.json` files — already `3.12.0`, only guarded not edited
- `CHANGELOG.md` — doc/state-sync fix, no entry needed (small-fix path)
