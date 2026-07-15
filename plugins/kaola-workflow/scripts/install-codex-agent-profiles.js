#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const pluginRoot = path.resolve(__dirname, '..');
// #571: `--global` targets ~/.codex (install once, all repos) regardless of cwd/arg-order.
// Position-robust like --with-fast/--with-full. The positional projectRoot form ("$PWD" /
// "$HOME") still works: take the first non-flag argv, never a leading --flag.
const GLOBAL = process.argv.includes('--global');
const firstPositional = process.argv.slice(2).find(a => !a.startsWith('--'));
const projectRoot = GLOBAL
  ? os.homedir()
  : path.resolve(firstPositional || process.cwd());
const sourceAgentsDir = path.join(pluginRoot, 'agents');
const sourceTemplate = path.join(pluginRoot, 'config', 'agents.toml');
const sourceHooksTemplate = path.join(pluginRoot, 'config', 'hooks.json');
// project-local .codex — agents + config stay here (AC2: profiles unchanged)
const targetCodexDir = path.join(projectRoot, '.codex');
const targetAgentsDir = path.join(targetCodexDir, 'agents', 'kaola-workflow');
const targetConfig = path.join(targetCodexDir, 'config.toml');
// #447: hooks install GLOBALLY into ~/.codex — one location for all projects,
// force-refreshed on every install/upgrade (mirrors the Claude edition's global hooks).
const globalCodexDir = path.join(os.homedir(), '.codex');
const targetHooks = path.join(globalCodexDir, 'hooks.json');
// #409: a stable, version-LESS Codex-owned home for the hook scripts that
// hooks.json points at — mirrors install.sh L250's $SUPPORT_DIR/{hooks,scripts}
// (~/.claude/kaola-workflow). Previously buildManagedHooks substituted `pluginRoot`
// (= path.resolve(__dirname,'..'), the run-time install source) straight into
// __KW_PLUGIN_ROOT__, so hooks.json pointed back at wherever the installer ran from
// (a /tmp worktree purged by macOS, or a version-pinned plugin-cache dir GC'd on the
// next release) → every hook fire exit 127. We now COPY the hook-referenced scripts
// into this version-less home and substitute THIS dir into __KW_PLUGIN_ROOT__.
// pluginRoot STAYS the read SOURCE (sourceAgentsDir / templates / manifest).
// #447: the stable home also lives in the GLOBAL ~/.codex/kaola-workflow.
const targetStableDir = path.join(globalCodexDir, 'kaola-workflow');
const targetStableHooksDir = path.join(targetStableDir, 'hooks');
const targetStableScriptsDir = path.join(targetStableDir, 'scripts');
const beginMarker = '# BEGIN kaola-workflow agents';
const endMarker = '# END kaola-workflow agents';
const PLUGIN_ROOT_TOKEN = '__KW_PLUGIN_ROOT__';
const MANAGED_HOOK_ID_PREFIX = 'kaola-workflow:';

// issue #332: schema + prune + manifest constants.
// MANIFEST_BASENAME — ownership record written inside the managed agents dir so a
//   future installer can distinguish stale Kaola-generated files from user-owned ones.
// RETIRED_PROFILE_FILES — Kaola-generated role files removed/renamed from source. The
//   prune step removes these even with NO manifest present (repairs every pre-manifest
//   machine). docs-lookup.toml was renamed to knowledge-lookup in #249; the six `<role>-max`
//   effort variants were retired in #451. Append here whenever a role file is removed/renamed.
// EFFORT_VALUES — recognized historical values used only to classify migration input.
// Agent profile TOMLs also carry the user-facing role `description` and
// `nickname_candidates` from config/agents.toml so standalone Codex profiles expose
// the same identity metadata as the managed config block.
// NOTE: kaola-workflow-codex-preflight.js DUPLICATES validateProfileText + these
//   constants (the root scripts/ tree has no installer to require, and the preflight
//   is a true 4-tree byte-identical script that may not require() edition code). Keep
//   the two copies in lock-step when editing the schema rules.
const MANIFEST_BASENAME = '.kaola-managed-profiles.json';
const RETIRED_PROFILE_FILES = [
  'docs-lookup.toml',
  // #451: the six `<role>-max` xhigh effort-variant profiles are retired - pruned on upgrade so a
  // machine that installed #405 loses them. NEVER blanket-glob `*-max` (a user may own one); list
  // only the Kaola-generated names.
  'planner-max.toml',
  'code-architect-max.toml',
  'tdd-guide-max.toml',
  'code-reviewer-max.toml',
  'security-reviewer-max.toml',
  'adversarial-verifier-max.toml',
];
const EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh'];
const CODEX_PINNED_STANDARD_ROLES = Object.freeze([
  'code-explorer', 'knowledge-lookup', 'tdd-guide', 'implementer',
  'doc-updater', 'issue-scout', 'contractor', 'metric-optimizer',
]);
const CODEX_PINNED_REASONING_ROLES = Object.freeze([
  'planner', 'code-architect', 'build-error-resolver', 'code-reviewer',
  'security-reviewer', 'adversarial-verifier', 'workflow-planner', 'synthesizer',
]);
// These roles run outside the adaptive Node Ledger. Their named workflow/plan/finalization
// artifacts are the authoritative durable result; when a caller supplies a seeded evidence file,
// the profile additionally mirrors its full packet there. Every other profile is a DAG node role
// and therefore must self-write the exact seeded cache artifact before returning its compact summary.
const CODEX_ORCHESTRATION_ROLES = Object.freeze(['contractor', 'workflow-planner']);
const CODEX_STANDARD_MODEL = 'gpt-5.6-sol';
const CODEX_STANDARD_EFFORT = 'medium';
const CODEX_REASONING_MODEL = 'gpt-5.6-sol';
const CODEX_REASONING_EFFORT = 'xhigh';
const MANIFEST_SCHEMA_VERSION = 1;

// issue #543: --with-fast / --with-full opt-in partition. Adaptive is the unconditional default
// (#538); fast/full are install-time opt-ins recorded in the shared ~/.config/kaola-workflow/config.json
// installed_paths field (read at runtime by the legality gate in kaola-workflow-claim.js via
// adaptive-schema's resolveInstalledPaths). process.argv.includes is position-robust, so
// `node install-... "$PWD" --with-fast` works regardless of arg order. --enable-adaptive is retired
// (#538) → warn + ignore. Unknown args are IGNORED (never hard-fail): the preflight
// (kaola-workflow-codex-preflight.js) and the test suites invoke the installer positionally with a
// project-root argv that must not be rejected.
const WITH_FAST = process.argv.includes('--with-fast');
const WITH_FULL = process.argv.includes('--with-full');
if (process.argv.some(a => a === '--enable-adaptive' || a.startsWith('--enable-adaptive='))) {
  console.warn('Kaola-Workflow Codex installer: --enable-adaptive is retired (#538); adaptive is the unconditional default. Ignoring.');
}

// Named profiles omit model/effort so every role inherits the current parent session. The role lists
// retain only declarative standard/reasoning metadata classes; no variant generation occurs.
// no adaptive-schema require here.

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseTopLevelString(top, key) {
  const re = new RegExp('^' + escapeRegExp(key) + '\\s*=\\s*"([^"]*)"\\s*$', 'm');
  const m = top.match(re);
  return m ? m[1] : null;
}

