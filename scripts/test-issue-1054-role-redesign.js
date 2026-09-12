#!/usr/bin/env node
'use strict';

// Issue #1054 (mission 9 — role redesign). TEST CUSTODY ONLY: this suite pins ACCEPTANCE MEANING
// for `templates/agents/behavior-contracts.json` (the 7-role authority) and its generated
// carriers. No production code lives here.
//
// The issue's own instruction is explicit: role bodies stop being "an old model's process
// prescription" and become "what this role is positioned to do and what it must deliver", with
// the current model choosing its own method. This suite pins that MEANING, not a rewritten
// author's exact sentence:
//
//   A. No verbatim block (>=200 chars after whitespace normalization) repeated across role
//      bodies — measured generically over the authority, not by naming the four blocks the issue
//      cites as evidence (963-char defense x10, 264-char "tools fall short" x10, ~506-char
//      solution ladder x3, ~381-char explorer/investigator block x2).
//   B. No procedure-ritual vocabulary in bodies: numeric thresholds/ratios, fixed phase lists,
//      fixed build order, hardcoded generic project commands, a lockfile-deletion recipe, fixed
//      fenced-markdown output templates, "exactly one of" verification tiers, the mechanical
//      review_conclusion/column-zero/word-count/last-line reviewer protocol, and the doc-updater
//      "Last Updated: YYYY-MM-DD" / fixed codemap directory prescription.
//   C. metric-optimizer routes fixed-destination, non-metric work to `implementer` — never
//      `tdd-guide` (the issue names this as a concrete misrouting defect, item 21). The role
//      itself is retired by #1062, so the pin is now absence: no role may carry the misroute.
//   D. Custody sentences survive the prose diet: tdd-guide writes no production code; implementer
//      does not alter accepted meaning; investigator/code-explorer/knowledge-lookup write only
//      their own findings; the orchestrator (not the reviewer roles) decides consequences.
//   E. Machine-consumed fields stay intact: non-empty description; capability_requirements per
//      role unchanged from the 662bcd33.. / 6ae5374b lineage; the intent_class field is absent on
//      every role (#1062 retired the tier axis it encoded); REQUIRED_COVERAGE
//      completeness is a METADATA property, not a body-prose-restatement requirement (proved by
//      generating from a body that does not restate the seven coverage sections).
//   F. Compact-recovery carrier dedupe (issue item 25): the recovery skeleton and every rendered
//      recovery prompt (Claude x3 forges, Codex x3 forges, plus grok/cursor via
//      kaola-workflow-global-contract.js) do not re-embed the runtime dispatch/delegation block
//      the full Next/Finalize reload carries. This is ALSO RED at the #1054 baseline: the
//      skeleton still carries `runtime-dispatch-common` / `runtime-delegation` slots at 6ae5374b.
//   G. Negative: this suite adds no new prompt-quality gate (no word-count/ratio/length assertion
//      on prose quality), and role/tool-allowlist/schema shape is unchanged (7 roles, capability
//      requirements pinned in E, so derived tool allowlists follow).
//
// Groups A, B, C, and F are RED items: they fail against the 6ae5374b baseline (verified in an
// isolated `git worktree add ... 6ae5374b` checkout) because the retired ritual, duplication, the
// metric-optimizer misroute, and the recovery dispatch re-embed are all still present. Groups D, E,
// and G are largely already-true invariants at that baseline; they are pinned here as regression
// rails so the prose diet cannot silently also strip custody language, machine-consumed metadata,
// or role/tool-allowlist shape.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const generator = require('./generate-agent-profiles.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('  FAIL: ' + msg);
}

const behavior = generator.loadBehaviorContracts(ROOT);
const adapters = generator.loadRuntimeAdapters(ROOT);
const profiles = generator.renderProfiles(behavior, adapters);
const ROLES = generator.ROLES;

assert(Array.isArray(ROLES) && ROLES.length === 7,
  'setup: generator declares exactly 7 roles — got ' + (ROLES && ROLES.length));
assert(JSON.stringify([...ROLES].sort()) === JSON.stringify(Object.keys(behavior.roles).sort()),
  'setup: behavior authority declares exactly the generator role roster');

