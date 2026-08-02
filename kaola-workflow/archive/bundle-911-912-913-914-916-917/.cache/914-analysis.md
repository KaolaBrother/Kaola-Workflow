# Investigation: #914 — does the forge one-call archive-staging shape have a failure mode the five existing finding types cannot name?

## THE ANSWER, IN ONE LINE

**(c), with (b) inside it:** the forge ports do *not* need `archive_unstage_failed` — their own
`archive_stage_failed` message already names the live-folder consequence the sixth type exists to
announce — but the single unscoped `git add -A 'kaola-workflow/'` has **three measured uncovered
modes that are SILENT SUCCESSES, not failures**, so no sixth *failure* type would catch them either.

---

## Setup

- Commit: `540f79a21622bbd4635e1e0c290741aea4fae27f` (`main`, tag `kaola-workflow--v9.2.0`)
- Working tree: clean except untracked `kaola-workflow/bundle-911-912-913-914-916-917/`
- Platform: darwin 25.6.0, git 2.54.0, node v24.18.0
- No tracked file was modified. All A/B legs ran in throwaway repos under the session scratchpad.

---

## 1. The type lists, by name, with file:line

### Canonical — SIX (`scripts/kaola-workflow-claim.js`)

| # | type | line |
|---|---|---|
| 1 | `archive_unstage_failed` | `scripts/kaola-workflow-claim.js:4609` |
| 2 | `archive_stage_failed` | `scripts/kaola-workflow-claim.js:4645` |
| 3 | `archive_commit_probe_failed` | `scripts/kaola-workflow-claim.js:4699` |
| 4 | `residue_probe_failed` | `scripts/kaola-workflow-claim.js:4758` |
| 5 | `residue_stage_failed` | `scripts/kaola-workflow-claim.js:4800` |
| 6 | `finalize_commit_probe_failed` | `scripts/kaola-workflow-claim.js:4839` |

(`recordFinalizeFinding` is defined at `:3973`.)

### Codex — SIX, same lines

`diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → **byte-identical**
(exit 0). The codex copy carries the same six types at the same six line numbers. Verified, not assumed.

### GitLab — FIVE (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`)

| # | type | line |
|---|---|---|
| 1 | `archive_stage_failed` | `:4378` |
| 2 | `archive_commit_probe_failed` | `:4430` |
| 3 | `residue_probe_failed` | `:4489` |
| 4 | `residue_stage_failed` | `:4530` |
| 5 | `finalize_commit_probe_failed` | `:4569` |

(`recordFinalizeFinding` defined at `:3778`.)

### Gitea — FIVE (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`)

| # | type | line |
|---|---|---|
| 1 | `archive_stage_failed` | `:4373` |
| 2 | `archive_commit_probe_failed` | `:4425` |
| 3 | `residue_probe_failed` | `:4484` |
| 4 | `residue_stage_failed` | `:4525` |
| 5 | `finalize_commit_probe_failed` | `:4564` |

(`recordFinalizeFinding` defined at `:3775`.)

**Verdict on the counts: the issue is CORRECT.** 6 / 6 / 5 / 5, delta exactly `archive_unstage_failed`.
No correction needed to the issue's headline table.

### One correction the issue DOES need: "7/7/5/5 assignment sites"

`grep -c archive_stage` gives 7 / 7 / 5 / 5 — but those are **token-bearing lines, not assignment
sites**. Broken out for canonical:

- `:3962` — `archive_stage: 'skipped'` — the transaction-schema **default**, not an assignment
- `:4603`, `:4604` — assignments (`archive_stage`, `archive_stage_detail`) in the unstage catch
- `:4633` — assignment (`archive_stage = 'staged'`)
- `:4638`, `:4639` — assignments in the add catch
- `:4645` — the **finding-type string** `'archive_stage_failed'`, not an assignment

Forge (gitlab): `:3767` default, `:4369`/`:4373`/`:4374` assignments, `:4378` finding string.

So the honest statement is **7 vs 5 lines carrying the token; 5 vs 3 actual assignments** (of which
3 vs 2 assign `archive_stage` itself). The 7/7/5/5 number is right; its *label* is wrong. Since the
issue was already wrong once on a count, the label is worth fixing rather than leaving.

### A field-level divergence the issue does not mention

`finalizeTx.archive_unstaged` — canonical 1 occurrence, gitlab 0, gitea 0. The forge ports have no
such field at all. `docs/api.md:330` documents it unconditionally. See §5.

