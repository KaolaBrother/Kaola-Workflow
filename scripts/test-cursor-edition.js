#!/usr/bin/env node
'use strict';
// Child processes in this file are classified per site (ADR 0013). The ratchet
// reads the spawn line or the line above it. Two classes appear here:
//   environment    installer / --write materialize / TREE_ROOT git probe
//   cli-contract   --check / --help / unknown --forge refuse / --print-tree-root

// ---------------------------------------------------------------------------
// test-cursor-edition.js — structural + parity validator for the Cursor
// runtime edition. Hand-rolled asserts (no framework). Mirror of
// test-grok-edition.js, scoped to the additive cursor surface. Run directly:
//   node scripts/test-cursor-edition.js
//
// Cursor is a coding-agent RUNTIME, not a forge, and it does not ride
// install.sh / edition-sync.js / npm test. It is delivered the Cursor-native
// way: flat commands under `.cursor/commands/<name>.md`. The machine-global contract
// transaction owns the one always-applied Rule; this edition owns no duplicate
// project Rule, hook declaration, or hook subprocess.
// Kaola-Workflow ships no Cursor agents and pins no subagent model (#1101): subagents are Cursor's
// own Task types from the live catalog. The generated tree's agents/ directory is a retired
// surface that --check flags and --write prunes, and a receipt that owned agents/*.md from an
// earlier release loses its unchanged ones on reinstall. Compact recovery is carried by the global
// transaction for standalone CLI, App local, and Cloud materialization; ordinary tool use has no
// Kaola injection.
//
// Outside `npm test`, the forge chains, and the fast gate: an additive
// runtime edition is not a forge. The script exists so the suite is
// runnable and discoverable by name rather than only by remembering the path.
// ---------------------------------------------------------------------------

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const forgeLayout = require('./runtime-edition-forge.js');
const adapterFacts = require('./runtime-adapter-facts.js');
const G = require('./test-git-fixture');
const syncMod = require('./sync-cursor-edition.js');
const cursorSurface = require('./kaola-workflow-cursor-surface.js');
const globalContract = require('./kaola-workflow-global-contract.js');

const REPO = path.resolve(__dirname, '..');
const SYNC_JS = path.join(REPO, 'scripts', 'sync-cursor-edition.js');
const INSTALLER = path.join(REPO, 'install-cursor.sh');
const DEFAULT_FORGE = 'github';

// #975: a fixture root must not resolve against the CURRENT DIRECTORY.
// `os.tmpdir()` returns TMPDIR verbatim, so TMPDIR=. makes every root here
// relative and every fixture lands in the checkout. A relative TMPDIR is
// treated as unset — `/tmp` is what os.tmpdir() itself falls back to.
function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

// ---------------------------------------------------------------------------
// TREE_ROOT — the checkout the GENERATED tree lives in, which is NOT where the
// canonical sources are read from. Under a linked worktree the two differ.
// COMPUTED HERE RATHER THAN IMPORTED: this is a second, independent statement
// of where the tree belongs, and it is what keeps D1 able to fail.
// ---------------------------------------------------------------------------
const TREE_ROOT = (() => {
  // An explicit isolated root bound to THIS checkout wins, as in the generators: both
  // KAOLA_EDITION_TREE_ROOT and KAOLA_EDITION_TREE_FOR absolute, the latter naming REPO.
  {
    const root = process.env.KAOLA_EDITION_TREE_ROOT;
    const forRepo = process.env.KAOLA_EDITION_TREE_FOR;
    const real = p => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
    if (root && forRepo && path.isAbsolute(root) && path.isAbsolute(forRepo)
        && real(forRepo) === real(REPO)) return path.resolve(root);
  }
  // spawn-class: environment
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) return REPO;
  const common = String(r.stdout || '').trim();
  if (!common) return REPO;
  const abs = path.resolve(REPO, common);
  return path.basename(abs) === '.git' ? path.dirname(abs) : REPO;
})();

function treeLabel(forge) {
  return '.cursor' + forgeLayout.outSuffix(forge);
}

const TREE_LABELS = new Set(forgeLayout.FORGES.map(f => treeLabel(f)));
const rootOf = rel => (TREE_LABELS.has(String(rel).split(/[\\/]/)[0]) ? TREE_ROOT : REPO);
const read = rel => fs.readFileSync(path.join(rootOf(rel), rel), 'utf8');
const exists = rel => fs.existsSync(path.join(rootOf(rel), rel));
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++; console.error('FAIL: ' + msg);
}

function runGenerator(args) {
  // spawn-class: environment
  return spawnSync(process.execPath, [SYNC_JS].concat(args), { encoding: 'utf8' });
}
function runGeneratorCli(args) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [SYNC_JS].concat(args), { encoding: 'utf8' });
}

function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { fm: {}, raw: '', body: String(text) };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  return { fm, raw: m[1], body: String(text).slice(m[0].length) };
}

