# impl-948 — A30 gains the `{WRITE + SOURCE_EDIT}` mixture

**Baseline commit: `a339e5dfb816428f3c62e477ee1a8dcba53c409b`** (branch `workflow/bundle-945-946-947-948`,
worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-945-946-947-948`).

Write set honoured: `scripts/test-opencode-edition.js` only. `scripts/sync-opencode-edition.js` in the
worktree is **untouched** (`git diff --stat` on it is empty); no production code was written.

## The diff

One scenario added to `A30.SCENARIOS` (`scripts/test-opencode-edition.js:2708`), plus the comment that
says why this mixture and why the three-way is absent.

```diff
+    // One scenario per BRANCH PROFILE of the closing advice, not per subset of the classes. The
+    // producer decides two things and nothing else: which flag it names (--write-config wins over
+    // --write, and neither is named when no flag clears anything), and whether a source-edit line
+    // is printed. The last entry is the only mixture where a flag is advised while part of the set
+    // is flag-irreducible AND the config file is not involved — the profile that tempts a producer
+    // into naming the stronger flag "so at least the rest gets fixed", which would overwrite the
+    // user's model pins to repair a stale agent. The all-three set is deliberately absent: its
+    // profile is identical to the entry above it, so it would re-run this loop for a branch
+    // already measured.
     const SCENARIOS = [
       ['stale generated agent'],
       ['stale user-owned opencode.json'],
       ['unregistered canonical plugin'],
       ['stale user-owned opencode.json', 'stale generated agent'],
       ['stale user-owned opencode.json', 'unregistered canonical plugin'],
+      ['stale generated agent', 'unregistered canonical plugin'],
     ];
```

No assertion was added, edited or deleted. The existing per-scenario machinery already generalises over
`SCENARIOS`, so the new entry is driven entirely by the band's existing outcome-shaped property: drive
the advised command, then assert the surviving mismatches equal the measured flag-irreducible remainder.
**No footer prose or sentence is pinned**, per the band's own design.

## Counts and real exit codes

Exit codes captured with `echo "EXIT=$?"` on the node process directly — never through a pipe.

| run | assertions | exit |
|---|---|---|
| baseline (worktree, pre-change) | 555 passed | **0** |
| after (worktree, post-change) | 563 passed | **0** |
| final re-run (worktree, after other agents' edits landed) | 563 passed | **0** |
| control (unmutated scratch mirror) | 563 passed | **0** |

Delta is **+8**, which is exactly the new scenario's assertion count: 4 fixed (plant reds, reported set
equals planted set, irreducible remainder, surviving equals irreducible) + 1 no-op check per advised
command (1 command) + 1 `someFlagHelps` + 1 never-blanket-`--write-config` per advised command (1) +
1 `PLUGIN_SCRIPTS` reason check. Nothing else in the suite moved.

### Correction to the brief's stated premise

The brief said `.opencode` is absent in the worktree so the D0 drift-check SKIPS. It does **not** — all
three generated trees are present in the worktree and D0 ran for real in every run above:
`[drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]`. This makes the runs
stronger, not weaker, and the 555 baseline count the brief quoted still matched exactly.

## Environment hygiene (the known fixture trap)

`env | grep -iE 'KAOLA|OPENCODE'` returned only `PWD`/`OLDPWD` (matched on the repo path). Neither
`KAOLA_WORKFLOW_OFFLINE` nor `KAOLA_OPENCODE_STANDARD_MODEL`/`KAOLA_OPENCODE_REASONING_MODEL` is set, so
no model pin or offline flag was inherited into the fixture. The band scrubs the two model pins from the
child env anyway; the A30 green-baseline control (`the scratch repo is GREEN before anything is planted`)
passed in every run, which is the positive control that the fixture's subject was the fixture.

## Mutation proof

Scratch mirror at `…/scratchpad/impl948/` — an `rsync -a --exclude=.git` copy of the whole worktree, so
the mirror's `test-opencode-edition.js` resolves `REPO` to the mirror. **No tracked file was edited in
place and `git checkout --` was never used.** Mutations applied by `…/scratchpad/mutate.js`, which
refuses on a missing or non-unique anchor; pristine copy kept at `…/scratchpad/sync-pristine.js` and
restored between runs. Mirror was restored to pristine at the end.

### Mutation A2 — the branch-exclusive one — CAUGHT, and caught only here

`scripts/sync-opencode-edition.js:812`, i.e. "when a write-clearable and a flag-irreducible mismatch
coexist, name the stronger flag so at least the rest gets fixed":

```diff
-    : remedies.has(REMEDY.WRITE) ? '--write' : '';
+    : remedies.has(REMEDY.WRITE) ? (remedies.has(REMEDY.SOURCE_EDIT) ? '--write-config' : '--write') : '';
```

Result: **exit 1, 1 failure, 562 passed.** The single failure is the new scenario; all five pre-existing
scenarios stayed green.

```
FAIL: A30[stale generated agent + unregistered canonical plugin]: --write-config is NOT advised here — nothing in this set needs it, and it rewrites the user-owned opencode.json, destroying the model pins that file invites the user to hand-edit. It clears 13 of the 14 classes, which is exactly what makes it tempting as a blanket answer. Advised: ["--forge=github","--write-config"]

opencode-edition test FAILED: 1 failure(s), 562 passed. [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]
```

**RED: A30[stale generated agent + unregistered canonical plugin] — `--write-config is NOT advised here`; baseline a339e5df.**

This is the whole claim: a real regression in this branch profile is invisible to the suite as it stood,
and visible the moment this one line is added.

### Mutation A1 — the brief's literal example — CAUGHT, but NOT exclusive

The brief proposed "prefer `--write-config` whenever any source-edit is present" as a mutation only this
mixture would catch. Measured, that is **not** exclusive:

```diff
-  const flag = remedies.has(REMEDY.WRITE_CONFIG) ? '--write-config'
+  const flag = remedies.has(REMEDY.WRITE_CONFIG) || remedies.has(REMEDY.SOURCE_EDIT) ? '--write-config'
```

Result: **exit 1, 4 failures, 561 passed** — three of them on the *pre-existing*
`A30[unregistered canonical plugin]` scenario (it also fires when SOURCE_EDIT is the only remedy), one on
the new scenario. So A1 would have been caught without this change and does not isolate the gap. A2 is
the proof that does; A1 is recorded here only because the brief named it.

### Mutation B — dropping the source-edit line — NOT CAUGHT (a deliberate blind spot, not a defect)

```diff
-  const sourceEdits = mismatches.filter(m => m.remedy === REMEDY.SOURCE_EDIT).map(m => m.rel);
+  const sourceEdits = flag ? [] : mismatches.filter(m => m.remedy === REMEDY.SOURCE_EDIT).map(m => m.rel);
```

Result: **exit 0, 563 passed** — the full suite stays green.

I did not "fix" the test to catch this, and I judge that correct on three grounds:

1. **The band states its property as an outcome, never a wording.** The source-edit footer line names no
   runnable command, so it has no outcome to drive. Catching B requires pinning footer prose, which the
   band's own header rules out and my brief explicitly forbade.
2. **B is information-preserving.** The per-mismatch reason line still names the file and still names
   `PLUGIN_SCRIPTS` — which A30 *does* assert. What B deletes is the footer's restatement of information
   the reader already has, so it is not obviously a defect at all.
3. Adding a wording pin would be a mechanism derived for a failure class never observed.

If the orchestrator wants the footer's source-edit line pinned, that is a **value call about the report's
contract**, not a coverage gap I should settle unilaterally — it would need a differently-shaped
assertion (a wording pin) and an explicit decision to accept one in this band.

## What I could not prove

- **Mutation B is uncaught** (above) — stated as a measured limit of the band, not repaired.
- The `{WRITE + WRITE_CONFIG + SOURCE_EDIT}` three-way remains uncovered **by choice**. I verified its
  branch profile is identical to the covered `{WRITE_CONFIG + SOURCE_EDIT}` (flag `--write-config`,
  source-edit line yes), so adding it would buy no branch coverage. Not added, per the repo's additive rule.
- **Concurrency caveat:** other agents were editing `install.sh`, `scripts/test-generate-routing-surfaces.js`
  and `scripts/test-route-reachability.js` in this worktree throughout. My final worktree run (exit 0, 563)
  was taken *after* those edits were present on disk, so it reflects the current tree. I hit **no
  unexpected failures at any point**, so no serial re-run was needed. `templates/routing/next.skeleton.md`
  was unmodified at the time of my final run — if it changes and rendered surfaces are not regenerated,
  D0 in this suite reads the generated trees and could red for a reason unrelated to this change.

## Files

- Changed: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-945-946-947-948/scripts/test-opencode-edition.js`
- Run logs: `…/scratchpad/948-baseline.txt`, `948-after.txt`, `948-final.txt`, `948-mirror-control.txt`,
  `948-mut-A2.txt`, `948-mut-A1.txt`, `948-mut-B.txt`
- Mutation harness: `…/scratchpad/mutate.js` (scratchpad root
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad`)
