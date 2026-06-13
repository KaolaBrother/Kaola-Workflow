#!/usr/bin/env node
'use strict';

// Tests for kaola-workflow-release.js (#442 — D-442-01).
// Hand-rolled assert pattern — no test framework dependency.
// ALL fixtures are built in os.tmpdir() temp dirs / temp git repos.
// Never mutates the real repo, real CHANGELOG, real manifests, or creates real tags.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let passed = 0;
let failed = 0;
function assert(c, m) {
  if (c) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + m);
  }
}

const RELEASE_SCRIPT = path.join(__dirname, 'kaola-workflow-release.js');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

// Create a minimal git repo with one commit and a version tag.
function makeGitRepo(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-'));
  const g = (args) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  g(['add', 'seed.txt']);
  g(['commit', '-q', '-m', 'seed']);
  if (version) {
    g(['tag', 'kaola-workflow--v' + version]);
  }
  return dir;
}

// Write a minimal fixture repo with CHANGELOG, package.json, codex manifests, and README.
function makeFixtureRepo(opts) {
  const {
    version = '5.0.0',
    changelogUnreleased = '## [Unreleased]\n\n### Added\n\n- Nothing yet\n',
    codexVersions = ['3.0.0', '3.0.0', '3.0.0'],
    readmeCodexVersions = null, // null = auto-derive from codexVersions[0]
    extraCommitMessages = [],
    tagVersion = version, // create a tag at this version (null to skip)
    dateEnv = null,
  } = opts || {};

  const dir = makeGitRepo(null);
  const g = (args) => execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();

  // Write package.json
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'kaola-workflow', version }) + '\n');

  // Write CHANGELOG.md
  const changelogContent = '# Changelog\n\n' + changelogUnreleased + '\n## [' + version + '] — 2026-01-01\n\n- Initial release\n';
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelogContent);

  // Write README.md with codex version lines
  const cv0 = readmeCodexVersions ? readmeCodexVersions[0] : codexVersions[0];
  const cv1 = readmeCodexVersions ? readmeCodexVersions[1] : codexVersions[1];
  const cv2 = readmeCodexVersions ? readmeCodexVersions[2] : codexVersions[2];
  const readmeContent = '# Kaola-Workflow\n\n' +
    'Some text\n\n' +
    '- Codex `kaola-workflow` plugin manifest: `' + cv0 + '`\n' +
    '- Codex `kaola-workflow-gitlab` plugin manifest: `' + cv1 + '`\n' +
    '- Codex `kaola-workflow-gitea` plugin manifest: `' + cv2 + '`\n';
  fs.writeFileSync(path.join(dir, 'README.md'), readmeContent);

  // Write three codex manifests
  const codexManifestPaths = [
    'plugins/kaola-workflow/.codex-plugin/plugin.json',
    'plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json',
    'plugins/kaola-workflow-gitea/.codex-plugin/plugin.json',
  ];
  const codexNames = ['kaola-workflow', 'kaola-workflow-gitlab', 'kaola-workflow-gitea'];
  for (let i = 0; i < 3; i++) {
    fs.mkdirSync(path.join(dir, path.dirname(codexManifestPaths[i])), { recursive: true });
    fs.writeFileSync(
      path.join(dir, codexManifestPaths[i]),
      JSON.stringify({ name: codexNames[i], version: codexVersions[i] }) + '\n'
    );
  }

  // Stage and commit all fixture files
  g(['add', '.']);
  g(['commit', '-q', '-m', 'fixture: initial state']);

  // Create tag if requested
  if (tagVersion) {
    g(['tag', 'kaola-workflow--v' + tagVersion]);
  }

  // Add extra commits (to simulate work done since the tag)
  for (const msg of extraCommitMessages) {
    fs.appendFileSync(path.join(dir, 'seed.txt'), msg + '\n');
    g(['add', 'seed.txt']);
    g(['commit', '-q', '-m', msg]);
  }

  return dir;
}

