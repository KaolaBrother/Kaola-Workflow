#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-codex-preflight.js (issue #266 AC-B; extended by #332)
//
// Hard-gates Codex agent-profile freshness BEFORE any subagent-invoked compliance
// is claimed. Verifies:
//   (a) .codex/agents/kaola-workflow/<role>.toml exists for every REQUIRED role
//       AND is schema-valid (top-level non-empty `name` matching the role, an OPTIONAL
//       model_reasoning_effort (#451), a non-blank developer_instructions block) - codex
//       >=0.138 silently ignores a profile without a non-empty `name` (#332).
//   (b) .codex/config.toml contains the managed block with an [agents.{role}] entry
//       for every REQUIRED role, and NO retired/foreign [agents.*] inside the block.
//   (c) no stale/retired Kaola profile files survive in the target dir (#332).
//
// REQUIRED role set = UNION of:
//   (a) template roles from ../config/agents.toml (relative to this script, present
//       in the 3 plugin trees; absent in the claude scripts/ tree — graceful degrade)
//   (b) plan roles from --plan <path> (## Nodes role column), when supplied
//
// Auto-installs (re-runs install-codex-agent-profiles.js) when the ONLY problem
// is a stale/missing/malformed managed block, profile file, or stale Kaola file
// (safe, idempotent). Typed-refuses when conflicts exist outside the markers, the
// installer is unavailable, a plan role is absent from the template, or the local
// manifest carries an unsupported (future) schema_version.
//
// --doctor mode is READ-ONLY (never runs the installer): it reports user, project,
// and plugin-cache scope freshness with concrete per-scope repair commands. Plugin
// cache findings are evidence-only and never set the exit code (#332 AC11).
//
// TRUE 4-tree byte-identical: requires ONLY fs + path + os + inline regex. No
// require() of edition-specific scripts. The #332 schema regexes + constants below
// are DELIBERATELY DUPLICATED from install-codex-agent-profiles.js (the root scripts/
// tree has no installer to require); keep the two copies in lock-step.
//
// CLI:
//   node kaola-workflow-codex-preflight.js --project-root <dir>
//     [--plan <plan-path>] [--no-autofix] [--json]
//   node kaola-workflow-codex-preflight.js --doctor [--project-root <dir>]
//     [--home <dir>] [--json]
//
// Exit 0 = fresh (or autofixed-then-fresh); non-zero = typed refusal.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const os = require('os');

const BEGIN_MARKER = '# BEGIN kaola-workflow agents';
const END_MARKER = '# END kaola-workflow agents';

// #332 schema constants — MIRROR of install-codex-agent-profiles.js. Keep in sync.
const MANIFEST_BASENAME = '.kaola-managed-profiles.json';
const RETIRED_PROFILE_FILES = [
  'docs-lookup.toml',
  // #451: the six `<role>-max` xhigh effort-variant profiles are retired - a surviving copy reads as
  // stale here (repaired by the installer). NEVER blanket-glob `*-max` (a user may own one).
  'planner-max.toml',
  'code-architect-max.toml',
  'tdd-guide-max.toml',
  'code-reviewer-max.toml',
  'security-reviewer-max.toml',
  'adversarial-verifier-max.toml',
];
const EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh'];
const MANIFEST_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = null;
  let planPath = null;
  let noAutofix = false;
  let json = false;
  let doctor = false;
  let home = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = args[++i];
    } else if (args[i] === '--plan' && args[i + 1]) {
      planPath = args[++i];
    } else if (args[i] === '--no-autofix') {
      noAutofix = true;
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--doctor') {
      doctor = true;
    } else if (args[i] === '--home' && args[i + 1]) {
      home = args[++i];
    }
  }

  return { projectRoot, planPath, noAutofix, json, doctor, home };
}

