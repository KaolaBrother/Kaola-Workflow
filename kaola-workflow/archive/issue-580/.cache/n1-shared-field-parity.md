evidence-binding: n1-shared-field-parity 1c649110c365

RED: test_active_folders_field_parity — pre-constant run (SHARED_STATE_FIELDS not yet in schema):
  $ node scripts/test-active-folders-field-parity.js
  FAIL: SHARED_STATE_FIELDS must be a frozen array of 13 fields; got: undefined
  active-folders-field-parity tests FAILED (1 failures, 0 passed)
  exit 1
  (The constant did not exist in module.exports; the guard assertion failed immediately.)

REGRESSION-FIRE proof (non-vacuity): scratch copy of canonical active-folders with
session_marker removed from the returned item (not from parseStateFile — the parser
still reads it, but the surfaced item no longer carries it). Parity probe detects:
  REGRESSION-FIRE: gate detected missing/wrong fields: session_marker
  (probe exit:0, meaning the gate correctly reported the gap)
Scratch copy in $TMPDIR; real port files are UNCHANGED.

GREEN: test_active_folders_field_parity — post-constant run (SHARED_STATE_FIELDS added to all 4 schema copies):
  $ node scripts/test-active-folders-field-parity.js
  active-folders-field-parity tests passed (61 assertions)
  exit 0
  Breakdown: 1 constant-guard + 4 editions × (1 function-check + 1 folder-count + 13 field-assertions) = 61/61 green.

Confirmed module paths and readActiveFolders signatures:
  claude/canonical : scripts/kaola-workflow-active-folders.js — readActiveFolders(root, options)
  codex            : plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js — same signature
  gitlab           : plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js — same signature
  gitea            : plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js — same signature
  All four accept { excludeClosedIssues: false } which suppresses all remote (gh/glab/tea) calls.

Surfaced property names (state-file key → item property, same in all 4 editions):
  issue_number   → issue_number  (int; gitlab/gitea parse via issue_iid fallback then issue_number)
  phase          → phase         (int)
  issue_numbers  → issue_numbers (int[]; comma-separated string parsed to array)
  status         → status        (string; default 'unknown' when absent)
  bundle_id      → bundle_id
  closure_policy → closure_policy
  next_command   → next_command
  branch         → branch
  worktree_path  → worktree_path
  sink           → sink          (string; default 'merge' when absent)
  main_root      → main_root
  session_marker → session_marker
  claim_ts       → claim_ts

Byte-identity: all 4 schema copies identical after edit (diff exit 0 for all pairs).
Sync validator: node scripts/validate-script-sync.js → OK: 25 common scripts, 25 byte-identical groups … in sync.
package.json: && node scripts/test-active-folders-field-parity.js appended to all four chains.
git status: exactly 5 M-files (4 schema + package.json) + 1 new test file; active-folders ports UNCHANGED.
