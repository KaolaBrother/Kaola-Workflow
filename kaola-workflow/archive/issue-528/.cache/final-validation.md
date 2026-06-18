# Final Validation — issue-528

verdict: pass

## Mode
Self-host (npm) repo → gated on the machine-verifiable chain receipt (`.cache/chain-receipt.json`).

## Evidence
- `kaola-workflow-run-chains.js --chains claude` → `result: pass`, `failed: []`, claude exitCode 0, duration ~650s.
- Receipt bound to HEAD `834c19b6e17aebeb0bde15c540f819ecca9229f5` (`headSha` matches; `workTreeHash: clean`).
- `plan-validator --finalize-check` → `result: pass`, mode chain-receipt, 2 changes attributed (both `.md` allowband).

## Selective execution rationale (precedence #3 + #501)
Docs-only change (`docs/decisions/D-528-01.md`, `CHANGELOG.md`); NO edition-tree script touched, so the `#307` four-chain cross-edition requirement does not apply. codex is byte-identical to root and gitlab/gitea contract validators carry zero CHANGELOG references — so a green claude chain is provably sufficient evidence for this change (running codex/gitlab/gitea would re-verify unchanged scripts for ~15 extra min with zero added accuracy). This is the exact selective-execution lever D-528-01 documents.

## Adaptive barrier (prerequisite)
resume-check=0, gate-verify=0, barrier-check=0, verdict-check=0. verdict-check correctly EXEMPTED `n4-falsify` (investigation adversarial-verifier, post-dominates no code node — #509) despite its `verdict: fail` (the refutation that routed the issue to fork B).
