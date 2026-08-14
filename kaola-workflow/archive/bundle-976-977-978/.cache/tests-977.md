# Tests authored — issue #977 (retired-name residue, five axes)

Author: tests-977 (test custody). Production files untouched — `git status` in the worktree
shows exactly four modified files, all test suites. No new test file: every pin rides an
existing registered suite, per the additive-derivation and reuse rules.

**Baseline**: worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-976-977-978`,
HEAD `51db5d2d49045e718083e45b1d04cfa985e503ea`, with these test edits uncommitted on top.
Ground truth: `.cache/premise-977.md` (same bundle dir). All mutation/fix runs used scratch
mirrors (never `git checkout --`, never a production edit in the worktree).

Every pin asserts a **disk outcome only** (file/dir present or absent after a real installer
run). No pin reads an installer's array, greps a script, or names a mechanism — the retired
names in fixtures are hard-coded from the git census, never from the list under test.

## Files touched

| file | pins added |
|---|---|
| `scripts/test-install-upgrade-rewrite.js` (#973 first block, 374-427) | axis 1 |
| `scripts/test-install-adaptive-config.js` (#816 block, 189-237) | axis A |
| `scripts/test-opencode-edition.js` (P8 at 1483-1516; U2 at 1723-1777) | axes 2, B-opencode |
| `scripts/test-kimi-edition.js` (U1 extended, 1375-1414) | axes 3, B-kimi-uninstall |

## Axis 1 — install.sh strands the seven `claude-workflow*` names

**Pin**: after an upgrade over a live 2026-05-era home, none of `claude-workflow.md`,
`claude-workflow-phase{1..6}.md` remains in `~/.claude/commands` (`STRANDED` list planted into
the existing #973 fixture; assert placed LAST in the block because this file's assert throws and
the pins above it must hold today). In-probe positive control: the existing `RETIRED` trio is
swept in the same run (passed on the way to the red). Uninstall-path behaviour deliberately
unasserted — `uninstall.sh` already clears all seven (premise-refuted claim).

**RED (baseline 51db5d2d)**: `node scripts/test-install-upgrade-rewrite.js` exit 1 —
```
AssertionError [ERR_ASSERTION]: #977: a command deployed by the 2026-05-era installer and retired
since is SWEPT on upgrade like every later retirement — still on disk: claude-workflow.md,
claude-workflow-phase1.md, ..., claude-workflow-phase6.md   (7 !== 0)
```

**Armed**: baseline = mechanism-absent state, so the red above IS the removal-mutation run.
Satisfiability: scratch mirror with the 7 names added to `RETIRED_COMMANDS` → suite exit 0
(`t977-upgrade-fixmutant.log`), with all scope pins (KEPT user files, byte-update) still green.

## Axis A — uninstall.sh leaves issue-scout / workflow-planner / docs-lookup (permanent strand)

**Pin**: extend the #816 uninstall step — plant the three as a real old box holds them (managed
marker + manifest row, so name-based AND manifest-based fixes can both observe them) plus a
user-authored `my-own-helper.md`; after one `uninstall.sh` run, all three are gone, the user
file is byte-intact, contractor removal is the in-probe positive control.

**RED (baseline)**: `node scripts/test-install-adaptive-config.js` exit 1 —
```
AssertionError [ERR_ASSERTION]: #977: uninstall.sh removes EVERY retired managed role, not only
contractor — still in the agents dir: issue-scout, workflow-planner, docs-lookup
```
(contractor-removed and user-file-intact asserts passed before it.)

**Armed**: baseline is the mechanism-absent state. Satisfiability: mirror with the three names in
`RETIRED_AGENTS` → suite exit 0 (`t977-adaptive-fixmutant.log`).

## Axis 2 — opencode `--uninstall` ignores retired commands

**Pin** (`U2 (#977)`, new probe after U1): seed install → plant `kaola-workflow-fast.md` +
`kaola-workflow-plan-run.md` (one per retirement era) **after** the seed install (the install
path sweeps retired names itself — P7b — so an earlier plant proves nothing about the
uninstall) → `--uninstall` → both gone; `my-own-command.md` in the SHARED dir survives;
positive control: current commands removed by the same run. Anti-vacuity: planted names not in
the deploy set.

**RED (baseline)**: `node scripts/test-opencode-edition.js` exit 1, 3 failures / 652 passed —
```
FAIL: U2 (#977): a command retired in an earlier release is removed by --uninstall — still on
disk after it: kaola-workflow-fast.md, kaola-workflow-plan-run.md
```

**Armed**: baseline = list-unwired state. Satisfiability: mirror with `RETIRED_WORKFLOW_COMMANDS`
wired into `uninstall_edition` → suite exit 0, 655 assertions (`t977-opencode-fixmutant.log`);
user-owned command still survives there, so the pin does not admit an over-broad sweep of the
shared dir.

## Axis B — retired hooks strand on both opencode paths (and kimi uninstall)

Three result pins, none dictating mechanism (the probes' comments say explicitly that
allowlist-vs-retired-list is not decided by the test):

1. **`P8 (#977)`** (opencode, install path): seed install → plant
   `kaola-workflow-pre-commit.sh` in the deployed hooks dir → reinstall → hook gone; positive
   control: every current hook deployed by the same run.
   RED: `FAIL: P8 (#977): a hook retired in an earlier release is removed on reinstall —
   kaola-workflow-pre-commit.sh is still on disk after it`
2. **`U2 (#977)`** (opencode, uninstall path): same plant after seed install → `--uninstall` →
   hook gone. RED: `FAIL: U2 (#977): a hook retired in an earlier release is removed by
   --uninstall — kaola-workflow-pre-commit.sh is still on disk after it`
3. **`U1 (#977)`** (kimi, uninstall path): plant under `<kimi_home>/kaola-workflow/hooks/` after
   seed install → `--uninstall` → hook gone.
   RED: `node scripts/test-kimi-edition.js` exit 1, 2 failures / 610 passed —
   `FAIL: U1 (#977): a hook retired in an earlier release is removed by --uninstall —
   kaola-workflow-pre-commit.sh is still on disk after it`, plus a collateral red on the
   EXISTING `U1: support scripts + hook scripts under the kimi home are fully removed
   (no residue)` pin — same defect, one cause (the surviving hook blocks the rmdir chain);
   both return green together under the fix.

**Armed**: baseline = no-mechanism state (no retired hook machinery exists anywhere).
Satisfiability: minimal name-based `rm -f` in the mirrors → opencode suite 655/0
(`t977-opencode-fixmutant.log`), kimi suite 612/0 (`t977-kimi-fixmutant.log`). Those one-liners
are validation artifacts proving the pins are satisfiable and read the true paths — they are
NOT the prescribed design.

## Axis 3 — kimi U1 structurally blind on the uninstall path

**Shape chosen**: plant inside the existing U1 block (opencode R3 precedent), not a new probe —
the necessary content is exactly a plant between seed install and uninstall plus one assertion,
and a second seed-install probe would buy nothing but runtime. The plant is `kaola-workflow-fast`
+ `kaola-role-issue-scout` (one command-class, one role-class name — the two classes a repair
could split), placed AFTER the seed install per the premise's measured constraint (the install
sweeps retired names first, P5c). Anti-vacuity: planted names asserted absent from the deploy set.

