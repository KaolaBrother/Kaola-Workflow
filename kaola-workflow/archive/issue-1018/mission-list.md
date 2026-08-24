# Review and finalize PR #1019 for Issue #1018

- item: Review PR #1019 against Issue #1018, ADR 0019, the current mainline, generated/runtime contracts, and acceptance evidence
  status: done
  dispatched: self; review evidence lands in kaola-workflow/issue-1018/.cache/review.md and live Grok evidence in .cache/live-grok.md
  result: PR head f36fab89 reviewed against origin/main ed7e35c9; Grok planner child honored xhigh; one failing two-list walkthrough assertion and stale runtime-edition documentation found

- item: Repair test-owned heavy-tier coverage in the shipped Codex plugin walkthrough, all three contract validators, and the Claude command-runtime dispatch contract without weakening exact-one-class, cross-copy parity, or additive-runtime divergence coverage
  status: done
  dispatched: tdd-guide owns plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, the github/gitlab/gitea validate-kaola-workflow-* contract validators, the minimal existing test surfaces needed to prove Claude next/finalize ship the reviewer heavy re-dispatch and its sole executable model=\"fable\" exception while Grok/Cursor do not, and stale top-level Grok/Cursor suite comments that still claim only two classes; evidence lands in kaola-workflow/issue-1018/.cache/tdd-guide-review-fix.md
  result: plugin walkthrough and all three validators are green; T20 first RED with four intended failures, then passed 557 assertions after the sole model=\"fable\" exception landed; Grok/Cursor divergence stayed green and their suite comments now name all three classes

- item: Implement the Claude-only bounded reviewer heavy re-dispatch and review-scope packet from canonical skeletons, regenerate derived routing surfaces, and preserve additive-runtime divergence
  status: done
  dispatched: implementer owns templates/routing/next.skeleton.md, templates/routing/finalize.skeleton.md, their generated routing surfaces through scripts/generate-routing-surfaces.js --write, and the three stale installer production comments that must name the standard/reasoning/heavy metadata classes; test files remain under tdd-guide custody; evidence lands in kaola-workflow/issue-1018/.cache/implementer-review-fix.md
  result: command contract is green across all generated surfaces; the three installer comments now name standard/reasoning/heavy byte-identically; route reachability passed 557 assertions, generation check and all four additive rendering suites passed, and diff check passed

- item: Dock every affected runtime guide and architecture pointer against the verified three-tier behavior
  status: done
  dispatched: doc-updater owns README.md, docs/README.md, current runtime guides, architecture/API/conventions references, ADR 0019 status, and the Unreleased changelog as actually required by the Issue #1018 diff; it must transcribe verified behavior only and record evidence in kaola-workflow/issue-1018/.cache/doc-updater.md
  result: README, docs index, all four additive runtime guides, architecture, API, conventions, ADR 0019, and Unreleased changelog now match the verified three-tier candidate; Codex is Luna/max, Sol/medium, Sol/high and Grok/Cursor are medium/high/xhigh; diff check passed

- item: Run the live Codex preflight, additive runtime suites, full self-host chains, acceptance/gap sweep, finalize transaction, merge sink, and closure audit
  status: in-flight
  dispatched: self owns generated additive-tree refresh, final targeted suites, unsharded walkthrough, four-chain receipt, acceptance and documentation docking records, gap sweep, implementation commit/push, finalize transaction, merge sink, and post-merge closure audit
  result: additive suites, targeted contracts, and full 186-scenario walkthrough are green; first four-chain run passed codex/gitlab/gitea and exposed one Claude upgrade-rewrite fixture regression, dispatched below

- item: Repair the Claude-chain upgrade-rewrite fixture so the pre-#153 concrete-model seed recognizes the canonical heavy fable token without weakening migration coverage
  status: done
  dispatched: tdd-guide owns scripts/test-install-upgrade-rewrite.js and evidence in kaola-workflow/issue-1018/.cache/tdd-guide-chain-fix.md; production changes are forbidden unless a separately dispatched implementer is proved necessary
  result: test now accepts fable as a canonical concrete seed while still rejecting inherit and unknown; exact upgrade-rewrite test and focused negative check passed
