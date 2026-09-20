# Finalization summary — bundle-1085 (#1085)

## Delivered

Runtime-capability copy refresh from the Pink class 2 live verification (Claude Code independent
verifier, 2026-09-21; evidence `kaola-workflow/pink-class2-verify/` — VERDICT.md, env-snapshot.md,
10 receipts; machine-local, untracked, prior art `kaola-workflow/i1084-verify/`):

1. Kimi `[secondary_model]` de-experimentalized in copy (4 spots): `docs/kimi-edition.md` (2),
   `docs/runtime-capabilities.md` (2, one gaining a dated live-inheritance evidence bullet),
   plus the kimi `availability` string in `templates/agents/runtime-capabilities.json` and a dated
   note in ADR 0021. Substance unchanged: optional, user-owned, unset → children inherit the
   session model and effort (live-proven: child ran `kimi-code/kimi-for-coding` @ `max`,
   `modelSource: "inherited"`).
2. Codex role-resolution narrative rewritten to the measured two-path mechanism (4 spots):
   `docs/architecture.md`, `docs/conventions.md`, `docs/api.md`, `docs/runtime-capabilities.md` —
   recursive `$CODEX_HOME/agents/` discovery (`name` field is identity) alongside managed
   `[agents.<role>]` + `config_file` blocks; "bundled `agents.toml` is not a lookup path" retained
   (re-confirmed). No installer behavior change; the live install was already healthy.
3. `templates/agents/runtime-capabilities.json` evidence face: added
   `kimi_secondary_model_ga_20260921` and `codex_agents_dir_discovery_20260921` (locator #1085),
   hooked into the kimi and all three codex runtime entries.
4. Grok explore "read-only without shell" desk claim measured FALSE on grok 1.0.34 — no copy change
   (three agreeing sources: bundled definition grants `run_terminal_cmd`; user-guide table; shipped
   binary's embedded doc).

## Files Changed

- CHANGELOG.md (`[Unreleased]` → Changed)
- docs/api.md
- docs/architecture.md
- docs/conventions.md
- docs/decisions/0021-runtime-native-orchestration-guidance.md (dated note only)
- docs/kimi-edition.md
- docs/runtime-capabilities.md
- scripts/fixtures/issue-1055-render-baseline.json (in-commit recapture per the #1055 baseline
  policy — deliberate render change via the kimi availability string)
- templates/agents/runtime-capabilities.json

## Test Coverage

Focused: generate-agent-profiles --check (7 roles / 42 renders), validate-vendored-agents,
test-kimi-edition (434 assertions; `.kimi`/`.kimi-gitlab`/`.kimi-gitea` mirrors regenerated with
`sync-kimi-edition.js --write` — sanctioned path; tree root lands in the main checkout by design),
test-grok-edition (412), test-issue-1044-runtime-adapters (65), test-runtime-agent-architecture
(742), validate-workflow-contracts, edition-sync --check, generate-routing-surfaces --check (24
surfaces), validate-script-sync, plugins/kaola-workflow walkthrough (165 spawns),
test-release-surface-drift (9), test-edition-sync (28).
Integration: `node scripts/simulate-workflow-walkthrough.js` — 178/178 scenarios, 2088 spawns.

## Validation

`node scripts/kaola-workflow-run-chains.js --project bundle-1085` — all four forge chains
(scope decision all-four / edition_coupling, base 786af12a). First run FAILED the #1055 render
oracle (12 kimi renders drifted — the deliberate availability-string change); paired fix executed
per policy: `--write-baseline` recapture in the same candidate (132 records, commit 786af12a),
then the full chain set re-ran green. Receipt: `kaola-workflow/bundle-1085/.cache/chain-receipt.json`
(workTreeHash 14720629b3806c38043a1fdb70dd2f28cea426ddb3f8d4f28426bbb0cdbdbe6e, completed
2026-09-20T20:32:35Z).

## Changed Paths

(listed under Files Changed above; finalize transaction's own findings land here)

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. README/docs index no-impact (verified by grep and link
check); CHANGELOG carries the full measured record; no public-interface signatures changed.

## Follow-Up Items

- Grok live write-probe gap: the explore tool-level enforcement conclusion rests on binary symbols
  and first-party docs because the live probe hit HTTP 402 (Grok Build balance exhausted). Re-run
  the item-2(b) probe per `kaola-workflow/pink-class2-verify/receipts/item2-grok-live-probe-BLOCKED.txt`
  once the balance is restored. Not a repo defect; recorded here and in the VERDICT.

## Measured

- Kimi Code 2.0.2 (binary sha256 in env-snapshot.md): `[secondary_model]` registered first-class
  section; `[experimental]` = `record(string, boolean)`; unset pool → `modelSource: "inherited"`
  (measured at worktree candidate 14720629…; artifacts `receipts/item1-*`).
- codex-cli 0.155.1: `$CODEX_HOME/agents/**/*.toml` recursive discovery, `name` identity,
  shared namespace with `[agents.<role>]`; literal `agents.toml` never read (artifacts
  `receipts/item3-*`).
- grok 1.0.34: explore retains `run_terminal_cmd` (artifacts `receipts/item2-*`).

## Hypothesis

- None requiring attribution: all corrections are direct measurements, not causal inferences.

## Proposed remedy (non-binding)

- None beyond the delivered copy corrections.

searched: `gh issue list --state open` (hit count 1: #1085 itself, filed by this run) — duplicate
probe before filing showed no pre-existing issue for these drifts.
