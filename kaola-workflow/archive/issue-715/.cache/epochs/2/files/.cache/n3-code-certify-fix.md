evidence-binding: n3-code-certify-fix 45da7230e295
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 0efba987cdaf8f0e3496a75f54a44cc0c6a5720ce20b58e6e4b8560807b28c85
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: 166dc98b21a1f7b7dde0734287342d85cf2b71b762166406d4b23349ad2f5528
domain_outcome: approved
gate_mode: change_gate
gate_claim: the F1 repair makes the release and watch-pr sweep discard-archive commit land on the surviving base branch — or truthfully report discard_archive_committed false with the receiving branch disclosed and the archive left recoverable — in every checkout posture (in-place feature-branch release, non-base sweep, base-branch release), with diff-quiet, commit-failure, and offline semantics intact, no epoch-1 behavior regressed, codex byte-twin and gitlab/gitea port parity proven, and the documentation delta matching the shipped fields
gate_surface: the complete epoch-2 candidate: the claim.js four-edition family (canonical, codex byte twin, gitlab and gitea hand ports), the claude-chain test surfaces (simulate-workflow-walkthrough.js, test-claim-hardening.js), and the documentation delta, reviewed against the parent-epoch F1 refutation evidence and the accumulated diff vs the claim root base
gate_aggregation: sequence
upstream_read: n2-branch-commit-docs 5f37ba9a8dcb

verdict: pass
findings_blocking: 0
review_summary: no_blocking_findings
review_attestation: full_review_completed

## Candidate and context

- Candidate = accumulated worktree diff vs HEAD (HEAD == claim_root_base cd28e8e52fb641cf2173ced57c91a042e3c13e1e, matching the review context). 14 modified files: the epoch-1 thirteen (claim.js/sink-merge.js four-edition family, test-sink-merge.js, simulate-workflow-walkthrough.js, CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md) plus the epoch-2 repair delta (second hunks in the four claim.js copies, the two new walkthrough tests, new test-claim-hardening.js pins, docs amendments). git status --porcelain shows exactly those 14 + the untracked kaola-workflow/issue-715/ run tree: zero out-of-set writes.
- Review context validation_obligations: [] (empty — honored structurally; nothing extra owed). review_phase: discovery, attempt_ordinal 1, prior_findings: [] — recorded structurally.
- Parent-epoch refutation read in full: kaola-workflow/issue-715/.cache/epochs/1/files/.cache/n4-falsify-residue-fixes.md (F1, triggers A/B, anchors claim.js:3329 call site, :3307 restore gate, adaptive-schema.js:3391 never-parked, :4299 sweep, :2321-2351 helper). The repair was judged against every F1 component.
- Role honored read-only: no repository file modified; all verification was Read/Grep/diff plus the shipped test suites, which build fixtures under os.tmpdir() and clean them up.

## F1 repair verification (judged against the parent-epoch refutation)

