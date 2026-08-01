# Premise verification — issue #902

## VERDICT

**PREMISE HELD.** On a normal linked-worktree topology (main-resident run folder, worktree not
carrying it, no archive) `finalize --check` reports `archive_authority_missing` and exits 1, while the
real `finalize` transaction from the *same* cwd succeeds — `finalize_transaction.mirror: mirrored`,
`archived: true`, `closure_invariants.ok: true` — because the transaction's Step-8a mirror
**creates the very authority `--check` declared missing**, one statement before the authority is
resolved. Reproduced twice: live in this repo, and end-to-end (check + real execute) in a scratch
fixture. The seam is a pure **ordering** difference, not a root-resolution difference, and it is
narrowed to exactly one probe.

## Setup

- Commit: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (`main`, clean except the untracked live run folder)
- Live topology, verified before measuring:
  - `main_root: /Users/ylpromax5/Workspace/Kaola-Workflow`
  - `worktree_path: /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
    on `workflow/bundle-900-901-902-903`
  - `kaola-workflow/bundle-900-901-902-903/` exists in **main only** (`workflow-state.md`,
    `mission-list.md`, `.cache/`); the worktree's `kaola-workflow/` holds `.origin`, `.roadmap`,
    `archive`, `ROADMAP.md` and **no `bundle-900-901-902-903/`**
  - no archive for the project: `ls kaola-workflow/archive | grep bundle-900` → exit 1
- Scratch fixtures under
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p902/`
- **`--check` was confirmed read-only by reading the code before running it** (see "Read-only proof"),
  and the real finalize was **never** run against the live project.

## Live measurement

### A. From the main root (`/Users/ylpromax5/Workspace/Kaola-Workflow`)

```
node scripts/kaola-workflow-claim.js finalize --project bundle-900-901-902-903 --check --json
```
real exit code (`echo $?` on its own line, no pipe): **0**

```json
{"project":"bundle-900-901-902-903","ok":true,"checks":{"mirror":"not_needed","workflow_state":"ok","implementation_commit":"not_checked","staging_guard":"ok","validation":"chains_unverified","changed_paths":[],"dirty_paths":[]},"reasons":[]}
```
stderr: empty.

### B. From the linked worktree (`.kw/worktrees/bundle-900-901-902-903`)

```
node /Users/ylpromax5/Workspace/Kaola-Workflow/scripts/kaola-workflow-claim.js \
  finalize --project bundle-900-901-902-903 --check --json
```
real exit code: **1**

```json
{"project":"bundle-900-901-902-903","ok":false,"checks":{"mirror":"ready","workflow_state":"archive_authority_missing","implementation_commit":"not_checked","staging_guard":"ok","validation":"not_checked","changed_paths":[],"dirty_paths":[]},"reasons":["archive_authority_missing"]}
```
stderr: empty.

### C. Same cwd, with `--keep-worktree` (the flag the reported run used)

real exit code: **1**

```json
{"project":"bundle-900-901-902-903","ok":false,"checks":{"mirror":"ready","workflow_state":"archive_authority_missing","implementation_commit":"not_applicable","staging_guard":"ok","validation":"not_checked","changed_paths":[],"dirty_paths":[]},"reasons":["archive_authority_missing"]}
```

`archive_authority_missing` **appears**, from the worktree, on both invocations. The same command
from the main root is `ok:true`. The cwd is the only variable.

### Read-only proof (live)

Before/after the three `--check` runs:

| probe | result |
|---|---|
| `git status --porcelain` (main root), pre vs post | byte-identical (`diff` exit 0) |
| 383-entry `stat -f '%N %z %m'` listing of both project folders (main + worktree), pre vs post | byte-identical (`diff` exit 0) |
| `git rev-parse HEAD` | `9b68b096…` unmoved |

One caveat, stated rather than hidden: `checks.validation` reaches
`adaptiveSchema.computeCodeTreeHash` → `snapshotWorktree`, which runs `git add -A` under a
`GIT_INDEX_FILE` in `os.tmpdir()` (`kaola-workflow-adaptive-schema.js:1058-1075`) and unlinks it. The
repository index is never touched, but blobs do land in `.git/objects`. That is inert and invisible to
`git status`; it is not a tracked-file mutation.

## Fixture measurement

