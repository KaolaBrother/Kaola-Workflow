# Workflow Plan — issue #715 (epoch 3 child)

<!-- plan_hash: 3d86a73e85a894190dd466cbc902676fa048e97911e33265d567f2c8db00eafd -->

## Meta

project: issue-715
labels: workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
plan_epoch: 3
epoch_lineage_id: e7aca78f34436bc91971c55844464388d936ebbce2289dbe5ebe26a5ad66b3cd
parent_plan_hash: 8c63d6d341c8302eb6a01399a652a05cbf8e1f7d52815c138b01333d8c47659b
parent_snapshot_manifest_digest: 84e4a0388e059da7b83b8666f8dfea342a5d8b8964789ca37146d294b0e46a6f
claim_root_base_digest: dac691a5b3bf0587f4f5d5de969ed7fcaa93ac453b376da2fad41b506b5c1b55
transition_reason: review_repair_requires_replan
source_evidence_digest: 4e540a18d1da6bded44b7ea548a97e0c1a3f5999a99f2472a93db1e1ca88d2e0
planner_binding: 24f45cafd066
inherited_frontier_digest: a842bbc719a24306a0df72803a56b434538f4c2d354737d70c71f62c0aee4ded
inherited_frontier_classes: code,security
validation_command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n3-code-certify-hardening
security_certifier: n4-security-certify-hardening

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-guard-hardening-fix | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, scripts/test-claim-hardening.js | 6 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-guard-hardening-docs | doc-updater | n1-guard-hardening-fix | CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md | 3 | sequence | — | standard | — | — | — | — | — | — |
| n3-code-certify-hardening | code-reviewer | n2-guard-hardening-docs | — | 1 | sequence | — | reasoning | — | — | the guard-hardening repair makes the discard-archive commit impossible to bind to a non-surviving branch: the base-branch guard rejects the detached-HEAD sentinel 'HEAD' and every falsified base_branch (the discarded feature branch, an arbitrary current lane) at BOTH call sites, and the post-commit verification re-resolves the checkout and proves reachability from base so a concurrent HEAD re-point downgrades to a truthful discard_archive_committed false with residue recoverable instead of a false committed true — with both F1 triggers, commit success, diff-quiet race, commit failure, offline, the honest-state postures, the full preflight classification matrix, four-edition parity, and the documentation delta all still holding | the complete epoch-3 candidate: the claim.js four-edition family (canonical, codex byte twin, gitlab and gitea hand ports), the claude-chain test surfaces (simulate-workflow-walkthrough.js, test-claim-hardening.js), and the documentation delta, reviewed against the epoch-2 n5 refutation evidence and the accumulated diff vs the claim root base | sequence | — |
| n4-security-certify-hardening | security-reviewer | n3-code-certify-hardening | — | 1 | sequence | — | reasoning | — | — | the guard-hardening repair introduces no security regression: every git invocation stays argument-array and pathspec-scoped to the actual archive dest with no shell interpolation of branch, ref, or path names, the new base validation cannot be spoofed by a crafted branch name, a symbolic ref, a detached HEAD, or a falsified base_branch field, the post-commit re-resolution and reachability check trusts only git's own refs and never operator-controlled durable state, the treeDirty, parked-lane, foreign-dirt, and never-mutate-sibling protections are not weakened, and no secrets or new trust of operator-controlled input are introduced across all four edition copies | the full epoch-3 claim.js delta in all four editions (guard validation, post-commit re-verification, both call sites, restore-gate interplay) plus its interaction with the epoch-1 sink-preflight exemption surface, attacked for injection, path-traversal, staging-scope, ref-spoofing, and guard-weakening primitives | sequence | — |
| n5-falsify-guard-hardening | adversarial-verifier | n4-security-certify-hardening | — | 1 | sequence | — | reasoning | — | — | after the guard-hardening repair no checkout posture and no falsified base_branch can bind the discard-archive commit to a non-surviving branch, and no concurrent HEAD re-point inside the resolution-to-commit window can produce a false committed true or a false receiving-branch disclosure: the outcome is always either a commit verified on the surviving base branch or a truthfully reported not-committed with the receiving branch disclosed and residue recoverable, and every previously-surviving matrix cell (both F1 triggers, commit success, diff-quiet race, commit failure, offline, honest-state postures, preflight classification, four-edition parity) still holds | the release-to-discard-to-sibling-sink matrix re-run against the epoch-3 candidate with the N5-A falsified-state cells (release detached with base_branch 'HEAD', release on the feature branch with base_branch naming the discarded branch, sweep detached with 'HEAD', sweep on an arbitrary lane with base_branch naming that lane), the N5-B race cell (a git shim re-pointing HEAD between staging and commit), both F1 triggers, and the full prior matrix across all four edition copies | sequence | n1-guard-hardening-fix |
| n6-finalize-epoch3 | finalize | n5-falsify-guard-hardening | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Plan Notes

