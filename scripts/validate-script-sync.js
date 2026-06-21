#!/usr/bin/env node
// Drift guard: ensures scripts shared by both Claude Code (scripts/) and Codex
// (plugins/kaola-workflow/scripts/) trees stay byte-identical. Fails CI when
// out of sync. See issue #36.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const claudeDir = path.join(repoRoot, 'scripts');
const codexDir = path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts');

// Scripts present in BOTH trees that must stay in sync. Tree-specific files
// are intentionally excluded:
//
//   simulate-workflow-walkthrough.js (Claude) and simulate-kaola-workflow-walkthrough.js
//     (Codex) — these test DIFFERENT surfaces and must NEVER be synced. The Claude
//     variant is a 4700-line end-to-end workflow walkthrough that exercises the
//     compact-context.js hook (Claude-only). The Codex variant is a focused 1100-line
//     test of Codex-specific claim semantics (runtime tagging, parallel bootstrap,
//     roadmap sync). A previous "sync everything" pass (commit 308f747) clobbered
//     the Codex variant with the Claude one; do not repeat that.
//
//   kaola-workflow-compact-context.js — NOT Claude-only (issue #401 Part 3 corrected this
//     formerly-stale rationale). A plugin-local copy EXISTS at
//     plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js and is byte-identical to
//     the canonical script; the gitlab/gitea forges carry rename-normalized ports
//     (kaola-{forge}-workflow-compact-context.js). The whole family is now covered: canonical
//     <-> codex in the BYTE_IDENTICAL_GROUPS below, the forge ports in RENAME_NORMALIZED_FAMILIES.
//     It is therefore NOT in COMMON_SCRIPTS to avoid duplicate enforcement (the byte group already
//     enforces the claude<->codex parity COMMON_SCRIPTS would).
//
//   validate-kaola-workflow-contracts.js (Codex-only) — Codex contract validator;
//     the Claude validator is validate-workflow-contracts.js (in the allowlist below).
//
//   install-codex-agent-profiles.js (Codex-only) — installs .codex/agents/ TOML
//     profiles; not used by the Claude pack.
//
// Hook files that must stay byte-identical across every install surface are
// checked below. `hooks/hooks.json` is intentionally excluded because each forge
// points at its own compact-context script name.
const COMMON_SCRIPTS = [
  'kaola-workflow-claim.js',
  'kaola-workflow-active-folders.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-closure-audit.js',
  'kaola-workflow-repair-state.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'release-surface-drift.js',
  'validate-workflow-contracts.js',
  // issue #227: the adaptive-path plan validator. Byte-identical Claude<->Codex
  // (it require()s the forge-specific classifier, so GitLab/Gitea carry renamed ports).
  'kaola-workflow-plan-validator.js',
  // #242 Part B Stage A: adaptive aggregator scripts (next-action, commit-node)
  'kaola-workflow-next-action.js',
  'kaola-workflow-commit-node.js',
  // #255 adaptive handoff: planner→first-node mechanical transition
  'kaola-workflow-adaptive-handoff.js',
  // #272 adaptive node: plan-run owns the per-node lifecycle
  'kaola-workflow-adaptive-node.js',
  // #281 parallel-batch: concurrent node dispatch aggregator
  'kaola-workflow-parallel-batch.js',
  // #266 AC-B: Codex agent-profile freshness preflight (true 4-tree byte-identical)
  'kaola-workflow-codex-preflight.js',
  // #266 AC-C: workflow-tasks.json generator (base-named claude↔codex pair; gitlab/gitea
  // are edition-named ports — kaola-{forge}-workflow-task-mirror.js — NOT byte-synced)
  'kaola-workflow-task-mirror.js',
  // NOTE (#399): the contractor Step-8a ledger-regression guard (kaola-workflow-ledger-compare.js)
  // is FORGE-NEUTRAL but ALSO shell-resolved by the gitlab/gitea finalize SKILLs (whose contract
  // validators forbid a `plugins/kaola-workflow/scripts/` cross-tree reference), so it must ship to
  // ALL FOUR trees. It lives in the 4-tree BYTE_IDENTICAL_GROUPS below (closure-contract pattern),
  // not here — the byte group already enforces the claude↔codex parity COMMON_SCRIPTS would.
  // #407: install.sh SUPPORT_*_NAMES single-source manifest. Required by the byte-identical
  // validate-workflow-contracts.js (claude↔codex), so the codex copy must carry it too — module
  // load is side-effect-free (repoRoot is computed but no fs access until a function is called),
  // and only the claude validator (run from repo-root scripts/) ever invokes its probes.
  'kaola-workflow-install-manifest.js',
  // #432: multi-chain test runner (run-chains). Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-run-chains.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-run-chains.js',
  // #442: release aggregator CLI. Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-release.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-release.js',
  // #435: run-gap capture gate. Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-gap-sweep.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-gap-sweep.js',
  // #443: autopilot driver CLI. Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-autopilot.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-autopilot.js',
  // #456: fast-path script-owned advance. Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-fast-advance.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-fast-advance.js',
  // #457: full-path phase script-owned advance. Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-full-advance.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-full-advance.js',
  // #458: full-path Phase 4 script-owned advance. Byte-identical claude↔codex; gitlab/gitea carry
  // rename-normalized ports (kaola-{forge}-workflow-phase4-advance.js) in RENAME_NORMALIZED_FAMILIES.
  'kaola-workflow-phase4-advance.js',
];

