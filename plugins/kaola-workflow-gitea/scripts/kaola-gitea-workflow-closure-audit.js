#!/usr/bin/env node
'use strict';

// Closure-audit (issue #167, Gitea port of GitHub issue #165).
//
// Reports "closure drift" — completed work that still shows as active — across:
//   (a) stale kaola-workflow/.roadmap/issue-N.md sources for closed issues
//   (b) the generated ROADMAP.md still listing closed issues
//   (c) closed remote issues still carrying the workflow:in-progress label
//   (d) archive workflow-state.md says closed but the .roadmap source survives
//   (e) an active folder exists for a closed issue (report only)
//   (f) an active sink=pr folder whose PR is merged/closed but was never archived (report only)
//
// Dry-run JSON is the default. `--execute` repairs only SAFE local drift:
// it removes stale .roadmap sources, regenerates ROADMAP.md, and removes the
// in-progress label from closed issues when online. It NEVER deletes active
// folders or worktrees — that surface belongs to stale-worktree-check /
// stale-worktree-cleanup. Classes (e) and (f) are report-only in both modes.
//
// Dedicated Gitea script (not a claim.js subcommand) mirroring the GitHub
// kaola-workflow-closure-audit.js: it inlines its own parseArgs/assert and
// routes all remote I/O through the Gitea forge object (the `tea` CLI).
// execFileSync is kept only for isDirty's git porcelain probes.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  field,
  getRoot,
  issueIsClosed,
  probeIssueState,
  readActiveFolders
} = require('./kaola-gitea-workflow-active-folders');
const {
  regenerateRoadmap,
  readRoadmapIssues,
  roadmapDir
} = require('./kaola-gitea-workflow-roadmap');
const forge = require('./kaola-gitea-forge');

const CLAIM_LABEL = forge.CLAIM_LABEL;
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function parseArgs(argv) {
  const args = { execute: false };
  for (const a of argv) {
    if (a === '--execute') args.execute = true;
  }
  return args;
}

// The ONLY caller of probeIssueState. One remote probe per distinct issue number
// (dedupe), so the remote-call count is O(distinct N), not O(detectors x N).
// probeIssueState self-guards OFFLINE (returns {state:'open'}), so closed is empty offline.
function collectClosedSet(candidateNumbers) {
  const closed = new Set();
  const unresolved = [];
  const seen = new Set();
  for (const n of candidateNumbers) {
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    const probe = probeIssueState(n);
    if (probe.state === 'closed') closed.add(n);
    else if (probe.state === 'unavailable') unresolved.push(n);
  }
  return { closed, unresolved };
}

function roadmapSourceFiles(root) {
  const dir = roadmapDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => {
      const m = f.match(/^issue-(\d+)\.md$/);
      return m ? { issue_number: Number(m[1]), file: 'kaola-workflow/.roadmap/' + f } : null;
    })
    .filter(Boolean);
}

function archiveClosedIssues(root) {
  const set = new Set();
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  if (!fs.existsSync(archiveBase)) return set;
  for (const entry of fs.readdirSync(archiveBase, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    let content;
    try {
      content = fs.readFileSync(path.join(archiveBase, entry.name, 'workflow-state.md'), 'utf8');
    } catch (_) { continue; }
    if (field(content, 'status') !== 'closed') continue;
    // #336: a keep-open partial-close archive deliberately preserves its roadmap source; it
    // must never feed the archive_closed stale-source class (--execute would delete it).
    // 'closed_remote' still wins: if the kept-open issue is later genuinely closed on the
    // forge, that source becomes legitimately stale and the audit may remove it.
    if (field(content, 'issue_action') === 'comment_keep_open') continue;
    // D4: Gitea archives write issue_iid; fall back to issue_number for safety.
    const n = parseInt(field(content, 'issue_iid') || field(content, 'issue_number'), 10);
    if (Number.isInteger(n) && n > 0) set.add(n);
  }
  return set;
}

// (a)+(d): one entry per issue_number. 'closed_remote' wins over 'archive_closed'.
function detectStaleRoadmapSources(srcFiles, closedSet, archiveClosed) {
  const byNumber = new Map();
  for (const src of srcFiles) {
    const n = src.issue_number;
    let reason = null;
    if (closedSet.has(n)) reason = 'closed_remote';
    else if (archiveClosed.has(n)) reason = 'archive_closed';
    if (!reason) continue;
    const existing = byNumber.get(n);
    if (!existing || (existing.reason === 'archive_closed' && reason === 'closed_remote')) {
      byNumber.set(n, { issue_number: n, file: src.file, reason });
    }
  }
  return Array.from(byNumber.values()).sort((a, b) => a.issue_number - b.issue_number);
}

// (b): derived from the same closed-set.
function detectMirrorClosed(root, closedSet) {
  const out = [];
  for (const it of readRoadmapIssues(roadmapDir(root))) {
    const n = parseInt(String(it.issue).replace('#', ''), 10);
    if (Number.isInteger(n) && closedSet.has(n)) out.push(n);
  }
  return out;
}

// (c): remote-dependent. 'skipped_offline' only when OFFLINE; online remote failure
// reports an empty array plus a stderr warning (not a skip).
function detectStaleLabels() {
  if (OFFLINE) return 'skipped_offline';
  try {
    const issues = forge.listIssues({ state: 'closed', labels: [CLAIM_LABEL] });
    return issues.map(i => ({ number: i.number, title: i.title, url: i.url }));
  } catch (err) {
    if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return 'skipped_timeout';
    }
    process.stderr.write('closure-audit: tea issues list failed; reporting empty stale_in_progress_labels\n');
    return [];
  }
}