This is the epoch-3 child plan authored under the claim-preserving re-plan transaction
(`transition_reason: review_repair_requires_replan`). The frozen parent `workflow-plan.md`
(plan_hash `8c63d6d3…`, epoch 2) stays byte-authoritative and is never mutated; this child
carries the repair its frozen producer slice could not. The parent epoch's standalone
adversarial change gate `n5-falsify-branch-commit` REFUTED the epoch-2 candidate with two
blocking findings (evidence: `kaola-workflow/issue-715/.cache/n5-falsify-branch-commit.md`,
attempt `review2-e78021cb5eac6fb8:1`), and the repair crosses the frozen producer slice
[n1-branch-commit-fix, n2-branch-commit-docs].

N5-A (blocking, candidate-caused, severity low): the epoch-2 base-branch guard inside
`commitDiscardArchive` (`scripts/kaola-workflow-claim.js:2368`) validates ONLY string equality
`currentBranch === base` against a base taken verbatim from operator-controlled durable state.
It never validates that base names a real surviving branch, and it accepts the literal
detached-HEAD sentinel `'HEAD'` that `rev-parse --abbrev-ref HEAD` returns when no branch is
checked out. Demonstrated at BOTH call sites: release detached + base_branch 'HEAD' (B4a) and
sweep detached + 'HEAD' (W5) commit onto the detached HEAD and report committed:true; release
with base_branch naming the DISCARDED feature branch (B3) and sweep with base_branch naming
the current arbitrary lane (W6) commit onto a non-surviving branch and report committed:true —
in every cell the natural cleanup orphans the archive (rev-list --all --objects EMPTY), the
exact F1 loss mode under a falsified-state precondition. Honest precondition stated: the
tooling itself never writes such values (claim.js clamps baseBranch for 'HEAD'/self), so a
hand-edit or external corruption is required; within it the failure is total.

N5-B (blocking, candidate-caused, severity low): TOCTOU between branch resolution and commit.
The helper resolves currentBranch once (:2360), string-compares it (:2368), stages and commits
(:2374-2383), then verifies only `cat-file -t HEAD:<rel>` (:2385) — presence at the CURRENT
HEAD, never that HEAD is still the guarded branch nor that the commit is reachable from base.
The RC1 shim (re-point HEAD between `add -A -- <rel>` and commit) lands the archive on an
arbitrary branch while the emit reports committed:true with the STALE pre-race branch name — a
false receiving-branch disclosure, the worst misreport class. A post-commit re-resolution +
reachability check (abbrev-ref re-read, merge-base --is-ancestor HEAD base, downgrade to
committed:false + residue on mismatch) converts the silent misreport into a truthful skip.

Scope discipline: this epoch repairs N5-A and N5-B ONLY. The n5 evidence's non-blocking
observations O-N5-1 (the restore block's silently-swallowed removeBranch failure of the
current branch) and O-N5-2 (parent-epoch O1: degenerate reserved-name receipt paths the
exemption regex covers) are NOT fixed here, nor is epoch-1 O2 (gitignored-residue warning
phrasing); n5 re-probes them as non-blocking corners unless the repair worsens them. Every
behavior that survived epoch 2's falsification — both F1 triggers, commit success, the
diff-quiet race, commit failure, offline, the honest-state postures, the preflight
classification matrix, four-edition parity — must hold unchanged.

