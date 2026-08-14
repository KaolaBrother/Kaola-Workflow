# Implementation — issue #977 (retired-name residue, five axes)

Implementer: impl-977. Worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`,
HEAD `51db5d2d`, on top of tests-977's four suite edits (untouched by me — custody respected; every
test path read and run only). Ground truth: `.cache/premise-977.md`, `.cache/tests-977.md`.

## Files changed (production only — exactly four)

- `install.sh` — axis 1
- `uninstall.sh` — axis A
- `install-opencode.sh` — axes 2, B (both paths)
- `install-kimi.sh` — axis B (uninstall path + install path per ruling (b))

## Per axis

**Axis 1 — install.sh strands the seven `claude-workflow*` names.**
Added the seven names (`claude-workflow.md`, `claude-workflow-phase{1..6}.md`) to
`RETIRED_COMMANDS` and extended the bounding comment with the measured fact: the 2026-05 installer
was a bare copy with no stale-removal, and the old prune's globs never matched these names
(premise census + behavioral repro). Uninstall path deliberately untouched — `uninstall.sh:97-104`
already clears all seven (premise-refuted claim; the gap was install/upgrade only).

**Axis 2 — opencode `--uninstall` ignores its own retired list.**
Wired `RETIRED_WORKFLOW_COMMANDS` into `uninstall_edition` (after the source-tree-name loops,
before the rmdir chain), following the shipped kimi shape at `install-kimi.sh` (retired loop with
per-removal echo). Updated the list's comment to say BOTH paths read it, and the function's doc
comment to "by source-tree filename plus the names this edition retired on purpose". Behaviour
change owner-approved per the brief; blast radius is the 9 basenames every reinstall already
deletes today.

**Axis 3 — kimi U1 blindness.**
No production change, confirmed rather than invented: the kimi retired-skill uninstall loop
already ships, and the axis-3 pin (retired-skill plant in U1) was GREEN in my own baseline run —
the baseline kimi failures were only the hook pin and its collateral no-residue pin.

**Axis A — uninstall.sh permanent agent strand.**
`RETIRED_AGENTS=("contractor")` → `("contractor" "docs-lookup" "issue-scout" "workflow-planner")`,
with a comment recording why uninstall must name these itself: this uninstall deletes the agent
manifest, so a name missed here is unremovable by any later install (the manifest-driven sweep
needs a pre-install manifest row that no longer exists). The removal loop itself was already
correct (managed-marker-gated, user files untouched) — only the list was short.

**Axis B — retired hooks, retired-list model per ruling (a).**
New `RETIRED_HOOKS` array in each edition installer — a declared blocklist, NOT a namespace/
allowlist sweep, consistent with the declaration model the command/skill lists already use.
Contents censused from the generator constants, not from memory:
- opencode: `git log -L` over `sync-opencode-edition.js`'s `HOOK_SCRIPTS` — born 06-19 with
  pre-commit + write-lane + subagent-dispatch-log, pre-commit + write-lane removed 07-20 (2a48342c),
  nothing else ever left the set. `kaola-workflow-phantom-advisor.sh` is deliberately ABSENT:
  retired from root hooks/ 06-11, before `.opencode/hooks` existed (born 06-19) — never shipped
  on this edition (same bounding rule as kimi's skills list excluding docs-lookup/auto).
- kimi: same census over `sync-kimi-edition.js` — born 07-17 with the same three, pre-commit +
  write-lane removed 07-20 (26671261). Both lists = exactly
  `kaola-workflow-pre-commit.sh` + `kaola-workflow-write-lane.sh`.

Wired at three pinned seams plus one measured one:
1. opencode install path (`copy_tree`): retired names removed immediately before the hook `cp`
   (pin P8).
2. opencode uninstall (`uninstall_edition`): retired hook names removed after the source-tree
   loops (pin U2).
3. kimi uninstall (`uninstall_edition` hooks block): retired names removed after the source-tree
   loop (pin U1 #977; also un-blocks the rmdir chain, healing the collateral no-residue red).
4. kimi install path (`install_support_scripts`): retired names removed before the hook copy —
   see ruling (b) below.

## Ruling (b) — kimi install path, measured BEFORE building

Measured live in the premise agent's scratch clone (`…/scratchpad/p977-repro`, HEAD 51db5d2d,
scratch HOME/KIMI_CODE_HOME/target, logs `…/scratchpad/i977-kimi-installpath/install{1,2,3-fixed}.log`):
- Seed install (unmodified installer): exit 0, hooks dir holds only the current
  `kaola-workflow-subagent-dispatch-log.sh`.
- Plant `kaola-workflow-pre-commit.sh`, reinstall (unmodified installer): exit 0, planted hook
  **SURVIVES**, zero "Removed" lines → **the strand is real; the sweep is in scope.**
- Same reinstall with my edited `install-kimi.sh` copied in: exit 0, planted hook **REMOVED**
  ("Removed retired hook script: …"), current hook still deployed. Clone restored clean after.

This seam is deliberately unpinned by the test author (flagged, not ruled into test scope), so the
live before/after run above is its verification.

## Suite runs I actually performed (this worktree, serial — never parallel)

| suite | before (baseline, my run) | after (my run) |
|---|---|---|
| `node scripts/test-install-upgrade-rewrite.js` | exit 1 — #977 STRANDED pin (7 names) | exit 0 |
| `node scripts/test-install-adaptive-config.js` | exit 1 — #977 retired-roles pin | exit 0 |
| `node scripts/test-opencode-edition.js` | exit 1 — 3 failures / 652 passed (P8, U2 cmd, U2 hook) | exit 0 — **655 assertions** |
| `node scripts/test-kimi-edition.js` | exit 1 — 2 failures / 610 passed (U1 hook + no-residue) | exit 0 — **612 assertions** |

Counts match the test author's fix-mutant predictions exactly (opencode 655, kimi 612). All
baseline reds were the #977 pins and nothing else. `bash -n` clean on all four edited files.
Logs: `…/scratchpad/i977-{upgrade,adaptive,opencode,kimi}-{before,after}.log`.

Cross-suite blast check: `git grep` shows no script outside the four edited suites reads any
RETIRED_* array name, and the other uninstall.sh-exercising suites (test-uninstall-forge-branches,
test-install-all, validate-*) carry no pin on the three added agent names in an uninstall context.

## Chosen NOT to do

- No uninstall-path change for the seven `claude-workflow*` names (already handled; premise-refuted).
- No production change for axis 3 (test blindness, closed by the test author).
- No allowlist/namespace hook sweep — ruling (a): the retired-list model, exactly these names plus
  what the deploy is about to write; a namespace sweep is the #973 defect class re-introduced and
  risks a user-authored hook.
- `kaola-workflow-phantom-advisor.sh` left out of both RETIRED_HOOKS lists — censused as never
  shipped on either edition (see above); a name that was never deployed there is not a retirement
  of theirs.
- CHANGELOG/README/docs untouched — left to the doc pass; this note is the record for it.