const BYTE_IDENTICAL_GROUPS = [
  {
    label: 'pre-commit hook copies',
    files: [
      'hooks/kaola-workflow-pre-commit.sh',
      'plugins/kaola-workflow/hooks/kaola-workflow-pre-commit.sh',
      'plugins/kaola-workflow-gitlab/hooks/kaola-workflow-pre-commit.sh',
      'plugins/kaola-workflow-gitea/hooks/kaola-workflow-pre-commit.sh',
    ],
  },
  {
    label: 'closure-contract module copies',
    files: [
      'scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js',
    ],
  },
  {
    // #399: the contractor Step-8a ledger-regression guard is forge-neutral (no rename) but the
    // gitlab/gitea finalize SKILLs shell-resolve it from their OWN tree (their contract validators
    // forbid a base-tree `plugins/kaola-workflow/scripts/` reference), so it byte-ships to all four.
    label: 'ledger-compare module copies',
    files: [
      'scripts/kaola-workflow-ledger-compare.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-ledger-compare.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-ledger-compare.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-ledger-compare.js',
    ],
  },
  {
    label: 'resolve-agent-model module copies',
    files: [
      'scripts/kaola-workflow-resolve-agent-model.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js',
    ],
  },
  {
    // issue #401 Part 3: the compact-context hook's canonical<->codex pair. The script carries
    // no forge identity strings, so the codex copy is byte-identical to canonical (the gitlab/gitea
    // forge ports — kaola-{forge}-workflow-compact-context.js — are covered separately under
    // RENAME_NORMALIZED_FAMILIES because they live at a forge-renamed PATH, not a renamed body).
    // This closes the live drift where the forge ports carried backticked `fast-summary.md` that
    // canonical+codex did not, and nothing guarded the family.
    label: 'compact-context base-name copies',
    files: [
      'scripts/kaola-workflow-compact-context.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-compact-context.js',
    ],
  },
  {
    label: 'subagent-dispatch-log hook copies',
    files: [
      'hooks/kaola-workflow-subagent-dispatch-log.sh',
      'plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh',
      'plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh',
      'plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh',
    ],
  },
  {
    // #376: the write-lane containment hook is byte-identical across all four trees (forge-neutral).
    label: 'write-lane hook copies',
    files: [
      'hooks/kaola-workflow-write-lane.sh',
      'plugins/kaola-workflow/hooks/kaola-workflow-write-lane.sh',
      'plugins/kaola-workflow-gitlab/hooks/kaola-workflow-write-lane.sh',
      'plugins/kaola-workflow-gitea/hooks/kaola-workflow-write-lane.sh',
    ],
  },
  {
    // issue #227: the adaptive-path cross-fork DRIFT ANCHOR. Forge-neutral constants
    // (path whitelist, plan-run command, caps, ledger enum, escalation markers, config
    // path) shared by claim/repair-state/plan-validator across all four trees. Because
    // it is byte-identical and the forks require it, a fork that hand-ports routeAdaptive
    // but forgets to mirror a constant edit fails here — catching silent fork drift.
    label: 'adaptive-schema constant copies',
    files: [
      'scripts/kaola-workflow-adaptive-schema.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
    ],
  },
  {
    // issue #266 AC-B: Codex agent-profile freshness preflight. Authored require-free
    // (only fs + path + inline regex) so it qualifies as a true 4-tree byte-identical
    // script — no edition-specific require() means no edition-specific bytes.
    label: 'codex-preflight copies',
    files: [
      'scripts/kaola-workflow-codex-preflight.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js',
    ],
  },
  {
    // issue #332: the Codex agent-profile installer ships in the 3 plugin trees only
    // (no root copy) and must not fork — schema validation + prune + manifest logic
    // is shared. Reference = codex tree.
    label: 'codex agent-profile installer copies',
    files: [
      'plugins/kaola-workflow/scripts/install-codex-agent-profiles.js',
      'plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js',
      'plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js',
    ],
  },
  // #422.1: agent-profile .toml triples — each agent's three plugin-tree .toml files
  // (codex/gitlab/gitea) must be byte-identical. Built programmatically from the codex tree's
  // agents/ directory so a new profile is auto-covered. Includes the 6 -max model variants.
  ...fs.readdirSync(path.join(repoRoot, 'plugins/kaola-workflow/agents'))
    .filter(f => f.endsWith('.toml'))
    .map(f => ({
      label: 'agent-profile toml triple (' + f + ')',
      files: [
        'plugins/kaola-workflow/agents/' + f,
        'plugins/kaola-workflow-gitlab/agents/' + f,
        'plugins/kaola-workflow-gitea/agents/' + f,
      ],
    })),
];