---

## 2. The two staging shapes, read end to end

### Canonical — two calls (`scripts/kaola-workflow-claim.js:4590`–`4658`)

```
:4598   git -C <root> rm -r --cached --ignore-unmatch -- kaola-workflow/<project>
        └─ catch → archive_stage='failed', archive_stage_detail, stderr WARNING,
                   recordFinalizeFinding('archive_unstage_failed', …)

:4615   candidatePaths = [destRel?, 'kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md']
:4627   existingPaths  = candidatePaths.filter(fs.existsSync)
:4629   if (existingPaths.length > 0)                     ← the call is GUARDED
:4631     git -C <root> add -A -- <...existingPaths>
        └─ catch → archive_stage='failed', archive_unstaged=[…], stderr WARNING,
                   recordFinalizeFinding('archive_stage_failed', …)
:4657   roadmap_staged = archiveAddOk && existingPaths.some(roadmap paths)
```

### Forge — one call (gitlab `:4365`–`4390`, gitea `:4360`–`4385`)

```
:4367   git -C <root> add -A 'kaola-workflow/'            ← UNGUARDED, UNSCOPED, no `--`
        ├─ success → archive_stage='staged'
        └─ catch   → archive_stage='failed', archive_stage_detail, stderr WARNING,
                     recordFinalizeFinding('archive_stage_failed', …)
:4388   roadmap_staged = archiveAddOk && (existsSync('.roadmap') || existsSync('ROADMAP.md'))
```

### Baseline: on the healthy path the two shapes produce an IDENTICAL index

Fixture: `kaola-workflow/proj/` tracked and then **removed from disk** (which is what
`archiveProjectDir` does — `fs.rmSync(src)` on the linked copy+verify path at
`scripts/kaola-workflow-claim.js:2580`, `fs.renameSync(src, dest)` on the in-place path at `:2591`),
`ROADMAP.md` modified.

| leg | command | index | exit |
|---|---|---|---|
| canonical | `git rm -r --cached --ignore-unmatch -- kaola-workflow/proj` then `git add -A -- kaola-workflow/.roadmap kaola-workflow/ROADMAP.md` | `M ROADMAP.md`, `D proj/state.md` | 0, 0 |
| forge | `git add -A 'kaola-workflow/'` | `M ROADMAP.md`, `D proj/state.md` | 0 |

`-A` stages deletions, so the single call subsumes the `git rm --cached` **whenever the live folder
is gone from disk** — which is the shape `archiveProjectDir` guarantees on both of its paths. This
is why the divergence has never been observed in practice, and it is the strongest argument for the
issue's own "silence is an answer" exit.

### What `archive_unstage_failed` tells an operator that the other five do not — and why the forge already says it

Canonical's `archive_unstage_failed` text (`:4610`–`4613`):

> "…so the branch **may still carry the live run folder** that `chore: archive` exists to remove."

Forge's `archive_stage_failed` text (gitlab `:4379`–`4382`):

> "…so the `chore: archive` commit did not carry the archive, the roadmap, **or the removal of the
> live run folder from the branch**."

The forge's single type **already names the union of all three consequences**, including the exact
one the sixth type exists for. On a genuine staging failure the forge operator is told everything a
canonical operator would be told. There is one canonical-only *state* — `rm --cached` fails while
`git add` succeeds, giving `archive_stage:'failed'` beside a successfully staged archive — which the
one-call shape cannot reach because one call is atomic over its own outcome.

**On the narrow question the issue asks, the answer is (b).** Porting the sixth type would add a
name for a fault the forge cannot produce, while the forge's existing name already covers the
consequence. That is a mechanism derived for a failure class the shape cannot exhibit.

---

## 3. Failure-mode enumeration for `git add -A 'kaola-workflow/'`

Every row was measured by running the two command shapes against a purpose-built fixture. `—` means
no finding fires at all.

