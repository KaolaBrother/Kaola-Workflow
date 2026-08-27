# Final live Cursor surface evidence

candidate basis: PR #1041 baseline `8aebfaa823352320dc3b2e6e32a1a3a7e31ceca8` plus the current cohesive repair diff

## Standalone Cursor CLI / local

- Runtime: authenticated `cursor-agent` build `2026.08.25-3e8eec8`.
- Isolated user carrier: `/tmp/kw-pr1041-cli-live-bKuqH9/cursor-home`.
- Disposable consumer: `/tmp/kw-pr1041-cli-live-bKuqH9/consumer`.
- Candidate global install wrote a 17-file global authority receipt.
- Candidate explicit target install wrote a 17-file project materialization receipt.
- A fresh read-only probe used `--trust --print --output-format stream-json`, asked for the exact
  custom `implementer` type, and omitted a model override at the parent request.
- Parent session: `bb43a8fd-fbee-44f8-900c-c9e24cb1d21c`.
- Raw Task carrier:
  - `subagentType.custom.name = implementer`
  - resolved `model = cursor-grok-4.6-medium`
  - requested agent id `b97d3c65-3cc8-45f0-a4e6-a327f55cb6b2`
  - returned child agent id `8ee26e61-8d7d-47bb-9f02-4f7c2ab680da`
- Child result was exactly `PROBE_OK_CURSOR_CLI_NAMED_IMPLEMENTER`; Task and parent both reported
  success. The consumer remained unchanged.

Verdict: the standalone CLI/local surface reaches the explicit project catalog, exact named
dispatch, and profile tier carrier. This does not prove Cursor App behavior.

### Published 10.0.1 global-upgrade migration

- A clean `kaola-workflow--v10.0.1` archive generated and installed the old Cursor global edition
  into three isolated homes, one each for GitHub, GitLab, and Gitea.
- The current candidate then upgraded each same home without a pre-existing receipt. Adoption was
  allowed only for exact published 10.0.1 hashes; a mutation-backed unit fixture proves one changed
  byte returns to `unmanaged_collision`.
- All three upgrades produced a valid/current authority receipt, removed the exact retired ambient
  ensure script and both hook copies, and removed the old ensure/subagent-dispatch hook entries.
- Result matrix:
  - GitHub: `current`, receipt valid, retired files absent, stale hook entries absent.
  - GitLab: `current`, receipt valid, retired files absent, stale hook entries absent.
  - Gitea: `current`, receipt valid, retired files absent, stale hook entries absent.

Verdict: the release can converge receipt-less 10.0.1 installations without treating known
published bytes as user-owned collisions; any unproved or modified path still fails before mutation.

## Cursor App / local IDE

- Runtime: `Cursor.app 3.17.21 (8f2a112cb2845a97b75fd932ea5c470579ca4060)`.
- Host: Cursor Agents, `This Mac`, project catalog already present before the probe.
- The live catalog listed all 14 Kaola custom types and the exact `implementer` dispatch returned
  `PROBE_OK LOCAL_IDE_NAMED_IMPLEMENTER`.
- The probe made no tracked repository change.
- The App result did not expose the selected child model, effort, or profile source, so those fields
  remain unknown for this host.

Verdict: App/local IDE named dispatch is independently live; global discovery, materialization
necessity, reload, and model/profile observability remain unknown.

## Cursor App-started Cloud

- Fresh App-started Cloud chat, selected in the Cursor UI before send.
- Disposable branch: `probe/cursor-cloud-1041-20260827a`.
- Pre-boot commit: `ead40c2741f4cae7e0a0cb473bba8a8a4a80c7a6`.
- All 14 `.cursor/agents/*.md`, the three commands, compact hook, and `hooks.json` were
  git-tracked in that commit before the Cloud environment was created.
- The Cloud parent inspected only its live Task schema and made no file, shell, network, browser,
  commit, push, or child call.
- Complete live catalog:
  `generalPurpose`, `explore`, `computerUse`, `videoReview`, `cursor-guide`, `bugbot`,
  `security-review`, `best-of-n-runner`.
- Exact `implementer` was absent. Per the probe contract, the parent did not dispatch any
  built-in substitute.
