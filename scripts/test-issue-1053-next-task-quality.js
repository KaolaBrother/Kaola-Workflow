#!/usr/bin/env node
'use strict';

// Issue #1053: the Next skeleton gets exactly two semantic additions (task-clarity guidance in
// "Intake, freshness, claim, and resume"; a proportional explain/verify judgment sentence in
// "Run it"), plus a new docs/task-quality.md linked from docs/README.md. Everything else is
// reused. TEST CUSTODY ONLY — no production code here.
//
// This suite locates the two additions by SEMANTIC ANCHOR (a set of small regex fragments that
// must co-occur within one sentence-ish window), not by pinning the author's exact sentence, so
// it survives a rewrap or rephrase that preserves meaning. It reads the skeleton and every
// downstream render (18 routing surfaces' `next` slice + 5 additive editions x 3 forges, all
// rendered PURELY IN-MEMORY via each edition's own exported renderCommand — no disk writes, so
// this suite never touches the shared main checkout's gitignored edition trees) at RUN TIME, so
// it pins the producer -> consumer seam rather than a private copy of the wording.
//
// Non-goal guards (negative pins) are scoped to the exact named artifact: the GENERATED_SURFACES
// registry, the Mission List four-field table, the init/finalize skeletons' absence of any "what
// to remember" step, and claim.js's CLI-flag surface. This suite does NOT pin the
// behavior-contracts.json role roster against a historical commit (a prior revision did, via
// `git show <baseline-sha>:...`, and a supervisor review correctly flagged that as wrong for a
// PERMANENT suite: a shallow clone, an unpacked source tree, or ordinary future history rewrites
// would break it, and pinning a role COUNT would freeze legitimate future role additions as a
// false #1053 non-goal forever after). `scripts/generate-agent-profiles.js --check` — already a
// standing step in both `test:kaola-workflow:claude` and `:claude:full` — is the correct, history-
// independent guard against a role profile drifting from its own authority; #1053 does not need a
// second one. See "Revision" in kaola-workflow/bundle-1053/.cache/acceptance-red.md.

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('  FAIL: ' + msg);
}
function eq(actual, expected, msg) {
  assert(actual === expected, msg + '\n    expected: ' + JSON.stringify(expected) + '\n    actual:   ' + JSON.stringify(actual));
}

// ---------------------------------------------------------------------------
// Section extraction — pure. Grabs the body of an H2 section by its literal heading text (the
// heading names come straight from the issue's own acceptance surface: "Intake, freshness,
// claim, and resume" and "Run it" are the sections the issue names, not wording this suite
// invents), up to the next H2 or end of file.
// ---------------------------------------------------------------------------
function section(md, headingText) {
  const lines = String(md).split('\n');
  const start = lines.findIndex(l => l.trim() === '## ' + headingText);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start + 1, end).join('\n');
}

// sentenceWindows — pure. Splits on sentence-ending punctuation only (not ';'/':' — the real
// prose here uses both mid-clause), then returns every adjacent 1- and 2-sentence window so a
// concept spanning a sentence boundary is still found without requiring the whole section to
// match as one blob (which would be indistinguishable from "the section merely exists").
function sentenceWindows(text) {
  const sentences = String(text || '').replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const windows = sentences.slice();
  for (let i = 0; i < sentences.length - 1; i++) windows.push(sentences[i] + ' ' + sentences[i + 1]);
  return windows;
}

// conceptPresent — pure detector. True when SOME window matches every fragment regex. Each
// fragment is a small, paraphrase-tolerant anchor for one piece of the concept's meaning, not
// the author's literal clause.
function conceptPresent(text, fragments) {
  const windows = sentenceWindows(text);
  return windows.some(w => fragments.every(re => re.test(w)));
}

