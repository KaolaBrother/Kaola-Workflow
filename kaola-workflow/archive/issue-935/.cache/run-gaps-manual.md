# Run gaps — issue-935 (manually seeded)

Gaps this run discovered that the scanner's `.cache/` heuristics did not observe. Each is reconciled
in `finalization-summary.md` under `## Run gaps`.

gap: dead-mechanism — The reasoning floor is enforced for no role: `--enforce-floor` has zero production consumers, and the one runtime consumer of the resolver (the subagent-dispatch-log hook) never passes it and is fail-open. Even `synthesizer` is unguarded.

gap: misleading-remediation — `sync-opencode-edition.js:870` prints an unconditional `--check` footer advising `--write`, which cannot fix a stale `opencode.json`; `:661-666` preserves the file and directs to `--write-config`.

gap: coverage-overstated — `test-opencode-edition.js` materializes the `.opencode-gitlab`/`.opencode-gitea` trees as it runs, so a first run on a fresh clone drift-checks one tree while the banner reads as three.

gap: unpinned-role — `EXPECTED_ROLE_MODELS` in `test-install-model-rendering.js` holds 13 of 14 roles; `investigator` appears nowhere in the file, so its rendered tier has no acceptance pin.

gap: deferred-verification — Issue #935's A10 (read the effective model and effort back from a live spawn per runtime, after reinstalling all four runtimes) cannot run from the worktree, because reinstalling from an unmerged branch would install code that is not on main. Deferred to after the sink.
