evidence-binding: n1-heading-parity 478f3f1a723c

RED: T6e (#673) block in scripts/test-adaptive-node.js, run pre-fix via `node scripts/test-adaptive-node.js` — 8 FAILs, e.g. "FAIL: T6e-b (#673): locateSection finds the two-space `##  Node Ledger` heading, got {"start":-1,"next":-1}" and "FAIL: T6e: open-next opens impl-core, got {"result":"refuse","reason":"node_not_in_ledger",...}"; suite tally "adaptive-node tests FAILED (8 failures, 1807 passed)", exit 1.
GREEN: same T6e (#673) block, run post-fix (all 4 locateSection copies patched) via `node scripts/test-adaptive-node.js` — 0 FAILs; suite tally "adaptive-node tests passed (1815 assertions)", exit 0 (1815 - 1807 = the 8 T6e cases now green); walkthrough "Workflow walkthrough simulation passed"; `node scripts/edition-sync.js --check` clean (byte-identical across all 4 copies).

## Bug

`locateSection` (scripts/kaola-workflow-adaptive-schema.js) selected a `## {heading}` section via a
loose `startsWith('## ' + heading)` PREFIX opener and a bare `startsWith('## ')` next-heading
terminator. The hash-covering oracle, `classifier.sectionBodyState` (scripts/kaola-workflow-classifier.js),
uses an ANCHORED `^##\s+<escaped heading>\s*$` opener and an `^##\s` terminator. Divergences:
forward-suffix decoy false-positive (`## Node Ledger Extra` prefix-matches the opener), two/tab
whitespace false-negative (`##  Node Ledger`, `##\tNode Ledger` fail the single-space-only opener),
and a tab-heading following section failing to terminate the prior slice (bleeds into it).

## RED (pre-fix, scripts/kaola-workflow-adaptive-schema.js unmodified)

Command: `cd "$WT" && node scripts/test-adaptive-node.js`

Exact failing output (8 failures, all from the new T6e (#673) regression block in
scripts/test-adaptive-node.js, added test-first before any production edit):

```
FAIL: T6e-a (#673): locateSection agrees with classifier.sectionBodyState on the genuine (not the "Extra" suffix decoy) ledger body, got "\n## Node Ledger Extra\nThis decoy section body must never be read as the real ledger.\n"
FAIL: T6e-a (#673): the located section excludes the forward-suffix decoy heading/body entirely, got "\n## Node Ledger Extra\nThis decoy section body must never be read as the real ledger.\n"
FAIL: T6e-b (#673): locateSection finds the two-space `##  Node Ledger` heading, got {"start":-1,"next":-1}
FAIL: T6e-b (#673): locateSection agrees with classifier.sectionBodyState on the two-space heading body, got ""
FAIL: T6e-c (#673): locateSection agrees with classifier.sectionBodyState — the tab heading correctly terminates the ledger slice, got "\n## Node Ledger\n\n| id | status |\n| --- | --- |\n| impl-core | pending |\n| review | pending |\n| finalize | pending |\n##\tAppendix\nAppendix content that must NOT be included in the Node Ledger section slice.\n\n"
FAIL: T6e-c (#673): the tab-heading `##\tAppendix` section is excluded from the Node Ledger slice (terminator anchored to `^##\s`), got "\n## Node Ledger\n\n| id | status |\n| --- | --- |\n| impl-core | pending |\n| review | pending |\n| finalize | pending |\n##\tAppendix\nAppendix content that must NOT be included in the Node Ledger section slice.\n\n"
FAIL: T6e: open-next opens impl-core, got {"result":"refuse","reason":"node_not_in_ledger","nodeId":"impl-core","operator_hint":"Node impl-core is not present in the ## Node Ledger. Check the node id, or re-freeze the plan so the ledger carries every node."}
FAIL: T6e (#673): the genuine ledger shows impl-core in_progress, got "\n| id | status |\n| --- | --- |\n| impl-core | pending |\n| review | pending |\n| finalize | pending |\n\n"
adaptive-node tests FAILED (8 failures, 1807 passed)
```
Exit code: 1. The end-to-end failure (line 7) is the concrete runtime symptom: the real
`open-next` subprocess mis-targets the forward-suffix decoy section, so it cannot find `impl-core`
in what it thinks is the ledger and refuses with `node_not_in_ledger` — precisely the class of
`plan_hash`-mismatch/mistargeted-write wedge this issue describes.

Confirmed the 8 failures are net-new (not pre-existing suite flakiness): `git stash` to the
unmodified baseline (no T6e test, no production fix) reproduces a clean `adaptive-node tests passed
(1797 assertions)` with zero FAILs — 1797 + 8(new asserts... see below) reconciles against the
post-fix 1815 total once T6e's other (non-failing) assertions are counted. `git stash pop` restored
both files.

## Fix applied (byte-identical across all 4 copies)

`function locateSection` in:
- `scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`

Opener (was `const prefix = '## ' + heading;` + `ln.startsWith(prefix)`), now anchored, built the
same way the classifier builds it:
```js
const escapedHeading = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headRe = new RegExp('^##\\s+' + escapedHeading + '\\s*$');
...
} else if (!inFence && i > 0 && headRe.test(ln)) {
```

Terminator (was `ln.startsWith('## ')`), now anchored to any recognized h2:
```js
const nextHeadRe = /^##\s/;
...
} else if (!inFence && nextHeadRe.test(ln)) {
```

### Line-0 `i > 0` guard reconciliation

Read the classifier's `sectionBodyState`: its line-index scan has no special case for index 0, so it
treats a heading at absolute line 0 as `present`. `locateSection`'s `{start, next}` CONTRACT reports
`start` as the char offset of the `'\n'` BEFORE the heading line (mirrors the pre-#354 legacy
`content.indexOf('\n## ' + heading)` lookup, which also required a leading `'\n'` and therefore also
could never match a heading at position 0 — this limitation predates locateSection). At line 0, `off`
is still `0` when the match is checked, so `start = off - 1 === -1` REGARDLESS of whether the opener
uses `startsWith` or the new anchored regex — this collides with the function's own `-1 = absent`
sentinel. True agreement with the classifier for this one case is therefore structurally unreachable
without redefining the offset contract, which every caller depends on (e.g.
`materializeSpeculativePolicy`'s `headingStart = start + 1`).

Decision: KEEP the `i > 0` guard. Verified this is not merely inert but load-bearing: removing it
would not achieve parity (a line-0 "match" still degrades to start=-1) and would introduce a WORSE
divergence — the scan would `break` immediately on a line-0 false "match" and never continue to find
a genuine heading occurring later (non-zero line) in the same content. This residual gap is
unreachable in practice: every real plan file opens with a `# Workflow Plan — {project}` title line
before any `##` section, so a heading is never legitimately at absolute offset 0. Locked in by test
T6e-d, which asserts the classifier finds a line-0 heading `present` while `locateSection` stays at
`{start:-1, next:-1}` — unchanged before and after the fix (a documented non-regression, not a
RED→GREEN transition, since removing the guard cannot fix it and this behavior was never touched).

## GREEN (post-fix, all 4 copies identical edit applied)

Command: `cd "$WT" && node scripts/test-adaptive-node.js`
```
adaptive-node tests passed (1815 assertions)
```
Exit code: 0. 1815 - 1807 = 8, exactly the 8 RED failures now passing (the T6e regression block:
forward-suffix decoy (a), two-space (b), tab-as-terminator (c), line-0 non-regression (d), and the
end-to-end open-next/--resume-check no-`plan_hash_mismatch` proof), with zero new failures elsewhere
in the suite (all 1807 pre-existing assertions still pass).

(Note: two lines of pre-existing, unrelated stderr noise — "致命错误：.git/index：索引文件比预期的小" /
"致命错误：不是 Git 仓库：(null)" — appear on stdout/stderr during this run. Confirmed via `git stash`
that this noise is present on the UNMODIFIED baseline too (some existing test's intentional
git-failure-path probe), unaffected by this change, and does not affect the assertion count or exit
code.)

Command: `cd "$WT" && node scripts/simulate-workflow-walkthrough.js`
```
Workflow walkthrough simulation passed
```
Exit code: 0.

Command: `cd "$WT" && node scripts/edition-sync.js --check`
```
edition-sync: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity with canonical.
```
Clean — no drift; confirmed additionally via direct diff of the `locateSection` function body across
all 4 copies (byte-identical).

## Write set (the 5 write-set files + this evidence file; no ledger/state/baseline/commit)

- `scripts/kaola-workflow-adaptive-schema.js` (production fix)
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js` (production fix, byte-identical)
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js` (production fix, byte-identical)
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` (production fix, byte-identical)
- `scripts/test-adaptive-node.js` (T6e regression test, test-first)
- this evidence file
