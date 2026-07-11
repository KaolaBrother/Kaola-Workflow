evidence-binding: n2-fence-parser-and-hermetic-fixtures 398b6320c00d
upstream_read: n1-canonical-fanout-evidence 79e83c23ba85
upstream_read: n3-review-bundle-contract 0900e8c6c93a
baseline_reused: true
plan_hash: e69753f11f9e10b14148d196259867a6b0ebd8805d552fe3033fdd4250f62b2f

RED: Original parser RED — `node scripts/simulate-workflow-walkthrough.js` exited 1 at `testClassifierSectionBodyFenceIdentity`: `backtick decoy and language tag: fenced decoy must not be selected`.
GREEN: Original parser GREEN — the same walkthrough completed with `Workflow walkthrough simulation passed`; both forge-native drivers passed.
RED: Repair R1 RED — `node scripts/test-adaptive-node.js` reported two failures: per-node `av-red` and whole-plan verdict checks incorrectly returned pass after globally pooling a 2/3-refuted legacy group with a foreign 3/3-pass group.
GREEN: Repair GREEN — `node scripts/test-adaptive-node.js` completed `adaptive-node tests passed (1728 assertions)` after unique legacy-group attribution and the real dispatch-evidence lifecycle fixture; the converged walkthrough independently completed `Workflow walkthrough simulation passed`.

assigned_task: Repair review findings R1-R5 inside the widened 16-file union while preserving the fence scanner and canonical explicit-group behavior.

R1: closed. `resolveAdversarialFanoutGroup` now returns `legacy-ambiguous` when the frozen plan contains more than one legacy cardinality>1 `(group, origin)` identity. Per-node and whole-plan checks refuse before reading the global role-prefix glob. The single attributable archived legacy group remains read-only compatible.
R2: closed. The walkthrough's explicit cardinality-1 fan-out fixtures now author `.cache/sk1.md`, `.cache/sk2.md`, and `.cache/sk3.md` receipts with exact current baseline nonces. The old role-prefix form remains only in a separate cardinality>1 legacy control.
R3: closed for the owned classification seam. Every `withClassifierForge` fixture must explicitly provide `viewIssue`, `discoverProject`, and `listIssueNotes`; omission of each dependency is tested and throws `unexpected forge call: missing fixture dependency <name>` before the callback. Classification fixtures also receive a local empty `listIssues` seam. The driver creates a default exit-97 forge shim under its empty sandbox HOME, and the final focused output contains no `Unknown flag`, auth/host, or `401 Unauthorized` diagnostics. Empty-note, claim-note, and transient-note cases deterministically return green, blocked, and indeterminate.
R4: closed. A real temporary git project freezes a plan, calls real `open-ready`, writes only each returned `dispatch.evidence_file`, closes both explicit skeptic nodes, confirms no role-prefix bridge exists, and passes the real whole-plan `--verdict-check`. Existing focused controls cover independent groups, foreign/duplicate receipts, missing/stale bindings, ties, scoped reset, and reopen nonce rotation.
R5: closed. `testPlanConsumerFenceMatrix` runs root, Codex, GitLab, and Gitea classifier/validator ports over fenced decoys for Meta, Nodes, Node Briefs, and Node Ledger, including a five-backtick opener with shorter embedded delimiter, language tags, adjacent boundaries, and an in-section fenced h2. All editions select genuine bodies, stamp the same hash, and pass resume-check; duplicate genuine Nodes and unclosed fencing refuse.

tests_changed:
- scripts/test-adaptive-node.js
- scripts/simulate-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- retained prior parser coverage in plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

implementation_files_changed:
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- retained synthesized n1 changes in all four adaptive-node ports
- retained prior fence scanner changes in all four classifier ports