function parseStringArrayLine(top, key) {
  const re = new RegExp('^' + escapeRegExp(key) + '\\s*=\\s*\\[([^\\]]*)\\]\\s*$', 'm');
  const m = top.match(re);
  if (!m) return { present: false, values: [], valid: true };
  const body = m[1].trim();
  if (!body) return { present: true, values: [], valid: true };
  const values = [];
  const parts = body.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    const pm = part.match(/^"([^"]+)"$/);
    if (!pm) return { present: true, values: [], valid: false };
    values.push(pm[1]);
  }
  return { present: true, values, valid: true };
}

function sameStringArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function managedBlockPattern(flags = 'm') {
  return new RegExp(`${escapeRegExp(beginMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}\\n?`, flags);
}

function stripManagedBlocks(existing) {
  return existing.replace(managedBlockPattern('gm'), '');
}

function isTopLevelTable(line, table) {
  return new RegExp(`^\\s*\\[${escapeRegExp(table)}\\]\\s*(?:#.*)?$`).test(line);
}

function isAnyTopLevelTable(line) {
  return /^\s*\[[^\]\n]+\]\s*(?:#.*)?$/.test(line);
}

function hasTopLevelTable(content, table) {
  return content.split(/\r?\n/).some(line => isTopLevelTable(line, table));
}

function removeTopLevelTable(content, table) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex(line => isTopLevelTable(line, table));
  if (start === -1) return content;

  let end = start + 1;
  while (end < lines.length && !isAnyTopLevelTable(lines[end])) end++;

  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function managedBlock(existing) {
  const hasExternalFeatures = hasTopLevelTable(stripManagedBlocks(existing), 'features');
  const template = hasExternalFeatures
    ? removeTopLevelTable(read(sourceTemplate).trim(), 'features')
    : read(sourceTemplate).trim();
  return `${beginMarker}\n${template}\n${endMarker}`;
}

