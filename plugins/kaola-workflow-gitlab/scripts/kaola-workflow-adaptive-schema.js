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

// Absolute node-count backstop for the plan grammar (DoS / stack-overflow guard).
// Real plans are tiny (the walkthrough's largest fixture is 7 nodes; FANOUT_CAP=4,
// LOOP_CAP=5 bound any single shape). 200 is ~28x the largest realistic plan, so it
// NEVER false-refuses a real plan, while it bounds the validator's DFS depth far below
// the recursion-overflow point: a multi-thousand-node depends_on chain is refused as
// out-of-grammar BEFORE any graph algorithm runs. Lives here (the cap anchor) so all
// four editions share one byte-identical value via the sync check.
const MAX_NODES = 200;

// Barrier escalation markers written durably to workflow-state.md. `security` forces
// security-reviewer post-dominance; `consent` halts a provisional auto-run for the
// user's explicit yes (surfaced on resume, never blindly re-dispatched); `test_thrash`
// escalates a thrashing loop to full.
const ESCALATION_MARKERS = Object.freeze({
  security: 'security',
  consent: 'consent',
  test_thrash: 'test_thrash',
});

// E2 (#234): a SECOND, durable source of truth for a barrier consent-halt, written into the plan's
// `## Node Ledger` — a section EXCLUDED from computePlanHash (which covers ## Meta + ## Nodes only),
// so it never trips the resume hash check. workflow-state.md's `escalated_to_full: consent` is the
// primary signal; if that file is lost/regenerated (state-downgrade) the halt would silently drop,
// re-running an authorization the user explicitly halted for approval. This plan-local marker
// survives a lost workflow-state.md. PRESENT = pending halt; ABSENT = no pending halt.
const CONSENT_HALT_MARKER = 'consent_halt: pending';
// PURE (no fs): scan ONLY the `## Node Ledger` section for the marker, so a decoy line elsewhere
// cannot force a phantom halt and the read mirrors where the writer puts it. The ledger is
// fence-free by contract, so a self-contained section slice suffices (NOT classifier.sectionBody —
// the classifier is renamed in the forks, which would break this file's cross-edition byte-identity).
function readDurableConsentHalt(planContent) {
  const text = String(planContent || '');
  const headRe = new RegExp('^##\\s+' + LEDGER_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm');
  const m = text.match(headRe);
  if (!m) return false;
  const after = text.slice(m.index + m[0].length);
  const nextH2 = after.search(/^##\s/m);
  const body = nextH2 < 0 ? after : after.slice(0, nextH2);
  return /^consent_halt:[ \t]*pending[ \t]*$/m.test(body);
}

// #238: curated, high-collision-risk ROOT (slashless) filenames — CI/CD, container, secrets,
// dependency-lock, and build manifests where two concurrent projects editing the same one clobber.
// This is a FOURTH, DISTINCT path vocabulary, kept here on purpose so it cannot drift across the four
// editions and so its meaning stays separate from its neighbours: SENSITIVE_PATTERNS = *security*
// (plan-validator), SHARED_INFRA = *shared dirs* (classifier), area logic = *top-level dir*. Membership
// here means only "collision-prone if co-edited". Slash-bearing CI paths (`.github/workflows/*`) are
// handled by the classifier's FILE_PATH_REGEX, NOT this set. Cross-project overlap on a curated root
// name is routed to ASK (yellow), never RED — the candidate side is free issue-body prose where even a
// curated name can be mentioned casually, so the safe direction is over-ask, not over-block.
const CURATED_ROOT_PATHS = Object.freeze([
  'Dockerfile', 'Containerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
  'Makefile', 'Jenkinsfile', 'Procfile', 'Vagrantfile',
  '.env', '.env.example', '.env.local', '.npmrc', '.nvmrc', '.gitlab-ci.yml', '.travis.yml',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'requirements.txt', 'pyproject.toml',
  'Gemfile', 'Gemfile.lock', 'pom.xml', 'build.gradle', 'composer.json', 'composer.lock',
  'secrets.yaml', 'secrets.yml', 'tsconfig.json',
]);
const CURATED_ROOT_SET = new Set(CURATED_ROOT_PATHS);
// Pure (no fs): tokenize free text and return the curated root filenames present, by EXACT token
// membership (a curated name buried inside a larger word never matches). The tokenizer keeps `/`, so a
// slash-bearing path tokenizes WITH its slashes and therefore can never collide with a slashless
// curated name — slash paths stay the classifier's FILE_PATH_REGEX job, curated roots stay this one.
function extractCuratedRootPaths(text) {
  const found = new Set();
  for (const tok of String(text || '').split(/[^A-Za-z0-9_.\/-]+/)) {
    if (CURATED_ROOT_SET.has(tok)) found.add(tok);
  }
  return found;
}
// Exact membership test, so the claimed side can fold STRUCTURED declared paths directly (no lossy
// re-tokenize of a stringified write-set blob) while reusing the one curated vocabulary.
function isCuratedRoot(p) { return CURATED_ROOT_SET.has(String(p || '')); }

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
  MAX_NODES,
  ESCALATION_MARKERS,
  CONSENT_HALT_MARKER,
  readDurableConsentHalt,
  CURATED_ROOT_PATHS,
  extractCuratedRootPaths,
  isCuratedRoot,
  CONFIG_REL_PATH,
  ENABLE_ADAPTIVE_FIELD,
  ENABLE_ADAPTIVE_ENV,
  FANOUT_CAP_ENV,
  resolveEnableAdaptive,
  resolveFanoutCap,
  isLegalWorkflowPath,
};
