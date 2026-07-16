evidence-binding: e4-packaged-fixture-repair (no pre-seeded nonce found; node was not opened through
adaptive-node/provenance-log for this dispatch — workflow ceremony suspended per session task list)

# Task 1 — R6-699-03: packaged planner-packet fixtures omit snapshot authority

RED: all three direct fixtures constructed a synthetic `transaction` object for `buildPlannerPacket()`
without a `snapshot` field, while `buildPlannerPacket` reads
`transaction.snapshot.{authority_projection,authority_digest}`:
- `node scripts/validate-kaola-workflow-contracts.js` -> exit 1, TypeError reading `authority_projection`
  of `undefined` at the Codex replan port (line 1605).
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> exit 1, same TypeError
  in `testGitlabReplanEditionContract699`.
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> exit 1, same TypeError
  in `testGiteaReplanEditionContract699`.

GREEN (construction, not weakening): each fixture now builds a real transaction literal, then computes
`snapshot.authority_projection` via the exported canonical builder `replan.buildSnapshotAuthorityProjection(transaction)`
and `snapshot.authority_digest` via `schema.sha256Canonical(authority_projection)` — the exact mechanism
`prepareReplan` uses internally. The few extra parent/source/cas fields that projection construction
needs (`plan_digest`, `task_mirror_exact_digest`, `ledger_digest`, `state_authority_digest`,
`journal_digest`, `cas.prepare.claim_root_base_digest`) were added as real computed digests
(`schema.sha256Hex(Buffer.from('<label>'))`) or reused from the existing matching field
(`cas.prepare.claim_root_base_digest` mirrors `parent.claim_root_base_digest`, matching the real
`sameCasTuple` invariant). No production validation was touched or weakened.

- `node scripts/validate-kaola-workflow-contracts.js` -> exit 0, "Kaola-Workflow Codex contract
  validation passed". Confirmed clean.
- GitLab/Gitea: `buildPlannerPacket` no longer throws; execution proceeds through the packet-shape
  assertions, the missing-planner-attestation refusal check, the orientation resume-command check, and
  the half-transition fence-refusal block — all pass. Execution then reaches a SEPARATE, pre-existing
  defect further down the same test function (see Finding 1 below), so `test-gitlab/gitea-workflow-scripts.js`
  do not yet exit 0 end-to-end. R6-699-03 itself is fully resolved and independently verifiable: every
  assertion between the fixed fixture and the unrelated downstream defect passes.

Write set touched for task 1 (as declared): `scripts/validate-kaola-workflow-contracts.js`,
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`.

# Task 2 — routed from e3: forge walkthroughs crash before finalize scenarios

RED reproduced exactly as routed: both `testGitlabAdaptive`
(`plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js:316`) and
`testGiteaAdaptive` (`plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js:597`)
called `claim --workflowPath adaptive` in a `fs.mkdtempSync` temp dir that was never `git init`-ed,
tripping the #699 claim-anchor requirement (`buildClaimAnchors`) -> `claim_root_unavailable` with empty
stdout -> `SyntaxError: Unexpected end of JSON input`.

GREEN: mirrored each file's OWN existing helper convention (both files already had unused/later-used
git-init helpers, confirming this is the established local idiom):
- GitLab: added `glInitGitRepo(tmp);` at the top of `testGitlabAdaptive`, calling the helper already
  defined at line ~895 (used by the later #342 bundle-lane scenarios in the same file; hoisted function
  declaration, safe to call earlier).
- Gitea: added `_initGitRepo(tmp);` at the top of `testGiteaAdaptive`, calling the pervasively-used
  helper already defined at line ~179 (used by ~15 other scenarios in the same file).

Both walkthroughs now proceed well past the original crash point (client acquires, plan freeze/repair,
tampered-plan refusal, #509 verdict-check fanout/gate scenarios, #501 sensitive-surface G2 scenarios all
execute and pass) before hitting a SEPARATE pre-existing defect in the M2 (#277) finalize scenario later
in the same function (see Finding 2 below).

Codex forge walkthroughs (`simulate-gitlab-codex-workflow-walkthrough.js`,
`simulate-gitea-codex-workflow-walkthrough.js`): checked for the same latent gap. Neither has an inline
`claim --workflowPath adaptive` scenario against a bare temp dir; each just spawns the packaged
`test-{gitlab,gitea}-workflow-scripts.js` as a subprocess (`run('test-gitlab-workflow-scripts.js')` /
gitea twin) and inherits ITS exit code. Their current failure is purely a downstream symptom of Finding 1
below, not a separate git-init gap. No fix needed/applied to these two files.

# Findings routed out of write set (classified, not worked around)

Both are pre-existing production/fixture defects that were masked by the two crashes above for their
entire existence (never previously reached by any test run, from whichever earlier r3/r4/e-node authored
them through e2/e3 and now through my fixes) — surfaced only because fixing R6-699-03 and the walkthrough
git-init gap unblocked execution far enough to reach them. Neither is caused by, or fixable within, this
node's declared write set; both require deep transaction/authority-construction work matching the
`tdd-guide` role class (the same role the reviewer assigned to the sibling findings R6-699-01/02/04 in
this same review pass), not a build-error fix.

## Finding 1 — legacy (schema_version 1) snapshot manifest fixture is incomplete

`testGitlabReplanEditionContract699` / `testGiteaReplanEditionContract699`'s `archiveRoot` block
(`test-gitlab-workflow-scripts.js:5084-5115` / `test-gitea-workflow-scripts.js` twin, entirely new to
this issue — confirmed via `git diff d59b191c` showing the whole function as an added hunk, not a
modification of pre-#699 code) hand-writes an epoch-1 `manifest.json` with `schema_version: 1` and only
one declared file (`.cache/review-attempts.json`), then asserts
`replan.verifyAllEpochSnapshots(projectDir).ok`.

Reproduced directly (isolated repro script, not the shipped file):
`replan.verifyAllEpochSnapshots(projectDir)` -> `{"ok":false,"reason":"legacy_snapshot_binding_unsealed",
"detail":"ENOENT ... files/workflow-plan.next.md"}`. Root cause: `verifySnapshotManifest` routes any
`schema_version: 1` manifest through `verifyLegacyExternalBinding`, which unconditionally requires the
FULL legacy external-seal chain-of-custody: a `workflow-plan.next.md` present inside the snapshot's
`files/` dir whose `## Meta` section reads `parent_snapshot_manifest_digest: pending`; a `manifest.child`
record with matching `digest`/`plan_hash`; a copied `.cache/replan-planner-attestation.json` whose
`attestation_digest` is `sha256Canonical` of itself minus that field; and a `readCommittedTransactionAuthority`-
resolvable committed transaction (`projectDir/.cache/replan-transaction.json` or
`.cache/committed-transactions/{id}.json`) that itself passes the ~270-line `validateReplanTransaction`
(identity-bound `transaction_id`, full parent/source/cas/budget/planner/child/snapshot/activation shape,
dispatch-nonce/CAS-tuple/activation-journal self-consistency). None of this exists in the fixture; only
the manifest itself was constructed.