// ---------------------------------------------------------------------------
// #332 schema check — inline regex, no TOML lib. MIRROR of the installer's
// validateProfileText. Returns [] when valid, or a list of human-readable reasons.
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
  // #451: model_reasoning_effort is OPTIONAL - base profiles OMIT it (the spawned agent inherits the
  // parent Codex session effort; agent-config wins over project-profile, PR #14807). A pinned value
  // (user override) must still be legal; an absent one is fine.
  if (effortMatch && !EFFORT_VALUES.includes(effortMatch[1])) {
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

// ---------------------------------------------------------------------------
// Template role parsing — reads config/agents.toml via inline regex (no TOML lib).
// Each tree has its own copy of this file at <scriptDir>/../config/agents.toml.
// Returns { roles: string[], error: string|null }
// ---------------------------------------------------------------------------
function readTemplateRoles(scriptDir) {
  const templatePath = path.join(scriptDir, '..', 'config', 'agents.toml');
  let content;
  try {
    content = fs.readFileSync(templatePath, 'utf8');
  } catch (e) {
    return { roles: [], error: `template_missing: cannot read ${templatePath}: ${e.message}` };
  }
  // Match [agents.{role}] top-level table headers
  const roles = [];
  const re = /^\[agents\.([a-z0-9-]+)\]/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    roles.push(m[1]);
  }
  if (roles.length === 0) {
    return { roles: [], error: `template_missing: no [agents.*] entries found in ${templatePath}` };
  }
  return { roles, error: null };
}

