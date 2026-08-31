#!/usr/bin/env node
// Drift guard: ensures scripts shared by both Claude Code (scripts/) and Codex
// (plugins/kaola-workflow/scripts/) trees stay byte-identical. Fails CI when
// out of sync. See issue #36.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
//   Compact recovery has no JavaScript support-script family. Claude/Codex/Grok hooks read the
//     generated runtime prompt directly; Cursor uses an always-applied project Rule.
//
//   validate-kaola-workflow-contracts.js (Codex-only) — Codex contract validator;
//     the Claude validator is validate-workflow-contracts.js (in the allowlist below).
//
//   install-codex-agent-profiles.js (Codex-only) — installs .codex/agents/ TOML
//     profiles; not used by the Claude pack.
//
// Hook files that must stay byte-identical across every install surface are
// checked below. `hooks/hooks.json` IS covered (HOOKS_JSON_FAMILY, below), via the
// same rename-normalized-token approach CONFIG_HOOKS_FAMILY already uses for the
// sibling config/hooks.json family: the only per-forge diff is the compact-context
// script token, which normalizeHooksJson() rewrites before the byte-compare.
const COMMON_SCRIPTS = [
  'kaola-workflow-claim.js',
  'kaola-workflow-active-folders.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-closure-audit.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'release-surface-drift.js',
  'validate-workflow-contracts.js',
  // #266 AC-B: Codex agent-profile freshness preflight (true 4-tree byte-identical)
  'kaola-workflow-codex-preflight.js',
  // NOTE (#399): the Step-8a mirror-regression guard (kaola-workflow-ledger-compare.js)
  // is FORGE-NEUTRAL but ALSO shell-resolved by the gitlab/gitea finalize SKILLs (whose contract
  // validators forbid a `plugins/kaola-workflow/scripts/` cross-tree reference), so it must ship to
  // ALL FOUR trees. It lives in the 4-tree BYTE_IDENTICAL_GROUPS below (closure-contract pattern),
  // not here — the byte group already enforces the claude↔codex parity COMMON_SCRIPTS would.
  // #407: install.sh SUPPORT_*_NAMES single-source manifest. Required by the byte-identical
  // validate-workflow-contracts.js (claude↔codex), so the codex copy must carry it too — module
  // load is side-effect-free (repoRoot is computed but no fs access until a function is called),
  // and only the claude validator (run from repo-root scripts/) ever invokes its probes.
  'kaola-workflow-install-manifest.js',
  // #432: multi-chain test runner (run-chains). Byte-identical claude↔codex; the gitlab/gitea
  // ports are GENERATED (edition-sync GENERATED_AGGREGATORS, promoted in #868).
  'kaola-workflow-run-chains.js',
  // #442: release aggregator CLI. Byte-identical claude↔codex; the gitlab/gitea ports are
  // GENERATED (edition-sync GENERATED_AGGREGATORS, promoted in #868).
  'kaola-workflow-release.js',
  // #435: run-gap capture gate. Byte-identical claude↔codex; the gitlab/gitea ports are GENERATED
  // (edition-sync GENERATED_AGGREGATORS, promoted in #868 — this is the script the rename-normalizer
  // pointed at a nonexistent kernel module, so generation is what makes its ports runnable at all).
  'kaola-workflow-gap-sweep.js',
  // #843: the outcome-telemetry ranking reporter. Byte-identical claude↔codex; the gitlab/gitea
  // copies keep the CANONICAL base name (see the 'telemetry-report forge copies' byte group
  // below) rather than joining RENAME_NORMALIZED_FAMILIES — the script require()s the base-named
  // Oracle Kernel, and the rename-normalizer rewrites EVERY kaola-workflow-<name> token, which
  // would point the forge ports at a `kaola-{forge}-workflow-adaptive-schema` that does not exist.
  // #868: gap-sweep required the kernel AND sat in the rename family, and fell into exactly this
  // trap — its ports were unloadable in both forges. The workaround was applied here and not there;
  // the resolution was to promote those ports to edition-sync generation, whose declared rename set
  // does not contain the kernel. This byte group stays as-is: base-named copies need no rename.
  'kaola-workflow-telemetry-report.js',
];

