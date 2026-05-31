#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// splitSections(text) -> { [header]: bodyString }
// Splits markdown into sections keyed by ## header text.
// Content before the first ## is ignored. Never throws.
// ---------------------------------------------------------------------------
function splitSections(text) {
  if (typeof text !== 'string' || !text) return {};
  const lines = text.split('\n');
  const result = {};
  let currentKey = null;
  const accum = [];

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (currentKey !== null) {
        result[currentKey] = accum.join('\n');
      }
      currentKey = m[1];
      accum.length = 0;
    } else if (currentKey !== null) {
      accum.push(line);
    }
  }
  if (currentKey !== null) {
    result[currentKey] = accum.join('\n');
  }
  return result;
}

// ---------------------------------------------------------------------------
// parseStatus(sections) -> string
// Returns one of PASSED|IN_PROGRESS|REVIEW|ESCALATED or 'UNKNOWN'.
// ---------------------------------------------------------------------------
function parseStatus(sections) {
  const body = sections['Status'] || '';
  const lines = body.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t) {
      const up = t.toUpperCase();
      if (['PASSED', 'IN_PROGRESS', 'REVIEW', 'ESCALATED'].includes(up)) return up;
      return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// parseEscalationReason(sections, status) -> string|null
// CRITICAL: keyed off status, NOT off escalation text.
// issue-184's N/A body must contribute nothing (status PASSED → return null).
// ---------------------------------------------------------------------------
function parseEscalationReason(sections, status) {
  if (status !== 'ESCALATED') return null;
  const body = sections['Escalation'] || '';
  const lines = body.split('\n');
  let firstNonBlank = '';
  for (const line of lines) {
    const t = line.trim();
    if (t) { firstNonBlank = t; break; }
  }
  if (!firstNonBlank) return '(unspecified)';

  // Strip leading 'escalated_to_full:' prefix if present.
  let reason = firstNonBlank.replace(/^escalated_to_full:\s*/i, '').trim();
  if (!reason) return '(unspecified)';

  // Normalize: substring up to first ' — ' (space + U+2014 + space) if present,
  // else first 60 chars. Trim the result.
  const emDashSep = ' — ';
  const idx = reason.indexOf(emDashSep);
  if (idx !== -1) {
    reason = reason.substring(0, idx).trim();
  } else {
    reason = reason.substring(0, 60).trim();
  }
  return reason || '(unspecified)';
}

// ---------------------------------------------------------------------------
// parseFileCount(sections) -> number|'unknown'
// Counts backtick spans in Scope that look like file paths.
// ---------------------------------------------------------------------------
function parseFileCount(sections) {
  const body = sections['Scope'];
  if (!body) return 'unknown';

  const spans = [];
  const re = /`([^`]+)`/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    spans.push(m[1]);
  }

  let count = 0;
  for (const span of spans) {
    // Must contain '/' with no internal whitespace AND end with an extension.
    if (/^\S+\/\S+$/.test(span) && /\.[A-Za-z0-9]+$/.test(span)) {
      count++;
    }
  }
  return count === 0 ? 'unknown' : count;
}

// ---------------------------------------------------------------------------
// parseReviewMode(sections, status) -> 'delegated'|'self-review'|'escalated'
// Precedence:
//   1. status === 'ESCALATED' -> 'escalated'
//   2. Required Agent Compliance code-reviewer row records a performed review —
//      the legacy `invoked` token OR any typed Codex delegation status
//      (subagent-invoked / local-fallback-explicit / local-fallback-tool-unavailable)
//      -> 'delegated'
//   3. else (N/A, or no code-reviewer row) -> 'self-review'
// Section-scoped: only checks Required Agent Compliance, not Review prose.
// ---------------------------------------------------------------------------
function parseReviewMode(sections, status) {
  if (status === 'ESCALATED') return 'escalated';
  const racBody = sections['Required Agent Compliance'] || '';
  if (/\bcode-reviewer\s*\|\s*(?:subagent-invoked|local-fallback-explicit|local-fallback-tool-unavailable|invoked)\b/i.test(racBody)) return 'delegated';
  return 'self-review';
}

// ---------------------------------------------------------------------------
// parseFastSummary(text) -> { status, escalationReason, fileCount, reviewMode }
// ---------------------------------------------------------------------------
function parseFastSummary(text) {
  const sections = splitSections(text);
  const status = parseStatus(sections);
  const escalationReason = parseEscalationReason(sections, status);
  const fileCount = parseFileCount(sections);
  const reviewMode = parseReviewMode(sections, status);
  return { status, escalationReason, fileCount, reviewMode };
}

// ---------------------------------------------------------------------------
// collectFastSummaryFiles(root) -> string[]
// Returns fast-summary.md paths from archive/ subdirs (first) and active
// kaola-workflow/ subdirs (excl. 'archive'). Never throws.
// ---------------------------------------------------------------------------
function collectFastSummaryFiles(root) {
  const files = [];

  // Archive files.
  const archiveRoot = path.join(root, 'kaola-workflow', 'archive');
  try {
    if (fs.existsSync(archiveRoot) && fs.statSync(archiveRoot).isDirectory()) {
      const entries = fs.readdirSync(archiveRoot);
      for (const entry of entries) {
        const candidate = path.join(archiveRoot, entry, 'fast-summary.md');
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            files.push(candidate);
          }
        } catch (_) { /* skip */ }
      }
    }
  } catch (_) { /* skip */ }

  // Active files (kaola-workflow/* excluding archive).
  const activeRoot = path.join(root, 'kaola-workflow');
  try {
    if (fs.existsSync(activeRoot) && fs.statSync(activeRoot).isDirectory()) {
      const entries = fs.readdirSync(activeRoot);
      for (const entry of entries) {
        if (entry === 'archive') continue;
        const candidate = path.join(activeRoot, entry, 'fast-summary.md');
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            files.push(candidate);
          }
        } catch (_) { /* skip */ }
      }
    }
  } catch (_) { /* skip */ }

  return files;
}

// ---------------------------------------------------------------------------
// audit(root) -> report
// ---------------------------------------------------------------------------
function audit(root) {
  const report = {
    totalRuns: 0,
    statusCounts: { PASSED: 0, IN_PROGRESS: 0, REVIEW: 0, ESCALATED: 0, UNKNOWN: 0 },
    escalationHistogram: {},
    fileCountDistribution: {},
    reviewModeCounts: { delegated: 0, 'self-review': 0, escalated: 0 },
  };

  const summaryFiles = collectFastSummaryFiles(root);

  for (const filePath of summaryFiles) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue; // Skip unreadable files.
    }

    // Parsers are total — always yield a record.
    const parsed = parseFastSummary(text);
    report.totalRuns++;

    // Status counts.
    if (parsed.status in report.statusCounts) {
      report.statusCounts[parsed.status]++;
    } else {
      report.statusCounts.UNKNOWN++;
    }

    // Escalation histogram (only for ESCALATED runs).
    if (parsed.escalationReason !== null) {
      const key = parsed.escalationReason;
      report.escalationHistogram[key] = (report.escalationHistogram[key] || 0) + 1;
    }

    // File-count distribution.
    const fcKey = String(parsed.fileCount);
    report.fileCountDistribution[fcKey] = (report.fileCountDistribution[fcKey] || 0) + 1;

    // Review mode counts.
    const rm = parsed.reviewMode;
    if (rm in report.reviewModeCounts) {
      report.reviewModeCounts[rm]++;
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// formatTable(report) -> string
// ---------------------------------------------------------------------------
function formatTable(report) {
  const lines = [];

  // Section 1: Status counts.
  lines.push('Fast-path runs: ' + report.totalRuns);
  lines.push('');
  lines.push('Status counts');
  lines.push('─'.repeat(30));
  const statusKeys = ['PASSED', 'IN_PROGRESS', 'REVIEW', 'ESCALATED', 'UNKNOWN'];
  for (const key of statusKeys) {
    const val = report.statusCounts[key] || 0;
    lines.push(key.padEnd(20) + String(val).padStart(6));
  }
  lines.push('');

  // Section 2: Escalation reasons.
  lines.push('Escalation reasons');
  lines.push('─'.repeat(30));
  const ehKeys = Object.keys(report.escalationHistogram);
  if (ehKeys.length === 0) {
    lines.push('(none)');
  } else {
    for (const key of ehKeys.sort()) {
      lines.push(key.padEnd(40) + String(report.escalationHistogram[key]).padStart(6));
    }
  }
  lines.push('');

  // Section 3: File-count distribution.
  lines.push('File-count distribution');
  lines.push('─'.repeat(30));
  const fcKeys = Object.keys(report.fileCountDistribution).sort((a, b) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return Number(a) - Number(b);
  });
  if (fcKeys.length === 0) {
    lines.push('unknown'.padEnd(20) + '     0');
  } else {
    for (const key of fcKeys) {
      lines.push(key.padEnd(20) + String(report.fileCountDistribution[key]).padStart(6));
    }
  }
  lines.push('');

  // Section 4: Review mode.
  lines.push('Review mode');
  lines.push('─'.repeat(30));
  const rmKeys = ['delegated', 'self-review', 'escalated'];
  for (const key of rmKeys) {
    const val = report.reviewModeCounts[key] || 0;
    lines.push(key.padEnd(20) + String(val).padStart(6));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// formatJson(report) -> string
// ---------------------------------------------------------------------------
function formatJson(report) {
  return JSON.stringify(report, null, 2);
}

// ---------------------------------------------------------------------------
// CLI wrapper
// ---------------------------------------------------------------------------
if (require.main === module) {
  const useJson = process.argv.includes('--json');
  const root = process.cwd();
  const report = audit(root);
  process.stdout.write((useJson ? formatJson(report) : formatTable(report)) + '\n');
  process.exit(0);
}

module.exports = {
  splitSections,
  parseStatus,
  parseEscalationReason,
  parseFileCount,
  parseReviewMode,
  parseFastSummary,
  collectFastSummaryFiles,
  audit,
  formatTable,
  formatJson,
};
