# Workflow Plan — issue-670

<!-- plan_hash: 57e2edd2fcff7bf6cbe63fd6c4c1767468d75bf6f400b12d1799b95bef3c163e -->

## Meta
speculative_open_policy: auto
labels: bug, area:scripts
validation_command: npm test

Fix the CommonMark fence-detection PARITY bug (#670, post-#665 residual). The hash-covering
classifier `markdownFenceTransition` anchors fences at `^\s{0,3}` on the RAW line, but
`schema.locateSection` detects fences via `ln.trim().match(/^(`{3,}|~{3,})(.*)$/)` — ANY indentation.
A 4+-space-indented backtick run is an indented code block per CommonMark, NOT a fence, so a
runtime section reader can select a fenced DECOY heading the classifier does not, risking a
`plan_hash` mismatch WEDGE on resume/barrier (the adversary's V7 decoy-wins construction). Anchor
`locateSection`'s fence match at `^\s{0,3}` on the raw line (byte-identically across the 4
adaptive-schema copies), mirroring the classifier and the now-shipped `release.unreleasedSection`
(#665 A1) fix, and add a 4-space-indented decoy regression proving `locateSection` ↔
`classifier.sectionBody` parity end-to-end (no `plan_hash_mismatch` on resume).

A small, surgical, well-understood near-copy of an already-shipped sibling fix — not decomposable
into parallel legs (one coherent byte-identical edit across 4 copies + one regression test in the
sibling fence-test home). A serial spine is correct: fix (tdd-guide, genuine RED-then-GREEN) →
code-review (G1) → adversarial change-gate → terminal finalize sink. This is a cross-edition
byte-anchor diff, so all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains
(the recorded `validation_command: npm test`) must be green (run serially) before finalization.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-fence-parity | tdd-guide | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/test-adaptive-node.js | 5 | sequence | standard | — |
| n2-review | code-reviewer | n1-fence-parity | — | 1 | sequence | reasoning | — |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning | — |
| n4-finalize | finalize | n3-adversary | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Session directive (/goal), recorded for dispatch:** the reasoning-tier reviewer-class nodes
  (`n2-review`, `n3-adversary`) carry **model fable at dispatch time** per the operator goal
  ("fable model for reviewer subagents"); the `model` column above stays in-grammar
  (`reasoning`/`standard`). The executor applies the fable override.
- **Byte-identity group — `kaola-workflow-adaptive-schema.js` ×4 must move atomically.** This file
  is a COMMON byte-anchor (all four copies share the basename `kaola-workflow-adaptive-schema.js`;
  the gitlab/gitea copies are NOT forge-renamed), NOT a `sync:editions` GENERATED aggregator — so
  `npm run sync:editions` does not regenerate it. The identical bytes must be HAND-APPLIED to all
  four copies (`scripts/`, `plugins/kaola-workflow/scripts/`,
  `plugins/kaola-workflow-gitlab/scripts/`, `plugins/kaola-workflow-gitea/scripts/`); then
  `node scripts/edition-sync.js --check` (in the gitlab/gitea chains) must be clean. All four are
  declared in n1's single write set (verified byte-identical at freeze; not `generated_port_split`
  — the base is absent from `GENERATED_AGGREGATORS`).
- **`classifier.js:286` (`markdownFenceTransition`) is the READ-ONLY parity ORACLE, NOT a write
  site.** The fix makes `locateSection`'s fence regex byte-identical to the classifier's
  (`/^\s{0,3}(`{3,}|~{3,})(.*)$/` on the raw line); do NOT edit the classifier. Parity becomes
  structural by construction once both use the identical anchored regex.
- **Serial spine is deliberate, and it EXPOSES speculation.** G1 forces `code-reviewer` (n2) onto
  every path from the code-producing node to the sink (post-dominance); an antichain review‖adversary
  both feeding finalize would give the adversary a sink-path that bypasses review, so serial is
  required, not a choice. Ordering the adversary AFTER the review makes `n3-adversary`
  speculative-open-eligible: its sole unsatisfied dependency is the high-probability-pass n2 gate
  over a small mechanical diff, and it is read-only — so under `speculative_open_policy: auto` the
  executor may open it speculatively during the review and overlap it for free (read-node evidence
  is keep-or-discard on a fail). NEVER hand-add `parallel_safe`/`speculative` (validator-derived).
