# Adversarial review — EDITION PARITY lens (`rev-editions`)

Candidate: branch `workflow/bundle-904-905-906-907-908-909-910`, uncommitted working tree in
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-904-905-906-907-908-909-910`.
Read-only on the branch throughout; every mutation was applied to a scratch mirror under the
scratchpad. Nothing was edited, staged or committed.

**Verdict: FAIL — 1 blocking (R1), 3 notes.** R1 is live and re-confirmed at `07:32:13`, tree pin
`795dfa0d8a81a2c21c2abcb1909e4ca2`, i.e. **after** the repair round landed. It is caught only by the
GitLab and Gitea chains, never by the canonical one.

> **R2 was reclassified after the orchestrator confirmed it is a deliberate deferral** awaiting a
> single end-of-run `sync:editions` it will run itself. Recorded as a note, not a defect, and not
> attributed to any fix.
>
> **The one thing that must not be lost in that deferral:** "the forge contract validators are red"
> is right now a **two-cause** state, and `sync:editions` clears only one of them. Mutation-proven
> below — materialising the validation-runner mirrors while leaving the shipping comment in place
> still gives `gitlab-contracts EXIT=1`. If the red is read as "the known validation-runner
> deferral", **R1 rides out underneath it** and the four-chain receipt reds on a cause nobody is
> expecting.

---

## READ THIS FIRST — the candidate moved under the review

A repair round landed in the worktree **while this review was running**. Between `07:05` and `07:32`
`sink-merge.js` (×4), `run-chains.js` (×4), `validation-runner.js` (canonical) and `claim.js` (×4)
were all rewritten. I polled for a settled tree for 10 minutes and never got one.

Two consequences, stated so nothing here is read as stronger than it is:

1. Every behavioural result below was **re-run at the end against the repaired tree**, at a pinned
   state (`efced5632f7798368458c3843667ca09`, verified byte-identical before and after each run —
   noted `attributable=YES`). Results taken against earlier snapshots were discarded, not carried
   forward. **Nothing in the "verified clean" table is stale**: it includes the rewritten `.git`
   boundary discriminator, driven over 12 shapes against ground truth on all four editions.
2. **Two things I nearly reported as defects were mid-write artifacts.** Both were checked rather
   than filed:
   - Gitea's `isArchiveRepoBoundary` still had the old `(absDir)` signature while the other three had
     `(mainRoot, absDir)` — the file was written 1 second later and now agrees.
   - `simulate-workflow-walkthrough.js` exited 1 with `stderr: residueProbe is not defined` from
     `claim.js`. Canonical `claim.js` had been written 9 seconds earlier. A brace-depth walk shows the
     declaring block at `:4723` never closes before the use at `:4855`, so the identifier is in scope
     in the completed file; the walkthrough is green at the pinned state (198/198, attributable).

   *A "port miss" and a half-written file look identical in one read.*

---

## FINDINGS

finding: id=R1 scope=in_scope action=fix status=open severity=high fix_role=implementer rationale=a new canonical run-chains comment carries a literal `plugins/kaola-workflow/scripts/` path that renders verbatim into both generated forge ports, where the contract rule matches on full text including comments

### R1 — a COMMENT in `run-chains.js` fails both forge contract validators

**Failure class:** edition-coupling regression — canonical prose reaching an edition that forbids it.

**Trigger.** `scripts/kaola-workflow-run-chains.js:650` (the `#907 (second half)` `--no-renames` note)
contains the literal string:

```
// DESTINATION only — the pre-image is never named. So `git mv plugins/kaola-workflow/scripts/x.js
```

`run-chains.js`'s forge ports are **generated** (`edition-sync.js` `GENERATED_AGGREGATORS`), and the
rename map rewrites only `kaola-workflow-run-chains.js` → `kaola-{gitlab,gitea}-workflow-run-chains.js`.
It does not rewrite an inline `plugins/kaola-workflow/scripts` path, so the comment lands byte-identical
in both forge ports at `:651`.

The forge contract rule (`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:363`,
and the Gitea twin) is:

```js
assert(!/plugins\/kaola-workflow\/scripts|require\(['"]\.\.\//.test(text), file + ' must not fall back to root or GitHub plugin scripts');
```

It tests `text` — the **full** file. The sibling `gh` rule one line above strips comment lines first
(`nonCommentText`); this one does not. So a comment is enough to fail it.

**Expected:** both forge contract validators exit 0.
**Observed (re-confirmed live, 07:32:13, pin `795dfa0d…`):**

```
gitlab EXIT=1
  Error: plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js must not fall back to root or GitHub plugin scripts
gitea  EXIT=1
  Error: plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js  must not fall back to root or GitHub plugin scripts
```

**Anchors.** primary `scripts/kaola-workflow-run-chains.js:650`; secondary
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js:651`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:651`,
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:363`.

**Candidate-caused:** the string is absent from `main`
(`git show main:…gitlab…run-chains.js | grep -c` → `0`; live count → `1` in each of the three files).

**Mutation proof, one axis, full scratch mirror of the worktree.**

| leg | change | gitlab-contracts |
|---|---|---|
| control | none | EXIT=1 — `…must not fall back to root or GitHub plugin scripts` |
| mutant | that ONE comment's path text → `<the codex plugin scripts dir>/x.js`, asserted 1 occurrence per file, 2 files, nothing else | EXIT=1 — but now on the **next** assertion (validation-runner byte-identity), i.e. the run-chains rule is cleared |
| mutant + mirrors materialised | above, plus the three validation-runner copies synced | **EXIT=0** on gitlab AND gitea; `validate-script-sync` EXIT=0 |
| **mirrors materialised ALONE** (comment left as it ships) | the deferred `sync:editions`, nothing else | **EXIT=1** — `…must not fall back to root or GitHub plugin scripts` |

The last row is the one that matters for the deferral: **R1 does not clear when `sync:editions` runs.**

**Why no existing guard prevents it:** `edition-sync --check` (EXIT=0), `validate-script-sync`
(silent on this), `generate-routing-surfaces --check` (EXIT=0) and `validate-workflow-contracts`
(EXIT=0) all pass. Only the two forge contract validators see it. This confirms rather than
contradicts the brief's correction that the run-chains forge ports are GENERATED and "a miss there
REDS" — it does red; it just reds in the forge chains only, and behind a red the deferral explains.

**Smallest fix:** reword the comment so the path is not a literal (the mutation above is a working
form), then regenerate the two forge ports. Prose only — no behaviour changes.

---

finding: id=R2 scope=user_decision action=note status=open severity=medium fix_role=none rationale=validation-runner mirrors stale pending the orchestrator's single end-of-run sync:editions; recorded as a deliberate deferral, not attributed to a fix

### R2 — `kaola-workflow-validation-runner.js` mirrors stale (DEFERRED, orchestrator-owned)

Measured, for the record only:

```
scripts/kaola-workflow-validation-runner.js                               2df53616…   <- canonical
plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js        296ebf1a…
plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js 296ebf1a…
plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js  296ebf1a…
```

Canonical walked `296ebf1a… → f0add3f7… → e5ec8568… → 2df53616…` across the review while all three
mirrors stayed pinned. Reds `validate-script-sync` and both forge validators' byte-identity assertion
(`validate-kaola-workflow-gitlab-contracts.js:585`). Copying canonical over the three cleared it in
the scratch mirror, and nothing else was out of sync. **The orchestrator owns this and will run
`sync:editions`; I did not run it.**

**Note on the two transients underneath it:** at `07:13` `validate-script-sync` also reported
`kaola-workflow-claim.js` canonical↔Codex out of sync, and at `07:06` the same for `sink-merge.js`.
Both resolved on their own within minutes — those were the repair round's own write windows, not
findings. Only the validation-runner group is persistently stale.

---

finding: id=R3 scope=in_scope action=note status=open severity=low fix_role=doc-updater rationale=a new comment in the GitLab claim port names watch-pr, a subcommand that does not resolve on that edition

### R3 — GitLab port comment names `watch-pr`, which does not exist there

`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:4494` (new in this bundle) reads
"…this route, **watch-pr** and the abandon sweep…". On the GitLab edition the subcommand is `watch-mr`
(`:5803 if (sub === 'watch-mr')`; `USAGE` at `:5769` lists `watch-mr`; the file's own pre-existing
comment at `:2557` says "release / watch-mr"). Measured:

```
$ node …/kaola-gitlab-workflow-claim.js watch-pr
unknown subcommand: watch-pr
```

Comment-only, no behaviour. **Honest scoping:** one pre-existing instance already sits at `:2291`
(present at `main`), so this bundle added a second occurrence of an existing drift rather than a new
class. The Gitea port is correct — `watch-pr` **is** its subcommand name there (`:5795`), so the same
ported sentence is right on Gitea and wrong on GitLab.

---

finding: id=R4 scope=in_scope action=note status=open severity=low fix_role=doc-updater rationale=docs/api.md states the forge finding-type divergence as four-versus-five; measured it is five-versus-six, the delta being exactly archive_unstage_failed

### R4 — the four-vs-five finding-type divergence: CONFIRMED in substance, off by one in the counts

Asked to confirm or refute independently. **The divergence is real, its cause is exactly as the docs
state, and it is pre-existing. The absolute numbers in `docs/api.md:361` are wrong by one.**

Counted `recordFinalizeFinding` types in the finalize transaction, per edition:

| edition | types | sites |
|---|---|---|
| canonical | **6** | `archive_unstage_failed:4609` `archive_stage_failed:4645` `archive_commit_probe_failed:4699` `residue_probe_failed:4758` `residue_stage_failed:4800` `finalize_commit_probe_failed:4839` |
| codex | **6** | identical set |
| gitlab | **5** | `archive_stage_failed:4378` `archive_commit_probe_failed:4430` `residue_probe_failed:4489` `residue_stage_failed:4530` `finalize_commit_probe_failed:4569` |
| gitea | **5** | identical set |

`docs/api.md:361` says *"they raise **four** finding types where canonical and Codex raise five"*.
Measured it is **five vs six**.

Everything else in that paragraph holds exactly:

- **The delta is precisely one type, `archive_unstage_failed`**, and it exists only where there is a
  `git rm -r --cached` to fail.
- **The cause is the staging shape.** Canonical/Codex make TWO archive-staging calls —
  `git rm -r --cached --ignore-unmatch -- kaola-workflow/<project>` at `:4598` then
  `git add -A -- ...existingPaths` (a candidate-path list) at `:4631`. The forge ports make ONE
  unscoped call, `git add -A 'kaola-workflow/'` (gitlab `:4367`, gitea `:4362`) — no `rm -r --cached`,
  no candidate-path list. One call to fail, one fewer finding type.
- **Pre-existing, not closed by this bundle:** at `main`, the gitlab port already had the unscoped
  `'add', '-A', 'kaola-workflow/'` (count 1) and canonical already had `'rm', '-r', '--cached'`
  (count 1).

Worth filing as the lead intends — with the corrected counts.

---

## WHAT I VERIFIED CLEAN — behaviour DRIVEN per edition, not diffed

All eight probes ran against the **repaired** tree at a pinned state (before==after). Each has an
armed negative control: the identical probe against a `main` baseline built with
`git archive main scripts plugins`, or against my pre-repair snapshot.

| # | behaviour | four-edition result | negative control |
|---|---|---|---|
| 1 | `verifyArchiveComplete` — name set + `uncomparable[]` | 9/9 probes converged | armed: reverting the GitLab port to 3 names diverges 2 of 9 legs |
| 2 | `assertBranchHasNonWorkflowChanges` — `workflow_only_files` literal names | 4/4 hazards literal, converged | 3 of 4 red at `main` (2× finding NULL, 1× mangled name) |
| 3 | `sinkPreflight` — the second porcelain parser | 6/6 converged | 4 of 6 red at `main` |
| 4 | `scanArchiveTree` — gitlink subtree skip, `missingBlobs` oracle | 4/4 converged, no unclearable refusal | p2/p3 red at `main` (`missingBlobs` non-empty → `sink_incomplete`) |
| 5 | `isArchiveRepoBoundary` — **12 `.git` shapes vs ground truth**, REWRITTEN version | 12/12, all four editions match the outer repo in BOTH directions | pre-repair discriminator red on 3 (`core.bare=true`, `core.worktree` elsewhere, both) |
| 6 | `isEditionCouplingPath` / `classifyScope` fail-open | 5/5 × tracked and untracked, converged | 3 of 5 red at `main` |
| 7 | `--no-renames` — a rename OUT of an edition tree | all four widen to `all-four`, converged | red at `main` (`claude-only`; git reported only `src/moved.js`) |
| 8 | `#910` receipt placement on a linked-worktree run | all four: receipt in MAIN, no worktree run folder, hash still binds the WORKTREE | `main`: all four put the receipt in the worktree and created the folder |

**#5 is the direct check on the rewritten discriminator** and the strongest control here. The repair
replaced `rev-parse --show-toplevel` (which asks the INNER repo, whose own config can lie) with
`rev-parse --resolve-git-dir` from the OUTER repo. Driving 12 shapes against ground truth — what the
outer repo actually stages into a scratch index — the new discriminator agrees with git on all 12 on
all four editions; the old one disagreed on 3, in the direction that leaves an unclearable
`sink_incomplete`. **The rewrite ported correctly to both hand-ported forge copies.**

Two oracle corrections worth carrying, because the oracle mattered more than the result:

- **#4.** My first gitlink oracle (`git add -f` exits 0?) reported the baseline as CLEAN — a false
  negative. The block only appears once the nested repo has a commit **and** the gitlink is already in
  the index. Rebuilt to replay `archive_commit`'s own sequence (`git add -A -- <archiveRel>`,
  `commit`, `ls-tree -r -z`) and compute `missingBlobs` exactly as `sink-merge` does; that reproduced.
- **#8.** My first fixture COMMITTED the run folder, so the worktree checkout carried it,
  `resolveRecordFolder`'s local arm hit, and both legs looked identical — the fix looked like a no-op.
  The live topology has the run folder **untracked and main-resident only** (verified: `git ls-files`
  and `git ls-tree main` both empty for it, and it is absent from the worktree).

### New envelope fields — all reached all four editions

`archive_commit_probe`, `finalize_commit_probe`, `residue_stage`, `findings` and
`finalize_commit: 'unknown'` occur at identical counts in all four `claim.js` copies. `archive_stage`
is 7/7/5/5 — **not a port miss**: the forge ports have one archive-staging call rather than two, so
there are two fewer assignment sites. That is R4's pre-existing shape difference, and the ledger
literal carries `archive_stage: 'skipped'` in all four (canonical `:3962`, gitlab `:3767`,
gitea `:3764`).

### Port topology, re-measured rather than taken on trust

Exactly 4 copies of each of the 5 touched families, 20 files, and the diff touches all 20. No
`opencode`/`kimi` script copies exist (prompt-only editions), and no fifth definition of
`parsePorcelainPaths` / `verifyArchiveComplete` / `requiredArchiveFiles` exists anywhere in the tree
(searched with dot-directories named explicitly). `CHANGELOG.md`, `docs/api.md` and
`docs/workflow-state-contract.md` are single-copy — no per-edition doc duplication owed.

**The brief's correction is independently confirmed:** the GitLab/Gitea `run-chains` ports are
GENERATED — `edition-sync --check` EXIT=0, and the three run-chains diffs are textually identical
after forge-name normalisation (139 lines each). Only `sink-merge.js`'s forge ports are unpoliced,
and they got the deepest drive (probes 3, 4, 5).

### Hunk-level port completeness

- **`sink-merge.js`** (hand-ported, policed by nothing): canonical 4 hunks ↔ forge 4 hunks, 1:1.
  GitLab and Gitea diffs byte-identical to each other after forge-name normalisation.
- **`claim.js`** (hand-ported): canonical 21 hunks ↔ forge 21 hunks. Comparing **added code lines**
  (comments stripped, forge names normalised, sorted): GitLab ≡ Gitea, and `comm -23 canonical forge`
  is **empty** — nothing in canonical is missing from the ports.
- The `residue_stage` block and the `main_live_orphan` move-aside block are character-identical across
  all four editions (whitespace- and comment-normalised diff, empty).
- All three `missing`-only refusal routes gained `mismatched` in every edition
  (canonical `4749/5705/5800`, GitLab `4498/4884/4979`, Gitea `4493/4879/4974`); no fourth route
  reports `missing` alone in any edition.

### Over-porting

Scanned every added line in all six forge files for GitHub-flavoured vocabulary (`gh `, `github`,
`pull request`, `--repo`, `gh api`) and for canonical-only script paths. **Two hits: R1 and R3.** The
two base-named requires that do appear in the forge ports (`kaola-workflow-adaptive-schema.js`,
`kaola-workflow-validation-runner.js`) are correct — both exist under each plugin's `scripts/` and
both resolve, proven by probe 8 driving the GitLab and Gitea run-chains ports end to end.

### The `sinkPreflight` divergence I was asked to confirm

Confirmed **pre-existing and untouched**. The forge ports call `assertWorktreeClean(mainRoot, branch)`
unconditionally at GitLab `:1505` / Gitea `:1498`; there is no `branchless` identifier anywhere in
either forge file (`grep -c` → 0), so no `#711` clause and no `[project]` argument, unlike canonical
`:1480-1495`. The bundle's diff does not touch those lines in any edition. **Nothing this bundle added
interacts with it:** the changed regions in the forge sink files all sit after the guard (the porcelain
loop) or in `scanArchiveTree`/`assertBranchHasNonWorkflowChanges`, which the guard does not gate.

### Suites — all run SERIALLY, exit codes read directly, never through a pipe

| suite | exit | note |
|---|---|---|
| `simulate-workflow-walkthrough.js` | **0** | 198/198 FULL scope, tree pin identical before and after |
| `test-sink-merge.js` | 0 | re-run after the sink repair landed |
| `test-run-chains.js` | 0 | 258 assertions |
| `test-finalize-door.js` | 0 | 310 assertions |
| `test-validation-runner.js` | 0 | |
| `test-gitlab-sinks.js` / `test-gitea-sinks.js` | 0 / 0 | re-run after the sink repair |
| `test-gitlab-run-chains.js` / `test-gitea-run-chains.js` | 0 / 0 | |
| `simulate-gitlab-workflow-walkthrough.js` / gitea | 0 / 0 | |
| `simulate-gitlab-codex-workflow-walkthrough.js` / gitea | 0 / 0 | |
| `edition-sync.js --check` | 0 | 8 forge aggregator ports in parity |
| `generate-routing-surfaces.js --check` | 0 | 18 surfaces byte-match |
| `validate-workflow-contracts.js` | 0 | |
| **gitlab / gitea contract validators** | **1 / 1** | **R1**, with R2 behind it |
| `validate-script-sync.js` | 1 | R2 (deferred, orchestrator-owned) |

One false red of my own making, recorded so it is not mistaken for evidence: an early gate sweep used
`node "$WT/$1" "${@:2}"` and passed an empty argument, reding `edition-sync --check` and
`generate-routing-surfaces --check`. Re-run explicitly, both are 0.

**A second, larger process error, recorded because it invalidated a whole first pass:** several early
commands ran with **relative paths and a cwd that had silently reset to the MAIN root**, which holds
the pre-bundle copy. Those gate runs reported green against a tree with none of the bundle in it. Every
result in this report was re-taken from the worktree with absolute paths. *A green gate proves nothing
until you know which tree it read.*

verdict: fail
findings_blocking: 1

review_conclusion: The hand-ported forge families are behaviourally faithful on the repaired tree — eight independent probes drive all four editions over identical fixtures and converge on every one, each with an armed negative control that reds at the baseline, including the rewritten repository-boundary discriminator checked over twelve git shapes against what the outer repository actually stages. One blocking parity defect remains live after the repair round: a new canonical run-chains comment carrying a literal codex-plugin path renders verbatim into both generated forge ports and trips a contract rule that matches full text including comments, and it is mutation-proven NOT to clear when the deferred edition sync runs, so it currently hides behind a red the team already believes it understands. The finding-type divergence the docs agent reported is confirmed real, pre-existing, and caused exactly as stated, but the shipped counts are five versus six rather than four versus five, the delta being the single archive_unstage_failed type.
