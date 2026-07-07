evidence-binding: n5-finalize 3f6ddffe30f0

# Finalize sink — n5-finalize (bundle-621-622-633)

Terminal sink node (main-session-direct; not a dispatchable subagent). Phase-6 work done as
this node's evidence:

- Four script-enforced gates re-verified against the final committed tree (headSha 01082b6d):
  --resume-check pass, --gate-verify pass, --barrier-check pass, --verdict-check pass.
- CHANGELOG.md [Unreleased] entry written (this node's declared write set).
- Chain receipt generated AFTER all code + docs + CHANGELOG landed; --finalize-check pass.
  codex green; claude/gitlab/gitea waived --accept-known-red …:635 (pre-existing test-run-chains.js
  load-flake, filed #635; substantive content independently verified green).
- Implementation committed by the main session (serial write node → no auto-commit): 7674ebf6 (fix),
  01082b6d (docs).
- gap-sweep --check pass (6 mapped: 3 filed #635, 3 noise for the completed in-run R4 repair loop).
- doc-docking.md + finalization-summary.md written.

compliance: main-session-direct

Closes #621, #622, #633 (all-or-nothing). Proceeding to contractor archive + sink-merge.
