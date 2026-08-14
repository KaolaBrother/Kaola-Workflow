# impl #973 — an install does not remove a deployed skill it is not going to replace

**Verification tier: `tests-green`.** Authored suites for all three installers pass, each
mutation-proven separately in a scratch mirror.

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`
(branch `workflow/bundle-973-974-975`). Node v24.14.0, bash 5.3.15 on PATH, `/bin/bash` 3.2.57.

---

## 1. Audit verdict: **sound, repaired in one place**

The inherited code reaches the result on all three installers. I found and fixed one defect — a
header comment block the previous implementer left describing the mechanism it had just removed —
and I closed three measurement gaps the premise and tests left open (`--global`, and the
`gitlab`/`gitea` forge axis for both edition installers). Nothing else changed.

**What I changed:** `install-opencode.sh:48-63` (comment only). Before my edit it read:

```
# REINSTALL IS SELF-HEALING: copy_tree PRUNES kaola-owned command files before re-copying, so a
# reinstall converges to exactly the workflow command set on disk.
...
# AGENTS ARE MANIFEST-DRIVEN (they cannot be blind-pruned). Commands live in a reserved
# `kaola-workflow-*` / `workflow-*` namespace, so the prune above is namespace-complete and a
# retired command self-heals.
```

Every clause of that is now false: `copy_tree` does not prune kaola-owned command files, the prune
is not namespace-complete, and a retired command does not self-heal by namespace — it self-heals
because it is written down in a list. The same header in `install-kimi.sh` (`:41-44`) **was**
updated by the previous implementer, and `install.sh` carries no header prose on this, so this was
a single-file omission, not a shape it repeated. The replacement states the real contrast: commands
**declare** their retired set (`RETIRED_WORKFLOW_COMMANDS`), agents **derive** theirs (the
`<filename>\t<sha256>` deploy manifest). No test reads a comment, so this was found by reading, not
by a suite — `git grep -P 'converges to exactly|blind-prune|namespace-complete|kaola-owned'` across
all five shell installers now returns nothing.

Everything else in the inherited diff I checked and kept. Specifically checked and found **correct**:

- The three retired lists are historically complete, verified against git history rather than taken
  on trust (§4).
- No name appears in both a retired list and its deploy set (a name in both would be deleted and
  re-written every install — harmless but confused).
- No test pins either of the two error-message strings the diff changes
  (`git grep -P 'no skill sources|fall outside the workflow' -- scripts/ plugins/` → no hits), so
  the improved `install-kimi.sh:228` diagnostic is free.
- `bash -n` passes under **bash 3.2** as well as 5.3; the shebang is `#!/usr/bin/env bash` on all
  three, and no lifted array is ever empty, so the `set -u` empty-array trap does not apply.
- `install.sh`'s *support-script* prune (`:202-216`) does **not** carry the same defect and needed
  no change: it is driven by `SUPPORT_SCRIPT_NAMES` (the manifest), not by what the source tree
  happens to render, and `install.sh:139` already fails closed on an empty manifest **before** the
  prune runs. Likewise `install.sh:373-387` already swept retired *agents* from a manifest. The
  command surface was the only one of the three in that file that guessed by namespace.

---

## 2. What the fix does, per installer, and why that shape

| installer | retired set | per-name removal before the write | zero guard |
|---|---|---|---|
| `install-kimi.sh` | `RETIRED_ROLE_SKILLS` `:154-163`, swept at `:197-202` | `:218` `rm -rf` immediately before the `cp -R` at `:219` | `:225-232` (kept; message improved) |
| `install-opencode.sh` | `RETIRED_WORKFLOW_COMMANDS` `:190-194`, swept at `:336-341` | `:351` `rm -f` immediately before the `cp` at `:352` | none for commands (unchanged) |
| `install.sh` | `RETIRED_COMMANDS` `:182-188`, swept at `:193-200` | `:630` `rm -f` immediately before `render_command_file` at `:631` | `:635-642` (unchanged) |

**Why this shape.** The pre-#973 code deleted by *namespace glob* — `kaola-workflow-*`,
`kaola-role-*`, `workflow-init`, `workflow-next` — which is a predicate over **names**, and names
cannot distinguish "we retired this" from "the source failed to render this". Both are
kaola-namespaced; both look identical on disk. Two sets are therefore named explicitly instead:
the set the install is about to **write** (already known — the deploy loop computes it), and the
set the edition has **retired** (which only a human knows, so it is written down).

