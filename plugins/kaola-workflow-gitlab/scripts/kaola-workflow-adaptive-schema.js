#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-adaptive-schema.js (issue #227)
//
// Forge-NEUTRAL constants and pure helpers shared by the adaptive-path machinery
// across all four editions. This file is copied VERBATIM into every edition's
// script directory and enrolled as a byte-identical group in validate-script-sync.js,
// so an edition that hand-ports routeAdaptive / claimProject / the validator but
// forgets to mirror a constant edit fails the sync check. It is the cross-edition
// drift anchor (design doc §"Parity risk").
//
// It contains ONLY forge-neutral data + side-effect-free helpers — no forge CLI
// calls, no remote URLs, no references to sibling script paths or other editions.
// Keep it that way so the byte copies stay legal everywhere (the renamed editions
// reject cross-edition leaks and parent-dir requires).
// ---------------------------------------------------------------------------

// The three legal workflow paths. `claimProject` whitelists {fast, full} when the
// adaptive switch is OFF and this full set when ON.
const WORKFLOW_PATHS = Object.freeze(['fast', 'full', 'adaptive']);
const WORKFLOW_PATHS_NO_ADAPTIVE = Object.freeze(['fast', 'full']);
const ADAPTIVE_PATH = 'adaptive';

// The adaptive executor command + skill the two resume surfaces emit (never
// /kaola-workflow-phase{N}). Toggle-agnostic: resume of a frozen plan ignores the switch.
const PLAN_RUN_COMMAND = '/kaola-workflow-plan-run';
const PLAN_RUN_SKILL = 'kaola-workflow-plan-run';
const ADAPT_COMMAND = '/kaola-workflow-adapt';
const ADAPT_SKILL = 'kaola-workflow-adapt';

// The frozen-plan artifact (the fast-summary.md analogue) + its inner ledger heading.
const PLAN_FILE = 'workflow-plan.md';
const NODES_HEADING = 'Nodes';
const LEDGER_HEADING = 'Node Ledger';

// Node Ledger status enum (single authoritative table inside the plan artifact).
const LEDGER_STATUSES = Object.freeze(['pending', 'in_progress', 'complete', 'n/a']);

// Caps (verified first-party): FANOUT_CAP default 4 (env KAOLA_FANOUT_CAP);
// LOOP_CAP static loop bound; FILE_CEILING absolute backstop of 6 (fast.md:63);
// TEST_THRASH_LIMIT >= 3 consecutive failing cycles on the same test (fast.md:64).
const DEFAULT_FANOUT_CAP = 4;
const LOOP_CAP = 5;
const FILE_CEILING = 6;
const TEST_THRASH_LIMIT = 3;

// Barrier escalation markers written durably to workflow-state.md. `security` forces
// security-reviewer post-dominance; `consent` halts a provisional auto-run for the
// user's explicit yes (surfaced on resume, never blindly re-dispatched); `test_thrash`
// escalates a thrashing loop to full.
const ESCALATION_MARKERS = Object.freeze({
  security: 'security',
  consent: 'consent',
  test_thrash: 'test_thrash',
});

// The single shared global config file (one path, no per-edition namespace) + the
// switch field and its env mirror. Precedence: env KAOLA_ENABLE_ADAPTIVE > config
// enable_adaptive > default OFF.
const CONFIG_REL_PATH = ['.config', 'kaola-workflow', 'config.json'];
const ENABLE_ADAPTIVE_FIELD = 'enable_adaptive';
const ENABLE_ADAPTIVE_ENV = 'KAOLA_ENABLE_ADAPTIVE';
const FANOUT_CAP_ENV = 'KAOLA_FANOUT_CAP';

// Resolve the adaptive switch with precedence env > config > default OFF.
// The OFF guarantee rests on the STRICT `config.enable_adaptive === true` on-test
// (never `!== false`): an absent field is falsy → OFF. The env mirror is `1`/`0`.
function resolveEnableAdaptive(config, env) {
  const e = env || {};
  const raw = e[ENABLE_ADAPTIVE_ENV];
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return !!(config && config[ENABLE_ADAPTIVE_FIELD] === true);
}

// Resolve the fan-out cap (env override, else default), clamped to a sane minimum.
function resolveFanoutCap(env) {
  const raw = (env || {})[FANOUT_CAP_ENV];
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_FANOUT_CAP;
}

function isLegalWorkflowPath(value, adaptiveEnabled) {
  return (adaptiveEnabled ? WORKFLOW_PATHS : WORKFLOW_PATHS_NO_ADAPTIVE).includes(value);
}

module.exports = {
  WORKFLOW_PATHS,
  WORKFLOW_PATHS_NO_ADAPTIVE,
  ADAPTIVE_PATH,
  PLAN_RUN_COMMAND,
  PLAN_RUN_SKILL,
  ADAPT_COMMAND,
  ADAPT_SKILL,
  PLAN_FILE,
  NODES_HEADING,
  LEDGER_HEADING,
  LEDGER_STATUSES,
  DEFAULT_FANOUT_CAP,
  LOOP_CAP,
  FILE_CEILING,
  TEST_THRASH_LIMIT,
  ESCALATION_MARKERS,
  CONFIG_REL_PATH,
  ENABLE_ADAPTIVE_FIELD,
  ENABLE_ADAPTIVE_ENV,
  FANOUT_CAP_ENV,
  resolveEnableAdaptive,
  resolveFanoutCap,
  isLegalWorkflowPath,
};
