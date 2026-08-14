# Implementation — issue #974: a leftover run folder must not silently satisfy the resolver

**Baseline: `69264936`** (`workflow/bundle-973-974-975`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`).

**Verification tier: `tests-green`** — the authored suites (`test-gap-sweep.js`,
`test-validation-runner.js`) go from red to green, plus `regression-green` on `test-run-chains.js`
and the full-scope walkthrough, plus a direct placement measurement for Result 2, which no assertion
covers.

**No test file was edited.** `scripts/test-gap-sweep.js` and `scripts/test-validation-runner.js` are
byte-unchanged by me; the modifications shown against them in `git status` are the test author's.
I found no defective pin.

---

## What changed, and where

Ten non-comment lines across two resolvers. Both implement the same rule, and I applied it to both
in the same shape so they cannot drift apart.

### 1. `scripts/kaola-workflow-gap-sweep.js` → `resolveRunRoot` (`:488-500`)

```js
  const claimed = r => fs.existsSync(path.join(r, 'kaola-workflow', project, 'workflow-state.md'));
  if (holds(cwd) && claimed(cwd)) return cwd;          // was: if (holds(cwd)) return cwd;
  …
  if (holds(mainRoot) && (claimed(mainRoot) || !holds(cwd))) return mainRoot;
  return cwd;                                          // was: return holds(mainRoot) ? mainRoot : cwd;
```

### 2. `scripts/kaola-workflow-validation-runner.js` → `resolveRecordFolder` (`:1301-1320`)

```js
  const claimed = dir => fs.existsSync(path.join(dir, 'workflow-state.md'));
  if (local && claimed(local)) return { dir: local, root, mainResident: false, searched };
  …
    if (inMain && (claimed(inMain) || !local)) return { dir: inMain, root: main, mainResident: true, searched };
  if (local) return { dir: local, root, mainResident: false, searched };   // ← new terminal fallback
```

A comment block above each states the rule and why it is a tie-break rather than a requirement.

### Full behaviour table (both resolvers, identical)

| invoking tree holds folder | carries `workflow-state.md` | main holds | main carries signature | answer | vs HEAD |
|---|---|---|---|---|---|
| yes | yes | either | either | **this tree** | same (T26d post-mirror) |
| yes | no | yes | **yes** | **main** | **CHANGED — the fix** |
| yes | no | yes | no | this tree | same |
| yes | no | no | — | this tree | same (T25e, T26 baseline) |
| no | — | yes | either | main | same (T25b/c, leg C) |
| no | — | no | — | cwd / `dir:null` | same (T25f, first run) |

`KAOLA_GAP_ROOT` is still returned before anything else is consulted — the tier-1 short-circuit is
the first statement in the function and I did not touch it.

---

## Why this shape rather than the alternatives

**Why retarget rather than detect-and-report.** Report-only was the cheaper family and the brief
pointed at a shipped precedent for it (`otherProjectRoots` + `other_candidate_roots`). It closes
Result 1 and it does **not** close Result 2: `run-chains.resolveOutputPath` consumes
`resolveRecordFolder(...).dir` as a bare path with no report channel, so a report would have left
the chain receipt landing in the leftover. Measured below — under the pre-fix resolver the receipt
lands in the leftover, and a report would not have moved it. The answer itself had to move.

**Why `workflow-state.md` as the signal.** It is the only content-level distinguisher on disk: the
claim transaction writes it into the folder it creates and nothing else writes that file, so its
presence is a positive marker of a claim-created folder. Its *absence* is not a marker of a stray —
run-chains writes a receipt-only folder on a first run — which is exactly why it is used as a
tie-break between two candidate trees and never as a requirement on one. When no tree carries the
signature, the pre-existing "this tree first" answer stands untouched.

**Why not a shared helper in `adaptive-schema.js`.** The shared part is a one-line `existsSync`; the
two resolvers differ in everything around it (return type, `existsSync` vs `statSync`+`isDirectory`,
a `main !== root` guard in one). Extracting the one line would not remove the duplication that
matters and would put a new export into the file that must stay byte-identical across four editions.
I left the predicate inline in each. This is a judgement call and is the one place a reviewer might
reasonably prefer the other answer.

**Why no new refusal, no new field, no schema change.** `run-gaps.json` stays `{project,
sweptClasses}`; no new `reason:` constructor exists; exit codes are unchanged. In the leftover
topology the gate now reaches main's real gap and refuses `gaps_unswept` — a reason the script
already ships — which `test-gap-sweep.js:1390` explicitly permits while forbidding a sixth class.

**Cost accepted, written down:** when the invoking tree holds an *unclaimed* run folder, both
resolvers now make a `git rev-parse --git-common-dir` call that HEAD short-circuited past. One git
call, only on that path; the common claimed-folder path still short-circuits. What would force this
to change is a caller that resolves in a hot loop; none exists today.

**Not covered:** a run claimed in linked worktree A while the operator stands in linked worktree B.
Neither resolver has ever reached sideways between worktrees (only this-tree → main), and I did not
add that. Out of scope for #974 and unchanged from HEAD.

---

## Result 2 — the chain receipt lands in the real record, not the leftover

No assertion covers this, so it is measured directly against the **real `run-chains` binary**, not
read off the code. Fixture: `/private/tmp/.../scratchpad/result2-receipt-placement.js` — a git repo
with a linked worktree; main holds the claim-created run folder (`workflow-state.md` present); the
worktree holds a **bare empty directory** of the same name (the harshest leftover); invocation is
`run-chains.js --chains claude --project issue-974r2` with cwd = the worktree.

Run twice against identical `run-chains.js`, differing only in the two resolvers. The pre-fix arm
uses a scratch mirror of `scripts/` with both resolvers restored from `git show HEAD:` — the
repository's own files were never reverted.

| arm | fixture root | receipt landed |
|---|---|---|
| **PRE-FIX resolvers (HEAD 69264936)** | `/private/var/folders/…/T/kw974-r2-PiyB3T` | `wt/kaola-workflow/issue-974r2/.cache/chain-receipt.json` — **THE LEFTOVER** (main: absent) |
| **FIXED (this change)** | `/private/var/folders/…/T/kw974-r2-PKz8ZX` | `main/kaola-workflow/issue-974r2/.cache/chain-receipt.json` — **THE REAL RECORD** (worktree: absent) |

Both arms exited 0 with `claude=0` in the receipt, so the difference is placement alone. And the
mutation arm below (m3) puts it back in the leftover, which is what makes this an armed measurement
rather than a single observation.

---

## Mutation proof — the new behaviour is armed

Four mutations applied to scratch mirrors of the **fixed** code (`…/scratchpad/mutate.js`, which
exits 2 if its anchor is absent or non-unique, so a no-op mutation cannot masquerade as an uncaught
one). The repository's files were never mutated.

| # | mutation | expectation | result |
|---|---|---|---|
| **m1** | `claimed(cwd)` always true in gap-sweep (this tree always counts as the run's) | #974 legs go red | **FAILED (8 failures, 165 passed), exit 1** — exactly the HEAD failure set: T26a/b/c |
| **m2** | gap-sweep reads main whenever main holds it (the "just read main" repair) | the post-mirror control goes red | **FAILED (1 failure, 172 passed), exit 1** — `T26d: the artifact lands in the worktree's own .cache, got …/main/…` |
| **m3** | `claimed` always true in `resolveRecordFolder` | leg B goes red | **exit 1**, AssertionError at `test-validation-runner.js:588` |
| **m4** | `claimed` always false in `resolveRecordFolder` | leg B goes red | **exit 1**, AssertionError at `:588` (note `searched` now carries both paths — the probe ran and still answered wrong) |
| **m3** | same mirror, re-run through the Result-2 fixture | receipt returns to the leftover | **`LANDED IN: THE WORKTREE LEFTOVER — WRONG`** |

m1 and m2 are the two directions that matter: m1 proves the retarget is what closes #974, and m2
proves the claim-signature tie-break is what keeps T26d — the legitimate post-mirror window — from
being collateral damage. m3/m4 together prove the `claimed` read in the record resolver is
load-bearing in both polarities, so neither a stuck-true nor a stuck-false predicate survives.

---

## Verification — commands and real exit codes

Every suite run serially (spawn-bound), exit codes captured directly, never through a pipe.

| command | before | after |
|---|---|---|
| `node scripts/test-gap-sweep.js` | `gap-sweep tests FAILED (8 failures, 165 passed)` **exit 1** | `gap-sweep tests passed (173 assertions)` **exit 0** |
| `node scripts/test-validation-runner.js` | `AssertionError [ERR_ASSERTION]` at `:588` **exit 1** | `test-validation-runner: PASSED` **exit 0** |
| `node scripts/test-run-chains.js` | `run-chains tests passed (283 assertions)` **exit 0** | `run-chains tests passed (283 assertions)` **exit 0** |
| `node scripts/simulate-workflow-walkthrough.js` | (not run before; unaffected at HEAD) | `210 ran / 210 passed / 0 failed`, shard `1/1` — **full scope, not a shard** — `Workflow walkthrough simulation passed` **exit 0** |
| `node scripts/edition-sync.js --check` | — | `8 forge aggregator ports in parity with canonical` + `committed kernel parity verified at HEAD` **exit 0** |
| `node scripts/generate-routing-surfaces.js --check` | — | `all 18 surfaces byte-match the skeleton` **exit 0** |
| `node scripts/validate-script-sync.js` | — | `OK: 15 common scripts, 27 byte-identical groups, … 4 Oracle Kernel copies identical at HEAD` **exit 0** |
| `node scripts/validate-workflow-contracts.js` | — | `Workflow contract validation passed` **exit 0** |

Raw output: `…/scratchpad/{baseline-974.txt, after-974.txt, mutation-exits-974.txt, verify-974.txt}`.

The gap-sweep count going 165→173 is the 8 previously-failing assertions now passing, with no
assertion lost. `test-validation-runner` now executes everything after `:588` (leg C and the
`#904`/`#913` blocks) that the first-failure throw was skipping at HEAD.

---

## Edition ports

`node scripts/edition-sync.js --write` — 6 files regenerated, none hand-edited:

```
generated  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js
generated  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js
codex-sync plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js
byte-sync  plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
byte-sync  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
byte-sync  plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
edition-sync: write complete (6 file(s) updated).   WRITE_EXIT=0
```

`gap-sweep` is a `GENERATED_AGGREGATORS` entry (forge ports rendered, codex copy byte-synced);
`validation-runner` is a `BYTE_IDENTICAL_GROUPS` entry (all four copies identical). `--check` green,
shown above. **`scripts/kaola-workflow-adaptive-schema.js` was not touched** — the cross-edition
drift anchor is byte-unchanged, and `validate-script-sync` confirms all 4 kernel copies identical.

There are no opencode/kimi copies of either file. `generate-routing-surfaces --check` is green
because no prose or command surface changed: no CLI flag, no output schema, no exit contract moved.

Files changed (8): `scripts/kaola-workflow-gap-sweep.js`,
`scripts/kaola-workflow-validation-runner.js`, and the 6 port copies above.
152 insertions, 16 deletions — mostly the two comment blocks.

---

## Cleanliness

```
$ git -C /Users/ylpromax5/Workspace/Kaola-Workflow status --short --untracked-files=all
?? kaola-workflow/bundle-973-974-975/{.cache/dispatch-log.jsonl,.cache/origin/selection-record.json,
   mission-list.md,premise-973.md,premise-974.md,premise-975.md,tests-974.md,workflow-state.md}

$ git -C …/.kw/worktrees/bundle-973-974-975 status --short --untracked-files=all
 M kaola-workflow/ROADMAP.md
 M plugins/…/kaola-gitea-workflow-gap-sweep.js          ← mine (generated)
 M plugins/…/gitea/kaola-workflow-validation-runner.js  ← mine (generated)
 M plugins/…/kaola-gitlab-workflow-gap-sweep.js         ← mine (generated)
 M plugins/…/gitlab/kaola-workflow-validation-runner.js ← mine (generated)
 M plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js         ← mine (generated)
 M plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js ← mine (generated)
 M scripts/kaola-workflow-gap-sweep.js                  ← mine
 M scripts/kaola-workflow-validation-runner.js          ← mine
 M scripts/test-gap-sweep.js                            (test author's, untouched by me)
 M scripts/test-install-upgrade-rewrite.js              (not mine)
 M scripts/test-kimi-edition.js                         (not mine)
 M scripts/test-opencode-edition.js                     (not mine)
 M scripts/test-validation-runner.js                    (test author's, untouched by me)
?? kaola-workflow/.roadmap/issue-{973,974,975}.md

$ ls -a …/.kw/worktrees/bundle-973-974-975/kaola-workflow/
.  ..  .origin  .roadmap  archive  ROADMAP.md
```

**No stray `kaola-workflow/<project>/` in either tree** — the defect class under repair. The worktree
holds no run folder at all; main holds only this run's own claim-created one (`workflow-state.md`
present, which is the correct signature and not a stray). Every fixture was built under
`os.tmpdir()` and removed in a `finally`; a glob for `kw974-*`, `kw-gap-*` and `kw-scope-*` in the
tmpdir returns no matches. The `.md` report file in main is this file.