// issue #401 Part 3: SELF-CONTAINED rename-normalized families — forge ports that live at a
// forge-RENAMED path (kaola-{forge}-workflow-X.js) and are body-identical to a base-named
// reference after the path-rename `kaola-workflow-` -> `kaola-{forge}-workflow-` is normalized
// out. Deliberately NOT routed through edition-sync.js GENERATED_AGGREGATORS (the @generated /
// regeneration class) — these are hand-ported NON-aggregator scripts, and promoting them into
// edition generation would collide with the #407 install.sh single-source manifest plumbing and
// the deferred plan-validator promotion (#401 Part 2). This check is whole-file: it normalizes the
// reference's body for each forge and byte-compares against the committed port. `reference` is the
// base-named source; each `port` declares its forge + on-disk path.
const RENAME_NORMALIZED_FAMILIES = [
  {
    // compact-context forge ports: the script body carries no identity strings, so the
    // rename is a no-op and the ports are byte-identical to canonical — but they live at a
    // forge-renamed PATH, so they cannot ride the base-name BYTE_IDENTICAL_GROUP above.
    label: 'compact-context forge ports',
    reference: 'scripts/kaola-workflow-compact-context.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-compact-context.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-compact-context.js' },
    ],
  },
  {
    // codex-compact-resume: a 3-tree family with NO root canonical. The codex copy is the
    // reference; the gitlab/gitea ports are rename-normalized identical (the only identity
    // string is the script's own base name in the header). Brought under coverage with no
    // content edit (rename-normalized identical at HEAD).
    label: 'codex-compact-resume forge ports',
    reference: 'plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js' },
    ],
  },
  {
    // #432: run-chains multi-chain test runner forge ports. The script carries no forge identity
    // strings, so the rename-normalized ports are body-identical to canonical after the prefix
    // transform. Reference = canonical scripts/ copy.
    label: 'run-chains forge ports',
    reference: 'scripts/kaola-workflow-run-chains.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js' },
    ],
  },
  {
    // #442: release aggregator CLI forge ports. The script carries no forge-specific CLI tokens,
    // so the rename-normalized ports are body-identical to canonical after the prefix transform.
    // Reference = canonical scripts/ copy.
    label: 'release forge ports',
    reference: 'scripts/kaola-workflow-release.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js' },
    ],
  },
  {
    // #435: run-gap capture gate forge ports. The script carries no forge-specific tokens,
    // so the rename-normalized ports are body-identical to canonical after the prefix transform.
    // Reference = canonical scripts/ copy.
    label: 'gap-sweep forge ports',
    reference: 'scripts/kaola-workflow-gap-sweep.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js' },
    ],
  },
  {
    // #443: autopilot driver CLI forge ports. The script carries no forge-specific tokens,
    // so the rename-normalized ports are body-identical to canonical after the prefix transform.
    // Reference = canonical scripts/ copy.
    label: 'autopilot forge ports',
    reference: 'scripts/kaola-workflow-autopilot.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-autopilot.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-autopilot.js' },
    ],
  },
  {
    // #456: fast-advance fast-path transaction owner forge ports. The script carries no
    // forge-specific tokens (command/skill route names are KW-split), so the rename-normalized
    // ports are body-identical to canonical. Reference = canonical scripts/ copy.
    label: 'fast-advance forge ports',
    reference: 'scripts/kaola-workflow-fast-advance.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-fast-advance.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-fast-advance.js' },
    ],
  },
  {
    // #457: full-advance full-path phase transaction owner forge ports. The script carries no
    // forge-specific tokens (command/skill route names are KW-split), so the rename-normalized
    // ports are body-identical to canonical. Reference = canonical scripts/ copy.
    label: 'full-advance forge ports',
    reference: 'scripts/kaola-workflow-full-advance.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-full-advance.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-full-advance.js' },
    ],
  },
  {
    // #458: phase4-advance Phase 4 transaction owner forge ports. Rename-normalized per edition
    // (the lone repair-state require rewrites; routes are KW-split). Reference = canonical scripts/ copy.
    label: 'phase4-advance forge ports',
    reference: 'scripts/kaola-workflow-phase4-advance.js',
    ports: [
      { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-phase4-advance.js' },
      { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-phase4-advance.js' },
    ],
  },
];

// #418.1: the per-forge config/hooks.json (codex/gitlab/gitea plugin trees). These are
// rename-normalized: identical EXCEPT the SessionStart compact-resume command path, which carries the
// forge-renamed script base name (kaola-{forge}-workflow-codex-compact-resume.js). Every OTHER
// kaola-workflow-* token in the JSON is a .sh hook that STAYS base-named across all forges, so the
// generic renameNormalize() (which rewrites every kaola-workflow-<name>) cannot be used — we
// normalize ONLY the codex-compact-resume token. Reference = codex tree (the base-named source).
const CONFIG_HOOKS_FAMILY = {
  label: 'config/hooks.json forge ports',
  reference: 'plugins/kaola-workflow/config/hooks.json',
  ports: [
    { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/config/hooks.json' },
    { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/config/hooks.json' },
  ],
};
// Normalize ONLY the compact-resume script token (the sole forge-renamed string in config/hooks.json).
function normalizeConfigHooks(referenceText, forge) {
  return referenceText.replace(
    /kaola-workflow-codex-compact-resume/g,
    `kaola-${forge}-workflow-codex-compact-resume`);
}

// Normalize a base-named reference body into its forge-renamed form: every
// `kaola-workflow-<NAME>` token becomes `kaola-<forge>-workflow-<NAME>`. Bounded by a
// non-name-char lookahead so it never partial-matches a longer token or the
// `kaola-workflow/` state directory (mirrors edition-sync.js renderForgePort's rename pass).
function renameNormalize(referenceText, forge) {
  return referenceText.replace(/kaola-workflow-([a-z0-9-]+)(?![a-zA-Z0-9-])/g,
    (_m, name) => `kaola-${forge}-workflow-${name}`);
}

// #550: forge classifier module.exports SUPERSET guard. The gitlab/gitea classifiers are
// DIVERGENT hand-ports (not rename-normalized, ~757 vs ~873 lines) so they are NOT in the
// byte / rename families above. But the forge run-chains ports require() named exports from
// their forge classifier (e.g. isTransientFetchStderr — the single transient-infra surface);
// if a forge classifier OMITS a canonical-classifier export key, that name resolves to
// `undefined` and the FIRST failing chain throws `TypeError: <name> is not a function`
// at the retry gate — no receipt, the crash that hid behind the green-only path (#550).
// This guard fails CLOSED when a forge classifier's export set is not a superset of canonical's.
const FORGE_CLASSIFIER_EXPORT_SUPERSET = {
  label: 'forge classifier module.exports superset',
  canonical: 'scripts/kaola-workflow-classifier.js',
  ports: [
    { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js' },
    { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js' },
  ],
};

// #553: GENERALIZE the #550 single-classifier guard into a FAMILY over every DIVERGENT forge hand-port that
// participates in a cross-script require (claim / sink-merge / roadmap / repair-state / active-folders /
// closure-audit) — the same "a cross-required name resolves to undefined → TypeError on a failing path no
// green chain hits" class (#550) was unguarded for these. Each entry reuses the proven require()+Object.keys
// superset mechanism. `canonicalOnly` lists canonical exports that are GENUINELY edition-specific — defined
// ONLY in the GitHub canonical with no forge equivalent (e.g. `ghExec`, which the forges replace with direct
// glab/tea CLI calls; `projectHasAdaptivePlan`, canonical's consumer-detection helper the forges implement
// via isAdaptiveWorkflowState/routeAdaptive). Those names are SUBTRACTED from the superset requirement; this
// is sound because each excluded name is verified NOT cross-required by any forge script, so excluding it
// cannot re-open the #550 crash class — it only avoids forcing an undefined-symbol export.
const forgePortRef = (forge, base) => ({ forge, file: 'plugins/kaola-workflow-' + forge + '/scripts/kaola-' + forge + '-workflow-' + base + '.js' });
const forgeBothPorts = base => [forgePortRef('gitlab', base), forgePortRef('gitea', base)];
const FORGE_EXPORT_SUPERSET_FAMILY = [
  FORGE_CLASSIFIER_EXPORT_SUPERSET,
  { label: 'forge claim module.exports superset', canonical: 'scripts/kaola-workflow-claim.js', ports: forgeBothPorts('claim'), canonicalOnly: ['ghExec'] },
  { label: 'forge sink-merge module.exports superset', canonical: 'scripts/kaola-workflow-sink-merge.js', ports: forgeBothPorts('sink-merge') },
  { label: 'forge roadmap module.exports superset', canonical: 'scripts/kaola-workflow-roadmap.js', ports: forgeBothPorts('roadmap') },
  { label: 'forge repair-state module.exports superset', canonical: 'scripts/kaola-workflow-repair-state.js', ports: forgeBothPorts('repair-state'), canonicalOnly: ['projectHasAdaptivePlan'] },
  { label: 'forge active-folders module.exports superset', canonical: 'scripts/kaola-workflow-active-folders.js', ports: forgeBothPorts('active-folders') },
  { label: 'forge closure-audit module.exports superset', canonical: 'scripts/kaola-workflow-closure-audit.js', ports: forgeBothPorts('closure-audit') },
];

// Return { missingModules, driftPorts } for ONE family entry: the canonical export keys ABSENT from each
// forge port's module.exports (minus `canonicalOnly` edition-specific names). require()s each module and
// compares Object.keys (robust to ordering / comments, unlike a brittle export-block parse). A non-empty
// missingKeys for any port is a fail-closed drift. (Name kept for backward-compat; now family-generic.)
function forgeClassifierExportDrift(rootDir, fam) {
  const out = { missingModules: [], driftPorts: [] };
  let canonicalKeys;
  try {
    canonicalKeys = Object.keys(require(path.join(rootDir, fam.canonical)));
  } catch (_) {
    out.missingModules.push(fam.canonical);
    return out;
  }
  const excluded = new Set(Array.isArray(fam.canonicalOnly) ? fam.canonicalOnly : []);
  const requiredKeys = canonicalKeys.filter((k) => !excluded.has(k));
  for (const port of fam.ports) {
    let portKeys;
    try {
      portKeys = new Set(Object.keys(require(path.join(rootDir, port.file))));
    } catch (_) {
      out.missingModules.push(port.file);
      continue;
    }
    const missingKeys = requiredKeys.filter((k) => !portKeys.has(k));
    if (missingKeys.length > 0) {
      out.driftPorts.push({ file: port.file, forge: port.forge, missingKeys });
    }
  }
  return out;
}

function readOrNull(p) {
  try { return fs.readFileSync(p); } catch { return null; }
}

if (require.main === module) {
  const drift = [];
  const missing = [];

  for (const name of COMMON_SCRIPTS) {
    const a = readOrNull(path.join(claudeDir, name));
    const b = readOrNull(path.join(codexDir, name));
    if (a === null) missing.push(`scripts/${name}`);
    if (b === null) missing.push(`plugins/kaola-workflow/scripts/${name}`);
    if (a !== null && b !== null && !a.equals(b)) {
      drift.push(name);
    }
  }

  for (const group of BYTE_IDENTICAL_GROUPS) {
    const [reference, ...copies] = group.files;
    const referenceBytes = readOrNull(path.join(repoRoot, reference));
    if (referenceBytes === null) {
      missing.push(reference);
      continue;
    }
    for (const copy of copies) {
      const copyBytes = readOrNull(path.join(repoRoot, copy));
      if (copyBytes === null) {
        missing.push(copy);
      } else if (!referenceBytes.equals(copyBytes)) {
        drift.push(`${group.label}: ${copy} differs from ${reference}`);
      }
    }
  }

  // issue #401 Part 3: rename-normalized forge-port families (self-contained; not edition-sync).
  for (const fam of RENAME_NORMALIZED_FAMILIES) {
    const referenceText = readOrNull(path.join(repoRoot, fam.reference));
    if (referenceText === null) {
      missing.push(fam.reference);
      continue;
    }
    const refStr = referenceText.toString('utf8');
    for (const port of fam.ports) {
      const portText = readOrNull(path.join(repoRoot, port.file));
      if (portText === null) {
        missing.push(port.file);
        continue;
      }
      const expected = renameNormalize(refStr, port.forge);
      if (portText.toString('utf8') !== expected) {
        drift.push(`${fam.label}: ${port.file} differs from ${fam.reference} (rename-normalized for ${port.forge})`);
      }
    }
  }

  // #418.1: config/hooks.json forge ports (compact-resume token normalized; .sh tokens stay base).
  {
    const refText = readOrNull(path.join(repoRoot, CONFIG_HOOKS_FAMILY.reference));
    if (refText === null) {
      missing.push(CONFIG_HOOKS_FAMILY.reference);
    } else {
      const refStr = refText.toString('utf8');
      for (const port of CONFIG_HOOKS_FAMILY.ports) {
        const portText = readOrNull(path.join(repoRoot, port.file));
        if (portText === null) {
          missing.push(port.file);
          continue;
        }
        const expected = normalizeConfigHooks(refStr, port.forge);
        if (portText.toString('utf8') !== expected) {
          drift.push(`${CONFIG_HOOKS_FAMILY.label}: ${port.file} differs from ${CONFIG_HOOKS_FAMILY.reference} (compact-resume-normalized for ${port.forge})`);
        }
      }
    }
  }

  // #550/#553: forge module.exports SUPERSET guard FAMILY (divergent hand-ports — not byte/rename families,
  // so checked by require()d Object.keys comparison). Loops every cross-required hand-port, not just the
  // classifier, so a future cross-required export omission fails CLOSED here instead of TypeError-ing on a
  // failing path no green chain hits (the #550 crash class).
  for (const fam of FORGE_EXPORT_SUPERSET_FAMILY) {
    const res = forgeClassifierExportDrift(repoRoot, fam);
    for (const m of res.missingModules) missing.push(m);
    for (const p of res.driftPorts) {
      drift.push(`${fam.label}: ${p.file} omits canonical export(s) [${p.missingKeys.join(', ')}] — a forge script require()s these by name, so an omission TypeErrors on a failing path (#550 class)`);
    }
  }

  if (missing.length === 0 && drift.length === 0) {
    console.log(`OK: ${COMMON_SCRIPTS.length} common scripts, ${BYTE_IDENTICAL_GROUPS.length} byte-identical groups, ${RENAME_NORMALIZED_FAMILIES.length} rename-normalized families, 1 config/hooks.json family, and ${FORGE_EXPORT_SUPERSET_FAMILY.length} forge export-superset families in sync.`);
    process.exit(0);
  }

  if (missing.length > 0) {
    console.error('Missing files:');
    for (const m of missing) console.error(`  - ${m}`);
  }
  if (drift.length > 0) {
    console.error('Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):');
    for (const d of drift) console.error(`  - ${d}`);
    console.error('');
    console.error('Fix: copy the canonical version. Example:');
    console.error('  for f in ' + drift.join(' ') + '; do');
    console.error('    cp "scripts/$f" "plugins/kaola-workflow/scripts/$f"');
    console.error('  done');
  }
  process.exit(1);
}

module.exports = { COMMON_SCRIPTS, BYTE_IDENTICAL_GROUPS, RENAME_NORMALIZED_FAMILIES, renameNormalize, CONFIG_HOOKS_FAMILY, normalizeConfigHooks, FORGE_CLASSIFIER_EXPORT_SUPERSET, FORGE_EXPORT_SUPERSET_FAMILY, forgeClassifierExportDrift };
