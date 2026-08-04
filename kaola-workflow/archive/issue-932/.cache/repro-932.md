# Reproduction report — issue #932

> "A failed claim must not delete anything the claim did not create."

**STATUS: COMPLETE.** Verdict: **REPRODUCED**, at both sites, and **reachable** from the shipped
CLI with no internal caller required.

## Setup

- Repo under test: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`
- Commit: `71976a86` (chore: release 9.5.3), branch `main`, working tree clean except
  untracked `kaola-workflow/issue-932/`
- Node: `v24.18.0`
- Harness root (throwaway, NEVER the real repo):
  `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/6f5cdfb0-fc23-423f-b0fc-38729ff77aeb/scratchpad`
- No tracked file in the real repo was edited. No claim was ever run against the real
  `kaola-workflow/` state directory.

## Code sites confirmed present at 71976a86 (read-only confirmation of the pre-mapped analysis)

| site | lines | what is there |
|---|---|---|
| `claimProject` adopt | `scripts/kaola-workflow-claim.js:1180-1191` | non-recursive `fs.mkdirSync(dir)`; on `EEXIST` **without** `workflow-state.md` it falls through and adopts the existing dir |
| `claimProject` txn | `:1225-1258` | writes `persistSelectionRecord` + `writeState` only |
| `claimProject` rollback | `:1263` | `try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}` — whole tree, no created-vs-adopted distinction |
| `claimBundle` adopt | `:1543-1559` | same fall-through; `applied.dir = true` set **unconditionally** at :1559 |
| `claimBundle` rollback | `:1690-1698` | `if (applied.dir) fs.rmSync(dir, {recursive:true, force:true})` |

All five confirmed verbatim. Note the real function name at the second site is `claimBundle`
(the brief called it `claimExplicitBundle`, which is a different, outer function).

---

## VERDICT: REPRODUCED

A failed claim deleted `kaola-workflow/.roadmap/` **in its entirety** — the directory itself plus
every file in it — none of which the claim created.

## Harness

Throwaway git repo at `$LAB` =
`/private/tmp/.../scratchpad/lab932` (one commit, `main`). Real repo never touched.

```
git init -q -b main .
mkdir -p kaola-workflow/.roadmap
printf 'SENTINEL-RULES-CONTENT-9f3a2b\ngoal: do not lose me\n'            > kaola-workflow/.roadmap/_rules.md
printf 'workflow_project: .roadmap\ntitle: SENTINEL-ISSUE-777-CONTENT-c4d1e0\n' > kaola-workflow/.roadmap/issue-777.md
printf 'SENTINEL-ISSUE-778-CONTENT-aa77bb\n'                              > kaola-workflow/.roadmap/issue-778.md
git add -A && git commit -qm init
```

Driver (`scratchpad/driver-claimproject.js`) calls the **shipped** `claimProject` export directly.
No monkey-patching, no stubbing of any workflow function:

```js
process.env.KAOLA_WORKFLOW_OFFLINE = '1';
const claim = require('/Volumes/.../scripts/kaola-workflow-claim.js');
try { console.log('RETURNED-NORMALLY ' + JSON.stringify(claim.claimProject(root, args))); }
catch (e) { console.log('THROW-FIRED code=' + e.code + ' msg=' + e.message); }
```

### How the mid-transaction failure was forced, and why it is faithful

`kaola-workflow/.roadmap/.cache` was created as a **regular file**. The transaction body's first
statement is `persistSelectionRecord` → `fs.mkdirSync(path.dirname(dest), { recursive: true })`
where `dest = <dir>/.cache/origin/selection-record.json`, so the mkdir hits `ENOTDIR`.

This is a genuine, unmodified-code I/O failure raised *by the shipped call itself*, landing in the
rollback exactly as any real mid-claim failure would (ENOSPC, EACCES, EIO, a path collision). The
rollback at `:1263` does not inspect the error — it rm -rf's on **any** throw — so the specific
errno is immaterial to what the rollback does.

Because a single injected fault is weak evidence on its own, **leg 2c below reproduces the identical
destruction from an entirely different failure with nothing planted on the filesystem at all** — a
shipped validation guard refusing inside `writeState`. Two unrelated faults, same outcome.

## Observations

| # | Measurement | Result | Exit |
|---|---|---|---|
| PC | **Positive control**: delete `_rules.md` by hand, run verifier | `MISSING _rules.md` / `VERIFY: DESTRUCTION OBSERVED` | **9** |
| PC | verifier on intact tree (before + after restore) | `VERIFY: all sentinels intact` | 0 |
| L1 | `claimProject(root, {project:'.roadmap', issue:777})`, no fault planted | `{"status":"acquired","verdict":"green","claim":"acquired","project":".roadmap"}` | 0 |
| L1 | `.roadmap/` after L1 | `_rules.md issue-777.md issue-778.md` **`workflow-state.md`** | — |
| L2a | same call + planted `.cache` file | `THROW-FIRED code=ENOTDIR ... mkdir '.../.roadmap/.cache/origin'` | **7** |
| L2a | `.roadmap/` after L2a | **`(.roadmap/ ITSELF GONE)`**, `kaola-workflow/` empty | — |
| L2a | sentinels after L2a | `MISSING _rules.md` / `MISSING issue-777.md` / `MISSING issue-778.md` | **9** |

**The forced throw is verified to have fired** — the driver prints from its own catch block and
exits 7; a non-throwing run exits 0 (L1 proves the driver distinguishes them).

### Leg 1 is a finding in its own right

Adoption is not theoretical. With no fault at all, the claim **succeeds** against `.roadmap`, returns
`verdict: "green"`, and writes `workflow-state.md` into the roadmap source directory:

```
# Kaola-Workflow State
## Project
name: .roadmap
status: active
```

From that moment the roadmap source tree *is* a project folder to every reader, and the next failure
of any kind — or the ordinary archive path — is operating on it.

## Second fault, nothing planted (leg 2c) — and the second site (leg 3)

`writeState` carries the #398.2 anti-injection fence `assertNoNewline(data.codex_dispatch_mode, …)`,
and `claimProject`/`claimBundle` both pass `args.codexDispatchMode` straight into it. Supplying a
newline-bearing value makes a **shipped guard refuse inside the transaction** — no filesystem
manipulation whatsoever.

| # | Site | Fault | Envelope / throw | Exit | `.roadmap` after |
|---|---|---|---|---|---|
| 2c | `claimProject` | `writeState` newline assert | `THROW-FIRED refused: codex_dispatch_mode contains a newline/CR — durable-state field injection.` | **7** | **GONE**, all 3 sentinels MISSING |
| 3 | `claimBundle` | same | `RETURNED-NORMALLY {"status":"target_set_unavailable","result":"answer",…"reasoning":"bundle provision failed and was rolled back: …"}` | **0** | **GONE**, all 3 sentinels MISSING |

### Leg 3 is the more dangerous of the two

`claimBundle` catches its own error and returns a **routine answer envelope at exit 0**. `claimResult`
maps `target_set_unavailable` → `answer` → `claimExitCode` → **0**. So the bundle lane destroys the
entire roadmap source tree and reports a perfectly ordinary "this target set is unavailable" —
no throw, no non-zero exit, nothing on the envelope naming a deletion. `claimProject` at least
propagates the throw.

Worse, the reasoning string it emits — *"bundle provision failed and was rolled back"* — is
**affirmatively false in the direction that matters**: the rollback did not restore a prior state, it
destroyed one.

## The bug is WIDER than reserved names (leg 5) — this is the load-bearing finding

Legs 4 and 5 hold the fault, the code path and the project name variable one at a time.

| # | Project name | Dir pre-exists? | Result |
|---|---|---|---|
| 4 | `issue-777` (normal) | no — claim creates it | `issue-777/` removed (**correct**); `.roadmap` and all 3 sentinels **intact** |
| 5 | `issue-777` (normal) | **yes**, stateless, holding human content | `issue-777/` **ENTIRELY GONE**, incl. `notes/handoff.md` and `evidence.md` the claim never created |

Leg 4 is the negative control that makes the rest meaningful: **the same fault, the same code path,
the same rollback — and nothing that the claim did not create was touched.** The destruction is
caused specifically by the *adoption* at `:1185-1190`, not by the fault and not by the harness.

Leg 5 then removes the reserved name from the picture entirely. A plain `kaola-workflow/issue-777/`
left behind stateless — by the exact crash the adopt branch's own comment cites, or by a human
staging notes — is adopted and then rm -rf'd whole. **No reserved name is required to lose data.**

Consequence for the fix: a reserved-name refusal (the shape #930 used at the archive site) would
**not** close this. Leg 5 still destroys with such a guard in place. The defect is that rollback
does not distinguish *created* from *adopted*.

---

# (B) REACHABILITY — reachable through real entry points, no internal caller needed

## The brief's premise about the validator is wrong

There is **no project-name validator** at `kaola-workflow-adaptive-schema.js:400-430`. What lives
there is `isParkedLanePath(relPath, ownedProjects)` (`:410-433`) — a **clean-check ignore predicate**
that decides which paths a dirty-tree scan should skip. Its reserved-name and dot-prefix tests
(`seg.startsWith('.')`, `seg === 'archive'`) answer "is this a parked lane I should ignore?", never
"may this be claimed?". It is not on the claim path at all and gates nothing here.

The only name filter `claimProject` actually applies is `assert(isSafeName(project))` at `:1116`.
`isSafeName` (`kaola-workflow-active-folders.js:14-18`) is **path safety only**:

```js
function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}
```

`isSafeName('.roadmap') === true`. `isSafeName('archive') === true`.

The tree says so itself, in the `#930` commentary at `:2441-2446`: *"`isSafeName` deliberately does
NOT answer this question: it is PATH safety, shared with claimProject…"*. #930 added
`isReservedWorkflowDirName` and wired it into **`archiveProjectDir` only** (`:2487`). The claim site
was never given the same guard — `isReservedWorkflowDirName` has exactly one call site.

