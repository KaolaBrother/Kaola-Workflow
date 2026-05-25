# planner raw output — issue-167 (Gitea closure-audit port) — model=opus

# Verdict: GitLab template applies. Proceed with faithful template-port (Approach A).
Confirmation pass on the #166 GitLab template; D1-D5 adopted as-is. All load-bearing facts checked against source:
- forge.viewPullRequest(prNumber) takes NUMBER (kaola-gitea-forge.js:221-224, `tea pr view <prNumber>`). Cannot pass f.pr_url.
- prNumberFromFolder (claim.js:904-909): parseInt(folder.pr_number) first, else regex /\/pulls\/(\d+)/ on folder.pr_url. Mirror inline.
- normalizeState LOWERCASES (forge:74-80). Compare lowercase merged/closed (same GitLab, opposite GitHub).
- updateIssueLabels(project, issueNum, {remove}) (forge:164-172): project never read; uses --remove-labels=<csv>.
- listIssues (forge:151-157) NO labels filter — additive change required.
- roadmapDir export gap (roadmap exports 352-363 omit it). Must add.
- Contract-validator TWO hardcoded arrays (scriptFiles 146-160, installSupportScripts 164-175): neither auto-discovers; both must gain kaola-gitea-workflow-closure-audit.js or validator FAILS.

## Two divergences from GitLab template (explicit)
1. executeRepairs label removal: GitLab `forge.updateIssue(it.number,{unlabels:[CLAIM_LABEL]})` → Gitea `forge.updateIssueLabels(null, it.number, {remove:[CLAIM_LABEL]})` (different fn, option key `remove` not `unlabels`, extra leading arg).
2. detectUnarchivedPrFolders: gate `f.sink!=='pr'`/`!f.pr_url`, resolver prNumberFromFolder with `/pulls/(\d+)` (NOT merge_requests/).

## Approaches
- A (RECOMMENDED): faithful template-port. New standalone kaola-gitea-workflow-closure-audit.js mirroring GitLab structurally + Gitea substitution map. KEEP PR naming. Additive forge.listIssues labels + roadmapDir export. execFileSync only for isDirty git. Risk Low, Complexity Medium.
- B (REJECTED): raw teaExec escape hatch / client-side filter — breaks "all tea through forge" convention; unbounded scaling. Same rejection as #166 Option C.

## Resolved open questions
**Q1 — tea issues list label flag: MUST VERIFY before Phase 3.** Source signal: updateIssueLabels uses comma-joined --add-labels=/--remove-labels=, so plural-csv `--labels=<csv>` is the likely match — but `tea issues list` is a different subcommand, help not seen. Likely push form:
```
const csv = (options.labels||[]).join(',');
if (csv) args.push('--labels=' + csv);
```
called `forge.listIssues({state:'closed', labels:[CLAIM_LABEL]})`. Load-bearing: test mock keys on exact arg-string (test-gitea-forge-helpers.js:97-98 keys `'issues list --output json --limit 100'`); wrong flag silently misses mock. If --labels= wrong, alternative is repeated singular --label. ORCHESTRATOR runs `tea issues list --help`.
**Q2 — updateIssueLabels project arg: pass null.** Forge ignores project (164-172). discoverProject() purely for symmetry adds an unnecessary remote call + failure path; violates minimal-mirror. null = mechanically correct, parity with GitHub/GitLab "call with just issue number".
**Q3 — Contract validator: add to BOTH arrays (146-160, 164-175); both exact-match.** Forbidden-token scopes: scripts loop (351-357) enforces only /\bglab\b/ (355) + root/GitHub-fallback require('../...') (356) — applies to new script. assertNoForbidden (43-58, MR/merge-request/GitLab tokens) applies to commands/skills/hooks/agents (133-135), NOT scripts. Net: rewrite GitHub `gh`-flavored stderr to `tea issues list failed`; the GitLab template's `glab issue list failed` is validator-BANNED, must not survive port. MR/merge-request wording convention-only for scripts (avoid for parity, not gated). gh not banned in gitea scripts but rewrite to tea for consistency.
**Q4 — Test placement confirmed.** Audit tests + helpers (runClosureAudit/Offline/closureAuditShim writing tea shim via KAOLA_TEA_MOCK_SCRIPT + makePrSinkFolder: sink: pr + pr_url /pulls/N + pr_number) → test-gitea-workflow-scripts.js. forge-API listIssues({labels}) test → test-gitea-forge-helpers.js (tea uses --limit not --per-page, forge:153). Rename 11 testClosureAudit* (...UnarchivedMrFolder... → ...UnarchivedPrFolder...). READ registration tail (mixed inline-IIFE + named) before adding calls.

## Blocking discipline (from #166 D2)
Name lowercase-state guard test explicitly: testClosureAuditUnarchivedPrFolderMergedLowercase — casing constraint lives in test surface; guards against future .toUpperCase() reintroduction.

## Out of scope (mirror #166)
No PR→MR rename; no folder/worktree deletion in --execute ((e)/(f) report-only); no new drift classes; no closure-contract; no Gitea audit-labels/repair-labels port; no edits to GitHub source; no edits to shipped GitLab port; no new test framework; no widening active-folders API; no client-side issue dumping; no rename of issue_number.

## Phase 1 fact to re-verify before Phase 3
- Exact `tea issues list` label-filter flag (Q1) — the single must-verify item. Everything else source-confirmed.

## Note: #166 folder now archived (kaola-workflow/archive/issue-166/phase2-ideation.md for D1-D5).
