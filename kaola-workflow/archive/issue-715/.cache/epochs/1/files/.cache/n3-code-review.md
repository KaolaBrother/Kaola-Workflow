evidence-binding: n3-code-review cee943909c3f
contract_version: 2
plan_schema_version: 2
behavior_contract_version: 2
review_context_hash: 8808fdf993b6abb39e28ee2e2a6ebf2a21e90f9e482e5b1f7117f1c42782bc4e
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: fa2d67ff234b483d43539dfa15757a3a0ed52fe58c796c5f1e419ed1cdda9577
gate_mode: change_gate
review_phase: discovery
gate_claim: the release path commits every .discarded- archive it creates (claim.js release and the watch-pr CLOSED sweep) at the ACTUAL dest with the commit verifiable at HEAD and failure reported — never thrown — in the emitted JSON, and the sink preflight exempts exactly the live/archive sink-receipt.json of ANY project while every other sibling path still refuses as foreign dirt — with codex byte-mirror and forge-port parity proven and every pre-existing sink/claim/release behavior intact
gate_surface: complete candidate: the claim.js and sink-merge.js four-edition families (canonical, codex byte twins, gitlab and gitea hand ports), the claude-chain test surfaces (test-sink-merge.js, simulate-workflow-walkthrough.js), and the documentation delta
gate_aggregation: sequence
upstream_read: n2-documentation 83219ce14dda

verdict: pass
findings_blocking: 0
domain_outcome: approved
findings_none: true
review_summary: no_blocking_findings
review_attestation: full_review_completed

## Candidate identification

- Candidate = worktree diff vs HEAD; HEAD == claim_root_base commit cd28e8e52fb641cf2173ced57c91a042e3c13e1e ("chore: finalize bundle-713-714"), matching the review context.
- Modified set is exactly 13 files, all inside the declared gate_surface: scripts/kaola-workflow-claim.js, scripts/kaola-workflow-sink-merge.js, the codex twins under plugins/kaola-workflow/scripts/, the gitlab and gitea hand ports (4 files), scripts/test-sink-merge.js, scripts/simulate-workflow-walkthrough.js, CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md.
- Zero out-of-set writes: git status --porcelain shows only those 13 modifications plus the untracked kaola-workflow/issue-715/ run tree (workflow evidence/cache artifacts, not candidate code).

## #715(a) release-commit mechanism — verified

