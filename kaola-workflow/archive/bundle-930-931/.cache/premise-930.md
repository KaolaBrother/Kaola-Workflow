# Investigation: premise check of issue #930 — reserved directory name as project

## Setup

- Commit / environment: `68cb48f4a71c1d125d403ed7e251d47d7077b730` (main, clean apart from the
  untracked `kaola-workflow/bundle-930-931/`), macOS Darwin 25.6.0, node from `process.execPath`.
- All driving happened in a throwaway APFS clone-on-write copy of the repo
  (`.../scratchpad/repo930`) with `.git/worktrees` removed and `origin` repointed at a local bare
  repo, so nothing could reach GitHub or the real tree. `gh` was replaced with a mock via
  `KAOLA_GH_MOCK_SCRIPT` while `KAOLA_WORKFLOW_OFFLINE=0` (offline mode was deliberately NOT used —
  it disables worktree provisioning and would have hidden the worst leg).
- The scratch repo and its bare remote were deleted at the end. The real repo was re-verified after:
  HEAD unchanged, `kaola-workflow/.roadmap/` and `.origin/` intact, archive still 379 entries, no
  `archive/.roadmap` or `archive/.origin`.

## Verdict summary

| # | Claim in #930 | Result |
|---|---|---|
| 1 | `workflow_project: .roadmap` adopted verbatim by the claim | **CONFIRMED** (driven) |
| 2 | Finalize relocates the directory into the archive | **CONFIRMED** (driven, 3 legs + `.origin`) |
| 3 | Exit 0 | **CONFIRMED** (driven, all legs) |
| 3b | "nothing reported" | **PARTLY REFUTED** — true in 2 of 3 legs, false in one |
| 3c | "`ROADMAP.md` regenerating to *No active work*" | **REFUTED in the main lane**; true in the worktree lane |
| 4 | `archive` control dead-ends EINVAL exit 1; worktree refuses `archive_incomplete` | **CONFIRMED** (both driven) |
| 5 | The `:240` skip precedes `isSafeName`; the state-file check does not save it | **CONFIRMED** (read + positive control) |
| 6 | "an expression already written at five sites" | **TRUE ONLY OF THE ROOT EDITION**, and only for one of two wordings |
| 7 | Cross-edition divergence | **REAL** — 4 hand-maintained copies; only the root↔github pair is machine-enforced |

The load-bearing claim — **the destruction** — is confirmed and is worse than filed in one lane.
The two things that are wrong in the issue are both about *what is said about it afterwards*.

---

## Observations

| Measurement | Command (in the scratch copy) | Result | Exit |
|---|---|---|---|
| Claim adopts `.roadmap` | `node scripts/kaola-workflow-claim.js startup --runtime claude --target-issue 99930` | `"project":".roadmap"`, `"claim":"acquired"` | 0 |
| Folder invisible to enumeration | `readActiveFolders(cwd,{excludeClosedIssues:false})` after the claim | `[]` | 0 |
| Same, via CLI | `node scripts/kaola-workflow-claim.js status` | `{"active":[],"drift":[],"count":0}` | 0 |
| Pre-flight raises nothing | `finalize --project .roadmap --check` | `"ok": true, "reasons": []` | 0 |
| Finalize, main lane, empty backlog | `finalize --project .roadmap` | `archived:true`, `dest: …/archive/.roadmap`, `closure_invariants:{ok:true,violations:[]}` | **0** |
| Finalize, main lane, 4-issue backlog | `finalize --project .roadmap` | `archived:true`, `roadmap_regenerated:"failed"`, `closure_invariants.ok:false`, `findings:["main_roadmap_mirror_not_regenerated"]` | **0** |
| Finalize, worktree lane, 2-issue backlog | `finalize --project .roadmap --keep-worktree` (cwd = `.kw/worktrees/.roadmap`) | `archived:true`, `closure_invariants:{ok:true,violations:[]}`, **no findings**, and a git commit `chore: archive .roadmap` deleting the tracked files | **0** |
| `.origin` variant, main lane | `finalize --project .origin` | `archived:true`, `closure_invariants:{ok:true,violations:[]}`, no findings; 6 tracked files relocated | **0** |
| Control `archive`, main lane | `finalize --project archive` | `reason:"archive_exception"`, `EINVAL … rename …/archive -> …/archive/archive` | **1** |
| Control `archive`, worktree lane | `finalize --project archive --keep-worktree` | `reason:"archive_incomplete"`, **8384** missing entries named | **1** |
| Positive control for root cause (a) | delete ONLY `active-folders.js:240`, re-enumerate | `[".roadmap"]` (was `[]`) | 0 |
| Divergence probe | `node scripts/kaola-workflow-compact-context.js` with `.roadmap` claimed | `- Project: .roadmap` | 0 |