- The Task schema exposes an optional model carrier and the parent session identified itself as
  Cursor Grok 4.6, but the catalog does not expose per-type profile source, path, hash, install
  origin, or profile-to-model binding.

Negative-control verdict: project profiles committed before Cloud boot were not the carrier used by
this host. This does **not** establish a Cloud capability gap. The corrected Cloud lifecycle is a
separate dashboard-managed remote environment: run the same global Cursor installer inside that
environment, save the environment manually, then start a fresh Cloud parent. That positive path is
being re-probed below.

### Saved remote-environment installation

- Dashboard environment: personal `KaolaBrother/Kaola-Workflow`, environment id
  `9116f5fb-a1f4-11f1-b532-320a589b8025`.
- Configured remote Install Script:
  `./install-cursor.sh --global --yes --forge=github`.
- The dashboard configuration was saved and the environment setup Agent was started from the
  Cursor environment editor. The new environment build shown during setup is
  `bld-20260827-aaac14bf-e980-4d1a-9600-e8b3fb2e031e`.
- Build status: `Success`, type `Config change`, ref `b78d006`, started 23:25 and completed 23:28
  local time. The build log records the installer at 15:25:40Z writing 14 agents to
  `/home/ubuntu/.cursor/agents`, commands, support scripts, hooks, and `hooks.json`, then exit 0;
  the snapshot became ready at 15:27:08Z and warming completed at 15:28:09Z.
- The dashboard Save action was the config-change transaction that produced this build. A new Cloud
  parent was then started directly from the build: `bc-f2f0f15f-31d9-416a-9952-35243def5561`.
- The fresh parent's live Task catalog contained 23 types: nine native Cursor routes followed by all
  14 Kaola profile names (`adversarial-verifier` through `tdd-guide`). Exact `implementer` was a
  first-class `subagent_type`, not a substitute.
- It dispatched exact `implementer` once with no `model`, `resume`, or other override. Task call
  `call-a82cb94e-579a-4375-84a5-8f916cab8944-0` created child
  `bc-63c79c19-f9fb-5892-970e-bb1606ad1a3b`.
- The child returned exactly `PROBE_OK_CURSOR_CLOUD_SAVED_ENV_IMPLEMENTER`, with no extra text.
- The Task result exposed neither the selected child model nor the profile path, file, tier/effort
  binding, or inherit/profile-default source, so those facts remain unknown for this host.

Positive-control verdict: Cursor Cloud named roles are supported when the Cursor edition is
installed inside the dashboard-managed remote environment, the user saves that environment and its
snapshot completes, and a fresh Cloud parent starts from the saved build. Project files committed in
the repository alone are not the carrier. This build used released 10.0.1, whose old `--global`
installer also wrote an ambient `/workspace/.cursor`; therefore this probe establishes the saved
environment lifecycle but does not isolate remote user-home lookup from that old mirror. A new clean
environment using the frozen candidate's no-dual-write installer is required before claiming the
user-home carrier specifically. The child model/profile source remains unobservable.

### Frozen-candidate isolation falsification and repair

- A new dashboard setup run, `bc-f53aa0ae-975b-4aab-8c4c-0c72584c33b4`, started a clean personal
  environment named `Kaola-Workflow candidate ae935ea` and checked out candidate
  `ae935ea8e412eff99d717d72689eea7852be0c5d` before installing globally.
- Its install script removed the setup workspace `.cursor` before the candidate install, then
  required both `test ! -e "$PWD/.cursor"` and a user-global `implementer.md` afterward.
- The first assertion failed: the normal installer called `sync-cursor-edition.js --write`, which
  regenerated `/workspace/.cursor` as its source tree before the receipt-owned global transaction.
  The environment was not saved and this run is negative evidence, not a passing Cloud receipt.
- The candidate was repaired and re-frozen at
  `c95af074a80175b57f7f9131722376fb2381a943`: normal installs now render only in an empty absolute
  mktemp staging root and clean that root on exit; only explicit `--regenerate` may write the
  repository tree. The setup environment must be rebuilt from this SHA before the final Cloud
  user-home carrier claim is accepted.

### Exact-Build global-only falsification

