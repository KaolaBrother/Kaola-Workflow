# Workflow Plan — issue #661

<!-- plan_hash: 1c15f72a40fe4d3c3ecfd921ba37dd308e0fac0616ad1a35160dfc56245ff6a0 -->

## Meta
speculative_open_policy: auto
labels: bug, workflow:in-progress, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
validation_test_consumes: README.md

Replace the unsafe one-step release cut with a typed, crash-resumable prepare/commit/check/tag
protocol. Preparation may write only the established release allowlist and a version-scoped receipt;
tag publication must independently bind the prepared surface and a complete unwaived green chain
receipt to the clean candidate HEAD, create the tag explicitly at that commit, and verify the tag tree
before success. The legacy cut entry point becomes a fail-closed compatibility response.

The issue supplies a settled design and the repository has one canonical release implementation,
one canonical regression suite, and three mechanically synchronized ports. The detailed TDD brief
therefore carries the implementation direction without adding a serial design node. After the
mandatory code-review wall, two independent read-only falsification probes and the documentation
update share the ready frontier before the unique changelog sink.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-split-release-transaction | tdd-guide | — | scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js, scripts/test-release.js | 5 | sequence | standard |
| n2-review-release-contract | code-reviewer | n1-split-release-transaction | — | 1 | sequence | reasoning |
| n3-adversarial-prepare-receipt | adversarial-verifier | n2-review-release-contract | — | 1 | fanout(release-falsification) | reasoning |
| n4-adversarial-tag-binding | adversarial-verifier | n2-review-release-contract | — | 1 | fanout(release-falsification) | reasoning |
| n5-document-release-protocol | doc-updater | n2-review-release-contract | README.md, docs/conventions.md, docs/api.md, docs/decisions/D-661-01.md, docs/README.md | 5 | sequence | standard |
| n6-finalize | finalize | n2-review-release-contract, n3-adversarial-prepare-receipt, n4-adversarial-tag-binding, n5-document-release-protocol | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- Cross-edition symbol scoping searched `kaola-workflow-release.js`, `--cut`, `--verify`,
  `--release-check`, `release-receipt`, `chain-receipt`, and the proposed `--prepare`/`--tag`
  vocabulary across root scripts, every plugin script tree, commands/SKILL trees, README, docs, and
  CHANGELOG. The moving code surface is the canonical release script, its byte-identical Codex twin,
  both rename-normalized forge ports, and `scripts/test-release.js`; release procedure prose is
  concentrated in README, conventions, API, the decision index, and the new decision record.
- `kaola-workflow-release.js` is deliberately not a `GENERATED_AGGREGATOR`, but it is an atomic
  cross-edition sync family: the root script is canonical, the Codex copy is byte-identical, and the
  GitLab/Gitea ports are rename-normalized by `scripts/validate-script-sync.js`. Node n1 owns all four
  copies and treats the full accumulated root diff as the canonical specification, mirroring every
  hunk modulo existing forge nouns. Do not split or hand-diverge the ports.
- The established release allowlist is `CHANGELOG.md`, `package.json`, the three Codex plugin
  manifests, the two forge Claude-plugin manifests, and the README version assertion lines. The
  implementation may mutate those files only when the release CLI is run against a target repository;
  they are fixture outputs, not source files owned by n1 in this workflow. All tests must continue to
  use disposable repositories and must never create a release tag in the real checkout.
- Prefer reusing the existing strict, plan-independent `--release-check` semantics when authorizing
  `--tag`; do not introduce a second fail-open interpretation of chain receipts. Preserve typed
  precedence for missing/unparseable, stale or candidate-mismatched, dirty-stamped, empty,
  unresolved/incomplete, red, and waived receipts. Tag authorization is self-owned and local; it
  does not wait on any external pipeline.
- Receipt state must be scoped to the requested root version and resolved independent Codex version,
  record the exact prepared release surface, and bind the tag authorization/completion steps to the
  candidate commit SHA. A stale receipt, a receipt for another version, or a receipt whose prepared
  surface no longer matches may not authorize a tag. Partial preparation remains resumable, while a
  completed prepare or tag re-run is idempotent only when every binding still agrees.
