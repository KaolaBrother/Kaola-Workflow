# Code Explorer Output — issue-169

## 1. `claimExplicitTarget()` — full function body

**File:** `scripts/kaola-workflow-claim.js`, lines 428–444

```js
function claimExplicitTarget(root, args) {
  const targetIssue = args.targetIssue || args.issue;
  if (!Number.isFinite(targetIssue) || targetIssue <= 0) {
    return { status: 'no_target', claim: 'none', project: null, issue: null, reasoning: '--target-issue <N> required' };
  }
  const classified = classifyIssue(root, targetIssue);
  if (classified.verdict === 'blocked') {
    return { status: 'user_target_blocked', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'red') {
    return { status: 'user_target_red', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'target_unavailable') {
    return { status: 'target_unavailable', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  return claimProject(root, Object.assign({}, args, { issue: targetIssue, project: args.project || projectNameForIssue(root, targetIssue) }));
}
```

**Key gap:** No case for `target_unverified` — falls through to `claimProject()`.

`classifyIssue()` subprocess call pattern (lines 360–375):
```js
execFileSync(process.execPath, [classifier, 'classify', '--issue', String(issueNumber), '--json'], ...)
```
Maps exit code 2 → `{ verdict: 'owned' }`, subprocess error/empty → `{ verdict: 'target_unavailable' }`.

## 2. `kaola-workflow-classifier.js` — offline mode, verdicts, CLI

**CLI parseArgs** (`parseArgs`, lines 182–188):
```js
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--json') { args.json = true; continue; }
  }
  return args;
}
```
`cmdClassify()` calls `parseArgs(process.argv.slice(3))` — expects `process.argv[2] === 'classify'`. Only valid form: `node classifier.js classify --issue N [--json]`.

**Offline path** (lines 334–351):
```js
if (OFFLINE) {
  const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
  let labels = [];
  let body = '';
  if (fs.existsSync(roadmapFile)) {
    // parse next_step for depends-on and area labels
    body = content;
  }
  const result = classify({ number: args.issue, labels, body }, activeFolders, root);
  process.stdout.write(JSON.stringify(result) + '\n');
  return;
}
```

**Critical gap:** When `OFFLINE=1` AND `.roadmap/issue-N.md` does NOT exist → proceeds with empty labels/body → `classify()` returns `green`. No `target_unverified` verdict exists.

**All current verdicts:**
| Verdict | Condition |
|---------|-----------|
| `green` | No overlap, no block |
| `yellow` | Shared-infra or area-label overlap |
| `red` | File overlap or closed issue |
| `blocked` | Dependency unresolved or remote claim |
| `target_unavailable` | `gh issue view` fetch failed (online only) |

## 3. Step 0b in `commands/workflow-next.md` (lines 124–143)

Fields extracted from STARTUP_OUT:
```bash
KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
KAOLA_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
```

**Missing:** `verdict` and `reasoning` — `KAOLA_VERDICT` and `KAOLA_REASONING` not extracted.

## 4. Step 0b in `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (lines 113–120)

Fields extracted:
```bash
PICK_NEXT_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
```

**Missing:** `verdict` and `reasoning`. Note: project variable is `PICK_NEXT_PROJECT` here vs `KAOLA_PROJECT` in commands/workflow-next.md.

## 5. `testClassifierOfflineBypassesFailClosed` (lines 2337–2363)

```js
function testClassifierOfflineBypassesFailClosed() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-fail-closed-offline-'));
  try {
    const binDir = path.join(tmp, 'bin');
    writeGhShimFailingIssueView(binDir);
    // Uses runNode which sets KAOLA_WORKFLOW_OFFLINE=1
    const result = runNode(claimScript, ['startup', '--target-issue', '156'], tmp);
    assert(!result.signal, ...);
    assert(result.status === 0, ...);
    const parsed = JSON.parse(result.stdout.trim());
    assert(parsed.claim === 'acquired' || parsed.claim === 'owned', ...);
    // No roadmap entry planted for issue 156
    assert(fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-156')), ...);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
```

**Current behavior asserted:** offline + no roadmap entry + no active folder → `claim: 'acquired'`, folder created. This is the bad behavior issue #169 fixes. This test must be updated.

Companion online test: `testClassifierFailClosedOnRemoteError` (lines 2307–2335) — asserts `claim === 'none'`.

## 6. `validate-script-sync.js`

**COMMON_SCRIPTS list** (lines 39–50) — 10 files synced between `scripts/` and `plugins/kaola-workflow/scripts/`:
- `kaola-workflow-claim.js`
- `kaola-workflow-active-folders.js`
- `kaola-workflow-classifier.js`
- `kaola-workflow-closure-audit.js`
- `kaola-workflow-repair-state.js`
- `kaola-workflow-resolve-agent-model.js`
- `kaola-workflow-roadmap.js`
- `kaola-workflow-sink-merge.js`
- `kaola-workflow-sink-pr.js`
- `validate-workflow-contracts.js`

**Logic:** `readOrNull()` reads each file, `Buffer.equals()` compares. Exits 1 with `cp` fix command on mismatch. Does NOT check `simulate-workflow-walkthrough.js` (different test surfaces), `kaola-workflow-compact-context.js` (Claude-only), `validate-kaola-workflow-contracts.js` (Codex-only).

## 7. `.roadmap/` directory structure

Only file: `kaola-workflow/.roadmap/issue-104.md`

Format:
```
issue: #104
title: feat(workflow): agent-judged path selection + fast-mode subagent enforcement
status: open
workflow_project: issue-104
next_step: phase 2 ideation
```

Fields used by offline classifier: `next_step` (for `depends-on:#N` pattern), full content as `body`.
Fields used by `projectNameForIssue()`: `workflow_project`.

## 8. Verdict naming convention

All lowercase snake_case. Classifier subprocess verdicts: `green`, `yellow`, `red`, `blocked`, `target_unavailable`. Claim status fields: `no_target`, `owned`, `acquired`, `user_target_blocked`, `user_target_red`, `target_unavailable`, `target_occupied`. `target_mismatch` appears in doc prose ONLY — NOT in JS code.

## 9. plugins vs scripts relationship

Regular file copies, NOT symlinks. `validate-script-sync.js` uses `Buffer.equals()` to enforce byte identity. Fix command: `cp "scripts/$f" "plugins/kaola-workflow/scripts/$f"`.

## 10. Existing classifier CLI tests

All indirect via `startup --target-issue N` → `claimExplicitTarget` → `classifyIssue()` subprocess (for fail-closed/offline tests). Direct classifier tests use `classify --issue N` pattern. No dedicated `--help` or top-level `--issue N` tests exist.
