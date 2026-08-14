#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.

// Contract test for install-all.sh — the one entrypoint that reinstalls all four
// runtime editions. Two jobs:
//   1. GUARD: assert install-all.sh references every runtime installer, checked in
//      BOTH directions — the hand-maintained list must exist in the tree, AND the
//      installer set DERIVED FROM THE TREE (top-level install*.sh minus documented
//      non-runtime entries, plus the codex installer script) must be referenced in
//      install-all.sh and present in the list. So a 5th runtime edition added later
//      fails red until install-all.sh names it, with no human required to grow a
//      literal first — a runtime can never be silently dropped from "install
//      everything" (the machine-enforced form of the operator note that let Kimi
//      slip repeatedly). A filesystem-backed synthetic 5th-installer fixture proves
//      the derivation actually scans the tree and reports an unwired installer.
//   2. BEHAVIOR: drive install-all.sh against STUB installers (via the
//      KAOLA_INSTALL_ALL_ROOT seam) and assert the per-runtime PASS/FAIL summary,
//      non-zero-on-any-failure, --strict fail-fast, --skip, and --check no-mutation.
//   3. CONVERGENCE (#795): installer-coverage is not runtime-convergence. Codex is the
//      only two-part install (agent profiles + the version-keyed marketplace plugin),
//      so a PASS that only means "the installer exited 0" hid a runtime pinned at an
//      old plugin version. These cases drive the wrapper against a STUB codex CLI (via
//      the KAOLA_CODEX_BIN seam — hermetic, no host codex is ever consulted or mutated)
//      and assert: a stale plugin is refreshed and re-read; a refresh that does not
//      take reports FAIL (a green summary can never coexist with a detected version
//      mismatch); an absent CLI / unregistered marketplace degrades to PARTIAL with a
//      reason instead of a bare PASS; --check reports the pending upgrade and mutates
//      nothing; and the tree version is read from .codex-plugin/plugin.json, never
//      package.json (repo v7.0.0 ships Codex plugin 5.0.0 — package.json is the wrong
//      number and would force a permanent false mismatch).
//   4. CONTENT CONVERGENCE (#972): equal version strings are not equal artifacts. Prose
//      that moves at an UNCHANGED plugin version stays in the version-keyed cache, so
//      the wrapper reported a runtime current while it served retired rules. The S cases
//      pin the trigger — version-inequality OR content-difference — together with the
//      two things that bound it: it fires only for a LOCAL marketplace (a git one serves
//      a fetched snapshot, so the tree is the wrong oracle), and the post-refresh proof
//      observes CONTENT (on this path the versions are equal by construction, so a
//      version-only re-read cannot fail).
// Hand-rolled assert, no framework: exit 0 + sentinel on pass, exit 1 on failure.
//
// SAFETY: every case runs against a temp stub root under os.tmpdir() and an explicit
// KAOLA_CODEX_BIN. KAOLA_CODEX_BIN is set on EVERY wrapper invocation (to a
// nonexistent path when a case wants the CLI-absent branch) so a host-installed
// `codex` can never be reached, listed, removed, or re-added by this suite. HOME and
// CODEX_HOME are redirected into the fixture on every invocation for the same reason:
// the version-keyed plugin cache lives under a codex home, and the host's must never be
// read, compared against, or removed by this suite.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const INSTALL_ALL = path.join(REPO, 'install-all.sh');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

// #975: the base every fixture root below is made under. A fixture root must not resolve against
// the CURRENT DIRECTORY, and `os.tmpdir()` alone does not carry that property: it returns `TMPDIR`
// verbatim, so `TMPDIR=.` makes every root here relative and every fixture lands wherever the suite
// was started — the checkout, when it is run from one. Measured that way: 81 `kaola-install-all-*`
// roots in the checkout root, each holding a `plugins/` tree, and `cleanup()` removes every one, so
// a `git status` on either side of the run sees nothing at all.
// Absolutising does NOT fix it, and both idioms that look like it were measured: `realpathSync`
// around the `mkdtempSync` absolutises the returned STRING after the directory has been created in
// the cwd, and `path.resolve(os.tmpdir())` is absolute at creation and still the cwd, because
// `path.resolve(".")` IS the cwd. A relative `TMPDIR` is simply unusable as a temp root, so it is
// treated exactly as an unset one — `/tmp` is what `os.tmpdir()` itself falls back to when no temp
// variable is set, and an empty `TMPDIR` already reaches it.
function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

