# Finalization - Summary: issue-1104

## Delivered

Codex preflight's plugin identity check (`readPluginIdentity`) no longer skips itself when HOME /
`--home` reaches the plugin cache through a symlink.

The CLI's `scriptDir` is `__dirname`, which Node realpath-resolves, while `cacheRoot` was derived
lexically from `home`. With a symlinked home (macOS `/tmp` → `/private/tmp`) `path.relative` put the
live cache copy outside `<home>/.codex/plugins/cache`, so the manifest name/version-vs-cache-path
check was silently skipped and `--doctor` passed (exit 0 `ok`, or exit 1 `stale` on the older base)
instead of refusing with exit 2 `plugin_identity_invalid`.

Fix: the lexical comparison stays primary (so every existing lexical non-symlink layer refusal is
unchanged); only when `pathIsWithin(cacheRoot, pluginRoot)` fails is `relativeRoot` recomputed from
the realpath-resolved cache root and plugin root (new private helper `realpathOrResolved`, which
falls back to the lexical path when resolution fails — a missing home behaves exactly as before).
All four byte-identical preflight copies (root, Codex, GitLab, Gitea) carry it.

Side effect (recorded in CHANGELOG): the installed CLI now also reaches the non-symlink layer check
for a symlinked `~/.codex`, which fails earlier with exit 2 `plugin_cache_path_unsafe` instead of
base's exit 1 `stale` ("Codex scope directory is a symlink") — a failing case stays failing, typed
earlier.

Review history:
- Round 1 (independent review of `27eba67f`): **FAIL**, one blocking finding introduced by that
  candidate — realpath-resolving `scriptDir` unconditionally hid a symlinked cache layer (`.codex` or
  the version dir) when `scriptDir` arrives lexically (exported `runDoctor`, or the CLI under
  `node --preserve-symlinks-main`); base refused those with exit 2 `plugin_cache_path_unsafe`,
  `27eba67f` returned exit 1 `stale`.
- Repair: `360f9453` (RED tests for both regressed layers + matching-version ok guard) and
  `c99ded06` (lexical-primary comparison with resolved fallback, per the reviewer's tested
  alternative; CHANGELOG adjusted).
- Round 2 (independent re-review of `c99ded06`): **PASS**, no blocking findings.

Base note: the claim initially created the worktree on a stray unpushed #1102 commit (`352cf997`) on
the main checkout's local `main`; on Host order the two first commits were rebased onto the real base
`04866c50` (`6d42cdaf`→`355c1c3d`, `5e733da0`→`27eba67f`) with byte-identical patch
(`git diff 352cf997 5e733da0` == `git diff 04866c50 27eba67f`, sha256 `e2fbc4d4…`). Ledger lines 1–3
record the stray base; line 4 records the correction.

## Files Changed

6 files, +153/-4 vs base `04866c50` (`git diff --shortstat 04866c50..c99ded06`):
`scripts/kaola-workflow-codex-preflight.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`,
`scripts/test-install-model-rendering.js`, `CHANGELOG.md`.

