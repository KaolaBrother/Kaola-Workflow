# Surface map — `projectNameForIssue` / `workflow_project` (#929)

Produced by a read-only Explore sweep; the four load-bearing rows were re-verified by the
orchestrator directly (marked ✅ verified) because the agent had no write tooling and its report
reached me only as text.

## 1. The four copies of `projectNameForIssue`

| Edition | Path | Def line | Byte-identical to root? |
|---|---|---|---|
| root (canonical) | `scripts/kaola-workflow-claim.js` | 293–300 | — |
| codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 293–300 | YES, whole file (`750bb115ff3298195448251ec5f09b89`) |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 187–194 | body identical after `issueIid`→`issueNumber` rename only |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 187–194 | same as gitea |

**Enforcement asymmetry — this is the trap.** root↔codex is byte-compared by
`validate-script-sync.js` COMMON_SCRIPTS (`:46`, check at `:530-539`) → misses go RED automatically.
The gitea/gitlab claim ports are **hand-ported** (`edition-sync.js:30-33`) and the only automated
check compares `module.exports` **key sets** (`validate-script-sync.js:485`) — a body divergence is
**silent**. Both forge edits must be made and verified by hand.

## 2. Call sites (root line numbers; codex identical)

- **`claimProject:1115`** — `args.project || projectNameForIssue(...)`, then `assert(isSafeName(project))`
  at 1116. Becomes folder name, worktree dir, state file, archive dir.
- **`claimExplicitTarget:1477`** — pre-computes the name and passes it as `args.project`, so 1115
  short-circuits. **This is the live path for `startup --target-issue N`.**
- `:1447/1450/1453/1461/1472` — refusal envelopes, report-only, no write.
- `:6400` — `module.exports`.
- gitea: `claimProject:896`, `claimExplicitTarget:1577`. gitlab: `claimProject:892`, `:1576`.

**The issue's cited "clean fallback at 5196/5227" is a misattribution.** Those lines are
`const projectName = 'issue-' + issueNumber;` inside **`collectStale`** (def `:5183`), a *separate*
hard-coded derivation for the stale-worktree sweep that ignores `workflow_project` entirely. It does
not call `projectNameForIssue`. Pre-existing, out of #929's scope — leave alone deliberately.

## 3. ✅ verified — `isSafeName` cannot be the placeholder gate

Defined in `scripts/kaola-workflow-active-folders.js:14`, imported by `claim.js:10`.
**Not** in `kaola-workflow-adaptive-schema.js` (0 hits — an orchestrator assumption that was wrong).

```js
function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}
```

Path-traversal guard only. `unclaimed`, `TBD`, `none`, `n/a` all pass. Re-implemented locally in
`sink-merge.js:202` and `sink-pr.js:22` (same body, not exported).

`kaola-workflow-adaptive-schema.js` IS byte-identical across all 8 copies
(`918c51ba0ff18d43cb0fd536e91567b0`) — but it references neither `workflow_project` nor `isSafeName`,
so it is **not on this change surface**.

## 4. ✅ verified — the forge roadmap ports diverge on the default

| Site | root / codex | gitea / gitlab |
|---|---|---|
| `readRoadmapIssues` | `:78` `|| '—'` | `:80` identical |
| `buildTableRow` | `:89` `|| '—'` | `:91` identical |
| `cmdInitIssue` | `:341/344` `|| '—'` | passes `|| '—'` into `issueRecordContent` |
| `cmdProjectName` | `:369` rejects `''` and `'—'` | `:376` identical |
| **`issueRecordContent`** | **does not exist** | **`:222` `(workflowProject \|\| 'issue-' + issueIid)`** |

`issueRecordContent` is reached from `writeIssueRecord:240` and `refreshFromGitea/Gitlab:253` with
`opts.workflowProject` normally `undefined`. So **the forge editions' primary generator already emits
`issue-N`** — the very value the fallback would produce. Any guard is therefore near-inert on
gitea/gitlab and load-bearing on root/codex. My pre-claim "`'—'` everywhere" held for root/codex only.

