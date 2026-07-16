evidence-binding: n5-edition-contract-proof 343b9eb67127
upstream_read: n4-runtime-integration 17dd85618d84
role: tdd-guide
delegation_outcome: returned_partial
result: PARTIAL
integrated_pass: WITHHELD
implementation_passes: 1
integrated_validation_passes: 1

RED: isolated manual-Claude installer mutant exited 1 with `AssertionError [ERR_ASSERTION]: installed Claude edition must contain executable kaola-workflow-replan.js` after the temporary manifest omitted `kaola-workflow-replan.js`.
GREEN: all structural gates and the root, Codex, GitLab, and Gitea contract validators exited 0, proving the installed executable/mapping, schema vocabulary, authority/refusal, routing, archive-lineage, scheduler, and finalization assertions on their validator paths.

## Assigned Scope

Final bounded A5 replay for issue 699: restage the original installer RED, preserve the eight n5 executable proof surfaces, minimally repair only packaged positive-claim fixtures, run one integrated pass, classify every residual cross-owner result, and stop without a review/fix loop or `close-node`.

## RED Restage

- Isolated source: `/tmp/kw-n5-red-343b9eb67127.SeL4Pb/repo`, copied from the live candidate with `.git` excluded.
- Mutant: removed only `'kaola-workflow-replan.js'` from the isolated `scripts/kaola-workflow-install-manifest.js` by `apply_patch`; the live worktree was unchanged.
- Installer command: `env HOME=/tmp/kw-n5-red-343b9eb67127.SeL4Pb/home USERPROFILE=/tmp/kw-n5-red-343b9eb67127.SeL4Pb/home PATH=/tmp/kw-n5-red-343b9eb67127.SeL4Pb/bin:/usr/bin:/bin:/usr/sbin:/sbin bash /tmp/kw-n5-red-343b9eb67127.SeL4Pb/repo/install.sh --yes --no-settings-merge --forge=github` -> exit 0 and verified every manifest-emitted file.
- Executable assertion: `node -e <assert installed .claude/kaola-workflow/scripts/kaola-workflow-replan.js exists and has an executable bit>` -> exit 1 with the exact assertion recorded in `RED:` above.
- Discriminator: the installer was otherwise green; only omission of the new manifest entry caused the post-install proof to fail.

## Single Implementation Pass

The retained n5 validator/walkthrough assertions were not weakened. The only replay edits initialize positive claim fixtures with each file's existing `initGitRepo` helper before the current claim-anchor runtime resolves branch/HEAD/tree authority.

files_changed_by_replay:
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- `kaola-workflow/issue-699/.cache/n5-edition-contract-proof.md`

fixture_changes:
- Codex: initialized `kw-284-attest-`, `kw-attest-persist-codex-`, `kw-selection-evidence-codex-`, and `kw-codex-active-folders-` before positive startup/finalize flows.
- GitLab: initialized `kw-gl-claim-orphan-`, `kw-gl-claim-`, and `kw-gl-t5-offline-bypass-` before positive claim flows.
- Gitea: initialized `kw-gt-claim-orphan-` and `kw-gt-claim-` before positive claim flows.