function body(role) {
  return String((behavior.roles[role] || {}).body || '');
}
function claudeRender(role) {
  const profile = profiles.find(p => p.runtime === 'claude' && p.role === role);
  return profile ? profile.content : '';
}

// ===========================================================================
// Group A — no verbatim paragraph (>=200 chars normalized) repeated across role bodies.
// ===========================================================================

// paragraphsOf — split on blank-line boundaries, collapse internal whitespace/newlines to single
// spaces, keep only blocks >=200 chars. This is the generic measurement the issue asks for: it
// does not name or search for the four retired blocks, it finds ANY block of that size shared by
// more than one role.
function paragraphsOf(text) {
  return String(text)
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length >= 200);
}

function duplicateParagraphGroups(bodiesByRole) {
  const owners = new Map(); // normalized paragraph -> Set<role>
  for (const [role, text] of Object.entries(bodiesByRole)) {
    for (const paragraph of paragraphsOf(text)) {
      if (!owners.has(paragraph)) owners.set(paragraph, new Set());
      owners.get(paragraph).add(role);
    }
  }
  const dupes = [];
  for (const [paragraph, roles] of owners) {
    if (roles.size > 1) dupes.push({ paragraph, roles: [...roles].sort() });
  }
  return dupes;
}

// Oracle self-test — the detector must fire on a >=200 char shared block and must NOT fire on a
// short (<200 char) shared block, so a passing suite is evidence the detector works rather than
// evidence the threshold is vacuous.
{
  const longShared = 'x'.repeat(210);
  const shortShared = 'y'.repeat(80);
  const fixtureA = { roleOne: 'Intro one.\n\n' + longShared + '\n\nOutro one.',
    roleTwo: 'Intro two.\n\n' + longShared + '\n\nOutro two.' };
  const fixtureB = { roleOne: 'Intro one.\n\n' + shortShared + '\n\nOutro one.',
    roleTwo: 'Intro two.\n\n' + shortShared + '\n\nOutro two.' };
  const foundLong = duplicateParagraphGroups(fixtureA);
  const foundShort = duplicateParagraphGroups(fixtureB);
  assert(foundLong.length === 1 && foundLong[0].roles.length === 2,
    'A/oracle: a >=200 char paragraph shared by two role bodies is detected');
  assert(foundShort.length === 0,
    'A/oracle: a <200 char shared paragraph is correctly ignored (threshold is not vacuous)');
  // A paragraph with the same WORDS but different internal whitespace/wrapping still counts as
  // the same paragraph (normalization proof) ...
  const wrapped = { roleOne: 'Intro.\n\n' + longShared + '\n\nOutro.',
    roleTwo: 'Intro.\n\n' + longShared.slice(0, 100) + ' ' + longShared.slice(100) + '\n\nOutro.' };
  // ... but only when the normalized text is actually identical; a genuinely edited paragraph of
  // the same length must NOT be flagged as a duplicate of the original.
  const edited = { roleOne: 'Intro.\n\n' + longShared + '\n\nOutro.',
    roleTwo: 'Intro.\n\n' + 'z'.repeat(210) + '\n\nOutro.' };
  assert(duplicateParagraphGroups(edited).length === 0,
    'A/oracle: two DIFFERENT >=200 char paragraphs are not treated as a duplicate');
}

{
  const bodiesByRole = Object.fromEntries(ROLES.map(role => [role, body(role)]));
  const dupes = duplicateParagraphGroups(bodiesByRole);
  assert(dupes.length === 0,
    'A/source: no >=200 char paragraph is repeated verbatim across role bodies in the authority — found '
      + JSON.stringify(dupes.map(d => ({ roles: d.roles, chars: d.paragraph.length, sample: d.paragraph.slice(0, 60) }))));
}

