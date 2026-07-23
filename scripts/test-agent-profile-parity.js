#!/usr/bin/env node
'use strict';

// #422.2: agent-profile md↔toml token-pin parity. For each agents/<name>.md that has a .toml twin
// triple (codex/gitlab/gitea), any "feature token" present in the .md MUST also appear in ALL THREE
// .toml twins. Goes RED when a feature paragraph is added to a .md without mirroring the token into
// the toml profiles (the #404 planner-gap class). GREEN at HEAD (#413 landed write_set_granularity
// into the three workflow-planner.toml twins). This is a forge-neutral regression guard run in the
// claude chain (and pinned by all four validate-*-contracts.js, #422.3).

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Curated feature tokens. A token is only enforced for a profile when it APPEARS in that .md, so an
// unused token never causes a false RED. Keep only tokens that are GREEN at HEAD (present in the .md
// AND in all three twins) — add a new token here when a feature paragraph is mirrored into the tomls.
const FEATURE_TOKENS = [
  'write_set_granularity',
  'main-session-gate',
  'simulate-kaola-workflow-walkthrough.js',
  // #463 Slice 6 (AC11 note): the synthesizer's non-lowerable reasoning floor — present in
  // agents/synthesizer.md, so this enforces its three .toml twins carry it (md↔toml parity coverage
  // for the new write-overlap convergence role).
  'REASONING_FLOOR_ROLES',
  // #495 (n3-result-routing-prose): indeterminate classifier verdict token — present in
  // agents/workflow-planner.md escalate-routing paragraph, enforces all three .toml twins carry it.
  'target_set_indeterminate',
  // #513 (n1-impl-513-planner-heuristic): speculative-open-eligible shaping rubric — distinctive
  // substring of the authoring paragraph (shape a node whose sole unsatisfied predecessor is a
  // high-probability-pass gate — now read OR write, #596/#597). Present in
  // agents/workflow-planner.md, so this enforces all three .toml twins carry the rubric (md↔toml
  // parity for the #439 authoring lever).
  'unsatisfied predecessor is a high-probability-pass gate',
  // #596/#597 (n3-rubric): write-speculation eligibility — a leg-contained write node whose declared
  // set is exactly resolvable, PROTECTED-free, and not the sink can now speculate too; on a gate
  // fail its leg/evidence are torn down unconditionally (the keep-or-discard asymmetry vs. reads).
  // Present in agents/workflow-planner.md, so this enforces all three .toml twins carry the
  // write-eligibility discipline (md↔toml parity for the #596-class authoring lever).
  'DISCARD-ONLY',
  // #547 (D-547-01): the planner's "record the validation command once" authoring lever — present in
  // agents/workflow-planner.md, so this enforces all three .toml twins carry the validation_command /
  // validation_test_consumes ## Meta guidance (md↔toml parity for the Stage-2 record-once discipline).
  'validation_command',
  // #559 (D-542-01 prose freshness): the co-open-default-on kill-switch token — present in the D-419-01
  // scheduler-default-posture paragraph of agents/workflow-planner.md, so this enforces all three .toml
  // twins carry the #542 "disjoint-write antichains co-open BY DEFAULT; serial only on KAOLA_PARALLEL_WRITES=0"
  // framing (md↔toml parity that locks the stale "co-schedule under lane containment" wording from returning).
  'KAOLA_PARALLEL_WRITES',
  // #607 (n3-planner-prose): gate instrumentation is provisioned upstream, never authored by the
  // gate itself — present in agents/workflow-planner.md's main-session-gate authoring paragraph, so
  // this enforces all three .toml twins carry the rule (md↔toml parity for the #607 authoring lever).
  'the gate never authors or deletes files',
  // #634 (n3-register): the metric-optimizer's mandatory scoped-revert safety rule — present in
  // agents/metric-optimizer.md's ratchet-protocol reject step, so this enforces its three .toml
  // twins carry it (md↔toml parity coverage for the new bounded metric-ratchet role).
  'git reset --hard',
  // #729: the child carry-forward declaration — the re-plan child names, per inherited finding
  // uid, the node that repairs it. Present in agents/workflow-planner.md's schema-2 ## Meta
  // authoring paragraph, so this enforces all three .toml twins carry it (md↔toml parity for a
  // lever whose absence makes the replan transaction refuse the whole child).
  'finding_owners',
  'wait_budget_minutes',
  'planner_override',
  'difficulty alone is not evidence',
  'never inflate a budget to hide a wedged agent',
  'semantic dependency and verification boundaries',
  // #767: the spine plan-form authoring lever — the planner authors plan_form: spine (vs the
  // default dag) with expansion-point milestone nodes whose interior frontier is composed at run
  // time. Present in agents/workflow-planner.md's progressive-elaboration section, so this enforces
  // all three .toml twins carry the spine grammar (md↔toml parity for the #767 authoring lever).
  'plan_form',
  'expansion-point',
];

