# Execution log — independent keep-open candidate run

All recorded times are UTC. Paths below are relative to this v2 cache unless absolute. The first accepted test-spec, baseline harness, and 19 model-input artifacts remain under `inputs/first-*`; their prior checks were not rerun. This log distinguishes child process exits from assertion outcomes.

## Frozen source reconstruction

Authority was only `inputs/base-archive.tar` (SHA256 `e90846c5eac169ac2ade8afd65249c70c46dfb26a06571507398ec024921f594`, commit `fe7e4443a8c367cfc111c65755191ae6790e810e`) plus `inputs/candidate.diff` (SHA256 `0e582b2fb5e488e17510b7649973773f25e4c720b1bc7c84f3fafe3c7a450235`). No changing Grok worktree was read.

- Initial extraction used `/usr/bin/tar -xf <base-archive.tar> -C candidate-source-reconstruction-verify`, exit 0. The subsequent absolute `git apply --directory=<absolute reconstruction/provider path> <candidate.diff>` exited 128 because Git rejected the absolute directory argument. Its raw output and exit marker are retained under `runs/candidate-reconstruction-verification/`.
- Reconstruction attempt 02 used `/usr/bin/git apply --directory=kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-02/provider-fe7e4443a8c367cfc111c65755191ae6790e810e <absolute candidate.diff>`, exit 0. Verification was RED: the inventory digest differed (`53b6d8658f862614949be51b1ddfca72174b913d23c069de48e00e336d47be24` vs expected `e2804f4605a402fc442e2e24e0350c1e08c240782c5ec225fbe7860dc57e1b9c`) and not all patched payloads matched.
- Attempt 03 used the same command with `candidate-source-reconstruction-verify-attempt-03`, exit 0. Patched payloads matched, but inventory verification remained RED (`44572d88203085256786ba1b7d06b6e81dd63db396fa72caa5cfa6de05fb6dec` vs expected `e2804f4605a402fc442e2e24e0350c1e08c240782c5ec225fbe7860dc57e1b9c`). Both failed verification receipts are retained and are not treated as candidate acceptance.
- Attempt 04 extracted with `/usr/bin/tar -xf <absolute base archive> -C <absolute candidate-source-reconstruction-verify-attempt-04>`, PID 96026, exit 0, `2026-10-02T12:24:38.382Z`–`12:24:39.291Z`; then ran `/usr/bin/git apply --directory=kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e <absolute candidate.diff>`, PID 96616, exit 0, `12:24:39.291Z`–`12:24:39.306Z`. The final receipt at `runs/candidate-reconstruction-verification-attempt-04/candidate-reconstruction-verification.json` is PASS: all 10,869 files, hashes, Git blobs, modes, symlinks, and all 25 patched payloads match. Inventory SHA256 is `e2804f4605a402fc442e2e24e0350c1e08c240782c5ec225fbe7860dc57e1b9c`; `scripts/kaola-workflow-sink-pr.js` SHA256 is `0a8be33171e6cacce497986360648454e2c094ecccdce8744c305b310ac52edc`; `scripts/kaola-workflow-claim.js` SHA256 is `3e5bab0b9129766e1e434c6f3bb37c5fbcb175c162d1af25f34bb56ab1b036b7`.

## Actual candidate process suite

Exact command:

```sh
KW_ISSUE_1113_V2_ROOT='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2' KW_CANDIDATE_SOURCE='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e' KW_REAL_RUNS_ROOT='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/runs/real-process-v2-attempt-07' KW_REAL_FIXTURES_ROOT='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/fixtures/real-process-v2-attempt-07' node '/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/proposals/run-real-suite.js'
```

Runner receipt: PID 90996, Node `/Users/ylmacstudio/.local/share/node-v24.21.0-darwin-arm64/bin/node` v24.21.0, CWD `/Users/ylmacstudio/Workspace/kaola-workflow`, start `2026-10-02T12:59:30.486Z`, finish `2026-10-02T13:00:13.236Z`, exit 1. Exit 1 is the suite's actual-candidate assertion result: 26/44 passed, 18 RED. It is not an infrastructure error. Parent environment whitelist and runtime source hashes are recorded in `runs/real-process-v2-attempt-07/suite-process.json`; raw parent stdout/stderr, candidate process argv/PIDs/cwds/times/exits/stdout/stderr, and per-scenario fixture custody are retained alongside it. The frozen source inventory was `e2804f4605a402fc442e2e24e0350c1e08c240782c5ec225fbe7860dc57e1b9c` both before and after execution.

The first attempt 06 included the two commit-message controls but compared their source HEAD against the identity-template base; both rows failed at that adapter expectation. The adapter was corrected to bind the fixture's expected `sourceHead` to the measured pre-process local Git ref. Attempt 07 then reran the full 44-row suite; both real commit-message refusal rows passed. Attempt 06 and its raw evidence remain preserved. No original v1 model/baseline checks were rerun.

