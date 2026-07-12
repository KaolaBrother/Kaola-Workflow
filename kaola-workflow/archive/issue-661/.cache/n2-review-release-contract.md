evidence-binding: n2-review-release-contract ba138909f8a3
verdict: pass
findings_blocking: 0
upstream_read: n1-split-release-transaction df5b5eb5c8ba
finding: id=R1 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=coherent_prepare_transaction_enforced
finding: id=R2 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=exact_candidate_allowlist_enforced
finding: id=R3 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=tree_faults_are_ref_safe
finding: id=R4 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=verify_and_push_compatibility_restored
finding: id=R5 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=explicit_empty_tag_bootstrap_preserved
finding: id=R6 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=terminal_publication_transaction_strict
finding: id=R7 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=worktree_status_probe_refuses_fail_closed
finding: id=R8 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=authorization_relevant_git_probes_are_typed_and_fail_closed

# Code review — fifth release-transaction pass

## Verdict

APPROVE. No blocking findings remain. R1-R8 are independently resolved; every requested authorization-relevant Git probe now has an unambiguous typed result and the expected pre/post-mutation boundary. Focused tests, synchronization, all four contract validators, byte identity, diff hygiene, and one fresh sequential four-edition Meta validation are green.

## Findings

### CRITICAL

None open.

### HIGH

None open.

### MEDIUM

None.

### LOW

None.

## Systematic Git-probe review

The release implementation now uses `gitProbe()` to distinguish successful empty output from command failure (`scripts/kaola-workflow-release.js:26`-`scripts/kaola-workflow-release.js:29`). Release tag enumeration returns either a real array—including a legitimate empty array—or `release_tag_list_unavailable` (`scripts/kaola-workflow-release.js:40`). Prepare probes tag enumeration, tracked status, release history, and HEAD before binding receipt/file mutation (`scripts/kaola-workflow-release.js:131`-`scripts/kaola-workflow-release.js:161`). Tag probes tag enumeration, tracked status, candidate HEAD, baseline, candidate history/count, name-status diff, candidate bytes, and existing tag target before authorization/ref mutation (`scripts/kaola-workflow-release.js:211`-`scripts/kaola-workflow-release.js:264`).

I independently faulted 16 probe/operation classes with PATH-local Git wrappers that exited 74 only for the target command. All expected outcomes passed:

### Pre-authorization probes — full snapshot unchanged

For each case, all eight release-file bytes, release-receipt existence/bytes, HEAD, real tracked porcelain status, and refs remained identical:

- prepare release-tag enumeration → `release_tag_list_unavailable`;
- prepare tracked status → `worktree_status_unavailable`;
- prepare release history/log → `release_history_unavailable`;
- prepare HEAD → `git_head_unavailable`;
- tag release-tag enumeration → `release_tag_list_unavailable`;
- tag tracked status → `worktree_status_unavailable`;
- tag candidate HEAD → `git_head_unavailable`;
- tag recorded baseline resolution → `candidate_baseline_unavailable`;
- tag `rev-list --count` → `candidate_history_unavailable`;
- tag `diff --name-status` → `candidate_diff_unavailable`;
- raw candidate-tree `show` → `candidate_tree_verification_failed`;
- existing completed tag target resolution → `tag_target_unavailable`.

### Operational probes — explicit safe boundary

- Atomic zero-old create failure (`git update-ref refs/tags/... <candidate> <zero-old>`) → `tag_create_failed`; release files/HEAD/status unchanged, refs unchanged/no tag, exactly one authorization row and no completion row.
- Post-create tag-target resolution failure → `tag_target_unavailable`; compare-delete restored refs/no tag, release files/HEAD/status unchanged, one authorization/no completion.
- Raw post-create tag-tree `show` failure → `tag_tree_verification_failed`; compare-delete restored refs/no tag, release files/HEAD/status unchanged, one authorization/no completion.
- Compare-delete rollback failure → `tag_rollback_failed`; release files/HEAD/status unchanged, one authorization/no completion, and the implementation did not delete an uncertain ref. The surviving tag resolved exactly to the candidate created by the zero-old atomic update. This is the safe explicit failure posture rather than an ambiguous success or unsafe deletion (`scripts/kaola-workflow-release.js:265`-`scripts/kaola-workflow-release.js:274`).

No probe failure was interpreted as authorization, no pre-authorization fault mutated state, and no operational fault returned success.

## Exact R8 controls

