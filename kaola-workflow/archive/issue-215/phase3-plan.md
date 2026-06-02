# Phase 3 - Plan: issue-215

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/simulate-workflow-walkthrough.js` | Add 3 test functions after L611; register 3 calls after L4096 | Root walkthrough: heading test, mixed-marker test, discriminator test |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add 2 inline `withForge` blocks after L537 | GitLab harness: heading test + mixed-marker test (both required for family-tracking coverage) |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add 2 inline `withForge` blocks after L543 | Gitea harness: heading test + mixed-marker test (both required for family-tracking coverage) |
| `scripts/kaola-workflow-classifier.js` | Replace `sectionBody()` L129-142 with fence-aware version | Canonical source — fix once, cp to Codex |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | `cp` from canonical — do NOT hand-edit | Byte-identity enforced by validate-script-sync.js |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Hand-edit `sectionBody()` L97-110 | GitLab forge mirror (not in sync list) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | Hand-edit `sectionBody()` L102-115 | Gitea forge mirror (not in sync list) |

### Build Sequence
1. Add all tests (Phase A, parallel) — failing-first for T1/T2/T2g/T2gt; T3 is a guard (already passes)
2. Verify failing: `node scripts/simulate-workflow-walkthrough.js` MUST FAIL on new heading + mixed-marker tests; forge suites must fail on their new blocks
3. Fix canonical source + cp to Codex (T4)
4. Fix gitlab + gitea sources (T5, T6, parallel)
5. Full suite: `node scripts/validate-script-sync.js` → `node scripts/simulate-workflow-walkthrough.js` → `npm test`

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1, T2, T3 | Disjoint write sets (3 separate test files) |
| B | T4, T5, T6 | Disjoint write sets (canonical+codex / gitlab / gitea); T4 owns both classifier copies atomically |
| C | T7 | Serial final validation |

### Fence-Aware sectionBody Implementation

```js
function sectionBody(content, heading) {
  const lines = String(content || '').split('\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escaped + '\\s*$');
  // issue #215: fence-aware — a fenced `## ` heading must not trigger the h2 boundary.
  // Family-only tracking: close only on a same-family delimiter (backtick closes backtick,
  // tilde closes tilde). Run-length not tracked — workflow output never uses 4+ backtick fences.
  const fenceRe = /^(`{3,}|~{3,})/;
  let inFence = false;
  let fenceFamily = '';
  let i = 0;
  for (; i < lines.length; i++) {
    const fm = lines[i].trim().match(fenceRe);
    if (fm) {
      const fam = fm[1][0];
      if (!inFence) { inFence = true; fenceFamily = fam; }
      else if (fam === fenceFamily) { inFence = false; fenceFamily = ''; }
    }
    if (!inFence && headRe.test(lines[i])) { i++; break; }
  }
  if (i >= lines.length) return '';
  const out = [];
  for (; i < lines.length; i++) {
    const fm = lines[i].trim().match(fenceRe);
    if (fm) {
      const fam = fm[1][0];
      if (!inFence) { inFence = true; fenceFamily = fam; }
      else if (fam === fenceFamily) { inFence = false; fenceFamily = ''; }
    }
    if (!inFence && /^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}
```

Safety claim (correctly scoped): errs toward false RED for any fence *within* `## Scope`. A theoretically-unclosed fence before `## Scope` would cause false GREEN, but this is unreachable in practice (`## Scope` is always the 2nd section after `## Status`).

### External Dependencies
None — Node.js built-ins only (string split, regex test, boolean flag).

---

## Task List

### Task 1: Root walkthrough — add 3 tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY

**T1a: testClassifierFastScopeFenceHeadingRed** (failing-first)
Insert after the closing brace of `testClassifierFastScopeFenceCommentRed` (L611).
`## Scope` body:
```
```sh
## Some Heading
```
- Write Set: scripts/kaola-workflow-claim.js
- Acceptance: node x
```
Candidate overlaps `scripts/kaola-workflow-claim.js`. Assert `result.verdict === 'red'` AND `result.reasoning.includes('exact file path')`.

**T1b: testClassifierFastScopeFenceMixedMarkerRed** (failing-first — exercises family-tracking)
`~~~` is NESTED INSIDE the backtick fence as content (not as a new fence opener):
```
```sh
~~~
## Heading
```
- Write Set: scripts/kaola-workflow-claim.js
- Acceptance: node x
```
Family-blind toggle: toggles off on `~~~`, breaks on `## Heading` → GREEN (wrong). Family-tracking: ignores `~~~` (family=tilde, but open fence is backtick) → RED (correct).
Assert `result.verdict === 'red'` AND `result.reasoning.includes('exact file path')`.

**T1c: testClassifierFastScopeFenceInFencePathRed** (discriminator guard — NOT failing-first; already RED before fix)
Path written INSIDE a fence in `## Scope`:
```
```sh
- Write Set: scripts/kaola-workflow-claim.js
```
```
Assert `result.verdict === 'red'`. Locks out future pre-strip regression that would drop in-fence paths. Must PASS before AND after fix.

**Registration**: add 3 calls after L4096 (`testClassifierFastScopeFenceCommentRed();`):
```js
testClassifierFastScopeFenceHeadingRed();
testClassifierFastScopeFenceMixedMarkerRed();
testClassifierFastScopeFenceInFencePathRed();
```

- Validate: `node scripts/simulate-workflow-walkthrough.js` — MUST FAIL on T1a and T1b (not T1c) before source fix

### Task 2: GitLab test harness — add 2 withForge blocks
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY

**Block 1 (heading test, IID 30/31)**: after the #213 block (L537)
```js
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js' };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-heading-');
  const dir = writeState(root, 'fast-fence-heading-project', 30);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-heading-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n## Some Heading\n```\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(31, root);
  assert.strictEqual(result.verdict, 'red');
});
```

**Block 2 (mixed-marker test, IID 32/33)**: after Block 1
```js
withForge({
  viewIssue(issueIid) {
    return { issue_iid: issueIid, number: issueIid, state: 'open', labels: [], body: 'touches: plugins/kaola-workflow-gitlab/scripts/claimed.js' };
  }
}, () => {
  const root = tempRoot('kw-gl-fast-fence-mixed-');
  const dir = writeState(root, 'fast-fence-mixed-project', 32);
  fs.writeFileSync(path.join(dir, 'fast-summary.md'),
    '# Fast Summary: fast-fence-mixed-project\n\n## Status\nIN_PROGRESS\n\n## Scope\n```sh\n~~~\n## Heading\n```\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js\n- Acceptance: node x\n');
  const result = classifier.classifyIssue(33, root);
  assert.strictEqual(result.verdict, 'red');
});
```

- Mirror: #213 fence block at L520-537; `writeState`/`tempRoot`/`withForge` definitions at L28-75
- Validate: gitlab suite fails on new blocks before fix; exits 0 after

### Task 3: Gitea test harness — add 2 withForge blocks
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: none
- Parallel Group: A
- Action: MODIFY

**Block 1 (heading test, IID 30/31)**: after the #213 block (L543)
Same structure as gitlab Block 1 but with gitea paths:
- `tempRoot('kw-gt-fast-fence-heading-')`
- Write Set: `plugins/kaola-workflow-gitea/scripts/claimed.js`
- IIDs: 30/31

**Block 2 (mixed-marker test, IID 32/33)**: after Block 1
Same structure as gitlab Block 2 but with gitea paths:
- `tempRoot('kw-gt-fast-fence-mixed-')`
- Write Set: `plugins/kaola-workflow-gitea/scripts/claimed.js`
- IIDs: 32/33

- Mirror: #213 fence block at L526-543
- Validate: gitea suite fails on new blocks before fix; exits 0 after

### Task 4: Fix canonical classifier + cp to Codex
- File: `scripts/kaola-workflow-classifier.js` (canonical) + `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` (cp target)
- Write Set: `scripts/kaola-workflow-classifier.js`, `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
- Depends On: Task 1 (failing-first verified)
- Parallel Group: B
- Action: MODIFY

Replace `sectionBody()` at L129-142 with the fence-aware implementation above.
Then run: `cp scripts/kaola-workflow-classifier.js plugins/kaola-workflow/scripts/kaola-workflow-classifier.js`
Do NOT hand-edit the codex copy.

- Validate: `node scripts/validate-script-sync.js` (must show in-sync); `node scripts/simulate-workflow-walkthrough.js` exit 0

### Task 5: Fix GitLab classifier
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- Depends On: Task 2 (failing-first verified)
- Parallel Group: B
- Action: MODIFY

Replace `sectionBody()` at L97-110 with same fence-aware logic (hand-edited, same implementation).

- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` exit 0 (or via simulate-gitlab-workflow-walkthrough.js)

### Task 6: Fix Gitea classifier
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`
- Depends On: Task 3 (failing-first verified)
- Parallel Group: B
- Action: MODIFY

Replace `sectionBody()` at L102-115 with same fence-aware logic (hand-edited, same implementation).

- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` exit 0 (or via simulate-gitea-workflow-walkthrough.js)

### Task 7: Final validation
- Write Set: none
- Depends On: Tasks 4, 5, 6
- Parallel Group: C (serial)
- Action: VALIDATE

```bash
node scripts/validate-script-sync.js
node scripts/simulate-workflow-walkthrough.js
npm test
```

All must exit 0.

---

## Advisor Notes

**Gap found in architect output**: T2 (mixed-marker test) was marked root-only but must also run in both forge harnesses. The forge copies are hand-edited and not byte-synced — they're the least-protected copies. The heading test (T1) passes under both naive-toggle and family-tracking; T2 is the only discriminating test. Corrected in this plan: each forge harness gets both a heading block and a mixed-marker block.

**Safety claim scoping**: "errs toward false RED for any fence *within* `## Scope`" (not an absolute guarantee).

**Codex walkthrough**: does NOT test classifier fast-scope path — no codex walkthrough test needed.

---

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Gap was a narrow test-scope addition; orchestrator-synthesized correction per "main session may synthesize" clause; no new design decision required |
