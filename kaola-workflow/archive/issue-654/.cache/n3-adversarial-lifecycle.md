evidence-binding: n3-adversarial-lifecycle 7c5b01a6cc59
verdict: pass
findings_blocking: 0
upstream_read: n2-review 0ca198bd6efb

# Adversarial falsification — issue 654 gate-evidence lifecycle

## Claim under test

Issue 654's repaired adaptive lifecycle is correct on the canonical
`scripts/kaola-workflow-adaptive-node.js` surface: `repair-node` leaves a downstream gate's prior
blocking report readable while the writer is in progress; every subsequent genuine gate open gets a
fresh nonce and a whole-file fresh seed that discards the prior attempt's verdict/body; same-open
crash/resume preserves partial evidence byte-for-byte; malformed and cross-node line-1 bindings remain
fail-closed; and the behavior holds across repeated repairs rather than only the first recurrence.

## Strongest disproof attempts

### 1. Two repeated writer-repair cycles through the real CLI

I created and froze a hermetic temporary Git project with
`writer(tdd-guide) -> reviewer(code-reviewer) -> finalize`, then drove only the shipped
`kaola-workflow-plan-validator.js` and `kaola-workflow-adaptive-node.js` commands. Evidence bodies were
recorded with `record-evidence --stdin`; no cache header was manually edited. The path was:

1. Open and close the writer after a real declared-write-set edit.
2. Record a uniquely marked blocking reviewer attempt, invoke `repair-node`, and compare the retained
   reviewer report byte-for-byte while the writer is in progress.
3. Close the repaired writer, assert a distinct dispatch nonce/binding, and assert the old verdict,
   findings count, finding marker, and attempt body are absent from the reopened reviewer seed.
4. Repeat steps 2-3 a second time on the same writer and reviewer identities, then record a passing
   reviewer result and close the gate.

Result: PASS. Reviewer nonce sequence was `a792c9d0c3b6 -> 70b269178cff -> f19a02ec3b10`.
Both repairs retained the prior blocking report byte-for-byte and deleted only
`barrier-base-reviewer`; both subsequent opens discarded the immediately prior body; the final gate
closed with exit 0. This exercises the production retention path at
`scripts/kaola-workflow-adaptive-node.js:3742` and downstream-baseline deletion at
`scripts/kaola-workflow-adaptive-node.js:3748`.

### 2. Same candidate across two recurrences

I then strengthened the input by making one initial product edit but making no net product-file change
after either blocking review. The repaired writer supplied fresh RED/GREEN evidence only. This tries to
force downstream baseline/nonce reuse and expose a fix that merely masks the first recurrence.

Result: PASS. Across two repair cycles the reviewer nonce sequence was
`e695b23b9bda -> 7655529b9391 -> 2ad350f45794` (all unique). On each cycle the old report remained
readable during repair, the next binding matched the returned dispatch nonce, and the old failure/body
marker was absent. The final reviewer close exited 0. I could not produce nonce reuse even when the
product candidate remained unchanged after the initial write.

This is the strongest attempted counterexample because rotation is conditional on an exact
same-node/different-nonce binding at `scripts/kaola-workflow-adaptive-node.js:655`; the reproduction
shows the real fused open derives a fresh baseline nonce and passes it to the common seeder at
`scripts/kaola-workflow-adaptive-node.js:2927` on more than one recurrence.

### 3. Same-open crash/resume with a partial body

In a separate hermetic run I opened the writer, appended a partial `RED: crash-partial-only` body,
and invoked `open-next --node-id writer` again without closing it.

Result: PASS. The second open returned `baselineReused: true`, retained nonce `402bdea3afb2`, and left
the full evidence file byte-for-byte identical. This exercises the non-rotation branch at
`scripts/kaola-workflow-adaptive-node.js:667`.

### 4. Malformed and cross-node line-1 bindings

For separate temporary reviewer projects, I replaced the open reviewer's evidence with either
`not-an-evidence-binding` or `evidence-binding: other-node othernonce123`, each followed by an
otherwise passing verdict. A same-open retry reused the baseline and preserved each poisoned file
byte-for-byte.

Result: PASS (fail-closed). Closing the malformed case exited 1 with
`reason: evidence_shape_failed`, `missingTokenClass: evidence-binding`. Closing the cross-node case
exited 1 with `reason: evidence_unbound`. Neither same-open path laundered the line-1 binding.

### 5. Shipped focused regressions

- `node scripts/test-adaptive-node.js` — PASS, exit 0, `adaptive-node tests passed (1654 assertions)`.
- `node scripts/simulate-workflow-walkthrough.js --only testGateEvidenceNonceRotation654` — PASS,
  exit 0, `testGateEvidenceNonceRotation654: PASSED` and one-scenario subset passed.

The upstream review receipt and implementation receipt were read before testing. The focused shipped
walkthrough's single-repair assertions are at `scripts/simulate-workflow-walkthrough.js:14807` through
`scripts/simulate-workflow-walkthrough.js:14830`; the independent adversarial probes above extended
that path to two recurrences and to a no-net-product-change case.

## Counterexample search result

No concrete failing state or stale-evidence replay was found. Repeated normal repair/open cycles prove
the root invariant on the exercised serial fused-open lifecycle rather than merely masking the first
recurrence. Same-open partial evidence remains stable, while malformed/cross-node evidence stays
unusable and visible to typed close-time refusal.

## Verdict

Prose verdict: NOT-REFUTED.

Confidence: HIGH (0.97). The claim was exercised through real lifecycle commands in fresh temporary
Git repositories, including two consecutive repairs under the harder unchanged-product-candidate
condition, plus exact-byte resume and fail-closed binding probes. No repository or workflow product
file was modified by this node; only this seeded evidence receipt was written.
