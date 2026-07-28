#!/usr/bin/env node
'use strict';

// kaola-workflow-prose-census.js — the P5 measuring tool.
//
// ADR 0013 P5 states: "The six routing surfaces' line count and the contract validators'
// needle-pin count drop in proportion to the refusal census. If the prompts do NOT shrink as
// refusals demote, choreography is surviving its refusal — a violation of T11 to be hunted, not
// tolerated."
//
// Nothing measured either number. This script measures all three and prints the ratio that makes
// proportionality visible at a glance:
//
//   1. ROUTING SURFACES — line counts for the 30 generated surfaces (5 topics x the SIX propagation
//      surfaces per topic: 3 Claude commands + 3 Codex SKILL packs), taken from the generator's own
//      `GENERATED_SURFACES` registry so the file set can never drift from what is generated. Plus
//      the AUTHORING sources (skeletons + slots + rename table + required-blocks manifest) — the
//      surfaces are byte-generated, so the authoring sources are what an editor actually shrinks.
//   2. CONTRACT VALIDATORS — pinned literal needles per validator, over the four `validate-*-
//      contracts.js` files the four chains run. Counted two ways: pin-helper call sites (assert-
//      Includes / assertNotIncludes / assertConcept / assertBefore / assertNoForbidden) and the
//      literal needle strings sitting in those calls' needle-position arguments. A third count,
//      `inline_needles`, catches pins written as a bare `.includes('...')` outside a helper, so the
//      metric cannot be gamed by moving a pin off the helper.
//   3. REFUSAL CENSUS — distinct typed condition strings across ALL SEVEN emission shapes the
//      census found, not `reason:` alone: `reason:` literals; `status:`/`verdict:` on refuse
//      envelopes; `handoff_status:`; `inner_reason:`; `reasons.push('<token>')`; `refuse()`/`bad()`
//      /`fail()` helper calls; and `throw new Error('<code>')` converted by a catch. A `reason:`-
//      only scan undercounts by roughly 3x in `claim.js` alone.
//
// This is a MEASURING TOOL, not a gate. It answers "what are the three numbers now" — R3's
// missing-tool test applied to P5: a prediction nobody can measure is a hope. `--compare` prints a
// proportionality verdict but exits 0 unless `--fail-on-regression` is passed, because a hard gate
// here would red every intermediate batch of a campaign whose whole point is that the two numbers
// move together only at the END.
//
// Reads only. `--write-baseline` is the single writing mode and is explicit.
//
// CLI:
//   (no args) | --json         emit the full census as JSON on stdout
//   --summary                  emit a human-readable table
//   --write-baseline [path]    capture a snapshot (default scripts/prose-census-baseline.json)
//   --compare [path]           diff the live census against a baseline snapshot
//   --fail-on-regression       with --compare, exit 1 when prose is outrunning its refusals
//   --help

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_BASELINE = 'scripts/prose-census-baseline.json';
const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Shared lexing. Every scan below runs on comment-stripped source: a `//` or `/* */`
// comment that mentions `reason: 'x'` or `.includes('y')` is prose about the code, not an
// emission site or a pin, and counting it would inflate exactly the numbers P5 reads.
// Comments are blanked in place (same length) so every index stays valid against the original.
// ---------------------------------------------------------------------------
function stripComments(src) {
  const out = src.split('');
  let inString = null;   // "'", '"' or '`'
  let escaped = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inLine) {
      if (c === '\n') inLine = false; else out[i] = ' ';
      continue;
    }
    if (inBlock) {
      if (c === '*' && src[i + 1] === '/') { out[i] = ' '; out[i + 1] = ' '; i++; inBlock = false; }
      else if (c !== '\n') out[i] = ' ';
      continue;
    }
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') { out[i] = ' '; out[i + 1] = ' '; i++; inLine = true; continue; }
    if (c === '/' && src[i + 1] === '*') { out[i] = ' '; out[i + 1] = ' '; i++; inBlock = true; continue; }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue; }
  }
  return out.join('');
}