function walkFiles(absDir, relDir) {
  const out = [];
  if (!fs.existsSync(absDir)) return out;
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? relDir + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walkFiles(path.join(absDir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function generatedTreeFiles(label) {
  return walkFiles(path.join(TREE_ROOT, label), label);
}

const CURSOR_RECOVERY_RULE = syncRecoveryRuleName();
const CURSOR_GLOBAL_RULE = 'kaola-workflow-global.mdc';

function syncRecoveryRuleName() {
  // Keep the acceptance file independent of a hand-written production path while still
  // failing closed if the renderer forgets to expose the named project rule.
  return String(syncMod.RECOVERY_RULE || 'kaola-workflow-compact-recovery.mdc');
}

function parseCursorHooksJson(text) {
  try { return JSON.parse(String(text)); } catch (_) { return null; }
}

function cursorHookRows(mapping) {
  const hooks = mapping && mapping.hooks && typeof mapping.hooks === 'object'
    && !Array.isArray(mapping.hooks) ? mapping.hooks : {};
  return Object.entries(hooks).flatMap(([event, rows]) =>
    Array.isArray(rows) ? rows.map(row => ({ event, row })) : []);
}

function kaolaHookRows(mapping) {
  return cursorHookRows(mapping).filter(({ row }) => /kaola-workflow(?:[-/]|\b)/i.test(
    JSON.stringify(row || {})));
}

function renderedGlobalRule() {
  const registry = JSON.parse(fs.readFileSync(path.join(REPO,
    'templates', 'global', 'runtime-contract-adapters.json'), 'utf8'));
  const target = registry.targets.find(row => row.id === 'cursor-cli-local');
  const source = fs.readFileSync(path.join(REPO,
    'templates', 'global', 'kaola-workflow-global.md'), 'utf8');
  return globalContract.renderContract({ source, target }).toString('utf8');
}

function recoveryRuleVerdict(text) {
  const source = String(text || '');
  const frontmatter = parseFrontmatter(source).fm;
  const errors = [];
  if (frontmatter.alwaysApply !== 'true') errors.push('frontmatter alwaysApply: true is missing');
  if (!/KW-COMPACT-RECOVERY-V2/.test(source)) {
    errors.push('shared compact-recovery sentinel is missing');
  }
  if (!/Workflow\s+Next/i.test(source)) errors.push('Workflow Next recovery root is missing');
  if (!/Finalization/i.test(source)) errors.push('Finalization recovery root is missing');
  if (!/Runtime dispatch contract \(always loaded\)/i.test(source)) {
    errors.push('always-loaded dispatch contract is missing');
  }
  for (const term of ['outcome', 'evidence', 'worktree or commit', 'custody', 'stop condition']) {
    if (!new RegExp(term, 'i').test(source)) {
      errors.push('always-loaded dispatch contract is missing its ' + term + ' boundary');
    }
  }
  if (!/CLI, App local, and App Cloud are separate hosts/i.test(source)) {
    errors.push('the runtime adapter does not keep CLI, App local, and Cloud distinct');
  }
  return { ok: errors.length === 0, errors, frontmatter };
}

function noKaolaCursorHooks(mapping, label) {
  const parsed = mapping && typeof mapping === 'object' ? mapping : null;
  assert(parsed && parsed.version === 1,
    label + ': hooks.json is valid Cursor version 1 JSON');
  assert(parsed && parsed.hooks && typeof parsed.hooks === 'object'
    && !Array.isArray(parsed.hooks),
  label + ': hooks.json has an object-valued hooks member');
  assert(kaolaHookRows(parsed).length === 0,
    label + ': no Kaola hook rows are declared');
  assert(parsed && parsed.hooks && Object.keys(parsed.hooks).length === 0,
    label + ': hooks member is empty — ordinary tool use has no Kaola subprocess/context');
  return parsed;
}

// Path B was the retired built-in-only catalog-miss relation ("omit-model is the parent, not a
// profile pin"). With no Kaola profile there is no pin to contrast (#1101): the always-loaded Rule
// and the generated commands must carry no such relation, and the Rule instead states the
// native-only rule. The detector stays so a reintroduced relation is observed, not assumed away.
const PATH_B_COMMANDS = Object.freeze(['workflow-next', 'kaola-workflow-finalize']);
const NATIVE_ONLY_STATEMENTS = Object.freeze([
  'Kaola-Workflow defines no subagent roles, role profiles, or subagent model and effort bindings.',
  'Kaola-Workflow installing no profiles is never evidence that the host lacks subagent capability.',
]);
// The seven Kaola roles retired by #1101, named only so this suite can prove none returns.
const RETIRED_ROLES = Object.freeze([
  'code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide',
]);
const RETIRED_ROLE_RE = new RegExp('\\b(?:' + RETIRED_ROLES.join('|') + ')\\b');
const VENDOR_SLUG = /\bgrok-4\.\d\b|\bgrok-build\b/;

function normalizePathBTerm(value) {
  return String(value || '').replace(/[\`'"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/^(?:a|an|the)\s+/, '');
}

function pathBRelations(text) {
  return String(text || '').split(/\r?\n/).map((line, index) => {
    if (!/\bbuilt-in-only\b/i.test(line) || !/\bomit-model\b/i.test(line)) return null;
    const m = line.match(/\bomit-model\s+is\s+the\s+([^,.;]+?)\s*,\s*not\s+(?:a\s+)?([^,.;]+)/i);
    return {
      lineNumber: index + 1,
      line,
      positive: m ? normalizePathBTerm(m[1]) : null,
      negative: m ? normalizePathBTerm(m[2]) : null,
    };
  }).filter(Boolean);
}

function inspectPathBConsumers(root) {
  const errors = [];
  const relations = {};
  for (const name of PATH_B_COMMANDS) {
    const rel = path.join('.cursor', 'commands', name + '.md');
    const absolute = path.join(root, rel);
    if (!fs.existsSync(absolute)) {
      errors.push(name + ': missing generated consumer ' + rel);
      continue;
    }
    const found = pathBRelations(fs.readFileSync(absolute, 'utf8'));
    relations[name] = found;
    if (found.length !== 0) {
      errors.push(name + ': carries ' + found.length + ' retired built-in-only omit-model relation(s)');
    }
  }
  return { ok: errors.length === 0, errors, relations };
}

// The always-loaded Rule's native-only verdict: it states both native-only sentences and carries
// no omit-model/profile-pin relation, no vendor model slug, and no retired role name.
function nativeDispatchRuleVerdict(ruleText) {
  const text = String(ruleText || '');
  const errors = [];
  for (const statement of NATIVE_ONLY_STATEMENTS) {
    if (!text.includes(statement)) errors.push('missing native-only statement ' + JSON.stringify(statement));
  }
  const relations = pathBRelations(text);
  if (relations.length) errors.push('carries ' + relations.length + ' retired omit-model/profile-pin relation(s)');
  const slug = text.match(VENDOR_SLUG);
  if (slug) errors.push('names vendor model slug ' + slug[0]);
  const role = text.match(RETIRED_ROLE_RE);
  if (role) errors.push('names retired role ' + role[0]);
  return { ok: errors.length === 0, errors };
}

// Issue #1052: executable Workflow startup/resume is the skip-proof for standalone
// CLI Repo prep. Next must describe that program order. Shared negatives (App/Cloud, no
// ambient cwd, no sessionStart, fail-closed install faults) stay required on Next. The
// Finalize pre-dispatch ensure existed only to materialize named role profiles before a
// named dispatch (#1101 retired both), so Finalize must carry no such section.
const CURSOR_CLI_MATERIALIZATION_COMMANDS = Object.freeze([
  'workflow-next',
  'kaola-workflow-finalize',
]);

function cursorCliMaterializationSurface(name) {
  return name === 'workflow-next' ? 'next' : 'finalize';
}

function cursorCliSharedHostNegatives(block, errors) {
  if (!/only when[^.]*standalone Cursor CLI[^.]*local host/i.test(block)) {
    errors.push('materialization branch is not limited to standalone Cursor CLI local');
  }
  if (!/Cursor App[\s\S]{0,180}App-started Cloud[\s\S]{0,220}(?:do not|never) apply or infer[^.]*CLI materialization rule[^.]*App host/i.test(block)) {
    errors.push('App local and App-started Cloud do not retain a shared negative CLI-rule boundary');
  }
  if (!/Cursor App[\s\S]{0,180}App-started Cloud[^.]*separate hosts[^.]*inspect their live Task catalog/i.test(block)) {
    errors.push('App local and App-started Cloud are not separate live-catalog decisions');
  }
  if (!/never substitute an ambient cwd copier or a sessionStart materializer/i.test(block)) {
    errors.push('ambient and sessionStart materialization are not explicitly excluded');
  }
}

function namedForgeClaimScript(forge) {
  if (forge === 'gitlab') {
    return path.join(REPO, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js');
  }
  if (forge === 'gitea') {
    return path.join(REPO, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js');
  }
  // Generated GitHub Next binds CLAIM_JS to kaola-workflow-claim.js. Codex plugin
  // consumers resolve the COMMON_SCRIPTS copy, not the frozen scripts/ original.
  return path.join(REPO, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js');
}

function cursorCliNextEnsureLocator(block, errors) {
  const source = String(block || '');
  const heading = '## Cursor standalone CLI startup and resume Repo prep';
  const start = source.indexOf(heading);
  const appendix = start >= 0 ? source.slice(start) : source;
  if (/git\s+rev-parse\s+--show-toplevel/.test(appendix)) {
    errors.push('generated Next names git rev-parse --show-toplevel as the CLI workspace; resume/ensure locators are --cursor-workspace then recorded main_root');
  }
  if (!/--cursor-workspace/.test(appendix)) {
    errors.push('generated Next does not name --cursor-workspace as the explicit CLI workspace locator');
  }
  if (!/\bmain_root\b/.test(appendix)) {
    errors.push('generated Next does not name recorded main_root as the resume ensure locator');
  }
}

function cursorCliFailClosedInstallFaults(block, errors) {
  const flatBlock = String(block || '').replace(/\s+/g, ' ');
  const missingAt = flatBlock.indexOf('Missing or stale global authority');
  const collisionAt = flatBlock.indexOf('collision', missingAt);
  const symlinkAt = flatBlock.indexOf('symlink', collisionAt);
  const closedAt = flatBlock.indexOf('fails closed before project mutation', symlinkAt);
  if (!(missingAt >= 0 && collisionAt > missingAt && symlinkAt > collisionAt && closedAt > symlinkAt)) {
    errors.push('authority/collision/symlink failures are not specified as fail-closed');
  }
  if (/Task unsupported/i.test(block)) {
    errors.push('fail-closed install faults must not be classified as Task-unsupported');
  }
}

function cursorCliExecutableClaimLines(block, verb) {
  return String(block || '').split(/\r?\n/).filter(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--')) return false;
    return /\bnode\b/.test(line)
      && /\$CLAIM_JS/.test(line)
      && new RegExp('\\b' + verb + '\\b').test(line);
  });
}

function cursorCliBashFences(block) {
  const out = [];
  const re = /```(?:bash|sh)\n([\s\S]*?)```/g;
  let m;
  const source = String(block || '');
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

function cursorCliOperatorClaimLines(block, verb) {
  const fenced = [];
  for (const fence of cursorCliBashFences(block)) {
    fenced.push.apply(fenced, cursorCliExecutableClaimLines(fence, verb));
  }
  return fenced.length ? fenced : cursorCliExecutableClaimLines(block, verb);
}

function cursorCliLineHasExplicitCliLocalIdentity(line) {
  return /--runtime(?:\s+|=)cursor\b/.test(line)
    && /--product(?:\s+|=)cli\b/.test(line)
    && /--host(?:\s+|=)local\b/.test(line);
}

function cursorCliLineHasCursorWorkspace(line) {
  return /--cursor-workspace(?:\s+|=)/.test(line);
}

function cursorCliFenceHasExecutableHostGate(fence) {
  return String(fence || '').split(/\r?\n/).some(raw => {
    const line = String(raw || '').trim();
    if (!line || line.startsWith('#') || line.startsWith('<!--')) return false;
    return /^(if|elif|case)\b/.test(line) && /(product|host)/i.test(line);
  });
}

function cursorCliOperatorHostGate(block, errors) {
  const unguarded = cursorCliBashFences(block).filter(fence => {
    const stamped = cursorCliExecutableClaimLines(fence, 'startup')
      .concat(cursorCliExecutableClaimLines(fence, 'resume'))
      .some(cursorCliLineHasExplicitCliLocalIdentity);
    return stamped && !cursorCliFenceHasExecutableHostGate(fence);
  });
  if (unguarded.length) {
    errors.push('generated Next CLI startup/resume fence has no executable host/product if/case gate; host-negative prose is not a gate and App/Cloud compact-recovery still forges --product cli --host local');
  }
}

function cursorCliMaterializationVerdict(text, forge, surface) {
  const errors = [];
  const source = String(text || '');
  const kind = surface === 'next' ? 'next' : 'finalize';
  const block = source;
  const ensureCalls = block.split(/\r?\n/)
    .filter(line => /\bnode\b/.test(line) && /--ensure-target\b/.test(line));

  if (kind === 'finalize') {
    if (/## Cursor standalone CLI pre-dispatch materialization/.test(block)) {
      errors.push('Finalize still carries the retired pre-dispatch materialization section');
    }
    if (/--ensure-target\b/.test(block) || /CURSOR_MATERIALIZER/.test(block)) {
      errors.push('Finalize still runs a pre-dispatch --ensure-target materialization');
    }
    if (/named Kaola child dispatch|do not impersonate|Repo role prep/i.test(block)) {
      errors.push('Finalize still conditions dispatch on a named Kaola role');
    }
    if (/^(?:Agent|Task)\(/m.test(block) || /subagent_type\s*=/.test(block)) {
      errors.push('Finalize still carries a role dispatch call card');
    }
    return { ok: errors.length === 0, errors, block, ensureCalls };
  }

  {
    if (!/\bstartup\b/i.test(block) || !/\bresume\b/i.test(block)) {
      errors.push('Next does not state that Workflow startup and resume execute Repo prep');
    }
    const startupLines = cursorCliOperatorClaimLines(block, 'startup')
      .filter(line => /--runtime(?:\s+|=)cursor\b/.test(line));
    if (startupLines.length === 0) {
      errors.push('generated Next startup does not invoke executable claim.js startup --runtime cursor');
    }
    const cliStartup = startupLines.filter(cursorCliLineHasExplicitCliLocalIdentity);
    const appStartup = startupLines.filter(line => !cursorCliLineHasExplicitCliLocalIdentity(line));
    let firstStartupLine = '';
    for (const fence of cursorCliBashFences(block)) {
      const lines = cursorCliExecutableClaimLines(fence, 'startup')
        .filter(line => /--runtime(?:\s+|=)cursor\b/.test(line));
      if (lines.length) { firstStartupLine = lines[0]; break; }
    }
    if (firstStartupLine && cursorCliLineHasExplicitCliLocalIdentity(firstStartupLine)) {
      errors.push('default executable commands must not forge CLI identity; residual gated second fence is not the CLI-positive skip-proof');
    }
    if (startupLines.length > 0 && cliStartup.length > 0 && appStartup.length === 0) {
      errors.push('shared generated Next forges --product cli --host local for App/Cloud consumers of the same command file');
    }
    if (cliStartup.some(line => !cursorCliLineHasCursorWorkspace(line))) {
      errors.push('generated Next CLI startup omits --cursor-workspace on the operator argv');
    }
    const resumeLines = cursorCliOperatorClaimLines(block, 'resume');
    if (resumeLines.length === 0) {
      errors.push('generated Next resume/recovery does not invoke executable claim.js resume (helper-only or mission-list.md prose is not the subject)');
    }
    const cliResume = resumeLines.filter(cursorCliLineHasExplicitCliLocalIdentity);
    const appResume = resumeLines.filter(line => !cursorCliLineHasExplicitCliLocalIdentity(line));
    if (resumeLines.length > 0 && cliResume.length > 0 && appResume.length === 0) {
      errors.push('shared generated Next forges --product cli --host local on resume for App/Cloud consumers of the same command file');
    }
    if (cliResume.some(line => !cursorCliLineHasCursorWorkspace(line))) {
      errors.push('generated Next CLI resume omits --cursor-workspace on the operator argv');
    }
    cursorCliOperatorHostGate(block, errors);
    const appWindow = block.match(/Cursor App[\s\S]{0,900}App-started Cloud[\s\S]{0,900}/);
    if (appWindow && /--product(?:\s+|=)cli\b/.test(appWindow[0]) && /--host(?:\s+|=)local\b/.test(appWindow[0])) {
      errors.push('App local/Cloud guidance inherits standalone CLI --product cli --host local as a default');
    }
    const leakedIdentity = block.split(/\r?\n/).filter(line =>
      /--product(?:\s+|=)cli\b/.test(line)
      && /--host(?:\s+|=)local\b/.test(line)
      && /--ensure-target\b/.test(line));
    if (leakedIdentity.length) {
      errors.push('CLI identity flags leaked onto an --ensure-target line; App/Cloud must not inherit them as a default');
    }
    if (/Immediately before the first named Kaola child dispatch/i.test(block)) {
      errors.push('Next still locates Repo prep at first named dispatch, which is skippable');
    }
    // #1101: Repo prep materializes commands only; it is never conditioned on a role catalog.
    const prepHeading = '## Cursor standalone CLI startup and resume Repo prep';
    const prepAt = block.indexOf(prepHeading);
    const prep = prepAt >= 0 ? block.slice(prepAt) : '';
    if (prepAt < 0) errors.push('Next lacks the "' + prepHeading + '" section');
    if (/capability_gap/.test(prep)) {
      errors.push('Next Repo prep is conditioned on a role catalog (capability_gap skip)');
    }
    if (/\broles?\b/i.test(prep) || RETIRED_ROLE_RE.test(prep)) {
      errors.push('Next Repo prep names a Kaola role');
    }
    if (!/new_process_same_chat|new Cursor CLI process/i.test(block)) {
      errors.push('Next does not report the measured CLI restart-required boundary');
    }
    cursorCliSharedHostNegatives(block, errors);
    cursorCliFailClosedInstallFaults(block, errors);
    cursorCliNextEnsureLocator(block, errors);
    return { ok: errors.length === 0, errors, block, ensureCalls };
  }
}

// A child mode lets the mutation fixture exercise this same native-only oracle
// without recursively running the full edition suite. #1069: the dispatch
// contract rides the always-loaded Rule (the global contract render), not the
// command bytes, so the oracle renders the rule from the sources under test (REPO — never the
// generated-tree root, which under a worktree is the main checkout).
if (process.argv.includes('--native-dispatch-oracle')) {
  let ruleText = null;
  try {
    const gc = require(path.join(REPO, 'scripts', 'kaola-workflow-global-contract.js'));
    const registry = JSON.parse(fs.readFileSync(
      path.join(REPO, 'templates', 'global', 'runtime-contract-adapters.json'), 'utf8'));
    const target = registry.targets.find(row => row.id === 'cursor-cli-local');
    const source = fs.readFileSync(
      path.join(REPO, 'templates', 'global', 'kaola-workflow-global.md'), 'utf8');
    ruleText = gc.renderContract({ source, target }).toString('utf8');
  } catch (e) {
    console.error('NATIVE-DISPATCH-ORACLE RED: kaola-workflow-global rule: render failed — ' + e.message);
    process.exit(1);
  }
  const verdict = nativeDispatchRuleVerdict(ruleText);
  if (!verdict.ok) {
    console.error('NATIVE-DISPATCH-ORACLE RED: kaola-workflow-global rule: ' + verdict.errors.join(' | '));
    process.exit(1);
  }
  console.log('NATIVE-DISPATCH-ORACLE GREEN: the always-loaded Rule states the native-only rule and pins no model');
  process.exit(0);
}

if (process.argv.includes('--cli-materialization-oracle')) {
  const forges = (syncMod.FORGES && syncMod.FORGES.length)
    ? syncMod.FORGES
    : ['github', 'gitlab', 'gitea'];
  let oracleFailed = false;
  for (const forge of forges) {
    const isolated = fs.mkdtempSync(path.join(tmpBase(), 'cursor-cli-mat-oracle-' + forge + '-'));
    try {
      // spawn-class: environment
      const generated = spawnSync(process.execPath, [
        SYNC_JS, '--write', '--forge=' + forge, '--tree-root=' + isolated,
      ], {
        cwd: REPO, encoding: 'utf8',
      });
      if (generated.status !== 0) {
        oracleFailed = true;
        console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge + '] sync --write --tree-root failed: '
          + String(generated.stderr || generated.stdout || '').slice(0, 400));
        continue;
      }
      const label = treeLabel(forge);
      for (const name of CURSOR_CLI_MATERIALIZATION_COMMANDS) {
        const rel = path.join(label, 'commands', name + '.md');
        const absolute = path.join(isolated, rel);
        const surface = cursorCliMaterializationSurface(name);
        const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
        const verdict = cursorCliMaterializationVerdict(text, forge, surface);
        if (!verdict.ok) {
          oracleFailed = true;
          for (const error of verdict.errors) {
            console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge + '] ' + name + ': ' + error);
          }
        }
        if (surface === 'next') {
          const claimJs = namedForgeClaimScript(forge);
          const claimBase = path.basename(claimJs);
          if (!text.includes(claimBase)) {
            oracleFailed = true;
            console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge
              + '] generated Next does not bind CLAIM_JS to named ' + claimBase);
          }
          if (!fs.existsSync(claimJs)) {
            oracleFailed = true;
            console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge
              + '] named claim.js missing at ' + claimJs);
          } else {
            const tmpHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-cli-mat-claim-' + forge + '-'));
            try {
              // spawn-class: cli-contract
              const spawned = spawnSync(process.execPath, [
                claimJs, 'startup', '--target-issue', '1',
                '--runtime', 'cursor', '--product', 'cli', '--host', 'local', '--json',
              ], {
                cwd: tmpHome,
                encoding: 'utf8',
                env: Object.assign({}, process.env, {
                  HOME: tmpHome,
                  USERPROFILE: tmpHome,
                  KAOLA_WORKFLOW_OFFLINE: '1',
                }),
                timeout: 30000,
              });
              const blob = String(spawned.stdout || '') + '\n' + String(spawned.stderr || '');
              let body = null;
              try {
                const lines = blob.trim().split('\n').filter(l => l.trim());
                for (let i = lines.length - 1; i >= 0; i--) {
                  try { body = JSON.parse(lines[i]); break; } catch (_) { /* keep */ }
                }
              } catch (_) { body = null; }
              if (body && body.reason === 'unknown_flag') {
                oracleFailed = true;
                console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge
                  + '] named claim.js refused generated CLI identity flags: '
                  + JSON.stringify(body));
              }
            } finally {
              try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
            }
          }
          const locatorMutant = text.includes('git rev-parse --show-toplevel')
            ? text
            : (text + '\n`--ensure-target` transaction against the CLI workspace (`git rev-parse --show-toplevel`).\n');
          const locatorVerdict = cursorCliMaterializationVerdict(locatorMutant, forge, 'next');
          if (locatorVerdict.ok
              || !locatorVerdict.errors.some(error => /git rev-parse|show-toplevel/.test(error))) {
            oracleFailed = true;
            console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge
              + '] locator oracle does not reject git rev-parse --show-toplevel as the CLI workspace');
          }
          const droppedLocator = text
            .replace(/--cursor-workspace/g, '--not-the-workspace-locator')
            .replace(/\bmain_root\b/g, 'not_the_recorded_root');
          const droppedVerdict = cursorCliMaterializationVerdict(droppedLocator, forge, 'next');
          if (droppedVerdict.ok
              || !droppedVerdict.errors.some(error => /--cursor-workspace/.test(error))
              || !droppedVerdict.errors.some(error => /main_root/.test(error))) {
            oracleFailed = true;
            console.error('CLI-MATERIALIZATION-ORACLE RED: [' + forge
              + '] locator oracle does not require --cursor-workspace and recorded main_root');
          }
        }
      }
    } finally {
      try { fs.rmSync(isolated, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
  if (oracleFailed) process.exit(1);
  console.log('CLI-MATERIALIZATION-ORACLE GREEN: Next CLI identity vs App/Cloud shared-file, --cursor-workspace operator argv, named claim.js flags, locator, and no Finalize pre-dispatch ensure');
  process.exit(0);
}

const commandNamesFor = forge => forgeLayout.commandSources(forge)
  .map(s => s.basename.replace(/\.md$/, '')).sort();

// The Cursor adapter records only native host facts (#1101): no role, profile, or model binding.
const CURSOR_ADAPTER_CAPS = adapterFacts.loadRuntimeAdapters(REPO).runtimes.cursor.capabilities;

// ---------------------------------------------------------------------------
// CURSOR_RUNTIME_NATIVE — the native-only subagent rule and the recovery carrier
// as DECLARED table entries, not merely as prose. Deleting either reds this suite.
// ---------------------------------------------------------------------------
const CURSOR_RUNTIME_NATIVE = Object.freeze({
  native_subagents:
    'Cursor subagents are the host\'s own Task types from the live catalog; the edition ships no agents, no frontmatter model pin, and no per-call model.',
  machine_global_recovery_rule:
    'Cursor standalone CLI, App local, and App-started Cloud receive one machine-global alwaysApply Rule; no tool-use hook or Kaola hook subprocess is installed, so ordinary tool use adds zero context.',
});

// ---------------------------------------------------------------------------
// Additive boundary — cursor is a runtime, not a forge. Read the tree; do not
// modify those files. install-all.sh MUST name cursor (red until wired).
// ---------------------------------------------------------------------------
{
  const editionSyncSrc = fs.readFileSync(path.join(REPO, 'scripts', 'edition-sync.js'), 'utf8');
  const forgesDecl = editionSyncSrc.match(/const FORGES\s*=\s*\[([^\]]*)\]/);
  assert(!!forgesDecl, 'B0: edition-sync.js declares FORGES');
  const forges = forgesDecl
    ? forgesDecl[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean)
    : [];
  assert(!forges.includes('cursor'),
    'B0: edition-sync.js FORGES does not include cursor — got ' + JSON.stringify(forges));

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const npmTest = String((pkg.scripts && pkg.scripts.test) || '');
  assert(!npmTest.includes('test-cursor-edition.js'),
    'B0: package.json scripts.test does not invoke test-cursor-edition.js');

  const installSh = fs.readFileSync(path.join(REPO, 'install.sh'), 'utf8');
  assert(!/\bcursor\b/i.test(installSh),
    'B0: install.sh does not mention cursor as a runtime to install');

  const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
  assert(/\bcursor\b/.test(installAll) && installAll.includes('install-cursor.sh'),
    'B0: install-all.sh MUST name cursor and install-cursor.sh (additive runtime, not a forge gate)');
}

// ---------------------------------------------------------------------------
// D0 — DRIFT IS OBSERVED BEFORE IT IS REPAIRED.
//
// Self-provision below runs `sync --write`, which REPAIRS the generated tree.
// Run first, it destroys the only evidence that the tree on this disk had
// drifted from canonical. So --check runs HERE, ahead of the write, and
// reports what it found on disk. Drift EXITS rather than counting a failure:
// continuing would reach --write, repair the tree, and erase the finding.
//
// ABSENT IS A SKIP, AND THE SKIP IS LOUD. These trees are gitignored.
// ---------------------------------------------------------------------------
let driftVerdict = '';
const treeRootFor = forge => path.join(TREE_ROOT, treeLabel(forge));
const treeWhere = TREE_ROOT === REPO ? '' : ' [tree root: ' + TREE_ROOT + ', not this checkout]';
{
  const verified = [];
  const absent = [];
  assert(forgeLayout.FORGES.length > 0,
    'D0: the forge axis must be non-empty — an empty axis probes nothing and would skip in silence');
  assert(forgeLayout.FORGES.includes(DEFAULT_FORGE),
    'D0: the forge axis includes github (the default cursor tree label is .cursor)');
  for (const forge of forgeLayout.FORGES) {
    const label = treeLabel(forge);
    if (!fs.existsSync(treeRootFor(forge))) { absent.push(label); continue; }
    if (!fs.existsSync(SYNC_JS)) {
    console.error('cursor-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
      + 'disk but scripts/sync-cursor-edition.js is missing, so drift cannot be observed.');
      process.exit(1);
    }
    const r = runGeneratorCli(['--forge=' + forge, '--check']);
    if (r.status !== 0) {
      process.stderr.write(r.stdout || '');
      process.stderr.write(r.stderr || '');
      console.error('\ncursor-edition test FAILED: D0[' + forge + ']: ' + label + ' is present on '
        + 'disk and has DRIFTED from canonical (sync --check exit ' + r.status + ').'
        + '\nRegenerate it deliberately: node scripts/sync-cursor-edition.js --forge=' + forge + ' --write'
        + '\nThe suite stops here rather than continue into its own sync --write, which would repair '
        + 'this tree and erase the finding.');
      process.exit(1);
    }
    verified.push(label);
  }
  for (const label of verified) console.log('D0: ' + label + ' is present and in parity with canonical.' + treeWhere);
  for (const label of absent) {
    console.log('D0: SKIPPED — ' + label + ' is absent from disk, so nothing was compared '
      + '(gitignored generated tree; a fresh clone has none).' + treeWhere);
  }
  driftVerdict = ' [drift-check: '
    + (verified.length ? verified.length + ' tree(s) in parity (' + verified.join(', ') + ')'
                       : 'NO tree verified')
    + (absent.length ? '; ' + absent.length + ' ABSENT, not checked (' + absent.join(', ') + ')' : '')
    + ']' + treeWhere;
}

// ---------------------------------------------------------------------------
// Self-provision: regenerate .cursor/ from tracked canonical sources before any
// assertion that reads it. If the generator is missing, fail with a clear
// "generator not present" (the HEAD-red this suite is authored to produce).
// ---------------------------------------------------------------------------
{
  if (!fs.existsSync(SYNC_JS)) {
    assert(false, 'generator not present: scripts/sync-cursor-edition.js is required to materialize the cursor edition');
    console.error('FATAL: generator not present (scripts/sync-cursor-edition.js). '
      + 'The cursor edition suite cannot self-provision or judge a generated tree.');
    console.error('\ncursor-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
      + driftVerdict);
    process.exit(1);
  }
  const r = runGenerator(['--write']);
  if (r.status !== 0) {
    console.error('FATAL: sync-cursor-edition --write failed (test cannot proceed):');
    console.error(r.stderr || r.stdout || '(no output)');
    process.exit(1);
  }
}

// D1 — D0's presence probe must be able to SEE a materialized tree.
assert(fs.existsSync(treeRootFor(DEFAULT_FORGE)),
  'D1: after sync --write, D0\'s presence probe must resolve a tree that exists — it resolved '
  + treeRootFor(DEFAULT_FORGE) + ', which does not, so D0 skipped every forge and checked '
  + 'nothing. This checkout is ' + REPO + '; the tree root resolved to ' + TREE_ROOT + '. If those '
  + 'differ, the writer put the tree somewhere else and the two resolutions have diverged');
assert(fs.existsSync(path.join(TREE_ROOT, '.cursor')),
  'D1: the github tree lands at <tree-root>/.cursor (got missing at ' + path.join(TREE_ROOT, '.cursor') + ')');
assert(treeLabel('github') === '.cursor'
  && treeLabel('gitlab') === '.cursor-gitlab'
  && treeLabel('gitea') === '.cursor-gitea',
  'D1: treeLabel is .cursor / .cursor-gitlab / .cursor-gitea (kimi-style outSuffix)');

const canonCommandNames = commandNamesFor(DEFAULT_FORGE);

// ---------------------------------------------------------------------------
// G0 — THE SUBJECT UNDER TEST IS THE GENERATOR'S OUTPUT, derived from TRACKED
// canonical sources. An absent tree must fail loudly rather than let every
// readdir-driven loop iterate over nothing.
// ---------------------------------------------------------------------------
{
  const provisioned = fs.existsSync(path.join(TREE_ROOT, '.cursor', 'commands'));
  assert(provisioned,
    'G0: the generated .cursor/commands tree exists after sync --write');
  if (!provisioned) {
    console.error('FATAL: sync --write reported success but produced no tree at '
      + path.join(TREE_ROOT, '.cursor') + ' — nothing below can be tested.');
    process.exit(1);
  }
  assert(canonCommandNames.length > 0,
    'G0-roster: the routing-registry command surfaces are non-empty');
  assert(!fs.existsSync(path.join(REPO, 'agents')),
    'G0-roster: the repository tracks no canonical agents/ role inventory (#1101)');
  for (const retired of ['named_roles', 'subagent_default', 'dispatch_conformance', 'role_dispatch',
    'intent_mapping', 'model_carrier', 'profile_format']) {
    assert(!Object.prototype.hasOwnProperty.call(CURSOR_ADAPTER_CAPS, retired),
      'G0-binding: the Cursor adapter records no ' + retired + ' role or model-binding capability');
  }
  assert(/`Task`/.test(String((CURSOR_ADAPTER_CAPS.delegation_guidance || {}).native_routes || '')),
    'G0-adapter: the Cursor adapter records the native Task route as a host fact');
  // The retired agent renderer and catalog copier are gone from the generator's surface; nothing
  // can render or copy a role profile (the old fail-closed renderAgent probes have no subject).
  for (const retired of ['renderAgent', 'agentRel', 'listCanonAgents', 'copyListCanonAgents',
    'isReadOnlyRole', 'CURSOR_MODEL_DISPATCH_GUIDANCE', 'cursorCliMaterializationProse', 'CANON_AGENTS_DIR']) {
    assert(!Object.prototype.hasOwnProperty.call(syncMod, retired),
      'G0-roster: sync-cursor-edition exports no retired agent surface ' + retired);
  }
}

function commandRel(name, forge) {
  return treeLabel(forge || DEFAULT_FORGE) + '/commands/' + name + '.md';
}

// ---------------------------------------------------------------------------
// G1: agents — Kaola-Workflow ships no Cursor agents (#1101). After --write the
// generated tree has no agents/ directory at all, and no generated file carries
// a frontmatter model pin, effort field, or readonly role flag.
// ---------------------------------------------------------------------------
{
  assert(!fs.existsSync(path.join(TREE_ROOT, '.cursor', 'agents')),
    'G1: the generated .cursor tree has no agents/ directory after sync --write');
  for (const rel of generatedTreeFiles('.cursor')) {
    const { raw } = parseFrontmatter(read(rel));
    assert(!/^\s*(?:model|effort|reasoning_effort|readonly)\s*:/m.test(raw),
      'G1: ' + rel + ' carries no pinned model/effort or readonly role frontmatter');
  }
}

// ---------------------------------------------------------------------------
// G2: commands — exact set = routing-registry commandSources() for the forge,
// not a hand list. No generated command carries a role dispatch call card (#1101 removed the
// canonical Finalize card) or grows invented static subagent_type=/description= fields.
// Compact recovery is carried by the global transaction's always-applied Rule, not by a command hook or
// a runtime stamp in generated command prose. No CLAUDE_PLUGIN_ROOT, no ~/.claude/kaola-workflow.
// No model="{...}" placeholders, no per-call model=" overrides, and no vendor model dispatch
// in command cards.
// ---------------------------------------------------------------------------
{
  const dir = path.join(TREE_ROOT, '.cursor', 'commands');
  const gen = fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert(JSON.stringify(gen) === JSON.stringify(canonCommandNames),
    'G2: .cursor/commands set == routing-registry commandSources(github) — expected '
    + JSON.stringify(canonCommandNames) + ' got ' + JSON.stringify(gen));

  const staticDispatchFields = text => String(text || '').split(/\r?\n/)
    .filter(line => /^\s*(?:subagent_type|description)\s*=/.test(line));
  const lineStartCall = text => /^(?:Agent|Task)\(/m.test(String(text || ''));
  for (const name of canonCommandNames) {
    const src = forgeLayout.commandSources(DEFAULT_FORGE).find(s => s.basename === name + '.md');
    assert(!!src, 'G2[' + name + ']: commandSources() names this surface');
    const canon = src ? fs.readFileSync(src.absPath, 'utf8') : '';
    const rel = commandRel(name);
    assert(exists(rel), 'G2[' + name + ']: generated command exists');
    if (!exists(rel)) continue;
    const content = read(rel);
    const { fm } = parseFrontmatter(content);
    assert(fm.name === name, 'G2[' + name + ']: frontmatter name matches the command — got ' + JSON.stringify(fm.name));
    assert(typeof fm.description === 'string' && fm.description.trim().length > 0,
      'G2[' + name + ']: frontmatter has a non-empty description');
    assert(!/^Agent\(/m.test(content),
      'G2[' + name + ']: no line-start Claude Agent( dispatch card');
    assert(!/\bmodel\s*=\s*["']/.test(content),
      'G2[' + name + ']: generated command stays free of per-call model dispatch');
    assert(!lineStartCall(content) && staticDispatchFields(content).length === 0,
      'G2[' + name + ']: no line-start Agent(/Task( role card and no static subagent_type=/description= fields');
    const role = content.match(RETIRED_ROLE_RE);
    assert(!role,
      'G2[' + name + ']: generated command names no retired Kaola role — found ' + JSON.stringify(role && role[0]));
    if (name === 'kaola-workflow-finalize') {
      assert(!/^(?:Agent|Task)\(/m.test(canon),
        'G2[kaola-workflow-finalize]: the canonical Finalize carries no role dispatch card to transform');
      const recoveryRel = '.cursor/rules/' + CURSOR_RECOVERY_RULE;
      const recovery = renderedGlobalRule();
      const recoveryVerdict = recoveryRuleVerdict(recovery);
      assert(recoveryVerdict.ok,
        'G2[kaola-workflow-finalize]: global transaction render carries compressed recovery and dispatch — '
        + recoveryVerdict.errors.join(' | '));
      assert(!exists(recoveryRel),
        'G2[kaola-workflow-finalize]: generated edition does not duplicate the retired project recovery Rule');
    }
    if (name === 'workflow-init') {
      assert(typeof fm['argument-hint'] === 'string' && fm['argument-hint'].length > 0,
        'G2[workflow-init]: preserves argument-hint (Commands support $ARGUMENTS)');
      assert(/\$ARGUMENTS/.test(content),
        'G2[workflow-init]: preserves $ARGUMENTS');
    }
  }
  // #1069: the dispatch contract and adapter facts live in the always-loaded Rule; the command
  // renders carry the pointer once and no marked dispatch region.
  const cursorRule = renderedGlobalRule();
  for (const name of ['workflow-next', 'kaola-workflow-finalize']) {
    const content = exists(commandRel(name)) ? read(commandRel(name)) : '';
    assert(!/<!--\s*KW-RUNTIME-DISPATCH-(?:START|END)\s*-->/.test(content)
      && !/Runtime dispatch contract \(always loaded\)/i.test(content)
      && content.split(adapterFacts.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 1,
      'G2[' + name + ']: generated command carries the always-loaded-carrier pointer once, no dispatch block');
    assert(/CLI, App local, and App Cloud are separate hosts/i.test(cursorRule),
      'G2[' + name + ']: Cursor CLI, App local, and App Cloud remain distinct surfaces/hosts (in the always-loaded Rule)');
    assert(/The live Task catalog is authoritative/i.test(cursorRule),
      'G2[' + name + ']: the always-loaded Rule makes the live Task catalog, not on-disk bytes, authoritative');
    const nativeVerdict = nativeDispatchRuleVerdict(cursorRule);
    assert(nativeVerdict.ok,
      'G2[' + name + ']: the always-loaded Rule states the native-only rule and pins no model (host '
      + 'defaults decide) — ' + nativeVerdict.errors.join(' | '));
  }

  // #1101: the retired built-in-only omit-model relation (parent, not profile pin) is gone from
  // both the always-loaded Rule and the command renders; there is no Kaola profile to contrast.
  const pathBVerdict = inspectPathBConsumers(TREE_ROOT);
  assert(pathBVerdict.ok,
    'G2-path-b: generated workflow-next and finalize commands carry no omit-model relation — '
    + pathBVerdict.errors.join(' | '));
  assert(pathBRelations(cursorRule).length === 0,
    'G2-path-b: the always-loaded Rule carries no retired omit-model/profile-pin relation');
  assert(pathBRelations('If the enum is built-in-only, omit-model is the parent, not a profile pin.').length === 1,
    'G2-path-b-mutation RED: the relation detector still observes a reintroduced omit-model relation');

  const nativeBoundary = 'Use the live Task schema for generalPurpose with task, custody, evidence, and stop boundaries.';
  assert(!lineStartCall(nativeBoundary) && staticDispatchFields(nativeBoundary).length === 0,
    'G2-mutation: honest live-schema prose has no portable static dispatch fields');
  const inventedCard = nativeBoundary
    + '\nTask(\n  subagent_type="generalPurpose",\n  description="Routed fix"\n)';
  assert(lineStartCall(inventedCard) && staticDispatchFields(inventedCard).length === 2,
    'G2-mutation RED: appending a static Task(subagent_type, description) card is detected');
}

// ---------------------------------------------------------------------------
// G2-cli-materialization — generated Next preserves the standalone-CLI-only
// safe Repo prep transaction; generated Finalize carries no retired
// pre-dispatch role materialization (#1101). Mutate the generated subject
// itself to prove the oracle rejects an App/Cloud scope inversion, a
// role-catalog skip, and a reintroduced Finalize materialization section.
// ---------------------------------------------------------------------------
{
  for (const name of CURSOR_CLI_MATERIALIZATION_COMMANDS) {
    const rel = commandRel(name);
    const content = exists(rel) ? read(rel) : '';
    const surface = cursorCliMaterializationSurface(name);
    const verdict = cursorCliMaterializationVerdict(content, DEFAULT_FORGE, surface);
    assert(verdict.ok,
      surface === 'next'
        ? ('G2-cli-materialization[' + name + ']: generated Next states executable startup/resume '
          + 'Repo prep for standalone CLI/local, without a skippable first-named-dispatch ensure — '
          + verdict.errors.join(' | '))
        : ('G2-cli-materialization[' + name + ']: generated Finalize carries no retired pre-dispatch '
          + 'role materialization, ensure call, or role card — '
          + verdict.errors.join(' | ')));

    if (verdict.block) {
      if (surface === 'finalize') {
        const reintroduced = content + '\n## Cursor standalone CLI pre-dispatch materialization\n\n'
          + 'Immediately before the first named Kaola child dispatch, run the installed transaction:\n\n'
          + '```sh\nnode "$CURSOR_MATERIALIZER" --ensure-target "$PWD" --forge=github --json\n```\n';
        const reintroducedVerdict = cursorCliMaterializationVerdict(reintroduced, DEFAULT_FORGE, surface);
        assert(!reintroducedVerdict.ok
          && reintroducedVerdict.errors.some(error => /retired pre-dispatch materialization section/.test(error))
          && reintroducedVerdict.errors.some(error => /--ensure-target/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: reintroducing the retired Finalize '
          + 'pre-dispatch materialization is rejected — ' + reintroducedVerdict.errors.join(' | '));
        const roleCard = content + '\n```text\nTask(\n  subagent_type="implementer",\n)\n```\n';
        const roleCardVerdict = cursorCliMaterializationVerdict(roleCard, DEFAULT_FORGE, surface);
        assert(!roleCardVerdict.ok && roleCardVerdict.errors.some(error => /role dispatch call card/.test(error)),
          'G2-cli-materialization-mutation[' + name + ']: reintroducing a role Task( card is rejected — '
          + roleCardVerdict.errors.join(' | '));
      }

      // #1074: only the Next trailer still carries the shared App-host
      // negative; Finalize points at it.
      if (surface === 'next') {
        const appScoped = content.replace(
          'do not apply or infer this CLI materialization rule for either App host',
          'apply this CLI materialization rule for both App hosts');
        const appVerdict = cursorCliMaterializationVerdict(appScoped, DEFAULT_FORGE, surface);
        assert(appScoped !== content && !appVerdict.ok
          && appVerdict.errors.some(error => /negative CLI-rule boundary/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: applying the CLI rule to App local/Cloud is rejected — '
          + appVerdict.errors.join(' | '));
      }

      if (surface === 'next') {
        const gapSkip = content + '\nTreat missing named Kaola roles as capability_gap and skip Repo prep.\n';
        const gapVerdict = cursorCliMaterializationVerdict(gapSkip, DEFAULT_FORGE, surface);
        assert(!gapVerdict.ok
          && gapVerdict.errors.some(error => /capability_gap skip/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: conditioning Repo prep on a role catalog (capability_gap skip) is rejected — '
          + gapVerdict.errors.join(' | '));

        const forgedDefault = content.replace(
          'node "$CLAIM_JS" startup --runtime cursor --target-issues "$KAOLA_TARGET_ISSUES"',
          'node "$CLAIM_JS" startup --runtime cursor --product cli --host local --target-issues "$KAOLA_TARGET_ISSUES"'
        );
        const forgedVerdict = cursorCliMaterializationVerdict(forgedDefault, DEFAULT_FORGE, surface);
        assert(forgedDefault !== content && !forgedVerdict.ok
          && forgedVerdict.errors.some(error => /must not forge CLI identity/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: stamping --product cli --host local onto the default first startup fence is rejected — '
          + forgedVerdict.errors.join(' | '));

        const helperOnlyResume = content
          + '\nnode "$CURSOR_MATERIALIZER" --ensure-target "$PWD" --forge=github --json\n'
          + 'On resume, read mission-list.md top to bottom.\n';
        const helperResumeVerdict = cursorCliMaterializationVerdict(
          helperOnlyResume.replace(/node "\$CLAIM_JS" resume[^\n]*/g, 'On resume, read mission-list.md'),
          DEFAULT_FORGE, surface);
        assert(!helperResumeVerdict.ok
          && helperResumeVerdict.errors.some(error => /claim\.js resume/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: helper-only or mission-list.md resume is rejected — '
          + helperResumeVerdict.errors.join(' | '));

        const revParseMutant = content.includes('git rev-parse --show-toplevel')
          ? content
          : (content + '\n`--ensure-target` against the CLI workspace (`git rev-parse --show-toplevel`).\n');
        const revParseVerdict = cursorCliMaterializationVerdict(revParseMutant, DEFAULT_FORGE, surface);
        assert(!revParseVerdict.ok
          && revParseVerdict.errors.some(error => /git rev-parse|show-toplevel/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: naming git rev-parse --show-toplevel as the CLI workspace is rejected — '
          + revParseVerdict.errors.join(' | '));

        const droppedLocator = content
          .replace(/--cursor-workspace/g, '--not-the-workspace-locator')
          .replace(/\bmain_root\b/g, 'not_the_recorded_root');
        const droppedLocatorVerdict = cursorCliMaterializationVerdict(droppedLocator, DEFAULT_FORGE, surface);
        assert(!droppedLocatorVerdict.ok
          && droppedLocatorVerdict.errors.some(error => /--cursor-workspace/.test(error))
          && droppedLocatorVerdict.errors.some(error => /main_root/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: omitting --cursor-workspace and recorded main_root is rejected — '
          + droppedLocatorVerdict.errors.join(' | '));

        const extraUnguarded = content + '\n```bash\nnode "$CLAIM_JS" resume --runtime cursor --product cli --host local --cursor-workspace "$CURSOR_WORKSPACE"\n```\n';
        const extraUnguardedVerdict = cursorCliMaterializationVerdict(extraUnguarded, DEFAULT_FORGE, surface);
        assert(!extraUnguardedVerdict.ok
          && extraUnguardedVerdict.errors.some(error => /no executable host\/product if\/case gate/.test(error)),
        'G2-cli-materialization-mutation[' + name + ']: appending an unguarded CLI fence is rejected — '
          + extraUnguardedVerdict.errors.join(' | '));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// G2-trailer (#1074): the compressed Cursor CLI trailer lives on Next only
// (#1101 retired the Finalize one); each shared policy sentence occurs exactly
// once, Finalize carries no Cursor trailer and no "do not impersonate" role
// fallback, and the trailer stays within the measured word budget.
// ---------------------------------------------------------------------------
{
  const NEXT_HEADING = '## Cursor standalone CLI startup and resume Repo prep';
  for (const forge of syncMod.FORGES || ['github', 'gitlab', 'gitea']) {
    const render = name => syncMod.renderCommand(
      fs.readFileSync(syncMod.canonCommandPath(name + '.md', forge), 'utf8'), name, forge);
    const next = render('workflow-next');
    const finalize = render('kaola-workflow-finalize');
    const start = next.indexOf(NEXT_HEADING);
    assert(start >= 0,
      'G2-trailer[' + forge + '/workflow-next]: compressed Cursor CLI trailer heading is present');
    const trailer = (start >= 0 ? next.slice(start) : '').replace(/\s+/g, ' ');
    for (const sentence of [
      'never substitute an ambient cwd copier or a sessionStart materializer',
      'do not apply or infer this CLI materialization rule',
    ]) {
      assert(trailer.split(sentence).length - 1 === 1,
        'G2-trailer[' + forge + ']: "' + sentence.slice(0, 48) + '…" occurs exactly once in the Next trailer');
      assert(!finalize.includes(sentence),
        'G2-trailer[' + forge + ']: Finalize repeats no Next trailer sentence ("' + sentence.slice(0, 32) + '…")');
    }
    assert(!/## Cursor standalone CLI/.test(finalize),
      'G2-trailer[' + forge + ']: Finalize carries no Cursor CLI trailer (the pre-dispatch one is retired)');
    assert(!finalize.includes('do not impersonate'),
      'G2-trailer[' + forge + ']: Finalize carries no "do not impersonate" role fallback');
    const words = trailer.split(/\s+/).filter(Boolean).length;
    assert(words <= 300,
      'G2-trailer[' + forge + ']: the Cursor CLI trailer stays within 300 words (got ' + words + ')');
  }
}

// ---------------------------------------------------------------------------
// G2-native-mutation — copy the source into a throwaway tree (no git, so the
// child's TREE_ROOT is the scratch itself) and run the native-only Rule oracle:
// the unmutated copy is GREEN; (a) reintroducing a retired subagent_default
// binding capability makes the adapter authority refuse to load at all; (b)
// smuggling a pinned model into the native facts reaches the Rule and the
// oracle rejects it. The generated commands carry no dispatch relation.
// ---------------------------------------------------------------------------
{
  const SOURCE_TREES = ['scripts', 'commands', 'hooks', 'templates'];
  const missing = SOURCE_TREES.filter(name => !fs.existsSync(path.join(REPO, name)));
  assert(missing.length === 0,
    'G2-native-mutation: fixture source trees exist — missing ' + JSON.stringify(missing));
  const mutations = [
    { id: 'unmutated', apply: () => {}, green: true },
    {
      id: 'subagent-default',
      apply: cursor => { cursor.capabilities.subagent_default = { model: 'grok-4.7', effort: 'medium' }; },
      expect: /retired role capability subagent_default on cursor/,
    },
    {
      id: 'pinned-model-fact',
      apply: cursor => {
        cursor.capabilities.delegation_guidance.availability += ' Every child pins model grok-4.7.';
      },
      expect: /names vendor model slug grok-4\.7/,
    },
  ];
  for (const mutation of missing.length ? [] : mutations) {
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(tmpBase(), 'cursor-g2-native-')));
    try {
      for (const name of SOURCE_TREES) {
        fs.cpSync(path.join(REPO, name), path.join(scratch, name), { recursive: true });
      }
      const adapterPath = path.join(scratch, 'templates', 'agents', 'runtime-capabilities.json');
      const authority = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
      mutation.apply(authority.runtimes.cursor);
      fs.writeFileSync(adapterPath, JSON.stringify(authority, null, 2) + '\n');

      // spawn-class: environment
      const probe = spawnSync(process.execPath,
        [path.join(scratch, 'scripts', 'test-cursor-edition.js'), '--native-dispatch-oracle'], {
          cwd: scratch, encoding: 'utf8',
        });
      const probeOutput = String(probe.stdout || '') + String(probe.stderr || '');
      if (mutation.green) {
        assert(probe.status === 0 && /NATIVE-DISPATCH-ORACLE GREEN/.test(probeOutput),
          'G2-native-mutation GREEN: the unmutated source passes the same oracle — '
          + JSON.stringify(probeOutput.trim().slice(0, 400)));
        continue;
      }
      assert(probe.status !== 0,
        'G2-native-mutation[' + mutation.id + '] RED: the native-only Rule oracle exits non-zero '
        + '(got ' + probe.status + ')');
      assert(mutation.expect.test(probeOutput),
        'G2-native-mutation[' + mutation.id + '] RED: the failure names the contradiction — '
        + JSON.stringify(probeOutput.trim().slice(0, 400)));

      if (mutation.id === 'pinned-model-fact') {
        const syncPath = path.join(scratch, 'scripts', 'sync-cursor-edition.js');
        // spawn-class: environment
        const generated = spawnSync(process.execPath, [syncPath, '--write'], { cwd: scratch, encoding: 'utf8' });
        assert(generated.status === 0,
          'G2-native-mutation: the mutated adapter still regenerates Cursor commands — exit ' + generated.status);
        const mutatedVerdict = inspectPathBConsumers(scratch);
        assert(mutatedVerdict.ok && PATH_B_COMMANDS.every(name =>
          !VENDOR_SLUG.test(fs.readFileSync(path.join(scratch, '.cursor', 'commands', name + '.md'), 'utf8'))),
        'G2-native-mutation: generated commands carry no dispatch relation or model slug after the '
          + 'adapter mutation — they carry only the pointer');
      }
    } finally {
      try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }
  }
}

// G2-leak forbids vendor model slugs everywhere: on generated command/rule
// bytes and in the always-loaded Rule (#1101 — no binding block remains).
{
  const B2_MODEL_NOUN = /\b(Opus|Sonnet)\b/;
  const TIER_GUIDANCE_COMMANDS = new Set([
    commandRel('workflow-next'),
    commandRel('kaola-workflow-finalize'),
  ]);

  // #1069: the runtime-delegation block lives only in the always-loaded Rule; generated commands
  // carry the pointer and must carry no vendor slug.
  function vendorSlugScope(rel, content) {
    if (VENDOR_SLUG.test(content)) {
      return { ok: false, reason: 'vendor model slug on generated command bytes '
        + '(no Kaola subagent binding exists)' };
    }
    return { ok: true, reason: '' };
  }

  for (const rel of generatedTreeFiles('.cursor')) {
    const content = read(rel);
    assert(!/CLAUDE_PLUGIN_ROOT/.test(content),
      'G2-leak: ' + rel + ': no CLAUDE_PLUGIN_ROOT');
    assert(!/~\/\.claude\/kaola-workflow/.test(content)
      && !/\$HOME\/\.claude\/kaola-workflow/.test(content),
      'G2-leak: ' + rel + ': no ~/.claude/kaola-workflow');
    assert(!/--runtime claude\b/.test(content),
      'G2-leak: ' + rel + ': no --runtime claude (rewritten to --runtime cursor)');
    assert(!/\bkaola-workflow-runtime\b/.test(content),
      'G2-leak: ' + rel + ': no call to the uninstalled kaola-workflow-runtime command');
    assert(!/model="\{/.test(content),
      'G2-leak: ' + rel + ': no model="{...}" placeholder');
    assert(!/\bmodel="/.test(content),
      'G2-leak: ' + rel + ': no per-call model=" override in generated dispatch surfaces');
    const scope = vendorSlugScope(rel, content);
    assert(scope.ok, 'G2-leak: ' + rel + ': ' + scope.reason);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(B2_MODEL_NOUN);
      if (m) {
        assert(false,
          'G2-leak: ' + rel + ':' + (i + 1) + ': Claude model noun "' + m[0]
          + '" leaked into generated cursor prose');
      }
    }
  }
  const recoveryRel = '.cursor/rules/' + CURSOR_RECOVERY_RULE;
  const recovery = renderedGlobalRule();
  const ruleSlug = recovery.match(VENDOR_SLUG);
  assert(!ruleSlug,
    'G2-leak: the always-loaded Rule names no vendor model slug — found ' + JSON.stringify(ruleSlug && ruleSlug[0]));
  const recoveryVerdict = recoveryRuleVerdict(recovery);
  assert(recoveryVerdict.ok,
    'G2: compact recovery and always-loaded dispatch contract are carried by the global transaction render — '
    + recoveryVerdict.errors.join(' | '));
  assert(!exists(recoveryRel),
    'G2: generated edition contains no duplicate compact-recovery Rule');

  // Mutation bite: the scope check rejects a model slug appended to a dispatch consumer.
  for (const rel of TIER_GUIDANCE_COMMANDS) {
    if (!exists(rel)) {
      assert(false, 'G2-leak-mutation: ' + rel + ': generated consumer exists for the mutation oracle');
      continue;
    }
    const mutated = read(rel) + '\nOutside-block mutation: grok-4.7\n';
    const scope = vendorSlugScope(rel, mutated);
    assert(!scope.ok && /vendor model slug/.test(scope.reason),
      'G2-leak-mutation: ' + rel + ': vendor slug outside the marked block still fails');
  }
}

// ---------------------------------------------------------------------------
// G2-declaration: CURSOR_RUNTIME_NATIVE.native_subagents exists, states the
// native-only rule, and the generated tree matches it: no generated file pins a
// model, per call or in frontmatter.
// ---------------------------------------------------------------------------
{
  const KEY = 'native_subagents';
  const reason = CURSOR_RUNTIME_NATIVE[KEY];
  assert(typeof reason === 'string' && reason.trim().length >= 20,
    'G2-declaration: CURSOR_RUNTIME_NATIVE must declare "' + KEY + '" with a one-line reason');
  assert(/Task/.test(reason) && /live catalog/i.test(reason) && /no agents/i.test(reason)
    && /no frontmatter model pin/i.test(reason),
    'G2-declaration: the "' + KEY + '" reason must state native Task types, no agents, and no model pin');
  const resumeKey = 'machine_global_recovery_rule';
  const resumeReason = CURSOR_RUNTIME_NATIVE[resumeKey];
  assert(typeof resumeReason === 'string' && resumeReason.trim().length >= 20,
    'G2-declaration: CURSOR_RUNTIME_NATIVE must declare "' + resumeKey + '" with a one-line reason');
  assert(/standalone (?:Cursor )?CLI/i.test(resumeReason) && /App local/i.test(resumeReason)
    && /Cloud/i.test(resumeReason) && /alwaysApply/i.test(resumeReason)
    && /no tool-use hook/i.test(resumeReason) && /zero context/i.test(resumeReason),
    'G2-declaration: the "' + resumeKey + '" reason must state the shared alwaysApply rule and zero ordinary tool-use injection');
  for (const rel of generatedTreeFiles('.cursor')) {
    const content = read(rel);
    assert(!/\bmodel="/.test(content),
      'G2-declaration: ' + rel + ' carries a per-call model=" override, contradicting ' + KEY);
    assert(!/^\s*(?:model|effort)\s*:/m.test(parseFrontmatter(content).raw),
      'G2-declaration: ' + rel + ' carries a frontmatter model/effort pin, contradicting ' + KEY);
  }
}

// ---------------------------------------------------------------------------
// G3: --check re-renders from canonical and agrees with the tree --write just
// produced (render determinism across processes). Then a planted drift must
// turn --check red. A planted leftover agents/*.md (a pre-#1101 role render)
// is reported as a retired role profile, and --write prunes it along with the
// then-empty agents/ directory.
// ---------------------------------------------------------------------------
{
  const ok = runGeneratorCli(['--check']);
  assert(ok.status === 0,
    'G3: sync-cursor-edition --check exits 0 against the tree --write just produced'
    + (ok.status !== 0 ? ' — ' + String(ok.stderr || ok.stdout).split('\n')[0] : ''));
  const probe = path.join(TREE_ROOT, '.cursor', 'commands', 'workflow-next.md');
  assert(fs.existsSync(probe), 'G3: commands/workflow-next.md exists to plant drift against');
  const orig = fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : '';
  try {
    fs.appendFileSync(probe, '\n<!-- cursor-edition drift probe -->\n');
    const drifted = runGeneratorCli(['--check']);
    assert(drifted.status !== 0,
      'G3: --check exits non-zero on a drifted generated command (got ' + drifted.status + ')');
  } finally {
    try { fs.writeFileSync(probe, orig); } catch (_) { /* restore best-effort */ }
  }
  assert(runGeneratorCli(['--check']).status === 0,
    'G3: --check exits 0 after the planted drift is restored');

  const agentsDir = path.join(TREE_ROOT, '.cursor', 'agents');
  const leftover = path.join(agentsDir, 'implementer.md');
  try {
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(leftover, '---\nname: implementer\nmodel: grok-4.7[effort=medium]\nreadonly: false\n---\nretired render\n');
    const flagged = runGeneratorCli(['--check']);
    const out = String(flagged.stdout || '') + String(flagged.stderr || '');
    assert(flagged.status !== 0,
      'G3-retired: --check exits non-zero on a leftover agents/implementer.md (got ' + flagged.status + ')');
    assert(/\.cursor\/agents\/implementer\.md/.test(out) && /retired role profile/.test(out),
      'G3-retired: --check names the leftover as a retired role profile — got '
      + JSON.stringify(out.split('\n').filter(l => /agents/.test(l)).slice(0, 2)));
    const w = runGenerator(['--write']);
    assert(w.status === 0 && /pruned\s+\.cursor\/agents\/implementer\.md \(retired role profile\)/.test(String(w.stdout || '')),
      'G3-retired: --write prunes the leftover as a retired role profile');
    assert(!fs.existsSync(leftover) && !fs.existsSync(agentsDir),
      'G3-retired: after --write neither the leftover nor the empty agents/ directory remains');
    assert(runGeneratorCli(['--check']).status === 0,
      'G3-retired: --check is green again after --write prunes the leftover');
  } finally {
    try { fs.rmSync(leftover, { force: true }); fs.rmdirSync(agentsDir); } catch (_) { /* pruned */ }
  }
}

// ---------------------------------------------------------------------------
// G5: Cursor compact recovery is a machine-global Rule, not a hook. The generated
// hooks mapping remains valid JSON with an empty `hooks` object so ordinary
// tool use has no Kaola injection or subprocess. The global transaction renders
// the same always-applied contract for standalone CLI, App local, and Cloud.
// ---------------------------------------------------------------------------
{
  const hooksJsonRel = '.cursor/hooks.json';
  assert(exists(hooksJsonRel), 'G5: .cursor/hooks.json exists at Cursor project scope');
  assert(!exists('.cursor/hooks/hooks.json'),
    'G5: mapping is not nested under .cursor/hooks/hooks.json');
  const parsed = exists(hooksJsonRel) ? parseCursorHooksJson(read(hooksJsonRel)) : null;
  noKaolaCursorHooks(parsed, 'G5');
  const generatedHookFiles = walkFiles(path.join(TREE_ROOT, '.cursor', 'hooks'), '');
  assert(generatedHookFiles.length === 0,
    'G5: generated project has no executable hook files — found ' + JSON.stringify(generatedHookFiles));

  const ruleRel = '.cursor/rules/' + CURSOR_RECOVERY_RULE;
  assert(!exists(ruleRel), 'G5: generated edition retires the duplicate project rule at ' + ruleRel);
  const rule = renderedGlobalRule();
  const verdict = recoveryRuleVerdict(rule);
  assert(verdict.ok,
    'G5-rule: one global-transaction Rule carries both roots, dispatch, and all three Cursor hosts — '
    + verdict.errors.join(' | '));
  assert(typeof syncMod.renderCursorRecoveryRule !== 'function',
    'G5-rule: edition renderer no longer exports a second recovery-Rule renderer');
  assert(syncMod.expectedHookFiles().length === 0,
    'G5: Cursor renderer declares zero hook files');

  // The Rule embeds one complete generated continuation prompt, not duplicate
  // copies of the full Workflow Next and Finalization documents.
  const routing = require('./generate-routing-surfaces.js');
  const expectedPrompt = routing.renderCompactRecoveryPrompt('cursor', DEFAULT_FORGE, {
    globalContract: fs.readFileSync(path.join(REPO,
      'templates', 'global', 'kaola-workflow-global.md'), 'utf8').trim(),
  }).trim();
  const dispatchSource = fs.readFileSync(
    path.join(REPO, 'templates', 'routing', 'dispatch-contract.md'), 'utf8').trim();
  assert(rule.includes(expectedPrompt),
    'G5-block: global Rule embeds the exact generated Cursor continuation prompt');
  assert((rule.match(/KW-COMPACT-RECOVERY-V2/g) || []).length === 1
    && /completely reload the installed Workflow Next prompt/.test(rule)
    && /completely\s+reload the installed Kaola-Workflow Finalization prompt/.test(rule),
  'G5-block: one direct prompt reloads the complete operation prompt for either durable state');
  assert(rule.includes(dispatchSource)
    && (rule.match(/Runtime dispatch contract \(always loaded\)/g) || []).length === 1,
  'G5-block: Rule carries the exact shared dispatch source once');
}

// ---------------------------------------------------------------------------
// G6: generator CLI — --write, --check, --refresh-present, --forge=,
// --print-tree-root. Unknown forge refused. --help names the flags.
// ---------------------------------------------------------------------------
{
  const help = runGeneratorCli(['--help']);
  const helpOut = String(help.stdout || '') + String(help.stderr || '');
  assert(/--write/.test(helpOut) && /--check/.test(helpOut)
    && /--refresh-present/.test(helpOut) && /--print-tree-root/.test(helpOut)
    && /--forge/.test(helpOut) && /--merge-hooks/.test(helpOut) && /--strip-hooks/.test(helpOut),
    'G6: --help names --write / --check / --refresh-present / --print-tree-root / --forge= / --merge-hooks / --strip-hooks');

  const printed = runGeneratorCli(['--print-tree-root']);
  assert(printed.status === 0, 'G6: --print-tree-root exits 0 (got ' + printed.status + ')');
  const line = String(printed.stdout || '').replace(/\n$/, '');
  assert(path.isAbsolute(line) && !line.includes('\n'),
    'G6: --print-tree-root prints one absolute path on stdout (installers consume it as a path) — got '
    + JSON.stringify(line));
  let printedReal = line;
  let treeReal = TREE_ROOT;
  try { printedReal = fs.realpathSync(line); } catch (_) { /* literal stands */ }
  try { treeReal = fs.realpathSync(TREE_ROOT); } catch (_) { /* literal stands */ }
  assert(line === TREE_ROOT || printedReal === treeReal,
    'G6: --print-tree-root agrees with this suite\'s independently computed TREE_ROOT — printed '
    + JSON.stringify(line) + ' vs ' + JSON.stringify(TREE_ROOT));
  assert(!/NOTE/.test(String(printed.stdout || '')),
    'G6: --print-tree-root stdout carries no advisory (a caller will try to open that line)');

  const refresh = runGenerator(['--refresh-present']);
  assert(refresh.status === 0,
    'G6: --refresh-present exits 0 (got ' + refresh.status + ': '
    + String(refresh.stderr || refresh.stdout).split('\n')[0] + ')');

  const bad = runGeneratorCli(['--forge=svn', '--check']);
  assert(bad.status === 2,
    'G6: sync --forge=svn refuses with exit 2 rather than defaulting to github (got ' + bad.status + ')');

  const missingDest = runGeneratorCli(['--merge-hooks']);
  assert(missingDest.status === 2,
    'G6: --merge-hooks without --dest=PATH exits 2 (got ' + missingDest.status + ')');

  const mergeDir = fs.mkdtempSync(path.join(tmpBase(), 'cursor-merge-'));
  try {
    const dest = path.join(mergeDir, 'hooks.json');
    fs.writeFileSync(dest, JSON.stringify({
      version: 1,
      hooks: {
        beforeShellExecution: [{ command: 'echo user-owned' }],
        sessionStart: [{ command: './hooks/kaola-workflow-compact-context.sh' }],
      },
    }, null, 2) + '\n');
    const merged = runGenerator(['--merge-hooks', '--dest=' + dest]);
    assert(merged.status === 0, 'G6-merge: --merge-hooks exits 0 (got ' + merged.status + ')');
    let after = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert(Array.isArray(after.hooks.beforeShellExecution) && after.hooks.beforeShellExecution.length === 1,
      'G6-merge: preserves the user beforeShellExecution entry');
    assert(!kaolaHookRows(after).length && !after.hooks.sessionStart,
      'G6-merge: empty incoming mapping strips retired Kaola sessionStart without adding a hook');
    const stripped = runGenerator(['--strip-hooks', '--dest=' + dest]);
    assert(stripped.status === 0, 'G6-strip: --strip-hooks exits 0 (got ' + stripped.status + ')');
    after = JSON.parse(fs.readFileSync(dest, 'utf8'));
    assert(Array.isArray(after.hooks.beforeShellExecution),
      'G6-strip: user entries remain');
    assert(!after.hooks.sessionStart,
      'G6-strip: kaola sessionStart is removed');
    fs.writeFileSync(dest, 'not-json{');
    const refuse = runGeneratorCli(['--merge-hooks', '--dest=' + dest]);
    assert(refuse.status === 1,
      'G6-merge: unreadable dest JSON fails closed (got ' + refuse.status + ')');
  } finally {
    try { fs.rmSync(mergeDir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// G7: forge axis — --forge=gitlab / --forge=gitea write sibling trees from
// commandSources(), never a hand-ported command list.
// ---------------------------------------------------------------------------
{
  for (const forge of ['gitlab', 'gitea']) {
    const w = runGenerator(['--forge=' + forge, '--write']);
    assert(w.status === 0,
      'G7[' + forge + ']: sync --write exits 0 (got ' + w.status + ': '
      + String(w.stderr || '').slice(0, 200) + ')');
    const label = '.cursor-' + forge;
    const abs = path.join(TREE_ROOT, label);
    assert(fs.existsSync(abs),
      'G7[' + forge + ']: generated tree lands at ' + label);
    const expected = commandNamesFor(forge);
    const cmdDir = path.join(abs, 'commands');
    const actual = fs.existsSync(cmdDir)
      ? fs.readdirSync(cmdDir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort()
      : [];
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      'G7[' + forge + ']: ' + label + '/commands is exactly commandSources(' + forge
      + ') — expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
    assert(!fs.existsSync(path.join(abs, 'agents')),
      'G7[' + forge + ']: ' + label + ' has no agents/ directory (Kaola ships no Cursor agents)');
    for (const name of CURSOR_CLI_MATERIALIZATION_COMMANDS) {
      const rel = commandRel(name, forge);
      const surface = cursorCliMaterializationSurface(name);
      const verdict = cursorCliMaterializationVerdict(exists(rel) ? read(rel) : '', forge, surface);
      assert(verdict.ok,
        surface === 'next'
          ? ('G7[' + forge + '][' + name + ']: generated Next keeps startup/resume Repo prep on '
            + 'standalone CLI/local with App/Cloud negative and no role-catalog skip — '
            + verdict.errors.join(' | '))
          : ('G7[' + forge + '][' + name + ']: generated Finalize carries no retired pre-dispatch '
            + 'role materialization — ' + verdict.errors.join(' | ')));
    }
    const c = runGeneratorCli(['--forge=' + forge, '--check']);
    assert(c.status === 0,
      'G7[' + forge + ']: --check is green after --write (got ' + c.status + ')');
  }
  const isolatedRoot = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g7-isolated-root-'));
  try {
    const staged = runGenerator(['--forge=github', '--write', '--tree-root=' + isolatedRoot]);
    assert(staged.status === 0
      && fs.existsSync(path.join(isolatedRoot, '.cursor', 'commands', 'workflow-next.md'))
      && fs.existsSync(path.join(isolatedRoot, '.cursor', 'hooks.json'))
      && !fs.existsSync(path.join(isolatedRoot, '.cursor', 'agents')),
    'G7[isolated]: --tree-root renders a complete github source (commands + hooks.json, no agents/) under the explicit staging root');
    const relative = runGeneratorCli(['--write', '--tree-root=relative-staging']);
    assert(relative.status === 2,
      'G7[isolated]: --tree-root refuses a relative path (got ' + relative.status + ')');
    const occupiedRoot = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g7-occupied-root-'));
    fs.writeFileSync(path.join(occupiedRoot, 'owner.txt'), 'OWNER\n');
    const occupied = runGeneratorCli(['--write', '--tree-root=' + occupiedRoot]);
    assert(occupied.status === 2 && fs.readFileSync(path.join(occupiedRoot, 'owner.txt'), 'utf8') === 'OWNER\n',
      'G7[isolated]: --tree-root refuses an occupied directory without touching owner bytes');
    fs.rmSync(occupiedRoot, { recursive: true, force: true });
  } finally {
    try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// G8: install-cursor.sh — hermetic cases against the REAL installer with temp
// HOME + CURSOR_HOME + --target under tmpBase(), never the host ~/.cursor.
// ---------------------------------------------------------------------------
{
  assert(fs.existsSync(INSTALLER),
    'G8: installer not present: install-cursor.sh is required for the hermetic install contract');
  {
    // spawn-class: cli-contract
    const syntax = spawnSync('bash', ['-n', INSTALLER], { encoding: 'utf8' });
    assert(syntax.status === 0,
      'G8: bash -n install-cursor.sh (got ' + syntax.status + ' — '
      + String(syntax.stderr || syntax.stdout).split('\n')[0] + ')');
  }
  if (fs.existsSync(INSTALLER)) {
    // Issue #1032/#1039: the active receipt transaction—not dormant shell cleanup—owns the
    // retired dispatch hook. Install strips that exact Kaola namespace entry while uninstall
    // removes only entries recorded in the receipt.
    const installerSource = fs.readFileSync(INSTALLER, 'utf8');
    const cursorSurfaceSource = fs.readFileSync(path.join(REPO, 'scripts',
      'kaola-workflow-cursor-surface.js'), 'utf8');
    assert(/function isKaolaHookEntry\s*\(/.test(cursorSurfaceSource)
      && /kaola-workflow-/.test(cursorSurfaceSource),
      'R1: the migration classifier recognizes receipt-owned retired Kaola hook rows');
    assert(/filter\(entry => !isKaolaHookEntry\(entry\)\)\.concat\(entries\)/.test(cursorSurfaceSource),
      'R2: install hook merge strips bounded retired Kaola entries before adding the current mapping');
    assert(/removeRecordedHooks\(hooksFile, info\.receipt\.hook_entries \|\| \{\}\)/.test(cursorSurfaceSource),
      'R3: uninstall removes only exact receipt-recorded hook entries');
    assert(!/install_support_scripts\(\) \{|uninstall_edition\(\) \{/.test(installerSource),
      'R4: installer carries no dormant legacy cleanup implementation beside the active transaction');
    assert(!/also deploying agents\+commands/.test(installerSource),
      'G8-source: --global no longer dual-writes the invoking Git repository');
    assert(!/git rev-parse --show-toplevel/.test(installerSource),
      'G8-source: --global does not resolve an ambient git toplevel to copy into');
    assert(/mktemp -d "\$KW_TMPDIR\/kaola-cursor-staging\.XXXXXX"/.test(installerSource)
      && /--tree-root="\$STAGING_ROOT"/.test(installerSource),
    'G8-source: normal installs render canonical Cursor bytes only in an isolated staging root');
    const firstLine = r => String(r.stderr || r.stdout || '').split('\n')[0];
    // #1101: the edition deploys no agent; any Markdown under an agents/ dir is user-owned.
    const agentFiles = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort() : []);
    const receiptAgentPaths = file => (fs.existsSync(file)
      ? Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).files || {}).filter(rel => rel.startsWith('agents/'))
      : ['<missing receipt>']);
    function runInstaller(extraArgs, opts) {
      opts = opts || {};
      const home = opts.home || fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-home-'));
      const cursorHome = opts.cursorHome || fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-ch-'));
      const dest = opts.dest || fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-dest-'));
      const args = ['--yes'].concat(opts.skipTarget ? [] : ['--target', dest]).concat(extraArgs || []);
      const spawnOpts = {
        env: Object.assign({}, process.env, { HOME: home, CURSOR_HOME: cursorHome }, opts.env || {}),
        encoding: 'utf8',
      };
      if (opts.cwd) spawnOpts.cwd = opts.cwd;
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER].concat(args), spawnOpts);
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', home, cursorHome, dest };
    }
    const clean = r => {
      for (const d of [r.home, r.cursorHome, r.dest]) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    };

    // Project deploy. A user agent under CURSOR_HOME/agents is never copied into the project
    // (the retired catalog copier's guarantee, now trivially: nothing under agents/ is managed).
    {
      const seededHome = fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-ch-'));
      fs.mkdirSync(path.join(seededHome, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(seededHome, 'agents', 'user-agent.md'), '# stray user agent\n');
      const r = runInstaller([], { cursorHome: seededHome });
      assert(r.status === 0,
        'G8-project: install-cursor.sh --target exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.cursor', 'agents');
      const commandsDir = path.join(r.dest, '.cursor', 'commands');
      assert(agentFiles(agentsDir).length === 0,
        'G8-project: deploys no agent under <target>/.cursor/agents/ (not even a CURSOR_HOME user agent) — found '
        + JSON.stringify(agentFiles(agentsDir)));
      assert(fs.readFileSync(path.join(seededHome, 'agents', 'user-agent.md'), 'utf8') === '# stray user agent\n',
        'G8-project: the user agent under CURSOR_HOME/agents is left untouched');
      assert(receiptAgentPaths(path.join(r.cursorHome, cursorSurface.AUTHORITY_RECEIPT_REL)).length === 0
        && receiptAgentPaths(path.join(r.dest, '.cursor', cursorSurface.PROJECT_RECEIPT_REL)).length === 0,
        'G8-project: neither the global authority receipt nor the project receipt records an agents/ path');
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-project[' + name + ']: command deployed under <target>/.cursor/commands/');
      }
      const scriptsDir = path.join(r.cursorHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir),
        'G8-project: support scripts land at $CURSOR_HOME/kaola-workflow/scripts');
      const projectHooks = path.join(r.dest, '.cursor', 'hooks.json');
      assert(fs.existsSync(projectHooks),
        'G8-project: Cursor project mapping remains a valid empty hooks.json carrier');
      noKaolaCursorHooks(parseCursorHooksJson(fs.readFileSync(projectHooks, 'utf8')), 'G8-project');
      assert(!fs.existsSync(path.join(r.dest, '.cursor', 'hooks')),
        'G8-project: no .cursor/hooks directory is installed');
      assert(!fs.existsSync(path.join(r.cursorHome, 'hooks.json')),
        'G8-project: no user-global hooks.json is created by project install');
      const projectRule = path.join(r.dest, '.cursor', 'rules', CURSOR_RECOVERY_RULE);
      const projectGlobalRule = path.join(r.dest, '.cursor', 'rules', CURSOR_GLOBAL_RULE);
      assert(!fs.existsSync(projectRule),
        'G8-project: edition install retires rather than duplicates the old project recovery Rule');
      assert(!fs.existsSync(projectGlobalRule),
        'G8-project: standalone edition install leaves the global Rule to the explicit global transaction');
      clean(r);
    }

    // --global: commands land under CURSOR_HOME (the ~/.cursor equivalent), un-nested; no agents.
    {
      const stagingParent = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-staging-parent-'));
      const r = runInstaller(['--global'], {
        skipTarget: true,
        env: { TMPDIR: stagingParent },
      });
      assert(r.status === 0,
        'G8-global: install-cursor.sh --global exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(agentFiles(path.join(r.cursorHome, 'agents')).length === 0,
        'G8-global: deploys no agent under $CURSOR_HOME/agents/ — found '
        + JSON.stringify(agentFiles(path.join(r.cursorHome, 'agents'))));
      assert(receiptAgentPaths(path.join(r.cursorHome, cursorSurface.AUTHORITY_RECEIPT_REL)).length === 0,
        'G8-global: the Cursor global authority receipt records no agents/ path');
      for (const name of canonCommandNames) {
        assert(fs.existsSync(path.join(r.cursorHome, 'commands', name + '.md')),
          'G8-global[' + name + ']: command deployed under $CURSOR_HOME/commands/');
      }
      assert(!fs.existsSync(path.join(r.cursorHome, '.cursor')),
        'G8-global: creates NO nested .cursor/ under CURSOR_HOME (Cursor scans CURSOR_HOME itself)');
      const globalJson = path.join(r.cursorHome, 'hooks.json');
      assert(fs.existsSync(globalJson), 'G8-global: installs a valid empty hooks.json carrier only');
      noKaolaCursorHooks(parseCursorHooksJson(fs.readFileSync(globalJson, 'utf8')), 'G8-global');
      assert(!fs.existsSync(path.join(r.cursorHome, 'hooks')),
        'G8-global: installs no user-global executable hook directory');
      const globalRule = path.join(r.cursorHome, 'rules', CURSOR_RECOVERY_RULE);
      const transactionRule = path.join(r.cursorHome, 'rules', CURSOR_GLOBAL_RULE);
      assert(!fs.existsSync(globalRule),
        'G8-global: edition installer retires the old recovery Rule');
      // #1087 (F5): every runtime installer installs its OWN global-contract carrier as its last
      // step, through the per-target global-contract CLI — the cursor-local Rule plus its record.
      assert(fs.existsSync(transactionRule)
        && fs.existsSync(path.join(r.home, '.config', 'kaola-workflow', 'global-contract-targets',
          'cursor-cli-local.json')),
        'G8-global: edition installer installs its own global-contract Rule through the per-target transaction');
      assert(fs.readdirSync(stagingParent).length === 0,
        'G8-global: isolated generated source is removed after the install transaction');
      clean(r);
      try { fs.rmSync(stagingParent, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
    }

    // #1039: --global from a git work tree must NOT write the invoking repository.
    // Explicit --target remains the project materialization. Do NOT spawn --global
    // with cwd = this repo.
    {
      const gitRepo = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-git-'));
      try {
        G.init(gitRepo);
        fs.mkdirSync(path.join(gitRepo, '.cursor', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(gitRepo, '.cursor', 'agents', 'user-owned.md'), 'keep\n');
        const r = runInstaller(['--global'], { skipTarget: true, cwd: gitRepo });
        assert(r.status === 0,
          'G8-global-git: install-cursor.sh --global from a git-fixture cwd exits 0 (got '
          + r.status + ' — ' + firstLine(r) + ')');
        assert(!fs.existsSync(path.join(gitRepo, '.cursor', 'commands', 'workflow-next.md')),
          'G8-global-git: --global from a git-fixture cwd does not write <toplevel>/.cursor/commands/workflow-next.md');
        assert(fs.readFileSync(path.join(gitRepo, '.cursor', 'agents', 'user-owned.md'), 'utf8') === 'keep\n',
          'G8-global-git: --global leaves an existing unmanaged project file untouched');
        assert(!/also deploying/i.test(r.stdout + r.stderr),
          'G8-global-git: --global does not announce an ambient project deploy');
        assert(!fs.existsSync(path.join(r.cursorHome, '.cursor')),
          'G8-global-git: still creates NO nested .cursor/ under CURSOR_HOME');
        assert(fs.existsSync(path.join(r.cursorHome, 'commands', 'workflow-next.md')),
          'G8-global-git: still deploys un-nested commands under $CURSOR_HOME/commands/');
        const targeted = runInstaller(['--target', gitRepo], { skipTarget: true, cwd: gitRepo, home: r.home, cursorHome: r.cursorHome });
        assert(targeted.status === 0,
          'G8-explicit-target: --target DIR still materializes project .cursor/ (got '
          + targeted.status + ' — ' + firstLine(targeted) + ')');
        assert(fs.existsSync(path.join(gitRepo, '.cursor', 'commands', 'workflow-next.md'))
          && !fs.existsSync(path.join(gitRepo, '.cursor', 'agents', 'implementer.md')),
          'G8-explicit-target: --target DIR writes <dir>/.cursor/commands/workflow-next.md and no agent');
        assert(fs.readFileSync(path.join(gitRepo, '.cursor', 'agents', 'user-owned.md'), 'utf8') === 'keep\n',
          'G8-explicit-target: the project user agent survives explicit materialization');
        clean(r);
      } finally {
        try { fs.rmSync(gitRepo, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // The edition installer must remain free of duplicate Rules on every Cursor host.
    // The explicit global transaction is exercised independently by issue-1046 acceptance;
    // host-specific hook declarations are intentionally absent here.
    // These are independent hermetic targets, each exercised through the real installer,
    // rather than a fabricated host-internal trust or hook API.
    for (const host of [
      { id: 'standalone-cli', product: 'cli', host: 'local' },
      { id: 'app-local', product: 'app', host: 'local' },
      { id: 'app-cloud', product: 'app', host: 'cloud' },
    ]) {
      const r = runInstaller([]);
      const hooksPath = path.join(r.dest, '.cursor', 'hooks.json');
      const rulePath = path.join(r.dest, '.cursor', 'rules', CURSOR_RECOVERY_RULE);
      const transactionRulePath = path.join(r.dest, '.cursor', 'rules', CURSOR_GLOBAL_RULE);
      const mapping = fs.existsSync(hooksPath)
        ? parseCursorHooksJson(fs.readFileSync(hooksPath, 'utf8')) : null;
      assert(r.status === 0,
        'G8-rule[' + host.id + ']: project install exits 0 for ' + host.product + '/' + host.host);
      noKaolaCursorHooks(mapping, 'G8-rule[' + host.id + ']');
      assert(!fs.existsSync(path.join(r.dest, '.cursor', 'hooks')),
        'G8-rule[' + host.id + ']: no host-specific executable hook carrier is installed');
      assert(!fs.existsSync(rulePath) && !fs.existsSync(transactionRulePath),
        'G8-rule[' + host.id + ']: edition contributes no duplicate recovery/global Rule');
      clean(r);
    }

    // Standalone CLI pre-dispatch drives the helper installed by --global, not
    // the repository installer and not a blind cwd copier. Exercise that
    // installed artifact in isolation: its first explicit target transaction
    // materializes authority bytes, its second is a byte/mtime no-op, and every
    // unproved or stale ownership shape fails before mutation.
    {
      const global = runInstaller(['--global'], { skipTarget: true });
      const targets = [];
      const makeTarget = label => {
        const dir = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-helper-' + label + '-'));
        targets.push(dir);
        return dir;
      };
      const helper = path.join(global.cursorHome, 'kaola-workflow', 'scripts',
        'kaola-workflow-cursor-surface.js');
      const authorityReceipt = path.join(global.cursorHome, 'kaola-workflow', 'cursor-authority.json');
      const snapshot = root => walkFiles(root, '').sort().map(rel => {
        const file = path.join(root, rel);
        const stat = fs.lstatSync(file, { bigint: true });
        if (stat.isSymbolicLink()) return rel + ':symlink:' + fs.readlinkSync(file);
        return rel + ':regular:' + (stat.mode & 0o777n).toString(8) + ':'
          + stat.mtimeNs.toString() + ':' + sha256File(file);
      });
      const runHelper = (args, cwd) => {
        // spawn-class: environment
        return spawnSync(process.execPath, [helper].concat(args || []), {
          cwd: cwd || REPO,
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
      };
      try {
        const receipt = global.status === 0 && fs.existsSync(authorityReceipt)
          ? JSON.parse(fs.readFileSync(authorityReceipt, 'utf8')) : null;
        const helperReady = global.status === 0 && fs.existsSync(helper)
          && receipt && receipt.files
          && receipt.files['kaola-workflow/scripts/kaola-workflow-cursor-surface.js'];
        assert(helperReady,
        'G8-installed-helper: --global installs and receipts the safe Cursor materialization helper');

        if (helperReady) {
          const fresh = makeTarget('fresh');
          const first = runHelper(['--ensure-target', fresh, '--forge=github', '--json'], fresh);
          let firstBody = null;
          try { firstBody = JSON.parse(first.stdout); } catch (_) { /* asserted below */ }
          const globalAgent = path.join(global.cursorHome, 'commands', 'workflow-next.md');
          const targetAgent = path.join(fresh, '.cursor', 'commands', 'workflow-next.md');
          assert(first.status === 0 && firstBody && firstBody.status === 'materialized'
            && fs.existsSync(targetAgent) && fs.readFileSync(targetAgent).equals(fs.readFileSync(globalAgent)),
          'G8-installed-helper-materialized: first explicit target call materializes bytes from installed global authority — '
            + firstLine(first));
          const beforeCurrent = snapshot(path.join(fresh, '.cursor'));
          const second = runHelper(['--ensure-target', fresh, '--forge=github', '--json'], fresh);
          let secondBody = null;
          try { secondBody = JSON.parse(second.stdout); } catch (_) { /* asserted below */ }
          const afterCurrent = snapshot(path.join(fresh, '.cursor'));
          assert(second.status === 0 && secondBody && secondBody.status === 'current'
            && JSON.stringify(afterCurrent) === JSON.stringify(beforeCurrent),
          'G8-installed-helper-current: a fresh/current second call is a byte-and-mtime no-op — before '
            + JSON.stringify(beforeCurrent) + ' after ' + JSON.stringify(afterCurrent));

          fs.writeFileSync(targetAgent, 'OWNER_MODIFIED_RECEIPT_BYTES\n');
          const beforeModified = snapshot(path.join(fresh, '.cursor'));
          const modified = runHelper(['--ensure-target', fresh, '--forge=github', '--json'], fresh);
          const afterModified = snapshot(path.join(fresh, '.cursor'));
          assert(modified.status !== 0 && JSON.stringify(afterModified) === JSON.stringify(beforeModified)
            && fs.readFileSync(targetAgent, 'utf8') === 'OWNER_MODIFIED_RECEIPT_BYTES\n',
          'G8-installed-helper-modified: modified receipt-owned bytes fail closed without target mutation — '
            + firstLine(modified));

          const collision = makeTarget('collision');
          const collisionFile = path.join(collision, '.cursor', 'commands', 'workflow-next.md');
          fs.mkdirSync(path.dirname(collisionFile), { recursive: true });
          fs.writeFileSync(collisionFile, 'UNPROVED_OWNER_BYTES\n');
          const beforeCollision = snapshot(path.join(collision, '.cursor'));
          const collided = runHelper(['--ensure-target', collision, '--forge=github', '--json'], collision);
          const afterCollision = snapshot(path.join(collision, '.cursor'));
          assert(collided.status !== 0 && JSON.stringify(afterCollision) === JSON.stringify(beforeCollision)
            && fs.readFileSync(collisionFile, 'utf8') === 'UNPROVED_OWNER_BYTES\n',
          'G8-installed-helper-collision: unproved canonical-name bytes fail closed without overwrite — '
            + firstLine(collided));

          const symlink = makeTarget('symlink');
          const symlinkOwner = path.join(symlink, 'outside-owner.md');
          const symlinkFile = path.join(symlink, '.cursor', 'commands', 'workflow-next.md');
          fs.writeFileSync(symlinkOwner, 'SYMLINK_OWNER_BYTES\n');
          fs.mkdirSync(path.dirname(symlinkFile), { recursive: true });
          fs.symlinkSync(symlinkOwner, symlinkFile);
          const symlinked = runHelper(['--ensure-target', symlink, '--forge=github', '--json'], symlink);
          assert(symlinked.status !== 0 && fs.lstatSync(symlinkFile).isSymbolicLink()
            && fs.readFileSync(symlinkOwner, 'utf8') === 'SYMLINK_OWNER_BYTES\n',
          'G8-installed-helper-symlink: a managed-basename symlink fails closed without following it — '
            + firstLine(symlinked));

          const ambient = makeTarget('ambient');
          const untargeted = runHelper(['--ensure-target'], ambient);
          assert(untargeted.status !== 0 && !fs.existsSync(path.join(ambient, '.cursor')),
            'G8-installed-helper-no-target: missing explicit target fails without ambient cwd materialization — '
            + firstLine(untargeted));

          // #1074: the installed copy has no package.json at its root, so there is
          // no package version to compare — the receipt's recorded version stands
          // and --doctor must not report a false stale_version.
          const doctorResult = runHelper(['--doctor', '--json'], fresh);
          let doctorBody = null;
          try { doctorBody = JSON.parse(doctorResult.stdout); } catch (_) { /* asserted below */ }
          assert(doctorResult.status === 0 && doctorBody && doctorBody.authority
            && doctorBody.authority.freshness === 'current',
            'G8-installed-helper-doctor: installed helper (no package.json) reports the authority '
            + 'current, not a false stale_version — ' + firstLine(doctorResult));
          assert(doctorBody && doctorBody.authority
            && doctorBody.authority.version_source === 'installed_receipt',
            'G8-installed-helper-doctor: version_source names the installed receipt as the version '
            + 'reference — ' + JSON.stringify(doctorBody && doctorBody.authority
              && doctorBody.authority.version_source));
          assert(doctorBody && doctorBody.authority
            && doctorBody.authority.receipt_version === receipt.kaola_workflow_version,
            'G8-installed-helper-doctor: receipt_version echoes the version the installed receipt '
            + 'recorded — ' + JSON.stringify(doctorBody && doctorBody.authority
              && doctorBody.authority.receipt_version));

          const stale = makeTarget('stale-authority');
          const globalAgentBytes = fs.readFileSync(globalAgent);
          fs.writeFileSync(globalAgent, 'STALE_GLOBAL_AUTHORITY_BYTES\n');
          const staleResult = runHelper(['--ensure-target', stale, '--forge=github', '--json'], stale);
          assert(staleResult.status !== 0 && !fs.existsSync(path.join(stale, '.cursor')),
            'G8-installed-helper-stale-authority: hash-stale global authority fails before target mutation — '
            + firstLine(staleResult));

          fs.writeFileSync(globalAgent, globalAgentBytes);
          fs.rmSync(authorityReceipt, { force: true });
          const missing = makeTarget('missing-authority');
          const missingResult = runHelper(['--ensure-target', missing, '--forge=github', '--json'], missing);
          assert(missingResult.status !== 0 && !fs.existsSync(path.join(missing, '.cursor')),
            'G8-installed-helper-missing-authority: missing global receipt fails before target mutation — '
            + firstLine(missingResult));
        }
      } finally {
        clean(global);
        for (const dir of targets) {
          try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        }
      }
    }

    // #1039: a project exception is explicit and ownership-safe. A canonical-name
    // regular-file collision must be diagnosed and refused; uninstall must not
    // turn a refused install into deletion by basename.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-collision-'));
      const global = runInstaller(['--global'], { skipTarget: true });
      try {
        const ownerAgent = path.join(dest, '.cursor', 'agents', 'implementer.md');
        const ownerCommand = path.join(dest, '.cursor', 'commands', 'workflow-next.md');
        fs.mkdirSync(path.dirname(ownerAgent), { recursive: true });
        fs.mkdirSync(path.dirname(ownerCommand), { recursive: true });
        fs.writeFileSync(ownerAgent, 'OWNER_AGENT_COLLISION\n');
        fs.writeFileSync(ownerCommand, 'OWNER_COMMAND_COLLISION\n');
        // spawn-class: environment
        const doctor = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--target', dest,
          '--product', 'cli', '--host', 'local'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        const doctorText = String(doctor.stdout || '') + String(doctor.stderr || '');
        const installed = runInstaller(['--target', dest, '--no-scripts'], {
          skipTarget: true, dest, home: global.home, cursorHome: global.cursorHome,
        });
        assert(/collision|unmanaged/i.test(doctorText) && doctorText.includes('workflow-next.md')
          && !/agents\/implementer\.md/.test(doctorText),
          'G8-collision-doctor: doctor identifies the canonical command collision and no agent collision — got '
          + JSON.stringify(doctorText.slice(0, 500)));
        assert(installed.status !== 0,
          'G8-collision: explicit target refuses unmanaged canonical-name files (got '
          + installed.status + ' — ' + firstLine(installed) + ')');
        assert(fs.readFileSync(ownerAgent, 'utf8') === 'OWNER_AGENT_COLLISION\n'
          && fs.readFileSync(ownerCommand, 'utf8') === 'OWNER_COMMAND_COLLISION\n',
        'G8-collision: refused install preserves the command owner bytes and the user agent (never managed)');
        // spawn-class: environment
        const uninstalled = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        assert(uninstalled.status === 0 && fs.existsSync(ownerAgent) && fs.existsSync(ownerCommand)
          && fs.readFileSync(ownerAgent, 'utf8') === 'OWNER_AGENT_COLLISION\n'
          && fs.readFileSync(ownerCommand, 'utf8') === 'OWNER_COMMAND_COLLISION\n',
        'G8-collision-uninstall: uninstall preserves files that were never recorded as managed');
      } finally {
        clean(global);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // A symlink at a managed basename is ownership, not a writable destination.
    // Neither install nor uninstall may follow it or remove it.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-symlink-'));
      const outside = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-symlink-owner-'));
      const global = runInstaller(['--global'], { skipTarget: true });
      try {
        const ownerTarget = path.join(outside, 'owner-workflow-next.md');
        const link = path.join(dest, '.cursor', 'commands', 'workflow-next.md');
        fs.writeFileSync(ownerTarget, 'OWNER_SYMLINK_TARGET\n');
        fs.mkdirSync(path.dirname(link), { recursive: true });
        fs.symlinkSync(ownerTarget, link);
        const installed = runInstaller(['--target', dest, '--no-scripts'], {
          skipTarget: true, dest, home: global.home, cursorHome: global.cursorHome,
        });
        assert(installed.status !== 0 && fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()
          && fs.readFileSync(ownerTarget, 'utf8') === 'OWNER_SYMLINK_TARGET\n',
        'G8-symlink: explicit target refuses a managed-basename symlink without following it');
        // spawn-class: environment
        const uninstalled = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        assert(uninstalled.status === 0 && fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()
          && fs.readFileSync(ownerTarget, 'utf8') === 'OWNER_SYMLINK_TARGET\n',
        'G8-symlink-uninstall: uninstall preserves an unmanaged symlink and its outside target');
      } finally {
        clean(global);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        try { fs.rmSync(outside, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // Fresh materialization must be derived from the installed global authority,
    // and doctor must expose target identity plus the exact materialized hash. A
    // missing global authority may not silently fall back to repository sources.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-fresh-'));
      const secondDest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-authority-'));
      const global = runInstaller(['--global'], { skipTarget: true });
      try {
        const installed = runInstaller(['--target', dest, '--no-scripts'], {
          skipTarget: true, dest, home: global.home, cursorHome: global.cursorHome,
        });
        const globalAgent = path.join(global.cursorHome, 'commands', 'workflow-next.md');
        const targetAgent = path.join(dest, '.cursor', 'commands', 'workflow-next.md');
        assert(installed.status === 0 && fs.existsSync(globalAgent) && fs.existsSync(targetAgent)
          && fs.readFileSync(targetAgent).equals(fs.readFileSync(globalAgent)),
        'G8-freshness: explicit target bytes equal the installed global authority');
        const targetHash = fs.existsSync(targetAgent) ? sha256File(targetAgent) : '';
        // spawn-class: environment
        const doctor = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--target', dest,
          '--product', 'cli', '--host', 'local'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        const doctorText = String(doctor.stdout || '');
        assert(doctor.status === 0 && doctorText.includes(path.resolve(dest)),
          'G8-freshness-doctor: doctor reports the exact explicit project target');
        assert(!!targetHash && doctorText.includes(targetHash),
          'G8-freshness-doctor: doctor reports the exact materialized content hash ' + targetHash);
        assert(/fresh|current/i.test(doctorText) && /scope/i.test(doctorText),
          'G8-freshness-doctor: doctor reports effective scope and current/fresh state — got '
          + JSON.stringify(doctorText.slice(0, 800)));

        fs.writeFileSync(targetAgent, 'OWNER_CHANGED_AFTER_MATERIALIZATION\n');
        // spawn-class: environment
        const staleDoctor = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--target', dest,
          '--product', 'cli', '--host', 'local'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        const staleText = String(staleDoctor.stdout || '') + String(staleDoctor.stderr || '');
        assert(/stale|collision|modified|mismatch/i.test(staleText),
          'G8-freshness-doctor: doctor detects a post-materialization byte mismatch');
        // spawn-class: environment
        const uninstalled = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
          env: Object.assign({}, process.env, { HOME: global.home, CURSOR_HOME: global.cursorHome }),
          encoding: 'utf8',
        });
        assert(uninstalled.status === 0 && fs.existsSync(targetAgent)
          && fs.readFileSync(targetAgent, 'utf8') === 'OWNER_CHANGED_AFTER_MATERIALIZATION\n',
        'G8-freshness-uninstall: uninstall preserves a managed file whose bytes no longer match its manifest');

        fs.rmSync(globalAgent, { force: true });
        const missingAuthority = runInstaller(['--target', secondDest, '--no-scripts'], {
          skipTarget: true, dest: secondDest, home: global.home, cursorHome: global.cursorHome,
        });
        assert(missingAuthority.status !== 0
          && !fs.existsSync(path.join(secondDest, '.cursor', 'commands', 'workflow-next.md')),
        'G8-authority: explicit target refuses a missing/stale installed global authority instead of '
          + 'falling back to repository source bytes');
      } finally {
        clean(global);
        try { fs.rmSync(dest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
        try { fs.rmSync(secondDest, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // #1014: --global from a directory with no git toplevel must not invent cwd/.cursor/.
    {
      const plain = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-nongit-'));
      try {
        const r = runInstaller(['--global'], { skipTarget: true, cwd: plain });
        assert(r.status === 0,
          'G8-global-nongit: --global from a non-git cwd exits 0 (got ' + r.status
          + ' — ' + firstLine(r) + ')');
        assert(!fs.existsSync(path.join(plain, '.cursor')),
          'G8-global-nongit: --global from a directory with no git toplevel does not invent a project .cursor/ tree');
        assert(!fs.existsSync(path.join(r.cursorHome, '.cursor')),
          'G8-global-nongit: still creates NO nested .cursor/ under CURSOR_HOME');
        clean(r);
      } finally {
        try { fs.rmSync(plain, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // #1039: doctor reports surfaces without inferring App from CLI or local from Cloud.
    {
      // spawn-class: environment
      const r = spawnSync('bash', [INSTALLER, '--doctor', '--json', '--product', 'app', '--host', 'cloud'], {
        encoding: 'utf8',
        env: process.env,
      });
      assert(r.status === 0, 'G8-doctor: --doctor --json exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const doc = JSON.parse(r.stdout);
      assert(doc.runtime === 'cursor', 'G8-doctor: runtime is cursor');
      assert(doc.product_surface === 'app', 'G8-doctor: product_surface is app');
      assert(doc.execution_host === 'cloud', 'G8-doctor: execution_host is cloud');
      assert(doc.inferred_from_sibling_binary === false,
        'G8-doctor: does not infer from sibling binaries');
      assert(doc.ambient_repository_write === false,
        'G8-doctor: ambient_repository_write is false');
      assert(doc.surfaces.app.execution_hosts.local.global_discovery === 'unknown',
        'G8-doctor: App local global_discovery stays unknown, not false');
      assert(doc.surfaces.app.execution_hosts.cloud.global_discovery === 'unsupported',
        'G8-doctor: App Cloud does not claim user-global discovery');
      assert(doc.surfaces.app.execution_hosts.cloud.required_project_materialization === 'yes',
        'G8-doctor: App Cloud requires environment-Build project materialization');
      assert(doc.surfaces.app.execution_hosts.cloud.remote_injection === 'agent_confirmed_cloud_environment_setup_install_and_save',
        'G8-doctor: App Cloud names the Agent-confirmed setup/install/save carrier');
      assert(!Object.prototype.hasOwnProperty.call(doc, 'named_catalog')
        && !Object.prototype.hasOwnProperty.call(doc, 'dispatch_contract')
        && !Object.prototype.hasOwnProperty.call(doc.surfaces.app.execution_hosts.cloud, 'named_catalog'),
        'G8-doctor: the report carries no retired named_catalog or dispatch_contract role field (#1101)');
      assert(doc.surfaces.app.execution_hosts.cloud.reload === 'new_same_repository_cloud_parent_after_environment_save',
        'G8-doctor: App Cloud requires a new same-repository parent after environment save');
      assert(doc.surfaces.cli.execution_hosts.local.required_project_materialization === 'yes',
        'G8-doctor: CLI requires explicit project materialization');
      assert(doc.runtime_build === 'unknown',
        'G8-doctor: current Build stays unknown without a current observation');
      assert(doc.evidence_stamp
        && doc.evidence_stamp.runtime_build === 'bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2',
      'G8-doctor: historical Build remains typed under evidence_stamp');
      const currentIdentityGaps = report => [
        report.runtime_build !== 'unknown' ? 'current-build-inferred' : null,
      ].filter(Boolean);
      assert(currentIdentityGaps(doc).length === 0,
        'G8-doctor-current-identity: empty host has no inferred current identity');
      const flattenedHistoricalEvidence = Object.assign({}, doc, {
        runtime_build: doc.evidence_stamp.runtime_build,
      });
      assert(JSON.stringify(currentIdentityGaps(flattenedHistoricalEvidence))
        === JSON.stringify(['current-build-inferred']),
      'G8-doctor-current-identity mutation RED: flattening historical evidence is detected');
      assert(typeof doc.kaola_workflow_version === 'string'
        && doc.kaola_workflow_version.length > 0,
        'G8-doctor: reports Kaola-Workflow version');
    }

    // #1039 release migration: receipt-less 10.0.1 global installs may be adopted only when the
    // published legacy hash proves ownership. A one-byte mutation must return to collision-safe
    // refusal, and retired ambient materializer bytes are removed only under the same proof.
    {
      const root = fs.mkdtempSync(path.join(tmpBase(), 'cursor-g8-legacy-adoption-'));
      const rel = 'commands/workflow-next.md';
      const file = path.join(root, 'commands', 'workflow-next.md');
      const oldBytes = Buffer.from('published-legacy-command\n');
      const newBytes = Buffer.from('current-command\n');
      const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
      const desired = { [rel]: { bytes: newBytes, sha256: digest(newBytes), mode: 0o644 } };
      const receiptMissing = { status: 'missing', path: path.join(root, 'missing-receipt.json') };
      const allowed = { [rel]: digest(oldBytes) };
      const retiredRel = 'hooks/kaola-workflow-ensure-cursor-catalog.sh';
      const retiredFile = path.join(root, ...retiredRel.split('/'));
      const retiredBytes = Buffer.from('published-retired-hook\n');
      const retired = { [retiredRel]: digest(retiredBytes) };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, oldBytes);
        assert(cursorSurface.validateManagedPreflight(root, desired, receiptMissing, allowed).length === 0,
          'G8-legacy-adoption: an exact published legacy hash is adoptable without weakening current ownership');
        fs.writeFileSync(file, Buffer.concat([oldBytes, Buffer.from('mutation')]));
        assert(cursorSurface.validateManagedPreflight(root, desired, receiptMissing, allowed)
          .some(item => item.reason === 'unmanaged_collision'),
        'G8-legacy-adoption-mutation: one changed legacy byte restores unmanaged-collision refusal');

        fs.mkdirSync(path.dirname(retiredFile), { recursive: true });
        fs.writeFileSync(retiredFile, retiredBytes);
        assert(cursorSurface.validateLegacyRetired(root, receiptMissing, retired).length === 0,
          'G8-legacy-retired: exact published retired bytes pass preflight');
        assert(cursorSurface.removeLegacyRetired(root, receiptMissing, retired).includes(retiredRel)
          && !fs.existsSync(retiredFile),
        'G8-legacy-retired: exact published retired ambient materializer is removed');
        fs.mkdirSync(path.dirname(retiredFile), { recursive: true });
        fs.writeFileSync(retiredFile, Buffer.concat([retiredBytes, Buffer.from('mutation')]));
        assert(cursorSurface.validateLegacyRetired(root, receiptMissing, retired)
          .some(item => item.reason === 'legacy_retired_file_modified'),
        'G8-legacy-retired-mutation: modified retired bytes fail closed');
        assert(cursorSurface.removeLegacyRetired(root, receiptMissing, retired).length === 0
          && fs.existsSync(retiredFile),
        'G8-legacy-retired-mutation: modified retired bytes are preserved');

        assert(cursorSurface.LEGACY_10_0_1_GLOBAL_HASHES.github[rel]
          === '79e9bd53c1146fc7af9557f4757f6c38de610f2d7ae2cde06c930f3e8ef3aa6c',
        'G8-legacy-adoption: production pins the published 10.0.1 github workflow-next hash');
        for (const forge of ['github', 'gitlab', 'gitea']) {
          const retiredPins = cursorSurface.LEGACY_10_0_1_RETIRED_HASHES[forge];
          assert(retiredPins['kaola-workflow/scripts/kaola-workflow-project-instruction-templates.js']
            === '32ce6ee0711d7b6a3ed83fec12bd6480ceb91103c7fe5257c427cd1a757bb048',
          `G8-legacy-retired-${forge}: production pins the published 10.0.1 project template hash`);
          assert(retiredPins['kaola-workflow/scripts/kaola-workflow-project-instructions.js']
            === '45104e070377043c605dc69aabd043bc01786c706e7432d1e753632a9a585ed5',
          `G8-legacy-retired-${forge}: production pins the published 10.0.1 project writer hash`);
        }
      } finally {
        try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* non-fatal */ }
      }
    }

    // --forge=gitlab renders `.cursor-gitlab/` as the generator SOURCE tree, then
    // copies content into the runtime-native dest Cursor actually scans:
    // <target>/.cursor/{commands,hooks.json}. Same split as kimi (.kimi-gitlab
    // → .kimi-code/skills) and opencode (.opencode-gitlab → .opencode/).
    {
      const r = runInstaller(['--forge=gitlab']);
      assert(r.status === 0,
        'G8-gitlab: install-cursor.sh --forge=gitlab exits 0 (got ' + r.status
        + ' — ' + firstLine(r) + ')');
      const agentsDir = path.join(r.dest, '.cursor', 'agents');
      const commandsDir = path.join(r.dest, '.cursor', 'commands');
      assert(agentFiles(agentsDir).length === 0,
        'G8-gitlab: deploys no agent under <target>/.cursor/agents/ — found ' + JSON.stringify(agentFiles(agentsDir)));
      const expected = commandNamesFor('gitlab');
      for (const name of expected) {
        assert(fs.existsSync(path.join(commandsDir, name + '.md')),
          'G8-gitlab[' + name + ']: command deployed under <target>/.cursor/commands/');
      }
      const gitlabClaim = forgeLayout.scriptName('kaola-workflow-claim.js', 'gitlab');
      const githubClaim = forgeLayout.scriptName('kaola-workflow-claim.js', 'github');
      assert(gitlabClaim !== githubClaim && gitlabClaim.length > 0,
        'G8-gitlab: gitlab claim basename is distinct from github — otherwise the content pin is vacuous');
      const wfNext = fs.existsSync(path.join(commandsDir, 'workflow-next.md'))
        ? fs.readFileSync(path.join(commandsDir, 'workflow-next.md'), 'utf8') : '';
      assert(wfNext.includes(gitlabClaim),
        'G8-gitlab: deployed workflow-next is gitlab-shaped — names ' + gitlabClaim);
      assert(!wfNext.includes(githubClaim),
        'G8-gitlab: deployed workflow-next must not name the github claim script ' + githubClaim);
      assert(/\bglab\b/.test(wfNext),
        'G8-gitlab: deployed workflow-next names glab (gitlab routing surface)');
      clean(r);
    }

    // Unknown forge exit 2, nothing written to --target.
    {
      const r = runInstaller(['--forge=svn']);
      assert(r.status === 2,
        'G8-unknown: install-cursor.sh --forge=svn exits 2 (got ' + r.status + ')');
      const leftover = walkFiles(r.dest, '');
      assert(leftover.length === 0,
        'G8-unknown: unknown forge writes nothing under --target — found ' + leftover.slice(0, 6).join(', '));
      clean(r);
    }

    // --no-scripts skips support scripts; commands still deploy. No edition
    // install mode may reintroduce a duplicate Rule or Cursor hook carrier.
    {
      const withScripts = runInstaller([]);
      const scriptsDir = path.join(withScripts.cursorHome, 'kaola-workflow', 'scripts');
      assert(fs.existsSync(scriptsDir) && fs.readdirSync(scriptsDir).length > 0,
        'G8-noscripts: default install deploys support scripts (the --no-scripts contrast)');
      assert(!fs.existsSync(path.join(withScripts.dest, '.cursor', 'hooks')),
        'G8-noscripts: default install still deploys no executable hooks');
      assert(!fs.existsSync(path.join(withScripts.dest, '.cursor', 'rules', CURSOR_RECOVERY_RULE)),
        'G8-noscripts: default edition install does not deploy the retired recovery Rule');
      clean(withScripts);

      const r = runInstaller(['--no-scripts']);
      assert(r.status === 0,
        'G8-noscripts: --no-scripts exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      assert(canonCommandNames.every(n => fs.existsSync(path.join(r.dest, '.cursor', 'commands', n + '.md'))),
        'G8-noscripts: commands still deploy');
      assert(!fs.existsSync(path.join(r.dest, '.cursor', 'rules', CURSOR_RECOVERY_RULE)),
        'G8-noscripts: no-scripts mode also leaves the retired recovery Rule absent');
      assert(!fs.existsSync(path.join(r.cursorHome, 'kaola-workflow', 'scripts')),
        'G8-noscripts: skips $CURSOR_HOME/kaola-workflow/scripts');
      const hooksDir = path.join(r.dest, '.cursor', 'hooks');
      const hookFiles = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : [];
      assert(hookFiles.length === 0,
        'G8-noscripts: no executable hooks exist — found ' + hookFiles.join(', '));
      const hooksFile = path.join(r.dest, '.cursor', 'hooks.json');
      if (fs.existsSync(hooksFile)) {
        noKaolaCursorHooks(parseCursorHooksJson(fs.readFileSync(hooksFile, 'utf8')), 'G8-noscripts');
      }
      clean(r);
    }

    // A no-scripts transition skips writes but must not forget receipt-proven support assets that
    // remain active on disk. The receipt may carry an empty hook set, never a live hook carrier.
    {
      const full = runInstaller(['--global'], { skipTarget: true });
      const support = path.join(full.cursorHome, 'kaola-workflow', 'scripts',
        'kaola-workflow-cursor-surface.js');
      const authorityReceipt = path.join(full.cursorHome, 'kaola-workflow', 'cursor-authority.json');
      assert(full.status === 0 && fs.existsSync(support)
        && !fs.existsSync(path.join(full.cursorHome, 'hooks')),
      'G8-noscripts-transition: full global seed owns support but no executable hook bytes');
      const skipped = runInstaller(['--global', '--no-scripts'], {
        skipTarget: true, home: full.home, cursorHome: full.cursorHome, dest: full.dest,
      });
      const skippedReceipt = JSON.parse(fs.readFileSync(authorityReceipt, 'utf8'));
      assert(skipped.status === 0 && fs.existsSync(support)
        && !fs.existsSync(path.join(full.cursorHome, 'hooks')),
        'G8-noscripts-transition: no-scripts preserves existing managed bytes');
      assert(skippedReceipt.files['kaola-workflow/scripts/kaola-workflow-cursor-surface.js']
        && skippedReceipt.hook_entries
        && Object.keys(skippedReceipt.hook_entries).length === 0,
      'G8-noscripts-transition: receipt preserves support ownership with an empty hook set');
      // spawn-class: environment
      const uninstalled = spawnSync('bash', [INSTALLER, '--global', '--uninstall', '--yes'], {
        env: Object.assign({}, process.env, { HOME: full.home, CURSOR_HOME: full.cursorHome }),
        encoding: 'utf8',
      });
      const hooksFile = path.join(full.cursorHome, 'hooks.json');
      const hooksAfter = fs.existsSync(hooksFile)
        ? JSON.parse(fs.readFileSync(hooksFile, 'utf8')) : { hooks: {} };
      assert(uninstalled.status === 0 && !fs.existsSync(support)
        && !fs.existsSync(path.join(full.cursorHome, 'hooks')),
        'G8-noscripts-transition: uninstall removes unchanged receipt-owned support bytes');
      noKaolaCursorHooks(hooksAfter, 'G8-noscripts-transition');
      clean(skipped);
    }

    // A fresh partial authority created for --no-scripts is legitimate, but a later ordinary
    // project install must promote support bytes without creating a Rule or hook declaration.
    {
      const partial = runInstaller(['--no-scripts']);
      const support = path.join(partial.cursorHome, 'kaola-workflow', 'scripts',
        'kaola-workflow-cursor-surface.js');
      const projectHooksFile = path.join(partial.dest, '.cursor', 'hooks.json');
      assert(partial.status === 0 && !fs.existsSync(support)
        && !fs.existsSync(path.join(partial.dest, '.cursor', 'hooks')),
        'G8-noscripts-promotion: fresh no-scripts install is intentionally partial');
      const promoted = runInstaller([], {
        home: partial.home, cursorHome: partial.cursorHome, dest: partial.dest,
      });
      const projectHooks = fs.existsSync(projectHooksFile)
        ? parseCursorHooksJson(fs.readFileSync(projectHooksFile, 'utf8')) : null;
      assert(promoted.status === 0 && fs.existsSync(support)
        && !fs.existsSync(path.join(partial.dest, '.cursor', 'hooks')),
        'G8-noscripts-promotion: later default install promotes support without hook bytes');
      noKaolaCursorHooks(projectHooks, 'G8-noscripts-promotion');
      assert(!fs.existsSync(path.join(partial.dest, '.cursor', 'rules', CURSOR_RECOVERY_RULE)),
        'G8-noscripts-promotion: later default install keeps the retired recovery Rule absent');
      clean(promoted);
    }

    // Promotion fills an incomplete authority set and remains idempotent. There is no separate
    // live global hook whose registration or bytes could be revived by promotion.
    {
      const full = runInstaller(['--global'], { skipTarget: true });
      const authorityReceipt = path.join(full.cursorHome, 'kaola-workflow', 'cursor-authority.json');
      const skipped = runInstaller(['--global', '--no-scripts'], {
        skipTarget: true, home: full.home, cursorHome: full.cursorHome, dest: full.dest,
      });
      const partialReceipt = JSON.parse(fs.readFileSync(authorityReceipt, 'utf8'));
      assert(skipped.status === 0 && !fs.existsSync(path.join(full.cursorHome, 'hooks'))
        && partialReceipt.hook_entries
        && Object.keys(partialReceipt.hook_entries).length === 0,
      'G8-noscripts-live-hook-promotion: partial authority has no active global hook');
      const promoted = runInstaller([], {
        home: full.home, cursorHome: full.cursorHome, dest: full.dest,
      });
      const promotedReceipt = JSON.parse(fs.readFileSync(authorityReceipt, 'utf8'));
      const globalHooks = parseCursorHooksJson(fs.readFileSync(path.join(full.cursorHome, 'hooks.json'), 'utf8'));
      assert(promoted.status === 0 && !fs.existsSync(path.join(full.cursorHome, 'hooks'))
        && promotedReceipt.hook_entries
        && Object.keys(promotedReceipt.hook_entries).length === 0,
      'G8-noscripts-live-hook-promotion: ordinary install remains hook-free after promotion');
      noKaolaCursorHooks(globalHooks, 'G8-noscripts-live-hook-promotion');
      clean(promoted);
    }

    // Migration helpers preserve foreign hook entries while removing retired Kaola rows;
    // a fresh install never adds a replacement row.
    {
      const dest = fs.mkdtempSync(path.join(tmpBase(), 'cursor-i-dest-'));
      fs.mkdirSync(path.join(dest, '.cursor'), { recursive: true });
      const userHooks = {
        version: 1,
        hooks: {
          beforeShellExecution: [{ command: 'echo user-owned' }],
          sessionStart: [{ command: './hooks/kaola-workflow-compact-context.sh' }],
        },
      };
      fs.writeFileSync(path.join(dest, '.cursor', 'hooks.json'), JSON.stringify(userHooks, null, 2) + '\n');
      const r = runInstaller([], { dest });
      assert(r.status === 0, 'G8-merge: install over an existing hooks.json exits 0 (got '
        + r.status + ' — ' + firstLine(r) + ')');
      const merged = JSON.parse(fs.readFileSync(path.join(dest, '.cursor', 'hooks.json'), 'utf8'));
      assert(Array.isArray(merged.hooks.beforeShellExecution)
        && merged.hooks.beforeShellExecution[0].command === 'echo user-owned',
        'G8-merge: preserves the user beforeShellExecution entry');
      assert(!kaolaHookRows(merged).length && !merged.hooks.sessionStart,
        'G8-merge: strips retired Kaola sessionStart without adding a replacement hook');
      const userFile = path.join(dest, '.cursor', 'agents', 'notes.md');
      fs.mkdirSync(path.dirname(userFile), { recursive: true });
      fs.writeFileSync(userFile, 'user-owned, not kaola-deployed\n');
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, CURSOR_HOME: r.cursorHome }),
        encoding: 'utf8',
      });
      assert(ru.status === 0, 'G8-merge-uninstall: --uninstall exits 0 (got ' + ru.status + ')');
      const hooksPath = path.join(dest, '.cursor', 'hooks.json');
      assert(fs.existsSync(hooksPath),
        'G8-merge-uninstall: does not delete the user hooks.json file');
      const stripped = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert(Array.isArray(stripped.hooks.beforeShellExecution),
        'G8-merge-uninstall: user hook entries remain');
      assert(!stripped.hooks.sessionStart,
        'G8-merge-uninstall: kaola sessionStart is stripped');
      assert(fs.existsSync(userFile),
        'G8-merge-uninstall: a user-owned file in the agents dir survives');
      clean(r);
    }

    // --uninstall removes only kaola-deployed names; a user-authored agent named like a retired
    // role is never inferred to be Kaola-owned (#1101).
    {
      const r = runInstaller([]);
      assert(r.status === 0, 'G8-uninstall: seed install exits 0');
      const agentsDir = path.join(r.dest, '.cursor', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      const userFile = path.join(agentsDir, 'notes.md');
      const userBody = 'user-owned, not kaola-deployed\n';
      fs.writeFileSync(userFile, userBody);
      const userRole = path.join(agentsDir, 'implementer.md');
      const userRoleBody = '---\nname: implementer\ndescription: my own agent\n---\nuser-authored\n';
      fs.writeFileSync(userRole, userRoleBody);
      const userJs = path.join(r.cursorHome, 'kaola-workflow', 'scripts', 'my-local-helper.js');
      const userJsBody = '// user-authored\n';
      if (fs.existsSync(path.dirname(userJs))) fs.writeFileSync(userJs, userJsBody);
      // spawn-class: environment
      const ru = spawnSync('bash', [INSTALLER, '--uninstall', '--target', r.dest, '--yes'], {
        env: Object.assign({}, process.env, { HOME: r.home, CURSOR_HOME: r.cursorHome }),
        encoding: 'utf8',
      });
      assert(ru.status === 0,
        'G8-uninstall: --uninstall exits 0 (got ' + ru.status + ' — ' + firstLine(ru) + ')');
      for (const name of canonCommandNames) {
        assert(!fs.existsSync(path.join(r.dest, '.cursor', 'commands', name + '.md')),
          'G8-uninstall[' + name + ']: kaola-deployed command is removed');
      }
      assert(fs.existsSync(userFile) && fs.readFileSync(userFile, 'utf8') === userBody,
        'G8-uninstall: a user-owned file in the agents dir survives (only kaola-deployed names are removed)');
      assert(fs.existsSync(userRole) && fs.readFileSync(userRole, 'utf8') === userRoleBody,
        'G8-uninstall: a user-authored agent named like a retired role survives uninstall');
      if (fs.existsSync(path.dirname(userJs))) {
        assert(fs.existsSync(userJs) && fs.readFileSync(userJs, 'utf8') === userJsBody,
          'G8-uninstall: a user-authored helper in the scripts dir survives');
      }
      clean(r);
    }

    // #1101 upgrade: a receipt from an earlier release that owned agents/*.md loses every
    // unchanged receipt-owned agent on reinstall (global authority and project materialization),
    // keeps a modified one on disk, and the rewritten receipt records no agents/ path at all.
    // Upgrade order is global then project: the project transaction verifies the installed
    // authority, so the global reinstall runs first (as install-all does).
    {
      const r = runInstaller([]);
      assert(r.status === 0, 'G8-agent-migration: seed install exits 0 (got ' + r.status + ' — ' + firstLine(r) + ')');
      const plant = (root, receiptFile) => {
        const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
        const unchanged = path.join(root, 'agents', 'implementer.md');
        const modified = path.join(root, 'agents', 'tdd-guide.md');
        fs.mkdirSync(path.dirname(unchanged), { recursive: true });
        fs.writeFileSync(unchanged, '---\nname: implementer\nmodel: grok-4.7[effort=medium]\n---\nretired render\n');
        fs.writeFileSync(modified, '---\nname: tdd-guide\nmodel: grok-4.7[effort=medium]\n---\nretired render\n');
        receipt.files['agents/implementer.md'] = { sha256: sha256File(unchanged), mode: 0o644 };
        receipt.files['agents/tdd-guide.md'] = { sha256: sha256File(modified), mode: 0o644 };
        fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
        fs.writeFileSync(modified, 'OWNER_EDITED_RETIRED_PROFILE\n');
        return { unchanged, modified };
      };
      const globalReceipt = path.join(r.cursorHome, cursorSurface.AUTHORITY_RECEIPT_REL);
      const projectRoot = path.join(r.dest, '.cursor');
      const projectReceipt = path.join(projectRoot, cursorSurface.PROJECT_RECEIPT_REL);
      const ready = r.status === 0 && fs.existsSync(globalReceipt) && fs.existsSync(projectReceipt);
      assert(ready, 'G8-agent-migration: the seed install wrote both the global and the project receipt');
      if (ready) {
        const globalPlant = plant(r.cursorHome, globalReceipt);
        const projectPlant = plant(projectRoot, projectReceipt);
        const globalAgain = runInstaller(['--global'], {
          skipTarget: true, home: r.home, cursorHome: r.cursorHome, dest: r.dest,
        });
        assert(globalAgain.status === 0,
          'G8-agent-migration: --global reinstall over an authority receipt that owned agents/*.md exits 0 (got '
          + globalAgain.status + ' — ' + firstLine(globalAgain) + ')');
        const again = runInstaller([], { home: r.home, cursorHome: r.cursorHome, dest: r.dest });
        assert(again.status === 0,
          'G8-agent-migration: project reinstall over a project receipt that owned agents/*.md exits 0 (got '
          + again.status + ' — ' + firstLine(again) + ')');
        for (const [scope, planted, receiptFile] of [
          ['global', globalPlant, globalReceipt], ['project', projectPlant, projectReceipt],
        ]) {
          assert(!fs.existsSync(planted.unchanged),
            'G8-agent-migration[' + scope + ']: an unchanged receipt-owned agents/implementer.md is removed on reinstall');
          assert(fs.existsSync(planted.modified)
            && fs.readFileSync(planted.modified, 'utf8') === 'OWNER_EDITED_RETIRED_PROFILE\n',
            'G8-agent-migration[' + scope + ']: a modified receipt-owned agents/tdd-guide.md is kept byte-for-byte');
          assert(receiptAgentPaths(receiptFile).length === 0,
            'G8-agent-migration[' + scope + ']: the rewritten receipt records no agents/ path — got '
            + JSON.stringify(receiptAgentPaths(receiptFile)));
        }
      }
      clean(r);
    }
  }
}

// ---------------------------------------------------------------------------
{
  const manifest = require('./kaola-workflow-install-manifest.js');
  const githubScripts = manifest.supportScripts('github');
  const retiredCatalogHelper = 'kaola-workflow-ensure-cursor-catalog.js';
  assert(Array.isArray(githubScripts) && !githubScripts.includes(retiredCatalogHelper),
    'G10-install: supportScripts(\'github\') does not include ' + retiredCatalogHelper
    + ' (ambient project materialization is retired)');
  assert(!fs.existsSync(path.join(REPO, 'scripts', retiredCatalogHelper)),
    'G10-install: the retired ambient catalog materializer is absent from the shipped source');
  assert(syncMod.expectedHookFiles().length === 0,
    'G10-install: the Cursor support manifest has no executable hook files');
}

{
  const skelPath = path.join(REPO, 'templates', 'routing', 'init.skeleton.md');
  assert(fs.existsSync(skelPath), 'G10: templates/routing/init.skeleton.md exists');
}

{
  const initRel = commandRel('workflow-init');
  const initBody = exists(initRel) ? read(initRel) : '';
  assert(exists(initRel),
    'G11: generated ' + initRel + ' exists');
  assert(!/kaola-workflow-project-instruction(?:-templates|s)\.js|KW-(?:AGENTS-MANAGED|CLAUDE-OVERLAY-MANAGED)/.test(initBody),
    'G11: generated workflow-init carries no retired project-prompt owner');
  assert(/Agent owns the meaning and prose of project instructions/.test(initBody)
      && /repository facts/.test(initBody)
      && /Global Workflow Contract already loaded by the runtime/.test(initBody)
      && /Before changing an existing user-authored or owner-authored instruction file/.test(initBody)
      && /fresh top-level\s+Agent\/session/.test(initBody),
    'G11: generated workflow-init carries Agent ownership, grounding, consent, and reload outcomes');
}

// G10 — every ordinary Cursor tool-use path is hook-free. The generated mapping
// and source hook inventory are the subject; no host-internal event runner is
// fabricated here. Compact recovery is the machine-global alwaysApply Rule in G5.
{
  const mappingText = typeof syncMod.renderCursorHooksJson === 'function'
    ? syncMod.renderCursorHooksJson()
    : (exists('.cursor/hooks.json') ? read('.cursor/hooks.json') : '{}');
  const parsed = parseCursorHooksJson(mappingText);
  noKaolaCursorHooks(parsed, 'G10-render');
  assert(syncMod.expectedHookFiles().length === 0,
    'G10-hook: expectedHookFiles() is empty — no SessionStart/Pre/Post/Stop/UserPrompt hook is declared');
  assert(!generatedTreeFiles('.cursor').some(rel => /(?:^|\/)hooks\//i.test(rel)),
    'G10-hook: generated Cursor tree carries no executable hook file');
}

// #1055: transformCommandBody's line-splitting loop is a no-op pass-through
// (split(/\r?\n/) then join('\n')) — its only surviving effect is CRLF -> LF
// normalization. Pin that behavior directly: a CRLF command body must render
// byte-identically to the same body with LF endings.
{
  const crlfSrc = forgeLayout.commandSources(DEFAULT_FORGE).find(s => s.basename === 'workflow-next.md');
  assert(!!crlfSrc, 'CRLF: workflow-next.md is a registered command source');
  if (crlfSrc) {
    const rawBody = fs.readFileSync(crlfSrc.absPath, 'utf8');
    const lfBody = rawBody.replace(/\r\n/g, '\n');
    const crlfBody = lfBody.replace(/\n/g, '\r\n');
    const lfOut = syncMod.transformCommandBody(lfBody, DEFAULT_FORGE, 'workflow-next.md');
    const crlfOut = syncMod.transformCommandBody(crlfBody, DEFAULT_FORGE, 'workflow-next.md');
    assert(crlfOut === lfOut,
      'CRLF: transformCommandBody(CRLF body) must equal transformCommandBody(LF body) byte-for-byte');
    // The equality check above alone would stay green under a mutant that joins with '\r\n'
    // instead of '\n' — both outputs would still match each other, just both wrong. Pin the
    // normalization itself: neither output may carry a \r.
    assert(!crlfOut.includes('\r'),
      'CRLF: transformCommandBody(CRLF body) output must contain no \\r (normalized to LF)');
    assert(!lfOut.includes('\r'),
      'CRLF: transformCommandBody(LF body) output must contain no \\r (normalized to LF)');
  }
}

if (failed) {
  console.error('\ncursor-edition test FAILED: ' + failed + ' failure(s), ' + passed + ' passed.'
    + driftVerdict);
  process.exit(1);
}
console.log('cursor-edition test passed (' + passed + ' assertions).' + driftVerdict);
