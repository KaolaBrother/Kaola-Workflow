evidence-binding: n5-docs 8b07cd59c8de

## n5-docs — #636 decision record (doc-updater)

Wrote `docs/decisions/D-636-01.md` (id confirmed free: `ls docs/decisions/ | grep D-636` returned
nothing before this write). File does not exist under any other `D-636-NN` variant, so `D-636-01`
is the correct id.

Content ground truth checked against:
- `kaola-workflow/issue-636/.cache/n1-plan.md` (edit map — the 12-file scope, the two-splice forge
  hazard, the `#611`-fork SKILL-only risk callout, the two PIN markers).
- `kaola-workflow/issue-636/.cache/n3-review.md` (verdict: pass, findings_blocking: 0 — orphaned-
  assertion sweep clean, `#611`-fork shrink landed in all four validators, byte mirror intact,
  `mr|pr)` pins untouched, oracles + full four-chain green).
- `kaola-workflow/issue-636/.cache/n4-adversary.md` (verdict: pass, findings_blocking: 0 — NOT-
  REFUTED across 5 attack vectors incl. the four-chain-red scenario the shaping run's adversary
  had specifically proved was the risk).
- `git diff --stat` (12 files changed: `commands/kaola-workflow-plan-run.md` + 2 forge command
  siblings, 3 SKILL.md + `scripts/test-route-reachability.js` +
  `scripts/validate-workflow-contracts.js` + its byte mirror + `scripts/validate-kaola-workflow-contracts.js`
  + gitlab/gitea contract validators) and a direct `git diff` read of the GitHub command file
  confirming the `<!-- PIN: teammate-mode -->` marker placement and the end-splice tail.

No claim in D-636-01.md goes beyond what these four sources state. Touched no file other than
`docs/decisions/D-636-01.md` (CHANGELOG.md is n6-finalize's; no code files touched).

delegation_outcome: completed
