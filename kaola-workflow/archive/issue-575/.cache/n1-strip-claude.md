evidence-binding: n1-strip-claude a3b0b8a0b4c6
# n1-strip-claude — evidence

Stripped design-rationale provenance (`#NNN`, `D-NNN-NN`, `[INV-NN]`, ADR, defect/pattern clauses) from the Claude-edition prompt surfaces. No rule meaning changed.

## Changed files (14 canonical; verified by `git status` = exactly the declared canonical set)
agents: adversarial-verifier.md (1), contractor.md (~15), doc-updater.md (1), implementer.md (2), issue-scout.md (3), synthesizer.md (1), tdd-guide.md (2), workflow-planner.md (~30)
commands: kaola-workflow-adapt.md (7), kaola-workflow-fast.md (2), kaola-workflow-finalize.md (~20), kaola-workflow-phase1.md (1), kaola-workflow-plan-run.md (10), workflow-next.md (9)

## opencode mirrors (gitignored — `.gitignore:5:.opencode/`)
`.opencode/` is gitignored (0 tracked files), regenerated from canonical at install. Ran `scripts/sync-opencode-edition.js --write` in-leg (updates the ignored mirrors). `test-opencode-edition.js`: 466 assertions pass incl. all content-parity + phase-ban; 6 failures are environmental (leg worktree lacks the installed `.opencode/plugins/kaola-workflow-hooks.js`; the installed main repo has it) — NOT a strip regression. Durable strip = the 14 canonical files; main-repo opencode regenerates from canonical at next install.

## Clause-rewrites (meaning preserved, provenance dropped)
- `write_set_overflow`-by-construction defect-suffix dropped; rule intact.
- Scheduler-default posture: dropped `D-419-01` label + `#542/D-542-01`; `co-open default-on` meaning kept.
- `forge-claim-ports gap` clause dropped; "full accumulated root diff as canonical spec" rule kept.
- barrier-reason truncation-stall clause dropped; VERBATIM-surface instruction kept.
- record-once discipline: issue ref stripped, label kept.

## Residual grep (`#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|\[INV-[0-9]+\]|ADR-[0-9]+`)
Zero, except two ALLOWED runtime user-command examples in workflow-next.md (`"work on #42"`, `"finish issues #42 #47 #53"`) — variable example forms, explicitly in scope to keep.

## Functional tokens spot-checked present
parallel_safe, speculative_open_policy, REASONING_FLOOR_ROLES, validation_command, write_set_granularity, target_set_indeterminate, issue_numbers.

verdict: pass
