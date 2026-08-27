# PR #1041 final adversarial verification

behavior: adversarial-verifier

candidate: `0884a8347828b2c77d969d639196724af26d0905`

base: `b78d006c28a3849b3bcbceffdd1ebc07f2ef5115`

## Exact claim

本地 `install-all.sh` 只安装当前机器并绝不部署 Cursor Cloud；仅当 Agent 已确立自己正在 Cursor Cloud environment setup 内时，Cloud 路径才直接安装 remote authority + selected repo，用户手动 Save 后在同一 repo 打开新顶层 Cloud Agent；该流程与 standalone CLI point-of-use materialization、Cursor App local IDE 清晰隔离。

## Exact surface

PR #1041 / Issues #1037 and #1039; the diff from the supplied base to the supplied candidate; generated-source and actually rendered Cursor next/finalize guidance; `install-all.sh` arguments and fixture behavior; `install-cursor.sh` and `kaola-workflow-cursor-surface.js` doctor behavior; ambient-repository and `sessionStart` mutation paths; the recorded standalone CLI, Cursor App local IDE, Cloud negative/positive evidence; and the exact all-four receipt.

## Execution result

The verification execution completed successfully and stayed read-only with respect to tracked/product files. Disposable render, doctor, and install fixtures were written only below `/tmp` and moved recoverably to Trash after inspection. The candidate worktree stayed clean at exact HEAD.

The analytical result is **refuted**. The install-all/ambient/sessionStart/generated-guidance parts survived concrete attack, but the doctor loses current Build/catalog identity, and the live PR description still contradicts the final candidate and evidence.

## Canonical findings

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=doctor reports the historical successful Cloud evidence Build and catalog as the current runtime_build/catalog even when no current authority, project target, or Build identity was observed

### R1 — doctor turns a historical Cloud evidence stamp into current effective identity

- failure_class: claim-to-implementation gap / false effective-state identity
- trigger: invoke the candidate doctor in a fresh empty HOME with only caller-supplied `--product app --host cloud`; provide no project target, no authority receipt, no project receipt, and no Cursor Build identity.
- primary anchor: `scripts/kaola-workflow-cursor-surface.js:677-703`, especially `:690` and `:696`, flatten `selected.stamp.runtime_build` and `selected.named_catalog` into the top-level effective report.
- secondary anchors:
  - `templates/agents/runtime-capabilities.json:455-472` correctly stores Build `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2` as an evidence stamp for one observed run.
  - `docs/api.md:1596-1597` calls this an effective-state reporter with honest unknowns.
  - `scripts/test-cursor-edition.js:1733-1767` asserts the flattened historical catalog but has no counterexample for a different/unknown current Build; it therefore entrenches rather than detects the identity loss.
- exact reproduction:

  ```text
  doctor_root=$(mktemp -d /tmp/kw-pr1041-doctor.XXXXXX)
  HOME="$doctor_root/home" CURSOR_HOME="$doctor_root/cursor" \
    bash ./install-cursor.sh --doctor --json --product app --host cloud
  ```

- observed result:

  ```json
  {
    "runtime_build": "bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2",
    "named_catalog": "project_custom_from_saved_environment_build",
    "effective_profile_scope": "none",
    "freshness": "missing",
    "project_target": null,
    "materialization_receipt": null,
    "capability_gap": null
  }
  ```

  The command was executed on this local Mac against a new empty synthetic home. It had no way to observe that Cloud Build or a live Task catalog, yet reported both as if selected/current. `evidence_stamp` already carries the correct historical meaning; the unqualified top-level `runtime_build` and `named_catalog` do not.
- consequence: a wrong/new Cloud environment can be diagnosed as the exact successful saved Build even though the same-repository/same-Build handoff was never established. This is the strongest requested “Build identity lost” counterexample and violates #1039 Acceptance 9's effective surface/build/catalog requirement.
- required acceptance shape: a RED fixture must distinguish historical measured evidence from current observed identity. Current `runtime_build`/live catalog should remain unknown unless independently supplied or observed; the historical Build belongs only under a clearly typed evidence stamp. The fix should not infer host/build from a sibling binary.

finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=live PR body still says do not merge and leaves CLI/local-App/fresh-Cloud proof unclaimed despite the final candidate and recorded evidence claiming all three surfaces

### R2 — live PR #1041 description is stale and contradicts the merge candidate

- failure_class: publication/finalization metadata mismatch
- trigger: read the live PR body at head `0884a8347828b2c77d969d639196724af26d0905`.
- primary anchor: <https://github.com/KaolaBrother/Kaola-Workflow/pull/1041> (queried with `gh pr view 1041 --json ...`).
- secondary anchors: `README.md:300-327`, `templates/agents/runtime-capabilities.json:400-472`, and the run's `.cache/final-live-surface-evidence.md` carry the corrected final lifecycle.
- observed contradictions in the live body:
  - it literally says `Do not merge from this agent. Cursor CLI is left for the final reviewer.`;
  - its Cloud section still reports the old built-in-only Path B and says project files were already present, rather than the later checked-in-only and user-global-only negative controls plus the selected-repository saved-Build positive;
  - it explicitly says local Cursor IDE, fresh pre-boot Cloud, Cursor CLI re-probe, and Cloud boot-load are not claimed;
  - it reports stale assertion counts and says the full walkthrough/all-four chains were not run.
- counterevidence: the candidate now records CLI exact named dispatch, local App exact named dispatch, the final saved Cloud Build/parent/child token, 774/798/275 focused assertions, and an exact clean all-four receipt. A corrected body is already drafted at `.cache/pr-1041-final-body.md`, but it is not the live PR body.
- consequence: the public merge surface tells the merger not to merge and describes an obsolete behavior/evidence state. It must be replaced before merge/issue closure.

## Counterexample sweep that did not break the remaining claim

### Candidate and PR/Issue identity

- `git rev-parse HEAD` returned exactly `0884a8347828b2c77d969d639196724af26d0905`; status, index diff, and worktree diff were clean.
- `gh pr view 1041` returned OPEN, not draft, MERGEABLE/CLEAN, head exact `0884a834...`, base `main`; Issues #1037/#1039 remain OPEN and claimed.
- `git diff 101250f293a5439ed73e8ee2127c7501fba9e883..0884a834...` changes docs, tests, `install-all.sh` boundary prose, and the machine adapter, but not `install-cursor.sh`, `kaola-workflow-cursor-surface.js`, or `sync-cursor-edition.js`. Thus the final Cloud install behavior exercised at `101250f...` has unchanged production bytes in the supplied final candidate; the new exact candidate's focused/static/chain tests cover the changed guidance and tests.

### install-all parameter and behavior attacks

- `KAOLA_CODEX_BIN=/definitely/not/a/codex ./install-all.sh --check --global --yes --forge=github` printed only seven current-machine commands. Cursor was exactly `bash .../install-cursor.sh --forge=github --global --yes`; there was no remote/dashboard/Cloud argument or call.
- `./install-all.sh --cloud` exited 2 at argument parsing. The focused fixture additionally proved no runtime marker exists after that refusal.
- `node scripts/test-install-all.js` passed 275 assertions. Its executable `--cloud` refusal is stronger than a pure phrase check. No arbitrary argument pass-through exists; the wrapper constructs each command from its closed parse table.
- Source inspection found no `curl`, `ssh`, Cursor dashboard API, environment Save, remote Build, or hidden Cloud option in `install-all.sh`.

### ambient repository and sessionStart attacks

- A real `install-cursor.sh --global --yes --forge=github` was run from a disposable Git repository with isolated HOME/CURSOR_HOME. Before/after Git porcelain were empty, the consumer `.cursor` stayed absent, and 14 global agents landed under the isolated Cursor home.
- `node scripts/test-cursor-edition.js` passed 774 assertions, including the installed global `sessionStart` hooks executed from an ambient consumer repository and byte-identity of the project's `.cursor` tree before/after.
- Fresh renders for GitHub, GitLab, and Gitea each contained exactly one standalone-CLI-local materialization branch in `workflow-next` and finalize, exactly one Cloud-confirmed setup/save/same-repository lifecycle statement, and only the compact-context command in `hooks.json`. No generated `sessionStart` materializer survived.

