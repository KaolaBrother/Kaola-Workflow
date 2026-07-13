# Workflow Plan — issue-673

<!-- plan_hash: d6d8fb944a5e9f5ea11c3366d3b4dd2f4a949ed45ae306e811813ec0c464cfb8 -->

## Meta
speculative_open_policy: auto
labels: bug, area:scripts
validation_command: npm test

Fix the HEADING-MATCH parity bug in `schema.locateSection` (#673, post-#670 residual — the
heading-selection sibling of the #670 fence-indent fix, same `locateSection` ↔ classifier family,
different channel). The hash-covering classifier `sectionBodyState` selects a section heading with an
ANCHORED regex `^##\s+<heading>\s*$` (exact heading, `\s+` after `##`, trailing-whitespace-only tail)
and detects the next heading with `^##\s`, but `schema.locateSection` uses LOOSE prefix matches:
`ln.startsWith('## ' + heading)` for the opener (guarded by `i > 0`) and `ln.startsWith('## ')` for
the closer. They disagree, so a runtime section reader can select a heading the hash-covering
classifier does NOT — the same `plan_hash` mismatch / resume-barrier WEDGE class #670 closed for
fences, now via the heading channel. Make `locateSection`'s heading match byte-parity with the
classifier's anchored regex, applied BYTE-IDENTICALLY across the 4 adaptive-schema copies, and add a
decoy regression proving `locateSection` ↔ `classifier.sectionBodyState` heading-selection parity
across the suffix / multi-space / tab / line-0 cases. Do NOT touch the classifier (read-only oracle).

A small, surgical, well-understood near-copy of an already-shipped sibling fix (#670) — not
decomposable into parallel legs (one coherent byte-identical edit across 4 copies + one regression
test in the sibling heading-test home). A serial spine is correct: fix (tdd-guide, genuine RED —
the forward-suffix decoy currently mis-selects) → code-review (G1) → adversarial change-gate →
terminal finalize sink. This is a cross-edition byte-anchor diff, so all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains (the recorded
`validation_command: npm test`) must be green, run SERIALLY, before finalization.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-heading-parity | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-adaptive-node.js | 5 | sequence | standard | — |
| n2-review | code-reviewer | n1-heading-parity | — | 1 | sequence | reasoning | — |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning | — |
| n4-finalize | finalize | n3-adversary | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Session directive (/goal), recorded for dispatch:** the reasoning-tier reviewer-class nodes
  (`n2-review`, `n3-adversary`) are DISPATCHED on the **opus** model this campaign — the operator's
  fable budget is exhausted and the operator chose **opus** as the substitute. The `model` column
  above stays in-grammar (`reasoning`); the executor applies the **opus** override at dispatch time.
- **Byte-identity group — `kaola-workflow-adaptive-schema.js` ×4 must move atomically.** This file is
  a COMMON byte-anchor (all four copies share the basename `kaola-workflow-adaptive-schema.js`; the
  gitlab/gitea copies are NOT forge-renamed), NOT a `sync:editions` GENERATED aggregator — so
  `npm run sync:editions` does not regenerate it. The identical bytes must be HAND-APPLIED to all four
  copies (`scripts/`, `plugins/kaola-workflow/scripts/`, `plugins/kaola-workflow-gitlab/scripts/`,
  `plugins/kaola-workflow-gitea/scripts/`); then `node scripts/edition-sync.js --check` (in the
  gitlab/gitea chains) must be clean. All four are declared in n1's single write set (verified
  byte-identical at freeze; NOT `generated_port_split` — the base is absent from
  `GENERATED_AGGREGATORS`, and no forge-renamed port exists). Verified at authoring: the 4 copies are
  byte-identical at the run base (md5 `7377ec37...`).
- **`classifier.sectionBodyState` / its `headRe` is the READ-ONLY parity ORACLE, NOT a write site.**
  The classifier selects the opening heading with `headRe = /^##\s+<escaped-heading>\s*$/` (line ~299)
  and detects the next heading with `/^##\s/` (line ~311). The fix makes `locateSection`'s opener +
  closer byte-parity with these; do NOT edit the classifier. Parity becomes structural by construction
  once both use the identical anchored heading logic.
- **The regression home is a single file (claude chain only).** `scripts/test-adaptive-node.js` (the
  T6/T6c `locateSection` home) is NOT mirrored to the plugin trees and runs ONLY in the claude chain.
  The schema byte-identity is enforced by `edition-sync.js --check` (gitlab/gitea chains) and
  `validate-script-sync.js` (all four chains). No registration-surface change (no agent-set delta, no
  new file); n1's write set is exactly the 4 byte-anchor copies + the one regression file.
