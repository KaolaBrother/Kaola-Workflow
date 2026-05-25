# planner raw output — issue-166 (GitLab closure-audit port)

> NOTE: dispatched with model=opus (Sonnet rate-limited this session). planner agent.

# Ideation Report: Porting `closure-audit` to the GitLab Edition (issue #166)

## Verification status
All five Phase 1 gaps re-verified. Three sharper facts:
- `roadmapDir` confirmed absent from GitLab roadmap module exports (352-363); GitHub roadmap exports it.
- `firstPositiveInteger` is PRIVATE in GitLab active-folders (NOT exported, exports 132-140). Port must inline the fallback.
- GitLab convention = everything goes through the forge object. grep for `glabExec` call sites across plugins/kaola-workflow-gitlab/scripts/ returns ONE hit, in a forge unit test (test-gitlab-forge-helpers.js:59). No production script uses the escape hatch.

## Decision 1 — Stale-label detection
**Recommendation: (a) extend `forge.listIssues` with an additive `labels` option.**
- (a) matches "all glab goes through forge" convention; listIssues already returns {number,title,url} via normalizeIssue — exactly detectStaleLabels' shape; one additive param, zero behavior change. Risk Low.
- (b) direct forge.glabExec from new script — breaks convention, reintroduces raw-glab escape hatch. Risk Medium.
- (c) listIssues({state:'closed'}) + client-side filter — unbounded memory as history grows. Reject. Risk Medium.
Change: `args.push('--label', label)` inside listIssues per options.labels entry, guarded. New script calls `forge.listIssues({state:'closed', labels:[CLAIM_LABEL]})`. executeRepairs keys off `it.number`.

## Decision 2 — MR vs PR rename + state casing
**Recommendation: rename only PR-specific surface; inline mrIidFromFolder; compare LOWERCASE state.**
- Output key unarchived_pr_folders→unarchived_mr_folders; pr_url→mr_url, pr_state→mr_state; folder gate f.sink!=='pr'→f.sink!=='mr'; f.pr_url→f.mr_url.
- KEEP `issue_number` in per-item output (do NOT rename to issue_iid). GitLab folders set issue_number==issue_iid (parseStateFile 67-68); AC says "JSON matching the GitHub shape" — issue_number is not a PR-term.
- STATE CASING is a mandatory flip: GitHub does .toUpperCase() then compares 'MERGED'/'CLOSED'. GitLab normalizeState already lowercases → compare `state==='merged'||state==='closed'` with NO .toUpperCase(). Verbatim GitHub uppercase would match NOTHING — highest-risk silent bug.
- URL→iid: GitHub passes pr_url to `gh pr view`; GitLab forge.viewMergeRequest requires an IID, not URL. Extraction MANDATORY. Inline 4-line helper mirroring claim.js mrIidFromFolder 917-922 (parseInt(folder.mr_iid) else regex /merge_requests\/(\d+)/ on folder.mr_url).
Detector: for each sink==='mr' folder, mrIid=mrIidFromFolder(f); skip if null; state=forge.viewMergeRequest(mrIid).state; push on lowercase merged/closed. Offline → 'skipped_offline'.

## Decision 3 — roadmapDir access
**Recommendation: (a) add `roadmapDir` to GitLab roadmap module exports.**
- One-line additive change (352-363 block); restores symmetry with GitHub (which exports it and closure-audit imports it); single source of truth for .roadmap path. Risk Very Low.
- (b) inline path — creates silent cross-file invariant; if roadmap relocates .roadmap, audit silently scans wrong dir. Low-but-latent.

## Decision 4 — Archive issue-number field
**Recommendation: inline the fallback read; do NOT export firstPositiveInteger.**
- Bug prevented: GitHub archiveClosedIssues reads field(content,'issue_number') (95). GitLab archives write issue_iid. Verbatim copy misses every GitLab-archived issue → class (d) archive_closed never fires.
- firstPositiveInteger is private (not exported). Inline: `parseInt(field(content,'issue_iid')||field(content,'issue_number'),10)` (or copy the 3-line helper). Matches inline-small-helpers idiom + parseStateFile:61 precedent. Do NOT widen active-folders public API.

## Decision 5 — Closure-contract adoption
**Recommendation: (a) stay a minimal faithful mirror of GitHub — no receipt, no closure-contract.**
- AC anchor "JSON matching the GitHub shape" is the tiebreaker. closure-audit is a drift REPORTER (sibling stale-worktree-check, plain JSON, no receipt), not a closure EXECUTOR like cmdWatchMr.
- Adopting receipt would break shape parity + mix reporting vs closure-execution surfaces the codebase keeps separate. Byte-identical availability of closure-contract is a red herring. --execute only does safe local roadmap repairs + label removal — no receipt surface needed.

## Test placement
test-gitlab-workflow-scripts.js (glab-mock infra: writeShimFiles, glabMockEnv/KAOLA_GLAB_MOCK_SCRIPT, withForge). Register synchronous testClosureAudit*() calls in bare top-level run block between line 1775 and the async .then() chain at 1777. Do NOT add to dispatcher (already run()s this file). Hand-rolled assert.
Mirror 11 GitHub tests (simulate-workflow-walkthrough.js 3006-3379). GitLab shims answer `glab issue view N --output json`, `glab issue list --state closed --label ... --output json`, `glab mr view N --output json`. Add MR shim returning {"state":"merged"} and {"state":"closed"} to exercise lowercase compare (guards D2 casing bug).

## Install wiring & sync
- Add kaola-gitlab-workflow-closure-audit.js to GitLab SUPPORT_SCRIPT_NAMES (install.sh 134-145, near classifier/compact-context).
- NO validate-script-sync.js obligation (GitLab scripts not in COMMON_SCRIPTS nor BYTE_IDENTICAL_GROUPS).
- docs/api.md: revise heading "(GitHub only, issue #165)" (627), add GitLab subsection w/ MR terms, update flow-map row (727) + follow-up bullet (737). Pretty-print JSON.stringify(...,null,2).

## Explicit non-goals
- No folder/worktree deletion in --execute. Classes (e)/(f) report-only both modes.
- No new drift classes beyond five.
- No receipt/closure-contract wiring.
- No GitLab port of audit-labels/repair-labels (separate concern; remain GitHub-only).
- No edits to GitHub source scripts/kaola-workflow-closure-audit.js (parity port, don't drift source).
- No new test framework.
- No widening active-folders public API; no client-side issue dumping for labels.
- No rename of issue_number in output items.

## Recommended approach (one line)
Faithful parity port as dedicated standalone kaola-gitlab-workflow-closure-audit.js, all remote calls through forge (extend listIssues w/ labels — D1a), export roadmapDir from GitLab roadmap (D3a), inline mrIidFromFolder + lowercase MR-state compare (D2), inline issue_iid-first archive read (D4), no closure-contract (D5a). GitHub JSON shape with PR→MR substitutions only.

## Phase 1 facts to re-verify
None blocking. Two clarifications baked in (both verified this pass): firstPositiveInteger private (D4); URL→iid extraction mandatory (D2, forge.js:193 + claim.js:917-922).