## Reachable paths, each RUN end-to-end against the shipped CLI

| # | Entry point | Reserved name comes from | Result | Exit |
|---|---|---|---|---|
| R1 | `claim --project .roadmap --issue 777` | operator flag (`project` **is** a registered `KNOWN_VALUE_FLAGS` entry, `:79-89`) | `{"status":"acquired","verdict":"green","project":".roadmap"}`; `workflow-state.md` written into `.roadmap/` | 0 |
| R2 | `startup --target-issue 777`, **no `--project`** | `workflow_project:` in `kaola-workflow/.roadmap/issue-777.md` | `{"claim":"acquired","selected_project":".roadmap",…}`; `.cache/` + `workflow-state.md` written into `.roadmap/` | 0 |
| R3 | `startup --target-issue 777` + mid-claim I/O fault | same (roadmap data) | `ENOTDIR …`; **`.roadmap/` GONE**, `git status` shows `D _rules.md`, `D issue-777.md`, `D issue-778.md` | **1** |
| R4 | shipped `roadmap init-issue` → shipped `startup` | `roadmap init-issue --issue 777 --workflow-project .roadmap` | chain below — **`.roadmap/` GONE** | **1** |
| R5 | `claim --project archive --issue 777` | operator flag | `{"status":"acquired",…,"project":"archive"}` — the **archive band adopted** | 0 |
| R5b | `startup` with `workflow_project: archive` + fault | roadmap data | **entire `archive/` GONE** — `D issue-100/evidence.md`, `D issue-100/workflow-state.md`, `D issue-101/workflow-state.md` | **1** |