// codex tree is the canonical agents/ source for the toml triple.
const TOML_TREES = [
  'plugins/kaola-workflow/agents',
  'plugins/kaola-workflow-gitlab/agents',
  'plugins/kaola-workflow-gitea/agents',
];

function read(p) {
  try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; }
}

const CODEX_ROLE_SCHEMA_FIELDS = [
  'description', 'developer_instructions', 'name', 'nickname_candidates',
];

function codexRoleSchema(source) {
  const instructionRe = /^developer_instructions\s*=\s*\"\"\"([\s\S]*?)\"\"\"\s*(?:\r?\n|$)/gm;
  const instructionMatches = [...String(source).matchAll(instructionRe)];
  let outside = '';
  let cursor = 0;
  for (const match of instructionMatches) {
    outside += source.slice(cursor, match.index);
    cursor = match.index + match[0].length;
  }
  outside += source.slice(cursor);
  const fields = instructionMatches.map(() => 'developer_instructions');
  const violations = [];
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(source)) {
    violations.push('raw TOML control character');
  }
  if (source.includes('\r')) violations.push('non-LF TOML bytes');
  if (String(source).includes('\\')) violations.push('backslash anywhere in managed TOML');
  for (const [index, line] of outside.split(/\r?\n/).entries()) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    const table = line.match(/^\s*(\[\[?.*?\]\]?)\s*(?:#.*)?$/);
    if (table) {
      violations.push(`line ${index + 1}: table ${table[1]}`);
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=/);
    if (assignment) {
      fields.push(assignment[1]);
      continue;
    }
    violations.push(`line ${index + 1}: noncanonical top-level syntax ${JSON.stringify(line.trim())}`);
  }
  return {
    fields: fields.sort(),
    instructions: instructionMatches.length === 1 ? instructionMatches[0][1] : null,
    violations,
  };
}

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

const mdDir = path.join(root, 'agents');
const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));

for (const md of mdFiles) {
  const base = md.slice(0, -'.md'.length);
  // Only enforce profiles that have a .toml twin in ALL THREE trees.
  const tomlPaths = TOML_TREES.map(t => t + '/' + base + '.toml');
  const tomlContents = tomlPaths.map(read);
  if (tomlContents.some(c => c === null)) continue; // no full twin set → not a parity target
  const mdText = read('agents/' + md);
  if (mdText === null) continue;
  for (const token of FEATURE_TOKENS) {
    if (!mdText.includes(token)) continue; // token not used by this profile → nothing to mirror
    tomlPaths.forEach((tp, idx) => {
      assert(tomlContents[idx].includes(token),
        '#422.2: token "' + token + '" is in agents/' + md + ' but MISSING from ' + tp +
        ' (md↔toml feature drift — mirror the feature paragraph token into the .toml twin)');
    });
  }
}

// Inherited Codex profiles omit both runtime-strength keys. The tier remains declarative metadata
// in the schema/planner; a named role profile must not override the current parent session pair.
for (const tree of TOML_TREES) {
  const profiles = fs.readdirSync(path.join(root, tree)).filter(f => f.endsWith('.toml')).sort();
  assert(profiles.length === 16, `${tree} must contain exactly 16 role profiles, got ${profiles.length}`);
  for (const profile of profiles) {
    const content = read(`${tree}/${profile}`) || '';
    const schema = codexRoleSchema(content);
    assert(JSON.stringify(schema.fields) === JSON.stringify(CODEX_ROLE_SCHEMA_FIELDS),
      `${tree}/${profile} must use only supported Codex custom-agent top-level fields`);
    assert(schema.violations.length === 0,
      `${tree}/${profile} must use the closed canonical top-level TOML grammar: ${schema.violations.join('; ')}`);
    assert(!/^model\s*=/m.test(content), `${tree}/${profile} must inherit model by omitting the key`);
    assert(!/^model_reasoning_effort\s*=/m.test(content),
      `${tree}/${profile} must inherit reasoning effort by omitting the key`);
  }
}