| # | mode | canonical behaviour + type | forge behaviour + type | named on forge? |
|---|---|---|---|---|
| M1 | index lock / permission / disk-full / corrupt index — the whole call fails | exit≠0 on either call → `archive_unstage_failed` and/or `archive_stage_failed` | exit≠0 → `archive_stage_failed`, whose text names archive + roadmap + live-folder-removal | **YES** — fully |
| M2 | `kaola-workflow/` absent from the worktree | **no git call at all** (`existingPaths.length > 0` guard, `:4629`); silent, correct | `git add -A 'kaola-workflow/'` → **exit 128**, `fatal: pathspec 'kaola-workflow/' did not match any files` → `archive_stage_failed` | **named, but SPURIOUS** — a finding canonical never raises, on a shape where nothing was wrong. Inverse asymmetry: a false finding, not a missing one |
| M3 | a child of `kaola-workflow/` is covered by the consumer's `.gitignore` (`.roadmap/`) | explicit pathspec → **exit 1**, `The following paths are ignored…` → `archive_stage_failed`; `roadmap_staged=false` | directory pathspec → **exit 0**, ignored child silently skipped; `archive_stage='staged'`; `roadmap_staged` = **true** while `.roadmap` never reached the index | **NO** — none of the five. The forge *loses* a signal canonical has, and records a false statement about the index (the exact #907 class) |
| M3b | *only* ignored content changed under `kaola-workflow/` | exit 1 → `archive_stage_failed` | exit 0, **staged set is empty**, `archive_stage='staged'`, `roadmap_staged=true` | **NO** |
| M4 | a **foreign live project folder** (`kaola-workflow/<other>/`) is dirty or untracked in the worktree | not in `candidatePaths` → never staged | `-A` sweeps it → rides into `chore: archive <project>` at exit 0 | **NO** — and see §3a: both staging guards are structurally blind to it |
| M5 | a **foreign archive band** (`kaola-workflow/archive/<other>/`) is dirty | never staged | swept into `chore: archive` at exit 0 | **NO** — `staging_guard_foreign_archive` exists but is unreachable here |
| M6 | the live folder **survives on disk** and is tracked | `git rm --cached` forces it out of the index → `R100 proj/state.md → archive/proj/state.md`; the branch loses the live folder | `-A` **re-adds** it → `A archive/proj/state.md` only; `proj/state.md` **stays on the branch**, exit 0, `archive_stage='staged'` | **NO** — this is precisely the outcome `archive_unstage_failed` announces, reached through *success*. Reachability NOT established (see §6) |
| M7 | unstage fails while add succeeds (partial) | `archive_stage='failed'` + `archive_unstage_failed`, archive nonetheless staged | structurally impossible — one call | n/a, five suffice trivially |
| M8 | canonical-only message defect on this same surface | `archive_stage_failed` says *"`git add` is all-or-nothing over its pathspec list, so NONE of these N path(s) was staged"* — **measured FALSE** for the ignored-path case: exit 1, and `ROADMAP.md` **was** staged | n/a | canonical bug, recorded here because it sits on the surface #914 is about |

### Measurement log

| leg | command | result | exit |
|---|---|---|---|
| baseline canonical | `git rm -r --cached --ignore-unmatch -- kaola-workflow/proj` ; `git add -A -- kaola-workflow/.roadmap kaola-workflow/ROADMAP.md` | `M ROADMAP.md` / `D proj/state.md` | 0 / 0 |
| baseline forge | `git add -A 'kaola-workflow/'` | `M ROADMAP.md` / `D proj/state.md` | 0 |
| M2 forge | `git add -A 'kaola-workflow/'` (dir absent) | `fatal: pathspec 'kaola-workflow/' did not match any files` | **128** |
| M3 canonical | `git add -A -- kaola-workflow/.roadmap kaola-workflow/ROADMAP.md` (`.roadmap/` ignored) | error printed; index nonetheless gained `M ROADMAP.md` | **1** |
| M3 forge | `git add -A 'kaola-workflow/'` (same fixture) | `M ROADMAP.md` / `D proj/state.md`; `.roadmap` silently skipped | **0** |
| M3b forge | `git add -A 'kaola-workflow/'` (only ignored content changed) | staged set **empty** | **0** |
| M4/M5 canonical | canonical pair, foreign project + foreign archive dirty | `M ROADMAP.md` / `D proj/state.md` — **nothing foreign** | 0 / 0 |
| M4/M5 forge | `git add -A 'kaola-workflow/'`, same fixture | `M ROADMAP.md` / `M archive/otherproj/notes.md` / `M otherproj/workflow-state.md` / `D proj/state.md` | **0** |
| M6 canonical | canonical pair, live folder still on disk | `R100 kaola-workflow/proj/state.md → kaola-workflow/archive/proj/state.md` | 0 / 0 |
| M6 forge | `git add -A 'kaola-workflow/'`, same fixture | `A kaola-workflow/archive/proj/state.md` **only** — live folder still on the branch | **0** |
| M8 isolation | clean index, `git add -A -- <ignored-dir> <good-file>` | exit 1 **and** `M kaola-workflow/ROADMAP.md` staged | **1** |

