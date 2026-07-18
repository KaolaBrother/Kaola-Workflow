# Finalization - Summary: issue-715

## Delivered

One bundle closing both halves of #715 plus two in-run discovered hardening layers, shipped across three re-plan epochs (schema-2 lineage, all four editions byte/port-parity):

1. **(epoch 1)** `release` (and the `watch-pr`/`watch-mr` CLOSED sweep) now commits the discard archive it creates — a new shared `commitDiscardArchive` helper stages the archive helper's ACTUAL `dest` (pathspec-scoped, never a reconstructed plain path), skips on a diff-quiet guard, commits `chore: discard archive <project>`, and verifies the archive is a tree at HEAD; the emitted JSON carries `discard_archive_committed` / `discard_archive_commit_detail` (+ `warnings[]` on failure), never throws past the emit, and `KAOLA_WORKFLOW_OFFLINE` never skips it. The sink preflight's receipt exemption was re-keyed from THIS project to the EXACT path shape — exactly one `<project>` segment, live or archived, any project — so an interrupted SIBLING sink's `sink-receipt.json` no longer classifies as bucket-3 foreign dirt (classification-only; this sink never touches it).
2. **(epoch 2, F1 refutation repair)** The discard-archive commit can no longer bind to the wrong branch: the in-place base restore gate exempts ONLY the archive's actual `result.dest`, and `commitDiscardArchive` itself resolves the current branch from the dest's toplevel and refuses to stage on any non-base branch (both call sites); an off-base `watch-pr`/`watch-mr` sweep skips the commit and truthfully reports `discard_archive_committed: false`, with a new `discard_archive_branch` field disclosing the receiving (or non-receiving) branch on success AND skip.
3. **(epoch 3, guard hardening)** The recorded `base_branch` is validated as a real surviving branch BEFORE staging — the detached-HEAD sentinel `HEAD` is rejected outright, the base must resolve via argument-array `git rev-parse --verify refs/heads/<base>`, a base naming the branch being discarded is refused, and at the sweep posture the base must equal the repo's default branch — and AFTER the commit the checkout is re-resolved and HEAD must be reachable from the guarded base (`merge-base --is-ancestor`), any violation downgrading to a truthful `discard_archive_committed: false` with the ACTUAL receiving branch disclosed and residue recoverable.

## Files Changed

