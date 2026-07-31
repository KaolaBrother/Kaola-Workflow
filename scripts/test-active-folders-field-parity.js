#!/usr/bin/env node
'use strict';

// Behavior-parity gate for cross-edition active-folders parsers.
// Asserts every SHARED_STATE_FIELDS key is surfaced by readActiveFolders()
// across the four editions (claude/canonical, codex, gitlab, gitea).
//
// Non-vacuity is mechanical here, never a claim in a comment:
//  (1) the contract key SET and the sentinel key SET must be EQUAL — a field
//      RENAMED in SHARED_STATE_FIELDS can no longer pass as `undefined === undefined`,
//      and a field ADDED or DELETED there reds the same assertion;
//  (2) the probe workflow-state.md is SERIALIZED FROM the contract, so a rename
//      renames the parsed line too and every parser must have been renamed with it;
//  (3) a negative control — an active folder whose state file carries NO shared-field
//      lines — proves, per edition and per field, that the sentinel differs from the
//      value an ABSENT field yields, so "surfaced" is distinguishable from "defaulted".
// There is deliberately NO field-count integer: bumping a number cannot restore green.
// A new shared field greens only by declaring a discriminating sentinel and having all
// four parsers actually surface it.

const fs = require('fs');
const os = require('os');
const path = require('path');

// Prevent accidental remote (gh / glab / tea) calls in all active-folders modules.
process.env.KAOLA_WORKFLOW_OFFLINE = '1';

const { SHARED_STATE_FIELDS } = require('./kaola-workflow-adaptive-schema.js');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

// Array-aware equality (issue_numbers is parsed into an int array).
function equal(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

// ---- constant guard: shape only, no bumpable count ---------------------------
assert(Array.isArray(SHARED_STATE_FIELDS) && Object.isFrozen(SHARED_STATE_FIELDS) &&
  SHARED_STATE_FIELDS.length > 0,
  'SHARED_STATE_FIELDS must be a non-empty frozen array; got: ' + JSON.stringify(SHARED_STATE_FIELDS));
assert(Array.isArray(SHARED_STATE_FIELDS) &&
  new Set(SHARED_STATE_FIELDS).size === SHARED_STATE_FIELDS.length,
  'SHARED_STATE_FIELDS must not repeat a field name (a duplicate hides inside a key-set compare): ' +
    JSON.stringify(SHARED_STATE_FIELDS));

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
// Every value must differ from what the field yields when ABSENT; that is not
// asserted here in prose — the negative control below proves it per edition.
const SENTINEL = {
  issue_number:   42,
  phase:          3,
  issue_numbers:  [10, 20],
  status:         'active',
  bundle_id:      'bundle-sentinel-580',
  closure_policy: 'close-with-issue',
  next_command:   '/sentinel-cmd-580',
  branch:         'workflow/sentinel-580',
  worktree_path:  '/sentinel/wt/580',
  sink:           'squash',
  main_root:      '/sentinel/main/580',
  session_marker: 's-sentinel-580',
  claim_ts:       '2024-01-01T00:00:00.000Z',
};

// ---- contract ↔ sentinel key-SET equality ------------------------------------
// The defect this replaces: the per-key loop compared SENTINEL[key] to folder[key],
// so a field renamed in the contract compared undefined to undefined and PASSED on
// all four editions. Comparing SETS makes presence/absence the assertion.
{
  const contractKeys = Array.isArray(SHARED_STATE_FIELDS) ? SHARED_STATE_FIELDS : [];
  const sentinelKeys = Object.keys(SENTINEL);
  const unexercised = contractKeys.filter(k => !sentinelKeys.includes(k)).sort();
  const stranded = sentinelKeys.filter(k => !contractKeys.includes(k)).sort();
  assert(unexercised.length === 0 && stranded.length === 0,
    'SHARED_STATE_FIELDS and the sentinel set must name exactly the same fields' +
    (unexercised.length ? ' — contract fields with no sentinel (unexercised): ' + unexercised.join(', ') : '') +
    (stranded.length ? ' — sentinels naming no contract field (renamed or deleted): ' + stranded.join(', ') : ''));
}

// Serialize the probe state file FROM the contract, so the field names written to
// workflow-state.md are the contract's names — never a hand-kept second list that
// would keep passing after a rename.
function makeStateContent(fields, s) {
  return fields.map(key => {
    const value = s[key];
    return key + ': ' + (Array.isArray(value) ? value.join(', ') : String(value));
  }).join('\n') + '\n';
}

// An active folder whose state file declares none of the shared fields: every field
// comes back as its parser default (or absent). This is the discrimination baseline.
const NEGATIVE_CONTROL_STATE = '# negative control: no shared-field lines\n';

function makeProbeRoot(stateContent) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-parity-580-'));
  const kwDir = path.join(tmpRoot, 'kaola-workflow', 'parity-probe');
  fs.mkdirSync(kwDir, { recursive: true });
  fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), stateContent);
  return tmpRoot;
}

// ---- parity loop (guarded: only runs when the constant exists) ---------------
if (Array.isArray(SHARED_STATE_FIELDS)) {
  const stateContent = makeStateContent(SHARED_STATE_FIELDS, SENTINEL);

  for (const ed of EDITIONS) {
    const populatedRoot = makeProbeRoot(stateContent);
    const absentRoot = makeProbeRoot(NEGATIVE_CONTROL_STATE);
    try {
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
      const folders = readActiveFolders(populatedRoot, { excludeClosedIssues: false });
      assert(folders.length === 1,
        ed.label + ': expected 1 active folder, got ' + folders.length);
      const absentFolders = readActiveFolders(absentRoot, { excludeClosedIssues: false });
      assert(absentFolders.length === 1,
        ed.label + ': expected 1 active folder for the negative control, got ' + absentFolders.length);
      if (folders.length < 1 || absentFolders.length < 1) continue;

      const f = folders[0];
      const absent = absentFolders[0];

      // Assert every SHARED_STATE_FIELDS key is surfaced with its sentinel value,
      // AND that the sentinel is distinguishable from the field's absent value.
      for (const key of SHARED_STATE_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(SENTINEL, key)) {
          assert(false, ed.label + ': contract field "' + key +
            '" has no sentinel — comparing it would be vacuous');
          continue;
        }
        const expected = SENTINEL[key];
        assert(equal(f[key], expected),
          ed.label + ': ' + key + ' not surfaced; expected ' +
            JSON.stringify(expected) + ', got ' + JSON.stringify(f[key]));
        assert(!equal(absent[key], expected),
          ed.label + ': ' + key + ' sentinel ' + JSON.stringify(expected) +
            ' is indistinguishable from its absent-field value ' + JSON.stringify(absent[key]) +
            ' — the parity assertion above would pass on a field the parser never read');
      }
    } finally {
      fs.rmSync(populatedRoot, { recursive: true, force: true });
      fs.rmSync(absentRoot, { recursive: true, force: true });
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
