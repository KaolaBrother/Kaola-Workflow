evidence-binding: n4-adversary 50a84c683944
verdict: pass
findings_blocking: 0
upstream_read: n1-repair-fold 7c50240a9817
upstream_read: n2-fence-parse 404302258587
upstream_read: n3-review fd1635959afd
finding: id=A1 scope=in_scope action=fix status=resolved severity=high fix_role=tdd-guide rationale=unreleasedSection fence regex anchored ^\s{0,3} on the RAW line across all 4 release copies; indented-fence counterexample refuses changelog_incomplete both e2e directions; 17-case attack matrix + 5000-doc fuzz show exact markdownFenceTransition parity; trim-mutant reconstruction proves fixtures discriminate; new tests at test-release.js:186-190
finding: id=A2 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=locateSection (adaptive-schema.js:1144/1160) still uses ln.trim() vs classifier 0-3-space anchor — pre-existing posture, untouched by this bundle (same as R3); V7 decoy-wins remains the known residual
finding: id=A3 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=legacy-purge fs-seam caller-sensitivity — harness-level readdir omission skips purge, but every production dispatch (adaptive-node.js:6946/6966) now passes readdir (R1 resolved), so no reachable caller hits the seam
finding: id=R4 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=#437-lane EISDIR stderr traces in test-adaptive-node fixture; suite exits 0; not introduced by this diff
finding: id=R5 scope=in_scope action=document status=deferred severity=low fix_role=none rationale=cosmetic "#665 R1/R2" labels on the two repair tests covering the #664 fix; non-blocking

# Adversarial Re-Verification — n4-adversary (bundle-664-665, nonce 50a84c683944)

Re-verification after the prior refutation (A1) was repaired. Verdict: NOT-REFUTED (high confidence).

## A1 fix — original counterexample re-run e2e (fixed code)
Fresh git repo, CHANGELOG: [Unreleased] → "- Real fix (#700)" → 4-space-indented ``` → "## [5.0.0]" → "- Historical (#654)". Real subprocess --verify:
- --issues-closed 700,654 → exit 1 {"result":"refuse","reason":"changelog_incomplete","missing":[654],"changelog_refs":[700]} — fail-open CLOSED (#654 no longer laundered from [5.0.0]).
- --issues-closed 700 → exit 0 {"result":"ok","changelog_refs":[700]} — spurious refusal gone.

## A1 attack matrix + fuzz
Three-way differential: fixed unreleasedSection vs reconstructed pre-repair trim() mutant vs classifier.markdownFenceTransition ground truth (regex /^\s{0,3}(`{3,}|~{3,})(.*)$/ on raw line = byte-identical to fixed release.js). 17 hand-built cases (indent 0/1/2/3 fences; 4/5 indented-code; 3-vs-4 boundary; tilde fences; balanced indented pairs; col-0-opener + indented-closer; tab-indented; run-length interplay): 17/17 exact classifier parity, zero over/under-termination. Trim-mutant diverges on 6/17 incl. A1 original (fixtures discriminate). 5000 randomized docs: 0 mismatches. 4-copy parity: canonical↔codex cmp identical; gitlab/gitea unreleasedSection diff-identical; no residual trim().match in any of 4 copies.

## #664 re-attack (probe664.js re-run)
P1 canonical mixed-shape fold (gatesReset av-a,av-b,review; receipts purged; review.md + barrier-base-impl retained). P2 laundering (flip members complete post-repair) verdict-check ok=false. P3 defense-in-depth ok=false. P4 legacy via readdir all purged, ok=false. P4b (harness readdir omitted) = A3 seam only; both production dispatch sites pass readdir. P5 legacy-ambiguous fails closed. P6/P7 scoping ok. No regression from A1 (release.js only).

## #665 locateSection re-attack
V0-V5 strictAgree=true (locateSection ↔ classifier.sectionBodyState). V6/V7 indent divergence = pre-existing A2/R3 (adaptive-schema untouched). V8 first-hit documented fallback. E2E I1 pass on fixed bytes.

## Suites + parity (all re-run, green)
test-release.js 244 assertions exit 0; test-adaptive-node.js 1767 exit 0; simulate-workflow-walkthrough.js exit 0; validate-script-sync.js OK; edition-sync.js --check clean.

## Could NOT find
No indent×run-length×family×suffix×tab input where fixed unreleasedSection disagrees with markdownFenceTransition (17 + 5000, 0 mismatches); no e2e #654 laundering/spurious-refusal against fixed subprocess; no repair-node laundering path; no reachable production caller omitting readdir. Only divergences are the pre-declared deferred residuals (A2/R3 locateSection indent, V8 fallback) — outside scope, unchanged. Cosmetic: fix comment says "0-3-space indent" but \s{0,3} also admits a tab — inherited byte-for-byte from the classifier, parity preserved.

Verdict: NOT-REFUTED. A1 fail-open + fail-closed both closed with exact classifier parity ×4; #664/#665 withstand re-attack; all suites/parity green.
