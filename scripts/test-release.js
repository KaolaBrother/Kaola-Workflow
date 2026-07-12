#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const SCRIPT = path.join(__dirname, 'kaola-workflow-release.js');
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
let passed = 0, failed = 0;
function assert(v, m) { if (v) passed++; else { failed++; console.error('FAIL: ' + m); } }
function git(dir, ...args) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: ENV }).trim(); }
function run(dir, args, env) { const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env: { ...ENV, KAOLA_RELEASE_ROOT: dir, ...(env || {}) } }); let json = null; try { json = JSON.parse(r.stdout); } catch (_) {} return { status: r.status, stdout: r.stdout, stderr: r.stderr, json }; }
function reason(dir, args, want) { const before = git(dir, 'show-ref'), r = run(dir, [...args, '--json']); assert(r.status !== 0 && r.json && r.json.reason === want, args.join(' ') + ' refuses ' + want + '; got ' + JSON.stringify(r.json)); assert(git(dir, 'show-ref') === before, want + ' refusal is ref-side-effect-free'); return r; }
const codex = ['plugins/kaola-workflow/.codex-plugin/plugin.json', 'plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json', 'plugins/kaola-workflow-gitea/.codex-plugin/plugin.json'];
const claude = ['plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json', 'plugins/kaola-workflow-gitea/.claude-plugin/plugin.json'];
const surface = ['CHANGELOG.md', 'README.md', 'package.json', ...codex, ...claude];
function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-release-'));
  git(d, 'init', '-q', '-b', 'main'); git(d, 'config', 'user.email', 't@example.com'); git(d, 'config', 'user.name', 'T');
  const pkg = { name: 'kaola-workflow', version: '5.0.0', scripts: Object.fromEntries(['claude', 'codex', 'gitlab', 'gitea'].map(n => ['test:kaola-workflow:' + n, 'true'])) };
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg) + '\n');
  fs.writeFileSync(path.join(d, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n- Fix (#661)\n\n## [5.0.0] - 2026-01-01\n');
  fs.writeFileSync(path.join(d, 'README.md'), '# K\n- Claude Code command install, GitHub edition: `5.0.0`\n- Claude Code command install, GitLab edition: `5.0.0`\n- Claude Code command install, Gitea edition: `5.0.0`\n- Codex `kaola-workflow` plugin manifest: `3.0.0`\n- Codex `kaola-workflow-gitlab` plugin manifest: `3.0.0`\n- Codex `kaola-workflow-gitea` plugin manifest: `3.0.0`\n');
  for (const rel of codex) { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), JSON.stringify({ version: '3.0.0' }) + '\n'); }
  for (const rel of claude) { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), JSON.stringify({ version: '5.0.0' }) + '\n'); }
  fs.writeFileSync(path.join(d, 'unrelated.txt'), 'unchanged\n');
  git(d, 'add', '.'); git(d, 'commit', '-qm', 'fixture (#661)'); git(d, 'tag', 'kaola-workflow--v5.0.0');
  return d;
}
function prepare(d, extra) { return run(d, ['--prepare', '--version', '5.1.0', '--json', '--issues-closed', '661', ...(extra || [])], { KAOLA_RELEASE_DATE: '2026-07-12' }); }
function commitCandidate(d) { git(d, 'add', ...surface); git(d, 'commit', '-qm', 'release: 5.1.0'); return git(d, 'rev-parse', 'HEAD'); }
function chain(d, patch) { const obj = { headSha: git(d, 'rev-parse', 'HEAD'), workTreeHash: 'clean', chains: ['claude', 'codex', 'gitlab', 'gitea'].map(name => ({ name, exitCode: 0, accepted_red: false })), ...(patch || {}) }; fs.mkdirSync(path.join(d, '.cache'), { recursive: true }); fs.writeFileSync(path.join(d, '.cache/chain-receipt.json'), JSON.stringify(obj)); return obj; }

function verifyChangelog(changelog, closed) {
  const d = fixture();
  fs.writeFileSync(path.join(d, 'CHANGELOG.md'), changelog);
  const result = run(d, ['--verify', '--json', '--issues-closed', closed || '']);
  fs.rmSync(d, { recursive: true, force: true });
  return result;
}

