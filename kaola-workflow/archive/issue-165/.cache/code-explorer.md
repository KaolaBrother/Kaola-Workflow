# Codebase Research — issue-165 closure-audit

NOTE: code-explorer subagent dispatch failed (Sonnet quota exhausted for the
session). Research performed directly by the orchestrator (Opus) reading full
files. Facts below are first-hand from the current tree.

## Multi-edition layout (4 trees)

- `scripts/` = GitHub/Claude canonical. **Byte-identical** to
  `plugins/kaola-workflow/scripts/` — enforced by `scripts/validate-script-sync.js`
  `COMMON_SCRIPTS` (includes `kaola-workflow-claim.js`, `-roadmap.js`,
  `-active-folders.js`). After editing the canonical, `cp` to the plugin copy.
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (1084 ln) — glab/MR variant.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (1070 ln) — tea/PR variant.
- `scripts/kaola-workflow-closure-contract.js` is in ALL 4 trees, byte-identical,
  pinned by `BYTE_IDENTICAL_GROUPS` in validate-script-sync.js.

## Building blocks already present in GitHub claim.js (scripts/kaola-workflow-claim.js)

- `archiveProjectDir(root, project, statusValue, suffix)` :502 — on `closed`,
  removes `.roadmap/issue-N.md` (returns `roadmap_source_removed`: removed|absent|failed)
  and `regenerateRoadmap` (returns `roadmap_regenerated`). Reads issue_number from state.
- `checkClosureInvariants(root, receipt, archiveDest)` :554 — returns {ok, violations[]}.
- `buildClosureReceipt(project, issueNumber, steps)` :1036.
- `collectStale(root)` :743 — worktree/branch drift (NOT roadmap/folder/label drift).
- `cmdStaleWorktreeCheck` :801 / `cmdStaleWorktreeCleanup` :807 — worktree+branch only.
- `cmdAuditLabels` :901 — `gh issue list --state closed --label workflow:in-progress --json number,title,url`; emits {stale,count}. GitHub-only.
- `cmdRepairLabels` :908 — dry-run default (`would_remove`), `--execute` removes label, emits {dry_run,removed,failed}. GitHub-only.
- `readActiveFolders(root, {excludeClosedIssues:false})` — list active folders incl. closed-issue ones.
- `issueIsClosed(n)` (active-folders module) — false when OFFLINE or null.
- `ghExec(args)` — `gh` wrapper; honors KAOLA_WORKFLOW_OFFLINE and KAOLA_GH_MOCK_SCRIPT.
- `parseArgs` already handles `--execute` (args.execute) and `--json`.
- `main()` dispatch :1053; `module.exports` :1079.

## #165 drift classes → mapping (from advisor + code)

- (a) `.roadmap/issue-N.md` exists & issue N closed → scan `.roadmap/`, issueIsClosed. **Safe auto-repair** (unlink + regenerate).
- (b) ROADMAP.md lists closed issue → derivative of (a); fixed by regenerate.
- (c) closed issue still has workflow:in-progress → reuse cmdAuditLabels/cmdRepairLabels logic.
- (d) archive status:closed but `.roadmap/issue-N.md` exists → overlaps (a); same safe repair.
- (e) active folder for closed issue → readActiveFolders+issueIsClosed. **Report only** (may hold work).
- (f) active folder sink=pr + pr_url with PR MERGED/CLOSED, not archived → per-folder `gh pr view` (mirror cmdWatchPr). **Report only**, point at watch-pr.

## Safe-repair boundary (advisor-confirmed)

`--execute` touches only: stale `.roadmap` files + regenerate ROADMAP.md + remote
label removal on closed issues. NEVER deletes active folders/worktrees — that
surface belongs to stale-worktree-check/cleanup (must say so in docs/api.md).
Offline: local scans (a/b/d/e) still run; (c)/(f) marked skipped_offline, no error.

## gitlab/gitea variant divergence

- Use a `forge` module: `kaola-gitlab-forge.js` (239 ln) / `kaola-gitea-forge.js` (294 ln).
- `forge.listIssues({state})` exists in both (gitlab :123, gitea :151) — supports `--state`.
- Label removal: gitlab `forge.updateIssue(iid,{unlabels:[...]})`; gitea `forge.updateIssueLabels(project,iid,{remove:[...]})`.
- Field is `issue_iid` (not issue_number); gitlab watcher = `cmdWatchMr` (MR), gitea = `cmdWatchPr` (PR).
- **Neither gitlab nor gitea has cmdAuditLabels/cmdRepairLabels** — label audit/repair
  was historically GitHub-only. Precedent for GitHub-only audit tooling exists.
- Both DO have archiveProjectDir, checkClosureInvariants, buildClosureReceipt,
  collectStale, clearAdvisoryClaim, regenerateRoadmap — so a local-drift audit is portable.

## Test harness (scripts/simulate-workflow-walkthrough.js, 3047 ln) — GATE per CLAUDE.md

- `assert(cond,msg)` :18. Hand-rolled, no framework. Must print "Workflow walkthrough simulation passed".
- `initGitRepo(tmp)` :459, `initGitRepoWithBareRemote` :468.
- Mock gh: `writeShimFiles(path,jsLines)` :444 writes `<bin>/gh.js`; `ghMockEnv(binDir)` :477
  returns {KAOLA_GH_MOCK_SCRIPT}. `runClaimOnline(args,cwd,binDir,extraEnv)` :482 (OFFLINE=0, exits 0, returns JSON).
  `runClaimOnlineLastJson` :504 (parses last JSON line).
- `plantActiveFolder(root,project,issueNumber,phase3Body,status)` :259 — writes workflow-state.md with Sink block.
- `plantRoadmapIssue(root,issueNumber,body)` :279 — writes `.roadmap/issue-N.md`.
- Closest analogs to mirror: `testAuditAndRepairLabels` :2560 (gh shim for issue list/edit),
  `testStaleWorktreeCheck` :1047, `testFinalizeCleansRoadmapEntry` :2054, `testStatusShowsClosedIssueDrift` :1021.
- Register new test fn in `main()` list ending :3038.
- npm `test` runs all 4 editions. Canonical gates:
  claude=`simulate-workflow-walkthrough.js`; codex=`simulate-kaola-workflow-walkthrough.js`;
  gitlab=`simulate-gitlab-workflow-walkthrough.js`(+codex); gitea=`simulate-gitea-workflow-walkthrough.js`(+codex).
  All preceded by validate-script-sync.js and per-edition contract validators.

## Docs

- `docs/api.md` already has § Closure Contract (from #161). Add § Closure Audit there,
  with explicit "how this differs from stale-worktree-check/cleanup" (AC requirement).
- `CHANGELOG.md` — add [Unreleased] entry.