Exit codes were read from `$?` immediately after an unpiped invocation, never through a pipe.

---

## 1. Is `workflow_project: .roadmap` adopted verbatim? — YES

Fixture: `kaola-workflow/.roadmap/issue-99930.md` containing `workflow_project: .roadmap`.

```
$ node scripts/kaola-workflow-claim.js startup --runtime claude --target-issue 99930
{"verdict":"green","claim":"acquired","selected_project":".roadmap","selected_issue":99930,
 "target_source":"user_directed",
 "worktree_path":".../repo930/.kw/worktrees/.roadmap",
 "status":"acquired","issue":99930,"project":".roadmap","branch":"workflow/issue-99930",
 "remote_claim":"posted","selection_record_digest":"ebc2272949bc…"}
EXIT=0
```

After the claim, `kaola-workflow/.roadmap/` holds `workflow-state.md` (`name: .roadmap`,
`status: active`, `next_command: /workflow-next .roadmap`) and `.cache/origin/selection-record.json`
**beside** the tracked `_rules.md`, `.gitkeep` and every `issue-*.md`. A hidden worktree was
provisioned at `.kw/worktrees/.roadmap`.

This matches the documented contract exactly. `docs/workflow-state-contract.md:127-140` already says
the value is adopted verbatim, already says the only filter is `isSafeName`, and already names this
very hazard — *"Two cases are worse than misleading — `archive`, and any name beginning with `.`, are
skipped by `readActiveFolders` before path safety is even consulted, so such a run is claimed but
invisible to status and to the active-folder sweep."* The issue's appeal to #929 is accurate. What
that paragraph does **not** say is that finalize then moves the directory.

## 2. Does finalization relocate the directory? — YES, in every lane driven

### 2a. Main lane, empty backlog (the repo's state at HEAD)

Before: `.roadmap/` = `_rules.md`, `.gitkeep`, `issue-99930.md`, `workflow-state.md`, `.cache/`.
After `finalize --project .roadmap`:

```
$ ls -a kaola-workflow/
.  ..  .origin  archive  ROADMAP.md          <- .roadmap is GONE
$ ls kaola-workflow/.roadmap
ls: …/kaola-workflow/.roadmap: No such file or directory
$ find kaola-workflow/archive/.roadmap -type f
  archive/.roadmap/_rules.md
  archive/.roadmap/.cache/origin/selection-record.json
  archive/.roadmap/.gitkeep
  archive/.roadmap/finalization-summary.md
  archive/.roadmap/issue-99930.md
  archive/.roadmap/workflow-state.md
$ git status --porcelain
 D kaola-workflow/.roadmap/.gitkeep
 D kaola-workflow/.roadmap/_rules.md
 M kaola-workflow/ROADMAP.md
?? kaola-workflow/archive/.roadmap/
```

Both relocated files are **tracked**.

### 2b. Main lane, populated backlog — the "entire backlog" case

Fixture: `.roadmap/` additionally holding `issue-930.md`, `issue-931.md`, `issue-932.md` (three
unrelated backlog items) with the mirror regenerated to list all four rows. After finalize, all four
`issue-*.md` plus `_rules.md` and `.gitkeep` are under `archive/.roadmap/`, and `kaola-workflow/.roadmap/`
does not exist. Exit 0, `archived: true`.

### 2c. Worktree lane (the lane a real run uses) — worst leg

`finalize --project .roadmap --keep-worktree` run with cwd = `.kw/worktrees/.roadmap`:

- **both** roots lose `kaola-workflow/.roadmap/` (main's and the worktree's);
- `archive/.roadmap/` receives `issue-930.md` (an unrelated backlog item), `issue-99930.md`,
  `_rules.md`, `.gitkeep`, `workflow-state.md`, `.cache/`, `finalization-summary.md`;
- finalize **authored a commit** on the feature branch:

```
5c6239c9 chore: archive .roadmap
 kaola-workflow/.roadmap/.gitkeep  |  0
 kaola-workflow/.roadmap/_rules.md | 76 --------------------------------------
 kaola-workflow/ROADMAP.md         | 78 ---------------------------------------
 3 files changed, 154 deletions(-)
```

The 78 deleted lines of `ROADMAP.md` are the `### Project rules` block, which is appended from
`_rules.md`; with `_rules.md` moved away, the regenerate dropped it. The deletion is therefore
**committed to git and would reach main through the sink**, not merely a working-tree move.

- `closure_invariants: {ok: true, violations: []}` — nothing reported. Exit 0.

### 2d. `.origin` — same class, cleanest instance

`workflow_project: .origin`, `finalize --project .origin`, exit 0:

```
 D kaola-workflow/.origin/877/changelog-draft.md
 D kaola-workflow/.origin/877/loadbearing.md
 D kaola-workflow/.origin/877/mixed-tests-triage.md
 D kaola-workflow/.origin/877/surfaces.md
 D kaola-workflow/.origin/877/walkthrough-triage.md
 D kaola-workflow/.origin/dead-exports-audit.md
?? kaola-workflow/archive/.origin/
```

`closure_invariants: {ok: true, violations: []}`, `finalize_transaction.findings` absent. Six tracked
files relocated with **zero** signal of any kind. The class is not specific to `.roadmap`.

### The code that does it (READ, not driven)

`archiveProjectDir` (`scripts/kaola-workflow-claim.js:2432`) opens with
`assert(isSafeName(project), 'unsafe project name')` — and `isSafeName`
(`scripts/kaola-workflow-active-folders.js:14-18`) rejects only empty, `.`, `..`, `/`, `\` and NUL,
so `.roadmap` passes. Destination and move:

- in-place lane, `scripts/kaola-workflow-claim.js:2612-2616` —
  `dest = path.join(archiveBase, project + (suffix || ''))` then `fs.renameSync(src, dest)`;
- linked lane, `:2517-2520` `copyDir(src, dest)` then `:2605-2606`
  `fs.rmSync(src, …)` / `fs.rmSync(mainLive, …)`.

Both derive `dest` from the project name alone. The issue's root cause (b) — *"archiving does not ask
what it is moving"* — is accurate.

## 3. Exit code and reporting

Exit code **0** on every `.roadmap` and `.origin` leg. "Nothing reported" is where the issue is
**partly wrong**, and the direction of the error matters:

| Lane | `closure_invariants` | `finalize_transaction.findings` | `ROADMAP.md` after |
|---|---|---|---|
| main, empty backlog | `ok: true` | absent | regenerated (no-op; was already empty) |
| main, populated backlog | **`ok: false`**, violation `roadmap-mirror-clean` | **`["main_roadmap_mirror_not_regenerated"]`** | **STALE** — still lists all 4 issues whose sources are gone |
| worktree, populated backlog | `ok: true` | absent | regenerated to *No active work*, and **committed** |
| `.origin`, main lane | `ok: true` | absent | untouched |

The populated main-lane leg also wrote a durable `## Finalize Findings` section into the archived
`finalization-summary.md`. So a report does exist — in exactly one of four legs.

**Why the mirror does not go empty in the main lane:** `regenerateRoadmap`
(`scripts/kaola-workflow-roadmap.js:218-239`) carries a narrow guard at `:225-234` — if `.roadmap/` is
**missing** and the generated mirror parses to more than zero rows, it **throws** rather than
replacing a non-empty mirror with "No active work". That guard fires here, which is why
`roadmap_regenerated: "failed"`. The issue's stated consequence — *"the mirror regenerating to 'No
active work'"* — is therefore **false whenever the backlog is non-empty in the main lane**, i.e.
precisely the scenario the issue is worried about. It is **true in the worktree lane**, because the
worktree's own `ROADMAP.md` came from the base commit with zero rows, so the guard did not fire, the
mirror was rewritten, and the rewrite was committed.

Note also that the finding text itself is wrong for this scenario: it says *"The linked worktree's own
mirror rebuilt fine"* while the envelope reports `roadmap_regenerated_by_root: {worktree:"failed",
main:"failed"}` on a run that was not linked at all. That is a #916 wording defect, not #930's.

## 4. The `archive` control — CONFIRMED, both halves

Main lane:

```
$ node scripts/kaola-workflow-claim.js finalize --project archive
{"result":"refuse","reason":"archive_exception","project":"archive",
 "detail":"EINVAL: invalid argument, rename '…/kaola-workflow/archive' -> '…/kaola-workflow/archive/archive'",
 "reasoning":"archival did not return an explicit success result; no roadmap, issue, label, worktree, or branch cleanup was performed."}
