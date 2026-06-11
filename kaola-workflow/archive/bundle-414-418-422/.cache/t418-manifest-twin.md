c3cb0472fa5e
evidence-binding: t418-manifest-twin c3cb0472fa5e
non_tdd_reason: comment/doc-comment enumeration with no behavior to test-first
regression-green: install-manifest works for all 3 forges; byte-pair verified identical

## Task
#418.2: Add exclusion-comment enumeration to SUPPORT_SCRIPTS in install-manifest.js (both canonical + codex byte-pair).
#418.4: Add missing second clarifier comment line (`(never \`skipped_offline\`...)`) to gitea claim.js bundle site; remove trailing period from first line.

## Files Changed
- scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js

## Verification Commands

### Before baseline
node scripts/kaola-workflow-install-manifest.js --forge=github 2>&1 | head -5  => exit 0
node scripts/kaola-workflow-install-manifest.js --forge=gitlab 2>&1 | head -5  => exit 0
node scripts/kaola-workflow-install-manifest.js --forge=gitea 2>&1 | head -5   => exit 0
md5 scripts/... plugins/kaola-workflow/scripts/... => both 12ec67ae75c40ed40a3927231d70d041 (byte-identical)

### After changes
node scripts/kaola-workflow-install-manifest.js --forge=github 2>&1 | head -5  => exit 0
node scripts/kaola-workflow-install-manifest.js --forge=gitlab 2>&1 | head -5  => exit 0
node scripts/kaola-workflow-install-manifest.js --forge=gitea 2>&1 | head -5   => exit 0
md5 scripts/... plugins/kaola-workflow/scripts/... => both 17c1a0c7920e04a7a7315af90747559f (byte-identical)

## Summary
Both install-manifest.js files received the same exclusion-comment enumeration block covering all 7 intentional exclusions (edition-sync, fixtures-orphan-legality, fast-audit, install-manifest itself, release-surface-drift, validate-workflow-contracts siblings, install-codex-agent-profiles for gitlab/gitea), plus a note that ledger-compare IS in the list (added #412). The gitea claim.js bundle site gained the second clarifier line matching the gitlab twin pattern. All three forges smoke-clean; byte-pair verified identical.

regression-green: all verified
