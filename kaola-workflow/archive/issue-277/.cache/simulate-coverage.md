# simulate-coverage node evidence

## Node
id: simulate-coverage
issue: #277

## RED (mutation fail — TDD genuineness)

File mutated: `scripts/simulate-workflow-walkthrough.js`
Change: replaced `/^run_posture: (worktree|in-place)$/m` with `/^run_posture: (BOGUS_VALUE)$/m`

Output:
```
Error: M4 (#277): state must contain run_posture: worktree or in-place
    at assert (.../scripts/simulate-workflow-walkthrough.js:23:25)
    at testClaimStatusRelease (.../scripts/simulate-workflow-walkthrough.js:89:3)
    at main (.../scripts/simulate-workflow-walkthrough.js:8109:5)
```
Exit code: 1 (confirmed RED)

Mutation restored before GREEN run.

## GREEN (all six simulates pass)

| File | Exit | Success sentinel |
|------|------|-----------------|
| scripts/simulate-workflow-walkthrough.js | 0 | Workflow walkthrough simulation passed |
| plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js | 0 | Kaola-Workflow walkthrough simulation passed |
| plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js | 0 | GitLab workflow walkthrough simulation passed |
| plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js | 0 | GitLab Codex workflow walkthrough simulation passed |
| plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js | 0 | Gitea workflow walkthrough simulation passed |
| plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 0 | Gitea Codex workflow walkthrough simulation passed |

## Per-file assertion list

### scripts/simulate-workflow-walkthrough.js (claude)

- **M4** (`testClaimStatusRelease`): `assert(/^run_posture: (worktree|in-place)$/m.test(state), 'M4 (#277): state must contain run_posture: worktree or in-place')`
- **M2** (`testFinalizeCleansRoadmapEntry`): assert `closure_receipt.claim_planner_attested` field present; assert `closure_receipt.finalize_contractor_attested` field present; assert each is `'missing'` or `'attested'`; assert `closure_invariants.ok === true`
- **M1** (`testSubagentDispatchHookExists`): assert `hooks/kaola-workflow-subagent-dispatch-log.sh` exists; assert `hooks/hooks.json` has `SubagentStart` entry with `id: "kaola-workflow:subagent-dispatch-log"`

### plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js (codex)

- **M4** (inline in `main()`): `assert(/^run_posture: (worktree|in-place)$/m.test(state), 'M4 (#277): Codex state must contain run_posture: worktree or in-place')`
- **M2** (inline in `main()`): `plantRoadmap(tmp, 163, '')` + `runClaim(['finalize', ...])` + assert `closure_receipt.claim_planner_attested` + `closure_receipt.finalize_contractor_attested` + `closure_invariants.ok === true`
- **M1**: NOT ADDED (Codex edition — M1 deferred to #266)

### plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js (gitlab)

- **M4** (`testGitlabAdaptive`): `assert.ok(/^run_posture: (worktree|in-place)$/m.test(claimedState), 'M4 (#277): gitlab...')`
- **M2** (`testGitlabAdaptive`): plant issue-970 folder + roadmap entry + `spawnNode(claimScript, ['finalize', ...])` + assert `closure_receipt.claim_planner_attested` + `closure_receipt.finalize_contractor_attested` + `closure_invariants.ok === true`
- **M1** (`testGitlabDispatchHookExists`): assert `plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh` exists; assert `plugins/kaola-workflow-gitlab/hooks/hooks.json` has `SubagentStart` entry with `id: "kaola-workflow:subagent-dispatch-log"`

### plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js (gitlab-codex)

- **M4**: static source check — `gitlabClaimSrc.includes('run_posture')` throws if absent
- **M2**: static source check — `gitlabClaimSrc.includes('claim_planner_attested')` throws if absent
- **M1**: NOT ADDED (Codex edition — M1 deferred to #266)

### plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js (gitea)

- **M4** (`testGiteaAdaptive`): `assert.ok(/^run_posture: (worktree|in-place)$/m.test(claimedState), 'M4 (#277): gitea...')`
- **M2** (`testGiteaAdaptive`): plant issue-970 folder + roadmap entry + `spawnNode(claimScript, ['finalize', ...])` + assert `closure_receipt.claim_planner_attested` + `closure_receipt.finalize_contractor_attested` + `closure_invariants.ok === true`
- **M1** (`testGiteaDispatchHookExists`): assert `plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh` exists; assert `plugins/kaola-workflow-gitea/hooks/hooks.json` has `SubagentStart` entry with `id: "kaola-workflow:subagent-dispatch-log"`

### plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js (gitea-codex)

- **M4**: static source check — `giteaClaimSrc.includes('run_posture')` throws if absent
- **M2**: static source check — `giteaClaimSrc.includes('claim_planner_attested')` throws if absent
- **M1**: NOT ADDED (Codex edition — M1 deferred to #266)

## Git status (declared write set only)

Changed files from this node:
- scripts/simulate-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
- plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js
- kaola-workflow/issue-277/.cache/simulate-coverage.md (this file)

kaola-workflow/ROADMAP.md: NOT modified (confirmed via git diff).
