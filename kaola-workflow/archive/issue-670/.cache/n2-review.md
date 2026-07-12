evidence-binding: n2-review 5879d4cbe7a2
verdict: pass
findings_blocking: 0

## n2-review (G1 gate) — code review of n1-fence-parity (#670)

Diff reviewed: 5 files — 4x kaola-workflow-adaptive-schema.js (canonical + plugins/kaola-workflow + gitlab + gitea) at 6 lines each, plus scripts/test-adaptive-node.js (+114 lines, 1 hunk, 0 removals, T6d only). No blocking findings. APPROVE.

### (a) Fence regex parity + raw-line application — PASS
Grep across all 4 schema copies shows identical lines 1139/1144/1160:
  1139: const fenceRe = /^\s{0,3}(BACKTICKx3+|~{3,})(.*)$/;  [literal: ^\s{0,3} anchor, same alternation]
  1144: const fm = ln.match(fenceRe);
  1160: const fm = ln.match(fenceRe);
classifier.js:286 oracle: String(line || '').match(/^\s{0,3}(...)(.*)$/) — regex body byte-identical, both applied to the RAW line. Zero lingering `.trim().match(fenceRe)` in any copy (grep for "trim().match" over all 4 files returned nothing).

### (b) Four copies byte-identical — PASS
- git diff blob hashes identical across all 4 copies: cdfbb136 -> 89b51121 (same pre-image, same post-image).
- node scripts/edition-sync.js --check -> exit 0: "edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical."
- Direct diff of canonical vs gitlab, gitea, and claude-plugin copies: all three IDENTICAL (empty diff).

### (c) classifier.js untouched — PASS
git diff --name-only lists exactly 5 files; scripts/kaola-workflow-classifier.js absent. The oracle at classifier.js:285-294 read in place, unmodified.

### (d) Surgical — closer semantics + first-hit selection unchanged — PASS
Diff hunks contain ONLY the fenceRe line and the two trim->raw sites per copy. The closer condition `f === fam && len >= fenceLen && /^\s*$/.test(fm[2])` (schema:1148/1164) appears only as unchanged context and remains byte-parallel to classifier:290 (`run[0] === state.family && run.length >= state.length && /^\s*$/.test(marker[2])`). Note: with the raw-line match, fm[2] can now carry trailing whitespace, but the closer check already tolerates whitespace-only suffixes — identical to the classifier, so no semantic drift. \s{0,3} sits OUTSIDE group 1, so fm[1] stays the pure marker run (run-length check unaffected). First-hit heading selection (schema:1149-1150, #665 comment block) untouched.

### (e) T6d genuinely distinguishes old vs new — PASS
Read T6d in full (test-adaptive-node.js:603-715). Fixture: 0-indent opener, 4-space pseudo-closer, fenced DECOY `## Node Ledger` (impl-core pending), genuine 0-indent closer, then the GENUINE unfenced ledger. Assertions target the classifier ground truth, not "any ledger": line 655 requires locateSection's slice to EQUAL classifier.sectionBodyState body; line 659 requires decoy exclusion; lines 690-703 drive a real freeze (computePlanHash) -> control --resume-check ok -> open-next opens impl-core -> post-open --resume-check ok (no plan_hash_mismatch); lines 706-712 require the GENUINE ledger to show in_progress AND the fenced decoy block to remain byte-intact (still `| impl-core | pending |` inside the fence). A masked/no-op fix fails 655 (slice mismatch), 703 (hash wedge), and 712 (decoy corrupted) — exactly the 3 RED failures n1 captured.
INDEPENDENT RED/GREEN REPRODUCTION (scratchpad copy of the schema with the pre-fix trim code restored, zero repo files touched): on the T6d fixture, OLD(trim) locateSection returns start=606 (the DECOY heading) and DISAGREES with classifier ground truth; NEW(raw) returns start=680 (the genuine ledger) and AGREES. Confirms the test discriminates old-vs-new on the shipped code, independent of n1's own RED capture.

### (f) Suites green; four-chain obligation stands — PASS (advisory noted)
- node scripts/test-adaptive-node.js -> exit 0, "adaptive-node tests passed (1780 assertions)" (matches n1's 1777 baseline + 3 flipped T6d assertions).
- node scripts/simulate-workflow-walkthrough.js -> exit 0, "Workflow walkthrough simulation passed".
- Cross-edition: the diff touches plugins/kaola-workflow-{gitlab,gitea}/ trees -> the four-chain obligation (npm run test:kaola-workflow:{claude,codex,gitlab,gitea}, serial) binds at FINALIZE per Validation Policy; not run here by design (gate scope). Recorded as a non-blocking handoff note below.
- Pre-existing EISDIR/task-mirror stderr noise (#671) observed identically in the suite run; orthogonal, already filed, not a finding.

finding: id=R1 scope=in_scope action=document status=resolved severity=low fix_role=none rationale=four-chain run-chains receipt owed at finalize (edition trees touched); documented per Validation Policy, not a code defect

Verdict: APPROVE — no CRITICAL/HIGH/MEDIUM findings. The fix is minimal (3 logical lines x 4 byte-identical copies), restores exact parity with the hash-covering classifier oracle, is regression-locked by a discriminating end-to-end test, and both required suites are green.
