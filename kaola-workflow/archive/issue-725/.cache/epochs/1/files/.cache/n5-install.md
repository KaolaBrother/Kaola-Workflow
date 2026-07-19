evidence-binding: n5-install 214fb0a3e271
non_tdd_reason: scaffolding/config + glue retirement — install-wiring removal of the fast/full opt-in machinery across install.sh + install-manifest ×2 + install-codex-agent-profiles ×3, plus updating the three install tests to assert the retired state; there is no natural RED-first new behavior (the retired flags are simply refused and the fast/full artifacts simply cease to install), so the meaningful proof is the existing install suites re-run green against the retired wiring.
regression-green: the three coupled install suites + a syntax check are all green after the retirement — `bash -n install.sh` clean, `node scripts/test-install-model-rendering.js` (updated), `node scripts/test-install-adaptive-config.js` (AC block repurposed), `node scripts/test-install-manifest-single-source.js` (dynamic, green unchanged) — proving install seeds parallel_mode only (never installed_paths), refuses --with-fast/--with-full as unknown flags, and ships no fast/full artifacts.

upstream_read: n1-recon 30aed1d97859
upstream_read: n4-claim 056db2b938fe

## verification_tier

regression-green

## task

n5-install: retire the fast/full install wiring across the installer surface and converge the three
install tests to the retired state. Per the frozen n5 direction + n1's binding "owned-but-
underspecified scope note", the symbol contract is: install SEEDS parallel_mode only and NEVER writes
`installed_paths`; `--with-fast`/`--with-full` become unknown-flag errors at install.sh; the Codex
installer stops parsing those flags and stops writing `installed_paths`; stale `installed_paths` stays
tolerated on read (never re-written — actively stripped on any touched config, mirroring the existing
enable_adaptive migration). `uninstall.sh` needs no change (path-agnostic sweep) and was NOT touched;
`install-opencode.sh`/`install-kimi.sh` are OUT of the write set (deferred GAP-3) and were NOT touched.

## write_set (9 declared; 8 modified, 1 dynamic-green-unchanged)

- install.sh                                                                  (MODIFIED)
- scripts/kaola-workflow-install-manifest.js                                  (MODIFIED, canonical)
- plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js           (MODIFIED, codex byte-identical)
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js              (MODIFIED, byte-group base)
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js       (MODIFIED, byte-group)
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js        (MODIFIED, byte-group)
- scripts/test-install-model-rendering.js                                     (MODIFIED)
- scripts/test-install-adaptive-config.js                                     (MODIFIED)
- scripts/test-install-manifest-single-source.js                             (UNCHANGED — fully dynamic; had no hardcoded retired SUPPORT_SCRIPTS expectations to drop; green as-is)

## per-file change summary

### install.sh
- Removed `WITH_FAST=0`/`WITH_FULL=0` vars + the fast/full opt-in comment block.
- Removed the `[--with-fast] [--with-full]` usage line + the two per-flag usage description lines.
- Removed the `--with-fast)`/`--with-full)` arg-parse cases → both now fall through to the `*)`
  unknown-argument branch (exit 2, "Unknown argument"). `--enable-adaptive` warn-and-ignore kept.
- Removed the `EFFECTIVE_FAST`/`EFFECTIVE_FULL` union block (the `EXISTING_PATHS` node one-liner +
  the two `case` computations).
- Removed the fast/full command-install gating (`kaola-workflow-fast.md`/`kaola-workflow-phase[1-5].md`
  case in the command copy loop) and the identical verification gating in the verify loop.
- Rewrote the config-write python block: takes no fast/full argv, seeds `parallel_mode` setdefault
  'auto', `config.pop("installed_paths")` (retired: never written; stale value stripped) alongside the
  existing `config.pop("enable_adaptive")` migration. Warning strings de-referenced from installed_paths.
- `bash -n install.sh` clean. The only surviving `installed_paths` mentions are the intentional
  strip-comment + `config.pop("installed_paths")` line (the "never written" enforcement).

### kaola-workflow-install-manifest.js ×2 (canonical edited, cp→codex byte-identical)
- Dropped the 3 retired `SUPPORT_SCRIPTS` entries (`kaola-workflow-{fast-advance,full-advance,
  phase4-advance}.js`). github support set went 27→24 entries; no entry matches fast/full/phase4.
- Removed the stale `kaola-workflow-fast-audit.js — CI-only audit tool` line from the "Intentional
  per-forge exclusions" comment (fast-audit.js was deleted by n2; the exclusion note is obsolete).
- `cmp -s` canonical↔codex → IDENTICAL; both require-load OK.

### install-codex-agent-profiles.js ×3 (byte-group; canonical edited, cp→gitlab/gitea)
- Removed the `const WITH_FAST`/`const WITH_FULL` argv parsing + rewrote the fast/full opt-in comment
  to the retirement note (kept the load-bearing "unknown args are IGNORED — positional preflight/test
  argv" note; the installer intentionally does NOT hard-fail on unknown args, so a stray `--with-fast`
  is now simply an ignored no-op). `--enable-adaptive` warn-and-ignore kept.
- `seedKaolaConfig(homeDir, withFast, withFull)` → `seedKaolaConfig(homeDir)`: dropped the
  installed_paths UNION logic; now seeds `parallel_mode` setdefault + `delete config.installed_paths`
  (retired: never written; strip stale) + the existing `delete config.enable_adaptive` migration. The
  atomic-staging / CAS-retry / write-temp-rename machinery is UNCHANGED. Return is `{status:'updated'}`
  (dropped the installed_paths field); log line reworded. Rewrote the function doc comment.
- Updated the seed call site `seedKaolaConfig(os.homedir(), WITH_FAST, WITH_FULL)` →
  `seedKaolaConfig(os.homedir())` + comment.
