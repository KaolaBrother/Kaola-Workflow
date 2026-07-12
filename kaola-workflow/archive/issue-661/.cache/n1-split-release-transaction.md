evidence-binding: n1-split-release-transaction df5b5eb5c8ba
RED: `node scripts/test-release.js` exited 1 before implementation: `FAIL: T15 RED control: created tag must contain bumped package 5.1.0 (legacy defect leaves 5.0.0)`; summary `test-release: 1 test(s) FAILED, 112 passed`. This disposable committed-baseline control proved legacy `--cut` wrote 5.1.0 into the worktree while `git show kaola-workflow--v5.1.0:package.json` still returned 5.0.0.
GREEN: `node scripts/test-release.js` exited 0 after implementation: `test-release: all 88 assertions passed`; the same disposable-repository path now uses prepare -> commit -> strict chain receipt -> tag and proves the created tag resolves exactly to candidate HEAD and byte-for-byte `git show <tag>:<path>` equals all eight prepared release files.

Assigned task: n1-split-release-transaction — replace unsafe one-step cut with a test-first, crash-resumable prepare/commit/check/tag transaction.

Write set:
- scripts/kaola-workflow-release.js
- plugins/kaola-workflow/scripts/kaola-workflow-release.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js
- scripts/test-release.js

Tests changed:
- Replaced legacy cut-success expectations with 88 focused assertions covering the historical tag-tree defect; pre-mutation prepare guards; exact eight-file allowlist; no tag during prepare; independent explicit/derived Codex resolution; version-scoped step receipts; deterministic partial-step resume; same-binding idempotency; cross-version refusal; refusal-only non-mutating cut guidance; dirty/missing/malformed/wrong-version/stale-surface tag refusals; package, three Codex manifests, two Claude manifests, README, and CHANGELOG mismatches; missing/unparseable/stale/dirty-stamped/empty/incomplete/red/waived chain receipts; conflicting tags; strict tag-to-HEAD binding; candidate-SHA authorization/completion; byte-for-byte tag-tree reads; strict rerun idempotency; verify/push compatibility; and forge-token neutrality.

Implementation files changed:
- Canonical release CLI implements `--prepare` and `--tag`, preserves `--verify`/`--push`, and turns every `--cut` form into `cut_compatibility_refusal` with the five-step executable sequence.
- Prepare records `prepare_binding` before mutation, appends per-file completion steps, records the exact hashed prepared surface with `candidateSha:null`/`authorized:false`, and resumes only the same version/resolution.
- Tag checks tracked cleanliness, semantic and hashed surface agreement, complete unwaived green chain receipt strictly bound to HEAD, existing-tag equality, then appends candidate-SHA-bound authorization/completion, creates the tag explicitly at HEAD, and reads the tag tree back before success.
- Canonical/Codex copies are byte-identical. GitLab/Gitea ports were regenerated with the repository's exported rename normalizer and validate as rename-normalized equivalents.