### CLI/App/Cloud isolation and persistence attacks

- The exact candidate renderer limits `--ensure-target "$PWD"` to standalone Cursor CLI on a local host and explicitly excludes both Cursor App local IDE and App-started Cloud.
- The focused Cursor suite mutation oracle rejected an omitted target, `--ensure-target "."`, and applying the CLI rule to App hosts.
- Recorded standalone CLI evidence identifies build `2026.08.25-3e8eec8`, explicit project materialization, exact custom `implementer`, resolved `cursor-grok-4.6-medium`, and token `PROBE_OK_CURSOR_CLI_NAMED_IMPLEMENTER`.
- Recorded local App evidence independently identifies Cursor.app 3.17.21, host `This Mac`, all 14 project roles, exact `implementer`, and token `PROBE_OK LOCAL_IDE_NAMED_IMPLEMENTER`; model/profile source remains explicitly unknown.
- Cloud negative controls are non-vacuous: a branch catalog not installed by the environment Build and a saved user-global-only Build both stayed built-in-only.
- The final positive record binds setup run `bc-f53aa0ae-975b-4aab-8c4c-0c72584c33b4`, exact tested source `101250f293a5439ed73e8ee2127c7501fba9e883`, saved Build `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2`, new same-repository parent `bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d`, exact child `bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49`, and exact token `PROBE_OK_CURSOR_CLOUD_FINAL_SAVED_REPO_IMPLEMENTER`. The record includes receipt/authority binding, 14-agent count, two-cycle byte idempotence, and a modified-byte fail-closed negative.
- I did not independently re-open the private Cursor dashboard during this read-only review; the exact IDs and observations above come from the run's durable evidence record. That evidence is internally consistent with the candidate adapter/docs. R1 means the doctor cannot itself prove the same current Build.

### Generation and test-to-claim attacks

- `node scripts/test-runtime-agent-architecture.js` passed 798 assertions. Its in-memory mutation checks remove the Cloud negative controls, host confirmation/setup/save lifecycle, same-repository Build handoff, install-all local-only boundary, ambient-write prohibition, and App/CLI host split; each semantic opposite is required to fail the guidance classifier.
- Direct candidate rendering (not the linked checkout's ignored generated tree) confirmed the same lifecycle and CLI guard in both shipped Cursor consumers for all three forges.
- The install-all test is armed for the specified `--cloud` bypass and for no installer execution after refusal. R1 is the remaining test gap: the doctor test asserts a historical catalog flattened into an effective report without challenging an empty/wrong current Build.

### Exact all-four receipt

- Receipt path: `/Users/ylpromax5/Workspace/Kaola-Workflow/kaola-workflow/bundle-1037-1039/.cache/chain-receipt.json`.
- It records head `0884a8347828b2c77d969d639196724af26d0905`, `workTreeHash: clean`, `codeTreeHash: 8a16e1b62308224a8a9a6e280f0de2a0a030dfea1f3f7a195acc203b2bfe38a1`, all-four scope from base `b78d006c...`, and Claude/Codex/GitLab/Gitea each exit 0 in one attempt with no signal, timeout, retry, waiver, or accepted RED.
- Independent strict check:

  ```text
  node scripts/kaola-workflow-run-chains.js --release-check \
    --candidate 0884a8347828b2c77d969d639196724af26d0905 \
    --receipt .../bundle-1037-1039/.cache/chain-receipt.json --json
  ```

  returned `result: pass` for all four chains.

## Confidence

High confidence in R1: it is a direct deterministic execution with an impossible current-Build observation and source/test anchors. High confidence in R2: the live forge response and candidate evidence directly disagree. High confidence in the non-refutation of the local install-all, ambient-write, sessionStart, generated-guidance, and exact-receipt subclaims. Medium confidence in the private Cloud runtime observation itself because this verifier inspected its durable exact-ID evidence rather than re-running the dashboard lifecycle.

## Receipt

Analytical result: **refuted**.

verdict: fail
findings_blocking: 2