## Actual malformed-input controls

Exact command:

```sh
KW_ISSUE_1113_V2_ROOT='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2' KW_CANDIDATE_SOURCE='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/candidate-source-reconstruction-verify-attempt-04/provider-fe7e4443a8c367cfc111c65755191ae6790e810e' KW_ISSUE_1113_KEEP_OPEN_TEST_ADAPTER='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/proposals/real-process-adapter.js' KW_REAL_RUNS_ROOT='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/runs/real-process-v2-controls-attempt-04' KW_REAL_FIXTURES_ROOT='/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/fixtures/real-process-v2-controls-attempt-04' node '/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/proposals/run-real-controls.js'
```

Runner receipt: PID 13732, Node v24.21.0, same MAIN CWD, start `2026-10-02T13:00:34.902Z`, finish `2026-10-02T13:00:50.948Z`, exit 0. Exit 0 means all actual processes/effect checks were recorded; it does not mean the refusal assertions passed. The sound positive control passed. All 15 malformed/duplicate refusal controls were RED and recorded `pr.create`, local `git.push`, `request.record`, and `archive` effects. Raw inputs, payload hashes, child process details, operations, and custody comparisons are in the controls summary and fixture tree.

## Integration proposal checks

`proposals/prepare-integration-bundle.js` was run by `runs/proposal-prep-final/process.json` (child exit 0). The builder was run from the verified attempt-04 candidate tree by `runs/proposal-build-final/process.json` (child exit 0). The resulting review-only artifacts are not applied. `integration-proposal-build.json` records package-chain names and hashes.

Five separate `node --check <bundle-file>` commands all exited 0; exact argv/PID/CWD/time/environment whitelist and raw output are in `runs/proposal-syntax-1/` through `runs/proposal-syntax-5/`. The files were the real-process adapter, GH spy, fault preload, 44-row suite, and malformed-input control runner.

Against a private scratch containing only candidate `package.json` and `docs/api.md`, both exact commands exited 0:

- `/usr/bin/git apply --check -p1 <absolute proposals/integration-proposal.diff>`; receipt `runs/integration-patch-check-final/process.json`.
- `/usr/bin/git apply --check -p1 <absolute proposals/testing-doc-proposal.diff>`; receipt `runs/testing-doc-patch-check-final/process.json`.

The `package.json` proposal registers the suite and controls in both `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full`. The producer chains themselves were not run here. Result-table generation reads preserved JSON only and ran no test processes; command receipt is `runs/result-matrix-generation-final/process.json`.

## Scope and evidence limits

Every fixture uses local Git repositories and a local logging `gh` spy. Issue number 143, PR number 206, repository URL, and PR URL are synthetic. Actual Forge calls: zero. Child test processes used the candidate CLI; the exec receipt plus seed receipts retain argv and all observed output. The adapter routes only measured values from child argv/results, the spy operation log, and fixture files/receipts. The synthetic run ledger used inside fixtures is not the Host's MAIN ledger.

No install, npm producer chain, public Forge request, shared-source/test/doc edit, MAIN tracked edit, ledger write, push, merge, finalization, claim release, archive, or cleanup was performed. Host owns final semantic acceptance and required producer-chain QA.

## Hash manifest generation

The final v2 file inventory is generated after this log and report are complete with `/usr/bin/python3 /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2/proposals/hash-artifacts.py /Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/keepopen-independent-pins-v2`. The command hashes every regular file and symlink target under the v2 cache; it excludes only `ARTIFACT-HASHES` and its `.sha256` sidecar to avoid self-reference. It writes the manifest and sidecar and prints the entry count and manifest SHA256.

An earlier invocation exited 0 with 116,680 entries and SHA256 `5df763487c31f28e72831916cd901be93d39594cc165a15a91d9ac7a06db7cf6`. That measurement preceded the final custody-helper/log edits and is superseded. The command is run once more after all provider files are final; `ARTIFACT-HASHES.sha256` carries that definitive manifest digest. No claim is made that the earlier digest seals later files.

The completed mirror uses `proposals/mirror-v2-evidence.py` to copy the final `runs/` and `proposals/` trees plus report, matrices, execution log, and hash files to the consumer v2 cache. The helper records each `ditto` and `diff -qr` argv/PID/time/exit and byte-tree comparison in the consumer-only `worker-evidence/v2-final/MIRROR-VERIFICATION.json`. It reuses the already-mirrored inputs, reconstructed source tree, and fixtures only after exact tree comparisons; this is new mirror-custody verification, not a candidate or model test rerun.
