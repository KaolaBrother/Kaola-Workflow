#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-forge-resolve.js (#1123 P1) — per-repo forge resolution.
//
// Forge-NEUTRAL by construction: no forge CLI calls, no remote URLs in the
// decision path, no credentials, and no reference to another edition's files.
// This file is byte-identical in all four script trees (canonical github, the
// Codex github copy, gitlab, gitea); edition-sync materializes it and
// validate-script-sync polices the copies.
//
// Resolution order (first DECISIVE layer wins):
//   T1 repo config    kaola-workflow/config.json#forge        (tracked, team)
//   T2 local marker   git config --local kaola-workflow.forge (this clone only)
//   T3 remote host    git remote get-url origin -> forge_hosts / built-ins
//   T4 default        the installed set, only when it has exactly one forge
//
// Semantics (issue #1123 §3.5):
//   invalid T1/T2 value or unreadable/unparseable config -> forge_config_invalid /
//     forge_marker_invalid, NEVER fall through to a lower tier;
//   T1 != T2 -> T1 wins, warning forge_marker_shadowed;
//   T1/T2 vs a decisive T3 -> forge_conflict;
//   T3 unknown (self-host without a mapping, local path, no origin) -> no result;
//   no T1-T3 and installed >= 2 -> forge_unresolved;
//   resolved forge not installed -> forge_not_installed.
//
// Output never contains URL userinfo. `resolve --json` emits the structured
// result; `resolve --shell` emits only the three whitelisted assignments.
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const FORGES = Object.freeze(['github', 'gitlab', 'gitea']);

// The claim entrypoint filename per forge. This is data, not a path into a
// sibling edition: the caller supplies the scripts directory.
const CLAIM_SCRIPTS = Object.freeze({
  github: 'kaola-workflow-claim.js',
  gitlab: 'kaola-gitlab-workflow-claim.js',
  gitea: 'kaola-gitea-workflow-claim.js',
});

const BUILTIN_HOSTS = Object.freeze({
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'gitea.com': 'gitea',
});

const CONFIG_REL = path.join('kaola-workflow', 'config.json');
const MACHINE_CONFIG_REL = path.join('.config', 'kaola-workflow', 'config.json');
const MARKER_KEY = 'kaola-workflow.forge';
const TIER_NAMES = Object.freeze(['config', 'marker', 'remote', 'default']);

function isForge(value) {
  return typeof value === 'string' && FORGES.includes(value);
}

function git(cwd, args) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { ok: true, stdout: String(stdout).trim() };
  } catch (err) {
    return { ok: false, stdout: '', error: err };
  }
}

function repoRoot(cwd) {
  const res = git(cwd, ['rev-parse', '--show-toplevel']);
  return res.ok && res.stdout ? res.stdout : null;
}