- `--cut` remains recognized but always returns a stable typed refusal with actionable
  prepare/commit/offline-chains/`--release-check`/tag guidance. It must never mutate files, append an
  authorizing receipt step, or create a tag. `--verify` and forge-neutral `--push` behavior stay
  compatible unless the new protocol requires narrowly documented wording changes.
- No agent profile, installer, generated aggregator, plan-validator, run-chains implementation, or
  forge helper changes are in scope. Existing contract and sync validators are verification surfaces,
  not collateral write targets. Plugin script prose and emitted guidance stay forge-neutral.
- `D-661-01` is the next free decision-record identifier: no existing `D-661-*` record or mention was
  found under `docs/decisions/`, `docs/`, or CHANGELOG. Node n5 owns the record and its index entry as
  one semantically coupled documentation change.
- The Meta validation command is the sole full consumer suite and runs all four edition chains
  sequentially. Node n1 first runs the focused RED/GREEN `node scripts/test-release.js` plus script
  synchronization checks; n2 reviews those results and runs or verifies one fresh Meta command after
  the code converges. README is declared test-consumed because the release surface treats its version
  assertions as executable contract data.
- Evidence for every dispatched node belongs under
  `kaola-workflow/issue-661/.cache/<node-id>.md`; no node writes a bare worktree-root `.cache` path.

## Node Briefs

### n1-split-release-transaction

Implement the release transaction test-first in `scripts/test-release.js`. Begin with the concrete
regression: at a committed baseline, the legacy cut writes bumped files but the created tag still
shows the pre-bump package and manifest versions. Preserve that RED control as proof of the old defect,
then replace old success expectations with the split protocol.

For `--prepare --version X.Y.Z` (and existing independent `--codex-version` resolution), test every
pre-mutation guard, exact allowlist mutation, absence of a tag, and a version-scoped crash-resume
receipt that captures the resolved root/Codex versions and exact prepared surface. Assert no
non-allowlisted tracked file changes, no tag side effect, deterministic resume after partial steps,
same-binding idempotency, and refusal rather than cross-version or stale-receipt reuse. Preparation
must not claim candidate-SHA authorization before the operator commits the prepared files.

For `--tag --version X.Y.Z`, construct disposable committed candidates and real chain receipts. RED
and then GREEN typed, side-effect-free refusals for a dirty worktree; missing or unparseable release
receipt; wrong version; incomplete/stale prepared surface; package, all five manifests, README
assertions, or CHANGELOG heading mismatching the resolved receipt values; missing/unparseable,
stale/candidate-SHA-mismatched, dirty-stamped, empty, unresolved/incomplete, red, or waived chain
receipt; and an existing tag that names a different commit or tree. Successful tagging must require a
clean worktree and a complete unwaived green receipt strictly bound to HEAD, append a candidate-SHA-
bound authorization/completion step, create the local tag explicitly at that HEAD, verify tag-to-HEAD
equality, and read the tag tree back to prove the exact package/manifests/README/CHANGELOG surface.
Re-running the fully completed tag is idempotent only when the tag, candidate SHA, versions, prepared
surface, and chain authorization still agree.

Turn `--cut` into an explicit typed compatibility refusal that names the executable sequence:
prepare, commit only release files, run the offline full chain receipt, pass `--release-check`, then
tag. Test that every cut invocation is non-mutating and cannot return success. Update usage and JSON/
human envelopes without adding a forge-specific CLI token. Keep `--verify` and `--push` compatible.

Implement once in the canonical root script, synchronize the byte-identical Codex copy and both
rename-normalized forge ports through the existing edition mechanism, and verify every hunk is mirrored
modulo forge nouns. Run the focused release tests, `node scripts/validate-script-sync.js`, relevant
contract validators, and then the Meta validation command once. Record exact commands, outcomes, and
the disposable-repository tag-tree assertions in the node evidence.

### n2-review-release-contract

Review the complete release diff independently. Trace prepare, receipt persistence/resume, candidate
commit, strict chain authorization, tag creation, and post-create tree verification as one fail-closed
state machine. Confirm every refusal occurs before tag mutation, every receipt lookup is scoped by
version, no partial record can authorize publication, the authorization/completion entries name the
exact candidate SHA, and idempotency cannot launder a changed surface, advanced HEAD, stale chain
receipt, or conflicting existing tag.

