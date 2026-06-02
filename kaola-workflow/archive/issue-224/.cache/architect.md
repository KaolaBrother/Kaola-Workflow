# Architect — issue-224 (research + blueprint)

## Bugs reproduced
- #16: issue-42.md with no `issue:` field → generate exits 0, ROADMAP renders "No active work" (silent drop).
- #17: issue-43.md containing `issue: #999` → row renders #999 while filename-keyed paths use 43.
- #18: title `Fix a|b parser` → gen1 cell `a\|b`; migrate writes back `a\|b`; gen2 → `a\\|b`.

## Design decisions
- #17 = FILENAME AUTHORITY. No legitimate divergence: all writers hard-sync the field to the filename (cmdInitIssue L293, cmdMigrate L213/215, forge writeIssueRecord). Rest of toolchain already filename-keyed (closure claim.js:560/583, cmdProjectName:313, projectNameForIssue:113). claim.js NEEDS NO EDIT — `field(_,'issue')` never appears in claim.js (verified). #17 is a one-side roadmap.js fix.
- #16+#17 UNIFY: with filename authority a file missing `issue:` can't be dropped. The L64 filter /^issue-\d+\.md$/ already guarantees a valid number, so DROP the trailing `.filter(d => d.issue && /^#\d+$/.test(d.issue))` (dead). No stderr warning needed (no malformed-but-present case remains).
- #18: unescape in parseRoadmapTable (READ side, so any future reader is correct), regex LITERAL `/\\\|/g` → '|'. The issue's `replace(/\\\|/g,'|')` is CORRECT as a regex literal (verified: "a\|b".replace(/\\\|/g,'|')==="a|b"); the trap is only if string-constructed via new RegExp. Apply to the 3 columns buildTableRow escapes: title(match[2]), workflow_project(match[4]), next_step(match[5]); NOT issue/status. Root+Codex ONLY (forge has no cmdMigrate).

## Edition matrix
| Script | #16 | #17 | #18 | Sync |
| scripts/kaola-workflow-roadmap.js (root) | edit L70-79 | edit L73 | edit L177-183 | byte-identical to Codex (COMMON_SCRIPTS) |
| plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js (Codex) | edit (=root) | = | = | must equal root |
| plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js | edit L65-79 | edit L73 | N/A (no cmdMigrate) | forge-adapted, not synced |
| plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js | edit | edit | N/A | forge-adapted, separate from gitlab |
| scripts/kaola-workflow-claim.js (+Codex) | — | NO EDIT | — | already filename-authoritative |
Forge roadmap.js HAVE readRoadmapIssues/buildTableRow/parseRoadmapTable but NO cmdMigrate (dispatch: generate/refresh/validate/validate-remote/init-issue/project-name). So #18 root+Codex only; #16+#17 all four.

## Exact edits
### #16+#17 readRoadmapIssues (root L70-79; same shape all 4):
```js
return files.map(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const n = parseInt(f.match(/\d+/)[0], 10);   // filename is authority
  return {
    issue: '#' + n,
    title: field(content, 'title') || '—',
    status: field(content, 'status') || 'open',
    workflow_project: field(content, 'workflow_project') || '—',
    next_step: field(content, 'next_step') || '—',
  };
});  // trailing .filter removed
```
(Preserve each script's EXACT existing field defaults/order — read each before editing; forge sort already does parseInt(a.match(/\d+/)[0]) so safe.)
### #18 parseRoadmapTable (root L177-183) rows.push:
```js
title: match[2].trim().replace(/\\\|/g, '|'),
workflow_project: match[4].trim().replace(/\\\|/g, '|'),
next_step: match[5].trim().replace(/\\\|/g, '|'),
```
issue/status unchanged. Codex identical. Forge NOT modified.

## Tests (failing-first)
Root walkthrough scripts/simulate-workflow-walkthrough.js (model on testRoadmapGenerateAtomicReplace L342):
- #16: issue-42.md no issue: line → generate exit 0 AND ROADMAP contains `| #42 |` + its row (not "No active work").
- #17: issue-43.md with `issue: #999` → row renders `| #43 |` not #999.
- #18: issue-55.md title `Fix a|b parser` → generate→rm source→migrate→generate → final cell exactly `Fix a\|b parser` (single escape), NOT `a\\|b`.
Forge test-gitlab/gitea-workflow-scripts.js: #16 + #17 each (no #18). ADD new fns; do NOT rename existing (contract validator L379 asserts testGitLabRoadmapValidateRemote name). Register in runner.
Existing fixtures (issue-998/997) field==filename, no pipes → render identically → backward-compatible (walkthrough L359 assertion stays green).

## Build sequence
1. Edit root roadmap.js. 2. cp to Codex; validate-script-sync passes. 3. Edit gitlab + gitea roadmap.js (#16+#17 only, 2 separate edits). 4. Add 3 root tests. 5. Add 2 forge tests each + register. 6. CHANGELOG.

## Acceptance
node scripts/validate-script-sync.js; node scripts/simulate-workflow-walkthrough.js; npm test; forge contract validators.

## Watch-outs
Byte-sync root↔Codex roadmap.js (any whitespace diff fails npm test). Forge≠byte-identical (2 parallel hand-edits). Don't touch forge parseRoadmapTable. Don't rename forge test fns. claim.js untouched.
