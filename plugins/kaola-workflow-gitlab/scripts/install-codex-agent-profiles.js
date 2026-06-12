#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const pluginRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(process.argv[2] || process.cwd());
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
//   machine). docs-lookup.toml was renamed to knowledge-lookup in #249 — the only Kaola
//   role file ever retired. Append here whenever a role file is removed/renamed.
// EFFORT_VALUES — the only legal model_reasoning_effort values; the source schema
//   validator (validateProfileText) and the preflight's mirror both pin this set.
// NOTE: kaola-workflow-codex-preflight.js DUPLICATES validateProfileText + these
//   constants (the root scripts/ tree has no installer to require, and the preflight
//   is a true 4-tree byte-identical script that may not require() edition code). Keep
//   the two copies in lock-step when editing the schema rules.
const MANIFEST_BASENAME = '.kaola-managed-profiles.json';
const RETIRED_PROFILE_FILES = ['docs-lookup.toml'];
const EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh'];
const MANIFEST_SCHEMA_VERSION = 1;

// #405 (#382 deferred half): the OPUS_ELIGIBLE_ROLES membership + variantProfileText transform live in
// the ×4 byte-identical adaptive-schema (the single drift anchor). This installer require()s them only
// for the AUTHORING-TIME `--generate-variants` subcommand — the per-node `model: opus` → `<role>-max`
// dispatch is SKILL prose, and the committed agents/<role>-max.toml files install via copyAgentProfiles
// unfiltered (no install-time generation), so a normal install never touches the schema.
const { OPUS_ELIGIBLE_ROLES, variantProfileText } = require('./kaola-workflow-adaptive-schema.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
// with a fixed 3-key top-level shape: name / model_reasoning_effort /
// developer_instructions). The top-level region is the text before the first ^[ table.
// Returns [] when valid, or a list of human-readable reasons.
// ---------------------------------------------------------------------------
function validateProfileText(text, role) {
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

  const effortMatch = top.match(/^model_reasoning_effort\s*=\s*"([^"]*)"\s*$/m);
  if (!effortMatch) {
    reasons.push("missing top-level 'model_reasoning_effort'");
  } else if (!EFFORT_VALUES.includes(effortMatch[1])) {
    reasons.push(`model_reasoning_effort "${effortMatch[1]}" is not one of ${EFFORT_VALUES.join('/')}`);
  }

  const instrMatch = text.match(/^developer_instructions\s*=\s*"""([\s\S]*?)"""/m);
  if (!instrMatch) {
    reasons.push("missing top-level 'developer_instructions' triple-quoted block");
  } else if (instrMatch[1].trim() === '') {
    reasons.push("'developer_instructions' body is blank");
  }

  return reasons;
}

