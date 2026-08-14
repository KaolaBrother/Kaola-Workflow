# tests-sink.md — pinning the sink's untracked-work blindness

STATUS: DONE

Baseline commit: `6926493661e1a69c910e50f5a3d82b09af85e4ee`
Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
Test artifact (mine, sole): `scripts/test-sink-merge.js` — md5 `74110486caa4b7ac524bcc626466daac`.
Nothing else was touched, at any point.

**How the baseline was measured, and why it matters here.** An implementer landed a repair into the
sink scripts while my suite was running, and one of my runs was a **torn read** — the suite spawns
the sink once per scenario, so early scenarios saw the pre-repair file and late ones saw the
post-repair file, producing a failure set that described no version of the tree. Every number below
is therefore measured on a **frozen snapshot**: production scripts pinned to `HEAD` via
`git archive`, with only my test file overlaid. That is also the correct definition of "baseline" —
it cannot be perturbed by anyone else's in-flight writes.

---

## THE AUTHORITATIVE RED SET — 24 assertions, per edition

Suite line: **`24 failed, 918 passed`**, exit 1. Pristine (my arms removed, same snapshot):
`passed: 830 assertions`, exit 0 — my 112 assertions introduce exactly these 24 and nothing else. No
pre-existing test regressed.

| arm | root | codex | gitlab | gitea | total |
|---|---|---|---|---|---|
| (e) genuine untracked FILE, `--sink` | RED ×2 | RED ×2 | RED ×2 | RED ×2 | 8 |
| (h) untracked SYMLINK, `--sink` | RED ×2 | RED ×2 | RED ×2 | RED ×2 | 8 |
| (i) genuine untracked FILE, LEGACY | RED ×2 | RED ×2 | RED ×2 | RED ×2 | 8 |
| (f) lane-only, `--sink` | green | green | green | green | control |
| (g) ignored-only, `--sink` | green | green | green | green | control |
| (i-control) lane-only, LEGACY | green | green | green | green | control |

Verbatim for `root`; the other three editions differ only in the label:

```
RED: #973 (e/root) — the untracked work must still exist after the sink
     exit=0 status="sinked" reason=undefined worktree_still_present=false survivors=[]
RED: #973 (e/root) — the sink must not report unqualified success over a worktree carrying uncommitted work
     exit=0 status="sinked" reason=undefined worktree_still_present=false survivors=[]
RED: #973 (h/root) — the untracked SYMLINK must still exist after the sink, by lstat
     exit=0 status="sinked" reason=undefined worktree_still_present=false surviving_links=[]
RED: #973 (h/root) — the sink must not report unqualified success over a worktree carrying an uncommitted symlink
     exit=0 status="sinked" reason=undefined worktree_still_present=false surviving_links=[]
RED: #973 (i/root) — the untracked work must still exist after the LEGACY sink
     exit=0 status="merged" reason=undefined worktree_still_present=false survivors=[]
RED: #973 (i/root) — the legacy sink must not report unqualified success over a worktree carrying uncommitted work
     exit=0 status="merged" reason=undefined worktree_still_present=false survivors=[]
baseline: 6926493661e1a69c910e50f5a3d82b09af85e4ee
```

## NO ARM IS GREEN-VACUOUS — how that was established, arm by arm

Not asserted; each line is a measurement.

| arm | how non-vacuity was established |
|---|---|
| **(e)** | RED at baseline on all four, and the red carries **positive evidence the destructive step ran**: `worktree_still_present=false` and `survivors=[]`. A run stopped by an earlier precondition shows `true` and a survivor — that exact contrast is in the record (see the gitlab/gitea line below). Premise clauses also assert the file is on disk pre-run and that the guard's own flag form reports nothing over it. |
| **(f)** | Green at baseline by design. **Armed**: reds on all four under counter-mutation 1, alongside 9 reds in the pre-existing #707 h. |
| **(g)** | Green at baseline by design. **Armed**: reds on all four under counter-mutation 2, and **nothing else in the 942-assertion suite reds with it** — it is the only instrument for that failure. |
| **(h)** | RED at baseline on all four with `surviving_links=[]`. **Proven distinct from (e)**: under counter-mutation 3 it reds on all four while (e) and (i) go green — a repair handling files and forgetting links passes (e) and fails only here. |
| **(i)** | RED at baseline on all four with `worktree_still_present=false survivors=[]`. Plus a **new explicit premise** (below) requiring (i-control) to have completed on that edition, and `exit !== 3`. **Armed**: reds on all four under counter-mutation 4 while every other arm stays green. |
| **(i-control)** | Green at baseline by design. **Armed**: reds on all four under counter-mutation 1. |

