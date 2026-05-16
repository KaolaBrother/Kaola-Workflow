## Exploration: Issue #34

### Entry Points

- Bug 1 (archive non-atomic): `commands/kaola-workflow-phase6.md` line 456 — archive step described in prose only, no shell command
- Bug 2 (status never closed): `scripts/kaola-workflow-claim.js` line 738 (`initialStateContent`) and line 1644 (`releaseSession`) — only two status writers in the codebase
- Bug 3 (no GC): `scripts/kaola-workflow-claim.js` line 1799 (`cmdSweep`) and line 425 (`activeStateIssueNumbers`) — sweep only touches lock files; orphaned project dirs block re-claim permanently

### Execution Flow

Bug 1 — Archive path:
1. Phase 6 AI agent reads `commands/kaola-workflow-phase6.md` Step 7 (line 412-471) which describes `kaola-workflow/{project}/ -> kaola-workflow/archive/{project}/` in a text block with no shell command
2. Nearby at line 543 is `cp -R "kaola-workflow/${KAOLA_PROJECT}/." "$ACTIVE_WORKTREE_PATH/kaola-workflow/${KAOLA_PROJECT}/"` — this is the linked-worktree artifact mirror (Step 8a), not archive; the AI conflates the two
3. No `git mv` or `fs.renameSync` is ever invoked; source dir survives; both copies are git-tracked
4. `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` line 90 mirrors the same prose-only gap

Bug 2 — Status path:
1. `initialStateContent()` at claim.js:738 writes `status: active` when a project dir is first created
2. `releaseSession()` at claim.js:1644 writes `status: released` via regex-replace on a normal release
3. Phase 6 sink scripts (`sink-merge.js`, `sink-pr.js`) write nothing to the `status:` field
4. `postMergeCleanup()` in sink-merge.js (lines 131-147) closes the GitHub issue but does not touch `workflow-state.md`
5. `updateStateSinkBlock()` in sink-pr.js (lines 87-118) updates only `pr_url`/`pr_number` in the `## Sink` block
6. Result: 19 of 22 archived `workflow-state.md` files contain `status: active`; 2 contain `status: complete`; 1 contains `status: completed`; none contain `status: closed`

Bug 3 — GC path:
1. `cmdSweep()` at claim.js:1799-1846 iterates only `.locks/*.lock` files — `fs.readdirSync(locksDir(coordRoot))`
2. It removes stale lock files meeting `shouldSweep()` (claim.js:574-578, 24h cutoff on both `expires` and `last_heartbeat`)
3. `activeStateIssueNumbers()` at claim.js:425-439 scans all non-archive dirs under `kaola-workflow/` and checks for `/^status:\s*active\s*$/m` — a crashed project with no lock file but `status: active` in `workflow-state.md` permanently blocks its issue number
4. `issueAlreadyClaimed()` at claim.js:442-445 returns true for any issue number in that set
5. `cmdStartup()` at claim.js:1172-1253 calls `runBootstrapSweep()` (line 1073-1077) which calls `cmdSweep()` — no project-dir GC at any point in the startup transaction
6. `workflow-next.md` startup (line 45) chains sweep + watch-pr + classify + claim; line 78-80 explicitly prohibits recovering skipped-claim entries without user request

### Architecture Insights

- Claim coordination: lock files in `{coordRoot}/kaola-workflow/.locks/{project}.lock` (JSON) are the authority for "is a session active?" — `workflow-state.md` status field is a secondary record, not the primary gate
- Status field semantics: `active` means claimed by a live session; `released` means clean release via `releaseSession()`; no terminal status (`closed`, `archived`) has ever been written by any code path
- Archive convention: `kaola-workflow/{project}/` dirs with `archive/` prefix are excluded from scanning by `activeStateProjects()` (claim.js:376-399) and from `activeStateIssueNumbers()` (claim.js:425-439) via the `dir === 'archive' || dir.startsWith('.')` guard
- Atomic-move pattern: the existing worktree abandon uses `fs.renameSync(wtPath, abandonedPath)` at claim.js:665-668 with a timestamp suffix `.abandoned-{ISO-timestamp}` — this is the correct mirror for an atomic archive move
- Status-write pattern: `releaseSession()` at claim.js:1644 uses `content.replace(/^status:\s*active\s*$/m, 'status: released')` — this is the exact regex-replace pattern to mirror for writing `status: closed`

