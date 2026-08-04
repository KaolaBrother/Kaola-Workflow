# Reproduction report — issue #933

> **A claim must not write run state into a directory that is not a project folder.**

**STATUS: REPRODUCED at HEAD.** The issue's premise holds after #932 shipped. All three measured
entry points still succeed at exit 0 and still write run state into a reserved directory.

## Setup

- Repo under test: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`
- Commit: `406b5639` (`chore: archive issue-932 [sink]`), branch `main`, clean
- Node: `v24.18.0`
- `KAOLA_WORKFLOW_OFFLINE=1`, `KAOLA_WORKTREE_NATIVE=0`
- Harness root (throwaway, never the real repo): `scratchpad/lab933`, one commit on `main`,
  seeded with `kaola-workflow/.roadmap/{_rules.md,issue-777.md}` and
  `kaola-workflow/archive/old-run.md`. `issue-777.md` carries `workflow_project: .roadmap`.
- The real repo's `kaola-workflow/` state directory was never claimed against.

## Why re-run: #932 landed after #933 was filed

The issue's evidence was taken on `71976a86`. `406b5639` is two commits later and #932 rewrote the
claim rollback. The line numbers in the issue body have shifted accordingly — the finding has not.

| site | issue body says | actual at `406b5639` |
|---|---|---|
| `isReservedWorkflowDirName` definition | `kaola-workflow-claim.js:2460` | `:2536` |
| its only call site (`archiveProjectDir`) | `:2487` | `:2563` |
| `projectNameForIssue` | `:293-300` | `:293-300` (unmoved) |
| `isSafeName` | `active-folders.js:14-18` | `:14-18` (unmoved) |

**Call-site count confirmed: exactly one.** `grep -c 'isReservedWorkflowDirName'` returns 2 per
edition — one definition, one call — in all four editions. No claim-path caller exists.

## Measured reachability

Each leg run against the **shipped CLI** in the lab repo, tree reset (`git clean -fd`) between legs.

| # | command | envelope | reserved dir afterwards |
|---|---|---|---|
| R1 | `claim --project .roadmap --issue 777` | `{"status":"acquired","verdict":"green","project":".roadmap"}` exit 0 | `.roadmap/workflow-state.md` **created** |
| R2 | `startup --runtime claude --target-issue 777` — **no `--project`** | `{"verdict":"green","claim":"acquired","selected_project":".roadmap"}` exit 0 | `.roadmap/workflow-state.md` **and** `.roadmap/.cache/origin/selection-record.json` **created** |
| R5 | `claim --project archive --issue 777` | `{"status":"acquired","verdict":"green","project":"archive"}` exit 0 | `archive/workflow-state.md` **created** — the whole archive band adopted |

**R2 is the leg that matters.** No operator types a reserved name anywhere. The name travels in
roadmap data: `kaola-workflow/.roadmap/issue-777.md` carries `workflow_project: .roadmap`, and
`projectNameForIssue` (`:293-300`) reads it back out verbatim, gated only by `isSafeName`:

```js
const name = field(fs.readFileSync(roadmapFile, 'utf8'), 'workflow_project');
if (name && name !== '—' && isSafeName(name)) return name;
```

`isSafeName` (`active-folders.js:14-18`) is path safety only — no separator, no NUL, not `.` or
`..`. `isSafeName('.roadmap') === true` and `isSafeName('archive') === true`. The tree already says
this in the #930 commentary at `claim.js:2517-2519`.

R4 (`roadmap init-issue --workflow-project .roadmap` → `startup`) was not re-run separately: it is
R2 with the roadmap file authored by tooling rather than by hand, and the authoring sanitizer
(`kaola-workflow-roadmap.js:335`) strips CR/LF only. R2 already proves the consuming side.

## Edition survey

`kaola-workflow-claim.js` is a `COMMON_SCRIPTS` entry — **byte-identical** between `scripts/`
(claude) and `plugins/kaola-workflow/scripts/` (codex), enforced by `validate-script-sync.js:46`.
The gitlab/gitea ports are **divergent hand-ports**, deliberately not generated
(`edition-sync.js:30-33`: forge vocabulary is 2.5% of claim's divergence from the render).

| edition | path | `isReservedWorkflowDirName` | call sites | `projectNameForIssue` |
|---|---|---|---|---|
| claude (canonical) | `scripts/kaola-workflow-claim.js` | present | 1 | present |
| codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | present | 1 | present |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | present | 1 | present |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | present | 1 | present |

The predicate already ships everywhere. **Nothing needs porting — only wiring**, at one new call
site per edition, with claude↔codex staying byte-identical.

## What is NOT established

- No claim about which behaviour is correct. Refuse-at-claim-site vs. resolve-around-the-name is the
  owner's value call; this report measures only that the door is open and reachable.
