# impl-repairs — code repairs from the adversarial reviews (#973/#974/#975)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
Branch: `workflow/bundle-973-974-975` (confirmed `## workflow/bundle-973-974-975` at start; HEAD `69264936`)

Status: **all three repairs landed and verified.** Nothing was left unreached.

## Verification tier

`tests-green` — the authored suites pass. The behavioural repair (repair 1) is pinned by
`test-kimi-edition.js` P5c and mutation-proven; repairs 2 and 3 are comment-only and carry
`regression-green` alongside (gap-sweep + validation-runner + script-sync + edition-sync unchanged).

## Baseline (before any edit)

| check | exit | result |
|---|---|---|
| `node scripts/test-kimi-edition.js` | **1** | `FAIL: P5c … still on disk: kaola-role-issue-scout` — 1 failure, 608 passed |
| `node scripts/test-gap-sweep.js` | 0 | 173 assertions |
| `node scripts/test-validation-runner.js` | 0 | PASSED |
| `node scripts/edition-sync.js --check` | 0 | 8 forge aggregator ports in parity; kernel parity at HEAD |
| `node scripts/validate-script-sync.js` | 0 | 15 common scripts, 27 byte-identical groups, 4 kernel copies identical |

Live-install baseline: kimi skills 17 · claude commands 3 · claude agents 14 · opencode command 3.

## Repair 1 — the regression this bundle introduced (`install-kimi.sh`)

**Change** — `install-kimi.sh:156`: added `"kaola-role-issue-scout"` as the first element of
`RETIRED_ROLE_SKILLS`. Nothing else in the array moved; the deploy set was not touched (P5c's own
anti-vacuity assertion re-confirms the name is absent from `DEPLOY_SET`).

**Comment** — `install-kimi.sh:151-154`: "the **two** roles and two commands retired since" → "the
**three** roles and two commands retired since", plus one sentence naming what the set is so the
count is checkable rather than asserted: one skill dir per TOP-LEVEL `agents/*.md` and per
`commands/*.md` deleted since the edition landed, censused from git.