// ---- single source of truth: the four runtime installers ----
// { runtime, file: tree-relative path that MUST exist, ref: token that MUST
//   appear in install-all.sh }. Adding a 5th edition means adding a row here AND
//   wiring install-all.sh — the guard below fails until both are done.
const KNOWN_INSTALLERS = [
  { runtime: 'claude',   file: 'install.sh',                                                  ref: 'install.sh' },
  { runtime: 'opencode', file: 'install-opencode.sh',                                         ref: 'install-opencode.sh' },
  { runtime: 'codex',    file: 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js', ref: 'install-codex-agent-profiles.js' },
  { runtime: 'kimi',     file: 'install-kimi.sh',                                             ref: 'install-kimi.sh' },
];

// ---- tree-derived installer set (so the list above can never go stale) ----
// The codex installer is the one non-globbable entry: it is .js and lives in the
// plugin tree, so it is carried as a fixed known path.
const CODEX_INSTALLER = 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js';
const WRAPPER_BASENAME = 'install-all.sh';
// Documented exclusions: top-level install*.sh files that are deliberately NOT a
// per-runtime installer. install-all.sh IS the orchestrator, not a runtime. Any
// other new install*.sh is presumed a runtime installer until it is added here.
const NON_RUNTIME_INSTALLERS = new Set([WRAPPER_BASENAME]);

// Scan `root` for runtime installers. `/^install.*\.sh$/` matches install.sh and
// install-*.sh and never matches uninstall.sh (leading "u").
function discoverInstallers(root) {
  const out = fs.readdirSync(root)
    .filter(f => /^install.*\.sh$/.test(f) && !NON_RUNTIME_INSTALLERS.has(f))
    .sort()
    .map(f => ({ runtime: f, file: f, ref: f }));
  if (fs.existsSync(path.join(root, CODEX_INSTALLER))) {
    out.push({ runtime: 'codex', file: CODEX_INSTALLER, ref: path.basename(CODEX_INSTALLER) });
  }
  return out;
}

// Guard: which installers are NOT referenced in the wrapper source.
function missingFromWrapper(installers, wrapperSrc) {
  return installers.filter(i => !wrapperSrc.includes(i.ref)).map(i => i.runtime || i.ref);
}

// ---- 1. GUARD assertions against the real install-all.sh ----
assert(fs.existsSync(INSTALL_ALL), 'install-all.sh exists at repo root');
const wrapperSrc = fs.readFileSync(INSTALL_ALL, 'utf8');

for (const i of KNOWN_INSTALLERS) {
  assert(fs.existsSync(path.join(REPO, i.file)), `installer file exists in tree: ${i.file}`);
  assert(wrapperSrc.includes(i.ref), `install-all.sh references ${i.runtime} installer (${i.ref})`);
  assert(wrapperSrc.includes(i.runtime), `install-all.sh names runtime "${i.runtime}"`);
}

// The real four must be fully covered.
assert(missingFromWrapper(KNOWN_INSTALLERS, wrapperSrc).length === 0,
  'guard: all four known installers are referenced in install-all.sh');

// The other direction: every installer DISCOVERED IN THE TREE must be wired into
// install-all.sh and accounted for in KNOWN_INSTALLERS. This is what fails red for
// a new install-*.sh that nobody remembered to add to the list above.
const discovered = discoverInstallers(REPO);
const knownRefs = new Set(KNOWN_INSTALLERS.map(i => i.ref));
for (const inst of discovered) {
  assert(wrapperSrc.includes(inst.ref),
    `guard(tree-derived): install-all.sh references discovered installer ${inst.ref}`);
  assert(knownRefs.has(inst.ref),
    `guard(tree-derived): discovered installer ${inst.ref} is present in KNOWN_INSTALLERS`);
}

// Negative proof, filesystem-backed: build a fixture tree holding the four real
// installers PLUS an unwired synthetic 5th, and a wrapper source that names only
// the four. The derivation must SCAN THE TREE, surface the phantom, and report it
// missing — this is what fails red when a new runtime is dropped.
{
  const fixtureRoot = fs.mkdtempSync(path.join(tmpBase(), 'kaola-install-all-guard-'));
  try {
    const touch = (rel) => {
      const abs = path.join(fixtureRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, '');
    };
    ['install.sh', 'install-opencode.sh', 'install-kimi.sh', 'install-phantom.sh',
     'install-all.sh', 'uninstall.sh'].forEach(touch);
    touch(CODEX_INSTALLER);
    const fixtureWrapperSrc = KNOWN_INSTALLERS.map(i => i.ref).join('\n');

    const disc = discoverInstallers(fixtureRoot);
    const discRefs = disc.map(i => i.ref);
    assert(discRefs.includes('install-phantom.sh'),
      'guard proof: derivation scans the tree and finds a new install-*.sh');
    assert(!discRefs.includes('install-all.sh'),
      'guard proof: derivation excludes the install-all.sh wrapper itself');
    assert(!discRefs.includes('uninstall.sh'),
      'guard proof: derivation excludes uninstall.sh');
    assert(discRefs.includes(path.basename(CODEX_INSTALLER)),
      'guard proof: derivation includes the codex installer script');
    assert(missingFromWrapper(disc, fixtureWrapperSrc).includes('install-phantom.sh'),
      'guard proof: an unwired discovered installer is reported missing (guard would fail red)');
    assert(missingFromWrapper(disc.filter(i => i.ref !== 'install-phantom.sh'), fixtureWrapperSrc).length === 0,
      'guard proof: fully wired installers are reported as complete');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

// The RUNTIMES source-of-truth array in the wrapper lists exactly the four.
assert(/RUNTIMES=\(claude opencode codex kimi\)/.test(wrapperSrc),
  'install-all.sh RUNTIMES array lists the four runtimes in order');

// ---- 2. BEHAVIOR: drive install-all.sh against stub installers ----
const tmpRoots = [];
function freshRoot() {
  const dir = fs.mkdtempSync(path.join(tmpBase(), 'kaola-install-all-test-'));
  tmpRoots.push(dir);
  return dir;
}
function cleanup() { for (const d of tmpRoots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

// Write a stub installer that records a marker when run and exits `code`.
// `kind` is 'bash' or 'node' (codex is invoked via `node`).
function writeStub(root, rel, kind, code, markerName) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const marker = path.join(root, markerName);
  if (kind === 'node') {
    fs.writeFileSync(abs,
      `require('fs').writeFileSync(${JSON.stringify(marker)}, '');\n` +
      `console.log('stub ran: ${rel}');\n` +
      `process.exit(${code});\n`);
  } else {
    fs.writeFileSync(abs,
      `#!/usr/bin/env bash\n` +
      `echo "stub ran: ${rel} args: $*"\n` +
      `: > ${JSON.stringify(marker)}\n` +
      `exit ${code}\n`);
    fs.chmodSync(abs, 0o755);
  }
  return marker;
}

// The marketplace the stub CLI reports for every row, and the version-keyed cache
// layout the real CLI materializes underneath a codex home:
//   <home>/.codex/plugins/cache/<marketplace>/<plugin>/<version>/
// (verified on disk against a live install). CACHE_REL is the file inside the plugin
// tree the content cases move; it stands in for the SKILL.md prose that changed at an
// unchanged plugin version.
const STUB_MARKETPLACE = 'stub-market';
const CONTENT_REL = path.join('skills', 'demo', 'SKILL.md');
const TREE_CONTENT = 'tree content: three to five issues\n';

function codexCacheRoot(homeRoot) {
  return path.join(homeRoot, '.codex', 'plugins', 'cache');
}
function codexCacheVersionDir(homeRoot, pluginName, version) {
  return path.join(codexCacheRoot(homeRoot), STUB_MARKETPLACE, pluginName, version);
}

// Write a stub `codex` CLI into the stub root. It models the TWO properties that
// matter: the installed marketplace-plugin VERSION, and the CONTENT the version-keyed
// cache actually serves — both are state that only `plugin add` / `plugin remove`
// change. `plugin list --json` emits the real CLI's shape (verified against a live
// `codex plugin list --json`: {installed:[{pluginId,name,marketplaceName,version,
// installed,enabled,source:{source,path},marketplaceSource:{sourceType,source}}]}).
// Every invocation is appended to a call log so a case can prove remove/add were (or
// were NOT) issued.
//   installedVersion: seed version; '' / null => plugin not installed at all
//   addVersion:       version `plugin add` installs ('' => add installs nothing)
//   addExit:          exit code of `plugin add`
//   addContent:       when set, the content `plugin add` leaves in the cache instead of
//                     a faithful copy of the tree (models a refresh that runs but does
//                     NOT bring the served content into agreement)
//   pluginName:       the `name` the installed row reports (default 'kaola-workflow');
//                     a forge edition row reports kaola-workflow-gitlab / -gitea
//   sourceType:       marketplaceSource.sourceType on the row ('local' | 'git' | null to
//                     omit the marketplaceSource object entirely — live rows exist with
//                     no marketplaceSource at all)
//   marketplaceRoot / sourcePluginPath:
//                     the CONFIGURED marketplace and the plugin directory inside it —
//                     what the row declares and what `add` installs from. Distinct from
//                     the invoking tree whenever the wrapper is run from a worktree.
//   hangSeconds:      when set, `plugin list` sleeps this long instead of answering
//                     (models a wedged CLI; the wrapper must bound the read)
function writeCodexStub(root, cfg) {
  const bin = path.join(root, 'stub-codex');
  const state = path.join(root, '.codex-installed-version');
  const log = path.join(root, '.codex-calls');
  const pluginName = cfg.pluginName || 'kaola-workflow';
  const cacheRoot = codexCacheRoot(cfg.homeRoot);
  // Row provenance fields. `source.path` and `marketplaceSource.source` describe the
  // CONFIGURED marketplace — the place `add` installs from — which is the invoking tree
  // only when the wrapper happens to be run from the checkout the marketplace points at.
  // A git marketplace serves a fetched snapshot, so no local directory arbitrates it.
  // cfg.rowSourcePath === null omits the `source` object entirely: a row that declares
  // no install-from path at all, which is a state the reader must survive.
  let rowFields = cfg.rowSourcePath === null
    ? '' : `,"source":{"source":"local","path":"${cfg.rowSourcePath}"}`;
  if (cfg.sourceType === 'local') {
    rowFields += `,"marketplaceSource":{"sourceType":"local","source":"${cfg.marketplaceRoot}"}`;
  } else if (cfg.sourceType) {
    rowFields += `,"marketplaceSource":{"sourceType":"${cfg.sourceType}",`
      + '"source":"https://example.invalid/owner/repo.git"}';
  }
  // The fragment is embedded single-quoted in bash; temp paths never contain a quote.
  if (/'/.test(rowFields)) throw new Error('stub row fields must not contain a single quote');
  fs.writeFileSync(state, cfg.installedVersion || '');
  fs.writeFileSync(log, '');
  fs.writeFileSync(bin, [
    '#!/usr/bin/env bash',
    `STATE=${JSON.stringify(state)}`,
    `LOG=${JSON.stringify(log)}`,
    `NAME=${JSON.stringify(pluginName)}`,
    `MARKET=${JSON.stringify(STUB_MARKETPLACE)}`,
    `CACHE_ROOT=${JSON.stringify(cacheRoot)}`,
    `SOURCE_PLUGIN=${JSON.stringify(cfg.sourcePluginPath)}`,
    `CONTENT_REL=${JSON.stringify(CONTENT_REL)}`,
    `ROW_FIELDS='${rowFields}'`,
    'printf \'%s\\n\' "$*" >> "$LOG"',
    'if [[ "$1" == "plugin" && "$2" == "list" ]]; then',
    ...(cfg.hangSeconds ? [`  sleep ${Number(cfg.hangSeconds)}`] : []),
    '  if [[ -s "$STATE" ]]; then',
    '    v="$(cat "$STATE")"',
    '    printf \'{"installed":[{"pluginId":"%s@%s","name":"%s",\' "$NAME" "$MARKET" "$NAME"',
    '    printf \'"marketplaceName":"%s","version":"%s","installed":true,"enabled":true%s}],"available":[]}\\n\' "$MARKET" "$v" "$ROW_FIELDS"',
    '  else',
    '    printf \'{"installed":[],"available":[]}\\n\'',
    '  fi',
    '  exit 0',
    'fi',
    // `remove` clears local config AND cache — the documented behaviour of the real CLI.
    'if [[ "$1" == "plugin" && "$2" == "remove" ]]; then',
    '  : > "$STATE"',
    '  rm -rf "$CACHE_ROOT/$MARKET/$NAME"',
    '  exit 0',
    'fi',
    'if [[ "$1" == "plugin" && "$2" == "add" ]]; then',
    `  ADD_VERSION=${JSON.stringify(cfg.addVersion === undefined ? '' : cfg.addVersion)}`,
    '  printf \'%s\' "$ADD_VERSION" > "$STATE"',
    '  if [[ -n "$ADD_VERSION" ]]; then',
    // `add` repopulates the version-keyed cache dir from the CONFIGURED marketplace
    // source — never from whatever tree the wrapper happened to be invoked from.
    '    dest="$CACHE_ROOT/$MARKET/$NAME/$ADD_VERSION"',
    '    rm -rf "$dest"',
    '    mkdir -p "$dest"',
    '    cp -R "$SOURCE_PLUGIN/." "$dest/"',
    ...(cfg.addContent === undefined ? [] : [
      '    mkdir -p "$(dirname "$dest/$CONTENT_REL")"',
      `    printf '%s' ${JSON.stringify(cfg.addContent)} > "$dest/$CONTENT_REL"`,
    ]),
    '  fi',
    `  exit ${cfg.addExit || 0}`,
    'fi',
    'exit 1',
  ].join('\n') + '\n');
  fs.chmodSync(bin, 0o755);
  return { bin, state, log };
}

// Build a stub root with the four installers at the exact paths the wrapper calls.
// opts.codes overrides exit codes per runtime (default 0 for all);
// opts.treeVersion is the .codex-plugin/plugin.json version;
// opts.packageVersion is a DECOY package.json version (the wrapper must ignore it);
// opts.installedVersion / opts.addVersion / opts.addExit drive the stub codex CLI;
// opts.noCodexCli points KAOLA_CODEX_BIN at a nonexistent path;
// opts.treeContent / opts.installedContent / opts.addContent drive the CONTENT the tree
//   carries, the seeded cache serves, and a refresh installs (default: all identical, so
//   an equal-version root is genuinely converged and nothing should churn);
// opts.sourceType is the row's marketplaceSource.sourceType ('local' default, 'git', or
//   null to omit marketplaceSource entirely);
// opts.marketplaceContent / opts.marketplaceVersion, when set, give the configured
//   marketplace its OWN checkout — a separate root whose plugin tree carries that content
//   and declares that version — so the marketplace source and the invoking tree are
//   different directories, which is what a linked worktree is. Unset, they are the same
//   directory and every pre-existing case is unaffected;
// opts.rowSourcePath overrides the install-from path the ROW declares (null omits the
//   `source` object entirely), so a case can make the content check unanswerable.
function stubRoot(opts) {
  opts = opts || {};
  const codes = opts.codes || {};
  const root = freshRoot();
  const markers = {
    claude:   writeStub(root, 'install.sh',            'bash', codes.claude ?? 0, '.ran-claude'),
    opencode: writeStub(root, 'install-opencode.sh',   'bash', codes.opencode ?? 0, '.ran-opencode'),
    codex:    writeStub(root, 'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js', 'node', codes.codex ?? 0, '.ran-codex'),
    kimi:     writeStub(root, 'install-kimi.sh',       'bash', codes.kimi ?? 0, '.ran-kimi'),
  };
  const treeVersion = opts.treeVersion || '5.0.0';
  // opts.pluginDir / opts.pluginName let a case build a FORGE edition manifest
  // (plugins/kaola-workflow-gitlab/... declaring name kaola-workflow-gitlab).
  const pluginDir = opts.pluginDir || 'kaola-workflow';
  const pluginName = opts.pluginName || 'kaola-workflow';
  const treePluginPath = path.join(root, 'plugins', pluginDir);
  const manifest = path.join(treePluginPath, '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, JSON.stringify({ name: pluginName, version: treeVersion }, null, 2) + '\n');
  // The content the plugin SERVES, distinct from the version that keys its cache.
  const treeContent = opts.treeContent === undefined ? TREE_CONTENT : opts.treeContent;
  const treeContentPath = path.join(treePluginPath, CONTENT_REL);
  fs.mkdirSync(path.dirname(treeContentPath), { recursive: true });
  fs.writeFileSync(treeContentPath, treeContent);
  // Decoy: the repo version is deliberately NOT the Codex plugin version.
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ name: 'kaola-workflow', version: opts.packageVersion || '7.0.0' }, null, 2) + '\n');

  // A codex HOME private to this root. HOME and CODEX_HOME are both redirected here on
  // every wrapper invocation, so whichever of the two a reader derives the cache from,
  // it lands in the fixture and the host ~/.codex is unreachable.
  const homeRoot = path.join(root, '.home');
  const codexHome = path.join(homeRoot, '.codex');
  fs.mkdirSync(codexHome, { recursive: true });

  // The CONFIGURED marketplace. `codex plugin add` installs from here, so this — not the
  // tree the wrapper was invoked from — is what the cache can be brought into agreement
  // with. They are the same directory unless a case asks for a separate checkout, and
  // then it may declare its own plugin VERSION too: a checkout that has taken a release
  // the invoking worktree has not is an ordinary state, not a contrived one.
  let marketplaceRoot = root;
  let sourcePluginPath = treePluginPath;
  let marketplaceVersion = treeVersion;
  if (opts.marketplaceContent !== undefined || opts.marketplaceVersion !== undefined) {
    marketplaceRoot = freshRoot();
    sourcePluginPath = path.join(marketplaceRoot, 'plugins', pluginDir);
    fs.cpSync(treePluginPath, sourcePluginPath, { recursive: true });
    if (opts.marketplaceContent !== undefined) {
      fs.writeFileSync(path.join(sourcePluginPath, CONTENT_REL), opts.marketplaceContent);
    }
    if (opts.marketplaceVersion !== undefined) {
      marketplaceVersion = opts.marketplaceVersion;
      fs.writeFileSync(path.join(sourcePluginPath, '.codex-plugin', 'plugin.json'),
        JSON.stringify({ name: pluginName, version: marketplaceVersion }, null, 2) + '\n');
    }
  }

  const installedVersion = opts.installedVersion === undefined ? treeVersion : opts.installedVersion;
  const installedPluginName = opts.installedPluginName || pluginName;
  // Seed the version-keyed cache the way a real `plugin add` left it: a copy of what the
  // MARKETPLACE serves, whose own manifest declares the CACHED version, plus any content
  // drift the case wants (prose that moved after the plugin was added).
  if (installedVersion) {
    const versionDir = codexCacheVersionDir(homeRoot, installedPluginName, installedVersion);
    fs.mkdirSync(path.dirname(versionDir), { recursive: true });
    fs.cpSync(sourcePluginPath, versionDir, { recursive: true });
    // opts.cacheManifestVersion lets a case hold the cached manifest at the TREE version
    // while the installed version differs — deliberately unfaithful, to isolate the
    // version trigger from the content trigger in a control.
    const cachedManifestVersion = opts.cacheManifestVersion === undefined
      ? installedVersion : opts.cacheManifestVersion;
    fs.writeFileSync(path.join(versionDir, '.codex-plugin', 'plugin.json'),
      JSON.stringify({ name: installedPluginName, version: cachedManifestVersion }, null, 2) + '\n');
    if (opts.installedContent !== undefined) {
      fs.writeFileSync(path.join(versionDir, CONTENT_REL), opts.installedContent);
    }
  }

  const codex = writeCodexStub(root, {
    installedVersion,
    // `add` installs what the MARKETPLACE declares, which is the invoking tree's version
    // only when they are the same checkout.
    addVersion: opts.addVersion === undefined ? marketplaceVersion : opts.addVersion,
    addExit: opts.addExit || 0,
    addContent: opts.addContent,
    pluginName: installedPluginName,
    sourceType: opts.sourceType === undefined ? 'local' : opts.sourceType,
    hangSeconds: opts.hangSeconds,
    homeRoot,
    marketplaceRoot,
    sourcePluginPath,
    // What the ROW declares as its install-from path — normally the real one, but a case
    // may point it at nothing (null) or somewhere absent.
    rowSourcePath: opts.rowSourcePath === undefined ? sourcePluginPath : opts.rowSourcePath,
  });
  return {
    root, markers, treeVersion, homeRoot, codexHome, treePluginPath, installedPluginName,
    marketplaceRoot, sourcePluginPath, marketplaceVersion,
    codexBin: opts.noCodexCli ? path.join(root, 'no-such-codex-cli') : codex.bin,
    statePath: codex.state, callLogPath: codex.log,
  };
}

const readCalls = stub => {
  try { return fs.readFileSync(stub.callLogPath, 'utf8').split('\n').filter(Boolean); }
  catch (_) { return []; }
};
const installedVersionNow = stub => {
  try { return fs.readFileSync(stub.statePath, 'utf8'); } catch (_) { return ''; }
};
// What the version-keyed cache SERVES right now, at whatever version is installed.
const servedContentNow = stub => {
  const v = installedVersionNow(stub);
  if (!v) return '';
  try {
    return fs.readFileSync(
      path.join(codexCacheVersionDir(stub.homeRoot, stub.installedPluginName, v), CONTENT_REL), 'utf8');
  } catch (_) { return ''; }
};
const treeContentNow = stub => {
  try { return fs.readFileSync(path.join(stub.treePluginPath, CONTENT_REL), 'utf8'); }
  catch (_) { return ''; }
};
// What the CONFIGURED marketplace would install — the same thing as the tree unless the
// case gave the marketplace its own checkout.
const marketplaceContentNow = stub => {
  try { return fs.readFileSync(path.join(stub.sourcePluginPath, CONTENT_REL), 'utf8'); }
  catch (_) { return ''; }
};
const mutatingCalls = stub =>
  readCalls(stub).filter(c => c.startsWith('plugin add') || c.startsWith('plugin remove'));
// The codex line out of the summary table — the row a reader actually sees.
const codexSummaryRow = out => {
  const m = out.match(/^\s*codex\s+\S.*$/m);
  return m ? m[0].trim() : '';
};
// The version-keyed directory the runtime is serving out of right now.
const servedDirNow = stub =>
  codexCacheVersionDir(stub.homeRoot, stub.installedPluginName, installedVersionNow(stub));
// Byte-for-byte over every file — the comparison the wrapper itself has to make.
function dirsEqual(a, b) {
  const walk = (root, rel, out) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(root, r, out); else if (e.isFile()) out.push(r);
    }
    return out;
  };
  let A, B;
  try { A = walk(a, '', []).sort(); B = walk(b, '', []).sort(); } catch (_) { return false; }
  if (A.length !== B.length || A.some((f, i) => f !== B[i])) return false;
  return A.every(f => fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))));
}