// The closed-role grammar oracle must itself see TOML spellings that defeated the original
// column-zero bare-key scan. These mutations never touch tracked files.
{
  const canonical = read(`${TOML_TREES[0]}/implementer.toml`) || '';
  const mutations = [
    canonical.replace(/^developer_instructions/m, '"behavior_contract_version" = 2\ndeveloper_instructions'),
    canonical.replace(/^developer_instructions/m, '  model = "gpt-5.6-sol"\ndeveloper_instructions'),
    canonical.replace(/^developer_instructions/m, '[shadow] # valid TOML table\ndeveloper_instructions'),
    canonical.replace(/^description/m, 'name = "implementer"\ndescription'),
    canonical.replace('Purpose:', 'Purpose:\n- invalid TOML escape: \\q'),
    canonical.replace('Purpose:', 'Purpose:\rX'),
    `# raw control \u0001\n${canonical}`,
  ];
  for (const [index, mutation] of mutations.entries()) {
    const schema = codexRoleSchema(mutation);
    assert(schema.violations.length > 0
        || JSON.stringify(schema.fields) !== JSON.stringify(CODEX_ROLE_SCHEMA_FIELDS),
      `closed Codex role grammar mutation ${index + 1} must fail`);
  }
}
for (const profile of fs.readdirSync(path.join(root, TOML_TREES[0])).filter(f => f.endsWith('.toml'))) {
  const triple = TOML_TREES.map(tree => read(`${tree}/${profile}`));
  assert(triple.every(content => content === triple[0]), `${profile} must be byte-identical across all three Codex trees`);
}

// Canonical reviewer profiles are generated from versioned behavior plus closed runtime adapters.
// This block is deliberately self-contained so mutations exercise the real generator without
// touching tracked files.
let reviewerGenerator = null;
try {
  reviewerGenerator = require('./generate-reviewer-profiles.js');
  assert(true, 'canonical reviewer profile generator loads');
} catch (error) {
  assert(false, `canonical reviewer profile generator must load: ${error.message}`);
}

