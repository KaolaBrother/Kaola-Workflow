evidence-binding: n3-adversary a720f44922e5
verdict: pass
findings_blocking: 0

finding: id=R1 scope=out_of_scope action=fix status=deferred severity=medium fix_role=none rationale=heading-MATCH divergence (not fence-anchor): locateSection startsWith(prefix) selects "## Node Ledger Extra" while classifier anchored ^##\s+H\s*$ selects the genuine "## Node Ledger" — reader/writer can splice a different (unfenced) heading region than the hash-side oracle reads; reverse direction also live ("##  H" two-space, "##\t" terminator, line-0 heading: reader misses what classifier finds). Pre-existing, outside #670 fence-anchor AC. NEEDS a follow-up issue filed.
finding: id=R2 scope=out_of_scope action=document status=deferred severity=low fix_role=none rationale=CRLF plans: "```\r" fails the shared raw-line fenceRe in BOTH parsers (dot/$ exclude \r) so both are identically fence-blind on CRLF — parity HOLDS (pre-fix trim() made locateSection alone see the fence, i.e. #670 REMOVED a CRLF divergence); residual is only the documented ambiguous-vs-first-hit status channel (schema.js:1130-1135) on the resulting duplicate unfenced headings. Document with the R1 follow-up.

## Claim Under Test
"For issue #670, `schema.locateSection` now agrees with the hash-covering classifier
`markdownFenceTransition` (`classifier.js:286`, `^\s{0,3}` raw-line anchor) on EVERY fenced-decoy
construction — a runtime section reader can no longer select a fenced heading the classifier does
not, so no `plan_hash` wedge remains."

## Disproof Attempt
Two adversarial harnesses + a reworked second-loop battery, all driving the SHIPPED
schema.locateSection and classifier.markdownFenceTransition/sectionBodyState (zero repo writes):
scratchpad/n3-fence-adversary.js, n3-fence-adversary-v2.js, n3-a7-fixed.js under
/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/fe76e791-51db-46d7-a37b-ec313c7bc821/scratchpad/.
Oracles per construction: (a) per-line fence-state parity vs markdownFenceTransition; (b) WEDGE
check — the heading line locateSection selects must be classifier-UNFENCED; (c) when classifier
status=present, byte-equality of the located body slice vs classifier body.

(1) Tab-indented pseudo-closer: "\t```" IS a fence marker in BOTH (\t matches \s{0,3}) — both close
    and both then expose/select the SAME (decoy) heading; "\t\t\t\t```" (4 tabs) is a marker in
    NEITHER — decoy stays fenced in both, both select the genuine ledger; " \t " mixed indent
    agrees. Body slices byte-equal in every case. NO divergence (a shared, symmetric deviation from
    CommonMark column arithmetic — parity is the claim, and parity holds).
(2) Exact ^\s{0,3} boundary sweep, closers indent 0..5: both flip at exactly 3->4 spaces — 0-3sp
    closer honored by both (decoy exposed identically), 4-5sp pseudo-closer rejected by both (decoy
    stays fenced, genuine selected, decoy byte-excluded from the slice). NO divergence.
(3) Tilde family: 4sp "    ~~~" pseudo-closer rejected by both; 3sp "   ~~~" honored by both;
    cross-family "  ~~~" inside a backtick fence closes in NEITHER. Body slices byte-equal. NO
    divergence.
(4) Indented OPENER sweep 0..5: 0-3sp opener OPENS in both (fenced decoy skipped by both); 4-5sp
    opener opens in NEITHER (following genuine heading visible to both). NO divergence.
(5) Nested/mixed-length: 2sp-indented ````js opener + 1sp ``` (shorter run, closes in neither) +
    3sp ````` (longer run, ws-suffix, closes in both); "   ``` trailing-info" (info-string closer)
    rejected by both; "   ```   " (ws-suffix) accepted by both; 3sp "```json" opener opens in both;
    NBSP/\v/\f/"  \t" unicode-\s indents behave identically in both. Second scan loop (post-heading,
    n3-a7-fixed.js, 80/80): terminator selection + body byte-equal across both families, closer
    indents 0..5 + tab, and the 3->4 boundary flip inside the section. CRLF: "```\r" fails fenceRe
    in BOTH raw-line parsers (verified: '```\r'.match(fenceRe) === null; '```\r'.trim().match(...)
    matched — the PRE-FIX code diverged here, the fix removed it). NO fence-transition divergence.
(6) Heading-match probe (out-of-scope by brief): CONFIRMED residual — with zero fences,
    "## Node Ledger Extra" before the genuine ledger: locateSection selects the Extra line
    (startsWith prefix), classifier status=present with the GENUINE body. Plus reverse-direction
    misses ("##  H", line-0 heading, "##\t" terminator). Heading-MATCH family, not fence-anchor ->
    finding R1 (deferred, needs follow-up filing), does NOT refute this fix's claim.

Fuzz: 12000 randomized fence-soup docs total (4000 v1 + 8000 v2 incl. \r suffixes, lone \r, NBSP,
tabs, mixed runs 3-5, info strings): ZERO wedges (shipped locateSection never selected a
classifier-fenced heading) and ZERO exact-heading selection divergences when classifier
status=present. Harness-side false alarms dissected and cleared: v1-A5e (my wrong CRLF fence
expectation — both parsers are identically \r-blind) and v2-A7 (my unbalanced fixture tripping the
classifier's whole-document unclosed-fence ambiguity channel at classifier.js:317 — the documented
no-ambiguity-channel contract of the offset pair, schema.js:1130-1135, unchanged by #670; per-line
fence state and the chosen terminator line agreed throughout).

Suites (live, this worktree):
- node scripts/test-adaptive-node.js -> exit 0, "adaptive-node tests passed (1780 assertions)"
- node scripts/simulate-workflow-walkthrough.js -> exit 0, "Workflow walkthrough simulation passed"
- node scripts/edition-sync.js --check -> exit 0, "10 forge aggregator ports, 24 COMMON_SCRIPTS
  mirrors, and 27 byte-identical groups in parity with canonical."
Diff surface confirmed unchanged: 4x kaola-workflow-adaptive-schema.js + scripts/test-adaptive-node.js.

## Verdict
NOT-REFUTED (confidence: high)
Fence-anchor parity survived attacks (1)-(5) plus 12000-doc fuzz with zero divergences; the only
confirmed residuals are the out-of-scope heading-MATCH family (R1, deferred) and the documented
status-channel difference (R2, parity-preserving).
