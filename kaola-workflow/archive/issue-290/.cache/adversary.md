verdict: pass
findings_blocking: 0

## Claim Under Test
"Removing the findings-emission section from a reviewer body fails `npm test` in EACH of the four editions (CLAUDE/CODEX/GITLAB/GITEA), AND the pin does NOT false-flag the legitimate .md-vs-.toml format differences (AC2), AND no findings-emitting reviewer body is left unpinned."
Issue #290 — pin node, full-claim surface.

## Disproof Attempt

### Attack A — Per-Edition RED proofs

All four editions went non-zero when the token was removed:

A1a CLAUDE: removed `finding: id=` from agents/security-reviewer.md
  → `node scripts/validate-workflow-contracts.js` EXIT=1
  Error: agents/security-reviewer.md must include: finding: id=
  Restore verified via `git status --porcelain agents/security-reviewer.md` (empty = clean).

A1b CLAUDE: removed `finding: id=` from agents/adversarial-verifier.md
  → `node scripts/validate-workflow-contracts.js` EXIT=1
  Error: agents/adversarial-verifier.md must include: finding: id=
  Restore verified clean.

A2 CODEX: removed `finding: id=` from plugins/kaola-workflow/agents/security-reviewer.toml
  → `node scripts/validate-kaola-workflow-contracts.js` EXIT=1
  Error: plugins/kaola-workflow/agents/security-reviewer.toml must include: finding: id=
  Restore verified clean.

A3 GITLAB: removed `finding: id=` from plugins/kaola-workflow-gitlab/agents/security-reviewer.toml
  → `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` EXIT=1
  Error: plugins/kaola-workflow-gitlab/agents/security-reviewer.toml must include: finding: id=
  Restore verified clean.

A4 GITEA: removed `finding: id=` from plugins/kaola-workflow-gitea/agents/security-reviewer.toml
  → `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` EXIT=1
  Error: plugins/kaola-workflow-gitea/agents/security-reviewer.toml must include: finding: id=
  Restore verified clean.

No edition failed to go red on removal. All restores confirmed byte-clean via git status --porcelain.

### Attack B — No-false-flag (AC2)

With all reviewer bodies intact, `npm test` EXIT=0.
All four contract validators passed:
  Workflow contract validation passed (CLAUDE)
  Kaola-Workflow Codex contract validation passed (CODEX)
  Kaola-Workflow GitLab contract validation passed (GITLAB)
  Kaola-Workflow Gitea contract validation passed (GITEA)
No false flags on .md-vs-.toml format differences.

### Attack C — Completeness

`grep -rl 'finding: id=' agents/ plugins/*/agents/` produced exactly 14 files:
  5 .md: agents/code-reviewer.md, agents/security-reviewer.md,
          agents/adversarial-verifier.md,
          agents/profiles/higher/code-reviewer.md,
          agents/profiles/higher/security-reviewer.md
  3 CODEX .toml: plugins/kaola-workflow/agents/{code-reviewer,security-reviewer,adversarial-verifier}.toml
  3 GITLAB .toml: plugins/kaola-workflow-gitlab/agents/{code-reviewer,security-reviewer,adversarial-verifier}.toml
  3 GITEA .toml: plugins/kaola-workflow-gitea/agents/{code-reviewer,security-reviewer,adversarial-verifier}.toml
Total = 14, pinned set = 14. Exhaustive. No unguarded file.
Files outside agents/ directories (CHANGELOG.md, archive .cache files, workflow-plan.md) are
not reviewer agent bodies and do not require pinning.

### Attack D — Byte-identity

`node scripts/validate-script-sync.js` EXIT=0: "OK: 17 common scripts and 7 byte-identical file group in sync."
CLAUDE pair (scripts/validate-workflow-contracts.js ↔ plugins/kaola-workflow/scripts/validate-workflow-contracts.js) still byte-identical.

### Attack E — Scope

`git diff --name-only` shows exactly 5 files modified (the 5 validator scripts).
No reviewer body is dirty at the end of all attacks.

## Verdict
NOT-REFUTED (confidence: high)

Every attack was run with execution. No attack succeeded in breaking the claim.
All four editions go non-zero on removal; no false flags on intact bodies; pin set is exhaustive (14/14); byte-identity passes; scope is clean.