EXIT=1
```

Worktree lane (`--keep-worktree`, cwd = `.kw/worktrees/archive`):

```
{"result":"refuse","reason":"archive_incomplete","project":"archive",
 "missing":[ …8384 entries, every prior run's evidence… ],
 "mismatched":[], "dest":"…/kaola-workflow/archive/archive"}
EXIT=1
```

Nothing was lost in either. Two side effects the issue does not mention, both harmless but worth
knowing: the claim writes `workflow-state.md` and `.cache/` **directly into the archive root**, and
the refused worktree leg leaves a partial `archive/archive/` behind. Residue after the two controls:
`kaola-workflow/archive/{.cache,finalization-summary.md,workflow-state.md,archive/}`.

## 5. Root cause (a), as to what the code does today — ACCURATE

`scripts/kaola-workflow-active-folders.js:238-243`:

```js
  for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name.startsWith('.')) continue;   // 240
    if (!isSafeName(entry.name)) continue;                                  // 241
    const projectDir = path.join(workflowDir, entry.name);
    const stateFile = path.join(projectDir, 'workflow-state.md');
    if (!fs.existsSync(stateFile)) continue;                                // 243
```

The skip at `:240` does precede `isSafeName` at `:241`. **The state-file check at `:243` does not
save it** — I proved this rather than reasoning about it. With `.roadmap` claimed (so its
`workflow-state.md` exists), removing *only* line 240 and nothing else:

```
baseline (unmodified module):        []
skip line removed:                   [".roadmap"]
```

So the reserved-name skip is precisely and solely what hides a claimed reserved directory; the
`workflow-state.md` existence check excludes an *unclaimed* reserved directory but not a claimed one.

The cited EEXIST fallthrough is at `scripts/kaola-workflow-claim.js:1184-1189` (the issue says 1189,
which is the closing `} else { throw e; }`); the block returns `target_occupied` when a state file is
already present and otherwise falls through to reclaim. It never runs for a first claim of `.roadmap`,
because `.roadmap` already exists as a directory — so `fs.mkdirSync(dir)` throws `EEXIST`, no state
file is present, and the claim reclaims the reserved directory as if it were a crashed run's leftover.
That is exactly the confusion the issue names.

## 6. The "five sites" — true only of the root edition, and only for one wording

There are **two different wordings** of "which names under `kaola-workflow/` are not project folders",
and the issue's count sees only the first.

### Group A — the `archive`-or-dot-prefixed form (what "five sites" counts)

Root edition, production files, exactly five:

| # | Site | Expression |
|---|---|---|
| 1 | `scripts/kaola-workflow-active-folders.js:240` | `entry.name === 'archive' \|\| entry.name.startsWith('.')` |
| 2 | `scripts/kaola-workflow-claim.js:5523` | `!entry.isDirectory() \|\| entry.name === 'archive' \|\| entry.name.startsWith('.') \|\| !isSafeName(entry.name)` |
| 3 | `scripts/kaola-workflow-claim.js:5540` | identical to #2 |
| 4 | `scripts/kaola-workflow-adaptive-schema.js:424-425` | `if (seg.startsWith('.')) return false;` / `if (seg === 'archive') return false;` |
| 5 | `scripts/kaola-workflow-adaptive-schema.js:840-844` | `if (rest[0] === 'archive') rest = rest.slice(1);` … `if (rest[0].startsWith('.')) return null;` … `if (NON_PROJECT_FOLDERS.includes(rest[0])) return null;` |

Plus one test site, `scripts/simulate-workflow-walkthrough.js:12337`.

**Five is a root-edition-only fact.** Per-edition Group A counts:

| Edition | Group A sites | The extra ones |
|---|---|---|
| root (`scripts/`) | **5** | — |
| github (`plugins/kaola-workflow/scripts/`) | **6** | `kaola-workflow-codex-compact-resume.js:56` |
| gitlab (`plugins/kaola-workflow-gitlab/scripts/`) | **7** | `kaola-gitlab-workflow-active-folders.js` has **two** (`:209` prefetch pre-scan and `:219` main loop), plus `kaola-gitlab-workflow-codex-compact-resume.js:56` |
| gitea (`plugins/kaola-workflow-gitea/scripts/`) | **7** | same shape: `kaola-gitea-workflow-active-folders.js:208` and `:218`, plus `kaola-gitea-workflow-codex-compact-resume.js:56` |

### Group B — the same concept in different words, and it DISAGREES

| Site (root) | Expression | Disagrees how |
|---|---|---|
| `scripts/kaola-workflow-claim.js:3500` | `seg[1] === '.roadmap' \|\| seg[1] === 'ROADMAP.md' \|\| seg.length < 3` | names `.roadmap`/`ROADMAP.md` **literally**, not by dot-prefix — a `.origin` project is not excluded here |
| `scripts/kaola-workflow-claim.js:4816` | `seg[1] === '.roadmap' \|\| seg[1] === 'ROADMAP.md'` | same |
| `scripts/kaola-workflow-compact-context.js:51` | `.filter(entry => entry.name !== 'archive')` | excludes **only** `archive`; dot-directories are **not** excluded |

Group B is present in all four editions (github/gitlab/gitea additionally carry
`*-codex-compact-resume.js:56`, which uses a third wording:
`e.name !== 'archive' && !e.name.startsWith('.')`).

And a fourth vocabulary exists: `NON_PROJECT_FOLDERS = Object.freeze(['archive', 'exports'])`
(`scripts/kaola-workflow-adaptive-schema.js:827`, byte-identical in all four editions). `exports` is a
reserved name **no other site knows about**.

### The disagreement is observable, not theoretical

Three surfaces, driven against the *same* claimed `.roadmap` folder:

```
$ node scripts/kaola-workflow-compact-context.js        # the real CLI, not a re-implementation
Kaola-Workflow compact resume:
- Read kaola-workflow/.roadmap/workflow-state.md first, then mission-list.md beside it.
- Project: .roadmap                                       <-- SEES IT

