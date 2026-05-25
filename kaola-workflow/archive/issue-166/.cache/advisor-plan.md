# advisor-plan raw output — issue-166 (Phase 3 gate)

## Advisor verdict: blueprint implementable, proceed to Phase 4. No architect revision required.

## Blocking pre-B1 verification (RESOLVED in-session)
Confirm `test-gitlab-forge-helpers.js:62-92` uses `execFileSync` injection (as C3 assumes)
vs env-shim. → VERIFIED: it uses **execFileSync injection**. Lines 91-92 show
`forge.listIssues({ execFileSync })` and `forge.listIssues({ execFileSync, perPage:50, state:'opened' })`;
`runner(calls, responses)` (7-13) returns the executable passed as `execFileSync`. Response keys
are space-joined args, e.g. line 68 `'issue list --output json --per-page 100'`, line 69
`'... --per-page 50 --state opened'`. C3's assertion shape and `--per-page 100 --state closed --label ...`
key shapes are exactly correct. QUEUED_LABEL='workflow:queued' (line 30) → two-label key valid.

## Dependency safety — verified
A1 (forge labels) → B1.detectStaleLabels + C3. A2 (roadmapDir) → B1.imports. A3 (docs) independent.
B1 → C1 install, C2 tests. C3 needs only A1. No file in two parallel tasks. All correct.

## Edge cases correctly handled (not blockers)
1. OFFLINE-precedes-forge — explicit early return in both remote detectors (glabExec returns ''→[]
   offline, forge.js:13; without early 'skipped_offline' the offline test sees [] and fails). Test #1 enforces.
2. D4 fixture writes issue_iid (#3/#4) — without it the iid-first read isn't exercised.
3. `issue update --unlabel` in script + shims #9/#11 (NOT issue edit --remove-label).
4. D2 lowercase guard test naming makes casing constraint visible at registration site.

## Dev-time confirm (non-blocking)
forge.listIssues default perPage=100 (line 125); script passes no perPage override → inherits 100;
shim response keys must include `--per-page 100` (architect wrote them that way). Tuning the default
later breaks C3 keys — that's catching a real change, not fragility.

## docs/api.md heading change — RESOLVED
grep for `#closure-audit-and-repair` / `#closure-audit` anchors across repo markdown → NONE found.
Heading rewrite "(GitHub only, issue #165)" → "(issue #165; GitLab port #166)" is anchor-safe.

## Forward note (#167)
This blueprint is a near-1:1 template for the Gitea port — same five decisions, same file structure,
swap gitlab→gitea / mr→pr / glab→tea. Skip re-planning the decisions; re-verify each gap exists in
kaola-gitea-forge.js and apply the template. The #167 architect dispatch can be much shorter.