// Accepts a stub object or a bare root path. KAOLA_CODEX_BIN is ALWAYS set so the
// host `codex` is never reachable from this suite, and HOME/CODEX_HOME are ALWAYS
// redirected into the fixture so the host's version-keyed plugin cache can never be
// read, compared against, or removed by this suite.
function runWrapper(rootOrStub, args, extraEnv) {
  const isStub = rootOrStub && typeof rootOrStub === 'object';
  const root = isStub ? rootOrStub.root : rootOrStub;
  const codexBin = isStub ? rootOrStub.codexBin : path.join(root, 'no-such-codex-cli');
  const homeRoot = isStub ? rootOrStub.homeRoot : path.join(root, '.home');
  const started = Date.now();
  // spawn-class: environment
  const r = spawnSync('bash', [INSTALL_ALL].concat(args), {
    cwd: REPO, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      KAOLA_INSTALL_ALL_ROOT: root,
      KAOLA_CODEX_BIN: codexBin,
      HOME: homeRoot,
      CODEX_HOME: path.join(homeRoot, '.codex'),
    }, extraEnv || {}),
  });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), elapsedMs: Date.now() - started };
}

// Test A — all four pass: exit 0, four PASS rows, all markers created.
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'A: all-pass wrapper exits 0');
  assert((r.out.match(/PASS/g) || []).length >= 4, 'A: summary reports four PASS');
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => fs.existsSync(markers[n])),
    'A: all four installers actually ran');
  assert(r.out.includes('all runtimes OK'), 'A: prints all-runtimes-OK sentinel');
}