// ---------------------------------------------------------------------------
// Plan role parsing — reads ## Nodes table from the frozen plan (inline regex only).
// Column layout: | id | role | depends_on | ...
// Returns string[] of unique roles (empty if --plan not supplied or table absent).
// ---------------------------------------------------------------------------
function readPlanRoles(planPath) {
  if (!planPath) return [];
  let content;
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch {
    return [];
  }

  const roles = [];
  // Find the ## Nodes heading
  const nodesHeadRe = /^##\s+Nodes\s*$/m;
  const headMatch = content.match(nodesHeadRe);
  if (!headMatch) return [];

  const afterHead = content.slice(headMatch.index + headMatch[0].length);
  // Next ## heading terminates the section
  const nextH2 = afterHead.search(/^##\s/m);
  const section = nextH2 < 0 ? afterHead : afterHead.slice(0, nextH2);

  // Table rows: | id | role | ...
  // Skip the header row (contains "id") and the separator row (contains ---)
  const rowRe = /^\|([^|]+)\|([^|]+)\|/gm;
  let row;
  while ((row = rowRe.exec(section)) !== null) {
    const idCell = row[1].trim();
    const roleCell = row[2].trim();
    // Skip header and separator rows
    if (idCell === 'id' || /^[-: ]+$/.test(idCell)) continue;
    if (roleCell && !/^[-: ]+$/.test(roleCell)) {
      const role = roleCell.trim();
      if (role && !roles.includes(role)) {
        roles.push(role);
      }
    }
  }
  return roles;
}

// ---------------------------------------------------------------------------
// Profile check: assert .codex/agents/kaola-workflow/<role>.toml exists for all roles.
// Returns { missingRoles: string[] }
// ---------------------------------------------------------------------------
function checkProfiles(agentsDir, requiredRoles) {
  const missingRoles = [];
  for (const role of requiredRoles) {
    const profilePath = path.join(agentsDir, `${role}.toml`);
    if (!fs.existsSync(profilePath)) {
      missingRoles.push(role);
    }
  }
  return { missingRoles };
}

// ---------------------------------------------------------------------------
// Managed block check: locate the # BEGIN / # END block in config.toml, parse
// [agents.{role}] entries inside it, and detect conflicting [agents.*] entries
// outside the markers.
//
// Returns:
//   {
//     blockFound: boolean,
//     rolesInBlock: string[],
//     conflictingRolesOutside: string[]  // [agents.*] entries outside the markers
//   }
// ---------------------------------------------------------------------------
function checkManagedBlock(configContent) {
  const beginIdx = configContent.indexOf(BEGIN_MARKER);
  const endIdx = configContent.indexOf(END_MARKER);

  let blockFound = false;
  let blockBody = '';
  let outsideContent = configContent;

  if (beginIdx !== -1 && endIdx !== -1 && beginIdx < endIdx) {
    blockFound = true;
    blockBody = configContent.slice(beginIdx + BEGIN_MARKER.length, endIdx);
    outsideContent = configContent.slice(0, beginIdx) + configContent.slice(endIdx + END_MARKER.length);
  }

  // Parse [agents.{role}] entries inside the block
  const rolesInBlock = [];
  const blockRe = /^\[agents\.([a-z0-9-]+)\]/gm;
  let m;
  while ((m = blockRe.exec(blockBody)) !== null) {
    rolesInBlock.push(m[1]);
  }

  // Detect [agents.*] entries outside the markers (conflict)
  const conflictingRolesOutside = [];
  const outsideRe = /^\[agents\.([a-z0-9-]+)\]/gm;
  let o;
  while ((o = outsideRe.exec(outsideContent)) !== null) {
    conflictingRolesOutside.push(o[1]);
  }

  return { blockFound, rolesInBlock, conflictingRolesOutside };
}

// ---------------------------------------------------------------------------
// #332 manifest read — returns the parsed local manifest or null on absent/corrupt.
// ---------------------------------------------------------------------------
function readManifest(agentsDir) {
  const p = path.join(agentsDir, MANIFEST_BASENAME);
  if (!fs.existsSync(p)) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!obj || typeof obj !== 'object') return null;
    return obj;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// #332 scope inspector — the single source of truth for both the normal gate and
// doctor mode. Inspects a target .codex dir against the current template roles.
// Pure read-only.
// ---------------------------------------------------------------------------
function inspectScope({ codexDir, templateRoles }) {
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');
  const configPath = path.join(codexDir, 'config.toml');
  const roleSet = new Set(templateRoles);

  const exists = fs.existsSync(codexDir);

  let configContent = '';
  if (fs.existsSync(configPath)) {
    try { configContent = fs.readFileSync(configPath, 'utf8'); } catch { configContent = ''; }
  }
  const { blockFound, rolesInBlock, conflictingRolesOutside } = checkManagedBlock(configContent);

  const missingFromBlock = templateRoles.filter(r => !rolesInBlock.includes(r));
  const staleRolesInBlock = rolesInBlock.filter(r => !roleSet.has(r));

  const { missingRoles: missingProfiles } = checkProfiles(agentsDir, templateRoles);

  // Inspect the agents dir contents: malformed required profiles + stale/extra files.
  const malformed = [];
  const staleFiles = [];
  const extraUnmanaged = [];
  const manifest = readManifest(agentsDir);
  const manifestFiles = (manifest && manifest.files && typeof manifest.files === 'object')
    ? new Set(Object.keys(manifest.files))
    : new Set();

  let manifestStatus = 'absent';
  if (manifest) {
    manifestStatus = (typeof manifest.schema_version === 'number' && manifest.schema_version > MANIFEST_SCHEMA_VERSION)
      ? 'unsupported'
      : 'present';
  }

  if (fs.existsSync(agentsDir)) {
    let names = [];
    try { names = fs.readdirSync(agentsDir); } catch { names = []; }
    for (const name of names) {
      if (!name.endsWith('.toml')) continue;
      const role = name.replace(/\.toml$/, '');
      if (roleSet.has(role)) {
        // Required role: schema-check it.
        let txt = '';
        try { txt = fs.readFileSync(path.join(agentsDir, name), 'utf8'); } catch { txt = ''; }
        const reasons = validateProfileText(txt, role);
        if (reasons.length > 0) malformed.push({ role, file: name, reasons });
      } else if (manifestFiles.has(name) || RETIRED_PROFILE_FILES.includes(name)) {
        staleFiles.push(name);
      } else {
        extraUnmanaged.push(name);
      }
    }
  }

  malformed.sort((a, b) => a.role.localeCompare(b.role));
  staleFiles.sort();
  extraUnmanaged.sort();

  return {
    exists,
    blockFound,
    rolesInBlock,
    missingFromBlock,
    staleRolesInBlock,
    conflictingRolesOutside,
    missingProfiles,
    malformed,
    staleFiles,
    extraUnmanaged,
    manifest: manifestStatus,
  };
}

// ---------------------------------------------------------------------------
// Find the installer script sibling to this script.
// Returns the absolute path if it exists, or null.
// ---------------------------------------------------------------------------
function findInstaller(scriptDir) {
  const installerPath = path.join(scriptDir, 'install-codex-agent-profiles.js');
  return fs.existsSync(installerPath) ? installerPath : null;
}

// ---------------------------------------------------------------------------
// Run the installer (positional arg: projectRoot — NOT --project-root flag).
// Returns { success: boolean, stderr: string }
// ---------------------------------------------------------------------------
function runInstaller(installerPath, projectRoot) {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      process.execPath,
      [installerPath, projectRoot],
      { encoding: 'utf8', timeout: 30000 }
    );
    if (result.status === 0) {
      return { success: true, stderr: result.stderr || '' };
    }
    return {
      success: false,
      stderr: (result.stderr || '') + (result.error ? result.error.message : '')
    };
  } catch (e) {
    return { success: false, stderr: e.message };
  }
}

