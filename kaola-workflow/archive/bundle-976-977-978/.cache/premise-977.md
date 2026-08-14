# Premise check — issue #977 (retired-name lists after #973)

Measured at worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`,
HEAD `51db5d2d49045e718083e45b1d04cfa985e503ea`, tree clean (only the bundle's own untracked
`.roadmap/issue-97{6,7,8}.md` + ROADMAP mirror). All experiments ran in a scratch clone at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad/p977-repro`
(same HEAD; edition trees generated with `sync-opencode-edition.js --write` / `sync-kimi-edition.js --write`;
installs targeted scratch HOME/OPENCODE_CONFIG_DIR/KIMI_CODE_HOME, never the real home). No tracked
file was modified anywhere; the one deliberate mutation (leg C) was made in the scratch clone and
reverted there.

## Verdict summary

| Claim | Verdict |
|---|---|
| P1: install.sh strands seven `claude-workflow*` names | **CONFIRMED** — behaviorally, with positive control |
| P1: pre-existing, not a #973 regression (old glob never matched) | **CONFIRMED** |
| P1: RETIRED_COMMANDS "is now the only mechanism that could clear them" | **REFUTED as stated** — `uninstall.sh:97-104` clears all seven (observed); true only if read as "only mechanism on the install/upgrade path" |
| P2: opencode uninstall ignores its own retired list; kimi handles it | **CONFIRMED** — measured live, and the residue class is wider than filed (hooks, support scripts) |
| P2: "nothing pins it" / wiring is an unpinned behaviour change | **CONFIRMED** |
| P3: U1 installs-before-uninstalls; retired residue structurally unobservable | **CONFIRMED — mutation-proven** (mutant missing the whole mechanism passes every U1 condition) |
| P3: "nothing can observe a retired residue on the uninstall path at all" | **PARTIALLY CONFIRMED** — true for retired commands/skills on both editions; false as an absolute: opencode R3 observes retired-AGENT residue on uninstall |
| P3: needs a NEW probe, "not a parameter on the existing one" | **PARTIALLY REFUTED** — a plant step inside the existing U1 block suffices (opencode R3 is the in-repo precedent); what is true: the plant must come AFTER the seed install, because the install itself sweeps retired names |
| Also-filed: kimi list complete at 11 (census over f6dbf40d..HEAD) | **CONFIRMED** by independent census |
| Fourth axis the issue missed | **FOUND, twice** — see "Beyond the three parts" |

## Current line numbers (moved from the filed text)

- `install.sh:184-190` — `RETIRED_COMMANDS=( "workflow-goal.md" "workflow-next-pr.md" "kaola-workflow-adapt.md" "kaola-workflow-auto.md" "kaola-workflow-fast.md" "kaola-workflow-phase1.md" … "kaola-workflow-phase6.md" "kaola-workflow-plan-run.md" )` — 12 names, no `claude-workflow*`. Sweep loop at 195-202. (Sibling mechanisms, not RETIRED_* arrays: allowlist support-script sweep 204-218; manifest-driven `sweep_retired_agents` 368-391.)
- `install-opencode.sh:190-194` — `RETIRED_WORKFLOW_COMMANDS=( kaola-workflow-adapt.md kaola-workflow-auto.md kaola-workflow-fast.md kaola-workflow-phase1.md … phase5.md kaola-workflow-plan-run.md )` — 9 names. Read ONLY by the install sweep at 337-341. `uninstall_edition` is 362-426; its command removal is line 397: `for f in "$SOURCE_TREE/command/"*.md; do … rm -f "$layout_root/command/$(basename "$f")"` — current source-tree names only.
- `install-kimi.sh:155-160` — `RETIRED_ROLE_SKILLS` (11 names). `uninstall_edition` 401-461; the retired-name loop the issue cites as 419-425 is actually **419-426** (comment 419-420, loop 421-426): `for retired in "${RETIRED_ROLE_SKILLS[@]}"; do … rm -rf "$skills_dest/$retired"; echo "Removed retired role skill: …"`. Install-path sweep in `copy_skills` 199-203.
- Probe U1: `scripts/test-kimi-edition.js:1369-1399` (line cite in the issue is right). opencode U1: `scripts/test-opencode-edition.js:1653-1687`. Plant-style install-path probes: kimi P5c `test-kimi-edition.js:1243-1301` (helper `plantSkillDirs` at 1151), opencode P7b `test-opencode-edition.js:1416-1453`. opencode agent probes R1–R3 `test-opencode-edition.js:1804-1894`.

