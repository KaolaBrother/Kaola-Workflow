#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
// The Codex role-profile ownership record's file name has ONE authoring source, the forge-neutral
// kernel — required here rather than re-declared. The kernel is a sibling in this tree (see
// KERNEL_COPIES in scripts/validate-script-sync.js).
const { MANIFEST_BASENAME } = require('./kaola-workflow-adaptive-schema');

// #1101: Kaola-Workflow defines no subagent roles, profiles, or subagent model/effort bindings, so
// this entry point (name kept: install-all.sh, the preflight and older plugin caches invoke it)
// installs no profile and registers none. What it does:
//   - retires what earlier releases installed, only where the evidence proves Kaola wrote it: the
//     role profiles under <scope>/.codex/agents/kaola-workflow/, their ownership record, and the
//     `# BEGIN/END kaola-workflow agents` registration block in <scope>/.codex/config.toml;
//   - installs the non-role Codex content: the global compact hook (~/.codex/hooks.json), its
//     version-less hook home (~/.codex/kaola-workflow/), and the machine-global contract carrier;
//   - reports the Codex dispatch posture it reads from config.toml (never writes it).
const pluginRoot = path.resolve(__dirname, '..');
// #571: `--global` targets ~/.codex (install once, all repos) regardless of cwd/arg-order.
// Position-robust: the flag is matched anywhere in argv. The positional projectRoot form ("$PWD" /
// "$HOME") still works: take the first non-flag argv, never a leading --flag.
const GLOBAL = process.argv.includes('--global');
// #1087 (#1086 F1): Codex owns its own removal. `--uninstall` removes only what this installer
// wrote, under the same provenance rules as the additive runtimes' --uninstall (see uninstallMain).
const UNINSTALL = process.argv.includes('--uninstall');
const firstPositional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectRoot = GLOBAL
  ? os.homedir()
  : path.resolve(firstPositional || process.cwd());
const sourceHooksTemplate = path.join(pluginRoot, 'config', 'hooks.json');
// Where earlier releases installed role profiles and registered them, per scope.
const targetCodexDir = path.join(projectRoot, '.codex');
const targetAgentsDir = path.join(targetCodexDir, 'agents', 'kaola-workflow');
const targetConfig = path.join(targetCodexDir, 'config.toml');
// Pre-rename (codex-workflow) releases used these; they carry no ownership record, so they are
// only ever reported (#1101 H6).
const legacyAgentsDir = path.join(targetCodexDir, 'agents', 'codex-workflow');
const legacyBeginMarker = '# BEGIN codex-workflow agents';
// #447: hooks install GLOBALLY into ~/.codex — one location for all projects,
// force-refreshed on every install/upgrade (mirrors the Claude edition's global hooks).
const globalCodexDir = path.join(os.homedir(), '.codex');
const targetHooks = path.join(globalCodexDir, 'hooks.json');
// #409: a stable, version-LESS Codex-owned home for the hook scripts that
// hooks.json points at — mirrors install.sh's $SUPPORT_DIR/{hooks,scripts}
// (~/.claude/kaola-workflow). Substituting the run-time install source (a /tmp worktree purged by
// macOS, or a version-pinned plugin-cache dir GC'd on the next release) into __KW_PLUGIN_ROOT__
// made every hook fire exit 127, so the hook-referenced scripts are COPIED into this version-less
// home and THIS dir is substituted. pluginRoot stays the read SOURCE (templates).
// #447: the stable home also lives in the GLOBAL ~/.codex/kaola-workflow.
const targetStableDir = path.join(globalCodexDir, 'kaola-workflow');
const targetStableHooksDir = path.join(targetStableDir, 'hooks');
const targetStableScriptsDir = path.join(targetStableDir, 'scripts');
const beginMarker = '# BEGIN kaola-workflow agents';
const endMarker = '# END kaola-workflow agents';
const PLUGIN_ROOT_TOKEN = '__KW_PLUGIN_ROOT__';
const MANAGED_HOOK_ID_PREFIX = 'kaola-workflow:';
const MANIFEST_SCHEMA_VERSION = 1;

// Retirement report lines — the same wording every runtime's retirement uses (#1101).
const REMOVED = 'Removed retired Kaola-Workflow agent: ';
const REMOVED_RECORD = 'Removed retired Kaola-Workflow agent record: ';
const REMOVED_REGISTRATIONS = 'Removed retired Kaola-Workflow agent registrations: ';
const preservedLine = (reason, file) => `Preserved retired Kaola-Workflow agent (${reason}): ${file}`;
const preservedRegistrationsLine = (reason, file) =>
  `Preserved retired Kaola-Workflow agent registrations (${reason}): ${file}`;

// Adaptive is the unconditional default and the sole workflow path; fast/full are retired, so the
// installer no longer parses --with-fast/--with-full and never records an installed_paths opt-in.
// --enable-adaptive is retired (#538) → warn + ignore. Unknown args are IGNORED (never hard-fail):
// the preflight (kaola-workflow-codex-preflight.js) and the test suites invoke the installer
// positionally with a project-root argv that must not be rejected.
if (process.argv.some(a => a === '--enable-adaptive' || a.startsWith('--enable-adaptive='))) {
  console.warn('Kaola-Workflow Codex installer: --enable-adaptive is retired (#538); adaptive is the unconditional default. Ignoring.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function lstatIfPresent(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

// Every installer destination is a local authority boundary. Walk only below the
// explicit project/HOME roots (never their parents), reject a symlink at any existing
// component, and reject wrong-kind leaves before the first target read or write.
function installTargetPathProblem(authorityRoot, target, expectedKind) {
  const authority = path.resolve(authorityRoot);
  const destination = path.resolve(target);
  const relative = path.relative(authority, destination);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return `${destination} escapes authority root ${authority}`;
  }

  const authorityStat = lstatIfPresent(authority);
  if (!authorityStat || authorityStat.isSymbolicLink() || !authorityStat.isDirectory()) {
    return `${authority} must be an existing non-symlink directory`;
  }

  const segments = relative === '' ? [] : relative.split(path.sep);
  let current = authority;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = lstatIfPresent(current);
    if (!stat) continue;
    if (stat.isSymbolicLink()) return `${current} is a symlink`;
    const isLeaf = index === segments.length - 1;
    if (!isLeaf && !stat.isDirectory()) return `${current} is not a directory`;
    if (isLeaf && expectedKind === 'directory' && !stat.isDirectory()) {
      return `${current} is not a directory`;
    }
    if (isLeaf && expectedKind === 'file' && !stat.isFile()) {
      return `${current} is not a regular file`;
    }
  }
  return null;
}

// The install writes only under HOME (hooks, hook home); the scope's .codex is only ever retired
// from, so an unsafe project path is reported by the retirement, never a reason to refuse (#1101).
function validateInstallTargets() {
  const homeDir = os.homedir();
  const sharedConfigDir = path.join(homeDir, '.config');
  const sharedKaolaConfigDir = path.join(sharedConfigDir, 'kaola-workflow');
  const checks = [
    [homeDir, globalCodexDir, 'directory'],
    [homeDir, targetHooks, 'file'],
    [homeDir, targetStableDir, 'directory'],
    [homeDir, targetStableHooksDir, 'directory'],
    [homeDir, targetStableScriptsDir, 'directory'],
    [homeDir, sharedConfigDir, 'directory'],
    [homeDir, sharedKaolaConfigDir, 'directory'],
    [homeDir, path.join(sharedKaolaConfigDir, 'config.json'), 'file'],
  ];
  for (const [authority, target, kind] of checks) {
    const problem = installTargetPathProblem(authority, target, kind);
    if (problem) return problem;
  }
  return null;
}

function managedMarkerRange(content) {
  const source = String(content || '');
  const structural = tomlStructuralContent(source);
  const markers = [];
  let variantFound = false;
  for (const match of structural.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (match[0] === '') continue;
    const line = match[0].replace(/\n$/, '').replace(/\r$/, '');
    const markerLike = line.match(
      /^[ \t]*#[ \t]*(begin|end)[ \t]+kaola(?:[-_ \t]+)workflow[ \t]+agents\b.*$/i,
    );
    if (!markerLike) continue;
    const kind = markerLike[1].toLowerCase();
    const canonical = line === (kind === 'begin' ? beginMarker : endMarker);
    if (!canonical) variantFound = true;
    markers.push({ kind, index: match.index, canonical });
  }
  if (markers.length === 0) {
    return { state: 'absent', start: -1, end: -1 };
  }
  const begins = markers.filter(marker => marker.kind === 'begin' && marker.canonical);
  const ends = markers.filter(marker => marker.kind === 'end' && marker.canonical);
  if (variantFound || begins.length !== 1 || ends.length !== 1
      || begins[0].index >= ends[0].index) {
    return { state: 'invalid', start: -1, end: -1 };
  }
  let end = ends[0].index + endMarker.length;
  if (source.slice(end, end + 2) === '\r\n') end += 2;
  else if (source[end] === '\n') end += 1;
  return {
    state: 'present',
    start: begins[0].index,
    end,
    endMarkerStart: ends[0].index,
  };
}

function manifestPath(agentsDir) {
  return path.join(agentsDir, MANIFEST_BASENAME);
}

const ATOMIC_STAGE_ATTEMPTS = 16;

function atomicStageFailure(status, detail) {
  const error = new Error(`${status}: ${detail}`);
  error.code = status;
  return error;
}

function sameFileVersion(left, right) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

// #325 R1: build the managed-hooks object by parsing the RAW template (which carries the literal
// __KW_PLUGIN_ROOT__ token → always valid JSON) and substituting pluginRoot into the PARSED command
// strings. Substituting into already-parsed string values (never into raw JSON text) means a
// metacharacter in pluginRoot — a backslash or quote on Windows — can never break JSON syntax;
// JSON.stringify re-escapes it correctly on write. Pure + exported for unit tests.
function buildManagedHooks(templateText, root) {
  const managed = JSON.parse(templateText);
  const hooks = (managed && managed.hooks) || {};
  for (const event of Object.keys(hooks)) {
    for (const entry of (hooks[event] || [])) {
      for (const h of (entry.hooks || [])) {
        if (typeof h.command === 'string') {
          h.command = h.command.split(PLUGIN_ROOT_TOKEN).join(root);
        }
      }
    }
  }
  return managed;
}

function hookRelPathProblem(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return 'path is empty';
  if (rel.includes('\\')) return 'backslashes are forbidden';
  if (rel.includes('\0')) return 'NUL is forbidden';
  if (path.posix.isAbsolute(rel) || path.win32.isAbsolute(rel)) return 'absolute path is forbidden';
  const segments = rel.split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    return 'empty, dot, and dotdot segments are forbidden';
  }
  if (path.posix.normalize(rel) !== rel) return 'path is not canonical';
  if (segments.length < 2 || (segments[0] !== 'hooks' && segments[0] !== 'scripts')) {
    return 'path must be a child of hooks/ or scripts/';
  }
  if (segments.some(segment => !/^[A-Za-z0-9._-]+$/.test(segment))) {
    return 'path contains non-canonical characters';
  }
  return null;
}

function assertHookRelPath(rel) {
  const problem = hookRelPathProblem(rel);
  assert(!problem, `hook reference invalid (${JSON.stringify(rel)}): ${problem}`);
  return rel;
}

function pathIsStrictlyContained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

