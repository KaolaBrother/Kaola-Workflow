# advisor-plan raw output — issue-167 (Phase 3 gate) — model=opus

## Verdict: blueprint implementable, proceed to Phase 4. No architect revision. Seven pitfalls correctly pinned.

## Two pre-Phase-4 verifications — DONE
1. **installSupportScripts vs rebased install.sh**: the validator's installSupportScripts (164-175) only asserts each
   LISTED script appears in install.sh (176-178), NOT the reverse. fae0698 added `kaola-workflow-closure-contract.js` to
   install.sh's gitea array but NOT to the validator array — this is FINE (no reverse assertion; npm test green on fae0698).
   For C4: adding `kaola-gitea-workflow-closure-audit.js` to both validator arrays + install.sh (C1) → all assertions pass.
2. **test-gitea-forge-helpers.js final line** = `Gitea forge helper tests passed` (Gitea-flavored, NOT a GitLab artifact).
   C3 validation expects this exact string.
   Also: install.sh gitea SUPPORT_SCRIPT_NAMES post-rebase — classifier at line 164; closure-audit slots right after it.

## Execution-order sharpening (apply in Phase 4)
- Bundle A1 (forge labels) + A2 (roadmapDir export) + C3 (forge-API test) into ONE foundations tdd-guide dispatch
  (mirror #166 Task 1), so the `--labels=<csv>` byte-exactness contract lives in one diff.
- C4 (two fail-closed contract-validator arrays) MUST land in the same execution unit as C1 (install.sh) — both depend on B1.
  Avoids mid-cycle validator failures.

## D2 reinforcement
Casing-guard test `testClosureAuditUnarchivedPrFolderMergedLowercase` — lock at the registration site (between sync tail
1747 and async block 1749), visible at registration.

## Non-blocking
docs/api.md "style only" framing correct — validator scans only scripts/*.js, not docs. GitLab subsection's `GitLab` prose
is correct (documents the GitLab edition); the new Gitea subsection should use `Gitea` prose.

## Forward note (terminal issue)
After #167 closes, cross-forge closure-audit coverage is complete: GitHub #165, GitLab #166, Gitea #167. The standing goal
"finish all issues" will be satisfied; Stop hook auto-clears. No further /workflow-next needed unless new issues appear.
