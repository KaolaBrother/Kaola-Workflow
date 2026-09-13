# Documentation docking — bundle-1068-1069-1070-1071-1074

verdict: DOCKED
candidate: 741baf1161067dd614c1fbd8e4bdca555e399f44

## Checked files

- `README.md` — updated: one always-loaded dispatch-contract carrier per runtime family
  (#1069); Cursor Cloud lifecycle wording retained under #1068's evidence move.
- `docs/api.md` — updated: reload carrier names the per-runtime-family carrier (#1069);
  doctor output gains `receipt_version` / `version_source` semantics (#1074).
- `docs/conventions.md` — updated: pin-retirement convention notes align with #1070.
- `docs/cursor-edition.md` — updated: Cursor adapter history/Cloud lifecycle sentences relocated
  here as measured evidence claims (#1068); `--ensure-target` documented as materialization
  status only — `restart_boundary` belongs to claim/doctor output (#1074).
- `docs/runtime-capabilities.md` — updated: adapter wording consistent with
  `templates/agents/runtime-capabilities.json` at 741baf11 (#1068).
- `docs/decisions/0024-*` — addendum: retired negation pins enumerated (#1070).
- `docs/decisions/0025-*` — no-impact beyond the #1068 evidence relocation already recorded.
- `CHANGELOG.md` — updated under `[Unreleased]`: entries for #1068, #1069, #1070, #1071, #1074
  including the installed-doctor `receipt_version` fix. No version bump; no release requested.
- `templates/routing/` — authoring source changed (required-blocks.js, dispatch-contract.md,
  next.skeleton.md, finalize.skeleton.md); all rendered surfaces regenerated, never hand-edited
  (generator `--check` byte-matches across commands/, hooks/, skills/, plugins/ mirrors).
- `templates/global/kaola-workflow-global.md` + `runtime-contract-adapters.json` — lean
  contract (#1071) and adapter facts (#1068); global-contract transaction unchanged in shape.
- Public-interface comments — `deferRuntimeDispatchBlock`, `--ensure-target` output contract,
  doctor `loadVersion`/`version_source` behavior carry their semantics in canonical scripts;
  forge mirrors regenerated.
- Carrier-boundary evidence (not a product doc change): Cursor CLI withholds user-level rules in
  world-writable cwd outside `$HOME`; injects them in normal trusted workspaces. Recorded at
  `parallel-cursor-preflight/final-741baf11/carrier-repro-nontmp.md` and independently in
  `parallel-cursor-preflight/carrier-discrepancy.md`. Registry wording stays accurate for real
  workspaces; no code/registry/test change resulted.

## Evidence

- Chain receipt: `kaola-workflow/bundle-1068-1069-1070-1071-1074/.cache/chain-receipt.json`
  (`headSha` 741baf11, `workTreeHash: clean`, scope `all-four`, all chains exit 0).
- `git diff 179e6444 741baf11 --stat`: 56 files, +1168/−1307 (net subtraction).
