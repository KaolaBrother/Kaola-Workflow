#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const pluginRoot = path.resolve(__dirname, '..');
// #571: `--global` targets ~/.codex (install once, all repos) regardless of cwd/arg-order.
// Position-robust: the flag is matched anywhere in argv. The positional projectRoot form ("$PWD" /
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
const REVIEWER_ROLES = Object.freeze(['code-reviewer', 'adversarial-verifier', 'security-reviewer']);
const REVIEWER_BEHAVIOR_CONTRACT_VERSION = 2;
const REVIEWER_SOURCE_REPAIR = 'node scripts/generate-reviewer-profiles.js --write && node scripts/generate-reviewer-profiles.js --check';
const CODEX_ROLE_TOP_LEVEL_FIELDS = Object.freeze([
  'name', 'description', 'nickname_candidates', 'developer_instructions',
]);

// Adaptive is the unconditional default and the sole workflow path; fast/full are retired, so the
// installer no longer parses --with-fast/--with-full and never records an installed_paths opt-in.
// --enable-adaptive is retired (#538) → warn + ignore. Unknown args are IGNORED (never hard-fail):
// the preflight (kaola-workflow-codex-preflight.js) and the test suites invoke the installer
// positionally with a project-root argv that must not be rejected.
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

function validateInstallTargets(templateEntries) {
  const homeDir = os.homedir();
  const sharedConfigDir = path.join(homeDir, '.config');
  const sharedKaolaConfigDir = path.join(sharedConfigDir, 'kaola-workflow');
  const checks = [
    [projectRoot, targetCodexDir, 'directory'],
    [projectRoot, path.join(targetCodexDir, 'agents'), 'directory'],
    [projectRoot, targetAgentsDir, 'directory'],
    [projectRoot, targetConfig, 'file'],
    [projectRoot, manifestPath(targetAgentsDir), 'file'],
    [homeDir, globalCodexDir, 'directory'],
    [homeDir, targetHooks, 'file'],
    [homeDir, targetStableDir, 'directory'],
    [homeDir, targetStableHooksDir, 'directory'],
    [homeDir, targetStableScriptsDir, 'directory'],
    [homeDir, sharedConfigDir, 'directory'],
    [homeDir, sharedKaolaConfigDir, 'directory'],
    [homeDir, path.join(sharedKaolaConfigDir, 'config.json'), 'file'],
  ];
  for (const entry of templateEntries || []) {
    if (entry && entry.basename) {
      checks.push([projectRoot, path.join(targetAgentsDir, entry.basename), 'file']);
    }
  }
  for (const [authority, target, kind] of checks) {
    const problem = installTargetPathProblem(authority, target, kind);
    if (problem) return problem;
  }
  return null;
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

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Managed role profiles intentionally use one small canonical TOML grammar: four bare,
// column-zero assignments and one triple-quoted developer_instructions block, with no tables.
// Reject every other spelling rather than approximating TOML acceptance. This makes quoted,
// dotted, indented, or table-scoped keys fail closed even when Codex itself parses them.
const TOML_KEY_SEGMENT_PATTERN = `(?:"(?:\\\\.|[^"\\\\])*"|'[^']*'|[A-Za-z0-9_-]+)`;
const TOML_ASSIGNMENT_PATTERN = new RegExp(
  `^(\\s*)(${TOML_KEY_SEGMENT_PATTERN}(?:\\s*\\.\\s*${TOML_KEY_SEGMENT_PATTERN})*)\\s*=`,
);

function tomlKeyLabel(raw) {
  const key = String(raw).trim();
  if (/^[A-Za-z0-9_-]+$/.test(key)) return key;
  if (/^"(?:\\.|[^"\\])*"$/.test(key)) {
    try { return JSON.parse(key); } catch (_) { return key; }
  }
  if (/^'[^']*'$/.test(key)) return key.slice(1, -1);
  return key.replace(/\s+/g, '');
}