// RED control preserved as an executable historical proof: the old implementation
// tagged unchanged HEAD after writing bumps. The committed baseline is 5.0.0.
{
  const d = fixture(), baseline = git(d, 'show', 'HEAD:package.json');
  assert(JSON.parse(baseline).version === '5.0.0', 'RED control baseline tag tree is pre-bump 5.0.0');
  const p = prepare(d); assert(p.status === 0 && p.json.result === 'ok', 'prepare succeeds');
  assert(git(d, 'tag', '-l', 'kaola-workflow--v5.1.0') === '', 'prepare creates no tag');
  assert(JSON.parse(fs.readFileSync(path.join(d, 'package.json'))).version === '5.1.0', 'prepare writes bumped package');
  const changed = git(d, 'diff', '--name-only').split('\n').filter(Boolean).sort();
  assert(JSON.stringify(changed) === JSON.stringify(surface.slice().sort()), 'prepare mutates exact release allowlist: ' + changed.join(','));
  assert(fs.readFileSync(path.join(d, 'unrelated.txt'), 'utf8') === 'unchanged\n', 'non-allowlisted tracked file unchanged');
  const rec = fs.readFileSync(path.join(d, '.cache/release-receipt.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).find(x => x.step === 'prepared');
  assert(rec.step === 'prepared' && rec.version === '5.1.0' && rec.rootVersion === '5.1.0' && rec.codexVersion === '3.1.0', 'receipt binds resolved versions');
  assert(rec.candidateSha === null && rec.authorized === false && rec.preparedSurface.length === surface.length, 'prepare does not pre-authorize candidate and records exact surface');
  const again = prepare(d); assert(again.status === 0 && again.json.idempotent === true, 'same-binding prepare resumes idempotently');
  reason(d, ['--prepare', '--version', '5.2.0'], 'stale_release_receipt');
  const candidate = commitCandidate(d); chain(d);
  const t = run(d, ['--tag', '--version', '5.1.0', '--json']);
  assert(t.status === 0 && t.json.tag_tree_verified === true && t.json.candidate_sha === candidate, 'tag succeeds only for committed authorized candidate');
  assert(git(d, 'rev-parse', 'kaola-workflow--v5.1.0^{commit}') === candidate, 'tag resolves exactly to HEAD');
  for (const rel of surface) assert(execFileSync('git', ['-C', d, 'show', 'kaola-workflow--v5.1.0:' + rel], { env: ENV }).equals(fs.readFileSync(path.join(d, rel))), 'tag tree equals prepared ' + rel);
  const rows = fs.readFileSync(path.join(d, '.cache/release-receipt.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert(rows.some(x => x.step === 'tag_authorized' && x.candidateSha === candidate) && rows.some(x => x.step === 'tag_complete' && x.candidateSha === candidate), 'authorization and completion bind candidate SHA');
  const idem = run(d, ['--tag', '--version', '5.1.0', '--json']); assert(idem.status === 0 && idem.json.idempotent === true, 'fully agreeing tag rerun is idempotent');
  fs.rmSync(d, { recursive: true, force: true });
}

// Deterministic crash resume: retain binding + first two completed mutations,
// restore the later files, and prove the persisted Codex resolution is reused.
{
  const d = fixture(); prepare(d);
  const rp = path.join(d, '.cache/release-receipt.jsonl');
  const rows = fs.readFileSync(rp, 'utf8').trim().split('\n').map(JSON.parse).filter(x => ['prepare_binding', 'prepare_changelog', 'prepare_package'].includes(x.step));
  fs.writeFileSync(rp, rows.map(JSON.stringify).join('\n') + '\n');
  for (const rel of [...codex, ...claude, 'README.md']) fs.writeFileSync(path.join(d, rel), execFileSync('git', ['-C', d, 'show', 'HEAD:' + rel], { env: ENV }));
  const resumed = prepare(d);
  assert(resumed.status === 0 && resumed.json.codex_version === '3.1.0', 'partial prepare resumes with persisted Codex resolution; got ' + JSON.stringify(resumed.json));
  assert(codex.every(rel => JSON.parse(fs.readFileSync(path.join(d, rel))).version === '3.1.0'), 'partial prepare completes every missing manifest step');
  fs.rmSync(d, { recursive: true, force: true });
}

// Prepare guards and crash/stale receipt controls.
for (const [setup, want] of [
  [d => fs.appendFileSync(path.join(d, 'unrelated.txt'), 'dirty\n'), 'dirty_worktree'],
  [d => { fs.writeFileSync(path.join(d, codex[1]), JSON.stringify({ version: '3.0.1' })); git(d, 'add', codex[1]); git(d, 'commit', '-qm', 'fixture mismatch'); }, 'lockstep_violation'],
]) { const d = fixture(); setup(d); reason(d, ['--prepare', '--version', '5.1.0'], want); assert(JSON.parse(git(d, 'show', 'HEAD:package.json')).version === '5.0.0', want + ' pre-mutation guard'); fs.rmSync(d, { recursive: true, force: true }); }
{
  const d = fixture(); const p = prepare(d, ['--codex-version', '3.9.9']); assert(p.json.codex_version === '3.9.9' && p.json.codex_version_source === 'explicit', 'independent explicit Codex version'); commitCandidate(d);
  reason(d, ['--prepare', '--version', '5.2.0'], 'stale_release_receipt'); fs.rmSync(d, { recursive: true, force: true });
}

// Cut is compatibility refusal-only and non-mutating for every shape.
for (const args of [['--cut'], ['--cut', '--version', '5.1.0'], ['--cut', '--version', '5.1.0', '--codex-version', '3.9.9']]) {
  const d = fixture(), tree = git(d, 'write-tree'), refs = git(d, 'show-ref'); const r = run(d, [...args, '--json']);
  assert(r.status !== 0 && r.json.reason === 'cut_compatibility_refusal' && r.json.sequence.length === 5, 'cut typed refusal names executable sequence');
  assert(git(d, 'write-tree') === tree && git(d, 'show-ref') === refs, 'cut is non-mutating'); fs.rmSync(d, { recursive: true, force: true });
}

// Tag refusal matrix. Each fixture has a committed prepared candidate unless its
// setup intentionally damages the release receipt.
const cases = [
  ['dirty_worktree', d => fs.appendFileSync(path.join(d, 'unrelated.txt'), 'dirty\n')],
  ['release_receipt_missing', d => fs.rmSync(path.join(d, '.cache/release-receipt.jsonl'))],
  ['release_receipt_unparseable', d => fs.writeFileSync(path.join(d, '.cache/release-receipt.jsonl'), '{bad')],
  ['release_receipt_missing', d => {}, '5.2.0'],
  ['readme_version_mismatch', d => { const p = path.join(d, 'README.md'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('3.1.0', '9.9.9')); git(d, 'add', 'README.md'); git(d, 'commit', '--amend', '-qm', 'tamper'); }],
  ['chains_unverified', d => {}],
  ['chains_unverified', d => { fs.mkdirSync(path.join(d, '.cache'), { recursive: true }); fs.writeFileSync(path.join(d, '.cache/chain-receipt.json'), '{bad'); }],
  ['chains_stale', d => chain(d, { headSha: 'deadbeef', workTreeHash: 'clean' })],
  ['chains_stale', d => chain(d, { workTreeHash: 'dirty' })],
  ['chains_empty', d => chain(d, { chains: [] })],
  ['chains_incomplete', d => chain(d, { chains: [{ name: 'claude', exitCode: 0, accepted_red: false }] })],
  ['chains_red', d => chain(d, { chains: ['claude','codex','gitlab','gitea'].map((name, i) => ({ name, exitCode: i ? 0 : 1, accepted_red: false })) })],
  ['chains_waived', d => chain(d, { chains: ['claude','codex','gitlab','gitea'].map((name, i) => ({ name, exitCode: i ? 0 : 1, accepted_red: i === 0 })) })],
];
cases.push(
  ['package_version_mismatch', d => { const p = JSON.parse(fs.readFileSync(path.join(d, 'package.json'))); p.version = '9.9.9'; fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(p) + '\n'); git(d, 'add', 'package.json'); git(d, 'commit', '--amend', '-qm', 'tamper package'); }],
  ...codex.map(rel => ['codex_manifest_mismatch', d => { const m = JSON.parse(fs.readFileSync(path.join(d, rel))); m.version = '9.9.9'; fs.writeFileSync(path.join(d, rel), JSON.stringify(m) + '\n'); git(d, 'add', rel); git(d, 'commit', '--amend', '-qm', 'tamper codex'); }]),
  ...claude.map(rel => ['claude_manifest_mismatch', d => { const m = JSON.parse(fs.readFileSync(path.join(d, rel))); m.version = '9.9.9'; fs.writeFileSync(path.join(d, rel), JSON.stringify(m) + '\n'); git(d, 'add', rel); git(d, 'commit', '--amend', '-qm', 'tamper claude'); }]),
  ['changelog_heading_mismatch', d => { const p = path.join(d, 'CHANGELOG.md'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('## [5.1.0] - 2026-07-12', '## [5.1.0] - 2026-07-13')); git(d, 'add', 'CHANGELOG.md'); git(d, 'commit', '--amend', '-qm', 'tamper changelog'); }],
  ['prepared_surface_stale', d => { const p = JSON.parse(fs.readFileSync(path.join(d, 'package.json'))); p.note = 'tampered'; fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(p) + '\n'); git(d, 'add', 'package.json'); git(d, 'commit', '--amend', '-qm', 'tamper surface'); }],
);
const preChainRefusals = new Set(['release_receipt_missing', 'release_receipt_unparseable', 'dirty_worktree', 'readme_version_mismatch', 'package_version_mismatch', 'codex_manifest_mismatch', 'claude_manifest_mismatch', 'changelog_heading_mismatch', 'prepared_surface_stale']);
for (const [want, setup, version] of cases) { const d = fixture(); prepare(d); commitCandidate(d); setup(d); if (want !== 'chains_unverified' && !preChainRefusals.has(want) && !fs.existsSync(path.join(d, '.cache/chain-receipt.json'))) chain(d); reason(d, ['--tag', '--version', version || '5.1.0'], want); fs.rmSync(d, { recursive: true, force: true }); }

// Existing tag conflict cannot be laundered.
{
  const d = fixture(); prepare(d); const candidate = commitCandidate(d); chain(d); git(d, 'tag', 'kaola-workflow--v5.1.0', 'kaola-workflow--v5.0.0');
  reason(d, ['--tag', '--version', '5.1.0'], 'tag_conflict'); assert(git(d, 'rev-parse', 'kaola-workflow--v5.1.0^{commit}') !== candidate, 'conflicting tag remains untouched'); fs.rmSync(d, { recursive: true, force: true });
}

// Verify and push stay compatible; source stays forge-token-neutral.
{
  const d = fixture(); chain(d, { headSha: 'unknown', chains: [] });
  const v = run(d, ['--verify', '--json', '--issues-closed', '661']);
  assert(v.status === 0 && Array.isArray(v.json.changelog_refs) && Array.isArray(v.json.closed_issues) && v.json.chain_greenness.reason === 'chains_empty' && v.json.chain_warning === 'chains_empty', '--verify preserves full legacy JSON envelope');
  const vh = run(d, ['--verify', '--issues-closed', '661']); assert(vh.stdout.includes('verify: ok (verification=online)'), '--verify preserves human envelope');
  const p = run(d, ['--push', '--json']); assert(p.status === 0 && /release create/.test(p.json.guidance) && /--notes-from-tag --latest/.test(p.json.guidance), '--push preserves publish guidance JSON');
  const ph = run(d, ['--push']); assert(ph.stdout.includes('Push the local tag to the remote:') && ph.stdout.includes('<forge-cli> release create'), '--push preserves full human guidance');
  fs.rmSync(d, { recursive: true, force: true });
  const src = fs.readFileSync(SCRIPT, 'utf8'); assert(!/\b(gh|glab|tea)\s+(release|repo|api|auth|pr)\b/.test(src), 'no forge-specific CLI token');
}

// [Unreleased] references are structurally bounded and stable in source order.
{
  const eof = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- First (#703) and duplicate (#701)\n- Second (#702), then (#701)\n', '701,702,703');
  assert(eof.status === 0 && JSON.stringify(eof.json.changelog_refs) === '[703,701,702]', 'Unreleased reaches EOF and deduplicates exact refs in source order; got ' + JSON.stringify(eof.json));

  const nextHeading = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Current (#711)\n\n## [5.0.0] - 2026-01-01\n\n- Historical (#799)\n', '711');
  assert(nextHeading.status === 0 && JSON.stringify(nextHeading.json.changelog_refs) === '[711]', 'Unreleased terminates at the next real level-2 heading; got ' + JSON.stringify(nextHeading.json));

  const headingLike = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Current (#721)\n### Detail (#722)\nText with ## heading-like (#723)\n', '721,722,723');
  assert(headingLike.status === 0 && JSON.stringify(headingLike.json.changelog_refs) === '[721,722,723]', 'heading-like text that is not a real level-2 heading does not truncate Unreleased; got ' + JSON.stringify(headingLike.json));

  const missing = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Missing (#731)\n', '661');
  assert(missing.status !== 0 && missing.json && missing.json.reason === 'changelog_unknown_reference' && JSON.stringify(missing.json.unknown) === '[731]', 'unknown Unreleased ref refuses distinctly with exact refs; got ' + JSON.stringify(missing.json));

  const incomplete = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Present (#658)\n', '654,655,656,658');
  assert(incomplete.status !== 0 && incomplete.json.reason === 'changelog_incomplete' && JSON.stringify(incomplete.json.missing) === '[654,655,656]', 'authoritative closed set requires every injected issue in Unreleased; got ' + JSON.stringify(incomplete.json));

  const complete = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- First (#654), duplicate (#654)\n- Next (#655) and (#656)\n- Last (#658)\n', '654,655,654,656,658');
  assert(complete.status === 0 && JSON.stringify(complete.json.changelog_refs) === '[654,655,656,658]' && JSON.stringify(complete.json.closed_issues) === '[654,655,656,658]', 'complete authoritative set passes with deterministic deduplication; got ' + JSON.stringify(complete.json));

  const unknown = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Known (#654)\n- Unknown (#999)\n', '654');
  assert(unknown.status !== 0 && unknown.json.reason === 'changelog_unknown_reference' && JSON.stringify(unknown.json.unknown) === '[999]', 'unknown Unreleased reference remains a distinct refusal; got ' + JSON.stringify(unknown.json));

  // #665: a fenced column-0 `## ` line inside [Unreleased] must not truncate the section — both
  // accounting directions are checked: (a) a ref documented AFTER the fence is not spuriously
  // "missing", and (b) an unknown ref documented after the fence is not hidden from the guard.
  const fencedComplete = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n```\n## fenced decoy heading\n```\n- Real fix (#741)\n', '741');
  assert(fencedComplete.status === 0 && JSON.stringify(fencedComplete.json.changelog_refs) === '[741]', 'a ref documented after a fenced column-0 `## ` line is recognized (no spurious changelog_incomplete); got ' + JSON.stringify(fencedComplete.json));

  const fencedUnknown = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Known (#654)\n```\n## fenced decoy heading\n```\n- Unknown (#999)\n', '654');
  assert(fencedUnknown.status !== 0 && fencedUnknown.json.reason === 'changelog_unknown_reference' && JSON.stringify(fencedUnknown.json.unknown) === '[999]', 'an unknown ref documented after a fenced column-0 `## ` line is not hidden from changelog_unknown_reference; got ' + JSON.stringify(fencedUnknown.json));

  // A1 (post-#665 regression): the fence detector matched fences at ANY indentation via
  // `ln.trim()`, so a 4+-space-indented backtick run (a CommonMark *indented code block*, not a
  // fence) was wrongly treated as an open fence, swallowing every subsequent `## ` heading into
  // [Unreleased]. Anchored at `^\s{0,3}` (matching the classifier's markdownFenceTransition) so
  // an indented backtick run does not suppress heading detection — both accounting directions
  // are checked: (a) a ref genuinely inside Unreleased is attributed correctly and a ref only
  // documented after the (non-fence) heading is not spuriously required or flagged unknown, and
  // (b) the fail-open direction: an issue only documented after the indented backtick run is
  // genuinely missing from Unreleased and must still be caught as changelog_incomplete.
  const indentedComplete = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Real fix (#700)\n    ```\n\n## [5.0.0] - 2026-01-01\n\n- Historical (#654)\n', '700');
  assert(indentedComplete.status === 0 && JSON.stringify(indentedComplete.json.changelog_refs) === '[700]', 'an indented (4-space) backtick run is not a fence: the following `## ` heading still terminates Unreleased so only the current-section ref is attributed (no spurious changelog_incomplete/changelog_unknown_reference for the ref documented after it); got ' + JSON.stringify(indentedComplete.json));

  const indentedIncomplete = verifyChangelog('# Changelog\n\n## [Unreleased]\n\n- Real fix (#700)\n    ```\n\n## [5.0.0] - 2026-01-01\n\n- Historical (#654)\n', '700,654');
  assert(indentedIncomplete.status !== 0 && indentedIncomplete.json.reason === 'changelog_incomplete' && JSON.stringify(indentedIncomplete.json.missing) === '[654]', 'an issue only documented in a section after an indented backtick run is genuinely missing from Unreleased and must still fail changelog_incomplete, not be swallowed into a fail-open pass; got ' + JSON.stringify(indentedIncomplete.json));
}

// Offline verification is honest about its best-effort git-log knowledge.
{
  const d = fixture();
  git(d, 'commit', '--allow-empty', '-qm', 'follow-up accounting (#661)');
  const offline = run(d, ['--verify', '--json']);
  assert(offline.status === 0 && offline.json.verification === 'offline' && JSON.stringify(offline.json.closed_issues) === '[661]', 'offline verification reports its mode and git-log-only accounting; got ' + JSON.stringify(offline.json));
  fs.rmSync(d, { recursive: true, force: true });
}

// Repair RED controls: receipt coherence, baseline allowlist, rollback, bootstrap.
{
  const d = fixture(); prepare(d); const candidate = commitCandidate(d); chain(d);
  const rp = path.join(d, '.cache/release-receipt.jsonl'), all = fs.readFileSync(rp, 'utf8').trim().split('\n').map(JSON.parse);
  const preparedOnly = all.filter(x => x.step === 'prepared'); fs.writeFileSync(rp, preparedOnly.map(JSON.stringify).join('\n') + '\n');
  reason(d, ['--tag', '--version', '5.1.0'], 'release_receipt_incomplete');
  for (const step of ['prepare_changelog','prepare_package','prepare_codex_0','prepare_codex_1','prepare_codex_2','prepare_claude_0','prepare_claude_1','prepare_readme']) {
    fs.writeFileSync(rp, all.filter(x => x.step !== step).map(JSON.stringify).join('\n') + '\n');
    reason(d, ['--tag', '--version', '5.1.0'], 'release_receipt_incomplete');
  }
  fs.writeFileSync(rp, [...all, all.find(x => x.step === 'prepare_package')].map(JSON.stringify).join('\n') + '\n');
  reason(d, ['--tag', '--version', '5.1.0'], 'release_receipt_contradictory');
  fs.writeFileSync(rp, [...all, { ...all.find(x => x.step === 'prepare_package'), version: '9.9.9' }].map(JSON.stringify).join('\n') + '\n');
  reason(d, ['--tag', '--version', '5.1.0'], 'release_receipt_contradictory');
  const subset = all.map(x => x.step === 'prepared' ? { ...x, preparedSurface: x.preparedSurface.slice(1) } : x);
  fs.writeFileSync(rp, subset.map(JSON.stringify).join('\n') + '\n'); reason(d, ['--tag', '--version', '5.1.0'], 'release_receipt_contradictory');
  const duplicateSurface = all.map(x => x.step === 'prepared' ? { ...x, preparedSurface: [...x.preparedSurface.slice(0, -1), x.preparedSurface[0]] } : x);
  fs.writeFileSync(rp, duplicateSurface.map(JSON.stringify).join('\n') + '\n'); reason(d, ['--tag', '--version', '5.1.0'], 'release_receipt_contradictory');
  fs.writeFileSync(rp, all.map(JSON.stringify).join('\n') + '\n');
  fs.appendFileSync(path.join(d, 'unrelated.txt'), 'extra\n'); git(d, 'add', 'unrelated.txt'); git(d, 'commit', '-qm', 'unrelated candidate content'); chain(d);
  reason(d, ['--tag', '--version', '5.1.0'], 'candidate_surface_mismatch');
  assert(git(d, 'rev-parse', 'HEAD') !== candidate, 'baseline probe includes later unrelated commit'); fs.rmSync(d, { recursive: true, force: true });
}
for (const mutate of [
  d => { fs.writeFileSync(path.join(d, 'extra.txt'), 'extra\n'); git(d, 'add', 'extra.txt'); git(d, 'commit', '-qm', 'extra file'); },
  d => { git(d, 'mv', 'README.md', 'RENAMED.md'); git(d, 'commit', '-qm', 'rename release file'); },
  d => { git(d, 'rm', 'README.md'); git(d, 'commit', '-qm', 'delete release file'); },
  d => { git(d, 'add', '-f', '.cache/release-receipt.jsonl'); git(d, 'commit', '-qm', 'commit receipt'); },
  d => { git(d, 'commit', '--allow-empty', '-qm', 'extra empty commit'); },
]) {
  const d = fixture(); prepare(d); commitCandidate(d); mutate(d); chain(d); reason(d, ['--tag', '--version', '5.1.0'], 'candidate_surface_mismatch'); fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = fixture(); prepare(d); commitCandidate(d); chain(d); const refs = git(d, 'show-ref');
  const r = run(d, ['--tag', '--version', '5.1.0', '--json'], { KAOLA_RELEASE_TEST_FAIL_POST_CREATE_SHOW: '1' });
  assert(r.status !== 0 && r.json.reason === 'tag_tree_verification_failed', 'post-create show fault is typed');
  assert(git(d, 'show-ref') === refs && git(d, 'tag', '-l', 'kaola-workflow--v5.1.0') === '', 'post-create failure rolls back only new matching tag'); fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = fixture(); git(d, 'tag', '-d', 'kaola-workflow--v5.0.0');
  const explicit = prepare(d, ['--codex-version', '3.9.9']); assert(explicit.status === 0 && explicit.json.codex_version === '3.9.9', 'explicit Codex version bootstraps without root tag'); fs.rmSync(d, { recursive: true, force: true });
  const d2 = fixture(); git(d2, 'tag', '-d', 'kaola-workflow--v5.0.0'); reason(d2, ['--prepare', '--version', '5.1.0'], 'codex_version_underivable'); fs.rmSync(d2, { recursive: true, force: true });
}

// R6 RED controls: a completed rerun must prove the whole publication receipt.
function completedFixture() { const d = fixture(); prepare(d); commitCandidate(d); chain(d); const first = run(d, ['--tag', '--version', '5.1.0', '--json']); assert(first.status === 0, 'R6 setup completes initial tag'); return d; }
const terminalTamperCases = [
  ['missing authorization', rows => rows.filter(x => x.step !== 'tag_authorized'), 'publication_receipt_incomplete'],
  ['missing completion', rows => rows.filter(x => x.step !== 'tag_complete'), 'publication_receipt_incomplete'],
  ['duplicate authorization', rows => [...rows, { ...rows.find(x => x.step === 'tag_authorized') }], 'publication_receipt_contradictory'],
  ['duplicate completion', rows => [...rows, { ...rows.find(x => x.step === 'tag_complete') }], 'publication_receipt_contradictory'],
  ['foreign authorization', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, version: '9.9.9' } : x), 'publication_receipt_contradictory'],
  ['foreign completion', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, version: '9.9.9' } : x), 'publication_receipt_contradictory'],
  ['authorization candidate', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, candidateSha: 'deadbeef' } : x), 'publication_receipt_contradictory'],
  ['authorization root version', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, rootVersion: '9.9.9' } : x), 'publication_receipt_contradictory'],
  ['authorization Codex version', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, codexVersion: '8.8.8' } : x), 'publication_receipt_contradictory'],
  ['authorization surface', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, preparedSurface: [] } : x), 'publication_receipt_contradictory'],
  ['authorization chain HEAD', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, chainHeadSha: 'deadbeef' } : x), 'publication_receipt_contradictory'],
  ['authorization tag', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, tag: 'wrong' } : x), 'publication_receipt_contradictory'],
  ['authorization status', rows => rows.map(x => x.step === 'tag_authorized' ? { ...x, status: 'partial' } : x), 'publication_receipt_contradictory'],
  ['completion candidate', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, candidateSha: 'deadbeef' } : x), 'publication_receipt_contradictory'],
  ['completion root version', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, rootVersion: '9.9.9' } : x), 'publication_receipt_contradictory'],
  ['completion Codex version', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, codexVersion: '8.8.8' } : x), 'publication_receipt_contradictory'],
  ['completion surface', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, preparedSurface: [] } : x), 'publication_receipt_contradictory'],
  ['completion chain HEAD', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, chainHeadSha: 'deadbeef' } : x), 'publication_receipt_contradictory'],
  ['completion tag', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, tag: 'wrong' } : x), 'publication_receipt_contradictory'],
  ['completion status', rows => rows.map(x => x.step === 'tag_complete' ? { ...x, status: 'partial' } : x), 'publication_receipt_contradictory'],
];
for (const [label, tamper, want] of terminalTamperCases) {
  const d = completedFixture(), rp = path.join(d, '.cache/release-receipt.jsonl');
  const rows = fs.readFileSync(rp, 'utf8').trim().split('\n').map(JSON.parse); fs.writeFileSync(rp, tamper(rows).map(JSON.stringify).join('\n') + '\n');
  const refs = git(d, 'show-ref'), r = run(d, ['--tag', '--version', '5.1.0', '--json']);
  assert(r.status !== 0 && r.json.reason === want, 'R6 ' + label + ' refuses ' + want + '; got ' + JSON.stringify(r.json));
  assert(git(d, 'show-ref') === refs, 'R6 ' + label + ' leaves refs unchanged'); fs.rmSync(d, { recursive: true, force: true });
}

