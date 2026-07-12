evidence-binding: n3-review fd1635959afd
verdict: pass
findings_blocking: 0
upstream_read: n1-repair-fold 7c50240a9817
upstream_read: n2-fence-parse 404302258587
finding: id=R1 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=repair-node CLI dispatch now passes readdir mirroring reopen-node; legacy receipt-purge branch live; new subprocess test exercises dispatch wiring and was RED-before by construction
finding: id=R2 scope=in_scope action=fix status=resolved severity=medium fix_role=tdd-guide rationale=4c purge dedupes per receipt NAME via removedNames set mirroring reopen-node 4b; two same-label different-origin groups both purged; new test discriminates against old label-only dedupe
finding: id=R3 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=fence-indent divergence (locateSection/unreleasedSection accept trim()-indented fences vs classifier 0-3-space rule) — pre-existing posture untouched by this diff
finding: id=R4 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=#437-lane EISDIR fail-open in task-mirror.js — 4 stderr traces from d437-lane fixture during test-adaptive-node; suite exits 0; task-mirror.js not in this diff (not introduced)
finding: id=R5 scope=in_scope action=document status=deferred severity=low fix_role=none rationale=cosmetic mislabel — the two new repair tests and two fix comments in adaptive-node.js are headed "#665 R1"/"#665 R2" though they cover the #664 repair-node fix; non-blocking, issue-refs-in-scripts permitted

# Code Review — n3-review RE-REVIEW (G1 gate, bundle-664-665, nonce 6e756c42dc85)

Prior review approved at CRITICAL/HIGH bar but flagged two in-scope MEDIUM findings on the #664 repair-node fix; a tdd-guide repaired both in-run. This re-review confirms the repairs.

## R1 — readdir dispatch wiring: RESOLVED
The repair-node CLI dispatch (adaptive-node.js ~:6961) now passes `readdir: (d) => { try { return fs.readdirSync(d); } catch (_) { return []; } }`, byte-identical to reopen-node's dispatch. runRepairNode destructures readdir (~:3680); the 4c legacy branch (typeof readdir === 'function') is now live in production. New "#665 R1" test drives the REAL CLI subcommand via execFileSync repair-node against a real git repo with legacy adversarial-verifier-{0,1,2}.md receipts; asserts all three deleted, unrelated.md + writer's barrier-base-impl retained, downstream barrier-base-av removed. RED-before confirmed by construction (a subprocess cannot inject readdir; no other path deletes adversarial-verifier-*.md names).

## R2 — per-NAME purge dedupe: RESOLVED
The label-keyed dedupe is gone; 4c (~:3841-3866) now uses a removedNames Set keyed on receipt filename via removeEvidenceName(name, knownPresent), structurally identical to reopen-node's 4b (~:3465-3490) incl. the single-legacy-group attribution guard. New "#665 R2" test builds two same-label fanout(red-team) groups at different origins (av-a{1,2} off impl; av-b{1,2} off av-a1,av-a2), all complete; asserts all four fold into gatesReset, all four receipts removed, review.md retained. Discriminating: resolveAdversarialFanoutGroup (plan-validator.js:664-672) keys by (label, origin), so these are two distinct groups; old label-only dedupe would skip the second (RED-before). Singleton retention + would_orphan_in_progress unchanged (step-3 folds only all-complete members).

## No-regression re-confirmation
#664 originals (mixed-shape collective fold; mid-vote refusal) pass in the green suite. #665 originals: locateSection run-length closer (f===fam && len>=fenceLen && /^\s*$/.test(suffix)) on both scan loops with state reset; T6c asserts parity with classifier.sectionBodyState + full subprocess open→splice→close→resume with no plan_hash_mismatch. unreleasedSection fence-aware termination; test-release both directions (fencedComplete exit0 refs[741]; fencedUnknown exit1 changelog_unknown_reference[999]).

Cross-edition parity (re-run post-repair): validate-script-sync.js OK (24 common, 27 byte-identical, 8 rename-normalized, 7 export-superset); edition-sync.js --check clean; adaptive-schema ×4 byte-identical (cmp); codex adaptive-node/release byte-identical to canonical; gitlab/gitea adaptive-node ports carry the new 4c + repair-dispatch with renamed requires (zero stale); fence-aware unreleasedSection mirrored in both forge release ports.

Suites (re-run post-repair): test-adaptive-node.js 1767 assertions exit 0 (1755 + 12 repair); test-release.js 242 exit 0; simulate-workflow-walkthrough.js exit 0.

R4 (#437 EISDIR): 4 stderr traces d437-lane workflow-tasks.json EISDIR, fail-open (suite exits 0, no FAIL); task-mirror.js not in git diff HEAD --name-only → not introduced. R5 cosmetic label nit.

## Summary
CRITICAL 0 / HIGH 0 / MEDIUM 0 (R1,R2 resolved in-run) / LOW 3 (R3,R4 pre-existing follow-ups; R5 cosmetic). Verdict: APPROVE — both MEDIUM repairs correct, complete, mirrored across all four editions, covered by discriminating tests; no regression. Gate G1 passes.