// Read a JSON object file without ever echoing its bytes. present/error are
// distinct: a missing file declares nothing; a present but unreadable,
// unparseable, or non-object file is an INVALID DECLARATION (never "no
// declaration") and refuses without falling through.
function readJsonObject(file) {
  let raw;
  try {
    if (!fs.existsSync(file)) return { present: false, value: null, error: null };
    raw = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return { present: true, value: null, error: 'unreadable' };
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch (_) {
    return { present: true, value: null, error: 'unparseable' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { present: true, value: null, error: 'not_an_object' };
  }
  return { present: true, value, error: null };
}

function homeDir(options) {
  if (options && options.home) return path.resolve(String(options.home));
  return process.env.HOME || os.homedir();
}

function tier(tierName, value, detail) {
  return { tier: tierName, value: value == null ? null : value, detail: String(detail) };
}

function tierList(values) {
  return [
    tier('config', values.config, values.config == null
      ? (values.configDetail || 'forge key absent')
      : 'kaola-workflow/config.json#forge'),
    tier('marker', values.marker, values.marker == null
      ? (values.markerDetail || 'kaola-workflow.forge absent')
      : 'git config --local kaola-workflow.forge'),
    tier('remote', values.remote, values.remoteDetail || 'no decisive origin host'),
    tier('default', values.defaultForge, values.defaultDetail || 'installed set'),
  ];
}

// Parse the host (and explicit port) out of a git remote URL. Returns null for
// unknown/local forms. The returned object never carries userinfo.
//   scp:      [user@]host:path
//   ssh/http: scheme://[userinfo@]host[:port]/path
//   git:      git://host/path
//   file:// and local paths are unknown.
function parseRemoteHost(rawUrl) {
  const raw = String(rawUrl == null ? '' : rawUrl).trim();
  if (!raw) return null;

  // Local path forms and file:// are always unknown (never guessed).
  if (/^file:\/\//i.test(raw)) return null;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return null;
  if (/^(?:\.{1,2}\/|\/)/.test(raw)) return null;

  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)/.exec(raw);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (!['ssh', 'http', 'https', 'git'].includes(scheme)) return null;
    return parseAuthority(schemeMatch[2]);
  }

  // scp-like `[user@]host:path`; the `(?!\/\/)` keeps a malformed scheme out.
  const scpMatch = /^(?:[^@/\s]+@)?(\[[^\]]+\]|[^/:\s]+)(?::(?!\/\/))(.+)$/.exec(raw);
  if (scpMatch && scpMatch[2]) return normalizeHost(scpMatch[1]);

  return null;
}

function parseAuthority(authority) {
  let rest = String(authority || '');
  const at = rest.lastIndexOf('@');
  if (at >= 0) rest = rest.slice(at + 1); // strip userinfo before anything is reported
  if (!rest) return null;

  let host = rest;
  let port = '';
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end < 0) return null;
    host = rest.slice(1, end);
    const tail = rest.slice(end + 1);
    if (tail.startsWith(':')) port = tail.slice(1);
    else if (tail) return null;
  } else {
    const first = rest.indexOf(':');
    if (first >= 0) {
      if (rest.indexOf(':', first + 1) >= 0) return null; // unbracketed IPv6 is not guessed
      host = rest.slice(0, first);
      port = rest.slice(first + 1);
    }
  }
  if (!host) return null;
  if (port && !/^\d+$/.test(port)) return null;
  return normalizeHost(host, port);
}

function normalizeHost(host, port) {
  let value = String(host || '').trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  if (!value) return null;
  // Hostnames, IPv4, and IPv6 literals only — never a path fragment.
  if (!/^[a-z0-9._-]+$/i.test(value) && !/^[0-9a-f:]+$/i.test(value)) return null;
  const normalizedPort = port == null ? '' : String(port);
  return { host: value, port: normalizedPort };
}

function readForgeHosts(machineFile) {
  const machine = readJsonObject(machineFile);
  if (!machine.present) return { ok: true, hosts: {} };
  if (machine.error) {
    return { ok: false, reason: 'forge_config_invalid',
      detail: 'machine config ' + machineFile + ' is ' + machine.error };
  }
  const declared = machine.value.forge_hosts;
  if (declared == null) return { ok: true, hosts: {} };
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
    return { ok: false, reason: 'forge_config_invalid',
      detail: 'machine config forge_hosts must be an object' };
  }
  const hosts = {};
  for (const key of Object.keys(declared)) {
    const value = declared[key];
    if (!isForge(value)) {
      return { ok: false, reason: 'forge_config_invalid',
        detail: 'machine config forge_hosts["' + key + '"] is not a forge' };
    }
    hosts[String(key).toLowerCase()] = value;
  }
  return { ok: true, hosts };
}

function mapHost(hostInfo, forgeHosts) {
  const hostPort = hostInfo.port ? hostInfo.host + ':' + hostInfo.port : hostInfo.host;
  if (Object.prototype.hasOwnProperty.call(forgeHosts, hostPort)) return forgeHosts[hostPort];
  if (Object.prototype.hasOwnProperty.call(forgeHosts, hostInfo.host)) return forgeHosts[hostInfo.host];
  if (Object.prototype.hasOwnProperty.call(BUILTIN_HOSTS, hostInfo.host)) return BUILTIN_HOSTS[hostInfo.host];
  return null;
}

