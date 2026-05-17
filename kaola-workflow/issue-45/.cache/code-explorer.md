# Code Explorer: issue-45

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-claim.js` | All claim/release/sweep/status/resume/worktree-status/finalize logic |
| `scripts/kaola-workflow-sink-merge.js` | Merge sink — reads no workflow-state.md |
| `scripts/simulate-workflow-walkthrough.js` | Integration tests — hand-rolled assert |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Flaw 4 location |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Flaw 3 location |
| `plugins/kaola-workflow/skills/kaola-workflow-execute/SKILL.md` | Consumes KAOLA_WORKTREE_PATH |
| `plugins/kaola-workflow/skills/kaola-workflow-{ideation,plan,research,review}/SKILL.md` | All consume KAOLA_WORKTREE_PATH |

---

## Flaw 1 — Closed issues still appear active locally

`cmdWorktreeStatus` (claim.js:2548–2588):
- Line 2569: filters only on branch pattern `workflow/issue-\d+`, never on `issue_data.state`.
- Lines 2574–2582: fetches `issue_data` via `gh issue view` but does NOT annotate `closed: true` or filter.
- Emits all matching worktrees regardless of issue state.

`cmdStatus` (claim.js:2151–2193):
- Lines 2168–2179: fetches only `assignees,labels` — does NOT fetch `state` (open/closed).
- Line 2182: `consistent = session != null && session.session_id === lock.session_id` — purely local check.
- `drift` only records `session file missing` or `session_id mismatch`, never `issue closed`.
- A lock for a closed issue with valid session will yield `consistent: true`.

Labels/assignee cleanup (`releaseSession` line 1839–1842; `cmdSweep` lines 2095–2103) — neither triggers on issue closure itself.

**Correct pattern to mirror:** `cmdWatchPr` (lines 2273–2281): when `state === 'CLOSED'`, calls `removeWorktree(...)` + `releaseSession(..., 'aborted')`. Fix: add `state` to `--json` fields in `cmdStatus`; push `'issue closed'` into `drift` when `state === 'closed'`; add `closed: true` flag in `cmdWorktreeStatus`.

---

## Flaw 2 — `resume` advances incomplete Phase 4 when `workflow-state.md` missing

`scanPhaseArtifacts` (claim.js:2475–2507):
- Path 1 (lines 2480–2491): reads `workflow-state.md`; if `next_command` and `step` are present and step is not terminal, returns that command. CORRECT.
- Path 2 fallback (lines 2493–2506): `PHASE_ARTIFACTS` array, `find` stops at first existing file:
  ```
  phase4-progress.md → '/kaola-workflow-phase5 {project}'  ← BUG: unconditional
  ```
  Line 2496: no task-row inspection. If file exists with all tasks `pending`/`in_progress`, returns phase5 command.

**Correct pattern to mirror:** `kaola-workflow-repair-state.js` and test at simulate-walkthrough.js:268–296 — when `phase4-progress.md` contains `in_progress` task rows, repair routes BACK to phase4. Fix: parse `phase4-progress.md` in path 2, check for any `| pending |` or `| in_progress |` or `| in-progress |` rows before advancing to phase5.

---

## Flaw 3 — KAOLA_WORKTREE_PATH never exported by startup/pick-next

`cmdStartup` (claim.js:1378–1461): `writeStartupReceipt` calls for owned/no_target/acquired branches do NOT include `worktree_path`. The lock file has `worktree_path` but it's not surfaced.

`kaola-workflow-next/SKILL.md` lines 56–83: startup block captures `PICK_NEXT_VERDICT` and `PICK_NEXT_PROJECT` but never extracts `worktree_path` or exports `KAOLA_WORKTREE_PATH`.

All six downstream skills (`execute:36`, `finalize:44`, `ideation:36`, `plan:36`, `research:44`, `review:36`) have `cd "$KAOLA_WORKTREE_PATH" 2>/dev/null || true` — silently no-ops because variable is never set.

**Fix locations:**
1. `cmdStartup` (~line 1444–1461): add `worktree_path` read from lock file to `writeStartupReceipt`.
2. `kaola-workflow-next/SKILL.md` (after pick-next / startup capture): add extraction pattern mirroring `PICK_NEXT_VERDICT`:
   ```bash
   KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT")"
   [ -n "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
   ```

---

## Flaw 4 — Finalize reads sink metadata from archived path

Bug is in `kaola-workflow-finalize/SKILL.md`, NOT `sink-merge.js`.

`archiveProjectDir` (claim.js:1860–1886):
- Line 1884: `fs.renameSync(srcDir, destDir)` renames `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/`.
- After this, `kaola-workflow/{project}/workflow-state.md` is GONE.

`cmdFinalize` (lines 1888–1919): calls `archiveProjectDir` at line 1914. Does NOT call `releaseSession` or `removeWorktree` (those are `cmdWorktreeFinalize`'s job).

`finalize/SKILL.md` lines 217–219:
```bash
SINK_KIND=$(awk '/^## Sink/,0' "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md" | ...)
SINK_BRANCH=$(grep '^branch:' "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md" | ...)
```
Reads from the now-archived/gone path → empty strings → sink dispatch fails.

**Fix:** capture `SINK_KIND` and `SINK_BRANCH` BEFORE the `cmdFinalize` call (before SKILL.md line 176), using the same `ACTIVE_WORKTREE_PATH` resolution at lines 150–155.

---

## Gap A — Empty `*.kw/` parent shell not removed

`removeWorktree` (claim.js:624–680):
- Line 658: `git worktree remove --force` removes child worktree dir.
- Line 663: returns `{ removed: true }` — never checks or removes parent.

`worktreePathFor` (claim.js:588–590): parent is `path.join(path.dirname(root), path.basename(root) + '.kw')`.
`provisionWorktree` (claim.js:594): `fs.mkdirSync(path.dirname(wtPath), { recursive: true })` creates parent.

**Fix:** after `git worktree remove` succeeds at line 663:
```js
try { fs.rmdirSync(path.dirname(wtPath)); } catch (_) {}
```
`rmdirSync` throws `ENOTEMPTY` on non-empty dir — natural "only if last" guard.

---

## Gap B — `.abandoned-*` orphan dirs never GC'd

`cmdSweep` (claim.js:2075–2148): two passes — stale locks (2083–2104) and orphaned project dirs (2123–2148). Neither touches `*.kw/` or `.abandoned-*` entries.

Abandoned path naming (line 667–668): `wtPath + '.abandoned-' + now.toISOString().replace(/[:.]/g, '-')`. Age can be read via `fs.statSync(abandonedPath).mtimeMs`.

**Fix:** add third pass in `cmdSweep` scanning `*.kw/` parent directory for `.abandoned-` entries older than GC_CUTOFF_MS (30min constant at line 2124). Mirror pattern of lines 2123–2148.

---

## Gap C — `worktree-status` misses unregistered KW-shaped dirs

`cmdWorktreeStatus` (claim.js:2548–2588):
- Lines 2549–2553: reads only from `git worktree list --porcelain`.
- Dirs abandoned/orphaned (process crash between create and register) invisible.

**Fix:** add second pass after line 2585 scanning `*.kw/` parent for `issue-\d+` and `.abandoned-*` subdirs not already in `entries` (compare by `worktree_path`). Append with `registered: false` and `abandoned: true` flags.

---

## Test Locations

File: `scripts/simulate-workflow-walkthrough.js`
- `assert(condition, message)` at line 27
- **Epic 17** (line 4855–5134): Worktree-native tests — new regression tests belong here as 17O+
- **Epic 9** (line 2189): Cross-machine sweep — Gap B GC test can mirror this pattern
- Lines 268–296: `kaola-workflow-repair-state.js` tests — Flaw 2 regression test mirrors this pattern
- Lines 4917–4935: 17D–17E `resume` tests — Flaw 2 new test: write phase4-progress.md with in_progress rows, assert resume routes to phase4

Plugin test file: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` — must receive parallel changes for plugin-side assertions.