**Independent re-census** (I did not read the installer's list to derive this):

```
git log --no-renames --diff-filter=D --name-only f6dbf40d..HEAD -- agents/ commands/
```

- `agents/` top level: `issue-scout.md` (d663fd66, 2026-07-25), `contractor.md` (63443589,
  2026-07-26), `workflow-planner.md` (65508fe3, 2026-07-31) → **three** roles.
  `agents/profiles/higher/*` deletions (3b4ad2a4, d663fd66) are NOT top level and render no skill.
- `commands/`: `kaola-workflow-adapt.md`, `kaola-workflow-plan-run.md` (ea84673d) → two commands;
  `fast` + `phase1..phase5` (1146e3ac, 2026-07-19) → the six fast/phase surfaces.

Total 11, matching the set `test-kimi-edition.js` P5c asserts. The installer held 10. Exactly one
name was missing; I added exactly that one.

The comment's other claims were checked too and all hold: edition landed 2026-07-17 (f6dbf40d);
fast/phase retired 2026-07-19, two days later; `kaola-workflow-auto.md` removed 2026-06-26
(87e6334c), before the edition existed.

**That it shipped**: `git cat-file -t f6dbf40d:agents/issue-scout.md` → `blob`.

### Mutation proof (repair 1)

A scratch mirror, not `git checkout --`: the worktree copied to
`…/scratchpad/mirror` minus `.git`, `kaola-workflow`, `node_modules`; the mirror's
`sync-kimi-edition.js --print-tree-root` resolves to the mirror itself, and the three `.kimi*` trees
were generated inside it. `REPO` is `path.resolve(__dirname, '..')`, so running the suite out of the
mirror exercises the mirror's `install-kimi.sh`.

| run | mirror `install-kimi.sh` | exit | output |
|---|---|---|---|
| control | as repaired | **0** | `kimi-edition test passed (609 assertions)` |
| mutant | `"kaola-role-issue-scout"` deleted from the array, nothing else | **1** | `FAIL: P5c: a skill dir retired in an earlier release is SWEPT from a live install — still on disk: kaola-role-issue-scout` — 1 failure, 608 passed |

The control is green before the mutation, so the red is attributable to the single removed element.

## Repair 2 — the false absolute in the #974 tie-break comment

The claim *"the claim transaction writes workflow-state.md into the folder it creates **and nothing
else writes that file**"* is false, and I confirmed all three counter-producers by reading them:

- `scripts/kaola-workflow-claim.js:3466` — `mergeCopyDir` skips a `FINALIZE_MIRROR_DEST_OWNED` name
  **only when the destination already has it**, so the finalize mirror *does* write
  `workflow-state.md` into a destination that lacks one.
- `scripts/kaola-workflow-claim.js:3479` — `FINALIZE_MIRROR_DEST_OWNED` contains `workflow-state.md`.
- `scripts/kaola-workflow-sink-pr.js:160` (write at `:244`, "update workflow-state.md Sink block").
- Also found: `claim.js:2405` `appendClosureBlock` rewrites the **archived** state file.

What is actually true, and what the tie-break needs, is that every `workflow-state.md` on disk
*originates* from a claim transaction: the later writers each read-then-rewrite a file that already
exists (`updateStateSinkBlock` and `appendSummary` presence-guard; `appendClosureBlock` returns false
on a read throw), and the finalize mirror copies the claim's own file forward. Reworded to state that
instead of sole authorship. Mechanism untouched — `resolveRunRoot` / `resolveRecordFolder` are
byte-identical apart from the comment.

New wording (`scripts/kaola-workflow-gap-sweep.js:479-482`):

```
// sweep itself ever succeeded. workflow-state.md is the file the claim transaction writes into the
// folder it creates — later writers only update a copy that already exists, or (the finalize mirror)
// carry that one forward — so its presence is the one signal on disk separating a folder some claim
// created from a directory that merely shares its name.
```

and the parallel clause at `scripts/kaola-workflow-validation-runner.js:1292-1295`, matching that
file's existing surrounding phrasing and wrap width.

### Port regeneration

```
node scripts/edition-sync.js --write   → exit 0, "write complete (6 file(s) updated)"
  codex-sync plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js
  byte-sync  plugins/kaola-workflow{,-gitlab,-gitea}/scripts/kaola-workflow-validation-runner.js
  (+ the gitlab/gitea gap-sweep ports)
node scripts/edition-sync.js --check   → exit 0, 8 forge aggregator ports in parity, kernel parity at HEAD
```

No port was hand-edited. Evidence the six ports carry the new text and none carries the old:

```
git grep -n "and nothing else writes that file"                    → no matches (exit 1)
git grep -l "later writers only update a copy that already exists" → 8 files
   scripts/kaola-workflow-gap-sweep.js
   scripts/kaola-workflow-validation-runner.js
   plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js
   plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
   plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js
   plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
   plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js
   plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
```

## Repair 3 — the false bound in `install.sh`'s retired-list comment (comment only)

`install.sh:180-183`: "Bounded by what commands/ and the plugin command trees **actually shipped**" →
now states the exception explicitly, that `workflow-goal.md` was never added by any commit in this
history and costs one no-op stat. The list itself is unchanged.

Because the new sentence asserts the *other eleven* did ship, I censused all twelve against every
path ever present on any ref (`git log --all --pretty=format: --name-only | sort -u`, 11005 unique
paths):

- `workflow-goal.md` — **0** occurrences anywhere in history.
- `workflow-next-pr.md` — 1 (`commands/`). `kaola-workflow-phase6.md` — 3 (`commands/` + both plugin
  command trees). The remaining nine — 4 each (`commands/`, both plugin trees, `.opencode/command/`).

So exactly one name never shipped, and the reworded sentence is true of all twelve.

## Verification after the repairs

| check | exit | result |
|---|---|---|
| `node scripts/test-kimi-edition.js` | **0** | `kimi-edition test passed (609 assertions)` — was 1 failure / 608 passed |
| `node scripts/test-gap-sweep.js` | 0 | 173 assertions (unchanged) |
| `node scripts/test-validation-runner.js` | 0 | PASSED (unchanged) |
| `node scripts/edition-sync.js --check` | 0 | 8 ports in parity, kernel parity at HEAD |
| `node scripts/validate-script-sync.js` | 0 | 15 common scripts, 27 byte-identical groups, **4 Oracle Kernel copies identical at HEAD** |
| `bash -n install.sh install-kimi.sh install-opencode.sh` under `/bin/bash` 3.2.57 | 0,0,0 | |
| `bash -n` under `/opt/homebrew/bin/bash` 5.3.15 | 0,0,0 | |
| `node scripts/simulate-workflow-walkthrough.js` (full scope, no shard) | **0** | `##KW-SHARD {"index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}` · `Workflow walkthrough simulation passed` · spawn-census 2432 |

`scripts/kaola-workflow-adaptive-schema.js` was never opened for writing — `git status --short` over
the canonical copy and all three ports is empty, and `validate-script-sync` re-confirms 4 identical
kernel copies.

## Safety — the real HOME was never written

Every installer invocation came from the suites, whose `runInstaller` mkdtemps a throwaway `HOME`,
`KIMI_CODE_HOME` and `--target dest`. I spawned no install by hand.

Final live-install counts, unchanged from the baseline taken before any edit:

```
ls ~/.kimi-code/skills       | wc -l  → 17
ls ~/.claude/commands        | wc -l  → 3
ls ~/.claude/agents          | wc -l  → 14
ls ~/.config/opencode/command| wc -l  → 3
ls ~/.kimi-code/skills | grep -c issue-scout → 0   (the retired name is not in the live install)
```

Cleanliness, `git status --short --untracked-files=all`:

- **worktree** — 36 entries, all this bundle's own work. Mine within them: `install-kimi.sh`,
  `install.sh`, `scripts/kaola-workflow-gap-sweep.js`,
  `scripts/kaola-workflow-validation-runner.js` and the 6 regenerated ports. The `claim.js` port
  diffs and every `scripts/test-*.js` entry were already modified before I started and are other
  agents' work; I opened none of them for writing.
- **main checkout** (`/Users/ylpromax5/Workspace/Kaola-Workflow`) — no source modification at all;
  only the 20 untracked run-record files under `kaola-workflow/bundle-973-974-975/`, which the run
  owns. Nothing of mine landed there.

The scratch mirror was deleted after the mutation proof.

## Files changed

- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975/install-kimi.sh`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975/install.sh`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975/scripts/kaola-workflow-gap-sweep.js`
- `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975/scripts/kaola-workflow-validation-runner.js`
- 6 regenerated ports under `plugins/` (gap-sweep ×3, validation-runner ×3)

No test file was written or edited.