// Test B — one installer fails: exit 1, loud FAIL for it, others still run/PASS.
{
  const stub = stubRoot({ codes: { opencode: 3 } });
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'B: any-failure wrapper exits non-zero (1)');
  assert(/opencode\s+FAIL/.test(r.out), 'B: summary marks opencode FAIL');
  assert(r.out.includes('FAILED with exit code 3'), 'B: loud failure banner names exit code 3');
  assert(fs.existsSync(markers.codex) && fs.existsSync(markers.kimi),
    'B: continue-through — codex and kimi still ran after opencode failed');
  assert(/claude\s+PASS/.test(r.out) && /kimi\s+PASS/.test(r.out), 'B: the three healthy runtimes PASS');
}

// Test C — --skip=kimi: kimi SKIP, not run, others pass, exit 0.
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes', '--skip=kimi']);
  assert(r.status === 0, 'C: skip-with-all-healthy exits 0');
  assert(/kimi\s+SKIP/.test(r.out), 'C: summary marks kimi SKIP');
  assert(r.out.includes('SKIPPED (--skip=kimi)'), 'C: loud skip line printed');
  assert(!fs.existsSync(markers.kimi), 'C: skipped installer did not run');
  assert(fs.existsSync(markers.claude), 'C: non-skipped installers still ran');
}

// Test D — --strict fail-fast: first failure aborts, later runtimes NOT run.
{
  const stub = stubRoot({ codes: { claude: 5 } });
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes', '--strict']);
  assert(r.status === 1, 'D: strict abort exits non-zero');
  assert(r.out.includes('--strict abort'), 'D: strict abort message printed');
  assert(fs.existsSync(markers.claude), 'D: the failing runtime ran');
  assert(!fs.existsSync(markers.opencode) && !fs.existsSync(markers.kimi),
    'D: strict stopped before later runtimes ran');
  assert(/kimi\s+NOT-RUN/.test(r.out), 'D: summary marks unreached runtime NOT-RUN');
}

// Test E — --check dry run: no installer runs, exit 0, PLAN rows.
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--check']);
  assert(r.status === 0, 'E: --check exits 0');
  assert((r.out.match(/PLAN/g) || []).length >= 4, 'E: --check reports four PLAN rows');
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => !fs.existsSync(markers[n])),
    'E: --check made no changes (no installer ran)');
  assert(r.out.includes('dry-run complete'), 'E: dry-run sentinel printed');
}

// Test F — unknown arg / --help behave as arg-contract expects.
{
  const bogus = runWrapper(freshRoot(), ['--nope']);
  assert(bogus.status === 2, 'F: unknown argument exits 2');
  const help = runWrapper(freshRoot(), ['--help']);
  assert(help.status === 0 && help.out.includes('Usage: ./install-all.sh'), 'F: --help exits 0 with usage');
}

// Test G — an EMPTY --skip= value must not crash (bash 3.2 empty-array-under-set-u trap).
{
  const stub = stubRoot();
  const { markers } = stub;
  const r = runWrapper(stub, ['--yes', '--skip=']);
  assert(r.status === 0 && !/unbound variable/.test(r.out),
    'G: an empty --skip= value is a no-op, not a crash: ' + r.out.split('\n').slice(-3).join(' | '));
  assert(['claude', 'opencode', 'codex', 'kimi'].every(n => fs.existsSync(markers[n])),
    'G: with an empty skip list all four runtimes still run');
}

// ---- 3. CONVERGENCE (#795): PASS must mean "at HEAD", not "the installer exited 0" ----

// Test H — a STALE marketplace plugin is refreshed, the transition is logged, and the
// re-read proves it took. This is the live v6.24.0 -> v7.0.0 sync failure: install-all
// said `codex PASS` while `codex plugin list` still reported the old version.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'H: a converged run exits 0');
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'H: the stale plugin transition is logged loudly (4.24.0 -> 5.0.0)');
  assert(/marketplace plugin converged: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'H: convergence is confirmed after the refresh');
  assert(/codex\s+PASS/.test(r.out), 'H: codex reads PASS once genuinely converged');
  const calls = readCalls(stub);
  assert(calls.some(c => c.startsWith('plugin remove kaola-workflow@stub-market')),
    'H: `codex plugin remove <pluginId>` was issued — calls: ' + JSON.stringify(calls));
  assert(calls.some(c => c.startsWith('plugin add kaola-workflow@stub-market')),
    'H: `codex plugin add <pluginId>` was issued — calls: ' + JSON.stringify(calls));
  assert(installedVersionNow(stub) === '5.0.0',
    'H: the runtime ends at the TREE version — got ' + JSON.stringify(installedVersionNow(stub)));
  assert(r.out.includes('all runtimes OK'), 'H: all-clear only after real convergence');
}

// Test I — THE INVARIANT: a green summary can never coexist with a detected version
// mismatch. `plugin add` exits 0 but the version does not move (the version-keyed cache
// kept serving the old build); the wrapper must RE-READ, catch it, and refuse to be green.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', addVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'I: a runtime still older than the tree makes the wrapper exit non-zero');
  assert(/codex\s+FAIL/.test(r.out), 'I: the un-converged runtime reads FAIL, not PASS');
  assert(!/codex\s+PASS/.test(r.out), 'I: no PASS row for a runtime that did not converge');
  assert(/still reports 4\.24\.0 after refresh \(tree 5\.0\.0\)/.test(r.out),
    'I: the detected mismatch is named with both versions');
  assert(!r.out.includes('all runtimes OK'),
    'I: the all-clear sentinel is withheld when a runtime is not at HEAD');
}

// Test J — `codex plugin add` fails outright: FAIL with the reason, wrapper exits 1.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', addExit: 9 });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'J: a failed plugin refresh makes the wrapper exit non-zero');
  assert(/codex\s+FAIL/.test(r.out), 'J: a failed plugin refresh reads FAIL');
  assert(/plugin add .* failed/.test(r.out), 'J: the failing command is named');
}

// Test J2 — --strict aborts on a convergence failure too (kimi is never reached).
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', addExit: 9 });
  const r = runWrapper(stub, ['--yes', '--strict']);
  assert(r.status === 1, 'J2: --strict exits non-zero on a convergence failure');
  assert(r.out.includes('--strict abort after codex marketplace-plugin convergence failed'),
    'J2: the strict abort names the convergence step');
  assert(!fs.existsSync(stub.markers.kimi), 'J2: --strict stopped before kimi ran');
}

// Test K — --check reports the PENDING upgrade and changes nothing.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--check']);
  assert(r.status === 0, 'K: --check with a stale plugin still exits 0');
  assert(/PENDING marketplace plugin upgrade: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'K: --check reports the pending Codex plugin upgrade');
  assert(installedVersionNow(stub) === '4.24.0',
    'K: --check made NO change to the installed plugin version');
  const calls = readCalls(stub);
  assert(!calls.some(c => c.startsWith('plugin add') || c.startsWith('plugin remove')),
    'K: --check issued no mutating codex calls — calls: ' + JSON.stringify(calls));
  assert(r.out.includes('dry-run complete'), 'K: dry-run sentinel still printed');
  assert(!/codex\s+FAIL/.test(r.out), 'K: a dry run states, it does not grade');
}