// Parse config/agents.toml for [agents.<role>] + its config_file line.
// Returns [{ role, configFile, basename }].
function parseTemplateEntries(templateText) {
  const entries = [];
  const lines = templateText.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const head = line.match(/^\[agents\.([a-z0-9-]+)\]\s*$/);
    if (head) {
      current = { role: head[1], configFile: null, basename: null };
      entries.push(current);
      continue;
    }
    if (current) {
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
    const reasons = validateProfileText(read(file), entry.role);
    for (const r of reasons) errors.push(`agents/${entry.basename}: ${r}`);
  }

  // Every agents/*.toml is referenced by exactly one entry (catches issue-scout class).
  for (const file of tomlFiles) {
    if (!referenced.has(file)) {
      errors.push(`agents/${file}: not referenced by any [agents.*] entry in config/agents.toml`);
    }
  }

  return { ok: errors.length === 0, errors, roles };
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

// #325 R2/R3: merge managed hooks into the existing hooks.json.
//   R2 — carry managed top-level keys ($schema editor hint) when absent on a fresh install, but an
//        existing user value still wins (managed spread first, existing second).
//   R3 — sweep EVERY event for kaola-workflow:-prefixed entries before re-adding, so an orphaned
//        managed entry under a now-unmanaged event is cleaned too (not just the currently-managed
//        set). Non-managed entries and unrelated events are preserved untouched.
// Pure + exported for unit tests.
function mergeHooks(existing, managed) {
  const ex = (existing && typeof existing === 'object') ? existing : { hooks: {} };
  const exHooks = (ex.hooks && typeof ex.hooks === 'object') ? ex.hooks : {};
  const merged = Object.assign({}, managed, ex, { hooks: Object.assign({}, exHooks) });
  // R3: strip managed-prefixed entries under ALL events (guard entries with no id).
  for (const event of Object.keys(merged.hooks)) {
    merged.hooks[event] = (merged.hooks[event] || []).filter(e => !(e && e.id && e.id.startsWith(MANAGED_HOOK_ID_PREFIX)));
  }
  // Re-add the managed entries per managed event.
  for (const [event, managedEntries] of Object.entries((managed && managed.hooks) || {})) {
    merged.hooks[event] = [...(merged.hooks[event] || []), ...managedEntries];
  }
  return merged;
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
function postVerify(templateRoles) {
  const problems = [];
  for (const role of templateRoles) {
    const file = path.join(targetAgentsDir, `${role}.toml`);
    if (!fs.existsSync(file)) {
      problems.push(`installed agents/kaola-workflow/${role}.toml is missing`);
      continue;
    }
    const reasons = validateProfileText(read(file), role);
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

// #405: extract the raw `[agents.<role>]` block text (header through the line before the next
// top-level table or EOF) from config/agents.toml. Returns null when the role has no table.
function extractConfigBlock(configText, role) {
  const lines = configText.split(/\r?\n/);
  const start = lines.findIndex(line => isTopLevelTable(line, `agents.${role}`));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !isAnyTopLevelTable(lines[end])) end++;
  // Drop a single trailing blank line so re-joins stay tidy.
  while (end > start + 1 && lines[end - 1].trim() === '') end--;
  return lines.slice(start, end).join('\n');
}

// #405: derive the `[agents.<role>-max]` config block from the base block — rename the header table,
// point config_file at the -max.toml, and tag the description as the xhigh effort variant (the
// nickname_candidates + other keys carry over verbatim). Deterministic text transform.
function variantConfigBlock(baseBlock, role) {
  return baseBlock
    .replace(new RegExp(`^\\[agents\\.${escapeRegExp(role)}\\]`, 'm'), `[agents.${role}-max]`)
    .replace(
      new RegExp(`^(config_file\\s*=\\s*")([^"]*)("\\s*)$`, 'm'),
      (_m, p1, p2, p3) => `${p1}${p2.replace(/\.toml$/, '-max.toml')}${p3}`
    )
    .replace(
      /^(description\s*=\s*")([^"]*)("\s*)$/m,
      (_m, p1, p2, p3) => `${p1}${p2} [xhigh effort variant — #382 model:opus tier]${p3}`
    );
}

// #405 (#382 deferred half): materialize the committed Codex `<role>-max` xhigh effort-variant
// profiles + their config/agents.toml registration blocks for every OPUS_ELIGIBLE_ROLE. Run at
// AUTHORING time (the `--generate-variants` subcommand), NOT at install. Writes are idempotent (a
// re-run reproduces byte-identical files/blocks), so they double as a drift-repair pass. The
// committed -max files then install via copyAgentProfiles unfiltered + register via the managed
// block. The contract validators independently re-derive these with variantProfileText and refuse on
// drift, so a hand-edit can never sneak past. Returns { wroteFiles:[...], wroteBlocks:[...] }.
function generateMaxVariants() {
  assert(fs.existsSync(sourceAgentsDir), `missing source agents directory: ${sourceAgentsDir}`);
  assert(fs.existsSync(sourceTemplate), `missing source config template: ${sourceTemplate}`);

  const wroteFiles = [];
  const wroteBlocks = [];

  // 1. Variant .toml files.
  for (const role of OPUS_ELIGIBLE_ROLES) {
    const baseFile = path.join(sourceAgentsDir, `${role}.toml`);
    assert(fs.existsSync(baseFile), `cannot generate ${role}-max: base profile missing at ${baseFile}`);
    const variantText = variantProfileText(read(baseFile), role);
    const variantFile = path.join(sourceAgentsDir, `${role}-max.toml`);
    const tmp = variantFile + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, variantText);
    fs.renameSync(tmp, variantFile);
    wroteFiles.push(`${role}-max.toml`);
  }

  // 2. config/agents.toml [agents.<role>-max] blocks — append a missing block; refresh an existing
  //    one in place. Appended in OPUS_ELIGIBLE_ROLES order at end of file.
  let configText = read(sourceTemplate);
  for (const role of OPUS_ELIGIBLE_ROLES) {
    const baseBlock = extractConfigBlock(configText, role);
    assert(baseBlock, `cannot generate [agents.${role}-max]: base block [agents.${role}] missing`);
    const variantBlock = variantConfigBlock(baseBlock, role);
    if (hasTopLevelTable(configText, `agents.${role}-max`)) {
      const existing = extractConfigBlock(configText, `${role}-max`);
      if (existing !== variantBlock) {
        configText = configText.replace(existing, variantBlock);
        wroteBlocks.push(`agents.${role}-max`);
      }
    } else {
      const trimmed = configText.replace(/\s*$/, '');
      configText = `${trimmed}\n\n${variantBlock}\n`;
      wroteBlocks.push(`agents.${role}-max`);
    }
  }
  const tmpCfg = sourceTemplate + '.tmp-' + process.pid;
  fs.writeFileSync(tmpCfg, configText);
  fs.renameSync(tmpCfg, sourceTemplate);

  return { wroteFiles, wroteBlocks };
}

function main() {
  // #405: authoring-time variant generator. `--generate-variants` materializes the committed
  // <role>-max profiles + config blocks, then exits without running the installer.
  if (process.argv.includes('--generate-variants')) {
    const { wroteFiles, wroteBlocks } = generateMaxVariants();
    console.log(`Kaola-Workflow Codex variants: wrote ${wroteFiles.length} <role>-max profile(s): ${wroteFiles.join(', ')}`);
    console.log(`Kaola-Workflow Codex variants: registered/refreshed ${wroteBlocks.length} config block(s)`);
    console.log('status: ok');
    return;
  }

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

  // 7-8. Prune stale/retired profiles, then record the ownership manifest.
  const { removed, extraUnmanaged } = pruneStaleProfiles(targetAgentsDir, copied, prevManifest);
  writeManifest(targetAgentsDir, { pluginRoot, copiedFiles: copied, removed });

  // 9. Post-verify before printing success.
  const problems = postVerify(templateRoles);
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
  generateMaxVariants,
  validateProfileText,
  validateSourceProfiles,
  pruneStaleProfiles,
  readManifest,
  writeManifest,
  RETIRED_PROFILE_FILES,
  MANIFEST_BASENAME,
  EFFORT_VALUES,
};
