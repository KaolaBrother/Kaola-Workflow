# Finalization Summary — issue-1105

## Delivered

Test custody restored for the live Codex preflight behaviours #1101 left untested (review N6 c2/c3/c4/c6/c9),
in the existing "Custody restored in #1101's review round (N6)" block of
`scripts/test-install-model-rendering.js`. No production change.

- c3: from a nested cwd, residue in the repository-root `.codex` is reported (`retired_role_residue`), and the
  doctor lists every layer root → cwd.
- c2: custom `project_root_markers = ["ROOT.marker"]` finds the trusted root layer; an exact nested
  `untrusted` record outranks the trusted-root fallback (layer ignored, its bounds excluded).
- c4: a repairable global scope plus a later project scope with an unbalanced marker pair refuses autofix with
  exit 4 `autofix_unsafe` naming the project scope; the global `.codex` tree is byte-identical afterwards.
- c6: global `max_concurrent_threads_per_session = 6` and project `max_wait_timeout_ms = 1800000` combine
  (6 / width 5 / 1800000).
- c9: a symlinked `.codex-plugin/plugin.json` → `plugin_manifest_unsafe`; a symlinked `.codex-plugin/` →
  `plugin_manifest_path_unsafe` (both exit 2 `plugin_identity_invalid`).

## Files Changed

| Path | Nature |
|---|---|
| `scripts/test-install-model-rendering.js` | Tests: +183 lines, five custody cases |

## Test Coverage

The behaviour is live, so RED was proven against mutants applied to all four preflight copies in a scratch
copy (`/tmp/kw1105-scratch`, never the worktree), from `/tmp/kw-triage/mutate.js`:

| Mutant | Killed by |
|---|---|
| `layers` | c3 (`c3: nested cwd reports repository-root residue`); c2 alone with c3 disabled (`c2: the trusted marker-root layer enters the effective runtime`) |
| `order` | c4 (`c4: a later ambiguous scope refuses autofix`) |
| `bounds` | c6 (`c6: the global thread cap survives`) |
| `manifestdir` | c9 dir (`c9: .codex-plugin symlink is refused`) |
| `manifest` | EQUIVALENT — survives; `lstatSync` never reports a symlink as `isFile()`, so `!isFile()` alone still refuses it |
| `manifestfollow` (lstatSync→statSync on the manifest; accepted stand-in) | c9 file (`c9: plugin.json symlink is refused`) |

GREEN: the unmutated tree passes. Spawn census and spawn classification pass on the rebased HEAD.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- scripts/test-install-model-rendering.js

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. Test-only; no documentation surface changes.

## Follow-Up Items

- None filed. The issue's `manifest` mutant is equivalent; the correction is recorded in the #1105 closing
  comment (`manifestfollow` accepted by the Host as its stand-in).

## Readiness

READY — four chains green and unwaived at `fc286525` (release-check pass); test-install-model-rendering,
validate-script-sync, the Codex walkthrough and simulate-workflow-walkthrough all exit 0 at `fc286525`.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1105/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1105/.cache/doc-docking.md
- kaola-workflow/archive/issue-1105/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1105/finalization-summary.md
- kaola-workflow/archive/issue-1105/mission-ledger.jsonl
- kaola-workflow/archive/issue-1105/workflow-state.md