The packet's inherited frontier (classes code,security, digest `a842bbc7…`) is carried to two
named common certifier walls: `n3-code-certify-hardening` (code) and
`n4-security-certify-hardening` (security) post-dominate every child root in the serial
chain — the security wall exists because the authoritative handoff state supplies the
security class (the candidate flags all four claim.js copies security_relevant); it is never
synthesized or dropped. `n5` re-falsifies the repaired candidate as a change gate certifying
`n1-guard-hardening-fix` before finalization. Node ids are fresh (no epoch-1/epoch-2 id
reuse) so epoch-3 evidence never collides with the prior epochs' `.cache` receipts.

Propagation discipline is unchanged from the parent epochs: `kaola-workflow-claim.js` is a
COMMON_SCRIPT (canonical ↔ codex byte-identical, enforced by `validate-script-sync.js`) with
HAND-PORTED gitlab/gitea ports mirrored by hand modulo forge nouns; the four edition copies
move atomically in ONE writer node. The recorded `validation_command` matches the parents
(cross-edition diff: `npm test` runs the four edition chains sequentially; the two additive
edition suites install the same manifest scripts but are not chain-wired). Decision records
were checked in the parent epochs (no `D-715-*` exists); this follow-up repair of the same
shipped behavior allocates no new ADR.

## Node Briefs

### n1-guard-hardening-fix

Repair N5-A and N5-B RED-first in the canonical `scripts/kaola-workflow-claim.js`, then
propagate to the codex byte twin and the gitlab/gitea hand ports. Read the epoch-2 refutation
evidence FIRST — `kaola-workflow/issue-715/.cache/n5-falsify-branch-commit.md` (findings N5-A
and N5-B, anchors, the B4a/W5/B3/W6/RC1 demonstrations) is the specification; the issue body's
acceptance criteria still govern. Also read the epoch-2 evidence for the F1 repair you are
hardening (`kaola-workflow/issue-715/.cache/n1-branch-commit-fix.md`).

Invariant the fix must establish: the discard-archive commit may bind ONLY to a branch that is
(a) a real local branch ref — never the detached-HEAD sentinel `'HEAD'` that
`rev-parse --abbrev-ref HEAD` returns when no branch is checked out — (b) the SURVIVING base:
never the branch the release itself discards, never an arbitrary current lane on the sweep,
however the durable `base_branch` field was falsified, and (c) STILL the same branch after the
commit lands, with the new commit reachable from base. Any violation means no commit (or a
post-commit downgrade): truthfully report `discard_archive_committed: false`, disclose the
receiving (or would-be) branch, and leave the archive as recoverable residue. Never throw past
the emit.

N5-A (guard validation, helper ~:2360-2372, both call sites): the string-equality guard must
additionally reject the `'HEAD'` sentinel as a base outright and validate that base names a
real surviving branch before staging — verify the ref exists (argument-array
`rev-parse --verify`, never shell interpolation), and refuse a base that names the branch
being discarded or any other non-surviving branch. The release call site knows the discarded
branch and the restored base; the sweep call site has only the pre-read state base — harden
INSIDE `commitDiscardArchive` so both call sites inherit the validation (defense in depth),
exactly as the epoch-2 guard was placed. Keep the honest-state postures green: detached
checkout with an honest base still skips truthfully (B1/W4), a symbolic-ref checkout resolves
to its target and commits on base (B2), a lying base='HEAD' entered ON the feature branch
still mismatches and skips (B4b).

N5-B (post-commit verification, ~:2385): after the commit, RE-RESOLVE the checkout
(abbrev-ref) and require it to still equal the guarded base, and require the new commit to be
reachable from base (`merge-base --is-ancestor`, argument-array). On any mismatch downgrade to
`discard_archive_committed: false` with the actual receiving branch disclosed and residue left
recoverable — never emit the stale pre-race branch as the receiver. Keep the truthful cells
byte-stable: the diff-quiet race that already landed the tree on base stays committed:true
with no duplicate commit (RC2 semantics), a genuine commit failure (hook exit, gitignored
dest) stays a truthful committed:false, OFFLINE never skips a commit that does run, and the
pathspec scoping (`-- <rel>` of the ACTUAL dest) is unchanged.

