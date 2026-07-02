evidence-binding: n4-docs 430a673e5bb7

# n4-docs — doc-updater evidence (issue #596)

## Scope

Documented #596: write-bearing nodes graduated onto the speculative-open kernel
(`speculative_open_policy: consent`) behind the existing consent ceremony, leg-contained,
discard-only on gate failure. Read the code diff first (`git diff HEAD -- scripts/kaola-workflow-next-action.js
scripts/kaola-workflow-adaptive-node.js scripts/kaola-workflow-plan-validator.js`) and the new
real-git integration tests (`T596-1`..`T596-11` in `scripts/test-adaptive-node.js`) as ground
truth before writing every claim below — no invented fields.

## Per-file changes

1. **`docs/architecture.md`** — extended the existing "Parallelism v3 design (issue #419)"
   paragraph (the one that already documents D-419-01/D-419-02 Part 1/3/4). Added: write-bearing
   descendants now admitted under `consent` (same single-open-gate bet + three write-axis
   guards: exactly-resolvable set, no PROTECTED file, not the sink); opens WITH a provisioned
   per-member leg (even a lone writer forms a size-1 lane group) instead of the parent
   worktree; DISCARD-ONLY on gate `verdict: fail` (asymmetry with the read half's
   KEEP-or-discard review); noted the original D-419-02 write-overlap deferral rationale
   (parent-worktree revert complexity) is now moot post-leg-isolation. Added a
   `docs/decisions/D-596-01.md` citation. Minimal surgical addition — no other part of the file
   touched (verified the pre-existing text first; left the unrelated, unchanged "Cross-lane
   runtime protection is advisory" prose at architecture.md:267 untouched — it predates #596
   and is out of this node's declared scope).

2. **`docs/api.md`** — two edits: (a) renamed the "Speculative-read kernel typed outcomes"
   bullet in the reason/emission inventory (§ "Mutual-exclusion + integrity reason codes") to
   "Speculative-open kernel typed outcomes", extended `gate_not_complete`/`speculative_review_required`
   prose to cover read-or-write, and added the new `speculative_write_excluded` reason +
   `speculativeWriteExcluded: {reason, nodeIds}` field (`'no_leg_capability'` /
   `'overlaps_live_writer'`) — transcribed directly from `runOpenReady`'s new branch, not
   invented. (b) Renamed the "### Speculative-read kernel" section heading to "### Speculative-open
   kernel", updated the eligibility paragraph to state the three write-axis conditions
   (`hasUnresolvableEntry`, `classifier.isProtected`, `uniqueSink` — all reused, not new
   predicates), and added a new "Write member mechanics (#596, D-596-01)" paragraph documenting:
   leg provisioning (size-1 lane group, no new merge code — `closeGroupMember` degeneration),
   the WRITE fan-out cap (not the read cap), the runtime `--parallel-safe` re-check via
   `selectSpeculativeWriteGroup`, the pass path (unchanged per-leg → group barrier → merge), the
   discard-only fail path (skips the in-lane revert step — verified via the diff comment
   explaining why a `git checkout <baseSha>` would hard-fail for a new file), the additive
   `legTornDown`/`evidenceDiscarded`/`groupCleared` envelope fields (verified exact shape against
   `runDiscardSpeculative`'s return statement), and the `reconcile-running-set` crashed-write arm
   (verified NO new response field — the demoted ids fold into the pre-existing `rolledBack`
   array; confirmed by reading `runReconcileRunningSet`'s full return statement).
   Left the `## Meta` `auto` bullet's pre-existing text intact except clarifying it is a
   DISTINCT still-deferred axis (fully-automatic activation, orthogonal to #596's `consent`-based
   write eligibility) — did not alter the pre-existing "#463" citation there (out of scope;
   `SPECULATIVE_OPEN_POLICY_LEGAL` and the `auto` refusal message are unchanged by this diff).

3. **`docs/plan-run-cards/speculative-open.md`** — rewritten section-by-section (§1 eligibility
   bullets, Authoring, §3 open-ready, §4 pass path, §5 fail-path table, §6 discard-speculative,
   the quick decision tree) to cover write-bearing members: eligibility conditions, leg
   provisioning + dispatch.leg_path/leg_branch routing, the discard-only asymmetry (no KEEP
   option for a write member, unlike a read member), and the leg-teardown/evidence-purge/
   group-clear discard steps. Per the task's explicit instruction this card is treated as an
   agent-facing prompt surface: ALL provenance tokens (`#439`, `D-419 Part 4`, `D-445-01`,
   `D-419-01`) were stripped, including from the pre-existing "Related:" line and the "Authoring"
   section's citations of `agents/workflow-planner.md`'s rubric and `D-419-01`. Verified zero
   provenance leaks with
   `grep -nE "#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|\bINV-[0-9]+|ADR[ -][0-9]{2,4}|\b(PR|MR|AC)#[0-9]+"
   docs/plan-run-cards/speculative-open.md` (exit 1, no matches). Note: `agents/workflow-planner.md`'s
   own "Speculative-open-eligible shaping" rubric (cited by name, not by path-specific claim, in
   this card) still says the Meta key is "NEVER set for a write node" — that file is OUTSIDE this
   node's frozen write set, so it was left untouched; it is now stale relative to the shipped
   behavior and is a real follow-up gap (see Deviations below). The sibling cards
   (`frontier-batch.md`, `governance.md`, `reopen-complete-node.md`, `repair-routing.md`,
   `resume.md`) and `docs/plan-run-cards/README.md` retain provenance as before — untouched,
   out of this node's write set; the resulting inconsistency (this card provenance-free, its
   siblings not) is a known, deliberate deviation from repo-wide card convention, per explicit
   task instruction.

4. **`docs/decisions/D-596-01.md`** (new) — ADR following the `D-593-01`/`D-595-01` structure
   (Date/Status/Issue/Related, Context, Decision, Consequences, Alternatives considered). Cites
   D-419-02 (the original deferral + its stated rationale, verified by reading
   `docs/decisions/D-419-02.md` lines 146-236 directly), D-437-01/D-542-01 (the leg machinery
   reused), and D-593-01 (precedent for extending an existing relaxation predicate). Test counts
   (97→103 next-action, 1248→1310 adaptive-node) verified by running both suites directly in
   this worktree (not copied from memory) — see Verification below.

5. **`CHANGELOG.md`** — new `### Added` entry for #596, placed FIRST in the Added section
   (newest-first: 596 > 591 > 588 > 587), referencing `docs/decisions/D-596-01.md`, noting
   consent-gated default-off, four-edition scope, and the verified test-count deltas.

## Write-set containment

`git status --porcelain | grep -v '^?? kaola-workflow/'` shows exactly the 5 declared files
(CHANGELOG.md, docs/api.md, docs/architecture.md, docs/plan-run-cards/speculative-open.md
modified; docs/decisions/D-596-01.md new/untracked) plus the pre-existing code/test diff from
the other node (scripts/kaola-workflow-{adaptive-node,next-action,plan-validator}.js,
scripts/test-{adaptive-node,next-action}.js, and the three plugins/ forge-port mirrors). No file
outside the frozen write set was touched by this node.

## Verification results

- `node scripts/validate-workflow-contracts.js` — PASS ("Workflow contract validation passed",
  exit 0). Re-checked: PROVENANCE_BAN in this validator scopes only `agents/*.md` and
  `commands/*.md` (confirmed by reading the validator source), so it does not machine-enforce
  the card's provenance-free requirement — that was verified by direct grep instead (above).
- `node scripts/validate-kaola-workflow-contracts.js` (codex) — PASS ("Kaola-Workflow Codex
  contract validation passed", exit 0).
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
  PASS ("Kaola-Workflow GitLab contract validation passed", exit 0).
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — PASS
  ("Kaola-Workflow Gitea contract validation passed", exit 0).
- `node scripts/test-next-action.js` — PASS, 103 assertions (matches the diff's test-additions
  and the number cited in the ADR/CHANGELOG).
- `node scripts/test-adaptive-node.js` — PASS, 1310 assertions (an EISDIR stack trace appears in
  stdout mid-run — this is the PRE-EXISTING #588 task-mirror fail-open test intentionally
  forcing `workflow-tasks.json` to be a directory; it is caught and non-fatal, run still exits 0
  with "adaptive-node tests passed").
- `grep -nE "#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|..."  docs/plan-run-cards/speculative-open.md` —
  0 matches (provenance-free confirmed).

## Deviations / follow-up gaps noted (not fixed — outside this node's write set)

- `agents/workflow-planner.md`'s "Speculative-open-eligible shaping" rubric (~line 192-220)
  still says the Meta key is "NEVER set for a write node" — now stale relative to #596's shipped
  write eligibility. Flagging for the orchestrator; not touched here since it is not in this
  node's frozen write set and editing an agent prompt surface was not authorized for this node.
- The sibling `docs/plan-run-cards/*.md` files and `docs/plan-run-cards/README.md` still carry
  provenance (per repo convention) while `speculative-open.md` is now provenance-free per this
  node's explicit instruction — a deliberate, scoped inconsistency, not an oversight.