---

## Left undone, stated plainly

- **No `CHANGELOG.md` entry.** This is a user-visible behaviour change (where the sweep reads, where
  the chain receipt lands) and CLAUDE.md asks for one under `[Unreleased]`. My brief scoped me to the
  two resolver sites and the edition regeneration, a docs agent is active in this bundle, and there
  is no `[Unreleased]` section in the file today, so creating one is a structural call I did not make
  unilaterally. **This is owed and I did not do it — it needs routing.**
- **No docs edit was forced.** `docs/api.md:1446-1457` documents gap-sweep's two modes and says
  nothing about root resolution; `docs/workflow-state-contract.md:50` registers `run-gaps.json`'s
  schema, which is unchanged. Neither is now contradicted. Whoever writes the CHANGELOG entry may
  still want a sentence in `docs/conventions.md` — that is a judgement I left to them.
- **`otherProjectRoots` remains unexported**, and I added no report. The retarget closes both results
  without it, so exporting it would have been an addition no observed failure demanded. If a reviewer
  wants the leftover *named* in output as well as routed around, that is a deliberate second decision,
  not an oversight — the hook already exists at `validation-runner.js:1311` and its `record` consumer
  at `:1535-1552` already emits the shape.
- **The premise doc's open question 6** — whether a legitimate worktree-resident receipt-only folder
  still occurs post-#910 — I did not resolve empirically, but the change makes it moot rather than
  riskier: both resolvers now move together, so a receipt written under this fix goes wherever the
  sweep will look for it. The stranded case is a receipt written *before* the fix into a leftover,
  which is precisely the population the issue is about.
