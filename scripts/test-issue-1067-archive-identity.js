#!/usr/bin/env node
'use strict';
// Real linked checkouts reproduce a main-only new claim beside two historical copies.
// Direct production entry points pin identity decisions; test-sink-merge additionally
// drives the complete CLI transaction and inspects the committed archive bytes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('./test-git-fixture');
const { spawnSync } = require('child_process');
const editions = {
 canonical: path.join(__dirname, 'kaola-workflow-'),
 codex: path.join(__dirname, '../plugins/kaola-workflow/scripts/kaola-workflow-'),
 gitlab: path.join(__dirname, '../plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-'),
 gitea: path.join(__dirname, '../plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-'),
};
const edition = process.argv[2];
if (!edition) {
 let failed = false;
 for (const name of Object.keys(editions)) {
  const result = spawnSync(process.execPath, [__filename, name], {stdio:'inherit'});
  if (result.status !== 0) failed = true;
 }
 process.exit(failed ? 1 : 0);
}
if (!editions[edition]) throw new Error('Unknown edition ' + edition);
const prefix = editions[edition];
const { mirrorFinalizationArtifacts, resolveFinalizeAuthority } = require(prefix + 'claim.js');
const { sinkPreflight, resolveSinkReceiptPath, resolveRunRecordDir } = require(prefix + 'sink-merge.js');
const { resolveScope, partitionDriftByScope } = require(prefix + 'closure-audit.js');
let failures = 0;
let checks = 0;
function check(ok, msg) { checks++; if (!ok) { failures++; console.error('FAIL: ' + msg); } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1067-'));
const root = path.join(tmp, 'main');
const wt = path.join(tmp, 'linked');
const project = 'issue-1067';
const old = 'kaola-workflow/archive/' + project;
const current = old + '.archived-2026-09-12T13-08-06-899Z';
function write(base, rel, text) { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
function state(ts, status) { return 'status: ' + status + '\nissue_number: 1067\nclaim_ts: ' + ts + '\nclaim_identity_digest: ' + ts + '\nworktree_path: ' + wt + '\nbranch: workflow/issue-1067\n'; }
const fresh = state('2026-09-12T12:00:00.000Z', 'active');
try {
 fs.mkdirSync(root); G.init(root, { branch: 'main' });
 write(root, 'README.md', 'fixture\n'); write(root, old + '/mission-list.md', '# Historical doc pointer\n');
 G.git(root, ['add', '.']); G.git(root, ['commit', '-m', 'historical run']);
 G.git(root, ['worktree', 'add', '-b', 'workflow/issue-1067', wt]);
 write(root, 'kaola-workflow/' + project + '/workflow-state.md', fresh);
 const result = mirrorFinalizationArtifacts(wt, project);
 check(result.mirror === 'mirrored', 'new main claim must mirror despite tracked historical archive in two real directories: ' + JSON.stringify(result));
 check(fs.existsSync(path.join(wt, 'kaola-workflow', project, 'workflow-state.md')), 'current live state must reach linked worktree');
 fs.rmSync(path.join(wt, 'kaola-workflow', project), { recursive: true, force: true });
 write(root, current + '/workflow-state.md', state('2026-09-12T12:00:00.000Z', 'closed'));
 check(mirrorFinalizationArtifacts(wt, project).mirror === 'skipped_post_archive', 'same claim already archived must not resurrect surviving stale main live state');
 check(fs.realpathSync(resolveFinalizeAuthority(wt, project).authorityDir) === fs.realpathSync(path.join(root, current)), 'linked crash resume selects the sole state-bearing archive despite two historical doc copies');
 fs.rmSync(path.join(root, 'kaola-workflow', project), { recursive: true });
 G.git(root, ['worktree', 'remove', '--force', wt]);
 write(root, 'foreign.txt', 'must remain foreign\n');
 let pre = sinkPreflight(root, project, 'workflow/issue-1067');
 check(!pre.ok, 'foreign dirt must refuse');
 check(!JSON.stringify(pre).includes(current + '/workflow-state.md'), 'current collision archive must not be foreign dirt: ' + JSON.stringify(pre));
 check(JSON.stringify(pre).includes('foreign.txt'), 'foreign file remains reported');
 const journal = resolveSinkReceiptPath(root, project);
 check(journal === path.join(root, current, '.cache/sink-receipt.json'), 'new journal must follow current claim archive, got ' + journal);
 check(resolveRunRecordDir(root, project, null) === path.join(root, current), 'durable findings follow current archive when caller has no explicit destination');
 check(resolveFinalizeAuthority(root, project).authorityDir === path.join(root, current), 'one claimed archive can resume beside a doc-only historical folder');
 const scope = resolveScope(root, {project, issues: []});
 const split = partitionDriftByScope({archive_content_incomplete: [{project, missing:['workflow-state.md']}]}, scope);
 check(split.inScope.archive_content_incomplete.length === 0, 'old unclaimed archive finding must not contaminate current claim scope');
 check(split.outScope.archive_content_incomplete.length === 1, 'historical finding remains visible outside scope');
 write(root, old + '.archived-older/workflow-state.md', state('2026-08-01T00:00:00.000Z', 'closed'));
 pre = sinkPreflight(root, project, 'workflow/issue-1067');
 check(JSON.stringify(pre).includes('.archived-older/workflow-state.md'), 'other same-name run dirt must remain foreign');
 check(resolveFinalizeAuthority(root, project).innerReason === 'archive_authority_ambiguous', 'two claimed historical archives without live anchor must not be chosen by timestamp');
 const ambiguous = resolveScope(root, {project, issues: []});
 check(ambiguous.archive_name_ambiguous, 'multiple claimed histories remain ambiguous in scoped audit');
 let refusedJournal = false;
 try { resolveSinkReceiptPath(root, project); } catch (error) { refusedJournal = /archive_authority_ambiguous/.test(error.message); }
 check(refusedJournal, 'ambiguous archives must not receive a guessed journal');
 write(root, current + '/.cache/sink-receipt.json', JSON.stringify({project, branch:'workflow/issue-1067', claim_ts:'2026-09-12T12:00:00.000Z', archive_dest:current}));
 check(resolveSinkReceiptPath(root, project, 'workflow/issue-1067') === path.join(root, current, '.cache/sink-receipt.json'), 'existing sink transaction can resume its exact archive beside older claimed histories');
 write(root, 'kaola-workflow/' + project + '/workflow-state.md', fresh);
 const liveScope = resolveScope(root, {project, issues: []});
 check(liveScope.state_file === 'kaola-workflow/' + project + '/workflow-state.md', 'live claim takes scope authority before any archive');
 const liveSplit = partitionDriftByScope({archive_content_incomplete: [{project, missing:['workflow-state.md']}]}, liveScope);
 check(liveSplit.inScope.archive_content_incomplete.length === 0, 'historical archive drift cannot contaminate live claim');
 fs.rmSync(path.join(root, 'kaola-workflow', project), {recursive:true});
 fs.rmSync(path.join(root, old + '.archived-older'), {recursive:true});
 const externalState = path.join(tmp, 'external-state.md');
 fs.renameSync(path.join(root, current, 'workflow-state.md'), externalState);
 fs.symlinkSync(externalState, path.join(root, current, 'workflow-state.md'));
 check(resolveRunRecordDir(root, project, null) === null, 'symlinked state cannot authorize a new suffix binding');
 fs.unlinkSync(path.join(root, current, 'workflow-state.md'));
 fs.renameSync(externalState, path.join(root, current, 'workflow-state.md'));
 const externalArchive = path.join(tmp, 'external-archive');
 fs.renameSync(path.join(root, current), externalArchive);
 fs.symlinkSync(externalArchive, path.join(root, current));
 check(resolveRunRecordDir(root, project, null) === null, 'symlinked archive directory cannot authorize a new suffix binding');
} finally { fs.rmSync(tmp, {recursive:true, force:true}); }
console.log('Issue 1067 archive identity (' + edition + '): ' + checks + ' checks, ' + failures + ' failures');
process.exitCode = failures ? 1 : 0;