// Parse every token occurrence rather than matching only already-valid spellings: a
// root-only, backslash, or absolute reference must be rejected, not silently ignored.
// Returns a sorted, de-duplicated list of canonical hooks/ or scripts/ children.
function hookReferencedRelPaths(templateText) {
  const parsed = JSON.parse(templateText);
  const hooks = (parsed && parsed.hooks) || {};
  const found = new Set();
  for (const event of Object.keys(hooks)) {
    for (const entry of (hooks[event] || [])) {
      for (const h of (entry.hooks || [])) {
        if (typeof h.command !== 'string') continue;
        let cursor = 0;
        while (cursor < h.command.length) {
          const tokenIndex = h.command.indexOf(PLUGIN_ROOT_TOKEN, cursor);
          if (tokenIndex === -1) break;
          const suffix = h.command.slice(tokenIndex + PLUGIN_ROOT_TOKEN.length);
          assert(suffix.startsWith('/'),
            `hook reference invalid near ${PLUGIN_ROOT_TOKEN}: expected one canonical relative child`);
          const raw = suffix.slice(1);
          const boundary = raw.search(/["'\s]/);
          const rel = boundary === -1 ? raw : raw.slice(0, boundary);
          found.add(assertHookRelPath(rel));
          cursor = tokenIndex + PLUGIN_ROOT_TOKEN.length;
        }
      }
    }
  }
  return [...found].sort();
}

function preflightHookScriptReplacement(stableDir, relPaths, sourceRoot) {
  assert(Array.isArray(relPaths), 'hook reference list must be an array');
  const copied = [...new Set(relPaths.map(assertHookRelPath))].sort();
  const stableRoot = path.resolve(stableDir);
  const sourceBase = path.resolve(sourceRoot);
  const stableStat = lstatIfPresent(stableRoot);
  assert(!stableStat || (!stableStat.isSymbolicLink() && stableStat.isDirectory()),
    `hook destination stable directory must be a non-symlink directory: ${stableRoot}`);

  const sourceBaseReal = fs.realpathSync(sourceBase);
  assert(fs.statSync(sourceBaseReal).isDirectory(),
    `hook source root must resolve to a directory: ${sourceBase}`);
  const sources = [];
  for (const rel of copied) {
    const segments = rel.split('/');
    const source = path.resolve(sourceBase, ...segments);
    assert(pathIsStrictlyContained(sourceBase, source),
      `hook reference invalid (${JSON.stringify(rel)}): source escapes plugin root`);
    const sourceStat = lstatIfPresent(source);
    assert(sourceStat, `hook-referenced source script missing: ${source}`);
    assert(!sourceStat.isSymbolicLink(), `hook-referenced source script is a symlink: ${source}`);
    assert(sourceStat.isFile(), `hook-referenced source script is not a regular file: ${source}`);
    const sourceReal = fs.realpathSync(source);
    assert(pathIsStrictlyContained(sourceBaseReal, sourceReal),
      `hook-referenced source script resolves outside plugin root: ${source}`);

    const target = path.resolve(stableRoot, ...segments);
    assert(pathIsStrictlyContained(stableRoot, target),
      `hook reference invalid (${JSON.stringify(rel)}): destination escapes stable directory`);
    let current = stableRoot;
    for (let index = 0; index < segments.length; index += 1) {
      current = path.join(current, segments[index]);
      const currentStat = lstatIfPresent(current);
      if (!currentStat) continue;
      assert(!currentStat.isSymbolicLink(), `hook destination path is a symlink: ${current}`);
      const isLeaf = index === segments.length - 1;
      assert(isLeaf ? currentStat.isFile() : currentStat.isDirectory(),
        `hook destination path has the wrong kind: ${current}`);
    }

    // Read every source during preflight. Staging writes only these held bytes, so a
    // missing/unreadable later source cannot partially replace the live stable set.
    sources.push({ rel, bytes: fs.readFileSync(source) });
  }

  const active = {
    hooks: path.join(stableRoot, 'hooks'),
    scripts: path.join(stableRoot, 'scripts'),
  };
  const activeStats = {};
  let removed = 0;
  for (const kind of ['hooks', 'scripts']) {
    activeStats[kind] = lstatIfPresent(active[kind]);
    if (activeStats[kind]) {
      assert(!activeStats[kind].isSymbolicLink() && activeStats[kind].isDirectory(),
        `hook destination path must be a non-symlink directory: ${active[kind]}`);
      removed += fs.readdirSync(active[kind]).length;
    }
  }
  return { stableRoot, stableStat, sources, copied, removed, active, activeStats };
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function ownedPathMatches(file, expectedStat, expectedKind) {
  const current = lstatIfPresent(file);
  if (!current || !sameFileIdentity(current, expectedStat) || current.isSymbolicLink()) return false;
  if (expectedKind === 'directory') return current.isDirectory();
  if (expectedKind === 'file') return current.isFile();
  return true;
}

function cleanupOwnedFile(file, expectedStat) {
  if (!file || !expectedStat || !ownedPathMatches(file, expectedStat, 'file')) return false;
  const current = lstatIfPresent(file);
  // Overlay can reuse ino after unlink+create; size/mtime/ctime distinguish a replacement.
  if (!current || !sameFileVersion(current, expectedStat)) return false;
  try {
    fs.unlinkSync(file);
    return !lstatIfPresent(file);
  } catch (_) {
    return false;
  }
}

function createOwnedDirectory(parent, label) {
  for (let attempt = 0; attempt < ATOMIC_STAGE_ATTEMPTS; attempt += 1) {
    const candidate = path.join(parent,
      `.kaola-${label}-${process.pid}-${crypto.randomBytes(16).toString('hex')}`);
    try {
      fs.mkdirSync(candidate, { mode: 0o700 });
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
    const stat = lstatIfPresent(candidate);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      throw atomicStageFailure('atomic_stage_unsafe',
        `exclusive transaction directory changed after creation: ${candidate}`);
    }
    return { path: candidate, stat };
  }
  throw atomicStageFailure('atomic_stage_collision',
    `could not reserve a collision-free ${label} directory in ${parent}`);
}

function snapshotTreeIdentity(root) {
  const entries = [];
  function visit(current, relative) {
    const stat = fs.lstatSync(current);
    entries.push({ relative, stat, kind: stat.isDirectory() && !stat.isSymbolicLink()
      ? 'directory' : 'file' });
    if (!stat.isDirectory() || stat.isSymbolicLink()) return;
    for (const name of fs.readdirSync(current).sort()) {
      visit(path.join(current, name), relative ? path.join(relative, name) : name);
    }
  }
  visit(root, '');
  return entries;
}

function treeIdentityIsCurrent(root, entries) {
  if (!entries || entries.length === 0) return !lstatIfPresent(root);
  const expectedPaths = new Set(entries.map(entry => entry.relative));
  for (const entry of entries) {
    const currentPath = entry.relative ? path.join(root, entry.relative) : root;
    const current = lstatIfPresent(currentPath);
    if (!current || !sameFileIdentity(current, entry.stat)) return false;
    if (entry.kind === 'directory') {
      if (current.isSymbolicLink() || !current.isDirectory()) return false;
      for (const name of fs.readdirSync(currentPath)) {
        const relative = entry.relative ? path.join(entry.relative, name) : name;
        if (!expectedPaths.has(relative)) return false;
      }
    } else {
      if (current.isDirectory() && !current.isSymbolicLink()) return false;
      if (!sameFileVersion(current, entry.stat)) return false;
    }
  }
  return true;
}

// Delete only entries whose inode identity is still the one this transaction recorded.
// Unknown/replaced children make their parents non-empty and are deliberately left behind.
function cleanupTrackedTree(root, entries) {
  const ordered = [...(entries || [])].sort((left, right) => {
    const leftDepth = left.relative === '' ? 0 : left.relative.split(path.sep).length;
    const rightDepth = right.relative === '' ? 0 : right.relative.split(path.sep).length;
    return rightDepth - leftDepth;
  });
  for (const entry of ordered) {
    const currentPath = entry.relative ? path.join(root, entry.relative) : root;
    const current = lstatIfPresent(currentPath);
    if (!current || !sameFileIdentity(current, entry.stat)) continue;
    try {
      if (entry.kind === 'directory' && !current.isSymbolicLink() && current.isDirectory()) {
        fs.rmdirSync(currentPath);
      } else if (entry.kind !== 'directory') {
        fs.unlinkSync(currentPath);
      }
    } catch (_) {
      // A foreign/replaced child or a concurrent owner keeps the directory non-empty.
    }
  }
  return !lstatIfPresent(root);
}

function createTrackedStageDirectory(parent, kind) {
  const owned = createOwnedDirectory(parent, `${kind}-stage`);
  return {
    path: owned.path,
    stat: owned.stat,
    entries: [{ relative: '', stat: owned.stat, kind: 'directory' }],
  };
}

function ensureTrackedStageDirectory(stage, target) {
  const relative = path.relative(stage.path, target);
  assert(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
    `hook staging child escaped its owned root: ${target}`);
  if (relative === '') return;
  let current = stage.path;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const existing = lstatIfPresent(current);
    if (existing) {
      const tracked = stage.entries.find(entry => {
        const trackedPath = entry.relative ? path.join(stage.path, entry.relative) : stage.path;
        return trackedPath === current;
      });
      assert(tracked && tracked.kind === 'directory'
        && sameFileIdentity(existing, tracked.stat),
      `hook staging directory was replaced after creation: ${current}`);
      continue;
    }
    fs.mkdirSync(current, { mode: 0o700 });
    const stat = fs.lstatSync(current);
    assert(!stat.isSymbolicLink() && stat.isDirectory(),
      `hook staging directory is unsafe: ${current}`);
    stage.entries.push({ relative: path.relative(stage.path, current), stat, kind: 'directory' });
  }
}

function writeTrackedStageFile(stage, target, bytes) {
  ensureTrackedStageDirectory(stage, path.dirname(target));
  let descriptor = null;
  try {
    descriptor = fs.openSync(target, 'wx', 0o600);
    let stat = fs.fstatSync(descriptor);
    assert(stat.isFile(), `hook staging descriptor is unsafe: ${target}`);
    const tracked = { relative: path.relative(stage.path, target), stat, kind: 'file' };
    stage.entries.push(tracked);
    fs.writeFileSync(descriptor, bytes);
    fs.closeSync(descriptor);
    descriptor = null;
    assert(ownedPathMatches(target, tracked.stat, 'file'),
      `hook staging file changed while writing: ${target}`);
    fs.chmodSync(target, 0o755);
    stat = fs.lstatSync(target);
    assert(sameFileIdentity(stat, tracked.stat),
      `hook staging file changed while setting permissions: ${target}`);
    tracked.stat = stat;
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch (_) { /* tracked cleanup owns the path */ }
    }
  }
}

function prepareHookScriptReplacement(stableDir, relPaths, sourceRoot) {
  const plan = preflightHookScriptReplacement(stableDir, relPaths, sourceRoot);
  const stableExisted = Boolean(plan.stableStat);
  let createdStableStat = null;
  const states = [];
  try {
    fs.mkdirSync(plan.stableRoot, { recursive: true });
    const currentStableStat = fs.lstatSync(plan.stableRoot);
    assert(!currentStableStat.isSymbolicLink() && currentStableStat.isDirectory(),
      `hook destination stable directory must remain a non-symlink directory: ${plan.stableRoot}`);
    if (plan.stableStat) {
      assert(sameFileIdentity(currentStableStat, plan.stableStat),
        `hook destination stable directory changed after preflight: ${plan.stableRoot}`);
    } else {
      createdStableStat = currentStableStat;
    }

    for (const kind of ['hooks', 'scripts']) {
      const stage = createTrackedStageDirectory(plan.stableRoot, kind);
      const originalStat = plan.activeStats[kind];
      const state = {
        kind,
        active: plan.active[kind],
        originalStat,
        originalEntries: [],
        stage,
        backupReservations: [],
        backupReservation: null,
        backup: null,
        backupStat: null,
        backupMade: false,
        installed: false,
        installedStat: null,
      };
      states.push(state);
      const originalEntries = originalStat ? snapshotTreeIdentity(plan.active[kind]) : [];
      assert(!originalStat || (originalEntries.length > 0
        && sameFileIdentity(originalEntries[0].stat, originalStat)),
      `hook destination changed while capturing its prior tree: ${plan.active[kind]}`);
      state.originalEntries = originalEntries;
    }
    for (const source of plan.sources) {
      const segments = source.rel.split('/');
      const state = states.find(candidate => candidate.kind === segments[0]);
      const target = path.join(state.stage.path, ...segments.slice(1));
      writeTrackedStageFile(state.stage, target, source.bytes);
    }
  } catch (error) {
    for (const state of states) cleanupTrackedTree(state.stage.path, state.stage.entries);
    if (!stableExisted && createdStableStat
        && ownedPathMatches(plan.stableRoot, createdStableStat, 'directory')) {
      try { fs.rmdirSync(plan.stableRoot); } catch (_) { /* preserve foreign children */ }
    }
    throw error;
  }

  let finalized = false;
  function reserveBackup(state) {
    for (let attempt = 0; attempt < ATOMIC_STAGE_ATTEMPTS; attempt += 1) {
      const reservation = createOwnedDirectory(plan.stableRoot, `${state.kind}-backup`);
      state.backupReservations.push(reservation);
      const backup = path.join(reservation.path, 'active');
      const children = ownedPathMatches(reservation.path, reservation.stat, 'directory')
        ? fs.readdirSync(reservation.path) : null;
      if (children && children.length === 0 && !lstatIfPresent(backup)
          && ownedPathMatches(reservation.path, reservation.stat, 'directory')) {
        state.backupReservation = reservation;
        state.backup = backup;
        return;
      }
    }
    throw atomicStageFailure('atomic_stage_collision',
      `could not reserve a collision-free hook backup for ${state.active}`);
  }

  function cleanupReservations(state) {
    for (const reservation of state.backupReservations) {
      if (ownedPathMatches(reservation.path, reservation.stat, 'directory')) {
        try { fs.rmdirSync(reservation.path); } catch (_) { /* preserve foreign children */ }
      }
    }
  }

  function rollback() {
    if (finalized) return;
    const problems = [];
    for (const state of states.slice().reverse()) {
      if (state.installed) {
        const current = lstatIfPresent(state.active);
        if (current && sameFileIdentity(current, state.installedStat)) {
          cleanupTrackedTree(state.active, state.stage.entries);
        }
        if (lstatIfPresent(state.active)) {
          problems.push(`installed hook path is no longer owned: ${state.active}`);
        } else {
          state.installed = false;
        }
      }
      if (state.backupMade) {
        const backupCurrent = lstatIfPresent(state.backup);
        if (!backupCurrent || !sameFileIdentity(backupCurrent, state.backupStat)) {
          problems.push(`hook backup is no longer owned: ${state.backup}`);
        } else if (lstatIfPresent(state.active)) {
          problems.push(`hook destination is occupied during rollback: ${state.active}`);
        } else {
          fs.renameSync(state.backup, state.active);
          const restored = lstatIfPresent(state.active);
          if (!restored || !sameFileIdentity(restored, state.originalStat)) {
            problems.push(`hook backup restore lost ownership: ${state.active}`);
          } else {
            state.backupMade = false;
          }
        }
      }
      cleanupTrackedTree(state.stage.path, state.stage.entries);
      cleanupReservations(state);
    }
    if (!stableExisted && createdStableStat
        && ownedPathMatches(plan.stableRoot, createdStableStat, 'directory')) {
      try { fs.rmdirSync(plan.stableRoot); } catch (_) { /* preserve foreign children */ }
    }
    if (problems.length > 0) {
      throw new Error(problems.join('; '));
    }
  }

  function commit() {
    try {
      for (const state of states) {
        const currentStat = lstatIfPresent(state.active);
        if (state.originalStat) {
          assert(currentStat && !currentStat.isSymbolicLink() && currentStat.isDirectory()
            && sameFileIdentity(currentStat, state.originalStat)
            && treeIdentityIsCurrent(state.active, state.originalEntries),
          `hook destination changed after preflight: ${state.active}`);
          reserveBackup(state);
          const backupChildren = state.backupReservation
            && ownedPathMatches(state.backupReservation.path,
              state.backupReservation.stat, 'directory')
            ? fs.readdirSync(state.backupReservation.path) : null;
          assert(backupChildren && backupChildren.length === 0
            && !lstatIfPresent(state.backup)
            && ownedPathMatches(state.backupReservation.path,
              state.backupReservation.stat, 'directory'),
            `hook backup slot was occupied after reservation: ${state.backup}`);
          fs.renameSync(state.active, state.backup);
          state.backupMade = true;
          state.backupStat = state.originalStat;
          state.backupStat = lstatIfPresent(state.backup);
          assert(state.backupStat && sameFileIdentity(state.backupStat, state.originalStat),
            `hook backup ownership changed during promotion: ${state.backup}`);
        } else {
          assert(!currentStat, `hook destination appeared after preflight: ${state.active}`);
        }
        assert(treeIdentityIsCurrent(state.stage.path, state.stage.entries),
          `hook staging directory changed after creation: ${state.stage.path}`);
        assert(!lstatIfPresent(state.active),
          `hook destination appeared before stage promotion: ${state.active}`);
        fs.renameSync(state.stage.path, state.active);
        state.installed = true;
        state.installedStat = state.stage.stat;
        const installedCurrent = lstatIfPresent(state.active);
        assert(installedCurrent && sameFileIdentity(installedCurrent, state.installedStat)
          && treeIdentityIsCurrent(state.active, state.stage.entries),
          `hook destination changed during stage promotion: ${state.active}`);
      }
    } catch (error) {
      try { rollback(); } catch (rollbackError) {
        error.message += `; rollback failed: ${rollbackError.message}`;
      }
      throw error;
    }
  }

  function finalize() {
    for (const state of states) {
      if (state.backupMade && state.backup) {
        if (cleanupTrackedTree(state.backup, state.originalEntries)) state.backupMade = false;
      }
      cleanupTrackedTree(state.stage.path, state.stage.entries);
      cleanupReservations(state);
    }
    finalized = true;
  }

  return {
    summary: { copied: plan.copied, removed: plan.removed },
    commit,
    rollback,
    finalize,
  };
}

// Copy all hook-referenced scripts as one stable-set transaction. The optional
// sourceRoot is used by isolated unit fixtures; production always defaults to pluginRoot.
function copyHookScripts(stableDir, relPaths, sourceRoot = pluginRoot) {
  const transaction = prepareHookScriptReplacement(stableDir, relPaths, sourceRoot);
  try {
    transaction.commit();
    transaction.finalize();
    return transaction.summary;
  } catch (error) {
    try { transaction.rollback(); } catch (_) { /* commit already reports rollback failure */ }
    throw error;
  }
}

// #325 R3 / #525: merge managed hooks into the existing hooks.json.
//   Codex rust-v0.144.4 HooksFile accepts `hooks` plus an optional string/null
//   `description`. Preserve that user-owned description while continuing to drop editor-only
//   or unknown top-level keys such as `$schema`, which the strict parser rejects. Claude is
//   unaffected: its hooks merge into settings.json, which accepts $schema.
//   R3 — sweep EVERY event for kaola-workflow:-prefixed entries before re-adding, so an orphaned
//        managed entry under a now-unmanaged event is cleaned too (not just the currently-managed
//        set). Non-managed entries and unrelated events are preserved untouched.
// Pure + exported for unit tests.
function mergeHooks(existing, managed) {
  const ex = (existing && typeof existing === 'object') ? existing : { hooks: {} };
  const exHooks = (ex.hooks && typeof ex.hooks === 'object') ? ex.hooks : {};
  const hooks = Object.assign({}, exHooks);
  // R3: strip managed-prefixed entries under ALL events (guard entries with no id).
  for (const event of Object.keys(hooks)) {
    hooks[event] = (hooks[event] || []).filter(e => !(e && e.id && e.id.startsWith(MANAGED_HOOK_ID_PREFIX)));
  }
  // Re-add the managed entries per managed event.
  for (const [event, managedEntries] of Object.entries((managed && managed.hooks) || {})) {
    hooks[event] = [...(hooks[event] || []), ...managedEntries];
  }
  const result = { hooks };
  if (Object.prototype.hasOwnProperty.call(ex, 'description')) {
    result.description = ex.description;
  }
  return result;
}

function isPlainJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateExistingHooksSchema(existing) {
  if (!isPlainJsonObject(existing)) {
    throw new Error('invalid existing hooks.json schema: top-level value must be a JSON object');
  }
  if (Object.prototype.hasOwnProperty.call(existing, 'hooks')
      && !isPlainJsonObject(existing.hooks)) {
    throw new Error('invalid existing hooks.json schema: hooks must be a JSON object');
  }
  if (Object.prototype.hasOwnProperty.call(existing, 'description')
      && existing.description !== null && typeof existing.description !== 'string') {
    throw new Error('invalid existing hooks.json schema: description must be a string or null');
  }
  const normalized = Object.prototype.hasOwnProperty.call(existing, 'hooks')
    ? existing
    : { ...existing, hooks: {} };
  for (const [event, groups] of Object.entries(normalized.hooks)) {
    if (!Array.isArray(groups)) {
      throw new Error(`invalid existing hooks.json schema: hooks.${event} must be an array`);
    }
    for (const [groupIndex, group] of groups.entries()) {
      const groupPath = `hooks.${event}[${groupIndex}]`;
      if (!isPlainJsonObject(group)) {
        throw new Error(`invalid existing hooks.json schema: ${groupPath} must be a JSON object`);
      }
      if (Object.prototype.hasOwnProperty.call(group, 'id')
          && group.id !== null && typeof group.id !== 'string') {
        throw new Error(`invalid existing hooks.json schema: ${groupPath}.id must be a string or null`);
      }
      if (Object.prototype.hasOwnProperty.call(group, 'matcher')
          && group.matcher !== null && typeof group.matcher !== 'string') {
        throw new Error(`invalid existing hooks.json schema: ${groupPath}.matcher must be a string or null`);
      }
      if (Object.prototype.hasOwnProperty.call(group, 'hooks') && !Array.isArray(group.hooks)) {
        throw new Error(`invalid existing hooks.json schema: ${groupPath}.hooks must be an array`);
      }
      for (const [handlerIndex, handler] of (group.hooks || []).entries()) {
        const handlerPath = `${groupPath}.hooks[${handlerIndex}]`;
        if (!isPlainJsonObject(handler)) {
          throw new Error(`invalid existing hooks.json schema: ${handlerPath} must be a JSON object`);
        }
        if (!['command', 'prompt', 'agent'].includes(handler.type)) {
          throw new Error(`invalid existing hooks.json schema: ${handlerPath}.type is invalid`);
        }
        if (handler.type === 'command') {
          if (typeof handler.command !== 'string') {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath}.command must be a string`);
          }
          if (Object.prototype.hasOwnProperty.call(handler, 'commandWindows')
              && Object.prototype.hasOwnProperty.call(handler, 'command_windows')) {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath} must not define both commandWindows and command_windows`);
          }
          if (Object.prototype.hasOwnProperty.call(handler, 'commandWindows')
              && handler.commandWindows !== null && typeof handler.commandWindows !== 'string') {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath}.commandWindows must be a string or null`);
          }
          if (Object.prototype.hasOwnProperty.call(handler, 'command_windows')
              && handler.command_windows !== null && typeof handler.command_windows !== 'string') {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath}.command_windows must be a string or null`);
          }
          if (Object.prototype.hasOwnProperty.call(handler, 'timeout')
              && (!Number.isSafeInteger(handler.timeout) || handler.timeout < 0)) {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath}.timeout must be a non-negative integer`);
          }
          if (Object.prototype.hasOwnProperty.call(handler, 'async') && typeof handler.async !== 'boolean') {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath}.async must be a boolean`);
          }
          if (Object.prototype.hasOwnProperty.call(handler, 'statusMessage')
              && handler.statusMessage !== null && typeof handler.statusMessage !== 'string') {
            throw new Error(`invalid existing hooks.json schema: ${handlerPath}.statusMessage must be a string or null`);
          }
        }
      }
    }
  }
  return normalized;
}

