# Architect Blueprint: Issue #215 — Fence-Aware sectionBody()

## Design Decisions

- inFence flag + fenceFamily tracking, NOT run-length matching (workflow-generated fast-summary.md never uses 4-backtick fences)
- Suppress `^##\s` boundary in BOTH loops (heading-locator + body-collector)
- Toggle-before-boundary ordering: detect/flip fence marker FIRST, THEN evaluate boundary check
- Fence state continuous across both loops (conservative)
- Canonical→codex: `cp` only (validate-script-sync.js enforces byte-identity)
- Gitlab/gitea: hand-edit mirrors independently (NOT in sync list)
- Codex walkthrough does NOT test classifier fast-scope path — no codex test to author

## Concrete fence-detection implementation

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

Notes:
- `fenceRe` tests `lines[i].trim()` (captures indented fences)
- `fm[1][0]` reduces run to single-char family
- fence state shared across both loops
- toggle-before-boundary ordering in both loops

## Files to Modify

| File | Changes | Location |
|------|---------|----------|
| `scripts/simulate-workflow-walkthrough.js` | Add 3 test fns + 3 registrations | fns after L611; register after L4096 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add 1 inline `withForge` block | after L537 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add 1 inline `withForge` block | after L543 |
| `scripts/kaola-workflow-classifier.js` | Replace sectionBody() L129-142 | L129-142 |
| `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` | `cp` from canonical | L129-142 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Hand-edit sectionBody() | L97-110 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` | Hand-edit sectionBody() | L102-115 |

## Test Specifications

### Root walkthrough (simulate-workflow-walkthrough.js)

**T1: testClassifierFastScopeFenceHeadingRed** (failing-first — RED only after source fix)
```
## Scope content:
```sh
## Some Heading
```
- Write Set: scripts/kaola-workflow-claim.js
```
→ assert verdict === 'red' AND reasoning.includes('exact file path')

**T2: testClassifierFastScopeFenceMixedMarkerRed** (failing-first — exercises family-tracking)
The `~~~` is NESTED INSIDE the backtick fence (as content, not as fence opener):
```
## Scope content:
```sh
~~~
## Heading
```
- Write Set: scripts/kaola-workflow-claim.js
```
Family-blind toggle: toggles off on `~~~`, breaks on `## Heading` → GREEN (wrong).
Family-tracking: ignores `~~~` (family=tilde, but we're in backtick fence) → RED (correct).
→ assert verdict === 'red' AND reasoning.includes('exact file path')

**T3: testClassifierFastScopeFenceInFencePathRed** (discriminator guard — NOT failing-first, already RED before fix)
Path written INSIDE a fence in ## Scope:
```
## Scope content:
```sh
- Write Set: scripts/kaola-workflow-claim.js
```
```
→ assert verdict === 'red'. Locks out future pre-strip regression. Should PASS before and after fix.

Register all 3 after L4096 (`testClassifierFastScopeFenceCommentRed();`), before `testClassifierDependsOnGate();`.

### GitLab withForge block (test-gitlab-workflow-scripts.js, after L537)
IID 30/31 (next free after 28/29), tempRoot('kw-gl-fast-fence-heading-')
## Scope: `\`\`\`sh\n## Some Heading\n\`\`\`\n- Write Set: plugins/kaola-workflow-gitlab/scripts/claimed.js`
assert.strictEqual(result.verdict, 'red') — single assertion (matches harness style)

### Gitea withForge block (test-gitea-workflow-scripts.js, after L543)
Same pattern; gitea paths; tempRoot('kw-gt-fast-fence-heading-')

## Build Sequence

1. **Phase A — Add tests (parallel)**: T1 (root), T2 (gitlab), T3 (gitea) — disjoint write sets
2. **Verify failing-first**: `node scripts/simulate-workflow-walkthrough.js` MUST FAIL on new heading/mixed-marker tests
3. **Phase B — Fix sources (parallel)**: T4 (canonical+cp), T5 (gitlab), T6 (gitea) — disjoint
4. **Phase C — Validate**: `node scripts/validate-script-sync.js` → `node scripts/simulate-workflow-walkthrough.js` → `npm test`

## Task List

| Task | Write Set | Depends On | Validate |
|------|-----------|------------|---------|
| T1 root tests | simulate-workflow-walkthrough.js | — | walkthrough FAILS on new heading/mixed tests |
| T2 gitlab test | test-gitlab-workflow-scripts.js | — | gitlab test suite fails on new block |
| T3 gitea test | test-gitea-workflow-scripts.js | — | gitea test suite fails on new block |
| T4 canonical+codex | kaola-workflow-classifier.js + cp to codex | T1 | validate-script-sync OK; root walkthrough exit 0 |
| T5 gitlab source | kaola-gitlab-workflow-classifier.js | T2 | gitlab suite exit 0 |
| T6 gitea source | kaola-gitea-workflow-classifier.js | T3 | gitea suite exit 0 |
| T7 final | — | T4,T5,T6 | npm test exit 0 |

## Out of Scope
- Run-length / nesting-depth fence matching
- Codex walkthrough test (simulate-kaola-workflow-walkthrough.js)
- Indented/lazy fence edge cases beyond trim()
- Refactoring sectionBody into a shared module
- Touching extractFilePaths / AREA_PATH_REGEX / other path-extraction logic
- Heading-locator loop test coverage
