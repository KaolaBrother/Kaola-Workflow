evidence-binding: n4-adversarial-tag-binding 1cde4f1a1e9e
verdict: pass
findings_blocking: 0
upstream_read: n2-review-release-contract ba138909f8a3
finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=no_counterexample_found_in_assigned_tag_binding_surface

# Adversarial falsification — issue 661 tag authorization and binding

## Claim under test

The issue-661 `--tag` transaction authorizes only a clean, exact candidate HEAD produced by one
release-only commit from the prepared baseline; requires a coherent version-scoped prepare receipt
and a nonempty, complete, unwaived, all-green four-chain receipt bound to that exact candidate SHA;
refuses all stale, malformed, dirty, conflicting, or content-mismatched states before ref mutation;
creates `kaola-workflow--v5.1.0` at exactly the candidate commit; verifies the candidate and created
tag trees byte-for-byte against the prepared receipt; rolls a newly created tag back on post-create
verification failure; and accepts a rerun only when the tag plus both terminal publication rows still
agree exactly. Surface: `scripts/kaola-workflow-release.js:180-274`, especially semantic/hash binding
at lines 192-209, one-commit/eight-file provenance at lines 211-221, terminal receipt binding at lines
224-238, and mutation/rollback/idempotency at lines 240-274.

## Strongest disproof attempts

All repositories, commits, receipts, wrapper binaries, and refs below lived under OS-created
`/tmp/kw-n4-*` directories and were removed after each case. No real repository ref was created,
updated, or deleted.

### Independent 90-check temporary-repository matrix

Command: `node - <<'NODE' ... NODE` from the issue-661 worktree, using the production
`scripts/kaola-workflow-release.js` and independently constructed Git fixtures. The harness created a
fresh baseline tag, ran prepare, committed the exact eight-file release surface, wrote an exact-HEAD
four-chain receipt, snapshotted `git show-ref`, applied one attack, ran `--tag --version 5.1.0
--json`, and required the expected typed refusal plus a byte-identical ref snapshot.

Result: exit 0; `checks: 90`; `cases: 26`; no failed assertion.

Ref-preserving refusal cases and observed reasons:

- tracked dirty state -> `dirty_worktree`;
- advanced HEAD via a second empty commit -> `candidate_surface_mismatch`;
- otherwise-green chain receipt naming `HEAD^` -> `chains_stale`;
- empty, one-chain subset, red, waived, and malformed chain receipts -> respectively `chains_empty`,
  `chains_incomplete`, `chains_red`, `chains_waived`, and `chains_unverified`;
- malformed release-receipt JSON -> `release_receipt_unparseable`;
- empty and seven-of-eight prepared surfaces -> `release_receipt_contradictory`;
- one mixed-version prepare row -> `release_receipt_contradictory`;
- a prepare receipt wholly copied/relabelled as version 5.2.0 -> `release_receipt_missing` for 5.1.0;
- package, each of the three Codex manifests, each of the two Claude manifests, README, and CHANGELOG
  individually amended after prepare -> their exact semantic mismatch reason, with refs unchanged;
- a README change preserving all semantic version strings but changing its prepared hash ->
  `prepared_surface_stale`;
- an existing 5.1.0 tag at the old baseline -> `tag_conflict`;
- an existing 5.1.0 tag at candidate HEAD but without terminal publication rows ->
  `publication_receipt_incomplete`.

This covers package + all five manifests + README + CHANGELOG individually. Every one of these
refusals preserved the exact pre-invocation `git show-ref` output.

### Real Git read-fault injection

Command: a second `node - <<'NODE' ... NODE` harness installed an executable `git` wrapper in a
temporary PATH and delegated every operation to the real Git binary except the selected raw-tree
`show` call. It ran two independent repositories:

- candidate `git show <candidate>:README.md` exited 74 ->
  `candidate_tree_verification_failed`, exact ref snapshot preserved;
- post-create `git show kaola-workflow--v5.1.0:<path>` exited 74 ->
  `tag_tree_verification_failed`, compare-delete rollback restored the exact ref snapshot and the new
  5.1.0 tag was absent.

Result: exit 0 for both fault cases. This independently exercises the actual failed-Git-command path,
not only the implementation's test-only post-create switch.

### Success, tag-tree, idempotency, and post-success tamper control

The success leg prepared and committed a disposable candidate
`f55d5f1cecf5be6c6e3209e42870e4399f70b148`, wrote a clean exact-HEAD receipt covering
`claude`, `codex`, `gitlab`, and `gitea`, and ran `--tag --version 5.1.0 --json`.

- The result was success with `tag_tree_verified:true` and the exact candidate SHA.
- `git rev-parse kaola-workflow--v5.1.0^{commit}` equalled that candidate.
- For each of the eight prepared receipt entries, including package, all five manifests, README, and
  CHANGELOG, the harness ran `git show kaola-workflow--v5.1.0:<path>`, SHA-256 hashed the raw bytes,
  and matched the recorded receipt hash.
- A second identical tag invocation succeeded only with `idempotent:true`.
- The harness then changed only the persisted `tag_authorized.chainHeadSha` and reran tag. It refused
  `publication_receipt_contradictory`, and refs remained byte-identical.

### Focused regression suite

Command: `node scripts/test-release.js`

Result: exit 0, `test-release: all 232 assertions passed`.

## Counterexample search result

No concrete input, receipt state, commit topology, surface mismatch, Git read failure, existing-tag
state, or post-success binding tamper in the assigned n4 brief produced an unauthorized tag or a
success envelope for contradictory state. No in-scope blocking defect was found.

## Verdict

NOT-REFUTED, confidence 0.98. The claim survived direct disposable-repository attacks across every
requested refusal class, exact raw-byte success verification, strict rerun validation, and real Git
read-fault injection. Residual uncertainty is limited to unbounded concurrent external mutation of a
temporary repository during the sub-second transaction; no such concurrency contract is claimed by
the issue-661 node brief, and it does not reduce confidence in the tested authorization surface.