function createOwnedHookFileStage(target, label, bytes) {
  for (let attempt = 0; attempt < ATOMIC_STAGE_ATTEMPTS; attempt += 1) {
    const candidate = `${target}.kaola-${label}-${process.pid}-${crypto.randomBytes(16).toString('hex')}`;
    let descriptor = null;
    let ownedStat = null;
    let completed = false;
    try {
      try {
        descriptor = fs.openSync(candidate, 'wx', 0o600);
      } catch (error) {
        if (error && error.code === 'EEXIST') continue;
        throw error;
      }
      ownedStat = fs.fstatSync(descriptor);
      if (!ownedStat.isFile()) {
        throw atomicStageFailure('atomic_stage_unsafe',
          `exclusive hook stage is not a regular file: ${candidate}`);
      }
      fs.writeFileSync(descriptor, bytes);
      fs.closeSync(descriptor);
      descriptor = null;
      if (!ownedPathMatches(candidate, ownedStat, 'file')) {
        throw atomicStageFailure('atomic_stage_unsafe',
          `exclusive hook stage changed after creation: ${candidate}`);
      }
      completed = true;
      return { path: candidate, stat: ownedStat };
    } finally {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor); } catch (_) { /* cleanup below */ }
      }
      if (ownedStat && !completed) cleanupOwnedFile(candidate, ownedStat);
    }
  }
  throw atomicStageFailure('atomic_stage_collision',
    `could not create a collision-free hook stage for ${target}`);
}

// A hard link is the file equivalent of rename-with-no-replace: linkSync creates the
// backup name atomically and returns EEXIST without touching a colliding path.
function createOwnedHookFileBackup(target, expectedStat) {
  for (let attempt = 0; attempt < ATOMIC_STAGE_ATTEMPTS; attempt += 1) {
    const candidate = `${target}.kaola-backup-${process.pid}-${crypto.randomBytes(16).toString('hex')}`;
    try {
      fs.linkSync(target, candidate);
    } catch (error) {
      if (error && error.code === 'EEXIST') continue;
      throw error;
    }
    const stat = lstatIfPresent(candidate);
    if (!stat || stat.isSymbolicLink() || !stat.isFile()
        || !sameFileIdentity(stat, expectedStat)) {
      throw atomicStageFailure('atomic_stage_conflict',
        `hook destination changed while reserving its backup: ${target}`);
    }
    return { path: candidate, stat };
  }
  throw atomicStageFailure('atomic_stage_collision',
    `could not create a collision-free hook backup for ${target}`);
}

function updateHooks() {
  let transaction = null;
  let hooksStage = null;
  let hooksBackup = null;
  let hooksInstalled = false;
  let hooksInstalledStat = null;
  let hooksOriginalStat = null;
  let hooksNextBytes = null;
  try {
    // Build and read every input before staging anything. A malformed template,
    // unsafe destination, or unreadable later source leaves both live outputs alone.
    const templateText = read(sourceHooksTemplate);
    const relPaths = hookReferencedRelPaths(templateText);
    const managedHooks = buildManagedHooks(templateText, targetStableDir);

    const globalStat = lstatIfPresent(globalCodexDir);
    assert(!globalStat || (!globalStat.isSymbolicLink() && globalStat.isDirectory()),
      `hook destination parent must be a non-symlink directory: ${globalCodexDir}`);
    hooksOriginalStat = lstatIfPresent(targetHooks);
    assert(!hooksOriginalStat || (!hooksOriginalStat.isSymbolicLink() && hooksOriginalStat.isFile()),
      `hook destination must be a non-symlink regular file: ${targetHooks}`);

    // Read existing hooks.json or default to empty. Existing malformed bytes are
    // user state: fail closed and preserve them rather than replacing them as empty.
    let existing = { hooks: {} };
    let current = null;
    if (hooksOriginalStat) {
      current = read(targetHooks);
      try {
        existing = validateExistingHooksSchema(JSON.parse(current));
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`malformed existing hooks.json: ${error.message}`);
        }
        throw error;
      }
    }

    const merged = mergeHooks(existing, managedHooks);
    const next = JSON.stringify(merged, null, 2) + '\n';
    hooksNextBytes = next;
    const hooksChanged = next !== current;

    transaction = prepareHookScriptReplacement(targetStableDir, relPaths, pluginRoot);
    if (hooksChanged) {
      fs.mkdirSync(globalCodexDir, { recursive: true });
      hooksStage = createOwnedHookFileStage(targetHooks, 'stage', next);
      if (hooksOriginalStat) {
        const beforeBackup = lstatIfPresent(targetHooks);
        assert(beforeBackup && !beforeBackup.isSymbolicLink() && beforeBackup.isFile()
          && sameFileIdentity(beforeBackup, hooksOriginalStat)
          && read(targetHooks) === current,
        `hook destination changed before backup reservation: ${targetHooks}`);
        hooksBackup = createOwnedHookFileBackup(targetHooks, hooksOriginalStat);
        const afterBackup = lstatIfPresent(targetHooks);
        assert(afterBackup && sameFileIdentity(afterBackup, hooksOriginalStat)
          && read(targetHooks) === current,
        `hook destination changed during backup reservation: ${targetHooks}`);
      }
    }

    transaction.commit();
    if (hooksChanged) {
      const currentStat = lstatIfPresent(targetHooks);
      if (hooksOriginalStat) {
        assert(currentStat && !currentStat.isSymbolicLink() && currentStat.isFile()
          && sameFileIdentity(currentStat, hooksOriginalStat)
          && read(targetHooks) === current,
        `hook destination changed after preflight: ${targetHooks}`);
      } else {
        assert(!currentStat, `hook destination appeared after preflight: ${targetHooks}`);
      }
      assert(hooksStage && ownedPathMatches(hooksStage.path, hooksStage.stat, 'file'),
        `hook staging file changed before promotion: ${hooksStage && hooksStage.path}`);
      fs.renameSync(hooksStage.path, targetHooks);
      hooksInstalled = true;
      hooksInstalledStat = hooksStage.stat;
      const installedCurrent = lstatIfPresent(targetHooks);
      assert(installedCurrent && sameFileIdentity(installedCurrent, hooksInstalledStat)
        && read(targetHooks) === next,
        `hook destination changed during stage promotion: ${targetHooks}`);
    }

    transaction.finalize();
    if (hooksBackup) cleanupOwnedFile(hooksBackup.path, hooksBackup.stat);
    return { status: hooksChanged ? 'updated' : 'unchanged', stableCopy: transaction.summary };
  } catch (error) {
    if (hooksInstalled) {
      const installedCurrent = lstatIfPresent(targetHooks);
      const stillOwned = !installedCurrent
        || (hooksNextBytes != null && read(targetHooks) === hooksNextBytes);
      if (stillOwned && hooksBackup && ownedPathMatches(hooksBackup.path, hooksBackup.stat, 'file')) {
        try {
          fs.renameSync(hooksBackup.path, targetHooks);
          hooksBackup = null;
        } catch (rollbackError) {
          error.message += `; hooks.json rollback failed: ${rollbackError.message}`;
        }
      } else if (stillOwned && installedCurrent && sameFileIdentity(installedCurrent, hooksInstalledStat)) {
        try {
          if (!hooksOriginalStat) {
            fs.unlinkSync(targetHooks);
          } else {
            error.message += '; hooks.json rollback failed: owned backup is unavailable';
          }
        } catch (rollbackError) {
          error.message += `; hooks.json rollback failed: ${rollbackError.message}`;
        }
      } else if (installedCurrent) {
        error.message += '; hooks.json rollback refused: live destination is no longer owned';
      }
      hooksInstalled = false;
    }
    if (hooksStage) cleanupOwnedFile(hooksStage.path, hooksStage.stat);
    if (hooksBackup) {
      const liveCurrent = lstatIfPresent(targetHooks);
      if (liveCurrent && sameFileIdentity(liveCurrent, hooksOriginalStat)) {
        cleanupOwnedFile(hooksBackup.path, hooksBackup.stat);
      }
    }
    if (transaction) {
      try { transaction.rollback(); } catch (rollbackError) {
        error.message += `; stable hook rollback failed: ${rollbackError.message}`;
      }
    }
    const refreshError = new Error(`hook_refresh_failed: ${error.message}`);
    refreshError.code = 'hook_refresh_failed';
    refreshError.cause = error;
    throw refreshError;
  }
}

// ---------------------------------------------------------------------------
// #598: effort-gated MultiAgentMode dispatch-POSTURE derivation (report-only; NEVER
// gates the install). AC1: after a successful install, derive and REPORT the
// effective dispatch posture, printing the exact remediation whenever the runtime
// would refuse spawns — an install that prints "status: ok" while dispatch is
// model-refused is a failed install for the workflow's purposes, so this closes
// that gap WITHOUT ever failing the install itself.
//
// VERSION-GUARD (verified on codex-tui 0.142.5; may change in a future Codex
// release): MultiAgentMode = none | explicitRequestOnly | proactive.
//   - [features] multi_agent / multi_agent_v2 both absent-or-false -> 'none'
//     (spawn tools are not exposed at all; nothing to gate).
//   - otherwise, effort-gated: a root-level model_reasoning_effort = "ultra"
//     -> 'proactive'; any other value or absent -> 'explicitRequestOnly'.
//
// ATTESTATION-STYLE / NON-FATAL by construction: pure, never throws. Duplicated
// byte-identically in the preflight (installer <-> preflight, this installer being the reference
// copy per validate-script-sync.js's "codex agent-profile installer copies" group); keep the two
// copies in lock-step.
// ---------------------------------------------------------------------------
const DISPATCH_POSTURE_VERSION_NOTE = 'effort-gated multi-agent dispatch posture is Codex CLI runtime behavior observed on codex-tui 0.142.5 and not re-verified on Codex >=0.145.0; it may change in a future Codex release.';

function stripTomlComment(line) {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
    escaped = false;
  }
  return line;
}

// Return a line-for-line structural view of TOML while masking multiline string
// bodies. Configuration prose may contain text such as `[agents.foo]` or
// `[features.multi_agent_v2]`; those bytes are data, not declarations. Ordinary
// quoted values stay intact because the small parsers below still need them.
function tomlStructuralContent(content) {
  const source = String(content || '');
  let output = '';
  let mode = 'normal';
  let escaped = false;

  function quoteRun(start, quote) {
    let end = start;
    while (end < source.length && source[end] === quote) end++;
    return end - start;
  }

  function precedingBackslashes(start) {
    let count = 0;
    for (let index = start - 1; index >= 0 && source[index] === '\\'; index--) count++;
    return count;
  }

  for (let index = 0; index < source.length; index++) {
    const ch = source[index];

    if (mode === 'multiline-basic' || mode === 'multiline-literal') {
      const quote = mode === 'multiline-basic' ? '"' : "'";
      const run = ch === quote ? quoteRun(index, quote) : 0;
      const closes = run >= 3
        && (mode === 'multiline-literal' || precedingBackslashes(index) % 2 === 0);
      if (closes) {
        output += ' '.repeat(run);
        index += run - 1;
        mode = 'normal';
      } else {
        output += ch === '\n' || ch === '\r' ? ch : ' ';
      }
      continue;
    }

    if (mode === 'comment') {
      output += ch;
      if (ch === '\n') mode = 'normal';
      continue;
    }

    if (mode === 'basic') {
      output += ch;
      if (ch === '\n' || ch === '\r') {
        mode = 'normal';
        escaped = false;
      } else if (ch === '\\' && !escaped) {
        escaped = true;
      } else {
        if (ch === '"' && !escaped) mode = 'normal';
        escaped = false;
      }
      continue;
    }

    if (mode === 'literal') {
      output += ch;
      if (ch === "'") mode = 'normal';
      else if (ch === '\n' || ch === '\r') mode = 'normal';
      continue;
    }

    if (ch === '#') {
      output += ch;
      mode = 'comment';
      continue;
    }
    if (source.startsWith('"""', index)) {
      output += '   ';
      index += 2;
      mode = 'multiline-basic';
      continue;
    }
    if (source.startsWith("'''", index)) {
      output += '   ';
      index += 2;
      mode = 'multiline-literal';
      continue;
    }
    output += ch;
    if (ch === '"') {
      mode = 'basic';
      escaped = false;
    } else if (ch === "'") {
      mode = 'literal';
    }
  }

  return output;
}

function tomlStructuralLines(content) {
  return tomlStructuralContent(content).split(/\r?\n/);
}

function decodeTomlBasicStringBody(value) {
  const source = String(value || '');
  let decoded = '';
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    if (ch !== '\\') {
      decoded += ch;
      continue;
    }
    if (++index >= source.length) return null;
    const escape = source[index];
    const simple = {
      b: '\b',
      t: '\t',
      n: '\n',
      f: '\f',
      r: '\r',
      '"': '"',
      '\\': '\\',
    };
    if (Object.prototype.hasOwnProperty.call(simple, escape)) {
      decoded += simple[escape];
      continue;
    }
    if (escape !== 'u' && escape !== 'U') return null;
    const width = escape === 'u' ? 4 : 8;
    const digits = source.slice(index + 1, index + 1 + width);
    if (digits.length !== width || !/^[0-9A-Fa-f]+$/.test(digits)) return null;
    const codePoint = parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return null;
    decoded += String.fromCodePoint(codePoint);
    index += width;
  }
  return decoded;
}

function parseTomlDottedKeySegments(bodyValue) {
  const body = String(bodyValue || '').trim();
  if (!body) return null;
  const segments = [];
  let i = 0;
  function skipSpace() {
    while (i < body.length && /\s/.test(body[i])) i++;
  }

  while (i < body.length) {
    skipSpace();
    if (i >= body.length) return null;
    const quote = body[i];
    if (quote === '"' || quote === "'") {
      i++;
      let value = '';
      let escaped = false;
      let closed = false;
      while (i < body.length) {
        const ch = body[i];
        if (quote === '"' && ch === '\\' && !escaped) {
          escaped = true;
          value += ch;
          i++;
          continue;
        }
        if (ch === quote && (quote === "'" || !escaped)) {
          closed = true;
          i++;
          break;
        }
        value += ch;
        escaped = false;
        i++;
      }
      if (!closed) return null;
      if (quote === '"') {
        value = decodeTomlBasicStringBody(value);
        if (value === null) return null;
      }
      segments.push({ value, quoted: true });
    } else {
      const m = body.slice(i).match(/^[A-Za-z0-9_-]+/);
      if (!m) return null;
      segments.push({ value: m[0], quoted: false });
      i += m[0].length;
    }

    skipSpace();
    if (i >= body.length) break;
    if (body[i] !== '.') return null;
    i++;
  }

  return segments;
}

