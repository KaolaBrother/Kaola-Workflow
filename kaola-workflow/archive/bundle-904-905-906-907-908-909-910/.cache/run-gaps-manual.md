# Run gaps — manually seeded

Defects this run discovered but did not fix. Each was filed as a follow-up issue before finalization.

gap: relative-plan-receipt-placement — `run-chains --plan` with a RELATIVE path resolves against the invoking tree and carries the identical #910 defect: from a linked worktree the receipt lands where the finalize gate does not read it. Left unfixed because #910's acceptance criterion pinned `--plan` precedence unchanged and an explicit caller-supplied path is a separate decision.

gap: forge-sinkpreflight-divergence — the GitLab and Gitea `sinkPreflight` ports call `assertWorktreeClean` unconditionally, with no `#711` branchless clause and no `[project]` argument, unlike canonical. Pre-existing; invisible to every parity check because `sink-merge.js`'s forge ports are policed by nothing.

gap: env-allowlist-silently-discarded — `buildScrubbedEnvironment` silently discards an allowlisted `HOME` or `TMPDIR` (`deterministic.has(key) → continue`, no error, no warning). Measured while investigating #904's `.rustup`/cargo sibling: those two keys are exactly what a caller reaches for first, and the request vanishes with no report.

gap: keep-output-run-folder-band — `--keep-output` refuses a destination inside the tracked ARCHIVE band but not inside an active run folder (`kaola-workflow/<project>/.cache/`), which is committed when the run is archived — so opt-in retention can still reach permanent git history with absolute-path redaction only and no secret redaction. Put to the owner at the closure decision and ruled ship-as-is with the reasoning recorded.

gap: finding-type-count-divergence — canonical and Codex emit six `recordFinalizeFinding` types where the GitLab and Gitea ports emit five; the delta is `archive_unstage_failed`, structural rather than a port miss (two archive-staging calls versus one unscoped `git add -A`). Pre-existing: both shapes present at `main`.