### R4 is the one that settles it — every step is supported tooling, nothing hand-written

```
$ node scripts/kaola-workflow-roadmap.js init-issue --issue 777 --title repro --workflow-project ".roadmap"
created: issue-777.md                                                    # exit 0

$ cat kaola-workflow/.roadmap/issue-777.md
issue: #777
title: repro
status: open
workflow_project: .roadmap
next_step: —

$ node scripts/kaola-workflow-roadmap.js project-name --issue 777
.roadmap                                                                 # exit 0

$ node scripts/kaola-workflow-claim.js startup --target-issue 777 --json
ENOTDIR: not a directory, mkdir '.../kaola-workflow/.roadmap/.cache/origin'   # exit 1

$ git status --porcelain
 D kaola-workflow/.roadmap/.cache
 D kaola-workflow/.roadmap/_rules.md
 D kaola-workflow/.roadmap/issue-777.md
 D kaola-workflow/.roadmap/issue-778.md
```

`cmdRoadmapInitIssue` (`kaola-workflow-roadmap.js:335`) sanitizes `--workflow-project` for **CR/LF
only** — `(args['workflow-project'] || '—').replace(/[\r\n]/g, ' ')`. No reserved-name check, no
dot-prefix check. So the reserved name enters durable state through the supported authoring command
and is then resolved back out by `projectNameForIssue` (`claim.js:293-300`), which adopts it verbatim
subject only to `isSafeName`.

**This is not an internal-caller-only defect.** It is reachable from the two commands an orchestrator
actually runs, and R2/R3/R4 need no operator to type a reserved name anywhere — the name travels in
roadmap data.

## Per-site reachability verdict

**Site 1 — `claimProject` (`:1180-1191` adopt, `:1263` rm): REACHABLE with a reserved name.**
Callers: `cmdClaim` (`:1907`, `--project` verbatim) and `claimExplicitTarget` (`:1477`,
`args.project || projectNameForIssue(...)`), itself reached from `cmdStartup` (`:1996`) and thus
`cmdPickNext` (`:2015` delegates to `cmdStartup`). Both give full control of `project`.

