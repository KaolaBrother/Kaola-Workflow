# Workflow Plan — issue #715 (epoch 2 child)

<!-- plan_hash: 8c63d6d341c8302eb6a01399a652a05cbf8e1f7d52815c138b01333d8c47659b -->

## Meta

project: issue-715
labels: workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
plan_epoch: 2
epoch_lineage_id: e7aca78f34436bc91971c55844464388d936ebbce2289dbe5ebe26a5ad66b3cd
parent_plan_hash: 78fdaa3254651a6ea2a408bd602fe2f1b47c2da1017b367eedce4642a1d48abf
parent_snapshot_manifest_digest: 920d0aa3455638e675a9be139cb69df58c2fe2c3b29516ffa0f8b39ab2910820
claim_root_base_digest: dac691a5b3bf0587f4f5d5de969ed7fcaa93ac453b376da2fad41b506b5c1b55
transition_reason: review_repair_requires_replan
source_evidence_digest: 54d68794e9e11d9e61d0de001290d1e76efdf07be9449df41a2fa90acfe92808
planner_binding: 646202d34f99
inherited_frontier_digest: f8a6ef769e3f012d484dd2859f77ac81202e39124c5ab8cfb53c9634d0c1bd06
inherited_frontier_classes: code,security
validation_command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n3-code-certify-fix
security_certifier: n4-security-certify-fix

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-branch-commit-fix | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js, scripts/test-claim-hardening.js | 6 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-branch-commit-docs | doc-updater | n1-branch-commit-fix | CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md | 3 | sequence | — | standard | — | — | — | — | — | — |
| n3-code-certify-fix | code-reviewer | n2-branch-commit-docs | — | 1 | sequence | — | reasoning | — | — | the F1 repair makes the release and watch-pr sweep discard-archive commit land on the surviving base branch — or truthfully report discard_archive_committed false with the receiving branch disclosed and the archive left recoverable — in every checkout posture (in-place feature-branch release, non-base sweep, base-branch release), with diff-quiet, commit-failure, and offline semantics intact, no epoch-1 behavior regressed, codex byte-twin and gitlab/gitea port parity proven, and the documentation delta matching the shipped fields | the complete epoch-2 candidate: the claim.js four-edition family (canonical, codex byte twin, gitlab and gitea hand ports), the claude-chain test surfaces (simulate-workflow-walkthrough.js, test-claim-hardening.js), and the documentation delta, reviewed against the parent-epoch F1 refutation evidence and the accumulated diff vs the claim root base | sequence | — |
| n4-security-certify-fix | security-reviewer | n3-code-certify-fix | — | 1 | sequence | — | reasoning | — | — | the F1 repair introduces no security regression: every git invocation stays argument-array and pathspec-scoped to the actual archive dest with no shell interpolation of branch or path names, the base-branch guard cannot be spoofed into staging or committing outside the dest, the restore-gate exemption matches exactly the one path the release itself created, the treeDirty, parked-lane, foreign-dirt, and never-mutate-sibling protections are not weakened, and no secrets or unsafe trust of operator-controlled branch names are introduced across all four edition copies | the full epoch-2 claim.js delta in all four editions (helper, both call sites, restore-gate interplay) plus its interaction with the epoch-1 sink-preflight exemption surface, attacked for injection, path-traversal, staging-scope, and guard-weakening primitives | sequence | — |
| n5-falsify-branch-commit | adversarial-verifier | n4-security-certify-fix | — | 1 | sequence | — | reasoning | — | — | after the F1 repair no checkout posture can strand the discard archive on a discarded or arbitrary branch or misreport the commit outcome: the commit lands on the surviving base branch or is truthfully reported not-committed with the receiving branch disclosed and residue recoverable, the in-place release restores the base branch despite the fresh archive on disk, the sweep behaves identically, and every previously-surviving matrix cell (commit success, diff-quiet race, commit failure, offline, preflight classification, four-edition parity) still holds | the release-to-discard-to-sibling-sink matrix re-run against the epoch-2 candidate with both F1 triggers (in-place NATIVE=0 release with the checkout on the feature branch; watch-pr CLOSED sweep on a non-base checkout) plus the full preflight classification matrix and the deceptive look-alike set across all four edition copies | sequence | n1-branch-commit-fix |
| n6-finalize | finalize | n5-falsify-branch-commit | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Plan Notes