function parseInstalled(value) {
  if (value == null) return FORGES.slice();
  const list = Array.isArray(value) ? value : String(value).split(',');
  const out = [];
  for (const item of list) {
    const forge = String(item == null ? '' : item).trim();
    if (!forge) continue;
    if (!isForge(forge)) {
      return { ok: false, reason: 'forge_installed_invalid',
        detail: 'installed set contains unknown forge "' + forge + '"' };
    }
    if (!out.includes(forge)) out.push(forge);
  }
  return { ok: true, installed: out };
}

// Resolve the forge for one repository.
//   options.cwd       repository path (default process.cwd())
//   options.home      HOME override for the machine config (tests)
//   options.installed installed forge set (array or CSV; default all three)
// Returns { ok:true, forge, source, host, tiers, warnings } or
//         { ok:false, reason, detail, host?, forge?, tiers?, warnings }.
function resolveForge(options) {
  const opts = options || {};
  const cwd = path.resolve(opts.cwd || process.cwd());
  const installedParsed = parseInstalled(opts.installed);
  if (!installedParsed.ok) return installedParsed;
  const installed = installedParsed.installed;

  const root = repoRoot(cwd);
  if (!root) {
    return {
      ok: false,
      reason: 'not_a_git_repo',
      detail: 'no git repository at ' + cwd,
      tiers: tierList({}),
      warnings: [],
    };
  }

  const warnings = [];

  // T1 — tracked repo config.
  const repoConfigFile = path.join(root, CONFIG_REL);
  const repoConfig = readJsonObject(repoConfigFile);
  let configForge = null;
  let configDetail = 'forge key absent';
  if (repoConfig.present) {
    if (repoConfig.error) {
      return {
        ok: false, reason: 'forge_config_invalid',
        detail: 'repo config ' + CONFIG_REL + ' is ' + repoConfig.error,
        tiers: tierList({}), warnings,
      };
    }
    if (Object.prototype.hasOwnProperty.call(repoConfig.value, 'forge')) {
      const declared = repoConfig.value.forge;
      if (!isForge(declared)) {
        return {
          ok: false, reason: 'forge_config_invalid',
          detail: 'repo config ' + CONFIG_REL + '#forge is not a forge',
          tiers: tierList({}), warnings,
        };
      }
      configForge = declared;
      configDetail = 'kaola-workflow/config.json#forge';
    }
  }

  // T2 — clone-local marker.
  let markerForge = null;
  let markerDetail = 'kaola-workflow.forge absent';
  const marker = git(root, ['config', '--local', '--get', MARKER_KEY]);
  if (marker.ok && marker.stdout) {
    if (!isForge(marker.stdout)) {
      return {
        ok: false, reason: 'forge_marker_invalid',
        detail: 'git config --local ' + MARKER_KEY + ' is not a forge',
        tiers: tierList({ config: configForge, configDetail }), warnings,
      };
    }
    markerForge = marker.stdout;
    markerDetail = 'git config --local ' + MARKER_KEY;
  }

  if (configForge && markerForge && configForge !== markerForge) {
    warnings.push('forge_marker_shadowed');
  }

  // T3 — origin host. `git remote get-url` expands url.<base>.insteadOf, so the
  // host below is the rewritten destination, not the short alias.
  let host = null;
  let remoteForge = null;
  let remoteDetail = 'no origin';
  const remote = git(root, ['remote', 'get-url', 'origin']);
  if (remote.ok && remote.stdout) {
    const hostInfo = parseRemoteHost(remote.stdout);
    if (!hostInfo) {
      remoteDetail = 'origin is a local path or an unparseable URL';
    } else {
      host = hostInfo.port ? hostInfo.host + ':' + hostInfo.port : hostInfo.host;
      const machineFile = path.join(homeDir(opts), MACHINE_CONFIG_REL);
      const hosts = readForgeHosts(machineFile);
      if (!hosts.ok) {
        return {
          ok: false, reason: hosts.reason, detail: hosts.detail, host,
          tiers: tierList({ config: configForge, configDetail, marker: markerForge, markerDetail, remoteDetail: 'origin host ' + host }),
          warnings,
        };
      }
      remoteForge = mapHost(hostInfo, hosts.hosts);
      remoteDetail = remoteForge
        ? 'origin host ' + host + ' -> ' + remoteForge
        : 'origin host ' + host + ' is unmapped';
    }
  }

  const remoteTier = { remote: remoteForge, remoteDetail };

  // Conflict: a config/marker decision against a decisive remote mapping.
  const declaredForge = configForge || markerForge || null;
  if (declaredForge && remoteForge && declaredForge !== remoteForge) {
    return {
      ok: false, reason: 'forge_conflict',
      detail: 'config/marker says ' + declaredForge + ' but origin host ' + host
        + ' maps to ' + remoteForge,
      forge: declaredForge, host,
      tiers: tierList(Object.assign({ config: configForge, configDetail, marker: markerForge, markerDetail }, remoteTier)),
      warnings,
    };
  }

  let forge = null;
  let source = null;
  if (configForge) { forge = configForge; source = 'config'; }
  else if (markerForge) { forge = markerForge; source = 'marker'; }
  else if (remoteForge) { forge = remoteForge; source = 'remote'; }

  let defaultForge = null;
  let defaultDetail = 'installed set [' + installed.join(',') + ']';
  if (!forge) {
    if (installed.length === 1) {
      forge = installed[0];
      source = 'default';
      defaultForge = forge;
      defaultDetail = 'the only installed forge';
    } else {
      return {
        ok: false, reason: 'forge_unresolved',
        detail: 'no config, marker, or origin mapping decided the forge; installed set ['
          + installed.join(',') + '] has ' + installed.length + ' members',
        operator_hint: 'Declare the repo forge in one of three ways: kaola-workflow/config.json '
          + 'with "forge": "<github|gitlab|gitea>"; git config --local kaola-workflow.forge '
          + '<github|gitlab|gitea>; or map a self-hosted origin under '
          + '~/.config/kaola-workflow/config.json#forge_hosts. Then install that edition with '
          + './install.sh --yes --forge=<github|gitlab|gitea>.',
        host,
        tiers: tierList(Object.assign({ config: configForge, configDetail, marker: markerForge, markerDetail }, remoteTier)),
        warnings,
      };
    }
  }

  if (!installed.includes(forge)) {
    return {
      ok: false, reason: 'forge_not_installed',
      detail: 'resolved ' + forge + ' is not in the installed set [' + installed.join(',') + ']',
      operator_hint: 'Install the resolved edition with ./install.sh --yes --forge=' + forge
        + ' (or the matching runtime installer), or include it in a multi-forge install: '
        + './install.sh --yes --forge=' + installed.join(',') + ',' + forge + '.',
      forge, host,
      tiers: tierList(Object.assign({ config: configForge, configDetail, marker: markerForge, markerDetail }, remoteTier)),
      warnings,
    };
  }

  return {
    ok: true,
    forge,
    source,
    host,
    tiers: tierList(Object.assign({
      config: configForge, configDetail,
      marker: markerForge, markerDetail,
      defaultForge, defaultDetail,
    }, remoteTier)),
    warnings,
  };
}

