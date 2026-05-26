# Phase 4 - Progress: issue-168

## Tasks

### Task 1: GitHub canonical — closeIssue catch warning
- Status: complete
- File: `scripts/kaola-workflow-sink-merge.js`
- Change: line 239 `catch (_)` → `catch (e)` + `process.stderr.write(...)` warning; also added `forgeOpts = { cwd: mainRoot }` (CWD fix applied alongside warning)
- Validation: `node -c scripts/kaola-workflow-sink-merge.js` — OK

### Task 2: Plugin copy sync
- Status: complete
- File: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Change: `cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Validation: `node scripts/validate-script-sync.js` — OK (10 common scripts in sync); `diff -q` — byte-identical

### Task 3: GitLab edition — closeIssue catch warning
- Status: complete
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Change: line 269 `catch (_)` → `catch (e)` + warning with `glab issue close`; `forgeOpts = { execOptions: { cwd: mainRoot } }` applied
- Validation: `node -c` — OK

### Task 4: Gitea edition — closeIssue catch warning
- Status: complete
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Change: line 269 `catch (_)` → `catch (e)` + warning with `tea issues close`; `forgeOpts = { execOptions: { cwd: mainRoot } }` applied
- Validation: `node -c` — OK

### Task 5: Test — testSinkMergeCloseFailureWarning
- Status: complete
- File: `scripts/simulate-workflow-walkthrough.js`
- Change: added `testSinkMergeCloseFailureWarning()` function + registered in `main()` after `testSinkMergeMockabilityAndReceipt()`
- Validation: `node scripts/simulate-workflow-walkthrough.js` — `testSinkMergeCloseFailureWarning: PASSED`

## Additional Changes (contributed by parallel session)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`: CWD regression test added (`online close cwd regression test passed`)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`: CWD regression test added (`online close cwd regression test passed`)
- `CHANGELOG.md`: entry added under [Unreleased] ### Fixed (updated to include warning)

## Final Gate
- `npm test` — exit 0; all suites passed
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — passed
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — passed