This is the epoch-2 child plan authored under the claim-preserving re-plan transaction
(`transition_reason: review_repair_requires_replan`). The frozen parent `workflow-plan.md`
(plan_hash `78fdaa32…`, epoch 1) stays byte-authoritative and is never mutated; this child
carries the repair its frozen producer slice could not. The parent epoch's standalone
adversarial change gate `n4-falsify-residue-fixes` REFUTED the epoch-1 candidate with one
blocking finding (evidence: `kaola-workflow/issue-715/.cache/n4-falsify-residue-fixes.md`,
attempt `review2-cff17d29bd2bf14d:1`), and the repair crosses the frozen producer slice
[n1-residue-fixes, n2-documentation].

F1 (blocking, candidate-caused, severity medium): the epoch-1 `commitDiscardArchive` helper
(`scripts/kaola-workflow-claim.js` ~:2321-2351) and both call sites bind the discard-archive
commit to WHATEVER branch HEAD is on. Trigger A: an in-place (NATIVE=0) release with the
checkout on the feature branch — the restore gate (:3300-3322) deterministically dirty-skips
because the release's own fresh archive dest always counts as dirt (`archive/*` is never a
parked-lane path), so the unconditional commit at :3329 lands on the DISCARDED feature branch,
is verified against that transient HEAD, is misreported `discard_archive_committed: true` with
no branch disclosure, and is silently orphaned by the natural checkout+branch-delete cleanup
(pre-fix residue stayed recoverable — a candidate-caused regression). Trigger B: the watch-pr
CLOSED sweep (:4299) has no restore logic at all and commits onto any non-base checkout with
the same misreport. All four edition copies carry the identical helper + call-site delta.

Scope discipline: this epoch repairs F1 ONLY. The n4 evidence's non-blocking observations O1
(reserved-name receipt paths the exemption regex newly covers) and O2 (gitignored-residue
warning phrasing) are NOT fixed here; n5 re-probes them as non-blocking corners unless the F1
repair worsens them. Every other epoch-1 behavior held under strong falsification and must not
be touched beyond what F1 requires.

The packet's inherited frontier (classes code,security, digest `f8a6ef…`) is carried to two
named common certifier walls: `n3-code-certify-fix` (code) and `n4-security-certify-fix`
(security) post-dominate every child root in the serial chain — the security wall exists
because the authoritative handoff state supplies the security class (the epoch-1 candidate
flags all four claim.js copies security_relevant); it is never synthesized or dropped. `n5`
re-falsifies the repaired candidate as a change gate certifying `n1-branch-commit-fix` before
finalization. Node ids are fresh (no parent-epoch id reuse) so epoch-2 evidence never collides
with the parent's `.cache` receipts.

Propagation discipline is unchanged from the parent: `kaola-workflow-claim.js` is a
COMMON_SCRIPT (canonical ↔ codex byte-identical, enforced by `validate-script-sync.js`) with
HAND-PORTED gitlab/gitea ports mirrored by hand modulo forge nouns; the four edition copies
move atomically in ONE writer node. The recorded `validation_command` matches the parent
(cross-edition diff: `npm test` runs the four edition chains sequentially; the two additive
edition suites install the same manifest scripts but are not chain-wired). Decision records
were checked in the parent epoch (no `D-715-*` exists); this follow-up repair of the same
shipped behavior allocates no new ADR.

## Node Briefs

### n1-branch-commit-fix

Repair F1 RED-first in the canonical `scripts/kaola-workflow-claim.js`, then propagate to the
codex byte twin and the gitlab/gitea hand ports. Read the parent-epoch refutation evidence
FIRST — `kaola-workflow/issue-715/.cache/n4-falsify-residue-fixes.md` (finding F1, triggers A
and B, anchors) is the specification; the issue body's acceptance criteria still govern.