// R7 RED: a failed porcelain probe must never be interpreted as clean.
function statusFaultPath() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-git-fault-')), real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const wrapper = path.join(d, 'git');
  fs.writeFileSync(wrapper, '#!/bin/sh\nif [ "$1" = "status" ]; then exit 74; fi\nexec "' + real + '" "$@"\n'); fs.chmodSync(wrapper, 0o755);
  return { dir: d, path: d + path.delimiter + process.env.PATH };
}
function releaseSnapshot(d) {
  const rp = path.join(d, '.cache/release-receipt.jsonl');
  return { files: surface.map(rel => fs.readFileSync(path.join(d, rel)).toString('base64')), receiptExists: fs.existsSync(rp), receipt: fs.existsSync(rp) ? fs.readFileSync(rp).toString('base64') : null, head: git(d, 'rev-parse', 'HEAD'), status: git(d, 'status', '--porcelain', '--untracked-files=no'), refs: git(d, 'show-ref') };
}
function withoutReceipt(s) { const x = { ...s }; delete x.receipt; delete x.receiptExists; return x; }
for (const dirty of [false, true]) {
  const d = fixture(); if (dirty) fs.appendFileSync(path.join(d, 'unrelated.txt'), 'dirty\n');
  const before = releaseSnapshot(d), fault = statusFaultPath(), r = run(d, ['--prepare', '--version', '5.1.0', '--json'], { PATH: fault.path });
  assert(r.status !== 0 && r.json.reason === 'worktree_status_unavailable', 'R7 prepare status fault refuses on ' + (dirty ? 'dirty' : 'clean') + ' fixture');
  assert(JSON.stringify(releaseSnapshot(d)) === JSON.stringify(before), 'R7 prepare status fault preserves files/receipt/HEAD/status/refs on ' + (dirty ? 'dirty' : 'clean') + ' fixture');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}
