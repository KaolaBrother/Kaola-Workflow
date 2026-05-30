# Planner output — issue-197 (Fast-path calibration audit script)

## Files to touch (3, fast-eligible)
- `scripts/kaola-workflow-fast-audit.js` — new, read-only audit (pure functions + thin CLI). Node built-ins only (fs/path/os).
- `scripts/test-fast-audit.js` — new, hand-rolled assert, synthetic fixtures in os.tmpdir() — NEVER the real archive.
- `package.json` — 1-line registration in `test:kaola-workflow:claude` (before simulate-workflow-walkthrough.js).

Fast-path bounds: 3 additive files, no new deps, no API/schema break, no security/arch concern. package.json edit is trivial test-runner wiring (analogous to test-release-surface-drift.js registration).

## Audit script — function decomposition (all module.exports except CLI wrapper)
- `splitSections(text) -> {header: body}` — single shared helper. `/^##\s+(.+?)\s*$/` opens sections; accumulate to next `##`/EOF. Garbage → {}.
- `parseStatus(sections) -> 'PASSED'|'IN_PROGRESS'|'REVIEW'|'ESCALATED'|'UNKNOWN'` — first non-blank line of Status, uppercased; unknown/missing → 'UNKNOWN'.
- `parseEscalationReason(sections, status) -> string|null` — **keys off status==='ESCALATED'** (NOT escalation!='N/A'; issue-184 has `N/A — stayed within bounds...`). Strip `escalated_to_full:` prefix; normalize key to head: substring up to first ` — ` or 60 chars. issue-75 → `scope exceeds fast-path`. ESCALATED with empty body → `(unspecified)`. Non-escalated → null.
- `parseFileCount(sections) -> number|'unknown'` — **path-discriminator** over backtick spans `/` + no internal whitespace + ends in `/\.[A-Za-z0-9]+$/`. Excludes `myFunc()`, `npm run test:x`, `node scripts/x.js` (whitespace). n===0 → 'unknown'. Missing Scope → 'unknown'. Verified: 189→2,107→2,100→2,74/60/184→unknown.
- `parseReviewMode(sections, status) -> 'delegated'|'self-review'|'escalated'` — precedence: ESCALATED→escalated; else section-scoped Required Agent Compliance body `/\bcode-reviewer\s*\|\s*invoked\b/i`→delegated; else self-review. Verified: delegated=12, self-review=5, escalated=1.
- `parseFastSummary(text) -> {status, escalationReason, fileCount, reviewMode}`.
- `collectFastSummaryFiles(root) -> string[]` — archive root `root/kaola-workflow/archive/*/fast-summary.md` + active root `root/kaola-workflow/*/fast-summary.md` EXCLUDING `archive`. Missing dirs → []. Roots disjoint.
- `audit(root) -> report` — read each file (try/catch at I/O boundary only), aggregate.
- `formatTable(report) -> string`, `formatJson(report) -> JSON.stringify(...,2)`.
- CLI: `if (require.main === module)` — `--json` flag, root=process.cwd(), write output, `process.exit(0)` ALWAYS.

### report schema
```
{ totalRuns, statusCounts:{PASSED,IN_PROGRESS,REVIEW,ESCALATED,UNKNOWN},
  escalationHistogram:{reasonKey:count}, fileCountDistribution:{n|'unknown':count},
  reviewModeCounts:{delegated,'self-review',escalated} }
```
All count buckets present and zeroed even on empty corpus.

## Test fixtures (synthetic, temp dir)
- F1 PASSED + delegated + 2 backtick file paths
- F2 PASSED + self-review + prose scope → fileCount unknown, self-review
- F3 ESCALATED + `escalated_to_full: scope exceeds fast-path — 6 files...` → escalated, histogram `scope exceeds fast-path`
- F4 IN_PROGRESS (synthetic — corpus has none)
- F5 REVIEW (synthetic — corpus has none)
- F6 path-discriminator trap: `scripts/foo.js` + `myFunc()` + `npm run test:x` → parseFileCount===1
- F7 escalation false-positive: PASSED + `## Escalation\nN/A — stayed within bounds...` → contributes nothing to histogram
- F8 active (non-archived) under kaola-workflow/issue-999/ → scanned, no double-count
- F9 garbage (no ## headers) → no crash, status UNKNOWN

### assertions → AC/constraint mapping
- totalRuns exact (no double-count of active) ; statusCounts {PASSED:3,IN_PROGRESS:1,REVIEW:1,ESCALATED:1,UNKNOWN:1}
- reviewModeCounts {delegated:1,'self-review':1,escalated:1}
- parseFileCount F1→2, F2→'unknown', F6→1
- escalationHistogram key `scope exceeds fast-path`:1 ; F7 contributes nothing
- parseReviewMode: code-reviewer only in `## Review` prose (no table) → self-review (table-scoped, issue-184 trap)
- audit(empty temp) → totalRuns:0 all zeroed, no throw ; audit(no kaola-workflow/) → 0, no throw
- parseFastSummary(garbage) no throw, UNKNOWN
- formatTable non-empty w/ four section labels ; formatJson round-trips

## package.json edit
Insert ` && node scripts/test-fast-audit.js` immediately before `&& node scripts/simulate-workflow-walkthrough.js` in `test:kaola-workflow:claude`.

## Acceptance check commands
- `node scripts/kaola-workflow-fast-audit.js; echo exit=$?` → table + exit 0
- `node scripts/kaola-workflow-fast-audit.js --json; echo exit=$?` → JSON + exit 0
- `node scripts/test-fast-audit.js; echo exit=$?` → `Fast-audit regression passed (N assertions)`, exit 0
- `node scripts/simulate-workflow-walkthrough.js; echo exit=$?` → exit 0
- `npm run test:kaola-workflow:claude` → all green (confirms wiring)

## Out of scope
- Eligibility rubric / escalation hatch changes (#198).
- Central/live telemetry beyond archive+active scan.
- Any test assertion against the real archive's live counts (forbidden — archive self-modifies).
- Modifying existing fast-summary.md files or the template.
- Wiring audit into any gate/CI failure path (always exits 0).
