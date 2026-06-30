evidence-binding: n6-review aa47879c8ac8
## n6-review (re-run) — final change-gate (G1 + four-chain) for issue #579

Read-only; touched zero repo files.

### 1. Prior blocking finding — RESOLVED
Forge active-folders ports now mirror canonical liveness-marker parsing in both seams:
- gitlab kaola-gitlab-workflow-active-folders.js: parseStateFile (~L186-191) returns main_root/session_marker/claim_ts; readActiveFolders item (~L251-254) surfaces all three. Forge-specific fields retained (mr_url, mr_iid, project_id, path_with_namespace, project_web_url).
- gitea kaola-gitea-workflow-active-folders.js: same two seams (~L186-191, L249-252). Forge-specific fields retained (pr_number via firstPositiveInteger, full_name, project_html_url, pr_url).
Real end-to-end data path: forge claim.js stamps markers at writeState (gitea :507-509, gitlab :510-512); forge classifier classifyLane consumes session_marker===ownSession→mine (gitlab/gitea L751-752, byte-identical regions). Forge suites gained RED→GREEN integration assertions exercising the full path: testGitlabActiveFoldersSessionMarker579 (~L4707), testGiteaActiveFoldersSessionMarker579 (~L4649), wired into the acceptance chain (simulate-gitlab-workflow-walkthrough.js:1520 + gitea analog spawn test-*-workflow-scripts.js via execFileSync that re-throws on child failure). Ran both directly → PASSED.

### 2. Incremental G1 re-review (forge fix only) — clean
Added fields use the same field(...)||'' parse + state.x||'' surface double-guard as canonical (backward-compat empty string for pre-#579 state) — rename-normalized parity, no logic drift. No forge-specific field dropped; no cross-edition leakage. Provenance scan of all touched agent-facing prompt surfaces (issue-scout.toml×3, issue-scout.md, adapt/finalize commands+SKILLs ×3 editions): zero #NNN/D-NNN-NN/INV/ADR refs (the #579 markers live only in script comments + test assertions, non-prompt surfaces, allowed). No new prose.

### 3. Contract validators — all pass
validate-script-sync.js (25 byte-identical groups, 7 forge export-superset families); edition-sync.js --check (12 forge ports parity); validate-workflow-contracts.js; validate-kaola-workflow-contracts.js.

### 4. Four-chain mechanical acceptance (#307, serial) — ALL GREEN, FOUR_CHAIN_EXIT=0
- claude → pass (claim-hardening 149 assertions, testTwoLanesInOneCheckout579 PASSED, walkthrough passed)
- codex → pass (Kaola-Workflow walkthrough passed)
- gitlab → pass (GitLab + GitLab-Codex walkthroughs passed; spawned forge 579 test passed)
- gitea → pass (Gitea + Gitea-Codex walkthroughs passed; spawned forge 579 test passed)

### Findings: CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0. Non-blocking observations: none.

verdict: pass
findings_blocking: 0