// Test L — codex CLI ABSENT is NOT APPLICABLE, not UNVERIFIED. With no `codex` on
// PATH there is no marketplace plugin to converge, so there is nothing this wrapper
// could check and nothing is degraded. Reporting a standing "convergence is
// UNVERIFIED" on such a box was a behavior regression: an ABSENT CLI is not a
// DETECTED mismatch. The row still carries its reason, so it is never a BARE pass.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', noCodexCli: true });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'L: an absent codex CLI does not fail the wrapper');
  assert(/NOT APPLICABLE/.test(r.out),
    'L: an absent CLI is reported NOT APPLICABLE, not a failed/unverified convergence');
  assert(/CLI not found/.test(r.out), 'L: the reason is printed');
  assert(!/codex\s+PARTIAL/.test(r.out),
    'L: absent tooling no longer permanently degrades the codex row to PARTIAL');
  assert(!/convergence is UNVERIFIED/.test(r.out),
    'L: a box with no Codex installed is not reported as permanently UNVERIFIED');
  assert(r.out.includes('all runtimes OK'),
    'L: the all-clear is printed — with the N/A reason named, never a bare green');
  assert(/N\/A: codex CLI not found/.test(r.out),
    'L: the codex row carries the N/A reason so the PASS is never bare');
  assert(fs.existsSync(stub.markers.kimi), 'L: later runtimes still install');
}

// Test L2 — a HUNG `codex plugin list` is BOUNDED. Before this the read had no
// timeout at all, so a wedged CLI hung install-all.sh forever. A timeout is a check
// that DID apply and could not be completed => UNVERIFIED (PARTIAL), not N/A.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', hangSeconds: 120 });
  const r = runWrapper(stub, ['--yes'], { KAOLA_CODEX_LIST_TIMEOUT_SECS: '2' });
  assert(r.status === 0, 'L2: a hung codex CLI does not fail the wrapper (got ' + r.status + ')');
  assert(r.elapsedMs < 60000,
    'L2: the wrapper is BOUNDED by the ceiling, not by the hung CLI — took ' + r.elapsedMs + 'ms');
  assert(/timed out after 2s/.test(r.out),
    'L2: the timeout is named with the ceiling — tail: ' + r.out.split('\n').slice(-6).join(' | '));
  assert(/codex\s+PARTIAL/.test(r.out),
    'L2: a check that applies but could not complete reads PARTIAL (UNVERIFIED), not N/A');
  assert(/convergence is UNVERIFIED/.test(r.out),
    'L2: a timed-out read is genuinely unverified');
  assert(!/NOT APPLICABLE/.test(r.out),
    'L2: a hung CLI is not the absent-tooling case');
  assert(fs.existsSync(stub.markers.kimi), 'L2: later runtimes still install after a bounded read');
}

// Test M — the marketplace plugin is not installed at all: skipped-with-reason, no
// attempt to guess a marketplace and add it.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'M: an unregistered marketplace does not fail the wrapper');
  assert(/codex\s+PARTIAL/.test(r.out), 'M: codex reads PARTIAL when the plugin is not installed');
  assert(/not installed from a codex marketplace/.test(r.out), 'M: the reason is printed');
  const calls = readCalls(stub);
  assert(!calls.some(c => c.startsWith('plugin add')),
    'M: the wrapper never invents a marketplace to add — calls: ' + JSON.stringify(calls));
}

// Test N — the tree version comes from .codex-plugin/plugin.json, NOT package.json.
// The decoy package.json says 4.24.0 (== the installed version), so a wrapper that read
// package.json would call this converged; the plugin manifest says 5.0.0, so it is stale.
{
  const stub = stubRoot({ treeVersion: '5.0.0', packageVersion: '4.24.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'N: the tree version is read from .codex-plugin/plugin.json, not package.json');
  assert(installedVersionNow(stub) === '5.0.0', 'N: it converged to the plugin-manifest version');
}

// Test O — --skip=codex skips convergence too (no codex call at all).
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes', '--skip=codex']);
  assert(r.status === 0, 'O: --skip=codex exits 0');
  assert(/codex\s+SKIP/.test(r.out), 'O: codex reads SKIP');
  assert(!/marketplace plugin/.test(r.out), 'O: no convergence work is done for a skipped runtime');
  assert(readCalls(stub).length === 0,
    'O: the codex CLI was never invoked — calls: ' + JSON.stringify(readCalls(stub)));
}

// Test P — the agent-profile installer failed: convergence is not attempted, and the row
// says so rather than silently looking like a plain installer failure.
{
  const stub = stubRoot({ codes: { codex: 4 }, treeVersion: '5.0.0', installedVersion: '4.24.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 1, 'P: a failed codex installer still fails the wrapper');
  assert(/codex\s+FAIL/.test(r.out), 'P: codex reads FAIL');
  assert(/plugin convergence not attempted/.test(r.out),
    'P: the summary states convergence was not attempted after an installer failure');
  assert(readCalls(stub).length === 0, 'P: no codex CLI calls after an installer failure');
}

// Test R — the plugin NAME is DERIVED from the forge-selected manifest, never hardcoded.
// The gitlab/gitea .codex-plugin/plugin.json declare kaola-workflow-gitlab / -gitea, so a
// wrapper pinned to the literal `kaola-workflow` matched no installed row on those editions
// and convergence silently found nothing to check (a permanent false green).
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '4.24.0',
    pluginDir: 'kaola-workflow-gitlab', pluginName: 'kaola-workflow-gitlab',
  });
  const r = runWrapper(stub, ['--yes', '--forge=gitlab']);
  assert(r.status === 0, 'R: the gitlab-forge run exits 0 (got ' + r.status + ')');
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'R: the forge edition plugin row is FOUND and its staleness detected — tail: '
      + r.out.split('\n').slice(-8).join(' | '));
  assert(installedVersionNow(stub) === '5.0.0',
    'R: the forge edition converged to the tree version — got ' + JSON.stringify(installedVersionNow(stub)));
  const calls = readCalls(stub);
  assert(calls.some(c => c.startsWith('plugin add kaola-workflow-gitlab@stub-market')),
    'R: the refresh names the FORGE plugin id, not the hardcoded github one — calls: ' + JSON.stringify(calls));
}

// Test R2 — the derivation is real, not a coincidence: with the gitlab manifest in the
// tree but the installed row still reporting the github name, there is no matching row
// and the wrapper says so instead of silently reporting converged.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '4.24.0',
    pluginDir: 'kaola-workflow-gitlab', pluginName: 'kaola-workflow-gitlab',
    installedPluginName: 'kaola-workflow',
  });
  const r = runWrapper(stub, ['--yes', '--forge=gitlab']);
  assert(r.status === 0, 'R2: a non-matching installed row does not fail the wrapper');
  assert(/kaola-workflow-gitlab/.test(r.out),
    'R2: the wrapper names the DERIVED plugin it looked for — tail: ' + r.out.split('\n').slice(-6).join(' | '));
  assert(/codex\s+PARTIAL/.test(r.out),
    'R2: no matching installed row is UNVERIFIED, never a silent converged');
}

// ---- 4. CONTENT convergence (#972): the version is not the served artifact ----
// A version bump is not the only way the Codex runtime goes stale. The plugin cache is
// keyed by version, so prose that moves at an UNCHANGED version keeps being served from
// the cache while claude/opencode/kimi (which copy unconditionally) take it — and the
// wrapper printed "marketplace plugin already at <v>" and a bare PASS over it. The
// trigger is what changes: version-inequality OR content-difference, reusing the same
// remove+add refresh. Two things bound it, and the cases below pin both, because a
// refresh that fires unconditionally and a proof that cannot fail are each a defect of
// their own:
//   - it fires only for a LOCAL marketplace. A git marketplace serves a fetched
//     snapshot, so the working tree is the wrong oracle: any uncommitted or unpushed
//     edit would make tree != cache permanently and churn a remove+add on every run
//     that can never converge.
//   - the post-refresh proof must observe CONTENT. On this path the versions are equal
//     by construction, so a version-only re-read proves nothing at all.

// Test S1 — NO CHURN: equal version and the cache already serves the tree content.
// Without this, a wrapper that refreshed unconditionally would satisfy S2.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '5.0.0' });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'S1: a genuinely converged runtime exits 0');
  assert(/codex\s+PASS/.test(r.out), 'S1: codex reads PASS');
  assert(/marketplace plugin already at 5\.0\.0/.test(r.out),
    'S1: a converged plugin is still reported current');
  assert(mutatingCalls(stub).length === 0,
    'S1: NOTHING is refreshed when the served content already matches the tree — calls: '
      + JSON.stringify(readCalls(stub)));
  assert(r.out.includes('all runtimes OK'), 'S1: all-clear on a converged box');
}