for (const dirty of [false, true]) {
  const d = fixture(); prepare(d); commitCandidate(d); chain(d); if (dirty) fs.appendFileSync(path.join(d, 'unrelated.txt'), 'dirty\n');
  const before = releaseSnapshot(d), fault = statusFaultPath(), r = run(d, ['--tag', '--version', '5.1.0', '--json'], { PATH: fault.path });
  assert(r.status !== 0 && r.json.reason === 'worktree_status_unavailable', 'R7 tag status fault refuses on ' + (dirty ? 'dirty' : 'clean') + ' fixture');
  assert(JSON.stringify(releaseSnapshot(d)) === JSON.stringify(before), 'R7 tag status fault preserves files/receipt/HEAD/status/refs on ' + (dirty ? 'dirty' : 'clean') + ' fixture');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}

// R8 + systematic authorization-relevant Git probe audit.
function gitFaultPath(fragment) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-git-probe-')), real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const wrapper = path.join(d, 'git'), safe = fragment.replace(/'/g, "'\\''");
  fs.writeFileSync(wrapper, '#!/bin/sh\ncase "$*" in *\'' + safe + '\'*) exit 74;; esac\nexec "' + real + '" "$@"\n'); fs.chmodSync(wrapper, 0o755);
  return { dir: d, path: d + path.delimiter + process.env.PATH };
}
for (const dirty of [false, true]) {
  const d = fixture(); if (dirty) fs.appendFileSync(path.join(d, 'unrelated.txt'), 'dirty\n'); const before = releaseSnapshot(d), fault = gitFaultPath('tag -l');
  const r = run(d, ['--prepare', '--version', '4.0.0', '--codex-version', '3.9.9', '--issues-closed', '661', '--json'], { PATH: fault.path });
  assert(r.status !== 0 && r.json.reason === 'release_tag_list_unavailable', 'R8 tag-list failure refuses existing-tag downgrade on ' + (dirty ? 'dirty' : 'clean') + ' fixture');
  assert(JSON.stringify(releaseSnapshot(d)) === JSON.stringify(before), 'R8 tag-list failure preserves full state on ' + (dirty ? 'dirty' : 'clean') + ' fixture');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}
