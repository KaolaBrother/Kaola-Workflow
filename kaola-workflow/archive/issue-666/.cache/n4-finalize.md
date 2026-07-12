evidence-binding: n4-finalize f5843b2ea326

## sink
role: finalize (main-session-direct)
change: Added a `## [Unreleased]` section to CHANGELOG.md with the #666 Fixed entry (explicit 64 MB maxBuffer on unbounded git calls in the plan-validator + sibling scripts across all four editions; >1 MB worktree-hash regression). Docs/state only — no code writes on the sink.

## docs_decision
No public interface, env var, or API changed (purely internal git-plumbing hardening). No docs/ page or ADR update required per the plan. CHANGELOG entry only.

## manual_post_merge_step
The post-ship reinstall of the three runtimes (Claude Code, Codex, opencode) to clear the installed-copy divergence and delete the `.bak-enobufs-20260711` residue at ~/.claude/kaola-workflow/scripts/ is a MANUAL post-merge step, NOT a plan node. After this fix merges to main, reinstall so the installed copies match the now-upstreamed source; the opencode copy (never patched) is corrected by the same reinstall.

## four_chain
Cross-edition diff (touches plugins/kaola-workflow-{gitlab,gitea}/ + two GENERATED aggregators). Finalization runs all four npm chains sequentially before the sink.

## run_gaps
R1 (from n3-review, LOW, pre-existing/out-of-scope): the uncapped `status --porcelain` git family (plan-validator:3253 -uall dirty-fence fail-open on ENOBUFS; sink-merge:984; adaptive-node:4455; claim:483/532/1634) is the same ENOBUFS pattern one tier down, deliberately outside #666's confirmed-site list. To be FILED as a follow-up issue at finalization (gap-sweep).
