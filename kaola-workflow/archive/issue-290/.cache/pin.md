# Node pin (tdd-guide) — issue #290 findings-emission contract presence pin

## Write set (exactly 5 paths; reviewer bodies READ-ONLY, zero-diff)
1. scripts/validate-workflow-contracts.js (CLAUDE root)
2. plugins/kaola-workflow/scripts/validate-workflow-contracts.js (CLAUDE plugin mirror — byte-identical #274 pair with 1)
3. scripts/validate-kaola-workflow-contracts.js (CODEX)
4. plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js (GITLAB)
5. plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js (GITEA)

Each validator now asserts the cross-format token `finding: id=` is present in its edition's
reviewer agent bodies (CLAUDE: 5 .md incl. higher profiles, no higher/adversarial-verifier; CODEX/GITLAB/GITEA: 3 .toml each).

## RED (mutation proof — pin actually bites; .bak restore, never git checkout)
- CLAUDE: planted removal of `finding: id=` in agents/code-reviewer.md →
  `node scripts/validate-workflow-contracts.js` EXIT:1 — "Error: agents/code-reviewer.md must include: finding: id=". Restored; git status clean.
- CODEX: planted removal in plugins/kaola-workflow/agents/code-reviewer.toml →
  `node scripts/validate-kaola-workflow-contracts.js` EXIT:1 — "Error: plugins/kaola-workflow/agents/code-reviewer.toml must include: finding: id=". Restored; git status clean.
- GITLAB/GITEA validators carry the analogous assertion (adversarial-verifier node re-checks all four exhaustively).

## GREEN (final, reviewer bodies restored)
- `node scripts/validate-script-sync.js` → "OK: 17 common scripts and 7 byte-identical file group in sync." (CLAUDE pair still byte-identical)
- Full `npm test` EXIT:0 — all four contract validators passed (CLAUDE / CODEX / GitLab / Gitea), 0 failures.
- AC2 honored: pinned the common `finding: id=` token (NOT the format-specific heading), so .md-vs-.toml differences are not false-flagged.

Note: a pre-existing forge-helper failure manifests ONLY under KAOLA_WORKFLOW_OFFLINE=1 (unrelated to this change); plain `npm test` is clean.