function parseTomlTableName(line) {
  const trimmed = String(line || '').trim();
  let body = null;
  let isArrayTable = false;
  if (trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
    body = trimmed.slice(2, -2).trim();
    isArrayTable = true;
  } else if (trimmed.startsWith('[') && trimmed.endsWith(']') && !trimmed.startsWith('[[')) {
    body = trimmed.slice(1, -1).trim();
  } else {
    return null;
  }
  const segments = parseTomlDottedKeySegments(body);
  return segments ? { segments, isArrayTable } : null;
}

function parseTomlAssignment(line) {
  const source = String(line || '');
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const ch = source[index];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '=' && !inSingle && !inDouble) {
      const key = parseTomlDottedKeySegments(source.slice(0, index));
      return key ? { key, value: source.slice(index + 1).trim() } : null;
    } else if (ch === '#' && !inSingle && !inDouble) {
      return null;
    }
    escaped = false;
  }
  return null;
}

function tomlAssignmentPath(tableName, assignment) {
  if (!assignment) return null;
  let segments = [];
  if (tableName !== null) {
    if (!tableName || tableName.isArrayTable || !Array.isArray(tableName.segments)) return null;
    segments = tableName.segments;
  }
  return [...segments, ...assignment.key].map(segment => segment.value);
}

function tomlAssignmentPathMatches(tableName, assignment, dottedPath) {
  const actual = tomlAssignmentPath(tableName, assignment);
  if (!actual) return false;
  const expected = Array.isArray(dottedPath) ? dottedPath : String(dottedPath || '').split('.');
  return actual.length === expected.length
    && actual.every((segment, index) => segment === expected[index]);
}

function tomlTableNameMatches(tableName, dottedPath) {
  if (!tableName || tableName.isArrayTable) return false;
  const segments = Array.isArray(tableName) ? tableName : tableName.segments;
  if (!Array.isArray(segments)) return false;
  const expected = String(dottedPath || '').split('.');
  if (segments.length !== expected.length) return false;
  return segments.every((segment, index) => segment.value === expected[index]);
}

function parseTomlBoolean(value) {
  const trimmed = String(value || '').trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return null;
}

function parseTomlString(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length < 2) return null;
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return decodeTomlBasicStringBody(trimmed.slice(1, -1));
  }
  return null;
}

function splitInlineTomlFields(body) {
  const fields = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (!inSingle && !inDouble) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      else if (ch === '[') bracketDepth++;
      else if (ch === ']') bracketDepth--;
    }
    if (ch === ',' && !inSingle && !inDouble && braceDepth === 0 && bracketDepth === 0) {
      fields.push(body.slice(start, i).trim());
      start = i + 1;
    }
    escaped = false;
  }
  fields.push(body.slice(start).trim());
  return fields.filter(Boolean);
}

// #775 (Codex 0.145 re-baseline): V1 (the [features] multi_agent flag and the non_code_mode_only /
// hide_spawn_agent_metadata / tool_namespace transport sub-grammar) is retired — there is no V1
// fallback and no transport-mode gate anymore. The MultiAgentV2 switch lives at
// `features.multi_agent_v2.enabled`, read in the three shapes Codex accepts: the
// [features.multi_agent_v2] sub-table, the inline `multi_agent_v2 = { enabled = true, ... }` under
// [features], and a bare `multi_agent_v2 = true` (plus their dotted-root equivalents) — hence the
// inline-table parser below and the dual-shape ambiguity tracking in detectCodexDispatchMode.
// Reads ONLY the `enabled` flag; parseMultiAgentV2NumericFields below reads the concurrency/
// wait-timeout fields from the same feature. multi_agent_v2 stays a CHECKED required engine feature
// (codex_multi_agent_v2_required refuses when it is absent/false) — see the preflight gate this
// installer keeps byte-in-lock-step with.
function parseInlineTomlTableAssignments(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  const body = trimmed.slice(1, -1).trim();
  if (!body) return [];
  const assignments = [];
  for (const field of splitInlineTomlFields(body)) {
    const assignment = parseTomlAssignment(field);
    if (!assignment || assignment.key.length !== 1) return null;
    assignments.push(assignment);
  }
  return assignments;
}

function parseMultiAgentV2Value(value) {
  const trimmed = String(value || '').trim();
  const bool = parseTomlBoolean(trimmed);
  if (bool !== null) return { valid: true, enabled: bool };

  const fields = parseInlineTomlTableAssignments(trimmed);
  if (fields === null) return { valid: false, enabled: false };

  const enabledFields = fields.filter(field => field.key[0].value === 'enabled');
  if (enabledFields.length !== 1) return { valid: false, enabled: false };
  const parsed = parseTomlBoolean(enabledFields[0].value);
  if (parsed === null) return { valid: false, enabled: false };
  return { valid: true, enabled: parsed };
}

function detectCodexDispatchMode(configContent) {
  const lines = tomlStructuralLines(configContent);
  let table = null;
  let seen = false;
  let enabled = false;
  let ambiguous = false;

  function record(parsed) {
    if (!parsed.valid || seen) {
      ambiguous = true;
      enabled = false;
      return;
    }
    seen = true;
    enabled = parsed.enabled;
  }

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      // Root-level `features = { multi_agent_v2 = ... }`.
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) {
        ambiguous = true;
        enabled = false;
        continue;
      }
      const v2Fields = featureFields.filter(field => field.key[0].value === 'multi_agent_v2');
      if (v2Fields.length > 1) {
        ambiguous = true;
        enabled = false;
      } else if (v2Fields.length === 1) {
        record(parseMultiAgentV2Value(v2Fields[0].value));
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      record(parseMultiAgentV2Value(assignment.value));
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'enabled'])) {
      const value = parseTomlBoolean(assignment.value);
      record({ valid: value !== null, enabled: value === true });
    }
  }

  const v2Enabled = seen && !ambiguous && enabled;
  return {
    // #775: the single legal dispatch mode once V2 is enabled — no more v1-thread-id fallback.
    // null (not a fabricated 'v1-thread-id') when V2 is not enabled; runPreflight refuses
    // codex_multi_agent_v2_required in that case rather than silently exiting ok.
    dispatch_mode: v2Enabled ? 'v2-task-name' : null,
    multi_agent_v2_enabled: v2Enabled,
  };
}

// #775: the legacy `[features] multi_agent` (v1) flag and the V1/V2 dual-feature OR-join are
// retired — multi_agent_v2 (`features.multi_agent_v2`) is the ONLY dispatch contract, so
// deriveDispatchPosture below gates on detectCodexDispatchMode's `multi_agent_v2_enabled` alone.

// Root-level `model_reasoning_effort` — the effort setting that gates MultiAgentMode. TOML
// root keys must precede the first [table] header, so scanning the text up to the first
// top-level table line is the correct (and only valid) place a user-owned root key can live.
function parseTopLevelModelReasoningEffort(configContent) {
  let table = null;
  let seen = false;
  let effort = null;
  for (const rawLine of tomlStructuralLines(configContent)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }
    const assignment = parseTomlAssignment(line);
    if (!tomlAssignmentPathMatches(table, assignment, ['model_reasoning_effort'])) continue;
    const value = parseTomlString(assignment.value);
    if (seen || value === null) return null;
    seen = true;
    effort = value;
  }
  return effort;
}

// Exact remediation text for a non-proactive posture; null when nothing to remediate. Leads with
// the always-available, always-documented in-session ask; the ultra reasoning-effort route is
// offered second and qualified as undocumented/plan-gated (many Codex plans currently top out
// at xhigh, so the config.toml / per-session route is not always actionable).
function dispatchPostureRemediation(posture) {
  if (posture === 'proactive') return null;
  if (posture === 'none') {
    return 'Kaola-Workflow cannot attest its required V2 task-name dispatch path because '
      + 'features.multi_agent_v2.enabled is absent or false. multi_agent_v2 is opt-in and off by default in '
      + 'Codex >=0.145.0 (only V1 multi_agent is on by default), so it must be set explicitly. '
      + 'Add it, start a new Codex session, then explicitly ask for sub-agents/delegation/parallel work '
      + 'in-session; or, if your Codex '
      + 'exposes an ultra reasoning effort for your model/plan (undocumented as of Codex >=0.145.0 — check the '
      + '/model picker), set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c '
      + 'model_reasoning_effort=ultra) for proactive delegation.';
  }
  return 'Codex is not configured for proactive sub-agent delegation (dispatch_posture: explicitRequestOnly). '
    + 'To dispatch now, explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex exposes '
    + 'an ultra reasoning effort for your model/plan (undocumented as of Codex >=0.145.0 — check the /model picker), '
    + 'set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c model_reasoning_effort=ultra) '
    + 'for proactive delegation.';
}

// #775: gates ONLY on multi_agent_v2_enabled (`features.multi_agent_v2`) — v1 is retired, so there is no
// more OR-join with a legacy feature flag. `multi_agent_enabled` mirrors multi_agent_v2_enabled
// (kept as a distinct output field for back-compat shape; there is only one feature now).
function deriveDispatchPosture(configContent) {
  const dispatchMode = detectCodexDispatchMode(configContent);
  const effort = parseTopLevelModelReasoningEffort(configContent);
  const posture = !dispatchMode.multi_agent_v2_enabled ? 'none' : (effort === 'ultra' ? 'proactive' : 'explicitRequestOnly');
  return {
    dispatch_posture: posture,
    model_reasoning_effort: effort,
    multi_agent_enabled: dispatchMode.multi_agent_v2_enabled,
    dispatch_posture_warning: dispatchPostureRemediation(posture),
  };
}

// ---------------------------------------------------------------------------
// MultiAgentV2 concurrency + wait-timeout bounds — extends the dispatch-posture report
// above with the effective v2 slot budget and wait-timeout knobs. `max_concurrent_threads_per_session`
// INCLUDES the root/orchestrator thread, so effective subagent width = threads - 1 — CONFIRMED
// against upstream SOURCE at tag rust-v0.145.0 — codex-rs/core/src/config/mod.rs defines
// DEFAULT_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION = 4, and effective_agent_max_threads
// returns saturating_sub(1) for V2, so the cap counts the root thread. Introduced by PR #19792, but
// verified at the released TAG rather than at the PR: the constant moved from
// codex-rs/features/src/feature_configs.rs to core/src/config/mod.rs between merge and release, so
// a PR-only check would have named a path that no longer exists. Re-check with:
//   gh api "repos/openai/codex/contents/codex-rs/core/src/config/mod.rs?ref=rust-v0.145.0" \
//     --jq .content | base64 -d | grep -nE 'DEFAULT_MULTI_AGENT_V2_MAX_CONCURRENT|saturating_sub'
// It is SOURCE-verified, not documentation-verified: the public configuration reference does not
// document multi_agent_v2 at all. This arithmetic is UNCHANGED by #775 — only the config TABLE
// moved (see detectCodexDispatchMode / parseMultiAgentV2NumericFields). The constant name and the
// 'observed_default' source tag are kept for output-shape back-compat: the VALUE is source-verified,
// the LABEL is legacy. The three
// *_wait_timeout_ms bounds have no independently verified default — read ONLY when explicitly
// present in config; null when absent (no fabricated fallback for those three).
//
// EXEMPTION — MULTI_AGENT_V2_BOUNDS_NOTE below says a stray `agents.max_threads` "does not
// raise the MultiAgentV2 cap". That is a claim about someone else's software, so here is the
// command that measured its boundary (codex-cli 0.145.0, isolated CODEX_HOME):
//
//   $ printf '[features.multi_agent_v2]\nenabled = true\n' > "$CODEX_HOME/config.toml"
//   $ CODEX_HOME=... codex doctor --json   # then again with `[agents] max_threads = 6` added
//
// The two reports are identical apart from the timestamp and the home paths, and NEITHER
// exposes max_concurrent_threads_per_session or any other resolved thread cap. That is the
// boundary: our own reported budget is checkable, Codex's internal handling of the value is
// not observable from outside, so the note must not be strengthened past "does not raise the
// cap" — test-install-model-rendering.js pins the stronger wordings OUT of both copies.
//
// Bounds are only meaningful when v2 dispatch is actually active (dispatch_mode ===
// 'v2-task-name'); when v2 is not enabled, every field reports not_applicable/null —
// mirrors how dispatch_posture itself collapses to 'none' when features are off.
//
// ATTESTATION-STYLE / NON-FATAL by construction: pure, never throws. Duplicated
// byte-identically alongside the dispatch-posture helpers above (installer <-> preflight,
// x7 files total); keep the two copies in lock-step.
// ---------------------------------------------------------------------------
const OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION = 4;

const MULTI_AGENT_V2_BOUNDS_NOTE = 'Recommended [features.multi_agent_v2] config for Kaola-Workflow '
  + 'dispatch: set max_concurrent_threads_per_session high enough for the intended fan-out width plus 1 '
  + '(the budget INCLUDES the orchestrator thread) and max_wait_timeout_ms near the longest expected node '
  + 'runtime so long-poll joins are not capped short. Example:\n'
  + '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 5\n'
  + 'max_wait_timeout_ms = 1800000\n'
  + 'Effective subagent width and the default budget of 4 (width 3) when max_concurrent_threads_per_session '
  + 'is absent are Codex >=0.145.0 SOURCE behavior, verified at tag rust-v0.145.0 in codex-rs/core/src/config/mod.rs (DEFAULT_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION = 4; effective_agent_max_threads uses saturating_sub(1)) and introduced by PR #19792 — source-verified, not documented: the public configuration reference does not carry multi_agent_v2 at all. The wait-timeout bounds '
  + 'have no independently verified default and are read only when explicitly configured. Do NOT set '
  + 'agents.max_threads alongside it: that is a separate [agents] key, NOT an alias for '
  + 'max_concurrent_threads_per_session, and it does not raise the MultiAgentV2 cap — that comes from '
  + 'features.multi_agent_v2.max_concurrent_threads_per_session alone. Codex 0.145.0 accepts the key '
  + 'rather than complaining (a config carrying both loads clean), so a stray max_threads leaves the '
  + 'cap where it was instead of erroring.';

const MULTI_AGENT_V2_NUMERIC_FIELDS = [
  'max_concurrent_threads_per_session',
  'min_wait_timeout_ms',
  'max_wait_timeout_ms',
  'default_wait_timeout_ms',
];

// #775: parses the four MultiAgentV2ConfigToml numeric fields from `features.multi_agent_v2`, in
// the same three shapes the enable flag is read in: the [features.multi_agent_v2] sub-table, the
// inline `multi_agent_v2 = { ... }` under [features], and the dotted root form. There is NO
// `max_threads` alias — MULTI_AGENT_V2_NUMERIC_FIELDS above is the closed field list.
// Same first-match/fail-to-absent discipline as the rest of this file: a non-integer or repeated
// value is treated as not-configured rather than guessed at.
function parseMultiAgentV2NumericFields(configContent) {
  const fields = {
    max_concurrent_threads_per_session: null,
    min_wait_timeout_ms: null,
    max_wait_timeout_ms: null,
    default_wait_timeout_ms: null,
  };

  function recordField(key, rawValue) {
    if (!MULTI_AGENT_V2_NUMERIC_FIELDS.includes(key) || fields[key] !== null) return;
    const m = String(rawValue).trim().match(/^-?\d+$/);
    if (!m) return;
    fields[key] = parseInt(m[0], 10);
  }

  function recordInlineFields(value) {
    const inline = parseInlineTomlTableAssignments(value);
    if (inline === null) return;
    for (const field of inline) recordField(field.key[0].value, field.value);
  }

  const lines = tomlStructuralLines(configContent);
  let table = null;
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (!assignment) continue;

    // [features.multi_agent_v2] sub-table (or the dotted root equivalent): plain scalars.
    if (tomlTableNameMatches(table, 'features.multi_agent_v2') && assignment.key.length === 1) {
      recordField(assignment.key[0].value, assignment.value);
      continue;
    }
    // [features] multi_agent_v2 = { ... } — settings live inside the inline table.
    if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      recordInlineFields(assignment.value);
      continue;
    }
    // Dotted form: features.multi_agent_v2.<field> = <n>.
    for (const key of MULTI_AGENT_V2_NUMERIC_FIELDS) {
      if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2', key])) {
        recordField(key, assignment.value);
        break;
      }
    }
  }

  return fields;
}