Documented contract that would go stale if the rule widens: `docs/api.md:1350` — *"Exit 1 if the field
is missing or `—`"*.

## 5. Test surface

**No test calls `projectNameForIssue` by name anywhere.** It is only exercised through `claim startup`.

- `simulate-workflow-walkthrough.js:881-892` — `plantRoadmapIssue`, **`:888` writes `workflow_project: —`**,
  called 40+ times. Every one silently depends on `'—'` → `issue-N`. **Widening must keep that intact.**
- **`:180` is the ONLY assertion proving the guard+fallback**: `assert(first.project === 'issue-63', …)`.
- Codex variant `simulate-kaola-workflow-walkthrough.js:795` (`—`), `:1663` asserts `project === 'issue-163'`.
- gitea `simulate-gitea-workflow-walkthrough.js:382` (`—`); gitlab `simulate-gitlab-workflow-walkthrough.js:235` (`—`).
- Fixtures with real names to preserve: `filename-authority-project` (`:645`), `mismatch-project` (`:668`),
  `pipe-escape-project` (`:690`), `sink-test`, `bundle-test`, `roadmap-guard-fixture`.
- `test-bundle-claim.js:87-93` and `test-bundle-state.js:60-64` write **no** `workflow_project` line at
  all → exercise the `field()`-returns-`''` falsy branch.

**Coverage hole:** nothing anywhere plants a non-em-dash placeholder and asserts the outcome.

## 6. ✅ verified — a placeholder DID reach this repo's own `.roadmap`

`git show ced64384:kaola-workflow/.roadmap/issue-23.md` →

```
issue: #23
title: Harden parallel issue conflict classification with exact paths
status: open
workflow_project: TBD
next_step: queued
```

Added in `ced64384`, removed in `90ef58a1`. `TBD` is truthy, `!== '—'`, and passes `isSafeName` →
**today's `projectNameForIssue` would adopt it verbatim.** No `kaola-workflow/TBD/` directory was ever
created, because at that time `projectNameForIssue` shelled out to a `project-name` subcommand that
did not exist and the silent catch always produced `issue-N`; the file-read rewrite shipped by **#28**
is what armed this adoption path. (Timeline plausible but not fully proven — flagged, not relied on.)

**So the failure class is observed in THIS repo, not only in the external KaolaVPN run.**

## 7. Legitimate project names that must keep working

Non-`issue-N` archive folder names: `branch-issue-merge-sink`, `claim-hardening`,
`claim-hardening-followups`, `codex-parity`, `cross-machine-followups`, `cross-machine-hardening`,
`goal-driven-autonomy`, `minimal-ecc-config`, `multi-session-substrate`, `parallel-classifier`,
`pr-sink`, `roadmap-open-issues`, `roadmap-per-issue-regenerator`.

Values ever committed to `.roadmap/issue-*.md` in git history: `—`, **`TBD`**, `bundle-414-418-422`,
`bundle-423-425-431`, `bundle-429-434`, `bundle-540-541`, `bundle-612-613`, `cross-machine-hardening`,
`parallel-classifier`, `pr-sink`, `issue-<N>` (many), `issue-244-stage-a`, `issue-815-probe`.

Archive dirs also carry appended suffixes (`issue-500.archived-2026-06-16T11-10-56-036Z`,
`issue-612.discarded-…`) — those are added at archive time, not project names, but a strict
`^[a-z0-9-]+$` allow-list applied anywhere downstream would reject them.

## 8. Consolidated change surface

| # | File | Site | Enforcement if missed |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-claim.js` | 293–300 | canonical |
| 2 | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 293–300 | **byte-compare — RED automatically** |
| 3 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 187–194 | **none — silent drift** |
| 4 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 187–194 | **none — silent drift** |
| 5* | roadmap.js ×4 | write side | only if fix moves to the write side |
| 6* | `docs/api.md:1350` | doc | if the `—`-only rule widens |

`*` conditional on the fix shape.