// ---------------------------------------------------------------------------
// Addition 1 detectors — the five meanings the issue requires inside "Intake, freshness, claim,
// and resume". Each is proven both POSITIVE (against a hand-written compliant boundary sentence)
// and NEGATIVE (a believable near-miss that drops exactly the clause the fragment set exists to
// catch), so an always-true or always-false detector cannot hide in this suite.
// ---------------------------------------------------------------------------
// REVISED after supervisor review: negation must be ATTACHED to the verb/object it governs
// (bounded proximity, no sentence-ending punctuation between them) rather than checked as a
// standalone token anywhere in the window. A standalone `/\b(?:not|never|no)\b/i` token was
// measured to produce a FALSE GREEN: "no other option remains except to demand a fixed
// requirement format" contains an unrelated "no" and still satisfied the old fragment set even
// though its meaning is inverted. Synonym sets were also measured and widened where a legitimate
// paraphrase of the real landed text (e.g. "already settled", "consult the documentation",
// "ordinary prose") produced a FALSE RED. Both classes of probe are recorded in
// kaola-workflow/bundle-1053/.cache/acceptance-red.md under "Revision".
//
// This is still a mechanical approximation, not a meaning oracle: a sufficiently determined
// adversarial rewrite (e.g. negating the concept in a WHOLLY different sentence structure the
// fragments do not anticipate) can still slip through. Where that residual risk could not be
// closed cheaply, it is left as a known limitation rather than chased with an ever-larger regex.
const ADDITION_1_CLAUSES = {
  'a_continue_when_clear_no_fixed_format': {
    fragments: [
      /already\s+(?:clear|settled|known|established|determined)/i,
      /authoriz/i,
      /\bcontinue\b/i,
      // Negation attached to its governed target within one clause (no '.', '?', '!', ';'
      // between them) — "do not"/"never"/"need not" IMMEDIATELY governing the format/rewrite
      // clause, not merely present somewhere else in the sentence.
      /\b(?:do(?:es)?\s+not|never|need\s+not)\b[^.?!;]{0,60}(?:fixed\s+requirement\s+format|rewrite\s+the\s+issue)/i,
    ],
    boundary: 'When the outcome and its acceptance basis are already clear and authorized, continue: do not demand a fixed requirement format.',
    nearMiss: 'When the outcome and its acceptance basis are already clear and authorized, continue by restating the requirement in the standard format.',
  },
  'b_investigate_before_asking': {
    fragments: [
      /(?:read\s+the\s+code|reproduc\w*|look\s+(?:it|something)\s+up|consult(?:s|ed|ing)?\s+the\s+documentation|check(?:s|ed|ing)?\s+the\s+documentation|search(?:es|ed|ing)?\s+for\s+it)/i,
      /implementation\s+detail/i,
      /authoriz\w*\s+scope/i,
      /\bjudgment\b/i,
    ],
    boundary: 'When a fact is missing, read the code, reproduce, or look it up first; implementation detail inside an authorized scope is your own judgment.',
    nearMiss: 'When a fact is missing, ask the user first; implementation detail inside an authorized scope is decided by committee.',
  },
  'c_ask_only_unresolved_scope': {
    fragments: [
      /\bask\b/i,
      /\bonly\b/i,
      /unresolved\s+choice/i,
      /(?:scope|authoriz\w*|acceptance)/i,
      /(?:does\s+not\s+depend|independent\s+of\s+the\s+answer|regardless\s+of\s+the\s+answer)/i,
    ],
    boundary: 'Ask the user only about an unresolved choice that would change scope, authorization, or the meaning of acceptance, and keep doing the investigation that does not depend on the answer.',
    nearMiss: 'Ask the user about anything unclear, and pause all investigation until the answer arrives.',
  },
  'd_maintain_issue_plain_language': {
    fragments: [
      /authoriz\w*\s+to\s+maintain/i,
      /observable\s+outcome/i,
      /verification\s+basis/i,
      /(?:plain|natural|ordinary)\s+(?:language|prose)/i,
      /already\s+sufficient/i,
    ],
    boundary: 'When authorized to maintain the issue, express the observable outcome and its verification basis in plain language, and cite what is already sufficient.',
    nearMiss: 'When authorized to maintain the issue, attach a formal specification document instead of describing the outcome.',
  },
  'e_research_design_scope_only': {
    fragments: [
      /research\s+or\s+design/i,
      /\bonly\b/i,
      // Negation attached: "do not"/"never" ... "authorize" ... the forbidden object, all within
      // one clause. The OLD fragment set checked "does not authoriz" and "implementation" as
      // SEPARATE, unattached fragments, which a measured adversarial sentence exploited: "A
      // research or design request that does not authorize anything at all is meaningless; it
      // authorizes only implementation..." satisfied every old fragment while meaning the
      // opposite. Requiring the object to fall inside the SAME negated clause closes that.
      /\b(?:do(?:es)?\s+not|never)\b[^.?!;]{0,60}authoriz\w*[^.?!;]{0,60}(?:implementation|forge\s+writ\w*|claim)/i,
    ],
    boundary: 'A research or design request authorizes research or design only; it does not authorize product implementation, forge writes, or a claim.',
    nearMiss: 'A research or design request authorizes research, design, and a first implementation commit.',
  },
};

