#!/usr/bin/env node
'use strict';

// Forge-neutral release transaction: prepare -> operator commit + full offline
// validation -> tag.  The tag command never edits release files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PLUGIN_BASE = 'plugins/kaola-workflow';
const CODEX_MANIFEST_RELPATHS = [
  PLUGIN_BASE + '/.codex-plugin/plugin.json',
  PLUGIN_BASE + '-gitlab/.codex-plugin/plugin.json',
  PLUGIN_BASE + '-gitea/.codex-plugin/plugin.json',
];
const CLAUDE_MANIFEST_RELPATHS = [
  PLUGIN_BASE + '-gitlab/.claude-plugin/plugin.json',
  PLUGIN_BASE + '-gitea/.claude-plugin/plugin.json',
];
const RELEASE_FILES = ['CHANGELOG.md', 'README.md', 'package.json', ...CODEX_MANIFEST_RELPATHS, ...CLAUDE_MANIFEST_RELPATHS];
const RELEASE_TAG_PREFIX = 'kaola-workflow' + '--v';

function flagVal(args, flag) { const i = args.indexOf(flag); return i < 0 ? null : (args[i + 1] || null); }
function hasFlag(args, flag) { return args.includes(flag); }
function gitProbe(root, args, encoding = 'utf8') {
  try { const value = execFileSync('git', args, { cwd: root, encoding, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }); return { ok: true, value: encoding ? value.trim() : value }; }
  catch (error) { return { ok: false, exitCode: error && error.status != null ? error.status : null }; }
}
function emit(json, payload, human) {
  (json ? process.stdout : (payload.result === 'ok' || payload.result === 'pass' ? process.stdout : process.stderr))
    .write((json ? JSON.stringify(payload) : human) + '\n');
  return payload.result === 'ok' || payload.result === 'pass' ? 0 : 1;
}
function refuse(json, reason, extra, human) { return emit(json, { result: 'refuse', reason, ...(extra || {}) }, human || ('release: REFUSED ' + reason)); }
function semver(v) { return /^\d+\.\d+\.\d+$/.test(String(v || '')); }
function cmp(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; }
function bumpKind(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] !== y[0] ? 'major' : x[1] !== y[1] ? 'minor' : x[2] !== y[2] ? 'patch' : null; }
function bump(v, kind) { const x = v.split('.').map(Number); return kind === 'major' ? `${x[0] + 1}.0.0` : kind === 'minor' ? `${x[0]}.${x[1] + 1}.0` : `${x[0]}.${x[1]}.${x[2] + 1}`; }
function releaseTags(root) { const p = gitProbe(root, ['tag', '-l', RELEASE_TAG_PREFIX + '*', '--sort=-version:refname']); return p.ok ? { ok: true, tags: p.value ? p.value.split('\n').filter(Boolean) : [] } : { ok: false, reason: 'release_tag_list_unavailable', exitCode: p.exitCode }; }
function jsonFile(root, rel) { try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); } catch (_) { return null; } }
function hashFile(root, rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'); }
function trackedStatus(root) {
  try { return { ok: true, value: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }) }; }
  catch (error) { return { ok: false, reason: 'worktree_status_unavailable', exitCode: error && error.status != null ? error.status : null }; }
}
function lockstep(root) {
  const vals = CODEX_MANIFEST_RELPATHS.map(rel => ({ rel, value: jsonFile(root, rel) }));
  if (vals.some(x => !x.value || !semver(x.value.version))) return { ok: false, reason: 'lockstep_violation' };
  const baseline = vals[0].value.version;
  return vals.every(x => x.value.version === baseline) ? { ok: true, baseline } : { ok: false, reason: 'lockstep_violation' };
}
function receiptPath(root) { return path.join(root, '.cache', 'release-receipt.jsonl'); }
function receipt(root) {
  try { return fs.readFileSync(receiptPath(root), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (_) { return null; }
}
function append(root, row) { fs.mkdirSync(path.dirname(receiptPath(root)), { recursive: true }); fs.appendFileSync(receiptPath(root), JSON.stringify({ ...row, ts: new Date().toISOString() }) + '\n'); }
function binding(rows, version) { return rows && rows.find(r => r.step === 'prepared' && r.status === 'done' && r.version === version) || null; }
function latestRowsForOtherVersion(rows, version) { return rows && rows.some(r => r.step === 'prepared' && r.status === 'done' && r.version !== version); }
function startedBinding(rows, version) { return rows && rows.find(r => r.step === 'prepare_binding' && r.status === 'done' && r.version === version) || null; }
// #665: fence-aware termination — a fenced column-0 `## ` line must NOT end [Unreleased] early.
// Mirrors the classifier's markdownFenceTransition closer semantics locally (same family AND a
// run-length >= the opener's AND an empty/whitespace-only suffix AND the CommonMark 0-3-space
// indent anchor — a 4+-space-indented backtick run is an indented code block, not a fence; pure
// string ops, no cross-dependency) so only a fence-depth-0 `## ` heading terminates the section.
function unreleasedSection(text) {
  const heading = /^##[ \t]+\[Unreleased\][^\r\n]*/mi.exec(text);
  if (!heading) return { section: '', refs: [] };
  const bodyStart = heading.index + heading[0].length;
  const body = text.slice(bodyStart);
  const lines = body.split('\n');
  const fenceRe = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
  let fam = '', fenceLen = 0, off = lines[0].length + 1, nextIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.match(fenceRe);
    if (fm) {
      const f = fm[1][0], len = fm[1].length;
      if (!fam) { fam = f; fenceLen = len; }
      else if (f === fam && len >= fenceLen && /^\s*$/.test(fm[2])) { fam = ''; fenceLen = 0; }
    } else if (!fam && /^##[ \t]+/.test(ln)) {
      nextIdx = off; break;
    }
    off += ln.length + 1;
  }
  const section = text.slice(heading.index, nextIdx >= 0 ? bodyStart + nextIdx : text.length);
  return { section, refs: [...new Set([...section.matchAll(/#(\d+)/g)].map(m => Number(m[1])))] };
}
function issuesOkay(root, injected, lastTag) {
  const text = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
  const refs = unreleasedSection(text).refs;
  const range = lastTag ? lastTag + '..HEAD' : 'HEAD';
  const logProbe = gitProbe(root, ['log', '--format=%s %b', range]);
  if (!logProbe.ok) return { ok: false, reason: 'release_history_unavailable', exitCode: logProbe.exitCode };
  const log = logProbe.value;
  const injectedIssues = [...new Set(injected || [])];
  const known = new Set([...injectedIssues, ...[...log.matchAll(/#(\d+)/g)].map(m => Number(m[1]))]);
  const refSet = new Set(refs);
  return {
    ok: true,
    unknown: refs.filter(n => !known.has(n)),
    missing: injected === null ? [] : injectedIssues.filter(n => !refSet.has(n)),
    refs,
    known: [...known],
  };
}
function preparedSurface(root) { return RELEASE_FILES.map(file => ({ file, sha256: hashFile(root, file) })); }
function sameSurface(root, surface) { return Array.isArray(surface) && surface.length === RELEASE_FILES.length && surface.every(x => RELEASE_FILES.includes(x.file) && fs.existsSync(path.join(root, x.file)) && hashFile(root, x.file) === x.sha256); }
const PREPARE_STEPS = [
  ['prepare_changelog', 'CHANGELOG.md'], ['prepare_package', 'package.json'],
  ...CODEX_MANIFEST_RELPATHS.map((file, i) => ['prepare_codex_' + i, file]),
  ...CLAUDE_MANIFEST_RELPATHS.map((file, i) => ['prepare_claude_' + i, file]),
  ['prepare_readme', 'README.md'],
];
function validateTransaction(rows, version) {
  const transactionNames = new Set(['prepare_binding', 'prepared', ...PREPARE_STEPS.map(x => x[0])]);
  const related = rows.filter(r => transactionNames.has(r.step));
  if (related.some(r => r.version !== version)) return { ok: false, reason: 'release_receipt_contradictory' };
  const one = step => related.filter(r => r.step === step);
  if (one('prepare_binding').length !== 1 || one('prepared').length !== 1 || PREPARE_STEPS.some(([step]) => one(step).length !== 1)) {
    const duplicate = ['prepare_binding', 'prepared', ...PREPARE_STEPS.map(x => x[0])].some(step => one(step).length > 1);
    return { ok: false, reason: duplicate ? 'release_receipt_contradictory' : 'release_receipt_incomplete' };
  }
  const start = one('prepare_binding')[0], terminal = one('prepared')[0];
  if (start.status !== 'done' || terminal.status !== 'done' || start.rootVersion !== version || terminal.rootVersion !== version ||
      start.codexVersion !== terminal.codexVersion || start.codexVersionSource !== terminal.codexVersionSource ||
      start.baselineSha !== terminal.baselineSha || start.date !== terminal.date || terminal.candidateSha !== null || terminal.authorized !== false) {
    return { ok: false, reason: 'release_receipt_contradictory' };
  }
  for (const [step, file] of PREPARE_STEPS) { const r = one(step)[0]; if (r.status !== 'done' || r.file !== file) return { ok: false, reason: 'release_receipt_contradictory' }; }
  const files = Array.isArray(terminal.preparedSurface) ? terminal.preparedSurface.map(x => x && x.file) : [];
  if (files.length !== RELEASE_FILES.length || new Set(files).size !== RELEASE_FILES.length || RELEASE_FILES.some(f => !files.includes(f))) return { ok: false, reason: 'release_receipt_contradictory' };
  return { ok: true, binding: terminal };
}

function readChainReceipt(root) { try { return JSON.parse(fs.readFileSync(path.join(root, '.cache', 'chain-receipt.json'), 'utf8')); } catch (_) { return null; } }
function chainReceiptGreenness(root) {
  const r = readChainReceipt(root); if (!r) return { green: false, reason: 'chains_unverified' };
  const hp = gitProbe(root, ['rev-parse', 'HEAD']);
  if (!hp.ok) return { green: false, reason: 'chains_stale' };
  const head = hp.value;
  if (r.headSha && r.headSha !== head && r.headSha !== 'unknown') return { green: false, reason: 'chains_stale', receiptHead: r.headSha, currentHead: head };
  if (!Array.isArray(r.chains) || !r.chains.length) return { green: false, reason: 'chains_empty' };
  for (const c of r.chains) { const code = c.exitCode != null ? c.exitCode : c.exit; if (code !== 0 && !c.accepted_red) return { green: false, reason: 'chains_red', chain: c.name, exitCode: code }; }
  return { green: true };
}

function runVerify(root, o) {
  const tags = releaseTags(root); if (!tags.ok) return refuse(o.jsonMode, tags.reason, { exit_code: tags.exitCode });
  const issueCheck = issuesOkay(root, o.injectedIssues, tags.tags[0] || null); if (!issueCheck.ok) return refuse(o.jsonMode, issueCheck.reason, { exit_code: issueCheck.exitCode });
  const missing = issueCheck.missing, unknown = issueCheck.unknown;
  const changelog = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
  const changelogRefs = unreleasedSection(changelog).refs;
  const logProbe = gitProbe(root, ['log', '--format=%s %b', tags.tags[0] ? tags.tags[0] + '..HEAD' : 'HEAD']);
  const log = logProbe.ok ? logProbe.value : '';
  const closed = [...new Set([...(o.injectedIssues || []), ...[...log.matchAll(/#(\d+)/g)].map(m => Number(m[1]))])];
  const greenness = chainReceiptGreenness(root);
  const envelope = { verification: o.injectedIssues === null ? 'offline' : 'online', changelog_refs: changelogRefs, closed_issues: closed, chain_greenness: greenness };
  if (!greenness.green) envelope.chain_warning = greenness.reason;
  if (unknown.length) return refuse(o.jsonMode, 'changelog_unknown_reference', { unknown, ...envelope }, 'verify: REFUSED changelog_unknown_reference');
  if (missing.length) return refuse(o.jsonMode, 'changelog_incomplete', { missing, ...envelope }, 'verify: REFUSED changelog_incomplete');
  return emit(o.jsonMode, { result: 'ok', ...envelope }, 'verify: ok (verification=' + envelope.verification + ')');
}

function runPrepare(root, o) {
  if (!semver(o.version)) return refuse(o.jsonMode, 'missing_or_invalid_version');
  const tags = releaseTags(root); if (!tags.ok) return refuse(o.jsonMode, tags.reason, { exit_code: tags.exitCode });
  const status = trackedStatus(root); if (!status.ok) return refuse(o.jsonMode, status.reason, { exit_code: status.exitCode });
  const rows = receipt(root);
  if (rows === null && fs.existsSync(receiptPath(root))) return refuse(o.jsonMode, 'release_receipt_unparseable');
  const prior = binding(rows || [], o.version);
  if (prior) {
    if (prior.rootVersion !== o.version || (o.codexVersionOverride && prior.codexVersion !== o.codexVersionOverride)) return refuse(o.jsonMode, 'receipt_binding_mismatch');
    if (!sameSurface(root, prior.preparedSurface)) return refuse(o.jsonMode, 'prepared_surface_stale');
    return emit(o.jsonMode, { result: 'ok', mode: 'prepare', idempotent: true, version: o.version, codex_version: prior.codexVersion, prepared_surface: prior.preparedSurface }, 'prepare: ok (idempotent)');
  }
  if (latestRowsForOtherVersion(rows || [], o.version) || (rows || []).some(r => r.step === 'prepare_binding' && r.version !== o.version)) return refuse(o.jsonMode, 'stale_release_receipt');
  let start = startedBinding(rows || [], o.version);
  if (!start) {
    if (status.value) return refuse(o.jsonMode, 'dirty_worktree');
    const lastTag = tags.tags[0] || null;
    const last = lastTag ? lastTag.slice(RELEASE_TAG_PREFIX.length) : null;
    if (last && cmp(o.version, last) <= 0) return refuse(o.jsonMode, 'non_monotonic_version');
    if (!last && !o.codexVersionOverride) return refuse(o.jsonMode, 'codex_version_underivable');
    const ls = lockstep(root); if (!ls.ok) return refuse(o.jsonMode, ls.reason);
    const codexVersion = o.codexVersionOverride || bump(ls.baseline, bumpKind(last, o.version));
    if (!semver(codexVersion) || cmp(codexVersion, ls.baseline) <= 0) return refuse(o.jsonMode, 'non_monotonic_codex_version');
    const issueCheck = issuesOkay(root, o.injectedIssues, lastTag); if (!issueCheck.ok) return refuse(o.jsonMode, issueCheck.reason, { exit_code: issueCheck.exitCode });
    if (issueCheck.unknown.length) return refuse(o.jsonMode, 'changelog_unknown_reference', { unknown: issueCheck.unknown });
    const missing = issueCheck.missing; if (missing.length) return refuse(o.jsonMode, 'changelog_incomplete', { missing });
    if (!RELEASE_FILES.every(rel => fs.existsSync(path.join(root, rel)))) return refuse(o.jsonMode, 'release_surface_missing');
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    if (!/^##\s+\[Unreleased\]/m.test(changelog)) return refuse(o.jsonMode, 'no_unreleased_section');
    const hp = gitProbe(root, ['rev-parse', 'HEAD']); if (!hp.ok) return refuse(o.jsonMode, 'git_head_unavailable', { exit_code: hp.exitCode });
    start = { step: 'prepare_binding', status: 'done', version: o.version, rootVersion: o.version, codexVersion, codexVersionSource: o.codexVersionOverride ? 'explicit' : 'derived', codexBaseline: ls.baseline, baselineSha: hp.value, date: o.releaseDate || new Date().toISOString().slice(0, 10) };
    append(root, start);
  } else {
    if (o.codexVersionOverride && o.codexVersionOverride !== start.codexVersion) return refuse(o.jsonMode, 'receipt_binding_mismatch');
    const changed = status.value.split('\n').filter(Boolean).map(x => x.slice(3));
    if (changed.some(rel => !RELEASE_FILES.includes(rel))) return refuse(o.jsonMode, 'dirty_worktree', { changed });
  }
  const codexVersion = start.codexVersion, date = start.date;
  let liveRows = receipt(root) || [];
  const doStep = (step, rel, fn) => { if (!liveRows.some(r => r.step === step && r.version === o.version && r.status === 'done')) { fn(); append(root, { step, status: 'done', version: o.version, file: rel }); liveRows = receipt(root) || []; } };
  doStep('prepare_changelog', 'CHANGELOG.md', () => { const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'); if (!text.includes(`## [${o.version}] - ${date}`)) fs.writeFileSync(path.join(root, 'CHANGELOG.md'), text.replace(/^##\s+\[Unreleased\]/m, `## [${o.version}] - ${date}`)); });
  doStep('prepare_package', 'package.json', () => { const pkg = jsonFile(root, 'package.json'); pkg.version = o.version; fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n'); });
  CODEX_MANIFEST_RELPATHS.forEach((rel, i) => doStep('prepare_codex_' + i, rel, () => { const m = jsonFile(root, rel); m.version = codexVersion; fs.writeFileSync(path.join(root, rel), JSON.stringify(m, null, 2) + '\n'); }));
  CLAUDE_MANIFEST_RELPATHS.forEach((rel, i) => doStep('prepare_claude_' + i, rel, () => { const m = jsonFile(root, rel); m.version = o.version; fs.writeFileSync(path.join(root, rel), JSON.stringify(m, null, 2) + '\n'); }));
  doStep('prepare_readme', 'README.md', () => { let readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8'); readme = readme.replace(/(Codex `kaola-workflow[^`]*` plugin manifest: `)[^`]*/g, '$1' + codexVersion).replace(/(Claude Code command install, [^:]+: `)[^`]*/g, '$1' + o.version); fs.writeFileSync(path.join(root, 'README.md'), readme); });
  const surface = preparedSurface(root);
  append(root, { step: 'prepared', status: 'done', version: o.version, rootVersion: o.version, codexVersion, codexVersionSource: start.codexVersionSource, baselineSha: start.baselineSha, date, preparedSurface: surface, candidateSha: null, authorized: false });
  return emit(o.jsonMode, { result: 'ok', mode: 'prepare', version: o.version, codex_version: codexVersion, codex_version_source: o.codexVersionOverride ? 'explicit' : 'derived', prepared_surface: surface, tag: null, candidate_authorized: false }, `prepare: ok — commit only the ${RELEASE_FILES.length} release files, then run the offline full chain`);
}

function chainCheck(root, candidate) {
  let r; try { r = JSON.parse(fs.readFileSync(path.join(root, '.cache', 'chain-receipt.json'), 'utf8')); } catch (_) { return { ok: false, reason: 'chains_unverified' }; }
  if (!r.headSha || r.headSha === 'unknown' || r.headSha !== candidate || r.workTreeHash !== 'clean') return { ok: false, reason: 'chains_stale' };
  if (!Array.isArray(r.chains) || !r.chains.length) return { ok: false, reason: 'chains_empty' };
  let pkg; try { pkg = jsonFile(root, 'package.json'); } catch (_) {}
  const expected = ['claude', 'codex', 'gitlab', 'gitea'].filter(n => pkg && pkg.scripts && typeof pkg.scripts['test:kaola-workflow:' + n] === 'string');
  if (!expected.length) return { ok: false, reason: 'repo_kind_undetermined' };
  const names = new Set(r.chains.map(c => c.name)); if (expected.some(n => !names.has(n))) return { ok: false, reason: 'chains_incomplete' };
  if (r.chains.some(c => c.exitCode !== 0 && c.accepted_red !== true)) return { ok: false, reason: 'chains_red' };
  if (r.chains.some(c => c.accepted_red === true)) return { ok: false, reason: 'chains_waived' };
  return { ok: true, receipt: r };
}
function contentMatches(root, b) {
  const pkg = jsonFile(root, 'package.json'); if (!pkg || pkg.version !== b.rootVersion) return 'package_version_mismatch';
  for (const rel of CODEX_MANIFEST_RELPATHS) { const m = jsonFile(root, rel); if (!m || m.version !== b.codexVersion) return 'codex_manifest_mismatch'; }
  for (const rel of CLAUDE_MANIFEST_RELPATHS) { const m = jsonFile(root, rel); if (!m || m.version !== b.rootVersion) return 'claude_manifest_mismatch'; }
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  if (CODEX_MANIFEST_RELPATHS.some(rel => !readme.includes('Codex `' + rel.split('/')[1].replace(/^kaola-workflow$/, 'kaola-workflow') + '` plugin manifest: `' + b.codexVersion + '`'))) return 'readme_version_mismatch';
  for (const edition of ['Git' + 'Hub', 'Git' + 'Lab', 'Git' + 'ea']) if (!readme.includes(`Claude Code command install, ${edition} edition: \`${b.rootVersion}\``)) return 'readme_version_mismatch';
  if (!fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').includes(`## [${b.rootVersion}] - ${b.date}`)) return 'changelog_heading_mismatch';
  if (!sameSurface(root, b.preparedSurface)) return 'prepared_surface_stale';
  return null;
}
function tagTreeMatches(root, tag, b) {
  if (process.env.KAOLA_RELEASE_TEST_FAIL_POST_CREATE_SHOW === '1' && String(tag).startsWith(RELEASE_TAG_PREFIX)) return false;
  for (const item of b.preparedSurface) {
    const p = gitProbe(root, ['show', tag + ':' + item.file], null); if (!p.ok) return false; const bytes = p.value;
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) return false;
  }
  return true;
}
function candidateSurfaceOkay(root, baseline, candidate) {
  if (!baseline) return { ok: false, reason: 'candidate_baseline_unavailable' };
  const bp = gitProbe(root, ['rev-parse', '--verify', baseline + '^{commit}']); if (!bp.ok) return { ok: false, reason: 'candidate_baseline_unavailable', exitCode: bp.exitCode };
  if (bp.value !== baseline) return { ok: false, reason: 'candidate_surface_mismatch' };
  const hp = gitProbe(root, ['rev-list', '--count', baseline + '..' + candidate]); if (!hp.ok) return { ok: false, reason: 'candidate_history_unavailable', exitCode: hp.exitCode };
  if (hp.value !== '1') return { ok: false, reason: 'candidate_surface_mismatch' };
  const dp = gitProbe(root, ['diff', '--name-status', baseline, candidate]); if (!dp.ok) return { ok: false, reason: 'candidate_diff_unavailable', exitCode: dp.exitCode };
  const out = dp.value;
  const rows = out ? out.split('\n').filter(Boolean) : [];
  return rows.length === RELEASE_FILES.length && rows.every(line => line.startsWith('M\t')) && RELEASE_FILES.every(file => rows.includes('M\t' + file))
    ? { ok: true } : { ok: false, reason: 'candidate_surface_mismatch' };
}
function samePreparedSurface(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function validatePublication(rows, version, prepared, candidate, chainHeadSha, tag, existing) {
  const terminals = rows.filter(r => r.step === 'tag_authorized' || r.step === 'tag_complete');
  if (!terminals.length) return existing ? { ok: false, reason: 'publication_receipt_incomplete' } : { ok: true, state: 'new' };
  if (terminals.some(r => r.version !== version)) return { ok: false, reason: 'publication_receipt_contradictory' };
  const auths = terminals.filter(r => r.step === 'tag_authorized');
  const completes = terminals.filter(r => r.step === 'tag_complete');
  if (auths.length !== 1 || completes.length !== 1) {
    return { ok: false, reason: auths.length > 1 || completes.length > 1 ? 'publication_receipt_contradictory' : 'publication_receipt_incomplete' };
  }
  const auth = auths[0], complete = completes[0];
  const common = r => r.status === 'done' && r.version === version && r.candidateSha === candidate &&
    r.rootVersion === prepared.rootVersion && r.codexVersion === prepared.codexVersion &&
    samePreparedSurface(r.preparedSurface, prepared.preparedSurface) && r.chainHeadSha === chainHeadSha && r.tag === tag;
  if (!common(auth) || !common(complete) || existing !== candidate) return { ok: false, reason: 'publication_receipt_contradictory' };
  return { ok: true, state: 'complete', authorization: auth, completion: complete };
}
function runTag(root, o) {
  if (!semver(o.version)) return refuse(o.jsonMode, 'missing_or_invalid_version');
  const tags = releaseTags(root); if (!tags.ok) return refuse(o.jsonMode, tags.reason, { exit_code: tags.exitCode });
  const status = trackedStatus(root); if (!status.ok) return refuse(o.jsonMode, status.reason, { exit_code: status.exitCode });
  if (status.value) return refuse(o.jsonMode, 'dirty_worktree');
  const rows = receipt(root); if (rows === null) return refuse(o.jsonMode, fs.existsSync(receiptPath(root)) ? 'release_receipt_unparseable' : 'release_receipt_missing');
  if (!binding(rows || [], o.version)) return refuse(o.jsonMode, 'release_receipt_missing');
  const transaction = validateTransaction(rows || [], o.version); if (!transaction.ok) return refuse(o.jsonMode, transaction.reason);
  const b = transaction.binding;
  const hp = gitProbe(root, ['rev-parse', 'HEAD']); if (!hp.ok) return refuse(o.jsonMode, 'git_head_unavailable', { exit_code: hp.exitCode });
  const candidate = hp.value;
  const provenance = candidateSurfaceOkay(root, b.baselineSha, candidate); if (!provenance.ok) return refuse(o.jsonMode, provenance.reason, provenance.exitCode != null ? { exit_code: provenance.exitCode } : null);
  const mismatch = contentMatches(root, b); if (mismatch) return refuse(o.jsonMode, mismatch);
  const chain = chainCheck(root, candidate); if (!chain.ok) return refuse(o.jsonMode, chain.reason);
  const tag = RELEASE_TAG_PREFIX + o.version;
  let existing = null;
  if (tags.tags.includes(tag)) { const ep = gitProbe(root, ['rev-parse', '--verify', tag + '^{commit}']); if (!ep.ok) return refuse(o.jsonMode, 'tag_target_unavailable', { exit_code: ep.exitCode }); existing = ep.value; }
  if (existing && existing !== candidate) return refuse(o.jsonMode, 'tag_conflict');
  const publication = validatePublication(rows || [], o.version, b, candidate, chain.receipt.headSha, tag, existing);
  if (!publication.ok) return refuse(o.jsonMode, publication.reason);
  if (publication.state === 'complete') {
    if (!tagTreeMatches(root, tag, b)) return refuse(o.jsonMode, 'tag_binding_stale');
    return emit(o.jsonMode, { result: 'ok', mode: 'tag', idempotent: true, version: o.version, codex_version: b.codexVersion, candidate_sha: candidate, tag }, 'tag: ok (idempotent)');
  }
  if (!tagTreeMatches(root, candidate, b)) return refuse(o.jsonMode, 'candidate_tree_verification_failed');
  append(root, { step: 'tag_authorized', status: 'done', version: o.version, candidateSha: candidate, rootVersion: b.rootVersion, codexVersion: b.codexVersion, preparedSurface: b.preparedSurface, chainHeadSha: chain.receipt.headSha, tag });
  let created = false;
  if (!existing) { const cp = gitProbe(root, ['update-ref', 'refs/tags/' + tag, candidate, '0000000000000000000000000000000000000000']); if (!cp.ok) return refuse(o.jsonMode, 'tag_create_failed', { exit_code: cp.exitCode }); created = true; }
  const post = gitProbe(root, ['rev-parse', '--verify', tag + '^{commit}']);
  if (!post.ok || post.value !== candidate || !tagTreeMatches(root, tag, b)) {
    if (created) { const rollback = gitProbe(root, ['update-ref', '-d', 'refs/tags/' + tag, candidate]); if (!rollback.ok) return refuse(o.jsonMode, 'tag_rollback_failed', { exit_code: rollback.exitCode }); }
    return refuse(o.jsonMode, post.ok ? 'tag_tree_verification_failed' : 'tag_target_unavailable', post.ok ? null : { exit_code: post.exitCode });
  }
  append(root, { step: 'tag_complete', status: 'done', version: o.version, candidateSha: candidate, rootVersion: b.rootVersion, codexVersion: b.codexVersion, preparedSurface: b.preparedSurface, chainHeadSha: chain.receipt.headSha, tag });
  return emit(o.jsonMode, { result: 'ok', mode: 'tag', version: o.version, codex_version: b.codexVersion, candidate_sha: candidate, tag, tag_tree_verified: true }, 'tag: ok — ' + tag + ' -> ' + candidate);
}
function runCut(root, o) { return refuse(o.jsonMode, 'cut_compatibility_refusal', { sequence: ['--prepare --version X.Y.Z', 'commit only release files', 'run offline full chain receipt', 'pass --release-check', '--tag --version X.Y.Z'] }, 'cut: REFUSED — run prepare, commit only release files, run the offline full chain receipt, pass --release-check, then tag'); }
function runPush(root, o) {
  const p = jsonFile(root, 'package.json'), tag = p ? RELEASE_TAG_PREFIX + p.version : null;
  const guidance = ['Push the local tag to the remote:', '  git push origin ' + (tag || '<tag>'), '', 'Then run the forge release-create command with --latest to publish the release.', 'Example for a forge that supports a release-create command:', '  <forge-cli> release create ' + (tag || '<tag>') + ' --notes-from-tag --latest', '', 'No forge binary (forge CLI) is invoked by this script; the publish step', 'remains a manual or forge-specific step.'].join('\n');
  return emit(o.jsonMode, { result: 'ok', version: p && p.version, tag, guidance }, guidance);
}

function main(argv) {
  const args = argv.slice(2), jsonMode = hasFlag(args, '--json');
  const root = path.resolve(process.env.KAOLA_RELEASE_ROOT || flagVal(args, '--root') || process.cwd());
  const rawIssues = flagVal(args, '--issues-closed'); const injectedIssues = rawIssues === null ? null : rawIssues.split(',').filter(Boolean).map(Number);
  const o = { jsonMode, version: flagVal(args, '--version'), codexVersionOverride: flagVal(args, '--codex-version'), releaseDate: process.env.KAOLA_RELEASE_DATE || flagVal(args, '--date'), injectedIssues };
  if (hasFlag(args, '--verify')) return process.exit(runVerify(root, o));
  if (hasFlag(args, '--prepare')) return process.exit(runPrepare(root, o));
  if (hasFlag(args, '--tag')) return process.exit(runTag(root, o));
  if (hasFlag(args, '--cut')) return process.exit(runCut(root, o));
  if (hasFlag(args, '--push')) return process.exit(runPush(root, o));
  process.stderr.write('kaola-workflow-release: usage: --verify | --prepare --version X.Y.Z [--codex-version A.B.C] | --tag --version X.Y.Z | --cut | --push [--json]\n'); process.exit(1);
}
main(process.argv);