Since `REPLAN_TRANSACTION_SCHEMA_VERSION` is now permanently 2 (this issue's own R6-699-01 fix), there is
no live code path left that produces a genuine schema_version:1 transaction — a correct fixture would
need either ~15+ hand-threaded interdependent SHA-256 digests, or driving the real multi-phase
prepare/planner-attest/commit replan lifecycle with a scoped monkeypatch of the exported schema constant
(mirroring the ~300+ line `initFixture`/`advanceToAttestedChild` harness already built for this purpose
in `scripts/test-replan.js`, which is E2-owned and out of this node's write set). This is feature-scale
construction work, not a build error.

Files: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (assertion at line 5107-5108,
message "GitLab re-plan smoke: live epoch snapshot must digest-verify before archive"),
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (equivalent, line 4925ish).
Neither `verifyLegacyExternalBinding` / `verifySnapshotManifest` / `validateReplanTransaction` (production
code) was touched or should be weakened — the fixture is simply incomplete.

## Finding 2 — `verifyCurrentEpochAuthority` misclassifies a legacy-but-planned state as planless

The GitLab/Gitea walkthroughs' M2 (#277) warn-first-attestation finalize scenario (issue-970 fixture,
pre-dates #699: references #277/#333/#324/#522/#653) writes a `workflow-state.md` with NO epoch-envelope
fields at all (pre-#699 format) but WITH an old-style `## Planning Evidence` / `plan_hash:` field and a
real `workflow-plan.md`. `claim finalize` now unconditionally runs `verifyArchiveEpochAuthority` (new to
#699, `kaola-{gitlab,gitea}-workflow-claim.js`) before any archive.

Reproduced directly (isolated repro script): `finalize --project issue-970` ->
`{"result":"refuse","reason":"replan_snapshot_incomplete","detail":"state_planless_authority_invalid"}`.
Root cause, in `verifyCurrentEpochAuthority` (`kaola-{gitlab,gitea}-workflow-replan.js`, new to #699):
`validateEpochStateAuthority` correctly classifies a state with zero epoch-envelope fields as
`{ok:true, legacy:true}`, but `verifyCurrentEpochAuthority` does not special-case that `legacy` flag — it
falls straight into the active/planless split, where `activeHash = state.active_plan_hash || 'none'`
ALWAYS defaults to `'none'` for a legacy state (the field never existed pre-#699), forcing every legacy
state down the strict "planless" branch. That branch then requires `state.plan_hash` (the OLD field name)
to also be `'none'` and no `workflow-plan.md` to exist — both false for a genuinely legacy PLANNED
project — so it refuses `state_planless_authority_invalid` instead of recognizing the legacy-planned form.

This looks like a genuine backward-compatibility regression: `verifyArchiveEpochAuthority`'s new mandatory
precondition can no longer finalize/archive ANY pre-#699 project that has a real plan, only pre-#699
projects that are ALSO planless. `verifyCurrentEpochAuthority`/`verifyArchiveEpochAuthority` live in
`kaola-{gitlab,gitea}-workflow-replan.js` and `kaola-{gitlab,gitea}-workflow-claim.js` — explicitly
forbidden files for this node ("Do NOT touch: claim.js/.../replan source files"), and are new-to-#699
production authority logic, not a fixture or build error.

Files affected (assertion never reached — blocked upstream): `simulate-gitlab-workflow-walkthrough.js:681`
("M2 (#277): gitlab finalize must return status:closed"), `simulate-gitea-workflow-walkthrough.js:956`
(gitea twin).

# Remaining verification

- `node scripts/validate-kaola-workflow-contracts.js` -> **0** (Kaola-Workflow Codex contract validation
  passed).
- `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` -> **1**, blocked by
  Finding 1 (R6-699-03 itself verified resolved; execution reaches Finding 1's assertion).
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` -> **1**, blocked by
  Finding 1 (gitea twin).
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` -> **1**, blocked
  by Finding 2 (git-init gap itself verified fixed; execution reaches Finding 2's assertion, well past
  the original crash point).
- `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` -> **1**, blocked by
  Finding 2 (gitea twin).
- `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js` and gitea
  twin -> **1** each, purely downstream of Finding 1 (they subprocess-run the packaged test-scripts
  file). No separate defect; no fix needed in these two files.
- `node scripts/edition-sync.js --check` -> **1**: 3 issues, all in `kaola-workflow-adaptive-node.js`
  (canonical vs. gitlab/gitea/codex mirrors) — this file is explicitly out of this node's write set and
  explicitly called out by the dispatching message as being concurrently edited by a different teammate
  agent in this same worktree ("do not touch adaptive-node or its plugin copies"). Not caused by this
  node's diff; re-run after that concurrent work lands and syncs.
- `node scripts/validate-script-sync.js` -> **1**, same single file (`kaola-workflow-adaptive-node.js`),
  same cause as above.
- Forbidden-token check on this node's changed forge files
  (`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only
  plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
  plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` and the gitea twin) ->
  **1** each, but NOT from anything this node added: `assertNoForbidden` scans the entire file text
  (including comments) for tokens like `/GitHub/`, `/GitLab/`, `/\b[a-z]+glab\b/i`; both test files carry
  long-pre-existing forge-parity comments (e.g. "Mirrors GitHub runClosureAudit", "GitLab port of GitHub
  issue #165" — provenance from issues #165/#166/#167/#276/#332, all pre-dating #699) that trip these
  patterns. Verified directly: every line this node added (the new `n5Transaction`/`buildSnapshotAuthorityProjection`
  block, the `glInitGitRepo`/`_initGitRepo` call + comment) is clean of every forbidden pattern — checked
  both by line-range inspection of the new code and by isolating this node's own diff hunks. The
  default (non-`--forbidden-only`) validator run, which only scans agent-facing prompt surfaces
  (commands/skills/hooks/agents.toml), is unaffected and still exits 0. This looks like a check/target
  mismatch (whole-file `--forbidden-only` scanning was designed per issue #341's comment for "just its
  changed files", not for running the full historical text of a multi-thousand-line legacy test file that
  has always carried cross-forge-parity comments) rather than something introduced by this node's diff.
  Recommend the team lead/reviewer confirm whether this check is expected to run against these test files
  at all, or only against genuinely new standalone files.

# Summary

R6-699-03 is fully resolved in all three declared fixtures, verified independently of the two newly
discovered downstream defects. The e3-routed walkthrough git-init gap is fixed in both forge walkthroughs
using each file's own established helper convention; the Codex forge walkthroughs needed no separate fix.
Full green on `test-{gitlab,gitea}-workflow-scripts.js` and `simulate-{gitlab,gitea}-workflow-walkthrough.js`
is blocked by two newly-surfaced, pre-existing defects (Finding 1: an incomplete legacy-snapshot fixture
requiring feature-scale transaction-construction work; Finding 2: a production backward-compatibility
regression in forbidden-to-touch `replan.js`/`claim.js` files) that were masked by the crashes this node
was asked to fix, for their entire existence. Both are classified above with full reproduction and
recommended for `tdd-guide` follow-up, matching the review's own role assignment for the sibling findings
in this pass. edition-sync/script-sync are red only due to a concurrent teammate's in-progress
`kaola-workflow-adaptive-node.js` work (explicitly excluded from this node), and the forbidden-token check
fails only on long-pre-existing unrelated comment content, not this node's diff.