function profileTopLevelShape(text) {
  const source = String(text);
  const instructionRe = /^developer_instructions\s*=\s*"""([\s\S]*?)"""\s*(?:\r?\n|$)/gm;
  const instructionMatches = [...source.matchAll(instructionRe)];
  let outside = '';
  let cursor = 0;
  for (const match of instructionMatches) {
    outside += source.slice(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  outside += source.slice(cursor);

  const fields = instructionMatches.map(() => 'developer_instructions');
  const violations = [];
  if (source.includes('\r')) violations.push({ kind: 'line_endings', value: 'LF required' });
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
    violations.push({ kind: 'control', value: 'raw TOML control character' });
  }
  const instructionBackslash = instructionMatches.some(match => match[1].includes('\\'));
  if (source.includes('\\')) {
    violations.push(instructionBackslash
      ? { kind: 'instruction_backslash', value: 'backslash in multiline basic string' }
      : { kind: 'backslash', value: 'backslash in managed TOML' });
  }
  for (const [index, line] of outside.split(/\r?\n/).entries()) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const table = line.match(/^\s*(\[\[?.*?\]\]?)\s*(?:#.*)?$/);
    if (table) {
      violations.push({ kind: 'table', value: table[1], line: index + 1 });
      continue;
    }
    const assignment = line.match(TOML_ASSIGNMENT_PATTERN);
    if (!assignment) {
      violations.push({ kind: 'syntax', value: line.trim(), line: index + 1 });
      continue;
    }
    const rawKey = assignment[2];
    const field = tomlKeyLabel(rawKey);
    fields.push(field);
    if (assignment[1] !== '' || !/^[A-Za-z0-9_-]+$/.test(rawKey)) {
      violations.push({ kind: 'syntax', value: `noncanonical key ${rawKey}`, line: index + 1 });
    }
    if (!CODEX_ROLE_TOP_LEVEL_FIELDS.includes(field)) {
      violations.push({ kind: 'field', value: field, line: index + 1 });
    }
  }
  for (const field of CODEX_ROLE_TOP_LEVEL_FIELDS) {
    const count = fields.filter(value => value === field).length;
    if (count > 1) violations.push({ kind: 'duplicate', value: field, count });
  }
  return {
    source,
    outside,
    fields,
    violations,
    instructionMatches,
    instructionMatch: instructionMatches.length === 1 ? instructionMatches[0] : null,
    instructionBody: instructionMatches.length === 1 ? instructionMatches[0][1] : null,
  };
}

function genericShapeReasons(shape) {
  return shape.violations.map(violation => {
    if (violation.kind === 'line_endings') return 'codex_role_toml_line_endings_forbidden';
    if (violation.kind === 'control') return 'codex_role_toml_control_character_forbidden';
    if (violation.kind === 'instruction_backslash') return 'codex_role_instruction_toml_backslash_forbidden';
    if (violation.kind === 'backslash') return 'codex_role_toml_backslash_forbidden';
    if (violation.kind === 'field') return `codex_role_field_forbidden: ${violation.value}`;
    if (violation.kind === 'table') return `codex_role_table_forbidden: ${violation.value}`;
    if (violation.kind === 'duplicate') return `codex_role_top_level_field_duplicate: ${violation.value}`;
    return `codex_role_top_level_syntax_forbidden: line=${violation.line} ${violation.value}`;
  });
}

function reviewerShapeReasons(shape) {
  return shape.violations.map(violation => {
    if (violation.kind === 'line_endings') return 'reviewer_toml_line_endings_forbidden';
    if (violation.kind === 'control') return 'reviewer_toml_control_character_forbidden';
    if (violation.kind === 'instruction_backslash') return 'reviewer_instruction_toml_backslash_forbidden';
    if (violation.kind === 'backslash') return 'reviewer_toml_backslash_forbidden';
    if (violation.kind === 'field') return `reviewer_adapter_field_forbidden: ${violation.value}`;
    if (violation.kind === 'table') return `reviewer_adapter_table_forbidden: ${violation.value}`;
    if (violation.kind === 'duplicate') return `reviewer_top_level_field_duplicate: ${violation.value}`;
    return `reviewer_adapter_syntax_forbidden: line=${violation.line} ${violation.value}`;
  });
}

// Generated reviewer profiles carry two identities: the runtime-neutral behavior contract and
// the complete resolved profile. The latter is a self-hash over all rendered bytes with its one
// value slot normalized to 64 zeroes. This verifier is intentionally local to the installer so a
// cached plugin remains self-contained; repository validators separately prove generator parity.
function reviewerProfileContract(text, role) {
  const reasons = [];
  if (!REVIEWER_ROLES.includes(role)) return { reasons, identity: null };

  const shape = profileTopLevelShape(text);
  const source = shape.source;
  const instructionMatch = shape.instructionMatch;
  const instructionText = shape.instructionBody || '';
  reasons.push(...reviewerShapeReasons(shape));

  const coreStarts = instructionText.split('<!-- reviewer-behavior-core:start -->').length - 1;
  const coreEnds = instructionText.split('<!-- reviewer-behavior-core:end -->').length - 1;
  let core = '';
  let coreStart = -1;
  let coreEnd = -1;
  if (coreStarts !== 1 || coreEnds !== 1) {
    reasons.push(`reviewer_behavior_core_invalid: starts=${coreStarts} ends=${coreEnds}`);
  } else {
    coreStart = instructionText.indexOf('<!-- reviewer-behavior-core:start -->');
    const endMarkerStart = instructionText.indexOf('<!-- reviewer-behavior-core:end -->', coreStart);
    coreEnd = endMarkerStart + '<!-- reviewer-behavior-core:end -->'.length;
    if (endMarkerStart < coreStart) {
      reasons.push('reviewer_behavior_core_invalid: markers_out_of_order');
      coreStart = -1;
      coreEnd = -1;
    } else {
      core = instructionText.slice(coreStart, coreEnd);
    }
  }
  const coreRoleMatches = [...core.matchAll(/^role:[ \t]*([^\r\n]+)[ \t]*$/gm)];
  if (coreRoleMatches.length !== 1) {
    reasons.push(`reviewer_behavior_core_role_not_unique: count=${coreRoleMatches.length}`);
  } else if (coreRoleMatches[0][1].trim() !== role) {
    reasons.push('reviewer_behavior_core_role_mismatch');
  }

  const versionFields = [...instructionText.matchAll(
    /^behavior_contract_version[ \t]*:[ \t]*([^\r\n]*)[ \t]*$/gm,
  )];
  let coreVersion = null;
  if (versionFields.length === 0) {
    reasons.push('reviewer_behavior_core_version_missing');
  } else if (versionFields.length !== 1) {
    reasons.push(`reviewer_behavior_contract_version_not_unique: count=${versionFields.length}`);
  } else {
    const rawVersion = versionFields[0][1].trim();
    if (!/^\d+$/.test(rawVersion)) {
      reasons.push('reviewer_behavior_core_version_missing');
    } else {
      coreVersion = Number(rawVersion);
    }
    if (coreStart < 0 || versionFields[0].index < coreStart
        || versionFields[0].index + versionFields[0][0].length > coreEnd) {
      reasons.push('reviewer_behavior_contract_version_outside_core');
    }
  }
  if (coreVersion !== null && coreVersion !== REVIEWER_BEHAVIOR_CONTRACT_VERSION) {
    reasons.push(`reviewer_contract_version_unsupported: expected=${REVIEWER_BEHAVIOR_CONTRACT_VERSION} got=${coreVersion}`);
  }

  const behaviorFields = [...instructionText.matchAll(
    /^behavior_contract_hash[ \t]*:[ \t]*([^\r\n]*)[ \t]*$/gm,
  )];
  let coreBehaviorHash = null;
  if (behaviorFields.length === 0) {
    reasons.push('reviewer_behavior_core_hash_missing');
  } else if (behaviorFields.length !== 1) {
    reasons.push(`reviewer_behavior_contract_hash_not_unique: count=${behaviorFields.length}`);
  } else {
    const rawHash = behaviorFields[0][1].trim();
    if (/^[0-9a-f]{64}$/.test(rawHash)) coreBehaviorHash = rawHash;
    else reasons.push('reviewer_behavior_core_hash_missing');
    if (coreStart < 0 || behaviorFields[0].index < coreStart
        || behaviorFields[0].index + behaviorFields[0][0].length > coreEnd) {
      reasons.push('reviewer_behavior_contract_hash_outside_core');
    }
  }

  const identityStarts = instructionText.split('<!-- reviewer-profile-identity:start -->').length - 1;
  const identityEnds = instructionText.split('<!-- reviewer-profile-identity:end -->').length - 1;
  let identityStart = -1;
  let identityEnd = -1;
  if (identityStarts !== 1 || identityEnds !== 1) {
    reasons.push(`reviewer_profile_identity_invalid: starts=${identityStarts} ends=${identityEnds}`);
  } else {
    identityStart = instructionText.indexOf('<!-- reviewer-profile-identity:start -->');
    const endMarkerStart = instructionText.indexOf('<!-- reviewer-profile-identity:end -->', identityStart);
    identityEnd = endMarkerStart + '<!-- reviewer-profile-identity:end -->'.length;
    if (endMarkerStart < identityStart) {
      reasons.push('reviewer_profile_identity_invalid: markers_out_of_order');
      identityStart = -1;
      identityEnd = -1;
    }
  }

  const resolvedFields = [...instructionText.matchAll(
    /^resolved_profile_hash[ \t]*:[ \t]*([^\r\n]*)[ \t]*$/gm,
  )];
  let resolvedProfileHash = null;
  if (resolvedFields.length === 0) {
    reasons.push('reviewer_resolved_profile_hash_missing');
  } else if (resolvedFields.length !== 1) {
    reasons.push(`reviewer_resolved_profile_hash_not_unique: count=${resolvedFields.length}`);
  } else {
    const match = resolvedFields[0];
    const rawHash = match[1].trim();
    if (/^[0-9a-f]{64}$/.test(rawHash)) {
      resolvedProfileHash = rawHash;
      const bodyOffset = instructionMatch.index + instructionMatch[0].indexOf(instructionMatch[1]);
      const valueOffset = bodyOffset + match.index + match[0].indexOf(rawHash);
      const normalized = source.slice(0, valueOffset) + '0'.repeat(64)
        + source.slice(valueOffset + rawHash.length);
      const expected = sha256Hex(normalized);
      if (resolvedProfileHash !== expected) {
        reasons.push(`reviewer_resolved_profile_hash_mismatch: expected=${expected} got=${resolvedProfileHash}`);
      }
    } else {
      reasons.push('reviewer_resolved_profile_hash_missing');
    }
    if (identityStart < 0 || match.index < identityStart
        || match.index + match[0].length > identityEnd) {
      reasons.push('reviewer_resolved_profile_hash_outside_identity');
    }
  }

  const identity = reasons.length === 0
      && coreVersion === REVIEWER_BEHAVIOR_CONTRACT_VERSION
      && coreBehaviorHash && resolvedProfileHash
    ? {
      behavior_contract_version: coreVersion,
      behavior_contract_hash: coreBehaviorHash,
      resolved_profile_hash: resolvedProfileHash,
    }
    : null;
  return { reasons: [...new Set(reasons)], identity };
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

function stripManagedBlocks(existing) {
  const range = managedMarkerRange(existing);
  return range.state === 'present'
    ? existing.slice(0, range.start) + existing.slice(range.end)
    : existing;
}

function isTopLevelTable(line, table) {
  const tableName = parseTomlTableName(stripTomlComment(line).trim());
  return tomlTableNameMatches(tableName, table);
}

function isAnyTopLevelTable(line) {
  return parseTomlTableName(stripTomlComment(line).trim()) !== null;
}

function hasTopLevelTable(content, table) {
  let currentTable = null;
  for (const rawLine of tomlStructuralLines(content)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      currentTable = tableName;
      if (tomlTableNameMatches(tableName, table)) return true;
      continue;
    }
    if (currentTable !== null) continue;
    const assignment = parseTomlAssignment(line);
    if (assignment && assignment.key[0] && assignment.key[0].value === table) return true;
  }
  return false;
}

function removeTopLevelTable(content, table) {
  const lines = content.split(/\r?\n/);
  const structuralLines = tomlStructuralLines(content);
  const start = structuralLines.findIndex(line => isTopLevelTable(line, table));
  if (start === -1) return content;

  let end = start + 1;
  while (end < lines.length && !isAnyTopLevelTable(structuralLines[end])) end++;

  return [...lines.slice(0, start), ...lines.slice(end)].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function managedBlock(existing) {
  const hasExternalFeatures = hasTopLevelTable(stripManagedBlocks(existing), 'features');
  const template = hasExternalFeatures
    ? removeTopLevelTable(read(sourceTemplate).trim(), 'features')
    : read(sourceTemplate).trim();
  return `${beginMarker}\n${template}\n${endMarker}`;
}

function managedRolesInInlineTable(value, managedRoleSet) {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  const roles = [];
  for (const field of splitInlineTomlFields(trimmed.slice(1, -1))) {
    const assignment = parseTomlAssignment(field);
    const role = assignment && assignment.key[0] && assignment.key[0].value;
    if (role && managedRoleSet.has(role)) roles.push(role);
  }
  return roles;
}

// Parse only declarations rooted at the TOML `agents` namespace. Exact, nested,
// quoted, dotted, and inline spellings of a managed role all alias the managed
// catalog and are unsafe outside our markers; unrelated user roles are preserved.
function managedRoleDeclarationsOutside(content, managedRoles) {
  const managedRoleSet = new Set(managedRoles || []);
  const conflicts = [];
  let currentTable = null;

  function record(role) {
    if (managedRoleSet.has(role)) conflicts.push(role);
  }

  for (const rawLine of tomlStructuralLines(content)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const tableName = parseTomlTableName(line);
    if (tableName !== null) {
      currentTable = tableName;
      const segments = Array.isArray(tableName.segments) ? tableName.segments : [];
      if (segments[0] && segments[0].value === 'agents' && segments[1]) {
        record(segments[1].value);
      }
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (!assignment) continue;
    const tableSegments = currentTable && Array.isArray(currentTable.segments)
      ? currentTable.segments : [];

    if (tableSegments.length === 1 && tableSegments[0].value === 'agents') {
      const role = assignment.key[0] && assignment.key[0].value;
      record(role);
      continue;
    }
    if (currentTable !== null) continue;

    const root = assignment.key[0] && assignment.key[0].value;
    if (root !== 'agents') continue;
    if (assignment.key[1]) {
      record(assignment.key[1].value);
    } else {
      conflicts.push(...managedRolesInInlineTable(assignment.value, managedRoleSet));
    }
  }

  return [...new Set(conflicts)].sort();
}

// One proof primitive owns marker identity, canonical managed bytes, and the
// absence of managed-role declarations outside the owned range. Pre-install
// callers allow an absent/canonically replaceable body; postVerify requires the
// exact current body selected for the surrounding external features posture.
function managedConfigProof(content, managedRoles, options = {}) {
  const source = String(content || '');
  const range = managedMarkerRange(source);
  let outside = source;
  let actualBlock = '';
  if (range.state === 'present') {
    const blockEnd = range.endMarkerStart + endMarker.length;
    actualBlock = source.slice(range.start, blockEnd);
    outside = source.slice(0, range.start) + source.slice(range.end);
  }
  const conflictingRolesOutside = managedRoleDeclarationsOutside(outside, managedRoles);
  const expectedBlock = options.requireCanonicalBody ? managedBlock(outside) : null;
  const bodyCanonical = !options.requireCanonicalBody
    || (range.state === 'present' && actualBlock === expectedBlock);
  return {
    range,
    outside,
    actualBlock,
    expectedBlock,
    bodyCanonical,
    conflictingRolesOutside,
  };
}

function upsertBlock(existing, block) {
  const range = managedMarkerRange(existing);
  if (range.state === 'invalid') {
    throw new Error('managed_block_ambiguous: expected zero or one ordered top-level marker pair');
  }
  if (range.state === 'present') {
    return existing.slice(0, range.start) + `${block}\n` + existing.slice(range.end);
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
  const shape = profileTopLevelShape(text);
  const top = shape.outside;
  reasons.push(...genericShapeReasons(shape));

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

  const modelLines = shape.fields.filter(field => field === 'model');
  const effortLines = shape.fields.filter(field => field === 'model_reasoning_effort');
  if (!CODEX_PINNED_STANDARD_ROLES.includes(role) && !CODEX_PINNED_REASONING_ROLES.includes(role)) {
    reasons.push(`role "${role}" has no Codex profile-tier policy`);
  }
  if (modelLines.length > 0) reasons.push("top-level 'model' must be omitted to inherit the parent session");
  if (effortLines.length > 0) reasons.push("top-level 'model_reasoning_effort' must be omitted to inherit the parent session");

  const instrMatch = shape.instructionMatch;
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

  reasons.push(...reviewerProfileContract(text, role).reasons);

  return [...new Set(reasons)];
}

function classifyProfilePinPosture(text) {
  const top = profileTopLevelShape(text).outside;
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

  const seenRoles = new Set();
  const seenConfigFiles = new Set();
  const seenBasenames = new Set();
  for (const entry of entries) {
    if (seenRoles.has(entry.role)) {
      errors.push(`agents.toml duplicate [agents.${entry.role}] entry`);
    }
    seenRoles.add(entry.role);
    if (!entry.configFile || !entry.basename) continue;
    if (seenConfigFiles.has(entry.configFile)) {
      errors.push(`agents.toml duplicate config_file "${entry.configFile}" reference`);
    }
    seenConfigFiles.add(entry.configFile);
    if (seenBasenames.has(entry.basename)) {
      errors.push(`agents.toml duplicate config_file basename "${entry.basename}" reference`);
    }
    seenBasenames.add(entry.basename);
    const canonicalBasename = `${entry.role}.toml`;
    if (entry.basename !== canonicalBasename) {
      errors.push(
        `agents.toml [agents.${entry.role}] config_file basename must be "${canonicalBasename}" `
        + `(got "${entry.basename}")`
      );
    }
  }

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
    const text = read(file);
    entry.sourceText = text;
    entry.sourceSha256 = sha256(Buffer.from(text, 'utf8'));
    entry.profileContract = reviewerProfileContract(text, entry.role).identity;
    const reasons = validateProfileText(text, entry.role, entry);
    for (const r of reasons) errors.push(`agents/${entry.basename}: ${r}`);
  }

  // Every agents/*.toml is referenced by exactly one entry (catches issue-scout class).
  for (const file of tomlFiles) {
    if (!referenced.has(file)) {
      errors.push(`agents/${file}: not referenced by any [agents.*] entry in config/agents.toml`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    roles,
    entries,
    repair: errors.length > 0 ? REVIEWER_SOURCE_REPAIR : null,
  };
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
//   listed in prevManifest.files  -> unlink only when its current bytes still
//                                    match the recorded hash (stale-managed);
//                                    otherwise keep as unmanaged
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
      const file = path.join(agentsDir, name);
      const recordedHash = prevManifest.files[name];
      let hashMatches = false;
      try {
        hashMatches = typeof recordedHash === 'string'
          && /^sha256:[0-9a-f]{64}$/.test(recordedHash)
          && fs.lstatSync(file).isFile()
          && sha256(fs.readFileSync(file)) === recordedHash;
      } catch {
        hashMatches = false;
      }
      if (hashMatches) {
        fs.unlinkSync(file);
        removed.push({ file: name, reason: 'stale-managed' });
      } else {
        extraUnmanaged.push(name);
      }
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
  const profileContracts = {};
  const roles = [];
  for (const name of copiedFiles.slice().sort()) {
    const role = name.replace(/\.toml$/, '');
    const bytes = fs.readFileSync(path.join(agentsDir, name));
    roles.push(role);
    files[name] = sha256(bytes);
    if (REVIEWER_ROLES.includes(role)) {
      const contract = reviewerProfileContract(bytes.toString('utf8'), role);
      assert(contract.reasons.length === 0 && contract.identity,
        `cannot manifest invalid generated reviewer profile ${name}: ${contract.reasons.join('; ')}`);
      profileContracts[name] = contract.identity;
    }
  }

  const manifest = {
    schema_version: MANIFEST_SCHEMA_VERSION,
    plugin: pluginName,
    plugin_version: pluginVersion,
    installed_at: new Date().toISOString(),
    source_plugin_root: srcRoot,
    roles,
    files,
    profile_contracts: profileContracts,
    retired_files_removed: removed
      .filter(r => r.reason === 'retired')
      .map(r => r.file)
      .sort(),
  };

  fs.writeFileSync(manifestPath(agentsDir), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

const ATOMIC_STAGE_ATTEMPTS = 16;

function atomicStageFailure(status, detail) {
  const error = new Error(`${status}: ${detail}`);
  error.code = status;
  return error;
}

function assertAtomicParent(parent, expectedStat, expectedRealPath) {
  const current = lstatIfPresent(parent);
  if (!current || current.isSymbolicLink() || !current.isDirectory()
      || !sameFileIdentity(current, expectedStat)) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `staging parent changed or is not a non-symlink directory: ${parent}`);
  }
  const currentRealPath = fs.realpathSync(parent);
  if (currentRealPath !== expectedRealPath) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `staging parent escaped its original filesystem location: ${parent}`);
  }
}

function sameFileVersion(left, right) {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function readAtomicTargetVersion(target, expectedStat) {
  let descriptor = null;
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    try {
      descriptor = fs.openSync(target, fs.constants.O_RDONLY | noFollow);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        throw atomicStageFailure('atomic_stage_conflict',
          `atomic replacement target disappeared while reading: ${target}`);
      }
      if (error && error.code === 'ELOOP') {
        throw atomicStageFailure('atomic_stage_unsafe',
          `atomic replacement target became a symlink while reading: ${target}`);
      }
      throw error;
    }

    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) {
      throw atomicStageFailure('atomic_stage_unsafe',
        `atomic replacement target is not a regular file: ${target}`);
    }
    if (!sameFileVersion(before, expectedStat)) {
      throw atomicStageFailure('atomic_stage_conflict',
        `atomic replacement target changed before reading: ${target}`);
    }
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    const pathAfter = lstatIfPresent(target);
    if (!pathAfter || pathAfter.isSymbolicLink() || !pathAfter.isFile()) {
      throw atomicStageFailure(pathAfter ? 'atomic_stage_unsafe' : 'atomic_stage_conflict',
        `atomic replacement target changed while reading: ${target}`);
    }
    if (!sameFileVersion(before, after) || !sameFileVersion(after, pathAfter)) {
      throw atomicStageFailure('atomic_stage_conflict',
        `atomic replacement target changed while reading: ${target}`);
    }
    return { stat: pathAfter, bytes };
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch (_closeError) { /* preserve the primary result */ }
    }
  }
}

function captureAtomicTargetVersion(target) {
  const current = lstatIfPresent(target);
  if (!current) return { stat: null, bytes: null };
  if (current.isSymbolicLink() || !current.isFile()) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `atomic replacement target is not a regular non-symlink file: ${target}`);
  }
  return readAtomicTargetVersion(target, current);
}