### 3a. Why M4/M5 are invisible to the single-project guard — measured end to end

`checkFinalizeStagingGuard` (`scripts/kaola-workflow-claim.js:3449`) reads **the index**
(`git diff --cached --name-only -z`, `:3455`) and returns `staging_guard_multi_project` /
`staging_guard_foreign_archive`. It is called three times per edition:

| call site | canonical | gitlab | gitea | when |
|---|---|---|---|---|
| startup/status probe | `:3899` | `:3705` | `:3702` | read-only rung |
| **pre-flight** | `:4102` | `:3908` | `:3905` | BEFORE any side effect — "a pure index read" |
| **post-staging** | `:4809` | `:4539` | `:4534` | AFTER `chore: archive` already committed (`:4707` / `:4438`) |

The pre-flight guard runs before the transaction's own `git add`, so it cannot see what that add will
stage. The post-staging guard runs **after** `commitFinalizeStep(root, 'chore: archive …')` has
consumed the index, so it reads a clean index.

Measured, full forge sequence:

```
pre-flight guard: staged set = (empty)                        → ok
git add -A 'kaola-workflow/'                                  → exit 0
  staged: M ROADMAP.md · M archive/otherproj/notes.md
        · M otherproj/workflow-state.md · D proj/state.md
git commit -m "chore: archive proj"                           → exit 0
post guard:      staged set = (empty)                         → ok
commit contents: BOTH foreign paths present
```

Both refusal reasons that exist for exactly this content are **structurally unreachable** for content
the transaction's own add swept in. On canonical the same fixture stages nothing foreign, so the hole
is forge-only.

---

## 4. Decide-able output

**(c) — the forges have a different uncovered failure mode that neither the five nor the sixth names.**

Qualified precisely:

- On the **narrow** question ("do the forges need `archive_unstage_failed`?") the answer is **(b)**.
  The forge's `archive_stage_failed` string already contains *"or the removal of the live run folder
  from the branch"*. Adding the sixth type buys a name for a fault the one-call shape cannot produce.
- On the **shape** question ("does the one-call shape have a failure mode the five cannot name?") the
  answer is **(c)**, and the uncovered modes are of a kind no additional *failure* type can reach:
  **M3/M3b, M4/M5 and M6 all exit 0 and record `archive_stage: 'staged'`.** They are silent successes.
  M2 is the inverse — a finding fired where canonical is correctly silent.
- The genuinely new fact this investigation produced is **M4/M5**: the unscoped `-A` sweeps a foreign
  project's live folder and a foreign archive band into `chore: archive <project>`, past both staging
  guards, at exit 0. That is not a finding-type gap; it is a **scoping** gap, and its remedy would be
  to scope the pathspec, not to add a type.

This report reports the evidence and does not choose the fix.

---

## 5. `docs/api.md` — exact lines

### The counts are ALREADY CORRECT. AC-2 is satisfied at HEAD.

`docs/api.md:359-365` reads (verbatim):

> **One edition difference, pre-existing and larger than these fields.** The GitLab and Gitea ports
> stage the archive with a single unscoped `git add -A 'kaola-workflow/'` — no `git rm -r --cached`,
> no candidate-path list — so they raise **five** finding types where canonical and Codex raise
> **six**. The delta is exactly one, `archive_unstage_failed`, which can only exist where there is a
> `git rm -r --cached` to fail; `archive_stage` on those two editions therefore covers that one call
> rather than the two the row above describes. The conversion was applied to the shape those ports
> actually have; the underlying staging divergence is older than this change and is not closed by it.

Five-vs-six, accurate, with the `archive_stage` semantics caveated. `CHANGELOG.md:216` carries the
same corrected statement. **Nothing here needs correcting for the counts.** The "it said four-vs-five"
half of AC-2 was already discharged by the #904–#910 bundle.

### What IS wrong in `docs/api.md`

**`docs/api.md:330`** — documents a field two of four editions do not have:

> `| `archive_unstaged` | the archive paths that did not stage, capped at 50 |`

