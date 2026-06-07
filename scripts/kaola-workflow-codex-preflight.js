#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-codex-preflight.js (issue #266 AC-B)
//
// Hard-gates Codex agent-profile freshness BEFORE any subagent-invoked compliance
// is claimed. Verifies:
//   (a) .codex/agents/kaola-workflow/<role>.toml exists for every REQUIRED role
//   (b) .codex/config.toml contains the managed block with an [agents.{role}] entry
//       for every REQUIRED role
//
// REQUIRED role set = UNION of:
//   (a) template roles from ../config/agents.toml (relative to this script, present
//       in the 3 plugin trees; absent in the claude scripts/ tree — graceful degrade)
//   (b) plan roles from --plan <path> (## Nodes role column), when supplied
//
// Auto-installs (re-runs install-codex-agent-profiles.js) when the ONLY problem
// is a stale/missing managed block or missing profile files (safe, idempotent).
// Typed-refuses when conflicts exist outside the markers, installer is unavailable,
// or a plan role is absent from the template.
//
// TRUE 4-tree byte-identical: requires ONLY fs + path + inline regex. No require()
// of edition-specific scripts.
//
// CLI:
//   node kaola-workflow-codex-preflight.js --project-root <dir>
//     [--plan <plan-path>] [--no-autofix] [--json]
//
// Exit 0 = fresh (or autofixed-then-fresh); non-zero = typed refusal.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const BEGIN_MARKER = '# BEGIN kaola-workflow agents';
const END_MARKER = '# END kaola-workflow agents';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  let projectRoot = null;
  let planPath = null;
  let noAutofix = false;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project-root' && args[i + 1]) {
      projectRoot = args[++i];
    } else if (args[i] === '--plan' && args[i + 1]) {
      planPath = args[++i];
    } else if (args[i] === '--no-autofix') {
      noAutofix = true;
    } else if (args[i] === '--json') {
      json = true;
    }
  }

  return { projectRoot, planPath, noAutofix, json };
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
  const configPath = path.join(codexDir, 'config.toml');

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

  // --- Read config.toml (may not exist yet) ---
  let configContent = '';
  if (fs.existsSync(configPath)) {
    try {
      configContent = fs.readFileSync(configPath, 'utf8');
    } catch (e) {
      configContent = '';
    }
  }

  // --- Check for conflicting [agents.*] outside managed block (UNSAFE to autofix) ---
  const { blockFound, rolesInBlock, conflictingRolesOutside } = checkManagedBlock(configContent);

  if (conflictingRolesOutside.length > 0) {
    return {
      exitCode: 4,
      result: {
        status: 'autofix_unsafe',
        stale: true,
        conflicting_roles_outside_markers: conflictingRolesOutside,
        repair: `Remove or migrate the hand-authored [agents.*] entries outside the managed block markers in ${configPath}, then re-run install-codex-agent-profiles.js.`,
        safe_autofix: false,
      },
    };
  }

  // --- Check profile files ---
  const { missingRoles: missingProfiles } = checkProfiles(agentsDir, requiredRoles);

  // --- Check managed block coverage ---
  const missingFromBlock = requiredRoles.filter(r => !rolesInBlock.includes(r));
  const isStale = !blockFound || missingProfiles.length > 0 || missingFromBlock.length > 0;

  if (!isStale) {
    // All good — fresh
    return {
      exitCode: 0,
      result: {
        status: 'ok',
        roles_checked: requiredRoles,
        autofixed: false,
      },
    };
  }

  // --- Stale: attempt autofix if allowed ---
  if (noAutofix) {
    const missingRoles = [...new Set([...missingProfiles, ...missingFromBlock])];
    return {
      exitCode: 1,
      result: {
        status: missingProfiles.length > 0 ? 'profiles_missing' : 'config_stale',
        missing_roles: missingRoles,
        stale: true,
        repair: `run install-codex-agent-profiles.js --project-root ${projectRoot}`,
        safe_autofix: false,
      },
    };
  }

  // --- Try autofix ---
  const installerPath = findInstaller(scriptDir);
  if (!installerPath) {
    const missingRoles = [...new Set([...missingProfiles, ...missingFromBlock])];
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: missingRoles,
        stale: true,
        repair: 'install-codex-agent-profiles.js not found alongside this script.',
        safe_autofix: false,
      },
    };
  }

  const { success, stderr } = runInstaller(installerPath, projectRoot);
  if (!success) {
    const missingRoles = [...new Set([...missingProfiles, ...missingFromBlock])];
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: missingRoles,
        stale: true,
        repair: `Installer error: ${stderr}`,
        safe_autofix: false,
      },
    };
  }

  // --- Re-verify after autofix ---
  let newConfigContent = '';
  if (fs.existsSync(configPath)) {
    try {
      newConfigContent = fs.readFileSync(configPath, 'utf8');
    } catch {
      newConfigContent = '';
    }
  }

  const { rolesInBlock: newRolesInBlock, blockFound: newBlockFound } = checkManagedBlock(newConfigContent);
  const { missingRoles: newMissingProfiles } = checkProfiles(agentsDir, requiredRoles);
  const newMissingFromBlock = requiredRoles.filter(r => !newRolesInBlock.includes(r));

  if (newMissingProfiles.length > 0 || newMissingFromBlock.length > 0 || !newBlockFound) {
    const stillMissing = [...new Set([...newMissingProfiles, ...newMissingFromBlock])];
    return {
      exitCode: 5,
      result: {
        status: 'installer_failed',
        missing_roles: stillMissing,
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
      autofixed: true,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
if (require.main === module) {
  const { projectRoot: rawRoot, planPath, noAutofix, json } = parseArgs(process.argv);
  const resolvedRoot = rawRoot ? path.resolve(rawRoot) : process.cwd();
  const scriptDir = __dirname;

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

module.exports = { runPreflight, readTemplateRoles, readPlanRoles, checkManagedBlock, checkProfiles };
