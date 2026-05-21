# Code Explorer Output — issue-147

## Summary

GitLab and Gitea `archiveProjectDir` functions lack the roadmap cleanup block present in GitHub's. When a MR/PR is merged the watcher calls `archiveProjectDir(..., 'closed')` but neither plugin deletes `.roadmap/issue-N.md` nor regenerates `ROADMAP.md`.

---

## 1. GitHub Reference (scripts/kaola-workflow-claim.js)

- Module-level require at line 15: `const roadmapModule = require('./kaola-workflow-roadmap');`
- `archiveProjectDir` lines 429–468:
  - Extracts `archiveIssueNumber` via `parseInt(field(content, 'issue_number'), 10)` (line 437) inside the state-read try block, before the rename.
  - After the `mainLive` cleanup block and before `return`, guarded by `if (statusValue === 'closed')` (line 459):
    ```js
    if (statusValue === 'closed') {
      try {
        if (Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
          const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
          try { fs.unlinkSync(roadmapFilePath); }
          catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        roadmapModule.regenerateRoadmap(root);
      } catch (_) { /* non-fatal */ }
    }
    ```

## 2. GitLab Claim Script (plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js)

- `archiveProjectDir` at lines 393–421: no `archiveIssueNumber` extraction, no roadmap cleanup
- Watcher calls `archiveProjectDir(root, folder.project, 'closed')` at line 538 on MR merge
- `field` is imported from `./kaola-gitlab-workflow-active-folders` at line 15

## 3. Gitea Claim Script (plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js)

- `archiveProjectDir` at lines 378–406: identical gap
- Watcher calls `archiveProjectDir(root, folder.project, 'closed')` at line 523 on PR merge
- `field` is imported from `./kaola-gitea-workflow-active-folders` at line 15

## 4. Roadmap Modules

- `scripts/kaola-workflow-roadmap.js` exports `regenerateRoadmap` (line 342)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` at line 308 exports:
  `buildRoadmapContent, createFileExclusive, guardAgainstMissingRoadmapSource, readRoadmapIssues, refreshFromGitLab, writeFileAtomicReplace, writeIssueRecord`
  — does NOT export `regenerateRoadmap`. Has `roadmapDir`, `roadmapFile`, `readRoadmapIssues`, `buildRoadmapContent`, `guardAgainstMissingRoadmapSource`, `writeFileAtomicReplace` internally.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` at line 308: same structure, no `regenerateRoadmap` export.

**Plan**: add `regenerateRoadmap(root)` function to both GitLab and Gitea roadmap modules (mirroring GitHub's lines 188–197), then export it, then require it in each claim script.

## 5. Test Files

GitLab test (`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` lines 389–404):
- Plants `mr-project` state, calls `watchMergeRequests`, asserts archive folder exists
- Missing: no `.roadmap/issue-44.md` planted, no assertion it is deleted after merge

Gitea test (`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` lines 401–417):
- Same pattern, same gap

GitHub walkthrough (`scripts/simulate-workflow-walkthrough.js` lines 1605–1677):
- `testFinalizeCleansRoadmapEntry`: plants `.roadmap/issue-N.md`, generates ROADMAP.md, finalizes, asserts roadmap file gone and ROADMAP.md no longer lists issue

## 6. Implementation Plan

Files to change (4 total):

| File | Change |
|------|--------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | Add + export `regenerateRoadmap(root)` (3 lines) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | Add + export `regenerateRoadmap(root)` (3 lines) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add require + `archiveIssueNumber` extraction + cleanup block |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Add require + `archiveIssueNumber` extraction + cleanup block |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Plant `.roadmap/issue-44.md` + assert deletion |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Plant `.roadmap/issue-44.md` + assert deletion |

Total: 6 files (all closely related; 2 roadmap modules + 2 claim scripts + 2 test files)