// Run the release script as a subprocess. Returns {exitCode, stdout, stderr, json?}
function run(dir, args, extraEnv) {
  const envBase = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('KAOLA_'))
  );
  envBase.GIT_CONFIG_GLOBAL = '/dev/null';
  envBase.GIT_CONFIG_NOSYSTEM = '1';
  const r = spawnSync(process.execPath, [RELEASE_SCRIPT, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...envBase, ...(extraEnv || {}), KAOLA_RELEASE_ROOT: dir },
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch (_) {}
  return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr, json: parsed };
}

// ---------------------------------------------------------------------------
// T1: changelog_incomplete — [Unreleased] cites #N absent from git log -> refuse
// ---------------------------------------------------------------------------
const repo1 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Fix something (#99)\n',
  extraCommitMessages: ['chore: unrelated work'],
  // issue #99 is NOT in git log commit messages
});
{
  const r = run(repo1, ['--verify', '--json', '--issues-closed', '']);
  assert(r.json !== null, 'T1: --verify --json produces parseable JSON');
  if (r.json !== null) {
    assert(r.json.result === 'refuse', 'T1: result must be refuse when #N not in git log; got ' + r.json.result);
    assert(r.json.reason === 'changelog_incomplete', 'T1: reason must be changelog_incomplete; got ' + r.json.reason);
    assert(Array.isArray(r.json.missing), 'T1: missing must be an array; got ' + JSON.stringify(r.json.missing));
    assert(r.json.missing.includes(99), 'T1: missing must include 99; got ' + JSON.stringify(r.json.missing));
  }
}
fs.rmSync(repo1, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T2: lockstep_violation — three codex manifests disagree -> refuse
// ---------------------------------------------------------------------------
const repo2 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Nothing\n',
  codexVersions: ['3.0.0', '3.0.1', '3.0.0'], // gitlab is different
});
{
  const r = run(repo2, ['--cut', '--version', '5.1.0', '--json']);
  assert(r.json !== null, 'T2: --cut --json produces parseable JSON');
  if (r.json !== null) {
    assert(r.json.result === 'refuse', 'T2: result must be refuse on lockstep violation; got ' + r.json.result);
    assert(r.json.reason === 'lockstep_violation', 'T2: reason must be lockstep_violation; got ' + r.json.reason);
  }
}
fs.rmSync(repo2, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T3: non_monotonic_version — --cut --version <= last tag -> refuse
// ---------------------------------------------------------------------------
const repo3 = makeFixtureRepo({
  version: '5.5.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Nothing\n',
  tagVersion: '5.5.0',
});
{
  // Same version as existing tag — non-monotonic
  const r = run(repo3, ['--cut', '--version', '5.5.0', '--json']);
  assert(r.json !== null, 'T3: --cut --json produces parseable JSON');
  if (r.json !== null) {
    assert(r.json.result === 'refuse', 'T3: result must be refuse for non-monotonic version; got ' + r.json.result);
    assert(r.json.reason === 'non_monotonic_version', 'T3: reason must be non_monotonic_version; got ' + r.json.reason);
  }
  // Also test strictly less-than case
  const r2 = run(repo3, ['--cut', '--version', '5.4.0', '--json']);
  assert(r2.json !== null, 'T3b: --cut --json produces parseable JSON for lower version');
  if (r2.json !== null) {
    assert(r2.json.result === 'refuse', 'T3b: result must be refuse for lower version; got ' + r2.json.result);
    assert(r2.json.reason === 'non_monotonic_version', 'T3b: reason must be non_monotonic_version; got ' + r2.json.reason);
  }
}
fs.rmSync(repo3, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T4: offline --verify -> receipt carries verification:"offline"
// ---------------------------------------------------------------------------
const repo4 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Nothing\n',
  tagVersion: '5.0.0',
});
{
  // No --issues-closed flag = offline mode (no forge query, no injected set)
  const r = run(repo4, ['--verify', '--json']);
  assert(r.json !== null, 'T4: offline --verify produces parseable JSON');
  if (r.json !== null) {
    assert(r.json.verification === 'offline',
      'T4: offline verify must carry verification:"offline"; got ' + JSON.stringify(r.json.verification));
    // Must not be a silent pass — should include some signal
    assert(r.json.result !== undefined, 'T4: offline verify must have a result field');
  }
}
fs.rmSync(repo4, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T5: cut-without-push -> local tag/bumps land, no remote mutation
// ---------------------------------------------------------------------------
const repo5 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Fix bug (#100)\n',
  tagVersion: '5.0.0',
  extraCommitMessages: ['fix: the bug (#100)'],
});
{
  const cutDate = '2026-06-13';
  const r = run(repo5, ['--cut', '--version', '5.1.0', '--json', '--issues-closed', '100'], {
    KAOLA_RELEASE_DATE: cutDate,
  });
  assert(r.json !== null, 'T5: --cut produces parseable JSON; stderr=' + (r.stderr || ''));
  if (r.json !== null) {
    assert(r.json.result === 'ok', 'T5: --cut must return ok; got ' + r.json.result + ' reason=' + r.json.reason);
  }

  if (r.json && r.json.result === 'ok') {
    // Verify local tag was created
    const tags = execFileSync('git', ['-C', repo5, 'tag', '-l', 'kaola-workflow--v5.1.0'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
    assert(tags === 'kaola-workflow--v5.1.0', 'T5: local tag kaola-workflow--v5.1.0 must be created; got=' + JSON.stringify(tags));

    // Verify no remote was pushed to (no remote refs exist)
    const remoteCheck = spawnSync('git', ['-C', repo5, 'remote'], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    });
    assert(remoteCheck.stdout.trim() === '', 'T5: no remote must exist (no push happened); got=' + JSON.stringify(remoteCheck.stdout.trim()));

    // Verify CHANGELOG was updated
    const changelog = fs.readFileSync(path.join(repo5, 'CHANGELOG.md'), 'utf8');
    assert(changelog.includes('[5.1.0]'), 'T5: CHANGELOG must contain [5.1.0]');
    assert(!changelog.includes('[Unreleased]') || changelog.indexOf('[5.1.0]') < changelog.indexOf('[Unreleased]'),
      'T5: [Unreleased] must be replaced by versioned heading in CHANGELOG');

    // Verify package.json was bumped
    const pkg = JSON.parse(fs.readFileSync(path.join(repo5, 'package.json'), 'utf8'));
    assert(pkg.version === '5.1.0', 'T5: package.json version must be 5.1.0; got=' + pkg.version);

    // Verify all three codex manifests were bumped
    const codexPaths = [
      'plugins/kaola-workflow/.codex-plugin/plugin.json',
      'plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json',
      'plugins/kaola-workflow-gitea/.codex-plugin/plugin.json',
    ];
    for (const cp of codexPaths) {
      const manifest = JSON.parse(fs.readFileSync(path.join(repo5, cp), 'utf8'));
      assert(manifest.version === '5.1.0', 'T5: ' + cp + ' version must be 5.1.0; got=' + manifest.version);
    }
  }
}
fs.rmSync(repo5, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T6: --cut without --version is a typed refusal (missing_version)
// ---------------------------------------------------------------------------
const repo6 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Nothing\n',
  tagVersion: '5.0.0',
});
{
  const r = run(repo6, ['--cut', '--json']);
  assert(r.json !== null, 'T6: --cut without --version produces parseable JSON');
  if (r.json !== null) {
    assert(r.json.result === 'refuse', 'T6: --cut without --version must refuse; got ' + r.json.result);
    assert(r.json.reason === 'missing_version', 'T6: reason must be missing_version; got ' + r.json.reason);
  }
}
fs.rmSync(repo6, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T7: --push emits forge-neutral guidance (no forge CLI name in output)
// ---------------------------------------------------------------------------
const repo7 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Nothing\n',
  tagVersion: '5.0.0',
});
{
  const r = run(repo7, ['--push', '--json']);
  // The output should not contain forge CLI binary names as standalone words
  const combined = (r.stdout || '') + (r.stderr || '');
  // "gh " as a command invocation (start of token followed by space or end) — check stdout only
  const hasForgeInvocation = /\b(gh|glab|tea)\s+(release|repo|api|auth|pr)\b/.test(combined);
  assert(!hasForgeInvocation, 'T7: --push output must not contain forge CLI invocations; found in: ' + combined.slice(0, 200));
}
fs.rmSync(repo7, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T8: crash-resume — step receipt JSONL is written during --cut
// ---------------------------------------------------------------------------
const repo8 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Fix crash (#200)\n',
  tagVersion: '5.0.0',
  extraCommitMessages: ['fix: crash (#200)'],
});
{
  const cutDate = '2026-06-13';
  const r = run(repo8, ['--cut', '--version', '5.1.0', '--json', '--issues-closed', '200'], {
    KAOLA_RELEASE_DATE: cutDate,
  });
  if (r.json && r.json.result === 'ok') {
    // Check that the receipt file exists
    const receiptPath = path.join(repo8, '.cache', 'release-receipt.jsonl');
    assert(fs.existsSync(receiptPath), 'T8: .cache/release-receipt.jsonl must be written after --cut');
    if (fs.existsSync(receiptPath)) {
      const lines = fs.readFileSync(receiptPath, 'utf8').trim().split('\n').filter(Boolean);
      assert(lines.length > 0, 'T8: release receipt must contain at least one line');
      // Each line must be valid JSON
      let allValid = true;
      for (const line of lines) {
        try { JSON.parse(line); } catch (_) { allValid = false; }
      }
      assert(allValid, 'T8: all receipt lines must be valid JSON');
    }
  } else {
    // If cut failed, skip the receipt check but note why
    console.error('T8: skipped receipt check — --cut did not return ok; result=' + (r.json && r.json.result) + ' reason=' + (r.json && r.json.reason));
  }
}
fs.rmSync(repo8, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T9 (R1 regression): source must not contain literal forge-mangled tokens
// The rename-normalizer in validate-script-sync.js rewrites the substring
// 'kaola-workflow-' -> 'kaola-{gitlab,gitea}-workflow-' when generating the
// forge ports. Manifest paths and tag prefixes that contain 'kaola-workflow-'
// followed by a forge suffix or '--v' will be mangled. The canonical source
// MUST NOT contain these literal substrings so that the normalizer is a no-op
// on the relevant data tokens.
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(RELEASE_SCRIPT, 'utf8');

  // These are the exact substrings the normalizer produces when applied to
  // 'kaola-workflow-gitlab', 'kaola-workflow-gitea', 'kaola-workflow--v'
  // in the canonical source. Their presence in source means forge ports get
  // paths like 'plugins/kaola-gitlab-workflow-gitlab/...' (nonexistent).
  assert(
    !src.includes('kaola-workflow-gitlab'),
    'T9a (R1): canonical source must NOT contain literal "kaola-workflow-gitlab" — use base+suffix construction'
  );
  assert(
    !src.includes('kaola-workflow-gitea'),
    'T9b (R1): canonical source must NOT contain literal "kaola-workflow-gitea" — use base+suffix construction'
  );
  assert(
    !src.includes('kaola-workflow--v'),
    'T9c (R1): canonical source must NOT contain literal "kaola-workflow--v" — use RELEASE_TAG_PREFIX constant'
  );

  // Bonus: verify that applying the documented normalizer transform
  // ('kaola-workflow-' -> 'kaola-gitlab-workflow-') to the source does NOT
  // corrupt the PLUGIN_BASE constant literal — that constant is the root of
  // all manifest path construction, so preserving it guarantees forge ports
  // produce paths pointing at the real directories.
  const gitlabTransformed = src.split('kaola-workflow-').join('kaola-gitlab-workflow-');
  // The PLUGIN_BASE literal 'plugins/kaola-workflow' (quote-terminated, no hyphen)
  // must survive the transform unchanged.  The normalizer only matches
  // 'kaola-workflow-' (hyphen suffix), so the slash/quote-terminated base is safe.
  assert(
    gitlabTransformed.includes("'plugins/kaola-workflow'"),
    "T9d (R1): after normalizer transform, PLUGIN_BASE literal 'plugins/kaola-workflow' must still appear verbatim"
  );
  // Also verify the forge-suffix string literals survive (they don't start with 'kaola-workflow-')
  assert(
    gitlabTransformed.includes("'-gitlab/.codex-plugin/plugin.json'"),
    "T9d (R1): after normalizer transform, '-gitlab/.codex-plugin/plugin.json' suffix literal must survive"
  );
  assert(
    gitlabTransformed.includes("'-gitea/.codex-plugin/plugin.json'"),
    "T9d (R1): after normalizer transform, '-gitea/.codex-plugin/plugin.json' suffix literal must survive"
  );
}