$ readActiveFolders(cwd, {excludeClosedIssues:false})
[]                                                        <-- DOES NOT SEE IT

$ projectRelativeArtifactPath('…/kaola-workflow/.roadmap/workflow-state.md')
null                                                      <-- NOT A PROJECT ARTIFACT
   (control: '…/kaola-workflow/proj-1/workflow-state.md' -> "workflow-state.md")
```

So "the reserved directory names" is **not** a single closed predicate in the tree today: it is at
least four expressions across at least eight production sites per edition, and they give different
answers about the same directory.

## 7. Cross-edition divergence — real, and only half machine-enforced

Hashes (`shasum -a 256`), measured not assumed:

```
0ac70c1d…d241  scripts/kaola-workflow-adaptive-schema.js
0ac70c1d…d241  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
0ac70c1d…d241  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
0ac70c1d…d241  plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js

a4d238d6…ce43  scripts/kaola-workflow-active-folders.js
a4d238d6…ce43  plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js

d650eb29…e9f9  scripts/kaola-workflow-claim.js
d650eb29…e9f9  plugins/kaola-workflow/scripts/kaola-workflow-claim.js
```

`adaptive-schema.js` is byte-identical across all four, as documented. Root and the github plugin are
byte-identical copies of `claim.js` and `active-folders.js`. gitlab and gitea are **independent ports**
(`kaola-gitlab-workflow-claim.js` 6103 lines, `kaola-gitea-workflow-claim.js` 6095, root 6426) that
nonetheless carry the same `archiveProjectDir` opening verbatim:

```js
function archiveProjectDir(root, project, statusValue, suffix, opts) {
  assert(isSafeName(project), 'unsafe project name');
  const src = projectDir(root, project);
  if (!fs.existsSync(src)) return { skipped: 'source-missing' };
```

(READ, not driven — driving those two would need a GitLab/Gitea forge.)

### Which guards would catch an incomplete fix — mutation-proven, four legs

Clean baseline first: `validate-script-sync.js` exit 0 ("15 common scripts, 27 byte-identical groups…"),
`edition-sync.js --check` exit 0.

| Leg | Mutation | `validate-script-sync.js` | `edition-sync.js --check` |
|---|---|---|---|
| A | root `active-folders.js` only | **exit 1**, names `kaola-workflow-active-folders.js` | exit 0 |
| B | root **+ github plugin** `active-folders.js` | **exit 0** | exit 0 |
| C | root `claim.js` only | **exit 1**, names `kaola-workflow-claim.js` | exit 0 |
| D | gitlab `claim.js` only | **exit 0** | exit 0 |

Read off legs B and D: **once the root and github copies agree, no guard in the tree requires the
gitlab or gitea copies to carry the same change, and a gitlab-only change is invisible to both
guards.** A fix therefore has to be hand-landed in four places, and only the root↔github pair is
machine-enforced. (`edition-sync --check` reports "8 forge aggregator ports in parity" and "committed
kernel parity verified at HEAD" — it covers the kernel and the aggregators, not these files.)

---

## Inferences

Labelled as mine, separate from the measurements above.

- **The issue's headline is right and its supporting sentence is wrong.** The relocation is real,
  reproducible in three lanes and on two different reserved directories, at exit 0. But the specific
  consequence it cites — *mirror goes to "No active work", nothing reported* — describes the
  **empty-backlog** case, which is exactly the case where "relocates the entire backlog" is vacuous.
  Where there IS a backlog and the run is in-place, `regenerateRoadmap`'s `:225` guard fires and
  finalize does report. Confidence: high — driven four times. Refuted by: a main-lane run with a
  non-empty backlog that regenerates the mirror to empty.
- **The worst lane is the one a real run actually uses, and the issue understates it.** The worktree
  `--keep-worktree` leg destroys both roots' copies, reports `closure_invariants: {ok:true}` with no
  findings, AND commits the deletion of tracked files to the feature branch, from where the sink
  merges it. The issue describes only a working-tree move. Confidence: high — driven; the commit and
  its stat are quoted above. Refuted by: showing the sink drops or reverts `chore: archive <project>`.
- **"A closed predicate already written at five sites" is not a usable premise for whoever
  implements.** Five is the root-edition count for one of at least four wordings; the true production
  surface is 5/6/7/7 sites per edition for that wording plus 3-4 more per edition for the others, and
  the wordings measurably disagree (`compact-context` sees a `.roadmap` project that `readActiveFolders`
  does not). Anyone reusing "the existing expression" needs to pick which one. Confidence: high —
  the census is a full grep of all four tracked script trees, and the disagreement was driven, not
  inferred. Refuted by: a site I missed that already unifies them.
- **`isSafeName` is not where a fix belongs.** It is the shared path-safety predicate reached by
  `claimProject:1116`, `archiveProjectDir:2433`, both sinks, and `closure-audit`; widening it to
  reject dot-names or `archive` would change the meaning of "safe" for every one of those callers, and
  `archiveProjectDir`'s assert would then throw rather than report. Confidence: medium-high — from
  reading its ten call sites; not driven. Refuted by: showing every caller wants the same widened
  predicate.
- **The claim side and the archive side are separately reachable.** `.origin` shows the archive can
  destroy a reserved directory with literally zero reporting, and the positive control shows the
  claim-side blindness has a single cause at `:240`. The issue is right to ask only for the
  archive-side result; they are independent. Confidence: high — both driven.

## Open / not measured

- The gitlab and gitea editions were **read, not driven** — reproducing there needs a GitLab or Gitea
  forge. Their `archiveProjectDir` opens byte-identically to root's, so I expect the same behaviour,
  but I did not observe it.
- I did not check whether any existing test pins the current behaviour (i.e. whether a fix would turn
  a suite red). `scripts/test-forge-archive-scoping.js` and `scripts/test-claim-hardening.js` both
  construct `.roadmap` fixtures, but as the roadmap source directory, not as a project name.
- I did not measure what the sink does with the `chore: archive .roadmap` commit — only that finalize
  authors it and defers (`archive_commit: "deferred_to_sink"`).
- The `exports` reserved name (`NON_PROJECT_FOLDERS`) was not driven as a project name; no
  `kaola-workflow/exports` or `kaola-workflow/archive/exports` exists in the tree at HEAD.

## Raw evidence

Envelopes and logs from every leg are in
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/b816f7ad-2ce3-40e4-b822-dbb4f0063263/scratchpad/`
(`startup-out.json`, `finalize-out.json`, `run2-finalize.json`, `wt-finalize.json`,
`ctrl-finalize.json`, `wtctrl-finalize.json`, `origin-finalize.json`, `A-…`/`B-…`/`C-…`/`D-…` guard
legs). The scratch repo copy itself has been deleted.