- **Adversary IS warranted.** #670 exists precisely because an adversarial-verifier (finding A2)
  constructed a surviving decoy that the #665 code-review missed in this exact fence-detection code
  (the #665→#670 residual chain). Fence-parity is the textbook decoy-construction class and the
  failure mode is a `plan_hash` WEDGE (a loud resume/barrier stop, not a silent fail-open) — axiom 1
  (correct first) tips the near-copy tradeoff toward keeping the skeptic. The adversary tries to
  BREAK the fix with a NEW decoy; the reviewer verifies the diff — complementary, not duplicative.
- **Cross-edition four-chain obligation.** This is a cross-edition byte-anchor diff → Finalization
  requires all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run
  SERIALLY (a green claude chain alone is insufficient — `npm test` short-circuits on the first
  `&&` failure). `scripts/test-adaptive-node.js` (the regression home) runs only in the claude
  chain; the schema byte-identity is enforced by `edition-sync.js --check` in the gitlab/gitea
  chains. Cite the receipt per node; the finalize sink runs and records it.
- **No decision record.** A straightforward parity bug fix (near-copy of shipped #665 A1), not a
  value/standing/irreversible call — provenance belongs in `CHANGELOG.md` + the commit message, not
  a `D-670-NN` record. (Verified: no existing D-670 records.)
- **Evidence discipline:** every node's evidence lands at
  `kaola-workflow/issue-670/.cache/<node-id>.md` (absolute path at dispatch; never a bare
  `.cache/<id>.md` at the worktree root).

## Node Briefs

### n1-fence-parity

Test-first (genuine RED-then-GREEN — this is why `tdd-guide`, not `implementer`). Read the sibling
fence tests in `scripts/test-adaptive-node.js` first (T6 at ~L417, T6c at ~L487 — the #665
run-length-decoy end-to-end test) and follow their construction pattern; read `locateSection`
(`scripts/kaola-workflow-adaptive-schema.js` ~L1136-1171) and the classifier oracle
`markdownFenceTransition` (`scripts/kaola-workflow-classifier.js:286`) so the new fence regex is
byte-identical to the classifier's.

RED FIRST — add a new sibling test (e.g. T6d) next to T6c. Construct a decoy plan where a 0-indent
backtick OPENER is followed by a **4-space-indented pseudo-closer** (`    ` + three-or-more
backticks): under the CURRENT `ln.trim()` code that indented line looks like a fence CLOSER (trim
strips the indent), so the fence ends early and a subsequent fenced `## Node Ledger` DECOY appears
"unfenced" to `locateSection` — which then selects the decoy — while the classifier (`^\s{0,3}`
anchor) keeps the 4-space line INSIDE the fence and selects the genuine (truly-unfenced) ledger.
Assert `locateSection(plan, 'Node Ledger')` slice EQUALS `classifier.sectionBodyState(plan,
'Node Ledger')` ground truth (the GENUINE ledger, not the decoy), and drive the real subprocess
open → splice → `--resume-check` end-to-end (mirror T6c's harness) to prove there is NO
`plan_hash_mismatch` wedge. This test MUST be RED against the current code and GREEN after the fix.

GREEN — the fix, applied BYTE-IDENTICALLY to all 4 adaptive-schema copies: change
`const fenceRe = /^(`{3,}|~{3,})(.*)$/;` to `const fenceRe = /^\s{0,3}(`{3,}|~{3,})(.*)$/;` and
change BOTH `const fm = ln.trim().match(fenceRe);` sites (~L1144 opener-scan and ~L1160
next-heading-scan) to `const fm = ln.match(fenceRe);` — anchoring on the RAW line, mirroring the
classifier and the now-shipped `release.unreleasedSection` (#665 A1). Do NOT touch
`classifier.js:286` (read-only parity oracle). Do NOT alter the run-length/family/empty-suffix
closer logic (already #665-correct) or the first-hit heading selection (out of scope).

Verify locally: `node scripts/test-adaptive-node.js` (RED before, GREEN after) and
`node scripts/simulate-workflow-walkthrough.js`. Keep the 4 copies byte-identical (confirm with
`node scripts/edition-sync.js --check`). Flag anything that would widen this write set so the plan
can be repaired BEFORE an overflow.

### n2-review

Code review of n1's diff (G1 gate). Focus: (a) the fence regex in `locateSection` is now
byte-identical to `classifier.markdownFenceTransition`'s `^\s{0,3}` anchor and applied to the RAW
line (both `ln.match` sites — no lingering `.trim()`); (b) the 4 adaptive-schema copies are ACTUALLY
byte-identical (not just similar) — the byte-anchor contract; (c) `classifier.js` is untouched; (d)
the run-length/family/empty-suffix closer semantics and first-hit heading selection are unchanged
(surgical — only the indent anchor moved); (e) the regression genuinely distinguishes old-vs-new
(RED against `ln.trim()`, GREEN after) and asserts `locateSection` ↔ `classifier.sectionBody`
parity end-to-end including a clean `--resume-check`; (f) no forge-neutral prose concern (no plugin
agent/command/skill prose touched). Note the six-surface / four-chain implications are limited here
to the schema byte-anchor + the claude-chain regression.

### n3-adversary

Adversarial verification (read-only; Bash allowed — construct and RUN decoys, write nothing). Try
to REFUTE "`locateSection` now agrees with the classifier on every fenced-decoy construction."
Build NEW surviving-decoy candidates the single 4-space case might not cover and check
`locateSection` vs `classifier.sectionBodyState` on each: e.g. a TAB-indented pseudo-closer; a
2-to-3-space vs 4+-space boundary case (exactly `^\s{0,3}` — 3 spaces is still a fence, 4 is not);
a `~~~` (tilde) family indented run; an indented OPENER (does an indented opener now correctly
NOT open a fence in both?); nested/mixed-length runs interacting with the new anchor; and a decoy
targeting the KNOWN documented heading-match divergence (`locateSection`'s `startsWith(prefix)` vs
the classifier's `^##\s+heading\s*$`) — if that surfaces a real wedge it is a well-scoped follow-up,
NOT this AC. Ask: "parity proven by construction, or is there a residual divergence that still lets
a runtime reader pick a heading the hash-covering classifier does not?" Verdict findings: fix-in-run
→ `status=resolved`; genuinely-separate residual → `status=deferred filed=#N` (do not scope-creep
#670).

### n4-finalize

Terminal sink (not a subagent — the main session runs Phase-6 as this node's evidence). CHANGELOG.md
entry under `[Unreleased]` describing the `locateSection` fence-parity fix (indented-fence decoy no
longer wins; `plan_hash` wedge risk closed; #670). This is a CROSS-EDITION byte-anchor diff: record
the four-chain receipt (`npm test`, run SERIALLY — the schema byte-identity is checked by
`edition-sync.js --check` in the gitlab/gitea chains, the regression by
`test-adaptive-node.js` in the claude chain) BEFORE finalize; then feature commit → run-chains
receipt (`--project issue-670`) → `cmdFinalize --keep-worktree` → push branch → sink-merge --sink
from the MAIN repo root. Verify the remote issue #670 actually CLOSED (a zero exit can still leave
it OPEN — re-check state and close manually if needed). Do not commit transient
sink-receipt/sink-fallback journals (terminal sinks self-dispose).

## Node Ledger

| id | status |
| --- | --- |
| n1-fence-parity | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fence-parity) | subagent-invoked | evidence-binding: n1-fence-parity 049bb874b6ca | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 5879d4cbe7a2 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary a720f44922e5 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize f5590649a88e | |