// Addition 2 — the proportional explain/verify judgment sentence inside "Run it". The polarity
// gate ("never/does not/do not lowers acceptance") was already attached-by-construction (a single
// bigram, not a separate negation token), so the measured MAY-lower adversarial was already
// correctly rejected; only the synonym set needed widening (does/do not lower, not just never).
const ADDITION_2 = {
  fragments: [
    /explain/i,
    /communicat\w*/i,
    /verify/i,
    /behavioral\s+impact/i,
    /existing\s+requirements/i,
    /(?:never|does\s+not|do\s+not)\s+lowers?\s+(?:the\s+)?acceptance/i,
  ],
  boundary: 'Decide how much to explain by what communication needs, and how much to verify by behavioral impact and the existing requirements; a short explanation or a small change never lowers acceptance, and sufficient existing evidence may be cited.',
  nearMiss: 'A small change always needs the full explanation and a brand-new verification pass regardless of behavioral impact.',
};

console.log('== test-issue-1053-next-task-quality ==');

// Mutation self-tests: every detector must accept its own compliant boundary and reject its own
// near-miss, proving the fragment set is neither vacuous (always true) nor unsatisfiable.
for (const [name, spec] of Object.entries(ADDITION_1_CLAUSES)) {
  assert(conceptPresent(spec.boundary, spec.fragments), 'mutation boundary: ' + name + ' detector accepts its own compliant sentence');
  assert(!conceptPresent(spec.nearMiss, spec.fragments), 'mutation RED: ' + name + ' detector rejects its own near-miss sentence');
}
assert(conceptPresent(ADDITION_2.boundary, ADDITION_2.fragments), 'mutation boundary: addition-2 detector accepts its own compliant sentence');
assert(!conceptPresent(ADDITION_2.nearMiss, ADDITION_2.fragments), 'mutation RED: addition-2 detector rejects its own near-miss sentence');

// Additional adversarial probes from supervisor review, encoded permanently so a future
// regression back to a loose/unattached negation token (or a narrower synonym set) is caught
// automatically rather than relying on a one-off manual measurement.
{
  // FALSE-RED probes: legitimate synonymous rewrites of the real landed clauses must still match.
  const synonymRewrites = [
    ['a: "already settled" instead of "already clear"',
      'When the intended outcome and its acceptance basis are already settled and authorized, continue: do not demand a fixed requirement format or rewrite the issue to restate it.',
      ADDITION_1_CLAUSES.a_continue_when_clear_no_fixed_format.fragments],
    ['b: "consult the documentation" instead of "look it up"',
      'When a fact is missing, consult the documentation first; implementation detail inside an authorized scope is your own judgment.',
      ADDITION_1_CLAUSES.b_investigate_before_asking.fragments],
    ['c: "independent of the answer" instead of "does not depend on the answer"',
      'Ask the user only about an unresolved choice that would change scope, authorization, or the meaning of acceptance, and keep doing the investigation that is independent of the answer.',
      ADDITION_1_CLAUSES.c_ask_only_unresolved_scope.fragments],
    ['d: "ordinary prose" instead of "plain language"',
      'When authorized to maintain the issue, express the observable outcome and its verification basis in ordinary prose, and cite what is already sufficient.',
      ADDITION_1_CLAUSES.d_maintain_issue_plain_language.fragments],
    ['addition-2: "does not lower" instead of "never lowers"',
      'Decide how much to explain by what communication needs, and how much to verify by behavioral impact and the existing requirements; a short explanation or a small change does not lower acceptance.',
      ADDITION_2.fragments],
  ];
  for (const [label, text, fragments] of synonymRewrites) {
    assert(conceptPresent(text, fragments), 'false-RED regression guard: legitimate synonym rewrite still matches (' + label + ')');
  }

  // FALSE-GREEN probes: an inverted/adversarial sentence that merely contains the fragment WORDS
  // (elsewhere, unattached to the negation) must NOT match.
  const adversarialInversions = [
    ['a: unrelated "no" elsewhere in the sentence',
      'When the outcome is already clear and authorized, continue: no other option remains except to demand a fixed requirement format and rewrite the issue every time.',
      ADDITION_1_CLAUSES.a_continue_when_clear_no_fixed_format.fragments],
    ['e: supervisor example — polarity flipped to DOES authorize',
      'A research or design request DOES authorize implementation, forge writes, and a claim.',
      ADDITION_1_CLAUSES.e_research_design_scope_only.fragments],
    ['e: "does not authorize" present but governing an unrelated clause',
      'A research or design request that does not authorize anything at all is meaningless; it authorizes only implementation, forge writes, and a claim.',
      ADDITION_1_CLAUSES.e_research_design_scope_only.fragments],
    ['addition-2: supervisor example — MAY lower acceptance',
      'A short explanation or a small change MAY lower acceptance, and existing evidence is never sufficient.',
      ADDITION_2.fragments],
  ];
  for (const [label, text, fragments] of adversarialInversions) {
    assert(!conceptPresent(text, fragments), 'false-GREEN regression guard: inverted/adversarial sentence correctly rejected (' + label + ')');
  }
}

