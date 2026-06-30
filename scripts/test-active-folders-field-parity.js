#!/usr/bin/env node
'use strict';

// Behavior-parity gate for cross-edition active-folders parsers.
// Asserts every SHARED_STATE_FIELDS key is surfaced by readActiveFolders()
// across the four editions (claude/canonical, codex, gitlab, gitea).
// Driven by the single-source SHARED_STATE_FIELDS constant so a future key
// automatically extends coverage without editing this file.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Prevent accidental remote (gh / glab / tea) calls in all active-folders modules.
process.env.KAOLA_WORKFLOW_OFFLINE = '1';

const { SHARED_STATE_FIELDS } = require('./kaola-workflow-adaptive-schema.js');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

// ---- constant guard: must exist and have the right length --------------------
assert(Array.isArray(SHARED_STATE_FIELDS) && SHARED_STATE_FIELDS.length === 13,
  'SHARED_STATE_FIELDS must be a frozen array of 13 fields; got: ' + SHARED_STATE_FIELDS);

// ---- four editions -----------------------------------------------------------
const EDITIONS = [
  {
    label: 'claude/canonical',
    modulePath: path.join(__dirname, 'kaola-workflow-active-folders.js'),
  },
  {
    label: 'codex',
    modulePath: path.join(__dirname, '../plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js'),
  },
  {
    label: 'gitlab',
    modulePath: path.join(__dirname, '../plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js'),
  },
  {
    label: 'gitea',
    modulePath: path.join(__dirname, '../plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js'),
  },
];

// ---- sentinels ---------------------------------------------------------------
// Non-vacuous choices:
//   issue_number, phase    — distinct positive ints (not equal; not null)
//   issue_numbers          — multi-element int array (distinct elements, distinct from issue_number/phase)
//   status                 — 'active' (NOT the default 'unknown', so a missing field can't silently pass)
//   sink                   — 'squash' (NOT the default 'merge', same discipline)
//   all string fields      — distinct non-empty sentinel strings
const SENTINEL = {
  issue_number:   42,
  phase:          3,
  issue_numbers:  [10, 20],
  status:         'active',          // not 'unknown'
  bundle_id:      'bundle-sentinel-580',
  closure_policy: 'close-with-issue',
  next_command:   '/sentinel-cmd-580',
  branch:         'workflow/sentinel-580',
  worktree_path:  '/sentinel/wt/580',
  sink:           'squash',          // not 'merge'
  main_root:      '/sentinel/main/580',
  session_marker: 's-sentinel-580',
  claim_ts:       '2024-01-01T00:00:00.000Z',
};

// Build a workflow-state.md line-based content populating all 13 shared fields.
function makeStateContent(s) {
  return [
    'issue_number: '   + s.issue_number,
    'phase: '          + s.phase,
    'issue_numbers: '  + s.issue_numbers.join(', '),
    'status: '         + s.status,
    'bundle_id: '      + s.bundle_id,
    'closure_policy: ' + s.closure_policy,
    'next_command: '   + s.next_command,
    'branch: '         + s.branch,
    'worktree_path: '  + s.worktree_path,
    'sink: '           + s.sink,
    'main_root: '      + s.main_root,
    'session_marker: ' + s.session_marker,
    'claim_ts: '       + s.claim_ts,
  ].join('\n') + '\n';
}

// ---- parity loop (guarded: only runs when the constant exists) ---------------
if (Array.isArray(SHARED_STATE_FIELDS)) {
  const stateContent = makeStateContent(SENTINEL);

  for (const ed of EDITIONS) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-parity-580-'));
    try {
      // Build <tmpRoot>/kaola-workflow/parity-probe/workflow-state.md
      const kwDir = path.join(tmpRoot, 'kaola-workflow', 'parity-probe');
      fs.mkdirSync(kwDir, { recursive: true });
      fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), stateContent);

      // Load the edition's readActiveFolders
      let readActiveFolders;
      try {
        readActiveFolders = require(ed.modulePath).readActiveFolders;
      } catch (e) {
        assert(false, ed.label + ': failed to require module: ' + e.message);
        continue;
      }
      assert(typeof readActiveFolders === 'function',
        ed.label + ': readActiveFolders must be a function');
      if (typeof readActiveFolders !== 'function') continue;

      // Call with excludeClosedIssues:false — hermetic (no remote round-trip).
      const folders = readActiveFolders(tmpRoot, { excludeClosedIssues: false });
      assert(folders.length === 1,
        ed.label + ': expected 1 active folder, got ' + folders.length);
      if (folders.length < 1) continue;

      const f = folders[0];

      // Assert every SHARED_STATE_FIELDS key is surfaced with its sentinel value.
      for (const key of SHARED_STATE_FIELDS) {
        const expected = SENTINEL[key];
        const actual = f[key];
        if (key === 'issue_numbers') {
          // Parsed as int array; compare via JSON.
          assert(JSON.stringify(actual) === JSON.stringify(expected),
            ed.label + ': issue_numbers mismatch; expected ' +
              JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
        } else {
          assert(actual === expected,
            ed.label + ': ' + key + ' mismatch; expected ' +
              JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
        }
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
}

// ---- result ------------------------------------------------------------------
if (failed > 0) {
  console.error('active-folders-field-parity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('active-folders-field-parity tests passed (' + passed + ' assertions)');
}
