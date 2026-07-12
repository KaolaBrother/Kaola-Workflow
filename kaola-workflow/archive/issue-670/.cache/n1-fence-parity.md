evidence-binding: n1-fence-parity 049bb874b6ca

## Bug (#670)

`locateSection` (`scripts/kaola-workflow-adaptive-schema.js` ~L1136-1171) applied its fence regex
to `ln.trim()`, so a 4+-space-indented backtick run (a CommonMark INDENTED CODE BLOCK, never a
fence) was misread as a fence closer/opener. The oracle classifier's `markdownFenceTransition`
(`scripts/kaola-workflow-classifier.js:286`) anchors `^\s{0,3}(...)$` on the RAW line — 4+ spaces
disqualifies a marker. Added sibling test **T6d** next to T6c (#665) in
`scripts/test-adaptive-node.js`, following its exact construction/harness pattern: a 0-indent
backtick opener, a 4-space-indented pseudo-closer, a fenced `## Node Ledger` DECOY, a genuine
0-indent closer, then the GENUINE (truly unfenced) `## Node Ledger`.

## RED (pre-fix, captured against current `ln.trim()` code before any production edit)

RED: `node scripts/test-adaptive-node.js` — T6d fails with 3 assertion failures before the fix:
```
FAIL: T6d: locateSection agrees with classifier.sectionBodyState on the genuine (not decoy) ledger body, got "\n## Node Ledger\n| id | status |\n| --- | --- |\n| impl-core | pending |\n```\n\n## Node Ledger\n\n| id | status |\n| --- | --- |\n| impl-core | pending |\n| review | pending |\n| finalize | pending |\n\n"
FAIL: T6d: after open, --resume-check still passes — no plan_hash_mismatch wedge from a mis-targeted splice, got {"ok":false,"result":"refuse","reasonCode":"plan_hash_mismatch","reason":"plan_hash mismatch — workflow-plan.md tampered after freeze","operator_hint":"plan_hash mismatch — workflow-plan.md was modified after freeze. Re-run --freeze to re-stamp."}
FAIL: T6d: the fenced ## Node Briefs decoy block is left byte-intact (still shows pending), got "...## Node Briefs\n\n### impl-core\nIllustrative fenced example (NOT the real ledger):\n```\nSome brief text with an indented pseudo-closer below (NOT a real fence marker —\n4-space indent makes it an indented code block per CommonMark):\n    ```\n## Node Ledger\n| id | status |\n| --- | --- |\n| impl-core | in_progress |\n```\n\n## Node Ledger\n\n| id | status |\n| --- | --- |\n| impl-core | in_progress |\n| review | pending |\n| finalize | pending |\n\n"
adaptive-node tests FAILED (3 failures, 1777 passed)
```
Confirms the predicted bug exactly: `locateSection` selects the DECOY as the section (its slice
runs on to include the genuine ledger too, disagreeing with the classifier ground truth); the real
`open-next` splice lands inside the hash-covered `## Node Briefs` body, so `--resume-check` refuses
with `plan_hash_mismatch`; and the fenced decoy block itself gets corrupted (its embedded
`impl-core` row flips from `pending` to `in_progress` instead of the genuine ledger's row).
(Note: this same run also surfaces an unrelated, pre-existing `EISDIR`/`kaola-workflow-task-mirror.js`
subprocess stack trace from a different `d437-lane-*` test — already filed as open issue #671, not
in this node's write-set, reproduces identically on both the RED and GREEN runs below, so it is not
caused by and does not gate this fix.)

## Fix applied (byte-identical across all 4 copies)

In `locateSection`, both fence-scan loops (opener-scan ~L1144 and next-heading-scan ~L1160):
- `const fenceRe = /^(\`{3,}|~{3,})(.*)$/;` → `const fenceRe = /^\s{0,3}(\`{3,}|~{3,})(.*)$/;`
- `const fm = ln.trim().match(fenceRe);` → `const fm = ln.match(fenceRe);` (both sites)

Applied identically to:
- `scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`

`classifier.js:286` (the read-only parity oracle) was NOT touched. The run-length/family/empty-
suffix closer logic (#665) and first-hit heading selection were NOT altered.

## GREEN (post-fix)

GREEN: `node scripts/test-adaptive-node.js` → `adaptive-node tests passed (1780 assertions)` — all
3 previously-failing T6d assertions now pass (locateSection agrees with the classifier ground
truth on the genuine ledger; `open-next` + `--resume-check` shows no `plan_hash_mismatch`; the
fenced decoy block stays byte-intact/`pending`), plus all 1777 pre-existing assertions still green
(1777 + 3 = 1780, matching the RED run's "1777 passed" baseline plus the 3 flipped assertions). The
same unrelated pre-existing `EISDIR`/task-mirror stack trace (#671) reproduces identically in this
GREEN run too, confirming it is orthogonal to this fix.

GREEN: `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed",
exit 0.

GREEN: `node scripts/edition-sync.js --check` → clean: "edition-sync: 10 forge aggregator ports, 24
COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical." — confirms all 4
`kaola-workflow-adaptive-schema.js` copies remain byte-identical after the hand-applied edit.
