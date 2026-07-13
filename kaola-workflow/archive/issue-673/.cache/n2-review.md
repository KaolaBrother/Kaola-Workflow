evidence-binding: n2-review a7314536d8b7
verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=cross-edition-diff-touches-4-schema-copies-finalize-must-run-all-four-npm-chains-per-Validation-Policy-not-a-code-defect

# n2-review (G1 gate) — code review of n1-heading-parity (#673)

APPROVE. Zero CRITICAL/HIGH/MEDIUM findings. One LOW non-blocking follow-up (R1) routed to the
finalize node (four-chain obligation, not a code defect). The change is surgical, test-first, and
byte-identical across all 4 schema copies.

## Verdict summary
| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | note   |

## Per-check findings

### (a) Opener parity — CONFIRMED
locateSection (scripts/kaola-workflow-adaptive-schema.js, canonical + 3 forks) now builds the opener
IDENTICALLY to the classifier oracle:
  locateSection: escapedHeading = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\$&');
                 headRe = new RegExp('^##\s+' + escapedHeading + '\s*$')
  classifier.sectionBodyState (scripts/kaola-workflow-classifier.js:298-299):
                 escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\$&');
                 headRe = new RegExp('^##\s+' + escaped + '\s*$')
Same anchor `^`, same `\s+` after `##`, same trailing `\s*$`, same metacharacter escape set. The only
textual delta is the defensive `String(heading)` wrap in locateSection — inert for a string heading
(both yield the identical regex); it merely avoids a throw the classifier would take on a non-string.
NOT a parity divergence. classifier.js is UNTOUCHED: `git status --porcelain
scripts/kaola-workflow-classifier.js` prints nothing.

### (b) Terminator parity — CONFIRMED
locateSection next-heading terminator is `nextHeadRe = /^##\s/`, byte-identical to the classifier's
collecting-loop terminator `/^##\s/` (classifier.js:311). No over-match: `### x` is `##`+`#`+space —
position 2 is `#`, not `\s`, so `^##\s` does NOT match an h3 opener; h3 correctly does not terminate an
h2 slice. Because both files use the exact same regex, they agree on every h2 (tab / multi-space `##`
headings now terminate in both). A bare `##` with no trailing whitespace terminates in neither
(consistent).

### (c) Line-0 guard — the crux judgment — SOUND (concur with n1; NOT a finding)
Verified n1's three claims against source:
1. At line 0 `off === 0`, so `start = off - 1 === -1`, which is INDISTINGUISHABLE from the function's
   own `-1 = absent` sentinel — true regardless of match style (startsWith or anchored regex). Parity
   for a line-0 heading is structurally unreachable without redefining the offset contract.
2. Callers genuinely depend on `start` being the offset of the leading `\n`:
   materializeSpeculativePolicy (schema.js:504-508) computes `headingStart = start + 1` = "first char
   of the '## Meta' heading line". A line-0 "support" (start=0) would make `start+1=1` point INTO the
   heading text — the contract truly requires a preceding `\n`. readDurableConsentHalt and
   hasSpeculativePolicyField slice `text.slice(start, next)` on the same contract.
3. A `##` heading at absolute offset 0 is unreachable in a real frozen plan: every plan opens with a
   `# Workflow Plan — {project}` h1 title, and a FROZEN plan additionally prepends a
   `<!-- plan_hash: ... -->` comment as line 0 (see the T6e end-to-end frozen673 fixture) — so no `##`
   section is ever at line 0.
The guard PRE-EXISTED this change (`i > 0` was already present with the old startsWith); line-0
behavior is byte-identical before and after, so no NEW divergence is introduced. Removing the guard
would NOT achieve parity (line-0 still degrades to start=-1) and would introduce a WORSE divergence:
the scan would `break` on a line-0 false match and skip a genuine later heading. The classifier does
treat a line-0 heading as `present`, but since that state is unreachable on real plan content, the
residual difference is INERT. Keeping the guard is the correct call.

### (d) Byte-identical ×4 — CONFIRMED
`node scripts/edition-sync.js --check` → exit 0, "10 forge aggregator ports, 24 COMMON_SCRIPTS
mirrors, and 27 byte-identical groups in parity with canonical." Direct diff of the `locateSection`
body: canonical vs plugins/kaola-workflow, plugins/kaola-workflow-gitlab, plugins/kaola-workflow-gitea
all IDENTICAL. The git diff shows the same index transition (89b51121..cc3c1710) and identical hunks
on all 4 copies.

### (e) Regression discriminating — CONFIRMED
T6e (#673) block in scripts/test-adaptive-node.js adds: (a) forward-suffix decoy `## Node Ledger
Extra` — asserts the anchored opener skips the decoy and the slice excludes the decoy body; (b)
two-space `##  Node Ledger` — asserts the `\s+` opener matches where the old single-space prefix
false-negatived; (c) tab `##\tAppendix` next heading — asserts the `^##\s` terminator ends the slice
so Appendix does not bleed in; (d) line-0 non-regression — asserts classifier `present` while
locateSection stays `{start:-1,next:-1}` (documented, not a RED->GREEN); plus an end-to-end real
open-next/--resume-check proving the write lands on the GENUINE ledger with no plan_hash wedge. Each
case asserts locateSection agrees with `classifier.sectionBodyState`/`sectionBody` (the hash-covering
oracle). n1 reported 8 RED failures pre-fix; post-fix count is 1815 = 1807 + 8, exactly those 8 now
green. The #670 fence-detection logic (fenceRe, inFence/fam/fenceLen transitions,
markdownFenceTransition) is UNCHANGED — those lines appear only as unchanged context in the diff and
are present verbatim in the patched source.

### (f) Suites — GREEN
`node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1815 assertions)", exit 0.
`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", exit 0.
(The Chinese git-failure-path stderr noise n1 flagged is a pre-existing intentional probe, unrelated.)

## Ruling on (c)
The line-0 `i > 0` guard is SOUND and correctly retained. It is not a residual divergence that
matters: the offset-contract collision is real, the callers genuinely depend on the leading-`\n`
offset, and a line-0 `##` heading cannot occur in a real (let alone frozen) plan. Keeping it is
strictly safer than removing it. No finding.

## Non-blocking follow-up (R1, LOW)
This diff touches all 4 schema editions (canonical + kaola-workflow/gitlab/gitea plugin trees), so per
the project Validation Policy it is a cross-edition diff: FINALIZATION must record all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (run sequentially — `npm test`
short-circuits). This is a finalize-node process obligation, not a code defect, and does not block
this review gate. Routed to finalize.

## Verdict: APPROVE — no CRITICAL/HIGH issues. Gate G1 passes.
