# Documentation review for issue #1050

candidate: 9dbfb1ac0aabdf410ec545dac95e5c7678a621ce
status: DOCKED

Detection: neither `scripts/codemaps/` nor `docs/CODEMAPS/` exists. No codemap regeneration. No product, CHANGELOG, README, or other tracked file was edited in this custody pass.

Authority compared: `templates/agents/behavior-contracts.json` role `metric-optimizer`, `behavior_contract_version` 2, at HEAD `9dbfb1ac0aabdf410ec545dac95e5c7678a621ce`.

Checked files:

- `README.md` — no-impact. File does not mention `metric-optimizer`, `min_delta`, pass-rate, or any accept rule. Unchanged vs this candidate's delivery; it does not describe the accept rule.
- `docs/api.md` — no-impact. No `metric-optimizer`, `optimize(`, `metric_command`, `min_delta`, or `metric_repeats`. Script CLIs and envelopes are unchanged; this run added no CLI, flag, or envelope field.
- `CHANGELOG.md` `[Unreleased]` — matches. Entry **`metric-optimizer` pass-rate accept/reject (#1050)** claims: continuous metrics still use median-of-K against `direction` and `min_delta`; when the mission declares a pass-rate metric, the role compares Beta posteriors, accepts only with mission-supplied confidence and a posterior median that clears `min_delta`, and may abandon early; no new script, flag, ledger, or freeze rule; D-1050-01 records the decision; D-634-01 and D-639-01 are unchanged.
- `docs/README.md` — matches. Index note: D-1050-01 is a later wording-level note on the `metric-optimizer` pass-rate branch and does not restore the DAG machinery superseded by ADR 0017.
- `docs/decisions/D-1050-01.md` — matches the contract body (no invented schema fields). Claims present:
  - wording-level change to one uncommon role; `behavior_contract_version` for `metric-optimizer` becomes 2
  - steps 1–3 and 6 unchanged; steps 4–5 split by orchestrator-supplied metric kind; ambiguous kind is STOP
  - continuous default: median-of-K vs `direction` and `min_delta`; accept `kw-opt iter <k>: <old> -> <new>`; reject scoped `git restore --source=HEAD`; `git reset --hard` forbidden
  - pass-rate: `(n_success, n_failure)` as `Beta(1 + n_success, 1 + n_failure)`; accept only when posterior probability the candidate beats the baseline in `direction` meets mission-supplied confidence (default 0.9 when supplied) **and** the posterior median clears `min_delta`; ties and insufficient evidence are rejects
  - after mission-supplied minimum trials (default 3 when supplied), abandon early when the candidate's upper ε-quantile is already below the baseline's posterior median (mirror for `min`); that reject still uses scoped `git restore --source=HEAD`, keeps the prior baseline, forbids `git reset --hard`, logs `rejected (abandoned after <n> trials)`
  - `metric_repeats` is a ceiling, not a target; re-measure baseline at loop start and carry forward on accept (posterior-vs-posterior); Output Contract includes per-iteration trial counts on pass-rate runs
  - no new script, CLI flag, ledger, or freeze rule; D-634-01 and D-639-01 are not rewritten
- `docs/decisions/D-634-01.md` and `docs/decisions/D-639-01.md` — no-impact by design. Left as historical original-role / OPT freeze records; D-1050-01 and CHANGELOG state they are not rewritten.
- `docs/architecture.md`, `docs/installation.md`, `docs/runtime-capabilities.md`, `docs/agents-source.md` — no-impact. None describe the `metric-optimizer` accept/reject rule; this run did not change installers, architecture, or runtime adapters.
- `.env.example` — no-impact. No new environment variable; no script/flag added.

No public surface invents a script, CLI flag, ledger field, freeze-rule key, or env var. Confidence and early-abandonment minimum remain mission inputs in role prose, not documented as new schema.