- **Existing-tag downgrade:** with real `kaola-workflow--v5.0.0` present, faulting only `git tag -l` to exit 74 made `--prepare --version 4.0.0 --codex-version 3.9.9` refuse `release_tag_list_unavailable` with `exit_code:74`; the full release snapshot was unchanged.
- **Legitimate empty-tag bootstrap:** after successfully deleting the only root release tag, the unfaulted empty enumeration allowed `--prepare --version 5.1.0 --codex-version 3.9.9`; it returned status 0, `result:"ok"`, Codex `3.9.9`, while `git tag -l` remained empty. The bootstrap path is preserved only for a proven empty list.

## R1-R7 and compatibility reconfirmation

- **R1:** lone terminal `prepared` row refuses `release_receipt_incomplete`, state unchanged.
- **R2:** unrelated advanced candidate refuses `candidate_surface_mismatch`, state unchanged.
- **R3:** selective post-create tree fault refuses `tag_tree_verification_failed` and restores refs.
- **R4:** verify retains `changelog_refs`, `closed_issues`, `chain_greenness`, and conditional `chain_warning`; push retains forge-neutral release-create and `--notes-from-tag --latest` guidance.
- **R5:** explicit independent Codex bootstrap succeeds only after successful empty tag enumeration.
- **R6:** coherent completed publication reruns with `idempotent:true`; corrupt authorization candidate refuses `publication_receipt_contradictory`, state unchanged. The focused suite retains the complete 20-case terminal matrix.
- **R7:** ordinary tracked dirt still refuses `dirty_worktree` for prepare/tag, unchanged. The systematic matrix independently reverified typed status-probe failures.

## Complete frozen-goal result

- Prepare mutates exactly CHANGELOG, README, package, all three Codex manifests, and both Claude manifests; it persists a complete, version-scoped, non-authorizing receipt.
- Candidate authorization requires exactly one commit from the recorded baseline with exactly the eight allowlisted modified paths.
- Semantic validation checks root package/two Claude manifests/three Claude README assertions, independent Codex version in all three Codex manifests/three Codex README assertions, exact dated CHANGELOG heading, and exact prepared hashes.
- Chain authorization is clean-stamped, exact-HEAD-bound, nonempty, full declared coverage, green, and unwaived.
- Authorization/completion rows bind exact candidate SHA, root/Codex versions, byte-ordered prepared surface, chain HEAD, and tag. Strict idempotency revalidates the whole transaction.
- Candidate and tag trees are read as raw bytes. Tag creation is atomic at the candidate; post-create target/tree verification precedes completion.
- `--cut` is refusal-only; verify/push remain compatible and forge-neutral.
- Canonical/Codex are byte-identical; GitLab/Gitea remain rename-normalized equivalents. All tests use disposable repositories; no real-checkout release ref was mutated.

## Verification commands and outcomes

Commands ran from `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-661`.

1. Independent systematic probe harness: `node - <<'NODE' ... NODE`
   - Corrected run: `total:16`, `passed:16`, `failures:[]`; all typed reasons and mutation/ref boundaries matched the classifications above.
2. Independent R8/R1-R7/compatibility harness: `node - <<'NODE' ... NODE`
   - Exact downgrade refusal unchanged; legitimate empty bootstrap success; R1-R7 and compatibility controls passed.
3. `node scripts/test-release.js`
   - Exit 0: `test-release: all 232 assertions passed`.
4. `node scripts/validate-script-sync.js`
   - Exit 0: 24 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks families, and 7 forge export-superset families in sync.
5. `node scripts/validate-workflow-contracts.js`
   - Exit 0.
6. `node scripts/validate-kaola-workflow-contracts.js`
   - Exit 0.
7. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
   - Exit 0.
8. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
   - Exit 0.
9. `cmp -s scripts/kaola-workflow-release.js plugins/kaola-workflow/scripts/kaola-workflow-release.js`
   - Exit 0; canonical/Codex byte identity confirmed.
10. `git diff --check`
    - Exit 0.
11. Fresh sequential Meta command:
    - `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`
    - Exit 0. Claude, Codex, GitLab, and Gitea chains passed sequentially. Expected TLS/API, EISDIR, red-chain, and timeout diagnostics remained inside passing negative fixtures.

## Scope and security-sensitive scan

The product diff remains confined to the assigned four synchronized release scripts and focused test file. The Git-ref authorization surface was reviewed as release-integrity-sensitive; no secrets, network APIs, authentication, payments, or user-data handling changed. No security or correctness finding remains open.