// ---------------------------------------------------------------------------
// Core preflight check
// ---------------------------------------------------------------------------
function runPreflight(opts) {
  const {
    projectRoot,
    planPath,
    noAutofix,
    scriptDir,
  } = opts;

  const codexDir = path.join(projectRoot, '.codex');
  const agentsDir = path.join(codexDir, 'agents', 'kaola-workflow');

  // --- Read template roles (may fail gracefully) ---
  const { roles: templateRoles, error: templateError } = readTemplateRoles(scriptDir);
  if (templateError) {
    return {
      exitCode: 2,
      result: {
        status: 'template_missing',
        error: templateError,
        stale: true,
        safe_autofix: false,
        repair: 'Install or update kaola-workflow to get the bundled config/agents.toml',
      },
    };
  }

  // --- Read plan roles ---
  const planRoles = readPlanRoles(planPath);

  // --- Check plan roles against template ---
  const rolesNotInTemplate = planRoles.filter(r => !templateRoles.includes(r));
  if (rolesNotInTemplate.length > 0) {
    return {
      exitCode: 3,
      result: {
        status: 'role_not_in_template',
        missing_roles: rolesNotInTemplate,
        stale: true,
        repair: 'Update kaola-workflow to a version that includes the required roles, then re-install agent profiles.',
        safe_autofix: false,
      },
    };
  }

  // --- Build REQUIRED role set: union of template + plan roles ---
  const requiredRoles = [...templateRoles];
  for (const r of planRoles) {
    if (!requiredRoles.includes(r)) requiredRoles.push(r);
  }

  // --- Inspect the project scope (template roles only; plan roles handled below) ---
  const scope = inspectScope({ codexDir, templateRoles });

  // --- Conflicting [agents.*] outside managed block is UNSAFE to autofix ---
  if (scope.conflictingRolesOutside.length > 0) {
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        stale: true,
        conflicting_roles_outside_markers: scope.conflictingRolesOutside,
        extra_unmanaged: scope.extraUnmanaged,
        repair: `Remove or migrate the hand-authored [agents.*] entries outside the managed block markers in ${path.join(codexDir, 'config.toml')}, then re-run install-codex-agent-profiles.js.`,
        safe_autofix: false,
      },
    };
  }

  // --- Unsupported (future) manifest schema is NOT autofixable ---
  if (scope.manifest === 'unsupported') {
    return {
      exitCode: 6,
      result: {
        status: 'profile_schema_version_unsupported',
        stale: true,
        extra_unmanaged: scope.extraUnmanaged,
        repair: `The local profile manifest (${path.join(agentsDir, MANIFEST_BASENAME)}) declares an unsupported schema_version — upgrade kaola-workflow, then re-run install-codex-agent-profiles.js --project-root ${projectRoot}`,
        safe_autofix: false,
      },
    };
  }

  // --- Plan roles: union members not in the template profile dir (missing-only) ---
  const { missingRoles: missingPlanProfiles } = checkProfiles(agentsDir, planRoles);
  const missingProfiles = [...new Set([...scope.missingProfiles, ...missingPlanProfiles])];
  const missingFromBlock = requiredRoles.filter(r => !scope.rolesInBlock.includes(r));

  const repairCmd = `run install-codex-agent-profiles.js --project-root ${projectRoot}`;

  // --- Priority-ordered staleness classification ---
  // profiles_malformed / profiles_stale / profiles_missing / config_stale outrank
  // managed_block_stale so the existing #266 fixtures keep their statuses.
  const blockMissing = !scope.blockFound;
  const malformedFirst = scope.malformed.length > 0;
  const staleFilesPresent = scope.staleFiles.length > 0;
  const profilesMissing = missingProfiles.length > 0;
  const configStale = blockMissing || missingFromBlock.length > 0;
  const onlyBlockRolesStale = scope.staleRolesInBlock.length > 0;

  const isStale = malformedFirst || staleFilesPresent || profilesMissing || configStale || onlyBlockRolesStale;

  if (!isStale) {
    return {
      exitCode: 0,
      result: {
        status: 'ok',
        roles_checked: requiredRoles,
        extra_unmanaged: scope.extraUnmanaged,
        autofixed: false,
      },
    };
  }

  function staleResult() {
    if (malformedFirst) {
      return {
        status: 'profiles_malformed',
        malformed: scope.malformed,
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
      };
    }
    if (staleFilesPresent) {
      return {
        status: 'profiles_stale',
        stale_files: scope.staleFiles,
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
      };
    }
    if (profilesMissing) {
      return {
        status: 'profiles_missing',
        missing_roles: [...new Set([...missingProfiles, ...missingFromBlock])],
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
      };
    }
    if (configStale) {
      return {
        status: 'config_stale',
        missing_roles: [...new Set([...missingProfiles, ...missingFromBlock])],
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: repairCmd,
        safe_autofix: true,
      };
    }
    // onlyBlockRolesStale: full current set present, retired [agents.*] inside markers.
    return {
      status: 'managed_block_stale',
      stale_roles_in_block: scope.staleRolesInBlock,
      extra_unmanaged: scope.extraUnmanaged,
      stale: true,
      repair: repairCmd,
      safe_autofix: true,
    };
  }

  // --- Stale: attempt autofix if allowed ---
  if (noAutofix) {
    return { exitCode: 1, result: staleResult() };
  }

  // --- Try autofix ---
  const installerPath = findInstaller(scriptDir);
  if (!installerPath) {
    const r = staleResult();
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: r.missing_roles || [],
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: 'install-codex-agent-profiles.js not found alongside this script.',
        safe_autofix: false,
      },
    };
  }

  const { success, stderr } = runInstaller(installerPath, projectRoot);
  if (!success) {
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        extra_unmanaged: scope.extraUnmanaged,
        stale: true,
        repair: `Installer error: ${stderr}`,
        safe_autofix: false,
      },
    };
  }

  // --- Re-verify after autofix: re-run ALL checks (#332). ---
  const after = inspectScope({ codexDir, templateRoles });
  const { missingRoles: afterMissingPlan } = checkProfiles(agentsDir, planRoles);
  const afterMissingProfiles = [...new Set([...after.missingProfiles, ...afterMissingPlan])];
  const afterMissingFromBlock = requiredRoles.filter(r => !after.rolesInBlock.includes(r));

  const stillStale =
    after.malformed.length > 0 ||
    after.staleFiles.length > 0 ||
    afterMissingProfiles.length > 0 ||
    !after.blockFound ||
    afterMissingFromBlock.length > 0 ||
    after.staleRolesInBlock.length > 0;

  if (stillStale) {
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: [...new Set([...afterMissingProfiles, ...afterMissingFromBlock])],
        extra_unmanaged: after.extraUnmanaged,
        stale: true,
        repair: 'Installer ran but profiles/block are still stale after re-verify.',
        safe_autofix: false,
      },
    };
  }

  return {
    exitCode: 0,
    result: {
      status: 'ok',
      roles_checked: requiredRoles,
      extra_unmanaged: after.extraUnmanaged,
      autofixed: true,
    },
  };
}