retained_n5_executable_proof_surfaces:
- `scripts/validate-workflow-contracts.js`
- `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- `scripts/validate-kaola-workflow-contracts.js`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

## One Integrated Validation Pass

Structural GREEN:
- `git diff --check -- <eight n5 JavaScript surfaces>` -> exit 0.
- `cmp -s scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` -> exit 0.
- `node --check <eight n5 JavaScript surfaces>` -> exit 0.
- `node scripts/edition-sync.js --check` -> exit 0; 12 forge aggregator ports, 25 COMMON_SCRIPTS mirrors, and 27 byte-identical groups are in parity.
- `node scripts/validate-script-sync.js` -> exit 0; 25 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks families, and 7 forge export-superset families are in sync.
- `node scripts/generate-routing-surfaces.js --check` -> exit 0; all 12 surfaces byte-match the skeleton.

Contract-validator GREEN:
- `node scripts/validate-workflow-contracts.js` -> exit 0; `Workflow contract validation passed`.
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 0; `Kaola-Workflow Codex contract validation passed`.
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> exit 0; `Kaola-Workflow GitLab contract validation passed`.
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> exit 0; `Kaola-Workflow Gitea contract validation passed`.

Packaged/focused results that withhold integrated PASS:
- `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` -> exit 1 before `testCodexReplanEditionContract699`; `claim command failed:` at the planless `finalize --project issue-163` call (`main` line 2014).
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> exit 1 before `testGitlabReplanEditionContract699`; offline/native fixture expected `worktree_path === ''` but received a real `.kw/worktrees/issue-602` path (line 2428).
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> exit 1 before `testGiteaReplanEditionContract699`; offline/native fixture expected `worktree_path === ''` but received a real `.kw/worktrees/issue-9` path (line 1853).
- GitLab standalone forbidden-token command over the replan/handoff/node/plan-validator plus adapt/plan/plan-run/next command, skill, and planner surfaces -> exit 1: `kaola-gitlab-workflow-plan-validator.js contains forbidden reference: /\bgh\b/`.
- Gitea standalone forbidden-token command over the corresponding edition surfaces -> exit 1: `kaola-gitea-workflow-plan-validator.js contains forbidden reference: /\bglab\b/`.
- `node scripts/simulate-workflow-walkthrough.js --only testClaimStatusRelease --only testReplanRuntimeFence699` -> exit 1 exactly once: `Error: released folder should leave active set` at `testClaimStatusRelease` line 138.

## Durable Typed Findings

finding: A5-699-01
class: planless_claim_archive_cleanup_incomplete
commands: Codex packaged walkthrough; A4 root focused walkthrough
observed: a fresh planless claim cannot complete finalize/release cleanup; the root release response leaves `kaola-workflow/issue-63` active, while Codex finalize exits before the n5 smoke case.
likely_owner: claim release/finalize and replan snapshot authority from n1/n2, not an n5 proof surface
disposition: terminal cross-owner finding recorded; no investigation, upstream edit, handback replay, or redispatch.

finding: A5-699-02
class: forge_offline_native_worktree_precedence_mismatch
commands: GitLab and Gitea packaged workflow-script suites
observed: both legacy fixtures expect OFFLINE=1 to force an empty `worktree_path`, but current claim behavior creates an edition-local worktree when NATIVE=1.
likely_owner: forge claim/worktree runtime contract or its pre-n5 fixture expectation, not n5 edition-contract proof
disposition: terminal cross-owner finding recorded; no investigation, upstream edit, handback replay, or redispatch.

finding: A5-699-03
class: forge_plan_validator_forbidden_token_drift
commands: GitLab and Gitea standalone `--forbidden-only` probes
observed: GitLab plan-validator carries token `gh`; Gitea plan-validator carries token `glab`.
likely_owner: generated forge plan-validator ports owned by n4/runtime integration or their generator source, not n5 proof tests
disposition: terminal cross-owner finding recorded; no investigation, upstream edit, handback replay, or redispatch.

## Final Disposition

- The four validators reach and pass the n5 executable assertions, including real manual install/executable behavior.
- The three packaged n5 smoke sentinels are preserved but are not claimed green because earlier cross-owner assertions terminate their files first.
- Integrated acceptance is withheld because residual findings remain after the only authorized validation pass.
- No detached review/fix loop was launched, no further cross-owner handback was triggered, and no validation command was rerun.
- Full Meta/npm chains were not run, per the frozen n5 node brief.
- `node scripts/kaola-workflow-adaptive-node.js record-evidence --project issue-699 --node-id n5-edition-contract-proof --verify --json` -> exit 0 with `result: ok` (read-only binding/shape verification immediately after this write).
- `close-node` was not run.
