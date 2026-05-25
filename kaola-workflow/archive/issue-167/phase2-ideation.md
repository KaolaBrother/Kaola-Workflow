# Phase 2 - Ideation: issue-167

## Approaches Evaluated

### Option A: Faithful template-port (mirror the #166 GitLab script with Gitea substitutions) — SELECTED
- Summary: New dedicated `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` mirroring the
  shipped GitLab port structurally; all remote I/O through `kaola-gitea-forge.js`; KEEP PR naming (Gitea uses PR, not MR).
- Pros: Matches AC ("JSON matching the GitHub shape"); reuses the proven #166 structure + the settled D1-D5 decisions;
  minimal blast radius; the only semantic deltas are `viewPullRequest(number)` and `updateIssueLabels(project,n,{remove})`.
- Cons: Touches two shared Gitea modules additively (forge.listIssues, roadmap exports) + two contract-validator arrays.
- Risk: Low. Complexity: Medium.

### Option B: Self-contained script with raw `tea` escape hatch (forge.teaExec / client-side label filter)
- Summary: New script bypasses the forge for label-filtered listing.
- Cons: Breaks the "all tea through the forge" convention; client-side filtering scales unbounded with issue history.
  Same rejection as #166 Option C. REJECTED.

## Gitea substitution map (vs the GitLab template — all source-confirmed)
- require ./kaola-gitea-forge / -active-folders / -roadmap.
- **KEEP PR naming** (issue #167 explicit): class `unarchived_pr_folders`, fields `pr_url`/`pr_state`, gate `f.sink!=='pr'`.
  Do NOT rename to MR.
- `forge.viewPullRequest(prNumber)` takes a NUMBER → inline `prNumberFromFolder(f)` (folder.pr_number, else regex
  `/\/pulls\/(\d+)/` on folder.pr_url — mirror claim.js:904-909). Cannot pass f.pr_url.
- Compare **lowercase** `state==='merged'||state==='closed'` (Gitea normalizeState lowercases — same as GitLab, NOT GitHub
  uppercase). Highest-risk silent bug — name guard test `testClosureAuditUnarchivedPrFolderMergedLowercase`.
- Label removal: `forge.updateIssueLabels(null, it.number, {remove:[CLAIM_LABEL]})` (forge ignores the project arg; pass null).
- **D1 listIssues labels**: add `const csv=(options.labels||[]).join(','); if(csv) args.push('--labels='+csv);` — VERIFIED
  via context7: `tea issues list --labels <csv>` (comma-joined). `=` form chosen for forge-convention consistency.
- **D3 roadmapDir**: add to kaola-gitea-workflow-roadmap.js exports (defined 57, missing from 352-363).
- **D4**: archiveClosedIssues reads `field(content,'issue_iid')||field(content,'issue_number')`.
- **D5**: no closure-contract/receipt — minimal mirror.
- **Forbidden token**: rewrite GitHub `gh`-flavored + GitLab-template `glab`-flavored stderr to `tea issues list failed`
  (`/\bglab\b/` is the Gitea contract validator's forbidden token in scripts).

## Advisor Findings
Advisor verdict: plan sound, proceed; Q1 verified. Required Phase 3 watch-items: (1) rewrite `glab issue list failed`
→ `tea issues list failed` (forbidden-token gate); (2) edit BOTH contract-validator arrays (scriptFiles 146-160,
installSupportScripts 164-175) in the same task as the new script (both fail-closed). Three pre-Phase-3 verifications all
done (no gitea-codex tree; test-gitea-forge-helpers uses execFileSync injection; registration tail mapped). Add code
comments explaining the `--labels=<csv>` choice and the `updateIssueLabels(null,...)` project-arg behavior. Full text in
`.cache/advisor-ideation.md`.

## Rebase baseline (user-requested mid-Phase-2)
origin/main advanced a6e6b2b → fae0698 ("fix(install): add kaola-workflow-closure-contract.js to all forge support
scripts") after #166 merged. `workflow/issue-167` was rebased onto fae0698 (clean FF, 0 commits ahead). fae0698 touched
ONLY install.sh (added the shared closure-contract.js to all three forge SUPPORT_SCRIPT_NAMES arrays). **Phase 3/4 must
read the current install.sh Gitea SUPPORT_SCRIPT_NAMES line numbers fresh** (shifted ~+2-3 from the research-noted 157-168);
`kaola-gitea-workflow-closure-audit.js` slots after `kaola-gitea-workflow-classifier.js`. The contract validator was not
touched by fae0698.

## Selected Approach
**Option A — Faithful template-port.** Mirror the GitLab `kaola-gitlab-workflow-closure-audit.js` with the Gitea
substitution map above; D1-D5 adopted from #166. Preserves GitHub JSON shape with Gitea PR naming + lowercase state +
forge-routed label removal.

## Out of Scope (explicit)
- No PR→MR rename (issue #167 explicit — KEEP PR naming).
- No folder/worktree deletion in `--execute`; classes (e)/(f) report-only both modes.
- No new drift classes beyond the five output keys.
- No closure-contract / receipt wiring.
- No Gitea port of `audit-labels`/`repair-labels` (remain GitHub-only).
- No edits to the GitHub source or the shipped GitLab port.
- No new test framework; no widening of active-folders' public API; no client-side issue dumping; no rename of issue_number.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md (model=opus; Sonnet rate-limited) | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