function upsertBlock(existing, block) {
  const expression = managedBlockPattern();
  if (expression.test(existing)) {
    return existing.replace(expression, `${block}\n`);
  }

  if (existing.trim() === '') {
    return `${block}\n`;
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${separator}${block}\n`;
}

// ---------------------------------------------------------------------------
// #332 schema validation — inline regex, no TOML lib (these files are Kaola-authored
// with a fixed top-level shape: required identity + developer_instructions and omitted runtime keys
// for parent-session inheritance. The top-level region is the text before the first ^[ table.
// Returns [] when valid, or a list of human-readable reasons.
// ---------------------------------------------------------------------------
function validateProfileText(text, role, expectedMeta = null) {
  const reasons = [];
  const firstTableIdx = text.search(/^\[/m);
  const top = firstTableIdx === -1 ? text : text.slice(0, firstTableIdx);

  const nameMatch = top.match(/^name\s*=\s*"([^"]*)"\s*$/m);
  if (!nameMatch) {
    reasons.push("missing or empty top-level 'name' (codex >=0.138 ignores the profile)");
  } else if (nameMatch[1] === '') {
    reasons.push("top-level 'name' is empty");
  } else if (nameMatch[1] !== role) {
    reasons.push(`top-level 'name' is "${nameMatch[1]}" but must equal the role "${role}"`);
  }

  const desc = parseTopLevelString(top, 'description');
  if (desc === null) {
    reasons.push("missing top-level 'description'");
  } else if (desc.trim() === '') {
    reasons.push("top-level 'description' is empty");
  } else if (expectedMeta && expectedMeta.description && desc !== expectedMeta.description) {
    reasons.push("top-level 'description' does not match config/agents.toml");
  }

  const nick = parseStringArrayLine(top, 'nickname_candidates');
  if (nick.present && !nick.valid) {
    reasons.push("top-level 'nickname_candidates' must be a TOML string array");
  } else if (nick.present && nick.values.length === 0) {
    reasons.push("top-level 'nickname_candidates' must not be empty when present");
  }
  if (expectedMeta && expectedMeta.nicknameCandidates && expectedMeta.nicknameCandidates.length > 0) {
    if (!nick.present) {
      reasons.push("missing top-level 'nickname_candidates'");
    } else if (!sameStringArray(nick.values, expectedMeta.nicknameCandidates)) {
      reasons.push("top-level 'nickname_candidates' does not match config/agents.toml");
    }
  }

  const modelLines = top.match(/^model\s*=.*$/gm) || [];
  const effortLines = top.match(/^model_reasoning_effort\s*=.*$/gm) || [];
  if (!CODEX_PINNED_STANDARD_ROLES.includes(role) && !CODEX_PINNED_REASONING_ROLES.includes(role)) {
    reasons.push(`role "${role}" has no Codex profile-tier policy`);
  }
  if (modelLines.length > 0) reasons.push("top-level 'model' must be omitted to inherit the parent session");
  if (effortLines.length > 0) reasons.push("top-level 'model_reasoning_effort' must be omitted to inherit the parent session");

  const instrMatch = text.match(/^developer_instructions\s*=\s*"""([\s\S]*?)"""/m);
  if (!instrMatch) {
    reasons.push("missing top-level 'developer_instructions' triple-quoted block");
  } else if (instrMatch[1].trim() === '') {
    reasons.push("'developer_instructions' body is blank");
  } else {
    if (!instrMatch[1].includes('FULL')) {
      reasons.push("developer_instructions missing FULL durable-result contract");
    }
    if (!instrMatch[1].includes('compact orchestrator summary')) {
      reasons.push("developer_instructions missing compact orchestrator summary contract");
    }
    if (CODEX_ORCHESTRATION_ROLES.includes(role)) {
      if (!instrMatch[1].includes('durable full result')) {
        reasons.push("orchestration-role developer_instructions missing canonical durable full result contract");
      }
    } else {
      if (!instrMatch[1].includes('dispatch.evidence_file')) {
        reasons.push("node-role developer_instructions missing durable dispatch.evidence_file contract");
      }
      if (!instrMatch[1].includes('evidence-binding')) {
        reasons.push("node-role developer_instructions missing evidence-binding preservation contract");
      }
    }
  }

  return reasons;
}

function classifyProfilePinPosture(text) {
  const firstTableIdx = String(text || '').search(/^\[/m);
  const top = firstTableIdx === -1 ? String(text || '') : String(text || '').slice(0, firstTableIdx);
  const models = [...top.matchAll(/^model\s*=\s*"([^"]*)"\s*$/gm)].map(m => m[1]);
  const efforts = [...top.matchAll(/^model_reasoning_effort\s*=\s*"([^"]*)"\s*$/gm)].map(m => m[1]);
  const anyModelLine = (top.match(/^model\s*=.*$/gm) || []).length;
  const anyEffortLine = (top.match(/^model_reasoning_effort\s*=.*$/gm) || []).length;
  if (anyModelLine === 0 && anyEffortLine === 0) return 'inherit';
  if (anyModelLine === 1 && anyEffortLine === 1 && models.length === 1 && efforts.length === 1
      && models[0] === CODEX_STANDARD_MODEL && [CODEX_STANDARD_EFFORT, CODEX_REASONING_EFFORT].includes(efforts[0])) {
    return 'legacy_pinned';
  }
  return 'malformed';
}

// Parse config/agents.toml for [agents.<role>] metadata.
// Returns [{ role, description, nicknameCandidates, configFile, basename }].
function parseTemplateEntries(templateText) {
  const entries = [];
  const lines = templateText.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const head = line.match(/^\[agents\.([a-z0-9-]+)\]\s*$/);
    if (head) {
      current = { role: head[1], description: null, nicknameCandidates: [], configFile: null, basename: null };
      entries.push(current);
      continue;
    }
    if (current) {
      const desc = line.match(/^description\s*=\s*"([^"]*)"\s*$/);
      if (desc) {
        current.description = desc[1];
        continue;
      }
      const nick = line.match(/^nickname_candidates\s*=\s*\[([^\]]*)\]\s*$/);
      if (nick) {
        const parsed = parseStringArrayLine(line, 'nickname_candidates');
        current.nicknameCandidates = parsed.valid ? parsed.values : [];
        continue;
      }
      const cf = line.match(/^config_file\s*=\s*"([^"]*)"\s*$/);
      if (cf) {
        current.configFile = cf[1];
        current.basename = path.basename(cf[1]);
      }
    }
  }
  return entries;
}

// Source-tree schema wall (AC2): every config_file resolves to an existing
// agents/<role>.toml, every agents/*.toml is referenced by exactly one entry, and
// every profile passes validateProfileText. Pure — used by the validators too.
function validateSourceProfiles(rootDir) {
  const templatePath = path.join(rootDir, 'config', 'agents.toml');
  const agentsDir = path.join(rootDir, 'agents');
  const errors = [];

  if (!fs.existsSync(templatePath)) {
    return { ok: false, errors: [`missing config/agents.toml at ${templatePath}`], roles: [] };
  }
  if (!fs.existsSync(agentsDir)) {
    return { ok: false, errors: [`missing agents/ directory at ${agentsDir}`], roles: [] };
  }

  const entries = parseTemplateEntries(read(templatePath));
  const roles = entries.map(e => e.role);

  const tomlFiles = fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.toml'))
    .sort();

  // Every config_file resolves to an existing agents/<role>.toml.
  const referenced = new Set();
  for (const entry of entries) {
    if (!entry.basename) {
      errors.push(`agents.toml [agents.${entry.role}] has no config_file line`);
      continue;
    }
    referenced.add(entry.basename);
    const file = path.join(agentsDir, entry.basename);
    if (!fs.existsSync(file)) {
      errors.push(`agents/${entry.basename}: referenced by [agents.${entry.role}] but file is missing`);
      continue;
    }
    const reasons = validateProfileText(read(file), entry.role, entry);
    for (const r of reasons) errors.push(`agents/${entry.basename}: ${r}`);
  }

  // Every agents/*.toml is referenced by exactly one entry (catches issue-scout class).
  for (const file of tomlFiles) {
    if (!referenced.has(file)) {
      errors.push(`agents/${file}: not referenced by any [agents.*] entry in config/agents.toml`);
    }
  }

  return { ok: errors.length === 0, errors, roles, entries };
}

// ---------------------------------------------------------------------------
// Manifest helpers (#332).
// ---------------------------------------------------------------------------
function sha256(buf) {
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

function manifestPath(agentsDir) {
  return path.join(agentsDir, MANIFEST_BASENAME);
}

// Returns the parsed manifest, or null on absent/corrupt.
function readManifest(agentsDir) {
  const p = manifestPath(agentsDir);
  if (!fs.existsSync(p)) return null;
  try {
    const obj = JSON.parse(read(p));
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

// Prune stale managed/retired profiles. Order (issue §3): for each *.toml in the
// target dir not in currentFiles —
//   listed in prevManifest.files  -> unlink (stale-managed)
//   in RETIRED_PROFILE_FILES       -> unlink (retired; works with no manifest)
//   otherwise                      -> keep, record in extraUnmanaged (never deleted)
function pruneStaleProfiles(agentsDir, currentFiles, prevManifest) {
  const removed = [];
  const extraUnmanaged = [];
  if (!fs.existsSync(agentsDir)) return { removed, extraUnmanaged };

  const currentSet = new Set(currentFiles);
  const prevFiles = (prevManifest && prevManifest.files && typeof prevManifest.files === 'object')
    ? Object.keys(prevManifest.files)
    : [];
  const prevSet = new Set(prevFiles);

  for (const name of fs.readdirSync(agentsDir)) {
    if (!name.endsWith('.toml')) continue;
    if (currentSet.has(name)) continue;
    if (prevSet.has(name)) {
      fs.unlinkSync(path.join(agentsDir, name));
      removed.push({ file: name, reason: 'stale-managed' });
    } else if (RETIRED_PROFILE_FILES.includes(name)) {
      fs.unlinkSync(path.join(agentsDir, name));
      removed.push({ file: name, reason: 'retired' });
    } else {
      extraUnmanaged.push(name);
    }
  }

  removed.sort((a, b) => a.file.localeCompare(b.file));
  extraUnmanaged.sort();
  return { removed, extraUnmanaged };
}

function writeManifest(agentsDir, { pluginRoot: srcRoot, copiedFiles, removed }) {
  let pluginName = path.basename(srcRoot);
  let pluginVersion = null;
  try {
    const pj = JSON.parse(read(path.join(srcRoot, '.codex-plugin', 'plugin.json')));
    if (pj && pj.name) pluginName = pj.name;
    if (pj && pj.version) pluginVersion = pj.version;
  } catch {
    /* fall back to basename / null */
  }

  const files = {};
  const roles = [];
  for (const name of copiedFiles.slice().sort()) {
    roles.push(name.replace(/\.toml$/, ''));
    files[name] = sha256(fs.readFileSync(path.join(agentsDir, name)));
  }

  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    plugin: pluginName,
    plugin_version: pluginVersion,
    installed_at: new Date().toISOString(),
    source_plugin_root: srcRoot,
    roles,
    files,
    retired_files_removed: removed
      .filter(r => r.reason === 'retired')
      .map(r => r.file)
      .sort(),
  };

  fs.writeFileSync(manifestPath(agentsDir), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// Copy each source profile via write-temp-then-rename so a crash mid-copy never
// leaves a torn profile. Returns the sorted list of copied *.toml basenames.
function copyAgentProfiles() {
  fs.mkdirSync(targetAgentsDir, { recursive: true });
  const copied = [];

  for (const entry of fs.readdirSync(sourceAgentsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const source = path.join(sourceAgentsDir, entry.name);
    const target = path.join(targetAgentsDir, entry.name);
    const tmp = target + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, fs.readFileSync(source));
    fs.renameSync(tmp, target);
    copied.push(entry.name);
  }

  return copied.sort();
}

function updateConfig() {
  fs.mkdirSync(targetCodexDir, { recursive: true });
  const existing = fs.existsSync(targetConfig) ? read(targetConfig) : '';
  const next = upsertBlock(existing, managedBlock(existing));

  if (next !== existing) {
    fs.writeFileSync(targetConfig, next);
    return 'updated';
  }

  return 'unchanged';
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

// #409: parse the hooks template for every relative path a managed hook command
// references via the __KW_PLUGIN_ROOT__ token. PARSE the JSON first (so each command is
// a real, un-escaped string — never regex over raw JSON, where the closing `\"` would be
// captured into the path) then pull `__KW_PLUGIN_ROOT__/<relpath>` from each command up to
// the next whitespace or quote. Returns a sorted, de-duped relpath list (e.g.
// ['hooks/kaola-workflow-pre-commit.sh', 'scripts/kaola-workflow-codex-compact-resume.js']).
// Per-edition templates carry edition-named basenames (kaola-{gitlab,gitea}-workflow-
// codex-compact-resume.js) → this auto-adjusts to whatever each template references.
// Pure + exported for unit tests.
function hookReferencedRelPaths(templateText) {
  const parsed = JSON.parse(templateText);
  const hooks = (parsed && parsed.hooks) || {};
  const token = PLUGIN_ROOT_TOKEN + '/';
  const re = new RegExp(escapeRegExp(token) + '([^"\\s]+)', 'g');
  const found = new Set();
  for (const event of Object.keys(hooks)) {
    for (const entry of (hooks[event] || [])) {
      for (const h of (entry.hooks || [])) {
        if (typeof h.command !== 'string') continue;
        let m;
        while ((m = re.exec(h.command)) !== null) {
          found.add(m[1]);
        }
      }
    }
  }
  return [...found].sort();
}

// #409: copy every hook-referenced script from the read SOURCE (pluginRoot) into the
// stable version-less home, so hooks.json can point at a Codex-owned path that survives
// the install source vanishing. Sweep the prior stable {hooks,scripts} dirs first (so a
// renamed/retired hook script leaves no orphan), then recreate + copy via
// write-temp-then-rename (+ chmod 0o755) — the copyAgentProfiles crash-safety pattern.
// Fails CLOSED (throws) on a missing source script, same as install.sh L600's hard fail.
// Returns { copied: [...relpaths], removed: <count of swept files> }.
function copyHookScripts(stableDir, relPaths) {
  const hooksDir = path.join(stableDir, 'hooks');
  const scriptsDir = path.join(stableDir, 'scripts');

  // Sweep prior copies (recursive) so stale/renamed hook scripts never linger.
  let removed = 0;
  for (const dir of [hooksDir, scriptsDir]) {
    if (fs.existsSync(dir)) {
      removed += fs.readdirSync(dir).length;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  const copied = [];
  for (const rel of relPaths) {
    const source = path.join(pluginRoot, rel);
    assert(fs.existsSync(source), `hook-referenced source script missing: ${source}`);
    const target = path.join(stableDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = target + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, fs.readFileSync(source));
    fs.chmodSync(tmp, 0o755);
    fs.renameSync(tmp, target);
    copied.push(rel);
  }
  return { copied: copied.sort(), removed };
}

// #325 R3 / #525: merge managed hooks into the existing hooks.json.
//   Output is exactly { hooks }. Codex's hooks-config parser is strict (serde
//   deny_unknown_fields) and accepts ONLY a top-level `hooks` key — a `$schema` (or any
//   other top-level key) makes it reject the WHOLE file, dropping every managed hook
//   (latent since #284; the prior R2 "$schema editor-hint carry" was the bug). Emitting
//   only { hooks } both stops introducing $schema AND self-heals a hooks.json a prior
//   install wrote with $schema (existing top-level keys are intentionally dropped, not
//   carried). Claude is unaffected: its hooks merge into settings.json, which accepts $schema.
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
  // Codex hooks config = { hooks } ONLY (no $schema / no other top-level key).
  return { hooks };
}

function updateHooks() {
  // #447: hooks live in the GLOBAL ~/.codex; ensure its parent dir exists.
  fs.mkdirSync(globalCodexDir, { recursive: true });

  // R1: build the managed hooks inside a WARN-first guard — a malformed template should WARN and
  // skip hooks, never abort copyAgentProfiles/updateConfig.
  // #409: (a) copy the hook-referenced scripts into the version-less stable home and (b)
  // substitute THAT home (not pluginRoot) into __KW_PLUGIN_ROOT__, so the installed commands
  // resolve even after the install source dir is deleted / version-bumped. Both steps live
  // inside the WARN-first guard: a malformed template or a missing source script WARNs and
  // skips hooks rather than aborting the whole install.
  let managedHooks;
  let stableCopy = { copied: [], removed: 0 };
  try {
    const templateText = read(sourceHooksTemplate);
    const relPaths = hookReferencedRelPaths(templateText);
    stableCopy = copyHookScripts(targetStableDir, relPaths);
    managedHooks = buildManagedHooks(templateText, targetStableDir);
  } catch (e) {
    console.warn(`Kaola-Workflow Codex hooks: could not build managed hooks template — skipping (${e.message})`);
    return { status: 'unchanged', stableCopy };
  }

  // Read existing hooks.json or default to empty; tolerate parse failures (WARN-first).
  let existing = { hooks: {} };
  if (fs.existsSync(targetHooks)) {
    try {
      existing = JSON.parse(read(targetHooks));
      if (!existing || typeof existing.hooks !== 'object' || existing.hooks === null) {
        existing = { hooks: {} };
      }
    } catch (e) {
      console.warn(`Kaola-Workflow Codex hooks: malformed existing hooks.json — treating as empty (${e.message})`);
      existing = { hooks: {} };
    }
  }

  const merged = mergeHooks(existing, managedHooks);

  const next = JSON.stringify(merged, null, 2) + '\n';
  const current = fs.existsSync(targetHooks) ? read(targetHooks) : null;

  if (next !== current) {
    fs.writeFileSync(targetHooks, next);
    return { status: 'updated', stableCopy };
  }

  return { status: 'unchanged', stableCopy };
}

// Post-verify (AC8 parity): re-read every installed profile + assert the managed
// block carries an [agents.<role>] entry for every template role. Returns [] when
// the install is sound, or a list of reasons.
function postVerify(templateEntries) {
  const problems = [];
  const templateRoles = templateEntries.map(e => e.role);
  const metaByRole = new Map(templateEntries.map(e => [e.role, e]));
  for (const role of templateRoles) {
    const file = path.join(targetAgentsDir, `${role}.toml`);
    if (!fs.existsSync(file)) {
      problems.push(`installed agents/kaola-workflow/${role}.toml is missing`);
      continue;
    }
    const reasons = validateProfileText(read(file), role, metaByRole.get(role));
    for (const r of reasons) problems.push(`installed ${role}.toml: ${r}`);
  }

  const configText = fs.existsSync(targetConfig) ? read(targetConfig) : '';
  const beginIdx = configText.indexOf(beginMarker);
  const endIdx = configText.indexOf(endMarker);
  let blockBody = '';
  if (beginIdx !== -1 && endIdx !== -1 && beginIdx < endIdx) {
    blockBody = configText.slice(beginIdx + beginMarker.length, endIdx);
  } else {
    problems.push('managed block markers not found in .codex/config.toml after install');
  }
  for (const role of templateRoles) {
    const re = new RegExp(`^\\[agents\\.${escapeRegExp(role)}\\]`, 'm');
    if (!re.test(blockBody)) {
      problems.push(`managed block missing [agents.${role}] after install`);
    }
  }

  return problems;
}

// issue #543 D4: seedKaolaConfig — pure-JS UNION writer for ~/.config/kaola-workflow/config.json
// installed_paths. Mirrors install.sh:704-734 + install-opencode.sh seed_kaola_config byte-semantically
// (node-native port; no python3 dependency — node is guaranteed present for a node installer). The
// shared config path is edition-agnostic (a Claude/opencode install reads the same file), so the
// UNION/canonical-order logic MUST stay byte-identical to the other writers or it clobbers a prior
// install's installed_paths. Adaptive is implicit-always and NEVER appears in installed_paths (only
// {fast,full} can). Re-install UNIONS existing installed_paths with the newly-requested opt-ins
// (never removes); uninstall→reinstall resets to []. canonical order = ['fast','full']; unknown tokens
// dropped. parallel_mode setdefault 'auto' (never overwrites a user value). Migrates away the retired
// enable_adaptive field. WARN-first: a corrupt/non-object existing config warns and is left UNTOUCHED
// (never throws, never aborts the success path). Write-temp-then-rename for crash-safety parity with
// copyAgentProfiles. Pure + exported for unit tests.
function seedKaolaConfig(homeDir, withFast, withFull) {
  const configDir = path.join(homeDir, '.config', 'kaola-workflow');
  const configFile = path.join(configDir, 'config.json');
  let config = {};
  if (fs.existsSync(configFile)) {
    let parsed;
    try { parsed = JSON.parse(read(configFile)); }
    catch (e) {
      console.warn(`Kaola-Workflow Codex installer: ${configFile} is not valid JSON (${e.message}); leaving it untouched.`);
      return { status: 'skipped_corrupt' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`Kaola-Workflow Codex installer: ${configFile} is not a JSON object; leaving it untouched.`);
      return { status: 'skipped_non_object' };
    }
    config = parsed;
  }
  if (config.parallel_mode === undefined) config.parallel_mode = 'auto';   // setdefault, never overwrite user value
  const existing = Array.isArray(config.installed_paths) ? config.installed_paths : [];
  const paths = new Set(existing);
  if (withFast) paths.add('fast');
  if (withFull) paths.add('full');
  config.installed_paths = ['fast', 'full'].filter(p => paths.has(p));    // canonical order, {fast,full} only
  delete config.enable_adaptive;                                           // migrate retired field
  fs.mkdirSync(configDir, { recursive: true });
  const tmp = configFile + '.tmp-' + process.pid;                          // crash-safety parity w/ copyAgentProfiles
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
  fs.renameSync(tmp, configFile);
  console.log(`Kaola-Workflow Codex installer: installed_paths (adaptive always; opt-ins: ${JSON.stringify(config.installed_paths)}) in ${configFile}`);
  return { status: 'updated', installed_paths: config.installed_paths };
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
// byte-identically alongside the #332 schema helpers above (installer <-> preflight,
// x7 files total, this installer being the reference copy per validate-script-sync.js's
// "codex agent-profile installer copies" group); keep the two copies in lock-step.
// ---------------------------------------------------------------------------
const DISPATCH_POSTURE_VERSION_NOTE = 'effort-gated multi-agent dispatch posture is Codex CLI runtime behavior verified on codex-tui 0.142.5; it may change in a future Codex release.';

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

  return { segments, isArrayTable };
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
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function splitInlineTomlFields(body) {
  const fields = [];
  let start = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inDouble && ch === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === ',' && !inSingle && !inDouble) {
      fields.push(body.slice(start, i).trim());
      start = i + 1;
    }
    escaped = false;
  }
  fields.push(body.slice(start).trim());
  return fields.filter(Boolean);
}

function parseMultiAgentV2Value(value) {
  const trimmed = String(value || '').trim();
  const bool = parseTomlBoolean(trimmed);
  if (bool !== null) return {
    valid: true,
    enabled: bool,
    non_code_mode_only: null,
    hide_spawn_agent_metadata: null,
    tool_namespace: null,
  };

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return { valid: false, enabled: false, non_code_mode_only: null };
  }

  let enabledFound = false;
  let enabled = false;
  let transportFound = false;
  let transportAmbiguous = false;
  let nonCodeModeOnly = null;
  let metadataFound = false;
  let metadataAmbiguous = false;
  let hideSpawnAgentMetadata = null;
  let namespaceFound = false;
  let namespaceAmbiguous = false;
  let toolNamespace = null;
  for (const field of splitInlineTomlFields(trimmed.slice(1, -1))) {
    const enabledMatch = field.match(/^enabled\s*=\s*(.+)$/);
    if (enabledMatch) {
      if (enabledFound) return { valid: false, enabled: false, non_code_mode_only: null };
      const fieldBool = parseTomlBoolean(enabledMatch[1]);
      if (fieldBool === null) return { valid: false, enabled: false, non_code_mode_only: null };
      enabledFound = true;
      enabled = fieldBool;
      continue;
    }
    const transportMatch = field.match(/^non_code_mode_only\s*=\s*(.+)$/);
    if (transportMatch) {
      if (transportFound) {
        transportAmbiguous = true;
        continue;
      }
      const fieldBool = parseTomlBoolean(transportMatch[1]);
      transportFound = true;
      if (fieldBool === null) transportAmbiguous = true;
      else nonCodeModeOnly = fieldBool;
      continue;
    }
    const metadataMatch = field.match(/^hide_spawn_agent_metadata\s*=\s*(.+)$/);
    if (metadataMatch) {
      if (metadataFound) {
        metadataAmbiguous = true;
        continue;
      }
      const fieldBool = parseTomlBoolean(metadataMatch[1]);
      metadataFound = true;
      if (fieldBool === null) metadataAmbiguous = true;
      else hideSpawnAgentMetadata = fieldBool;
      continue;
    }
    const namespaceMatch = field.match(/^tool_namespace\s*=\s*(.+)$/);
    if (namespaceMatch) {
      if (namespaceFound) {
        namespaceAmbiguous = true;
        continue;
      }
      const fieldString = parseTomlString(namespaceMatch[1]);
      namespaceFound = true;
      if (fieldString === null) namespaceAmbiguous = true;
      else toolNamespace = fieldString;
    }
  }

  return enabledFound
    ? {
      valid: true,
      enabled,
      non_code_mode_only: nonCodeModeOnly,
      transport_ambiguous: transportAmbiguous,
      hide_spawn_agent_metadata: hideSpawnAgentMetadata,
      metadata_ambiguous: metadataAmbiguous,
      tool_namespace: toolNamespace,
      namespace_ambiguous: namespaceAmbiguous,
    }
    : { valid: false, enabled: false, non_code_mode_only: null };
}

function detectCodexDispatchMode(configContent) {
  const lines = String(configContent || '').split(/\r?\n/);
  let table = null;
  let seen = false;
  let enabled = false;
  let ambiguous = false;
  let transportSeen = false;
  let transportAmbiguous = false;
  let nonCodeModeOnly = null;
  let metadataSeen = false;
  let metadataAmbiguous = false;
  let hideSpawnAgentMetadata = null;
  let namespaceSeen = false;
  let namespaceAmbiguous = false;
  let toolNamespace = null;

  function recordTransport(value) {
    if (value === null || value === undefined) return;
    if (transportSeen || typeof value !== 'boolean') {
      transportAmbiguous = true;
      nonCodeModeOnly = null;
      return;
    }
    transportSeen = true;
    nonCodeModeOnly = value;
  }

  function record(parsed) {
    if (!parsed.valid || seen) {
      ambiguous = true;
      enabled = false;
      return;
    }
    seen = true;
    enabled = parsed.enabled;
    recordTransport(parsed.non_code_mode_only);
    if (parsed.transport_ambiguous) transportAmbiguous = true;
    recordMetadata(parsed.hide_spawn_agent_metadata);
    if (parsed.metadata_ambiguous) metadataAmbiguous = true;
    recordNamespace(parsed.tool_namespace);
    if (parsed.namespace_ambiguous) namespaceAmbiguous = true;
  }

  function recordMetadata(value) {
    if (value === null || value === undefined) return;
    if (metadataSeen || typeof value !== 'boolean') {
      metadataAmbiguous = true;
      hideSpawnAgentMetadata = null;
      return;
    }
    metadataSeen = true;
    hideSpawnAgentMetadata = value;
  }

  function recordNamespace(value) {
    if (value === null || value === undefined) return;
    if (namespaceSeen || typeof value !== 'string' || value.length === 0) {
      namespaceAmbiguous = true;
      toolNamespace = null;
      return;
    }
    namespaceSeen = true;
    toolNamespace = value;
  }

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    if (tomlTableNameMatches(table, 'features')) {
      const m = line.match(/^multi_agent_v2\s*=\s*(.+)$/);
      if (m) record(parseMultiAgentV2Value(m[1]));
    } else if (tomlTableNameMatches(table, 'features.multi_agent_v2')) {
      const enabledMatch = line.match(/^enabled\s*=\s*(.+)$/);
      if (enabledMatch) {
        record({
          valid: parseTomlBoolean(enabledMatch[1]) !== null,
          enabled: parseTomlBoolean(enabledMatch[1]) === true,
          non_code_mode_only: null,
          hide_spawn_agent_metadata: null,
          tool_namespace: null,
        });
      }
      const transportMatch = line.match(/^non_code_mode_only\s*=\s*(.+)$/);
      if (transportMatch) {
        const transportValue = parseTomlBoolean(transportMatch[1]);
        if (transportValue === null) transportAmbiguous = true;
        else recordTransport(transportValue);
      }
      const metadataMatch = line.match(/^hide_spawn_agent_metadata\s*=\s*(.+)$/);
      if (metadataMatch) {
        const metadataValue = parseTomlBoolean(metadataMatch[1]);
        if (metadataValue === null) metadataAmbiguous = true;
        else recordMetadata(metadataValue);
      }
      const namespaceMatch = line.match(/^tool_namespace\s*=\s*(.+)$/);
      if (namespaceMatch) {
        const namespaceValue = parseTomlString(namespaceMatch[1]);
        if (namespaceValue === null) namespaceAmbiguous = true;
        else recordNamespace(namespaceValue);
      }
    }
  }

  enabled = seen && !ambiguous && enabled;
  const transportMode = !enabled
    ? 'not_applicable'
    : (transportAmbiguous
      ? 'unknown'
      : (nonCodeModeOnly === false ? 'nested-allowed' : 'direct-only'));
  const directTransportReady = enabled ? transportMode === 'direct-only' : null;
  const effectiveNamespace = !enabled
    ? null
    : (namespaceAmbiguous ? null : (toolNamespace || 'collaboration'));
  const roleMetadataVisible = !enabled
    ? null
    : (metadataAmbiguous ? null : hideSpawnAgentMetadata === false);
  const roleTransportReady = enabled
    ? directTransportReady === true
      && effectiveNamespace === CODEX_V2_ROLE_TOOL_NAMESPACE
      && roleMetadataVisible === true
    : null;
  let transportWarning = null;
  if (enabled && directTransportReady !== true) {
    transportWarning = CODEX_V2_DIRECT_TRANSPORT_NOTE;
  } else if (enabled && roleTransportReady !== true) {
    transportWarning = CODEX_V2_ROLE_TRANSPORT_NOTE;
  }
  return {
    dispatch_mode: enabled ? 'v2-task-name' : 'v1-thread-id',
    multi_agent_v2_enabled: enabled,
    codex_v2_transport_mode: transportMode,
    codex_v2_direct_transport_ready: directTransportReady,
    codex_v2_tool_namespace: effectiveNamespace,
    codex_v2_role_metadata_visible: roleMetadataVisible,
    codex_v2_role_transport_ready: roleTransportReady,
    codex_v2_transport_warning: transportWarning,
  };
}

