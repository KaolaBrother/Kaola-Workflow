# Documentation docking for issue #1050

status: DOCKED
candidate: 9dbfb1ac0aabdf410ec545dac95e5c7678a621ce

CHANGELOG `[Unreleased]` #1050, `docs/decisions/D-1050-01.md`, and the `docs/README.md` index note match the `metric-optimizer` `behavior_contract_version` 2 wording at this HEAD: continuous median-of-K vs `direction`/`min_delta`, pass-rate Beta posteriors with mission-supplied confidence (default 0.9 when supplied) plus posterior median vs `min_delta`, early abandonment after mission-supplied min trials (default 3 when supplied) with scoped `git restore --source=HEAD` / keep prior baseline / `git reset --hard` forbidden and log `rejected (abandoned after <n> trials)`, `metric_repeats` as ceiling, posterior-vs-posterior, Output Contract trial counts, no new script/flag/ledger/freeze. README.md and `docs/api.md` do not describe the accept rule and need no change. See `doc-updater.md` for checked paths.