## PART 1 — the seven stranded names

### Census transcript (the issue's prescribed method, not the installer's array)

```
$ git log --no-renames --diff-filter=D --name-only --format="COMMIT %h %ad" --date=short -- 'commands/'
COMMIT ea84673d 2026-07-31   kaola-workflow-adapt.md, kaola-workflow-plan-run.md
COMMIT 1146e3ac 2026-07-19   kaola-workflow-fast.md, kaola-workflow-phase1..5.md
COMMIT 87e6334c 2026-06-26   kaola-workflow-auto.md
COMMIT 9ec2b6c3 2026-06-08   kaola-workflow-phase6.md
COMMIT 2df925c4 2026-05-18   workflow-next-pr.md
COMMIT 7e19766d 2026-05-13   claude-workflow-phase1..6.md      ← rename to kaola-workflow-phaseN
COMMIT 12f16234 2026-05-10   claude-workflow.md                ← rename to workflow-next.md
```

Same census over every other command tree (`'*commands/*.md' ':!commands/'`, --all): only
`plugins/kaola-workflow-{gitlab,gitea}/commands/` deletions, all `kaola-workflow-*` names already in
the list. Deleted-ever set = 18 names; RETIRED_COMMANDS covers 11 of them plus `workflow-goal.md`
(positive-control cross-check: `git log --all -- commands/workflow-goal.md` is empty — never
deployed, matching the installer comment). **True stranded set = exactly 7**:
`claude-workflow.md`, `claude-workflow-phase{1..6}.md`. Not more, not fewer.

Era cross-check ("what that era's generator rendered"): that era had no generator — `commands/*.md`
were tracked files, and `12f16234^:install.sh` copies `$SCRIPT_DIR/commands` → `$HOME/.claude/commands`
(lines 5-8, 85-90) with **no stale-removal of any kind** (zero `rm` in the deploy path). Both
deleting commits are renames (`commands/{claude-workflow.md => workflow-next.md}` etc.), so a
pre-2026-05-13 user's disk keeps the old names. Real artifacts, real users possible.

### Old-glob claim

The prune block was born at `b2c71592` (2026-05-18) — after the renames — already as
`"kaola-workflow-*.md" "workflow-init.md" "workflow-next.md" "workflow-goal.md" "workflow-next-pr.md"`,
unchanged until #973 (`git log -S` shows only b2c71592 and e5d96397 touched it). It never matched
`claude-workflow*` at any point. **Pre-existing, not a #973 regression: confirmed.**

### Behavioral reproduction (with positive control)

Planted all 7 names + covered control `kaola-workflow-fast.md` in scratch `~/.claude/commands`, ran
`install.sh --forge=github --yes` (exit 0): control removed with a "Removed stale command" line, all
7 `claude-workflow*` files survived. Then `uninstall.sh --forge=github` (exit 0): **all 7 removed**
("Removed: …/claude-workflow.md" etc.) — `uninstall.sh:97-104` globs
`claude-workflow.md` / `"claude-workflow"*.md` explicitly. So "the only mechanism that could clear
them" is false as written; the accurate statement is: on the install/upgrade path, RETIRED_COMMANDS
is the only mechanism, and it omits them.

## PART 2 — opencode uninstall vs its own retired list

Side by side:

| | install path | uninstall path |
|---|---|---|
| kimi skills | sweeps `RETIRED_ROLE_SKILLS` (`copy_skills` 199-203, pinned by P5c) | sweeps `RETIRED_ROLE_SKILLS` (`install-kimi.sh:419-426`) |
| opencode commands | sweeps `RETIRED_WORKFLOW_COMMANDS` (337-341, pinned by P7b) | **source-tree names only (line 397); the list is never read** |
| opencode agents | manifest-union sweep (326, `sweep_retired_agents`) | manifest-union (387-395) — retired agents ARE removed, pinned by R3 |

Measured live (scratch install → plant → `--uninstall --yes`, exit 0): planted retired command
`kaola-workflow-fast.md` **survives** opencode uninstall while every current command/agent/plugin/
current-hook is removed. The same run showed the class is wider than filed: a planted retired hook
`kaola-workflow-pre-commit.sh` and retired support script `kaola-workflow-adaptive-node.js` also
survive. A subsequent reinstall heals the command and the support script (retired-list and
manifest-allowlist sweeps) but **not the hook** — see fourth axis.

