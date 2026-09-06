# Issue #1052 host-identity / workspace / generated Next acceptance RED

baseline SHA actually run: `05b67a8ca096ee9661d06c0393aacb97eaf3d31d`  
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`  
`git rev-parse HEAD` in that worktree matched the SHA above.  
Candidate is **dirty** (not a clean tree): production/docs/package plus prior #1052 work already present; this mission added/extended only test oracles.

`git status --short --branch` (worktree, after this oracle edit):

```
## workflow/issue-1052
 M CHANGELOG.md
 M docs/api.md
 M docs/architecture.md
 M docs/cursor-edition.md
 M docs/runtime-capabilities.md
 M package.json
 M scripts/kaola-workflow-claim.js
 M scripts/sync-cursor-edition.js
 M scripts/test-cursor-edition.js
?? scripts/test-issue-1052-cursor-cli-startup-prep.js
```

Measured gate (do not trust docs over source): `isCursorCliLocalWorkflowPath` is `runtime === 'cursor' && product !== 'app'`. `--host` is ignored. `ensureCursorCliLocalPrep` targets `getRoot()` (`git rev-parse --show-toplevel` of the invoking process).

## Test paths

- `scripts/test-issue-1052-cursor-cli-startup-prep.js` — real `kaola-workflow-claim.js` startup/resume/status/list-open under `KAOLA_WORKFLOW_OFFLINE=1` (worktree seed unsets offline only for the GH mock). Explicit CLI/local positives use `--product cli --host local`. Subject remains `claim.js`, not `--ensure-target` as the operator entry.
- `scripts/test-cursor-edition.js` — generated Next/Finalize bytes via isolated `node scripts/test-cursor-edition.js --cli-materialization-oracle` (fresh `sync-cursor-edition.js --write --tree-root`).

## RED: claim/startup/resume host identity and workspace

Command: `node scripts/test-issue-1052-cursor-cli-startup-prep.js`  
Result: exit 1 — **12 failed / 45 passed**.

Failure signatures (test name + assertion/error):

- `#1052-identity-omitted: --runtime cursor with product/host omitted is identity-unknown and must not write Repo` — acquired with `cursor_prep.status: materialized` against the invoking repo.
- `#1052-identity-cli-cloud: --runtime cursor --product cli --host cloud is not CLI/local and must not write Repo` — same extra Repo write (`cursor_prep` materialized).
- `#1052-identity-product-unknown: --runtime cursor --product unknown must not write Repo` — extra Repo write.
- `#1052-identity-host-unknown: --runtime cursor --host unknown must not write Repo` — extra Repo write (`--host` ignored).
- `#1052-identity-host-cloud-no-product: --runtime cursor --host cloud without product is not explicit CLI/local` — extra Repo write.
- `#1052-identity-product-cli-no-host: --product cli without --host local is an incomplete pair and must not write Repo` — extra Repo write.
- `#1052-identity-host-local-no-product: --host local without --product cli is not explicit CLI and must not write Repo` — extra Repo write.
- `#1052-identity-resume-omitted: resume --runtime cursor without product/host must not write Repo` — `resumed: true` with `cursor_prep.status: materialized`.
- `#1052-worktree-cwd: Repo prep must target the recorded CLI workspace/main_root, not silent cwd` — resume from the claim-created write-worktree prepared the worktree git toplevel, not `main_root`.
- `#1052-worktree-cwd: claim-created write-worktree must not receive extra Repo writes` — `.cursor/agents/implementer.md` landed under the write-worktree.
- `#1052-cursor-workspace: explicit CLI workspace locator must still allow claim` — `result: refuse`, `reason: unknown_flag`, `unknownFlags: ["--cursor-workspace"]`.
- `#1052-cursor-workspace: prep must target --cursor-workspace, not the decoy git toplevel` — decoy cwd received no write only because the unknown flag refused; the CLI workspace was not prepared.

Passing on this dirty candidate (must not be weakened): collision / symlink / missing-or-stale authority fail-closed; explicit `--product app` App local and App Cloud negatives; non-Cursor `--runtime claude`; readonly `status`/`list-open` (including with explicit CLI/local flags); nested-cwd/neighbor non-write; restart-boundary on materializing explicit CLI/local; resume identity/Mission List bytes; helper `--ensure-target` control.

## RED: generated Next startup/resume identity

Command: `node scripts/test-cursor-edition.js --cli-materialization-oracle`  
Result: exit 1 (`ORACLE_EXIT:1`). Fresh isolated render.

- `CLI-MATERIALIZATION-ORACLE RED: workflow-next: generated Next startup treats omitted --product/--host as CLI (must pass explicit --product cli --host local)`
- `CLI-MATERIALIZATION-ORACLE RED: workflow-next: generated Next resume/recovery does not invoke executable claim.js resume (helper-only or mission-list.md prose is not the subject)`

Finalize isolated consumer produced no new errors on this run (pre-dispatch `$PWD` ensure retained; CLI identity flags were not added as an App/Cloud default on `--ensure-target`).

## Unexecuted

- Live standalone Cursor CLI process / live Task catalog after prep.
- Live Cursor App local / App Cloud sessions.
- Runner / kaola-project-runner (out of scope).
- `npm test`, `test:kaola-workflow:claude:full`, `simulate-workflow-walkthrough.js` (forbidden for this mission).
- Full `test-cursor-edition.js` G2/G7 loops (main-tree D0 drift remains; isolated `--cli-materialization-oracle` is the generated-byte oracle that was run).

No production code was written in this mission.