const prepareProbeCases = [
  ['log --format=', 'release_history_unavailable'],
  ['rev-parse HEAD', 'git_head_unavailable'],
];
for (const [fragment, want] of prepareProbeCases) {
  const d = fixture(), before = releaseSnapshot(d), fault = gitFaultPath(fragment), r = run(d, ['--prepare', '--version', '5.1.0', '--json', '--issues-closed', '661'], { PATH: fault.path });
  assert(r.status !== 0 && r.json.reason === want, 'prepare probe ' + fragment + ' refuses ' + want); assert(JSON.stringify(releaseSnapshot(d)) === JSON.stringify(before), 'prepare probe ' + fragment + ' is mutation-free');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}
const tagProbeCases = [
  ['tag -l', 'release_tag_list_unavailable'],
  ['rev-parse HEAD', 'git_head_unavailable'],
  ['rev-parse --verify', 'candidate_baseline_unavailable'],
  ['rev-list --count', 'candidate_history_unavailable'],
  ['diff --name-status', 'candidate_diff_unavailable'],
  ['show ', 'candidate_tree_verification_failed'],
  ['update-ref refs/tags/', 'tag_create_failed'],
];
for (const [fragment, want] of tagProbeCases) {
  const d = fixture(); prepare(d); commitCandidate(d); chain(d); const before = releaseSnapshot(d), fault = gitFaultPath(fragment), r = run(d, ['--tag', '--version', '5.1.0', '--json'], { PATH: fault.path });
  assert(r.status !== 0 && r.json.reason === want, 'tag probe ' + fragment + ' refuses ' + want + '; got ' + JSON.stringify(r.json));
  const after = releaseSnapshot(d); assert(JSON.stringify(fragment.startsWith('update-ref') ? withoutReceipt(after) : after) === JSON.stringify(fragment.startsWith('update-ref') ? withoutReceipt(before) : before), 'tag probe ' + fragment + ' preserves authorization-relevant state');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = completedFixture(), before = releaseSnapshot(d), fault = gitFaultPath('rev-parse --verify kaola-workflow--v5.1.0');
  const r = run(d, ['--tag', '--version', '5.1.0', '--json'], { PATH: fault.path }); assert(r.status !== 0 && r.json.reason === 'tag_target_unavailable', 'existing tag target probe failure is typed'); assert(JSON.stringify(releaseSnapshot(d)) === JSON.stringify(before), 'existing tag target failure is mutation-free');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = fixture(); prepare(d); const candidate = commitCandidate(d); chain(d); const before = releaseSnapshot(d), fault = gitFaultPath('rev-parse --verify kaola-workflow--v5.1.0');
  const r = run(d, ['--tag', '--version', '5.1.0', '--json'], { PATH: fault.path }); assert(r.status !== 0 && r.json.reason === 'tag_target_unavailable', 'post-create tag target probe failure is typed'); assert(JSON.stringify(withoutReceipt(releaseSnapshot(d))) === JSON.stringify(withoutReceipt(before)), 'post-create target failure compare-rolls back ref and preserves files/HEAD/status'); assert(git(d, 'tag', '-l', 'kaola-workflow--v5.1.0') === '' && candidate === git(d, 'rev-parse', 'HEAD'), 'post-create rollback preserves candidate and removes new tag');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = fixture(); prepare(d); const candidate = commitCandidate(d); chain(d); const fault = gitFaultPath('update-ref -d');
  const r = run(d, ['--tag', '--version', '5.1.0', '--json'], { PATH: fault.path, KAOLA_RELEASE_TEST_FAIL_POST_CREATE_SHOW: '1' });
  assert(r.status !== 0 && r.json.reason === 'tag_rollback_failed', 'compare-delete probe failure is explicit tag_rollback_failed');
  assert(git(d, 'rev-parse', 'kaola-workflow--v5.1.0^{commit}') === candidate, 'failed compare-delete never deletes an unverified/nonmatching ref');
  fs.rmSync(fault.dir, { recursive: true, force: true }); fs.rmSync(d, { recursive: true, force: true });
}

if (failed) { console.error(`\ntest-release: ${failed} test(s) FAILED, ${passed} passed`); process.exit(1); }
console.log(`test-release: all ${passed} assertions passed`);