"Nothing pins it": confirmed. opencode U1 (1653-1687) plants nothing retired before its uninstall;
R3 covers agents only; no test asserts a retired command either survives or is removed at uninstall,
so wiring the list in would change user-visible uninstall behaviour with no red anywhere — and would
also break no existing test.

### Blast radius of wiring it in (item 6)

Newly deleted, exactly and only these 9 basenames, when present in the scope-resolved command dir:

- global scope: `${OPENCODE_CONFIG_DIR:-~/.config/opencode}/command/` — `kaola-workflow-adapt.md`,
  `kaola-workflow-auto.md`, `kaola-workflow-fast.md`, `kaola-workflow-phase1.md` … `phase5.md`,
  `kaola-workflow-plan-run.md`
- project scope: `<target>/.opencode/command/` — same 9

Who has them: installs older than each name's retirement (auto ≤2026-06-26, fast/phase1-5
≤2026-07-19, adapt/plan-run ≤2026-07-31) never reinstalled since. Collateral risk: a user-authored
file at exactly one of those names in the reserved `kaola-workflow-*` namespace. Materially for the
approval decision: **every one of these 9 names is already deleted today by any install/reinstall**
(P7b-pinned sweep at 337-341) — the wiring extends *when* that deletion can happen (adds the
uninstall moment), not *what* can be deleted. kimi's shipped uninstall (419-426) is the in-repo
precedent for exactly this behaviour.

## PART 3 — U1 structurally blind, mutation-proven

Ordering claim confirmed by reading: U1 (`test-kimi-edition.js:1375-1399`) is
`runInstaller([])` → `--uninstall` with nothing planted in between; its assertions check only
fresh-deployed names (`ADAPTIVE_CORE ∪ roleDirNames`), dir-absence (1388-1393), hooks-block count,
shared config. `--uninstall` is spawned exactly once in the whole kimi suite (line 1380).

Mutation proof (scratch clone; installer mutant = `install-kimi.sh` with lines 419-426 deleted,
`bash -n` clean; reverted after):

| Leg | Code | Plant | Result |
|---|---|---|---|
| A | unmutated | none (U1-faithful) | uninstall exit 0; skills dir, `.kimi-code`, kimi-home `kaola-workflow` all gone — baseline |
| B | unmutated | `skills/kaola-workflow-fast/SKILL.md` after install | exit 0; dir **removed**, "Removed retired role skill: …" printed — positive control, mechanism works and is observable |
| C1 | mutant | same plant | exit 0; dir **survives** — mechanism's only remover is the deleted loop |
| C2 | mutant | none (U1-faithful) | exit 0; **every U1-checked condition still true** (skills dir gone, `.kimi-code` gone, kimi-home tree gone, 0 managed hook blocks, shared config uncreated) |

C2 is the claim: U1 passes in full against an installer missing the entire retired-uninstall
mechanism. Structurally unobservable — confirmed, not argued.

Two qualifications on the filed wording:

1. "at all", repo-wide, is too broad: opencode R3 (`test-opencode-edition.js:1875-1892`) plants a
   retired AGENT + manifest row after a converged install and asserts `--uninstall` removes it. The
   uninstall path is unobserved for retired **commands** (opencode) and retired **skills** (kimi),
   which is the scope the issue actually works in.