RED first, before any producer edit: `scripts/simulate-workflow-walkthrough.js` beside the
epoch-2 scenarios — (1) release entered detached with state base_branch falsified to 'HEAD':
no commit anywhere, committed:false, branch disclosed, residue recoverable, main ref tip
unchanged (B4a inverted); (2) release on the feature branch with base_branch naming the
discarded feature branch itself: truthful skip, no chore commit on any ref (B3 inverted);
(3) watch-pr CLOSED sweep detached with base_branch 'HEAD' and (4) sweep on an arbitrary lane
with base_branch naming that lane: truthful skip with disclosure, both ref tips unchanged
(W5/W6 inverted); (5) a git-shim race re-pointing HEAD between staging and commit: the emit
downgrades to committed:false and never names the stale branch as receiver (RC1 inverted).
`scripts/test-claim-hardening.js` — unit pins: the guard rejects base='HEAD'; the guard
rejects a falsified non-surviving base at both call sites; the post-commit re-resolution +
reachability check downgrades on a re-pointed HEAD and passes on the honest path. Keep every
existing assertion green unchanged.

Propagation (one semantic change, four trees, ONE node): byte-replicate the canonical edits
into `plugins/kaola-workflow/scripts/` (do NOT run `edition-sync.js --write` — not generated);
hand-mirror EVERY new hunk into the gitlab/gitea claim ports modulo forge nouns; the canonical
spec is this node's accumulated root diff on `scripts/kaola-workflow-claim.js`.

