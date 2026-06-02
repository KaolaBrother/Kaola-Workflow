# Fast Executor (tdd-guide) — issue-230

## Catch-arm text matched (byte-identical guard objects)
- GitLab (classifyIssue :304, cmdClassify :354): "glab issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1"
- Gitea (classifyIssue :309, cmdClassify :359): "tea issue fetch failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1"

## 4 guards (after viewIssue try/catch, before closed-check)
```js
const _st = (issue.state || '').toLowerCase();
if (_st !== 'open' && _st !== 'closed') { return { verdict: 'target_unavailable', reasoning: '<exact catch-arm text>' }; }
```
cmdClassify variants emit `process.stdout.write(JSON.stringify({...}) + '\n'); return;` (matches catch-arm shape; _st2 to avoid shadow). Excludes both 'open' and 'closed' → genuinely closed issue still → red.

## 8 tests (write-first)
GitLab + Gitea × {ClassifyIssue, CmdClassify} × {EmptyExit0, NonJsonExit0}. In-process tests call classifyIssue(N, root); subprocess tests spawnSync [classifier 'classify' --issue N]. All set HOME+USERPROFILE temp (force parallel_mode auto) + KAOLA_*_MOCK_SCRIPT shim (empty: process.exit(0); non-JSON: process.stdout.write('rate limit exceeded\n')). save/restore env in finally. Registered with existing probe tests.

## RED→GREEN
- RED (before guards): "empty exit-0 classifyIssue must return target_unavailable, got: green" — both forges. Confirms unguarded path exercised.
- GREEN (after): all 8 PASSED; "GitLab/Gitea workflow script tests passed".
- No regression: npm run test:kaola-workflow:gitlab & :gitea exit 0; closed→red and open→normal unchanged.

## Tree
Only the 4 write-set files modified (M).
