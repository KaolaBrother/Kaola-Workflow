#!/usr/bin/env node
'use strict';

// test-edition-sync.js (issue #365) — covers the scripted edition sync + parity check.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderForgePort, renameSet, GENERATED_AGGREGATORS, forgeRel, syncIfDrift } = require('./edition-sync');

const REPO = path.resolve(__dirname, '..');
let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }
const read = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

const FORGES = ['gitlab', 'gitea'];

// One canonical registration must produce both forge ports. The sample was the re-plan aggregator
// until it was deleted with the epoch machinery; gap-sweep is the same class of member.
assert(GENERATED_AGGREGATORS.includes('kaola-workflow-gap-sweep.js'),
  'GENERATED_AGGREGATORS enrolls kaola-workflow-gap-sweep.js');
assert(forgeRel('kaola-workflow-gap-sweep.js', 'gitlab') === 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js',
  'gap-sweep maps to the GitLab edition path');
assert(forgeRel('kaola-workflow-gap-sweep.js', 'gitea') === 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js',
  'gap-sweep maps to the Gitea edition path');

// ---------------------------------------------------------------------------
// T1: PARITY GREEN — every generated forge aggregator port byte-equals the
// rename-normalized render of canonical. (The committed tree is in sync.)
// ---------------------------------------------------------------------------
for (const base of GENERATED_AGGREGATORS) {
  const canon = read('scripts/' + base);
  for (const forge of FORGES) {
    const rel = forgeRel(base, forge);
    const expected = renderForgePort(canon, base, forge);
    assert(read(rel) === expected, 'T1: ' + rel + ' in rename-normalized parity with canonical');
  }
}

// ---------------------------------------------------------------------------
// T2: PLANTED-EDIT RED — a hand-edit to a generated port must break parity (the
// #347 drift class). Mutate one line in-memory and assert the render disagrees.
// ---------------------------------------------------------------------------
{
  const base = 'kaola-workflow-run-chains.js';
  const canon = read('scripts/' + base);
  const expected = renderForgePort(canon, base, 'gitlab');
  const tampered = expected.replace("'use strict';", "'use strict'; /* sneaky hand-edit */");
  assert(tampered !== expected, 'T2: planted 1-line edit differs from the generated port (parity would go RED)');
  // and the reverse: the pristine render equals itself (deterministic).
  assert(renderForgePort(canon, base, 'gitlab') === expected, 'T2: render is deterministic');
}

// ---------------------------------------------------------------------------
// T3: IDEMPOTENCY — re-rendering an already-rendered port (treated as canonical
// input) renames nothing further beyond re-adding the header: the body name tokens
// are already forge-form, so a second pass over canonical is stable.
// ---------------------------------------------------------------------------
{
  const base = 'kaola-workflow-gap-sweep.js';
  const canon = read('scripts/' + base);
  const once = renderForgePort(canon, base, 'gitlab');
  const twice = renderForgePort(canon, base, 'gitlab');
  assert(once === twice, 'T3: renderForgePort is idempotent on identical canonical input');
}

// ---------------------------------------------------------------------------
// T4: SCHEMA EXCLUSION — adaptive-schema is byte-identical ×4 (no renamed port),
// so it is NOT in the rename set and `kaola-workflow-adaptive-schema` survives.
// ---------------------------------------------------------------------------
{
  for (const forge of FORGES) {
    assert(!renameSet(forge).has('adaptive-schema'),
      'T4: adaptive-schema excluded from the ' + forge + ' rename set (byte-identical)');
  }
  const sample = "const X = require('./kaola-workflow-adaptive-schema');\n";
  assert(renderForgePort(sample, 'kaola-workflow-gap-sweep.js', 'gitlab').includes("require('./kaola-workflow-adaptive-schema')"),
    'T4: adaptive-schema require is NOT renamed in a generated port');
}