function assertAtomicTarget(target, expectedStat, expectedVersion) {
  const current = lstatIfPresent(target);
  if (current && (current.isSymbolicLink() || !current.isFile())) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `atomic replacement target is not a regular non-symlink file: ${target}`);
  }
  if (Boolean(current) !== Boolean(expectedStat)
      || (current && !sameFileIdentity(current, expectedStat))) {
    throw atomicStageFailure(expectedVersion === undefined
      ? 'atomic_stage_unsafe'
      : 'atomic_stage_conflict',
      `atomic replacement target changed while staging: ${target}`);
  }
  if (expectedVersion !== undefined && current) {
    const actualVersion = readAtomicTargetVersion(target, expectedStat);
    if (!actualVersion.bytes.equals(expectedVersion.bytes)) {
      throw atomicStageFailure('atomic_stage_conflict',
        `atomic replacement target content changed while staging: ${target}`);
    }
  }
}

function cleanupOwnedAtomicStage(stage, ownedStat) {
  if (!stage || !ownedStat) return;
  try {
    const current = lstatIfPresent(stage);
    if (current && !current.isSymbolicLink() && current.isFile()
        && sameFileIdentity(current, ownedStat)) {
      fs.unlinkSync(stage);
    }
  } catch (_cleanupError) {
    // Best effort only. Never unlink a replacement with a different identity,
    // and never mask the write/validation error that caused cleanup.
  }
}