// `wc -l` semantics: the count of newline-terminated lines. Matches every line count quoted in the
// audit and in the ADR discussion, so the baseline is comparable with the numbers already on record.
function countLines(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') n++;
  if (text.length && text[text.length - 1] !== '\n') n++;
  return n;
}

function readRepoFile(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

function repoFileExists(rel) {
  return fs.existsSync(path.join(REPO, rel));
}

// ---------------------------------------------------------------------------
// 1. Routing surfaces.
// ---------------------------------------------------------------------------

// The AUTHORING surface. The 30 rendered surfaces are byte-generated, so a topic's prose only
// shrinks when a skeleton, a slot variant, the rename table, or the required-block manifest shrinks.
// P5's "line count" reads best as both numbers: rendered lines are what an agent loads, authoring
// lines are what a T11 rewrite actually edits.
const AUTHORING_SOURCES = [
  'templates/routing/plan-run.skeleton.md',
  'templates/routing/next.skeleton.md',
  'templates/routing/init.skeleton.md',
  'templates/routing/finalize.skeleton.md',
  'templates/routing/adapt.skeleton.md',
  'templates/routing/slots.js',
  'templates/routing/rename-table.js',
  'templates/routing/required-blocks.js',
];

function censusRoutingSurfaces() {
  // Source the surface set from the generator's own registry, never a hand-typed list: a new topic
  // or a renamed surface must move this measurement automatically or the baseline lies.
  const { GENERATED_SURFACES } = require('./generate-routing-surfaces.js');
  const byTopic = {};
  const missing = [];
  let totalLines = 0;
  for (const row of GENERATED_SURFACES) {
    if (!repoFileExists(row.path)) { missing.push(row.path); continue; }
    const lines = countLines(readRepoFile(row.path));
    totalLines += lines;
    const topic = (byTopic[row.topic] = byTopic[row.topic]
      || { total_lines: 0, surface_count: 0, by_surface: [] });
    topic.total_lines += lines;
    topic.surface_count += 1;
    topic.by_surface.push({
      path: row.path, surface_type: row.surface_type, forge: row.forge, lines,
    });
  }
  for (const topic of Object.values(byTopic)) {
    topic.by_surface.sort((a, b) => a.path.localeCompare(b.path));
  }

  const authoring = [];
  let authoringLines = 0;
  for (const rel of AUTHORING_SOURCES) {
    if (!repoFileExists(rel)) { missing.push(rel); continue; }
    const lines = countLines(readRepoFile(rel));
    authoringLines += lines;
    authoring.push({ path: rel, lines });
  }

  return {
    generated: {
      surface_count: GENERATED_SURFACES.length - missing.length,
      total_lines: totalLines,
      by_topic: byTopic,
    },
    authoring_sources: { file_count: authoring.length, total_lines: authoringLines, files: authoring },
    missing,
  };
}

// ---------------------------------------------------------------------------
// 2. Contract-validator needle pins.
// ---------------------------------------------------------------------------

// The four validators the four chains run — claude, codex, gitlab, gitea. The fifth on disk
// (plugins/kaola-workflow/scripts/validate-workflow-contracts.js) is a byte copy of the claude one
// no chain invokes; counting it would double one edition's pins.
const CONTRACT_VALIDATORS = [
  { edition: 'claude', path: 'scripts/validate-workflow-contracts.js' },
  { edition: 'codex', path: 'scripts/validate-kaola-workflow-contracts.js' },
  { edition: 'gitlab', path: 'plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js' },
  { edition: 'gitea', path: 'plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js' },
];

// helper -> how many LEADING arguments are addressing (a file, a concept label) rather than needles.
// Every remaining argument is needle-bearing, so its string literals are pinned needles.
// `assertNoForbidden(file)` pins nothing at the call site — its needles are the module-level
// forbidden-pattern array, counted separately as `forbidden_patterns`.
const PIN_HELPERS = {
  assertIncludes: 1,
  assertNotIncludes: 1,
  assertBefore: 1,
  assertConcept: 2,
  assertNoForbidden: null,
};

// Walk a call's argument list from its opening paren, splitting on top-level commas. Returns null
// when the parens do not balance — reported as a parse warning rather than silently dropped, so an
// undercount can never masquerade as a shrinking pin count.
function scanCallArgs(src, openIdx) {
  let depth = 0;
  let start = openIdx + 1;
  const args = [];
  let inString = null;
  let escaped = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) { args.push(src.slice(start, i)); return { args, end: i }; }
      continue;
    }
    if (c === ',' && depth === 1) { args.push(src.slice(start, i)); start = i + 1; }
  }
  return null;
}

