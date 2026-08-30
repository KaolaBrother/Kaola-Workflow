# Issue #1046 runtime live matrix

Measured on 2026-08-31 (Asia/Shanghai). This file is the run evidence index, not a product
contract. The source of truth for product behavior remains the frozen candidate and its receipts.

## Frozen candidate and installation

- Candidate: `bd766e8f47ca04ae716870d441bc9f4d8ea17d50`
- Code-tree hash: `40556f924b287181e64c0b4425b2ac66e49650fac29d55d72df7fcce5f92e9e1`
- Universal source: `templates/global/kaola-workflow-global.md`
- Universal source size: 3,293 bytes, 58 logical lines (`wc -l` reports 57 newline characters)
- Universal source SHA-256: `f4c3cc736fafa606ba34b84ebf0ac5ecfb1b6b7ac696c49bb551849fe418e841`
- Runtime registry SHA-256: `ae71dc1d80c9e7c414bf53b8cd5190b8be1d40ca2524798f299e811679c45aac`
- Live nonce: `KW1046_GLOBAL_LIVE_bd766e8f`
- Local batch receipt: `/Users/ylpromax5/.config/kaola-workflow/global-contract-receipt.json`
- Exact-candidate chain receipt: `kaola-workflow/bundle-1046/.cache/chain-receipt.json`
- Release-candidate install: `./install-all.sh --yes` PASS; `./install-all.sh --check` PASS before
  the live nonce was installed.

The live probe prompt is `probe-prompt.txt`; the post-compact prompt is
`compact-probe-prompt.txt`. Neither prompt contains the nonce, project-token value, recovery-marker
value, or a guessed answer. Both forbid tools and file reads. The disposable project instruction
is `probe-repo/AGENTS.md`; its only probe values are `KW1046_PROJECT_LOCAL_bd766e8f` and
`project-local`. No instruction defines a negative token.

## Render and carrier measurements

| Render / carrier class | Bytes | SHA-256 or observation |
|---|---:|---|
| universal source | 3,293 | `f4c3cc736fafa606ba34b84ebf0ac5ecfb1b6b7ac696c49bb551849fe418e841` |
| ordinary rendered body with live nonce | 3,313 | `8e0e50e2f58e3c24f3aa702384ca31fc0be5dc563b64e4eedd29890f4a6dcf9f` |
| managed AGENTS carrier with live nonce | owner-dependent | `1af34142867b8fc65d0a7d4e9956391d1f6332f6ad2402d64ba45943ab596e04` on this machine |
| Grok persistent V2 Rule with live nonce | 7,184 | `4438b201cfcb6ff967ccb339e4b5e5cbb205f6222061f20e7c7de2487208e00b` |
| Cursor V2 Rule body with live nonce | 8,499 | same semantic V2 framework as local/cloud Rule |
| Cursor `.mdc` with live nonce | 8,671 in Cloud probe | `69a5756e05d3b187f0d63d17e827e6faaae28f4fbb809e23e3566095ae1ab333` |
| old full project AGENTS template | 5,404 | removed from new project initialization |
| new minimal project AGENTS template | 1,308 | project facts, commands, constraints, validation, docs, local overrides only |

The installed operation prompts keep the dispatch contract always loaded. No pre-tool or post-tool
hook injects this framework. Claude and Codex use a static `SessionStart(source=compact)` recovery
block; Grok and Cursor use their persistent V2 Rule; OpenCode, Kimi, and ZCode reload only on a new
session/task because no native compact lifecycle was measured for them. There is no runtime JS
prompt composer.

## Live runtime results

