# R1 Codex version-source test repair

## Baseline and RED

- Baseline candidate: `febc1411772d08132316a969d2d0d3bda625cce2`.
- The new R1 guard was run against that candidate with the original suite-global assignment still
  present:

  ```text
  env -u KAOLA_CODEX_VERSION node scripts/test-install-model-rendering.js
  ```

- Exit: `1`.
- New RED leg / failure signature: `#1036 R1: the suite must not mutate
  process.env.KAOLA_CODEX_VERSION globally` — `AssertionError [ERR_ASSERTION]`, actual
  `0.145.0`, expected `undefined`, at `scripts/test-install-model-rendering.js:38:8`.
  This is the expected failure proving the old module-global attestation was observable.

## Repair

- Removed the module-global `process.env.KAOLA_CODEX_VERSION = ...` mutation.
- Added `withCodexVersionAttestation()` in `scripts/test-install-model-rendering.js:33-35` and
  applied it only to preflight/doctor child calls and direct preflight calls that assert properties
  beyond the version gate. Direct in-process calls carry the same floor as their explicit
  `codexVersion` option.
- Preserved the explicit precedence cases: `--codex-version 0.144.9` and `0.145.0`/`0.146.2`
  flag checks remain un-attested, while the explicit child env `KAOLA_CODEX_VERSION=0.140.0`
  check remains unchanged.
- Added a hermetic fake `codex` fixture at `scripts/test-install-modeling.js:3484-3521`. It removes
  `KAOLA_CODEX_VERSION` from the child environment, puts an executable fake binary first on
  `PATH`, records that `codex --version` was invoked, emits an unparsable version, and asserts
  `status=7`, `detected_version=null`, and `detected_version_source=unavailable`.

## Final validation

- Full focused suite, with no real `codex` on the child `PATH` and no parent version override:

  ```text
  env -u KAOLA_CODEX_VERSION PATH="<hermetic-node-dir>:/usr/bin:/bin" \
    /Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/node scripts/test-install-model-rendering.js
  ```

  Result: exit `0`, `Install model rendering tests passed`.
- Final assertion count: `1,493` (`ASSERT_COUNT=1493` from an instrumented run; the baseline
  candidate test contained `1,487`).
- A normal `env -u KAOLA_CODEX_VERSION node scripts/test-install-model-rendering.js` run also
  exited `0` with `Install model rendering tests passed`.

The only repository test source edited for this repair is
`scripts/test-install-model-rendering.js`; production preflight code was not changed.