function deriveMultiAgentV2Bounds(configContent, v2Enabled) {
  if (!v2Enabled) {
    return {
      max_concurrent_threads_per_session: null,
      max_concurrent_threads_per_session_source: 'not_applicable',
      effective_subagent_width: null,
      min_wait_timeout_ms: null,
      max_wait_timeout_ms: null,
      default_wait_timeout_ms: null,
    };
  }

  const raw = parseMultiAgentV2NumericFields(configContent);
  const configuredThreads = raw.max_concurrent_threads_per_session;
  const usingDefault = !(Number.isInteger(configuredThreads) && configuredThreads >= 1);
  const threads = usingDefault ? OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION : configuredThreads;

  return {
    max_concurrent_threads_per_session: threads,
    max_concurrent_threads_per_session_source: usingDefault ? 'observed_default' : 'config',
    effective_subagent_width: Math.max(threads - 1, 0),
    min_wait_timeout_ms: raw.min_wait_timeout_ms,
    max_wait_timeout_ms: raw.max_wait_timeout_ms,
    default_wait_timeout_ms: raw.default_wait_timeout_ms,
  };
}

// #1087 F5: the Codex installer installs its OWN machine-global contract carrier as its last
// step, through the per-target global-contract CLI (--runtime codex writes only ~/.codex/AGENTS.md
// plus its own target record). The CLI and the universal contract source live in the checkout
// this plugin tree sits in; a plugin-cache copy has neither, so that source reports UNAVAILABLE
// (never a silent success) and a checkout install owns the carrier. `--global --uninstall` runs the
// same CLI in uninstall mode, stripping only the carrier its own per-target record proves.
function runGlobalCarrier(mode) {
  const cli = path.resolve(pluginRoot, '..', '..', 'scripts', 'kaola-workflow-global-contract.js');
  if (!fs.existsSync(cli)) return { status: 'UNAVAILABLE', cli };
  // spawn-class: cli-contract
  const result = require('child_process').spawnSync(process.execPath,
    [cli, mode, '--runtime', 'codex', '--json'], { encoding: 'utf8', env: process.env });
  let doc = null;
  try { doc = JSON.parse(String(result.stdout || '').trim()); } catch (_) { /* reported below */ }
  const row = doc && Array.isArray(doc.targets) ? doc.targets.find(t => t.id === 'codex-local') : null;
  return {
    status: result.status === 0 && doc ? doc.status : 'FAILED',
    exit: result.status,
    path: row && row.path,
    detail: doc && doc.error ? doc.error : String(result.stderr || result.stdout || '').trim(),
  };
}

function installGlobalCarrier() { return runGlobalCarrier('install'); }
function uninstallGlobalCarrier() { return runGlobalCarrier('uninstall'); }

