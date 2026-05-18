# Planner Output: issue-46

## Summary

The script layer is already correct (`scripts/kaola-workflow-claim.js` lines 1422-1441 return `verdict: 'no_target'` exit 1 when `--target-issue` is absent). The defect is purely at the **agent/prose contract** layer: `commands/workflow-next.md` lines 38-39 explicitly authorize autonomous issue selection ("issue selection when there is one unambiguous open issue"), which directly contradicts issue #44's principle ("agent owns reasoning"). Issue #46 closes the loop by making single-issue stop the agent-facing default and removing the foot-gun phrasing.

## Approach A — Prose-Only Surgical Edit (RECOMMENDED)

**Shape:** Edit existing prose surfaces; no new mechanism, no new env var.

**Concrete edits:**
1. `commands/workflow-next.md` lines 36-43 (Goal-Driven Autonomy paragraph): remove the clause "issue selection when there is one unambiguous open issue" from the autonomous-bookkeeping list.
2. `commands/kaola-workflow-phase6.md` after line 664: append a new `## Completion Contract` section (~15-25 lines).
3. `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — extend `## Goal Contract` with a parallel completion-stop paragraph.
4. `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — extend `## Goal Contract` with a parallel single-issue stop clarification.
5. `README.md` `## Autonomy And Goal Contract` — add /goal template warning against "next issue in line" phrasing.
6. `commands/workflow-init.md` — add single-issue /goal template example.
7. `scripts/validate-kaola-workflow-contracts.js` and `scripts/validate-workflow-contracts.js`: add assertIncludes checks for new section headings and warning phrases.

**Pros:** Architecturally consistent with issue #44; zero new code; surgical; mergeable in one PR; reversible.
**Cons:** Relies on agent compliance with prose (same trust model as rest of workflow).
**Risks:** Low.
**Complexity:** Low (~7 file edits, no logic changes, contract test additions).

## Approach B — Prose + KAOLA_AUTOCONTINUE Env Var (NOT RECOMMENDED)

**Shape:** Approach A plus opt-in `KAOLA_AUTOCONTINUE=1` env var.

**Pros:** Explicit opt-in for power users.
**Cons:** Directly contradicts issue #44's principle; YAGNI; issue body labels it "optional"; creates attractive nuisance (agents will set it themselves). Re-introduces script-side auto-pick under a different name.
**Risks:** Medium (regression risk).
**Complexity:** Medium.

## Approach C — Prose + Phase 6 Halt Receipt (Alternative)

**Shape:** Approach A plus `cmdFinalize` writes a completion-receipt.json that the next `/workflow-next` reads.
**Pros:** Small observable enforcement surface.
**Cons:** Adds script logic to fix a prose problem (violates #44 separation); receipt location complex when worktree is removed.
**Risks:** Medium-low.
**Complexity:** Medium.

## Architectural Fit

| Approach | #44 Alignment | New Mechanism | Reversibility |
|----------|---------------|---------------|---------------|
| A (prose-only) | Strong | None | Trivial |
| B (env var) | Violates | Env var + plumbing | Moderate |
| C (receipt) | Weak | Receipt file + reader | Moderate |

## Recommendation: Approach A

Rationale: Root cause is prose; fix should be prose. Script layer already correct. Test coverage belongs in `validate-workflow-contracts.js` (prose-content assertion harness). Single PR, single revert, no env-var sprawl.

## Items Explicitly NOT To Build

- KAOLA_AUTOCONTINUE env var
- Any change to `cmdStartup` / `cmdPickNext` `no_target` path — already correct
- Any new phase or new `/workflow-*` command
- Any new completion-receipt artifact
- A new Case 18 in `simulate-workflow-walkthrough.js` — walkthrough tests script behaviors; prose contracts belong in `validate-workflow-contracts.js`

## Missing Facts

1. `/goal` template literal text — if a literal `/goal` file exists with hard-coded "next issue in line", it becomes mandatory edit. Phase 1 did not surface such a file.
2. Phase 6 line budget cap — if kaola-workflow-phase6.md has an undocumented size cap, new section may need to be tightened.
3. Codex SKILL Stop-hook semantics — if Codex auto-continues differently, SKILL.md mirrors may need additional language.

None would shift recommendation from Approach A.