Measured: `archive_unstaged` occurs 1× in `scripts/kaola-workflow-claim.js`, **0×** in
`kaola-gitlab-workflow-claim.js` and **0×** in `kaola-gitea-workflow-claim.js`. The 359-365 caveat
names the type delta and the `archive_stage` semantics but is silent on this field.
Sibling `residue_unstaged` (`:337`) is 1/1/1 — present everywhere — so the gap is specific to `:330`.

**`docs/api.md:328`** — canonical-only mechanism stated unconditionally:

> `| `archive_stage` | … Covers the archive bookkeeping — the `git rm -r --cached` of the live run folder and the `git add` of the archive paths. …`

Line 363-364 does back-reference this ("`archive_stage` on those two editions therefore covers that
one call rather than the two the row above describes"), so this is a **weaker** correction than `:330`
— the reader who gets to 363 is not misled. Worth noting only if the table is being touched anyway.

**`docs/api.md:359-365`** — the paragraph's factual claims are all true but it stops one step short:
it explains why the sixth type *cannot exist* on the forges and does not say whether the one-call
shape is otherwise equivalent. §3 of this report is the missing sentence. Under
`docs/conventions.md`'s "specify the result, never the method", the paragraph is already a mechanism
claim in prose; extending it should state a falsifiable result, not more mechanism.

---

## 6. Coverage: is there ANY behavioural per-forge test of the forge archive-staging path?

**Yes — one per forge, happy path only.**

- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:821-880` — *"finalize --keep-worktree
  commits archive rename on feature branch (issue #132)"*. It builds a real repo + linked worktree,
  **commits** the live folder (`:848-849`), runs the real gitlab `claim.js finalize --keep-worktree`,
  and asserts at `:867-868`:

  ```
  assert(!lsTree.includes('kaola-workflow/test-kw-proj/'),
    'feature branch HEAD must not have live folder after finalize --keep-worktree, got:\n' + lsTree);
  ```

  This is exactly the property M6 breaks. It passes today because `archiveProjectDir` removes the
  live folder from disk, so `-A` records the deletion.
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js:786-841` — the same test, gitea.
- `test-gitlab-workflow-scripts.js:1009-1011` / `test-gitea-workflow-scripts.js:935-937` — weaker:
  worktree survives + archive dir exists on disk.

**What is NOT covered, measured repo-wide:**

- `grep -rn "archive_stage" --include="test-*.js" --include="simulate-*.js"` over the whole repo →
  **zero hits.** No test in ANY edition asserts `finalize_transaction.archive_stage`.
- `archive_unstage_failed` appears in exactly three places repo-wide: the emit site
  (`scripts/kaola-workflow-claim.js:4609`), `docs/api.md:340`, `docs/api.md:362`, plus
  `CHANGELOG.md:216`. **No test anywhere exercises it.** The sixth type has zero coverage even in the
  edition that has it.
- No forge test file mentions `finalize_transaction`, `findings`, or any finding type. The only
  policing on the forge claim.js finalize transaction is a substring presence pin:
  `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:402` —
  `assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'finalize_transaction')`.
  A literal must appear somewhere in the file. It cannot witness the staging shape.

**Parity policing — the issue's assertion is CORRECT.**

- `COMMON_SCRIPTS` (`scripts/validate-script-sync.js:45`) contains `'kaola-workflow-claim.js'`
  (`:46`) — but its consumer loop at `:531-539` compares **only** `scripts/<name>` against
  `plugins/kaola-workflow/scripts/<name>`, i.e. canonical↔**codex**. The forge-renamed
  `kaola-<forge>-workflow-claim.js` is a different filename and is compared to nothing.
- `RENAME_NORMALIZED_FAMILIES` (`:288`) does not contain claim.js.
- `edition-sync.js:30-34` records the policy explicitly: *"The data-layer forge ports (claim /
  sink-merge / sink-pr / active-folders / classifier / roadmap) stay HAND-PORTED (covered
  behaviorally per #342) and are NOT touched here."*

So: parity policing is genuinely absent; behavioural coverage exists but is **happy-path only** and
asserts nothing about the transaction record.

### INCIDENTAL, and NOT #914's surface: three suites are RED at `540f79a2` on this machine

Found while establishing a baseline. Reported because it bears on "coverage is behavioural per forge"
and because a red at main should not be discovered by the next person.

| leg | command | result | exit |
|---|---|---|---|
| A | `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | `AssertionError` at `:2014` — `#901-gitlab-a IGNORED: the evidence must survive a fresh clone of the pushed remote, the clone carries []` | **1** |
| A | `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | same assertion, `:1962`, `#901-gitea-a` | **1** |
| A | `node scripts/test-sink-merge.js` | `FAIL: #901 y1 IGNORED: the evidence must survive a fresh clone of the pushed remote` | **1** |
| **B** | `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=main node scripts/test-sink-merge.js` | 62 tests, no failure | **0** |

Single axis: the operator's global `init.defaultBranch`. Root cause measured directly —
`test-git-fixture.js:154` and the `mkFixture901` helper (gitlab `:1856`) create the remote with
`git init --bare <dir>` and **no `-b`**:

```
$ git init -q --bare remote.git
$ git -C remote.git symbolic-ref HEAD
refs/heads/master                    ← not main
$ git clone -q remote.git cl
warning: remote HEAD refers to nonexistent ref, unable to checkout
$ ls cl        → (empty)
$ git -C cl ls-tree -r --name-only HEAD
fatal: Not a valid object name HEAD
```

The fixture repos are `git init -b main`, so the push creates `refs/heads/main` while the bare
remote's HEAD stays at the unborn `master`; the clone checks out nothing and the fresh-clone witness
reads `[]`.

**This is a test-fixture environment coupling, not a product regression** — the product path is fine
(the earlier assertions in the same helper, `blobs at HEAD` and `inCommit.length === 8`, pass). It
means these suites are **green only on a box whose global git config sets `init.defaultBranch=main`**,
which is the "workflow does not own consumer environment" shape pointing inward at our own tests.
It is a separate issue from #914 and I did not act on it.

---

## Inferences

- **The five forge types suffice for every genuine *failure* of the one-call shape** — confidence
  HIGH. Refuted by: any exit-non-zero path of `git add -A 'kaola-workflow/'` whose consequence is not
  covered by the `archive_stage_failed` string. I read that string; it names archive, roadmap, and
  live-folder removal.
- **The forge shape's real gap is scoping, not naming** — confidence HIGH for M4/M5 (measured end to
  end past both guards), MEDIUM for M3/M3b (measured at the git level; depends on a consumer
  `.gitignore` covering part of `kaola-workflow/`, which #832/#901 establish as a designed-for
  scenario). Refuted by: showing the pre-flight guard at `:3908` can see transaction-staged content
  (it cannot — it runs first), or showing a co-resident foreign folder is impossible in a linked
  worktree.