The removal is split across those two sets rather than done in one pass up front, because they have
different timing constraints: the retired sweep can happen anywhere before the copy, but the
per-name removal **must** sit immediately before that name's own write (§5).

Of the four candidates in premise §6, this is *"prune only what the new set replaces"* with the
obstacle that table names — dropping the retired sweep — paid for directly, by lifting
`RETIRED_ROLE_SKILLS` from an uninstall-only list into a list both paths read. That costs a
maintained list, which the old comment at `install-kimi.sh:144-146` had explicitly avoided. It is
the cheapest candidate that satisfies both halves the tests pin: the temp-dir swap reduces to the
same thing once it has to merge rather than replace (user content shares the dir), and
backup-then-restore covers only the abort path, while the two worst legs exit **0**.

**A cheaper rung I checked and rejected:** `install-opencode.sh` and `install.sh` already own a
manifest-driven retired sweep for *agents* (`sweep_retired_agents`, `install.sh:373-387`) — a
mechanism that derives the retired set with no list to maintain. Reusing it for commands would be
solution-ladder rung 2. It does not work here: the manifest is written by a *previous* install, so
a destination that predates the mechanism has none, and the retired names planted by P5c/P7b/block-1
(with no prior install) would survive. That is precisely the pin, so a pure manifest repair reds it.
The list is the only thing that covers the pre-manifest era.

---

## 3. How it distinguishes "retired on purpose" from "failed to deploy" — the sharp edge

**By declaration, and only by declaration.** A deployed name is removed iff it is (a) in the
retired list, or (b) the very name this install is about to write on the next line. Everything else
is left alone. Read literally the acceptance surface forbids removing a retired skill too — it is
also one the install will not replace — and the resolution is that "retired on purpose" is not a
property the installer can *infer*; it is a fact someone recorded. The list is where it is recorded.

This is load-bearing, not decorative, and it is armed in both directions on all three installers:
emptying the retired list reds the sweep pin (§6 mutations 3, 5, 7) while the #973 pins stay green;
restoring the namespace glob reds the #973 pins (mutations 1, 4, 6) while the sweep pin stays green.
No single mutation can satisfy both, which is the test author's claim independently re-measured.

**The cost, stated plainly:** retiring a command or role skill from now on requires adding its name
to the relevant list, and **nothing detects a forgotten entry.** The failure mode is benign (a dead
skill dir lingers on upgraded installs; nothing is destroyed), which is why it is a maintenance
note rather than a defect, but it is a new obligation that did not exist before this change.

---

## 4. The retired lists are complete — measured, not asserted

Verified from git history rather than from the previous implementer's comment.

- **`install-kimi.sh`** (10 names). The kimi edition landed at `f6dbf40d` (2026-07-17). At that
  commit `copy_skills` deployed `ADAPTIVE_CORE_COMMANDS` (`kaola-workflow-adapt`,
  `-finalize`, `-plan-run`, `workflow-init`, `workflow-next`) **plus** `kaola-workflow-fast` gated
  on `EFFECTIVE_FAST` and `phase1..5` gated on `EFFECTIVE_FULL`. So the union of everything this
  installer could ever have put on a user's disk is those 11 names; three are still shipped, and
  the remaining 8 are exactly the 8 command names in the list. The 2 role names come from the two
  agents removed since (`contractor`, `workflow-planner`) — `git log f6dbf40d..HEAD --name-only --
  agents/*.md` shows exactly those two gone and `investigator` added. **Complete.** The previous
  implementer's comment justifying the fast/phase names is therefore right, though the reason is
  the retired `--profile` axis, not what the comment says.
- **`install-opencode.sh`** (9 names). `.opencode*/command/` history holds exactly 12 basenames
  ever; 3 are still shipped and the other 9 are the list, name for name. **Complete.**
- **`install.sh`** (12 names). `commands/` + `plugins/*/commands/` history holds 21 basenames ever.
  3 are still shipped. 12 are in the list (including `kaola-workflow-phase6.md`, which shipped from
  the plugin trees though never from `commands/`). `workflow-goal.md` is in the list and appears
  **nowhere** in history — a harmless carry-over from the old prune's literal list, which named it
  too. The remaining **6 are `claude-workflow.md` and `claude-workflow-phase1..5|6.md`**, which the
  pre-#973 glob did not match either (`claude-workflow-*` matches none of the five old patterns).
  So they are stale-forever both before and after this change — **not a regression, and out of
  scope**, but somebody should decide whether to add them.

