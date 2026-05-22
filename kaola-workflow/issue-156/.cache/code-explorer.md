# Code Explorer — issue-156

## Exploration: Release Tagging Process (Issue #156)

### Entry Points

- **Manual only:** Release process is a 4-line bash block at `README.md` lines 426-431. No CI/CD files exist (no `.github/workflows/`, no `.gitlab-ci.yml`).
- `npm test` is the gate before tagging; tag creation and push are manual `git` commands.

### Execution Flow (current documented process)

1. Developer bumps `package.json#version`
2. Developer updates `plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json` and `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json` to match
3. Developer updates README.md "Release versioning" section (3 rows for GitHub/GitLab/Gitea Claude editions)
4. Developer updates `CHANGELOG.md` with a dated `[X.Y.Z]` entry
5. `npm test` — runs all four forge suites; `scripts/validate-workflow-contracts.js` checks README rows and `.claude-plugin/plugin.json` against `package.json`
6. `git diff --check`
7. `git tag kaola-workflow-v<X.Y.Z>` (documented format — single dash in README, but WRONG — see below)
8. `git push origin main --tags`

For 3.13.0, steps 7 and 8 were not executed.

### CRITICAL: Tag Naming Convention

**README line 429 documents** single-dash: `kaola-workflow-v<X.Y.Z>`
**Actual tags on origin and local** use double-dash: `kaola-workflow--v{version}`

Local git tags confirm actual convention:
```
kaola-workflow-gitlab--v3.8.0
kaola-workflow-gitlab--v3.8.1
kaola-workflow--v3.4.0
kaola-workflow--v3.8.0
kaola-workflow--v3.8.1
kaola-workflow--v3.12.0
```

**Canonical format is double-dash:** `kaola-workflow--v{version}` for GitHub/main edition.
**GitLab edition has separate tags:** `kaola-workflow-gitlab--v{version}` — these DO exist.
**Gitea edition has NO separate tags** (confirmed by `git tag -l 'kaola-workflow-gitea*'` returning empty).

README checklist must be updated to reflect double-dash format.

### Architecture: Version Sync Surface

**Root/Claude stream (validated by `scripts/validate-workflow-contracts.js` lines 263-281):**
| Location | Current value | Drift-guarded? |
|----------|---------------|----------------|
| `package.json#version` | 3.13.0 | canonical |
| `plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json#version` | 3.13.0 | yes |
| `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json#version` | 3.13.0 | yes |
| README.md — GitHub edition row | 3.13.0 | yes |
| README.md — GitLab edition row | 3.13.0 | yes |
| README.md — Gitea edition row | 3.13.0 | yes |
| `CHANGELOG.md` — `[3.13.0]` entry | present | **NO** |
| git tag on origin | missing 3.13.0 | **NO** |

**What `validate-workflow-contracts.js` does NOT check:**
- `CHANGELOG.md` has a `[X.Y.Z]` header matching `package.json#version`
- git tag matching `package.json#version` exists locally or on origin

### Script Sync Rule (Critical)

`scripts/validate-script-sync.js` enforces byte-identical copies between `scripts/` and `plugins/kaola-workflow/scripts/`. Any change to `scripts/validate-workflow-contracts.js` **MUST** be copied to `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` or `npm test` will fail.

### Key Files

| File | Role |
|------|------|
| `README.md` lines 424-431 | Only release checklist / process docs (has single-dash typo) |
| `package.json` | Canonical root version source |
| `scripts/validate-workflow-contracts.js` lines 263-281 | Existing version drift guard |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | Byte-identical vendored copy |
| `CHANGELOG.md` | Release history; `[3.13.0]` entry present |
| `scripts/simulate-workflow-walkthrough.js` | End-to-end test runner |

### New CHANGELOG Drift Guard Pattern

To add to `scripts/validate-workflow-contracts.js` (and mirror to `plugins/kaola-workflow/`):

```js
// Check CHANGELOG.md has a [X.Y.Z] header matching package.json version
const changelogVersion = rootVersion.replace(/\./g, '\\.');
assert(
  new RegExp(`^## \\[${changelogVersion}\\]`, 'm').test(read('CHANGELOG.md')),
  'CHANGELOG.md must have a [' + rootVersion + '] entry matching package.json version'
);
```

### Live Tag Check

A live `git tag --list` check for the release version should NOT be added to `npm test` due to the `KAOLA_WORKFLOW_OFFLINE=1` convention. Tag existence check belongs in the README release checklist or a separate release-gate script.

### Commits Since kaola-workflow--v3.12.0

```
b654850 fix(#155): fail closed when remote issue validation is unavailable outside offline mode
4ebd1b4 docs: document model badge visibility behaviour by session model
fc1219b fix(#154): apply inherit-rewrite on install upgrade, not just fresh install
7f34394 fix(#153): inherit-decouple installed agent frontmatter so every subagent dispatch renders a model badge
d22e60c fix(#152): add explicit model badges for routed-fix agents in Phase 4/5/6 command files
... (and more)
```
