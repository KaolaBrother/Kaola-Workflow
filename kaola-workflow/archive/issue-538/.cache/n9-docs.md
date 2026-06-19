evidence-binding: n9-docs 7f7236f354cf

## Summary of changes

### 1. docs/decisions/D-538-01.md — CREATED
New ADR recording five load-bearing decisions: (a) switch-axis flip (`enable_adaptive`/`KAOLA_ENABLE_ADAPTIVE` retired → `installed_paths: []`); (b) legality = {adaptive} ∪ installed_paths (`path_not_installed` typed refusal); (c) union re-install, uninstall removes config, reset = uninstall→reinstall; (d) no automatic fallback between paths (exhaustion floor inside adaptive); (e) dead code removed. Supersedes `0007-adaptive-default-under-switch-on.md`.

### 2. README.md — MIGRATED (11 hits resolved)
- § Adaptive workflow path: replaced `--enable-adaptive=no` / `enable_adaptive:true` install block with `--with-fast` / `--with-full` opt-in model.
- § Adaptive workflow (the default path): removed ON-switch / OFF-switch framing, per-session `KAOLA_ENABLE_ADAPTIVE` override, and Branch-B prose; replaced with unconditional-default description.
- § Other paths: removed "under the ON switch / OFF switch" framing; replaced with install-time opt-in model.
- § Full path: removed "default route only when the adaptive switch is OFF".
- `KAOLA_PATH` env-var table row: removed ON/OFF switch references; stated adaptive is unconditional default, `path_not_installed` refusal on non-installed path.
- `KAOLA_ENABLE_ADAPTIVE` env-var table row: DELETED.
- Bundle refusal table: `target_set_not_adaptive` → `bundle_requires_adaptive`.
- Bundle prose: updated matching sentence.

### 3. docs/architecture.md — MIGRATED (2 hits resolved)
- `adaptive` description: removed "opt-in via the `enable_adaptive` switch"; replaced with "the unconditional default".
- "No mid-run kill-switch" paragraph: removed `enable_adaptive` / switch references; reframed as "no per-session toggle halts a frozen plan".

### 4. docs/conventions.md — MIGRATED (2 hits resolved)
- Entire "Switch-ON path guard — reciprocal `authoring-allowed`" section replaced with new "Adaptive is the Default; Fast/Full are Install-Time Opt-ins (#538)" section covering: path legality, unconditional router, `authoring-allowed` always allows, no auto-fallback, bundle refusal renamed.

### 5. docs/workflow-state-contract.md — MIGRATED (7 hits resolved)
- `workflow_path` field description: updated default from `full` to `adaptive`; replaced switch whitelist with `installed_paths` legality + `path_not_installed` refusal.
- `## Adaptive Path Switch (enable_adaptive)` section replaced with `## Adaptive Path — installed_paths Config Field (#538)` covering: `installed_paths` default `[]`, `resolveInstalledPaths`, install.sh union semantics, legality gate, finish-in-flight.

### 6. docs/api.md — MIGRATED (6 hits resolved)
- Bundle refusal table: `target_set_not_adaptive` → `bundle_requires_adaptive` (with `result: refuse`).
- `KAOLA_TARGET_ISSUES` env description: `target_set_not_adaptive` → `bundle_requires_adaptive`.
- Global config JSON example: `enable_adaptive: false` → `installed_paths: []`.
- `enable_adaptive` field description replaced with `installed_paths` description (type, default, resolver, no env override, pointer to state-contract doc).
- Plan-validator toggle-agnostic note: removed `enable_adaptive`/`KAOLA_ENABLE_ADAPTIVE` references; replaced with "never reads `installed_paths` or any path-selection config".
- Authoring-entry guard: replaced ON/OFF switch description with unconditional-allow description.

## Verification results

### Retired-vocab grep (ZERO)
`grep -nE "enable_adaptive|KAOLA_ENABLE_ADAPTIVE|resolveEnableAdaptive|target_set_not_adaptive|workflow_path_refused|adaptive switch (is |on|off)" README.md docs/api.md docs/workflow-state-contract.md docs/architecture.md docs/conventions.md`
Result: zero matches.

### Code cross-check (ALL CONFIRMED)
`grep -nE "resolveInstalledPaths|INSTALLED_PATHS_FIELD" scripts/kaola-workflow-adaptive-schema.js`
- L393: `const INSTALLED_PATHS_FIELD = 'installed_paths';`
- L413: `function resolveInstalledPaths(config) {`
- L622: exported `INSTALLED_PATHS_FIELD`
- L626: exported `resolveInstalledPaths`

`grep -nE "path_not_installed|bundle_requires_adaptive" scripts/kaola-workflow-claim.js`
- L831: comment mentioning `path_not_installed` typed refusal
- L840: `status: 'path_not_installed'` in the refusal envelope
- L1270: `status: 'bundle_requires_adaptive'` in the bundle refusal

Every symbol and config key documented in the six files matches exactly what is in the code. No invented names, no fictional fields.

### Supplementary code cross-check (post-advisor)

`grep -nE "with-fast|with-full" install.sh`
- L48, L55, L57-58, L104, L107: `--with-fast` and `--with-full` flags confirmed in install.sh usage and arg-parse.

`grep -nE "authoring_allowed|authoring_refused" scripts/kaola-workflow-claim.js`
- L1361: `status: 'authoring_allowed'` confirmed present; `authoring_refused` has ZERO occurrences.

`grep -n "installed_paths" install.sh scripts/kaola-workflow-classifier.js`
- install.sh L50, L214, L704-740: `installed_paths` written and read by installer.
- kaola-workflow-classifier.js L175: `installed_paths: []` in defaults object.

All three supplementary checks pass. Every documented symbol is real.
