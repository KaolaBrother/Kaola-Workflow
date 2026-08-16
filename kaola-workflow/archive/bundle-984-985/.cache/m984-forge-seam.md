# m984-forge-seam — port KAOLA_CLASSIFIER_MOCK_SCRIPT into the two forge editions

## Task
Port the `KAOLA_CLASSIFIER_MOCK_SCRIPT` test seam (#495) from canonical
`scripts/kaola-workflow-claim.js` into the two forge ports —
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` and
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — so
`scripts/test-forge-bundle-lane.js` (the mutation-proven #862 oracle) becomes runnable on gitlab
and gitea instead of dying at `target_set_unverified` before it ever reaches the subject under
test. Production code only; the test (`test-forge-bundle-lane.js`) was not touched.

## Diff shape (identical shape in both files, one function each)

`classifyIssue(root, issueIid)` in each file grew a mock branch ahead of the existing in-process
call:

```js
function classifyIssue(root, issueIid) {
  const classifierMock = process.env.KAOLA_CLASSIFIER_MOCK_SCRIPT;
  if (classifierMock) {
    try {
      const raw = execFileSync(process.execPath,
        [classifierMock, 'classify', '--issue', String(issueIid), '--json'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }
      ).trim();
      return raw ? JSON.parse(raw)
        : { verdict: 'target_unavailable', reasoning: 'classifier returned empty output (contract bug)' };
    } catch (_) {
      return { verdict: 'target_unavailable', reasoning: 'classifier failed (GitLab|Gitea)' };
    }
  }
  try {
    return classifier.classifyIssue(issueIid, root);   // <-- UNCHANGED, byte-for-byte
  } catch (_) {
    return { verdict: 'target_unavailable', reasoning: 'classifier failed (GitLab|Gitea)' };
  }
}
```

- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — function at the
  same location it always lived (previously lines 876-882, now lines 877-901: +19 lines, one
  function).
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same shape, function
  now lines 881-905: +19 lines.
- No new `require`s needed: both files already destructure `execFileSync` from `child_process` at
  the top of the file (`const { execFileSync, spawnSync } = require('child_process');`), used
  elsewhere in each file for `git` calls.
- Env var name, spawn form (`execFileSync(process.execPath, [script, 'classify', '--issue', N,
  '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] })`), and output
  handling (trim → `JSON.parse` → return the parsed verdict object, with the same "empty output"
  message as canonical) match canonical's contract at `scripts/kaola-workflow-claim.js:1095-1101,
  1114-1125`.
- Deliberately NOT ported: canonical's retry loop (`MAX_ATTEMPTS`, `syncSleepMs`/backoff,
  `classifySubprocessError`, `isTransientFetchStderr`, the `KAOLA_ISSUE_STATE_SNAPSHOT` env
  injection). The brief was explicit that retry/backoff exists to guard a REAL subprocess against
  transient faults, and the mock is a static, controlled test double that cannot fault — so a
  single spawn attempt is the correct-sized mechanism, not a truncated port of the real one. I did
  not add `KAOLA_ISSUE_STATE_SNAPSHOT` passthrough either: it feeds a local-roadmap-evidence read
  that ADR 0018 §5 already retired classifier-side (per `test-forge-bundle-lane.js:156-159`), and
  the shared static mock script (`{verdict:'green', ...}` unconditionally) ignores both argv and
  env, so nothing in the judge test exercises it. Adding it would have been unfalsifiable
  ornamentation, not a contract requirement.
- The catch-all failure message stays per-port (`'classifier failed (GitLab)'` /
  `'classifier failed (Gitea)'`), matching each file's own existing convention rather than
  homogenizing it — these are hand-ports, not byte-mirrors, and that divergence was already there
  before this change.

## Confirmation: the non-mocked path is unchanged
`classifier.classifyIssue(issueIid, root)` — the pre-existing in-process call — is untouched,
same line, same arguments, same try/catch wrapper, same fallback message. It only now sits behind
an `if (classifierMock) { ... }` early-return block instead of being the entire function body. A
comment in both files states explicitly that the normal path stays in-process and only the mock
branch is new (see the `#984/#985` comment ahead of the branch in each file).

## Gates — each exit code echoed separately, no pipes

| Gate | Exit code |
|---|---|
| `node scripts/test-forge-bundle-lane.js` | **0** — "forge bundle lane: all 59 assertions passed" (was: exit 1, 37 passed / 22 failed, all 22 in gitlab/gitea) |
| `node scripts/validate-script-sync.js` | **0** — "OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync." Confirms the two forge ports are still correctly classified as export-superset hand-ports, not flagged for byte-divergence. |
| `node scripts/validate-workflow-contracts.js` | **0** — "Workflow contract validation passed" |
| `node scripts/validate-kaola-workflow-contracts.js` | **0** — "Kaola-Workflow Codex contract validation passed" |
| `node scripts/simulate-workflow-walkthrough.js` (full, unsharded) | **0** — "Workflow walkthrough simulation passed", `{"scenarios":186,"ran":186,"passed":186,"failed":0}` |

`node --check` also confirmed both edited files parse cleanly.

## What in the brief turned out to be WRONG
Nothing. Every claim in the brief re-verified exactly as stated:
- Canonical's seam is at `kaola-workflow-claim.js:1095-1101` (confirmed, `classifyIssue` starts at
  line 1095).
- Both ports' pre-change `classifyIssue` were exactly `return classifier.classifyIssue(issueIid,
  root)` wrapped in a try/catch — gitlab at line 876-882, gitea at line 880-886 (off by ~4 lines
  from the brief's cited 880/884 due to other agents' uncommitted edits already in this worktree
  ahead of that function, not a wrong claim about the shape).
- `editionSupportsClassifierMock()` in `test-forge-bundle-lane.js` (lines 185-187) is defined but
  never called anywhere in the file — it's a stale doc-only artifact from before this seam existed,
  now superseded by the fix rather than something the fix needed to reconcile with. Worth flagging
  to whoever owns that test file next: the function and its explanatory comment (lines 171-187)
  now describe a limitation that no longer holds.
- Baseline reproduced exactly as described: 37 passed / 22 failed pre-fix, all 22 in gitlab/gitea.

## Not committed
Per instruction, nothing was staged or committed. `git status --porcelain` in the worktree
(`.kw/worktrees/bundle-984-985`) shows extensive pre-existing uncommitted changes from other
concurrent agents (routing surfaces, CHANGELOG, other production scripts, ADR 0018) — none of that
is mine; my footprint is exactly the two `classifyIssue` functions described above.