**Baseline is GREEN for this pin, by design**: the mechanism (`install-kimi.sh` retired-uninstall
loop) already ships; the defect was that no test could observe its loss. The failure signature is
therefore against the **mechanism-removed mutant** (scratch mirror, retired loop excised
verbatim, `bash -n` clean — the same mutant the premise proved full U1 passes against):
```
FAIL: U1 (#977): a skill retired in an earlier release is removed by --uninstall — still on
disk after it: kaola-workflow-fast, kaola-role-issue-scout
```
(`t977-kimi-mutant.log`, exit 1, 5 failures — my pin plus collateral no-residue pins that the
plant newly arms.) The mutant fails the pin via a direct disk observation of a fixture the test
itself planted, so the proof shares no assumption with the installer's own bookkeeping.

## Addendum (post-review R1) — kimi INSTALL-path hook sweep pin

`P8 (#977)` added to `scripts/test-kimi-edition.js` (between P4 and U1; twin of opencode P8),
closing the one #977 mechanism with no oracle. Seed install → plant
`kaola-workflow-pre-commit.sh` (censused name, hard-coded — no installer array read) + a
user-authored `my-own-hook.sh` AFTER the seed install → reinstall into the same kimi home →
retired hook gone, every current hook deployed (positive control), user hook byte-intact
(the by-name-never-wholesale control). Fixture is probe-local; no existing assertion touched
or disarmed.