Four commits on `workflow/issue-1104`, author and committer `KaolaBrother <yanleichen@hotmail.com>`:
- `355c1c3d` test(#1104): RED — live cached CLI doctor must keep the plugin identity check under a
  symlinked --home
- `27eba67f` fix(#1104): realpath both sides of the Codex preflight plugin-cache containment check
- `360f9453` test(#1104): RED — a lexical scriptDir through a symlinked cache layer keeps
  plugin_cache_path_unsafe; matching live cache stays ok under either --home
- `c99ded06` fix(#1104): keep the lexical plugin-cache containment check primary; fall back to
  resolved paths only when it fails

## Test Coverage

`scripts/test-install-model-rendering.js` (in the `claude` and `claude:full` chains), cache doctor
block:
- Live cached CLI copy (subprocess, so `__dirname` is realpath-resolved), manifest version drift,
  `--home` given through a test-created symlink and as its real path → both exit 2
  `plugin_identity_invalid` naming `plugin_manifest_version_mismatch`.
- Same live cached CLI copy with a matching manifest under both `--home` forms → exit 0 `ok`
  (false-refusal guard).
- In-process `runDoctor` with a lexical `scriptDir` through a symlinked `.codex` and through a
  symlinked version dir → exit 2 `plugin_identity_invalid` naming `plugin_cache_path_unsafe`.

## Test-First Evidence (RED before GREEN)

- `355c1c3d` over base `04866c50` production: `node scripts/test-install-model-rendering.js` → exit 1
  at "live cached CLI doctor with a symlinked --home rejects manifest version drift" (actual exit 0,
  `status: ok`). Green at `27eba67f` and `c99ded06`.
- `360f9453` over `27eba67f` production: → exit 1 at "live installed-source doctor rejects a symlinked
  .codex cache layer reached lexically" (actual 1, expected 2); a one-off script showed the version
  layer also exit 1 `stale` at `27eba67f` and exit 2 at base. The matching-version guard was already
  green at `27eba67f` (guard, not a regression). Green at `c99ded06`.
- No existing assertion was deleted, weakened, or reinterpreted.

Manual acceptance (issue repro, CLI copied into `$H/.codex/plugins/cache/m/kaola-workflow/0.0.0-x`,
plus `config/agents.toml` and `agents/`), measured at `c99ded06` vs base `04866c50`:

| case | `--home` | base | candidate |
|---|---|---|---|
| version drift | `/tmp/kwpid.*` | exit 0 `ok` | exit 2 `plugin_identity_invalid` (`plugin_manifest_version_mismatch`) |
| version drift | `/private/tmp/kwpid.*` | exit 2 | exit 2 |
| matching | both | exit 0 `ok` | exit 0 `ok` |
| symlinked `~/.codex`, matching | both | exit 1 `stale` | exit 2 `plugin_cache_path_unsafe` |

Nonexistent `--home` (`/nonexistent/kw1104`): candidate output byte-identical to base (exit 0),
measured at `27eba67f`; the fallback path is unchanged in `c99ded06`.

Other commands at `c99ded06`, all exit 0: `node scripts/validate-script-sync.js`,
`node scripts/edition-sync.js --check`, `node scripts/test-install-model-rendering.js`,
`node scripts/test-spawn-classification.js`, GitLab and Gitea `test-*-workflow-scripts.js`,
`npm run test:kaola-workflow:codex`, and `node scripts/kaola-workflow-run-chains.js --project issue-1104`
(claude/codex/gitlab/gitea all exit 0, receipt bound to `c99ded06`, clean tree).

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- scripts/kaola-workflow-codex-preflight.js
- scripts/test-install-model-rendering.js

## Documentation Docking

`.cache/doc-docking.md`: DOCKED. CHANGELOG `[Unreleased]` → Fixed updated; README, docs/api.md,
ADRs — no impact (the check's flags, statuses, and fields are unchanged).

## Follow-Up Items

Report-only by Host direction (no new issues filed); both pre-existing, confirmed non-blocking by the
round-2 review:
- A symlinked marketplace / name / version layer under the plugin cache is still not catchable from
  the default CLI, because `__dirname` resolves through it before any comparison.
- `resolvePreflightSourceScriptDir` keeps its own lexical cache-root comparison; its contrived decoy
  case still fails closed.

## Readiness

READY — acceptance met for #1104 (both `--home` forms exit 2 `plugin_identity_invalid`; four copies
byte-identical; symlinked-HOME regression test), round-2 independent review PASS, all four chains
green on the frozen candidate `c99ded06`, documentation docked. Closure decision: close #1104 on
verified merge.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1104/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1104/.cache/doc-docking.md
- kaola-workflow/archive/issue-1104/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1104/finalization-summary.md
- kaola-workflow/archive/issue-1104/mission-ledger.jsonl
- kaola-workflow/archive/issue-1104/workflow-state.md
