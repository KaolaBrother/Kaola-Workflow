# T4 — #711 branchless removal: measurement + deletion plan

baseline commit: `c486936d0ca25ef1454bdd3c4d1fce280fcd43ea`
worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-918-919-920-921-922-923`

---

## (A) THE MEASUREMENT — post-removal `--branch TBD --sink` FAILS LOUDLY

**It does not silently accept, and it destroys nothing.** #923's one unacceptable outcome does not
occur. The removal needs no pairing with a new refusal.

### Method

`scripts/` mirrored into a scratch dir; the mirrored `kaola-workflow-sink-merge.js` doctored so every
branchless gate evaluates as it would after deletion. Every use site is `branchless` / `!branchless` /
`branchless ? A : B` / `if (branchless) {…} else {…}`, and `isBranchless` in `main()` gates only the
assert-bypass and the typed refusal — so pinning the three predicates to `false` is behaviourally
identical to deleting the branches, and cannot slice an adjacent line the way a hand-cut patch can:

```
scripts/kaola-workflow-sink-merge.js:1554  const branchless  = branch === 'TBD'       -> false
scripts/kaola-workflow-sink-merge.js:1839  const branchless  = args.branch === 'TBD'  -> false
scripts/kaola-workflow-sink-merge.js:2939  const isBranchless = args.branch === 'TBD' -> false
```

Fixture: the #711 in-place shape — live folder + deliverable committed straight to `main`,
`workflow-state` recording `branch: TBD`, `origin/main` deliberately left BEHIND local `main` so
"the sink published anyway" is observable. `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null`
throughout. Harness: `<scratchpad>/measure-tbd-postremoval.js` (not in the repo).

### Results

| arm | subject | exit | outcome |
|---|---|---|---|
| CONTROL-A | **undoctored** mirror, `--branch TBD --sink` | 0 | `status:sinked`, `branch_mode:"branchless"` — the fixture is sound |
| CONTROL-B | **doctored** mirror, a REAL feature branch `--sink` | 0 | `status:sinked` — the removal is surgical, the normal path is untouched |
| **M1** | **doctored**, `--branch TBD --sink`, OFFLINE=0 | **1** | typed refusal `sink_incomplete` at `push_upstream` |
| M2 | doctored, `--branch TBD --sink`, OFFLINE=1 | 1 | uncaught-then-caught git error, **no typed envelope** |
| M3 | doctored, `--branch TBD` (no `--sink`) | 1 | legacy path stops at the upstream-push precondition |

**M1 — the shipped posture, verbatim:**

```
exit code: 1
{"result":"refuse","reason":"sink_incomplete","step":"push_upstream","push_upstream":"failed",
 "branch":"TBD","detail":"`git push -u origin TBD` did not verifiably reach parity with its
 upstream — the feature branch may not be backed up on the remote. Refusing to report
 status:sinked. The push_upstream step is left NOT done so a re-run retries it. Resolve the push
 fault (or push manually: git push -u origin TBD) and re-run --sink."}

stderr: 错误：源引用规格 TBD 没有匹配
        sink-merge --sink: push upstream failed: branch TBD is not at parity with its upstream after push.

repo state after: local main UNCHANGED, origin/main UNCHANGED (still behind), live folder PRESENT,
                  branches: main only, gh log: []  (no issue closed)
residue: ?? kaola-workflow/<project>/.cache/sink-receipt.json  — the designed crash-resume journal
```

**M2 (OFFLINE=1)** skips `push_upstream` entirely and dies one step later at the merge checkout:

```
exit code: 1
envelope: null
stderr: 错误：路径规格 'TBD' 未匹配任何 Git 已知文件
        Command failed: git -C /private/var/…/kw-tbd-hjnR0s checkout TBD

repo state after: local main UNCHANGED, origin/main UNCHANGED, live folder PRESENT, gh log: []
```

**M3 (no `--sink`)** — where `branch_tbd_requires_sink` used to fire — exit 1, no envelope,
`Branch 'TBD' has no upstream tracking ref, and 'git push -u origin TBD' failed.` Nothing mutated.

### Why it is loud, mechanically

The sink never verifies a branch into existence (no `show-ref`, no `rev-parse --verify`, no
`branch_missing`). Absence is discovered downstream by the first operation that needs the ref:
`push_upstream`'s `#619(3)` upstream-parity check online, the merge step's `git checkout <branch>`
offline. Both are pre-existing and both fail closed. `SINK_STEPS` order
(`preflight → push_upstream → merge → …`) puts both strictly before `finalize`, `archive_commit`,
`push_main` and `closure` — so the stop lands before anything is archived, published or closed.

### Two notes, neither a blocker

1. **M1's operator hint is wrong-headed** post-removal: it advises `git push -u origin TBD`, i.e.
   creating a branch literally named `TBD`. It is loud and it names the branch, so the operator is
   not misled about *what* stopped — only about the remedy. Recommend leaving it: it is the generic
   nonexistent-branch message and rewording it for one value re-introduces a TBD-shaped surface.
2. **M2 carries no typed envelope.** Loud and clearly attributable (git's own message names `TBD`),
   but untyped and un-journaled. This is the pre-existing shape of *any* nonexistent branch under
   OFFLINE, not something the removal introduces. Recorded, not built.

### Two of three forges already behave this way today

`kaola-gitlab-workflow-sink-merge.js` and `kaola-gitea-workflow-sink-merge.js` carry `branchless`
**only** in `sinkPreflight`; their `runSinkTransaction` has no branchless variable at all. So
`--branch TBD --sink` on those ports already refuses `sink_incomplete` at `push_upstream` today —
post-removal canonical behaviour is shipped behaviour on two of three forges. Their one branchless
site therefore only lets preflight through so `push_upstream` can refuse: deleting it there is pure
dead-code removal with no reachable behaviour change.

---

## (B) THE DELETION PLAN

### B1 — production sites (implementer's write set; listed for cross-check, not authored here)

`scripts/kaola-workflow-sink-merge.js` and its byte-mirror
`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (identical line numbers):

| lines | what |
|---|---|
| 1549–1554 | `sinkPreflight` comment + `const branchless = branch === 'TBD'` |
| 1562–1563, 1569 | the `if (!branchless) {` wrapper around `assertWorktreeClean` (unwrap, keep the body) |
| 1639–1642 | bucket-2 `catKey = branchless ? 'HEAD' : branch` (collapse to `branch`) |
| 1707–1708 | own-archive `archiveKey = branchless ? 'HEAD' : branch` (collapse to `branch`) |
| 1833–1839 | `runSinkTransaction` comment + `const branchless = args.branch === 'TBD'` |
| 1848 | `if (branchless) receipt.branch_mode = 'branchless'` — the only `branch_mode` producer |
| 1943–1945 | `push_upstream` skip |
| 1990–1993 | `merge` skip |
| 2665–2673 | publish-probe `if (branchless) {…} else {` (unwrap, keep the else body) |
| 2797–2799 | ancestry-probe `if (!branchless) {` wrapper (unwrap, keep the body) |
| 2871–2873 | worktree-removal `if (!branchless) {` wrapper (unwrap) |
| 2881–2883 | feature-branch-cleanup `if (!branchless) {` wrapper (unwrap) |
| 2912 | the `SINK_USAGE` `--branch TBD` line |
| 2933–2939 | `main()` comment + `const isBranchless` |
| 2940, 2946 | the `if (!isBranchless) {` … `}` wrapper around the branch assert at 2941–2945 (unwrap, keep the assert — this is what leaves `TBD` a valid name) |
| 2947–2954 | the `if (isBranchless && !isSinkMode)` `branch_tbd_requires_sink` typed refusal |

Forge ports, ONE site each (#912):
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:1549–1551` (comment +
  `const branchless`), `1556–1559` (#912 comment), `1560` + closing `1566` (unwrap `if (!branchless)`).
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js:1542–1544`, `1549–1552`,
  `1553` + closing `1559` — same shape.

### B2 — tests that DIE WITH the mechanism

#### `scripts/test-sink-merge.js` — 2 ranges

| lines | delete | what it pinned |
|---|---|---|
| **837–953** | whole block (incl. the trailing blank line) | the `#711 branchless` section header (837), `buildBranchlessFixture` (843–887) and `testBranchlessInPlaceSink` (889–952): that `--branch TBD` without `--sink` refuses `branch_tbd_requires_sink`, and with `--sink` reaches `status:sinked` with `receipt.branch_mode === 'branchless'`, main pushed, issue closed, folder archived, roadmap source removed. Every assertion is a property of the removed path. `buildBranchlessFixture` has no other caller (verified). |
| **4031–4041** | `#912` arm **(a)** + its comment | "a branchless run with no probe fault must pass preflight and refuse nothing" — (e)'s attribution control; dies with (e). |
| **4083–4096** | `#912` arm **(e)** + its comment | "a branchless run whose `git worktree list` probe faults must not refuse `worktree_dirty`" — the exemption itself. |
| **3970–3982** | `mkBranchless` + its blank line | fixture used only by (a) and (e). |

Also inside `assertPreflightGuardScope912`, prose only (no assertion changes):
- **3940–3960** — the block header states the expectation as "a BRANCHLESS / in-place run … the
  guard does not run". Rewrite to the surviving half only ("`sinkPreflight` asserts a clean worktree
  on every run; dirty refuses, unprobeable refuses (fail closed)"). Leaving it names machinery that
  is gone.
- **4028–4029** — "controls first, the branchless-under-fault arm last" — stale ordering note.
- **4076** — arm **(d)**'s message: "the branchless exemption is scoped to `--branch TBD` and must
  not disarm the guard for runs that do have a worktree". **(d) itself SURVIVES** — reword the
  message only. This is not repairing a test ahead of its mechanism; the assertion is unchanged.

Summary-label bookkeeping: lines **4225** and **4228** (post-insert) both carry
`Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893)`. Drop `#711` — after B2 the suite carries
no #711 coverage.

#### `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — 3 ranges

| lines | delete | what it pinned |
|---|---|---|
| **2410–2423** | `mkBranchless912` + comment + trailing blank | the branchless fixture; only (a) and (e) call it. |
| **2475–2488** | arm **(a)** + comment + trailing blank | branchless preflight passes with no probe fault — (e)'s attribution control. |
| **2536–2551** | arm **(e)** + comment + trailing blank | branchless + probe fault must not refuse `worktree_dirty` — the exemption. |

Prose only: **2360–2376** block header (same rewrite as canonical); **2472–2473** the
"controls first, the divergence LAST" note; **2529** arm (d)'s "the branchless exemption is scoped to
`--branch TBD`" wording. **(d) survives.**

#### `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — 3 ranges

| lines | delete | what it pinned |
|---|---|---|
| **2355–2368** | `mkBranchless912` + comment + trailing blank | same. |
| **2420–2433** | arm **(a)** + comment + trailing blank | same. |
| **2481–2496** | arm **(e)** + comment + trailing blank | same. |

Prose only: **2308–2324** block header; **2417–2418** the ordering note; **2474** arm (d)'s wording.
**(d) survives.**

> Delete bottom-up within each file so earlier ranges keep their numbers.

### B3 — no other test coverage exists

Swept `$WT/scripts/*.js` and `$WT/plugins/*/scripts/*.js` for `branchless` and `TBD`:
- `branchless` appears in exactly 6 non-archive source files: the four sink scripts and the two forge
  sink suites, plus `scripts/test-sink-merge.js`. All accounted for above.
- `branch_mode` appears **only** at `sink-merge.js:1848` (both copies), `test-sink-merge.js:917–920`,
  and one historical `CHANGELOG.md` entry. No `docs/api.md` entry, no other reader — confirmed.
- There is **no** codex mirror of `test-sink-merge.js`; the root suite drives the codex copy through
  the `['root', …], ['codex', …]` loop at 4101–4110.

---

## (C) TESTS THAT MUST SURVIVE — the trap

1. **`#912` arms (b), (c), (d) in all three suites.** They use `mkBranched` / `mkBranched912` and pin
   the worktree-clean guard itself: dirty refuses with zero mutation (b), clean proceeds (c), and
   **unprobeable fails closed** (d, the #506 counter-pin). None depends on the branchless exemption —
   only (d)'s *message* names it. Deleting these deletes the #346/#496/#562 data-loss guard's
   coverage, which the branchless work never owned.
2. **`test-gitea-sinks.js:410` and `test-gitlab-sinks.js:439`** —
   `assert(err && /--branch is invalid or TBD/.test(err.message), …)`. These pin
   `runDirectMerge`'s branch-name validation in the forge ports, which is the **pre-#711 legacy
   refusal**, not the branchless mechanism (canonical dropped the `or TBD` clause when #711 landed
   and never got it back). The ports' `runDirectMerge` is not on the removal's write set, so these
   stay green untouched. Do not "harmonise" them with canonical as part of this removal — that is a
   separate, owner-facing divergence question.
3. **Every `next_step: TBD` / `| TBD |` roadmap-fixture string** — `test-sink-merge.js:215,220`,
   `test-bundle-finalize.js:93,105,812`, `test-finalize-door.js:157,163`,
   `test-gitea-sinks.js:1769,1772`, `test-gitlab-sinks.js:1820,1823`,
   `test-gitea-workflow-scripts.js:4670`, `test-gitlab-workflow-scripts.js` (1). These are the
   roadmap mirror's "next step" column. Unrelated to the branch slot. A blanket `TBD` grep-and-delete
   eats all of them.

### One prose surface, flagged not proposed

`templates/routing/next.skeleton.md:317` (rendered to `commands/workflow-next.md:239`) emits
`Branch: {branch from workflow-state.md, or TBD if not yet claimed}`. It is a **display** line — it
never feeds `--branch` — but post-removal it is the only agent-facing prose that can put `TBD` in an
operator's head as a branch value. Whether to reword it is a values call, and it belongs to the
owner, not to this removal. Note the skeleton is the authoring surface; the command file is generated.

---

## (D) THE PIN THAT WAS ADDED

Yes — one, and it is RED at baseline.

`scripts/test-sink-merge.js:4112–4220` — `#923 a branch that is not there`.

The property post-removal rests on is that a `--branch` naming a ref that does not exist is
discovered downstream and fails closed. Nothing pinned that: the only tests that ever fed the sink a
nonexistent branch are the ones B2 deletes, so the removal would leave `#923`'s claim
("silently accepting it is the one outcome that is not acceptable") unguarded.

**Two arms, one assertion set** (`assertMissingBranchIsNotSilentlyAccepted923`) — exits non-zero,
never reports `status:sinked`, closes no issue, does not advance `origin/main`, leaves the live
folder resumable, and names the branch it could not find. Preconditions assert the fixture is
observable (local `main` ahead of `origin/main`) and that no ref by that name exists.

- `control/absent-name` — `--branch workflow/never-created`. **GREEN today.** It holds the general
  property and makes the TBD arm's red attributable to the *value* of the branch rather than to the
  fixture.
- `TBD` — the same input with the name `TBD`. **RED today**, green after the removal.

The fixture (`buildInPlaceFixture923`) is deliberately self-contained so the pin does not depend on
`buildBranchlessFixture`, which B2 deletes. This test is not branchless machinery: post-removal it
reads as "a nonexistent branch is never silently accepted, and TBD is not special."

### The RED

```
$ GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null node scripts/test-sink-merge.js
FAIL: #923 (TBD): a --branch naming a ref that does not exist must exit NON-ZERO. exit=0 envelope={"result":"ok","status":"sinked",…,"branch":"TBD",…}
FAIL: #923 (TBD): a --branch naming a ref that does not exist must NEVER reach status:sinked — that reports a merge that could not have happened.
FAIL: #923 (TBD): no issue may be closed over a branch that does not exist. gh log=["close:92302","label-removed:92302"]
FAIL: #923 (TBD): origin/main must not advance — nothing was verifiably merged.
FAIL: #923 (TBD): the live project folder must survive — a run that did not complete must stay resumable, not be archived out from under itself.

Sink-merge (#694/#700/#705/#707/#711/#715/#746/#832/#893) test suite FAILED: 5 failed, 660 passed.
exit 1
```

All five failures are the `#923 (TBD)` arm. Zero pre-existing failures — the rest of the suite is
green at this baseline. The control arm passed all six of its assertions.

> **`scripts/test-sink-merge.js` is RED BY DESIGN at `c486936d` until the removal lands.** It is not
> a regression. The removal must not be considered done while it is red, and it must not be made
> green by touching this pin.

---

## Worktree state

No production script was edited. `git status --short` at handoff:

```
 M scripts/test-forge-finalize-findings.js   <- another teammate's, untouched by T4
 M scripts/test-sink-merge.js                <- T4: the #923 pin only (+110 lines, 0 deletions)
?? scripts/test-forge-archive-scoping.js     <- another teammate's
?? scripts/test-forge-roadmap-rules.js       <- another teammate's
```

No existing test was deleted or modified. The doctored sink lived only in `$TMPDIR` mirrors, now removed.