validation_results:
- `node scripts/test-adaptive-node.js` — PASS, 1728 assertions. Existing negative task-mirror fixtures emitted two expected EISDIR stack traces; command exited 0.
- `node scripts/simulate-workflow-walkthrough.js` — PASS, `Workflow walkthrough simulation passed` (completed independent repair run).
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — PASS, `GitLab workflow script tests passed`; final diagnostic grep found no ambient auth/host/401/unknown-flag strings after the fail-fast shim repair.
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — PASS, `Gitea workflow script tests passed`.
- `npm run sync:editions` — PASS; regenerated exactly the Codex/GitLab/Gitea plan-validator ports.
- `node scripts/edition-sync.js --check` — PASS, 10 forge aggregator ports / 24 common mirrors / 27 byte-identical groups.
- `node scripts/test-edition-sync.js` — PASS, 41 assertions.
- `node scripts/validate-script-sync.js` — PASS, all common/byte/rename/export families in sync.
- `git diff --check` — PASS.
- Final redundant focused chain: `test-adaptive-node.js` completed PASS (1728); walkthrough was still running and had reached `testAdaptivePerInstanceBarrierHardening: PASSED` when the node wait budget expired. The chain was terminated safely; this does not replace the earlier complete walkthrough PASS.
- Frozen four-edition Meta command — PASS, exit 0, run exactly once in frozen order:
  - `npm run test:kaola-workflow:claude` — PASS; `adaptive-node tests passed (1728 assertions)`, `Workflow walkthrough simulation passed`, active-folder parity, routing-surface generation, and the full Claude chain completed before Codex began.
  - `npm run test:kaola-workflow:codex` — PASS; Codex contract validation, installer walkthrough (`Kaola-Workflow walkthrough simulation passed`), active-folder parity, and routing-surface generation completed before GitLab began.
  - `npm run test:kaola-workflow:gitlab` — PASS; vendored-agent validation, edition sync, GitLab contract validation, Claude/Codex GitLab walkthrough sentinels, active-folder parity, and routing-surface generation completed before Gitea began.
  - `npm run test:kaola-workflow:gitea` — PASS; vendored-agent validation, edition sync, Gitea contract validation, `Gitea workflow walkthrough simulation passed`, `Gitea Codex workflow walkthrough simulation passed`, active-folder parity, and routing-surface generation all completed; aggregate command exited 0.

original_baseline_to_repaired_worktree_file_set:
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
- scripts/test-adaptive-node.js
- scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js
- scripts/simulate-workflow-walkthrough.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- kaola-workflow/bundle-658-659-660/.cache/n1-canonical-fanout-evidence.md (retained upstream receipt)
- kaola-workflow/bundle-658-659-660/.cache/n2-fence-parser-and-hermetic-fixtures.md

failure_classification: R1-R5 were behavior/test or coverage failures routed to tdd-guide. No unresolved build/type/lint/tooling failure remains; focused, sync, and frozen Meta validation are green.
delegation_outcome: completed — tdd-guide executed directly as dispatched; no sub-delegation; parent worktree integration preserved and no manual commit was made.

## Second repair cycle — authoritative Node Briefs convergence

RED: `node scripts/simulate-workflow-walkthrough.js` exited 1 in `testNodeBriefAuthoritativeSectionMatrix`: root `nodeBriefsPresent` treated a fenced-decoy-only `## Node Briefs` heading as authoritative (`root: fenced-decoy-only Briefs must be absent`).
GREEN: The same walkthrough completed with `testNodeBriefAuthoritativeSectionMatrix: PASSED` and final sentinel `Workflow walkthrough simulation passed`; root/Codex/GitLab/Gitea all parsed only the genuine brief, produced one identical Briefs hash, froze, resumed, and structurally refused duplicate/unclosed Briefs.

adversarial_upstream: n5 findings supplied by the repaired-node dispatch after its receipt was invalidated on reopen; no stale n5 receipt was reused.
candidate_boundary: a290dbce5bbd321c97390039b5a19e0eb579f66cfbc5d1334820b8c845ac1e12

R1_node_brief_parser: resolved. All classifier editions expose `markdownFenceTransition` and `sectionBodyState`; `parseNodeBriefs` consumes that same transition before testing each `###` candidate. Same-family closers must meet the opening run length and have an empty suffix, so shorter delimiters and info-suffixed delimiter lines cannot expose fenced ghost briefs. The four-edition matrix covers five-backtick and four-tilde openers, shorter delimiters, info suffixes, fenced ghosts, and the genuine `### impl` body.

