evidence-binding: n3-finalize 978f4f19c720

# Finalize documentation pass — issue-624

## Diff grounding
Read the full landed diff first (`git diff` scoped to the seven touched surfaces):
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` and
  `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` each gained the
  `workflow_path: adaptive` branch — a frozen-`workflow-plan.md`/`plan_hash` check, the
  `validator_script` resolver, and the four-gate bash block (`--resume-check`, `--gate-verify`,
  `--barrier-check`, `--verdict-check`) — ported verbatim from the canonical github-codex
  `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` (modulo forge-specific
  `validator_script` paths). Previously both forge SKILLs jumped straight from the fast-path
  branch to `### Chain-Receipt Gate`, leaving that section's `validator_script` reference
  dangling on an adaptive-path run.
- `commands/kaola-workflow-finalize.md`, `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`,
  and `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` each changed
  "script-enforced by three gates — run all three" to "four gates — run all four" (the code
  block beneath already invoked all four; only the prose count was stale).
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` each gained
  a new `assert(...)` pin (with its own `#624` inline comment) requiring the finalize SKILL to
  contain `workflow_path: adaptive` + `validator_script` + all four gate flags.

## CHANGELOG.md update
Added one `### Fixed` bullet under `[Unreleased]` in `CHANGELOG.md` (this node's sole write
target), summarizing the above fix and the two new machine pins, tagged `#624`, with the
cross-edition four-chain-green note per the `## Validation Policy` convention. Wording is
grounded directly in the diff and in n1/n2's evidence (RED-before-fix reproduction, verbatim-port
confirmation, all four chains green) — no invented behavior.

## Documentation checklist — other items (no edit needed)
- README.md — no public feature/usage/env-var surface changed; skip.
- docs/api.md — the four-gate barrier is already correctly documented there; this fix restores
  existing documented behavior on the two forge SKILLs rather than adding new API surface; skip.
- Architecture docs (docs/architecture.md) — no structural change; skip.
- .env.example — no new environment variables introduced; skip.
- Inline comments — the two new `.js` assert pins already carry their own `#624` provenance
  comments (added by the implementer node, verified present in the diff above); no further
  inline-comment work needed.

verdict: pass
findings_blocking: 0