- Fixed a stale `--global` comment that used "--with-fast/--with-full" as a position-robust example.
- The comment-only `resolveInstalledPaths` reference (no live call existed) was removed with the
  rewritten opt-in comment block. `cmp -s` across all 3 copies → IDENTICAL; require-load OK;
  exported `seedKaolaConfig.length === 1`.

### tests (updated to the retired contract; no RED-first tests authored)
- **test-install-model-rendering.js:** the three `seedKaolaConfig` staging/CAS unit tests now call
  `seedKaolaConfig(homeDir)` and assert `parallel_mode` + `!('installed_paths' in cfg)` (stale-strip)
  instead of the UNION installed_paths outcomes — the symlink-safety / randomized-stage-retry (calls
  ===2) / compare-and-swap concurrent-owner-preservation mechanics are all preserved. The
  `higherInstallOutput` block dropped `--with-fast --with-full` and the deleted phase3/4/5/fast reads;
  opus rendering retargeted to `kaola-workflow-adapt.md` (workflow-planner opus), sonnet + blank-line
  preservation retargeted to `kaola-workflow-finalize.md` (tdd-guide/build-error-resolver/doc-updater).
  The two phase-command profile-distinction blocks were replaced by a single manifest-based "default
  profile is higher" check (code-architect/code-reviewer→opus via `.kaola-agent-models.json`); the
  explicit --profile=common contrast is already covered by the existing manifest section (ii). The
  cross-edition codex-install config assertion inverted from `installed_paths:[]` to
  `!('installed_paths' in cfg)` + `parallel_mode:auto`.
- **test-install-adaptive-config.js:** deleted AC2a/AC2b (opt-in) and the AC3 preserve/AC4 reset
  opt-in variants. AC1 repurposed into a retirement regression (parallel_mode:auto, no installed_paths,
  no enable_adaptive, no fast/phase commands, adaptive commands + card present). AC2 = flags-refused
  (both `--with-fast`/`--with-full` exit non-zero with "Unknown argument", no fast artifact). AC3 =
  bare reset lifecycle (install→uninstall removes config→bare reinstall clean). AC4 = stale
  installed_paths tolerated-then-stripped while user parallel_mode + unrelated fields preserved. AC5
  (--enable-adaptive warn-ignore) kept, installed_paths assertion swapped for parallel_mode:auto +
  no-installed_paths. Header comment retargeted. The preserved #242-uninstall / contractor-mapping /
  opencode-parity tests are untouched (opencode installer is unchanged/GAP-3, still writes
  installed_paths:[], so its parity assertion stays accurate).
- **test-install-manifest-single-source.js:** no change — it deep-equals the CLI emission against the
  exported `supportScripts()` dynamically and carried no hardcoded retired expectation; green as-is.

## verification_commands + outputs

1. `bash -n install.sh` → exit 0 (SYNTAX OK).
2. `bash install.sh --with-fast --forge=github --yes` (hermetic HOME) → "Unknown argument: --with-fast",
   usage printed, exit 2.
3. `node scripts/test-install-model-rendering.js` → exit 0 ("Install model rendering tests passed").
4. `node scripts/test-install-adaptive-config.js` → exit 0 ("Install adaptive-config tests passed").
5. `node scripts/test-install-manifest-single-source.js` → exit 0 ("PASSED").
6. Byte-groups: `cmp -s` install-manifest canonical↔codex → IDENTICAL; install-codex-agent-profiles
   canonical↔gitlab↔gitea → 3 IDENTICAL. All require-load OK.
7. Manifest emission: `supportScripts('github')` = 24 entries, none matching fast/full/phase4-advance.
8. Residual sweep across the write set: no `fast-advance|full-advance|phase4-advance|kaola-workflow-fast.md|
   kaola-workflow-phase[1-5]` tokens remain except intentional ones — install.sh's installed_paths
   strip line/comment (the "never written" enforcement), and the AC2 retirement-regression assertions +
   negative `commandExists('kaola-workflow-fast.md')` checks (a test proving the retired flags/commands
   are gone must name them; same load-bearing pattern as n4).
9. Scope: `git status --porcelain` shows exactly the 8 modified n5 write-set files (+ the dynamic-green
   unchanged 9th); `uninstall.sh`, `install-opencode.sh`, `install-kimi.sh` are UNTOUCHED. No file
   outside the n5+upstream (n2 D / n3-n4 M) sets was modified.

## before_result

At the base issue commit all install suites were green. This LEG opens on the serial-chain state
(n2–n4 applied): n2 deleted the fast/full/phase4-advance script sources while the install-manifest
still listed them, so `install.sh` aborted fail-closed on the missing allowlisted source, and the
phase[1-5]/fast command sources this test read were gone — so `test-install-model-rendering.js` and
`test-install-adaptive-config.js` were RED entering the leg (the expected upstream-broken transient
that n5 converges), while `test-install-manifest-single-source.js` (which never runs install.sh) was
green. No formal build/typecheck pipeline exists (Node scripts only); the regression baseline is these
three install suites + `bash -n`.

## after_result

All three install suites green + `bash -n install.sh` clean, updated to the retired contract. install
seeds parallel_mode only (never installed_paths; stale value stripped), `--with-fast`/`--with-full`
are unknown-flag errors, and no fast/full command artifacts install. install-manifest ×2 byte-identical;
install-codex-agent-profiles ×3 byte-group identical; all require-load cleanly. Per the n5 brief the
full four-edition chains / walkthrough are NOT run in this leg (downstream validators/forge-tests still
reference retired install surfaces until n6–n9 land — e.g. n9 owns the gitlab/gitea forge-test
seedKaolaConfig `--with-full` fixtures); the four-chain-green verdict lands downstream and at finalize.
No commit made.
