# Architect Blueprint: issue-177

## Design Decisions

- **Tag-scope is rootVersion-only.** The validator enforces a single invariant ("the version package.json claims must be tagged"). Historical headings out of scope for #177.
- **Use raw `.git/refs` + `.git/packed-refs` reads, not `git` shell-out.** Pure Node script with no `child_process` import; two on-disk locations cover every real-world state.
- **Two-tier skip (offline + missing `.git`).** `KAOLA_WORKFLOW_OFFLINE=1` for air-gapped CI; missing `.git/` for tarball installs. Both no-op silently.
- **Use `assert()` not soft process.exitCode.** Matches the existing CHANGELOG check idiom immediately above (lines 320-323) which uses `assert()`.
- **Ordering: local tags before validator change.** Creating tags first means `npm test` passes on first run after the code change.
- **No git fetch, no `--tags` push.** Honors the README single-tag-by-name push rule (lines 433–440).

## Files to Create

None.

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/validate-workflow-contracts.js` | Insert tag-existence assertion block after line 323 (existing blank line 324). Skips when KAOLA_WORKFLOW_OFFLINE=1 or .git absent. |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Byte-identical mirror of same insertion. |

## Exact Code Block to Insert (at line 324)

```js
if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git')) {
  const tagName = 'kaola-workflow--v' + rootVersion;
  const looseRef = '.git/refs/tags/' + tagName;
  const packedRefsPath = '.git/packed-refs';
  const tagPresent =
    exists(looseRef) ||
    (exists(packedRefsPath) && read(packedRefsPath).split('\n').some(
      line => line.endsWith(' refs/tags/' + tagName)
    ));
  assert(
    tagPresent,
    'Git tag "' + tagName + '" must exist for package.json version (' + rootVersion +
      '). Create it locally with: git tag ' + tagName + ' <release-commit-sha>'
  );
}
```

## Git Operations (Shell Commands, Not Code Changes)

**Step 1 — SHA verification gate:**
```bash
git log --format='%H %s' -1 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0 | grep -q 'chore(release): 3.15.0'
git log --format='%H %s' -1 5e8084b438bf084f7efc5ad59412821c8c69204b | grep -q 'chore(release): 3.16.0'
git merge-base --is-ancestor 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0 HEAD
git merge-base --is-ancestor 5e8084b438bf084f7efc5ad59412821c8c69204b HEAD
```

**Step 2 — Create local lightweight tags:**
```bash
git tag kaola-workflow--v3.15.0 1313aaf837e67d6a1bc1a0ea65eb5d504cd7a6b0
git tag kaola-workflow--v3.16.0 5e8084b438bf084f7efc5ad59412821c8c69204b
```

**Step 6 — Push tags (after npm test is green):**
```bash
git push origin kaola-workflow--v3.15.0
git push origin kaola-workflow--v3.16.0
```

## Build Sequence

1. SHA verification gate (git log + merge-base checks)
2. Create local tags (prerequisite for npm test to pass)
3. Edit `scripts/validate-workflow-contracts.js` (insert code block at line 324)
4. Mirror to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (byte-identical)
5. npm test (validates sync + new tag assertion against local tags)
6. Push tags (git push by name, one at a time)
7. Open PR (references issue #177, lists tags published with SHAs)

## Validation Command

```bash
npm test
```

Exercises both: `validate-script-sync.js` (mirror byte-identical) + `validate-workflow-contracts.js` (new tag assertion).

## Out of Scope

- No auto-push from validator
- No git fetch --tags from validator
- No GitLab/Gitea tags
- No metadata revert
- No test file changes (walkthrough picks up new assertion automatically)
- No new helpers — reuses read, exists, assert, rootVersion already in scope