// Test S2 — THE DEFECT: equal version, DIFFERENT served content, local marketplace. The
// runtime is serving prose the tree no longer has; it must be refreshed in place, and
// PASS must mean the content converged, not that the two version strings matched.
{
  const stale = 'cache content: A run normally carries one issue\n';
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '5.0.0', installedContent: stale });
  const r = runWrapper(stub, ['--yes']);
  assert(!/marketplace plugin already at 5\.0\.0/.test(r.out),
    'S2: a runtime serving stale content is NOT reported current — tail: '
      + r.out.split('\n').slice(-8).join(' | '));
  const calls = mutatingCalls(stub);
  assert(calls.some(c => c.startsWith('plugin remove kaola-workflow@stub-market')),
    'S2: `codex plugin remove <pluginId>` was issued — calls: ' + JSON.stringify(readCalls(stub)));
  assert(calls.some(c => c.startsWith('plugin add kaola-workflow@stub-market')),
    'S2: `codex plugin add <pluginId>` was issued — calls: ' + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === treeContentNow(stub),
    'S2: the runtime ends up SERVING the tree content — got ' + JSON.stringify(servedContentNow(stub)));
  assert(installedVersionNow(stub) === '5.0.0',
    'S2: the version never moved — this was never a version bump');
  assert(r.status === 0, 'S2: a converged run exits 0 (got ' + r.status + ')');
  assert(/codex\s+PASS/.test(r.out), 'S2: codex reads PASS once the CONTENT converged');
  assert(r.out.includes('all runtimes OK'), 'S2: all-clear only after real convergence');
}

// Test S3 — a GIT-sourced marketplace is NOT refreshed on content difference: `add`
// installs the remote snapshot, so the working tree is the wrong oracle and any local
// edit would churn a remove+add every run that could never converge.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    installedContent: 'snapshot content\n', sourceType: 'git',
  });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'S3: a git-sourced marketplace does not fail the wrapper (got ' + r.status + ')');
  assert(mutatingCalls(stub).length === 0,
    'S3: no remove/add churn for a marketplace whose oracle is not the tree — calls: '
      + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === 'snapshot content\n',
    'S3: the git-sourced cache is left untouched');
  assert(!/codex\s+FAIL/.test(r.out),
    'S3: a difference the tree cannot arbitrate is never a wrapper failure');
}

// Test S4 — the gate is "explicitly local", not "not explicitly git". Live `plugin list`
// rows exist with NO marketplaceSource object at all; an unknown provenance must not be
// treated as local.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    installedContent: 'unknown-provenance content\n', sourceType: null,
  });
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, 'S4: an unknown marketplace provenance does not fail the wrapper');
  assert(mutatingCalls(stub).length === 0,
    'S4: no refresh when the row does not declare a LOCAL marketplace — calls: '
      + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === 'unknown-provenance content\n',
    'S4: the cache is left untouched when provenance is unknown');
}

// Test S5 — THE PROOF MUST NOT GO VACUOUS. The refresh runs but `add` leaves content that
// still differs from the tree. The versions are EQUAL throughout, so a re-read that only
// compares versions cannot fail here: it would certify a runtime that never converged.
// This is the content-axis twin of test I.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    installedContent: 'stale content\n', addContent: 'still not the tree content\n',
  });
  const r = runWrapper(stub, ['--yes']);
  assert(mutatingCalls(stub).some(c => c.startsWith('plugin add')),
    'S5: the refresh was attempted — calls: ' + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) !== treeContentNow(stub),
    'S5 (fixture control): the refresh genuinely did NOT converge the content — served '
      + JSON.stringify(servedContentNow(stub)));
  assert(installedVersionNow(stub) === '5.0.0',
    'S5 (fixture control): the VERSION matches the tree throughout, so only a content '
      + 'proof can catch this — got ' + JSON.stringify(installedVersionNow(stub)));
  assert(r.status !== 0,
    'S5: a refresh that did not converge the CONTENT makes the wrapper exit non-zero (got '
      + r.status + ')');
  assert(/codex\s+FAIL/.test(r.out),
    'S5: the un-converged runtime reads FAIL — tail: ' + r.out.split('\n').slice(-8).join(' | '));
  assert(!/codex\s+PASS/.test(r.out), 'S5: no PASS row for a runtime that did not converge');
  assert(!r.out.includes('all runtimes OK'),
    'S5: the all-clear sentinel is withheld when the served content is not at HEAD');
}

// Test S6 — --check still states rather than acts: a content difference changes nothing.
{
  const stale = 'cache content: A run normally carries one issue\n';
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '5.0.0', installedContent: stale });
  const r = runWrapper(stub, ['--check']);
  assert(r.status === 0, 'S6: --check with a content-stale plugin still exits 0');
  assert(mutatingCalls(stub).length === 0,
    'S6: --check issued no mutating codex calls — calls: ' + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === stale, 'S6: --check made NO change to the served content');
  assert(installedVersionNow(stub) === '5.0.0', 'S6: --check made no change to the version');
  assert(r.out.includes('dry-run complete'), 'S6: dry-run sentinel still printed');
  assert(!/codex\s+FAIL/.test(r.out), 'S6: a dry run states, it does not grade');
}

// Test S7 — the VERSION trigger is not replaced by the content one. Deliberately
// unfaithful fixture (the cached manifest is held at the tree version) so the ONLY
// difference is the installed version string: a wrapper that refreshed on content alone
// would leave this box pinned at 4.24.0.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '4.24.0', cacheManifestVersion: '5.0.0',
  });
  const r = runWrapper(stub, ['--yes']);
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'S7: a version mismatch still refreshes even when the served content matches — tail: '
      + r.out.split('\n').slice(-8).join(' | '));
  assert(installedVersionNow(stub) === '5.0.0', 'S7: it converged to the tree version');
  assert(r.status === 0, 'S7: the converged run exits 0');
}

// Test S8 — and the version trigger is NOT gated on a local marketplace: a git-sourced
// plugin at the wrong version is exactly what `add` from a remote snapshot fixes.
{
  const stub = stubRoot({ treeVersion: '5.0.0', installedVersion: '4.24.0', sourceType: 'git' });
  const r = runWrapper(stub, ['--yes']);
  assert(/marketplace plugin STALE: 4\.24\.0 -> 5\.0\.0/.test(r.out),
    'S8: a git-sourced marketplace at the wrong VERSION is still refreshed — tail: '
      + r.out.split('\n').slice(-8).join(' | '));
  assert(installedVersionNow(stub) === '5.0.0',
    'S8: the git-sourced plugin converged to the tree version');
  assert(r.status === 0, 'S8: the converged run exits 0');
}

// ---- 5. WHICH TREE ARBITRATES (#972): the oracle is the configured marketplace ----
// `codex plugin add` installs from the plugin row's own marketplace source. Comparing
// the cache against the tree the wrapper happened to be INVOKED from is therefore a
// different question, and the two answers come apart the moment the wrapper is run from
// a linked worktree whose plugins/ has moved — a state this repo reaches routinely. In
// that shape a tree-based oracle demands a refresh, the refresh reinstalls the
// marketplace's content, the comparison still differs, and the row reads FAIL on every
// run with no convergence reachable. A check must not be able to demand a repair the
// repair mechanism cannot deliver, so the oracle is the same path the refresh installs
// from. The cases below discriminate the two oracles; W3 pins the property directly.

// Test W1 — invoked from a worktree whose plugins/ differs from the marketplace source,
// with the cache already byte-equal to that source. The runtime is serving exactly what
// its configured source would install: there is nothing to converge, and a refresh here
// could only reinstall what is already there.
{
  const marketplace = 'marketplace content: three to five issues\n';
  const worktree = 'worktree content: a line only this checkout carries\n';
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    marketplaceContent: marketplace, treeContent: worktree,
  });
  assert(stub.sourcePluginPath !== stub.treePluginPath && treeContentNow(stub) !== marketplaceContentNow(stub),
    'W1 (fixture control): the invoking tree is a DIFFERENT directory from the marketplace source, with different content');
  assert(dirsEqual(servedDirNow(stub), stub.sourcePluginPath),
    'W1 (fixture control): the cache is byte-equal to the marketplace source');
  const r = runWrapper(stub, ['--yes']);
  assert(mutatingCalls(stub).length === 0,
    'W1: a runtime already serving its source is NOT refreshed — calls: ' + JSON.stringify(readCalls(stub)));
  assert(/marketplace plugin already at 5\.0\.0/.test(r.out),
    'W1: it is reported current — tail: ' + r.out.split('\n').slice(-8).join(' | '));
  assert(r.status === 0, 'W1: the wrapper exits 0 (got ' + r.status + ')');
  assert(/codex\s+PASS/.test(r.out), 'W1: codex reads PASS');
  assert(!/codex\s+FAIL/.test(r.out),
    'W1: a converged runtime is never FAIL just because the invoking tree differs from its source');
  assert(r.out.includes('all runtimes OK'), 'W1: all-clear on a converged box');
}

