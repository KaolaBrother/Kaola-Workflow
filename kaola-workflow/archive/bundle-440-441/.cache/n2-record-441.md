evidence-binding: n2-record-441 22464eb8ff38

# Node n2-record-441 — Evidence

## Task
Author `docs/decisions/D-441-01.md` — a durable decision record transcribing the binding
settlements from GitHub issue #441 (D-420 Part 3: goal-conditioned bundles).

## Declared write set
- docs/decisions/D-441-01.md

## What was done
Authored `docs/decisions/D-441-01.md` as a formal ADR-style decision record, modeled on the
existing `docs/decisions/` records (D-440-01 sibling Part 2 record, D-429-01, D-420-01 parent,
D-427-01, D-430-01). The record is an implementation-settlement transcription of #441 — the
design is transcribed, not redesigned.

## Settlements transcribed (1:1 with issue #441)
1. Goal form (OQ-3 / settlement 1) — `parseGoal` reads `^goal:[ \t]*(.*)$` from `## Meta` via the
   SAME `classifier.sectionBody(content, 'Meta')` reader `parseLabels` uses; decoy-immune;
   READER only (no gate); freeze accepts goal-absent plans unchanged; hash-covered for free
   because `computePlanHash` covers the whole `## Meta` body.
2. Env pinned (settlement 2) — `KAOLA_GOAL` is the operator-side env entry; because subagent
   shells do not inherit it (#430), the goal text ALSO travels in scout/planner dispatch prompts
   (operator/orchestrator concern).
3. `goal_check` field (settlement 3) — machine-readable `goal_check: satisfied|unsatisfied|absent`
   added to the finalize receipt via `closure-contract.js` `CLOSURE_RECEIPT_FIELDS`.
4. Attestation seat (settlement 4) — emitted by `cmdFinalize` in `claim.js`, NOT `sink-merge.js`
   (per #427, the live flow never invokes it); ADVISORY in v1 (writes typed `goal_check`);
   flip-to-blocking deferred to #429 follow-up.
5. Scout integration (settlement 5) — issue-scout md + 3 toml twins gain the goal input + a
   `goal_alignment` recommendation note; cross-ref #430 (target-set integrity) so a
   goal-conditioned bundle still validates its claimed set.
6. Blocking semantics (settlement 6) — ADVISORY in v1; `goal_check` is informational receipt
   metadata; does not block claim or finalize; flip-to-blocking deferred to a follow-up.

## Style/grounding checks
- Title format matches the corpus: `# D-441-01. <description> (D-420 Part 3, issue #441)`.
- Metadata block (Date / Status: Accepted / Issue: #441 / Related) matches D-440-01 / D-429-01.
- Structure: Context → Decision (6 numbered settlements) → Consequences, matching sibling records.
- Parent linkage: D-420-01 (parent, leaves OQ-3 open) and D-420-02 (named OQ-3 owner) cited.
- Symbol references verified in-tree before writing:
  - `parseLabels` at plan-validator.js:183; `classifier.sectionBody(content, 'Meta')` at 507/803.
  - `computePlanHash` at plan-validator.js:783 covers the whole `## Meta` body.
  - `CLOSURE_RECEIPT_FIELDS` at closure-contract.js:20.
  - `cmdFinalize` is in claim.js (closure-contract required at claim.js:19; receipt built ~2765).
- Correctly transcribed the seat RELOCATION: D-420-01 [INV-12] placed the attestation at the
  `sink-merge.js` sink-seam; #441 settlement 4 moves it to `cmdFinalize` in `claim.js` per #427.

## Result
docs/decisions/D-441-01.md created. Single-file write set honored — no other files touched.