- **Serial spine is deliberate, and it EXPOSES speculation.** G1 forces `code-reviewer` (n2) onto
  every path from the code-producing node to the sink (post-dominance); an antichain review‖adversary
  both feeding finalize would give the adversary a sink-path that bypasses review, so serial is
  required, not a choice. Ordering the adversary AFTER the review makes `n3-adversary`
  speculative-open-eligible under `speculative_open_policy: auto`: its sole unsatisfied dependency is
  the high-probability-pass n2 gate over a small mechanical diff, and it is read-only — so the executor
  MAY open it speculatively during the review and overlap it for free (read-node evidence is
  keep-or-discard on a fail). NEVER hand-add `parallel_safe`/`speculative` (validator-derived).
- **Adversary IS warranted.** #673 exists precisely because the #670 adversarial-verifier (finding R1)
  constructed a surviving heading decoy the #670 fence-anchor AC deferred out of scope. Heading/fence
  parity is the textbook decoy-construction class and the failure mode is a `plan_hash` WEDGE (a loud
  resume/barrier stop, not a silent fail-open) — axiom 1 (correct first) tips the near-copy tradeoff
  toward keeping the skeptic. The adversary tries to BREAK the fix with a NEW surviving heading decoy;
  the reviewer verifies the diff — complementary, not duplicative.
- **Cross-edition four-chain obligation.** This is a cross-edition byte-anchor diff → Finalization
  requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run
  SERIALLY (a green claude chain alone is insufficient — `npm test` short-circuits on the first `&&`
  failure). Cite the receipt per node; the finalize sink runs and records it.
