# Planner Output: Issue #215 — Phase 2 Ideation

## Discriminating Constraint
The no-false-negative invariant: an approach that could produce a false GREEN is unacceptable. Current code INCLUDES fenced lines in the slice — the bug is the h2 line prematurely CLOSING the section, not in-fence paths being counted. Any fix must preserve inclusion while stopping the spurious boundary match.

---

## Approach 1 — inFence flag (marker-family-aware) — RECOMMENDED

**Summary:** Walk lines tracking fence-open state. On a trimmed line opening a fence (3+ ` or ~~~), record marker family + run length and enter fence state; close only on matching same-family marker. While inFence is true, suppress the `^##\s` boundary check. Apply to BOTH heading-location loop and body-collection loop.

**Pros:**
- Structurally incapable of dropping in-section paths — moves the boundary, never removes content → satisfies no-false-negative invariant by construction
- All failure modes (mis-tracked fence, unclosed fence) err toward over-inclusion → false RED (safe direction)
- Small (~6-10 lines per copy), dependency-free, mirrors cleanly into 4 copies
- Extends the #213 mental model reviewers already know

**Required correctness details (not optional):**
- Marker family: a `~~~` line inside a ` ``` ` fence must NOT close the fence. Record opening marker family and only close on matching family (same ` or ~ and run-length ≥ opening).
- Both loops must be fence-aware (heading-locator too, for precision)

**Risk:** Low (with marker-family handling).
**Complexity:** Small.

---

## Approach 2 — Pre-strip fenced content — REJECTED

**Summary:** Remove all fenced regions before running the heading/boundary scan.

**Cons (disqualifying):**
- Drops `- Write Set:` paths that live INSIDE a fence (which are currently extracted and counted correctly)
- Creates a new false-negative vector, violating the invariant
- More permissive than the buggy code for in-fence paths → can regress working cases

**Risk:** High. Rejected, not deferred.

---

## Approach 3 — Markdown AST library — REJECTED

**Summary:** Replace hand-rolled scan with a library that understands fenced blocks natively.

**Cons:**
- Adds runtime dependency to 4 scripts (including hand-edited forge mirrors)
- Overkill for well-controlled fast-summary.md format
- Large blast radius on byte-identity sync contract

**Risk:** Medium. **Complexity:** Large. Rejected.

---

## Recommendation

Approach 1 (marker-family-aware inFence flag). Only approach structurally incapable of false negatives. All failure modes err toward safe direction. Smallest change.

---

## Testing Strategy

1. Primary #215 test: `## ` h2 line inside fence above `- Write Set:` → assert RED (in all 3 harnesses)
2. Discriminator guard test: path INSIDE a fence in `## Scope` → assert RED for overlapping candidate. This passes under inFence, fails under pre-stripping. Locks out future pre-strip regressions.
3. Acceptance: `node scripts/simulate-workflow-walkthrough.js` → exit 0; `npm test` → exit 0; `node scripts/validate-script-sync.js` → confirms files 1↔2 byte-identical

---

## Do Not Build
- `validate-workflow-contracts.js:71` sectionBody — different function, different semantics
- Re-handle the `# ` (h1) case — #213 already covers it
- Markdown-parser dependency (Approach 3)
- Pre-strip fenced content (Approach 2)
- Diverge files 1↔2 — use `cp` after editing root canonical

---

## Missing Facts
None. All 7 files, call sites, sync contract, #213 test pattern, forge registration points verified.
