# Baseline record — issue #933 tests

> **A claim must not write run state into a directory that is not a project folder.**

**RED at baseline on all four cases.** No production file was changed to produce any run below.

## Setup

- Repo: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`, branch `main`, main root (no worktree)
- **Baseline commit: `406b5639c307953a8b476796c68486f0b42e096f`**
- Node `v24.18.0`; filesystem probed CASE-INSENSITIVE (APFS), so the aliasing arm has a subject
- Diff at the time of every run: `scripts/simulate-workflow-walkthrough.js` only.
  `git diff -- scripts/kaola-workflow-claim.js plugins/ package.json` was EMPTY.
- The suite supplies its own env: `runNode` scrubs every inherited `KAOLA_*` and sets
  `KAOLA_WORKFLOW_OFFLINE=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`. Offline means
  worktree provisioning is skipped, so `KAOLA_WORKTREE_NATIVE` is immaterial here (every envelope
  below carries `worktree_path: ""`).
- Every fixture is a throwaway one-commit git repo under `os.tmpdir()`. The real `kaola-workflow/`
  state directory was never claimed against.

## Where the test is

`scripts/simulate-workflow-walkthrough.js` — scenario `testClaimNeverAdoptsReservedDir933`,
inserted after the two #932 scenarios and registered in `buildRegistry()`.

Four cases, each a distinct door:

| case label | door | name supplied | how the name arrives |
|---|---|---|---|
| `operator flag / .roadmap` | `claim --project .roadmap --issue 9330` | `.roadmap` | operator flag (R1) |
| `roadmap data / .roadmap (no flag anywhere)` | `startup --runtime claude --target-issue 9331` | none typed | `workflow_project: .roadmap` in `kaola-workflow/.roadmap/issue-9331.md` (R2) |
| `operator flag / archive` | `claim --project archive --issue 9332` | `archive` | operator flag (R5) |
| `operator flag / Archive (aliases the archive band)` | `claim --project Archive --issue 9333` | `Archive` | operator flag; skipped on a case-SENSITIVE filesystem |

## The two envelope keys

`reserved_project` (discrete, the declined name VERBATIM as supplied) and `reserved_project_note`
(prose). Both pinned by name; both `undefined` at baseline in all four cases.

The pairing follows #403.8, which put `worktree_error_class` beside `worktree_error` so a caller
"has a machine-readable signal instead of having to parse a raw git error string". A substitution
reported only in prose would re-make the mistake that corrected. Verified before adopting: all four
cited `<thing>_note` precedents exist as described (`selection_record_note` :2032,
`bundle_size_note` :1819, `restore_note` :5245, `inPlaceNote` :1281), and `reserved_project`
collides with nothing tree-wide.

On the aliasing arm `reserved_project` must be `"Archive"`, not `"archive"`. Which directory it
collided with is what `project` and the filesystem assertions establish; what only the caller knows
is what the caller ASKED for.

## The shipped test, run at baseline

```
$ node scripts/simulate-workflow-walkthrough.js --only testClaimNeverAdoptsReservedDir933
exit 1
```

Exit code read directly from the process, not through a pipe. `1` is a real red — not `143`/`137`,
which would mean the run was killed and would be evidence of nothing.

First failing assertion (the suite's `assert` throws, so it stops here):

```
Error: #933 operator flag / .roadmap: the claim must resolve to kaola-workflow/issue-9330, not the
reserved name — got project=".roadmap"
command: kaola-workflow-claim.js claim --project .roadmap --issue 9330
exit: 0
stdout: {"status":"acquired","verdict":"green","claim":"acquired","issue":9330,"project":".roadmap",
"branch":"workflow/issue-9330","worktree_path":"","remote_claim":"skipped_offline"}
```

## Every failing assertion, per case

Measured by temporarily making the scenario's `assert` COLLECT instead of throw, so one run reports
all of them. That scaffolding was reverted from a byte-exact snapshot afterwards; the shipped file
contains no `KW933_*` env knob and no measurement branch (`grep -n "TEMP-933\|KW933_\|COLLECT\|FAILS"`
returns nothing).

**Re-measured after the `reserved_project` discrete field was added.** By then the implementer had
begun editing `scripts/kaola-workflow-claim.js` in the shared main root, so the main tree was no
longer a baseline. The re-measurement therefore ran in a THROWAWAY DETACHED WORKTREE at `406b5639`
(`git worktree add --detach`, removed afterwards) with the updated walkthrough copied in over
pristine production — my test against true baseline production, nothing of the implementer's
touched. Per-case totals moved 7/9/7/7 → **8/10/8/8**; the new assertion is red in all four:

```
[.roadmap  flag]   the envelope must carry `reserved_project`: ".roadmap" — ... Got undefined
[.roadmap  data]   the envelope must carry `reserved_project`: ".roadmap" — ... Got undefined
[archive   flag]   the envelope must carry `reserved_project`: "archive"  — ... Got undefined
[Archive   flag]   the envelope must carry `reserved_project`: "Archive"  — ... Got undefined
```

The lists below are the ORIGINAL run, before that field existed; each case now carries one more
failing assertion, in position [4] (or [5] for the startup door), exactly as quoted above.

### `operator flag / .roadmap` — 7 failing
```
[1] the claim must resolve to kaola-workflow/issue-9330, not the reserved name — got project=".roadmap"
[2] the run state must land in kaola-workflow/issue-9330/workflow-state.md
[3] workflow-state.md must record name: issue-9330 — got undefined
[4] the envelope must carry a non-empty `reserved_project_note` reporting that .roadmap was declined
    and issue-9330 used instead — got undefined
