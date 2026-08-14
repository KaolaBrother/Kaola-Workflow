# tests-973b — pin the `kaola-role-issue-scout` retirement regression

**Status: DONE — pin authored and RED.** Test custody only; no production file touched.
Write set: `scripts/test-kimi-edition.js` alone.
Worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-973-974-975`,
branch `workflow/bundle-973-974-975`, baseline `6926493661e1a69c910e50f5a3d82b09af85e4ee`.

## Re-census result — LEAD WITH THIS

**Exactly one name is missing, and it is the one already identified: `kaola-role-issue-scout`.**
No second missing name. The census is now complete and reproducible, and the probe pins the whole
set rather than a sample of it.

Commands run (from the worktree, `git -C` — cwd resets between calls in this environment):

```
git log --no-renames --diff-filter=D --name-only f6dbf40d..HEAD -- agents/
git log --no-renames --diff-filter=D --name-only f6dbf40d..HEAD -- commands/
git log --no-renames --diff-filter=A --name-only f6dbf40d..HEAD -- agents/ commands/
git log            --diff-filter=R --name-status f6dbf40d..HEAD -- agents/ commands/
```

`f6dbf40d` = the kimi edition's birth commit; the window holds 901 commits, 101 of them touching
`agents/` or `commands/`.

**Deletions under `agents/`** (each renders `kaola-role-<name>`):

| path | commit | date | in installer list? |
|---|---|---|---|
| `agents/issue-scout.md` | `d663fd66` | 2026-07-25 | **NO — the regression** |
| `agents/contractor.md` | `63443589` | 2026-07-26 | yes |
| `agents/workflow-planner.md` | `65508fe3` | 2026-07-31 | yes |
| `agents/profiles/higher/issue-scout.md` | `d663fd66` | 2026-07-25 | n/a — never rendered |
| `agents/profiles/higher/{code-architect,code-reviewer,security-reviewer}.md` | `3b4ad2a4` | 2026-07-26 | n/a — never rendered |

**Deletions under `commands/`** (each renders a skill dir of the bare basename):

| paths | commit | date | in installer list? |
|---|---|---|---|
| `kaola-workflow-adapt.md`, `kaola-workflow-plan-run.md` | `ea84673d` | 2026-07-31 | yes |
| `kaola-workflow-fast.md`, `kaola-workflow-phase{1..5}.md` | `1146e3ac` | 2026-07-19 | yes |

So the complete historical retired set is **11 names**; `install-kimi.sh:154-163` holds **10**.

**Why `agents/profiles/higher/*` are excluded, verified not assumed.** The era's generator lists
canonical agents as top-level `*.md` only — `f6dbf40d:scripts/sync-kimi-edition.js:76-83`, whose own
comment says the `profiles/` directory "never matches `*.md` here, so it is skipped by
construction". `writeAgents` (`:428-441`) writes `kaola-role-<name>` per that list; `writeCommands`
(`:444-456`) writes `<basename>`. HEAD's generator is unchanged in this respect
(`expectedSkillDirs`, `scripts/sync-kimi-edition.js:606-612`), so skill dirs come from those two
sources and nothing else — no third producer to census.

**Why the deployed set can't be wider than the rendered set.** `f6dbf40d:install-kimi.sh:166-182` is
the same fail-closed allowlist as today: adaptive-core + `kaola-role-*` always, everything else
skipped. Deployed ⊆ rendered, so a census of rendered retirements is a census of deployable ones.

**Other vectors checked and clear:**
- **Renames.** The `-R` filter over `agents/ commands/` in the window returns **nothing**, and the
  D census gives the identical answer with and without `--no-renames`. So no retirement is hiding
  behind rename detection here — but `--no-renames` is what makes that a measurement rather than
  a hope, and the pin's comment says so.
- **Delete-then-re-add.** None: the only path *added* under either directory in the whole window is
  `agents/investigator.md`, and all three deleted agents are confirmed absent at HEAD
  (`git cat-file -e HEAD:agents/<x>.md` → absent for contractor, workflow-planner, issue-scout).
- **Forge-specific command basenames.** `commands/` has never held a subdirectory or a
  non-adaptive-core basename in the window; P0 in this suite already asserts
  `canonCommandNames == ADAPTIVE_CORE` exactly.
- **`.kimi/` tracking.** `git ls-tree f6dbf40d --name-only .kimi/` is empty — the edition tree was
  never tracked, confirming git history is the only record of what once shipped.

## The assertion

`scripts/test-kimi-edition.js:1261-1269` — the `P5c` probe's `RETIRED` array, extended from 4
sampled names to the full censused 11, with `kaola-role-issue-scout` first so it leads the failure
message. Preceded by a census note at `:1249-1259` explaining why the list is derived from history
and **not** read from `install-kimi.sh` (a probe that reads the list under test agrees with it by
construction and can never see a name missing from it).

No other line changed. The probe's existing assertions do the work unmodified: the sweep assertion
(`:1275-1278`), the scope assertions on `KEPT_DIRS`/`KEPT_FILE`, and the "still deploys everything"
assertion. Assertion count is unchanged (set-based), so the suite total stays 609.

## The red

```
node scripts/test-kimi-edition.js   →  exit 1
FAIL: P5c: a skill dir retired in an earlier release is SWEPT from a live install — still on disk: kaola-role-issue-scout
kimi-edition test FAILED: 1 failure(s), 608 passed. [drift-check: 3 tree(s) in parity (.kimi, .kimi-gitlab, .kimi-gitea)]
```

```
RED: P5c retired-sweep — still on disk: kaola-role-issue-scout
baseline: 6926493661e1a69c910e50f5a3d82b09af85e4ee
```

One failure, exactly the intended one, and the name it reports is the name in question — the other
ten planted retired dirs were swept. Full output:
`<scratchpad>/red.txt` (session scratch, not durable).

## Anti-vacuity

1. **The planted name is not in the deploy set.** Measured directly against the deploy source, not
   only via the in-test guard: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kimi/skills` holds 17
   dirs (14 `kaola-role-*` + 3 commands) and **none** of the 11 retired names is among them. So the
   sweep assertion cannot pass because the installer happened to write the name back. The probe's
   own `RETIRED.every(n => !DEPLOY_SET.includes(n))` guard (`:1269-1271` region) covers the same
   property from inside and passed.
2. **The pin is a general predicate, not a hardcoded special case — mutation-proved.** On a scratch
   mirror of the checkout (`.git` skipped, so the generated tree resolves to the mirror; the real
   tree was never written), `install-kimi.sh`'s `RETIRED_ROLE_SKILLS` was mutated **both ways at
   once**: `kaola-role-issue-scout` **added** and `kaola-workflow-phase3` **removed**. Result:

   ```
   install exit: 0
   P5c filter would report still-on-disk: kaola-workflow-phase3
   ```

   That is one run proving two things: the pin **goes green** on the intended repair (it is
   satisfiable, not an unmeetable assertion), and it **goes red on a different missing name**, so it
   measures the list rather than one hardcoded string. Harness:
   `<scratchpad>/mutation-proof.js`.
3. **The sweep half is not evidence alone** — the probe's pre-existing `missing`/`KEPT_*`
   assertions still hold, so this is not a run that swept everything and deployed nothing.

## Additional finding — the uninstall path has no coverage at all

Out of the assigned shape, so **not authored**; reporting for the lead's call.

`install-kimi.sh:421` iterates the same `RETIRED_ROLE_SKILLS` inside `uninstall_edition`, so the
one-line fix closes the runtime hole on both paths. But the suite's uninstall probe **U1**
(`scripts/test-kimi-edition.js:1369+`) installs first and then uninstalls, so the only names on disk
are the 17 this install wrote — it structurally cannot observe a retired-name residue. If the lead
wants that pinned too, it needs a U1-shaped probe that **plants** retired dirs before uninstalling.
I did not add one: it is a new probe rather than the P5c-shape pin I was asked for, and the file is
live for other agents.

## Safety and cleanliness

Every install spawned used a throwaway `HOME` / `KIMI_CODE_HOME` / `--target` (the suite's own
`runInstaller`, and the same pattern hand-written in the mutation harness). The real home was never
written — verified after the fact:

| surface | count | expected |
|---|---|---|
| `~/.kimi-code/skills` | 17 | 17 |
| `~/.claude/commands` | 3 | 3 |
| `~/.claude/agents` | 14 | 14 |
| `~/.config/opencode/command` | 3 | 3 |

No leftover `kimi-*` scratch dirs in `$TMPDIR` (0 matches).

**Trees.** Main is clean — only `?? kaola-workflow/bundle-973-974-975/` (this run's folder). The
worktree carries the bundle's pre-existing modifications; my contribution to it is the `RETIRED`
block and its comment in `scripts/test-kimi-edition.js` and nothing else. The suite's drift check
reports all three kimi trees (`.kimi`, `.kimi-gitlab`, `.kimi-gitea`) in parity after the run.

## For the implementer

Add `"kaola-role-issue-scout"` to `RETIRED_ROLE_SKILLS` in `install-kimi.sh` (around `:154-163`).
That is the whole fix — proved sufficient by the mutation run above. Do not edit this test.