Trigger A (in-place NATIVE=0 release with checkout on the feature branch) — RESOLVED by construction and by executed test:
1. cmdRelease reads base_branch BEFORE the archive move (scripts/kaola-workflow-claim.js:3327-3329) and computes releaseBaseBranch = savedBaseBranch || defaultBranch(root) (:3345).
2. The restore gate now exempts ONLY the ACTUAL result.dest (:3349-3359: path.relative(root, result.dest), '..' rejected — the #700 collision-suffix lesson). treeDirty (:537-573) applies the exemption segment-boundary exact (norm === e || norm.startsWith(e + '/'), :567-570) and switches to -uall ONLY when an exemption is in play (:560-564), so a collapsed untracked tree can neither hide the dest nor mask a foreign sibling. Without an exemption the command and semantics are byte-identical to before; the two other callers (:1158, :1353) pass no exemption and are untouched. isParkedLanePath semantics untouched — kaola-workflow-adaptive-schema.js is absent from the candidate diff, and the baseline pin (test-claim-hardening.js:3593) proves archive/* still counts dirty with no exemption.
3. With the exact dest exempt, the restore proceeds (checkout base + delete feature, :3360-3371); commitDiscardArchive then runs (:3384) and its INTERNAL guard (:2362-2372) re-verifies current branch == surviving base before staging — defense in depth both call sites inherit.
4. If the tree is dirty for any OTHER reason, the restore is still skipped (restoreNote) and the helper refuses: committed:false, branch:feature, detail naming both branches, archive left on disk as recoverable residue, loud warnings[] entry (:3407-3411) — exactly the gate claim's fallback clause.
5. Executed GREEN (full suite re-run by this reviewer): testReleaseInPlaceOnFeatureBranchCommitsArchiveOnBase (simulate-workflow-walkthrough.js:6882-6954) asserts exit 0, released:true, HEAD == main, feature branch deleted, discard_archive_committed === true, discard_archive_branch === 'main', the archive a tree at main:<rel>, zero .discarded- residue in -uall porcelain, and the commit REACHABLE from main after the release-performed cleanup (the exact orphan scenario of the parent epoch's R1, inverted).

Trigger B (watch-pr CLOSED sweep on a non-base checkout) — RESOLVED by construction and by executed test:
1. The sweep reads base_branch BEFORE archiveProjectDirSafely moves the state file (:4345-4351) and passes sweepBaseBranch into the same helper (:4365); the in-helper guard refuses before staging on any non-base branch.
2. The cleanup entry truthfully reports discard_archive_committed:false, discloses discard_archive_branch (the current non-receiving branch), and carries discard_archive_commit_detail on the skip (:4403-4407).
3. Executed GREEN: testWatchPrClosedSweepSkipsCommitOffBaseBranch (:6956-7036) asserts committed === false, branch === 'workflow/other-lane', BOTH ref tips byte-unchanged (no commit swept onto the unrelated branch, none onto the base), and exactly one .discarded- residue dir recoverable on disk — the parent epoch's W3 outcome, inverted.

Root-cause closure: F1's mechanism (unconditional commit binding to whatever HEAD is) is removed at BOTH call sites by the in-helper guard; the deterministic dirty-skip of the restore (the archive vetoing its own restore because archive/* is never-parked) is removed by the exact-dest exemption; F1's folded observation O3 (no branch disclosure) is closed by discard_archive_branch on both emit sites, success AND skip.

## Epoch-1 semantics preservation (no regression)

- The helper regions carrying epoch-1 behavior are present unchanged (read in full, :2348-2392): dest-existence and outside-toplevel refusal (:2349-2358), pathspec-scoped `git add -A -- <rel>` with failure detail (:2373-2377), the diff-quiet guard `git diff --cached --quiet -- <rel>` exit-1 check (:2378-2384), pathspec-scoped `git commit -- <rel>` (:2383), cat-file HEAD tree verification (:2385-2388), and the outer catch returning committed:false + detail without ever throwing past the emit (:2389-2391). The epoch-2 guard inserts BEFORE staging only; branch is added to every return path. Zero OFFLINE branches in the helper (grep count 0) — offline never skips a commit that runs.
- The epoch-1 sink-merge surface is untouched by the repair: the sink-merge.js delta vs HEAD is the epoch-1 20 +/- lines only, and node scripts/test-sink-merge.js passed 105 assertions (same count as the parent epoch's certification).
- Full regression gate re-run by this reviewer, all green: node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed" (full suite, includes the two new F1 tests AND the epoch-1 release/sink/watch-pr cells: linked-worktree release commit success, watch-pr sweep success, closure invariants); node scripts/test-claim-hardening.js -> 464 assertions passed (450 pre-existing + 14 new #715 F1 pins); node scripts/test-bundle-finalize.js -> all 149 passed; node scripts/test-kimi-edition.js -> 577 assertions; node scripts/test-opencode-edition.js -> 547 assertions.

## Four-tree parity (proven, not inferred)

- Codex byte twin: diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js is EMPTY (byte-identical); same for sink-merge.js.
- GitLab/Gitea hand ports: commitDiscardArchive body md5-identical across canonical/gitlab/gitea (ca78cd6993e1d37ce0048f5fe6dfecf7); treeDirty executable body (comments stripped) md5-identical (d9f91cdb60ee3eb09c9889fca794095f); release restore-gate call-site and sweep call-site executable parity confirmed — the only differing lines are pre-existing forge-namespace idioms (issue_iid, clearAdvisoryClaim forge-arg signatures), which produce ZERO +/- lines in the candidate diff vs HEAD (untouched by this candidate). All repair lines (sweepBaseBranch pre-read, helper call with base, discard_archive_branch disclosure, exemptRelPaths) are present in both ports.
- node scripts/validate-script-sync.js -> OK (25 common scripts, 28 byte-identical groups); node scripts/edition-sync.js --check -> parity; plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js and plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js both passed.

## RED-first reproduction and test quality

- RED (from the n1 evidence, consistent with the parent epoch's demonstrations): the two walkthrough tests failed pre-impl with the exact F1 outcomes (HEAD=workflow/issue-801 on trigger A; committed:true with no disclosure on trigger B), and the claim-hardening pins failed pre-impl on the not-yet-exported treeDirty/commitDiscardArchive. The shipped assertion strings match the recorded RED output verbatim.
- GREEN: both walkthrough tests now pass inside the FULL suite (no --only selection); the 14 new claim-hardening pins cover: baseline never-parked, exact-dest exempt, sibling-dirty still blocks, prefix look-alike NOT exempt (segment-boundary), helper refuses off-base with branch + dual-named detail + tip unchanged + residue on disk, helper commits on-base with branch disclosed and tree at HEAD.
- Both emit sites were cross-checked against the tests' JSON assertions: release top level (:3415-3418 — committed + branch always, detail only on failure) and sweep cleanups[] entry (:4403-4407 — same shape).

## Documentation delta (matches the shipped fields exactly)

- CHANGELOG.md [Unreleased] ### Fixed: the new #715 follow-up entry describes the dest-only restore-gate exemption (segment-boundary exact), the in-helper off-base refusal at both call sites, the sweep base_branch pre-read + off-base skip with truthful committed:false, discard_archive_branch on BOTH emit sites on success AND skip, and unchanged epoch-1 semantics — all verified against the code.
- docs/api.md: the NATIVE=0 paragraph and the new "Discard-archive commit (issue #715)" Closure Contract paragraph state discard_archive_committed: true|false (truthfully false on an off-base skip), discard_archive_branch on both success and skip, discard_archive_commit_detail + warnings[] on failure, base-branch binding enforced inside commitDiscardArchive, dest-only exemption, sweep pre-read — field names and semantics match claim.js:3415-3418 and :4403-4407 exactly (the shipped field name is discard_archive_branch, matching n2's fields_mirrored line).
- docs/workflow-state-contract.md terminal-journal-disposal paragraph: base-branch binding, dest-exempt restore gate, off-base sweep skip with truthful committed:false + discard_archive_branch — matches the code.

## Scope, obligations, and prior observations

- Zero out-of-set writes; zero validation gaps (validation_obligations was empty; the gate_claim's every-posture matrix — in-place feature-branch release, non-base sweep, base-branch release — is covered: the first two by the new executed tests, the base-branch posture by the re-run epoch-1 suite and the helper pin's on-base path).
- Parent-epoch non-blocking observations O1 (degenerate reserved-name receipt paths, sink-merge regex) and O2 (gitignored-residue warning phrasing) bind to the epoch-1 sink-merge/warning surface the repair deliberately did not touch; they remain trivial, non-blocking, and exactly as classified in the parent epoch — not re-admitted here.

findings_none: true


domain_outcome: approved

review_conclusion: the F1 repair closes both parent-epoch triggers by construction and by executed test — the exact-dest restore-gate exemption lets the in-place base restore proceed, the in-helper base guard binds the discard-archive commit to the surviving base branch at both call sites or truthfully reports committed:false with the branch disclosed and recoverable residue, epoch-1 diff-quiet, commit-failure, offline and pathspec semantics are intact, codex twin and forge ports are proven in parity, the docs delta matches the shipped fields, and the full gate of suites re-ran green with zero admitted findings.
certifier_kind: code
certifier_aggregation: sequence
certifier_gate_digest: 370047fd11c1ea09c7c2af1aad7d78a572bce8a99bda2dbcf5b799201c7f91a7
certifier_epoch_lineage_id: e7aca78f34436bc91971c55844464388d936ebbce2289dbe5ebe26a5ad66b3cd
certifier_inherited_frontier_digest: f8a6ef769e3f012d484dd2859f77ac81202e39124c5ab8cfb53c9634d0c1bd06
certified_candidate_digest: c1003bdea4548c520cd30054c5be286ec3fcfc6b6d7b6ed2d27d76c2599bafa2