// Scoped to the folder subtree (worktree if present, else the active folder).
// #563: an UNPROBEABLE tree (held index.lock, EAGAIN/EMFILE, corrupt repo) fails CLOSED = treated as
// DIRTY, mirroring #557/#496/#552 — a probe that cannot PROVE the subtree clean must not report clean
// (that would let a crashed/dirty closure be reported safe). A genuinely-ABSENT path (no worktree, no
// project dir) still reads not-dirty: absence is provable, not a probe fault.
function isDirty(folder) {
  if (folder.worktree_path && fs.existsSync(folder.worktree_path)) {
    try {
      const out = execFileSync('git', ['-C', folder.worktree_path, 'status', '--porcelain'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.trim().length > 0;
    } catch (_) { return true; } // #563: unprobeable → fail-closed (dirty)
  }
  if (folder.project_dir && fs.existsSync(folder.project_dir)) {
    try {
      const out = execFileSync('git', ['-C', folder.project_dir, 'status', '--porcelain', '--', '.'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return out.trim().length > 0;
    } catch (_) { return true; } // #563: unprobeable → fail-closed (dirty)
  }
  return false;
}

// (e): report only.
function detectActiveClosedFolders(folders, closedSet) {
  const out = [];
  for (const f of folders) {
    if (f.issue_number != null && closedSet.has(f.issue_number)) {
      out.push({ project: f.project, issue_number: f.issue_number, dirty: isDirty(f) });
    }
  }
  return out;
}

// Resolve a PR number from a folder's pr_number or its pr_url (mirror claim.js prNumberFromFolder).
function prNumberFromFolder(f) {
  const direct = parseInt(f.pr_number, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const m = String(f.pr_url || '').match(/\/pulls\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// (f): remote-dependent, report only. 'skipped_offline' only when OFFLINE.
// PR state is already lowercase from forge.normalizeState — compare lowercase.
function detectUnarchivedPrFolders(folders) {
  if (OFFLINE) return 'skipped_offline';
  const out = [];
  for (const f of folders) {
    if (f.sink !== 'pr' || !f.pr_url) continue;
    const prNumber = prNumberFromFolder(f);
    if (!prNumber) continue;
    let state = '';
    try {
      state = String(forge.viewPullRequest(prNumber).state || '');
    } catch (err) {
      if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') return 'skipped_timeout';
      continue;
    }
    if (state === 'merged' || state === 'closed') {
      out.push({ project: f.project, issue_number: f.issue_number, pr_url: f.pr_url, pr_state: state });
    }
  }
  return out;
}

// Single detection pass. executeRepairs consumes this; it never re-detects.
function buildAuditReport(root) {
  const folders = readActiveFolders(root, { excludeClosedIssues: false });
  const srcFiles = roadmapSourceFiles(root);
  const archiveClosed = archiveClosedIssues(root);

  const candidates = srcFiles.map(s => s.issue_number)
    .concat(folders.map(f => f.issue_number).filter(n => n != null));
  const { closed: closedSet, unresolved } = collectClosedSet(candidates);

  const staleRoadmap = detectStaleRoadmapSources(srcFiles, closedSet, archiveClosed);
  const mirrorClosed = detectMirrorClosed(root, closedSet);
  const staleLabels = detectStaleLabels();
  const activeClosed = detectActiveClosedFolders(folders, closedSet);
  const unarchivedPr = detectUnarchivedPrFolders(folders);

  const drift = {
    stale_roadmap_sources: staleRoadmap,
    mirror_lists_closed_issues: mirrorClosed,
    stale_in_progress_labels: staleLabels,
    active_folder_for_closed_issue: activeClosed,
    unarchived_pr_folders: unarchivedPr
  };
  const counts = {
    stale_roadmap_sources: staleRoadmap.length,
    mirror_lists_closed_issues: mirrorClosed.length,
    stale_in_progress_labels: Array.isArray(staleLabels) ? staleLabels.length : 0,
    active_folder_for_closed_issue: activeClosed.length,
    unarchived_pr_folders: Array.isArray(unarchivedPr) ? unarchivedPr.length : 0
  };
  if (unresolved.length > 0) {
    drift.unresolved_closed_state = unresolved;
    counts.unresolved_closed_state = unresolved.length;
  }
  return { offline: OFFLINE, drift, counts };
}

// Consumes the report from buildAuditReport — does NOT re-run detection.
// Repairs only safe local roadmap sources + regenerate + remote label removal.
function executeRepairs(root, report) {
  const roadmapSourcesRemoved = [];
  for (const src of report.drift.stale_roadmap_sources) {
    const abs = path.join(roadmapDir(root), 'issue-' + src.issue_number + '.md');
    try {
      fs.unlinkSync(abs);
      roadmapSourcesRemoved.push(src.issue_number);
    } catch (e) {
      if (e.code === 'ENOENT') roadmapSourcesRemoved.push(src.issue_number);
      else process.stderr.write('closure-audit: failed to remove ' + src.file + ': ' + e.message + '\n');
    }
  }
  let roadmapRegenerated = false;
  try { regenerateRoadmap(root); roadmapRegenerated = true; } catch (_) { roadmapRegenerated = false; }

  const labelsRemoved = [];
  const labelsFailed = [];
  let labelsSkippedReason = null;
  const labels = report.drift.stale_in_progress_labels;
  if (labels === 'skipped_timeout') {
    labelsSkippedReason = 'detection_timeout';
  } else if (Array.isArray(labels)) {
    for (const it of labels) {
      // project ignored by forge.updateIssueLabels body today (forge:164-172); revisit if it starts consuming the arg.
      try { forge.updateIssueLabels(null, it.number, { remove: [CLAIM_LABEL] }); labelsRemoved.push(it.number); }
      catch (err) {
        labelsFailed.push(it.number);
        if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
          labelsSkippedReason = 'timeout';
          break;
        }
      }
    }
  }

  const repairedObj = {
    roadmap_sources_removed: roadmapSourcesRemoved,
    roadmap_regenerated: roadmapRegenerated,
    labels_removed: labelsRemoved,
    labels_failed: labelsFailed
  };
  if (labelsSkippedReason) repairedObj.labels_skipped_reason = labelsSkippedReason;

  return {
    repaired: repairedObj,
    reported_not_repaired: {
      active_folder_for_closed_issue: report.drift.active_folder_for_closed_issue,
      unarchived_pr_folders: report.drift.unarchived_pr_folders
    }
  };
}

function main() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(2));
  const report = buildAuditReport(root);
  if (args.execute) {
    const result = executeRepairs(root, report);
    process.stdout.write(JSON.stringify({
      dry_run: false,
      offline: report.offline,
      repaired: result.repaired,
      reported_not_repaired: result.reported_not_repaired
    }, null, 2) + '\n');
  } else {
    process.stdout.write(JSON.stringify({
      dry_run: true,
      offline: report.offline,
      drift: report.drift,
      counts: report.counts
    }, null, 2) + '\n');
  }
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write((err && err.message ? err.message : String(err)) + '\n'); process.exitCode = 1; }
}

module.exports = {
  buildAuditReport,
  executeRepairs,
  collectClosedSet,
  detectStaleRoadmapSources
};
