evidence-binding: n6-mutation-spotcheck 285f0b82afae
RED: 5/5 mutated copies flipped a KEPT assert red (mutation -> red-assert matrix): (1) delegation-outcome-vocab-bypass (adaptive-node.js checkEvidenceShape) -> T611-AC5 keeper flips missingTokenClass from 'delegation_outcome' to 'RED' (ok stays false but for the wrong reason, so `ok===false && missingTokenClass==='delegation_outcome'` goes false); (2) derive-gate-mode-inverted (schema.js deriveGateMode) -> review-v2 gate_modes corpus mismatches on 2/3 rows ("forward-reachable change gate despite sink bypass": expected change_gate got investigation; "read-only investigation": expected investigation got change_gate); (3) derive-gate-effect-inverted (schema.js deriveGateEffect) -> review-v2 outcomes corpus mismatches on 3/8 rows (all adversarial-verifier/change_gate rows invert pass/fail); (4) reduce-review-receipts-partitioned-refuted-swallowed (schema.js reduceReviewReceipts) -> review-v2 reducers corpus mismatches on the partitioned_all adversarial row (domain_outcome expected 'refuted' got 'not_refuted'); (5) bundle-issue-numbers-order-corrupted (kaola-workflow-claim.js state-file write) -> the REAL test-bundle-claim.js subprocess goes from "all 79 tests passed" (exit 0) to "1 test(s) FAILED, 78 passed" (exit 1) on the `/^issue_numbers:\s*42,47,53\s*$/m` state regex. Each case's probe was ALSO run against an unmutated baseline copy first and confirmed GREEN before the mutation was applied (baseline-green + mutated-red per case, not a vacuous always-red probe) -- see per-case detail lines in the captured run below.
GREEN: node scripts/test-mega-mutation-spotcheck.js -> SPOTCHECK_EXIT=0, "test-mega-mutation-spotcheck: all 5/5 mutations caught by the pruned suite" (20.1s total: 6.37s user, 3.11s system)
upstream_read: n3-falsify-overlap-prune 2461bc5cfa1a
upstream_read: n5-falsify-bundle-consolidate 7be9cef9d217

## The 5 reintroduced bug shapes

| # | Source mutated | Pruned test that caught it | Closed-issue provenance |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-adaptive-node.js` — neutered the `DELEGATION_OUTCOME_VOCABULARY.includes` closed-vocab check inside `checkEvidenceShape` (`if (dm && !...)` -> `if (false && dm && !...)`) | `scripts/test-adaptive-node.js` T611-AC5 block (~:14962-14964): `checkEvidenceShape('tdd-guide','n1','delegation_outcome: exploded\nRED\nGREEN')` must return `ok:false, missingTokenClass:'delegation_outcome'` | Issue #611 (join-protocol AC5 — typed delegation outcomes: an unknown `delegation_outcome:` token must be a typed refusal, checked before every role branch) |
| 2 | `scripts/kaola-workflow-adaptive-schema.js` — inverted `deriveGateMode`'s final ternary (`? 'change_gate' : 'investigation'` -> `? 'investigation' : 'change_gate'`) | `scripts/test-adaptive-node.js` review-v2 `gate_modes` corpus loop (~:17837-17841), data-driven off `reviewer-conformance-fixtures.json` | Issues #693/#696/#697/#698 (schema-2 candidate-bound review engine — commit bee90116 introduced `deriveGateMode`) |
| 3 | `scripts/kaola-workflow-adaptive-schema.js` — inverted `deriveGateEffect`'s adversarial-verifier change_gate pass/fail ternary | `scripts/test-adaptive-node.js` review-v2 `outcomes` corpus loop (~:17857-17862), data-driven off the same fixture | Issues #693/#696/#697/#698 (schema-2 candidate-bound review engine) |
| 4 | `scripts/kaola-workflow-adaptive-schema.js` — `reduceReviewReceipts`'s `partitioned_all` branch: a refuted member now derives `'not_refuted'` instead of `'refuted'` (a refuted-member-silently-swallowed defect, the same class as the historical gate-`verdict`-finding-line gotcha) | `scripts/test-adaptive-node.js` review-v2 `reducers` corpus loop (~:18059-18064), data-driven off the same fixture | Issues #693/#696/#697/#698 (schema-2 candidate-bound review engine — commit bee90116 introduced `reduceReviewReceipts`) |
| 5 | `scripts/kaola-workflow-claim.js` — bundle state-file write reverses `data.issue_numbers` before joining (`.join(',')` -> `.slice().reverse().join(',')`) | `scripts/test-bundle-claim.js` bundle-startup state assertions (~:269-273): the `/^issue_numbers:\s*42,47,53\s*$/m` regex and the `out.issue_numbers[0]===42` result-field assert | Issue #328 (multi-target bundle claim path, AC#2/AC#3/AC#7) |

## Harness design + self-verification (non-vacuous RED)

