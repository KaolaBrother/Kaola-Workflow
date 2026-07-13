evidence-binding: n3-adversary 818f85c137c0
verdict: pass
findings_blocking: 0

finding: id=A1 scope=out_of_scope action=none status=deferred severity=low fix_role=none rationale=pre-existing-documented-divergence-NOT-in-the-673-heading-match-channel-the-start-next-offset-contract-has-no-ambiguous-status-channel-so-a-duplicate-target-heading-classifier-ambiguous-or-an-unclosed-fence-classifier-ambiguous-still-yields-a-first-hit-slice-from-locateSection-predates-673-and-is-documented-at-schema.js-1130-1135-and-covered-by-667-670

# n3-adversary (CHANGE-GATE) — #673 locateSection ↔ classifier heading-match parity

## Claim under test
"schema.locateSection's heading match now agrees with the hash-covering classifier
(classifier.sectionBodyState) on EVERY heading construction — an anchored `^##\s+<heading>\s*$`
opener + `^##\s` terminator, byte-parity with the classifier, so a runtime section reader can no
longer select a heading the classifier does not (no plan_hash wedge via the heading channel). The
`i > 0` line-0 guard is retained and is inert on real plans."

## Method
Loaded BOTH modules and compared `locateSection(content,heading)` (selected slice) against
`classifier.sectionBodyState(content,heading)` (hash-covering oracle) as AGREEMENT: cls=present ⇒
locate must select AND body must byte-match; cls=absent ⇒ locate must NOT select. Ran the 6 attack
families as hand-built decoys + two large randomized fuzzers. classifier.js is READ-ONLY and
untouched (`git status --porcelain` empty). Suites re-run.

## Attack 1 — escaping parity (regex metacharacters + prefix/suffix)  → COULD NOT REFUTE
Both build the opener the same way: escape `/[.*+?^${}()|[\]\\]/g` then `new RegExp('^##\\s+'+esc+'\\s*$')`
(schema.js:1144-1145 vs classifier.js:298-299 — byte-identical). Tested `## Node.Ledger`, `## A[x]`,
`## A*B`, `## A+`, `## (x)`, `## A$B`, `## A^B`, `## A|B`, `## A\B`, `## A{2}`, `## A?B`, `## ##`, plus
a `.`-must-not-match-`X` decoy (`## NodeXLedger` before `## Node.Ledger`) and prefix/forward-suffix
decoys (`## Node` vs `## Node Ledger`; `## Node Ledger Extra` vs `## Node Ledger`). ALL agree — the
anchored `\s*$` tail makes prefix & forward-suffix decoys reject in BOTH. 0 divergences.

## Attack 2 — trailing-whitespace / tab / multi-space  → COULD NOT REFUTE
`## Node Ledger   ` (trailing spaces), `## Node Ledger\t`, `##\tNode Ledger`, `##  Node Ledger` (2sp),
`## \tNode Ledger` (space+tab), `## Node Ledger \t` — opener AND terminator agree on every one. The
`\s+` after `##` and the `\s*$` tail (both in each regex) absorb tab/multi-space identically.

## Attack 3 — terminator boundary  → COULD NOT REFUTE
Terminator is `/^##\s/` in BOTH (schema.js:1149 vs classifier.js:311). `### Subsection` (h3) and
`#### Deep` (h4) do NOT terminate an h2 in either (position 2 is `#`, not `\s`); `##NoSpace` (no space)
terminates in neither; `## ` (empty) and `##\tAppendix` terminate in BOTH. Exactly the same h2 boundary.

## Attack 4 — line-0 `i > 0` guard: "inert on real plans"?  → CONFIRMED inert
Constructed `##`-heading-at-absolute-offset-0 plans. Divergence exists (cls=present, locate={-1,-1})
but it is the FAIL-SAFE direction: locate returns "absent", so the runtime refuses (e.g.
node_not_in_ledger) — it never silently reads attacker content, so no plan_hash wedge. Reachability:
`injectHash` (plan-validator.js:2323-2333) stamps line 0 as EITHER the `#` H1 title (marker spliced
after it) OR, when there is no H1, prepends the `<!-- plan_hash -->` comment as line 0 — pushing any
leading `##` to line 1. So on ANY frozen plan (the only content these consumers read) a `##` h2 can
never sit at offset 0. Verified against real archived plans: issue-515/bundle open with the `# Workflow
Plan —` title; issue-523 opens with the `<!-- plan_hash: -->` comment — never a `##` at line 0. The
frozen-shape and plan_hash-line0 probes both AGREE (cls=present, locate found it). The only compound
divergence (line-0 heading + a later duplicate → locate picks the 2nd, cls=ambiguous) needs BOTH a
line-0 heading (impossible post-freeze) AND a duplicate — doubly unreachable. Guard is inert. CONFIRMED.

## Attack 5 — CRLF  → COULD NOT REFUTE
`## Node Ledger\r` (post split('\n')): the trailing `\r` is absorbed by the identical `\s*$` in BOTH
openers; the `^##\s` terminator matches `## End\r` in both. Full-file CRLF fixture agrees. Both parsers
identically CRLF-blind, as #670 established for fences.

## Attack 6 — suites + parity fuzz  → GREEN
- `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (1815 assertions)", exit 0
  (1807 pre-fix baseline + the 8 T6e (#673) cases). The two Chinese `致命错误` stderr lines are the
  pre-existing intentional git-failure-path probe (present on the unmodified baseline; n1/n2 flagged).
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", exit 0.
- `node scripts/edition-sync.js --check` → "10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and
  27 byte-identical groups in parity with canonical.", exit 0.
- Byte-identity: sha of `locateSection` body (lines 1136-1187) is IDENTICAL across all 4 copies
  (canonical + kaola-workflow/gitlab/gitea plugin trees): fb0ac58e82cd...
- classifier.js untouched (`git status --porcelain scripts/kaola-workflow-classifier.js` empty).
- Fuzz #1 (40,000 iters, general): present=13526 absent=6042 → 0 DIVERGE (19227 AMBIG = documented
  duplicate first-hit, see A1).
- Fuzz #2 (40,000 iters, single-occurrence target, metachars + ws + CRLF + h3/h4/no-space + fenced
  decoys): present=23552 absent=10606 → 0 DIVERGE.

## Out-of-scope residual (A1, non-blocking, deferred)
The `{start,next}` contract has no "ambiguous" channel, so a DUPLICATE target heading (classifier
→ ambiguous) or an UNCLOSED fence (classifier → ambiguous) still yields a first-hit slice from
locateSection. This is PRE-EXISTING (the old startsWith also first-hit), explicitly documented at
schema.js:1130-1135, and OUTSIDE the #673 heading-match (opener/terminator) channel this claim covers;
#667 already routes the ambiguous-status read via sectionBodyState where it matters. Not introduced by
#673; does not create a heading-channel plan_hash wedge (both parsers SEE the duplicate/fence; the
classifier declines rather than hides). Recorded for transparency; does not fail the verdict.

## Verdict
NOT-REFUTED (confidence: high) — the #673 heading-match parity (anchored opener with identical
metachar-escaping + whitespace handling, `^##\s` terminator, CRLF-blindness) holds across 80,000+
randomized cases and every hand-built decoy with zero divergence; the retained `i > 0` line-0 guard is
confirmed inert on every frozen plan (injectHash makes a line-0 `##` structurally unreachable) and its
residual gap is fail-safe. Could not construct a heading-channel divergence or plan_hash wedge.