// ---------------------------------------------------------------------------
// #332 doctor mode — READ-ONLY multi-scope reporting. Never runs the installer.
// Scopes: user (<home>/.codex), project (<projectRoot>/.codex), plugin_cache
// (cached source profiles, schema-only, evidence-only — excluded from exit code).
// ---------------------------------------------------------------------------
function scopeIsStale(s) {
  return s.exists && (
    s.malformed.length > 0 ||
    s.staleFiles.length > 0 ||
    s.missingProfiles.length > 0 ||
    !s.blockFound ||
    s.missingFromBlock.length > 0 ||
    s.staleRolesInBlock.length > 0 ||
    s.conflictingRolesOutside.length > 0 ||
    s.manifest === 'unsupported'
  );
}

function scopeReport(scope, name, codexDir, repair, readOnly) {
  return {
    scope: name,
    codex_dir: codexDir,
    exists: scope.exists,
    managed_block: scope.blockFound ? 'present' : 'absent',
    profiles: scope.rolesInBlock,
    missing_roles: scope.missingProfiles,
    missing_from_block: scope.missingFromBlock,
    malformed: scope.malformed,
    stale_files: scope.staleFiles,
    stale_roles_in_block: scope.staleRolesInBlock,
    conflicting_roles_outside: scope.conflictingRolesOutside,
    extra_unmanaged: scope.extraUnmanaged,
    manifest: scope.manifest,
    read_only: !!readOnly,
    repair,
  };
}

