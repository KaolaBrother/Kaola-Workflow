# impl-parity — closure-audit edition parity (change 1) + project-name validation (change 2)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
Branch: `workflow/bundle-900-901-902-903` · base commit `9b68b096` · **nothing committed**
Scratch: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/implparity/`

**Verification tier: `regression-green`** — both changes are covered by the eight existing suites,
all eight green before and after, and each change additionally has its own before/after CLI
measurement on a purpose-built fixture (below). No new test was authored (custody).

---

## Files changed (4)

| file | lines now | change 1 | change 2 |
|---|---|---|---|
| `scripts/kaola-workflow-closure-audit.js` | 730 | — (already canonical) | `:36`, `:95-99` |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | 730 | — | `:36`, `:95-99` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | 729 | `:266-281` (was `:266-297`) | `:37`, `:86-90` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | 729 | `:265-280` (was `:265-296`) | `:37`, `:86-90` |

Canonical ↔ codex confirmed **byte-identical** (`cmp` clean, and `validate-script-sync.js` green).

### Functions changed

- **`archiveRequiredContent(dir)`** — gitlab `:282`, gitea `:281`. Both ports converged onto the
  canonical's shape by extracting the canonical's `// (g) #832` comment block plus function body and
  diffing region-for-region; the two ports' regions are now **byte-identical to canonical's**
  (verified by `diff`, "IDENTICAL" both). −16 net lines each. Removed: the `namesPlan` scan over
  `plan_hash` / `active_plan_hash`, the `workflow-plan.md` demand, and the `planPresent` arm with its
  lazy `require` of `listRecordedNodeEvidence`. `field` is still imported and used (6 call sites per
  file: `archiveClosedIssues`, `stateIssueNumbers`).
  Residual `plan_hash` / `workflow-plan.md` / `listRecordedNodeEvidence` references in all four
  closure-audit files: **0**. Forge-specific surroundings preserved untouched (gitlab keeps
  `unarchived_mr_folders` / `mr_url` / `mr_state`, both keep their forge modules).
- **`parseArgs(argv)`** — canonical/codex `:86`, ports `:77`. One added assert in the `--project` arm,
  after the existing missing-value assert (whose message is unchanged, so the existing
  `/--project requires a project name/` pins still hold):
  `assert(isSafeName(v), '--project must be a safe folder name, got: ' + v);`

### `isSafeName` export — no export was needed

`isSafeName` was **already exported** from all four `*-active-folders.js` modules before I started
(canonical `:292`, codex `:292`, gitlab `:267`, gitea `:265`), and the four implementations are
character-identical. I only added it to the existing destructuring `require` in each closure-audit.
So the `validate-script-sync.js` `FORGE_EXPORT_SUPERSET_FAMILY` / `canonicalOnly` concern **never
arose** — no `*-active-folders.js` was touched, no new export key exists, and `validate-script-sync.js`
is green. Nothing needed to be escalated on this point.

Placement rationale: the repo's own convention for this rule is an entry-point assert —
`kaola-workflow-sink-pr.js:148` and `kaola-workflow-sink-merge.js:2698` both use
`assert(args.project && isSafeName(args.project), '--project must be a safe folder name')`, and
`claim.js` asserts it in each subcommand handler. Putting it in `parseArgs` also puts it beside the
existing `--issue` validation, throws before `getRoot()` and before anything writes to stdout, and is
reachable from the already-exported `parseArgs` for in-process coverage.

---

## Change 1 proof — the F1 divergence, before and after

Fixture (`scratchpad/implparity/f1-fixture.sh`, rebuilt fresh for every measurement): a git repo whose
`kaola-workflow/archive/issue-777/workflow-state.md` carries
`plan_hash: aaaa…(64 hex)` and which contains **no** `workflow-plan.md`.
All runs `KAOLA_WORKFLOW_OFFLINE=1`, cwd = fixture.

### Unscoped `drift.archive_content_incomplete`

| edition | BEFORE | AFTER |
|---|---|---|
| canonical | `[]` | `[]` |
| codex | `[]` | `[]` |
| **gitlab** | `[{"project":"issue-777","missing":["workflow-plan.md"]}]` | **`[]`** |
| **gitea** | `[{"project":"issue-777","missing":["workflow-plan.md"]}]` | **`[]`** |

Exit 0 in every cell. The reported asymmetry reproduced exactly before the fix, on the real files.
**All four editions now agree on the fixture.**

### Scoped `--project issue-777` — the verdict term that was flipping