2. "a new probe, not a parameter on the existing one": the necessary shape is a plant between the
   seed install and the uninstall plus one assertion — R3 does exactly that inline in an existing
   block, and U1 could take the same ~5 lines. New-probe-vs-extended-U1 is a test-custody design
   choice, not a structural necessity. The true constraint the sentence gestures at: planting
   *before the install* proves nothing, because the install sweeps retired names first (P5c-pinned;
   also why U1's seed install can never leave a retired name behind for the uninstall to miss).

## Also-filed census claims

- ".kimi/ was never tracked": consistent — `.opencode/` WAS tracked until `04752560` (2026-06-23,
  "chore: stop tracking .opencode/ (install artifact)"); kimi was born 2026-07-17 (`f6dbf40d`),
  after that convention, and no `.kimi/` path ever appears in tracked history.
- "kimi list otherwise complete at 11": **independently confirmed**. Census over f6dbf40d..HEAD,
  `--no-renames --diff-filter=D`, `agents/` top-level + `commands/`: agents deleted after 2026-07-17 =
  issue-scout (d663fd66, 07-25), contractor (63443589, 07-26), workflow-planner (65508fe3, 07-31);
  commands = fast+phase1..5 (1146e3ac, 07-19), adapt+plan-run (ea84673d, 07-31). 3 roles + 8
  commands = the 11 names at `install-kimi.sh:155-160` exactly. (docs-lookup and auto died before
  the edition existed — correctly absent.)
- opencode's 9-name list cross-checked the same way: tracked-era `.opencode/command` at `04752560^`
  held exactly the current 3 + those 9; root-command retirements after untracking (auto, fast,
  phase1-5, adapt, plan-run) all appear in the list; phase6 never shipped on opencode (no deletion
  in any `.opencode` tracked state). Consistent at 9 — with the structural caveat under "Open".

## Beyond the three parts — fourth axis (two findings the issue missed)

**A. `uninstall.sh` agents: RETIRED_AGENTS omits three names, and the strand is PERMANENT.**
`uninstall.sh:8-9` removes `REQUIRED_AGENTS` (= today's 14, verified identical to `agents/*.md`)
plus `RETIRED_AGENTS=("contractor")` only. Census: `agents/` also retired **issue-scout**
(2026-07-25), **workflow-planner** (2026-07-31), **docs-lookup** (2026-06-09). Measured: planted all
four as managed-marker files with manifest rows in a real scratch install; `uninstall.sh` (exit 0)
removed contractor (positive control) and all 14 required, left the other three in
`~/.claude/agents` — **and deleted the agent manifest** (manifest-removal branch, lines 69-83).
Consequence, also measured: a subsequent fresh `install.sh` reports **zero** "Removed retired agent"
lines and cannot heal them — `sweep_retired_agents` needs a pre-install manifest row that no longer
exists. Unlike the part-2 command case (reinstall self-heals), this residue survives uninstall AND
every future reinstall: three dead, managed-marked agent files a Claude runtime will keep offering.
This is the same class as part 2 on the edition the issue never looked at, with a worse tail.

**B. Retired HOOKS strand on BOTH opencode paths.** Root `hooks/` retired
`kaola-workflow-pre-commit.sh` + `kaola-workflow-write-lane.sh` (2a48342c, 2026-07-20) and
`kaola-workflow-phantom-advisor.sh` (83e91b3e, 2026-06-11). The tracked `.opencode/hooks` at
`04752560^` shipped pre-commit and write-lane, so real opencode installs ≥2026-06-23 deployed them.
Measured: a planted `hooks/kaola-workflow-pre-commit.sh` survives opencode `--uninstall` (removal is
by current source-tree name, line 399) **and survives reinstall** (the hook deploy at 354 is a bare
`cp` with no retired sweep and no manifest) — stranded on both paths, no healing mechanism at all.
kimi has the same uninstall shape (450-453) with a 3-day exposure window (edition born 07-17, hooks
retired 07-20). No RETIRED list exists for hooks on either edition.

**C. (uninstall-only, self-heals on reinstall)** opencode and kimi uninstall support scripts by the
CURRENT install manifest (`node kaola-workflow-install-manifest.js --forge=… --scripts`,
opencode 417 / kimi 446): measured, a planted retired `kaola-workflow-adaptive-node.js` survives
opencode `--uninstall` under `${OPENCODE_CONFIG_DIR}/kaola-workflow/scripts/` (blocking the rmdir),
though a reinstall's allowlist sweep then removes it. Root install.sh is immune on this axis
(uninstall.sh `rm -rf`s the whole support dir, line 124-125).

## Open / not measured

- Whether opencode's `RETIRED_WORKFLOW_COMMANDS` is complete over the untracked era
  (2026-06-23→now) is **not fully measurable by the census**: after `04752560`, nothing tracked
  records what the generator rendered per commit. I cross-checked the tracked-era tree plus every
  root-command retirement since, all consistent at 9; a commit-by-commit generator replay was not
  run.
- The full kimi/opencode test suites were not executed (not needed for these claims; every probe
  cited was verified by reading, and U1's blindness by direct mutation instead).
- Whether any real user population still carries the 2026-05-era `claude-workflow*` files is
  unknowable from the repo; the measurement establishes they were deployed, never install-swept, and
  uninstall-swept only.

## Raw artifacts

Scratch clone + logs: `…/scratchpad/p977-repro`, `…/scratchpad/p977-oc/{install,uninstall,reinstall}.log`,
`…/scratchpad/p977-kimi/{A,B,C1,C2}-*.log`, `…/scratchpad/p977-claude/{install,uninstall,reinstall}.log`
(full base: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad`).
Pre-existing `p1-*/p2-*/u1-*` artifacts in the same scratchpad are from another agent's legs and were
neither used nor touched.