[5] `reserved_project_note` must name the declined directory .roadmap — got undefined
[6] the claim wrote run state to kaola-workflow/.roadmap/workflow-state.md — that directory is not a
    project folder
[7] the claim added entries inside kaola-workflow/.roadmap/: ["workflow-state.md"]
```

### `roadmap data / .roadmap (no flag anywhere)` — 9 failing
```
[1] the claim must resolve to kaola-workflow/issue-9331, not the reserved name — got project=".roadmap"
[2] selected_project must agree with project (issue-9331) — got ".roadmap"
[3] the run state must land in kaola-workflow/issue-9331/workflow-state.md
[4] workflow-state.md must record name: issue-9331 — got undefined
[5] the envelope must carry a non-empty `reserved_project_note` ... — got undefined
[6] `reserved_project_note` must name the declined directory .roadmap — got undefined
[7] the claim wrote run state to kaola-workflow/.roadmap/workflow-state.md
[8] the claim wrote kaola-workflow/.roadmap/.cache/ — that directory is not a project folder
[9] the claim added entries inside kaola-workflow/.roadmap/:
    [".cache/origin/selection-record.json","workflow-state.md"]
```

### `operator flag / archive` — 7 failing
```
[1] the claim must resolve to kaola-workflow/issue-9332, not the reserved name — got project="archive"
[2] the run state must land in kaola-workflow/issue-9332/workflow-state.md
[3] workflow-state.md must record name: issue-9332 — got undefined
[4] the envelope must carry a non-empty `reserved_project_note` ... — got undefined
[5] `reserved_project_note` must name the declined directory archive — got undefined
[6] the claim wrote run state to kaola-workflow/archive/workflow-state.md
[7] the claim added entries inside kaola-workflow/archive/: ["workflow-state.md"]
```

### `operator flag / Archive (aliases the archive band)` — 7 failing
```
[1] the claim must resolve to kaola-workflow/issue-9333, not the reserved name — got project="Archive"
[2] the run state must land in kaola-workflow/issue-9333/workflow-state.md
[3] workflow-state.md must record name: issue-9333 — got undefined
[4] the envelope must carry a non-empty `reserved_project_note` ... — got undefined
[5] `reserved_project_note` must name the declined directory Archive — got undefined
[6] the claim wrote run state to kaola-workflow/archive/workflow-state.md
[7] the claim added entries inside kaola-workflow/archive/: ["workflow-state.md"]
```

The `Archive` case is the aliasing proof: the caller says `Archive`, and the file lands at
`kaola-workflow/archive/workflow-state.md` — inside the real archive band.

## The failure is the defect, not the fixture

Each case's failure was ALSO measured with assertions (0)–(2) bypassed, so the filesystem
assertions ran rather than being merely unreached. All four still red, each naming the reserved
directory the state landed in. Independently, the same three legs were driven by hand against the
shipped CLI outside the suite before the test existed, and produced the same trees.

The `.cache/` assertion is a live falsifier on the `startup` door only: `cmdClaim` never sets
`selectionRecordBytes`, so `persistSelectionRecord` does not run on the `claim` door and no `.cache/`
is written there even at baseline. It is green-at-baseline on cases 1, 3 and 4 by construction, and
it is not carrying those cases — assertions [1]–[3] and [6]–[7] are.

## Liveness

Assertion (0) requires exit 0 with `status: acquired`, `verdict: green`, `claim: acquired`. That is
the owner's ruling (resolve and report, not refuse) and it doubles as the liveness witness: a
fixture that stopped reaching the claim, or a fix that answers #933 by refusing at the claim site,
reds there rather than passing vacuously through the survival assertions.

## Neighbours unaffected

```
$ node scripts/simulate-workflow-walkthrough.js --only testArchiveNeverRelocatesReservedDir930 \
    --only testClaimNeverDeletesWhatItDidNotCreate932 --only testClaimRollbackRemovesOnlyWhatItCreated932 \
    --only testClaimReclaimsStatelessOrphanDir --only testHarnessSelfCheck