// ---------------------------------------------------------------------------
// T10 (R2 regression): idempotent re-run of a completed --cut returns ok not refuse
// A second --cut with the SAME version after the first succeeded must return
// {result:'ok', idempotent:true}, NOT {result:'refuse', reason:'non_monotonic_version'}.
// This validates the D-442-01 §5 crash-resume idempotency contract.
// ---------------------------------------------------------------------------
const repo10 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Fix something (#300)\n',
  tagVersion: '5.0.0',
  extraCommitMessages: ['fix: something (#300)'],
});
{
  const cutDate = '2026-06-13';
  const cutArgs = ['--cut', '--version', '5.1.0', '--json', '--issues-closed', '300'];
  const cutEnv = { KAOLA_RELEASE_DATE: cutDate };

  // First run — must succeed
  const r1 = run(repo10, cutArgs, cutEnv);
  assert(r1.json !== null, 'T10: first --cut produces parseable JSON; stderr=' + (r1.stderr || ''));
  assert(
    r1.json && r1.json.result === 'ok',
    'T10: first --cut must return ok; got result=' + (r1.json && r1.json.result) + ' reason=' + (r1.json && r1.json.reason)
  );

  // Second run with the identical version — must be a no-op ok, NOT refuse
  const r2 = run(repo10, cutArgs, cutEnv);
  assert(r2.json !== null, 'T10: second --cut (idempotent) produces parseable JSON; stderr=' + (r2.stderr || ''));
  if (r2.json !== null) {
    assert(
      r2.json.result === 'ok',
      'T10: second --cut with same version must return ok (idempotent), not refuse; got result=' + r2.json.result + ' reason=' + r2.json.reason
    );
    assert(
      r2.json.idempotent === true,
      'T10: second --cut must include idempotent:true in response; got ' + JSON.stringify(r2.json.idempotent)
    );
  }
}
fs.rmSync(repo10, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// T11 (issue #449 regression): stale-receipt cross-version fabricated-pass.
// Running --cut 5.1.0 followed by --cut 5.2.0 in the SAME workspace WITHOUT
// clearing the receipt MUST NOT fabricate result:ok while package.json still
// says 5.1.0 and the 5.2.0 tag does not exist.  Either:
//   (a) the 5.2.0 release is genuinely executed (tag+package.json+CHANGELOG all
//       reflect 5.2.0), OR
//   (b) the script cleanly refuses with stale_receipt or version_mismatch.
// Fabricated-pass (result:ok + package.json@5.1.0 + no 5.2.0 tag) MUST FAIL.
// ---------------------------------------------------------------------------
const repo11 = makeFixtureRepo({
  version: '5.0.0',
  changelogUnreleased: '## [Unreleased]\n\n### Added\n\n- Fix bug (#500)\n',
  tagVersion: '5.0.0',
  extraCommitMessages: ['fix: bug (#500)'],
});
{
  const cutDate = '2026-06-13';
  const g11 = (gitArgs) => execFileSync('git', ['-C', repo11, ...gitArgs], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  }).trim();

  // Step 1: --cut 5.1.0 — must succeed fully.
  const r1 = run(repo11, ['--cut', '--version', '5.1.0', '--json', '--issues-closed', '500'], {
    KAOLA_RELEASE_DATE: cutDate,
  });
  assert(r1.json !== null, 'T11: first --cut 5.1.0 produces parseable JSON; stderr=' + (r1.stderr || ''));
  assert(
    r1.json && r1.json.result === 'ok',
    'T11: first --cut 5.1.0 must return ok; got result=' + (r1.json && r1.json.result) + ' reason=' + (r1.json && r1.json.reason)
  );

  if (r1.json && r1.json.result === 'ok') {
    // Step 2: Reset CHANGELOG to have a new [Unreleased] section for 5.2.0,
    // because the 5.1.0 cut already consumed the old [Unreleased] section.
    // We also bump the fixture to version 5.1.0 consistent with what cut did.
    // BUT: we do NOT clear the receipt — this is the cross-version stale-receipt scenario.
    const changelog11 = fs.readFileSync(path.join(repo11, 'CHANGELOG.md'), 'utf8');
    // Prepend a new [Unreleased] section on top.
    const updated11 = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Another fix (#501)\n\n' +
      changelog11.replace(/^# Changelog\n\n/, '');
    fs.writeFileSync(path.join(repo11, 'CHANGELOG.md'), updated11);
    // Add commit so #501 appears in git log.
    fs.appendFileSync(path.join(repo11, 'seed.txt'), 'fix: another fix (#501)\n');
    g11(['add', '.']);
    g11(['commit', '-q', '-m', 'fix: another fix (#501)']);
    // Confirm receipt is still present (not cleared).
    const receiptFile = path.join(repo11, '.cache', 'release-receipt.jsonl');
    assert(fs.existsSync(receiptFile), 'T11: receipt from 5.1.0 cut must still exist before 5.2.0 cut');

    // Step 3: --cut 5.2.0 WITHOUT clearing the receipt.
    const r2 = run(repo11, ['--cut', '--version', '5.2.0', '--json', '--issues-closed', '500,501'], {
      KAOLA_RELEASE_DATE: cutDate,
    });
    assert(r2.json !== null, 'T11: second --cut 5.2.0 produces parseable JSON; stderr=' + (r2.stderr || ''));

    if (r2.json !== null) {
      if (r2.json.result === 'ok') {
        // If it claims success, verify it actually did the work — fabricated-pass is a FAIL.
        const tag52 = g11(['tag', '-l', 'kaola-workflow--v5.2.0']);
        const pkg52 = JSON.parse(fs.readFileSync(path.join(repo11, 'package.json'), 'utf8'));
        const cl52 = fs.readFileSync(path.join(repo11, 'CHANGELOG.md'), 'utf8');
        assert(
          tag52 === 'kaola-workflow--v5.2.0',
          'T11: result:ok claimed but 5.2.0 tag is absent — fabricated-pass detected; tags=' + JSON.stringify(tag52)
        );
        assert(
          pkg52.version === '5.2.0',
          'T11: result:ok claimed but package.json still at ' + pkg52.version + ' — fabricated-pass detected'
        );
        assert(
          cl52.includes('[5.2.0]'),
          'T11: result:ok claimed but CHANGELOG does not contain [5.2.0] — fabricated-pass detected'
        );
      } else {
        // A clean refuse (stale_receipt, version_mismatch, etc.) is also acceptable.
        assert(
          r2.json.result === 'refuse',
          'T11: second --cut must return ok (with real work done) or refuse; got ' + r2.json.result
        );
      }
    }
  }
}
fs.rmSync(repo11, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('\ntest-release: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-release: all ' + passed + ' assertions passed');
}