`…/scratchpad/p902/fixture.js` builds the #902 acceptance topology, modelled byte-for-byte on
`scripts/test-claim-hardening.js:3180` (`mk837`) with **one deliberate difference: the worktree
project folder is never seeded.** Self-host `package.json`, real `git worktree add -b workflow/<p>`,
implementation commit authored in the worktree, main-resident `workflow-state.md` +
`mission-list.md` + `.cache/chain-receipt.json` bound to the worktree HEAD, no archive.
`KAOLA_WORKFLOW_OFFLINE=1` (so remote closure is skipped; it does not touch the mirror or the
authority probe).

### Leg A — the #902 topology (`issue-902`)

Pre-state: `worktree project folder exists: false`; `archive exists: false (main) / false (wt)`.

1. `finalize --project issue-902 --keep-worktree --check --json`, cwd = worktree → **exit 1**
```json
{"project":"issue-902","ok":false,"checks":{"mirror":"ready","workflow_state":"archive_authority_missing","implementation_commit":"not_applicable","staging_guard":"ok","validation":"not_checked","changed_paths":[],"dirty_paths":[]},"reasons":["archive_authority_missing"]}
```
   `worktree project folder exists AFTER check: false` — the check performed no mirror.

2. `finalize --project issue-902 --keep-worktree` (REAL), **same cwd** → **exit 0**
```json
{"status":"closed","archived":true,
 "dest":"…/main/kaola-workflow/archive/issue-902",
 "validation":{"classification":"chains_green","green":true,"mode":"chain-receipt","detail":["4 chain(s) green over this tree"]},
 "changed_paths":["impl.txt"],
 "closure_invariants":{"ok":true,"violations":[]},
 "finalize_transaction":{"mirror":"mirrored","ledger_compare":"pass","residue_mirrored":0,
   "impl_commit":"not_applicable","roadmap_staged":true,
   "archive_commit":"deferred_to_sink","finalize_commit":"nothing_to_commit"}}
```
   After: `archive in main: ["issue-902"]`; worktree log gains `chore: archive issue-902`.
   **No operator mirror repair happened between the two calls.** The self-heal is proven.

   Note a *second* consequence of the same seam: `--check` reported `validation: "not_checked"`, while
   the transaction reported `chains_green` over the identical tree. The check pass loses the
   validation measurement here too, because it is gated on having an authority
   (`kaola-workflow-claim.js:3566-3573`).

### Leg B — CONTROL, worktree folder seeded (`issue-902c`, `SEED_WORKTREE_FOLDER=1`)

Single axis flipped: the worktree also carries the project folder (the shape *every* existing test
builds). `--check` from the worktree → **exit 0**,
`{"ok":true,…,"workflow_state":"ok",…,"reasons":[]}`; the real finalize also succeeds. This isolates
the axis: **presence of `<worktree>/kaola-workflow/<project>/` is the only cause** of the
disagreement.

### Leg C — which probe is blind (`issue-902d`, `…/scratchpad/p902/fixture-asym.js`)

Same worktree topology, but the project exists only as a **closed archive in main** — no live folder
anywhere. `--check` from the worktree → **exit 0**:

```json
{"project":"issue-902d","ok":true,"checks":{"mirror":"skipped_post_archive","workflow_state":"ok","implementation_commit":"not_applicable","staging_guard":"ok","validation":"chains_unverified","changed_paths":["impl.txt"],"dirty_paths":[]},"reasons":[]}
```

A **main-resident archive** is found from the worktree; a **main-resident live folder** is not. The
archive probe is topology-aware; the live probe is not. That eliminates "the check path has no
main-root knowledge" as the explanation.

## The seam

Both paths enter through **one** `cmdFinalize` and share **one** `root`: `getRoot()`
(`kaola-workflow-claim.js:3579`) = `git rev-parse --show-toplevel`
(`kaola-workflow-active-folders.js:26-35`), i.e. the cwd's working tree. **Root resolution does not
diverge.** The divergence is ordering, plus one topology-blind probe.

**Execute path** — `kaola-workflow-claim.js:3610-3648`

```
3615  const mirror = mirrorFinalizationArtifacts(root, args.project);   // Step 8a — MUTATES
…
3645  const finalizeAuthority = resolveFinalizeAuthority(root, args.project);
```