GREEN before closing:
`node scripts/simulate-workflow-walkthrough.js && node scripts/test-claim-hardening.js && node scripts/test-sink-merge.js && node scripts/test-bundle-finalize.js && node scripts/validate-script-sync.js && node scripts/edition-sync.js --check`
plus the standalone forge behavioral suites for evidence:
`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js && node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
and `node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js` — `npm test`
does not run them.

### n2-guard-hardening-docs

Read the n1 epoch-3 evidence file first. Add one `[Unreleased]` CHANGELOG entry covering the
guard-hardening follow-up repair (sentinel/falsified-base rejection, post-commit
re-verification with truthful downgrade). Update `docs/api.md` wherever `claim.js release` /
watch-pr sweep disposal is described: the base-branch guard now validates that the base is a
real surviving branch (the detached-HEAD sentinel and a falsified `base_branch` are refused,
not trusted) and the commit is re-verified against the surviving base after it lands — any
violation is reported `discard_archive_committed: false` with the receiving branch disclosed
and residue recoverable; mirror the exact field name(s) n1 shipped (read them from the
evidence, do not invent). Update `docs/workflow-state-contract.md` § Terminal journal disposal
with the same validation-and-truthful-downgrade distinction in one or two sentences. Docs
only; no decision record.

### n3-code-certify-hardening

Act as the named schema-2 common CODE certifier for the epoch-3 producer and the inherited
code frontier. Read the issue body, the epoch-2 refutation evidence
(`kaola-workflow/issue-715/.cache/n5-falsify-branch-commit.md`), the n1 RED/GREEN evidence,
and the n2 documentation diff. Verify against the actual diff: the guard rejects the 'HEAD'
sentinel and every falsified non-surviving base at BOTH call sites (the B4a/W5/B3/W6 cells can
no longer commit); the post-commit re-resolution + reachability check downgrades a raced
commit to a truthful committed:false and never emits the stale branch as receiver (RC1 can no
longer misreport); reporting is truthful on every path — success, diff-quiet skip, commit
failure, non-base skip, guard refusal, race downgrade — with the receiving branch disclosed;
offline never skips a commit that runs; every epoch-2 surviving behavior (both F1 triggers,
receipt exemption matrix, honest-state postures) is untouched and green. Confirm parity: codex
twin byte-identical, forge module.exports superset green (`validate-script-sync.js` in
evidence), `edition-sync.js --check` green, and the gitlab/gitea ports mirror every epoch-3
hunk with no missed site. Confirm the docs match the shipped field names and semantics. Zero
findings is a valid verdict; admit only concrete candidate-caused defects with an exact
trigger and proof.

### n4-security-certify-hardening

Act as the named schema-2 common SECURITY certifier for the inherited security frontier (the
candidate flags all four claim.js copies security_relevant). Audit the epoch-3 delta for
security primitives: every git invocation stays `execFileSync` argument-array form — no
shell-string interpolation of branch names, ref names, dest paths, or project segments,
including the new `rev-parse --verify` and `merge-base --is-ancestor` probes; the base
validation cannot be spoofed by a crafted branch name, a symbolic ref, a detached HEAD, or a
falsified `base_branch` field, and its refusal ordering cannot be bypassed; the post-commit
re-resolution and reachability check derives trust only from git's own refs, never from
operator-controlled durable state; the pathspec scoping (`-- <rel>`) cannot be widened by a
crafted dest; the treeDirty / parked-lane / foreign-dirt / never-mutate-sibling guards are not
weakened anywhere; no new write outside the archive dest; no secrets, credentials, or new
trust of operator-controlled input introduced. Verify all four edition copies carry identical
guard semantics. Zero findings is a valid verdict; admit only concrete candidate-caused
vulnerabilities with an exact trigger and proof.

### n5-falsify-guard-hardening

Standalone adversarial change gate certifying `n1-guard-hardening-fix`. Read the epoch-2
refutation evidence first (`kaola-workflow/issue-715/.cache/n5-falsify-branch-commit.md`),
then try to refute the headline claim with the strongest falsification you can construct
against the REPAIRED candidate. Re-run every N5-A cell end-to-end: release detached with
base_branch 'HEAD' (B4a), release on the feature branch with base_branch naming the discarded
branch (B3), sweep detached with 'HEAD' (W5), sweep on an arbitrary lane with base_branch
naming that lane (W6) — each must now refuse or skip truthfully with no chore commit on any
ref, the receiving branch disclosed, residue recoverable, and the archive never stranded.
Re-run the N5-B race (RC1: shim re-pointing HEAD between staging and commit) — the emit must
downgrade to committed:false and never name the stale branch. Then re-attack every cell that
survived in epoch 2 — both F1 triggers, commit success on base, the diff-quiet race (RC2),
commit failure (hook exit, gitignored dest), offline, the honest-state postures (B1/B2/B4b/
W4), the full preflight classification matrix (own/sibling × live/archive × porcelain status,
deceptive look-alikes, sibling non-receipt blocking with zero mutation), and four-edition
parity — the repair must not have regressed any of them. Re-probe the non-blocking
observations O-N5-1 (silent removeBranch swallow), O-N5-2 / parent O1 (reserved-name receipt
paths) and epoch-1 O2 (gitignored-residue warning phrasing): still non-blocking unless the
repair worsened them. Run the issue's two reproductions against the candidate. Record a gate
verdict, not implementation advice; pass only if no counterexample survives.

### n6-finalize-epoch3

Unique sink. Run the Meta `validation_command` once over the final post-documentation tree —
all four edition chains sequentially green via `npm test`, then `node scripts/test-kimi-edition.js`
and `node scripts/test-opencode-edition.js` — record the content-addressed receipt, verify the
named code and security certifiers and the standalone adversarial gate are complete and fresh,
then close issue 715. Write no tracked file from this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-guard-hardening-fix | pending |
| n2-guard-hardening-docs | pending |
| n3-code-certify-hardening | pending |
| n4-security-certify-hardening | pending |
| n5-falsify-guard-hardening | pending |
| n6-finalize-epoch3 | pending |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-guard-hardening-fix) | pending | | |
| doc-updater (n2-guard-hardening-docs) | pending | | |
| code-reviewer (n3-code-certify-hardening) | pending | | |
| security-reviewer (n4-security-certify-hardening) | pending | | |
| adversarial-verifier (n5-falsify-guard-hardening) | pending | | |
| finalize (n6-finalize-epoch3) | pending | | |