const CODEX_V2_TRANSPORT_UNSAFE_STATUS = 'codex_v2_encrypted_transport_unsafe';
const CODEX_V2_DIRECT_TRANSPORT_NOTE = 'Codex MultiAgentV2 encrypted task messages require direct-only collaboration tools. Set non_code_mode_only = true in the enabled [features] multi_agent_v2 inline object or [features.multi_agent_v2] table (or omit that field to use the Codex 0.144.1 direct-only default), then start a fresh Codex session; never dispatch spawn_agent, send_message, or followup_task through functions.exec or Code Mode.';
const CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS = 'codex_v2_role_transport_unsafe';
const CODEX_V2_ROLE_TOOL_NAMESPACE = 'agents';
const CODEX_V2_ROLE_TRANSPORT_NOTE = 'Kaola-Workflow role-aware MultiAgentV2 on Codex 0.144.1 requires tool_namespace = "agents", hide_spawn_agent_metadata = false, and non_code_mode_only = true. The default collaboration.spawn_agent name is server-reserved: exposing agent_type/model/reasoning fields there fails the first request with HTTP 400, while hiding them removes Kaola role selection. Apply the settings in the enabled [features] multi_agent_v2 object or [features.multi_agent_v2] table, then start a fresh Codex session and call the direct agents namespace, never functions.exec or Code Mode.';