// ---------------------------------------------------------------------------
// 1) Locate the additions in the skeleton itself.
// ---------------------------------------------------------------------------
const gen = require('./generate-routing-surfaces.js');
const { SLOTS, SPLICES } = require('../templates/routing/slots.js');
const NEXT_SKELETON_PATH = path.join(REPO, 'templates', 'routing', 'next.skeleton.md');
assert(fs.existsSync(NEXT_SKELETON_PATH), 'templates/routing/next.skeleton.md exists');
const skeletonText = fs.existsSync(NEXT_SKELETON_PATH) ? fs.readFileSync(NEXT_SKELETON_PATH, 'utf8') : '';

const intakeSection = section(skeletonText, 'Intake, freshness, claim, and resume');
assert(intakeSection !== null, 'skeleton: "## Intake, freshness, claim, and resume" section is present');
for (const [name, spec] of Object.entries(ADDITION_1_CLAUSES)) {
  assert(intakeSection !== null && conceptPresent(intakeSection, spec.fragments),
    'skeleton Intake section carries addition-1 clause (' + name + ')');
}

const runItSection = section(skeletonText, 'Run it');
assert(runItSection !== null, 'skeleton: "## Run it" section is present');
assert(runItSection !== null && conceptPresent(runItSection, ADDITION_2.fragments),
  'skeleton Run it section carries the addition-2 proportional explain/verify sentence');

// Existing rule this issue must not disturb: PASS invalidation by mutation, literally present in
// the skeleton already (pinned as an exact string because it is EXISTING text this suite is not
// asking anyone to author, not a new passage whose wording is this suite's own invention).
assert(runItSection !== null && runItSection.includes('any mutation invalidates prior PASS evidence for changed bytes'),
  'skeleton Run it section still carries the existing PASS-invalidation-by-mutation rule');

// ---------------------------------------------------------------------------
// 2) Every one of the 18 GENERATED_SURFACES rows for topic `next` (6 files: command+skill x
//    github/gitlab/gitea) carries the same passages after rendering.
// ---------------------------------------------------------------------------
const nextRows = gen.GENERATED_SURFACES.filter(r => r.topic === 'next');
eq(nextRows.length, 6, 'GENERATED_SURFACES carries exactly six `next` rows (3 forges x command+skill)');

const ir = { slots: SLOTS, splices: SPLICES };
for (const row of nextRows) {
  let rendered;
  try {
    rendered = gen.renderSkeleton(gen.loadSkeleton(row.skeleton, row.topic), { surface_type: row.surface_type, forge: row.forge }, ir);
  } catch (e) {
    assert(false, 'render ' + row.path + ' did not throw: ' + e.message);
    continue;
  }
  const intake = section(rendered, 'Intake, freshness, claim, and resume');
  const runIt = section(rendered, 'Run it');
  assert(intake !== null, row.path + ': Intake section renders');
  assert(runIt !== null, row.path + ': Run it section renders');
  for (const [name, spec] of Object.entries(ADDITION_1_CLAUSES)) {
    assert(intake !== null && conceptPresent(intake, spec.fragments),
      row.path + ': renders addition-1 clause (' + name + ')');
  }
  assert(runIt !== null && conceptPresent(runIt, ADDITION_2.fragments),
    row.path + ': renders addition-2 proportional explain/verify sentence');
  assert(runIt !== null && runIt.includes('any mutation invalidates prior PASS evidence for changed bytes'),
    row.path + ': renders the existing PASS-invalidation-by-mutation rule');
}