// Defense in depth: the same measurement over the CLAUDE native render's body slice (from the
// end of the managed-agent marker to the end of the content). This proves the dedupe reaches
// generated output, not only the authority.
function renderedBodySlice(content) {
  const markerEnd = content.indexOf('kaola-workflow-managed-agent: true -->');
  if (markerEnd < 0) return '';
  return content.slice(markerEnd + 'kaola-workflow-managed-agent: true -->'.length);
}
{
  const renderedByRole = Object.fromEntries(ROLES.map(role => [role, renderedBodySlice(claudeRender(role))]));
  assert(Object.values(renderedByRole).every(text => text.trim().length > 0),
    'A/render setup: the managed-agent marker bounds a non-empty body slice for every role');
  const renderDupes = duplicateParagraphGroups(renderedByRole);
  assert(renderDupes.length === 0,
    'A/render: no >=200 char paragraph is repeated verbatim across native Claude renders — found '
      + JSON.stringify(renderDupes.map(d => ({ roles: d.roles, chars: d.paragraph.length }))));
}

// ===========================================================================
// Group B — no procedure-ritual vocabulary in bodies.
// ===========================================================================

function coOccurs(text, fragments) {
  return fragments.every(re => re.test(text));
}

const RITUAL_CHECKS = [
  {
    id: 'numeric-fn-length',
    detect: text => />\s*50\s*lines/i.test(text),
    trigger: 'Red flag: functions over the line-count bound (>50 lines) need a split.',
    safe: 'Split a function when it has grown hard to follow, using your own judgment.',
  },
  {
    id: 'numeric-nesting',
    detect: text => />\s*4\s*levels/i.test(text),
    trigger: 'Red flag: deep nesting (>4 levels) should be flattened.',
    safe: 'Flatten nesting that makes control flow hard to follow.',
  },
  {
    id: 'ratio-diff-size',
    detect: text => /<\s*5%/.test(text),
    trigger: 'Minimal lines changed (< 5% of affected file).',
    safe: 'Keep the diff as small as the fix allows.',
  },
  {
    id: 'confidence-percent',
    detect: text => />\s*80%/.test(text),
    trigger: 'Admit a finding only when confidence exceeds a fixed threshold (>80%).',
    safe: 'Admit a finding only when you are confident it is real.',
  },
  {
    id: 'codemap-line-cap',
    detect: text => /500\s*lines/i.test(text),
    trigger: 'Token efficiency: keep codemaps under 500 lines each.',
    safe: 'Keep documentation concise for its audience.',
  },
  {
    id: 'median-of-k',
    detect: text => /median-of-K/i.test(text),
    trigger: 'Measure the metric (median-of-K) before deciding.',
    safe: 'Measure the metric with a method appropriate to its noise.',
  },
  {
    id: 'beta-posterior',
    detect: text => /Beta\s*\(\s*1\s*\+/.test(text),
    trigger: 'Model each arm as Beta(1 + n_success, 1 + n_failure).',
    safe: 'Compare the candidate against the running baseline.',
  },
  {
    id: 'fixed-phase-list',
    detect: text => coOccurs(text, [
      /phase\s*1[\s\S]{0,80}(minimum viable|\bmvp\b)/i,
      /phase\s*2[\s\S]{0,80}core experience/i,
      /phase\s*3[\s\S]{0,80}edge cases/i,
      /phase\s*4[\s\S]{0,80}optimization/i,
    ]),
    trigger: '### Phase 1: Minimum viable — smallest slice\n### Phase 2: Core experience — full happy path\n'
      + '### Phase 3: Edge cases — error handling, edge cases, polish\n### Phase 4: Optimization — perf and monitoring',
    safe: 'Break large work into independently deliverable phases as the task actually requires; there is no fixed phase list every plan must follow.',
  },
  {
    id: 'fixed-build-order',
    detect: text => coOccurs(text, [/types and interfaces/i, /core logic/i, /integration layer/i]),
    trigger: 'Order the implementation by dependency: 1. types and interfaces 2. core logic 3. integration layer 4. UI 5. tests 6. docs',
    safe: 'Order the implementation by real dependency; there is no fixed layer sequence every build must follow.',
  },
  {
    id: 'generic-command-tsc',
    detect: text => /npx tsc/i.test(text),
    trigger: 'Run `npx tsc --noEmit --pretty` to collect all type errors.',
    safe: 'Run the project\'s actual build or typecheck command and record its output.',
  },
  {
    id: 'generic-command-eslint',
    detect: text => /npx eslint/i.test(text),
    trigger: 'Run `npx eslint . --ext .ts,.tsx,.js,.jsx`.',
    safe: 'Run the project\'s actual lint command if one exists.',
  },
  {
    id: 'generic-command-npm-build',
    detect: text => /npm run build/i.test(text),
    trigger: 'Verify with `npm run build` completes successfully.',
    safe: 'Verify with the project\'s actual build command.',
  },
  {
    id: 'lockfile-deletion',
    detect: text => /rm -rf node_modules package-lock\.json/i.test(text),
    trigger: 'Nuclear option: `rm -rf node_modules package-lock.json && npm install`.',
    safe: 'Reinstall dependencies with the project\'s own recovery procedure if one is documented.',
  },
  {
    id: 'fenced-output-template',
    detect: text => /```markdown/i.test(text),
    trigger: 'Output Format\n\n```markdown\n## Exploration: [Feature/Area Name]\n```',
    safe: 'Report the deliverable in whatever structure the task actually needs.',
  },
  {
    id: 'verification-tier-exactly-one',
    detect: text => /exactly one of:/i.test(text),
    trigger: 'Record it as your verification tier — exactly one of: tests-green, build-green, smoke-integration.',
    safe: 'Record the verification you actually performed and what it showed.',
  },
  {
    id: 'review-conclusion-protocol',
    detect: text => /review_conclusion:/i.test(text),
    trigger: 'Emit exactly one column-zero review_conclusion: <substantive prose>.',
    safe: 'Deliver your findings and a conclusion in natural language.',
  },
  {
    id: 'column-zero-protocol',
    detect: text => /column zero/i.test(text),
    trigger: 'Emit each finding row at column zero in this exact shape.',
    safe: 'Report each finding clearly, in whatever shape communicates it best.',
  },
  {
    id: 'word-count-protocol',
    detect: text => /word tokens|24 Unicode letter/i.test(text),
    trigger: 'The conclusion must have at least 24 Unicode letter/number characters and four word tokens.',
    safe: 'The conclusion should be substantive enough to be useful.',
  },
  {
    id: 'last-line-protocol',
    detect: text => /final nonempty line/i.test(text),
    trigger: 'The conclusion must be the final nonempty line; append no later nonempty line.',
    safe: 'End with your conclusion.',
  },
  {
    id: 'last-updated-date',
    detect: text => /Last Updated.{0,15}YYYY-MM-DD/i.test(text),
    trigger: '**Last Updated:** YYYY-MM-DD',
    safe: 'Keep documentation dated the way the project already dates it, if it does.',
  },
  {
    id: 'codemap-directory-prescription',
    detect: text => ['INDEX.md', 'frontend.md', 'backend.md', 'database.md', 'integrations.md', 'workers.md']
      .filter(name => text.includes(name)).length >= 3,
    trigger: 'docs/CODEMAPS/\n├── INDEX.md\n├── frontend.md\n├── backend.md\n└── database.md',
    safe: 'Follow the project\'s own documentation layout; there is no fixed codemap directory shape every project must have.',
  },
];

// Oracle self-test for every detector: it must fire on its own trigger fixture and must NOT fire
// on its own safe/paraphrase fixture, so a green suite is evidence the checks work rather than
// evidence they are unreachable.
for (const check of RITUAL_CHECKS) {
  assert(check.detect(check.trigger) === true,
    `B/oracle[${check.id}]: detector fires on its own trigger fixture`);
  assert(check.detect(check.safe) === false,
    `B/oracle[${check.id}]: detector does not fire on a benign paraphrase (not over-broad)`);
}

// The real assertion: no role body in the authority carries any retired ritual pattern.
for (const check of RITUAL_CHECKS) {
  const hits = ROLES.filter(role => check.detect(body(role)));
  assert(hits.length === 0,
    `B/source[${check.id}]: no role body carries the retired ritual pattern — found in ${JSON.stringify(hits)}`);
}

// Defense in depth: same sweep over every native Claude render (the body reaches generated
// output byte-for-byte, so a retired pattern in the source would reach the render too).
for (const check of RITUAL_CHECKS) {
  const hits = ROLES.filter(role => check.detect(claudeRender(role)));
  assert(hits.length === 0,
    `B/render[${check.id}]: no native Claude render carries the retired ritual pattern — found in ${JSON.stringify(hits)}`);
}

// ===========================================================================
// Group C — metric-optimizer must not misroute fixed-destination, non-metric work to
// `tdd-guide`. The issue names this a concrete misrouting defect (item 21): the pre-#1054 body
// said the opposite ("fixed-destination implementation ... stays tdd-guide"). NEGATIVE ONLY per
// owner ruling (19:03 heartbeat): a positive "routes to implementer" assertion is a wording pin —
// an equivalent rephrasing that never names implementer at all (e.g. "the loop is the only thing
// you own; anything else is a finding") would still fully close the misrouting defect and should
// not red this suite. The negative captures the one thing that is actually wrong to say.
// ===========================================================================
{
  assert(!ROLES.includes('metric-optimizer') && !('metric-optimizer' in behavior.roles),
    'C/source: metric-optimizer is retired — absent from the generator roster and the authority');
  assert(!profiles.some(p => p.role === 'metric-optimizer'),
    'C/render: no native render exists for the retired metric-optimizer role');
  for (const role of ROLES) {
    const text = body(role);
    const misroutesToTddGuide = /fixed-destination[\s\S]{0,40}tdd-guide/i.test(text)
      || /fixed-destination[\s\S]{0,80}stays[\s\S]{0,10}`?tdd-guide`?/i.test(text);
    assert(misroutesToTddGuide === false,
      `C/source[${role}]: no role says fixed-destination implementation stays with tdd-guide`);
  }
}

// Group D (custody-sentence wording pins) DELETED per owner ruling (19:03 heartbeat): a positive
// gate on current role wording — including concept co-occurrence and widened regexes — is still a
// wording pin (an equivalent rephrasing reds it), and no synonym parser or keyword gate may
// replace it. Custody is protected by generation integrity (generate-agent-profiles --check,
// validate-vendored-agents, hashes) and by native behavior acceptance (mission 14), not by prose
// gates in this suite. See the deleted-assertion table in acceptance-red-roles.md.

// ===========================================================================
// Group E — machine-consumed fields stay intact.
// ===========================================================================
const PINNED_METADATA = {
  'code-explorer': { caps: ['repository_read', 'scoped_write'] },
  'code-reviewer': { caps: ['repository_read', 'scoped_write', 'command_execution'] },
  'doc-updater': { caps: ['repository_read', 'scoped_write', 'command_execution'] },
  'implementer': { caps: ['repository_read', 'scoped_write', 'command_execution'] },
  'investigator': { caps: ['repository_read', 'scoped_write', 'command_execution'] },
  'knowledge-lookup': { caps: ['repository_read', 'scoped_write', 'external_research'] },
  'tdd-guide': { caps: ['repository_read', 'scoped_write', 'command_execution'] },
};
for (const role of ROLES) {
  const contract = behavior.roles[role];
  assert(typeof contract.description === 'string' && contract.description.trim().length > 0,
    `E/source[${role}]: description is non-empty`);
  const pin = PINNED_METADATA[role];
  assert(!!pin, `E/setup[${role}]: this suite has a pinned capability row for every role`);
  if (!pin) continue;
  assert(!('intent_class' in contract),
    `E/source[${role}]: intent_class is absent — the tier axis it encoded is retired by #1062 — got ${contract.intent_class}`);
  assert(JSON.stringify(contract.capability_requirements) === JSON.stringify(pin.caps),
    `E/source[${role}]: capability_requirements unchanged — got ${JSON.stringify(contract.capability_requirements)}`);
}

// REQUIRED_COVERAGE completeness is a METADATA property: a short body that does not restate the
// seven coverage-field prose sections must still validate and render. Proved on a SYNTHETIC
// fixture (not a mutation of the real committed source) so this is a property of the generator
// mechanism, not a re-assertion that the real bodies happen to be short today.
{
  const fixture = JSON.parse(JSON.stringify(behavior));
  fixture.roles['implementer'].body = 'Deliver the assigned change and report the verification you performed.';
  let threw = null;
  try { generator.validateBehaviorContracts(fixture); } catch (error) { threw = error; }
  assert(threw === null,
    'E/mechanism: a short body with no restated coverage prose still validates — coverage completeness is metadata-only'
      + (threw ? (' — threw ' + threw.message) : ''));
  let renderThrew = null;
  let shortProfiles = [];
  try { shortProfiles = generator.renderProfiles(fixture, adapters); } catch (error) { renderThrew = error; }
  assert(renderThrew === null && shortProfiles.length === profiles.length,
    'E/mechanism: a short body still generates the full native-render matrix'
      + (renderThrew ? (' — threw ' + renderThrew.message) : ''));
}

// Every profile-producing runtime's renderer accepts the current bodies with no throw (already
// exercised by the renderProfiles() call above; assert the coverage explicitly so a binding
// runtime silently dropped from BINDING_RUNTIMES would be caught here too). Native-only runtimes
// render no profiles by design (#1062).
{
  const renderedRuntimes = new Set(profiles.map(p => p.runtime));
  assert(JSON.stringify([...renderedRuntimes].sort()) === JSON.stringify([...generator.BINDING_RUNTIMES].sort()),
    'E/render: every binding runtime rendered at least one profile with no throw — got '
      + JSON.stringify([...renderedRuntimes].sort()));
}

// ===========================================================================
// Group F — compact-recovery carrier dedupe (issue item 25: "recovery重复dispatch/adapter") is
// PER RUNTIME, not global. MEASURED (not this suite's invention): dropping the dispatch/delegation
// slots from the skeleton unconditionally reds test-issue-1044-prompt-bundle.js,
// test-issue-1044-runtime-adapters.js, and the grok/cursor edition suites, because for Grok and
// Cursor the recovery render IS the always-loaded carrier of the dispatch contract and the runtime
// adapter — there is no other carrier that reliably survives a compaction on those hosts (Rule /
// alwaysApply, not a slash-command reload). For claude and codex, recovery instead reloads the
// complete installed Next/Finalize prompt, which already carries dispatch — repeating it there
// would load it twice. So: claude/codex recovery renders do NOT re-embed the dispatch/adapter
// blocks (RED at 6ae5374b: they still do); grok/cursor recovery renders DO keep them exactly once
// (this direction is a REGRESSION GUARD — it must stay true, not become collateral damage of "no
// duplication" applied too broadly). Read from the generator's own
// RECOVERY_FULL_DISPATCH_RUNTIMES export rather than hand-listing the runtime split.
// ===========================================================================
{
  const routing = require('./generate-routing-surfaces.js');
  // Fall back to the pinned target split (['grok', 'cursor']) when the generator does not (yet)
  // export RECOVERY_FULL_DISPATCH_RUNTIMES, so this suite runs cleanly against the pre-#1054
  // baseline instead of throwing — the fallback is what makes the loop below RED there (every
  // 6ae5374b render keeps "Runtime adapter facts" for every runtime including claude/codex).
  const fullDispatchRuntimes = Array.isArray(routing.RECOVERY_FULL_DISPATCH_RUNTIMES)
    ? routing.RECOVERY_FULL_DISPATCH_RUNTIMES : ['grok', 'cursor'];
  assert(Array.isArray(fullDispatchRuntimes) && fullDispatchRuntimes.length > 0,
    'F/setup: the generator names which runtimes keep the always-loaded dispatch carrier');
  assert(!fullDispatchRuntimes.includes('claude') && !fullDispatchRuntimes.includes('codex'),
    'F/setup: claude and codex are not always-loaded dispatch carriers (they reload Next/Finalize instead) — got '
      + JSON.stringify(fullDispatchRuntimes));

  for (const row of routing.RUNTIME_RECOVERY_SURFACES) {
    const rendered = routing.renderCompactRecoveryPrompt(row.runtime, row.forge);
    const keepsDispatch = fullDispatchRuntimes.includes(row.runtime);
    // Full-dispatch carriers keep the KW-RUNTIME-DISPATCH region marker around the real content;
    // a deferred (claude/codex) render may legitimately drop the marker along with the content it
    // would otherwise delimit (a consumer keying on the marker must not mistake a one-sentence
    // pointer for the dispatch contract itself) — so the marker's PRESENCE is only required when
    // this runtime is a full-dispatch carrier, not unconditionally.
    assert(rendered.includes('KW-RUNTIME-DISPATCH-START') === keepsDispatch,
      `F/render[${row.runtime}/${row.forge}]: the dispatch region marker is present only for the always-loaded carrier (keepsDispatch=${keepsDispatch})`);
    assert(/Runtime adapter facts/.test(rendered) === keepsDispatch,
      `F/render[${row.runtime}/${row.forge}]: runtime-adapter-facts embed matches this runtime's carrier role (keepsDispatch=${keepsDispatch})`);
    if (!keepsDispatch) {
      assert(/already carries the full runtime dispatch contract|does not restate/i.test(rendered),
        `F/render[${row.runtime}/${row.forge}]: a deferred-note pointer explains why dispatch is not restated`);
    }
  }
  // grok and cursor render their persistent compact carrier through kaola-workflow-global-
  // contract.js's renderContract(), not through RUNTIME_RECOVERY_SURFACES (which only lists the
  // tracked Claude/Codex files) — cover them explicitly, and assert they KEEP the dispatch content
  // exactly once (not zero, not duplicated).
  for (const runtime of fullDispatchRuntimes) {
    const rendered = routing.renderCompactRecoveryPrompt(runtime, 'github', { globalContract: 'placeholder contract text' });
    const dispatchStarts = (rendered.match(/KW-RUNTIME-DISPATCH-START/g) || []).length;
    assert(dispatchStarts === 1,
      `F/render[${runtime}/global-contract]: the dispatch block appears exactly once, not zero and not duplicated — got ${dispatchStarts}`);
    assert(/Runtime adapter facts/.test(rendered),
      `F/render[${runtime}/global-contract]: the always-loaded carrier keeps the runtime-adapter-facts overlay`);
  }
}

// ===========================================================================
// Group G — negative: 7 roles, no schema field added, no tool-allowlist drift beyond what E's
// pinned capability_requirements already implies. This suite itself introduces no new
// word-count/ratio/length prompt-quality gate (see the concept-anchor style of Groups B-D above,
// which ban NAMED retired literals, not prose shape).
// ===========================================================================
assert(ROLES.length === 7, 'G: exactly 7 roles remain — got ' + ROLES.length);
assert(JSON.stringify([...ROLES].sort()) === JSON.stringify([
  'code-explorer', 'code-reviewer', 'doc-updater', 'implementer', 'investigator',
  'knowledge-lookup', 'tdd-guide',
]), 'G: exactly the named 7 roles remain — got ' + JSON.stringify([...ROLES].sort()));

for (const role of ROLES) {
  const contract = behavior.roles[role];
  const expectedTools = new Set(['Read', 'Grep', 'Glob']);
  if (contract.capability_requirements.includes('scoped_write')) { expectedTools.add('Write'); expectedTools.add('Edit'); }
  if (contract.capability_requirements.includes('command_execution')) expectedTools.add('Bash');
  if (contract.capability_requirements.includes('external_research')) { expectedTools.add('WebSearch'); expectedTools.add('WebFetch'); }
  const claudeProfile = profiles.find(p => p.runtime === 'claude' && p.role === role);
  const toolsLine = (claudeProfile.content.match(/^tools:\s*(\[[^\]]*\])$/m) || [])[1];
  const actualTools = toolsLine ? new Set(JSON.parse(toolsLine)) : new Set();
  assert(JSON.stringify([...actualTools].sort()) === JSON.stringify([...expectedTools].sort()),
    `G[${role}]: native Claude tool allowlist is derived from capability_requirements, no drift — got ${JSON.stringify([...actualTools].sort())}`);
}

// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error(`role-redesign test FAILED (${passed} passed, ${failed} failed)`);
  process.exit(1);
}
console.log(`role-redesign test passed (${passed} assertions). [authority: ${generator.BEHAVIOR_SOURCE}]`);
