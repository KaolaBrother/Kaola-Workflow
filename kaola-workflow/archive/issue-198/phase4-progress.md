# Phase 4 — Implementation progress: issue-198 (fast-path widening)

Design source: `docs/investigations/fast-path-widening-2026-05-30.md` (Pillars 1-3). The design was already approved; this issue translated it into the contract surface across all editions. Locked spec: `.cache/contract-spec.md` (the canonical tokens + verbatim prose, code-architect-produced, advisor-reviewed).

## Implementation (Workflow-orchestrated, fan-out by edition/file)
Pillars 1-3 applied to the full contract surface, with validators as the spec (token-locked):

- **Pillar 1 — select on uncertainty**: `## Fast Eligibility` section (mechanical vs design; ≤ 5 files; all v1 vetoes retained; ≥ 2 materially-different approaches → design choice stays full). Router rubric (Step 0a-1) + path announcement reframed to the discriminator.
- **Pillar 2 — harden the hatch**: `approach_ambiguity` escalation trigger (planner asked one-vs-many); file-overflow now relative to the declared write set + absolute backstop of 6; canonical `escalated_to_full: <trigger> — <detail>` format (U+2014 separator). Retained triggers unchanged.
- **Pillar 3 — mandatory delegated review**: delegated `code-reviewer` mandatory for > 1 file or any production-path file; self-review only for the trivial band.

## Files changed (20, excluding workflow folder)
- 6 fast files: `commands/kaola-workflow-fast.md` + gitlab/gitea command twins + 3 `skills/kaola-workflow-fast/SKILL.md`.
- 6 router files: `commands/workflow-next.md` + gitlab/gitea twins + 3 `skills/kaola-workflow-next/SKILL.md`.
- 5 validators: `scripts/validate-workflow-contracts.js` (+ byte-identical `plugins/kaola-workflow/scripts/` twin), `scripts/validate-kaola-workflow-contracts.js`, gitlab + gitea contract validators — additive assertions for the 8 canonical tokens.
- `scripts/test-fast-audit.js`: +2 isolated-unit assertions proving the audit parses `approach_ambiguity` (38 → 40). `kaola-workflow-fast-audit.js` unchanged (reason-agnostic).
- `README.md`, `CHANGELOG.md`.

## Verification evidence
- Token matrix: all 6 fast files carry all 8 tokens; all 6 routers carry mechanical/≤ 5/design choice/materially-different; ZERO stray `≤ 2` / "two closely related files" across all 12 contract files.
- `validate-workflow-contracts.js` byte-identical with its twin (validate-script-sync OK).
- Simulators untouched (regression guard intact).
- Full `npm test` (claude+codex+gitlab+gitea): exit 0; test-fast-audit 40 assertions; all walkthroughs pass.

## AC walkthrough-case decision (surfaced, not silently capped)
The 4 AC "walkthrough cases" (mechanical-medium→fast PASSED; design-medium→approach_ambiguity; scope-creep→file-overflow; >1-file self-review→rejected) test **agent-judgment** that no JS script computes (claim.js takes `KAOLA_PATH=fast` as a given; there is no eligibility/overflow classifier). They are enforced as **contract + validator assertions** across all editions. The single genuinely script-observable slice — the #197 audit parsing the new `approach_ambiguity` reason — IS covered (test-fast-audit F_AA). `simulate-workflow-walkthrough.js` remains a regression guard and still exits 0 unchanged. Independently confirmed correct by the adversarial reviewer (see `.cache/code-reviewer.md` #7).
