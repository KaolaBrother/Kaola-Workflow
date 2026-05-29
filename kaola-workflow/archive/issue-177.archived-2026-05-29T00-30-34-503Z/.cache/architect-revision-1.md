# Architect Revision 1: issue-177

## Change From Original
Replace direct `.git/refs/tags/...` + `.git/packed-refs` reads with `git rev-parse --verify` shell-out for worktree compatibility.

## Revised Code Block (insert at line 324)

```js
if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git')) {
  const tagName = 'kaola-workflow--v' + rootVersion;
  let tagPresent = false;
  try {
    const { execFileSync } = require('child_process');
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/tags/' + tagName],
      { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    tagPresent = true;
  } catch (_) {
    tagPresent = false;
  }
  assert(
    tagPresent,
    'Git tag "' + tagName + '" must exist for package.json version (' + rootVersion +
      '). Create it locally with: git tag ' + tagName + ' <release-commit-sha>'
  );
}
```

NOTE: The raw architect output used `'v' + rootVersion` for tagName, which is incorrect.
The established convention in this repo is `kaola-workflow--v{X.Y.Z}` (verified from
.git/refs/tags/ contents: kaola-workflow--v3.12.0, kaola-workflow--v3.13.0, kaola-workflow--v3.14.0).
The corrected tagName above is `'kaola-workflow--v' + rootVersion`.

## Updated Write Set (Validator Task)
1. `scripts/validate-workflow-contracts.js` — insert revised block at line 324
2. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical mirror
3. `scripts/simulate-workflow-walkthrough.js` — two new test assertions:
   - Offline-skip: contracts script exits 0 with KAOLA_WORKFLOW_OFFLINE=1 even without tag
   - Missing-tag: contracts script exits non-zero with expected error message substring

## Additional Docs Changes (from revision)
- `CHANGELOG.md` — [Unreleased] entry for the new tag-existence contract check
- `docs/conventions.md` — one-line note that `git tag kaola-workflow--v<version>` is now contract-enforced unless KAOLA_WORKFLOW_OFFLINE=1