`mirrorFinalizationArtifacts` (`:3099-3175`) ends at `:3169` with
`mergeCopyDir(srcDir, destDir, FINALIZE_MIRROR_DEST_OWNED)`, where `srcDir = <mainRoot>/kaola-workflow/<project>`
(`:3105`) and `destDir = <root>/kaola-workflow/<project>` (`:3106`). `mergeCopyDir` opens with
`fs.mkdirSync(dest, { recursive: true })` (`:3025`) and copies `workflow-state.md` (dest-owned per
`:3041`, but the skip is `keepExisting.has(name) && fs.existsSync(d)` at `:3030`, and the dest does
not exist). So Step 8a **creates `<worktree>/kaola-workflow/<project>/workflow-state.md`**, and the
authority resolved 30 lines later at `:3645` sees `livePresent: true`.

**Check path** — `kaola-workflow-claim.js:3586-3593` → `evaluateFinalizePreconditions` (`:3509-3576`)

```
3522  const mirror = probeFinalizeMirror(root, project);        // read-only classification, NO write
…
3538  const authority = resolveFinalizeAuthority(root, project);  // resolved over the PRE-mirror tree
3541    reasons.push(authority.innerReason);
```

`probeFinalizeMirror` (`:3316-3349`) is documented as mirroring `mirrorFinalizationArtifacts`' branch
order "minus every write" (`:3313-3314`) — and it does, faithfully. Nothing then feeds its verdict
into the authority resolution. `resolveFinalizeAuthority` (`:3353-3393`) is called with the same
arguments on both paths but over **different effective state**: pre-mirror for `--check`,
post-mirror for the transaction.

**The single blind probe** — `kaola-workflow-claim.js:3354-3364`

```js
const liveDir = projectDir(root, project);      // :3354  → path.join(root, 'kaola-workflow', project)  (:699-701)
…
const candidates = livePresent ? [liveDir] : findArchiveAuthorities(root, project);   // :3364
const authorityDir = candidates.length === 1 ? candidates[0] : null;                  // :3365
…
} else if (!authorityDir) { innerReason = 'archive_authority_missing'; }              // :3371-3372
```

`findArchiveAuthorities` (`:2986-2993`) explicitly widens to the main root:

```js
const candidateRoots = [root];
const main = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
if (!candidateRoots.some(c => path.resolve(c) === path.resolve(main))) candidateRoots.push(main);
```

The **live** probe at `:3354` never does. So `resolveFinalizeAuthority` searches archives in
`{root, mainRoot}` and live folders in `{root}` only — measured by Leg C. On the #902 topology both
candidate sets are empty from the worktree, `authorityDir` is `null`, and `:3372` fires.

**What `archive_authority_missing` precisely means, as emitted here:** "`<root>/kaola-workflow/<project>/`
does not exist (ENOENT) **and** no archive named `<project>` or `<project>.archived-*` exists in
either `<root>` or `<mainRoot>`" — i.e. *this checkout* can prove no authority. It does **not** mean
"no authority exists", and it does not mean "an operator must restore something".

### Emitted at a point where the answer is already available

`probeFinalizeMirror` returns `{state, mainRoot}` at `:3316`, and `checks.mirror` in the very same
envelope reads `"ready"` — a mirror that will run and, on this topology, will create the folder. The
check pass holds `mirror.mainRoot` at `:3529` and uses it only to predict *residue dirt*. It never
uses it to ask whether `<mainRoot>/kaola-workflow/<project>/` is the authority.

Worse for a consumer trying to work this out from the envelope: `'ready'` is returned from three
distinct situations in `probeFinalizeMirror` — dest record absent (`:3329`), compare safe (`:3335`),
and compare threw (`:3347`) — so `"ready"` alone cannot be read as "the mirror will *create* the
destination". `compareLedgers` fails open on a null dest (`kaola-workflow-ledger-compare.js:51-53`),
which is how the absent-destination case lands on `'ready'` rather than a distinguishable token.

## Does the output distinguish operator obligations from script-owned pending steps?

**The mechanism exists, and it is not applied to this rung.** The shape is flat:

```
output({ project: args.project, ok, checks: report.checks, reasons: report.reasons }, ok ? 0 : 1);
                                                                        // :3592
```

There is no `owner`, no `actionable`, no severity, and — unlike the ladder emit at `:3650-3657` — **no
`operator_hint`** anywhere in the `--check` envelope. `finalizeAuthorityHint` (`:3398-3409`) exists
and is reached only by the transaction's refusal, so a `--check` reader gets the bare token.