// The Intake section is NOT byte-identical whole-section across forges (it carries a
// SLOT:nx-scripts-resolver fence that legitimately resolves a different claim.js basename per
// forge, plus a gitea-only REGION), so a whole-section byte-identity assertion would be false on
// legitimate content. The strongest TRUE thing is paragraph-level: the addition passages
// themselves are plain prose with no SLOT/SPLICE/REGION inside them, so the exact paragraph
// carrying all five addition-1 clauses (as found in the github/command canonical render) must
// appear byte-for-byte in every other `next` render's Intake section, and likewise for addition-2
// in Run it. This catches a REGION silently dropping the passage on one surface_type/forge while
// tolerating the legitimate per-forge variation elsewhere in the same section.
function paragraphs(text) {
  return String(text || '').split(/\n\s*\n/);
}
function findParagraphMatchingAll(text, fragments) {
  for (const p of paragraphs(text)) {
    if (fragments.every(re => re.test(p))) return p;
  }
  return null;
}
{
  const allAddition1Fragments = Object.values(ADDITION_1_CLAUSES).flatMap(spec => spec.fragments);
  const canonicalRow = nextRows.find(r => r.surface_type === 'command' && r.forge === 'github');
  assert(!!canonicalRow, 'a github/command `next` row exists to anchor the byte-parity check');
  if (canonicalRow) {
    const canonicalRendered = gen.renderSkeleton(gen.loadSkeleton(canonicalRow.skeleton, canonicalRow.topic),
      { surface_type: canonicalRow.surface_type, forge: canonicalRow.forge }, ir);
    const canonicalIntake = section(canonicalRendered, 'Intake, freshness, claim, and resume');
    const addition1Paragraph = canonicalIntake && findParagraphMatchingAll(canonicalIntake, allAddition1Fragments);
    assert(!!addition1Paragraph, 'the addition-1 paragraph (all five clauses in one paragraph) is found in the github/command canonical render');

    const canonicalRunIt = section(canonicalRendered, 'Run it');
    const addition2Paragraph = canonicalRunIt && findParagraphMatchingAll(canonicalRunIt, ADDITION_2.fragments);
    assert(!!addition2Paragraph, 'the addition-2 paragraph is found in the github/command canonical render');

    if (addition1Paragraph || addition2Paragraph) {
      for (const row of nextRows) {
        if (row.path === canonicalRow.path) continue;
        const rendered = gen.renderSkeleton(gen.loadSkeleton(row.skeleton, row.topic), { surface_type: row.surface_type, forge: row.forge }, ir);
        if (addition1Paragraph) {
          assert(rendered.includes(addition1Paragraph),
            row.path + ': carries the addition-1 paragraph byte-for-byte identical to the github/command canonical render');
        }
        if (addition2Paragraph) {
          assert(rendered.includes(addition2Paragraph),
            row.path + ': carries the addition-2 paragraph byte-for-byte identical to the github/command canonical render');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3) Every additive edition (opencode, kimi, grok, cursor, zcode) x forge (github, gitlab,
//    gitea) — the Next command render carries the same passages. Rendered PURELY IN-MEMORY via
//    each edition's own exported renderCommand(canonContent, ...): no --write, no disk writes, so
//    this suite never touches the main checkout's gitignored `.opencode`/`.kimi`/etc. trees (which
//    a spawned `--write` would resolve TREE_ROOT to when this file is run from a linked
//    worktree — see sync-opencode-edition.js's own TREE_ROOT comment). This exercises the exact
//    transform function `--write` calls, just without the filesystem side effect.
// ---------------------------------------------------------------------------
const EDITIONS = [
  { name: 'opencode', mod: './sync-opencode-edition.js', call: (sync, canon, forge) => sync.renderCommand(canon, forge, 'workflow-next.md') },
  { name: 'kimi', mod: './sync-kimi-edition.js', call: (sync, canon, forge) => sync.renderCommand(canon, 'workflow-next', forge) },
  { name: 'grok', mod: './sync-grok-edition.js', call: (sync, canon, forge) => sync.renderCommand(canon, 'workflow-next', forge) },
  { name: 'cursor', mod: './sync-cursor-edition.js', call: (sync, canon, forge) => sync.renderCommand(canon, 'workflow-next', forge) },
  { name: 'zcode', mod: './sync-zcode-edition.js', call: (sync, canon, forge) => sync.renderCommand(canon, 'workflow-next', forge) },
];
const FORGES = ['github', 'gitlab', 'gitea'];
const nextCommandCanon = {};
for (const forge of FORGES) {
  nextCommandCanon[forge] = gen.renderSkeleton(
    gen.loadSkeleton('next.skeleton.md', 'next'), { surface_type: 'command', forge }, ir);
}

for (const edition of EDITIONS) {
  let sync;
  try {
    sync = require(edition.mod);
  } catch (e) {
    assert(false, edition.name + ': ' + edition.mod + ' requires cleanly: ' + e.message);
    continue;
  }
  for (const forge of FORGES) {
    let out;
    try {
      out = edition.call(sync, nextCommandCanon[forge], forge);
    } catch (e) {
      assert(false, edition.name + '/' + forge + ': renderCommand did not throw: ' + e.message);
      continue;
    }
    const intake = section(out, 'Intake, freshness, claim, and resume');
    const runIt = section(out, 'Run it');
    assert(intake !== null, edition.name + '/' + forge + ': rendered Next carries the Intake section');
    assert(runIt !== null, edition.name + '/' + forge + ': rendered Next carries the Run it section');
    for (const [name, spec] of Object.entries(ADDITION_1_CLAUSES)) {
      assert(intake !== null && conceptPresent(intake, spec.fragments),
        edition.name + '/' + forge + ': rendered Next carries addition-1 clause (' + name + ')');
    }
    assert(runIt !== null && conceptPresent(runIt, ADDITION_2.fragments),
      edition.name + '/' + forge + ': rendered Next carries the addition-2 proportional explain/verify sentence');
  }
}

// Compact-recovery prompts (renderCompactRecoveryPrompt) render from compact-recovery.skeleton.md,
// a SEPARATE skeleton that only says to reload the installed Next prompt — it does not embed the
// Intake/Run-it passages at all. Recorded here rather than pinned, per the brief's own instruction
// to say so and not pin what is not true.
{
  const claudeRecovery = gen.renderCompactRecoveryPrompt('claude', 'github');
  assert(!conceptPresent(claudeRecovery, ADDITION_1_CLAUSES.a_continue_when_clear_no_fixed_format.fragments),
    'compact-recovery prompt does NOT embed the Next addition passages (confirms it is a separate skeleton, not a gap in coverage)');
}

// ---------------------------------------------------------------------------
// 4) docs/task-quality.md exists, is non-empty, is linked from docs/README.md, and covers the
//    three required concepts (as concepts, not fixed sentences).
// ---------------------------------------------------------------------------
const TASK_QUALITY_PATH = path.join(REPO, 'docs', 'task-quality.md');
const README_PATH = path.join(REPO, 'docs', 'README.md');
assert(fs.existsSync(TASK_QUALITY_PATH), 'docs/task-quality.md exists');
const taskQualityText = fs.existsSync(TASK_QUALITY_PATH) ? fs.readFileSync(TASK_QUALITY_PATH, 'utf8') : '';
assert(taskQualityText.trim().length > 0, 'docs/task-quality.md is non-empty');

assert(fs.existsSync(README_PATH), 'docs/README.md exists');
const readmeText = fs.existsSync(README_PATH) ? fs.readFileSync(README_PATH, 'utf8') : '';
assert(/\]\(task-quality\.md\)/.test(readmeText), 'docs/README.md links to task-quality.md');

const DOC_CONCEPTS = {
  'wrong_premise_to_original_issue_comment': {
    fragments: [/wrong\s+premise/i, /(?:original\s+(?:issue|requirement)|issue'?s?\s+comment)/i],
    boundary: 'A wrong premise in the original requirement gets a correction comment on the original issue.',
    nearMiss: 'A wrong premise is quietly fixed by the Agent without telling anyone.',
  },
  'proven_defect_fix_plus_regression_test': {
    fragments: [/proven\s+defect/i, /regression\s+test/i],
    boundary: 'A proven defect gets a fix plus a meaningful regression test.',
    nearMiss: 'A proven defect gets a fix; testing is optional.',
  },
  'no_learning_loop_no_memory_write_no_auto_rule_rewrite': {
    fragments: [/no\s+learning\s+loop/i, /personal[- ]memory/i, /no\s+automatic\s+rewrite/i],
    boundary: 'There is no learning loop, no automatic rewrite of owner instructions, and no personal-memory write.',
    nearMiss: 'The Agent keeps a running personal-memory diary and rewrites owner instructions automatically after every run.',
  },
};
for (const [name, spec] of Object.entries(DOC_CONCEPTS)) {
  assert(conceptPresent(spec.boundary, spec.fragments), 'mutation boundary: doc concept (' + name + ') detector accepts its own compliant sentence');
  assert(!conceptPresent(spec.nearMiss, spec.fragments), 'mutation RED: doc concept (' + name + ') detector rejects its own near-miss sentence');
  assert(conceptPresent(taskQualityText, spec.fragments), 'docs/task-quality.md covers concept: ' + name);
}

// ---------------------------------------------------------------------------
// 5) Negative pins — non-goals scoped to the exact artifact.
// ---------------------------------------------------------------------------

// No new generated topic or surface: the registry stays 18 rows, topics next/init/finalize only.
eq(gen.GENERATED_SURFACES.length, 18, 'GENERATED_SURFACES stays at 18 rows (no new topic/surface added for #1053)');
eq(Object.keys(gen.TOPICS).sort().join(','), 'finalize,init,next', 'TOPICS stays exactly {finalize,init,next}');

// No new role profile: NOT pinned here against a historical commit (see the file-header comment
// and kaola-workflow/bundle-1053/.cache/acceptance-red.md "Revision" for why a `git show
// <baseline-sha>` runtime dependency was removed after supervisor review). #1053's own scope
// (templates/routing/next.skeleton.md + docs/task-quality.md) never touches
// templates/agents/behavior-contracts.json, and `node scripts/generate-agent-profiles.js --check`
// — already a standing step in both `test:kaola-workflow:claude` and `:claude:full` — is the
// correct, history-independent guard should a role ever drift from its own authority.

// No new Mission List field: the four-field table and "Three writes only" remain in the skeleton.
{
  const missionSection = section(skeletonText, 'Write the mission list');
  assert(missionSection !== null, 'skeleton: "## Write the mission list" section is present');
  const required = ['| field | content | written |', '| `item`', '| `status`', '| `dispatched`', '| `result`', 'Three writes only'];
  for (const token of required) {
    assert(missionSection !== null && missionSection.includes(token),
      'Mission List section still carries: ' + JSON.stringify(token));
  }
  // Exactly four field rows — no fifth field snuck in.
  const fieldRows = (missionSection || '').split('\n').filter(l => /^\|\s*`(?:item|status|dispatched|result)`/.test(l.trim()));
  eq(fieldRows.length, 4, 'Mission List table has exactly four field rows (item, status, dispatched, result)');
}

// No new required step in init.skeleton.md or finalize.skeleton.md about "what to remember".
//
// REVISED after supervisor review: a prior version banned the bare words remember / memoriz* /
// "lessons learned" ANYWHERE in either file. That is broader than the actual non-goal (#1053's own
// wording: "no routine 'anything to remember?' step and no learning phase added to init/finalize")
// and risks a false RED on ordinary, unrelated prose — e.g. "Remember to run the tests" or a
// code comment mentioning "the #700 collision-suffix lesson" (both occur, harmlessly, in this
// repository's OTHER files today; a bare-word ban would have broken the moment either idiom showed
// up in init/finalize too). Narrowed to the actual shape of the non-goal: a STEP-like structure —
// a heading naming the concept, a routine question form ("anything to remember?" / "what should
// you remember"), or an imperative instruction to write/log/record something to a memory or
// learning-loop artifact — rather than the bare words in any context. This is judged pinnable
// mechanically at that narrower, structural level without freezing prose: it is proven below to
// accept ordinary "remember"/"lesson" prose and reject only the actual step shapes.
{
  const MEMORY_STEP_RE = new RegExp([
    // "anything (you want/need) to remember/learn" — the routine prompt form the issue names.
    '\\banything\\s+(?:\\w+\\s+){0,3}(?:remember|learn)\\b',
    '\\bwhat\\s+(?:should|would)\\s+(?:you\\s+|we\\s+)?remember\\b',
    // an imperative directing something be written/logged to a memory or learning-loop artifact.
    '\\b(?:write|record|save|log|note)\\w*\\b[^.?!]{0,40}\\b(?:to\\s+)?(?:the\\s+)?'
      + '(?:personal[- ]?memory|memory\\s+file|learning\\s+(?:loop|log)|lessons?[- ]learned\\s+file)\\b',
  ].join('|'), 'i');
  const MEMORY_HEADING_RE = /^#{2,4}[^\n]{0,80}\b(?:what\s+to\s+remember|learning\s+loop|memory\s+write|lessons?\s+learned)\b/im;
  const introducesMemoryStep = text => MEMORY_STEP_RE.test(text) || MEMORY_HEADING_RE.test(text);

  // Mutation self-test: the narrowed detector must NOT flag ordinary unrelated prose (the false
  // RED this revision exists to fix)...
  const falsePositiveGuards = [
    'Remember to run the tests before you finalize.',
    '// #700 collision-suffix lesson) so the in-place base restore is fine.',
    'merge-lane close-deferral must not rest ENTIRELY on the caller remembering --keep-worktree.',
    'Pick a memorable, short branch name.',
  ];
  for (const text of falsePositiveGuards) {
    assert(!introducesMemoryStep(text), 'mutation boundary: ordinary "remember"/"lesson" prose is NOT flagged: ' + JSON.stringify(text));
  }
  // ...and it MUST catch the actual non-goal shapes (the false GREEN a bare-word-only scan would
  // still catch, kept here so the narrowing does not silently disarm the guard).
  const actualViolations = [
    '## What to remember\n\nBefore closing, note anything worth keeping.',
    'Ask yourself: is there anything to remember before closing?',
    'What should you remember from this run?',
    'Log lessons learned to the personal-memory file before you stop.',
    '### Learning loop\n\nUpdate the learning loop with anything new.',
  ];
  for (const text of actualViolations) {
    assert(introducesMemoryStep(text), 'mutation RED: the actual non-goal shape is flagged: ' + JSON.stringify(text));
  }

  for (const file of ['init.skeleton.md', 'finalize.skeleton.md']) {
    const p = path.join(REPO, 'templates', 'routing', file);
    assert(fs.existsSync(p), file + ' exists');
    const text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    assert(!introducesMemoryStep(text), file + ' introduces no "what to remember"/learning-loop/memory-write step');
  }
}

// No new claim.js CLI flag for this issue. Derived from the CURRENT source (not a hand-typed
// guess list): every `args.<field>` / `args['<field>']` access claim.js itself performs, none of
// which may name a memory/learning/personal-rule concept.
{
  const claimPath = path.join(REPO, 'scripts', 'kaola-workflow-claim.js');
  assert(fs.existsSync(claimPath), 'scripts/kaola-workflow-claim.js exists');
  const claimText = fs.existsSync(claimPath) ? fs.readFileSync(claimPath, 'utf8') : '';
  const fieldRe = /args(?:\.([A-Za-z_][A-Za-z0-9_]*)|\['([a-zA-Z0-9-]+)'\])/g;
  const fields = new Set();
  let m;
  while ((m = fieldRe.exec(claimText))) fields.add(m[1] || m[2]);
  assert(fields.size > 0, 'claim.js CLI-flag scan found at least one args.* access (scan is not vacuous)');
  const MEMORY_FLAG_RE = /remember|memory|learn|personal.?rule|note.?to.?self/i;
  const hits = [...fields].filter(f => MEMORY_FLAG_RE.test(f));
  eq(hits.length, 0, 'claim.js carries no memory/learning/personal-rule-shaped CLI flag: ' + JSON.stringify(hits));
}

// The global workflow contract's own copy of the "never claim unexecuted UAT" rule must still be
// present and unmodified (this is the actual home of that rule; next.skeleton.md references it
// only through "the loaded machine-global workflow contract" — see the evidence file for why this
// pin is bound here rather than to next.skeleton.md's own bytes).
{
  const globalContractPath = path.join(REPO, 'templates', 'global', 'kaola-workflow-global.md');
  assert(fs.existsSync(globalContractPath), 'templates/global/kaola-workflow-global.md exists');
  const globalText = fs.existsSync(globalContractPath) ? fs.readFileSync(globalContractPath, 'utf8') : '';
  assert(globalText.includes('Never claim an unexecuted environment, device, service, or user acceptance check passed.'),
    'the global workflow contract still carries the never-claim-unexecuted-UAT rule verbatim');
  assert(skeletonText.includes('the loaded machine-global workflow contract'),
    'next.skeleton.md First Principles paragraph still references the loaded machine-global workflow contract (the connective tissue to the UAT rule above)');
}

// docs/task-quality.md itself restates the PASS-invalidation and never-claim-unexecuted-UAT rules
// (this is the actual location where the issue's brief expected these to be reachable from Next
// guidance, since the Next skeleton only cross-references the global contract rather than embedding
// its text) — checked as concepts.
{
  assert(conceptPresent(taskQualityText, [/PASS/i, /invalidat\w*/i, /mutation/i]),
    'docs/task-quality.md restates the PASS-invalidation-by-mutation rule');
  assert(conceptPresent(taskQualityText, [/unexecuted/i, /(?:environment|device|service|user.acceptance)/i, /never/i]),
    'docs/task-quality.md restates the never-claim-unexecuted-UAT rule');
}

if (failed > 0) {
  console.error('\ntest-issue-1053-next-task-quality: ' + failed + ' assertion(s) FAILED (' + passed + ' passed).');
  process.exit(1);
}
console.log('test-issue-1053-next-task-quality: all ' + passed + ' assertions passed.');
