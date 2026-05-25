# Planner — Issue #161 Ideation

## Approaches Evaluated

### Approach A — Docs-only contract in `docs/api.md` + validation guard

**What ships in #161:**
- New `## Closure Contract` section in `docs/api.md` containing: the 7 invariants, the receipt schema as a fenced JSON block with per-field enum documentation, and an explicit "forward-compatibility rule"
- A flow-mapping **table** mapping each surface (`finalize`, `sink-merge`, `watch-pr`/`watch-mr`, `sink-pr` fallback) to which invariants/receipt fields it owns and which it currently violates (silent `catch`)
- A "Follow-up scope" subsection naming #162–#165 against specific invariants/fields
- One `assertConcept('docs/api.md', 'closure contract', [...])` added to both `validate-kaola-workflow-contracts.js` and `validate-workflow-contracts.js`

**Deferred to #162–#165:** all code emission, all enforcement, the audit subcommand, cross-forge parity fixes.

- **Pros:** Smallest surgical change; zero risk to forge runtimes; matches design-issue nature
- **Cons:** Schema lives only as prose — #164 must re-transcribe it into code, risking drift
- **Risk:** Low
- **Complexity:** Small
- **Architectural fit:** Excellent — mirrors how Sink API and stale-worktree contracts are already documented

---

### Approach B — Docs contract + a single exported schema constant (RECOMMENDED)

**What ships in #161:** everything in Approach A, **plus** a single forge-agnostic, runtime-free schema module — `scripts/kaola-workflow-closure-contract.js` (+ plugin mirrors) exporting:
```js
const CLOSURE_RECEIPT_FIELDS = { archive: ['closed','abandoned','skipped','failed'], roadmap_source_removed: ['removed','absent','failed'], /* ... */ };
const CLOSURE_INVARIANTS = [ /* 7 short ids + descriptions */ ];
function emptyReceipt(project, issueNumber) { /* returns object with all step fields defaulted to 'failed'/'kept' and warnings:[] */ }
module.exports = { CLOSURE_RECEIPT_FIELDS, CLOSURE_INVARIANTS, emptyReceipt };
```

- **Pros:** Single machine-readable source of truth; #164 imports `emptyReceipt()` instead of re-transcribing; failure-defaulted `emptyReceipt()` encodes the "fail-loud" philosophy as the default shape; forward-compat is structural
- **Cons:** New file × 3 forge trees; constant is unused until #164 (potential "dead code" objection); triplication re-creates drift risk if not guarded
- **Risk:** Low-medium (mitigated by byte-equality sync assertion)
- **Complexity:** Small-Medium
- **Architectural fit:** Good with caveat — triplicating a pure-data constant re-introduces the drift risk the issue targets

**Important caveat:** triplicating re-creates drift risk. Must add `validate-script-sync` assertion that three copies are byte-identical. If byte-equality sync can't be cleanly achieved in this issue's footprint, **fall back to Approach A**.

---

### Approach C — Docs contract + enforcement stubs (NOT recommended)

**What ships in #161:** Approach B plus skeleton `closure-audit` stub + `--receipt` flag on `finalize` with partially-populated receipt.

- **Pros:** Demonstrates contract is implementable
- **Cons:** Crosses into implementation; overlaps #164/#165 scope; stubs emit misleading audit signal; triples change surface
- **Risk:** High — scope creep, premature partial behavior, merge conflicts with #164/#165
- **Architectural fit:** Poor for a design issue

---

## Recommendation: Approach B (fall back to A if sync guard not achievable)

Rationale:
1. The single biggest failure mode this initiative targets is **drift**. `emptyReceipt()` makes doc-vs-code drift structurally impossible for #164.
2. Stays true to "design issue": constant has **no I/O and no caller**, changes zero runtime behavior.
3. Failure-defaulted `emptyReceipt()` encodes the core philosophy shift as the *default shape*.

---

## Direct Answers to Design Questions

**1. `docs/api.md` vs new `docs/closures.md`?**
Extend `docs/api.md`. The closure contract is an integration contract (subcommand JSON output + cross-forge shape), exactly what `docs/api.md` already documents. Reserve a dedicated doc only if the contract grows past ~1 screen.

**2. Schema in docs only, or also code?**
Prefer code constant (Approach B) as pure-data, no-I/O exported object. If three-tree sync can't be guaranteed, docs-only (Approach A) is acceptable. Do NOT add commented template inside an existing sink file.

**3. Right level of code change?**
Docs + minimal schema constant (B), with the constant published but unused this issue. Not enforcement stubs (C).

**4. Form of flow mapping?**
A **table in `docs/api.md`**, columns: `Surface | Trigger | Invariants owned | Receipt fields it should populate | Current gap`. Greppable, assert-able, one-glance review.

---

## Explicitly OUT OF SCOPE for #161
- Writing or emitting any closure receipt from any sink/finalize path (→ #164)
- Converting `catch(_){}` to fail-loud / hardened roadmap cleanup (→ #162)
- Label-cleanup guarantees and `issue_number`-from-state fallback (→ #163)
- The `closure-audit` subcommand (→ #165; AC #5 satisfied only when #165 ships)
- Fixing cross-forge parity gaps (→ #162/#163/#164)

---

## Files to Touch in #161

- `docs/api.md` — add `## Closure Contract` section
- `scripts/validate-kaola-workflow-contracts.js` — add closure-contract `assertConcept` guard
- `scripts/validate-workflow-contracts.js` — same guard
- (Approach B only) new `scripts/kaola-workflow-closure-contract.js` + plugin mirrors + sync guard
- `docs/workflow-state-contract.md` — optional one-line cross-reference