exit 0   (930: 4/4 names x 2 lanes; both 932 scenarios PASSED)

$ node scripts/test-suite-registration.js
exit 0   (44 test-*.js files, 41 registered, 3 exempt)
```

## The forge sibling — `scripts/test-forge-claim-reserved-project.js`

Authored after the gap below was reported. **20 legs: 4 editions x 5 legs**, each driving that
edition's OWN claim CLI.

| leg | door | reserved dir | name supplied | issue |
|---|---|---|---|---|
| A | `claim --project .roadmap --issue N` | `.roadmap` | `.roadmap` | 9450 |
| B | `startup --target-issue N` | `.roadmap` | none typed — `workflow_project:` | 9451 |
| C | `claim --project archive --issue N` | `archive` | `archive` | 9452 |
| D | `startup --target-issue N` | `archive` | none typed — `workflow_project:` | 9453 |
| E | `claim --project Archive --issue N` | `archive` | `Archive` | 9454 |

Leg E is here rather than left to the walkthrough because the case fold is a per-edition line in a
hand-port: a gitlab copy that dropped the `toLowerCase` would put run state inside the archive band
while canonical stayed green. It skips with a printed reason on a case-sensitive filesystem.

### Baseline

Measured in a **throwaway detached worktree at `406b5639`** (`git worktree add --detach`, removed
afterwards) with the new suite copied in over pristine production, because the implementer was by
then editing all four claim ports in the shared main root. `git status --porcelain -- scripts/kaola-workflow-claim.js plugins/`
was EMPTY in that worktree, so every port under test was the baseline copy.

```
baseline: 406b5639c307953a8b476796c68486f0b42e096f
$ node scripts/test-forge-claim-reserved-project.js
exit 1
20/20 legs ran (4 editions x 5 legs)
188 passed, 176 failed
```

Failures are perfectly symmetric — **44 per edition**, identical across claude/canonical, codex,
gitlab and gitea; 8 per flag leg, 10 per roadmap-data leg (the startup door adds `selected_project`
and `.cache/origin/selection-record.json`). The ten distinct reasons on a roadmap-data leg:

```
the claim must resolve to kaola-workflow/issue-9451, not the reserved name
selected_project must agree with project (issue-9451)
the run state must land in kaola-workflow/issue-9451/workflow-state.md
workflow-state.md must record name: issue-9451
the envelope must carry `reserved_project`: ".roadmap" — the declined directory, verbatim as supplied
the envelope must carry a non-empty `reserved_project_note` reporting that .roadmap was declined
`reserved_project_note` must name the declined directory .roadmap
the claim wrote run state to kaola-workflow/.roadmap/workflow-state.md
the claim wrote kaola-workflow/.roadmap/.cache/
the claim added entries inside kaola-workflow/.roadmap/:
  [".cache/origin/selection-record.json","workflow-state.md"]
```

The 188 passing at baseline are the assertions already true before any fix — exit 0, the acquiring
envelope, the reserved directory existing, its foreign files intact. The exit-0-and-acquiring pair
is deliberate: it is the owner's ruling AND every leg's liveness witness.

### No no-issue-number leg — the arm it would have pinned is unreachable

Direct-call legs F/G were written, run, and REMOVED, because writing them is what measured the arm
dead. Recorded here so the absence reads as a finding rather than an oversight.

The `project-<name>` arm of `unreservedProjectName` fires when a reserved name arrives with no
usable issue number. `claimProject` is exported and has direct callers that pass no issue field
(`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` and its gitlab twin call
`claimProject(root, { project: 'issue-888' })`), so the shape looks reachable. It is not:

| direct call, no issue field | outcome |
|---|---|
| `claimProject(root, {project:'issue-888'})` | `{"status":"acquired","project":"issue-888"}`, folder created |
| `claimProject(root, {project:'.roadmap'})` | **THREW** `claim_issue_numbers_invalid`, no folder |
| `claimProject(root, {project:'archive'})` | **THREW** `claim_issue_numbers_invalid`, no folder |

`writeState` infers a missing issue number ONLY from a project name matching
`/^issue-([1-9][0-9]*)$/` (`kaola-workflow-claim.js:817-820`). `issue-888` matches; `project-roadmap`
and `project-archive` cannot. So the substitute reaches `buildClaimAnchors` -> `buildClaimIdentity`
-> `normalizeIssueNumbers` (`kaola-workflow-adaptive-schema.js:141`, byte-identical across the four
editions) with nothing usable and throws inside the transaction. The throw is the same one the CLI
surfaces: `claim --project .roadmap` with no `--issue` exits 1 with that token because this line
throws, not because of any separate check in `cmdClaim`.

**A/B over a seeded `.roadmap`, same fixture, same call** — with the substitution in place and with
it removed:

```
WITHOUT the arm (406b5639):  THREW: claim_issue_numbers_invalid
  files: .roadmap/_rules.md .roadmap/issue-9459.md    dirs: kaola-workflow .roadmap
