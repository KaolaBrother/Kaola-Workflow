# Premise check — issue #973 (install-kimi.sh prunes before it can deploy)

## Setup

- Commit measured: `69264936` (`HEAD`, branch `main`), tree clean apart from the untracked
  `kaola-workflow/bundle-973-974-975/`.
- Platform: darwin 25.6.0, node v24.14.0, bash. A `kimi` binary IS on PATH
  (`/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/kimi`), so `kimi doctor config` ran in
  every install below and passed.
- All installs ran hermetically with `HOME` and `KIMI_CODE_HOME` overridden into the session
  scratchpad and `--target` pointed at a scratch dir. **The real `$HOME` was never written**;
  proven by a before/after diff of `~/.kimi-code/skills` (17 skills, identical) and of
  `~/.kimi-code/config.toml` (mtime+size identical). `git status --porcelain` at the end shows only
  the untracked bundle dir — no tracked file was touched.
- Source trees used (all under the scratchpad):
  - `src/` — `git clone --local` of the repo at `69264936` (the good tree).
  - `src-bad*/` — `git archive HEAD | tar -x` working-tree copies (the "unpacked source tree"
    posture `sync-kimi-edition.js:69-75` explicitly names), then mutated.

Green baseline for the edition suite before anything else:

```
$ node scripts/test-kimi-edition.js
kimi-edition test passed (589 assertions). [drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)]
EXIT=0   (9.8s)
```

---

## 1. The ordering claim — **SURVIVES**

**Claim:** `copy_skills` removes the deployed skill directories before it copies the new ones.

Confirmed verbatim. `install-kimi.sh:181-186` is the removal; `install-kimi.sh:187-199` is the copy;
the zero-deploy guard is at `install-kimi.sh:200-206`, i.e. **after both**.

```bash
181	  local stale
182	  for stale in "$skills_dest/"kaola-workflow-* "$skills_dest/"kaola-role-* \
183	               "$skills_dest/workflow-init" "$skills_dest/workflow-next"; do
184	    [[ -d "$stale" ]] || continue
185	    rm -rf "$stale"
186	  done
187	  local src_dir base skill_count=0
188	  for src_dir in "$SOURCE_TREE/skills/"*/; do
189	    [[ -d "$src_dir" ]] || continue
190	    base="$(basename "$src_dir")"
191	    if ! in_array "$base" "${WORKFLOW_COMMANDS[@]}"; then
192	      case "$base" in
193	        kaola-role-*) : ;;   # role skills: always
194	        *) echo "warning: skipping unrecognized skill not in the workflow command / role set: $base" >&2; continue ;;
195	      esac
196	    fi
197	    cp -R "${src_dir%/}" "$skills_dest/$base"
198	    skill_count=$((skill_count + 1))
199	  done
...
203	  if [[ "$skill_count" -eq 0 ]]; then
204	    echo "Install error: no skill sources found in $SOURCE_TREE/skills" >&2
205	    exit 1
206	  fi
```

**Exact removal predicate**, measured with a positive control (planted 7 dirs + 1 file into a
populated dest, then reinstalled from the good tree, exit 0):

| planted | outcome | why |
|---|---|---|
| `kaola-role-contractor` | **REMOVED** | matches `kaola-role-*` |
| `kaola-role-workflow-planner` | **REMOVED** | matches `kaola-role-*` |
| `kaola-workflow-adapt` | **REMOVED** | matches `kaola-workflow-*` |
| `kaola-workflow-plan-run` | **REMOVED** | matches `kaola-workflow-*` |
| `workflow-goal` | **KEPT** | not in the four glob/literal terms |
| `kaola-something-else` | **KEPT** | matches neither `kaola-role-*` nor `kaola-workflow-*` |
| `my-own-skill` | **KEPT** | outside the namespace |
| `kaola-role-notadir.md` (a *file*) | **KEPT** | `[[ -d "$stale" ]] \|\| continue` — dirs only |

So the predicate is: **directories only**, matching `kaola-workflow-*`, `kaola-role-*`, or the two
literals `workflow-init` / `workflow-next`. Everything else in the skills dir survives, including
user-authored skills and any non-directory entry.

Note the `workflow-goal` "KEPT" row is *not* a live gap: `install.sh:179` prunes
`workflow-goal.md` / `workflow-next-pr.md`, but `git ls-tree f6dbf40d --name-only commands/`
(the commit that added the kimi edition) shows no `workflow-goal.md`, and `git log -S'workflow-goal'
-- commands/` returns nothing. The kimi prune list is **complete for every skill name the kimi
edition has ever shipped** — `kaola-workflow-*` covers the retired `kaola-workflow-fast`,
`-phase[1-5]`, `-adapt`, `-plan-run`.

