evidence-binding: n6-finalize c253f811d87a

# Finalize — n6-finalize (bundle-625-626), documentation checklist pass

Write target: CHANGELOG.md only (declared write set for this node).

## Grounding

Read the landed diff directly before writing anything:
- `git diff d5f942a8 HEAD -- agents/ plugins/kaola-workflow*/agents/ docs/agents-source.md`
  (29 files: 11 `agents/*.md` + 18 `plugins/*/agents/*.toml`, 100% inside the agents surface,
  0 lines under `scripts/`).
- Read the full diffs of `agents/security-reviewer.md`, `agents/code-reviewer.md`,
  `agents/adversarial-verifier.md` (verdict RETURN, not self-write, dropped Write/Edit tools on
  security-reviewer), `agents/implementer.md`, `agents/synthesizer.md`, `agents/tdd-guide.md`
  (evidence SELF-WRITE + preserve seeded `evidence-binding:` header), `agents/workflow-planner.md`
  (stale Phase-1 cross-reference line removed), `agents/build-error-resolver.md` (dead route
  names `refactor-cleaner`→`implementer`, `architect`→`code-architect`), and `agents/doc-updater.md`
  (Detection-first gate before the codemap mission).
- Cross-checked against `n4-review.md` (G1 gate verdict: pass, 0 blocking, confirms both
  evidence-contract halves land correctly on all 24 surfaces, tools drop exact, n3 fixes
  surgical, all four edition chains green) and `n5-docs.md` (prior node's `docs/agents-source.md`
  Local Overrides additions for the two #626 divergences + the #625 build-error-resolver remap —
  not duplicated here).

## CHANGELOG.md — entry added under [Unreleased] / ### Fixed

Two new bullets added above the existing #617 entry (top of the Fixed list, matching the
project's newest-first-within-section convention):
1. **#625** — the evidence-persistence contract inversion between write-role agents
   (implementer/synthesizer/tdd-guide, now SELF-WRITE preserving the seeded `evidence-binding:`
   header) and read-only gate agents (adversarial-verifier/code-reviewer/security-reviewer +
   higher-tier variants, now RETURN for orchestrator persistence via `record-evidence --stdin`);
   security-reviewer's dropped Write/Edit tool grant (self-review integrity hole) reframed as
   route-out; the stale workflow-planner.md Phase-1 cross-reference; the two dead
   build-error-resolver.md route names. Cross-edition line included (18 `.toml` files across all
   three plugin trees touched; all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
   chains green per n4-review.md).
2. **#626** — tdd-guide's coverage-gate conditionalization (80%+ mandate now applies only when
   the repo exposes a coverage command, else falls back to `validation_command`) and doc-updater's
   Detection-first gate before its codemap/TypeScript mission (falls back to real doc surfaces
   with skip-with-reason otherwise), cross-referencing that `docs/agents-source.md` Local
   Overrides already documents both.

Provenance (#625, #626) kept in CHANGELOG.md only, per this project's "keep provenance out of
agent-facing prompts" rule — the agent `.md`/`.toml` bodies themselves carry zero issue refs.

## Other checklist items — verified no impact, not edited

- **README.md** — no public feature/usage/env-var surface changed; this bundle is entirely
  internal agent-profile prose + tool-grant metadata, never user-facing install/usage docs.
- **API docs (`docs/api.md`)** — no external API/endpoint/schema changed; `.cache` evidence
  persistence direction is an internal orchestrator↔agent contract already documented in
  `commands/kaola-workflow-plan-run.md` (untouched by this bundle), not a new external contract.
- **Architecture docs (`docs/architecture.md`)** — no structural change; no new script, gate,
  or data-flow path was added — only which side of an existing read/write boundary self-writes
  vs. returns.
- **.env.example** — no new environment variables introduced anywhere in the diff.
- **Inline comments** — n/a; the touched files are agent-facing prose profiles, not source code
  with inline comments.
- **docs/agents-source.md Local Overrides** — already written by the n5-docs node (confirmed via
  its evidence + `git diff HEAD -- docs/agents-source.md`); not duplicated by this node, and this
  node's write set does not include that file.

## Verification

`git diff --stat -- CHANGELOG.md` after the edit shows exactly 2 insertions, 0 deletions, 1 file
changed — confirming the write set stayed to the single declared target.

verdict: pass
findings_blocking: 0