Validation commands and outcomes:
- `node scripts/test-release.js` (pre-implementation RED) — exit 1; exact signature recorded above.
- `node scripts/test-release.js` (final focused GREEN) — exit 0; all 88 assertions passed.
- `npm run sync:editions` plus `renameNormalize` regeneration of the two release ports — completed; Codex release copy updated and forge ports regenerated.
- `node scripts/validate-script-sync.js` — exit 0; 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks families, and 7 forge export-superset families in sync.
- `node scripts/validate-workflow-contracts.js` — exit 0; passed.
- `node scripts/validate-kaola-workflow-contracts.js` — exit 0; passed.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — exit 0; passed.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — exit 0; passed.
- Meta validation (run once): `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — exit 0. All four sequential edition chains passed. Expected fixture diagnostics (mocked remote TLS/API errors, deliberate EISDIR/error-path traces, deliberate red/timeout run-chain fixtures) remained assertions inside passing suites and did not fail the command.
- `git diff --check` — exit 0.
- `cmp -s scripts/kaola-workflow-release.js plugins/kaola-workflow/scripts/kaola-workflow-release.js` — exit 0 (`codex-byte-identical`).

Disposable tag-tree assertions:
- Prepare changed exactly CHANGELOG.md, README.md, package.json, all three Codex manifests, and both Claude manifests; `unrelated.txt` stayed byte-identical and no 5.1.0 tag existed.
- After committing only that allowlist and stamping a complete clean all-green receipt at candidate HEAD, `--tag` returned `tag_tree_verified:true`.
- `git rev-parse kaola-workflow--v5.1.0^{commit}` equaled candidate HEAD.
- For every one of the eight release files, raw `git show kaola-workflow--v5.1.0:<path>` bytes equaled the candidate worktree bytes.
- Both `tag_authorized` and `tag_complete` receipt entries carried the exact candidate SHA; the fully agreeing rerun returned `idempotent:true`.

Failure classification: no final behavior/test or build/type/lint/tooling failure. The frozen Meta command completed green.

## REPAIR — blocking review findings R1–R5

RED: `node scripts/test-release.js` exited 1 with `test-release: 20 test(s) FAILED, 100 passed`. Signatures included lone `prepared` receipt returning `result:"ok"`, every missing prepare step returning `result:"ok"`, duplicate/foreign rows returning `result:"ok"`, unrelated candidate history reaching `tag_conflict` instead of provenance refusal, forced post-create read fault leaving the tag, reduced verify/push envelopes, and explicit no-tag bootstrap refusing.
GREEN: `node scripts/test-release.js` exited 0 after repair with `test-release: all 134 assertions passed`.

Repair implementation:
- R1: added a coherent transaction validator requiring exactly one same-version `prepare_binding`, exactly one terminal `prepared`, exactly one completion row for each of the eight file/step pairs, matching versions/resolution/baseline/date, exact unique prepared allowlist, and terminal `candidateSha:null` plus `authorized:false`. Missing rows refuse `release_receipt_incomplete`; duplicates, foreign-version rows, subset/duplicate surfaces, mismatched fields, and malformed bindings refuse without tag mutation.
- R2: tag now resolves the recorded baseline and requires exactly one candidate commit whose `git diff --name-status <baseline> <candidate>` is exactly eight `M` entries for the release allowlist. Unrelated additions/modifications, extra/empty commits, renames, deletes, and a committed release receipt refuse `candidate_surface_mismatch`; the exact allowlist candidate remains the success control.
- R3: candidate tree bytes are verified before tag creation. Post-create verification failure compare-checks that the tag was newly created and still resolves to the candidate before deleting only that tag. A fault-injected post-create `git show` failure returns `tag_tree_verification_failed` with refs byte-identical to the pre-call snapshot.
- R4: restored verify JSON fields `changelog_refs`, `closed_issues`, `chain_greenness`, and conditional `chain_warning`, plus the prior human verification text. Restored the full forge-neutral push/publish guidance in both JSON and human output, including the release-create and `--notes-from-tag --latest` instructions.
- R5: explicit `--codex-version` now bootstraps without a prior root tag after normal semver/lockstep/Codex monotonic guards; derive-without-tag still refuses `codex_version_underivable`.

Repair validation commands and outcomes:
- `node scripts/test-release.js` (repair RED) — exit 1; 20 failed / 100 passed, signatures summarized above.
- `node scripts/test-release.js` (repair GREEN) — exit 0; all 134 assertions passed.
- `npm run sync:editions` plus repository `renameNormalize` regeneration of both forge release ports — completed.
- `node scripts/validate-script-sync.js` — exit 0; all sync families green.
- `node scripts/validate-workflow-contracts.js` — exit 0.
- `node scripts/validate-kaola-workflow-contracts.js` — exit 0.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — exit 0.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — exit 0.
- `git diff --check` — exit 0.
- Shared Meta command: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — exit 0; all four sequential edition chains passed. Expected negative-fixture diagnostics remained inside passing suites.

Repair write set remained exactly the assigned five product files. No docs or changelog were modified.

## REPAIR R6 — coherent idempotent publication transaction

RED: `node scripts/test-release.js` exited 1 with `test-release: 16 test(s) FAILED, 166 passed`. Every independent missing/duplicate/foreign/tampered terminal-receipt probe demonstrated that the old idempotent branch either returned `result:"ok", idempotent:true`, recreated completion, or emitted only the weaker `tag_binding_stale` instead of rejecting the contradictory publication transaction.
GREEN: final `node scripts/test-release.js` exited 0 with `test-release: all 194 assertions passed`.

R6 implementation:
- Added `validatePublication()` after coherent prepare validation, exact baseline/candidate validation, semantic/surface validation, strict current chain validation, and live tag lookup.
- A genuinely new publication requires zero terminal rows and no existing tag. An existing tag with absent terminal state refuses `publication_receipt_incomplete`.
- Completed publication requires exactly one `tag_authorized` and exactly one `tag_complete`, both for the requested version. Missing rows refuse incomplete; duplicates or foreign-version rows refuse `publication_receipt_contradictory`.
- Both rows must be `status:"done"` and exactly equal the coherent prepare/current state for candidate SHA, root version, Codex version, byte-ordered prepared surface, current green chain receipt HEAD, and expected tag name. The live tag must resolve to the same candidate and its tree must still match before idempotent success.
- New authorization and completion rows now both persist `chainHeadSha` and `tag`, making the audited equality explicit.

R6 test coverage independently tampers/removes/duplicates:
- authorization: status, version, candidate SHA (including wrong authorization with otherwise correct live tag), root version, Codex version, prepared surface, chain HEAD, and tag;
- completion: status, version, candidate SHA, root version, Codex version, prepared surface, chain HEAD, and tag;
- missing authorization/completion, duplicate authorization/completion, and cross-version authorization/completion.
- Every refusal snapshots and proves refs unchanged; the untouched completed transaction remains the idempotent success control. All prior R1–R5 and verify/push compatibility assertions remain green.

R6 validation:
- `node scripts/test-release.js` RED — exit 1; 16 failed / 166 passed.
- `node scripts/test-release.js` GREEN — exit 0; 194 assertions passed.
- `npm run sync:editions` plus repository `renameNormalize` regeneration — completed.
- `node scripts/validate-script-sync.js` — exit 0.
- Root, Codex, GitLab, and Gitea contract validators — all exit 0.
- `git diff --check` — exit 0.
- Shared sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — exit 0; all four edition chains passed.

R6 repair remained inside the original five-file write set; no docs or changelog were edited.

## REPAIR R7 — fail-closed tracked-worktree status probe

RED: `node scripts/test-release.js` exited 1 with `test-release: 8 test(s) FAILED, 194 passed`. PATH-local Git wrappers forced only `git status --porcelain --untracked-files=no` to exit 74. Both clean and genuinely tracked-dirty prepare/tag fixtures failed to return the required typed refusal, and all four full-state snapshot comparisons detected mutation.
GREEN: final `node scripts/test-release.js` exited 0 with `test-release: all 202 assertions passed`.

R7 implementation:
- Replaced `dirtyTracked()`'s ambiguous string/catch API with `trackedStatus()` returning `{ok:true,value}` only after a successful Git status probe, or `{ok:false,reason:"worktree_status_unavailable",exitCode}` on execution failure.
- `--prepare` probes immediately after version syntax validation, before reading/resuming/appending any receipt or changing any release file. Probe failure returns stable typed `worktree_status_unavailable`; a successful nonempty result retains ordinary `dirty_worktree` behavior. Crash-resume path classification reuses the same proven status result.
- `--tag` performs the same typed probe before reading/validating receipts or touching refs. A clean chain stamp cannot compensate for an unavailable current-worktree probe.

R7 tests:
- PATH wrapper delegates every Git command to the real binary except status, which exits 74.
- Independently tests prepare-clean, prepare-tracked-dirty, tag-clean, and tag-tracked-dirty fixtures.
- Each case snapshots all eight release files, release-receipt existence and bytes, HEAD, real tracked porcelain status, and all refs before the faulted call; each typed refusal leaves the entire snapshot identical.
- Existing ordinary dirty-worktree, R1–R6, strict idempotency, verify, and push tests remain green.

R7 validation:
- Focused RED — exit 1; 8 failed / 194 passed.
- Focused GREEN — exit 0; 202 assertions passed.
- Edition synchronization plus rename-normalized forge regeneration — completed.
- `node scripts/validate-script-sync.js` and all four relevant contract validators — exit 0.
- `git diff --check` — exit 0.
- Sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — exit 0; all four edition chains passed.

R7 remained inside the original five-file write set; no docs or changelog were edited.

## REPAIR R8 — typed release-tag enumeration and systematic Git-probe audit

RED: the blocking disposable counterexample faulted only `git tag -l` (exit 74) in a repository that actually contained `kaola-workflow--v5.0.0`; `--prepare --version 4.0.0 --codex-version 3.9.9` incorrectly exited 0, changed package/manifests/README/CHANGELOG/receipt, and downgraded the package to 4.0.0. The first systematic probe run additionally exited 1 with `4 test(s) FAILED, 226 passed`, exposing incomplete show/create/post-create snapshot expectations.
GREEN: final `node scripts/test-release.js` exited 0 with `test-release: all 232 assertions passed`.

R8 implementation:
- Removed the generic null/empty-on-error Git helper. `gitProbe()` now returns typed success with value (including a legitimate empty string/list) or typed failure with exit code.
- `releaseTags()` distinguishes a successfully empty tag list from `release_tag_list_unavailable`. Prepare and tag enumerate before dirt/receipt logic, so tag-query failure refuses before mutation on both clean and dirty fixtures. Explicit no-tag Codex bootstrap remains allowed only after a successfully empty list.
- Prepare also fails closed on release-history/log and HEAD probes before appending the binding receipt.
- Tag fails closed with stable probe-specific reasons for candidate HEAD, recorded baseline resolution, candidate commit-count history, name-status diff, candidate/tag tree reads, and existing/post-create tag target resolution.
- Tag creation now uses atomic `git update-ref refs/tags/<tag> <candidate> <zero-old>`; post-create failure uses atomic compare-delete `git update-ref -d ... <candidate>`. A successful compare-delete restores refs; a failed compare-delete returns `tag_rollback_failed` and never deletes an uncertain/nonmatching ref.

Systematic fault coverage:
- release tag enumeration: clean/dirty prepare downgrade fixtures, plus tag path;
- status: prior R7 clean/dirty prepare/tag matrix;
- release history log and prepare HEAD;
- tag candidate HEAD, baseline `rev-parse`, `rev-list --count`, `diff --name-status`, raw candidate tree `show`, existing live-tag target, post-create live-tag target, atomic create, raw post-create tree read, and compare-delete rollback;
- every pre-mutation diagnostic fault snapshots all eight files, receipt existence/bytes, HEAD, real tracked status, and refs; operational create/post-create cases separately prove files/HEAD/status/ref safety and explicit receipt/rollback outcomes.
- legitimate empty tag-list explicit bootstrap and all R1–R7/idempotency/verify/push controls remain green.

R8 validation:
- Focused GREEN — exit 0; 232 assertions passed.
- Edition sync and rename-normalized forge regeneration — completed.
- `node scripts/validate-script-sync.js`, root/Codex/GitLab/Gitea contract validators, and `git diff --check` — all exit 0.
- Fresh sequential Meta command `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — exit 0; all four chains passed.

R8 remained inside the original five-file write set; no docs or changelog were edited.
