dec903b2671e
evidence-binding: n_readme dec903b2671e

## Summary of changes to README.md

### (a) Parallelism section — running-set scheduler (#377)

Added a new paragraph after the "workflow-planner now authors efficient DAGs" paragraph (around line 631) describing the #377 running-set scheduler. The paragraph explains that serial execution is `RUNNING_SET_MAX=1`, the parallel-batch path raises the cap to the frontier width, and the running-set model unifies both paths via `open-ready` / `close-node` / `reconcile-running-set` subcommands.

### (b) Codex reasoning-effort table — `<role>-max` dispatch (#405)

Added a prose sentence immediately after the reasoning-effort table (after the `issue-scout` row, before `## Release versioning`) explaining that when a node's resolved `model` is `opus`, Codex dispatch selects the `<role>-max` profile variant (e.g. `planner-max`, `code-reviewer-max`) carrying `reasoning_effort: xhigh`, shipped in #405.

### (c) Codex hooks section — stable install home (#409)

Extended the opening paragraph of the "Codex lifecycle hooks" subsection to note that since #409, hooks and helper scripts have a stable install home at `.codex/kaola-workflow/hooks/` and `.codex/kaola-workflow/scripts/`, making `codex plugin add` upgrades non-destructive to local hook overrides.

docs: complete