- Each mutation is applied to a FRESH `fs.mkdtempSync` copy of the whole `scripts/` dir (never the working tree) via an exact, uniqueness-checked substring replace (`applyMutation` throws `mutation anchor not found`/`not unique` on drift instead of silently mutating nothing).
- Cases 1-4 probe the mutated PURE functions in-process (`require()`d by absolute tmp path so the relative `require('./kaola-workflow-adaptive-schema')` inside the mutated module resolves to the tmp copy), replaying the exact fixture-driven assertion lifted from the cited `test-adaptive-node.js` line range against `reviewer-conformance-fixtures.json` (also copied into the tmp dir). Case 5 spawns the REAL `test-bundle-claim.js` as a subprocess from the tmp copy (its own `__dirname`-derived `claimScript` path resolves to the mutated sibling `kaola-workflow-claim.js`).
- Every case runs its probe against an UNMUTATED baseline copy FIRST and requires it to pass before applying the mutation — a case whose baseline probe fails is reported as a harness bug (`BASELINE probe ... broken`), never miscounted as a caught mutation. All 5 baselines passed in this run (see the captured RED line above / stdout below).
- Demonstrated the RED assertion is real, not vacuous: temporarily forced case 1's mutation to a NO-OP (`replace` identical to `find`, i.e. no actual code change) in a throwaway copy of the harness (never the committed file — reverted via `diff` confirming byte-identity to the original after the check) and re-ran it standalone. Result: `ESCAPED delegation-outcome-vocab-bypass — MUTATION ESCAPED — the pruned suite did NOT go red`, exit 1. This proves a mutation that changes nothing is correctly flagged as an escape, so the 5/5 CAUGHT result in the real run is a genuine catch, not a harness that always reports green.
- Self-cleans: every `cleanRoot`/`mutRoot` tmp dir is removed in a `finally` block (verified no `kw-mutspot-*` dirs survive after the run — `os.tmpdir()` left clean). No network calls. Deterministic (fixed fixture inputs, no timing/ordering dependence).
- NOT wired into `package.json` / the default claude chain — confirmed via `grep -n "test-mega-mutation-spotcheck" package.json` returning no matches; it is a persistent, committed, on-demand gate artifact invoked via the recorded `validation_command`.

## Captured run (verbatim stdout, `node scripts/test-mega-mutation-spotcheck.js`)

```
test-mega-mutation-spotcheck: reintroducing 5 documented bug shapes into isolated $TMPDIR copies...

CAUGHT   delegation-outcome-vocab-bypass
    baseline GREEN (unknown delegation_outcome -> {"ok":false,"missingTokenClass":"delegation_outcome"}); mutated RED (unknown delegation_outcome -> {"ok":false,"missingTokenClass":"RED"})
    kept by: scripts/test-adaptive-node.js T611-AC5 (~:14962-14964)
    provenance: closed-vocab typed delegation_outcome refusal, issue #611 (join-protocol AC5)
CAUGHT   derive-gate-mode-inverted
    baseline GREEN (3/3 gate_modes rows match); mutated RED (forward-reachable change gate despite sink bypass: expected change_gate, got investigation; read-only investigation: expected investigation, got change_gate)
    kept by: scripts/test-adaptive-node.js review-v2 gate_modes corpus (~:17837-17841)
    provenance: schema-2 candidate-bound review engine gate classifier, issues #693/#696/#697/#698
CAUGHT   derive-gate-effect-inverted
    baseline GREEN (8/8 outcomes rows match); mutated RED (adversarial-verifier/change_gate/not_refuted: expected pass, got fail; adversarial-verifier/change_gate/refuted: expected fail, got pass; adversarial-verifier/change_gate/indeterminate: expected fail, got pass)
    kept by: scripts/test-adaptive-node.js review-v2 outcomes corpus (~:17857-17862)
    provenance: schema-2 candidate-bound review engine three-axis gate effect, issues #693/#696/#697/#698
CAUGHT   reduce-review-receipts-partitioned-refuted-swallowed
    baseline GREEN (4/4 reducers rows match); mutated RED (partitioned all adversarial investigation: expected {"complete":true,"gate_effect":"none","domain_outcome":"refuted"}, got {"complete":true,"gate_effect":"none","domain_outcome":"not_refuted"})
    kept by: scripts/test-adaptive-node.js review-v2 reducers corpus (~:18059-18064)
    provenance: schema-2 candidate-bound review engine receipt reducer, issues #693/#696/#697/#698 (a gate-verdict-finding-line-class defect: a refuted partitioned_all member silently swallowed into not_refuted)
CAUGHT   bundle-issue-numbers-order-corrupted
    baseline GREEN (exit=0, test-bundle-claim: all 79 tests passed); mutated RED (exit=1, test-bundle-claim: 1 test(s) FAILED, 78 passed)
    kept by: scripts/test-bundle-claim.js bundle startup state-file assertions (~:269-273)
    provenance: bundle-claim multi-target entrypoint state write, issue #328

test-mega-mutation-spotcheck: all 5/5 mutations caught by the pruned suite
```

## Why not the full `test-adaptive-node.js` per mutation

An independent timed run of the unmutated `node scripts/test-adaptive-node.js` (2488 assertions) took 6:57 total (125s user + 74s system, heavy `execFileSync`/git-init subprocess machinery in its "real subprocess" blocks). Running that 3-4x per mutation would take 20-30+ minutes, violating the "reasonably fast... not the whole 4-chain suite per mutation" design constraint. Cases 1-4 instead replay the SAME data-driven fixture (`reviewer-conformance-fixtures.json`) and the SAME exact assertion shape the cited `test-adaptive-node.js` lines use, directly against the mutated pure function — genuinely exercising the mutated code (verified: baseline green, mutated red, no-op correctly escapes) without the subprocess/git overhead. Case 5 (`test-bundle-claim.js`, 759 lines, no git-init machinery) IS fast enough (~18s) to run for real, so it runs the genuine file unmodified.
