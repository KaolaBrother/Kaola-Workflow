#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// runtime-edition-forge.js — the runtime x forge layout, single-sourced.
//
// An ADDITIVE runtime edition (opencode, Kimi Code, Grok CLI, Cursor) is a runtime, not a forge:
// it is not wired into `npm test`, `edition-sync.js`, `install.sh`, or the SIX
// routing surfaces, and it keeps its own suite. It nevertheless has to KNOW the
// forge it is being installed for, because the workflow prose is forge-shaped:
// `gh` vs `glab` vs `tea`, PR vs MR, and per-forge support-script basenames.
//
// This module is the ONE place that answers "what does forge F look like to a
// runtime edition". Every fact it returns is DERIVED, never restated:
//
//   - the forge axis + the per-forge command surfaces come from
//     generate-routing-surfaces.js (the registry that renders the committed
//     surfaces), so a runtime edition's forge variants are GENERATED from the
//     same source — there is nothing to hand-port and nothing to drift.
//   - the per-forge support-script basenames come from
//     kaola-workflow-install-manifest.js (`renameIfPorted`), the same transform
//     install.sh consumes.
//
// Neither of those sources is modified by this module: it reads them. The
// additive runtime editions (opencode, Kimi, Grok, Cursor) and their installers consume
// it, so adding a forge or a topic is a zero-edit change here.
//
// CLI (used by the installers, which cannot require() a node module inline):
//   --forge=<f> --scripts-dir    absolute dir holding that forge's support scripts
//   --forge=<f> --out-suffix     '' for github, '-<forge>' otherwise
// ---------------------------------------------------------------------------

const path = require('path');
const routing = require('./generate-routing-surfaces.js');
const manifest = require('./kaola-workflow-install-manifest.js');
const agentGen = require('./generate-agent-profiles');

const REPO = path.resolve(__dirname, '..');

// The forge axis, derived from the routing registry. A runtime edition that
// supported a different set than the surfaces it renders would be broken by
// construction, so there is deliberately no second list to keep in step.
const FORGES = routing.FORGES;

// UNKNOWN_FORGE — typed failure code. Callers classify structurally; the CLI
// prints the message and exits 2 (the install manifest's convention).
const UNKNOWN_FORGE = 'unknown_forge';

function assertForge(forge) {
  if (!FORGES.includes(forge)) {
    const err = new Error(`unknown forge "${forge}" (expected one of ${FORGES.join('/')})`);
    err.code = UNKNOWN_FORGE;
    throw err;
  }
  return forge;
}

// The plugin directory name a forge edition ships under, and therefore also the
// Claude support-dir name install.sh deploys to ($HOME/.claude/<this>). github is
// the canonical namespace and carries no suffix.
function pluginDirName(forge) {
  assertForge(forge);
  return forge === 'github' ? 'kaola-workflow' : `kaola-workflow-${forge}`;
}

// Generated-tree suffix for a runtime edition: github keeps the bare `.opencode`
// / `.kimi` path it has always used (byte-identical to before the forge axis),
// gitlab/gitea get sibling trees.
function outSuffix(forge) {
  assertForge(forge);
  return forge === 'github' ? '' : `-${forge}`;
}

// The support scripts a forge ships, as an ABSOLUTE dir. Mirrors install.sh's
// SOURCE_SCRIPTS_DIR case block.
function forgeScriptsDir(forge) {
  assertForge(forge);
  return forge === 'github'
    ? path.join(REPO, 'scripts')
    : path.join(REPO, 'plugins', pluginDirName(forge), 'scripts');
}

// The REPO-RELATIVE self-dev script dir a generated resolver must probe first
// when it is running inside this repository (the `kaola_script()` self-repo
// branch). github resolves `./scripts`; a forge edition resolves its plugin tree.
function selfDevScriptsDir(forge) {
  assertForge(forge);
  return forge === 'github' ? './scripts' : `./plugins/${pluginDirName(forge)}/scripts`;
}

// The forge basename for a canonical support-script basename, via the install
// manifest's rename-IFF-ported transform (the same names install.sh copies).
function scriptName(base, forge) {
  assertForge(forge);
  return manifest.renameIfPorted(base, forge);
}

