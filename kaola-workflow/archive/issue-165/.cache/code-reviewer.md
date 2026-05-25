# code-reviewer (model=opus) — issue-165 closure-audit

Reviewed: scripts/kaola-workflow-closure-audit.js (+ byte-identical plugin copy),
simulate-workflow-walkthrough.js test additions, validate-script-sync.js. Review only.

## Scope & contract verification — ALL PASS
- No claim.js / gitlab / gitea changes (git status confirms only the 4 in-scope files
  + issue-165 roadmap source/folder). COMMON_SCRIPTS entry correct (GitHub-edition-only by design).
- OFFLINE contract correct: detectStaleLabels (:131) & detectUnarchivedPrFolders (:174) return
  'skipped_offline' ONLY under OFFLINE. Online gh failure -> [] + stderr warning (:135-138) or
  per-PR continue (:182); never mislabeled as skipped.
- collectClosedSet (:62) is the ONLY issueIsClosed caller; dedupes via seen set;
  readActiveFolders called with excludeClosedIssues:false (:192) so it fires no own probes.
- executeRepairs(root, report) (:225) reads only report.drift.*; no detector re-invoked.
- Report-only safety: active folders + unarchived-PR folders only under reported_not_repaired
  (:257-260); testClosureAuditExecuteNeverTouchesActiveFolders proves folder survives --execute.
- Function sizes < 50 lines; file 295 lines (< 800); no debug statements (stderr = intentional warnings).

## Findings
- [MEDIUM] counts omitted mirror_lists_closed_issues (drift had 5 classes, counts 4).
  Real contract gap on a "locked shape". -> FIXED: added `mirror_lists_closed_issues: mirrorClosed.length`
  to counts; added counts assertion to testClosureAuditMirrorListsClosedIssues.
- [LOW] executeRepairs reports labels_failed but not roadmap_sources_failed (non-ENOENT unlink
  failure only goes to stderr, not JSON). -> follow-up (or document asymmetry).
- [LOW] New script not yet in README/docs/architecture/api. -> addressed in Phase 6 (docs step).

## Cleared (no finding)
- Mock-shim arg matching (pr view vs issue view) — exclusive else-if, no fixture collision.
- counts offline behavior — Array.isArray guards coerce 'skipped_offline' to 0.
- gitlab/gitea sync — out of scope by design; validator passes.

## Verdict
0 CRITICAL, 0 HIGH, 1 MEDIUM (fixed), 2 LOW (follow-ups). Well-structured, in-scope, fully tested.
