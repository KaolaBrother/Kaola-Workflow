evidence-binding: n3-docs 992101a41be1

## Summary

Documented two just-merged engine features in `docs/workflow-state-contract.md` (the sole file in
the declared write set). No other file touched.

### Sections added

1. **`codex_dispatch_mode` state field** — new paragraph inserted in `## Workflow State Fields` §
   `## Sink`, immediately after the existing "three claim-time session fields" bullet list
   (`main_root` / `session_marker` / `claim_ts`), before the `cmdStatus` / `lane_bucket` paragraph.
   Documents: optional field, written only when `cmdStartup` receives `--codex-dispatch-mode`;
   value-validated via `resolveCodexDispatchModeFlag` before any claim mutation; legal set
   `v2-task-name` | `v1-thread-id`; invalid/newline value refuses with `invalid_codex_dispatch_mode`
   and zero mutation (same `assertNoNewline` fence as `worktree_path`/`branch`); absent field omitted
   entirely (byte-identical to pre-#603 state); read by `resolveCodexDispatchMode` in
   `kaola-workflow-adaptive-node.js`, which falls back to
   `KAOLA_CODEX_DISPATCH_MODE`/`CODEX_DISPATCH_MODE` env override then to the `v1-thread-id`
   fail-closed default; written once at claim time, never refreshed.

2. **`run-progress.json` generated mirror** — three new bullets appended to the end of the
   `## Generated Mirrors` section, after the existing `_rules.md` bullet. Documents: generated,
   non-authoritative snapshot of `## Node Ledger` written at the MAIN root by every successful
   ledger-mutating `kaola-workflow-adaptive-node.js` subcommand (`open-next`, `open-ready`,
   `close-node`, `close-and-open-next`, `reconcile-running-set`, `reopen-node`, `repair-node`,
   `write-halt`, `clear-halt`), only on a linked-worktree run (main_root != executing repo root);
   schema (`plan_hash`, `updated_at`, `op`, `node_ledger[{id,role,status}]`, `in_progress`,
   `all_done`) with field semantics; write-only/fail-open behavior (`run_progress_mirror: "failed"`
   warn field on write failure, never a refusal); never read back for decisions; absent when no
   worktree linked or before first ledger-mutating op; removed with the rest of `.cache/` at
   finalize/archive.

### Ground-truth checks performed

- `scripts/kaola-workflow-adaptive-node.js`: read `LEDGER_MUTATING_SUBCOMMANDS` (line 87),
  `buildRunProgress`/`writeRunProgressMirror`/`RUN_PROGRESS_MIRROR_NAME` (lines 860-901), and the
  call site (lines 5810-5820, confirming the `realRepoRoot !== mainRoot` gate and the
  `run_progress_mirror: 'failed'` warn field). Verified `node_ledger` row shape (`id`, `role`,
  `status`), `in_progress`/`all_done` derivation, and `plan_hash` extraction regex directly from
  `buildRunProgress`.
- `scripts/kaola-workflow-claim.js`: read `CODEX_DISPATCH_MODES` / `resolveCodexDispatchModeFlag`
  (lines 136-150), the `cmdStartup` value-validation-before-mutation block (lines 1436-1444), the
  `writeState` `assertNoNewline(data.codex_dispatch_mode, ...)` guard (line 578) and the conditional
  `codex_dispatch_mode:` line emission (line 641), and both call sites threading
  `args.codexDispatchMode` / `opts.codexDispatchMode` through `writeState` on the scalar
  (`claimProject`, line 995) and bundle (`claimExplicitBundle`, line 1194) claim paths.
- `scripts/kaola-workflow-adaptive-node.js`: read `resolveCodexDispatchMode` (lines 1126-1137,
  confirming the explicit-context / env-override / fail-closed-default precedence) and the state-file
  read site (lines 5572-5580, confirming the regex read and null default).
- Cross-checked field names/behavior against `scripts/simulate-workflow-walkthrough.js` (#603 test
  block, lines ~15578-15655) and `scripts/test-adaptive-node.js` (D444-DISPATCH-PARITY assertions,
  lines 4654-4664) — no discrepancies found.
- Confirmed neither feature was previously documented anywhere in `docs/api.md` or
  `docs/workflow-state-contract.md` (grep returned no prior hits) — these are first-time additions,
  not edits to existing prose.

### Consistency suite run

Found two docs-consistency validators that assert concepts against this exact file
(`docs/workflow-state-contract.md`): `scripts/validate-workflow-contracts.js` and
`scripts/validate-kaola-workflow-contracts.js` (both run `assertConcept('docs/workflow-state-contract.md', ...)`
checks for "durable sources and generated mirrors", "legacy coordination as transitional only", and
"closure contract cross-reference").

- `node scripts/validate-workflow-contracts.js` → exit 0, "Workflow contract validation passed"
- `node scripts/validate-kaola-workflow-contracts.js` → exit 0, "Kaola-Workflow Codex contract validation passed"

Both passed after the additions with no regressions. `git status --porcelain` / `git diff --stat`
confirmed only `docs/workflow-state-contract.md` was modified (32 insertions, 0 deletions) — no
other tracked file touched.