- **M6 is a genuine behavioural divergence but has no demonstrated trigger** — confidence LOW on
  reachability. `archiveProjectDir` removes the live source on both of its paths
  (`:2580` rmSync, `:2591` renameSync); `archive_incomplete` refuses at `:4161` and returns **before**
  the staging block; and in this repo run folders are untracked until the archive commit
  (`git log --diff-filter=A -- 'kaola-workflow/*/workflow-state.md'` shows adds only under
  `kaola-workflow/archive/…`), so `rm --cached` is a no-op here and the shapes agree. Refuted by:
  producing a real `finalize --keep-worktree` run where `kaola-workflow/<project>` is both tracked
  and present on disk at `:4367`. **I did not find one.**
- **Porting the sixth type would be a mechanism derived for a failure class never observed** —
  confidence MEDIUM-HIGH, per `CLAUDE.md`'s additive-derivation rule and the measured fact that no
  test in any edition exercises `archive_unstage_failed`.

## Open — what remains unmeasured, and why

1. **Reachability of M4/M5 in a real forge run.** I proved the guard blindness with raw git; I did
   not drive a real `finalize --keep-worktree` with a co-resident foreign project folder in the
   linked worktree. The live worktree here (`.kw/worktrees/bundle-911-…/kaola-workflow/`) holds only
   `archive` and `ROADMAP.md`, so I had no natural instance to point at. This is the single biggest
   gap in the case for (c) and is exactly what a per-forge behavioural harness would settle.
2. **Reachability of M6.** As above — no trigger found.
3. **Whether the `chore: archive` foreign sweep survives the sink.** The sink rebases and re-gates;
   I did not measure whether a foreign path riding in `chore: archive` is caught downstream.
4. **The #901 fresh-clone red.** Cause measured (bare-remote default branch); I did not survey how
   many other fixtures share `git init --bare` without `-b`, and I made no edit.
5. **Whether `docs/api.md:330`'s `archive_unstaged` gap has a consumer.** No test reads it; whether
   any agent prompt or skill does, I did not check.