| Runtime / host | Version / locator | Fresh-session response and reload evidence | Status |
|---|---|---|---|
| Claude Code local | 2.1.246; exact runner session `claude-code-kaola-1046-live`; capture SHA `59e338a182a41a8952b38ef205ca8a6e1d6823f4a05569375e0fcb5c2f3e42a2` | The CLI reached its native trust and external-CLAUDE import approvals, but the model request could not start. `claude auth status` is `loggedIn:false`; browser login showed the account has been on hold since 2025-03-09. No `ANTHROPIC_API_KEY` is present, so no model-context verdict is inferred. The owner explicitly accepted the already-passing install, static-render, SessionStart/compact-hook, composition, and regression evidence as sufficient for this runtime and directed that the unavailable live model leg be skipped. | `OWNER_ACCEPTED_MECHANICS`; live model response not executed |
| Codex local | 0.150.1; ephemeral thread `01a0545f-d868-7640-ad25-4bdce2a3977c`; compact thread `01a05460-50c1-7493-925b-27c8b5aef55d` | `{"contract_nonce":"KW1046_GLOBAL_LIVE_bd766e8f","project_token":"KW1046_PROJECT_LOCAL_bd766e8f","project_precedence":"project-local","negative_token":null,"recovery_marker":null}`. After native `/compact`, UI showed `SessionStart hook (completed)` and the static compact block; response was `{"recovery_marker":"KW-COMPACT-RECOVERY-V2","reload_route":"Workflow Next prompt or Kaola-Workflow Finalization prompt, depending on mission completion","dispatch_loaded":true}`. | PASS |
| OpenCode local | 1.18.23; `opencode-kaola-1046-live`; capture SHA `0f6aa76f5d839a925dad0c5e0d3114bcb2360f153998a324ebd884e87cdd49b1` | `{"contract_nonce":"KW1046_GLOBAL_LIVE_bd766e8f","project_token":"KW1046_PROJECT_LOCAL_bd766e8f","project_precedence":"project-local","negative_token":null,"recovery_marker":null}` in a new native session without tool use. | PASS |
| Kimi Code local | 0.39.1; `kimi-cli-kaola-1046-live`; capture SHA `1f73e2553adc515f7ff833244957ab680ee68564eee9b74dfedf9213ed0e936d` | Same expected positive/project/negative response in a new native session; no compact-only marker was claimed. | PASS |
| Grok CLI local | 1.0.13 (`5e9a58528b76`); `grok-kaola-1046-live`; capture SHA `783536cfaea8eec59ed5441fefe4196716b0e9417dd505cbe00ccbbdc1b0664f` | Fresh response contained the global nonce, project values, `negative_token:null`, and `KW-COMPACT-RECOVERY-V2`. Native `/compact` completed in 16 s; post-compact response was `{"recovery_marker":"KW-COMPACT-RECOVERY-V2","reload_route":"Workflow Next","dispatch_loaded":true}`. | PASS |
| Cursor CLI local | 2026.08.25-3e8eec8; `cursor-cli-kaola-1046-live`; capture SHA `369c392c7f896470299927b1471d31c54394a29bd36c9b044dbb5c513a80648a` | Fresh response contained the global nonce, project values, `negative_token:null`, and V2 marker. Native `/compact` returned the V2 recovery marker, Workflow Next reload route, and `dispatch_loaded:true`. | PASS |
| Cursor App local | 3.18.9; new App Agent in the disposable probe repository | `{"contract_nonce":"KW1046_GLOBAL_LIVE_bd766e8f","project_token":"KW1046_PROJECT_LOCAL_bd766e8f","project_precedence":"project-local","negative_token":null,"recovery_marker":"KW-COMPACT-RECOVERY-V2"}` without tool use. | PASS |
| Cursor Cloud | Environment `9116f5fb-a1f4-11f1-b532-320a589b8025`; probe branch `probe/issue-1046-cloud-live`; commit `4ac80cf3e6e4eea1aaea1bb6826eb7fa2584abd2`; candidate setup Agent `bc-c14d2d1f-8ff7-4b51-88d4-a115bf34e3e4`; candidate Build `bld-20260830-c4504be8-22ce-4d21-aaa8-c4e080db946b`; carrier child `bc-90278e2e-e405-5f61-a37d-9b487a2224ab`; no-tool subagent `bc-ead63cc6-ea6b-5b5c-8131-9eb65d6748ca` | Three earlier top-level no-tool probes returned all `null`, proving that feature-branch bytes plus a generic main Build are insufficient. Candidate installation, doctor/current, `check-cloud`, idempotence, hashes, receipts, empty hook sets, snapshot, Draft Build, and exact cold boot all passed. The second cold child was also bound to the exact Draft Build (`warmFork=cold`, requested branch/HEAD) and returned all `null` before tools; Cursor documents subagents as isolated contexts receiving their task prompt, so this result proves that a Cloud subagent cannot substitute for a restarted top-level Agent. The platform requires a default-branch Build to be saved/active before that top-level semantic test. No Save, fallback, or semantic PASS claim occurred. | `CANDIDATE_BUILD_VERIFIED`; `TOP_LEVEL_SAVE_REQUIRED` after publication |
| ZCode App local | 3.10.1; new project and new GLM-5.3 highest task | `{"contract_nonce":"KW1046_GLOBAL_LIVE_bd766e8f","project_token":"KW1046_PROJECT_LOCAL_bd766e8f","project_precedence":"project-local","negative_token":null,"recovery_marker":null}` without tool use. No old pre/post tool hook block appeared. | PASS |

All exact runner sessions were stopped through their native runner controls after capture. A null
`negative_token` establishes absence of ambient answer leakage in the combined fresh-session probe;
it does not claim that an installed carrier was deleted from the user's real HOME. The hermetic
installer suites separately cover install/check/uninstall and carrier absence.

## Cursor Cloud capability evidence