// P1 edition guard. Each edition passes its own forge and treats its installed
// set as exactly itself; a different resolution is `forge_mismatch` (including
// the resolver's `forge_not_installed`, which is how a foreign origin appears
// from a single-edition install). Other resolver refusals pass through typed.
function guardEdition(editionForge, options) {
  if (!isForge(editionForge)) throw new Error('unknown edition forge: ' + editionForge);
  const opts = options || {};
  const res = resolveForge({
    cwd: opts.cwd,
    home: opts.home,
    installed: [editionForge],
  });
  // No repository means no repo-scoped declaration and no origin: T1-T3 declare
  // nothing, and T4 would resolve to this edition's only installed forge. Pass,
  // preserving the pre-guard behavior for non-git fixture/main roots. (The CLI
  // `resolve` command still reports not_a_git_repo when asked directly.)
  if (!res.ok && res.reason === 'not_a_git_repo') return null;
  if (res.ok && res.forge === editionForge) return null;

  let reason = res.reason || 'forge_mismatch';
  if (res.forge && res.forge !== editionForge
      && (reason === 'forge_not_installed' || res.ok)) {
    reason = 'forge_mismatch';
  }
  return {
    ok: false,
    reason,
    edition: editionForge,
    resolved: res.forge || null,
    host: res.host || null,
    detail: res.detail || ('repo resolves to ' + (res.forge || 'an unknown forge')
      + ', this edition is ' + editionForge),
    operator_hint: reason === 'forge_mismatch'
      ? 'This repository is not on the ' + editionForge + ' forge. Run the edition that matches '
        + 'the resolved host, or declare the repo in kaola-workflow/config.json#forge / '
        + 'git config --local ' + MARKER_KEY + ' and map self-hosted hosts under '
        + '~/.config/kaola-workflow/config.json#forge_hosts.'
      : 'Forge resolution refused before any forge CLI call: ' + reason + '.',
  };
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

function shellAssignments(result, scriptsDir) {
  let configured = scriptsDir;
  if (configured && typeof configured === 'object') {
    configured = configured[result.forge] || configured.default;
  }
  const dir = path.resolve(configured || __dirname);
  return [
    'KW_FORGE=' + shellQuote(result.forge),
    'KAOLA_SCRIPTS=' + shellQuote(dir),
    'CLAIM_JS=' + shellQuote(path.join(dir, CLAIM_SCRIPTS[result.forge])),
  ].join('\n');
}

function setForge(forge, options) {
  if (!isForge(forge)) return { ok: false, reason: 'forge_invalid', detail: 'unknown forge "' + forge + '"' };
  const opts = options || {};
  const cwd = path.resolve(opts.cwd || process.cwd());
  const root = repoRoot(cwd);
  if (!root) return { ok: false, reason: 'not_a_git_repo', detail: 'no git repository at ' + cwd };
  const res = git(root, ['config', '--local', MARKER_KEY, forge]);
  if (!res.ok) return { ok: false, reason: 'forge_marker_write_failed', detail: 'git config --local failed' };
  return { ok: true, forge, root };
}

function unsetForge(options) {
  const opts = options || {};
  const cwd = path.resolve(opts.cwd || process.cwd());
  const root = repoRoot(cwd);
  if (!root) return { ok: false, reason: 'not_a_git_repo', detail: 'no git repository at ' + cwd };
  const res = git(root, ['config', '--local', '--unset', MARKER_KEY]);
  if (res.ok) return { ok: true, removed: true, root };
  // `git config --unset` exits 5 when the key is absent; that is an idempotent success.
  const code = res.error && typeof res.error.status === 'number' ? res.error.status : null;
  if (code === 5) return { ok: true, removed: false, root };
  return { ok: false, reason: 'forge_marker_unset_failed', detail: 'git config --local --unset failed' };
}

const USAGE = 'usage: kaola-workflow-forge-resolve.js resolve [--json|--shell] [--installed a,b]\n'
  + '                                                [--scripts-dir DIR]\n'
  + '                                                [--scripts-dir-github DIR --scripts-dir-gitlab DIR --scripts-dir-gitea DIR]\n'
  + '                                                [--cwd DIR]\n'
  + '       kaola-workflow-forge-resolve.js set <github|gitlab|gitea> [--cwd DIR] [--json]\n'
  + '       kaola-workflow-forge-resolve.js unset [--cwd DIR] [--json]\n';

function parseCli(argv) {
  const out = { mode: null, json: false, shell: false, installed: null, scriptsDir: null,
    scriptsDirGithub: null, scriptsDirGitlab: null, scriptsDirGitea: null, cwd: null, forge: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--shell') out.shell = true;
    else if (arg === '--installed') out.installed = argv[++i];
    else if (arg.startsWith('--installed=')) out.installed = arg.slice('--installed='.length);
    else if (arg === '--scripts-dir') out.scriptsDir = argv[++i];
    else if (arg.startsWith('--scripts-dir=')) out.scriptsDir = arg.slice('--scripts-dir='.length);
    else if (arg === '--scripts-dir-github') out.scriptsDirGithub = argv[++i];
    else if (arg.startsWith('--scripts-dir-github=')) out.scriptsDirGithub = arg.slice('--scripts-dir-github='.length);
    else if (arg === '--scripts-dir-gitlab') out.scriptsDirGitlab = argv[++i];
    else if (arg.startsWith('--scripts-dir-gitlab=')) out.scriptsDirGitlab = arg.slice('--scripts-dir-gitlab='.length);
    else if (arg === '--scripts-dir-gitea') out.scriptsDirGitea = argv[++i];
    else if (arg.startsWith('--scripts-dir-gitea=')) out.scriptsDirGitea = arg.slice('--scripts-dir-gitea='.length);
    else if (arg === '--cwd') out.cwd = argv[++i];
    else if (arg.startsWith('--cwd=')) out.cwd = arg.slice('--cwd='.length);
    else if (arg === '--help' || arg === '-h') out.mode = 'help';
    else rest.push(arg);
  }
  out.mode = out.mode || rest.shift() || null;
  out.forge = rest.shift() || null;
  return out;
}

function main(argv) {
  const cli = parseCli(argv);
  if (cli.mode === 'help' || !cli.mode) { process.stdout.write(USAGE); return 0; }

  if (cli.mode === 'resolve') {
    const result = resolveForge({ cwd: cli.cwd || process.cwd(), installed: cli.installed });
    if (cli.shell) {
      if (!result.ok) {
        process.stderr.write('forge-resolve: ' + result.reason + ' — ' + result.detail + '\n');
        if (result.operator_hint) process.stderr.write(result.operator_hint + '\n');
        return 1;
      }
      process.stdout.write(shellAssignments(result, {
        github: cli.scriptsDirGithub,
        gitlab: cli.scriptsDirGitlab,
        gitea: cli.scriptsDirGitea,
        default: cli.scriptsDir,
      }) + '\n');
      return 0;
    }
    process.stdout.write(JSON.stringify(result) + '\n');
    return result.ok ? 0 : 1;
  }

  if (cli.mode === 'set') {
    if (!cli.forge) { process.stderr.write(USAGE); return 2; }
    const result = setForge(cli.forge, { cwd: cli.cwd || process.cwd() });
    if (cli.json) process.stdout.write(JSON.stringify(result) + '\n');
    else if (result.ok) process.stdout.write('set ' + MARKER_KEY + '=' + result.forge + '\n');
    else process.stderr.write('forge-resolve: ' + result.reason + ' — ' + result.detail + '\n');
    return result.ok ? 0 : 1;
  }

  if (cli.mode === 'unset') {
    const result = unsetForge({ cwd: cli.cwd || process.cwd() });
    if (cli.json) process.stdout.write(JSON.stringify(result) + '\n');
    else if (result.ok) process.stdout.write((result.removed ? 'unset ' : 'absent ') + MARKER_KEY + '\n');
    else process.stderr.write('forge-resolve: ' + result.reason + ' — ' + result.detail + '\n');
    return result.ok ? 0 : 1;
  }

  process.stderr.write('forge-resolve: unknown command "' + cli.mode + '"\n' + USAGE);
  return 2;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write('forge-resolve: ' + err.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = {
  FORGES,
  CLAIM_SCRIPTS,
  BUILTIN_HOSTS,
  MARKER_KEY,
  parseRemoteHost,
  resolveForge,
  guardEdition,
  shellAssignments,
  setForge,
  unsetForge,
  readJsonObject,
  main,
};