---

## 2. Reproducing the 17→0 loss — **SURVIVES (reproduced at HEAD)**

Baseline install, good tree:

```
$ env HOME=$SP/home1 KIMI_CODE_HOME=$SP/kh1 bash $SP/src/install-kimi.sh --target $SP/dest1 --yes
Installed workflow skills → .../dest1/.kimi-code/skills/
EXIT=0
$ ls -1 $SP/dest1/.kimi-code/skills | wc -l
17          # 14 kaola-role-* + kaola-workflow-finalize + workflow-init + workflow-next
```

I ran four legs against pre-populated 17-skill targets. **Two of them destroy deployed skills at
HEAD, and one of those is silent.**

| leg | source-tree mutation | before | after | exit | reported as |
|---|---|---|---|---|---|
| **B** | canonical `agents/*.md` deleted (dir kept, empty) | 17 | **3** | **0** | `Installed workflow skills →` (success) |
| **C** | canonical `commands/*.md` deleted | 17 | **17** | 1 | node ENOENT stack trace — **no loss** |
| **D** | `agents/` emptied **+** all 3 commands renamed out of the allowlist | 17 | **0** | 1 | `Install error: no skill sources found in …` |
| **E** | all 3 commands renamed out of the allowlist (roles intact) | 17 | **14** | **0** | `Installed workflow agents+…` (success) |

Leg D is the issue's 17→0, verbatim:

```
$ env HOME=$SP/home4 KIMI_CODE_HOME=$SP/kh4 bash $SP/src/install-kimi.sh --target $SP/dest4 --yes
EXIT=0  SKILLS_BEFORE=17
$ env HOME=$SP/home4 KIMI_CODE_HOME=$SP/kh4 bash $SP/src-bad3/install-kimi.sh --target $SP/dest4 --yes
Kaola-Workflow · kimi edition (github) — refreshing generated tree...
Deploying into project (github) → .../dest4
warning: skipping unrecognized skill not in the workflow command / role set: zz-kaola-workflow-finalize
warning: skipping unrecognized skill not in the workflow command / role set: zz-workflow-init
warning: skipping unrecognized skill not in the workflow command / role set: zz-workflow-next
Install error: no skill sources found in .../src-bad3/.kimi/skills
EXIT_D=1
$ ls -1A $SP/dest4/.kimi-code/skills | wc -l
0
```

Leg B is the one the issue does not have, and it is **worse than the loss it filed**:

```
$ rm -f $SP/src-bad/agents/*.md
$ env HOME=$SP/home2 KIMI_CODE_HOME=$SP/kh2 bash $SP/src-bad/install-kimi.sh --target $SP/dest2 --yes
Kaola-Workflow · kimi edition (github) — refreshing generated tree...
Deploying into project (github) → .../dest2
Installed workflow skills → .../dest2/.kimi-code/skills/
Installed support scripts → ...
Validated merged config via 'kimi doctor config'.
Merged kaola-workflow hooks → ...
EXIT_B=0
$ ls -1 $SP/dest2/.kimi-code/skills
kaola-workflow-finalize
workflow-init
workflow-next          # 17 → 3: all 14 role skills destroyed
```

**Exit 0, no warning, "Installed workflow skills" printed.** The `skill_count -eq 0` guard cannot
see this because 3 > 0. Same shape in leg E (17→14, exit 0, only three `warning:` lines on stderr).

Mutation-control note: leg C proves the fixture is not vacuous — a *different* corruption of the
same source tree leaves the destination at 17, so the losses in B/D/E are caused by what I changed,
not by the harness.

---

## 3. What the blanket-remove is load-bearing for — **SURVIVES, and the issue understates it**

**Claim:** it is a self-healing sweep that clears retired skill directories no manifest lists any more.

True, and directly attested in history. `git log -S'kaola-role-contractor' -- install-kimi.sh`
returns exactly one commit, `63443589` ("retire the contractor role…"), whose own message says:

> D5 Stale-install sweep. … `install-kimi.sh` gains `RETIRED_ROLE_SKILLS` for its uninstall path
> (**its install prune is already namespace-wide**, as is opencode's manifest-driven sweep).

So the four names at `install-kimi.sh:147` (`kaola-role-contractor`, `kaola-role-workflow-planner`,
`kaola-workflow-adapt`, `kaola-workflow-plan-run`) are removed from a user's deployed skills dir by
the blanket prune and by **nothing else on the install path** — `RETIRED_ROLE_SKILLS` itself is read
only by `uninstall_edition` (`install-kimi.sh:394-398`), and the generator's `pruneSkills`
(`sync-kimi-edition.js:763`) converges the *generated tree*, never the deployed destination. My
positive control in §1 confirms all four are removed on install and that removal is the prune's
doing.

**But there is a second, larger duty the issue does not name: the prune is what makes the copy an
UPDATE.** `install-kimi.sh:197` is `cp -R "${src_dir%/}" "$skills_dest/$base"`, and BSD/POSIX
`cp -R src dest` where `dest` already exists copies *into* it. Measured:

```
$ mkdir -p src/kaola-role-planner dest/kaola-role-planner
$ echo new > src/kaola-role-planner/SKILL.md ; echo old > dest/kaola-role-planner/SKILL.md
$ cp -R src/kaola-role-planner dest/kaola-role-planner
$ find dest
DEST/kaola-role-planner
DEST/kaola-role-planner/SKILL.md                        <- still "old"
DEST/kaola-role-planner/kaola-role-planner/SKILL.md     <- the new one, nested
$ cat dest/kaola-role-planner/SKILL.md
old
```

So if the remove were simply deleted, every reinstall would (a) nest one directory deeper and
(b) **never update the live `SKILL.md`** — the stale skill would be immortal and the runtime would
keep reading it. That is a far more concrete stale state than the retired-directory case, and it
constrains the fix: the prune of a given name must still happen **before the `cp -R` of that name**.

---

## 4. Is the path still reachable? — **QUALIFIED; the issue's mechanism claim is REFUTED, its conclusion is too weak**

**Claim:** "#969's tree-root fix … the heal-or-abort now precedes the copy — the installer fails
before reaching a state where it would deploy zero."

**The mechanism is wrong.** `git show 9b6fac01 -- install-kimi.sh` shows #969 changed two things,
and neither is a newly-added heal-or-abort before the copy:

```
-SOURCE_TREE="$SCRIPT_DIR/.kimi$FORGE_SUFFIX"
+if ! TREE_ROOT="$(node "$SCRIPT_DIR/scripts/sync-kimi-edition.js" --print-tree-root)"; then …
+SOURCE_TREE="$TREE_ROOT/.kimi$FORGE_SUFFIX"
...
+  if [[ "$skill_count" -eq 0 ]]; then
+    echo "Install error: no skill sources found in $SOURCE_TREE/skills" >&2
```

The check-or-write refresh (`install-kimi.sh:133-137`) is **byte-identical at `9b6fac01^` and at
HEAD** and dates to `f6dbf40d`, the original kimi-edition commit. What #969 actually did is repoint
`SOURCE_TREE` at the same tree the pre-existing refresh heals, and add a **post-copy** guard at
line 203. The `skill_count` guard does not precede the copy; it follows both the prune and the copy.

**Does the refresh dominate every route into `copy_skills`?** Structurally yes — `copy_skills` is
called once, at `install-kimi.sh:471`; `--uninstall` exits at 457 and `--regenerate` at 141, both
before it; the refresh at 133-137 is unconditional for every non-uninstall run and `set -euo
pipefail` makes a failing `--write` (the right-hand side of the `||`, so it *is* checked) abort.
Measured, leg C: deleting the canonical command sources makes `writeCommands` throw ENOENT, the
installer exits 1 during "refreshing generated tree…", and the destination stays at 17.

**But domination is not sufficiency. The refresh only heals the TREE; it cannot heal CANONICAL, and
it cannot see the installer's own deploy allowlist.** Two surviving routes, both measured:

- **Route B (silent, exit 0) — canonical renders fewer skills than are deployed.**
  `listCanonAgents()` is `fs.readdirSync(CANON_AGENTS_DIR)` (`sync-kimi-edition.js:133-138`): an
  *empty* `agents/` returns `[]` with no throw, so `--write` succeeds, `pruneSkills` legitimately
  removes the 14 role dirs from the tree, and the install prunes 14 role dirs from the destination
  and restores none. 17→3, exit 0, success message. (A *missing* `agents/` dir throws and aborts —
  empty and missing behave oppositely.)
- **Route D/E — the tree is healthy and `--check` is green, but the deploy allowlist rejects the
  rendered skills.** `WORKFLOW_COMMANDS` (`install-kimi.sh:152-154`) is a hand-maintained list that
  no generator feeds; a command basename renamed in `TOPICS`
  (`generate-routing-surfaces.js:80-99`) renders a perfectly valid skill the installer then skips
  at line 194 — after the prune already removed the deployed one. 17→14 silently (E), or 17→0 with
  exit 1 (D) once roles are gone too.

**Highest-value fact for the implementer:** the guard the issue credits fires only on
`skill_count == 0`. Every partial-deploy case — the common one, and the silent one — walks straight
past it. A fix scoped to "an install that cannot deploy *anything*" would leave routes B and E
exactly where they are. The result the issue specifies should arguably read: *an install does not
remove a deployed skill it is not going to replace.*

Two further reachability notes:

- `set -e` also means a `cp -R` failing mid-loop (line 197) aborts the script with the prune already
  done and the copy partially applied — a partial-loss route with no guard at all.
- The diagnostic at line 204 is wrong in route D: it says "no skill sources found in
  `$SOURCE_TREE/skills`" when the sources are present and were all rejected by the allowlist.

---

## 5. Siblings — **the same shape is in both siblings, and `install-opencode.sh` is worse**

`git grep -n -P 'rm -rf' -- install*.sh` plus a read of each deploy path:

### `install-opencode.sh` — same defect, **no zero-guard at all**

Prune at `install-opencode.sh:317-323`, copy at `325-333`, and there is **no command count check**.
The agent deploy does fail closed at zero (`303-309`) but that happens *before* the command prune,
so it does not protect commands. Measured with the same leg-E mutation:

```
$ env HOME=$SP/home6 bash $SP/src/install-opencode.sh --target $SP/oc-dest --yes
EXIT=0 ; commands before: 3   (kaola-workflow-finalize.md workflow-init.md workflow-next.md)
$ env HOME=$SP/home6 bash $SP/src-bad4/install-opencode.sh --target $SP/oc-dest --yes
warning: skipping unrecognized command not in the workflow command set: zz-kaola-workflow-finalize.md
warning: skipping unrecognized command not in the workflow command set: zz-workflow-init.md
warning: skipping unrecognized command not in the workflow command set: zz-workflow-next.md
Installed workflow agents+commands+plugin+hooks → .../oc-dest/.opencode/
EXIT_G=0
$ ls -1A $SP/oc-dest/.opencode/command | wc -l
0
```

**3 → 0 commands, exit 0, reported as a successful install.** kimi at least exits 1 at total zero;
opencode does not. Agents were unaffected (15 before, 15 after).

### `install.sh` — same shape; **silent total loss on the gitlab/gitea branch**

Prune at `install.sh:175-186` (unconditional, ~420 lines before the copy), copy at `607-617`,
zero-check at `619-626`. The github branch exits 1 (loud, after the prune). The **gitlab/gitea
branch prints a friendly message and continues with exit 0**:

```
619	if [[ "$installed" -eq 0 ]]; then
620	  if [[ "$FORGE" = "gitlab" || "$FORGE" = "gitea" ]]; then
621	    echo "${FORGE^} edition skeleton: no command files found yet in $SOURCE_COMMANDS_DIR."
```

Measured (hermetic `HOME`, github install first, then a gitlab tree with an empty commands dir):

```
$ env HOME=$SP/home7 bash $SP/src/install.sh --yes            # commands before: 3
$ rm -f $SP/src-bad5/plugins/kaola-workflow-gitlab/commands/*.md
$ env HOME=$SP/home7 bash $SP/src-bad5/install.sh --forge=gitlab --yes
Removed stale command: .../home7/.claude/commands/kaola-workflow-finalize.md
Removed stale command: .../home7/.claude/commands/workflow-init.md
Removed stale command: .../home7/.claude/commands/workflow-next.md
Gitlab edition skeleton: no command files found yet in .../plugins/kaola-workflow-gitlab/commands.
Gitlab edition skeleton installed; runtime commands arrive in follow-up issues.
EXIT_H=0
$ ls -1A $SP/home7/.claude/commands | wc -l
0
```

`$COMMANDS_DIR` is `$HOME/.claude/commands` regardless of forge (`install.sh:35`), so a user with a
working github install who runs `--forge=gitlab` against such a tree is left with **zero commands and
a success message**. `install.sh` copies every `*.md` with no allowlist, so it has no route-E
analogue — its only exposure is the empty-source one.

`install-all.sh` has no deploy of its own (its single `rm -rf` at line 323 is a flag-dir cleanup);
it only sequences the four installers, so it inherits whatever they do.

---

## 6. The four candidate mechanisms — cost and obstacles (implementer's call, not mine)

**Does the script already have a temp-dir idiom?** Yes, in this very file.
`merge_hooks_config` (`install-kimi.sh:289-297, 318-330`) does exactly backup-then-restore-on-failure:

```bash
289	  local home cfg fragment backup=""
...
294	  if [[ -f "$cfg" ]]; then
295	    backup="$(mktemp -t kaola-kimi-hooks)"
296	    cp "$cfg" "$backup"
297	  fi
...
320	    if ! doctor_out="$(kimi doctor config "$cfg" 2>&1)"; then
321	      if [[ -n "$backup" ]]; then cp "$backup" "$cfg"; else rm -f "$cfg"; fi
```

`install.sh:24-25` also uses `mktemp -d` with a `trap … EXIT`. So neither `mktemp` nor a restore
path would be a new idiom here.

**Is the deploy set computable before the copy loop?** Yes. The loop body at 188-199 is a pure
filter — `basename`, `in_array` against `WORKFLOW_COMMANDS`, and a `kaola-role-*` case — with no
dependency on the prune having run and no state carried between iterations. A first pass that
collects `base` names into an array and only then prunes+copies is ~6 lines and nothing blocks it.

| candidate | cost | obstacle measured |
|---|---|---|
| **compute the deploy set before pruning** | lowest: one extra pass over the same glob, no new idiom | none for the *set*; but it only fixes total-zero unless the prune is then narrowed too — the prune is namespace-wide while the deploy set is not, so a naive "compute then prune-all" still loses routes B/E |
| **prune only what the new set replaces** | small | **drops the retired sweep** — measured in §1/§3: `kaola-role-contractor`, `kaola-role-workflow-planner`, `kaola-workflow-adapt`, `kaola-workflow-plan-run` survive if the prune is narrowed to the deploy set. `RETIRED_ROLE_SKILLS` already exists at line 147 but is read only by uninstall; wiring it into the install path would restore the sweep at the cost of making retired names a maintained list again (the comment at 144-146 says the namespace prune is precisely what let that list stay uninstall-only) |
| **stage into a temp dir and swap** | medium; the idiom exists | **a blind directory swap destroys user content.** Measured in §1: `my-own-skill`, `kaola-something-else` and `kaola-role-notadir.md` live in the same dest and survive today. The swap must merge into the existing dir, not replace it — which reduces it to per-name replacement plus the retired sweep |
| **backup-then-restore-on-failure** (not named in the issue) | medium; mirrors `merge_hooks_config` exactly | only covers the abort path; leg B and leg E exit **0**, so nothing would trigger a restore. Would fix D, not B/E |

Whatever is chosen, §3's `cp -R`-onto-an-existing-dir measurement is a hard constraint: the removal
of a name must not be deferred past the copy of that name, or reinstalls nest and stop updating.

---

## 7. Test surface

- **`scripts/test-kimi-edition.js`** (2004 lines) is the kimi suite. It is run by
  `npm run test:kaola-workflow:editions` → `node scripts/test-opencode-edition.js && node
  scripts/test-kimi-edition.js`. Confirmed absent from `npm test` and from all four chain scripts.
  Green at HEAD: 589 assertions, exit 0, ~10s.
- The install probes are the **P-series**, `scripts/test-kimi-edition.js:907-1180`. They spawn the
  **real** `install-kimi.sh` with per-case temp `HOME` / `KIMI_CODE_HOME` / `--target`
  (`runInstaller`, lines 929-949).
- **Does anything assert on the skill count?** Yes, but only the happy path:
  - `P1 (exact-set)` at line 983 → `expectDeployed` (960-965) asserts the deployed set is exactly
    `ADAPTIVE_CORE` + `roleDirNames`.
  - `P4` at line 1095 asserts a second install leaves `deployedSkills` unchanged — but both installs
    are from a good tree, so it cannot see any of routes B/D/E.
- **Nothing anywhere asserts the zero-deploy guard.** `git grep -n -P 'no skill sources|no agent
  sources' -- scripts/ plugins/` returns **zero hits** repo-wide. The `skill_count -eq 0` branch
  #969 added at line 203 is untested.
- **Nothing asserts the install-time prune of the DESTINATION.** The retired-directory tests
  (`K10-prune` at 1185-1210, `K12` at 1490-1501) all operate on the generated **tree** via
  `sync --check/--write`, not on a deployed skills dir.
- **The pattern to mirror is `P1b`, `scripts/test-kimi-edition.js:1031-1076`**: it plants a retired
  artifact, a user `.js`, and a user non-`.js` into the destination *before* the install, then
  asserts exactly what survives — including an explicit anti-vacuity assertion (1055-1058) that the
  planted names are not in the manifest. That is the same fixture shape a skills-dir version needs.
- `scripts/test-install-all.js` references `install-kimi.sh` only as a **stub** (line 346,
  `writeStub(root, 'install-kimi.sh', …)`); it never runs the real installer, so it is not a
  coverage site for this.
- If the fix touches `install-opencode.sh` (see §5), its suite is `scripts/test-opencode-edition.js`,
  same runner.

---

## Facts the issue did not have

1. **The silent partial loss is the bigger defect, and it is not the one filed.** Leg B: 17→3,
   **exit 0**, `Installed workflow skills →` printed, no warning. Leg E: 17→14, exit 0. The issue's
   17→0 case at least exits 1. A fix scoped to "an install that deploys *nothing*" leaves both.
2. **#969 did not add a heal-or-abort before the copy.** The check-or-write refresh predates it
   (`f6dbf40d`) and is byte-identical at `9b6fac01^`. What #969 added is a **post-copy**
   `skill_count -eq 0` guard (line 203) plus the `--print-tree-root` repoint. The issue's stated
   reason for near-unreachability is therefore wrong, though its conclusion — the tree-root
   divergence route is closed — holds.
3. **Empty and missing behave oppositely.** An empty `agents/` returns `[]` and the install proceeds
   to destroy 14 skills (exit 0); a *missing* `agents/` throws and aborts before `copy_skills`. Same
   for commands: deleted sources throw (leg C, dest intact at 17).
4. **The prune is load-bearing for correctness, not just hygiene.** `cp -R src dest` onto an
   existing dir nests (`dest/X/X/SKILL.md`) and leaves the old `SKILL.md` in place — measured. Remove
   or defer the prune and reinstalls stop updating skills entirely.
5. **`install-opencode.sh` carries the same defect with no guard whatsoever** — 3 commands → 0,
   **exit 0**, success message (§5). Strictly worse than the kimi case being filed.
6. **`install.sh` carries it too, and on gitlab/gitea it is silent** — `~/.claude/commands` emptied,
   exit 0, "skeleton installed" (§5).
7. **`WORKFLOW_COMMANDS` (`install-kimi.sh:152-154`) is a hand-maintained allowlist no generator
   feeds.** The `TOPICS` registry (`generate-routing-surfaces.js:80-99`) is the single source for
   every other consumer; a rename there renders a valid skill the installer silently skips *after*
   pruning the old one. `test-kimi-edition.js:923-927` (P0) pins canonical == `ADAPTIVE_CORE`, which
   catches the drift in the *suite* — but the suite is not in `npm test`, so it does not gate.
8. **The line-204 diagnostic is wrong in the reachable case:** "no skill sources found in
   `$SOURCE_TREE/skills`" is printed when the sources exist and were all rejected by the allowlist.
9. **The prune list is complete for kimi's actual history** — `kaola-workflow-*` covers every retired
   command skill the edition ever shipped (`kaola-workflow-fast`, `-phase[1-5]`, `-adapt`,
   `-plan-run`), and `workflow-goal` (which `install.sh:179` prunes) never existed as a kimi surface.
   So narrowing the prune loses exactly the four `RETIRED_ROLE_SKILLS` names, no more.
10. **`set -e` gives a fourth, unguarded route:** a `cp -R` failure mid-loop (line 197) aborts with
    the prune done and the copy partial.

## Open

- I did not measure the `--global` scope (`SKILLS_DEST=$KIMI_CODE_HOME/skills`, line 462); every leg
  used `--target`. The code path through `copy_skills` is identical — only the argument differs — so
  I expect the same behaviour, but I did not run it.
- I did not measure `--forge=gitlab` / `--forge=gitea` for `install-kimi.sh`; `SOURCE_TREE` and the
  refresh both derive their suffix from `runtime-edition-forge.js`, so they agree by construction,
  but the legs above are github-only.
- Routes B/D/E were reached by mutating the *source tree*. I did not establish how a user's source
  tree would come to be in those states in practice; the routes are demonstrably reachable at HEAD,
  but their real-world frequency is not something I measured.
