evidence-binding: n5-implementer-opencode f3b784bad307

# n5-implementer-opencode — GREEN (opencode lane, issue #543)

## Task
Make n4's RED `P1–P5 + A` assertions in `scripts/test-opencode-edition.js` GREEN by:
(1) a generator-time transform that rewrites the `kaola_script()` shell resolver + the
agent "Re-derive your own script paths" prose to opencode-native paths (the folded #544
Claude path-leak fix), then regenerating the `.opencode/` tree; (2) an install-time
`--with-fast` / `--with-full` command-set partition in `install-opencode.sh` mirroring
install.sh's #538 semantics (adaptive-core default; opt-ins recorded in the shared
`~/.config/kaola-workflow/config.json` via UNION read-modify-write); (3) docs.

## non_tdd_reason
Generator + installer + prose wiring (no behavioral logic with a natural failing unit
test). The failing tests in n4 ARE the external adversary; this node rewires a code-
generation transform, a shell installer's copy/config logic, and documentation — the
"GREEN" is structural/regression parity, not new behavioral logic. Verified by the
opencode-edition suite turning fully green (regression-green), not RED→GREEN ceremony.

## verification_tier
regression-green

## regression-green (GREEN receipt)

Suite: `node scripts/test-opencode-edition.js` (from the worktree root)
- BEFORE (baseline, n4's RED): **exit 1 — 45 failure(s), 318 passed.** All 45 failures
  in the new P1–P5 + A section; zero existing A1–A23 / S1 / S2 assertions regressed.
- AFTER (this node): **exit 0 — `opencode-edition test passed (363 assertions).`**
  318 baseline + 45 new (P1–P5 + A) = 363; **0 failures**, zero regression.

Zero-leak grep across the committed `.opencode/` tree (assertion A's surface):
```
$ rg 'CLAUDE_PLUGIN_ROOT|\.claude/kaola-workflow' .opencode/ -c | awk -F: '{s+=$2} END{print "total: "s+0}'
total: 0
```
(BEFORE: 146 matches across 12 command files + contractor + workflow-planner.)

Generator parity check (A6, byte-identical canonical↔generated):
```
$ node scripts/sync-opencode-edition.js --check
sync-opencode-edition: 15 agent(s) + 12 command(s) in parity with canonical.   (exit 0)
```

Cross-edition regression (belt-and-suspenders; opencode is additive D-530-02 and not
wired into `npm test`, but the generator lives under `scripts/`):
- `node scripts/test-route-reachability.js` → **Route-reachability test passed (170 assertions).** exit 0.
- `node scripts/simulate-workflow-walkthrough.js` → **Workflow walkthrough simulation passed.**

Hermetic installer smoke (mirrors the test's own P1–P5 harness, fresh `$TMPDIR`
HOME + `--target` per case): P1 default deploys 6 adaptive-core + `installed_paths:[]`;
P2 `--with-fast` adds fast + `["fast"]`; P3 `--with-full` adds phase1-5 + `["full"]`;
P4 both → all 12 + `["fast","full"]`; P5 `--with-fast` then bare re-install PRESERVES
fast + `["fast"]` (UNION never removes). All exit 0.

## Changes

### `scripts/sync-opencode-edition.js` (generator transform — the #544 leak fix)
- Added module constant `OPENCODE_KAOLA_SCRIPT`: the opencode-native `kaola_script()`
  resolver (search order `./scripts/` + `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts/`,
  honoring `$OPENCODE_CONFIG_DIR`). `printf '%s\n'` preserved as a literal backslash-n
  so the one-line resolver stays one line.
- Added pure function `rewriteClaudeScriptPaths(text)`: (a) wholesale-replaces every
  `kaola_script(){ ... return 1; }` definition line (indent-preserving) — collapses BOTH
  the 3-path command form AND contractor's 5-path form (with gitlab/gitea forge dirs) to
  the single opencode form; (b) rewrites the "Re-derive your own script path(s)" prose
  parenthetical in contractor + workflow-planner to the 2-path opencode list.
- Wired into `transformCommandBody` (commands) as a final pass AND into `renderAgent`
  (agents) — so the committed `.opencode/` tree carries ZERO `$CLAUDE_PLUGIN_ROOT` /
  `~/.claude/kaola-workflow` tokens. Canonical `commands/*.md` / `agents/*.md` untouched
  (additive D-530-02). Existing transforms (badge strip, path-flip strip, `model=`
  rewrites, `Agent(`→`task(`, runtime-label) all intact — EXTENDING, not regressing.
- Exported `rewriteClaudeScriptPaths` + `OPENCODE_KAOLA_SCRIPT` for parity/test visibility.

### `install-opencode.sh` (install-time partition — the #538 parity)
- **Header comment** (~L22-44): rewrote from "scoped out / deferred" to describe the
  partition (default adaptive-only; `--with-fast`/`--with-full` opt-ins; shared-config
  UNION; R1 effective-opt-in; #544 opencode-native script path).
- **Arg parsing**: added `--with-fast` (→ `WITH_FAST=1`), `--with-full` (→ `WITH_FULL=1`),
  and `--enable-adaptive` (retired, warn+ignore, mirrors install.sh:101-103). Initialized
  `WITH_FAST=0` / `WITH_FULL=0`. Unknown args still exit 2.
- **R1 EFFECTIVE_* (mirror install.sh:214-216)**: computes `EFFECTIVE_FAST` /
  `EFFECTIVE_FULL` = already-in-shared-config ∪ requested-this-run, BEFORE `copy_tree`,
  so a bare re-install preserves a prior opt-in (P5).
- **`copy_tree` D2 (mirror install.sh:518-524)**: the command-file deploy is now a
  per-file loop — adaptive-core always copies; `kaola-workflow-fast.md` iff
  `EFFECTIVE_FAST`; `kaola-workflow-phase[1-5].md` iff `EFFECTIVE_FULL`. Agents/plugins/
  hooks stay unpartitioned (always fully deployed).
- **`install_support_scripts` (#544)**: deploy dest flipped from
  `$HOME/.claude/kaola-workflow/scripts` to
  `${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts` (the path the
  rewritten resolver searches).
- **`seed_kaola_config` D4 (byte-identical to install.sh:712)**: passes
  `EFFECTIVE_FAST`/`EFFECTIVE_FULL` to the python UNION writer; `installed_paths` =
  `[p for p in ("fast","full") if p in (existing ∪ requested)]` (canonical order, never
  removes); `parallel_mode` setdefault "auto"; `enable_adaptive` migrated away;
  WARN-first (corrupt/non-object config → warn + leave untouched). Was writing `[]`
  always — now respects the flags.
- **`usage()`**: documents `--with-fast`/`--with-full`, the partition, and the opencode-
  native support-script path.

### `docs/opencode-edition.md` (documentation)
- Replaced the "Installer command-set parity — scoped out" section with an "Installer
  command-set partition (`--with-fast` / `--with-full`)" section (flag table, shared-
  config UNION lockstep with install.sh, R1 effective-opt-in, "generator still emits all
  12" note so A9/A20/A21 stay green).
- Rewrote "Script resolution coupling" to the opencode-native `kaola_script()` search
  path + the opencode-native install dest (the #544 fix).
- Updated "Install (into a project)" with the partition flags + `installed_paths`
  semantics; updated the "Verification" section assertion count (300 → 363) + added the
  P1–P5 + A coverage line.

### `.opencode/**` (14 regenerated files — generator output)
- Regenerated via `node scripts/sync-opencode-edition.js --write`. 12 command files +
  contractor + workflow-planner agents now carry the opencode-native resolver/prose.
  All other agents unchanged (the transform is a no-op where the patterns are absent).

## Notes / decisions
- The generator's `writeCommands` STILL emits ALL 12 command files into the committed
  in-repo `.opencode/command/` (single source the installer copies from) — per the
  architectural distinction; the partition is install-time. A9/A20/A21 (which read the
  committed tree) stay GREEN.
- The `scripts/test-opencode-edition.js` modification in the diff is **n4's** RED test
  block (already present when this node started); this node did NOT edit the test file —
  it only made it GREEN.
- No version bump. No `plugins/**` touched (n6's Codex lane). No canonical
  `commands/*.md` / `agents/*.md` touched (additive D-530-02). No other agents dispatched.
