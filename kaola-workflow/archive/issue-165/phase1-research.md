# Phase 1 - Research / Discovery: issue-165

## Deliverable
A `closure-audit` subcommand for the GitHub edition of `scripts/kaola-workflow-claim.js`
that reports closure drift across local roadmap sources, the generated ROADMAP.md,
active folders, archive state, remote issue state, and the `workflow:in-progress`
advisory label. Dry-run JSON is the default; `--execute` repairs only SAFE local
stale roadmap sources (+regenerate ROADMAP.md) and removes stale in-progress labels
from closed issues when online. Plus tests in the canonical walkthrough and docs.

## Why
Today closure drift is detected reactively and piecemeal: `audit-labels` covers only
labels, `stale-worktree-check` covers only worktrees/branches, and roadmap/active-folder
drift is noticed only by manual inspection. #165 (child of epic #161) provides one
auditable command, satisfying #161 AC5 ("existing stale closed issues cleaned or
reported by the new audit command") so #161 can close.

## Affected Area
- `scripts/kaola-workflow-claim.js` (add `cmdClosureAudit`, route in `main()`, export)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical mirror — validate-script-sync.js)
- `scripts/simulate-workflow-walkthrough.js` (new test functions)
- `docs/api.md` (§ Closure Audit + differentiation from stale-worktree-check/cleanup)
- `CHANGELOG.md` ([Unreleased] entry)

## Key Patterns Found
1. Drift building blocks already exist — `archiveProjectDir` (kaola-workflow-claim.js:502)
   returns `roadmap_source_removed`/`roadmap_regenerated`; `regenerateRoadmap`
   (kaola-workflow-roadmap.js:188); `readActiveFolders(root,{excludeClosedIssues:false})`;
   `issueIsClosed` (kaola-workflow-active-folders.js:40).
2. Label-drift logic to reuse: `cmdAuditLabels` (kaola-workflow-claim.js:901) and
   `cmdRepairLabels` (kaola-workflow-claim.js:908) — `gh issue list --state closed
   --label workflow:in-progress`. Dry-run/execute split mirrors the target command.
3. Worktree-drift command shape to mirror for JSON/dry-run conventions:
   `cmdStaleWorktreeCheck` (kaola-workflow-claim.js:801), `collectStale` (:743).
4. `parseArgs` already supports `--execute`/`--json` (kaola-workflow-claim.js:33);
   `output(obj,code)` (:446); dispatch `main()` (:1053); exports (:1079).

## Test Patterns
- Framework: hand-rolled `assert(cond,msg)` (simulate-workflow-walkthrough.js:18); no framework.
  Must print "Workflow walkthrough simulation passed" and exit 0.
- Location: `scripts/simulate-workflow-walkthrough.js`; register fn in `main()` list (ends :3038).
- Structure: temp repo via `initGitRepo` (:459); mock `gh` via `writeShimFiles` (:444) +
  `ghMockEnv`/`runClaimOnline` (:477/:482); fixtures `plantActiveFolder` (:259),
  `plantRoadmapIssue` (:279). Closest analogs: `testAuditAndRepairLabels` (:2560),
  `testStaleWorktreeCheck` (:1047), `testStatusShowsClosedIssueDrift` (:1021).

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` → ghExec returns ''/issueIsClosed false; remote drift classes skipped.
- `KAOLA_GH_MOCK_SCRIPT` → routes ghExec through a node shim (test mocking).
- `CLAIM_LABEL = 'workflow:in-progress'`.

## External Docs
none — internal patterns sufficient.

## GitHub Issue
KaolaBrother/Kaola-Workflow#165 (parent epic #161)

## Completeness Score
9/10 (Goal 3/3, Outcome 3/3, Scope 2/2, Constraints 1/2 — minor: exact wording of
docs differentiation section deferred to Phase 6).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | N/A | .cache/code-explorer.md (research done by orchestrator) | Sonnet quota exhausted this session; subagent dispatch returned quota error. Orchestrator read all relevant files first-hand. |
| docs-lookup | N/A | internal patterns sufficient | No external/library/API behavior involved — pure internal Node scripts. |

## Notes / Future Considerations
- Edition scope: GitHub canonical this cycle; gitlab/gitea ports filed as follow-ups
  to #161 (see .cache/scope-decision.md, advisor-directed).
- JSON output shape locked in .cache/scope-decision.md before coding.
