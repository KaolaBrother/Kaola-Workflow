# Phase 3 - Plan: issue-224

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/simulate-workflow-walkthrough.js` | Add 3 failing-first tests (#16, #17, #18) + register | Write-failing-test-first; root+Codex coverage |
| `scripts/kaola-workflow-roadmap.js` | #16+#17 filename-authority in readRoadmapIssues (drop dead filter); #18 unescape in parseRoadmapTable | CANONICAL — the fixes |
| `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js` | Identical to root (byte-sync; `cp`) | COMMON_SCRIPTS parity (validate-script-sync gate) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | #16+#17 only (no #18 — no cmdMigrate) | Forge port |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | #16+#17 only | Forge port (separate from gitlab) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | 2 tests (#16, #17), new fn names | Forge regression |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 2 tests (#16, #17), new fn names | Forge regression |
| `CHANGELOG.md` | `[Unreleased]` entry (phase6) | |

NOT modified: `kaola-workflow-claim.js` (already filename-authoritative); forge `parseRoadmapTable` (no migrate path); `simulate-kaola-workflow-walkthrough.js` (Codex — byte-identical to root).

### Exact edits
**#16+#17** readRoadmapIssues (root :70-79; same shape all 4 roadmap scripts): derive `const n = parseInt(f.match(/\d+/)[0], 10);` and set `issue: '#' + n`; remove the trailing `.filter(...)`. Preserve each script's existing field defaults/order — read before editing.
**#18** parseRoadmapTable (root :177-183, Codex identical): add `.replace(/\\\|/g, '|')` to `title` (match[2]), `workflow_project` (match[4]), `next_step` (match[5]). Regex LITERAL, not string-constructed. Forge NOT modified.

### Tests (failing-first)
Root walkthrough (model on testRoadmapGenerateAtomicReplace :342; helpers runNode/read/mkdtempSync):
1. #16 — issue-42.md no `issue:` line → generate exit 0 AND ROADMAP contains `| #42 |` + its row (not "No active work"). RED now (silent drop).
2. #17 — issue-43.md with `issue: #999` → row renders `| #43 |` not #999. RED now.
3. #18 — issue-55.md title `Fix a|b parser` → generate→rm source→migrate→generate → final cell exactly `Fix a\|b parser` (single escape), NOT `a\\|b`. RED now.
Forge (gitlab + gitea test-*-workflow-scripts.js): #16 + #17 each (no #18). New fn names; do NOT rename existing (contract validator asserts testGitLabRoadmapValidateRemote). Register in runner.
Backward-compat: existing fixtures (issue-998/997) field==filename, no pipes → render identically (walkthrough L359 assertion stays green).

### Build Sequence
1. Edit root roadmap.js (#16+#17, #18). 2. cp to Codex; `node scripts/validate-script-sync.js` passes. 3. Edit gitlab + gitea roadmap.js (#16+#17 only, 2 separate edits). 4. Add 3 root tests → confirm RED then GREEN. 5. Add 2 forge tests each + register. 6. CHANGELOG (phase6).

### Acceptance
`node scripts/validate-script-sync.js`; `node scripts/simulate-workflow-walkthrough.js`; `npm test`; forge contract validators.
