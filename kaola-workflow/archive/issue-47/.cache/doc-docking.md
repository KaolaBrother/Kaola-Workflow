# Documentation Docking: issue-47

## Changed Files Reviewed
- `scripts/kaola-workflow-claim.js` — deleted runBootstrapClaimFirstAvailable, rewrote cmdBootstrap, added --target-issue validation
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — byte-identical mirror
- `scripts/simulate-workflow-walkthrough.js` — tests 6G/8I-a/b/c/12D/13A/13B rewritten
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — byte-identical mirror
- `scripts/validate-workflow-contracts.js` — L226 assertion updated
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — L226 updated (gap fix)
- `scripts/validate-kaola-workflow-contracts.js` — L182/L194 assertions updated
- `README.md` — L308 feature table + L520 auto-scan description updated
- `CHANGELOG.md` — [Unreleased] entry added
- `CLAUDE.md` — L14 explicit-target section updated

## Documents Checked

| Document | Status | Notes |
|----------|--------|-------|
| README.md | UPDATED | L308 feature table + L520 auto-scan → explicit-target description |
| CHANGELOG.md | UPDATED | Added bootstrap explicit-target entry under [Unreleased] |
| CLAUDE.md | UPDATED | cmdBootstrap added to explicit-target enforcement section |
| API docs | N/A | bootstrap is a script subcommand, not an API endpoint |
| Architecture docs | N/A | Contract enforcement fix; no structural change |
| .env.example | N/A | No new env vars |

## Phase 1 Success Criteria vs Delivered
- ✅ `bootstrap` requires explicit `--target-issue N` — implemented
- ✅ `runBootstrapClaimFirstAvailable` removed — verified (grep returns 0 results)
- ✅ Bootstrap auto-pick tests replaced with explicit-target tests — 6G/8I-a/b/c/12D/13A/13B all updated
- ✅ Validators assert new contract — both validate-workflow-contracts.js files updated; validate-kaola-workflow-contracts.js L182/L194 updated
- ✅ README updated — done
- ✅ Plugin mirror invariant — validate-script-sync.js: OK

## Gaps Found
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` L226 — found and fixed via Trivial Inline Edit in doc-updater step

## Final Verdict
**DOCKED**