| edition | BEFORE `current_project_drift.archive_content_incomplete` | AFTER |
|---|---|---|
| canonical | `[]` | `[]` |
| codex | `[]` | `[]` |
| gitlab | `[{"project":"issue-777","missing":["workflow-plan.md"],"attribution":"name_match"}]` | `[]` |
| gitea | `[{"project":"issue-777","missing":["workflow-plan.md"],"attribution":"name_match"}]` | `[]` |

Honest qualifier: `current_project_clean` reads `false` in **both** states on all four editions,
because offline `stale_in_progress_labels` and `unarchived_{pr,mr}_folders` return `"skipped_offline"`
and the fail-closed rule forbids clean. So what I measured flipping is the **class term** that feeds
the verdict, not the boolean; the boolean would flip only on an online run where those two classes
evaluate. I did not build an online forge mock for the three editions, so **the boolean flip itself is
not measured here** — only the term it is computed from.

### The "before" is a measurement, not a memory

For the scoped table above (taken after I had already edited) I used a **scratch mirror** at
`scratchpad/implparity/mirror/{canonical,codex,gitlab,gitea}/` — a full copy of each edition's
`scripts/*.js`, with my two edits mechanically reverse-applied by `scratchpad/implparity/revert.js`,
which asserts each reverse replacement matches **exactly once** or throws. I then verified the
mirrors' restored `archiveRequiredContent` region is byte-identical to `git show HEAD:<port path>` —
confirming the plan demand I removed was untouched by the other agent's uncommitted #903 work, and
that the mirror is a faithful pre-change state. No `git checkout --` was used; nothing in the
worktree was reverted.

---

## Change 2 proof — both ways, with a positive control

Fixture (`scratchpad/implparity/fix-c2/`): `outside/workflow-state.md` (issue 4242) sitting **beside**
the repo, plus `repo/kaola-workflow/issue-555/workflow-state.md` (`issue_numbers: 555,556`) inside it.
`../../outside` from `<root>/kaola-workflow/<project>` lands on that outside file — the exact
`state_file: "../outside/workflow-state.md"` emission the finding reported.

### (1) `--project ../../outside` — must be exit 1 with empty stdout

| edition | BEFORE | AFTER |
|---|---|---|
| canonical | exit **0**, 1294 stdout bytes, `scope.state_file = "../outside/workflow-state.md"`, `issue_numbers [4242]` | exit **1**, **0 stdout bytes**, stderr `--project must be a safe folder name, got: ../../outside` |
| codex | exit **0**, same traversal scope | exit **1**, 0 stdout bytes, same stderr |
| gitlab | exit **0**, same traversal scope | exit **1**, 0 stdout bytes, same stderr |
| gitea | exit **0**, same traversal scope | exit **1**, 0 stdout bytes, same stderr |

The defect was **shared across all four**, as reported — not a port defect.

### (2) POSITIVE CONTROL `--project issue-555` — must still resolve at exit 0

| edition | BEFORE | AFTER |
|---|---|---|
| canonical | exit 0, 1314 bytes, `{"project":"issue-555","issue_numbers":[555,556],"state_file":"kaola-workflow/issue-555/workflow-state.md"}` | **identical** |
| codex | exit 0, 1314 bytes, identical scope | **identical** |
| gitlab | exit 0, 1314 bytes, identical scope | **identical** |
| gitea | exit 0, 1314 bytes, identical scope | **identical** |

### (3) CONTROL — unscoped repository-wide run

exit 0, 539 stdout bytes, before and after, canonical/gitlab/gitea. Unchanged.

So the validation rejects the unsafe name and accepts the legitimate one; it is not a
reject-everything guard. Arming and coverage were established separately: the mirror (assert absent)
exits 0 on the traversal, the shipped file exits 1, and the legitimate name is unaffected in both.

### Contract conformance, not a new gate

`docs/api.md:960` already publishes: exit `1` is "operator-input error only: unknown flag, **a missing
or malformed flag value**, or a `--project` resolving to no `workflow-state.md` anywhere with no
`--issue` given. stdout is empty." A `--project` value that is a path rather than a folder name is a
malformed flag value, so this behaviour was **already the published contract** and the four scripts
simply did not implement it. Nothing new was added to the contract.

---

## Existing tests that pinned the removed mechanism

**None to report — nothing was left pinning it, and I touched no test file.** Audited:

- `scripts/simulate-workflow-walkthrough.js:7647` `testClosureAuditArchiveContentDrift832` — a
  `tdd-guide` had **already** deleted the two plan/ledger assertions (see its in-place
  `// DELETED:` note at `:7708-7713`) and deliberately kept fixture (ii) `issue-8325` standing as an
  over-report control. Fixture (ii) has a `workflow-plan.md`, so it produced no finding under the
  canonical either way. Also the only `listRecordedNodeEvidence` mention left in the repo outside the
  two ports is a **comment** at `:7644` in that same block — prose, not an assertion. Flagging it in
  case a prose-sweep agent wants it, but it asserts nothing and I left it alone.
- `plugins/kaola-workflow-git{lab,ea}/scripts/test-git{lab,ea}-workflow-scripts.js` — **no fixture
  anywhere writes `plan_hash`** (grep: 0 hits in both suites and both forge walkthroughs). Their
  `plantArchive903` helper writes only the fields each caller passes. So no port assertion could
  observe the demand.
- `test-git{lab,ea}-sinks.js` reference `workflow-plan.md` only as one entry in a sink untracked-file
  list; neither suite exercises closure-audit at all (0 refs).
- Both codex forge walkthroughs: 0 closure-audit references.

**Coverage note for you to route (not mine to write):** the ports' new agreement with canonical on a
`plan_hash`-bearing, plan-less archive is now **unpinned in every edition** — the F1 fixture is
exactly the case no suite builds. A `tdd-guide` pin asserting `archive_content_incomplete === []` for
that archive would have caught this divergence and would catch its re-introduction. Same for change 2:
`parseArgs` is exported and the throw-list at `simulate-workflow-walkthrough.js:8825` (and the port
equivalents at `test-gitlab-workflow-scripts.js:3354`) is the natural home for `['--project',
'../../outside']`, plus a CLI-level exit-1/empty-stdout case in the `:8370` loop.

---

## docs/api.md impact for you to route (I edited no docs)

1. **`:971`** — `| archive_content_incomplete | An archived run whose folder is missing a required
   artifact. …|`. Not falsified (still true), but now vague to the point of being unhelpful: the
   required set is exactly one file. Suggested sharpening: "missing its `workflow-state.md` identity
   anchor — the only unconditionally required artifact." Low priority, purely a clarity gain.
2. **`:990`** — "**GitLab** ships `kaola-gitlab-workflow-closure-audit.js` with the same contract and
   JSON shape". This sentence was **false before this change** and is true now. No edit needed; noting
   it because it is the sentence change 1 restores, and the plan demand was indeed **not** among the
   deliberate divergences that paragraph enumerates (MR vocabulary substitutions, lowercase state).
3. **`:960`** — the exit-1 row already covers change 2 as "a malformed flag value" (see above). An
   optional sharpening would name the rule: "a `--project` that is not a single safe folder name".
   I deliberately did **not** touch the in-script `USAGE` text either — its `--project <name>` line
   needs no change and the rejection message is self-explanatory.

---

## Suites — real exit codes, all serial, `bash -c` with a bare `$?` read (no pipes)

Driver: `scratchpad/implparity/suites.sh`. Logs: `baseline.log` (before), `after.log` (after).

| suite | BEFORE | AFTER |
|---|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**) | **0** — 197/197 scenarios, 2052 spawns | **0** — 197/197 scenarios, 2052 spawns |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | **0** — 547 spawns | **0** — 547 spawns |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | **0** — 548 spawns | **0** — 548 spawns |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | **0** — 112 spawns | **0** — 112 spawns |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | **0** — 127 spawns | **0** — 127 spawns |
| `node scripts/validate-script-sync.js` | **0** | **0** — 15 common scripts, 27 byte-identical groups, 6 forge export-superset families in sync; 4 Oracle Kernel copies identical at HEAD |
| `node scripts/test-spawn-classification.js` | **0** | **0** — 10 mutation assertions, 601 spawn sites, 133 slots slack |
| `node scripts/validate-workflow-contracts.js` | **0** | **0** |

The walkthrough ran the **full 197 scenarios** (`##KW-SHARD … "total":1,"ran":197`), not a sampled
shard. Scenario and spawn counts are identical before and after, so nothing was skipped or added.

---

## Not verified / out of scope

- **The scoped `current_project_clean` boolean flipping** — only the class term it is derived from is
  measured (see the qualifier above). No online forge mock was built for the three editions.
- **No commit was made**, as instructed. All four files are left dirty in the worktree.
- I did not run `npm test` / the four chains, `test:kaola-workflow:claude:full`, or the opencode/kimi
  edition suites — outside the assigned verification list. An edition-touching diff normally owes a
  four-chain receipt at finalize; that is yours to schedule.
- I edited no test file, no `docs/api.md`, no `README.md`, no `CHANGELOG.md`, no
  `templates/routing/` file, and no `*-active-folders.js`.