Proof direction: the fix already ships, so the candidate is GREEN and the red is against a
reviewer-shaped mutant — fresh scratch mirror of the CURRENT tree with only the install-path
sweep excised verbatim (`bash -n` clean, uninstall side intact):
- candidate: `node scripts/test-kimi-edition.js` exit 0, **618 assertions** (was 612; +6 = this probe)
- mutant: exit 1, exactly **1 failure / 617 passed** —
  `FAIL: P8 (#977): a hook retired in an earlier release is removed on reinstall —
  kaola-workflow-pre-commit.sh is still on disk after it` (user-hook and deploy controls green)
- opencode suite unaffected: exit 0, 655 assertions; `git diff` on it unchanged (my 90 insertions only)

Transcripts: `t977-kimi-p8-candidate.log`, `t977-kimi-p8-mutant.log`,
`t977-opencode-recheck.log`; mirror `t977-mutant2/`. The earlier "kimi INSTALL-path hook sweep"
entry under *Deliberately NOT pinned* is now closed by this addendum.

## Deliberately NOT pinned (and why)

- **Uninstall of the 7 `claude-workflow*` names** — already works (`uninstall.sh:97-104`);
  the brief rules asserting the opposite out as false.
- **Full 9/11-name enumeration on the uninstall paths** — one-to-two censused names pin the
  mechanism's existence; a full copy of the list in a second probe is a duplicate that rots.
  List completeness is separately pinned census-style by kimi P5c on the install path; no
  observed failure demands the same on the uninstall path (derive additively).
- **User-authored hook survival under the hook sweeps** — whether the hooks dir sweeps to an
  allowlist (S1b precedent for installer-owned dirs) or a retired-name list is a design/value
  call for the implementer and owner; pinning either would dictate method. Command- and
  agent-dir scope IS pinned (shared dirs, established contract).
- **kimi INSTALL-path hook sweep** — same residue class (3-day exposure window), but unmeasured
  by the premise and not ruled into scope; flagged here for the orchestrator rather than pinned.

## Checks against known traps

- Fixture inheritance: no installer reads `KAOLA_WORKFLOW_OFFLINE` (grep over
  `install*.sh`/`uninstall.sh`: zero hits); every fixture uses the suites' own hermetic
  temp-HOME builders.
- Exit codes read directly (`echo "exit=$?"`), never through a pipe.
- Baseline runs verified the shared generated trees in parity (opencode + kimi drift-check:
  3 trees in parity) — no cross-checkout contamination.

## Raw transcripts

Scratchpad base `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/753f1e81-4413-4c89-9ade-8644be970a42/scratchpad/`:
`t977-{upgrade,adaptive,opencode,kimi}-baseline.log` (RED runs),
`t977-kimi-mutant.log` (axis-3 removal mutant, RED),
`t977-{upgrade,adaptive,opencode,kimi}-fixmutant.log` (satisfiability, GREEN),
mirrors `t977-mutant/` and `t977-fix/`.