WITH the arm (current):      THREW: claim_issue_numbers_invalid
  files: .roadmap/_rules.md .roadmap/issue-9459.md    dirs: kaola-workflow .roadmap
```

Identical throw, identical token, identical file set, identical directory set. There is no input on
which that path completes, so there is no result to pin. The arm was removed rather than pinned —
a test outlives its mechanism only as a trap.

### Chain wiring

Registered in all five chains, immediately after `node scripts/test-forge-claim-rollback-scoping.js`:
`test:kaola-workflow:claude` (idx 39), `:codex` (7), `:gitlab` (9), `:gitea` (9), `:claude:full` (42).
`node scripts/test-suite-registration.js` exits 0 with it (45 files, 42 registered, 3 exempt).

## Edition coverage — the GAP this sibling closes

The walkthrough drives `scripts/kaola-workflow-claim.js`. That covers claude and codex, which
`validate-script-sync.js` holds byte-identical. The gitlab and gitea copies are divergent
hand-ports compared to nothing by that validator, and **all four editions reproduce #933**, driven
directly at `406b5639` with the R2 fixture:

| edition | script | envelope `project` | `.roadmap/workflow-state.md` | `.roadmap/.cache/` |
|---|---|---|---|---|
| claude | `scripts/kaola-workflow-claim.js` | `.roadmap` | created | created |
| codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `.roadmap` | created | created |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `.roadmap` | created | created |
| gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `.roadmap` | created | created |

**The resolution site is ONE SHAPE in all four**, not four different edits. Measured at `406b5639`
by normalising the single differing identifier (`issueIid` -> `issueNumber`) and hashing:

| edition | `projectNameForIssue` | `claimProject` resolution | identifier |
|---|---|---|---|
| claude | `:293-300` | `:1113-1116` | `issueNumber` |
| codex | `:293-300` | `:1113-1116` | `issueNumber` |
| gitlab | `:187-194` | `:890-893` | `issueIid` |
| gitea | `:187-194` | `:894-897` | `issueIid` |

Normalised sha256 of the `projectNameForIssue` body: `9a0161f1...` — **identical in all four**.
Normalised sha256 of the two resolution lines (`const project = args.project || projectNameForIssue(...)`
plus the `isSafeName` assert): `0fee1f6b...` — **identical in all four**. `isReservedWorkflowDirName`
is defined once per edition (claude/codex `:2536`, gitlab `:2272`, gitea `:2271`) with exactly two
references each — one definition, one call — i.e. no claim-path caller anywhere.

Closed by `scripts/test-forge-claim-reserved-project.js` above.

## Not pinned, and why

- **A reserved claim with no `--issue`.** Already refused upstream: `claim --project .roadmap` with
  no issue exits 1 with `claim_issue_numbers_invalid`, so there is no door to pin.
- **The run's own roadmap source, byte-for-byte.** It lives inside `.roadmap`, and a fix that
  records the resolved project name back into it is legitimate. Pinned as still-PRESENT only.
  Foreign content (`_rules.md`, `.gitkeep`, unrelated `issue-*.md`, the archive band) IS pinned
  byte-for-byte.
- **The wording of `reserved_project_note`.** Only that it exists, is a non-empty string, and names
  the declined directory case-insensitively. Whether it also names the substitute is the
  implementer's call — the substitute is already pinned on `project` and in `workflow-state.md`.
  `reserved_project` is pinned harder, by exact equality, because it is the field a consumer keys on.
- **Any casing rule.** The `Archive` arm runs only where the filesystem actually aliases the two
  names, probed rather than assumed, and pins the RESULT there.
