# Implementation — issue #971 (the run folder is resolved against the tree it lives in)

**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972`
**Baseline:** `7e962bdc` · **Verification tier: `tests-green`**

Both behaviours landed. Every success criterion is green **on #971's changes**; two of them are red
in the live worktree for reasons that are provably not mine, isolated below.

---

## Files changed (11 production files; no test file touched)

| file | change |
|---|---|
| `scripts/kaola-workflow-gap-sweep.js` | canonical — the resolution rule |
| `plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js` | codex byte-twin (md5 `e523c7ec…`, equal to canonical) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js` | generated port |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js` | generated port |
| `templates/routing/finalize.skeleton.md` | Step 9 — the authoring surface |
| `commands/kaola-workflow-finalize.md` | rendered |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | rendered |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | rendered |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | rendered |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | rendered |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | rendered |

The three non-canonical script copies and the six rendered surfaces were **generated**, never
hand-edited: `node scripts/edition-sync.js --write` and `node scripts/generate-routing-surfaces.js
--write`.

**One file I changed that was not in my write set** — see "Collateral" at the end:
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.

---

## (1) gap-sweep — the resolution rule

**The rule: the root is the tree that HAS `kaola-workflow/<project>/` — this one when it does, the
main checkout otherwise, and cwd when neither does.** `KAOLA_GAP_ROOT` overrides the whole search.

Why this shape rather than "always main": the folder is main-resident at Step 7 and worktree-resident
after the finalize mirror, so *always main* is wrong in the second topology (T25e pins it) and
*always cwd* is wrong in the first (T25b/T25c pin it). "The tree it lives in" is the only rule that
is right in both, and it is the same rule `run-chains` states for itself — the record follows the run
folder.

Implemented as `resolveRunRoot(project)` in `scripts/kaola-workflow-gap-sweep.js`, reusing
`resolveMainRoot` from `kaola-workflow-adaptive-schema` — already required by this file, so zero new
dependency, and verified exported in all four edition kernels (`typeof === 'function'` in each).
`resolveMainRoot` is fail-open by contract, which is what carries T25f (no repository to ask).

**Both modes move together.** The old `root` was computed *before* argument parsing, so it could not
depend on `--project`. It now resolves once **after** the project is known and **before** the
`checkMode` branch, and `outputPath`/`summaryPath` derive from it there. `--output`/`--summary` are
therefore captured raw during parsing and resolved against the new root afterwards; no production
caller passes either, and the only callers that pass relative values are existing tests that also set
`KAOLA_GAP_ROOT`, which short-circuits the search. Scanner and gate now cannot disagree about the
folder, which was the mechanism of the false green.

The header comment's stale line (`KAOLA_GAP_ROOT … instead of process.cwd()`) was updated. It states
the result, not the route.

### Beyond the fixtures — the three generated copies, run from a real linked worktree

Canonical tests cover canonical only, and #868 is the recorded case of a *generated* port being
broken where canonical tests never look. So each generated copy was run end-to-end against a real
`git worktree add` fixture with a gap seeded in main, **both commands issued from the worktree**:

```
gitlab port : {"result":"swept",...,"sweptClasses":[{"reasonClass":"manual:flaky-suite",...}],
               "artifact":".../fx/main/kaola-workflow/proj-smoke/.cache/run-gaps.json"}  exit=0
              {"result":"refuse","reason":"gaps_unswept","unmapped":[{"reasonClass":"manual:flaky-suite",...}]}  exit=1
gitea port  : identical
codex twin  : identical
stray folder in the worktree: none
```

The kernel require renders base-named in both forge ports (`require('./kaola-workflow-adaptive-schema')`
at the new site as well as the pre-existing one) — the #868 trap is not re-armed.

### Against this repository, at the exact scenario #971 was filed from (read-only `--check`)

```
from the WORKTREE: gap-sweep: artifact not found at
  /Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-969-970-971-972/.cache/run-gaps.json  exit=1
