evidence-binding: n4-falsify-residue-fixes 08baa7f03864
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 9afb1ec0c04ecaf94a9a014e0092fa9b85d774e0cd83d9aeeec94e87dff26f12
behavior_contract_hash: 0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b
resolved_profile_hash: 14c89a924b21c9291cf8a00759202b8846a5dac4e891bb8a3e625e85efc7b2ce
candidate_digest: fa2d67ff234b483d43539dfa15757a3a0ed52fe58c796c5f1e419ed1cdda9577
domain_outcome: refuted
claim_outcome: refuted
gate_mode: change_gate
gate_claim: a released claim's discard archive never again blocks a sink as foreign_dirt, an interrupted sink's receipt is exempt for every project without masking any genuinely foreign path or being touched by the sinking run, the release commit cannot strand or misreport the release transaction (diff-quiet, commit-failure, offline), and no previously-passing release/sink/resume path regressed
gate_surface: the release→discard→sibling-sink matrix (commit success, diff-quiet skip, commit failure, watch-pr CLOSED sweep) and the preflight classification matrix (own/sibling × live/archive receipt × porcelain status, deceptive look-alike paths, sibling non-receipt archive files) across all four edition copies
gate_aggregation: sequence
upstream_read: n3-code-review cee943909c3f

verdict: fail
findings_blocking: 1

## Candidate and context

- Candidate = worktree diff vs HEAD (HEAD == claim_root_base cd28e8e52fb641cf2173ced57c91a042e3c13e1e, matching the review context). 13 modified files: the claim.js/sink-merge.js four-edition family (canonical scripts/, codex byte twins, gitlab/gitea hand ports), scripts/test-sink-merge.js, scripts/simulate-workflow-walkthrough.js, CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md. Zero out-of-set writes (git status --porcelain shows only those 13 + the untracked kaola-workflow/issue-715/ run tree).
- Review context validation_obligations: [] (empty — honored structurally; nothing extra owed).
- All fixtures were built under $TMPDIR (drivers: $TMPDIR/kw715-falsify/driver-release.js, driver-preflight.js, driver-watchpr.js); the candidate worktree was never modified (read-only honored).

## CONFIRMED COUNTEREXAMPLE — finding F1 (blocking): the release/sweep archive commit binds to the current branch and is stranded + misreported whenever the checkout is not the base branch

Trigger A (deterministic): release of an in-place (NATIVE=0) run while the main checkout sits ON the feature branch — the exact posture the restore block at scripts/kaola-workflow-claim.js:3300-3322 exists for.

