# Workflow Plan — issue #276

<!-- plan_hash: ac0af3e860d1e5af17cf009d5d07d4f9497b2eb1ff7bab6f863f415b6070df5b -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id       | role          | depends_on | declared_write_set | cardinality | shape    |
|----------|---------------|------------|--------------------|-------------|----------|
| impl     | tdd-guide     | —          | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review   | code-reviewer | impl       | —                  | 1           | sequence |
| finalize | finalize      | review     | CHANGELOG.md       | 1           | sequence |

## Node Ledger

| id       | status  |
|----------|---------|
| impl     | complete |
| review   | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (impl) | subagent-invoked | # Node impl evidence — issue #276 (tdd-guide) | |

| code-reviewer | subagent-invoked | # Node review evidence — issue #276 (code-reviewer) | |
| finalize (finalize) | subagent-invoked | # Node finalize evidence — issue #276 (finalize sink) | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
The detailed, resume-safe specification of the single mechanical fix.

### Problem (issue #276)
The contract-validator concept/inclusion helpers match pinned prose with raw,
whitespace-sensitive substring matching. A cosmetic Markdown line reflow of a
multi-word pinned phrase (split across a newline + indentation) makes the
substring absent and **false-fails** the gate even though the concept is intact.
Errs only toward false-negatives (over-strict); cannot let drift through.

### Fix — whitespace-normalize multi-word needles in 3 helpers
Add a `norm(s) = String(s).replace(/\s+/g, ' ')` helper and apply it to BOTH the
haystack and the needle in:
- `assertIncludes(file, needle)` → `assert(norm(read(file)).includes(norm(needle)), …)`
- `assertConcept(file, concept, terms)` → `const content = norm(read(file).toLowerCase());`
  and `terms.filter(term => !content.includes(norm(term.toLowerCase())))`
- `assertBefore(file, first, second)` → normalize content + both args, keep the
  ordering assertion (`indexOf(nf) < indexOf(ns)` on the normalized content)

Leave `assertNotIncludes` UNCHANGED (out of scope; a negative pin — normalizing it
could only widen what counts as "present", not the bug we are fixing).

Normalization is monotonic-safe for existing pins (a contiguous match survives a
whitespace-collapse on both sides) and adds reflow tolerance; a reworded/removed
concept still fails (different/absent words).

### Apply across all 5 validator copies (issue AC: consistent across editions)
1. `scripts/validate-workflow-contracts.js` (Claude) — norm + 3 helpers + guard/export
2. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (Codex) — **byte-identical**
   to #1 (`validate-script-sync.js` `COMMON_SCRIPTS` member; write both byte-for-byte)
3. `scripts/validate-kaola-workflow-contracts.js` (Codex-only validator) — norm + 3 helpers
4. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — norm + 3 helpers
5. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — norm + 3 helpers

### Testability (guard/export — Claude pair #1/#2 only)
The helpers run inline at module load (no exports, no `require.main` guard). To
unit-test them, insert AFTER the helper definitions and BEFORE the first
top-level assertion:
```js
if (require.main !== module) {
  module.exports = { norm, assertIncludes, assertConcept, assertBefore };
  return; // top-level return is legal in a CommonJS module scope
}
```
Run-as-script behavior (`require.main === module`) is byte-unchanged. Apply
identically to #1 and #2 (they must stay byte-identical). Ports #3–#5 get the
norm fix only (validated as renamed ports; not required to export).

### Regression test (node `impl`, in `scripts/simulate-workflow-walkthrough.js`)
Next to `testContractValidatorOfflineSkip`. RED→GREEN:
- `require('./validate-workflow-contracts.js')` to get the exported `assertConcept`.
- Write a fixture file at a repo-relative path (e.g. under
  `kaola-workflow/issue-276/.cache/`) whose pinned multi-word phrase is **wrapped
  across a line break + indentation**; assert `assertConcept(fixture, …)` does NOT
  throw (PASS — fails before the norm fix → the meaningful RED).
- Write a second fixture with the phrase **removed**; assert `assertConcept`
  THROWS (still correctly fails).
- Clean up the fixtures; register the test in the suite's run list.

### Acceptance (node `impl`)
- `node scripts/simulate-workflow-walkthrough.js` (new regression test passes)
- `node scripts/validate-workflow-contracts.js` (Claude, still green)
- `node scripts/validate-script-sync.js` (byte-identity #1≡#2 holds)
- `node scripts/validate-kaola-workflow-contracts.js` (Codex, green)
- gitlab/gitea contract validators green
- whole-suite gate at finalize: `npm test` green ×4 editions

### Out of scope
`assertNotIncludes`; single-token-pin behavior (unchanged); the byte-identity
freeze-time check (that is #274); `assertEveryDispatchHasModel` and other helpers.