// `[features] multi_agent = <bool>` — the base (v1) tool-exposure flag, distinct from
// multi_agent_v2 (already parsed by detectCodexDispatchMode above). Same strict
// first-match/ambiguous-fails-closed strategy: a repeated key or malformed boolean
// short-circuits to false rather than guessing.
function parseFeaturesMultiAgentEnabled(configContent) {
  const lines = String(configContent || '').split(/\r?\n/);
  let table = null;
  let seen = false;
  let enabled = false;
  let ambiguous = false;

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    if (tomlTableNameMatches(table, 'features')) {
      const m = line.match(/^multi_agent\s*=\s*(.+)$/);
      if (m) {
        const b = parseTomlBoolean(m[1]);
        if (b === null || seen) {
          ambiguous = true;
          enabled = false;
        } else {
          seen = true;
          enabled = b;
        }
      }
    }
  }

  return seen && !ambiguous && enabled;
}

// Root-level `model_reasoning_effort` (NOT the per-profile agents/*.toml field of the
// same name) — the effort setting that gates MultiAgentMode. TOML root keys must
// precede the first [table] header, so scanning the text up to the first top-level
// table line is the correct (and only valid) place a user- or installer-owned root
// key can live — the same `top` convention used by validateProfileText.
function parseTopLevelModelReasoningEffort(configContent) {
  const text = String(configContent || '');
  const firstTableIdx = text.search(/^\[/m);
  const top = firstTableIdx === -1 ? text : text.slice(0, firstTableIdx);
  const m = top.match(/^model_reasoning_effort\s*=\s*"([^"]*)"\s*$/m);
  return m ? m[1] : null;
}