All three forges ship the identical 3 command basenames, so a `--forge` switch replaces all three
and strands nothing.

---

## 5. The nesting constraint — checked, and it is the load-bearing half on kimi

Premise §3 measured that `cp -R src dest` onto an **existing** `dest` copies *into* it:
`dest/X/SKILL.md` keeps the old bytes while the new ones land at `dest/X/X/SKILL.md`. The landed
code respects this — `install-kimi.sh:218` removes `$skills_dest/$base` on the line immediately
before the `cp -R` at `:219`, inside the same loop iteration. Nothing is deferred.

Mutation 2 below proves this is real: deleting that one line alone reds P5d three ways, including
the literal `dest/X/X` shape. **This is the only one of the three per-name removals that is
load-bearing.** The other two are redundant and I left them in place deliberately:

- `install.sh:630` — `render_command_file` already truncates with `: > "$dest_file"` (`:585`).
- `install-opencode.sh:351` — `cp` already overwrites a plain file.

They are one line each, they make the "remove immediately before writing" property uniform across
the three files (so a reader does not have to know which copy primitive truncates), and they break
a symlink at the destination rather than writing through it. Removing them would be a subtraction
with no observable benefit, so I did not.

---

## 6. Mutation proof — each installer separately

Every proof ran against a **full scratch mirror** at
`…/scratchpad/mirror` — never `git checkout --`, never the worktree's installers. The mirror is the
worktree's files (minus `.git`, `kaola-workflow/`) plus the six generated trees copied from main, so
`sync-{kimi,opencode}-edition.js --print-tree-root` resolves to the mirror **itself**; `cmp` confirms
its three installers are byte-identical to the worktree's. **The mirror reproduces the baseline
exactly** — kimi 609/exit 0, opencode 643/exit 0, upgrade-rewrite pass/exit 0, and with no
`[tree root: …]` suffix, i.e. fully self-contained. Driver: `…/scratchpad/mutate.js` (exact-string
replacement, refuses on anything but 1 match; `restore` puts the pristine copy back, verified by
`cmp` after each run).

### `install-kimi.sh`

**M1 `kimi-restore-namespace-prune`** — the pre-#973 glob loop back, verbatim; the per-name removal
left in place, so the *only* thing that changes is what gets swept. Exit 1, **2 failures / 607
passed** — byte-for-byte the red the test author recorded at baseline:

```
FAIL: P5a (#973): a deployed role skill the install is NOT going to replace is still on disk afterwards — 14 of 14 destroyed (kaola-role-adversarial-verifier, kaola-role-build-error-resolver, kaola-role-code-architect, …), install exited 0
FAIL: P5b (#973): a deployed command skill the install is NOT going to replace is still on disk afterwards — destroyed: kaola-workflow-finalize, workflow-init, workflow-next, install exited 0 (3 warning line(s) on stderr)
kimi-edition test FAILED: 2 failure(s), 607 passed.
```

**M2 `kimi-drop-per-name-removal`** — delete `:218` only; retired sweep untouched. Exit 1,
**3 failures / 606 passed**:

```
FAIL: P5d: after the install every deployed SKILL.md carries the SOURCE bytes, not the ones that were there before — stale: kaola-workflow-finalize, workflow-init, workflow-next, …
FAIL: P5d: no deployed skill dir holds a directory of its own name — that shape is `cp -R` onto an existing dir, i.e. the install stopped updating: kaola-workflow-finalize, workflow-init, workflow-next
FAIL: P5d: a file left inside a skill dir by an older release is gone — the copy REPLACES the dir rather than merging into it
```

**M3 `kimi-empty-retired-list`** — `RETIRED_ROLE_SKILLS=()`, i.e. the bare prune-narrowing.
Exit 1, **1 failure / 608 passed**:

```
FAIL: P5c: a skill dir retired in an earlier release is SWEPT from a live install — still on disk: kaola-role-contractor, kaola-role-workflow-planner, kaola-workflow-adapt, kaola-workflow-plan-run
```

### `install-opencode.sh`

**M4 `opencode-restore-namespace-prune`** — pre-#973 glob loop back, verbatim. Exit 1,
**1 failure / 642 passed**:

```
FAIL: P7a (#973): a deployed command the install is NOT going to replace is still on disk afterwards — destroyed: kaola-workflow-finalize, workflow-init, workflow-next, install exited 0
```

**M5 `opencode-empty-retired-list`** — exit 1, **1 failure / 642 passed**:

```
FAIL: P7b: a command retired in an earlier release is SWEPT from a live install — still on disk: kaola-workflow-adapt.md, kaola-workflow-plan-run.md
```

### `install.sh`

**M6 `installsh-restore-namespace-prune`** — pre-#973 glob loop back, verbatim. Exit 1:

```
AssertionError [ERR_ASSERTION]: #973: a deployed command the install is NOT going to replace is still on disk afterwards. Per forge (removed / exit): github → kaola-workflow-finalize.md workflow-init.md workflow-next.md / exit 1  |  gitlab → kaola-workflow-finalize.md workflow-init.md workflow-next.md / exit 0  |  gitea → kaola-workflow-finalize.md workflow-init.md workflow-next.md / exit 0
```

**M7 `installsh-empty-retired-list`** — exit 1:

```
AssertionError [ERR_ASSERTION]: #973: a command retired in an earlier release is SWEPT from a live install — still on disk: workflow-goal.md, workflow-next-pr.md, kaola-workflow-adapt.md
```

### Does a control share the code's own assumption?

I checked for this specifically, and the answer is no, for a reason stronger than the mutations
themselves. M1/M4/M6 do not *simulate* the defect — they restore the deleted code verbatim, and the
resulting red text independently reproduces the premise agent's hand-measured legs from a different
session and a different harness: kimi 17→3 at exit 0, kimi 17→14 at exit 0 with 3 stderr warnings,
opencode 3→0 at exit 0, and install.sh github exit 1 / gitlab exit 0 / gitea exit 0. Two independent
measurements agreeing on the exit codes and the per-forge asymmetry is not something a shared
assumption produces. M2/M3/M5/M7 are surgical single-construct deletions whose failures name exactly
the planted fixtures, and the suites carry their own anti-vacuity assertions (no planted name is in
the deploy set, in both directions), so a green there cannot be vacuous either.

Every mutation was `bash -n`-clean before running, so none of the reds is a syntax error wearing a
defect's name.

---

## 7. Three gaps the premise and tests left open — now measured

Independent hermetic runs (throwaway `HOME`/`KIMI_CODE_HOME`/`--target`, from the mirror), planting
the deploy set + retired names + user content into the destination first:

- **`install-kimi.sh --global`** (premise "Open" item 1; every existing probe is `--target`).
  Exit 0. All six planted retired names swept, **including `kaola-workflow-fast` and
  `kaola-workflow-phase3`** — the newly-added entries, exercised for the first time. `my-own-skill`,
  `kaola-something-else`, `workflow-goal` and the non-directory `kaola-role-notadir.md` all survive
  byte-intact. `workflow-init/SKILL.md` now begins `---`, i.e. source bytes, not the planted ones.
- **`install-kimi.sh --forge=gitlab --global`** (premise "Open" item 2). Exit 0, same outcome —
  `kaola-workflow-adapt` and `kaola-role-contractor` swept, `my-own-skill` intact.
- **`install-opencode.sh --forge=gitea --target`**. Exit 0 — `kaola-workflow-plan-run.md` swept,
  `my-own-command.md` intact, `workflow-init.md` updated to source bytes.

The forge axis and the global scope behave identically to the pinned github/`--target` legs, as the
shared `copy_skills`/`copy_tree` body predicts. Both premise "Open" items are closed.

---

## 8. The tree-root observation — checked; it does **not** weaken any #973 probe

`[tree root: /Users/ylpromax5/Workspace/Kaola-Workflow, not this checkout]` is real and is exactly
what the brief describes, but it separates the *source tree* from the *installer*, and only the
installer is what #973 changed.

- `REPO = sync.REPO = path.resolve(__dirname, '..')` → the **worktree**.
  `INSTALLER = path.join(REPO, 'install-kimi.sh')` (`test-kimi-edition.js:912`, `:1632`; opencode
  `:1235` et al.; `test-install-upgrade-rewrite.js:34` `root`). So every probe spawns the
  **worktree's changed installer**. That is the thing under test, and it is not read from main.
