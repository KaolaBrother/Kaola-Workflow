# Run gaps — manual seed (bundle-896-897-898)

Findings this run made that the scanner's `.cache/` heuristics did not observe, because they were
recorded in `mission-list.md` and in agent reports rather than as typed gap lines. Seeded here so
what the summary maps was actually swept.

gap: legacy-only-guard — assertBranchHasNonWorkflowChanges is wired into the legacy sink path only, exactly as assertNoLiveWorkflowFolder is. Unlike #896's, this premise may survive, because no finalize step repairs an implementation-free branch. CALL-SITE SWEEP ONLY, never constructed.

gap: production-redundancy — removing the KAOLA_WORKFLOW_OFFLINE guard from issueIsClosed alone, or from prefetchIssueStates alone, is behaviourally inert because ghExec's own guard masks each; no readActiveFolders assertion can distinguish either from correct behaviour.

gap: guard-not-in-npm-surface — sync-opencode-edition.js/sync-kimi-edition.js --check now runs, but rides test:kaola-workflow:editions rather than a named package.json step, so grep -c '--check' in package.json reads 0 while the check genuinely runs.

gap: check-coverage-limit — CONSUMER_DOCS_PATH does not catch a docs/ path that is both unbackticked and extension-less, being indistinguishable from prose; a false negative was chosen over a false positive.

gap: unexplained-environment — a subagent scratch mirror under the session scratchpad was wiped mid-run, producing 5 spurious reds in one investigation. Did not reproduce across ~12 later full runs; every rmSync in the suites targets mkdtemp/os.tmpdir.