// Test W2 — the converse, and the real defect: the cache matches the INVOKING TREE but
// not what its source would install. A tree-based oracle sees nothing to do; the runtime
// is nevertheless serving content its own marketplace has moved past, and a refresh both
// applies and converges.
{
  const marketplace = 'marketplace content: three to five issues\n';
  const worktree = 'worktree content: what the cache also carries\n';
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    marketplaceContent: marketplace, treeContent: worktree, installedContent: worktree,
  });
  assert(servedContentNow(stub) === treeContentNow(stub),
    'W2 (fixture control): the cache matches the invoking tree, so a tree oracle sees nothing to do');
  assert(servedContentNow(stub) !== marketplaceContentNow(stub),
    'W2 (fixture control): but it is not what the configured source would install');
  const r = runWrapper(stub, ['--yes']);
  const calls = mutatingCalls(stub);
  assert(calls.some(c => c.startsWith('plugin remove kaola-workflow@stub-market')),
    'W2: `codex plugin remove <pluginId>` was issued — calls: ' + JSON.stringify(readCalls(stub)));
  assert(calls.some(c => c.startsWith('plugin add kaola-workflow@stub-market')),
    'W2: `codex plugin add <pluginId>` was issued — calls: ' + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === marketplaceContentNow(stub),
    'W2: the runtime ends up serving what its configured source installs — got '
      + JSON.stringify(servedContentNow(stub)));
  assert(installedVersionNow(stub) === '5.0.0', 'W2: the version never moved');
  assert(r.status === 0, 'W2: a converged run exits 0 (got ' + r.status + ')');
  assert(/codex\s+PASS/.test(r.out), 'W2: codex reads PASS once it serves its source');
}

// Test W3 — NO REACHABLE STATE DEMANDS A REFRESH THAT CANNOT CONVERGE. From a worktree
// that differs from the marketplace source, with a cache stale against both: the refresh
// must converge, and a second immediate invocation must find nothing left to do. A
// trigger whose refresh cannot satisfy it churns and reports FAIL forever; running the
// wrapper twice is the honest way to say that cannot happen.
{
  const marketplace = 'marketplace content: three to five issues\n';
  const worktree = 'worktree content: a line only this checkout carries\n';
  const stale = 'cache content: A run normally carries one issue\n';
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    marketplaceContent: marketplace, treeContent: worktree, installedContent: stale,
  });
  assert(servedContentNow(stub) !== marketplaceContentNow(stub)
    && servedContentNow(stub) !== treeContentNow(stub),
    'W3 (fixture control): the cache starts stale against BOTH trees');
  const first = runWrapper(stub, ['--yes']);
  assert(mutatingCalls(stub).length > 0,
    'W3: the first run refreshed — calls: ' + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === marketplaceContentNow(stub),
    'W3: the refresh installed what the source serves — got ' + JSON.stringify(servedContentNow(stub)));
  assert(first.status === 0,
    'W3: the refresh CONVERGED, so the first run exits 0 (got ' + first.status + ') — tail: '
      + first.out.split('\n').slice(-8).join(' | '));
  assert(/codex\s+PASS/.test(first.out), 'W3: the first run reads PASS');

  const afterFirst = readCalls(stub).length;
  const second = runWrapper(stub, ['--yes']);
  const secondCalls = readCalls(stub).slice(afterFirst)
    .filter(c => c.startsWith('plugin add') || c.startsWith('plugin remove'));
  assert(secondCalls.length === 0,
    'W3: a second immediate invocation refreshes NOTHING — a converged runtime can never '
      + 'be asked to converge again — calls: ' + JSON.stringify(secondCalls));
  assert(second.status === 0, 'W3: the second run exits 0 (got ' + second.status + ')');
  assert(/marketplace plugin already at 5\.0\.0/.test(second.out),
    'W3: the second run reports the runtime current — tail: '
      + second.out.split('\n').slice(-8).join(' | '));
  assert(!/codex\s+FAIL/.test(second.out), 'W3: no permanently-red row');
  assert(second.out.includes('all runtimes OK'), 'W3: the all-clear survives a repeat run');
}

// ---- 6. AN UNANSWERABLE CONTENT CHECK IS REPORTED, NEVER SILENTLY PASSED ----
// The content comparison has three outcomes, not two: same, differs, and NOT ANSWERABLE
// (no install-from path on the row, a path that is not there, a directory nothing can
// read, a cache that is not where the layout says). Treating unknown as same is the
// original defect arriving through a different door: a row certifying that the runtime
// serves what its source installs, when nothing ever read either side. The file's own
// status table already names this case — PARTIAL is "a check that DOES apply could not be
// completed (reason printed); never a bare PASS, never a wrapper failure" — and PASS now
// means the runtime "serves what its source installs", which an unmeasured box has not
// shown. The stance stays NO-CHURN: unknown must not trigger a refresh either, since a
// difference nobody could measure gives a refresh nothing to converge to.
{
  // The row a genuinely verified, genuinely converged runtime prints. Every unanswerable
  // state below must be DISTINGUISHABLE from this line — that is the whole property, and
  // comparing against a real control says it without pinning any wording.
  const verified = stubRoot({ treeVersion: '5.0.0', installedVersion: '5.0.0' });
  const verifiedRun = runWrapper(verified, ['--yes']);
  const verifiedRow = codexSummaryRow(verifiedRun.out);
  assert(/PASS/.test(verifiedRow) && mutatingCalls(verified).length === 0,
    'X (control): a verified converged runtime reads PASS with no churn — row: ' + JSON.stringify(verifiedRow));

  // Each case: how the fixture makes the content question unanswerable, and a prepare hook
  // for the states that need the filesystem changed after the root is built.
  const unanswerable = [
    {
      name: 'X1', why: 'the row declares no install-from path at all',
      opts: { rowSourcePath: null },
    },
    {
      name: 'X2', why: 'the declared install-from path is not there',
      opts: { rowSourcePath: path.join(tmpBase(), 'kaola-no-such-plugin-source-dir') },
    },
    {
      name: 'X3', why: 'the source directory cannot be read',
      // A SEPARATE marketplace checkout, so the directory made unreadable is not the one
      // holding the codex installer the wrapper has to run.
      opts: { marketplaceContent: 'marketplace content\n' },
      prepare: stub => {
        fs.chmodSync(stub.sourcePluginPath, 0o000);
        let threw = false;
        try { fs.readdirSync(stub.sourcePluginPath); } catch (_) { threw = true; }
        assert(threw, 'X3 (fixture control): the source directory is genuinely unreadable');
      },
      restore: stub => fs.chmodSync(stub.sourcePluginPath, 0o755),
    },
    {
      name: 'X4', why: 'the cache is not where the version-keyed layout says it is',
      opts: {},
      prepare: stub => {
        fs.rmSync(servedDirNow(stub), { recursive: true, force: true });
        assert(!fs.existsSync(servedDirNow(stub)),
          'X4 (fixture control): the served directory is genuinely absent');
      },
    },
  ];

  for (const c of unanswerable) {
    const stub = stubRoot(Object.assign({ treeVersion: '5.0.0', installedVersion: '5.0.0' }, c.opts));
    let r;
    try {
      if (c.prepare) c.prepare(stub);
      r = runWrapper(stub, ['--yes']);
    } finally {
      if (c.restore) c.restore(stub);
    }
    const row = codexSummaryRow(r.out);
    assert(r.status === 0,
      `${c.name}: an unverifiable check is never a wrapper failure (got ${r.status}) — ${c.why}`);
    assert(mutatingCalls(stub).length === 0,
      `${c.name}: NO refresh is attempted when the comparison is unanswerable — ${c.why} — calls: `
        + JSON.stringify(readCalls(stub)));
    assert(row !== verifiedRow,
      `${c.name}: the row is DISTINGUISHABLE from a verified PASS — ${c.why} — got ${JSON.stringify(row)}, `
        + `verified reads ${JSON.stringify(verifiedRow)}`);
    assert(!/codex\s+PASS/.test(r.out),
      `${c.name}: an unmeasured runtime never reads PASS — ${c.why} — row: ${JSON.stringify(row)}`);
    assert(/codex\s+PARTIAL/.test(r.out),
      `${c.name}: a check that applies but could not be completed reads PARTIAL — ${c.why} — row: `
        + JSON.stringify(row));
    assert(!r.out.includes('all runtimes OK'),
      `${c.name}: the all-clear is withheld when currency was never measured — ${c.why}`);
  }
}