### The vacuity that was real, and is now instrumented

(i) *was* green-vacuous on gitlab and gitea at an earlier revision of this file. Those two sinks carry
two legacy-path preconditions root and codex lack — `finalValidationPassed` (gitlab `:1079`, gitea
`:1090`) and an archived early-exit returning **exit 3** (gitlab `:1103`) — and both stop the run
before the destructive step. Nothing is destroyed, so the survival clause passed; the non-zero exit
made the `told` clause pass. Both clauses passed while measuring nothing.

Two changes closed it, and the second is the general guard:

1. **Fixture posture.** `buildLegacyWorktreeFixture973` (`:4389`) is in-place: run folder **live in
   the main root and untracked there** (invisible to `--untracked-files=no`, absent from the branch
   tip, so neither `assertNoLiveWorkflowFolder` nor the archived early-exit fires), and a
   `finalization-summary.md` satisfying `/Final Validation/i` AND `/pass/i` AND no `/blocked|failed/`.
   All four editions now reach exit 0 / `status: "merged"` and destroy the file.
2. **A per-edition non-vacuity premise** (`:4482`): `(i-control)` now **returns** whether it
   completed, runs first, and its result is passed into (i) as a premise. An arm cannot be evidence
   on an edition where the same fixture and the same entry point cannot be driven to completion.
   Plus `result.status !== 3` (`:4490`), the one stop that reports success-ish rather than an error.

**Why NOT the literal "a null envelope means nothing was measured, so red".** I implemented the
intent, not the wording, because the wording forbids a correct repair — and I measured that rather
than arguing it. `main()`'s terminal is `catch (err) { stderr; exitCode = 1 }` (`:3275`), so the
legacy path emits **no JSON for any throw**, including a legitimate refusal inside
`assertWorktreeClean`. Injecting the literal rule into (i) and running **repair family A**, which is
a complete and correct fix:

```
FAIL: #973 (i/root) LITERAL-NULL-ENVELOPE-RULE: an arm whose envelope is null has measured nothing.
      exit=1 status=null reason=null worktree_still_present=true survivors=[".kw/worktrees/issue-97341/src/util/helper.js"]
  → 4 failed, 942 passed — red on all four editions, on a repair that works
```

The work survived and the operator was told; only the envelope was absent. The rule would have
pinned the mechanism (an envelope must exist) rather than the result. The (i-control)-completed
premise catches the same vacuity and reds under counter-mutation 1 while leaving family A green.

---

## The defect

`assertWorktreeClean` is the only gate before `git worktree remove --force`. Its probe passed
`--untracked-files=no`, which structurally cannot report an untracked path. **All four sink copies
carried the identical probe** at baseline: root `:520`, codex `:520`, gitlab `:488`, gitea `:503`.
Both entry points call it — `sinkPreflight` `:1692` and `main()` `:3171` — and each then force-removes
the worktree by its own route.

## What landed

`scripts/test-sink-merge.js`, section `#973 the UNTRACKED half of the data-loss guard` (`:4063`),
after the existing `#912` block, run for all four sink copies (edition table `:4557`).