The *only* existing distinction is the binary **"state in `checks`, never a token in `reasons`"**, and
the code says so explicitly for the mirror rung (`:3336-3338`):

> "A pending worktree→main sync is machinery-repairable, so it is REPORTED as state, never as an
> operator-owed precondition"

…restated in the function contract at `:3502-3503`. So `sync_required` is deliberately kept out of
`reasons`; `archive_authority_missing` — which on this topology is equally machinery-repairable, by
the same Step-8a mirror — is pushed into `reasons` at `:3541` and drives `ok:false` + exit 1.

## Existing coverage

`archive_authority_missing` appears in **exactly one place per edition**: the emit itself
(`scripts/kaola-workflow-claim.js:3372`, plus the gitlab/gitea/plugin copies). **No test anywhere
asserts it** — the only other occurrence in the repo is a prose comment,
`scripts/test-claim-hardening.js:3937`, and that names `archive_authority_invalid_type` while
explaining a shape it does *not* cover.

The `--check` surface is covered, thoroughly, by the wrong topology:

| fixture | site | worktree project folder | consequence |
|---|---|---|---|
| `mk837` | `test-claim-hardening.js:3180-3261` | seeded at `:3204-3239` **and** main at `:3246-3248` | live probe always hits in `root` |
| `mk816` | `test-claim-hardening.js` (…`:1313`, main copy `:1322-1324`) | seeded | same |
| `mk941` | `test-claim-hardening.js:3955-3989` | seeded at `:3974-3985` | same |

Every one writes the state file into **both** roots, so `livePresent` is always `true` and
`resolveFinalizeAuthority` never reaches `:3371`. `#837` P1 (`:3289-3335`) proves `--check` is
read-only and P2 (`:3337-3406`) proves N reasons come back at once — both on the seeded shape. The
`#816` T2a/T2b arms (`:1414-1495`) are precisely about main↔worktree *staleness*, i.e. a destination
that **exists**; the absent-destination case is not among them.

Two further gaps that let this through:

1. **No test invokes finalize with `cwd` = main root on a worktree topology.** `runFinalize816` and
   `runFinalize837` both hard-code `cwd: fx.wtRoot` (`:1352`, `:3274`). The cwd axis — the axis that
   flips the answer live — is never varied, so no test could observe the two cwds disagreeing.
2. **No test compares `--check` against the execute path on the same fixture where they differ.**
   T2a/T2b do run `--check` then the real transaction, and assert they *agree* — which they do, on a
   seeded destination. The agreement was pinned only where it holds.

The authority rung's own coverage is elsewhere and in-place (not linked): the walkthrough's
`testManualArchiveBackstop` (`simulate-workflow-walkthrough.js:344-390`) drives
`finalize_gate_unverified` / `archive_state_not_closed` in a single-root fixture with no worktree at
all.

## What I could not establish

- **The reported run itself.** #902 cites `issue-330` / `workflow/issue-330`; that run is gone. I
  reproduced its *shape*, live and in fixture, not its bytes.
- **Whether the seam is reachable outside a linked worktree.** Both paths short-circuit to
  `not_needed` when `mainRoot === realpath(root)` (`:3103`, `:3320`), so I expect not, but I did not
  measure a non-worktree leg.
- **`archive_authority_ambiguous` (`:3369-3370`) under this topology.** It needs ≥2 archive matches
  and I did not build it, so I cannot say whether the mirror converges that reason too.
- **The gitlab / gitea / plugin editions.** I confirmed the identical construct is present
  (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js:3372`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:3181`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:3178`) but ran no measurement
  against them.
- **Blast radius beyond `--check`.** I did not audit which callers (routing surfaces, skills,
  templates) treat a nonzero `--check` exit as a stop; that changes how much the false obligation
  costs, and it is unmeasured.

## Fixture and log locations

- fixture builders: `…/scratchpad/p902/fixture.js`, `…/scratchpad/p902/fixture-asym.js`
- captured runs: `…/scratchpad/p902/check-main.json`, `check-wt.json`, `check-wt-kw.json`,
  `fixture-run-A.txt`, `fixture-run-B-control.txt`, `fixture-run-C-asym.txt`
- read-only proof: `…/scratchpad/p902/{pre,post}-main-status.txt`, `{pre,post}-tree.txt`
- (base = `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p902`)