if (reviewerGenerator) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const behaviorContracts = reviewerGenerator.loadBehaviorContracts(root);
  const runtimeAdapters = reviewerGenerator.loadRuntimeAdapters(root);
  const rendered = reviewerGenerator.renderProfiles(behaviorContracts, runtimeAdapters);
  const byPath = new Map(rendered.map(profile => [profile.path, profile]));

  const repositoryErrors = reviewerGenerator.checkGeneratedProfiles(root, {
    behaviorContracts,
    runtimeAdapters,
  });
  assert(repositoryErrors.length === 0,
    `tracked reviewer profiles must equal canonical generation: ${repositoryErrors.join('; ')}`);

  assert(rendered.length === 14, `reviewer generator must render exactly 14 profiles, got ${rendered.length}`);
  assert(JSON.stringify([...byPath.keys()].sort()) === JSON.stringify([...reviewerGenerator.EXPECTED_OUTPUT_PATHS].sort()),
    'reviewer generator output set must be complete and closed');

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-reviewer-profiles-'));
  const writeRendered = profiles => {
    for (const profile of profiles) {
      const target = path.join(tempRoot, profile.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, profile.content, 'utf8');
    }
  };
  writeRendered(rendered);

  const baselineErrors = reviewerGenerator.checkGeneratedProfiles(tempRoot, {
    behaviorContracts,
    runtimeAdapters,
  });
  assert(baselineErrors.length === 0,
    `freshly rendered reviewer profiles must check clean: ${baselineErrors.join('; ')}`);

  const mutationPath = rendered[0].path;
  const originalMutationTarget = fs.readFileSync(path.join(tempRoot, mutationPath), 'utf8');
  const mutationIndex = originalMutationTarget.indexOf('reviewer-behavior-core:start');
  const oneByteMutation = originalMutationTarget.slice(0, mutationIndex)
    + (originalMutationTarget[mutationIndex] === 'r' ? 'R' : 'r')
    + originalMutationTarget.slice(mutationIndex + 1);
  fs.writeFileSync(path.join(tempRoot, mutationPath), oneByteMutation, 'utf8');
  assert(reviewerGenerator.checkGeneratedProfiles(tempRoot, { behaviorContracts, runtimeAdapters })
    .some(error => error.includes('generated_profile_drift')),
  'one-byte generated reviewer profile mutation must fail');
  let oneByteHashRejected = false;
  try { reviewerGenerator.verifyResolvedProfileHash(oneByteMutation); } catch (error) {
    oneByteHashRejected = /mismatch/.test(error.message);
  }
  assert(oneByteHashRejected,
    'one-byte mutation outside the self-hash slot must invalidate resolved_profile_hash');
  fs.writeFileSync(path.join(tempRoot, mutationPath), originalMutationTarget, 'utf8');

  const omittedPath = rendered[rendered.length - 1].path;
  const omittedContent = fs.readFileSync(path.join(tempRoot, omittedPath), 'utf8');
  fs.unlinkSync(path.join(tempRoot, omittedPath));
  assert(reviewerGenerator.checkGeneratedProfiles(tempRoot, { behaviorContracts, runtimeAdapters })
    .some(error => error.includes('generated_profile_missing')),
  'omitted reviewer edition output must fail');
  fs.writeFileSync(path.join(tempRoot, omittedPath), omittedContent, 'utf8');

  const badAdapter = clone(runtimeAdapters);
  badAdapter.adapters.codex.prompt = 'Use runtime-specific judgment prose.';
  let freeFormAdapterRejected = false;
  try { reviewerGenerator.validateRuntimeAdapters(badAdapter); } catch (error) {
    freeFormAdapterRejected = /unknown|closed|prompt/.test(error.message);
  }
  assert(freeFormAdapterRejected, 'free-form reviewer adapter field must fail closed');

  const contradictory = clone(behaviorContracts);
  contradictory.roles['code-reviewer'].description =
    'Report uncertain concerns and treat zero findings as a failed review.';
  let contradictionRejected = false;
  try { reviewerGenerator.validateBehaviorContracts(contradictory); } catch (error) {
    contradictionRejected = /contradict/.test(error.message);
  }
  assert(contradictionRejected, 'reviewer description that contradicts its behavior core must fail');

  const changedCore = clone(behaviorContracts);
  changedCore.roles['code-reviewer'].sections[0].lines[0] += ' Changed without regeneration.';
  assert(reviewerGenerator.checkGeneratedProfiles(tempRoot, {
    behaviorContracts: changedCore,
    runtimeAdapters,
  }).some(error => error.includes('generated_profile_drift')),
  'changed canonical behavior without regeneration must fail');

  // A policy line can legitimately contain 64 zeroes. Finalization must replace the exact
  // resolved_profile_hash slot, not the first equal-looking zero run in the rendered profile.
  const zeroCollisionContracts = clone(behaviorContracts);
  zeroCollisionContracts.roles['code-reviewer'].sections[0].lines.push(
    `- Hash collision sentinel used by generation tests: ${'0'.repeat(64)}`);
  const zeroCollisionProfiles = reviewerGenerator.renderProfiles(zeroCollisionContracts, runtimeAdapters);
  for (const profile of zeroCollisionProfiles) {
    assert(reviewerGenerator.verifyResolvedProfileHash(profile.content),
      `${profile.path} finalizes the exact resolved hash slot when earlier zero runs exist`);
    assert(!/^resolved_profile_hash\s*(?::|=)\s*"?0{64}"?\s*$/m.test(profile.content),
      `${profile.path} must not leave the resolved hash slot zeroed`);
  }

  for (const token of ['\\q', '\\n']) {
    const unsafeTomlContracts = clone(behaviorContracts);
    unsafeTomlContracts.roles['code-reviewer'].sections[0].lines.push(`- Literal pattern token: ${token}`);
    let unsafeTomlRejected = false;
    try { reviewerGenerator.renderProfiles(unsafeTomlContracts, runtimeAdapters); } catch (error) {
      unsafeTomlRejected = /toml.*(?:backslash|lexical|unsafe)/i.test(error.message);
    }
    assert(unsafeTomlRejected,
      `reviewer generator must reject ${JSON.stringify(token)} so TOML decoding cannot change cross-runtime instruction bytes`);
  }

  for (const [field, value] of [
    ['description', 'Description with \\q'],
    ['nickname_candidates', ['Nickname with \\q']],
  ]) {
    const unsafeMetadataContracts = clone(behaviorContracts);
    unsafeMetadataContracts.roles['code-reviewer'][field] = value;
    let unsafeMetadataRejected = false;
    try { reviewerGenerator.renderProfiles(unsafeMetadataContracts, runtimeAdapters); } catch (error) {
      unsafeMetadataRejected = /toml.*(?:backslash|lexical|unsafe)/i.test(error.message);
    }
    assert(unsafeMetadataRejected,
      `reviewer generator must reject TOML-unsafe metadata in ${field}`);
  }

  for (const pinKey of ['model', 'model_reasoning_effort']) {
    const codexPath = rendered.find(profile => profile.runtime === 'codex').path;
    const codexOriginal = fs.readFileSync(path.join(tempRoot, codexPath), 'utf8');
    fs.writeFileSync(path.join(tempRoot, codexPath), `${pinKey} = "forbidden"\n${codexOriginal}`, 'utf8');
    const errors = reviewerGenerator.checkGeneratedProfiles(tempRoot, { behaviorContracts, runtimeAdapters });
    assert(errors.some(error => error.includes('codex_model_pin_forbidden')),
      `Codex reviewer ${pinKey} pin must fail inherit-by-omission`);
    fs.writeFileSync(path.join(tempRoot, codexPath), codexOriginal, 'utf8');
  }

  const duplicateHashProfile = rendered[0].content.replace(
    /^(resolved_profile_hash:\s*[0-9a-f]{64})$/m,
    '$1\n$1',
  );
  let duplicateHashRejected = false;
  try { reviewerGenerator.verifyResolvedProfileHash(duplicateHashProfile); } catch (error) {
    duplicateHashRejected = /unique|multiple|resolved_profile_hash/.test(error.message);
  }
  assert(duplicateHashRejected, 'duplicate reviewer resolved-profile self-hash field must fail');

  for (const profile of rendered) {
    assert(profile.content.endsWith('\n') && !profile.content.includes('\r'),
      `${profile.path} must use LF and exactly one final newline`);
    assert(reviewerGenerator.verifyResolvedProfileHash(profile.content),
      `${profile.path} resolved_profile_hash must bind every rendered byte`);
    assert(!reviewerGenerator.PROVENANCE_BAN.test(profile.content),
      `${profile.path} must contain no issue or decision provenance`);
    if (profile.runtime === 'codex') {
      const schema = codexRoleSchema(profile.content);
      assert(JSON.stringify(schema.fields) === JSON.stringify(CODEX_ROLE_SCHEMA_FIELDS),
        `${profile.path} must use only Codex-supported custom-agent top-level fields`);
      assert(schema.violations.length === 0,
        `${profile.path} must use the closed canonical top-level TOML grammar`);
      assert(schema.instructions !== null
          && /^resolved_profile_hash:\s*[0-9a-f]{64}$/m.test(schema.instructions),
        `${profile.path} must keep its resolved identity inside developer_instructions`);
      assert(!/^model\s*=/m.test(profile.content), `${profile.path} must omit Codex model`);
      assert(!/^model_reasoning_effort\s*=/m.test(profile.content),
        `${profile.path} must omit Codex model_reasoning_effort`);
    }
  }

  for (const role of reviewerGenerator.ROLES) {
    const roleProfiles = rendered.filter(profile => profile.role === role);
    const cores = roleProfiles.map(profile => reviewerGenerator.extractBehaviorCore(profile.content));
    assert(cores.every(core => core === cores[0]),
      `${role} normalized behavior core must be byte-identical across Claude and Codex renders`);
    const behaviorHashes = new Set(roleProfiles.map(profile => profile.behavior_contract_hash));
    assert(behaviorHashes.size === 1, `${role} must have one normalized behavior_contract_hash`);
    const codexProfiles = roleProfiles.filter(profile => profile.runtime === 'codex');
    assert(codexProfiles.every(profile => profile.content === codexProfiles[0].content),
      `${role} Codex profiles must be forge-neutral and byte-identical`);
  }

  // Falsification discovery and closure are different jobs: discovery establishes the whole admitted
  // counterexample frontier over the declared surface in one pass; closure settles the prior frontier
  // plus the supplied repair delta instead of re-running an unrestricted whole-surface search. Without
  // that rule the role may stop at the first refutation and then rediscover a different latent blocker
  // on every repair cycle, serializing real defects. The rule is versioned behavior, so it must live in
  // the behavior source and reach every generated runtime surface.
  {
    const verifier = behaviorContracts.roles['adversarial-verifier'];
    const section = (verifier.sections || []).find(entry => entry && entry.id === 'discovery-closure');
    assert(!!section,
      'adversarial-verifier behavior contract must declare a discovery-closure section');
    const sectionLines = section && Array.isArray(section.lines) ? section.lines : [];
    const sectionText = sectionLines.join(' ');
    for (const token of [
      'review phase',
      'first successful counterexample',
      'repair delta',
      'review_scope_expanded',
      'scope lineage',
    ]) {
      assert(sectionText.includes(token),
        `adversarial-verifier discovery-closure policy must carry token ${JSON.stringify(token)}`);
    }
    const verifierSurfaces = [
      'agents/adversarial-verifier.md',
      ...TOML_TREES.map(tree => `${tree}/adversarial-verifier.toml`),
    ];
    for (const surface of verifierSurfaces) {
      const content = read(surface) || '';
      assert(section ? content.includes(`## ${section.heading}`) : false,
        `${surface} must carry the generated discovery-closure heading`);
      for (const line of sectionLines) {
        assert(content.includes(line),
          `${surface} must carry generated discovery-closure line ${JSON.stringify(line.slice(0, 56))}`);
      }
      assert(!reviewerGenerator.PROVENANCE_BAN.test(content),
        `${surface} must contain no issue or decision provenance`);
    }
  }

  const manifest = reviewerGenerator.manifestForProfiles(rendered);
  assert(manifest.schema_version === 1 && manifest.profiles.length === rendered.length,
    'reviewer manifest must cover the complete deterministic render set');
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