// Create a fresh same-directory stage with O_EXCL semantics, validate that its
// parent/target/path identities did not change, then atomically rename it into
// place. Existing candidate names are unowned collisions: retry them untouched.
function atomicWriteSameDirectory(target, bytes, expectedVersion) {
  const destination = path.resolve(target);
  const parent = path.dirname(destination);
  if (path.join(parent, path.basename(destination)) !== destination) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `atomic replacement target is not lexically contained by its parent: ${destination}`);
  }

  const parentStat = lstatIfPresent(parent);
  if (!parentStat || parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `staging parent must be an existing non-symlink directory: ${parent}`);
  }
  const parentRealPath = fs.realpathSync(parent);
  let targetStat;
  if (expectedVersion === undefined) {
    targetStat = lstatIfPresent(destination);
    if (targetStat && (targetStat.isSymbolicLink() || !targetStat.isFile())) {
      throw atomicStageFailure('atomic_stage_unsafe',
        `atomic replacement target is not a regular non-symlink file: ${destination}`);
    }
  } else {
    targetStat = expectedVersion.stat;
    assertAtomicTarget(destination, targetStat, expectedVersion);
  }

  for (let attempt = 0; attempt < ATOMIC_STAGE_ATTEMPTS; attempt += 1) {
    assertAtomicParent(parent, parentStat, parentRealPath);
    const suffix = crypto.randomBytes(16).toString('hex');
    const stage = `${destination}.kaola-stage-${suffix}`;
    if (path.dirname(stage) !== parent) {
      throw atomicStageFailure('atomic_stage_unsafe',
        `staging candidate escaped the destination directory: ${stage}`);
    }

    let descriptor = null;
    let ownedStat = null;
    let renamed = false;
    try {
      try {
        descriptor = fs.openSync(stage, 'wx', 0o666);
      } catch (error) {
        if (error && error.code === 'EEXIST') continue;
        throw error;
      }

      ownedStat = fs.fstatSync(descriptor);
      if (!ownedStat.isFile()) {
        throw atomicStageFailure('atomic_stage_unsafe',
          `exclusive staging descriptor is not a regular file: ${stage}`);
      }
      fs.writeFileSync(descriptor, bytes);
      fs.closeSync(descriptor);
      descriptor = null;

      assertAtomicParent(parent, parentStat, parentRealPath);
      const currentStage = lstatIfPresent(stage);
      if (!currentStage || currentStage.isSymbolicLink() || !currentStage.isFile()
          || !sameFileIdentity(currentStage, ownedStat)) {
        throw atomicStageFailure('atomic_stage_unsafe',
          `exclusive stage changed before rename: ${stage}`);
      }
      const stageRealPath = fs.realpathSync(stage);
      if (path.dirname(stageRealPath) !== parentRealPath) {
        throw atomicStageFailure('atomic_stage_unsafe',
          `exclusive stage escaped its destination directory: ${stage}`);
      }
      assertAtomicTarget(destination, targetStat, expectedVersion);

      fs.renameSync(stage, destination);
      renamed = true;
      return;
    } finally {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor); } catch (_closeError) { /* cleanup below */ }
      }
      if (!renamed) cleanupOwnedAtomicStage(stage, ownedStat);
    }
  }

  throw atomicStageFailure('atomic_stage_collision',
    `could not create an exclusive stage for ${destination} after ${ATOMIC_STAGE_ATTEMPTS} attempts`);
}