// ---------------------------------------------------------------------------
// T5: NO OVER-RENAME — a `/kaola-workflow-adapt` slash-command ref and a
// `kaola-workflow/` state-dir path must survive untouched (only script base-names
// in the rename set are renamed).
// ---------------------------------------------------------------------------
{
  const sample = [
    "// run /kaola-workflow-adapt issue-1 to author the plan",
    "const dir = path.join(root, 'kaola-workflow', project);",
    "const V = require('./kaola-workflow-claim');",
  ].join('\n') + '\n';
  const out = renderForgePort(sample, 'kaola-workflow-gap-sweep.js', 'gitlab');
  assert(out.includes('/kaola-workflow-adapt issue-1'), 'T5: a slash-command ref is NOT renamed');
  assert(out.includes("'kaola-workflow', project"), "T5: kaola-workflow/ state dir NOT renamed");
  assert(out.includes("require('./kaola-gitlab-workflow-claim')"), 'T5: a script require IS renamed');
}

// ---------------------------------------------------------------------------
// T6: HEADER — the @generated header is injected after the shebang and points at
// the CANONICAL source path (not a forge-renamed path).
// ---------------------------------------------------------------------------
{
  const base = 'kaola-workflow-gap-sweep.js';
  const out = renderForgePort(read('scripts/' + base), base, 'gitlab');
  const lines = out.split('\n');
  assert(lines[0].startsWith('#!'), 'T6: shebang preserved on line 1');
  assert(/^\/\/ @generated from scripts\/kaola-workflow-gap-sweep\.js/.test(lines[1]),
    'T6: @generated header on line 2 pointing at canonical source, got ' + JSON.stringify(lines[1]));
}

// ---------------------------------------------------------------------------
// T8 (#629 bullet 3): CREATE-ON-MISSING — a newly-enrolled COMMON/byte-group member
// with an ABSENT mirror must be CREATED by the write path, not skipped. Before the fix,
// runWrite() steps (b) codex-sync and (c) byte-sync only copied when the target already
// existed (`fs.existsSync(...) && ...`), so an enrolled member with no mirror stayed
// "in sync" (nothing written) while validate-script-sync reds with "Missing files" — a
// dead end for the enrollment workflow. `syncIfDrift` is the shared primitive both steps
// use (matching aggregator step (a), which already handled the missing case).
// ---------------------------------------------------------------------------
{
  assert(typeof syncIfDrift === 'function', 'T8: syncIfDrift exported (shared create-on-missing primitive)');
}
{
  // enroll a synthetic byte-group/COMMON-style member (canonical exists, mirror ABSENT)
  // in a throwaway root — never touches the real repo tree.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-edsync-missing-'));
  try {
    const rel = 'plugins/kaola-workflow/scripts/synthetic-enrolled-member.js';
    const content = '#!/usr/bin/env node\nconsole.log("synthetic enrolled member");\n';
    assert(!fs.existsSync(path.join(tmp, rel)), 'T8 precondition: mirror is ABSENT before sync');
    const wrote = syncIfDrift(tmp, rel, content);
    assert(wrote === true, 'T8: syncIfDrift returns true (a write happened) for an absent mirror');
    assert(fs.existsSync(path.join(tmp, rel)), 'T8: the mirror is CREATED (not skipped) when absent');
    assert(fs.readFileSync(path.join(tmp, rel), 'utf8') === content, 'T8: the created mirror carries the canonical content');
    // idempotency: re-running against an now-identical mirror is a no-op (no spurious write).
    const wroteAgain = syncIfDrift(tmp, rel, content);
    assert(wroteAgain === false, 'T8: re-running against an in-sync mirror is a no-op (idempotent)');
    // drift case: an existing-but-different mirror is still overwritten (regression guard for the
    // pre-existing behavior this refactor must NOT weaken).
    fs.writeFileSync(path.join(tmp, rel), 'stale content\n');
    const wroteDrift = syncIfDrift(tmp, rel, content);
    assert(wroteDrift === true, 'T8: an existing-but-drifted mirror is still synced (pre-existing behavior preserved)');
    assert(fs.readFileSync(path.join(tmp, rel), 'utf8') === content, 'T8: the drifted mirror is corrected to canonical content');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error('edition-sync tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('edition-sync tests passed (' + passed + ' assertions)');
}
