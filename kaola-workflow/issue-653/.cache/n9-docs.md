evidence-binding: n9-docs 47d7e98fe9eb
upstream_read: n7-review 5457dbfeedcc
upstream_read: n1-design 3dee366bd213
upstream_read: n2-attestation 7ec679259eca
upstream_read: n3-sink-journal b039e808d87b
upstream_read: n4-candidate-binding 9c525d832610
upstream_read: n5-selection-rungaps f05d57b01682
upstream_read: n8-adversary 4f8238411572

docs_updated: docs/api.md (extended), docs/architecture.md (extended), docs/workflow-state-contract.md (extended), docs/conventions.md (extended), docs/decisions/D-653-01.md (new). README.md skipped-with-reason (no user-facing feature list/usage example/env var changed — all four #653 mechanisms are internal closure-receipt/gate/journal contracts, already fully documented in the four files above; matches the existing precedent that #648/#651's closure-receipt and finalize-gate additions were likewise not added to README).

Ground truth performed BEFORE writing any doc prose (never fabricated — verified against actual code/output, not upstream evidence claims alone):
- `grep -n "function disposeSinkJournals" -A 20 scripts/kaola-workflow-sink-merge.js` — read the real implementation (4 candidate paths, ENOENT-tolerant per-file try/catch, `allDisposed` return) before writing the api.md/architecture.md/workflow-state-contract.md disposal paragraphs.
- `grep -n "function persistAttestationToSummary\|function probeSelectionEvidence" -A 25 scripts/kaola-workflow-claim.js` — read both real implementations (presence-guard regex, create-if-absent, warnings filter, `probeSelectionEvidence`'s `/^selection-evidence\./` regex + candidate order) before writing the closure-receipt/attestation prose.
- `grep -n "candidate-hash\|candidate_hash_unavailable\|final_validation_unbound\|final_validation_stale\|parseValidatedCandidateHash\|validated_candidate_hash" scripts/kaola-workflow-plan-validator.js` + `Read` of plan-validator.js:3220-3274 — confirmed the real `--candidate-hash` producer block, the JSON pass/refuse shapes, the exact hint strings (lines 110-113), and the exact precedence-comment wording (lines 3268-3271) before writing the new "Candidate-hash binding" api.md subsection.
- `grep -n "selection_evidence" scripts/kaola-workflow-closure-contract.js` — confirmed the real `CLOSURE_RECEIPT_FIELDS`/`emptyReceipt()` field additions (`['present','absent']`, `null` default) before adding it to the api.md closure-receipt JSON schema block.
- `Read` of scripts/kaola-workflow-gap-sweep.js:240-310 — read the real `runCheck` reverse-containment block (parse-first ordering, exact-tuple `.some()` match, the `sweptClasses.length === 0 && (gapEntries === null || gapEntries.length === 0)` vacuous-pass condition, the `detail` remedy string) before writing the architecture.md/conventions.md reverse-containment paragraphs.
- Read `commands/kaola-workflow-finalize.md` (refusal-row wording for `final_validation_unbound`/`final_validation_stale`/`observed_gap_unseeded`, the "Attestation boundary"/"Warning persistence" section, the journal-disposal Crash-resume paragraph) and `templates/routing/plan-run.skeleton.md` (the bind-LAST rule, Run-Gap Manual Seeding paragraph, Validation De-Duplication citation rule) to match exact shipped terminology and cross-check consistency across surfaces before writing docs prose that references them.
- Read `docs/decisions/D-651-01.md` in full to match D-653-01.md's section shape (Date/Status/Issue/Related, Context, numbered Decision, Consequences, Non-goals, Alternatives considered).
- Confirmed no dead cross-reference: `docs/api.md` § headings I newly created ("Candidate-hash binding for consumer final-validation (issue #653 / D-653-01)", "Sink journal disposal at terminal success (issue #653 / D-653-01)") are cited correctly from `docs/architecture.md` and `docs/workflow-state-contract.md`; `docs/decisions/D-653-01.md` is cited from all four other files.

Per-file summary of what changed:

- **docs/api.md** (+118/-0 lines by `git diff --stat`):
  1. Extended the "Finalize validation-gate typed refusals (#432/#475, dual-mode)" bullet with
     `final_validation_unbound`/`final_validation_stale` (consumer mode) and the extended
     precedence order, cross-referencing the new subsection.
  2. New `### Candidate-hash binding for consumer final-validation (issue #653 / D-653-01)`
     subsection (between the dual-mode gate paragraph and `--release-check`): the
     `--candidate-hash [--json]` producer CLI + JSON shapes, the recording contract (bind LAST),
     the `parseValidatedCandidateHash` parser contract, the gate's `final_validation_unbound`/
     `final_validation_stale` logic + operator hints, and the #475/#648 non-reversal notes.
  3. New `### Sink journal disposal at terminal success (issue #653 / D-653-01)` subsection
     (Closure Contract, after `worktree_dirty`, before `audit-labels`): the 4 candidate paths,
     ENOENT-tolerant disposal, call-site ordering argument, `journal_disposed` field, and the
     "never commit a stray journal" rule.
  4. Extended the closure-receipt JSON schema with `"selection_evidence": "present|absent"`, and
     added two new prose paragraphs after the WARN-FIRST attestation paragraph: attestation
     warning persistence to the archive (the `## Attestation` section, its exact schema, the R1
     pre-seed residual disposition) and the `selection_evidence` field contract
     (`probeSelectionEvidence`, advisory-only, no invariant).

- **docs/architecture.md** (+10/-1 lines):
  1. Extended the M2 WARN-FIRST closure attestation paragraph (Codex harness hardening / Strict
     lean-orchestrator boundary section) with the archive-persistence sentence and the
     now-mandatory `--attest-planner-spawn` note.
  2. Extended the existing Run-gap sweep gate (#435) paragraph with the reverse-containment
     mechanism (parse-`## Run gaps`-first, exact-tuple match, `observed_gap_unseeded`, the
     both-sides-empty vacuous-pass rule).
  3. Added three new paragraphs before "## Finalization and Sink Flow": Sink journal disposal,
     Consumer final-validation candidate-hash binding, and Selection evidence docking — placed
     alongside the pre-existing Chain receipt (#432) / Run-gap sweep gate (#435) paragraph
     cluster, matching that section's density and cross-reference style.

- **docs/workflow-state-contract.md** (+42/-4 lines):
  1. New `.cache/` inventory bullet for `selection-evidence.md` (after `dispatch-log.jsonl`).
  2. New `.cache/` inventory bullet for `final-validation.md` + the `validated_candidate_hash`
     binding contract (after the existing `chain-receipt.json` bullet).
  3. New "Terminal journal disposal (issue #653 / D-653-01)" bullet inside the "Sink-receipt
     schema extensions (#517, #518)" list (after `published_head`).
  4. Updated the `## Closure` block field list (Terminal stamp + closure receipt #333 paragraph)
     to add `claim_planner_attested`/`finalize_contractor_attested` — this list was stale before
     my edit (it predated #277 M2's fields being added to that block).
  5. New "Attestation persistence (issue #653 / D-653-01)" bullet documenting
     `finalization-summary.md`'s new `## Attestation` section, distinct from the `## Closure`
     block fields above.

- **docs/conventions.md** (+29/-8 lines):
  1. Extended the "Chain receipt is the only valid greenness evidence (#432)" Consumer paragraph
     with the candidate-hash binding requirement (record hash LAST, `final_validation_unbound`/
     `final_validation_stale`, gate compares hashes only).
  2. Rewrote the "Run-gap capture is gated at finalize (#435)" section: added the pre-step-1
     orchestrator manual-seeding paragraph, corrected step 3's now-stale "vacuous pass when
     sweptClasses is empty" description to the true both-sides-empty rule, added
     `observed_gap_unseeded` to the typed-`reason` classification list, and added the
     D-653-01 decision-record cross-reference.

- **docs/decisions/D-653-01.md** (new, follows D-651-01.md's section shape): Context (the four
  independent gaps found in the post-ship audit), Decision (A attestation persistence, B
  sink-journal disposal, C candidate-hash binding, D selection-evidence + gap reverse
  containment — each with its own numbered sub-decisions matching the shipped mechanism
  exactly), Consequences, Non-goals (explicitly does not close the R1/R2 residuals, does not
  touch `--release-check`/#651, does not add test execution anywhere), Alternatives considered.

Validator run: `node scripts/validate-workflow-contracts.js` -> "Workflow contract validation
passed" (EXIT:0). Full regression check (not required by the node brief, but run to confirm the
doc-only diff introduced no drift): `node scripts/simulate-workflow-walkthrough.js` -> "Workflow
walkthrough simulation passed" (EXIT:0). Markdown fence-balance check (`grep -c '^```' <file>`,
even count) passed on all 5 touched/created files. `git status --porcelain` confirms README.md
carries zero diff (skip verified, not just claimed) and the 4 edited docs are the only modified
tracked files, plus the 1 new decision record.

No agent-facing prompt surface (agents/, commands/, plugins/*/skills, plugins/*/agents/*.toml)
was touched — out of my declared write set and untouched by construction; CHANGELOG.md was not
touched (explicitly the sink's, per node brief). No CI/CD mentions added anywhere.