// Exact remediation text for a non-proactive posture; null when nothing to remediate. Leads with
// the always-available, always-documented in-session ask; the ultra reasoning-effort route is
// offered second and qualified as undocumented/plan-gated (many Codex plans currently top out
// at xhigh, so the config.toml / per-session route is not always actionable).
function dispatchPostureRemediation(posture) {
  if (posture === 'proactive') return null;
  if (posture === 'none') {
    return 'Codex sub-agent spawn tools are not exposed ([features] multi_agent / multi_agent_v2 absent-or-false). '
      + 'Enable them, then explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex '
      + 'exposes an ultra reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the '
      + '/model picker), set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c '
      + 'model_reasoning_effort=ultra) for proactive delegation.';
  }
  return 'Codex will refuse sub-agent spawns unless explicitly requested this session (multi_agent_mode: explicitRequestOnly). '
    + 'To dispatch now, explicitly ask for sub-agents/delegation/parallel work in-session; or, if your Codex exposes '
    + 'an ultra reasoning effort for your model/plan (undocumented as of codex-tui 0.142.5 — check the /model picker), '
    + 'set model_reasoning_effort = "ultra" in ~/.codex/config.toml (or per-session: codex -c model_reasoning_effort=ultra) '
    + 'for proactive delegation.';
}

