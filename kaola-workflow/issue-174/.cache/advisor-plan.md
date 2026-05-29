# Advisor — Plan Gate: issue-174

## Concern Raised: assertIncludes/assertNotIncludes helpers in forge validators
Advisor flagged that `assertIncludes`/`assertNotIncludes` may not exist in the forge validators (only in the root GitHub validator).

## Verification Result
Both forge validators DO define `assertIncludes` and `assertNotIncludes`:
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:60` — `function assertIncludes(file, needle)`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:64` — `function assertNotIncludes(file, needle)`
- GitLab validator has same structure

Blueprint is correct: use `assertIncludes`/`assertNotIncludes` (they exist). Only `assertBefore` needs to be added as a new helper.

## Gap 5 Offline Path String
Confirmed: both GitLab and Gitea command docs use `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` (no braces) — matches the assertion string byte-exactly. No reconciliation needed.

## Everything Else
- Bottom-up editing approach ✓
- `--output json` (not `--json`) ✓
- No `gh`/`GitHub`/`KaolaBrother` tokens in SKILL.md ✓
- Gap 7 as delete-and-reinsert ✓
- Byte-exact refusal-print string ✓
- Forge-token hygiene ✓

## Status
Blueprint is complete and correct. No architectural changes needed. Proceed to Phase 4.