- `TREE_ROOT` is computed independently via `git rev-parse --git-common-dir`
  (`test-kimi-edition.js:63-75`) → main. The installer, run from the worktree, independently resolves
  the same root via `--print-tree-root`, so both agree: the *generated source tree* is main's.
  **#973's diff touches no generated tree and no canonical source**, so main's tree is the correct
  input either way, and P5d / P7c comparing deployed bytes to `TREE_ROOT/.kimi|.opencode/...` compare
  against the very tree the installer just read — consistent, not circular.
- P5a, P5b, P7a and the `install.sh` empty-source block are the cases that need a *mutated* source,
  and they sidestep the split entirely: each builds a throwaway copy of the checkout with `.git`
  omitted and **throws** unless `--print-tree-root` realpath-equals the copy. So the mutation
  provably reaches the tree the installer deploys from.

One real consequence, pre-existing and #969's, not #973's, worth the orchestrator knowing: running
the edition suites **from a worktree writes into main's `.kimi*`/`.opencode*` trees** if they are
stale, because the installer's `--check || --write` refresh targets `TREE_ROOT`. In this run that
was benign — all six trees report in parity with canonical, and main's `git status` shows no tracked
modification — but it is why the fixtures' `.git` omission is load-bearing rather than tidiness.

---

## 9. Verification — commands and real exit codes

Exit codes captured directly, never through a pipe. Serial throughout; no suite was parallelized.
All of these were re-run **after** my `install-opencode.sh` repair, so the table reflects the final tree.

| command | exit | result |
|---|---|---|
| `bash -n install.sh uninstall.sh install-all.sh` | **0** | (the claude chain's exact check) |
| `bash -n install-kimi.sh install-opencode.sh` | **0** | |
| `/bin/bash -n install.sh install-kimi.sh install-opencode.sh` | **0** | parses under bash 3.2 as well |
| `node scripts/test-kimi-edition.js` | **0** | `kimi-edition test passed (609 assertions)`, 3 trees in parity |
| `node scripts/test-opencode-edition.js` | **0** | `opencode-edition test passed (643 assertions)`, 3 trees in parity |
| `node scripts/test-install-upgrade-rewrite.js` | **0** | `Install upgrade rewrite tests passed` |
| `node scripts/test-install-all.js` | **0** | `install-all contract test passed (254 assertions)` |
| `node scripts/test-install-manifest-single-source.js` | **0** | `PASSED` |
| `node scripts/test-uninstall-forge-branches.js` | **0** | `Uninstall forge-branch tests passed` |
| `node scripts/test-install-adaptive-config.js` | **0** | `Install adaptive-config tests passed` |
| `node scripts/simulate-workflow-walkthrough.js` | **0** | **full scope**: `{"index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}` |

**Before** (inherited diff in place, my repair not yet applied): identical — kimi 0/609,
opencode 0/643, upgrade-rewrite 0, walkthrough 0 at 210/210. The inherited work was already green;
my repair was a comment, and it moved no number. **That is the point of §6** — green was never the
evidence here.

Both edition suites were run **by name**. They are in `test:kaola-workflow:editions` only, in no
chain and not in the fast gate; P5a/P5b/P7a gate nothing. `test-install-upgrade-rewrite.js` **is** in
the claude chain, so the `install.sh` half of this does owe a chain run at finalize.

---

## 10. Safety and cleanliness

Every install spawned in this session used a throwaway `HOME` / `KIMI_CODE_HOME` / `--target` under
the scratchpad or `os.tmpdir()`. Re-verified at the end:

```
~/.kimi-code/skills        = 17
~/.claude/commands         = 3
~/.claude/agents           = 14
~/.config/opencode/command = 3
```

- **Worktree** `git status --short --untracked-files=all`: my three files modified; everything else
  is the other agents' in-flight work (`kaola-workflow-gap-sweep.js`, `kaola-workflow-validation-runner.js`
  and their six plugin copies, four test files, `package.json`, `ROADMAP.md`, three untracked
  `.roadmap/issue-97*.md`, untracked `scripts/test-fixture-sandbox.js`). I touched none of them.
- **Main** `git status --short --untracked-files=all`: no tracked modification; only the untracked
  run records under `kaola-workflow/bundle-973-974-975/`.