// The command surfaces a runtime edition renders FROM, for one forge:
// { basename, absPath, topic }. Sourced from the routing registry, so these are
// exactly the generated, byte-checked surfaces — a runtime edition never reads a
// hand-maintained command list.
function commandSources(forge) {
  assertForge(forge);
  return routing.commandSurfacesForForge(forge).map(row => ({
    topic: row.topic,
    basename: path.basename(row.path),
    absPath: path.join(REPO, row.path),
  }));
}

// --- helpers shared by the runtime-edition sync scripts (grok/kimi/cursor/opencode/zcode) ---
// Each was byte-identical across every script that defined it; moved here once so no per-edition
// copy can drift from the others. `treeLabel` and the DEFAULT_FORGE fallback stay per-script (each
// edition's own tree namer / default), so any helper below that needs one takes it as an explicit
// argument instead of closing over a local.

// --- minimal frontmatter parser (only the flat key: value surface we need) ---
function parseFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const mm = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  return { fm, body: m[2] };
}

// Parse a bracketed `tools: [a, b, c]` frontmatter scalar into an array.
function parseTools(raw) {
  if (!raw) return [];
  const inner = String(raw).replace(/^\[/, '').replace(/\]$/, '').trim();
  if (!inner) return [];
  return inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// Some runtime YAML parsers are strict: an unquoted `description: … facts: use …` is
// silently dropped (measured: knowledge-lookup vanished from `grok inspect` until
// the description was JSON-quoted). Quote when the value would not be a plain YAML
// scalar.
function yamlScalar(value) {
  const s = String(value == null ? '' : value);
  if (s === '' || /[:#{}[\],&*!|>'"%@`\n]/.test(s) || /^(true|false|null|~)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

// The full canonical role roster, as every runtime edition's MANAGED_ROLES set derives it.
function listCanonAgents() {
  return [...agentGen.ROLES];
}

// The command surfaces a runtime edition renders FROM, for a forge, as sorted basenames. Sourced
// from the routing-surface registry rather than a directory listing, so the forge variants are the
// generated, byte-checked surfaces themselves — a runtime edition holds no command list of its own
// to drift. `forge` must already be resolved by the caller (each edition applies its own
// DEFAULT_FORGE fallback before calling in).
function listCanonCommands(forge) {
  return commandSources(forge).map(s => s.basename).sort();
}

function canonCommandPath(basename, forge) {
  const src = commandSources(forge).find(s => s.basename === basename);
  if (!src) throw new Error(`no command surface "${basename}" for forge ${forge}`);
  return src.absPath;
}

// Repo-relative path for a generated command file under a runtime's tree. grok, cursor, and zcode
// all carry the identical body; `treeLabel` — each edition's own `.grok`/`.cursor`/`.zcode` +
// forge-suffix namer — is the one per-edition variable, threaded through as an explicit argument
// instead of restated per file.
function commandRel(treeLabelFn, name, forge) {
  return treeLabelFn(forge) + '/commands/' + name + '.md';
}

function main(argv) {
  let forge = null;
  let mode = null;
  for (const arg of argv) {
    if (arg.startsWith('--forge=')) forge = arg.slice('--forge='.length);
    else if (arg === '--scripts-dir') mode = 'scripts-dir';
    else if (arg === '--out-suffix') mode = 'out-suffix';
    else {
      process.stderr.write(`runtime-edition-forge: unknown argument "${arg}"\n`);
      process.exit(2);
    }
  }
  if (!forge || !mode) {
    process.stderr.write(
      'runtime-edition-forge: usage: --forge=<github|gitlab|gitea>'
      + ' (--scripts-dir|--out-suffix)\n');
    process.exit(2);
  }
  try {
    assertForge(forge);
  } catch (e) {
    process.stderr.write(`runtime-edition-forge: ${e.message}\n`);
    process.exit(2);
  }
  if (mode === 'out-suffix') return process.stdout.write(outSuffix(forge) + '\n');
  if (mode === 'scripts-dir') return process.stdout.write(forgeScriptsDir(forge) + '\n');
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  REPO,
  FORGES,
  UNKNOWN_FORGE,
  assertForge,
  pluginDirName,
  outSuffix,
  forgeScriptsDir,
  selfDevScriptsDir,
  scriptName,
  commandSources,
  parseFrontmatter,
  parseTools,
  yamlScalar,
  listCanonAgents,
  listCanonCommands,
  canonCommandPath,
  commandRel,
};