function deriveDispatchPosture(configContent) {
  const dispatchMode = detectCodexDispatchMode(configContent);
  const multiAgentEnabled = parseFeaturesMultiAgentEnabled(configContent);
  const featuresEnabled = multiAgentEnabled || dispatchMode.multi_agent_v2_enabled;
  const effort = parseTopLevelModelReasoningEffort(configContent);
  const posture = !featuresEnabled ? 'none' : (effort === 'ultra' ? 'proactive' : 'explicitRequestOnly');
  return {
    dispatch_posture: posture,
    model_reasoning_effort: effort,
    multi_agent_enabled: multiAgentEnabled,
    dispatch_posture_warning: dispatchPostureRemediation(posture),
  };
}

// ---------------------------------------------------------------------------
// MultiAgentV2 concurrency + wait-timeout bounds — extends the dispatch-posture report
// above with the effective v2 slot budget and wait-timeout knobs, version-guarded the
// same way. `max_concurrent_threads_per_session` INCLUDES the root/orchestrator thread,
// so effective subagent width = threads - 1. A controlled probe on codex-tui 0.142.5
// observed a default budget of 4 (width 3) when the key is absent; that default is NOT
// published in official Codex docs, so it is surfaced as an OBSERVED fallback (source:
// 'observed_default'), never asserted as guaranteed Codex behavior. The three
// *_wait_timeout_ms bounds have no independently verified default — read ONLY when
// explicitly present in config; null when absent (no fabricated fallback for those three).
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

const MULTI_AGENT_V2_BOUNDS_NOTE = 'Recommended [features.multi_agent_v2] config for Kaola-Workflow dispatch: set '
  + 'max_concurrent_threads_per_session high enough for the intended fan-out width plus 1 (the budget INCLUDES '
  + 'the orchestrator thread) and max_wait_timeout_ms near the longest expected node runtime so long-poll joins '
  + 'are not capped short. Example:\n[features.multi_agent_v2]\nmax_concurrent_threads_per_session = 5\n'
  + 'max_wait_timeout_ms = 1800000\nNote: [agents].max_threads (the v1 concurrency knob) cannot be set once '
  + 'features.multi_agent_v2 is enabled — codex-tui 0.142.5 rejects it. Effective subagent width, the observed '
  + 'default budget of 4 (width 3) when max_concurrent_threads_per_session is absent, and the wait-timeout bounds '
  + 'are Codex CLI runtime behavior verified on codex-tui 0.142.5; they may change in a future Codex release.';

const MULTI_AGENT_V2_NUMERIC_FIELDS = [
  'max_concurrent_threads_per_session',
  'min_wait_timeout_ms',
  'max_wait_timeout_ms',
  'default_wait_timeout_ms',
];

