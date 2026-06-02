# Fast Planner — issue-230

## Write set (4 files)
1. plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js (Sites 1+2)
2. plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js (Sites 3+4)
3. plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (4 tests + registration)
4. plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (4 tests + registration)

## Single approach (proven #218 template)
Root-cause: parseJson('' or non-JSON, {}) → {} → normalizeState(undefined) → 'unknown'; classifier's `'unknown' !== 'closed'` + empty labels → falls through to classify() → CLAIMABLE. Fix: inline residual-state guard at 4 sites, AFTER the catch and BEFORE the `=== 'closed'` check, returning the BYTE-IDENTICAL catch-arm target_unavailable object (so callers see an identical verdict). Excludes BOTH 'open' and 'closed' so a genuinely closed issue still falls through to the `red` verdict.

## Per-site guard (insert after catch, before closed-check)
GitLab (classifyIssue → return object; cmdClassify → stdout.write+return):
```js
const st = (issue.state || '').toLowerCase();
if (st !== 'open' && st !== 'closed') {
  return { verdict: 'target_unavailable', reasoning: 'glab issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
}
```
Gitea: identical but reason 'tea issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1'.
cmdClassify variant: `process.stdout.write(JSON.stringify({verdict:'target_unavailable', reasoning:'…'}) + '\n'); return;`
IMPORTANT: match the EXACT catch-arm object shape/text at each site (verify the real catch arm before writing).

## Reason-string decision (resolved)
Use the byte-identical catch-arm object (verdict + reasoning), NOT a distinct "state unverified" string. The "state unverified" detail belongs to #218's probeIssueState (different caller/shape). Here the constraint is verdict-shape parity with the catch arm. Contract validators do NOT scan classifier .js for glab/tea/gh tokens (assertNoForbidden scans command/skill/hook/agent/config files only) — verify but token bans not at risk.

## Tests (8, write FIRST — RED before guard = current 'green' verdict)
CRITICAL: classifyIssue/cmdClassify short-circuit to 'green' when readOrCreateConfig().parallel_mode !== 'auto'. So EVERY new test must set HOME + USERPROFILE to a temp dir to force the 'auto' default (see existing tests). Do NOT set KAOLA_WORKFLOW_OFFLINE (online path needed to reach viewIssue). Drive forge response via KAOLA_GLAB_MOCK_SCRIPT / KAOLA_TEA_MOCK_SCRIPT shims (writeShimFiles). Mirror testGitlabProbeResidualEmptyExit0 / …NonJsonExit0 (+ Gitea).
- testGitlab/GiteaClassifyIssueResidualEmptyExit0, …NonJsonExit0: in-process classifyIssue(N, root) → assert verdict==='target_unavailable' + /refusing to claim outside KAOLA_WORKFLOW_OFFLINE/.test(reasoning).
- testGitlab/GiteaCmdClassifyResidualEmptyExit0, …NonJsonExit0: spawnSync [classifierScript,'classify','--issue',N] with HOME/USERPROFILE temp + mock env → status 0, parse stdout, verdict==='target_unavailable'.
Empty shim: ["process.exit(0);"]; non-JSON shim: ["process.stdout.write('rate limit exceeded\\n');"]. Register next to existing probe registrations.

## Acceptance
- node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (+ gitea) — fast RED→GREEN
- npm run test:kaola-workflow:gitlab && :gitea
- npm test (the gate; root walkthrough does NOT exercise forge ports)

## Out of scope (verified)
- Root scripts/kaola-workflow-classifier.js + Codex mirror (cmdClassify JSON.parse(raw) throws → already fail-closed).
- checkDependsOn (already treats unknown dep as blocked/safe).
- Forge layer viewIssue/normalizeIssue/parseJson ({}fallback used safely elsewhere).