- Clean candidate Build `bld-20260827-1fd163c3-a8f2-475d-9603-7da988673ee3` checked out exact
  `c95af074a80175b57f7f9131722376fb2381a943`, ran the isolated `--global` install to exit 0,
  installed all 14 profiles plus a current receipt under `/home/ubuntu/.cursor`, and left the
  repository `.cursor` absent before the snapshot.
- The user manually saved personal environment `Kaola-Workflow c95af074 verified`. Starting a
  parent from the exact Build details page produced
  `bc-404048d8-54bd-468f-b89c-180e6e9b4dbf`; its page visibly links the same Build ID.
- That exact-Build parent's live Task enum contained only nine native types:
  `generalPurpose`, `explore`, `debug`, `computerUse`, `videoReview`, `cursor-guide`, `bugbot`,
  `security-review`, and `best-of-n-runner`. Exact `implementer` was absent, so no child or
  substitute was dispatched.

Verdict: on this measured Cursor Cloud host, a successful saved Build plus a user-global
`~/.cursor/agents` catalog is not discovery proof. The released-10.0.1 positive control above also
contained the old installer's ambient project mirror, so its success cannot be attributed to the
user carrier. The next controlled Build must keep the current global authority but add an explicit,
receipt-owned `--target "$PWD"` materialization during the Build, before the Cloud parent boots.

## Kimi Code global authority cross-check

- Runtime: authenticated Kimi Code `0.38.0`.
- Global profile: `${KIMI_CODE_HOME:-~/.kimi-code}/agents/implementer.md`, native name
  `kaola-role-implementer`.
- Two unrelated empty Git repositories were created with no project `.kimi-code` or `.agents`
  catalog.
- Each ran `kimi --agent kaola-role-implementer --prompt ... --output-format stream-json`.
- Both selected the global profile and returned exactly `PROBE_OK_KIMI_GLOBAL_IMPLEMENTER`.
- Session ids:
  `session_89004467-07d5-4763-aa8e-37c72bb75289`,
  `session_9d268aea-e58b-43a7-8683-381007608e35`.
- Both repositories remained empty; the disposable root was moved recoverably to Trash.

Verdict: Kimi's global named-profile discovery is live from two unrelated clean repositories; no
project materialization is required for this measured surface.

### Final saved environment with selected-repository materialization

- Cursor Cloud environment setup run
  `bc-f53aa0ae-975b-4aab-8c4c-0c72584c33b4` checked out exact candidate
  `101250f293a5439ed73e8ee2127c7501fba9e883`.
- The Build installed the remote-machine authority with `./install-cursor.sh --global`, then
  explicitly materialized the selected repository with `./install-cursor.sh --target "$PWD"`.
- Before Save, the Build proved the global receipt and project receipt current, proved the project
  receipt's global-authority hash binding, counted 14 project agents including `implementer`, found
  no managed-path collision, and completed two full install cycles with byte-identical output.
- A negative tamper probe changed a managed byte and made effective freshness
  `modified_mismatch` with scope `none`; the repair path failed closed. The restored Build ended
  with `VERIFY_OK scope=project_materialized global=current project=current project_agents=14` and
  `KW_CANDIDATE_CLOUD_INSTALL_OK`, exit 0.
- The user manually saved environment `Kaola-Workflow PR1041 final 101250f2`; its exact Build is
  `bld-20260827-56284e4a-bc0c-4cb6-b873-a48d180693e2` and the Cursor page reported `Up to date`.
- A new top-level Cloud Agent was opened in the same repository with that saved environment. Parent
  `bc-3e6bd3bd-f310-47cd-a9cb-358cf802f16d` visibly linked the exact Build and exposed 23 Task
  types: nine native Cursor routes plus all 14 Kaola roles.
- Exact `implementer` was dispatched once with no per-call model override. Child
  `bc-7d00ddad-23f3-5e69-8f9a-1c326b051a49` returned exactly
  `PROBE_OK_CURSOR_CLOUD_FINAL_SAVED_REPO_IMPLEMENTER`, with no substitute and no repository
  mutation.

Verdict: the measured Cursor Cloud carrier is an Agent-confirmed environment setup that installs
the remote machine authority and selected repository before the user manually saves the Build,
followed by a new top-level Agent in that same repository. A checked-in catalog alone and a saved
user-global-only Build are both negative controls. Local `install-all.sh` has no Cloud deployment
mode and is not part of this Cloud lifecycle.
