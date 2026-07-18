evidence-binding: n4-falsify-lifecycle-fixes a1f81fd47c13
plan_schema_version: 2
contract_version: 2
behavior_contract_version: 2
review_context_hash: c1124216a7969b4745571afbf305d4f28e14af52418b6870728ce6e593eb273d
behavior_contract_hash: 0ad9331a05da66b2b18f4eb67facd1b686bd9dd3e8b5398399d4738cafed6e9b
resolved_profile_hash: 14c89a924b21c9291cf8a00759202b8846a5dac4e891bb8a3e625e85efc7b2ce
candidate_digest: 4e9024c3b25112141780f7eb5b11f5487004eea99a470a729a2603194d9868a8
gate_mode: change_gate
upstream_read: n3-code-review aa00ad32a72e

## Falsification record (claim presumed false; every counterexample attempted)

Context: candidate = worktree diff vs HEAD fe994d69 (11 files). validation_obligations: [] — none inherited, no receipt owed. Fixtures under $TMPDIR against real scripts; no repository writes.

### Class 1 — the serial pass-then-fail matrix still wedges somewhere
- C1.1 3-gate serial, LAST gate fails (two folded passes): both folded gates reopen via synthesized delta, C re-closes on ordinary fail boundary, finalize; 6 durable attempts, journal V2 validates, --resume-check ok, no replan-source.json, one compliance row per same-role gate. 19/19 — no wedge.
- C1.2 FIRST gate fails (regression probe): ordinary fail-boundary reopen byte-intact; discovery opens carry no repair_delta. 11/11.
- C1.3 DOUBLE repair (marker re-point/stacking attack): ordinal-2 marker OVERWRITTEN to B2, ordinal-1 stays on B1; gateA ordinal-3 delta binds the latest fold; two-generation journal validates. 14/14.
- C1.4 crash-window retry at four durable seams (repair_selected_written / repair_plan_written / repair_artifacts_removed / repair_settled_written): marker not durable before settle AND reviewJournalBlocker fences all openers (review_attempt_unresolved naming repair-node recovery); retry recomputes idempotently; at settle the marker is durable in the same write. 28/28 — wedge not crash-reachable.
- C1.5 mid-gate in_progress fold: direct repair refuses scheduler_active with recovery hint; after drain the completed pass folds WITH marker; both reopen correctly. 22/22. (Mid-gate fold of a settled-pass gate is unreachable through a legal plan — G1/G4; static read confirms.)
- C1.6 adversarial fan-out group fold: shared group attempt carries the marker; both members reopen with synthesized deltas; group re-certifies with fold-boundary progress. 22/22.
- C1.7 re-run repair on consumed attempt: idempotent ok, baselineReused true, journal byte-identical. 4/4.

### Class 2 — folded-pass reopen certifies a stale tree
- C2.1 replay old nonce -> evidence_generation_stale. C2.2 new nonce + old context/candidate -> close refuses review_candidate_mismatch; live re-certification then closes PASS over the repaired tree. 8/8 — certification barrier holds.

### Class 3 — fold marker tamper/laundering
Flipped candidate_digest, mutated candidate_declared, nonexistent repair_attempt_id, self-reference, mismatched selected_writer, 5th key, marker on FAIL attempt — all refuse review_journal_fold_marker_invalid; canonical key-order control accepted. deriveRepairDelta refuses tampered markers via sealed-partition cross-check. 10/10 fail-closed. Progress probes: validation FAIL/missing -> nonprogress; no-flag equal frontier -> strict nonprogress; out-of-delta uid -> scope-expanded; shrink bound to different repair -> no progress. 7/7 — no laundering vector.

### Class 4 — still-reachable wedge without documented recovery
- C4.1 marker-less sealed pass (pre-fix journal): refuses review_repair_delta_unavailable WITH detail byte-identical to the plan-run card §7 quote, naming release-and-adopt (release subcommand verified present) or replan prepare from repair_requires_replan. 7/7 — the only remaining wedge names its recovery. RED: HEAD's deriveRepairDelta returns the bare refusal with NO detail.

### Class 5 — compliance emission battery (#714)
Legacy no-section append x3 roles; pre-seeded advance + byte-identical re-close; heading adjacency; triple trailing blanks; full-CRLF; CRLF/LF EOF-no-trailing-newline; trailing-space row; longer-heading decoy; fenced decoy; empty table; two same-role fan-out members (two distinct canonical rows); duplicate suppression; issue-verbatim drifted table STILL rejected (validator not relaxed); legacy bare PENDING row advances in place. 33/33 — every emission path validates. RED: HEAD's splice emits exactly the issue's drift. Informational: validator TOLERATES interior blanks (bare cell was the trip); in-section fence pre-existing.

### Regression surface
test-adaptive-node.js 2479/2479; simulate-workflow-walkthrough.js passed; test-replan.js 832/832; edition-sync --check 12/25/28 parity; validate-script-sync OK; four adaptive-schema copies sha256-identical; all three adaptive-node ports carry both fix hunks. No previously-passing repair/reopen/fan-out-fold path regressed.

### Verdict rationale
Strongest constructions across the full directed matrix attempted; every sequence drives to finalize with the claim intact; every wedge-reachable state refuses with a documented recovery; every emission validates; RED-first reproduced for both issues. No counterexample survives; residual uncertainty (additive-edition ports byte-sync verified, not re-executed) does not rise to indeterminate.

domain_outcome: not_refuted
claim_outcome: not_refuted
gate_claim: a serial pass-then-later-fail repair now drives to finalize without releasing the claim, folded-pass gates reopen through a sanctioned delta path, any still-reachable wedge refusal names a documented recovery, and every compliance emission path (pre-seeded advance, legacy append, review-role re-close) yields a validator-conforming table — with no previously-passing repair, reopen, or fan-out-fold path regressed
gate_surface: the schema-2 repair/fold/reopen matrix (serial multi-gate pass-then-fail, mid-gate repair, adversarial fan-out group fold, crash-window retry) and the compliance emission matrix (legacy no-section append, pre-seeded in-place advance, review-role cells, heading adjacency) across all four edition copies
gate_aggregation: sequence
verdict: pass
findings_blocking: 0