// The four committed copies of the Oracle Kernel, canonical FIRST. Single-sourced here because two
// different checks consume it: the working-tree byte group below, and checkCommittedKernelParity()
// (which reads git's committed blobs). edition-sync's MATERIALIZED_SHARED stays deliberately
// decoupled from this list — the materializer must keep working even if this policing changes.
const KERNEL_COPIES = [
  'scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
  'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
];

const BYTE_IDENTICAL_GROUPS = [
  // TEST INFRASTRUCTURE, four-tree. Neither of these two ships to a consumer — the install
  // manifest emits no test file — but each edition tree needs its OWN copy rather than a
  // require reaching back into scripts/, because every forge contract validator forbids a
  // `require('../…')` inside its scripts tree ("must not fall back to root or GitHub plugin
  // scripts"). That rule is the reason for the duplication, and this group is what stops the
  // duplication from becoming divergence. Both files are path-independent, so the copies are
  // exactly byte-identical with no rename normalisation.
  {
    label: 'spawn-census module copies (test infrastructure)',
    files: [
      'scripts/test-spawn-census.js',
      'plugins/kaola-workflow/scripts/test-spawn-census.js',
      'plugins/kaola-workflow-gitlab/scripts/test-spawn-census.js',
      'plugins/kaola-workflow-gitea/scripts/test-spawn-census.js',
    ],
  },
  {
    label: 'git-fixture module copies (test infrastructure)',
    files: [
      'scripts/test-git-fixture.js',
      'plugins/kaola-workflow/scripts/test-git-fixture.js',
      'plugins/kaola-workflow-gitlab/scripts/test-git-fixture.js',
      'plugins/kaola-workflow-gitea/scripts/test-git-fixture.js',
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
    // The validation runner carries no runtime- or forge-specific names, paths, or imports.
    // All install surfaces execute the same identity/reduction contract byte-for-byte.
    label: 'validation-runner module copies',
    files: [
      'scripts/kaola-workflow-validation-runner.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js',
    ],
  },
  {
    // #399: the Step-8a ledger-regression guard is forge-neutral (no rename) but the
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
    // THE CROSS-EDITION DRIFT ANCHOR. The Oracle Kernel (kaola-workflow-adaptive-schema.js) has ONE
    // canonical source in scripts/; the three forge copies are GENERATED from it
    // (`edition-sync.js --materialize-kernel`) and COMMITTED, because the Codex/forge install path
    // is `git clone` + marketplace add with NO post-clone step — a consumer executes whatever kernel
    // bytes are committed, resolved as a `__dirname` sibling of the plugin entrypoints.
    //
    // RATIONALE INVERSION (this group was RETIRED once, and that is how a real drift survived): the
    // retirement said "the three forge copies are gitignored ... one committed copy = nothing to
    // police here". That was true when written and became FALSE the moment the copies were tracked
    // again — after which appending a line to the gitea copy passed validate-script-sync,
    // `edition-sync --check` AND validate-workflow-contracts. Tracked copies are policed copies.
    // Do not retire this group again without first checking `git ls-files` for the forge copies.
    //
    // This group is the WORKING-TREE half of the anchor. It is NOT sufficient on its own: every test
    // chain begins with an `edition-sync.js --materialize-kernel` preamble that silently rewrites a
    // drifted forge copy from canonical, so by the time this check runs in-chain the working tree has
    // already been repaired and a drifted COMMIT is invisible here. checkCommittedKernelParity()
    // below is the half that reads the COMMITTED blobs and therefore cannot be laundered by the
    // preamble. Both halves are required; neither replaces the other.
    label: 'adaptive-schema kernel copies (cross-edition drift anchor)',
    files: KERNEL_COPIES,
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
    // #843: the telemetry reporter's FORGE copies. The claude↔codex pair is already enforced by
    // its COMMON_SCRIPTS entry, so this group deliberately omits the codex path and covers only
    // the two forge trees — no double enforcement, and the copies keep the canonical base name
    // (they must: the script require()s the base-named kernel).
    label: 'telemetry-report forge copies',
    files: [
      'scripts/kaola-workflow-telemetry-report.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-telemetry-report.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-telemetry-report.js',
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
  {
    // #629 bullet 2: the three plugins/*/config/agents.toml files are byte-identical at HEAD
    // (md5 579c8575...) but were previously uncovered here — only derived NAME parity was
    // checked by the forge validators. Green at HEAD; guards future canonical edits.
    label: 'config/agents.toml triple',
    files: [
      'plugins/kaola-workflow/config/agents.toml',
      'plugins/kaola-workflow-gitlab/config/agents.toml',
      'plugins/kaola-workflow-gitea/config/agents.toml',
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

// SELF-CONTAINED rename-normalized families — forge ports that live at a forge-RENAMED path
// (kaola-{forge}-workflow-X.js) and are body-identical to a base-named reference after the
// path-rename `kaola-workflow-` -> `kaola-{forge}-workflow-` is normalized out. This check is
// whole-file: it normalizes the reference's body for each forge and byte-compares against the
// committed port. `reference` is the base-named source; each `port` declares its forge + path.
//
// #868: ONE family is left here, and the reason is that it has no root canonical to generate FROM.
// Everything that had one moved to edition-sync's GENERATED_AGGREGATORS, because `renameNormalize`
// below is the WRONG tool wherever a real generator can run: it rewrites EVERY kaola-workflow-<name>
// token, including the base-named Oracle Kernel, so it made `kaola-workflow-adaptive-schema` render
// to a module that exists in no forge tree — and then passed the port that matched its own wrong
// expectation, while turning RED on the port that was actually correct. A normalizer derives what a
// port should say from a regex; a generator derives it from the declared rename set, which does not
// contain the kernel. Prefer promotion. If a family ever has to live here AND require the kernel,
// that is the case that needs the normalizer bounded, not another exemption.
const RENAME_NORMALIZED_FAMILIES = [];

// The per-forge Codex hook mappings are byte-identical: every one reads the same generated prompt
// basename from its own installed plugin root.
const CONFIG_HOOKS_FAMILY = {
  label: 'config/hooks.json forge ports',
  reference: 'plugins/kaola-workflow/config/hooks.json',
  ports: [
    { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/config/hooks.json' },
    { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/config/hooks.json' },
  ],
};
function normalizeConfigHooks(referenceText, forge) {
  return referenceText;
}

// The Claude hook mappings are byte-identical: every one reads the same generated prompt basename
// from its own plugin root.
const HOOKS_JSON_FAMILY = {
  label: 'hooks/hooks.json forge ports',
  reference: 'hooks/hooks.json',
  ports: [
    { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/hooks/hooks.json' },
    { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/hooks/hooks.json' },
  ],
};
function normalizeHooksJson(referenceText, forge) {
  return referenceText;
}

// Shared family-check primitive: compare every port in `family.ports` against
// normalizeFn(reference text, port.forge). Returns { missing, drift } (does not mutate anything or
// throw on a missing file — a fail-closed missing entry is recorded instead). Used for
// RENAME_NORMALIZED_FAMILIES, CONFIG_HOOKS_FAMILY, and HOOKS_JSON_FAMILY (below), and exported so
// tests can run the SAME check logic against a synthetic fixture tree without touching real files.
function checkNormalizedFamily(family, normalizeFn, rootDir, normalizedKind) {
  const missing = [];
  const drift = [];
  const refText = readOrNull(path.join(rootDir, family.reference));
  if (refText === null) {
    missing.push(family.reference);
    return { missing, drift };
  }
  const refStr = refText.toString('utf8');
  for (const port of family.ports) {
    const portText = readOrNull(path.join(rootDir, port.file));
    if (portText === null) {
      missing.push(port.file);
      continue;
    }
    const expected = normalizeFn(refStr, port.forge);
    if (portText.toString('utf8') !== expected) {
      drift.push(`${family.label}: ${port.file} differs from ${family.reference} (${normalizedKind || 'normalized'} for ${port.forge})`);
    }
  }
  return { missing, drift };
}

// Shared byte-identical-group-check primitive: byte-compare every copy in `group.files` (after the
// first, reference, entry) against the reference. Returns { missing, drift }. Used for
// BYTE_IDENTICAL_GROUPS (below) and exported so tests can run the SAME check logic against a
// synthetic fixture tree without touching real files.
function checkByteIdenticalGroup(group, rootDir) {
  const missing = [];
  const drift = [];
  const [reference, ...copies] = group.files;
  const referenceBytes = readOrNull(path.join(rootDir, reference));
  if (referenceBytes === null) {
    missing.push(reference);
    return { missing, drift };
  }
  for (const copy of copies) {
    const copyBytes = readOrNull(path.join(rootDir, copy));
    if (copyBytes === null) {
      missing.push(copy);
    } else if (!referenceBytes.equals(copyBytes)) {
      drift.push(`${group.label}: ${copy} differs from ${reference}`);
    }
  }
  return { missing, drift };
}

// THE COMMITTED half of the cross-edition drift anchor.
//
// Why a second check at all, when BYTE_IDENTICAL_GROUPS already byte-compares the same four files:
// every chain in package.json starts with `node scripts/edition-sync.js --materialize-kernel`, whose
// job is to overwrite each forge kernel copy from canonical. That preamble REPAIRS a drifted working
// copy in place, so a working-tree comparison downstream of it can only ever be green. What it does
// NOT touch is git — so a kernel copy that drifted in a COMMIT stays drifted, and that is exactly the
// artifact consumers get: the Codex/forge install path is `git clone` + marketplace add with no
// post-clone step. The working-tree check catches an uncommitted mistake; this one catches the
// shipped one, and only this one survives the preamble.
//
// Reads committed blob OIDs with a single `git ls-tree HEAD -- <paths>` and asserts all four are the
// same object. SKIPS (never fails) when there is no git checkout or no HEAD to read — a source
// tarball or an unborn repo has no commits to police — and the skip is always REPORTED, never silent.
// Fails closed on everything else, including a kernel copy absent from HEAD (a forge copy that is not
// committed is a fresh-clone `Cannot find module './kaola-workflow-adaptive-schema'` at every plugin
// entrypoint, which is the original reason these copies are tracked).
function checkCommittedKernelParity(rootDir) {
  const drift = [];
  let out;
  try {
    execFileSync('git', ['-C', rootDir, 'rev-parse', '--verify', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
    out = execFileSync('git', ['-C', rootDir, 'ls-tree', 'HEAD', '--', ...KERNEL_COPIES],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    return { drift, skipped: 'no git checkout or no HEAD commit to read' };
  }
  const oidByPath = new Map();
  for (const line of out.split('\n')) {
    const m = /^\d+\s+blob\s+([0-9a-f]+)\t(.+)$/.exec(line);
    if (m) oidByPath.set(m[2], m[1]);
  }
  const [canonical, ...copies] = KERNEL_COPIES;
  const canonicalOid = oidByPath.get(canonical);
  if (!canonicalOid) {
    drift.push(`committed kernel parity: ${canonical} is not committed at HEAD — the canonical Oracle Kernel must be tracked`);
    return { drift, skipped: null };
  }
  for (const copy of copies) {
    const oid = oidByPath.get(copy);
    if (!oid) {
      drift.push(`committed kernel parity: ${copy} is NOT COMMITTED at HEAD — a fresh clone's plugin entrypoints cannot resolve their kernel sibling; run \`npm run sync:editions\` and commit the copy`);
    } else if (oid !== canonicalOid) {
      drift.push(`committed kernel parity: ${copy} (blob ${oid.slice(0, 12)}) differs from ${canonical} (blob ${canonicalOid.slice(0, 12)}) IN THE COMMIT — consumers clone these bytes; run \`npm run sync:editions\` and commit the regenerated copies`);
    }
  }
  return { drift, skipped: null };
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
// participates in a cross-script require (claim / sink-merge / active-folders /
// closure-audit) — the same "a cross-required name resolves to undefined → TypeError on a failing path no
// green chain hits" class (#550) was unguarded for these. Each entry reuses the proven require()+Object.keys
// superset mechanism. `canonicalOnly` lists canonical exports that are GENUINELY edition-specific — defined
// ONLY in the GitHub canonical with no forge equivalent (e.g. `ghExec`, which the forges replace with direct
// glab/tea CLI calls). Those names are SUBTRACTED from the superset requirement; this
// is sound because each excluded name is verified NOT cross-required by any forge script, so excluding it
// cannot re-open the #550 crash class — it only avoids forcing an undefined-symbol export.
const forgePortRef = (forge, base) => ({ forge, file: 'plugins/kaola-workflow-' + forge + '/scripts/kaola-' + forge + '-workflow-' + base + '.js' });
const forgeBothPorts = base => [forgePortRef('gitlab', base), forgePortRef('gitea', base)];
const FORGE_EXPORT_SUPERSET_FAMILY = [
  FORGE_CLASSIFIER_EXPORT_SUPERSET,
  { label: 'forge claim module.exports superset', canonical: 'scripts/kaola-workflow-claim.js', ports: forgeBothPorts('claim'), canonicalOnly: ['ghExec'] },
  { label: 'forge sink-merge module.exports superset', canonical: 'scripts/kaola-workflow-sink-merge.js', ports: forgeBothPorts('sink-merge') },
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
    const res = checkByteIdenticalGroup(group, repoRoot);
    for (const m of res.missing) missing.push(m);
    for (const d of res.drift) drift.push(d);
  }

  // issue #401 Part 3: rename-normalized forge-port families (self-contained; not edition-sync).
  for (const fam of RENAME_NORMALIZED_FAMILIES) {
    const res = checkNormalizedFamily(fam, renameNormalize, repoRoot, 'rename-normalized');
    for (const m of res.missing) missing.push(m);
    for (const d of res.drift) drift.push(d);
  }

  // Codex config hook mappings are byte-identical across forge plugin roots.
  {
    const res = checkNormalizedFamily(CONFIG_HOOKS_FAMILY, normalizeConfigHooks, repoRoot, 'byte-identical');
    for (const m of res.missing) missing.push(m);
    for (const d of res.drift) drift.push(d);
  }

  // Claude hook mappings are byte-identical across forge plugin roots.
  {
    const res = checkNormalizedFamily(HOOKS_JSON_FAMILY, normalizeHooksJson, repoRoot, 'byte-identical');
    for (const m of res.missing) missing.push(m);
    for (const d of res.drift) drift.push(d);
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

  // Cross-edition drift anchor, COMMITTED half: the working-tree byte group above is repaired by the
  // chains' `edition-sync --materialize-kernel` preamble before it ever runs, so the shipped bytes are
  // checked here against git. A skip (no checkout / no HEAD) is reported, never silent.
  const committedKernel = checkCommittedKernelParity(repoRoot);
  for (const d of committedKernel.drift) drift.push(d);

  if (missing.length === 0 && drift.length === 0) {
    console.log(`OK: ${COMMON_SCRIPTS.length} common scripts, ${BYTE_IDENTICAL_GROUPS.length} byte-identical groups, ${RENAME_NORMALIZED_FAMILIES.length} rename-normalized families, 2 hooks.json families (config + hooks dir), and ${FORGE_EXPORT_SUPERSET_FAMILY.length} forge export-superset families in sync.`);
    console.log(committedKernel.skipped
      ? `    committed kernel parity: SKIPPED (${committedKernel.skipped})`
      : `    committed kernel parity: ${KERNEL_COPIES.length} Oracle Kernel copies identical at HEAD.`);
    process.exit(0);
  }

  if (missing.length > 0) {
    console.error('Missing files:');
    for (const m of missing) console.error(`  - ${m}`);
  }
  if (drift.length > 0) {
    console.error('Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):');
    for (const d of drift) console.error(`  - ${d}`);
    // The cp snippet is only meaningful for COMMON_SCRIPTS drift, whose entries are bare
    // basenames. Every other producer (byte groups, rename families, export supersets, committed
    // kernel parity) reports a full sentence carrying its OWN remediation, and splicing those into
    // `for f in ...` rendered an un-runnable command that contradicted the real fix.
    const commonDrift = drift.filter(d => COMMON_SCRIPTS.includes(d));
    if (commonDrift.length > 0) {
      console.error('');
      console.error('Fix: copy the canonical version. Example:');
      console.error('  for f in ' + commonDrift.join(' ') + '; do');
      console.error('    cp "scripts/$f" "plugins/kaola-workflow/scripts/$f"');
      console.error('  done');
    }
  }
  process.exit(1);
}

module.exports = { COMMON_SCRIPTS, BYTE_IDENTICAL_GROUPS, RENAME_NORMALIZED_FAMILIES, renameNormalize, CONFIG_HOOKS_FAMILY, normalizeConfigHooks, HOOKS_JSON_FAMILY, normalizeHooksJson, checkNormalizedFamily, checkByteIdenticalGroup, FORGE_CLASSIFIER_EXPORT_SUPERSET, FORGE_EXPORT_SUPERSET_FAMILY, forgeClassifierExportDrift, KERNEL_COPIES, checkCommittedKernelParity };