// Parses the four MultiAgentV2ConfigToml numeric fields from either syntax: the
// inline-object form (`multi_agent_v2 = { max_concurrent_threads_per_session = N, ... }`)
// or the dotted-table form (`[features.multi_agent_v2]` with the fields as separate
// lines) — the same two representations detectCodexDispatchMode already parses for
// `enabled`. Same first-match/fail-to-absent discipline as the rest of this file: a
// non-integer or repeated value is treated as not-configured rather than guessed at.
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

  function recordFromInlineObject(body) {
    for (const field of splitInlineTomlFields(body)) {
      const m = field.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (m) recordField(m[1], m[2]);
    }
  }

  const lines = String(configContent || '').split(/\r?\n/);
  let table = null;
  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      table = tableName;
      continue;
    }

    if (tomlTableNameMatches(table, 'features')) {
      const m = line.match(/^multi_agent_v2\s*=\s*(.+)$/);
      if (m) {
        const v = m[1].trim();
        if (v.startsWith('{') && v.endsWith('}')) recordFromInlineObject(v.slice(1, -1));
      }
    } else if (tomlTableNameMatches(table, 'features.multi_agent_v2')) {
      const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (m) recordField(m[1], m[2]);
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

function main() {

  assert(fs.existsSync(sourceAgentsDir), `missing source agents directory: ${sourceAgentsDir}`);
  assert(fs.existsSync(sourceTemplate), `missing source config template: ${sourceTemplate}`);
  assert(fs.existsSync(sourceHooksTemplate), `missing source hooks template: ${sourceHooksTemplate}`);

  // 1. Source-schema wall — never write on a malformed source tree.
  const sourceCheck = validateSourceProfiles(pluginRoot);
  if (!sourceCheck.ok) {
    for (const e of sourceCheck.errors) {
      process.stderr.write(`profile_schema_error: ${e}\n`);
    }
    process.exit(1);
  }
  const templateRoles = sourceCheck.roles;
  const templateEntries = sourceCheck.entries;

  // MultiAgentV2 encrypts message arguments before direct tool execution, and the model reserves
  // collaboration.spawn_agent to its hidden-metadata schema. Kaola needs visible agent_type role
  // selection, so require the proven direct `agents` namespace before writing profiles/config.
  const preInstallConfigContent = fs.existsSync(targetConfig) ? read(targetConfig) : '';
  const preInstallDispatchMode = detectCodexDispatchMode(preInstallConfigContent);
  if (preInstallDispatchMode.codex_v2_role_transport_ready === false) {
    const directUnsafe = preInstallDispatchMode.codex_v2_direct_transport_ready === false;
    process.stderr.write(
      `${directUnsafe ? CODEX_V2_TRANSPORT_UNSAFE_STATUS : CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS}: `
      + `${directUnsafe ? CODEX_V2_DIRECT_TRANSPORT_NOTE : CODEX_V2_ROLE_TRANSPORT_NOTE}\n`
    );
    process.exit(1);
  }

  // 2. Refuse to prune against a future manifest schema.
  const prevManifest = readManifest(targetAgentsDir);
  if (prevManifest && typeof prevManifest.schema_version === 'number'
      && prevManifest.schema_version > MANIFEST_SCHEMA_VERSION) {
    process.stderr.write(
      `manifest_schema_unsupported: ${manifestPath(targetAgentsDir)} has schema_version ${prevManifest.schema_version}; `
      + `this installer supports ${MANIFEST_SCHEMA_VERSION} — upgrade kaola-workflow\n`
    );
    process.exit(1);
  }

  // 3-6. Install profiles + config + hooks.
  const copied = copyAgentProfiles();
  const configStatus = updateConfig();
  const { status: hooksStatus, stableCopy } = updateHooks();

  // #543: seed the shared ~/.config/kaola-workflow/config.json installed_paths opt-in record. Runs
  // AFTER updateHooks and BEFORE pruneStaleProfiles (mirrors install-opencode.sh seed_kaola_config
  // ordering, which follows seed_config). WARN-first guarantees it cannot break the success path — a
  // hooks/profile/postVerify failure short-circuits before reaching it, and a corrupt config is left
  // untouched rather than aborting. os.homedir() honors process.env.HOME (POSIX), matching the
  // hermetic-HOME test pattern.
  seedKaolaConfig(os.homedir(), WITH_FAST, WITH_FULL);

  // 7-8. Prune stale/retired profiles, then record the ownership manifest.
  const { removed, extraUnmanaged } = pruneStaleProfiles(targetAgentsDir, copied, prevManifest);
  writeManifest(targetAgentsDir, { pluginRoot, copiedFiles: copied, removed });

  // 9. Post-verify before printing success.
  const problems = postVerify(templateEntries);
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`post_verify_failed: ${p}\n`);
    process.exit(1);
  }

  // 10. Summary.
  console.log(`Kaola-Workflow agent profiles: copied ${copied.length} profiles`);
  console.log(`Kaola-Workflow agent profiles: config ${configStatus} at ${path.relative(projectRoot, targetConfig)}`);
  for (const file of copied) {
    console.log(`- ${path.relative(projectRoot, path.join(targetAgentsDir, file))}`);
  }
  // #447: hooks are global — show the global path (relative to HOME for readability).
  const homeDir = os.homedir();
  const hookPathDisplay = targetHooks.startsWith(homeDir) ? '~' + targetHooks.slice(homeDir.length) : targetHooks;
  const stablePathDisplay = targetStableDir.startsWith(homeDir) ? '~' + targetStableDir.slice(homeDir.length) : targetStableDir;
  console.log(`Kaola-Workflow Codex hooks: ${hooksStatus} at ${hookPathDisplay}`);
  // #409: report the stable hook home so the user can see the version-less copy target.
  console.log(`Kaola-Workflow Codex hooks: copied ${stableCopy.copied.length} hook script(s) into stable home ${stablePathDisplay} (swept ${stableCopy.removed} stale)`);
  console.log(`run /hooks once in Codex to review and trust these command hooks (or codex exec --dangerously-bypass-hook-trust for automation)`);

  console.log(`Kaola-Workflow agent profiles: removed ${removed.length} stale managed profile(s)`);
  for (const r of removed) {
    console.log(`- removed agents/kaola-workflow/${r.file} (${r.reason})`);
  }
  if (extraUnmanaged.length > 0) {
    console.log(`Kaola-Workflow agent profiles: unmanaged extra profiles left in place: ${extraUnmanaged.join(', ')}`);
  }
  console.log(`Kaola-Workflow agent profiles: manifest written at ${path.relative(projectRoot, manifestPath(targetAgentsDir))}`);

  // #598 AC1: REPORT the effective dispatch posture. ATTESTATION-STYLE / NON-FATAL — this NEVER
  // changes the exit code (an otherwise-good install must never be reddened by this report). Read
  // back the config.toml we just wrote/updated so the reported posture reflects post-install reality;
  // the installer never WRITES model_reasoning_effort (a user-owned cost/latency choice) — it only
  // reports the resulting posture and, when non-proactive, the exact remediation. Printed BEFORE
  // the final `status: ok` sentinel — an existing invariant (#332 AC3) is that installer stdout
  // ENDS with `status: ok`; posture is additive, never appended after that final line.
  const postInstallConfigContent = fs.existsSync(targetConfig) ? read(targetConfig) : '';
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
  // ATTESTATION-STYLE / NON-FATAL treatment as the dispatch posture above (never
  // changes the exit code). Read back the same post-install config.toml content.
  const v2DispatchMode = detectCodexDispatchMode(postInstallConfigContent);
  console.log(`Kaola-Workflow Codex multi_agent_v2 transport: ${v2DispatchMode.codex_v2_transport_mode}`);
  if (v2DispatchMode.multi_agent_v2_enabled) {
    console.log(
      `Kaola-Workflow Codex multi_agent_v2 role transport: namespace=${v2DispatchMode.codex_v2_tool_namespace || 'unknown'} `
      + `metadata=${v2DispatchMode.codex_v2_role_metadata_visible === true ? 'visible' : 'hidden-or-unknown'} `
      + `ready=${v2DispatchMode.codex_v2_role_transport_ready === true}`
    );
  }
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

  console.log('status: ok');
}

// #325: export the pure helpers for unit tests; only run the installer when invoked directly
// (require() must not run main()). pluginRoot derives from __dirname, not argv, so R1/R3 are only
// reachable by require()ing these helpers — the require.main guard makes that possible.
if (require.main === module) {
  main();
}

module.exports = {
  buildManagedHooks,
  mergeHooks,
  updateHooks,
  hookReferencedRelPaths,
  copyHookScripts,
  seedKaolaConfig,
  validateProfileText,
  classifyProfilePinPosture,
  validateSourceProfiles,
  pruneStaleProfiles,
  readManifest,
  writeManifest,
  RETIRED_PROFILE_FILES,
  MANIFEST_BASENAME,
  EFFORT_VALUES,
  CODEX_PINNED_STANDARD_ROLES,
  CODEX_PINNED_REASONING_ROLES,
  CODEX_ORCHESTRATION_ROLES,
  CODEX_STANDARD_MODEL,
  CODEX_STANDARD_EFFORT,
  CODEX_REASONING_MODEL,
  CODEX_REASONING_EFFORT,
  // #598: effort-gated dispatch-posture derivation (pure; exported for unit tests).
  detectCodexDispatchMode,
  CODEX_V2_TRANSPORT_UNSAFE_STATUS,
  CODEX_V2_DIRECT_TRANSPORT_NOTE,
  CODEX_V2_ROLE_TRANSPORT_UNSAFE_STATUS,
  CODEX_V2_ROLE_TOOL_NAMESPACE,
  CODEX_V2_ROLE_TRANSPORT_NOTE,
  deriveDispatchPosture,
  parseFeaturesMultiAgentEnabled,
  parseTopLevelModelReasoningEffort,
  dispatchPostureRemediation,
  DISPATCH_POSTURE_VERSION_NOTE,
  // #611: MultiAgentV2 concurrency + wait-timeout bounds derivation (pure; exported for unit tests).
  parseMultiAgentV2NumericFields,
  deriveMultiAgentV2Bounds,
  OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION,
  MULTI_AGENT_V2_BOUNDS_NOTE,
};