- `scripts/kaola-workflow-claim.js` (+ `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` codex byte-twin, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` hand ports) — epochs 1-3 discard-archive commit + guards
- `scripts/kaola-workflow-sink-merge.js` (+ the three plugin mirrors) — epoch-1 sibling-receipt preflight exemption
- `scripts/simulate-workflow-walkthrough.js`, `scripts/test-claim-hardening.js`, `scripts/test-sink-merge.js` — RED-first regression fixtures (five N5-A/N5-B walkthrough cells, 21 hardening pins, the #715 preflight-exemption pins)
- `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md` — documentation delta (node n2)
- `kaola-workflow/issue-715/**` — workflow state (validation-invisible)

## Test Coverage

No project-defined coverage gate (the self-host chains define none). Assertion-level evidence: claim-hardening 485 assertions, adaptive-node 2479 assertions, kimi edition 577 assertions, opencode edition 547 assertions — all green inside the four-chain receipt and the n6 terminal validation.

## Final Validation Evidence

- Prerequisite gates (this session, against the frozen epoch-3 plan): `--resume-check` pass, `--gate-verify` pass, `--verdict-check` pass (n3/n4/n5 schema-2 receipts verified against the recomputed current candidate_digest `af7e553c1fc7f26435278ba7695b6c0d6135fd95b24d7d2e8da310a9c9bb68da` — all three certifier receipts carry it; zero findings blocking).
- Whole-plan `--barrier-check`: refused `write_set_overflow` on the 5 epoch-1 sink-merge files — the KNOWN, FILED tooling gap #724 (a schema-2 child plan unions only its own declared write sets, so legitimately-declared parent-epoch writes in the accumulated candidate refuse). NOT a candidate defect: the lineage-aware equivalent was re-run at finalize entry this session — the validator's own exported `barrierCheck` driven over the union of child + epoch-2 + epoch-1 declared write sets (verbatim Nodes rows from the three real plan files, security-reviewer rows and a complete ledger preserved) against the same merge-base diff: **pass, 14/14 actual writes covered, zero sensitive / foreign-archive / unattributed hits** (evidence: this run's /tmp script output; in-run original evidence filed in #724). Mapped in Run gaps below.
- Terminal change-gate validation (node n6-finalize-epoch3, the Meta `validation_command` run once over the final post-documentation tree): `npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js` — exit 0; all four edition chains sequentially green plus both additive suites (evidence: `.cache/n6-finalize-epoch3.md`).
- Self-host chain receipt: `node scripts/kaola-workflow-run-chains.js --project issue-715` — `.cache/chain-receipt.json` stamped against the final candidate: all four chains exit 0 (codeTreeHash `33ff88e349cce7bc3073c0479ef4e5f4b13de21a3ac1e767edb78f67b7472973`, headSha `cd28e8e5`); `--finalize-check` exit 0 (mode chain-receipt). First attempt timed out on the claude chain under GitHub API rate-limit exhaustion (duration flake, codex/gitlab/gitea green); re-run with a 60-min cap after quota recovery passed all four. Record: `.cache/final-validation.md`.

## Documentation Docking

DOCKED — evidence: `.cache/doc-docking.md` (14 changed files reviewed; CHANGELOG / docs/api.md / docs/workflow-state-contract.md matched clause-for-clause against the shipped code; README.md, docs/architecture.md, .env.example skipped with explicit no-impact reasons).

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none — no final-validation failures) | | | | |

## Follow-Up Items

Run-discovered tooling gaps filed in-run (all in the re-plan/finalize tooling family, none in the shipped product fix): #719, #720, #721, #722, #724. No Phase-5 review follow-ups remain (n3/n4 approved with findings_blocking 0; n5 not_refuted).

## Run gaps

- manual:manual-replan-compliance-authority (mid-run replan prepare refused state_compliance_authority_invalid on the partial legacy-append compliance table; missing canonical pending rows hand-appended; systemic freeze/replan asymmetry filed as #719): filed: #719
- manual:manual-replan-candidate-digest-mismatch (replan prepare verifyCandidate compared schema-2 landable attempt digest against raw ls-tree digest and falsely refused replan_source_candidate_changed; prepare and resume run through a tmpdir-patched script copy; filed as #720): filed: #720
- manual:manual-replan-attestation-prestamp-wedge (planner attested the unstamped child and the transaction wedged at child_frozen with no CLI recovery; transaction scratch rebuilt from source and planner re-attested over the pre-stamped child; filed as #721): filed: #721
- manual:manual-replan-journal-rotation (child epoch first gate close refused review_journal_plan_hash_mismatch on the parent-bound active journal; active journal rotated to a fresh child-bound V2 journal with the parent journal digest-preserved in the epoch snapshot; filed as #722): filed: #722
- manual:manual-barrier-check-lineage-union (whole-plan --barrier-check on a schema-2 child plan unions only the child's declared write sets, so parent-epoch writes in the accumulated candidate refuse write_set_overflow at finalize entry; a lineage-aware equivalent over the child plus epoch-2 plus epoch-1 declared union passed 14-of-14; filed as #724): filed: #724

## Closure Decision

Scan of all phase/plan artifacts for deferred items, unresolved conflicts, partial implementation notes, open review follow-ups, and user-decision items: **none outstanding.** The five follow-ups above were already filed as issues in-run through the run-gap sweep (the sanctioned flow); both halves of #715 are fully implemented and certified through three epochs of code/security/adversarial gates. No user decision required; the issue CLOSES (sink: merge; no `issue_action` keep-open).

## Commit And Push

Pending final Git gate (contractor Step 8 commit `chore: finalize issue-715`; the Step 9 merge sink pushes branch + main). Final hash reported after push, not written back here.

## GitHub Issue

#715 — OPEN at summary-write time; closes at the Step 9 merge sink (acceptance criteria passed per the gates above and the Closure Decision scan).

## Roadmap

`kaola-workflow/.roadmap/issue-715.md` removal + `ROADMAP.md` regeneration owned once by `cmdFinalize` at Step 8b; the contractor stages the result.

## Archive

Pending — `kaola-workflow/archive/issue-715/` via `cmdFinalize` Step 8b (atomic, script-owned).

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked (plan node n2-guard-hardening-docs, subagent-invoked) | `.cache/n2-guard-hardening-docs.md`; plan Required Agent Compliance row | |
| documentation docking | invoked | `.cache/doc-docking.md` (DOCKED) | |
| final-validation fix executors | N/A | no final-validation failures — nothing routed | no failing command |
| roadmap refresh | invoked | `kaola-workflow/ROADMAP.md` (regenerated by cmdFinalize Step 8b, staged by contractor) | |
| archive completed folder | pending | owned by `cmdFinalize` Step 8b (atomic script path) | |
| final commit and push | ready | `git status` scoped to this project; push owned by the Step 9 merge sink | final gate runs after this file is committed |

## Status

ARCHIVED AFTER FINAL GIT GATE

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: attested