// ---------------------------------------------------------------------------
// #1101: ownership-proven retirement of the role profiles and registrations earlier releases
// installed. Proof for a profile in <scope>/.codex/agents/kaola-workflow/ (a Kaola-namespaced dir):
//   record   the dir's ownership record (.kaola-managed-profiles.json, schema 1) lists the file with
//            the digest it still has; or
//   catalog  the bytes are a profile some release shipped (RELEASED_PROFILE_SHA256 — every
//            historical blob of plugins/*/agents/*.toml, which every installer copied verbatim;
//            this is what proves the files of a pre-record install, #332).
// A profile the scope's remaining config.toml still points at (config_file) is kept, so no user
// registration is left dangling. The registration block is stripped only when its body is exactly
// a body some release wrote (RELEASED_BLOCK_BODY_SHA256); an edited or ambiguous block is kept.
// Everything kept is reported with its reason; nothing is refused (#1101 H9), nothing is followed
// through a symlink, and pre-rename codex-workflow leftovers are only reported (#1101 H6).
// Frozen from history (scripts/fixtures/issue-1101/PROVENANCE.md); never extended.
// ---------------------------------------------------------------------------
const RELEASED_PROFILE_SHA256 = Object.freeze({
  'adversarial-verifier-max.toml': [
    '746e8e95249042b8a0d4b66a5264b81d8bf64c9d104f776c1c6c727e7f3cc284',
  ],
  'adversarial-verifier.toml': [
    '0a479a16be6f89e2d056efcae4500f3c2be71ef39820396d23e835057f33079f',
    '122e7ec04df2b6d3169e5102b3b2dd2c8a0262250ad9b52a5849188c7c5bb9a7',
    '25f52215a681531b709a3b30f6aa7f77e0c1b7f754e173eae95cff688cc01607',
    '2796f77902d46fcd414bb24e203b15e544b992b590a52b06b35819c0971e9022',
    '4915870f771e7bb944a34c0a5efb31241a17f2c327263e10cbcec54c67fc2a20',
    '51aa9cd77fc86b3bd52fb4e836e6020d8e0d768da51b94017321ff994848aa65',
    '5566d8098cd848cad52260c1bf0999690169b954cd8efe72a841a2cf85ee6494',
    '6405c43bbb3ef28de729efaca68c571729663c3bedf1dae74bd1162675e50ad2',
    '7d58b1faca8290bae0304bd7406c4684578fbb770ad0f7ea111914e49a1f95f5',
    '82c4ab68db40248f4b0fc84e8f3dd143c8db6919373d3f8145babd169f83919e',
    '8e614f09563707f6244ab201806d125ba870f09507ce057f337a16f3b229567a',
    '8f680ce0f1e007fc37307ae6dbfc934472a14865ea153fdfecebf535f52b1088',
    'a6854b1a62774310ea81e56a036b9db1b26c8cbb4866b2d7cc77a238752c2825',
    'a932fded89b1bc3675bd51c946c590e0e236e6f19e9f0049df01dc94e39f44b6',
    'ac1a326d4e5263e96ca9b22656145d745844e663b21263b0e699482fe4fbfde7',
    'bf7446b2ef9e79c74fee075533e45e38e25f611d16b65952205654adaa5f530d',
    'd157af0bcb5c012a8c314964d63496a3e5362dc2cd643cf84383b410ec596af8',
    'e412418fdc20e813d85bd7886e8bc951c920cfed8a8667e8ef820f17bbec3ac5',
    'e83457f0e16d7518711808d482e0c7b028c65cbd4e62c720953a2d18689c044d',
    'f3a6293c3158a96fb0e6320ea0bd1e8dbabf4bca5c10bd444ea7f20c1c7ddd70',
    'f96328598c34575f6fa1c019bb19b78fe03c9948dcb2d6a4150171319f36acf7',
  ],
  'build-error-resolver.toml': [
    '174afe3a4960c1d64788044c7eede824b810b984e75ea154cea827f42f2de73d',
    '1d5b1342555b79251ddd9180f7b537bb73967f958e35bd64f0cec196fc1948e5',
    '1f1aa06ab6ff1d367d1f3a6ed42400177f31aa82ffe2b3f0ef450d3c70414e79',
    '1f9ffc92f9bc83c9f9d27b5606f2f0d1272174c6abdae13587fd15c789207745',
    '36e72f1d9263a7b814672f42a6a314bf69ebad75d1813d5d528a92742517985b',
    '531c3ffaa9668433ba5aebae45b89b583ad687ae1498669cd7312d16d73210dd',
    '5c455588240c3a873a08b7383cd1388412b8bb69498fc0e9176b601d81407ac0',
    'cb179f2b0cccb9c7813e5c486e93efcb5288cd317d7cc1e0324e81bf6b6effca',
    'cc941eed541cf4165562c9ab4e03bb9395d7192cde5a909bf11e70723fc2a636',
    'd58cb2d658a5c916bef16f9431b65d58381040f0c47b5b3d6d95e26c142968d0',
    'd6ab563d15f3c33d1aa70f15a7115e1a46ce50f1c34e5c3af62f7a494cc883ef',
    'f7e192b5a37d24aacdf7a4ce9cd50984fe825099b832f9760f4936b9967c9f47',
  ],
  'code-architect-max.toml': [
    '47e1082db8e2c11e674592b242193dbcd2524105e434f2d920287d300ad01e9c',
  ],
  'code-architect.toml': [
    '0d73206a92918ec7340686769ef56906902a42eee7550804621cf1d11e07ebbf',
    '223b5c5e0bba7485951c923f445bf8023d0587c06f613ac19d7153f90cbde492',
    '22beda98e9dc11ca511eba26987c6f6dc10791ac26901e776ee66fddcb5b5a84',
    '243461b7961b57d9df0c7c724b3fe0f351cfeeb029e9fa8b22a2d703f57cc835',
    '2bd1820f0ef09683b0ae1f345c5ea00c67801b9f0948db634e364805465eea29',
    '5ca75a4ac97029c9fc1dfc4a0917a2c4b68e76d4cb223d8cff517562234c6d0b',
    '5d63b114a9e2150d9c9f03915775002eaf02dd9293fa22484404896360c52c6a',
    '5db48d70e206c4ee96e1e3af967ff1615ef964efa20fda5c30a33ec99eed359f',
    '700761c26baec2056ba7be6ac879d4633a97f75cbab5a6f99ff8226cbd68e049',
    '8b242e1263020450f7ec4ee967cc4184fb37cd7c3c60faab4412d4082dd9bb12',
    '94ff5744bd4e7d3cf2a0a6ab0a6b53be55e0832b998c6a264906edb067a8c442',
    'af7092d64b4493c3ecbe80fc7e52eb7b1e5fe3bad0a87e464c2b98ee1e189281',
    'e99ed1a4083a5bc4e0fd1c3907fd2b3532ad6c5d676eaa9b779363c42483ccdf',
    'ec3622cf08483b2340e7625b32e15d3e071ecf055fc84c545637e94d8a45af71',
  ],
  'code-explorer.toml': [
    '0a65d8b8fde6ef66e5de0a0034ade79e7dd72b4e42be1a15ea1db5279f7160b9',
    '0b37279245a670df2ab97c268372c64889443c859e4bc907c64b055fd718e5b3',
    '59cfcd76f292318ddb7cf8e010972f21d8539cbe491341b806b3f49cbc400245',
    '5a3989e38c644a25763440829fff3b19d92af3d8e7481f267b951f477e3617cb',
    '62798ed60f438a9a3727eab890e5f695745bd155e0b8e92dc065a757e2d30905',
    '6c48c1eb24288268ef42c92b3362df55ce5729359ccec3f6b79567791f6f33e4',
    '7063dd326ac01e7cacb2c4d87b9bd1ee623c1d587ff71e981dfd5f6bf77c2a26',
    '77d44dfc3a8071141ccd0ec819c9be5c585b8e1bdb0c7580ae06c60788a93d73',
    '7a0513ae5c676915a87e30b2de09388db3d574c4b99fbf6e7477b08a3e20262f',
    '7e5f08c31232dcdfc962c40cc40d73d817af783df92c470486ddadaff46889e3',
    '878aab911179800bc8b94c9bada820c7051bd07d7ddfe9354a53549a6ef25383',
    '925df18bff28ecb63855f80d3d238d3b0febc2765a4cc4ea4922a23280de2ddf',
    '9a190d8144b678e8c101fc81377ef02292355081244da4ddd842e444b79f0605',
    'd08875c8f09f2be53431f6c3ce9a48e8feba96bf92a9120f20291636358c297e',
    'f1e1a9ea9201c8fb8e9dc53fd146bbc6a15ae3e8a4ea421417a4d7cb56e54d23',
  ],
  'code-reviewer-max.toml': [
    'a871abad8087d5080836df038c60c6788e07c3efa02474ba1b0a1435bc296911',
  ],
  'code-reviewer.toml': [
    '051610d36e52c19dca7bcf277025f4619dd13e4099348ef1f111a137dfb38ef7',
    '0559d2c443e3158c43984a5d8f1b799e35669ec419de1be40bf36b8afdf84b30',
    '0dd655c663c89142db5519672759a607fa6ec58dbc32abd070d486080d6dc419',
    '10f623736d7ee329c8bf93b8d224cf7a962e260b477984a2f312786a6e4a25be',
    '1e21eb712f6377b4a335429df1d59e28d9d5de302a145cd0e9573f4e2a4db8a4',
    '259db4caf5f0fdfdfc92b35965f6394b04e1af19313a5cb12fa318a36ba04c0b',
    '2a61003d6d8ee86e3fc9d65e36d56ec8e8da48e2a5cd98180c5645e58fe0db85',
    '2b6c5dfb4f1a90d2352196c73e5958375ca91ee1e7abde21fe910c156b659e80',
    '49ab9e420b6c28a9495b79ecfc55057c4d92e5094e803aaaa659bee52ba0e8dd',
    '5cef09027607953640a1f0e451f4553526b21cb95f7671b16b962b65daaf0a3f',
    '6b60c45e7f5c98cafcd186e5b915592d37a7c085d3aa68bb10ee6f6235dc9beb',
    '75ad2243e1a2021921a6c415c52a1ecc0b8b48ebf15022c7c73028d36faa9ad2',
    '7fd5e2c019fb89aaebb97df72f9d380d6016bc63c9c3c7e07bf79ad24854f0c5',
    '838ecd6513b9156baae934e442bb2f2bbdb60a3b35eab3a8932b36438ff62b75',
    '903a16977992e9b08d11fdccbcac118e530861ae244b2d5d022defc70425e47b',
    'a951501836f98a6182378945bc00ed6e0d4078153303ccdec7e9830b09c7d017',
    'b2a327f149e347d214928fef53ea71776b298fb0f61ebcb8b04584286bd33e10',
    'b71765ff5484fed22b862271de3486aaf779a78d3b7652f7d2756f0dbbe113f2',
    'c0c8bcecb061a88956bb55ad4e7e0798e893ca41800aa07b3d8284e0b41436b9',
    'c2a781a68a2b00c722ebec7af03a4939eff1016fdc5fc7a5348876d39a971b8e',
    'e7fc3af2f63f69d9fc0919c4cd0eb81103cce9a267fee6d18fbd7a680e507244',
    'f771fd24206e6edfcf28611c2e37a10401f86d886816f8ac9c7f03e73bc0a109',
    'f78ac4c2b4ead41241c3fabd41a8ce13947adba9a5fe009ef7a59403be3df3d6',
  ],
  'contractor.toml': [
    '0cb3ba3f42b921930b7b081704c38d367e9a4bfc7931058fac77668fce1c3e99',
    '0d9a56c6c72912118f2c40be0c8965f521147a3b236aa98c951e31946e30ba54',
    '1024bf5a38ea79766699f790d1c9de45bdd7fa88002f96d0a2fbfcc677ff22b0',
    '2420ffb96b88c755129c8fae9c73abfbfe8856a09983a07f22346dee6282f971',
    '26f2288b35fd72257c032197f99311d9e486e364d3982461a38281983e27f6aa',
    '32d328bccf298cc11150bf29f9770cb7285210a3f252d6f7ad89c5adb224fd34',
    '37ea7739e864c2cc612f7988a22a118265df018cf522bde15e36ab464cb53047',
    '5806d4148e08793083c2adf63255bf9c4db61d2fc575b7a116392abcdff310b1',
    '5a1ba9669c7a528f939c95ca3b747fd3e2697ec851963dea08ccd6413d902f81',
    '5e3c1c58410be867c5eecc4427ec5cff78defc5b5d6fb98bd9632bd1951587f3',
    '731f63a264be8bf830c16910abd8f87c451363aba196c94b1ee0789cdecfd83d',
    '7caa779305c00730821150b855911c00667414213d1564d317ed2e0d9d3e5498',
    '85c82549103c3db8c49c89be4acd7d48fe4831b9532d50f8ea6e24ceda74ec9b',
    '94ec367c45ea875d41d19361a50089268c401fc39eae90695da399163325299d',
    'a053ece140087730c547159b3e75203d37f95a80941d79fafd0387aa69f25269',
    'a2116f2d39fd72774647b91514e0605b3767e2a935b112d08b6dd5910d416525',
    'ab3aca6c2d56f1eace800ab8094708387a8d381dcd3c73836285d2f3ae25610d',
    'c5a479fe7e1a03b10c76ea6689e1f4fa60aa14123159d3be9f1eab533fd2001b',
    'ca5b717067b0522cb9b6e0f4df205e352b450f57cc21610fb3462ff8269850f2',
    'cf633c4e268c7498061e4f694529da8844685c87339ec012b9d3e7a1cf98a54b',
    'da3c3bc4340dac060594c6c87bdfee74b4437f131b769e2452fa79aea6607cc7',
    'e24828a2c314b2c15137a536e4d785a1a802546a877341268ac4d319f446cd1f',
    'e2db8b3704cfd1dc7e6049f6766dbdaf9bce90456bf0e2c5b7747ef1f4401b30',
    'eea062e4934a132a897a96462b3c8fac0986a5a45f1c24934ccfcf8aa430318e',
    'f968786f39b57e4138039bc3509ed6438893b2c15c5aa3a38f701b2d2d422bee',
  ],
  'doc-updater.toml': [
    '01354520e1ee50d5c56caef4c3110d08309b2c6863bc306dc0b26bb8f76de52c',
    '057f1a940edaabd324240d37e62d883c7dfdc140dc185e585d4df043a79c836d',
    '2f1d2fc4e6fdd3268dbc85203f28ed89a4259f384e34c6c525674f1fd09cb9ec',
    '381e1a952ee653b3e2c2fc214497a8d274bd4477c5a5428059c23cfbbb1a22e1',
    '4ae110ca7338e820dc04e4d1b8ae98b29fe0bb5568c5545adc08f7a34e0dbb3c',
    '4e0caf4f2763b9f1be24af6b4ca3e5d70714b2a23c3e0c798445e8f578593467',
    '594607b60a93b386af57c3cedc1d3fcbed4730bd9e0b9a56174eccec1e16293d',
    '5eff6a6db1e880058c04230949f1412887b0860a64f38ae4ca4eeb5a1e8092e9',
    '63edbe299f5255e209804e4f32133ba6cad17c58286fbb5176a033b6abb395bd',
    '9e22c44f4f5fb1eb8140ff96ba33ef6be5126aef69a22fa38f0c80deabf6545a',
    'ab4f5b6d8c4abe73cc5ec4fa32f347f6caa1773a0d5f9262fbc0ef1bf539303f',
    'ac73e5f90c6dbfb15b73cacff5e2bc7caf5ec241681aa8751518d6600672b409',
    'b00ede88027a10067759a3bd76e976483264b4f6d7bb594bb4912d38927440ee',
    'b7f45f0850d44d8a457c543827d97a67c39484299b809dab45f8b2223cefb350',
    'd339c243a4693c85c37fe4bbcbad6de066926d1e4af28f8fecbad2f5a80a551f',
    'e70b2e0c2b37df3732d172f8c839df604663c3f125af3b9224dede99997faca0',
  ],
  'docs-lookup.toml': [
    'ba6ab6da75386baa41692fb1ddb328c193522bc768b264ff73c52055ab4ad32c',
  ],
  'implementer.toml': [
    '072e7aeda5e10105b7bc10d7dda120833167ddebbf7f1714ae36e3b3d63b857f',
    '1beff5b983a87ac2e8318b092f0be846642abaebddfd8add94630c2e6c9f4bb7',
    '257e502cfaf5f09fa43b8843aef6f2973efbe7ca3f3b808ec45d5a868fd60bf9',
    '2e2232cd7e9086b5cbb9d8cbb320cf51195c6e863a0741da926111c9b4ba866b',
    '49e034704e9a9311b9bfb47fdeacfa7ff9bac6b637752098da994b622854341f',
    '51f04af3260b2acdb068bace5e2898f13c7838a051978113efad7254cb98d538',
    '608665efb28abc08dfefee26b439d852817ce32ec9c4ba08fddca11e3bc746ff',
    '691bcc1aa7a808568517996af01e9cacc3b62ada4642363f5a0cd849f7ad089a',
    '6fd4fd962fd60c002e0b44e0fad07e823601d322c97c976b0111464f5a93f031',
    '75e71e81ab4e1aa9cf7b69cbe46e07eb25120885906a1e34b6c0bd082ea85e11',
    '897ab2e87e4327b4454e0f8cdf80006830992d9d145fa83848e8257fb52dd1c4',
    '9401a00f40cc903168f1b3447da2cc4272bb84f123fcf934f4f94735091b1327',
    '96d584b3819e6c1951af3724161a70baec6734ccba46c067cf40dc8402e4297d',
    'bd9b732546b19d95137cdcc98ec26b16dde741b1d3d454e9f2f6def3dc515fc5',
    'c2b02d1b298eff59e439023e23c460c52b320f4bfb4ca03428c20c23347652f5',
    'cba8700837018c90c36457a02ac269adb156e0d239337bb741eb20f76bb606d2',
    'cd72bdfd2489279462bb57c5eebc32bac72f8264822a4b9219d79114149b0768',
    'd5bd49445dce3de86386c3c4c40e7c56e1788d9e53528725dfdf5ad5343fa1f6',
    'dabdb38875a3ec583e3a09b6bee95e5a10aa3b51ca74a05474f9452d397f28df',
    'deaa82f60d74bb38fb603b8afafbb9c1b0aac6e532aa0e258f3249b2be6820c1',
    'decdccad592287d90a650607654209fc5ee2dd34532b81dcdeb8ab6249e513b1',
    'e059994ade71be84ea64a620ba6a939feece7f282c33c8631eddc0dbfcc28cdd',
  ],
  'investigator.toml': [
    '02b3d5ff3d1a643b7ff66e45e2b61b82890554838f8d1bfd96f4569b28516a41',
    '1accb9fea2ceda78e3d1dccd0b197bb5a0471eff23a32a6b8f88fcba5f61492d',
    '2b4def5e7fd2b9c707699ac3df03669f8f93828ea1fb0f1a8c2668c953762484',
    '729b0720c2f557613a0b04d8ff880f6429f7a0e2e1cc2b47b3ce835cb953e5ba',
    '953abe9ba3ca51e640332ca0ee546e23b2d76b31c22fe17387689afbc653d668',
    'c670c82643825817039691fb6fd6c1f1aa74dc558df5d0bd972b36459e39bc8d',
    'de1e629d8e38b901c4972b2262143e6fcb0c052616bc4ae29fc873573548acac',
    'e906748b8fcb5b8e0ebb3c2aaac541345cd48ce4bcb417c23bb2d8aadd4c94d5',
  ],
  'issue-scout.toml': [
    '04ba7f1a9973ffb9e5bb2d59441fe7b8801b9847131d1943502b2b6fcf40e69b',
    '0f7ee2a8e140ce9c83ffd1edceceac7d74af7b63032733d0b21ad9befb3aad15',
    '10c4c65894a28162e5c7e4d8a9e8d336bd3ec376f7506d0c2c9ca794c36bbbe5',
    '18c838c06ca8569ec681f3f6201f2c163ce760a89ca84df03ae12bccd442f384',
    '33b1c99177d1ede2a4277f08e75552a51297f75ba4d1a7627a27008ba802fc9d',
    '647ecc21e893839c9f4bf365753ca0218ce77b09b1bcb5b7df3205b538c9e858',
    '69f179e26ac90c98d9056daeafd571d140a44b8dcc4db72b4ca2930e34b5ef5a',
    '83f7efa731066290c9380f3000bcf0eea50f9a50de7145b245428ea391e11601',
    'ccae591e483b58fc9b9b8a7db9b7970efb33d290c4934c4e98840a46904c162e',
    'd5fa492f8fcf432b47c9c75b898a59cb9800f25a7eac699b19a38a1b0773a69d',
    'd7daac5e2014cded33d07b9b1d6cf4a3010d71da3a29627a29f09e7612906e3a',
    'e2d4dc96776c308381c6c9410ec92f27f4e3a7660e40c63b16f476e9a41151c4',
    'e326e9a89ec99fd43791d7e70f58314e8468871f8b6db9885c2173efab48aa6c',
  ],
  'knowledge-lookup.toml': [
    '0706acc1f06dd0ef45deb02f101a671d9c1e0c9a521fc8f5f2a22eba46ec2ecb',
    '0b08ae1a328524945c41ed84886b383ff222cbc61207c915ba72f91132778bac',
    '0f20f7e1a266060dd444e2c3b45962151fb301730983d638f65f3fc3bbd16901',
    '25d291f45b151d9f3b18497d524e31bc7fe7de937c9c22a206d79128932d3389',
    '3eb6112d0b882e28b3be99205e0a8a3fa26de8792a4701071a3051d7a4f14440',
    '3fd57765f12a6ff58fd62bd5730e83b9b08fc189810ee711b65e027c2ed40cbb',
    '5204fd28278837454733978ff9949e72234657f6e4d5e7616a4265f04c091130',
    '6c52eb14b268812753f1eb07a432fd2b82d9d8bda193f4c228deae90c9d96c4b',
    '7cc9dd9b7663c4bdaa4a65b9778a0e779ad0b5f502d1a31bada2016bddb0e8a1',
    'ac69af9aa5087decf94338848a121423f90f95d8b9e0150e451a104e0440de6d',
    'b30bebb386c8d57e87f5a8e8b3f4caa8ffa4e500b9c4d3c492d9e5c1ab35c682',
    'bc72313be8a6e729617901df47cc44945d78633608d516a73e0f3f95139b1d67',
    'cc1acf5edf310b0957af21c1fa98dd33d15d9494b0878ca422b6bb1de75dc9d1',
    'e9c6bc77c287f84a271dd8bda06ad82b47a356364035d2b02e4ccf456406066f',
    'f4e71d8d82dee6a773593a3585c337a4e5b78d5b466afca2e62107ec903cb1c9',
  ],
  'metric-optimizer.toml': [
    '099a1ea34291ddde2d03705bdd3c7b4ebfc7bc7c3363c44d1b467f5b71d5cf37',
    '1997eda5769a891427168640b7d20a5fda9752d6c218a686dd50d679bc34d237',
    '1eeb7f8395a5efe9932fe3f23b7241e6973b2424d65efa2a5d3d39954d49618f',
    '6a24437c1836ab64980532544c86529fd06b3fa817f2c6836604809eef5663fd',
    '9aec459cca3b4ec862066c284b836aee689f1ade57b80be740b0865d49400f93',
    'aa5b160d37819a3c11422eb36c98b30890e83de3f30f6a9e7704b3d7a4196141',
    'dc03ac1cf1c7347833d5a5de3cb8c3bbbc6fe22526ad0f394acd50e7c2405aa4',
    'e652797a5324c77b159db7bb93089992adfe4b8a7ee662e3a163ff4df170aa80',
    'e7829634c33d30e4b81c0cca7840f0be1b911e0f16ee3e2193da84f5f538f9dd',
    'f35bd2640aed8fe53b14fd9af4e9aeb7fc468664734b1ab91f681b2781dc25b9',
  ],
  'planner-max.toml': [
    '40eeeee2418bf290cb3e559fcbd5514c209a00c573b3973cfa8fa182f7120a8f',
  ],
  'planner.toml': [
    '1d64cd92e02115939ded7e445adc25737b2cc234d6aa02aa6ae2eaee6ad7dd54',
    '2e3ba53ca3c3b71a95eea2d4144f451877b31d84744ded5be857d6a9543d3d37',
    '42525bf2af66d1cba82c92b1533138277d4f6f08c8eb2dfbcd208a64758c4d69',
    '4b48be189898b97c881e4c2a6b3131ec13bca28d8bbf876606b9d82a9ff48874',
    '53dbf319f323ac50eb161aa8b7388c33e44e7a469d941e32a4b69e80f168e075',
    '6c682bf5e2882f143c58a9750ac997d206ae778d411b86fff0182ffc2a422e7f',
    '9c35a088ed1690dadfd3aa46406ffad92a4021b4e464e04cbe716a7366989c09',
    'af87c5ea4696ef323ad695360cf9c34af4991a0b4a3449d50358762576b411dd',
    'ba3d11ab582c2c101a7e56561873e0e863a5a6ab8f721b474d98cefded462137',
    'c1775d392008d52ec0625a78f2cdf4ba692e964362071a7f8744eafd51a625b1',
    'c413fa7c2d68b025fec8e55bdbca57dcf68aa70e914c9e6db8b8017a25e98903',
    'dbb6036ed8bb33d7d72a5163503ae05fe7188d54f277d0e5e20ed07692cbbffb',
    'dd5efd1c34578aa472c0b85750c06a89ca5ca99a052036da7917a5d154dcda42',
    'dd9c4250898c17848d96329bc0fa565c37f1c0f8ab2397e1a6c4de825f221de7',
  ],
  'security-reviewer-max.toml': [
    '749b7b89c16f07f988d6dd2e95c412e4ec6be8fa64beb0f3dba9ef3bc4a5e5dd',
  ],
  'security-reviewer.toml': [
    '03c4b8b03ed3a710b7d78b2c1e4723835c9d4cd7dbc6b4137be2a705cf25639a',
    '1ad06e49731b7a5c02905232f24b67a086d4edf69dc2174e668365165df79dd7',
    '2e80aa42531d5eba74252c221a9ccd5c9a21519b5a80ce77d708cffed4cbf89e',
    '33ad2380e787ebf42584c8699d42e8c3cd6dc152894e8c613937753816b97601',
    '36928ba3f075f2f0b3ce8ac37eecef791b003c5db8c34eea0022770f6c16fb53',
    '37348bef30b2f5558a9d00d56f57c1ba794c5dc2c2287d8b036799f2ae5ff9af',
    '46b894820e479a5ee344a36e152b6a2210c5525f607cbdf5a0dd2116e9a763d8',
    '49cd1e63d7d85421bba3c4a1a4b76b806aa51442d9235cb5296e7b399a89c8cf',
    '6d50ba55b92801e97ea333c14bb15c5d94d1dbb472c51915ea76bcf48c1b4d4a',
    '76c530390f7fe5935420aa06c64d8d3e486c1d2e46087892a256501523558869',
    '7c77e0d3be2abcf2d1e74f8dbc2e6c2975b5fca0e1725cd933747a28284ed56a',
    '833c1675053bff0777d7159db916166a20fdcbec6a9386edcb6b4a6af32c8bbf',
    '8a2c843cc7fb64d6c7d6a90c1645428a308a9935971a4619ddb5f4118b4d0d91',
    'a144fed332e9673551a66760b23446454f9164c761b04498cf6078143107c45b',
    'c93fca72c0e153d0b98dca5e47428011bcdcb999105e7b4515f0429e72ffc623',
    'e62f6e19c04f3cfb1727e89fcf7096c552f4a5da28b815c28a33baaf7f271b9e',
    'e753d09de708614d2eeca07e436cd1785552ac26e55d1ff600bb7e1b2b3c240e',
    'eede7a5c5dd0736b3cb95fc0298f901c8e43b4e9a76e065f1f08c1cca2b5062c',
    'f36a765e585c6024800abbe642c6c9059b6aa7e592d48c9b1c6612ab08022baa',
    'fac710953b02c61177273a63ec79c0c067f40f22736369b6640fa16e32ca75d4',
  ],
  'synthesizer.toml': [
    '1d5c04310a953154ed40b7beda0a7ab2253bf4806c63df18f31b85ccfae702d5',
    '1f881ab969c40b9aa94a84fda0223f4125e6dffb0647daf6fd7245e1b6d98c74',
    '27e1ad0acc304bbc8708e7a757ab7ce927ad1a6bd97d0d3657e089b8a9ec7c82',
    '4898eb007cd4821eebd27545ddc2c4efc869745610d41facf55eec0a517a8d9e',
    '57254915bd4e0dd4b1092f87ec0a0428529d1908f23d2f033200a82f46b60cbb',
    '61cdeb86bb7082e45f1f60f19fec3f18fab60753eae59dbb346f4aa154860b9d',
    '6a3418cc9a5d753915599c162ce03b8fa8bb964ae58d4ea245c2d698dcf10148',
    '8cef995acdcbad8a66e6e40de685171d10e2278cae991c50dfb516b4778dec4f',
    'b9b6060f6d2cac90141362e824f2ca662246e59447cdcc0c6a2d1488609ae069',
    'be2d5444354b627bdb8b5778e91e9c020d9bbe0f0832898f1a2db3b603d1d541',
    'bfdbc4b59d68f77d042baff4b972b8b03c350d06496dc82c7c8e68c861611067',
    'd0ef524c84a75bad1dcaf23db659b139a0473616d614da74b1e8983fce1ce4e4',
  ],
  'tdd-guide-max.toml': [
    '11eaa8a89b0835ea493d3eff8b1d8a4898434aab04ea54b4d3c2be9a87a3fcf7',
  ],
  'tdd-guide.toml': [
    '1eeb89ff375e630f4273de2d79e2bbe84b3ffab6b2125207069e384766cb9be9',
    '2452a2ccc4bc05b79d6a51c6ce1e36f0d312aa7e629c0c8adf7a1f0133560aa8',
    '293a38bd6c076f9785b5be816424deb1e9b3f46e67a392ac8086cf8156a4d526',
    '30ec32b284ba42b8f9938e3522d8cf4b2d7acb7c3743202598b8be070cda482b',
    '4b2250cda1bbe03544f81cbb628a5e66b558b765b1200a238b99bdc3ab519380',
    '4d47ed5d784a54c7c4532a3f42e51b92f8f04371c9f47dbf6d32829a53155490',
    '4dabbbebb4ccf7593ba84579e6fa3ea8ee2aac958f427fa979af9efa39496ebc',
    '5ff79ef0a504b5f80cdaa0ec9c0b914ca9a8f2855fcb5e935437bec4a57e4220',
    '70f3d26303fdef0e327e142d0c8412ba89906073ebe5625823bf627aa27d67d4',
    '797f46c6a5a8e4ce9347bdb2eba8074de5e7cbbf8cd2b5f4ef47c35a0c1105d4',
    '7fe8d21182984b02d388482dfdc349398ce828fa31813cf257e05e5bdb764d4c',
    '81d3f4f2f1100e127986c5a6d6040b8b4a10ea6d8a67fc19046ea6a8796dda86',
    '9cb94d2e7643626a8782a19610e63d76190a7a0f6c963ec884c101c482c8458e',
    '9e413cbbfe8225efb3734b285bf576b2e4290ca433ecc23dac3ec963f8975b01',
    'a4a4571e8dd4b5c164fe63ee91e3451f9fee1adea80435adbfb7d04682e79748',
    'a918d4257303d405b64787148164a2c265db1c932e236b99eb5c66d18e7182ff',
    'a9f31712ece5f0ae455ea0bf9350ab9d6a93adb1a677fca19499567cc8fe0993',
    'd25ee987800edca9ebb2b4fdf9b7fa5ee776cbeda835f2be0e745f1c531b8f06',
    'd94e89622f53b2673b498b0697fe2c56f49638a067436fb1f57b623de2967184',
    'f68b9b2afac51f673b60dcb25d1c876985cd522d62bd5c7bdda54b87b4c23fa0',
    'fe6010a74ddf8e8c1f6ae926ad5c1695b7a434c4e5c9bc9288406573557ed826',
  ],
  'workflow-planner.toml': [
    '03eeff98151b59309b81e2dda3352795917f3efb6e28a6674a3f0ee598b081dd',
    '091eb73e3c0bf282d724dc2ff7ee11176307182f43803120b0a5dd22d8587448',
    '0e1d28df79544847825ed0807269f2686a2d607b25414ed0c8a959bbfda3c9df',
    '107693cc0746b83bd9bc0694a8ddbe8fb0aec48326f84a00afa84bab4e82f9ef',
    '11eab4a630df11c6c594162d2fe699d0e2fea0b368394fa15b4cfdcdaa1f3ce2',
    '1200ab5c7cb556f495cb06d901d7addeff9f62e98032b663cab73f05f6c883b5',
    '146bd26a7e5b65472f8ed9be47586a0640efd8de682a12048fa4763360cde4dc',
    '14b536b9cc3d5a46f3791060b89e967470a1ed9bb798d1e704a423bf71f9aad8',
    '1593e5685ed218c43cb069a6430f7c6310b3141b86baa06415232dc7a01e0a7e',
    '16e9e20367daea36286cd39ff7bed4eece72ed6c6b50d53c2d4c49f0a8ade09a',
    '1930f6de0e48b60b470d58b98c81e840f7d3c1dd9bda51e163be092796953f28',
    '2052800ae340d0dd8dfd806f79094ffaf01c9aa9b108be687bb6ab6f4fbf682b',
    '26ca2aca9fce4477cb99ef21d1b6944226b0958cde6c7bb29caabacdc8a1daff',
    '278145c5b418b1cdb65341dcdb525590439dd673b6be480c2ffeb50859e4a1cd',
    '2961f8adc6fa34e286f0fa42eefa6b90ffab72be854eeb496bf9c284f6757ce5',
    '2b778bfb00c61e9bedc930f4649f7da363a9c77473a13e5cf5afb066c0fba0b4',
    '2eec523bd0c6f138c7f1ba18e7a71dfbe00fd6eaa25d7c396d8c85af9ce9fb7d',
    '307f03c52b1f3f143dd5defd6668fbf36834ba508a4288d03c0b158b935ffcf3',
    '31007f7e4b65395657f13a94af0bd6086b3fdf8a7fffd83e3ecfa8a91fad23e5',
    '322007a77c995677c763162ea478dd46f7aacac858b2836dddcfaff1bfc7fa5c',
    '3e16dea6e933f8f7afe1f31afafe448edf91bc146ca01f19843cab7ddf11df7a',
    '3fcc6a87c64a3709bf810c6533f532d4d5b2f0adf3e19013a74c15eff2b52c84',
    '4060043fbd4e561820b6fb58754d4ce97f0c338bbd077363133e7b4a2a7fe931',
    '40aab136b024e3c640635b82f78d7c2f65d78030ab39575e5316be07bdf7dbcc',
    '41bee03613b23794b34d70b33478d21b4c2260ad6a52ae9e13beb5d80f803fa8',
    '47bb225fe2d39d6ccdd8d02a01c539dfacb5ae3fd53184e504eed41f43cf4907',
    '48408439161542ae0f29d3e2d20e8da70ec2bda0d21bd9ebf8364ac1368795b0',
    '4b991216fe09a02c9ab415bb1ccd7dbbaacf2ce4e0ab1eab259d49bd0dc0f134',
    '4bad34b05e77efe02f54787b9eb679e44aa1d7f7b61ff144bd181152555affb5',
    '4c6bd8faa80a0a1050366a4381ea2579219ce083937c50cd038bab6c42504909',
    '5bd0bb5ba8639d6c7079a5cf59e968da238a770159274d484d2dd9f2dcfa4dbe',
    '5f984fafbc46657e01b02d0da85b20a390c7d12e364ccac0190169caca47fe47',
    '5f9d4e6487f706ec4e15f7989a6fd885112923940c3a2bd9742dcd09f783d689',
    '612ee57e3f2fd0f8c15457adebf2618e7a885aa915874e8ac1aa9ae7b25f40f4',
    '641ae0dc106a680a2ef7f9c36639f1086668f1ec3517d84767a0188c2841dd18',
    '68e0d3b02953d9dc9063a877b117700196f17d8ba4ddd83819c9a2b2a8423dce',
    '6a4f8c3f54685fa3ee5c4e4e1e357d7d4bdbac9abfc0d8d2283169ade00563b6',
    '6ef433f8607ce93b161c31870d41af16083e51e70d0596f8e588933cf6ddc0a7',
    '78f358bfa2a34fd0b1d43564a35a737223f381833d448c13f9a5b9033a6787b9',
    '79276b8926e0e99e71418c76d98d9d65f428f420695e2f0478b5be60ba864a0a',
    '79cb3b3feb58cc614656a15d2bb0f0c035999284e9735ed6387ab3f2513f62f4',
    '79fd543149ca4e314f1d8ef118668eeef348b8b7c7fe0d194bb1fb6e53bcdbb3',
    '7e55998fd457a4fead2e101d4e1a8c53c40f94f03301da881c1577463e80f672',
    '87e3a5e508b47e329d9bb85f25da18f94621e04ba2c313235aacbafe1d53c9bc',
    '8d1881981a1b4c9e25323f08a89a59031bc66997f5498720c4d9d8e8e7340e69',
    '8d7d7e35b1d3037af39bca9f918394ecf80899291dea86d7ee75cb7f4575691a',
    '9cecb51a993efe8b59a9e71622c8ae8e14223315d6c92bf87e53c8518e0be9f7',
    '9f46bcc38c4f7d6290445e73930a1ef36239dc132cbfb4dadf424478dfd67531',
    'a2c58a1320a0d1dfb85f6d453162696faa5a4847ffef02713904f167b6c0471b',
    'a6e70b12687e02e980bc5d0f3dcf67da2cbaf8c3e3cc91970cd57c69485ae839',
    'acd99c5991b3a2bbaa058d0e0d37966ca42506480c934bef2ec17c1715a8f53b',
    'adedc1c8506d3451cbdb93e79ea62f159dfb2a5c798f73c0d26d3ace4e9fdcc8',
    'ae34e7f8cc962922dcca6ebaea1da5965a8a6bc771030bb825e451cb127b2a47',
    'b1e5bad651f8d42508efb1e953014dcc028929aea4226e2ac7bc36a7dc7cd38c',
    'b1f3d05837fab2d889a1c72769bde2e5b409e912e87ebb93c7ae10a395b6d45e',
    'b853bff91f3aa5608c7f0e785d11802f5acf919a82c2c855e00172fb80eb4035',
    'be5e42269f0b88241cf66b70a7533a670e6f1b013868f1cb66f7a3494ab8ad73',
    'bf0e912c7ce3687c42289a9e996612ce08e808eb5b8aac81e3df4218045d9f0d',
    'bfa1fb0369ade60317b370398a2fd8d5fa746e6fb727cd7644be3f8df56b53c5',
    'c0d7f9368bd79760d4281f1a1eb5faedeaf3f02c329ba659153475cf65fcce1b',
    'c408dc9fc4414039f63dad1723ab5367f3e4eb8835aa776b8dea6235bd4dab4f',
    'c516f16feda27b657cd92a3cc98632e84b4e0132cb7be9a120569a5d009c8f32',
    'cf728ed7e9e1f929cafb6c68fa48a39ae379bc78f4dab7f0ee55713948061845',
    'd98ed7782be86d8b307372c9b3746dfe90c115e08a9a1eb2ddd9fe596e34a183',
    'dd93ac951000071983c1dd5c3350cad3f10a83850355fd41ca7fff10786c8724',
    'de91ea5f644a78e523aac686d097e709150f928ba30bf9609d3febb07ce00854',
    'e068612f0ac8d8b96f5f12d7d733c7b6b573a38ed22b08bbcbfbdd7e361a8390',
    'e18b8e06374cdcb23c02e2271d1cb5b42fc181d199be8d231662f46195515bd9',
    'e40a5e28966c011142c88b6eb1e03ebdc9ec0f929d8c45493918a3e3b4df73c2',
    'e454eba1b60c2947afec54efe20eb665ecb1c47e46d41cfdce7c687e91da5591',
    'e72e30837c80314ab50dd33caee34a68aec4c5d7cc286e967dacffb736da148a',
    'e8f38e2143c081b53d48e5df1b927db58c673c50171fa61f557aa4cab2283427',
    'f0efb7925b516bc1a56d5aff9cbc97841d0aaff4037ff45413c6d2003f832fbe',
    'f1de88ae46dd81ca457df469092cb036f9b1be0a5812374998ba8093dff7507d',
    'f63f828e0adae2a43fa99ccc8a19852f0e3e7e8327b8c30beef196be5bc2a3ea',
    'f844d33364e5cff4527a6b81ed6ccac58791e0e312e5ffbe37e195573f62b9bb',
    'f998aabeed68d02e8aaf9830e0fd17ad4feec157fd39b0523b9a6b8d138fa520',
    'fa91bc70e1c7ed23f0cb8a36333aad4ebe70aa819a022f7baf271b874b8ab5f7',
    'fafd5fb34fcf085c01b3ee25207a99b13a2e0ca380fef5b551906ce4982af7cb',
  ],
});
const RELEASED_BLOCK_BODY_SHA256 = Object.freeze([
  '125e2437eca248370b56a7129a5079ea50184c3ddc516252b6f79589fd1c62d1',
  '18052e4f53f6fd3beab2b6704a190b69524673012fcba51356b5ee9d5a5b6417',
  '199fa72fdce26eab6b62d9317727f7f96dc54b5dd9afd1de6d12ffa4bfc926cd',
  '1c7280ae17f417daaa36d99701d7fd8b598c87dc87e30982ec79db9670e3d817',
  '24ad7cd86ec715bbd911a8658213fd7bcc85c1e65e3d7c4458bae7b16a9160ac',
  '2d73d733657b3bb2e220def0df4561dbc50ab3b87443efdb318fcc4da5d2ff40',
  '338fa6d13a84a62e506f3a60ad19e26c3f882596a8d99addd2cdfe26667a4b5a',
  '351f111de217f49fb5ae60951651d04a8d2a9150dc5e08817295598c34205486',
  '366954f8ee010ad41eb08fd2b6ffec83abe1a9e1768f3d119bb77b522678b3a9',
  '46cac84edd538d9abc95fbeff588601e05104363a11dc3b9a10e3337ef50c8ab',
  '4963dd05dbe6fb6174ece4ebd769269a39ad3a67f9daf5891662ad2d733f9b6a',
  '4c28b9c2a026f8c9b8c745739e3a20be700cea791c34ac58441bd74dae7c4114',
  '506199efc0cad9424c0fb1462c3b093b894235cb50b07d3e272e48211132c980',
  '50cb4568871d1230c4c7f9bba9f0d4e2e4946a5d44bc4c48d256b29b9be2c48c',
  '527c0de185182906e9e0e603544ab705870c71f37a5b1e064f63e97340b2a4cd',
  '5d07ec3b7702c9016375018fb638b0a662079e64d8e3662a0c9e37838cacf5e4',
  '63c161ba753113a28c1d6259eb491a9d13aa45492d37557b46efc85297e4cc3a',
  '64337de457039bcd9f010ce3c36e62429702513cc76247e410c77fba05b3ba3d',
  '6cf8c335018713a011b8aee12e8c9f21e40becb1ed123d2ce568777ddabd7a77',
  '73144a362a6ca9831aafd254072e43bae9372e31848a9f3527b5e9c419bb335c',
  '7328b92a7318c6680f0defc4f8cc8c218bd79f1f1668c811ca22bd1e89a303e5',
  '7ce514c9a2841cc9c6bdfbd72dea708572a960dbd71d58323c8c2a28dfcf8311',
  '80b290427e168776467bb24c339795d2aa1decd19e640e2defb35afbc14af54d',
  '8580079b7c75724771daa55058ba11ac744a2ad36bdce51c622142de1f54f286',
  '89a52e0fe14e91205ececa85a4ac905c7eaff870e059ad2beb62811ac5abcc8b',
  '8e286b48dd5f45e9e07161d87646b0b9ca656f077b48841dab96a6ee1a3bd6d9',
  '91a54202308d30a8e6cf6736b3f81227f4ec23b02c3c9b54af4d341842510a54',
  '91b53ad00f059f68d75be943979e12042a76f02ffa0265f2f04eb0f969f459be',
  '95e119b51b3e3a0c3dab014c1ed83106e228881f4f28fe82b167e8cd452309c4',
  'a46befbc06dffc8f44de7a9af853f4eba90005192851a5e85ee694f819bf7ff1',
  'a93e3b3918611f0d765d2a59827ea7b81696d23319b14121e43fd1f10d5752a7',
  'ada6341f2d85f687490f55050d18903dcdc21f26fcc393b3fd524a4282bf474a',
  'c1cf2c11df7b5030ccb3adb0fb99a4be350e0ca4e63152bcf271e640081acbb0',
  'c3576633fe37a2d91fb9df97c3f73ebaf59ad755e9b465fa632928e830d3a248',
  'd0add74b224609de30f4bd86f1bfc14cda988a1488db60841444f4a01b2370b9',
  'e49addf5d5c6675e6c58587ef8b4b8a4c89654aa6e58b1c27d7171c288da312c',
  'f04c97faf53ef675d3b4f7c012264560eafce1298714ef79193b73849cb163ff',
  'f084ba28521a6a90c26ef2e36d9d274d6728e6d164f72d8327f0a6e28fdc4b28',
  'f5f8dbc3861078151d1c28b2ee7a609674fc7b50f568a825b8dcec3735076545',
  'fbc37f17995201de50944a1871c7e655ff01253a107ed9e6d7229be07428e0f6',
  'fc9882efec50a4024eb052cc357310bd60aa5c30ae1dc1df22ffafc6c69c1c48',
]);
const hex = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isPlainBasename = n => typeof n === 'string' && n !== '' && n !== '.' && n !== '..'
  && path.basename(n) === n && !n.includes('/') && !n.includes('\\');