- Shared helper commitDiscardArchive (scripts/kaola-workflow-claim.js:2321-2351): refuses cleanly when result.dest is absent; resolves the git toplevel from dest itself and rejects an outside-toplevel dest; stages the ACTUAL result.dest via git add -A -- <rel> (never a reconstructed plain path, honoring the #700 collision-suffix lesson); diff-quiet guard skips the commit when nothing staged (git diff --cached --quiet, only status 1 counts as staged); commits scoped to the dest pathspec as "chore: discard archive <project>"; verifies via git cat-file -t HEAD:<rel> === 'tree'. Every fallible operation sits inside the try; all failure paths return { committed: false, detail } — the helper never throws. No KAOLA_WORKFLOW_OFFLINE branch exists in the helper, so OFFLINE does not skip it (grep confirmed: zero OFFLINE references in the helper body).
- cmdRelease call site (scripts/kaola-workflow-claim.js:3329) runs AFTER the in-place branch restore/delete block (3300-3322), so the commit lands on the restored base branch. The emit (3357-3364) gains discard_archive_committed: true|false plus discard_archive_commit_detail on failure and pushes a loud warnings[] entry (3352-3356); released: true is preserved on commit failure — the release is never stranded.
- cmdWatchPr CLOSED sweep call site (4296-4299) runs immediately after the archiveSucceeded predicate passes; the per-folder cleanups[] entry carries discard_archive_committed plus discard_archive_commit_detail on failure (4337-4341); the sweep continues (no throw).
- result.dest traced to archiveProjectDir's return (archived: true, dest) for the 'abandoned' status path used by release; exercised end-to-end by the walkthrough test.

## #715(b) exact-path any-project receipt exemption — verified

- sinkPreflight (scripts/kaola-workflow-sink-merge.js:1183-1194) replaces the this-project two-path Set with the anchored regex ^kaola-workflow/(?:archive/)?[^/]+/\.cache/sink-receipt\.json$ — exactly one project segment, live or archived, ANY project, matched with continue before any staging (classification-only). The comment block records the rationale and the deliberate non-exemption of sink-fallback.json.
- No over-exemption: [^/]+ cannot span segments, so nested x/.cache/sink-receipt.json, .tmp suffixes, trailing-slash/directory forms, and all other sibling files stay bucket-3 foreign dirt — proven by test (l) including the directory form listed as sink-receipt.json/inner.txt.
- The removed sinkReceiptPaths identifier has zero remaining references across scripts/ and plugins/.

## RED-first independently reproduced

Built a sandbox from git archive HEAD (pre-fix code) overlaid with ONLY the two new test files, leaving the candidate worktree untouched:
- test-sink-merge.js vs pre-fix sink-merge.js: (k) fails RED — 3 assertions, sibling receipt refused sink_blocked and listed in foreign_dirt ["kaola-workflow/archive/sibling-71591/.cache/sink-receipt.json"]. (l) and (m) pass on pre-fix code by design (over-exemption guard and #518 regression lock pin unchanged behavior).
- walkthrough testSinkForeignDirtExemptsSiblingReceipt715 vs pre-fix: fails RED — "the sibling interrupted-sink receipt must NOT appear in foreign_dirt".
- walkthrough testReleaseFromLinkedWorktreeCleansMainCopy vs pre-fix: fails RED — the pre-fix emit lacks discard_archive_committed entirely.
Sandbox removed afterward; no candidate files were modified at any point (read-only role honored).

## GREEN on the candidate

- node scripts/test-sink-merge.js: suite passed, 105 assertions, including #715 (k) sibling receipt exempt + byte-untouched, (l) look-alikes refuse with zero mutation (git status byte-identical), (m) own live+archive receipts remain exempt.
- node scripts/simulate-workflow-walkthrough.js --only testReleaseFromLinkedWorktreeCleansMainCopy: passed — asserts discard_archive_committed === true under KAOLA_WORKFLOW_OFFLINE=1 (OFFLINE does not skip), zero .discarded- residue in git status -uall, the archive is a tree at HEAD, and a following OFFLINE sink for another project completes status: sinked with no manual commit (the #715 acceptance criterion). The function holds 9 asserts with no early return; the new assertions execute.
- --only testSinkForeignDirtExemptsSiblingReceipt715: PASSED — refusal on the genuinely-foreign file alone, sibling receipt not listed, zero mutation, receipt byte-untouched.
- Watch/release regression subset (--only x6): testWatchPrArchivesClosedIssuePrFolder, testWatchPrEmitsClaimLabelReceipt, testWatchPrMergedClosureReceipt, testWatchPrAbandonedClosureInvariantsClean, testWatchPrRoadmapCleanupWarning, testFinalizeReleaseCleansWorktree — subset passed (6 scenarios).
- node scripts/test-bundle-finalize.js: all 149 tests passed (pre-existing claim/finalize behavior intact).
- node --check: all 10 modified JS files parse clean.

## Four-tree propagation fidelity

- Codex twins: diff scripts/kaola-workflow-claim.js vs plugins/kaola-workflow/scripts/kaola-workflow-claim.js is empty, and likewise for sink-merge.js — byte-identical mirrors.
- GitLab and Gitea claim ports: 65 changed lines each, identical to canonical's 65; the full diff hunks are line-for-line identical after forge-namespace normalization (kaola-<forge>-workflow prefix, watch-mr/watch-pr comment wording). Helper + both call sites + both emitted fields present in all four trees (grep counts equal: 1 definition, 3 call references, 2 discard_archive_committed sites per tree).
- GitLab and Gitea sink-merge ports: hunks identical to canonical except the receipt path literal stays kaola-workflow/... — correct, since the runtime workflow directory is forge-independent; no other delta.

## n2 documentation delta — verified against code

- CHANGELOG.md [Unreleased] Fixed entry matches the code field-for-field: shared helper, ACTUAL dest staging, diff-quiet skip, scoped commit message, tree-at-HEAD verify, OFFLINE non-skip, post-restore ordering, discard_archive_committed / discard_archive_commit_detail on release and watch cleanups[], exact-path any-project exemption with look-alikes and sink-fallback.json still refused.
- docs/api.md: NATIVE=0 paragraph (line ~186), Closure Contract "Discard-archive commit (issue #715)" block (~2946), and the in-progress-receipt vs terminal-stray rewrite (~3494) all match the shipped behavior; field spellings verified against claim.js:3360-3361 and :4338-4339; the terminal-stray delete-never-commit guidance is preserved.
- docs/workflow-state-contract.md carries the same distinction in two sentences pointing at api.md. docs/decisions/D-653-01.md remains untouched — a frozen record, as n2 documented; not a candidate defect.

## Findings

None. Every element of the gate_claim was traced in code over the full gate_surface and exercised by reproduced RED-to-GREEN evidence; pre-existing behavior is intact; propagation parity is proven at byte level (codex) and normalized-hunk level (gitlab/gitea); zero out-of-set writes.

review_conclusion: approved — both halves of issue 715 verified end to end on the exact candidate: the release and watch sweep commit the discard archive at the actual dest with HEAD verification and throw-free JSON-reported failure after branch restore, the sink preflight exemption matches exactly the any-project live or archive receipt path with look-alikes still refused, RED was independently reproduced against pre-fix code and all candidate and regression suites run green with codex byte parity and forge port parity confirmed.
