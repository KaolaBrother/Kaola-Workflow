# Finalization summary — issue-1073

Issue: #1073 `refactor(agents): 角色档案 receipt 哈希移出 agent 可见正文`
Branch: `workflow/issue-1073` · Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1073`
Candidate: `813c868e4371a53246662c489383d1fe6a2a27fa` (2 commits over base `2b1af448`: `5bd758d0` refactor, `813c868e` README docs). Tree clean.
Sink: merge (per `workflow-state.md`); integration deferred to supervision's serial schedule.

## Delivered

- Generated role profiles (7 Claude `agents/*.md`, 21 Codex `plugins/*/agents/*.toml`, and the gitignored Cursor/Grok renders) no longer contain the `<!-- runtime-adapter:start -->…<!-- runtime-adapter:end -->` appendix (three 64-hex digests + two boundary bullets) nor the Claude frontmatter `behavior_contract_version` / `behavior_contract_hash` / `resolved_profile_hash` lines. A profile body is the managed marker plus the behavior contract body; Codex `developer_instructions` carry the body alone.
- Sidecar: the existing `agents/generated-agent-manifest.json` now carries the full receipt triple per `runtime`/`variant`/`role`: `behavior_sha256`, `adapter_capabilities_sha256` (new field), `resolved_profile_sha256` (a plain SHA-256 of the render bytes — the zeroed-self slot no longer exists). No new files were added.
- `scripts/generate-agent-profiles.js`: `runtimeAppendix`, `ZERO_HASH`, `normalizeResolvedProfileHash`, `verifyResolvedProfileHash` deleted; `behaviorIdentityFromCore` derives identity from the role name + verbatim contract body (`behavior_contract_core_mismatch` fails closed); new exports `manifestProfileEntry(runtime, role, root?, variant?)`, `adapterHash`, `MANIFEST_PATH`.
- Claude `install.sh`: `refresh_agent_resolved_profile_hash` deleted; `agent_manifest_metadata` verifies `sha256(source) === manifest.resolved_profile_sha256` (`agent_source_digest_mismatch`), then `installed === source with model: inherit` (`agent_installed_bytes_mismatch`), and writes the unchanged 5-column TSV row (file, installed sha256, version, `behavior_sha256`, source `resolved_profile_sha256`). User-owned/modified detection (installed sha256 vs recorded) is untouched.
- Codex kernel `scripts/kaola-workflow-adaptive-schema.js` (+3 materialized plugin copies): `agentProfileContract` retired. `install-codex-agent-profiles.js` (3 byte-identical copies): installed manifest `.kaola-managed-profiles.json` drops `profile_contracts`, keeps `files` digests, `schema_version` stays 1. `kaola-workflow-codex-preflight.js` (4 copies): appendix/identity checks removed; `profile_bytes_mismatch` and `manifest_file_hash_mismatch` retained as the fail-closed path.
- Tests/validators re-pointed at the sidecar and assert no 64-hex line and no `runtime-adapter` marker in any profile body (`validate-vendored-agents.js`, `validate-kaola-workflow-contracts.js` + gitlab/gitea ports, `test-cursor-edition.js` G4, `test-grok-edition.js` G4, `test-install-model-rendering.js`, `test-issue-1054-role-redesign.js`, codex/gitlab/gitea walkthrough scripts). `test-runtime-agent-architecture.js` A10 isolation compare widened to content + `adapter_capabilities_sha256` (the adapter mutation's only remaining carrier). `scripts/fixtures/issue-1055-render-baseline.json` recaptured.
- Both `## Runtime adapter` bullets were dropped (issue option 3, first alternative): the always-loaded global contract already carries the `capability_gap` rule.

## Files Changed

`git diff --stat 2b1af448..813c868e` → 66 files, +375/−1117. Production: `scripts/generate-agent-profiles.js`, `install.sh`, `scripts/kaola-workflow-adaptive-schema.js` (+3 mirrors), `plugins/*/scripts/install-codex-agent-profiles.js` (3), `scripts/kaola-workflow-codex-preflight.js` (+3 mirrors). Generated: `agents/*.md` (7), `agents/generated-agent-manifest.json`, `plugins/*/agents/*.toml` (21). Tests/validators: 12 files. Docs: `README.md`, `CHANGELOG.md`, `docs/api.md`, `docs/agents-source.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/runtime-capabilities.md`, `docs/decisions/0020-…`, `docs/decisions/D-696-01.md`, `scripts/fixtures/issue-1055-render-baseline.json`.

## Test Coverage

Automated (all executed at `813c868e`, clean tree, inside the chain receipt below): `npm run test:kaola-workflow:claude` (incl. `test-install-model-rendering.js` with the retained project-override corruption fixture and the new sidecar-digest fixture, `validate-vendored-agents.js`, `generate-agent-profiles.js --check`, `test-runtime-agent-architecture.js`, `simulate-workflow-walkthrough.js --shard auto/12`), `npm run test:kaola-workflow:codex`, `:gitlab`, `:gitea`.
Also executed earlier in the run at `5bd758d0` (candidate content identical except README): `npm run test:kaola-workflow:editions` (9 suites incl. cursor/grok G4), `node scripts/simulate-workflow-walkthrough.js` 178/178.
Manual/live: isolated one-byte corruption reproduction (below). Not executed: no real `~/.claude`/`~/.codex` install, no global `./install-all.sh --yes`, no device/service/UAT claims.

## Validation

- Chain receipt: `kaola-workflow/issue-1073/.cache/chain-receipt.json` — `headSha 813c868e4371a53246662c489383d1fe6a2a27fa`, `workTreeHash "clean"`, `codeTreeHash 63eb4acab9d424d382d3b6b01264f37d4ef0e2e39e49797f11971bcfd44ac72a`, `completedAt 2026-09-12T22:59:39.827Z`, scope `all-four` (`edition_coupling`, 66 changed files), chains claude/codex/gitlab/gitea all `exitCode 0`, `accepted_red false`, no waivers. Producer: `node scripts/kaola-workflow-run-chains.js --project issue-1073 --json` from the worktree; process exit 0 captured directly (`.cache/run-chains-stdout.json` = `{"result":"pass","failed":[],…}`, `.cache/run-chains-stderr.log` empty). Not a pipeline exit.
- `node scripts/kaola-workflow-claim.js finalize --project issue-1073 --keep-worktree --check --json` (read-only, from the worktree at `813c868e`): `ok: true`, `validation: chains_green`, `mirror: ready`, `staging_guard: ok`, `implementation_commit: not_applicable`, `dirty_paths: []`, `reasons: []`.
- Corruption reproduction (recipe `kaola-workflow/issue-1073/.cache/corruption-repro.sh`, raw logs `kaola-workflow/issue-1073/.cache/corruption-repro/`, stdout/err transcript `.cache/corruption-repro.run.log`): script exit 0, `overall=PASS`, 22 OK / 0 FAIL, `head=813c868e`, `status=0 dirty paths`. Reproduce with:
  `bash kaola-workflow/issue-1073/.cache/corruption-repro.sh <worktree-root> <fresh-log-dir>`
  Isolated paths (mktemp, left in place for inspection): `HOME_ROOT=/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kaola-1073-home.*`, `PROJECT_ROOT=…/kaola-1073-project.*`, `SRC_COPY=…/kaola-1073-src.*`, `HOME2=…/kaola-1073-home2.*` (exact suffixes in `summary.log`). Nothing under the real `~/.claude`, `~/.codex`, or the repository was written.
  | step | command (cwd) | expected | actual | log |
  |---|---|---|---|---|
  | codex-1 | `HOME=$HOME_ROOT node scripts/install-codex-agent-profiles.js --global` then `… $PROJECT_ROOT` (cwd `plugins/kaola-workflow`) | exit 0, 0 | 0, 0 | `codex-install-global.log`, `codex-install-project.log` |
  | codex-1 | `grep -c -E '[0-9a-f]{64}' $PROJECT_ROOT/.codex/agents/kaola-workflow/code-reviewer.toml` | exit 1 (no match) | 1 | `codex-hex-lines.txt` |
  | codex-1 | installed `.kaola-managed-profiles.json` has no `profile_contracts` | exit 0 | 0 | `kaola-managed-profiles.json` |
  | codex-2 | `HOME=$HOME_ROOT KAOLA_CODEX_VERSION=0.145.0 node scripts/kaola-workflow-codex-preflight.js --project-root $PROJECT_ROOT --home $HOME_ROOT --no-autofix --json` | exit 0 | 0 | `codex-preflight-baseline.json` |
  | codex-3 | replace `# Code Reviewer` → `# Code reviewer` in the installed TOML (one byte) | applied, differs from canonical | applied | `code-reviewer.toml.{canonical,mutated}` |
  | codex-4 | same preflight `--no-autofix --json` | exit 1, `status profiles_stale`, reasons include `profile_bytes_mismatch` and `manifest_file_hash_mismatch` | exit 1; `status=profiles_stale`; `["profile_bytes_mismatch: installed profile differs from bundled source","manifest_file_hash_mismatch: expected=sha256:529f7087…ea130a got=sha256:0559d2c4…f84b30"]` | `codex-preflight-mutated.json` |
  | codex-5 | same preflight without `--no-autofix` | exit 0, canonical bytes restored | 0, restored | `codex-preflight-autofix.json` |
  | claude-1 | `HOME=$HOME_ROOT bash install.sh --yes --forge=github --no-settings-merge` (cwd worktree) | exit 0; installed `.md` has no 64-hex line; proof-boundary line printed; TSV row binds installed sha256 + sidecar (`version 4`, `behavior_sha256 ed38928f…`, `resolved_profile_sha256 774fd4df…`) | all as expected | `claude-install-1.log`, `claude-hex-lines.txt`, `kaola-workflow-agent-manifest.tsv` |
  | claude-2 | one-byte mutation of installed `code-reviewer.md`, then reinstall | exit 0 and `Skipped agent with existing user-owned or modified file: …/code-reviewer.md`; mutated bytes preserved | as expected | `claude-install-2.log`, `code-reviewer.md.mutated` |
  | claude-3 | `git archive HEAD` copy with one byte changed in `agents/code-reviewer.md`, `HOME=$HOME2 bash install.sh …` | non-zero exit; source rejected | exit non-zero; `agent profile drift:` / `Agent source profile verification failed.` (caught by the `generate-agent-profiles.js --check` precondition before `agent_source_digest_mismatch`) | `claude-install-corrupt-source.log` |
  A first run of the recipe at `5bd758d0` failed its Codex steps with `project_trust_required`: macOS `TMPDIR` ends in `/`, so the trust key written to the isolated `~/.codex/config.toml` carried a `//` the preflight's normalized `--project-root` did not match. The recipe (not the candidate) was corrected to strip the trailing slash and re-run at `5bd758d0` (PASS) and again at `813c868e` (PASS, the logs preserved here).

## Changed Paths

Reported by `finalize --check` (`checks.changed_paths`, 57 paths): `agents/code-explorer.md`, `agents/code-reviewer.md`, `agents/doc-updater.md`, `agents/generated-agent-manifest.json`, `agents/implementer.md`, `agents/investigator.md`, `agents/knowledge-lookup.md`, `agents/tdd-guide.md`, `install.sh`, `plugins/kaola-workflow-gitea/agents/{code-explorer,code-reviewer,doc-updater,implementer,investigator,knowledge-lookup,tdd-guide}.toml`, `plugins/kaola-workflow-gitea/scripts/{install-codex-agent-profiles,kaola-workflow-adaptive-schema,kaola-workflow-codex-preflight,test-gitea-workflow-scripts,validate-kaola-workflow-gitea-contracts}.js`, `plugins/kaola-workflow-gitlab/agents/{same 7}.toml`, `plugins/kaola-workflow-gitlab/scripts/{install-codex-agent-profiles,kaola-workflow-adaptive-schema,kaola-workflow-codex-preflight,test-gitlab-workflow-scripts,validate-kaola-workflow-gitlab-contracts}.js`, `plugins/kaola-workflow/agents/{same 7}.toml`, `plugins/kaola-workflow/scripts/{install-codex-agent-profiles,kaola-workflow-adaptive-schema,kaola-workflow-codex-preflight,simulate-kaola-workflow-walkthrough}.js`, `scripts/fixtures/issue-1055-render-baseline.json`, `scripts/generate-agent-profiles.js`, `scripts/kaola-workflow-adaptive-schema.js`, `scripts/kaola-workflow-codex-preflight.js`, `scripts/test-cursor-edition.js`, `scripts/test-grok-edition.js`, `scripts/test-install-model-rendering.js`, `scripts/test-issue-1054-role-redesign.js`, `scripts/test-kimi-edition.js`, `scripts/test-opencode-edition.js`, `scripts/test-runtime-agent-architecture.js`, `scripts/validate-kaola-workflow-contracts.js`, `scripts/validate-vendored-agents.js`. (The transaction's list excludes the 9 documentation paths, which are in the git diff above.)

## Acceptance walk (issue body, each claimed part)

1. "No `.cursor/agents/*.md`, `plugins/kaola-workflow/agents/*.toml`, or `agents/*.md` body contains a 64-hex hash line; the `<!-- runtime-adapter -->` block is gone" — covered by `validate-vendored-agents.js` (Claude), `validate-kaola-workflow-contracts.js` + gitlab/gitea ports (Codex ×3), `test-cursor-edition.js` / `test-grok-edition.js` G4 (rendered trees), the `test-install-model-rendering.js` installed-bytes assertion, and the reproduction's `grep -c -E '[0-9a-f]{64}'` on installed Codex and Claude profiles (exit 1 = no match).
2. "The hash triple is present per runtime+role in the chosen sidecar, and `resolved_profile_hash` still verifies over the profile body bytes" — `agents/generated-agent-manifest.json` carries `behavior_sha256` / `adapter_capabilities_sha256` / `resolved_profile_sha256` for all 42 renders; `generate-agent-profiles.js --check` (in every chain) re-renders and compares tracked bytes and the manifest; every validator above asserts `sha256(profile bytes) === resolved_profile_sha256`. Deviation from the issue's wording: with no in-body slot there is nothing to zero, so the digest is the plain SHA-256 of the file bytes — strictly simpler, same binding.
3. "Modifying one byte of an installed profile body still produces `agent_resolved_profile_hash_mismatch` from `./install-all.sh --check`" — **premise corrected** (see below); the meaning (a modified installed profile fails closed) is proven by the reproduction: Codex preflight exit 1 / `profiles_stale` / `profile_bytes_mismatch` + `manifest_file_hash_mismatch`; Claude installer refuses to overwrite the modified file (`Skipped agent with existing user-owned or modified file`) and refuses a corrupted source (`Agent source profile verification failed`).
4. "`npm test` and `node scripts/simulate-workflow-walkthrough.js` pass; README / `docs/api.md` / `CHANGELOG.md` `[Unreleased]` describe the sidecar" — chain receipt (all four chains, walkthrough shard inside the Claude chain; full walkthrough 178/178 run separately at `5bd758d0`); docs per `.cache/doc-docking.md` (DOCKED).

## Premise correction (to be posted on #1073 before closure)

Measured at `2b1af448` (`install-all.sh` lines 245–258, 654–660): `./install-all.sh --check` runs only the global-contract `check` transaction; every per-runtime installer is recorded as a `PLAN` row and never executed, so `--check` has never inspected an installed agent profile. The only producer of `agent_resolved_profile_hash_mismatch` was the Codex kernel's `agentProfileContract` (`scripts/kaola-workflow-adaptive-schema.js:260-303`), reached through `install-codex-agent-profiles.js` (source validation + manifest) and `kaola-workflow-codex-preflight.js` (installed-profile inspection) — and for an installed profile the same one-byte mutation already tripped `profile_bytes_mismatch` (bundled-source byte compare) and `manifest_file_hash_mismatch` (installed-manifest `files` digest) alongside it. Claude's `install.sh` used the in-body hash only at install time; its user-modified detection compares the installed file's sha256 to `.kaola-workflow-agent-manifest`. `install-cursor.sh` / `install-grok.sh` never verified profile hashes; their in-body hash served only the G4 edition tests. Consequently the acceptance's third bullet is satisfied by the runtimes' actual detection paths, not by `install-all.sh --check`: Codex preflight `profile_bytes_mismatch` / `manifest_file_hash_mismatch`; Claude installer skip-on-modified plus `agent profile drift` / `agent_source_digest_mismatch` / `agent_installed_bytes_mismatch`. The reason code `agent_resolved_profile_hash_mismatch` no longer exists.

## Documentation Docking

`kaola-workflow/issue-1073/.cache/doc-docking.md` — DOCKED (16 files checked; 10 fixed across `5bd758d0` / `813c868e`, 6 no-impact with reasons).

## Follow-Up Items

None. Run-discovered items and their disposition: (a) recipe bug (TMPDIR trailing slash) — fixed in the recipe, not a product defect; (b) `scripts/prose-census-baseline.json` still lists the retired reason codes — a `captured_at_commit 6ae5374b` reference snapshot with no consumer, recorded as no-impact in docking, not deferred work; (c) ADR 0019/0021 mention the old field name in passing — historical records, no-impact.

## Readiness

READY for integration: candidate `813c868e` frozen, tree clean, unwaived chain receipt bound to it, `finalize --check` green, docs docked, no follow-ups. Deferred by supervision instruction (not by readiness): main-root archive transaction, sink/merge, issue closure, global install. Branch push of `workflow/issue-1073` is authorized and performed by the orchestrator; see `## Publication` once appended.

## Publication

- `git push -u origin workflow/issue-1073` → `[new branch] workflow/issue-1073 -> workflow/issue-1073`; `git ls-remote --heads origin workflow/issue-1073` = `813c868e4371a53246662c489383d1fe6a2a27fa`; local vs remote `0 0`.
- Premise correction posted on #1073: https://github.com/KaolaBrother/Kaola-Workflow/issues/1073#issuecomment-5649519498 (issue now has 2 comments; the first is the claim marker).
- Not performed (supervision holds serial integration): `finalize` transaction (archive + main-root sync), `kaola-workflow-sink-merge.js`, issue closure, `./install-all.sh --yes`, release. Resume point: `(cd .kw/worktrees/issue-1073 && node scripts/kaola-workflow-claim.js finalize --project issue-1073 --keep-worktree)` then the merge sink with `--issue 1073`.

## Integration (serial sink, owner-directed handoff)

- First `--sink` at `813c868e` (main `5213dd33`) stopped at the sink's own rebase: `CHANGELOG.md`
  additive collision between the #1072 and #1073 `[Unreleased]` entries. Resolved by keeping both
  entries; no other file conflicted. Rebased candidate `08a37676` force-pushed with lease.
- Re-measured at `08a37676` (mutation invalidates prior PASS evidence): run-chains all-four
  claude/codex/gitlab/gitea exit 0 (`.cache/chain-receipt.json`; the `813c868e` receipt kept as
  `.cache/chain-receipt.superseded-813c868e.json`), `simulate-workflow-walkthrough.js` 178/178,
  isolated `corruption-repro.sh` 22 OK / 0 FAIL (`.cache/corruption-repro.08a37676.summary.log`),
  `bash -n install.sh`, `test-install-model-rendering.js`, `test-install-upgrade-rewrite.js` exit 0.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1073/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1073/.cache/chain-receipt.superseded-813c868e.json
- kaola-workflow/archive/issue-1073/.cache/corruption-repro.08a37676.summary.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro.run.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro.sh
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/claude-hex-lines.txt
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/claude-install-1.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/claude-install-2.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/claude-install-corrupt-source.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/code-reviewer.md.canonical
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/code-reviewer.md.mutated
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/code-reviewer.toml.canonical
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/code-reviewer.toml.mutated
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-hex-lines.txt
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-install-global.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-install-project.log
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-preflight-autofix.json
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-preflight-autofix.stderr
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-preflight-baseline.json
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-preflight-baseline.stderr
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-preflight-mutated.json
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/codex-preflight-mutated.stderr
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/kaola-managed-profiles.json
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/kaola-workflow-agent-manifest.tsv
- kaola-workflow/archive/issue-1073/.cache/corruption-repro/summary.log
- kaola-workflow/archive/issue-1073/.cache/doc-docking.md
- kaola-workflow/archive/issue-1073/.cache/mirror-digest.json
- kaola-workflow/archive/issue-1073/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1073/.cache/run-chains-stderr.log
- kaola-workflow/archive/issue-1073/.cache/run-chains-stdout.json
- kaola-workflow/archive/issue-1073/finalization-summary.md
- kaola-workflow/archive/issue-1073/mission-list.md
- kaola-workflow/archive/issue-1073/workflow-state.md
