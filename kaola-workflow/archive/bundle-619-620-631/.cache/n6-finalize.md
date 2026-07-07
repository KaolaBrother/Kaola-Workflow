evidence-binding: n6-finalize b805ef967a96

# Finalize sink — n6-finalize (bundle-619-620-631)

Terminal sink node (main-session-direct; not a dispatchable subagent). Phase-6 work as evidence:

- Four script-enforced gates re-verified against the final committed tree (headSha 7fd3ccb3):
  --resume-check pass, --gate-verify pass, --barrier-check pass (0 errors/unattributed),
  --verdict-check pass (n3-review + n4-adversary both verdict:pass).
- CHANGELOG.md [Unreleased] entry written (this node's declared write set).
- Implementation committed by the main session (per-file serial write nodes never auto-commit):
  f661ca5f (fix, 13 files), 7fd3ccb3 (docs, 4 files).
- Chain receipt generated AFTER all code + docs + CHANGELOG landed; --finalize-check pass.
  codex green; claude/gitlab/gitea waived --accept-known-red …:635 (pre-existing test-run-chains
  load-flake, filed #635).
- gap-sweep --check pass (3 deferred_red_chain → filed:#635; mapped 3, filed 3, noise 0).
- doc-docking.md + finalization-summary.md written.

compliance: main-session-direct

Closes #619, #620, #631 (all-or-nothing). Proceeding to contractor archive + sink-merge.
