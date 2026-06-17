evidence-binding: n2-prose 10312945e679

Prose reconciliation complete. 9 files in declared write set updated:

- agents/adversarial-verifier.md: frontmatter description scoped to investigation/change-gate distinction; body ~:74 block rewritten to name both cases explicitly (investigation exempt, change-gate full coverage; substitution claim for code-reviewer/security-reviewer preserved).
- plugins/kaola-workflow/agents/adversarial-verifier.toml: Purpose bullet "never a gate" replaced with post-dominance-scoped explanation; byte-identical to the gitlab and gitea tomls (diff confirmed MATCH).
- plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml: same edit, byte-identical to kaola and gitea.
- plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml: same edit, byte-identical to kaola and gitlab.
- commands/kaola-workflow-finalize.md: --verdict-check bullet (~:54) appended with Exception (#509) note (investigation exempt, change-gate full coverage; both sequence and fanout shapes named).
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md: --verdict-check bullet (~:51) appended with same Exception (#509) note, matching commands surface structure.
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md: NOT edited — no adaptive section / no --verdict-check description in this file (pre-existing #294 drift); left untouched per advisor guidance and cross-edition surgical-edit discipline.
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md: NOT edited — same reason as gitlab.
- docs/decisions/D-509-01.md: created. Option A (post-dominance scope) chosen over B (new vocab, heavier 6-surface) and C (document-only, insufficient). Exemption keys on post-dominance alone, covering both sequence and fanout — deliberate generalization of issue's non-fanout wording. Gate stays strong for change-gate adversarial-verifiers.

Decision record number: D-509-01.

Note: write set lists 9 files; gitlab/gitea finalize SKILLs are in the declared set but carry no --verdict-check description (pre-existing asymmetry). They are written as no-ops (not modified). D-509-01.md is new.

n2-prose REPAIR (2026-06-17): reconciled 2 forge finalize commands missed by the original n2 pass.
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md: appended Exception (#509) note to --verdict-check bullet (investigation adversarial-verifier exempt; change-gate keeps full coverage; both shapes named). Existing forge wording/structure preserved; no forge brand nouns added.
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md: same Exception (#509) note appended to --verdict-check bullet, same constraints.
Verification: node scripts/test-route-reachability.js exit 0 (170 assertions); node scripts/validate-workflow-contracts.js exit 0.