// Decide the registration block of one config.toml without writing it.
function planConfigRetirement(configPath = targetConfig) {
  const st = lstatIfPresent(configPath);
  if (!st) return { state: 'absent', text: '' };
  if (st.isSymbolicLink() || !st.isFile()) return { state: 'non_regular', text: '' };
  const text = read(configPath);
  const range = managedMarkerRange(text);
  if (range.state === 'absent') return { state: 'absent', text };
  if (range.state === 'invalid') return { state: 'ambiguous_markers', text };
  const body = text.slice(range.start + beginMarker.length, range.endMarkerStart).trim();
  if (!RELEASED_BLOCK_BODY_SHA256.includes(hex(body))) return { state: 'mixed_managed_block', text };
  return { state: 'retire', text, next: text.slice(0, range.start) + text.slice(range.end) };
}

// Absolute paths a config text registers through `config_file` (relative to the .codex dir).
function configFileReferences(text, codexDir = targetCodexDir) {
  const refs = new Set();
  const structural = tomlStructuralContent(String(text || ''));
  for (const m of structural.matchAll(/config_file\s*=\s*(?:"((?:\\.|[^"\\])*)"|'([^']*)')/g)) {
    const raw = m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2];
    if (raw) refs.add(path.resolve(codexDir, raw));
  }
  return refs;
}

