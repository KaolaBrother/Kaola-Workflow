# Finalize Node Evidence — issue #262

finalize sink node (non-dispatchable; resolve-agent-model finalize == empty). Phase-6 steps 1-6 recorded here as the node's evidence, per the #267 adaptive finalize-node lifecycle.

## Step 1 — Final Validation
- `npm test` (claude → codex → gitlab → gitea) from worktree on branch `workflow/issue-262` → **exit 0**. All four editions green:
  - claude: `Workflow walkthrough simulation passed`
  - codex: `validate-script-sync` OK (15 common scripts + 6 byte-identical groups in sync), `Kaola-Workflow Codex contract validation passed`, walkthrough passed
  - gitlab: vendored-agents passed (13 agents), contract validation passed, both walkthroughs passed
  - gitea: vendored-agents passed (13 agents), contract validation passed, both walkthroughs passed
- Adaptive barrier gates (whole-plan): `--resume-check`=0, `--gate-verify`=0, `--barrier-check`=0, `--verdict-check`=0. barrier-check after CHANGELOG.md add: `{"result":"pass","sensitiveHits":[],"outOfAllow":[]}`.
- Evidence: `.cache/final-validation.md`.

## Step 2 — Acceptance Check (vs issue #262 AC)
- AC1: roadmap `rm + regenerate` runs EXACTLY ONCE during finalize (in `cmdFinalize`/`archiveProjectDir`); `agents/contractor.md` Step 7 only STAGES (`git add`). ✓ (code-reviewer verified the closure-once premise directly against `kaola-workflow-claim.js` `archiveProjectDir`/`cmdFinalize` source — removes the duplicate yields once, not zero.)
- AC2: committed roadmap state (per-issue file removed, `ROADMAP.md` regenerated + staged) unchanged / idempotent. ✓ (behavior-preserving; the load-bearing `git add` in Step 7 preserved.)
- AC3: simulate suites green across ×4 editions. ✓ (`npm test` exit 0.)
- AC4: Phase-6 whole-plan `--barrier-check` clean (every changed file in exactly one write-set). ✓

## Step 3/4 — Documentation Update + Docking
Changed files reviewed: CHANGELOG.md, agents/contractor.md, commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md, docs/workflow-state-contract.md.
- `docs/workflow-state-contract.md`: added "Single-owner finalize invariant" bullet under `## Generated Mirrors` (doc-updater node, verified against source). ✓
- `docs/architecture.md`: SKIPPED with reason — the Merge/PR Sink diagrams already depict closure as a single step; no drift; skipping also minimizes merge-conflict surface with the parallel #266.
- `CHANGELOG.md`: `[Unreleased]` → `### Fixed` entry added for #262.
- README.md / docs/api.md / .env.example: no impact (no feature/env/API/CLI surface change — behavior-preserving prompt-text cleanup).
- Verdict: **DOCKED**.

## Step 6 — Closure Decision Gate
Scan for deferred items / unresolved conflicts / partial work / user-decision items: NONE. The implementer's delegation-prose concern was resolved in-node (not deferred); the doc-updater's architecture.md skip is a justified no-op, not a follow-up. No follow-up issues required. Clean closure.

## Scope / parallelism
Change-set = 6 source files + untracked `kaola-workflow/issue-262/` workflow artifact. ZERO `.codex-plugin/`/`.codex/` files touched — confirmed conflict-free with the parallel #266 (Codex harness), which also lists finalization as out-of-scope.

Status: READY FOR FINAL GIT GATE (contractor mechanical finalize + sink-merge).
