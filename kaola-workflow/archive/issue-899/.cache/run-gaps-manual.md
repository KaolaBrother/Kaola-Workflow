# Run gaps — manual seed (issue-899)

gap: vacuous-control-from-inherited-env — the first three rounds of this investigation reused the test suite's fixture builders and inherited KAOLA_WORKFLOW_OFFLINE, which silently DISABLES the very guard under test. Both paths merged, the experiment looked conclusive, and it proved nothing. Only a positive control exposed it.

gap: subagent-died-without-report — the investigator went idle twice without writing its promised report file, having produced five rounds of usable data on disk. Recovered by reading the artifacts directly rather than re-dispatching from scratch.

gap: third-legacy-only-guard — assertBranchPushedToUpstream is legacy-path-only as well, and its absence on --sink was NOT constructed or measured in this run.
