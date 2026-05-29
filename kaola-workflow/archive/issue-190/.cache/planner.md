# Planner Output — issue-190

## Key Finding
KAOLA_PATH is consumed from process.env (kaola-workflow-claim.js:421). `export KAOLA_PATH=fast` in Step 0a-1 prose propagates automatically to the startup bash block — no CLI flag or bash-block edit needed. M1 is purely additive prose.

KAOLA_VERDICT is already captured by the Codex startup block (lines 123-124 each SKILL.md). "Parallel decision" reuses it — no separate classifier call.

## Recommended Approach

### M1 — Approach A: Faithful logic port with reference adaptation
Insert `## Startup Step 0a-1 — Path Intent` between `## Startup Step 0a` and `## Startup` in each of the 3 Codex SKILLs. Carry full 5-rule precedence logic verbatim, with 3 adaptations per edition:
1. Issue-fetch line: gh/glab/tea variant
2. Cross-reference: `commands/kaola-workflow-fast.md` → edition's kaola-workflow-fast SKILL's "Mid-Flight Escalation" section
3. Anchor labels: "Before Step 0b" → "Before the Startup transaction"
Also append 3 lines to `## Required Output` in each file.

Risk: Low. Complexity: Low-Medium (volume, not logic).

### M2 — Delete stale vars
Remove 5 env-var blocks + hook reference from .env.example; remove docs/api.md:109. Single approach.
Risk: Low (verify liveness before deleting).

### M3 — Hand-edit package-lock.json
Edit lines 3 and 9: "3.16.0" → "3.16.1". Do NOT use npm install (risks churning lockfile).

## Items NOT to Build
- No --path CLI flag on startup script
- No bash-block edits in ## Startup sections
- No separate classifier invocation for Parallel decision
- No shared-snippet abstraction
- No simplification of the fast-path eligibility rubric
- No npm install for M3
- No edits to commands/workflow-next.md

## Missing Facts to Verify During Implementation
1. Check validate-kaola-workflow-contracts.js and validate-workflow-contracts.js for assertions on the new sections/output lines
2. Confirm GitLab SKILL uses MR-neutral language; verdict enum is forge-agnostic
3. Grep to confirm all 5 dead env vars are truly unused in scripts/