Mechanism, traced in code then demonstrated:
1. cmdRelease:3290 archiveProjectDirSafely renames the live folder to kaola-workflow/archive/<project>.discarded-<ts> (untracked) BEFORE the restore gate.
2. The restore gate at :3307 calls treeDirty(root, [project]); the fresh archive dest ALWAYS counts as dirty because isParkedLanePath returns false for any kaola-workflow/archive/* path (scripts/kaola-workflow-adaptive-schema.js:3391, `seg === 'archive'` → false; corroborated by the pre-existing assertion at scripts/test-claim-hardening.js:1663). The restore + branch delete are therefore ALWAYS skipped in this posture (restore_note set).
3. The candidate's new call at claim.js:3329 runs commitDiscardArchive unconditionally; the helper (:2321-2351) commits into the dest's toplevel on WHATEVER branch HEAD currently is — here the DISCARDED feature branch. Its own ordering comment ("Runs AFTER the in-place branch restore so the commit lands on the restored base branch (committing before the checkout+delete would strand the archive commit on the deleted feature branch)") names exactly this hazard but only guards the case where the restore executes — which the candidate's own archive move makes impossible in this posture.
4. cat-file verification passes against the transient feature HEAD → emit reports discard_archive_committed: true with NO branch disclosure (only restore_note mentions the skipped restore/branch-delete).

Demonstrated (driver-release.js R1, fixture $TMPDIR/kw715-r1-*, OFFLINE=1, real candidate claim.js):
- release exit 0, released:true, restore_note="tree dirty while on feature branch; skipped base restore + branch delete", discard_archive_committed=true, HEAD still workflow/issue-801.
- feature branch tip subject = "chore: discard archive issue-801"; `cat-file -t workflow/issue-801:<rel>` = tree; `cat-file -t main:<rel>` → fatal "exists on disk, but not in 'main'" — the base branch NEVER receives the archive.
- Natural completion of the release (checkout main → archive dir disappears from the worktree; branch -D workflow/issue-801) → `git rev-list --all --objects -- kaola-workflow/archive` is EMPTY and `git rev-list --all` shows only the init commit: the discard archive is UNREACHABLE from every ref — silent loss of the archive the release reported as committed.

Pre-fix regression proof (driver-release.js R1-prefix: identical fixture against pre-fix code materialized via `git archive HEAD scripts` into $TMPDIR, never touching the worktree): released:true, NO discard_archive_committed field, the archive remains as VISIBLE untracked residue that survives checkout main AND branch deletion — recoverable throughout. The candidate changed this posture from "recoverable residue" to "wrong-branch commit misreported as committed:true, destroyed by the natural cleanup path". This is candidate-caused.

Trigger B: watch-pr CLOSED sweep on any non-base checkout (driver-watchpr.js W3): with the checkout on an unrelated branch workflow/other-lane, the sweep (claim.js:4299, no restore logic at all) committed the discard archive onto workflow/other-lane (tip = "chore: discard archive issue-909"), reported cleanups[0].discard_archive_committed===true with NO branch-mismatch field (cleanup entry keys: folder, claim_label_removed, discard_archive_committed, receipt, closure_invariants), main never received the tree, and after checkout main + branch -D the archive was unreachable from all refs.

Refutes the gate-claim clauses "the release commit cannot strand or misreport the release transaction" (branch-restore ordering attack cell, directed by the dispatch) and "no previously-passing release/sink/resume path regressed". Both call sites are affected; all four edition copies carry the identical helper + call-site delta (parity below), so the finding spans the full surface.

finding-anchor-v1:
- failure_class: logic_error (ordering/branch-binding design gap: unconditional commit binds to current-branch HEAD; dirty-skip of the restore is deterministic in the in-place posture; committed:true misreports durability)
- trigger_components: cmdRelease of an in-place (NATIVE=0) run with checkout on the feature branch; cmdWatchPr CLOSED sweep or release with checkout on any non-base branch
- primary_anchor: scripts/kaola-workflow-claim.js:3329 (commitDiscardArchive call site — runs even when the base restore at :3304-3322 was skipped)
- secondary_anchors: scripts/kaola-workflow-claim.js:3307 (treeDirty restore gate the candidate's own archive move deterministically trips), scripts/kaola-workflow-adaptive-schema.js:3391 (archive/* never parked → always dirty), scripts/kaola-workflow-claim.js:4299 (cmdWatchPr sweep call site — same helper, zero restore/disclosure), scripts/kaola-workflow-claim.js:2321-2351 (helper verifies HEAD without a base-branch check), plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js and plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js (identical hunks), plugins/kaola-workflow/scripts/kaola-workflow-claim.js (byte twin)
- proof: R1 + R1-prefix + W3 fixture demonstrations above (commands, observed JSON, rev-list unreachability evidence); drivers at $TMPDIR/kw715-falsify/
- severity: medium
- scope: in_scope
- action: fix
- status: open
- fix_role: tdd-guide
- mitigations reported honestly: no sink is ever blocked in these postures (first claim clause holds); the archive remains recoverable from the feature branch until its deletion (and via reflog after); the dominant posture (release from main checkout / linked-worktree run) is correct — shipped walkthrough test and W1 prove it; restore_note partially discloses the skipped restore.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=discard-archive commit lands on the discarded/arbitrary current branch (restore deterministically dirty-skipped in-place; sweep has no restore) and is misreported committed:true, orphaned by natural branch cleanup — pre-fix residue was recoverable

## Claim clauses that SURVIVED strong counterexample attempts

Release→discard→sibling-sink matrix:
- Commit success: shipped walkthrough testReleaseFromLinkedWorktreeCleansMainCopy re-run green (committed:true under OFFLINE=1, zero .discarded- residue, tree at HEAD, following OFFLINE sink status sinked with no manual commit). W1 (own watch-pr sweep fixture): cleanups[0].discard_archive_committed===true, no residue, archive tree at HEAD, HEAD commit = "chore: discard archive issue-907" on main.
- Commit failure (R2a pre-commit hook exit 1; R2b .gitignore defeats git add): both exit 0 with released:true (never stranded), discard_archive_committed===false + precise discard_archive_commit_detail ("discard archive commit failed…" / "git add failed for <rel>: … paths are ignored…") + loud warnings[] entry (never misreported); residue stays on disk recoverable (staged in R2a, untracked in R2b); single clean JSON emit — no throw past the emit.
- Diff-quiet skip (R3): git shim interposes a concurrent "operator race commit" between the helper's add and its commit; the diff-quiet guard skipped the helper's own commit (no "chore: discard archive issue-806" in log), HEAD verification still reported committed:true, no spurious failure, no duplicate commit.
- Offline: every release/sink fixture above ran KAOLA_WORKFLOW_OFFLINE=1; the helper has no OFFLINE branch (grep-confirmed) and the commit landed in every success cell.
- Archive dest staging: helper stages the ACTUAL result.dest via `git add -A -- <rel>` (pathspec boundary — no sibling-prefix sweep), pathspec-scoped `git commit -- <rel>` never sweeps other staged work, toplevel resolved from dest itself with outside-toplevel refusal.

Preflight classification matrix (driver-preflight.js P1-P6, all through the real candidate sink end-to-end):
- Sibling live+archive receipts exempt across porcelain statuses: ?? untracked (P1), A staged (P2), D staged deletion of a tracked receipt (P3), M modified tracked receipt (P4) — every cell: sink exit 0 status sinked, receipt byte-untouched, never staged/committed by the sink (P2/P3 verify the staged entry is still staged-uncommitted after the sink; P1/P2 verify absence from main HEAD; P4 verifies HEAD copy unchanged). Sink's only add/commit (archive_commit :1665/:1678) is pathspec-scoped to its own project with receipt excludes; no other git mutation touches a sibling receipt (full execFileSync sweep audited).
- Look-alikes refused with ZERO mutation (P5, porcelain byte-identical before/after): sibling live+archive sink-fallback.json, live multi-segment nested/proj/.cache/sink-receipt.json, .bak suffix, a full untracked .discarded- archive's non-receipt files. Shipped (l) additionally pins .tmp, nested x/.cache, and the directory form sink-receipt.json/inner.txt — re-run green.
- Own live+archive receipts remain exempt (shipped (m), re-run green).
- Regex micro-probe (extracted verbatim from the candidate source, 15 cases): single-segment live/archive match; multi-segment, suffix, fallback, trailing-slash, case, whitespace, backslash variants refuse (see O1 for the one degenerate corner).
- P6 documented edge: a staged rename INTO a sibling receipt path is exempt — this is the claim's own stated exact-path semantic ("exempt … the live/archive sink-receipt.json of ANY project"); any file AT that path is receipt-shaped, and the sink never reads, stages, or mutates sibling receipts (receipt resolution is keyed to args.project — sink-merge.js:819-870). Non-blocking.

Regression: node scripts/test-sink-merge.js — suite passed, 105 assertions; walkthrough --only testSinkForeignDirtExemptsSiblingReceipt715 PASSED; watch-pr/release subset (testWatchPrArchivesClosedIssuePrFolder, testWatchPrEmitsClaimLabelReceipt, testWatchPrMergedClosureReceipt, testWatchPrAbandonedClosureInvariantsClean, testWatchPrRoadmapCleanupWarning, testFinalizeReleaseCleansWorktree) passed; node scripts/test-bundle-finalize.js — all 149 passed; node scripts/test-claim-hardening.js — 450 assertions passed. No previously-passing sink/resume path regressed (the only regression found is the release-path F1 above).

Four-edition parity: codex claim.js/sink-merge.js twins byte-identical to canonical (diff empty); SINK_RECEIPT_EXEMPT regex identical in all four sink-merge copies; commitDiscardArchive present as 1 definition + 3 references + 2 discard_archive_committed sites in every claim copy; gitlab/gitea claim-port diff hunks line-for-line identical to canonical's after forge-namespace normalization (kaola-<forge>-workflow prefix, watch-mr/watch-pr wording) — F1 and the verified-good behavior both span all four copies.

## Non-blocking observations (not counted in findings_blocking)

- O1: the exemption regex also matches degenerate reserved-name paths that cannot be genuine receipts — kaola-workflow/archive/.cache/sink-receipt.json (segment "archive", a reserved dir the tooling itself occupies) and kaola-workflow/.cache/.cache/sink-receipt.json (dot-segment project). Impact is nil (classification-only; never staged, mutated, read, or blocking), but strictly these are non-receipt paths the exemption newly covers; a reserved-name guard (mirroring isParkedLanePath's `seg === 'archive'` rejection) would tighten it. Candidate-caused, trivial severity.
- O2: when the discard residue is gitignored (R2b), it is invisible to `git status --porcelain -uall`, so the failure warning's phrase "the next sink preflight will refuse it as foreign dirt" is imprecise for that configuration (the discard_archive_commit_detail field itself remains accurate).
- O3 (folded into F1): restore_note discloses the skipped restore/branch-delete but nothing discloses WHICH branch received the archive commit.

## Outcome rationale

The strongest counterexample search across the full directed matrix produced one concrete, executed, candidate-caused counterexample (F1): in the branch-restore ordering attack the release/sweep commit is stranded on the discarded or an arbitrary current branch — deterministically in the in-place release posture — is misreported as discard_archive_committed:true with no branch disclosure, and is silently orphaned by the natural cleanup that the pre-fix behavior survived. Every other directed cell (commit success, diff-quiet race, commit failure, offline, sweep success/failure, the complete preflight classification matrix, four-edition parity, regression suites) was attacked and held. Per the inverted burden, one demonstrated counterexample suffices: the claim is refuted. Confidence: high on F1 (demonstrated end-to-end on the real candidate with a pre-fix control); high on the surviving clauses (executed, not inferred).

domain_outcome: refuted
claim_outcome: refuted