**Site 2 — `claimBundle` (`:1543-1559` adopt, `:1690-1698` rm): NOT reachable with a reserved name;
reachable for the wider adopted-dir case.** Its only caller `claimExplicitBundle` derives the name at
`:1804`: `const project = 'bundle-' + targets.join('-');` — hardcoded prefix, targets already
validated as positive integers, `args.project` never consulted. So no `.roadmap` / `archive` can
reach it. But the leg-5 class does: a stateless `kaola-workflow/bundle-777-778/` holding content is
adopted (`applied.dir = true` unconditionally at `:1559`) and rm -rf'd on any failure — measured in
leg 3, where it destroyed the sentinel tree **at exit 0**.

**`resume`: NOT a path.** `cmdResume` calls neither `claimProject` nor `claimBundle`.

## Existing test coverage

None. `grep -rln "orphaned stateless\|stateless dir" scripts/test-*.js scripts/simulate-workflow-walkthrough.js`
returns nothing, and no walkthrough assertion pairs "rollback" with the project directory. The
adopt-then-rm pair is unpinned in both directions, so leg 4's correct behaviour is also unprotected.

---

# What the issue got wrong

1. **The named validator does not exist.** `adaptive-schema.js:400-430` is `isParkedLanePath`, a
   clean-check ignore predicate, not a project-name gate. Nothing on the claim path consults a
   reserved-name list; `isReservedWorkflowDirName` exists but has exactly one call site, in
   `archiveProjectDir`.
2. **The second site is `claimBundle`, not `claimExplicitBundle`.** `claimExplicitBundle` is the
   validating wrapper and is where the hardcoded `bundle-` prefix makes the reserved-name variant
   unreachable at that site.
3. **The issue's framing is too narrow.** "A failed claim must not delete anything the claim did not
   create" is right, but the reserved-name story undersells it: leg 5 loses data with an entirely
   ordinary project name (`issue-777`). A reserved-name refusal alone does not fix this.
4. **The issue treats this as one failure mode; it is two.** Adoption is separately harmful even
   with no failure at all (leg 1 / R1 / R2 / R5: the claim *succeeds* and writes run state into the
   roadmap or archive band at exit 0).

# What this changes for the fix

- **A reserved-name refusal at the claim site is necessary but NOT sufficient.** Leg 5 destroys with
  `issue-777`. The rollback must track *created* vs *adopted* — `claimProject` has no `applied`
  record at all, and `claimBundle`'s sets `applied.dir = true` unconditionally at `:1559`, so both
  need the EEXIST arm to record that the directory was pre-existing.
- **Two independent defects.** Even with rollback fixed, adoption still writes run state into
  `.roadmap`/`archive` at exit 0 (leg 1, R1, R2, R5). Fixing only the rollback leaves that; fixing
  only the name check leaves leg 5.
- **`claimBundle` additionally mis-reports.** It destroys and returns
  `target_set_unavailable` / `result: "answer"` → **exit 0**, with the reasoning string *"bundle
  provision failed and was rolled back"* — false in the direction that matters. Whatever the fix
  does, that envelope must stop claiming a rollback happened when a deletion did.
- **The blast radius includes the archive band** (R5b: every archived run deleted), which the issue
  does not mention. `archive` reaches `claimProject` exactly as `.roadmap` does.
- **`roadmap init-issue` is the upstream door.** `--workflow-project` is CR/LF-sanitized only. A
  guard at the claim site closes the destruction; a guard here would stop the name entering durable
  state in the first place. Fixing only `init-issue` would not help — R1 bypasses it via `--project`.

# Open / not measured

- Not run against a **linked worktree** checkout. The `#930` commentary notes the archive path could
  commit such a deletion onto the branch the sink merges to main; whether the claim-side deletion
  reaches main the same way is unmeasured.
- The `.cache`-as-file and newline-`codexDispatchMode` faults are stand-ins for a real ENOSPC/EIO.
  The rollback does not inspect the error, so this is not believed to matter, but no genuine
  disk-full failure was induced.
- Everything ran with `KAOLA_WORKFLOW_OFFLINE=1` (no forge). Online adds worktree provisioning and
  label steps ahead of the transaction; the rollback line itself is unconditional and unchanged.
- Case-folding (`--project Archive`) not run at the claim site; `isReservedWorkflowDirName` folds
  case but is not called there, so the fold is presumed moot until a guard exists to fold in.