Check the release allowlist and all expected values: root version in package plus both Claude
manifests and README Claude assertions; independent Codex version in all three Codex manifests and
README Codex assertions; exact CHANGELOG release heading. Confirm `--tag` verifies the tag resolves to
HEAD and reads those values from the tag tree before returning success. Verify `--cut` is refusal-only,
`--verify`/`--push` remain compatible and forge-neutral, the canonical/Codex pair is byte-identical,
the forge ports are rename-normalized equivalents, and the regression suite covers every issue
acceptance arm with no real-checkout mutation. Run or verify focused checks and one fresh sequential
Meta validation command; block on an omitted edition, sync drift, weak tag-existence-only assertion,
or receipt interpretation looser than the existing release check.

### n3-adversarial-prepare-receipt

Try to falsify preparation isolation and crash recovery in disposable repositories. Snapshot the
entire tracked tree and refs, then exercise successful, refused, interrupted, resumed, repeated, and
cross-version prepares. Prove only the release allowlist and the intended version-scoped receipt move,
no tag appears, resolved Codex version does not re-derive from an already-mutated live baseline, and a
partial/stale/foreign-version receipt cannot skip an unperformed guard or authorize later tagging.
Include malformed receipt lines and tampered prepared files. Return a read-only verdict with exact
commands, diffs, refs, and receipt records.

### n4-adversarial-tag-binding

Try to falsify the tag authorization with real temporary commits and refs. Attack dirty states,
advanced HEAD, a green receipt for another SHA, subset/empty/red/waived/malformed receipts, every
individual release-surface mismatch, a receipt copied from another version, an existing conflicting
tag, and a tag-tree read failure. For each refusal prove refs are unchanged. For the success control,
prove the tag object resolves exactly to candidate HEAD and use `git show <tag>:<path>` over package,
all five manifests, README, and CHANGELOG to compare against the receipt. Re-run success for strict
idempotency, then tamper one binding and require refusal. Return a read-only verdict; do not create or
delete refs in the real repository.

### n5-document-release-protocol

Read n1 and n2 evidence before documenting the reviewed behavior. Replace README's old verify/cut
checklist with the executable prepare → release-only commit → offline all-chains receipt →
`--release-check` → tag → post-tag validation/publish sequence. In `docs/conventions.md`, specify the
typed prepare/tag state machine, exact allowlist, independent Codex version series, version/candidate-
SHA receipt binding, crash resume/idempotency boundaries, refusal-only cut compatibility behavior,
and tag-tree verification. In `docs/api.md`, document the CLI flags and stable success/refusal envelope
fields plus the relationship to the existing plan-independent release check.

Create `docs/decisions/D-661-01.md` recording why preparation and publication are separate trust
transitions, why strict HEAD/receipt/tag-tree binding is required, and why cut cannot retain success
semantics; add the record to `docs/README.md`. Keep the prose forge-neutral, preserve the independent
root/Codex version axes, and do not claim an external pipeline is part of the gate.

### n6-finalize

Finalize only after code review, both adversarial probes, and documentation docking pass. Add one
concise Unreleased `CHANGELOG.md` entry describing the pre-bump-tag defect, split prepare/tag
transaction, version- and candidate-SHA-bound receipts, strict clean-HEAD full-chain authorization,
verified tag-tree surface, idempotency, refusal-only legacy cut, cross-edition synchronization, and
decision record. Reuse the fresh Meta validation receipt and preserve changelog formatting.

## Node Ledger

| id | status |
| --- | --- |
| n1-split-release-transaction | complete |
| n2-review-release-contract | complete |
| n3-adversarial-prepare-receipt | complete |
| n4-adversarial-tag-binding | complete |
| n5-document-release-protocol | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-split-release-transaction) | subagent-invoked | evidence-binding: n1-split-release-transaction df5b5eb5c8ba | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review-release-contract f3af4035bdde | |
| adversarial-verifier (n4-adversarial-tag-binding) | subagent-invoked | evidence-binding: n4-adversarial-tag-binding 1cde4f1a1e9e | |
| adversarial-verifier (n3-adversarial-prepare-receipt) | subagent-invoked | evidence-binding: n3-adversarial-prepare-receipt c6b3a463ad3e | |
| doc-updater (n5-document-release-protocol) | subagent-invoked | evidence-binding: n5-document-release-protocol b7087290077d | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 03e5437501e9 | |