### Key Files

| File | Role | Importance |
|------|------|------------|
| `scripts/kaola-workflow-claim.js` | Claim/release/sweep/startup orchestrator | Critical — all three bugs root here |
| `commands/kaola-workflow-phase6.md` | Phase 6 AI instruction doc | Bug 1 and Bug 2 source |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Phase 6 skill codex | Bug 1 and Bug 2 mirror |
| `scripts/kaola-workflow-sink-merge.js` | Merge sink (Phase 6) | Bug 2 — no status write |
| `scripts/kaola-workflow-sink-pr.js` | PR sink (Phase 6) | Bug 2 — no status write |
| `scripts/simulate-workflow-walkthrough.js` | Integration test suite | Test structure reference |
| `commands/workflow-next.md` | Startup transaction router | Bug 3 — no project-dir GC |

### Dependencies

- External: `gh` CLI (GitHub issue close, PR create, comment), `git` CLI (worktree, fetch, rebase, merge, push, branch)
- Internal: `kaola-workflow-claim.js` exports `getCoordRoot`, `removeWorktree` — consumed by `sink-merge.js` and `sink-pr.js`
- No npm test framework — hand-rolled `function assert(condition, message)` at simulate-workflow-walkthrough.js:27

### Recommendations for New Development

**Bug 1 fix — archive atomicity:**

- Follow the `fs.renameSync` atomic-move pattern from claim.js:665-668
- Use `git mv kaola-workflow/{project} kaola-workflow/archive/{project}` if in a git-tracked tree; fall back to `fs.renameSync` if the OS rename is cross-device
- Add timestamp suffix semantics per `kaola-workflow-phase6.md` line 459: if destination exists, append `-{ISO-timestamp}` (mirror the `.abandoned-{ISO}` suffix at claim.js:665-668)
- In `commands/kaola-workflow-phase6.md` Step 7, replace the prose-only archive line with an explicit shell block showing the `git mv` command
- Mirror the same change in `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` line 90
- Add a test that verifies: after Phase 6 archive, `kaola-workflow/{project}/` does NOT exist and `kaola-workflow/archive/{project}/` DOES exist

**Bug 2 fix — status: closed:**

- After the sink completes (sink-merge.js `postMergeCleanup` returns, or sink-pr.js final step), read `workflow-state.md` and apply:
  ```js
  updated = content.replace(/^status:\s*\w+\s*$/m, 'status: closed');
  ```
  mirroring the exact pattern at claim.js:1644
- The write must happen BEFORE the archive move (Bug 1), so the archived copy reflects the terminal status
- Add a test asserting that after Phase 6 finalize, the archived `workflow-state.md` contains `status: closed`

**Bug 3 fix — GC for orphaned projects:**

- Extend `cmdSweep()` (claim.js:1799) with a second pass after lock-file cleanup: scan `kaola-workflow/` dirs (excluding `archive/` and `.`-prefixed), find any with `status: active` and no corresponding `.lock` file
- Apply GC only where no lock file exists AND `workflow-state.md` `expires:` timestamp has passed (same `shouldSweep()` cutoff logic at claim.js:574-578)
- Distinguish "crashed before real work" (only `workflow-state.md` present) from "abandoned mid-phase" (phase1-research.md or later present) — former can auto-GC; latter logs warning
- Write `status: abandoned` before archiving (distinguish from `status: closed`)
- Archive via `fs.renameSync` (same atomic-move pattern as Bug 1)
- Add a test verifying: project dir with `status: active` and no lock file is moved to `archive/` on sweep

**Reuse:**
- `locksDir(coordRoot)` and `lockPath(coordRoot, project)` at claim.js:290-294
- `activeStateProjects()` at claim.js:376-399 — dir-scanning loop with `archive`/`.`-prefix exclusion
- `shouldSweep()` at claim.js:574-578 — time-based GC eligibility predicate

**Avoid:**
- Do NOT use `cp -R` for archive — this is the Bug 1 root cause
- Do NOT check GitHub issue state as proxy for `status: closed` — local state must be authoritative
- Do NOT add GC without `shouldSweep()` guard — prevents premature cleanup of active projects