function countStringLiterals(fragment) {
  let n = 0;
  let inString = null;
  let escaped = false;
  for (let i = 0; i < fragment.length; i++) {
    const c = fragment[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === inString) { inString = null; n++; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') inString = c;
  }
  return n;
}

function censusOneValidator(rel) {
  const raw = readRepoFile(rel);
  const src = stripComments(raw);
  const callsByHelper = {};
  const warnings = [];
  let pinCalls = 0;
  let literalNeedles = 0;

  for (const [helper, addressingArgs] of Object.entries(PIN_HELPERS)) {
    const re = new RegExp('(^|[^A-Za-z0-9_.$])' + helper + '\\s*\\(', 'g');
    let match;
    let calls = 0;
    let needles = 0;
    while ((match = re.exec(src)) !== null) {
      const openIdx = match.index + match[0].length - 1;
      // Skip the helper's own definition — `function assertIncludes(file, needle) {`.
      const before = src.slice(Math.max(0, match.index - 12), match.index + match[1].length);
      if (/\bfunction\s*$/.test(before)) continue;
      calls++;
      if (addressingArgs === null) continue;
      const scanned = scanCallArgs(src, openIdx);
      if (!scanned) { warnings.push(helper + ' call at index ' + openIdx + ' did not balance'); continue; }
      for (const arg of scanned.args.slice(addressingArgs)) needles += countStringLiterals(arg);
    }
    if (calls) callsByHelper[helper] = calls;
    pinCalls += calls;
    literalNeedles += needles;
  }

  // `assertNoForbidden`'s needles live in one module-level regex array.
  let forbiddenPatterns = 0;
  const forbiddenBlock = src.match(/const\s+forbidden\s*=\s*\[([\s\S]*?)\n\s*\];/);
  if (forbiddenBlock) forbiddenPatterns = (forbiddenBlock[1].match(/^\s*\//gm) || []).length;

  // Pins written without a helper: `content.includes('literal')` / `text.startsWith('literal')`.
  // Counted so a "shrinking" pin count cannot be produced by relocating pins off the helpers.
  const inlineNeedles = (src.match(/\.(?:includes|startsWith|endsWith)\(\s*['"`]/g) || []).length;

  return {
    path: rel,
    lines: countLines(raw),
    pin_calls: pinCalls,
    pin_calls_by_helper: callsByHelper,
    literal_needles: literalNeedles,
    forbidden_patterns: forbiddenPatterns,
    inline_needles: inlineNeedles,
    parse_warnings: warnings,
  };
}

function censusContractValidators() {
  const byValidator = [];
  const missing = [];
  for (const row of CONTRACT_VALIDATORS) {
    if (!repoFileExists(row.path)) { missing.push(row.path); continue; }
    byValidator.push(Object.assign({ edition: row.edition }, censusOneValidator(row.path)));
  }
  const sum = key => byValidator.reduce((acc, v) => acc + v[key], 0);
  return {
    validator_count: byValidator.length,
    total_pin_calls: sum('pin_calls'),
    total_literal_needles: sum('literal_needles'),
    total_inline_needles: sum('inline_needles'),
    total_forbidden_patterns: sum('forbidden_patterns'),
    by_validator: byValidator,
    missing,
  };
}

// ---------------------------------------------------------------------------
// 3. Refusal census — all seven emission shapes.
// ---------------------------------------------------------------------------

const CENSUS_SCRIPT_DIRS = [
  'scripts',
  'plugins/kaola-workflow/scripts',
  'plugins/kaola-workflow-gitlab/scripts',
  'plugins/kaola-workflow-gitea/scripts',
];

// Tests and walkthroughs carry condition strings as EXPECTATIONS, never as emissions. Counting them
// would make deleting a code look like adding one (the test that pins its removal still names it).
const CENSUS_EXCLUDE_PREFIXES = ['test-', 'simulate-'];
const CENSUS_EXCLUDE_BASENAMES = new Set(['kaola-workflow-prose-census.js']);

// A typed condition string is snake_case and at least three characters. This is a SYNTACTIC rule,
// deliberately not an allowlist: an allowlist is where a growing vocabulary hides.
const CONDITION_TOKEN = /^[a-z][a-z0-9_]{2,}$/;

// The ONLY semantic exclusion, kept to two tokens and named here so it is auditable rather than
// hidden. ADR 0013's #844 delta (c) separates the vocabulary from four NON-vocabulary shapes, one of
// which is the ok-envelope outcome value: `{ ok: true, reason: 'ok' }` and `reason: 'none'` state
// that nothing is wrong. They are answers, not conditions. Nothing else is filtered — every other
// token stays in, including internal helper reasons, because a semantic allowlist is exactly where a
// growing vocabulary hides.
const OUTCOME_VALUE_TOKENS = new Set(['ok', 'none']);

// The window the `status:`/`verdict:` shape uses to decide an object literal is a REFUSE envelope.
// `status: 'complete'` on an ok payload is not a condition string; `status: 'dirty_tree_refused'`
// beside `claim: 'none'` is. 400 chars each way covers the multi-line object literals in claim.js.
const REFUSE_ENVELOPE_WINDOW = 400;
const REFUSE_ENVELOPE_MARK = /claim:\s*'none'|result:\s*'(?:refuse|escalate|halt)'/;

const EMISSION_SHAPES = [
  {
    name: 'reason_literal',
    note: "`reason: '<code>'` object properties",
    pattern: /(^|[^A-Za-z0-9_])reason\s*:\s*'([A-Za-z0-9_]+)'/g,
    group: 2,
  },
  {
    // The leading class excludes `.` so a ternary read (`probe ? probe.status : 'absent'`) is not
    // mistaken for an object property — the `:` there is the ternary's, not a key separator.
    name: 'refuse_envelope_status',
    note: "`status:` / `verdict:` literals inside a refuse/escalate/halt envelope",
    pattern: /(^|[^A-Za-z0-9_.$])(?:status|verdict)\s*:\s*'([A-Za-z0-9_]+)'/g,
    group: 2,
    accept: (src, index) => REFUSE_ENVELOPE_MARK.test(
      src.slice(Math.max(0, index - REFUSE_ENVELOPE_WINDOW), index + REFUSE_ENVELOPE_WINDOW)),
  },
  {
    name: 'handoff_status',
    note: "`handoff_status: '<code>'` — the handoff's primary discriminator",
    pattern: /handoff_status\s*:\s*'([A-Za-z0-9_]+)'/g,
    group: 1,
  },
  {
    name: 'inner_reason',
    note: "`inner_reason: '<code>'` sub-codes",
    pattern: /inner_reason\s*:\s*'([A-Za-z0-9_]+)'/g,
    group: 1,
  },
  {
    name: 'reasons_push',
    note: "`reasons.push('<token>')` report-all findings",
    pattern: /reasons\s*\.\s*push\(\s*'([A-Za-z0-9_]+)'/g,
    group: 1,
  },
  {
    name: 'refuse_helper',
    note: "`refuse('<code>')` / `bad('<code>')` / `fail('<code>')` helper calls",
    pattern: /(^|[^A-Za-z0-9_.$])(?:schema\s*\.\s*)?(?:refuse|bad|fail)\(\s*'([A-Za-z0-9_]+)'/g,
    group: 2,
  },
  {
    // A typed code is a CLOSED token — the quote ends right after it, or a `:` introduces a detail
    // suffix (`throw new Error('unknown_arg:' + arg)`). A prose message (`'blob length malformed'`)
    // is an internal error, not vocabulary, and counting it would inflate the census with sentences.
    name: 'thrown_error',
    note: "`throw new Error('<code>')` converted by a catch",
    pattern: /throw\s+new\s+Error\(\s*'([A-Za-z0-9_]+)(?:'|:)/g,
    group: 1,
  },
];

// ADJACENT shapes — typed condition strings that sit just OUTSIDE the seven-shape boundary.
//
// The seven shapes are the census definition, and the `reason:` pattern deliberately requires a
// non-word character before `reason` so that `transition_reason: 'x'` is not double-counted as a
// `reason:` hit. That exclusion is correct for the union, but it also means two real field families
// carry typed condition strings the census never sees: `transition_reason:` (the re-plan transition
// cause) and `source_reason:`. They are conditions by construction — snake_case typed tokens on an
// emitted envelope — but they are causes of a transition rather than refusals, so folding them into
// the refusal union would overstate it.
//
// They are therefore MEASURED AND REPORTED, never folded. GAP-LEDGER gap 17 records that the
// census's completeness claim is unproven; a boundary that is merely implicit is exactly how that
// stays true. Reporting the adjacent count makes the boundary an auditable number, so a later
// reader can decide to widen it on evidence instead of rediscovering the omission by grep.
const ADJACENT_SHAPES = [
  { name: 'transition_reason', note: "`transition_reason: '<code>'` re-plan transition causes",
    pattern: /transition_reason\s*:\s*'([A-Za-z0-9_]+)'/g, group: 1 },
  { name: 'source_reason', note: "`source_reason: '<code>'` upstream-cause echoes",
    pattern: /source_reason\s*:\s*'([A-Za-z0-9_]+)'/g, group: 1 },
];

// Runtime-minted codes: `refuse('epoch_lineage_' + lineage.reason)` and friends. These prove the
// vocabulary is not closed today, so they are reported as their own honest number rather than being
// folded into a distinct-string count that cannot represent them.
const DYNAMIC_SITE_PATTERNS = [
  /reason\s*:\s*'[A-Za-z0-9_]*'\s*\+/g,
  /(?:refuse|bad|fail)\(\s*'[A-Za-z0-9_]*'\s*\+/g,
  /handoff_status\s*:\s*'[A-Za-z0-9_]*'\s*\+/g,
];

function censusFiles() {
  const files = [];
  for (const dir of CENSUS_SCRIPT_DIRS) {
    const abs = path.join(REPO, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.endsWith('.js')) continue;
      if (CENSUS_EXCLUDE_BASENAMES.has(name)) continue;
      if (CENSUS_EXCLUDE_PREFIXES.some(p => name.startsWith(p))) continue;
      files.push(dir + '/' + name);
    }
  }
  return files;
}

function censusRefusals() {
  const files = censusFiles();
  const byShape = {};
  for (const shape of EMISSION_SHAPES) {
    byShape[shape.name] = { note: shape.note, sites: 0, distinct: 0, _set: new Set() };
  }
  const all = new Set();
  const adjacent = {};
  for (const shape of ADJACENT_SHAPES) {
    adjacent[shape.name] = { note: shape.note, sites: 0, distinct: 0, _set: new Set() };
  }
  let dynamicSites = 0;

  for (const rel of files) {
    const src = stripComments(readRepoFile(rel));
    for (const shape of EMISSION_SHAPES) {
      const re = new RegExp(shape.pattern.source, shape.pattern.flags);
      let match;
      while ((match = re.exec(src)) !== null) {
        const token = match[shape.group];
        if (!CONDITION_TOKEN.test(token)) continue;
        if (OUTCOME_VALUE_TOKENS.has(token)) continue;
        if (shape.accept && !shape.accept(src, match.index)) continue;
        byShape[shape.name].sites += 1;
        byShape[shape.name]._set.add(token);
        all.add(token);
      }
    }
    for (const shape of ADJACENT_SHAPES) {
      const re = new RegExp(shape.pattern.source, shape.pattern.flags);
      let match;
      while ((match = re.exec(src)) !== null) {
        const token = match[shape.group];
        if (!CONDITION_TOKEN.test(token) || OUTCOME_VALUE_TOKENS.has(token)) continue;
        adjacent[shape.name].sites += 1;
        adjacent[shape.name]._set.add(token);
      }
    }
    for (const pattern of DYNAMIC_SITE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      dynamicSites += (src.match(re) || []).length;
    }
  }

  let totalSites = 0;
  for (const entry of Object.values(byShape)) {
    entry.distinct = entry._set.size;
    totalSites += entry.sites;
    delete entry._set;
  }
  // Report which adjacent tokens are NOT already in the seven-shape union — those are the ones a
  // widened boundary would actually add, and the only honest measure of what the census omits.
  const adjacentOnly = new Set();
  for (const entry of Object.values(adjacent)) {
    entry.distinct = entry._set.size;
    entry.tokens = [...entry._set].sort();
    for (const token of entry._set) if (!all.has(token)) adjacentOnly.add(token);
    delete entry._set;
  }

  return {
    scope: {
      dirs: CENSUS_SCRIPT_DIRS,
      excluded_prefixes: CENSUS_EXCLUDE_PREFIXES,
      files_scanned: files.length,
      token_rule: CONDITION_TOKEN.source,
      excluded_outcome_values: [...OUTCOME_VALUE_TOKENS],
      refuse_envelope_window: REFUSE_ENVELOPE_WINDOW,
    },
    distinct_conditions: all.size,
    emission_sites: totalSites,
    dynamic_sites: dynamicSites,
    by_shape: byShape,
    adjacent_shapes: {
      note: 'Typed condition strings just outside the seven-shape boundary. Reported, never folded '
        + 'into distinct_conditions — see ADJACENT_SHAPES for why the boundary sits where it does.',
      by_shape: adjacent,
      not_in_union: [...adjacentOnly].sort(),
      not_in_union_count: adjacentOnly.size,
    },
    conditions: [...all].sort(),
  };
}

// ---------------------------------------------------------------------------
// The ratio — P5 made visible at a glance.
// ---------------------------------------------------------------------------
function ratio(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function buildRatio(surfaces, validators, refusals) {
  const conditions = refusals.distinct_conditions;
  return {
    basis: 'distinct typed condition strings across all seven emission shapes',
    distinct_conditions: conditions,
    routing_surface_lines: surfaces.generated.total_lines,
    authoring_source_lines: surfaces.authoring_sources.total_lines,
    needle_pins: validators.total_literal_needles,
    surface_lines_per_condition: ratio(surfaces.generated.total_lines, conditions),
    authoring_lines_per_condition: ratio(surfaces.authoring_sources.total_lines, conditions),
    needle_pins_per_condition: ratio(validators.total_literal_needles, conditions),
    reading: 'P5 holds when these three per-condition ratios stay flat as the census shrinks. '
      + 'A ratio that RISES means prose or pins survived the refusal they described.',
  };
}

function headCommit() {
  try {
    return execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (_) { return null; }
}

function census(opts) {
  const surfaces = censusRoutingSurfaces();
  const validators = censusContractValidators();
  const refusals = censusRefusals();
  return {
    tool: 'kaola-workflow-prose-census',
    schema: SCHEMA_VERSION,
    predicate: 'ADR 0013 P5 — prose census',
    captured_at_commit: (opts && opts.commit === false) ? null : headCommit(),
    routing_surfaces: surfaces,
    contract_validators: validators,
    refusal_census: refusals,
    ratio: buildRatio(surfaces, validators, refusals),
  };
}

// ---------------------------------------------------------------------------
// Compare — the proportionality verdict.
// ---------------------------------------------------------------------------

// Proportional means: prose shrank at least as fast as the census. `slack` is the tolerance on the
// per-condition ratio; a 5% rise is rounding, a 20% rise is choreography surviving its refusal.
const RATIO_SLACK = 0.05;

function compareMetric(label, baselineRatio, liveRatio) {
  if (baselineRatio === null || liveRatio === null) {
    return { metric: label, verdict: 'unmeasurable', baseline: baselineRatio, live: liveRatio };
  }
  const change = baselineRatio === 0 ? 0 : (liveRatio - baselineRatio) / baselineRatio;
  let verdict = 'proportional';
  if (change > RATIO_SLACK) verdict = 'prose_lagging';
  else if (change < -RATIO_SLACK) verdict = 'prose_leading';
  return {
    metric: label,
    baseline: baselineRatio,
    live: liveRatio,
    ratio_change_pct: Math.round(change * 1000) / 10,
    verdict,
  };
}

function compare(baseline, live) {
  const b = baseline.ratio;
  const l = live.ratio;
  const metrics = [
    compareMetric('surface_lines_per_condition', b.surface_lines_per_condition, l.surface_lines_per_condition),
    compareMetric('authoring_lines_per_condition', b.authoring_lines_per_condition, l.authoring_lines_per_condition),
    compareMetric('needle_pins_per_condition', b.needle_pins_per_condition, l.needle_pins_per_condition),
  ];
  const baseConditions = new Set(baseline.refusal_census.conditions);
  const liveConditions = new Set(live.refusal_census.conditions);
  return {
    tool: 'kaola-workflow-prose-census',
    mode: 'compare',
    baseline_commit: baseline.captured_at_commit,
    live_commit: live.captured_at_commit,
    absolute: {
      distinct_conditions: { baseline: b.distinct_conditions, live: l.distinct_conditions,
        delta: l.distinct_conditions - b.distinct_conditions },
      routing_surface_lines: { baseline: b.routing_surface_lines, live: l.routing_surface_lines,
        delta: l.routing_surface_lines - b.routing_surface_lines },
      authoring_source_lines: { baseline: b.authoring_source_lines, live: l.authoring_source_lines,
        delta: l.authoring_source_lines - b.authoring_source_lines },
      needle_pins: { baseline: b.needle_pins, live: l.needle_pins, delta: l.needle_pins - b.needle_pins },
    },
    conditions_removed: [...baseConditions].filter(c => !liveConditions.has(c)).sort(),
    conditions_added: [...liveConditions].filter(c => !baseConditions.has(c)).sort(),
    metrics,
    verdict: metrics.some(m => m.verdict === 'prose_lagging') ? 'prose_lagging'
      : metrics.every(m => m.verdict === 'unmeasurable') ? 'unmeasurable' : 'proportional',
  };
}

// ---------------------------------------------------------------------------
// Rendering + CLI.
// ---------------------------------------------------------------------------
function renderSummary(result) {
  const lines = [];
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  lines.push('P5 prose census — ADR 0013');
  lines.push('commit: ' + (result.captured_at_commit || '(unknown)'));
  lines.push('');
  lines.push('Routing surfaces (' + result.routing_surfaces.generated.surface_count + ' generated)');
  for (const [topic, row] of Object.entries(result.routing_surfaces.generated.by_topic)) {
    lines.push('  ' + pad(topic, 12) + num(row.total_lines, 6) + ' lines across '
      + row.surface_count + ' surfaces');
  }
  lines.push('  ' + pad('TOTAL', 12) + num(result.routing_surfaces.generated.total_lines, 6) + ' lines');
  lines.push('  ' + pad('authoring', 12) + num(result.routing_surfaces.authoring_sources.total_lines, 6)
    + ' lines across ' + result.routing_surfaces.authoring_sources.file_count + ' sources');
  lines.push('');
  lines.push('Contract validators (needle pins)');
  for (const v of result.contract_validators.by_validator) {
    lines.push('  ' + pad(v.edition, 12) + num(v.literal_needles, 6) + ' needles  ('
      + v.pin_calls + ' pin calls, ' + v.inline_needles + ' inline)');
  }
  lines.push('  ' + pad('TOTAL', 12) + num(result.contract_validators.total_literal_needles, 6)
    + ' needles  (' + result.contract_validators.total_pin_calls + ' pin calls, '
    + result.contract_validators.total_inline_needles + ' inline)');
  lines.push('');
  lines.push('Refusal census (seven emission shapes)');
  for (const [name, row] of Object.entries(result.refusal_census.by_shape)) {
    lines.push('  ' + pad(name, 24) + num(row.distinct, 5) + ' distinct  ' + num(row.sites, 5) + ' sites');
  }
  lines.push('  ' + pad('DISTINCT UNION', 24) + num(result.refusal_census.distinct_conditions, 5)
    + ' distinct  ' + num(result.refusal_census.emission_sites, 5) + ' sites'
    + '  (+' + result.refusal_census.dynamic_sites + ' runtime-minted sites)');
  const adjacent = result.refusal_census.adjacent_shapes;
  if (adjacent) {
    lines.push('');
    lines.push('Adjacent shapes (measured, NOT folded into the union)');
    for (const [name, row] of Object.entries(adjacent.by_shape)) {
      lines.push('  ' + pad(name, 24) + num(row.distinct, 5) + ' distinct  ' + num(row.sites, 5) + ' sites');
    }
    lines.push('  ' + pad('OUTSIDE THE UNION', 24) + num(adjacent.not_in_union_count, 5)
      + ' tokens the seven shapes never see');
  }
  lines.push('');
  lines.push('Ratio (P5 proportionality)');
  lines.push('  surface lines  / condition: ' + result.ratio.surface_lines_per_condition);
  lines.push('  authoring lines/ condition: ' + result.ratio.authoring_lines_per_condition);
  lines.push('  needle pins    / condition: ' + result.ratio.needle_pins_per_condition);
  return lines.join('\n');
}

function usage() {
  return [
    'usage: kaola-workflow-prose-census.js [--json|--summary]',
    '       kaola-workflow-prose-census.js --write-baseline [path]',
    '       kaola-workflow-prose-census.js --compare [path] [--fail-on-regression]',
    '',
    'Measures ADR 0013 P5: routing-surface line count, contract-validator needle-pin count,',
    'and the refusal census across all seven emission shapes, plus the proportionality ratio.',
    'Default baseline path: ' + DEFAULT_BASELINE,
  ].join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(usage()); return 0; }

  const flagValue = (flag) => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    const next = args[i + 1];
    return (next && !next.startsWith('--')) ? next : null;
  };

  if (args.includes('--write-baseline')) {
    const rel = flagValue('--write-baseline') || DEFAULT_BASELINE;
    const result = census();
    const abs = path.isAbsolute(rel) ? rel : path.join(REPO, rel);
    fs.writeFileSync(abs, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({
      result: 'ok', wrote: rel, commit: result.captured_at_commit,
      distinct_conditions: result.refusal_census.distinct_conditions,
      routing_surface_lines: result.routing_surfaces.generated.total_lines,
      needle_pins: result.contract_validators.total_literal_needles,
    }));
    return 0;
  }

  if (args.includes('--compare')) {
    const rel = flagValue('--compare') || DEFAULT_BASELINE;
    const abs = path.isAbsolute(rel) ? rel : path.join(REPO, rel);
    if (!fs.existsSync(abs)) {
      console.log(JSON.stringify({ result: 'refuse', reason: 'prose_census_baseline_missing', baseline: rel }));
      return 1;
    }
    const baseline = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (baseline.schema !== SCHEMA_VERSION) {
      console.log(JSON.stringify({ result: 'refuse', reason: 'prose_census_baseline_schema_unsupported',
        baseline: rel, found: baseline.schema, expected: SCHEMA_VERSION }));
      return 1;
    }
    const diff = compare(baseline, census());
    console.log(JSON.stringify(diff, null, 2));
    return (args.includes('--fail-on-regression') && diff.verdict === 'prose_lagging') ? 1 : 0;
  }

  const result = census();
  if (args.includes('--summary')) console.log(renderSummary(result));
  else console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv);
}

module.exports = {
  census,
  compare,
  censusRoutingSurfaces,
  censusContractValidators,
  censusRefusals,
  censusFiles,
  buildRatio,
  renderSummary,
  stripComments,
  countLines,
  scanCallArgs,
  countStringLiterals,
  CONTRACT_VALIDATORS,
  AUTHORING_SOURCES,
  EMISSION_SHAPES,
  ADJACENT_SHAPES,
  DEFAULT_BASELINE,
  SCHEMA_VERSION,
  main,
};
