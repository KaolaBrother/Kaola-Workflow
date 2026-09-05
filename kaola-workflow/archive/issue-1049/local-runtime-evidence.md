# Local Codex runtime evidence for issue #1049

## Baseline and CLI update

Measured 2026-09-05 against repository baseline `7e93763e43864091f722b306c404bb85d7f96052`.

- Terminal executable: `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64/bin/codex`.
- npm global prefix: `/Users/ylpromax5/.local/node-v24.14.0-darwin-arm64`.
- `npm view @openai/codex version` returned `0.153.4`.
- `npm install --global @openai/codex@0.153.4` completed with exit 0; terminal `codex --version` changed from `0.150.1` to `0.153.4`.
- Desktop `/Applications/ChatGPT.app/Contents/Resources/codex --version` remained `0.153.1`; its binary was not modified.
- Global `/Users/ylpromax5/.codex/config.toml` SHA-256 before and after CLI upgrade: `4f5e4141f43637b16fad5d46cd23db19631266f727ef530b664a89c1f624cbea` (exact bytes unchanged).
- Global model remains `gpt-6-astra` / `xhigh`; no explicit experimental context-management setting was present and none was added.
- Updated CLI `codex plugin list --json` completed successfully.
- A fresh `codex app-server --stdio` from terminal 0.153.4 completed native `initialize`, `config/read` and `model/list`. Effective configuration loaded all 14 named Kaola registrations and retained Astra/xhigh. The returned catalog includes Astra/medium and Astra/high plus Luna/max, with no further model-list page. The probe read only selected configuration metadata and terminated only its own child process; no model-generation request or feature opt-in was made.

## Baseline profile diagnostic

`node scripts/kaola-workflow-codex-preflight.js --doctor --json` returned exit 1 / `status: stale` before installation refresh. All 14 repository and user profiles were present, valid, and byte-matched; user registration reported `managed_block_drift: true`. This is a pre-existing installation discrepancy, not evidence of an Astra regression. The user scope exposes V2 task-name dispatch and a five-session concurrency setting. `xhigh` has `explicitRequestOnly` posture; this run's explicit Workflow and proposed-tier authorization supplies delegation consent.

Raw local command records are under `.kw/issue-1049-evidence/` in the issue worktree; this document carries the durable non-secret observations.

## Preserve unrelated configuration before installation

The baseline managed block contained the exact canonical 14-role registration prefix followed by unrelated `[desktop]` and MCP tables before `# END kaola-workflow agents`. Source inspection of `upsertBlock` showed that a normal profile reinstall replaces the entire marker range. No reinstall was run on that layout.

Moved only the END marker ahead of `[desktop]`, after verifying that the role prefix exactly matched `plugins/kaola-workflow/config/agents.toml`. Removing the two marker lines from before/after produced identical bytes, SHA-256 `a2b784586762694ccc096d140fde9d8830b1a14449a1b639116de33bf4f7de0a`; all configuration values and their order were preserved. Whole-file SHA-256 after marker movement is `084d0c9e6ca25420780297efc4fc72e3db659b18657d49decdd441e9936ee666`. The read-only doctor still reports a noncanonical managed-block whitespace difference, which the supported installer will normalize within the now-correct boundary. This local repair makes no attribution about which writer originally displaced the comment marker and introduces no repository installer change.

## Candidate installation and compatibility

- `./install-all.sh --yes --forge=github` completed with all seven local runtimes reporting PASS / exit 0: Claude, OpenCode, Codex, Kimi, Grok, Cursor and ZCode. Codex's same-version cache was refreshed through its supported plugin remove/add flow.
- The final candidate is `f7a57144ab378f7e36fdea660cbce66642130bfc`. The two later commits contain only the independently corrected contract validator and its exact mirror. The final Codex plugin cache was refreshed again; recursive source/cache comparison found 44 files on each side and zero missing or different files.
- `./install-all.sh --check --forge=github` at the final candidate completed with exit 0, global contract `CURRENT`, and no Codex plugin content refresh pending while its source was the candidate worktree. Its seven `PLAN` rows are dry-run plans, not seven live agent executions.
- Final `kaola-workflow-codex-preflight.js --doctor --json` returned exit 0 / `status: ok`; the user registration has no managed-block drift, missing roles, or profile byte drift. A fresh terminal app-server initialized, read configuration, and listed the required native model/effort pairs successfully after installation.
- Candidate installation temporarily registered the issue worktree as the local Kaola marketplace source. After verifying the cache, the source was restored with the supported marketplace remove/add commands to `/Users/ylpromax5/Workspace/Kaola-Workflow`; the plugin remains enabled. The final merge makes that normal source current. No installation source is left pointing at a disposable worktree.
- Final user config SHA-256 is `e37b87601005fe3e25ba4c7dfd690a5eecdf5b71a5a1235f66a8ac6144790e09`. Carrier installation normalized the managed block and marketplace re-registration wrote configuration, so the whole-file CLI-only identity result above does not extend to this later step. Live reads confirm parent `gpt-6-astra` / `xhigh` and no explicit experimental context-management entries.
- Cursor Cloud is not a local installation target and reports `REMOTE_REQUIRED`; no Cloud deployment or fresh model execution in every third-party runtime is claimed. Actual proposed-tier model execution is recorded separately in delivery-evidence.md.

## Owner-requested release follow-through

After the implementation run, the owner additionally requested a formal release and installation for every runtime. The release transaction will run after this issue's finalization and sink, with a separate release-only candidate, strict complete unwaived validation, named tag publication, and another all-seven local install/check. Its release receipts own that later truth.

## Superseding narrowed-scope installation

The owner withdrew the shared policy expansion. The final source candidate is `e1b3f1869b6f978a19ac25252e18820273c83b11`; shared author sources and non-Codex instruction/model behavior match baseline exactly. Prior installation observations above describe intermediate candidates only.

Ran `./install-all.sh --yes --forge=github` over these restored bytes before committing them as e1b3f186. All seven local runtimes exited 0 / PASS, and Codex's same-version cache was refreshed through its supported flow. Then ran `./install-all.sh --check --forge=github` and the Codex doctor against frozen e1b3f186: both exited 0. The plugin source/cache comparison found 44 files on each side and zero differences. Global source SHA-256 is the baseline `f4c3cc736fafa606ba34b84ebf0ac5ecfb1b6b7ac696c49bb551849fe418e841`; all eight local carrier rows (including both Cursor host views) are CURRENT. Doctor is ok with no user registration drift, missing role or profile byte drift.

This restores the previously installed shared changes. Only the Codex dispatch names differ from the pre-run instructions. The marketplace source is again the normal main repository path. The formal release will receive its own post-publication all-runtime reinstall and verification.
