evidence-binding: n5-docs 64415ffaca45

RED: no test — this is docs-only prose reconciliation (`non_tdd_reason`: recording
vendored-body Local Overrides is not code with a meaningful failing test; verified by
inspection against the actual diffs and by preserving the file's own structural invariants).

GREEN: `docs/agents-source.md`'s `## Local Overrides` section now records the three new
vendored-body divergences introduced by this bundle (#625, #626), added below the existing
`agents/doc-updater.md` `model: sonnet` override (issue #197) — that entry, the `## Upstream`
pinned commit (`922d2d8f8b64f4e50936e24465cb3bcac81ac0e1`), and every row of the `## Vendored
Files` table are byte-unchanged.

New entries added (matching the existing bullet-list, self-contained-rationale style):

1. `agents/tdd-guide.md` — coverage-gate conditionalization (#626). Documents that the
   previously-unconditional `npm run test:coverage` / 80%+ requirement now runs only when the
   repo exposes a coverage command, applying the project's coverage target where one is
   defined, and otherwise falls back to the project's recorded `validation_command`.
2. `agents/doc-updater.md` — codemap-mission conditionalization (#626). Documents that the
   hardcoded codemap/TypeScript mission (`npx tsx scripts/codemaps/generate.ts`, `madge`,
   `jsdoc2md`, `docs/CODEMAPS/`) now runs only after a Detection step confirms
   `scripts/codemaps/` and/or `docs/CODEMAPS/` exist, otherwise falling back to reconciling the
   real doc surfaces (README, CHANGELOG, `docs/*.md`, `.env.example`) with skip-with-reason.
3. `agents/build-error-resolver.md` — dead-route remap (#625). Documents that the "When NOT to
   Use" routing table's dead upstream names (`refactor-cleaner`, `architect`) are remapped to
   the actual installed roles: `refactor-cleaner` → `implementer`, `architect` →
   `code-architect`.

Verification performed:
- Read `docs/agents-source.md` in full before editing (per task instructions).
- Read the actual landed diff (`git diff de9acba0 92e7cd16 -- agents/tdd-guide.md
  agents/doc-updater.md agents/build-error-resolver.md`) to confirm each override's exact wording
  before documenting it, rather than fabricating.
- Cross-checked scope against `kaola-workflow/bundle-625-626/workflow-plan.md`'s "Vendored-
  divergence bookkeeping (n5-docs)" plan note, which independently confirms exactly these three
  divergences (and only these three — the tdd-guide.md evidence-ownership contract flip
  (RETURN → SELF-WRITE) that also landed in the same n1-write-evidence leg is a separate #625
  fix that realigns tdd-guide/implementer/synthesizer to the pre-existing canonical role-kind
  contract in `commands/kaola-workflow-plan-run.md`, not a new vendored-body Local Override, and
  the plan explicitly scopes n5 to record only the three items above).
- Confirmed via `git diff -- docs/agents-source.md` that the change is purely additive: the
  pinned commit, the Vendored Files table, and the pre-existing Local Overrides entry are
  untouched; only three new bullets were appended to the `## Local Overrides` section, in the
  same format as the existing entry. The `## Refresh Procedure` section (including step 7) was
  left untouched per the task's explicit "do not restructure" constraint.
- Confirmed no agent `.md`/`.toml` file was touched by this node (write set is exactly
  `docs/agents-source.md`, matching the declared write set).
