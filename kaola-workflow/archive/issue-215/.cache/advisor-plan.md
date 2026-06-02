# Advisor Gate: Phase 3 Plan — Issue #215

## Verdict
Fix logic is correct. Blueprint is implementable. One gap to fix before Phase 4.

## The Gap: Mixed-Marker Test Must Cover All 4 Classifier Editions

T2 (mixed-marker test, exercises family-tracking logic) is currently marked root-only. But:
- The heading test (T1) passes under BOTH naive-toggle and family-tracking — it doesn't discriminate.
- T2 is the ONLY test that distinguishes family-tracking from naive toggle.
- The forge copies (gitlab/gitea) are hand-edited, NOT in validate-script-sync.js — they're the least-protected, most drift-prone copies.
- If someone later simplifies a forge `sectionBody` to naive toggle, the heading test still passes and nothing catches it.
- This is precisely the bug class #215 fixes: #213 shipped a fix whose other half was untested.

**Concrete fix:** Add mixed-marker `withForge` block to BOTH forge harnesses (gitlab after heading block, gitea after heading block). ~15 lines each. Fails pre-fix (current code breaks on `## Heading` inside fence → not-red), passes post-fix (family-tracking ignores `~~~` inside backtick fence).

**Test geometry for forge mixed-marker blocks:**
```
```sh
~~~
## Heading
```
- Write Set: plugins/kaola-workflow-{gitlab,gitea}/scripts/claimed.js
```
Use IID 32/33 (or whatever is next after the heading-test IID).

## Secondary Note (non-blocking)
The safety claim "all failure modes err toward false RED" is overbroad. An unclosed fence BEFORE `## Scope` would leave the heading-locator stuck in inFence, never matching `## Scope`, returning '', dropping all paths → false GREEN. This is unreachable in practice (`## Scope` is always after `## Status`), so it doesn't block. Qualify the claim as: "errs toward false RED for any fence within `## Scope`."

## Architect Note
The architect conflated "root-only" for the discriminator test (T3, in-fence paths → still counted — this one genuinely doesn't vary by edition) with the mixed-marker test (T2 — must go wherever the family logic ships). Correct in the plan.