Invariant the fix must establish: the discard-archive commit lands on the branch that SURVIVES
the release (the base branch), or it does not happen — with the outcome truthfully reported
and the residue recoverable. Never commit onto a branch the release itself deletes/discards;
never onto an arbitrary current branch (the sweep); never report `discard_archive_committed:
true` when the commit did not land on the surviving branch; always disclose which branch
received (or did not receive) the commit.

Trigger A (cmdRelease ~:3300-3330): exempt the EXACT dest the release just created
(`result.dest` — never a reconstructed plain path, the #700 collision-suffix lesson) from the
restore-gate `treeDirty` check so the in-place base restore + branch delete proceed; every
OTHER dirty path must keep blocking the restore exactly as today. Do NOT change
`isParkedLanePath` semantics (`archive/*` stays never-parked — `scripts/test-claim-hardening.js`
~:1663 pins it and other protections depend on it); scope the exception to the one path this
release created. The already-ordered commit then lands on the restored base.

Trigger B (cmdWatchPr CLOSED sweep ~:4299): the sweep has no restore logic — guard the commit
so it runs ONLY when the current checkout IS the base/surviving branch; otherwise skip it,
leave the archive as recoverable residue, and report `discard_archive_committed: false` with
the current branch disclosed in the cleanup entry (O3's missing disclosure lands here).

Helper hardening (~:2321-2351): put the base-branch guard INSIDE `commitDiscardArchive` so both
call sites inherit it (defense in depth) — resolve and compare the current branch against the
base before staging. Disclose the receiving branch on BOTH success and skip (one explicit
field on the emitted JSON; the exact name is yours — n2 mirrors it, so record it in your
evidence). Keep every epoch-1 semantic: never throw past the emit; the diff-quiet guard skips
redundant commits truthfully; pathspec-scoped `git add -A -- <rel>` / `git commit -- <rel>` of
the ACTUAL dest only; OFFLINE never skips a commit that does run.

RED first, before any producer edit: `scripts/simulate-workflow-walkthrough.js` beside the
existing release scenarios — (1) in-place (NATIVE=0) release with the checkout on the feature
branch: after release the archive tree is at the BASE branch HEAD (`git cat-file` on
`<base>:<rel>`), no `.discarded-` residue on base, `discard_archive_committed: true`, and after
the natural checkout+branch-delete cleanup the archive stays REACHABLE from the base ref (the
F1 orphan proof inverted); (2) watch-pr CLOSED sweep with the checkout on an unrelated
non-base branch: that branch's tip is unchanged, the report is truthfully not-committed with
the branch disclosed, residue recoverable. `scripts/test-claim-hardening.js` — unit pins: the
restore gate exempts ONLY the exact dest (a sibling dirty file still blocks the restore); the
helper refuses to commit on a non-base branch. Keep every existing assertion green unchanged.

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

### n2-branch-commit-docs

Read the n1 epoch-2 evidence file first. Add one `[Unreleased]` CHANGELOG entry covering the
F1 follow-up repair (wrong-branch discard-archive commit, truthful reporting + branch
disclosure). Update `docs/api.md` wherever `claim.js release` / watch-pr sweep disposal is
described: the discard-archive commit now lands on the surviving base branch — the in-place
posture restores base first — and on a non-base sweep checkout the commit is skipped and
truthfully reported not-committed with the receiving branch disclosed; mirror the exact field
name(s) n1 shipped (read them from the evidence, do not invent). Update
`docs/workflow-state-contract.md` § Terminal journal disposal with the same base-branch-binding
and truthful-non-commit distinction in one or two sentences. Docs only; no decision record.

### n3-code-certify-fix

Act as the named schema-2 common CODE certifier for the epoch-2 producer and the inherited
code frontier. Read the issue body, the parent-epoch refutation evidence
(`kaola-workflow/issue-715/.cache/n4-falsify-residue-fixes.md`), the n1 RED/GREEN evidence, and
the n2 documentation diff. Verify against the actual diff: both F1 trigger mechanisms are
eliminated (restore-gate exemption scoped to the exact dest; helper base-branch guard covers
both call sites); reporting is truthful on every path — success, diff-quiet skip, commit
failure, non-base skip — with the receiving branch disclosed; offline never skips a commit
that runs; the epoch-1 behaviors (receipt exemption matrix, commit-success/diff-quiet/
commit-failure cells) are untouched and green. Confirm parity: codex twin byte-identical,
forge module.exports superset green (`validate-script-sync.js` in evidence),
`edition-sync.js --check` green, and the gitlab/gitea ports mirror every epoch-2 hunk with no
missed site. Confirm the docs match the shipped field names and semantics. Zero findings is a
valid verdict; admit only concrete candidate-caused defects with an exact trigger and proof.

### n4-security-certify-fix

Act as the named schema-2 common SECURITY certifier for the inherited security frontier (the
epoch-1 candidate flags all four claim.js copies security_relevant). Audit the epoch-2 delta
for security primitives: every git invocation stays `execFileSync` argument-array form — no
shell-string interpolation of branch names, dest paths, or project segments; the base-branch
resolution and comparison cannot be spoofed (symbolic-ref vs detached HEAD vs crafted branch
name); the pathspec scoping (`-- <rel>`) cannot be widened by a crafted dest; the restore-gate
exemption matches EXACTLY the one path this release created (no prefix, directory, or
sibling-reachable form); the treeDirty / parked-lane / foreign-dirt / never-mutate-sibling
guards are not weakened anywhere; no new write outside the archive dest; no secrets,
credentials, or trust of operator-controlled input introduced. Verify all four edition copies
carry identical guard semantics. Zero findings is a valid verdict; admit only concrete
candidate-caused vulnerabilities with an exact trigger and proof.

### n5-falsify-branch-commit

Standalone adversarial change gate certifying `n1-branch-commit-fix`. Read the parent-epoch
refutation evidence first, then try to refute the headline claim with the strongest
falsification you can construct against the REPAIRED candidate. Re-run both F1 triggers
end-to-end: the in-place (NATIVE=0) release with the checkout on the feature branch must now
restore the base branch, commit the archive ON BASE, and leave it reachable after the natural
cleanup; the watch-pr CLOSED sweep on a non-base checkout must not bind to that branch and
must report truthfully with the branch disclosed. Then re-attack every cell that survived in
epoch 1 — commit success on base, the diff-quiet race, commit failure (hook exit, gitignored
dest), offline, the full preflight classification matrix (own/sibling × live/archive ×
porcelain status, deceptive look-alikes, sibling non-receipt blocking with zero mutation), and
four-edition parity — the repair must not have regressed any of them. Re-probe the epoch-1
non-blocking observations O1 (reserved-name receipt paths) and O2 (gitignored-residue warning
phrasing): still non-blocking unless the repair worsened them. Run the issue's two
reproductions against the candidate. Record a gate verdict, not implementation advice; pass
only if no counterexample survives.

### n6-finalize

Unique sink. Run the Meta `validation_command` once over the final post-documentation tree —
all four edition chains sequentially green via `npm test`, then `node scripts/test-kimi-edition.js`
and `node scripts/test-opencode-edition.js` — record the content-addressed receipt, verify the
named code and security certifiers and the standalone adversarial gate are complete and fresh,
then close issue 715. Write no tracked file from this node.

## Node Ledger

| id | status |
| --- | --- |
| n1-branch-commit-fix | complete |
| n2-branch-commit-docs | complete |
| n3-code-certify-fix | complete |
| n4-security-certify-fix | complete |
| n5-falsify-branch-commit | pending |
| n6-finalize | pending |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-branch-commit-fix) | subagent-invoked | evidence-binding: n1-branch-commit-fix cdaec2f007d9 | |
| doc-updater (n2-branch-commit-docs) | subagent-invoked | evidence-binding: n2-branch-commit-docs 5f37ba9a8dcb | |
| code-reviewer (n3-code-certify-fix) | subagent-invoked | evidence-binding: n3-code-certify-fix 45da7230e295 | |
| security-reviewer (n4-security-certify-fix) | subagent-invoked | evidence-binding: n4-security-certify-fix 87ac23d2764e | |
| adversarial-verifier (n5-falsify-branch-commit) | pending | | |
| finalize (n6-finalize) | pending | | |