The probe branch was installed with the candidate's `install-cloud` path and then pushed without
history rewriting. The remote Rule, materialization receipt, and project AGENTS hashes match the
local probe. Two independent fresh Cloud Agents still returned null before using tools. This
falsifies the premise that a project Rule merely existing on a feature branch is sufficient for
Cloud context discovery in every environment configuration.

Current Cursor documentation says:

- an Agent-driven setup verifies the environment and creates a successful Build before the
  environment is saved;
- a Build clones default branches, runs the saved `install` command, snapshots disk state, and only
  then becomes active;
- feature-branch source is checked out on top of the active Build;
- Cloud Agents read project `AGENTS.md`;
- new Agents use the latest successful active Build, whose ID is observable.

Sources:

- https://prod.cursor.com/docs/cloud-agent/setup
- https://cursor.com/docs/cloud-agent/builds
- https://cursor.com/docs/cloud-agent
- https://cursor.com/docs/subagents
- https://docs.cursor.com/context/rules-for-ai

The first dashboard `/env-setup` was launched from `main`, so it only validated the environment's
old global-only install script. Its draft Build `bld-20260830-5a77553e-c9c4-4a39-b03a-31e8d9cf818c`
succeeded and a fresh cold Agent `bc-81418faa-0558-5138-a99b-3133393df452` proved exact Build
binding, but no candidate install or Save occurred. A later top-level Agent on the probe branch
still used recurring Build `bld-20260830-12ea7590-2de4-4e64-aeab-a9ea57013442` and returned all
null. This agrees with the historical Cursor negative control: a catalog/Rule merely checked out on
a feature branch is insufficient.

The candidate-bound setup subsequently proved the intended install transaction on the exact
feature-branch candidate. Its Build install ran `./install-cursor.sh --global`,
`./install-cursor.sh --target "$PWD"`, and `install-cloud --target "$PWD"`; Build start repeated the
two project materializations after `reuse_then_checkout`. Build
`bld-20260830-c4504be8-22ce-4d21-aaa8-c4e080db946b` succeeded from ready snapshot
`snapshot-20260830-5012e66a-6950-4c40-b97c-6491e38f56a9`. Cold child
`bc-90278e2e-e405-5f61-a37d-9b487a2224ab` reported `warmFork=cold`, the exact requested Build,
branch, HEAD, candidate ancestry, source hash, Rule hash, and `check-cloud=CURRENT`. It also exposed a
receipt-path limitation: checkout restored the tracked receipt's original macOS probe root while
live check resolved `/workspace`; Rule bytes stayed current, so this is stale receipt metadata rather
than missing carrier state.

The platform rejected promotion with the explicit constraint that a Build created from a
non-default branch ref can be tested but cannot become active. It also rejected the environment JSON
proposal carrying that Build ID because branch-override Builds cannot back a saved environment. The
candidate setup therefore stopped without Save or fallback. The measured acceptance sequence is:

1. before publication, use a candidate-bound draft Build to prove installation, exact boot binding,
   hashes, receipts, hook absence, and cold-start carrier survival;
2. after the exact candidate is published on the default branch, build and save the same transaction
   without branch overrides;
3. start a new top-level same-repository Agent whose boot record names that active Build and run the
   no-tool semantic probe before any file/tool read.

An additional exact-Build cold subagent `bc-ead63cc6-ea6b-5b5c-8131-9eb65d6748ca` returned
`{"contract_nonce":null,"project_token":null,"project_precedence":null,"negative_token":null,"recovery_marker":null}`
before any tool or file read. Its boot record resolved
`bld-20260830-c4504be8-22ce-4d21-aaa8-c4e080db946b` with `gitSetup=reuse_then_checkout`,
`warmFork=cold`, and the requested feature branch/HEAD. Cursor's subagent documentation describes an
isolated context receiving the task prompt; it does not promise inheritance of repository rules.
This is therefore a measured negative control, not a product failure and not a substitute for step
3. The top-level semantic gate intentionally remains post-publication, after Save and restart.

## Automated candidate evidence

- producer chains: 4/4 PASS on the frozen candidate;
- canonical `npm test`: PASS;
- walkthrough: 179/179 scenarios, 2,118 spawns;
- global-contract focused suite: 154 PASS;
- runtime architecture suite: 784 PASS;
- prompt-framework suite: 153 PASS;
- routing suite: 506 PASS;
- install-all suite: 275 PASS;
- all affected edition suites, generated checks, and mirror checks: PASS.

Any production-byte mutation invalidates this matrix and requires a new frozen candidate plus live
rerun. After live probing, candidate
`node scripts/kaola-workflow-global-contract.js install --json` was run without a nonce and returned
`INSTALLED`; the following `./install-all.sh --check` reported every installed local target
`CURRENT` and Cursor Cloud `REMOTE_REQUIRED`. The machine therefore ended the candidate probe on the
formal no-nonce receipt, not on the temporary live-probe render.
