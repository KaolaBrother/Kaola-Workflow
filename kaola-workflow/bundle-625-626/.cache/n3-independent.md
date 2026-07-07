evidence-binding: n3-independent 44654d02b841
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: Glue / wiring + scaffolding — three disjoint, prose-only agent-profile fixes with no behavioral logic: (1) drop a stale Phase-1 cross-reference sentence in workflow-planner.md (the preceding sentences already state the trigger fully), (2) substitute two dead route names (refactor-cleaner -> implementer, architect -> code-architect) in build-error-resolver.md's "When NOT to Use" table, (3) conditionalize doc-updater.md's hardcoded codemap/TypeScript mission on detecting scripts/codemaps/ or docs/CODEMAPS/, falling back to reconciling the doc surfaces the repo actually declares. None of these introduce new behavior with a natural failing unit test; acceptance is the existing parity validators + four cross-edition npm chains.
<!-- regression-green|build-green|smoke-integration -->
regression-green: All four npm chains run sequentially, all green (task, description, output tail below).

## Task
Node n3-independent (bundle-625-626) — three independent single-agent profile fixes:
- Fix 1 (#625 defect 3): removed the stale "This mirrors the Phase 1 `knowledge-lookup` trigger." sentence from agents/workflow-planner.md (pure deletion, adaptive path has no phases).
- Fix 2 (#625 defect 4): agents/build-error-resolver.md "When NOT to Use" table — `refactor-cleaner` -> `implementer`, `architect` -> `code-architect` (the actual installed role names).
- Fix 3 (#626 defect 1): agents/doc-updater.md — added a "Detection (run first)" section conditionalizing the codemap/TypeScript mission: regenerate `scripts/codemaps/`/`docs/CODEMAPS/` only if that tooling exists in the repo; otherwise reconcile README/CHANGELOG/`docs/*.md`/`.env.example` against the diff; never invent sections; skip-with-reason when no real change. Retitled "Analysis Commands" and "Codemap Workflow" headings to note they only apply when Detection found the tooling.

## write_set (actual files changed — matches declared write set; the 9 toml entries were confirmed to carry none of the targeted strings and were left untouched)
- agents/workflow-planner.md
- agents/build-error-resolver.md
- agents/doc-updater.md

Confirmed via grep before editing: none of the three toml twins (`plugins/kaola-workflow/agents/workflow-planner.toml`, `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml`, `plugins/kaola-workflow-gitea/agents/workflow-planner.toml`) contain "Phase 1"; none of the build-error-resolver.toml twins contain the dead route names; none of the doc-updater.toml twins contain the codemap-specific commands/paths. All 9 toml files in the defensive write set are untouched by design.

## verification_commands (run sequentially from the leg root) + exit codes
1. `git status --short` before edits: clean.
2. `grep -n "Phase 1" agents/workflow-planner.md` (before): 1 hit — after edit: 0 hits.
3. `grep -n "refactor-cleaner\|use .architect." agents/build-error-resolver.md` (before): 2 hits — after edit: 0 hits.
4. `npm run test:kaola-workflow:claude` — exit 0, "Workflow walkthrough simulation passed", "active-folders-field-parity tests passed (61 assertions)".
5. `npm run test:kaola-workflow:codex` — exit 0, "Kaola-Workflow walkthrough simulation passed", all listed unit checks PASSED.
6. `npm run test:kaola-workflow:gitlab` — exit 0, "Vendored agent validation passed for 15 agents at 922d2d8f8b64f4e50936e24465cb3bcac81ac0e1" (confirms doc-updater.md divergence from the pinned vendored hash is tolerated by the validator per docs/agents-source.md convention — registration/count checks, not byte-identity), "GitLab workflow walkthrough simulation passed", "GitLab Codex workflow walkthrough simulation passed".
7. `npm run test:kaola-workflow:gitea` — exit 0, "Gitea workflow walkthrough simulation passed", "Gitea Codex workflow walkthrough simulation passed".
8. `git status --short` after edits: exactly `agents/build-error-resolver.md`, `agents/doc-updater.md`, `agents/workflow-planner.md` modified — no other files touched.

## before_result
Baseline (pre-edit) state: all four chains presumed green prior to this node per the frozen plan's upstream gates; grep confirmed the three defects present (stale Phase-1 sentence, two dead route names, hardcoded unconditional codemap mission) exactly as described in the task.

## after_result
All four npm chains (`test:kaola-workflow:claude`, `test:kaola-workflow:codex`, `test:kaola-workflow:gitlab`, `test:kaola-workflow:gitea`) run sequentially, ALL GREEN, no failures. `git status --short` shows only the three declared root `agents/*.md` files modified; the 9 defensively-declared toml entries remain untouched (confirmed by pre-edit grep returning zero hits in all of them).

## Note on evidence path
The declared evidence path (`kaola-workflow/bundle-625-626/.cache/n3-independent.md` under this isolated leg's worktree) did not pre-exist in this leg (git worktrees only carry committed paths; `kaola-workflow/{project}/` is untracked local state that lives only in the shared adaptive worktree at `.kw/worktrees/bundle-625-626/`). The seeded placeholder with the `evidence-binding: n3-independent 44654d02b841` header was located there and its header is reproduced verbatim above; the parent directory was created here to honor the literal write-here instruction for this leg.