- **No decision record.** A straightforward parity bug fix (near-copy of shipped #670), not a
  value/standing/irreversible call — provenance belongs in `CHANGELOG.md` + the commit message, not a
  `D-673-NN` record. (Verified: no existing D-673 records.)
- **Evidence discipline:** every node's evidence lands at
  `kaola-workflow/issue-673/.cache/<node-id>.md` (absolute path at dispatch; never a bare
  `.cache/<id>.md` at the worktree root).

## Node Briefs

### n1-heading-parity

Test-first (genuine RED-then-GREEN — this is why `tdd-guide`, not `implementer`). Read the sibling
tests in `scripts/test-adaptive-node.js` first (T6 at ~L417, T6c at ~L487 — the #665/#670 decoy
end-to-end tests) and follow their construction pattern; read `locateSection`
(`scripts/kaola-workflow-adaptive-schema.js` ~L1136-1171) and the classifier oracle
`sectionBodyState` (`scripts/kaola-workflow-classifier.js` ~L296-320, especially `headRe` at ~L299 and
the `/^##\s/` next-heading close at ~L311) so the new heading logic is byte-identical to the
classifier's.

RED FIRST — add a new sibling test (e.g. T6d) next to T6c asserting `locateSection` ↔
`classifier.sectionBodyState` HEADING-SELECTION parity across these cases (each RED against current
code, GREEN after):
- **Forward suffix (the clearest genuine RED):** a plan containing `## Node Ledger Extra` BEFORE the
  genuine `## Node Ledger`. Current `ln.startsWith('## ' + heading)` selects the decoy
  `## Node Ledger Extra`; the classifier's anchored `^##\s+Node Ledger\s*$` selects the genuine one.
  Assert `locateSection(plan, 'Node Ledger')` slice EQUALS the `classifier.sectionBodyState(plan,
  'Node Ledger')` genuine body (not the decoy).
- **Reverse multi-space:** a genuine heading written `##  Node Ledger` (two spaces). The classifier's
  `\s+` matches it; `locateSection`'s single-space `'## ' + heading` prefix misses it → currently
  returns not-found while the classifier finds it present. Assert parity (both select it).
- **Reverse tab:** `##\tNode Ledger` (tab after `##`). Same divergence as multi-space; assert parity.
- **Line-0 heading (reconcile the `i > 0` guard):** the classifier has no line-0 exclusion;
  `locateSection` guards the opener scan with `i > 0`. Reconcile so heading SELECTION matches the
  classifier. NOTE the offset-pair contract subtlety: `start = off - 1`, so a heading at byte 0 yields
  `start = -1`, colliding with the "absent" sentinel (`start < 0`) that every caller reads as
  not-found (`spliceComplianceSection`: `if (sec.start >= 0)`). Choose the cleanest reconciliation that
  keeps SELECTION parity without a caller ripple — and if the offset-pair contract genuinely cannot
  represent a section starting at byte 0, make that an EXPLICIT, tested, documented boundary (realistic
  workflow-plan.md always opens with `# Workflow Plan`, never a line-0 `##`), not a silent divergence.
  State your decision in the test and the code comment so the adversary can probe it.

Also drive the real subprocess open → splice → `--resume-check` end-to-end (mirror T6c's harness) on
at least the forward-suffix decoy to prove there is NO `plan_hash_mismatch` wedge from a mis-targeted
splice.

GREEN — the fix, applied BYTE-IDENTICALLY to all 4 adaptive-schema copies:
- **Opener (~L1149):** replace `i > 0 && ln.startsWith(prefix)` with an anchored regex mirroring the
  classifier — build `const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');` and a
  `^##\s+<escaped>\s*$` test — and reconcile the `i > 0` line-0 guard per your tested decision above.
- **Closer (~L1165):** replace `ln.startsWith('## ')` with `/^##\s/.test(ln)` to mirror the
  classifier's next-heading detection (line ~311), so body slices agree across the whitespace variants
  (a `##\tNext` heading closes the section identically in both).
- Do NOT touch `classifier.js` (read-only parity oracle). Do NOT alter the fence-tracking /
  run-length / empty-suffix closer logic (already #665/#670-correct — this fix is only the heading
  match). Keep the first-hit selection among genuine unfenced candidates.

Verify locally: `node scripts/test-adaptive-node.js` (RED before, GREEN after) and
`node scripts/simulate-workflow-walkthrough.js`. Keep the 4 copies byte-identical (confirm with
`node scripts/edition-sync.js --check`). Flag anything that would widen this write set so the plan can
be repaired BEFORE an overflow.

### n2-review

Code review of n1's diff (G1 gate). Focus: (a) the opener heading match in `locateSection` is now
byte-parity with the classifier's `^##\s+<heading>\s*$` (exact heading, `\s+` after `##`,
trailing-whitespace-only tail; the `escaped` build matches the classifier's) and the closer is now
`/^##\s/` matching the classifier's next-heading detection; (b) the `i > 0` line-0 guard reconciliation
is deliberate, tested, and documented (no silent divergence and no broken offset contract / caller
ripple); (c) the 4 adaptive-schema copies are ACTUALLY byte-identical (not just similar) — the
byte-anchor contract; (d) `classifier.js` is untouched; (e) the fence-tracking / run-length / empty-
suffix closer semantics and first-hit selection are unchanged (surgical — only the heading match
moved); (f) the regression genuinely distinguishes old-vs-new (RED against the current prefix code,
GREEN after) and asserts `locateSection` ↔ `classifier.sectionBodyState` parity across
suffix/multi-space/tab/line-0 plus a clean end-to-end `--resume-check`; (g) no forge-neutral prose
concern (no plugin agent/command/skill prose touched — schema is a byte-anchor code file, not routing
prose). Note the six-surface / four-chain implications here are limited to the schema byte-anchor + the
claude-chain regression.

### n3-adversary

Adversarial verification (read-only; Bash allowed — construct and RUN decoys, write nothing). Try to
REFUTE "`locateSection`'s heading match now agrees with the classifier on every heading-decoy
construction." Build NEW surviving-decoy candidates the four listed cases might not cover and check
`locateSection` vs `classifier.sectionBodyState` on each: e.g. a heading with a TRAILING TAB or mixed
trailing whitespace (`## Node Ledger \t`) — does the classifier's `\s*$` and the fix agree?; a
suffix decoy separated only by a tab (`## Node Ledger\tExtra`); a `## Node Ledger` decoy nested inside
a fence interacting with the (unchanged) fence tracker AND the new anchor together; the multi-space /
tab closer boundary (does a `##\tNext` heading now close the section identically in both, so body
slices match?); the line-0 reconciliation (can any wedge path exploit a section the classifier selects
but `locateSection` reports absent, or vice versa?); a regex-special heading (does the `escaped` build
match the classifier's escaping exactly?). Ask: "parity proven by construction across opener AND
closer, or is there a residual heading/whitespace divergence that still lets a runtime reader pick — or
miss — a heading the hash-covering classifier does not?" Verdict findings: fix-in-run →
`status=resolved`; genuinely-separate residual → `status=deferred filed=#N` (do not scope-creep #673).

### n4-finalize

Terminal sink (not a subagent — the main session runs Phase-6 as this node's evidence). CHANGELOG.md
entry under `[Unreleased]` describing the `locateSection` heading-match parity fix (a suffix-decoy
heading no longer wins and a multi-space/tab/line-0 genuine heading is no longer missed; `locateSection`
now byte-parity with `classifier.sectionBodyState`'s anchored `^##\s+<heading>\s*$` opener + `^##\s`
closer; `plan_hash` wedge risk closed; #673). This is a CROSS-EDITION byte-anchor diff: record the
four-chain receipt (`npm test`, run SERIALLY — the schema byte-identity is checked by
`edition-sync.js --check` in the gitlab/gitea chains, the regression by `test-adaptive-node.js` in the
claude chain) BEFORE finalize; then feature commit → run-chains receipt (`--project issue-673`) →
`cmdFinalize --keep-worktree` → push branch → sink-merge --sink from the MAIN repo root. Verify the
remote issue #673 actually CLOSED (a zero exit can still leave it OPEN — re-check state and close
manually if needed). Do not commit transient sink-receipt/sink-fallback journals (terminal sinks
self-dispose).

## Node Ledger

| id | status |
| --- | --- |
| n1-heading-parity | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-heading-parity) | subagent-invoked | evidence-binding: n1-heading-parity 478f3f1a723c | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review a7314536d8b7 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 818f85c137c0 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize b6aeacfa3b6d | |