// Copy each source profile via exclusive write-temp-then-rename so a crash
// mid-copy never leaves a torn profile. Returns sorted copied *.toml basenames.
function copyAgentProfiles(sourceDir = sourceAgentsDir, agentsDir = targetAgentsDir) {
  const agentsDirProblem = lstatIfPresent(agentsDir);
  if (agentsDirProblem && (agentsDirProblem.isSymbolicLink() || !agentsDirProblem.isDirectory())) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `profile destination must be a non-symlink directory: ${agentsDir}`);
  }
  fs.mkdirSync(agentsDir, { recursive: true });
  const createdAgentsDir = fs.lstatSync(agentsDir);
  if (createdAgentsDir.isSymbolicLink() || !createdAgentsDir.isDirectory()) {
    throw atomicStageFailure('atomic_stage_unsafe',
      `profile destination must remain a non-symlink directory: ${agentsDir}`);
  }
  const copied = [];

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(agentsDir, entry.name);
    const targetProblem = installTargetPathProblem(agentsDir, target, 'file');
    if (targetProblem) {
      throw atomicStageFailure('atomic_stage_unsafe', targetProblem);
    }
    atomicWriteSameDirectory(target, fs.readFileSync(source));
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
        assert(installedCurrent && sameFileIdentity(installedCurrent, state.installedStat),
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
      assert(installedCurrent && sameFileIdentity(installedCurrent, hooksInstalledStat),
        `hook destination changed during stage promotion: ${targetHooks}`);
    }

    transaction.finalize();
    if (hooksBackup) cleanupOwnedFile(hooksBackup.path, hooksBackup.stat);
    return { status: hooksChanged ? 'updated' : 'unchanged', stableCopy: transaction.summary };
  } catch (error) {
    if (hooksInstalled) {
      const installedCurrent = lstatIfPresent(targetHooks);
      if ((!installedCurrent || sameFileIdentity(installedCurrent, hooksInstalledStat))
          && hooksBackup && ownedPathMatches(hooksBackup.path, hooksBackup.stat, 'file')) {
        try {
          fs.renameSync(hooksBackup.path, targetHooks);
          hooksBackup = null;
        } catch (rollbackError) {
          error.message += `; hooks.json rollback failed: ${rollbackError.message}`;
        }
      } else if (installedCurrent && sameFileIdentity(installedCurrent, hooksInstalledStat)) {
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
    const source = path.join(sourceAgentsDir, `${role}.toml`);
    if (!fs.readFileSync(file).equals(fs.readFileSync(source))) {
      problems.push(`installed ${role}.toml bytes do not match selected source ${source}`);
    }
  }

  const configText = fs.existsSync(targetConfig) ? read(targetConfig) : '';
  const configProof = managedConfigProof(configText, templateRoles, {
    requireCanonicalBody: true,
  });
  const blockBody = configProof.actualBlock;
  if (configProof.range.state === 'invalid') {
    problems.push('managed block markers are ambiguous in .codex/config.toml after install');
  } else if (configProof.range.state !== 'present') {
    problems.push('managed block markers not found in .codex/config.toml after install');
  }
  if (!configProof.bodyCanonical) {
    problems.push('managed block body is not the canonical selected template after install');
  }
  if (configProof.conflictingRolesOutside.length > 0) {
    problems.push(
      'managed role declarations remain outside the managed block after install: '
      + configProof.conflictingRolesOutside.join(', '),
    );
  }
  for (const role of templateRoles) {
    const re = new RegExp(`^\\[agents\\.${escapeRegExp(role)}\\]`, 'm');
    if (!re.test(blockBody)) {
      problems.push(`managed block missing [agents.${role}] after install`);
    }
  }

  return problems;
}

// seedKaolaConfig — pure-JS seed writer for ~/.config/kaola-workflow/config.json (node-native; no
// python3 dependency — node is guaranteed present for a node installer). The shared config path is
// edition-agnostic (a Claude/opencode install reads the same file). Adaptive is the sole workflow
// path: fast/full are retired, so this NEVER writes installed_paths — it seeds parallel_mode
// (setdefault 'auto', never overwriting a user value) and strips any stale installed_paths /
// enable_adaptive on a touched config (tolerated on read, never re-written). WARN-first: a
// corrupt/non-object existing config warns and is left UNTOUCHED (never throws, never aborts the
// success path). Write-temp-then-rename for crash-safety parity with copyAgentProfiles. Pure +
// exported for unit tests.
const SHARED_CONFIG_CAS_ATTEMPTS = 4;

function seedKaolaConfig(homeDir) {
  const configDir = path.join(homeDir, '.config', 'kaola-workflow');
  const configFile = path.join(configDir, 'config.json');
  const preflightProblem = installTargetPathProblem(homeDir, configDir, 'directory')
    || installTargetPathProblem(homeDir, configFile, 'file');
  if (preflightProblem) {
    throw atomicStageFailure('atomic_stage_unsafe', preflightProblem);
  }

  for (let attempt = 0; attempt < SHARED_CONFIG_CAS_ATTEMPTS; attempt += 1) {
    try {
      const expectedVersion = captureAtomicTargetVersion(configFile);
      let config = {};
      if (expectedVersion.stat) {
        let parsed;
        try { parsed = JSON.parse(expectedVersion.bytes.toString('utf8')); }
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
      if (config.parallel_mode === undefined) config.parallel_mode = 'auto'; // setdefault, preserve user value
      delete config.installed_paths;                                       // retired: never written; strip stale
      delete config.enable_adaptive;                                       // migrate retired field

      fs.mkdirSync(configDir, { recursive: true });
      const postMkdirProblem = installTargetPathProblem(homeDir, configDir, 'directory')
        || installTargetPathProblem(homeDir, configFile, 'file');
      if (postMkdirProblem) {
        throw atomicStageFailure('atomic_stage_unsafe', postMkdirProblem);
      }
      atomicWriteSameDirectory(
        configFile,
        JSON.stringify(config, null, 2) + '\n',
        expectedVersion,
      );
      console.log(`Kaola-Workflow Codex installer: seeded parallel_mode (adaptive is the only workflow path) in ${configFile}`);
      return { status: 'updated' };
    } catch (error) {
      if (error && error.code === 'atomic_stage_conflict'
          && attempt + 1 < SHARED_CONFIG_CAS_ATTEMPTS) {
        continue;
      }
      throw error;
    }
  }

  throw atomicStageFailure('atomic_stage_conflict',
    `shared config changed during all ${SHARED_CONFIG_CAS_ATTEMPTS} merge attempts: ${configFile}`);
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
    const assignment = parseTomlAssignment(field);
    if (!assignment || assignment.key.length !== 1) continue;
    const key = assignment.key[0].value;
    if (key === 'enabled') {
      if (enabledFound) return { valid: false, enabled: false, non_code_mode_only: null };
      const fieldBool = parseTomlBoolean(assignment.value);
      if (fieldBool === null) return { valid: false, enabled: false, non_code_mode_only: null };
      enabledFound = true;
      enabled = fieldBool;
      continue;
    }
    if (key === 'non_code_mode_only') {
      if (transportFound) {
        transportAmbiguous = true;
        continue;
      }
      const fieldBool = parseTomlBoolean(assignment.value);
      transportFound = true;
      if (fieldBool === null) transportAmbiguous = true;
      else nonCodeModeOnly = fieldBool;
      continue;
    }
    if (key === 'hide_spawn_agent_metadata') {
      if (metadataFound) {
        metadataAmbiguous = true;
        continue;
      }
      const fieldBool = parseTomlBoolean(assignment.value);
      metadataFound = true;
      if (fieldBool === null) metadataAmbiguous = true;
      else hideSpawnAgentMetadata = fieldBool;
      continue;
    }
    if (key === 'tool_namespace') {
      if (namespaceFound) {
        namespaceAmbiguous = true;
        continue;
      }
      const fieldString = parseTomlString(assignment.value);
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
  const lines = tomlStructuralLines(configContent);
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
  let forcedUnsafe = false;

  function forceUnsafe() {
    forcedUnsafe = true;
    transportAmbiguous = true;
    metadataAmbiguous = true;
    namespaceAmbiguous = true;
  }

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

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) {
        forceUnsafe();
        continue;
      }
      const v2Fields = featureFields.filter(field => field.key[0].value === 'multi_agent_v2');
      if (v2Fields.length > 1) {
        forceUnsafe();
        continue;
      }
      if (v2Fields.length === 1) {
        const parsed = parseMultiAgentV2Value(v2Fields[0].value);
        if (parsed.valid) record(parsed);
        else forceUnsafe();
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
      record(parseMultiAgentV2Value(assignment.value));
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'enabled'])) {
        record({
          valid: parseTomlBoolean(assignment.value) !== null,
          enabled: parseTomlBoolean(assignment.value) === true,
          non_code_mode_only: null,
          hide_spawn_agent_metadata: null,
          tool_namespace: null,
        });
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'non_code_mode_only'])) {
        const transportValue = parseTomlBoolean(assignment.value);
        if (transportValue === null) transportAmbiguous = true;
        else recordTransport(transportValue);
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'hide_spawn_agent_metadata'])) {
        const metadataValue = parseTomlBoolean(assignment.value);
        if (metadataValue === null) metadataAmbiguous = true;
        else recordMetadata(metadataValue);
    } else if (tomlAssignmentPathMatches(
      table, assignment, ['features', 'multi_agent_v2', 'tool_namespace'])) {
        const namespaceValue = parseTomlString(assignment.value);
        if (namespaceValue === null) namespaceAmbiguous = true;
        else recordNamespace(namespaceValue);
    }
  }

  enabled = forcedUnsafe || (seen && !ambiguous && enabled);
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
  const lines = tomlStructuralLines(configContent);
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

    const assignment = parseTomlAssignment(line);
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) continue;
      for (const field of featureFields) {
        if (field.key[0].value !== 'multi_agent') continue;
        const b = parseTomlBoolean(field.value);
        if (b === null || seen) {
          ambiguous = true;
          enabled = false;
        } else {
          seen = true;
          enabled = b;
        }
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent'])) {
        const b = parseTomlBoolean(assignment.value);
        if (b === null || seen) {
          ambiguous = true;
          enabled = false;
        } else {
          seen = true;
          enabled = b;
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
      const assignment = parseTomlAssignment(field);
      if (assignment && assignment.key.length === 1) {
        recordField(assignment.key[0].value, assignment.value);
      }
    }
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
    if (tomlAssignmentPathMatches(table, assignment, ['features'])) {
      const featureFields = parseInlineTomlTableAssignments(assignment.value);
      if (featureFields === null) continue;
      for (const field of featureFields) {
        if (field.key[0].value !== 'multi_agent_v2') continue;
        const value = field.value.trim();
        if (value.startsWith('{') && value.endsWith('}')) {
          recordFromInlineObject(value.slice(1, -1));
        }
      }
    } else if (tomlAssignmentPathMatches(table, assignment, ['features', 'multi_agent_v2'])) {
        const v = assignment.value.trim();
        if (v.startsWith('{') && v.endsWith('}')) recordFromInlineObject(v.slice(1, -1));
    } else {
      const fullPath = tomlAssignmentPath(table, assignment);
      if (fullPath && fullPath.length === 3
          && fullPath[0] === 'features' && fullPath[1] === 'multi_agent_v2') {
        recordField(fullPath[2], assignment.value);
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
    process.stderr.write(`profile_source_repair: ${sourceCheck.repair || REVIEWER_SOURCE_REPAIR}\n`);
    process.exit(1);
  }
  const templateRoles = sourceCheck.roles;
  const templateEntries = sourceCheck.entries;

  const unsafeInstallTarget = validateInstallTargets(templateEntries);
  if (unsafeInstallTarget) {
    process.stderr.write(`install_target_unsafe: ${unsafeInstallTarget}\n`);
    process.exit(1);
  }

  // MultiAgentV2 encrypts message arguments before direct tool execution, and the model reserves
  // collaboration.spawn_agent to its hidden-metadata schema. Kaola needs visible agent_type role
  // selection, so require the proven direct `agents` namespace before writing profiles/config.
  const preInstallConfigContent = fs.existsSync(targetConfig) ? read(targetConfig) : '';
  const preInstallConfigProof = managedConfigProof(preInstallConfigContent, templateRoles);
  if (preInstallConfigProof.range.state === 'invalid') {
    process.stderr.write(
      'managed_block_ambiguous: expected zero or one ordered top-level kaola-workflow marker pair; repair config.toml manually before reinstalling\n'
    );
    process.exit(1);
  }
  if (preInstallConfigProof.conflictingRolesOutside.length > 0) {
    process.stderr.write(
      'managed_role_conflict_outside: pre-existing declarations outside the managed block alias Kaola role(s): '
      + `${preInstallConfigProof.conflictingRolesOutside.join(', ')}; repair config.toml manually before reinstalling\n`
    );
    process.exit(1);
  }
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

  // Seed the shared ~/.config/kaola-workflow/config.json parallel_mode default. Runs AFTER
  // updateHooks and BEFORE pruneStaleProfiles (mirrors install-opencode.sh seed_kaola_config
  // ordering, which follows seed_config). WARN-first guarantees it cannot break the success path — a
  // hooks/profile/postVerify failure short-circuits before reaching it, and a corrupt config is left
  // untouched rather than aborting. os.homedir() honors process.env.HOME (POSIX), matching the
  // hermetic-HOME test pattern.
  seedKaolaConfig(os.homedir());

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
  copyAgentProfiles,
  seedKaolaConfig,
  validateProfileText,
  reviewerProfileContract,
  classifyProfilePinPosture,
  validateSourceProfiles,
  installTargetPathProblem,
  validateInstallTargets,
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
  REVIEWER_ROLES,
  REVIEWER_BEHAVIOR_CONTRACT_VERSION,
  REVIEWER_SOURCE_REPAIR,
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