// Find cached plugin source-agent dirs under <home>/.codex/plugins/cache.
// Returns [{ dir, plugin, marketplace, version }].
function findPluginCacheAgentDirs(home) {
  const cacheRoot = path.join(home, '.codex', 'plugins', 'cache');
  const out = [];
  if (!fs.existsSync(cacheRoot)) return out;
  let marketplaces = [];
  try { marketplaces = fs.readdirSync(cacheRoot); } catch { return out; }
  for (const mk of marketplaces) {
    const mkDir = path.join(cacheRoot, mk);
    let plugins = [];
    try { plugins = fs.readdirSync(mkDir); } catch { continue; }
    for (const pl of plugins) {
      const plDir = path.join(mkDir, pl);
      let versions = [];
      try { versions = fs.readdirSync(plDir); } catch { continue; }
      for (const ver of versions) {
        const agentsDir = path.join(plDir, ver, 'agents');
        if (fs.existsSync(agentsDir)) {
          out.push({ dir: agentsDir, plugin: pl, marketplace: mk, version: ver });
        }
      }
    }
  }
  return out;
}

function runDoctor(opts) {
  const { projectRoot, home, scriptDir } = opts;
  const { roles: templateRoles, error: templateError } = readTemplateRoles(scriptDir);

  if (templateError) {
    return {
      exitCode: 2,
      result: { status: 'template_missing', error: templateError, scopes: [] },
    };
  }

  const scopes = [];

  // user scope
  const userCodex = path.join(home, '.codex');
  const userScope = inspectScope({ codexDir: userCodex, templateRoles });
  scopes.push(scopeReport(
    userScope, 'user', userCodex,
    `node ${path.join(scriptDir, 'install-codex-agent-profiles.js')} ${home}`,
    false,
  ));

  // project scope
  const projectCodex = path.join(projectRoot, '.codex');
  const projectScope = inspectScope({ codexDir: projectCodex, templateRoles });
  scopes.push(scopeReport(
    projectScope, 'project', projectCodex,
    `node ${path.join(scriptDir, 'install-codex-agent-profiles.js')} ${projectRoot}`,
    false,
  ));

  // plugin_cache scope(s) — schema-only, evidence-only, read-only.
  for (const c of findPluginCacheAgentDirs(home)) {
    const malformed = [];
    let names = [];
    try { names = fs.readdirSync(c.dir); } catch { names = []; }
    for (const name of names) {
      if (!name.endsWith('.toml')) continue;
      const role = name.replace(/\.toml$/, '');
      let txt = '';
      try { txt = fs.readFileSync(path.join(c.dir, name), 'utf8'); } catch { txt = ''; }
      const reasons = validateProfileText(txt, role);
      if (reasons.length > 0) malformed.push({ role, file: name, reasons });
    }
    malformed.sort((a, b) => a.role.localeCompare(b.role));
    scopes.push({
      scope: 'plugin_cache',
      codex_dir: c.dir,
      exists: true,
      managed_block: 'n/a',
      profiles: [],
      missing_roles: [],
      missing_from_block: [],
      malformed,
      stale_files: [],
      stale_roles_in_block: [],
      conflicting_roles_outside: [],
      extra_unmanaged: [],
      manifest: 'n/a',
      read_only: true,
      repair: `codex plugin remove ${c.plugin}@${c.marketplace} && codex plugin add ${c.plugin}@${c.marketplace}  # refresh plugin cache`,
    });
  }

  // Exit code: only user + project scopes set it; plugin_cache is evidence-only.
  const gating = scopeIsStale(userScope) || scopeIsStale(projectScope);
  return {
    exitCode: gating ? 1 : 0,
    result: { status: gating ? 'stale' : 'ok', scopes },
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { projectRoot: rawRoot, planPath, noAutofix, json, doctor, home: rawHome } = parseArgs(process.argv);
  const resolvedRoot = rawRoot ? path.resolve(rawRoot) : process.cwd();
  const resolvedHome = rawHome ? path.resolve(rawHome) : os.homedir();
  const scriptDir = __dirname;

  if (doctor) {
    const { exitCode, result } = runDoctor({
      projectRoot: resolvedRoot,
      home: resolvedHome,
      scriptDir,
    });

    if (json || exitCode !== 0) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } else {
      for (const s of (result.scopes || [])) {
        const stale = (s.scope !== 'plugin_cache')
          ? (s.exists && (s.malformed.length || s.stale_files.length || s.missing_roles.length || s.managed_block === 'absent' || s.missing_from_block.length || s.stale_roles_in_block.length || s.conflicting_roles_outside.length || s.manifest === 'unsupported'))
          : (s.malformed.length > 0);
        const state = !s.exists ? 'absent' : (stale ? 'stale' : 'ok');
        process.stdout.write(`${s.scope}: ${state} (${s.codex_dir})\n`);
        if (stale) process.stdout.write(`  repair: ${s.repair}\n`);
      }
    }
    process.exit(exitCode);
  }

  const { exitCode, result } = runPreflight({
    projectRoot: resolvedRoot,
    planPath: planPath ? path.resolve(planPath) : null,
    noAutofix,
    scriptDir,
  });

  if (json || exitCode !== 0) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    // Fresh (exit 0, no --json): print human-readable summary
    const autofixNote = result.autofixed ? ' (autofixed)' : '';
    process.stdout.write(
      `ok: ${result.roles_checked.length} roles verified${autofixNote}\n`
    );
  }

  process.exit(exitCode);
}

module.exports = {
  runPreflight,
  runDoctor,
  readTemplateRoles,
  readPlanRoles,
  checkManagedBlock,
  checkProfiles,
  validateProfileText,
  inspectScope,
  readManifest,
  RETIRED_PROFILE_FILES,
  MANIFEST_BASENAME,
  EFFORT_VALUES,
};
