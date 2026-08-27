# Code review closure: PR #1038 repair 0501f252

## Closure identity

- Prior finding: R1 from `.cache/code-review.md`
- Prior candidate: `febc1411772d08132316a969d2d0d3bda625cce2`
- Repair candidate: `0501f2527e04c1ecd896df418e50c97b279aa568`
- Repair delta: `febc1411772d08132316a969d2d0d3bda625cce2..0501f2527e04c1ecd896df418e50c97b279aa568`
- Closure surface: prior R1 plus the two-file repair delta only; unrestricted PR discovery was not reopened

## Prior finding disposition

### R1 - Suite-global Codex version attestation makes the live binary fallback unreachable

Status: resolved.

- The candidate removes `if (!process.env.KAOLA_CODEX_VERSION) process.env.KAOLA_CODEX_VERSION = '0.145.0'`; no suite-global assignment remains.
- `withCodexVersionAttestation()` returns a copied child environment with the floor version. It is applied only to preflight invocations whose acceptance assertion lies beyond the version gate. In-process `runPreflight` fixtures receive the equivalent `codexVersion` option rather than mutating `process.env`.
- The original post-version acceptance assertions remain unchanged: profile/config/trust/autofix/doctor expectations still assert the same statuses, output fields, and repaired bytes. The repair changes only how those fixtures cross the prerequisite version gate.
- Explicit flag precedence remains exercised by `--codex-version 0.144.9` with `detected_version_source=flag`. Explicit environment precedence remains exercised by child `KAOLA_CODEX_VERSION=0.140.0` with `detected_version_source=env`. Floor and above-floor flag cases remain present.
- The new hermetic fallback fixture creates a controlled `codex` executable, removes `KAOLA_CODEX_VERSION` from the child environment, and prepends the fake binary directory to `PATH`. The fake writes a marker and emits no parseable version. The test requires exit 7, null detected version, source `unavailable`, and exact marker bytes. The marker proves the binary fallback was actually invoked rather than merely classified by source prose.
- Running the whole suite with the parent variable unset and with the parent variable explicitly below floor both passed. Same-process wrappers confirmed the parent value remained respectively `undefined` and `"0.140.0"` after the suite completed.

finding: id=R1 scope=in_scope action=none status=resolved severity=medium fix_role=tdd-guide rationale=scoped-child-attestation-and-hermetic-no-env-probe-restore-the-live-fallback-frontier

## Repair-delta regression review

- Read all changes in `scripts/test-install-model-rendering.js` and `scripts/test-cursor-edition.js`.
- The install-model changes are confined to test setup, per-child preflight prerequisites, and the new fallback oracle. No production preflight source changed.
- The Cursor delta replaces checks against exported residue with an oracle over the generated `workflow-next` and `kaola-workflow-finalize` consumers, then mutation-proves the authority-to-generated-byte path in a throwaway source tree. It does not alter product generation or tracked outputs.
- The Cursor mutation fixture copies only its required source trees into a temporary directory, verifies the generator resolves that directory, regenerates there, reverses the Path B relation, and requires both generated consumers plus the child oracle to go red. Temporary state is removed in `finally`.
- No repair-delta regression met the admission threshold.

## Commands and evidence

1. Exact candidate and delta:

   `git status --short`

   Clean worktree.

   `git rev-parse HEAD`

   Result: `0501f2527e04c1ecd896df418e50c97b279aa568`.

   `git diff --stat febc1411772d08132316a969d2d0d3bda625cce2..0501f252`

   Result: two test files, 267 insertions, 47 deletions.

   `git diff --check febc1411772d08132316a969d2d0d3bda625cce2..0501f252`

   Passed.

2. Parent environment unset:

   `env -u KAOLA_CODEX_VERSION node scripts/test-install-model-rendering.js`

   Exit 0: `Install model rendering tests passed`.

3. Parent environment explicitly below floor:

   `KAOLA_CODEX_VERSION=0.140.0 node scripts/test-install-model-rendering.js`

   Exit 0: `Install model rendering tests passed`. Scoped child attestations prevent unrelated acceptance tests from being redirected to the version refusal, while the explicit env-precedence fixture still supplies and verifies its own below-floor value.

4. Same-process no-mutation checks:

   `node -e "const before=process.env.KAOLA_CODEX_VERSION; require('./scripts/test-install-model-rendering.js'); if(process.env.KAOLA_CODEX_VERSION!==before) throw new Error('parent env mutated'); console.log('parent env unchanged:', JSON.stringify(before));"`

   Exit 0; reported `parent env unchanged: undefined`.

   The same wrapper under `KAOLA_CODEX_VERSION=0.140.0` exited 0 and reported `parent env unchanged: "0.140.0"`.

5. Repair-delta Cursor coverage:

   A standalone local clone was checked out at exact candidate `0501f2527e04c1ecd896df418e50c97b279aa568`; all three ignored Cursor forge trees were generated inside that clone; `node scripts/test-cursor-edition.js` passed 854 assertions with `.cursor`, `.cursor-gitlab`, and `.cursor-gitea` in parity.

## Closure result

R1 is resolved. The repair removes the global mutation, scopes attestations without changing unrelated acceptance meaning, retains explicit flag and environment precedence coverage, and genuinely exercises the no-env binary fallback. No new repair-delta findings were admitted.

verdict: pass
findings_blocking: 0
review_conclusion: The repair fully closes R1 with scoped child attestations, preserved precedence assertions, and a mutation-resistant hermetic binary fallback proof.