R2_presence_hash_ambiguity: resolved. `nodeBriefsPresent`, `parseNodeBriefs`, `computePlanHash`, and `validatePlan` all consume one structured section state (`absent|present|ambiguous`). A fenced-decoy-only heading and no heading are both absent and hash-identical. Duplicate genuine headings or unclosed/ambiguous fencing produce the stable typed refusal `briefs_section_ambiguous`; ambiguous content hashes with an explicit ambiguity marker and cannot freeze silently. The four-edition matrix covers parse/hash/freeze/resume and structural refusal behavior.

second_cycle_files_changed:
- scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow/scripts/kaola-workflow-classifier.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/simulate-workflow-walkthrough.js
- kaola-workflow/bundle-658-659-660/.cache/n2-fence-parser-and-hermetic-fixtures.md

second_cycle_validation_results:
- Initial `node scripts/simulate-workflow-walkthrough.js` — RED as recorded above.
- Final `node scripts/simulate-workflow-walkthrough.js` — PASS, `Workflow walkthrough simulation passed`.
- `node scripts/test-adaptive-node.js` — PASS, `adaptive-node tests passed (1728 assertions)`; its two EISDIR negative-fixture traces remained expected and non-fatal.
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — PASS, `GitLab workflow script tests passed`; prior hermetic fixture behavior preserved.
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — PASS, `Gitea workflow script tests passed`.
- `npm run sync:editions` — PASS after canonical edits; regenerated the Codex classifier/validator and GitLab/Gitea validator ports.
- `node scripts/edition-sync.js --check` — PASS, 10 forge aggregator ports / 24 common mirrors / 27 byte-identical groups.
- `node scripts/test-edition-sync.js` — PASS, 41 assertions.
- `node scripts/validate-script-sync.js` — PASS, all common/byte/rename/export families in sync.
- `git diff --check` — PASS.
- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/bundle-658-659-660/workflow-plan.md --candidate-hash --json` — PASS; candidate boundary `a290dbce5bbd321c97390039b5a19e0eb579f66cfbc5d1334820b8c845ac1e12`.
- Interrupted post-edit Meta attempt — run-gap noise only, not acceptance evidence: safely stopped with exit 130 during Claude after the explicit node budget expired; Codex/GitLab/Gitea were not reached.
- Complete post-edit frozen Meta rerun — PASS, aggregate exit 0, run from the beginning in frozen order:
  - `npm run test:kaola-workflow:claude` — PASS; common/script/contract checks, `adaptive-node tests passed (1728 assertions)`, `testNodeBriefAuthoritativeSectionMatrix: PASSED`, `Workflow walkthrough simulation passed`, active-folder parity, and routing-surface checks completed before Codex began.
  - `npm run test:kaola-workflow:codex` — PASS; Codex contract validation, `Kaola-Workflow walkthrough simulation passed`, active-folder parity, and routing-surface checks completed before GitLab began.
  - `npm run test:kaola-workflow:gitlab` — PASS; vendored-agent validation, edition sync, GitLab contract validation, GitLab and GitLab-Codex walkthrough sentinels, active-folder parity, and routing-surface checks completed before Gitea began.
  - `npm run test:kaola-workflow:gitea` — PASS; vendored-agent validation, edition sync, Gitea contract validation, `Gitea workflow walkthrough simulation passed`, `Gitea Codex workflow walkthrough simulation passed`, active-folder parity, and routing-surface checks completed; aggregate command exited 0.

second_cycle_failure_classification: Both adversarial findings were behavior/coverage failures and are GREEN in focused tests. No build/type/lint/tooling failure remains; focused, sync, candidate-boundary, and complete post-edit four-edition Meta validation are green.
delegation_outcome: completed — tdd-guide executed directly as dispatched; no sub-delegation, no documentation or financial-agent access, no manual commit, and no node close.