// Read the ownership record. `readable` is false for a record this installer cannot vouch for
// (symlink, non-file, unparseable, future schema): it is kept and reported, and proves nothing.
function readOwnershipRecord(agentsDir) {
  const file = manifestPath(agentsDir);
  const st = lstatIfPresent(file);
  if (!st) return { file, present: false, readable: false, rows: {} };
  if (st.isSymbolicLink() || !st.isFile()) return { file, present: true, readable: false, reason: 'non_regular', rows: {} };
  let doc = null;
  try { doc = JSON.parse(read(file)); } catch (_) { doc = null; }
  if (!doc || typeof doc !== 'object' || (typeof doc.schema_version === 'number' && doc.schema_version > MANIFEST_SCHEMA_VERSION)) {
    return { file, present: true, readable: false, reason: 'unsupported_record', rows: {} };
  }
  const rows = {};
  const unsafe = [];
  const files = doc.files && typeof doc.files === 'object' ? doc.files : {};
  for (const [name, digest] of Object.entries(files)) {
    if (!isPlainBasename(name)) { unsafe.push(name); continue; }
    if (typeof digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(digest)) rows[name] = digest.slice(7);
  }
  return { file, present: true, readable: true, rows, unsafe };
}

// Retire one scope's profiles. `referenced` holds the config_file paths that must stay.
function retireProfiles({ agentsDir = targetAgentsDir, authority = projectRoot, referenced = new Set(), apply = true } = {}) {
  const res = { removed: [], preserved: [], recordRemoved: null, warnings: [] };
  const st = lstatIfPresent(agentsDir);
  const problem = installTargetPathProblem(authority, agentsDir, 'directory');
  if (problem) {
    if (st || /symlink|not a directory/.test(problem)) res.preserved.push({ reason: 'non_regular', file: agentsDir });
    return res;
  }
  if (!st) return res;
  const record = readOwnershipRecord(agentsDir);
  for (const name of record.unsafe || []) {
    res.warnings.push(`warning: ignoring agent record entry that is not a plain file name: ${JSON.stringify(name)}`);
  }
  if (record.present && !record.readable) res.preserved.push({ reason: record.reason, file: record.file });
  for (const name of fs.readdirSync(agentsDir).sort()) {
    if (!name.endsWith('.toml')) continue;
    const file = path.join(agentsDir, name);
    const entry = lstatIfPresent(file);
    if (!entry) continue;
    if (entry.isSymbolicLink() || !entry.isFile()) { res.preserved.push({ reason: 'non_regular', file }); continue; }
    const digest = hex(fs.readFileSync(file));
    const recorded = record.rows[name];
    if (referenced.has(file)) { res.preserved.push({ reason: 'referenced_by_user_config', file }); continue; }
    if (recorded === digest || (RELEASED_PROFILE_SHA256[name] || []).includes(digest)) {
      if (apply) fs.unlinkSync(file);
      res.removed.push(file);
    } else {
      res.preserved.push({ reason: recorded ? 'modified_since_install' : 'no_ownership_record', file });
    }
  }
  if (record.present && record.readable) {
    if (apply) fs.unlinkSync(record.file);
    res.recordRemoved = record.file;
  }
  if (apply) { try { fs.rmdirSync(agentsDir); } catch (_) { /* a preserved file keeps the dir */ } }
  return res;
}

// Pre-rename leftovers carry no record: report them, touch nothing (#1101 H6).
function reportLegacyLeftovers(configText) {
  const lines = [];
  const st = lstatIfPresent(legacyAgentsDir);
  if (st && st.isDirectory() && !st.isSymbolicLink()) {
    for (const name of fs.readdirSync(legacyAgentsDir).sort()) {
      if (name.endsWith('.toml')) lines.push(preservedLine('no_ownership_record', path.join(legacyAgentsDir, name)));
    }
  }
  if (String(configText || '').split(/\r?\n/).some(l => l.trim() === legacyBeginMarker)) {
    lines.push(preservedRegistrationsLine('no_ownership_record', targetConfig));
  }
  return lines;
}

// Retire this scope's profiles, record and registrations; returns report lines.
function retireScope() {
  const lines = [];
  const plan = planConfigRetirement();
  let remaining = plan.state === 'retire' ? plan.next : plan.text;
  if (plan.state === 'non_regular') {
    try { remaining = fs.readFileSync(targetConfig, 'utf8'); } catch (_) { remaining = ''; }
  }
  const profiles = retireProfiles({ referenced: configFileReferences(remaining) });
  if (plan.state === 'retire') {
    fs.writeFileSync(targetConfig, plan.next);
    lines.push(REMOVED_REGISTRATIONS + targetConfig);
  } else if (plan.state !== 'absent') {
    lines.push(preservedRegistrationsLine(plan.state, targetConfig));
  }
  lines.push(...profiles.warnings);
  for (const file of profiles.removed) lines.push(REMOVED + file);
  if (profiles.recordRemoved) lines.push(REMOVED_RECORD + profiles.recordRemoved);
  for (const p of profiles.preserved) lines.push(preservedLine(p.reason, p.file));
  lines.push(...reportLegacyLeftovers(plan.text));
  return lines;
}

function main() {
  assert(fs.existsSync(sourceHooksTemplate), `missing source hooks template: ${sourceHooksTemplate}`);

  // Only the HOME write targets can refuse the install; the scope's .codex is retire-only (H9).
  const unsafeInstallTarget = validateInstallTargets();
  if (unsafeInstallTarget) {
    process.stderr.write(`install_target_unsafe: ${unsafeInstallTarget}\n`);
    process.exit(1);
  }

  // 1. Retire what earlier releases installed in this scope (#1101).
  const retirement = retireScope();

  // 2. Global compact hook + its version-less hook home.
  const { status: hooksStatus, stableCopy } = updateHooks();

  // 3. Summary.
  for (const line of retirement) console.log(line);
  // #447: hooks are global — show the global path (relative to HOME for readability).
  const homeDir = os.homedir();
  const hookPathDisplay = targetHooks.startsWith(homeDir) ? '~' + targetHooks.slice(homeDir.length) : targetHooks;
  const stablePathDisplay = targetStableDir.startsWith(homeDir) ? '~' + targetStableDir.slice(homeDir.length) : targetStableDir;
  console.log(`Kaola-Workflow Codex hooks: ${hooksStatus} at ${hookPathDisplay}`);
  // #409: report the stable hook home so the user can see the version-less copy target.
  console.log(`Kaola-Workflow Codex hooks: copied ${stableCopy.copied.length} hook script(s) into stable home ${stablePathDisplay} (swept ${stableCopy.removed} stale)`);
  console.log(`run /hooks once in Codex to review and trust these command hooks (or codex exec --dangerously-bypass-hook-trust for automation)`);

  // #598 AC1: REPORT the effective dispatch posture. ATTESTATION-STYLE / NON-FATAL — this NEVER
  // changes the exit code. The installer never WRITES model_reasoning_effort (a user-owned
  // cost/latency choice) — it only reports the posture it reads and, when non-proactive, the exact
  // remediation. Printed BEFORE the final `status: ok` sentinel (installer stdout ENDS with it).
  const postInstallConfigContent = (() => {
    try { return fs.lstatSync(targetConfig).isFile() ? read(targetConfig) : ''; } catch (_) { return ''; }
  })();
  const dispatchPosture = deriveDispatchPosture(postInstallConfigContent);
  const effortDisplay = dispatchPosture.model_reasoning_effort
    ? ` (model_reasoning_effort="${dispatchPosture.model_reasoning_effort}")`
    : ' (model_reasoning_effort unset)';
  console.log(`Kaola-Workflow Codex dispatch posture: ${dispatchPosture.dispatch_posture}${effortDisplay}`);
  if (dispatchPosture.dispatch_posture_warning) {
    console.log(`Kaola-Workflow Codex dispatch posture: ${dispatchPosture.dispatch_posture_warning}`);
  }
  console.log(`Kaola-Workflow Codex dispatch posture: ${DISPATCH_POSTURE_VERSION_NOTE}`);

  // REPORT the effective MultiAgentV2 concurrency + wait-timeout bounds — same
  // ATTESTATION-STYLE / NON-FATAL treatment as the dispatch posture above. It reports STATE and
  // names no cause for it: detectCodexDispatchMode reads features.multi_agent_v2 only.
  const v2DispatchMode = detectCodexDispatchMode(postInstallConfigContent);
  console.log(`Kaola-Workflow Codex multi_agent_v2: ${v2DispatchMode.multi_agent_v2_enabled ? 'enabled' : 'NOT enabled (see codex_multi_agent_v2_required at preflight)'}`);
  const v2Bounds = deriveMultiAgentV2Bounds(postInstallConfigContent, v2DispatchMode.multi_agent_v2_enabled);
  if (v2Bounds.max_concurrent_threads_per_session !== null) {
    console.log(
      `Kaola-Workflow Codex multi_agent_v2: effective subagent width ${v2Bounds.effective_subagent_width} `
      + `(max_concurrent_threads_per_session=${v2Bounds.max_concurrent_threads_per_session} `
      + `[${v2Bounds.max_concurrent_threads_per_session_source}])`
    );
    if (v2Bounds.min_wait_timeout_ms !== null) {
      console.log(`Kaola-Workflow Codex multi_agent_v2: min_wait_timeout_ms=${v2Bounds.min_wait_timeout_ms}`);
    }
    if (v2Bounds.max_wait_timeout_ms !== null) {
      console.log(`Kaola-Workflow Codex multi_agent_v2: max_wait_timeout_ms=${v2Bounds.max_wait_timeout_ms}`);
    }
    if (v2Bounds.default_wait_timeout_ms !== null) {
      console.log(`Kaola-Workflow Codex multi_agent_v2: default_wait_timeout_ms=${v2Bounds.default_wait_timeout_ms}`);
    }
  }
  console.log(`Kaola-Workflow Codex multi_agent_v2: ${MULTI_AGENT_V2_BOUNDS_NOTE}`);

  // Last install step (#1087): this runtime's own global-contract carrier. A failure is fatal —
  // a Codex install without its carrier is not complete; an unavailable CLI is reported loudly.
  const carrier = installGlobalCarrier();
  if (carrier.status === 'UNAVAILABLE') {
    console.log(`Kaola-Workflow Codex global contract: UNAVAILABLE from this install source (${carrier.cli} absent); run this installer from a Kaola-Workflow checkout to install ~/.codex/AGENTS.md`);
  } else if (carrier.status !== 'INSTALLED') {
    process.stderr.write(`global_contract_failed: codex carrier ${carrier.status} (exit ${carrier.exit}): ${carrier.detail}\n`);
    process.exit(1);
  } else {
    console.log(`Kaola-Workflow Codex global contract: INSTALLED at ${carrier.path}`);
  }

  console.log('status: ok');
}

// #1087 (#1086 F1/F2): remove ONLY what this installer wrote, then release Codex's reference on the
// shared ~/.config/kaola-workflow block. Provenance rules, as for the additive runtimes:
//   - profiles, their record and the registration block: the same proof the install uses
//     (retireScope, #1101) — an edited, unrecorded or still-referenced file is preserved and
//     reported, and there is no removal by name;
//   - hooks.json: only `kaola-workflow:`-id entries (the installer's own sweep rule) are removed; the
//     user's other entries, events and description stay, and the file itself is kept;
//   - the version-less hook home ~/.codex/kaola-workflow is Kaola-namespaced and wholly installer-owned.
// The global hooks and hook home serve every Codex scope, so they are removed by `--global
// --uninstall` only; a project-scope uninstall retires that project's profiles and config block.
// Nothing outside the Codex scope roots and this runtime's shared-config reference is written.
function uninstallMain() {
  const unsafe = validateInstallTargets();
  if (unsafe) {
    process.stderr.write(`uninstall_target_unsafe: ${unsafe}\n`);
    process.exit(1);
  }
  const report = [];

  // 1. Profiles, their record and the registration block.
  report.push(...retireScope());

  // 2. Global hooks + hook home (global scope only).
  if (GLOBAL) {
    if (fs.existsSync(targetHooks)) {
      let parsed = null;
      try {
        parsed = JSON.parse(read(targetHooks));
        validateExistingHooksSchema(parsed);
      } catch (error) {
        report.push(`Kaola-Workflow Codex hooks: ${targetHooks} left unchanged (${error.message})`);
        parsed = null;
      }
      if (parsed) {
        const hooks = isPlainJsonObject(parsed.hooks) ? parsed.hooks : {};
        let changed = false;
        for (const event of Object.keys(hooks)) {
          const kept = hooks[event].filter(e => !(e && typeof e.id === 'string' && e.id.startsWith(MANAGED_HOOK_ID_PREFIX)));
          if (kept.length === hooks[event].length) continue;
          changed = true;
          if (kept.length > 0) hooks[event] = kept;
          else delete hooks[event];
        }
        if (changed) {
          fs.writeFileSync(targetHooks, JSON.stringify({ ...parsed, hooks }, null, 2) + '\n');
          report.push(`Kaola-Workflow Codex hooks: removed managed entries from ${targetHooks}`);
        }
      }
    }
    const stableStat = lstatIfPresent(targetStableDir);
    if (stableStat && stableStat.isDirectory() && !stableStat.isSymbolicLink()) {
      fs.rmSync(targetStableDir, { recursive: true, force: true });
      report.push(`Kaola-Workflow Codex hooks: removed hook home ${targetStableDir}`);
    }
  }

  // 3. Codex's own machine-global contract carrier (global scope only), through its own
  //    per-target record; a carrier the owner edited since install is refused and left in place.
  if (GLOBAL) {
    const carrier = uninstallGlobalCarrier();
    if (carrier.status === 'UNAVAILABLE') {
      report.push(`Kaola-Workflow Codex global contract: UNAVAILABLE from this install source (${carrier.cli} absent); run --global --uninstall from a Kaola-Workflow checkout to remove ~/.codex/AGENTS.md's managed region`);
    } else if (carrier.status === 'UNINSTALLED' || carrier.status === 'NOT_INSTALLED') {
      report.push(`Kaola-Workflow Codex global contract: ${carrier.status}`);
    } else {
      report.push(`warning: Kaola-Workflow Codex global contract left in place (${carrier.status}, exit ${carrier.exit}): ${carrier.detail}`);
    }
  }

  // 4. Shared config block: release this scope's reference.
  try {
    const { deregisterSharedRef, CONFIG_BLOCK_ID } = require('./kaola-workflow-shared-refs');
    const result = deregisterSharedRef(CONFIG_BLOCK_ID, 'codex', {
      scope: GLOBAL ? 'global' : 'project:' + path.resolve(projectRoot),
    });
    report.push(`Released shared config reference (codex): ${JSON.stringify(result)}`);
  } catch (error) {
    report.push(`warning: shared config reference not released (${error.message}); ~/.config/kaola-workflow left in place`);
  }

  for (const line of report) console.log(line);
  console.log('status: ok');
}

// #325: export the pure helpers for unit tests; only run the installer when invoked directly
// (require() must not run main()).
if (require.main === module) {
  if (UNINSTALL) uninstallMain();
  else main();
}

module.exports = {
  uninstallMain,
  installGlobalCarrier,
  uninstallGlobalCarrier,
  buildManagedHooks,
  mergeHooks,
  updateHooks,
  hookReferencedRelPaths,
  copyHookScripts,
  installTargetPathProblem,
  validateInstallTargets,
  // #1101: retirement of what earlier releases installed (pure apart from the reported unlinks).
  managedMarkerRange,
  planConfigRetirement,
  configFileReferences,
  readOwnershipRecord,
  retireProfiles,
  RELEASED_PROFILE_SHA256,
  RELEASED_BLOCK_BODY_SHA256,
  MANIFEST_BASENAME,
  // #598: effort-gated dispatch-posture derivation (pure; exported for unit tests).
  detectCodexDispatchMode,
  deriveDispatchPosture,
  parseTopLevelModelReasoningEffort,
  dispatchPostureRemediation,
  DISPATCH_POSTURE_VERSION_NOTE,
  // #611: MultiAgentV2 concurrency + wait-timeout bounds derivation (pure; exported for unit tests).
  parseMultiAgentV2NumericFields,
  deriveMultiAgentV2Bounds,
  OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION,
  MULTI_AGENT_V2_BOUNDS_NOTE,
};