// Test Z1 — THE OTHER EDGE OF THE SAME RULE: a check that does not apply is not a check
// that could not be completed. Degrade only when the comparison was ATTEMPTED and came
// back unanswerable. Where no local directory is claimed to arbitrate the plugin at all,
// nothing is attempted, so nothing is left incomplete — and UNVERIFIED has to keep meaning
// "I tried and could not tell" rather than "there was nothing to try", or the status stops
// carrying information. Reporting these as UNVERIFIED is the failure mode
// `codex_not_applicable` was introduced to remove ("reporting it as permanently UNVERIFIED
// was noise, not a signal"), and it would fire on every run of an ordinary box.
//
// Two provenance shapes, one rule. A GIT-sourced marketplace serves a fetched snapshot; a
// row with NO marketplaceSource claims no source directory at all — and live rows of that
// second kind exist, so it is an ordinary configuration, not a broken one. These cases
// exist because the X cases alone cannot see the difference: a fix that degrades on ANY
// unconfirmed content check passes all four of them while re-creating exactly that noise.
for (const shape of [
  { name: 'Z1[git]', sourceType: 'git', content: 'snapshot content\n',
    why: 'a git-sourced marketplace serves a fetched snapshot' },
  { name: 'Z1[no-provenance]', sourceType: null, content: 'unknown-provenance content\n',
    why: 'a row with no marketplaceSource claims no source directory at all' },
]) {
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    installedContent: shape.content, sourceType: shape.sourceType,
  });
  assert(servedContentNow(stub) !== treeContentNow(stub),
    `${shape.name} (fixture control): the served content differs from the tree, so any content `
      + 'check that ran at all would have something to say');
  const r = runWrapper(stub, ['--yes']);
  assert(r.status === 0, `${shape.name}: exits 0 (got ${r.status})`);
  assert(mutatingCalls(stub).length === 0,
    `${shape.name}: no churn — calls: ` + JSON.stringify(readCalls(stub)));
  assert(servedContentNow(stub) === shape.content, `${shape.name}: the cache is left untouched`);
  assert(/codex\s+PASS/.test(r.out),
    `${shape.name}: reads PASS — the check did not apply, so nothing was left incomplete (${shape.why})`
      + ' — row: ' + JSON.stringify(codexSummaryRow(r.out)));
  assert(!/codex\s+PARTIAL/.test(r.out),
    `${shape.name}: N/A is not UNVERIFIED — never degraded (${shape.why}) — row: `
      + JSON.stringify(codexSummaryRow(r.out)));
  assert(!/convergence is UNVERIFIED/.test(r.out),
    `${shape.name}: an ordinary box is not reported as permanently unverified — tail: `
      + r.out.split('\n').slice(-8).join(' | '));
  assert(!/STALE|PENDING/.test(r.out),
    `${shape.name}: nor is it reported as stale — the tree is not its arbiter — tail: `
      + r.out.split('\n').slice(-8).join(' | '));
  assert(r.out.includes('all runtimes OK'),
    `${shape.name}: the all-clear stands — this box is healthy, not degraded`);
}

// ---- 7. ONE ORACLE, BOTH SITES: the version proof must not re-import the invoking tree ----
// The trigger asks its question of the install-from path; if the proof afterwards asks its
// question of the invoking tree, the two can disagree permanently. A marketplace checkout
// that has taken a release the invoking worktree has not is exactly that: the refresh
// converges the runtime BYTE-EXACTLY to its source and the proof then calls it not
// converged, because the source's version is not the invoking tree's. Nothing can repair
// that — the source installs what it installs — so the row is red on every run. This
// extends W1's rule into the version dimension: a converged runtime is never FAIL just
// because the invoking tree differs from its source.

// Test Y1 — the loop itself, and its absence after the fix: refresh, converge to the
// source byte-exactly, and find nothing left to do on a second immediate invocation.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    marketplaceVersion: '6.0.0', marketplaceContent: 'marketplace content: the released prose\n',
    installedContent: 'cache content: what was added at 5.0.0\n',
  });
  assert(stub.marketplaceVersion === '6.0.0' && stub.treeVersion === '5.0.0',
    'Y1 (fixture control): the marketplace checkout declares a version the invoking tree does not');
  assert(!dirsEqual(servedDirNow(stub), stub.sourcePluginPath),
    'Y1 (fixture control): the cache starts stale against its source');

  const first = runWrapper(stub, ['--yes']);
  assert(mutatingCalls(stub).length > 0,
    'Y1: the first run refreshed — calls: ' + JSON.stringify(readCalls(stub)));
  assert(dirsEqual(servedDirNow(stub), stub.sourcePluginPath),
    'Y1: the refresh converged the runtime BYTE-EXACTLY to what its source installs');
  assert(!/codex\s+FAIL/.test(first.out),
    'Y1: a runtime serving exactly its source is not FAIL — tail: '
      + first.out.split('\n').slice(-8).join(' | '));
  assert(first.status === 0, 'Y1: the first run exits 0 (got ' + first.status + ')');
  assert(first.out.includes('all runtimes OK'),
    'Y1: the box is healthy — the check completed and the answer was "converged"');

  const afterFirst = readCalls(stub).length;
  const second = runWrapper(stub, ['--yes']);
  const secondCalls = readCalls(stub).slice(afterFirst)
    .filter(c => c.startsWith('plugin add') || c.startsWith('plugin remove'));
  assert(secondCalls.length === 0,
    'Y1: a second immediate invocation refreshes NOTHING — the runtime already serves its '
      + 'source and no repair could change that — calls: ' + JSON.stringify(secondCalls));
  assert(second.status === 0, 'Y1: the second run exits 0 (got ' + second.status + ')');
  assert(!/codex\s+FAIL/.test(second.out), 'Y1: no permanently-red row');
}

// Test Y2 — the same state under --strict, where a false FAIL costs more than a wrong row:
// the abort stops the sequence and kimi is never installed at all.
{
  const stub = stubRoot({
    treeVersion: '5.0.0', installedVersion: '5.0.0',
    marketplaceVersion: '6.0.0', marketplaceContent: 'marketplace content: the released prose\n',
    installedContent: 'cache content: what was added at 5.0.0\n',
  });
  const r = runWrapper(stub, ['--yes', '--strict']);
  assert(fs.existsSync(stub.markers.kimi),
    'Y2: --strict does not abort over a runtime that serves its source — kimi still installed');
  assert(r.status === 0, 'Y2: --strict exits 0 on a converged box (got ' + r.status + ')');
  assert(!r.out.includes('--strict abort'),
    'Y2: no strict abort — tail: ' + r.out.split('\n').slice(-8).join(' | '));
}

// Test Q — static guards on the REAL wrapper + tree (the stubs above prove behavior; these
// pin the version SOURCE and the hermetic seam so neither can be quietly swapped).
{
  assert(wrapperSrc.includes('.codex-plugin/plugin.json'),
    'Q: install-all.sh reads the Codex plugin version from .codex-plugin/plugin.json');
  assert(!/^CODEX_PLUGIN_NAME="kaola-workflow"/m.test(wrapperSrc),
    'Q: the Codex plugin NAME is never hardcoded (it is read out of the forge-selected manifest)');
  assert(wrapperSrc.includes('codex_tree_plugin_name'),
    'Q: install-all.sh derives the plugin name from the tree manifest');
  assert(wrapperSrc.includes('KAOLA_CODEX_LIST_TIMEOUT_SECS'),
    'Q: the `codex plugin list` read is bounded by a configurable ceiling');
  assert(/NOT APPLICABLE/.test(wrapperSrc),
    'Q: absent tooling has its own NOT-APPLICABLE vocabulary, distinct from UNVERIFIED');
  for (const forgeDir of ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea']) {
    const m = path.join(REPO, 'plugins', forgeDir, '.codex-plugin', 'plugin.json');
    let declared = null;
    try { declared = JSON.parse(fs.readFileSync(m, 'utf8')).name; } catch (_) {}
    assert(declared === forgeDir,
      `Q: ${forgeDir}/.codex-plugin/plugin.json declares its own plugin name — got ${JSON.stringify(declared)}`);
  }
  assert(!/CODEX_PLUGIN_MANIFEST=.*package\.json/.test(wrapperSrc),
    'Q: install-all.sh never sources the Codex plugin version from package.json');
  assert(wrapperSrc.includes('plugin list --json'),
    'Q: install-all.sh reads the installed version from `codex plugin list --json`');
  assert(wrapperSrc.includes('KAOLA_CODEX_BIN'),
    'Q: install-all.sh honors the KAOLA_CODEX_BIN test seam (hermetic chains)');
  assert(/PARTIAL/.test(wrapperSrc), 'Q: the PARTIAL (skipped-with-reason) status exists');
  const treeManifest = path.join(REPO, 'plugins', 'kaola-workflow', '.codex-plugin', 'plugin.json');
  assert(fs.existsSync(treeManifest), 'Q: the real .codex-plugin/plugin.json exists in the tree');
  let treeVer = null;
  try { treeVer = JSON.parse(fs.readFileSync(treeManifest, 'utf8')).version; } catch (_) {}
  assert(typeof treeVer === 'string' && /^\d+\.\d+\.\d+$/.test(treeVer),
    'Q: the real .codex-plugin/plugin.json declares a semver version — got ' + JSON.stringify(treeVer));
}

cleanup();

if (failed) {
  console.error(`\ninstall-all contract test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`install-all contract test passed (${passed} assertions).`);