from MAIN:         (byte-identical line)                                                                exit=1
```

Both trees now name main's path. Before the fix the worktree run named
`.kw/worktrees/bundle-969-970-971-972/kaola-workflow/…`.

---

## (2) Step 9 — the sink metadata capture

Authored in `templates/routing/finalize.skeleton.md` and regenerated; no rendered surface was edited.

```bash
SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"
if [ ! -f "$SINK_STATE_FILE" ]; then   # the record stays where the claim wrote it; you may not be there
  _SINK_COORD="$(git rev-parse --git-common-dir 2>/dev/null || echo ".git")"
  if [[ "$_SINK_COORD" != /* ]]; then _SINK_COORD="$(pwd)/$_SINK_COORD"; fi
  SINK_STATE_FILE="$(dirname "$_SINK_COORD")/$SINK_STATE_FILE"
fi
```

Same rule as the code half, and deliberately the **same three-line resolver idiom already in Step 11
of this file** (`_COORD_ROOT_RAW_SINK`) rather than a second spelling of it. It does not `cd` — Test F
pins that `ACTIVE_WORKTREE_PATH` must not be dragged to main with it.

**One line beyond the brief, in the same block.** Line 298's `_WT_PRE` probe read
`'kaola-workflow/{project}/workflow-state.md'` as a second, independent, cwd-relative literal for the
*same file*. It now reads `"$SINK_STATE_FILE"` (passed as `process.argv[1]`, verified). Leaving it
would have left the block resolving one file two different ways — the next editor fixes one and not
the other. No new mechanism; it uses the variable that now exists. It changes no assertion outcome:
`ACTIVE_WORKTREE_PATH` came out right from both cwds before and after, but it is now derived from the
record rather than accidentally from `pwd`.

### The shipped block, executed against this repository from both trees

```
=== from THE WORKTREE (the #971 scenario) ===
SINK_STATE_FILE=/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-969-970-971-972/workflow-state.md
SINK_BRANCH=workflow/bundle-969-970-971-972
SINK_ISSUE=969
SINK_ISSUE_NUMBERS=969,970,971,972
ACTIVE_WORKTREE_PATH=/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972
exit=0
=== from MAIN (control) ===
SINK_STATE_FILE=kaola-workflow/bundle-969-970-971-972/workflow-state.md
SINK_BRANCH=workflow/bundle-969-970-971-972   SINK_ISSUE=969   SINK_ISSUE_NUMBERS=969,970,971,972
ACTIVE_WORKTREE_PATH=/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-969-970-971-972
exit=0
```

`SINK_BRANCH` and `SINK_ISSUE_NUMBERS` were **empty** from the worktree before the fix.

---

## Verification

### Before (baseline `7e962bdc`, live worktree)

```
node scripts/test-gap-sweep.js               exit=1   gap-sweep tests FAILED (8 failures, 142 passed)
node scripts/test-bash-block-guards.js       exit=1   test-bash-block-guards: 18 failed, 31 passed
node scripts/generate-routing-surfaces.js --check  exit=0   all 18 surfaces byte-match the skeleton
node scripts/validate-script-sync.js         exit=0   OK: 15 common scripts, 27 byte-identical groups, …
node scripts/test-spawn-classification.js    exit=0   651 spawn sites … 219 classified
```

### After (live worktree)

```
### node scripts/test-gap-sweep.js  -> exit=0
gap-sweep tests passed (151 assertions)

### node scripts/test-bash-block-guards.js  -> exit=0
test-bash-block-guards: all 49 assertions passed (#361 bash-block execution)

### node scripts/generate-routing-surfaces.js --check  -> exit=0
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
                                        ^^ surface count = 18 (6 of them finalize)

### node scripts/test-spawn-classification.js  -> exit=0
spawn-classification passed (10 mutation assertions; 657 spawn sites across 65 files,
225 classified, 432 grandfathered; 126 slot(s) of slack)

### node scripts/validate-workflow-contracts.js  -> exit=0
Workflow contract validation passed

### node scripts/validate-script-sync.js  -> exit=1   *** NOT MINE — see below ***
Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):
  - kaola-workflow-claim.js
```

151 assertions is exactly the count the test author proved satisfiable.

### The two live-tree reds, isolated

Both are another agent's in-flight work landing in this shared worktree while I ran. Isolation
method: `git archive HEAD | tar -x` into a scratch mirror, then copy **only my 11 production files**
over it, `git init` + commit, and run there.

**`validate-script-sync.js` exit=1** — `scripts/kaola-workflow-claim.js` (86 insertions / 12
deletions, not a file I touched) was modified without its codex twin being synced. In the
HEAD+#971-only mirror:

```
### validate-script-sync in the HEAD+#971-only mirror -> exit=0
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json
families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
```

It also passed twice in the live tree earlier in this session, before `claim.js` was touched. Not
repaired: syncing another agent's half-finished edit is theirs to do.

**`simulate-workflow-walkthrough.js` exit=1** — fails at
`testFinalizeReportsMissionListOutcomeWithoutDone`, a test that **does not exist at HEAD** (`git show
HEAD:… | grep -c` → `0`) and whose message names its own issue:

```
Error: #970 [issue-9700]: nothing on the finalize envelope reports that this run record
contradicts itself. 2 of its 6 items carry an outcome while their status is not `done` …
```

That is #970's pin against #970's unlanded implementation. In the HEAD+#971-only mirror, at full
scope:

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,
            "scenarios":209,"ran":209,"passed":209,"failed":0}
Workflow walkthrough simulation passed
REAL_EXIT=0
```

(First mirror attempt reported a false green through a subshell `pipestatus`, and then a false red
from `testContractValidatorMissingTag` because an extracted archive has no `.git`. A pristine-HEAD
control mirror reproduced that failure identically, confirming it as an environment artifact; `git
init` in the mirror removed it. The 209/209 above is the corrected run.)

### Suites beyond the assigned criteria

Every other suite that reads a surface I changed (found by
`git grep -ln "kaola-workflow-finalize\.md\|finalize\.skeleton\.md\|finalize/SKILL" -- scripts/`):

```
test-generate-routing-surfaces      exit=0  all 434 assertions passed
test-route-reachability             exit=0  Route-reachability test passed (331 assertions)
test-claim-hardening                exit=0  claim-hardening tests passed (766 assertions)
test-install-adaptive-config        exit=0  Install adaptive-config tests passed
test-install-model-rendering        exit=0  Install model rendering tests passed
validate-kaola-workflow-contracts   exit=0  Kaola-Workflow Codex contract validation passed
kaola-workflow-prose-census --check exit=0
```

---

## The flagged expected-red did not materialize — twice over

The brief said `scripts/validate-workflow-contracts.js:521` would be red and to leave it alone. It is
**green**, and I did not touch it. Two independent reasons, both worth recording:

1. The test author landed the conversion in parallel while I worked — line 521's `assertIncludes` is
   now a comment explaining why nothing static replaces it.
2. **My fix shape would not have reddened it anyway.** It keeps
   `SINK_STATE_FILE="kaola-workflow/{project}/workflow-state.md"` as the initial assignment and
   re-roots it conditionally, so that exact substring still ships. The pin was dropped on the
   *reasoning* that a substring check inspects the route rather than the result — which stands
   independently of my shape, and the execution-based Test F is strictly stronger. Recorded, not
   re-litigated.

---

## Collateral, corners cut, and what I did not do

**One file changed outside my write set.** `node scripts/edition-sync.js --write` also performed
`codex-sync plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — propagating the *test
author's* canonical edit to its codex twin, because that file is a `COMMON_SCRIPTS` member and the
twin had gone stale between my baseline and my run. It is a copy in the sanctioned direction (nothing
of theirs was overwritten) and it is regenerable by anyone, but it is their edit in a file I did not
mean to touch, and without it `validate-script-sync` would have been red for a second unrelated
reason. Flagging rather than reverting; the two copies are byte-identical (`diff` → no output).

**Deliberate corner: the archived-project case is unchanged.** If `kaola-workflow/<project>/` is
absent from both trees but `kaola-workflow/archive/<project>/` exists in main, `resolveRunRoot`
returns cwd, so a scan from the worktree still misses the `project_archived` refusal that a scan from
main would hit. This is byte-for-byte the pre-fix behaviour in both trees — no regression — and the
test author explicitly declined to pin it. Extending the search to the archive band would make that
refusal reachable from any tree; what would force it is an observed run that hit it.

**Not done, and not mine to decide:** no `CHANGELOG.md` `[Unreleased]` entry. The section exists and
already carries the bundle's #968 entry, so it is being maintained live by someone else; writing the
same section concurrently is how two agents collide. **This is an outstanding obligation for #971 —
please assign it.** `docs/api.md` and `docs/conventions.md` were checked and need no edit: neither
makes any claim about which tree the sweep resolves against, so nothing there went stale.

**The two untracked edition surfaces** (`.opencode/command/kaola-workflow-finalize.md`,
`.kimi/skills/kaola-workflow-finalize/SKILL.md`) were not touched and could not be — they do not
exist in a linked worktree. They render from `commands/kaola-workflow-finalize.md` via
`install-opencode.sh` / `install-kimi.sh`, which I regenerated, so they inherit the fix at the next
install. Propagation is 6 tracked + 2 edition = 8, as measured in the premise. The opencode/kimi
editions carry no gap-sweep script and call `$KAOLA_SCRIPTS/…`, so they inherit the code half too; no
edition copy was created.