Pins: `:4226`/`:4231` (e) · `:4262` (f) · `:4297` (g) · `:4352`/`:4357` (h) · `:4498`/`:4502` (i) ·
`:4540` (i-control).
Arm bodies: `:4177` (e) · `:4239` (f) · `:4273` (g) · `:4308` (h) · `:4431` (i) · `:4521` (i-control).
Helpers: `filesContaining973` `:4113` · `symlinksTo973` `:4143` · `assertUnderTmpdir973` `:4166` ·
`plantWorktreeUntracked973` `:886` · `buildLegacyWorktreeFixture973` `:4389`.
Reused rather than duplicated: `buildWorktreeEvidenceFixture` gained three default-off knobs
(`untracked`, `symlinks`, `gitignore`) and returns `wtPath`; `runSinkLegacy` was split into
`runSinkLegacyAt(script, …)` `:384`, mirroring the existing `runSinkAt`. Pre-existing callers
unchanged. (#912 b) pins the tracked case and is untouched.

### Why the outcome, not the preflight decision

Every destructive arm runs the real transaction with no abort hook, so `git worktree remove --force`
actually executes, and asserts **survived** (searched for across the whole fixture, never at a fixed
path, so a repair that relocates the artifact is not mistaken for one that destroyed it) and **told**
(a non-zero exit, **or** a typed `reason`, **or** the path named in the output). Pinning the preflight
decision would have forced the repair into `assertWorktreeClean`; family B puts it elsewhere and passes.

### The symlink oracle (h) — three measured reasons it cannot reuse (e)'s

Measured on `plugins/plugins -> plugins`, and asserted as premises inside (h) (`:4326`, `:4330`):

| probe | answer |
|---|---|
| `fs.existsSync` | **false** — the link resolves to itself |
| `fs.lstatSync().isSymbolicLink()` | true |
| `Dirent` `.isFile()` / `.isDirectory()` / `.isSymbolicLink()` | false / false / **true** |
| `git status --porcelain -uall` | `?? plugins/plugins` |
| `git status --porcelain --untracked-files=no` | `""` |

(e)'s walk is `if (isDirectory) recurse; if (!isFile) continue;` — it steps over a link in silence,
and there are no bytes to search. Counter-mutation 3 shows this is not theoretical.

### The `--keep-issue-open` posture (kept)

Every arm passes it, as (#906 z4) does: without it the GitLab and Gitea **closure** terminals call the
shared cwd-honest `gh` mock from a cwd it rejects and the run ends `sink_incomplete` for a reason
unrelated to this guard. Keep-open reaches the same terminal past the same worktree removal.

---

## The lane / genuine-work boundary, and the evidence

**Lane = under `kaola-workflow/` (and `.kw/…`); everything else is genuine work.**

1. The sink says so at the removal it is about to perform (`kaola-workflow-sink-merge.js:2100-2130`):
   it stages `<wt>/kaola-workflow/<project>/` first, precisely so "genuinely worktree-only (untracked)
   content, e.g. a `.cache/` crash-resume journal, still survives".
2. `test-sink-merge.js:899` (#707 h) already pins that end to end. **Under the bare flag flip it reds
   with 9 failures** — independent corroboration.
3. `PARKED_LANE_PREFIXES` (`kaola-workflow-adaptive-schema.js:301`) is the project's own declaration.

**`isParkedLanePath` cannot be reused with the run's own project as `ownedProjects`.** It returns
`false` for the owned project (`adaptive-schema.js:429-431`) — right for the *main root*, wrong for
the *linked worktree*, where the own-project lane is exactly what must be ignored. (f) and (i-control)
both use that shape.

### The ignored-files question — measured, and kept as a control

`git status --porcelain -uall` over a worktree whose only extra content is `node_modules/…` under a
committed `node_modules/` rule reports **an empty string**. No `--untracked-files` setting reaches
ignored files. So widening the flag cannot break (g); (g) is the control against a repair reaching
past the flag into `--ignored`, which would refuse over every generated tree this repo carries.
Asserted as a premise inside (g) (`:4291`).

---

## Mutation matrix

All on scratch mirrors of the frozen HEAD snapshot. **The real tree was never patched**;
`git checkout --` was never used; every real exit code captured directly.

| # | mutation | result |
|---|---|---|
| — | **baseline** | `24 failed, 918 passed` — (e)×8, (h)×8, (i)×8; three controls green |
| A | **repair family A** — widen the probe, subtract the lane population; refuses, worktree stands | **`passed: 942 assertions`, exit 0** |
| B | **repair family B** — preserve-and-report, no path classification at all, forced removal unchanged, **both** entry points, exit 0 | `1 failed, 941 passed` — **zero #973**; the one red is `#707 h: ?? .kw/`, an artefact of where my crude mutation put the rescue dir |
| 1 | counter: **bare flag flip** | `21 failed, 919 passed` — (f)×4, (i-control)×4, **(i)-premise×4**, #707 h×9. (e)/(h)/(i) clauses go green: it fixes the leak and breaks every run doing it |
| 2 | counter: **over-broad `--ignored`** | `4 failed, 938 passed` — (g)×4 **and nothing else in the suite** |
| 3 | counter: **preserve repair blind to symlinks** (`copyFileSync` follows the link, ELOOP) | `9 failed, 933 passed` — (h)×2×4 + artefact; **(e) and (i) both green** |
| 4 | counter: **repair in the `--sink` transaction only** | `9 failed, 933 passed` — (i)×2×4 + artefact; **(e), (h), (f), (g), (i-control) all green** |
| 5 | counter: family A + the **literal null-envelope rule** | `4 failed, 942 passed` — (i)×4 **on a correct repair**; the reason that rule was not shipped |

Families A and B produce opposite observable outcomes — refuse + worktree standing, versus exit 0 +
worktree gone + artifact preserved elsewhere — and both satisfy all six arms.

---

## One measurement of the landed repair (information, not a verdict)

A repair landed in the working tree during this work. Run from a snapshot whose five production files
were hashed **before and after** the run and were identical (`a057c00e26679d0794ab6d3f2b49b9e5`, so
the run was not a moving target): `passed: 942 assertions`, exit 0, no assertion of mine failed.

Recorded because the earlier torn read produced a misleading failure set that should not be believed.
**Whether the repair is correct is not my call** — I hold the tests, not the verdict on the code they
judge. The mutation matrix above is what a reviewer should re-run against it.

---

## Cleanliness

`scripts/test-sink-merge.js` is the only file I modified, in either tree; the worktree's other 39
entries are other agents' in-flight work and the three roadmap sources. `git worktree list` unchanged
(2 entries). Every fixture was built under `os.tmpdir()` and proven there by `assertUnderTmpdir973`
**before** any destructive call; each cleans up in a `finally`. All scratch mirrors deleted.
`node scripts/test-suite-registration.js` → exit 0; no new file added.

Temp-dir residue at the end is **not mine**: `kw-sandbox-home-*` and `kw-kernel-conformance-*` from
other agents' suites (one timestamped seconds before I looked — a live run), and `kw-wtsync-*` from
the sink's own staging (below). I deleted nothing belonging to another agent.

## Deliberately left unpinned, with reasons

- **Which mechanism repairs it.** By design, and demonstrated: families A and B are structurally
  opposite and both pass.
- **Untracked lane content belonging to *another* project in the worktree.** No evidence it occurs,
  and destroying another run's lane state is a value call rather than a fact. *(Lead concurred.)*
- **Whether preserved bytes must land at a *named* location** (a receipt field, a documented path).
  The arms accept stderr naming the path. Tightening that is a product decision.
- **The `sink-pr` route and the `--sink` resume path.** Both reach `removeWorktree` by other means;
  neither is driven by these arms. Recorded rather than built.

## Two incidental observations (neither mine to fix)

1. The sink's own staging dir — `fs.mkdtempSync(os.tmpdir() + '/kw-wtsync-')`, `sink-merge.js:2124` —
   is never removed; seven survived. Pre-existing, outside both trees.
2. The GitLab and Gitea **closure** terminals call the forge CLI from a cwd the cwd-honest mock
   rejects, from this fixture shape. Possibly a mock/CLI-semantics mismatch rather than a defect; not
   chased, worked around with `--keep-issue-open` as (#906 z4) already does.