- My write set (`git diff --numstat`): `install-kimi.sh` +44/−17, `install-opencode.sh` +41/−21,
  `install.sh` +24/−7 — 109 insertions, 45 deletions across the three. Of that, **my own edit is the
  27 lines at `install-opencode.sh:48-63`**; the rest is the inherited work, audited and kept.
- I made exactly one file edit this session. The four modified test files in the worktree are the
  test author's; `scripts/test-kimi-edition.js`, `scripts/test-opencode-edition.js` and
  `scripts/test-install-upgrade-rewrite.js` were read and run, never written.

---

## 11. Unreached, and findings for the orchestrator to route

**Two live doc paragraphs are now factually wrong. They are outside my write set — I did not edit
them.** Both describe the mechanism this issue removed:

- `docs/kimi-edition.md:150-151` — *"`copy_skills` is **self-healing**: before re-copying it prunes
  every kaola-owned skill dir not in that set, so a reinstall converges to exactly the workflow
  skill set on disk."*
- `docs/opencode-edition.md:147-148` — *"`copy_tree` is **self-healing**: before re-copying it prunes
  every kaola-owned command file not in that set, so a reinstall converges to exactly the workflow
  command set on disk."*

Correct wording for both: the installer removes the names it retired plus each name it is about to
write, immediately before writing it; a deployed skill/command it has nothing to put back is left
alone. Route to whoever owns docs this bundle.

**Deliberately not done, with reasons:**

1. **`install-opencode.sh`'s uninstall does not consult `RETIRED_WORKFLOW_COMMANDS`.** It removes
   commands by source-tree name (`uninstall_edition`, the `"$SOURCE_TREE/command/"*.md` loop), so a
   retired command survives an opencode uninstall. `install-kimi.sh` *does* handle this
   (`:419-425`). The list now exists on the opencode side, so wiring it in is three lines — but it
   is an uninstall behaviour change, nothing pins it, and it is outside #973's result. **Flagged,
   not built.**
2. **`install.sh` still strands `claude-workflow.md` and `claude-workflow-phase1..6.md`** (§4). The
   pre-#973 glob did not match them either, so this is not a regression — it is a pre-existing hole
   the audit surfaced. Adding the 7 names to `RETIRED_COMMANDS` would close it. **Not my call to
   widen the list unasked.**
3. **`install-opencode.sh` still has no zero-count guard over commands** (kimi and install.sh both
   do). The tests deliberately pin no exit code, and after this fix a zero-render leaves the
   deployed commands alone rather than destroying them — which is the right outcome — so the guard
   would only add a message. **Left alone.**
4. **The `set -e` mid-loop `cp -R` failure route** (premise §4, tests §"deliberately not pinned" 3)
   is not closed, and cannot be reliably fixtured. It *is* strictly improved: the removals now
   happen one name at a time, so a `cp` failure at name *k* loses that one name instead of all
   names, where the blanket prune lost everything from *k* onward. **Improved, not closed.**
5. **Nothing detects a forgotten retirement** (§3). No mechanism proposed; recorded, not built.

---

## CHANGELOG raw material (do not paste as-is; the orchestrator owns the entry)

- **`install.sh`, `install-kimi.sh` and `install-opencode.sh` no longer delete a deployed skill or
  command they are not going to replace.** All three used to prune the whole `kaola-workflow-*` /
  `kaola-role-*` / `workflow-*` namespace before re-copying, so any source tree that rendered fewer
  surfaces than the destination held destroyed the difference — silently, at exit 0, under an
  "Installed" message (kimi 17 skills → 3; opencode 3 commands → 0; `install.sh --forge=gitlab`
  emptying `~/.claude/commands` under "skeleton installed").
- Each installer now removes exactly two things: the names it **retired on purpose**
  (`RETIRED_ROLE_SKILLS` / `RETIRED_WORKFLOW_COMMANDS` / `RETIRED_COMMANDS`, each verified complete
  against the edition's full shipping history), and each name it is **about to write**, immediately
  before writing it. A deployed surface that is neither is left alone. Retiring a skill or command
  from now on means adding its name to the relevant list.
- The per-name removal is not deferrable: `cp -R src dest` onto an existing directory copies *into*
  it, leaving the live `SKILL.md` stale and the new bytes at `dest/X/X/SKILL.md`.
- `install-kimi.sh` now says which of the two zero-deploy cases it hit — sources absent, versus
  sources present and all rejected by the deploy allowlist.