// Dispatch assertions must describe inherited parent runtime strength plus declarative role metadata.
// These retired phrases contradict the behavior they sit beside and must not return.
const adaptiveNodeAssertions = read('scripts/test-adaptive-node.js') || '';
for (const phrase of ['standalone pinned profile pair', 'profile-pinned Sol/medium',
  'pinned role profile', 'conflicts with the role profile is surfaced fail-closed']) {
  assert(!adaptiveNodeAssertions.includes(phrase),
    `scripts/test-adaptive-node.js must not retain retired static-profile wording ${JSON.stringify(phrase)}`);
}

for (const file of ['agents/workflow-planner.md', ...TOML_TREES.map(t => t + '/workflow-planner.toml')]) {
  const content = read(file) || '';
  const normalizedContent = content.replace(/\s+/g, ' ');
  for (const token of ['wait_budget_minutes', 'planner_override', 'through 720 minutes',
    'nondelegable', 'optimizer conflict', 'difficulty alone is not evidence',
    'never inflate a budget to hide a wedged agent']) {
    assert(content.includes(token), `${file} must carry planner wait-budget contract token ${JSON.stringify(token)}`);
  }
  for (const token of ['high-risk filesystem, concurrency, persistence, and provenance work',
    'semantic dependency and verification boundaries', 'independently testable',
    'large coherent nodes remain legal', 'file-count, line-count, complexity, or diff-size threshold']) {
    assert(normalizedContent.includes(token), `${file} must carry semantic-boundary planner guidance token ${JSON.stringify(token)}`);
  }
}

if (failed > 0) {
  console.error('agent-profile parity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('agent-profile parity tests passed (' + passed + ' assertions)');
}
