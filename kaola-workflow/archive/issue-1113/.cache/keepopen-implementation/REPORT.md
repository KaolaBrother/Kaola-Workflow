# #1113 explicit GitHub singleton keep-open PR — implementation delivery

Status: uncommitted candidate, stopped for Host acceptance. No commit, push, merge, finalize, archive, claim release, Forge closure, install, or global config edit. This worker did not edit the Host ledger and did not copy it into the worktree. Final QA, test meaning, and lifecycle acceptance belong to the Host. The cross-repo Host is the existing Codex VRPCadCore orchestrator.

Date of this delivery evidence: 2026-10-02.

## Run custody

| Item | Value |
| --- | --- |
| Provider issue | GitHub Kaola-Workflow #1113, claimed exact, no bundle |
| Worktree | `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113` |
| Branch | `workflow/issue-1113` |
| HEAD (MAIN and worktree) | `fe7e4443a8c367cfc111c65755191ae6790e810e` |
| MAIN vs `origin/main` | `git rev-list --left-right --count origin/main...HEAD` → `0 0` |
| MAIN tracked status | empty (`git status --untracked-files=no --short`) |
| Claim | `kaola-workflow/issue-1113/workflow-state.md`: `status: active`, `issue_number: 1113`, `run_posture: worktree`, `claim_ts: 2026-10-02T10:03:17.300Z` |
| Ledger | `/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/.ledger/issue-1113.jsonl` |
| Ledger SHA-256 | `49f67367b89311050cb5c6eac9843d354c8c0de3defc428931c042e21edc5526` (1081 bytes) |
| Ledger status | one line, `in-flight`: Deliver supported explicit singleton GitHub keep-open research/artifact PR publication with request-only and truthful lifecycle semantics |
| Operator config SHA-256 | `e604d6ea484b8a4e438720f5d49765e28714ee568e83139f304d1c96192acb87` at `~/.config/kaola-workflow/config.json` (unchanged after the isolated fixture) |
| Package version | `12.4.0` (`package.json` not in the diff) |
| Authority | Astra memo SHA-256 `3eedcc40d7568d4a9bfa95a5890e1e5b28e687abf54ad812cc1cf0a28213747a`; Host adoption SHA-256 `4aeedbcf2d0e8cbba4eefcaa3a82355cb91c1220a7ea038efd1d82417fcdad50`. Recorded in ADR 0031 as Proposed. |

## Frozen candidate

`git diff HEAD` omits the untracked ADR. The review artifact is the concatenation of that tracked diff and `git diff --no-index /dev/null docs/decisions/0031-explicit-github-keep-open-pr.md`. The no-index command exits 1 when the file exists; that exit is the diff signal, not a product failure.

| File | SHA-256 | Bytes |
| --- | --- | --- |
| `kaola-workflow/issue-1113/.cache/keepopen-implementation/candidate.diff` | `0e582b2fb5e488e17510b7649973773f25e4c720b1bc7c84f3fafe3c7a450235` | 124902 |
| `candidate-tracked.diff` (`git diff HEAD`) | `c8a8715b2fcb56d6e68722db929641383e24124024d8a6e70f2633e76dc71162` | 120966 |
| `candidate-adr.diff` | `04536801864821262314cbe859d8241cb429da4c6e8805c1408e2b39962395cd` | 3501 |

Tracked stat: 24 files, 950 insertions, 122 deletions. Plus untracked `docs/decisions/0031-explicit-github-keep-open-pr.md` (51 lines, file SHA-256 `c634d82b2e3c3d2cd3f6036e38054d89b846c6254f3dbbf20cc877cfb4c216e2`).

`candidate.diff` begins with a six-line comment preamble naming the base, worktree, and branch, then the two diffs. Recompute from those two part files plus that preamble if the combined hash is checked.

Worktree source hashes at freeze (file bytes):

| Path | Candidate SHA-256 | Base `fe7e4443` file SHA-256 |
| --- | --- | --- |
| `scripts/kaola-workflow-sink-pr.js` | `0a8be33171e6cacce497986360648454e2c094ecccdce8744c305b310ac52edc` | `86a450f21418b5b106e9566a53fe60667cc3d751f32b4931822da8b3b049d844` |
| `scripts/kaola-workflow-claim.js` | `3e5bab0b9129766e1e434c6f3bb37c5fbcb175c162d1af25f34bb56ab1b036b7` | `029bf7a858bfb74f7abe7f0962e2c1062f07fc54d86602cd287be27dcbb29d23` |
| `scripts/kaola-workflow-active-folders.js` | `e8f39b678b635ac2400cf7a78a477f499a14afaa7a3d8fc9bd1cfa7108f0f93d` | `b7b21a2eb66022aa62a2c00cbbf4d519e2389fe1a66509a53b58ab863eb287b7` |
| `scripts/kaola-workflow-closure-contract.js` | `ffea91b372bf6011cfa2707ba3265d1ca2a935fb9fbebce64cb6cd45681c102d` | `7cfe2d00d736474913ba9d12e29cc9415e3d18d1a3e3853e456ca1b1cf8fbcfe` |

The Codex plugin copies of those four scripts match the candidate hashes. GitLab and Gitea `kaola-workflow-closure-contract.js` copies match the candidate closure hash. Their claim and sink sources are absent from the diff. Gitea’s sink file remains `kaola-gitea-workflow-sink-pr.js`.

`scripts/simulate-workflow-walkthrough.js` is absent from the diff. The independent pins patch was not applied.

## Supported invocation

Durable `## Sink` lines, all required together:

- `sink: pr`
- `issue_action: comment_keep_open`
- `keep_open_pr: explicit_singleton`
- singleton membership: no `issue_numbers`, or `issue_numbers` equal to the one primary issue
- `issue_number` and `branch` equal to the invocation
- optional `base_branch`, and when present it must equal the resolved PR base

GitHub canonical script only:

```bash
node scripts/kaola-workflow-sink-pr.js \
  --branch "$SINK_BRANCH" \
  --issue "$SINK_ISSUE" \
  --project {project} \
  --keep-open-pr explicit_singleton
```

The flag value must be exactly `explicit_singleton`. Finalize capture reads `SINK_KEEP_OPEN_PR` from the Sink block and appends `--keep-open-pr explicit_singleton` only when that value matches. The flag is passed by unquoted expansion of a variable that is either empty or those two words.

Legacy `comment_keep_open` with no flag and no `keep_open_pr` line still refuses with the historical sentence `Keep-open is merge-sink-only`. A `keep_open_pr` line without the flag also stays on that sentence. Any other partial or mismatched agreement refuses as `explicit_keep_open_refused` with one of: `mode_mismatch`, `partial_marker`, `bundle_refused`, `issue_mismatch`, `branch_mismatch`, `sink_mismatch`, `state_conflict`, `state_missing`, `closing_linkage`, `linkage_missing`, `base_mismatch`, `head_mismatch`, `offline`, `head_missing`, `base_unavailable`, `commit_scan_failed`. Those refusals happen before push, create, or placeholder write. The path does not fall through to a closing PR.

Explicit success, with `sink_pr` last:

```text
pr_auto_merge: suppressed_request_only
pr_request: request_only
publication: request_published
mainline_publication: pending
sink_pr: created|reused
```

Create uses `--title` and `--body`. The title is `Publish {project} (keeps #N open)`. The body starts `Keeps #N open.` Close mode still uses `--fill` and `Closes #n`.

A MERGED explicit PR is not republished and is not mutated. Exit 0. Stdout adds `pr_request: request_only`, `publication: already_published`, `mainline_publication: pending_reconciliation`, `keep_open_linkage: clean|closing_present`, then `sink_pr: already_merged`. Closing keywords already present in the merged text are noted on stderr. No second PR is opened. Head and base are checked before that MERGED return. Close mode’s existing `already_merged` path still ignores head.

A CLOSED-unmerged PR stays `pr_closed_unmerged` with no mutation. Explicit mode refuses `KAOLA_WORKFLOW_OFFLINE` before any placeholder. Close-mode OFFLINE placeholder behavior is unchanged.

`recordPrResult` adds `keep_open_pr`, `pr_request`, and `mainline_publication` only in explicit mode. Idempotent retry compares those keys with a missing value equal to `''`, so close-mode records keep their previous shape. Retry does not mint a second PR.

Explicit mode never calls `gh pr merge` and never probes the merge queue, including when config `pr_auto_merge` is true. The operator config file was not edited.

Closing linkage is a closing keyword (`close`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolved`) and any `#N` on that same line, including `owner/repo#N`. The word `closing` does not match. Local `base..head` commit messages are scanned, and the PR title and body are scanned, before push.

Watcher (`claim.js`, GitHub canonical and the Codex copy only):

- Open issue: `remote_issue_closed` `kept_open`, observation `intentionally_kept_open`, closeout `intentionally_kept_open`.
- Actually CLOSED: remote `failed`, observation `keep_open_violation`. No reopen and no manual close.
- Unreadable probe: remote `unknown`, observation `unknown`. This is not `skipped_offline`.

`checkClosureInvariants` skips `remote-members-closed` only when `keep_open_pr` is `explicit_singleton` and `keep_open_observation` is `intentionally_kept_open`. A CLOSED observation adds `keep-open-pr-violated` only. An unreadable probe records the issue in `failed_issue_closures` and adds `keep-open-pr-unknown`; that same array also trips `remote-members-closed`, because the skip applies only to `intentionally_kept_open`. Those two ids are not entries in `CLOSURE_INVARIANTS`. This is the implemented behavior, documented in `docs/api.md`, and left as-is.

`remote_issue_closed` now includes `unknown` in the shared closure schema. Only the GitHub watcher emits it. GitLab and Gitea receive the token because `closure-contract.js` is a byte-identical group. Their finalize keep-open guard stays the unconditional refusal.

`readActiveFolders` exposes `issue_action` and `keep_open_pr` as empty strings when the lines are absent. They are not `SHARED_STATE_FIELDS`.

## Reach

Edited production surfaces:

- Canonical GitHub `scripts/kaola-workflow-sink-pr.js`, `kaola-workflow-claim.js`, `kaola-workflow-active-folders.js`, `kaola-workflow-closure-contract.js`.
- Codex plugin copies of those scripts, produced by `edition-sync.js --write` (last sync updated the plugin sink-pr so it matches canonical).
- GitLab and Gitea closure-contract copies only, by the same byte-identical sync.
- Authoring sources `templates/routing/finalize.skeleton.md` and `templates/routing/slots.js`.
- Generated `commands/kaola-workflow-finalize.md` and the Codex, GitLab, and Gitea finalize command and skill mirrors, produced by `generate-routing-surfaces.js --write`.
- Docs: `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/workflow-state-contract.md`, `docs/README.md`, `CHANGELOG.md` `## [Unreleased]`, new ADR `docs/decisions/0031-explicit-github-keep-open-pr.md` (Status: Proposed).

Generation was run from the worktree with `KAOLA_EDITION_TREE_ROOT=/tmp/kw-1113-edition-root` (empty) and `KAOLA_EDITION_TREE_FOR` set to the worktree, so the ignored MAIN edition trees were not refreshed. Their finalize commands still hash to:

- `.grok/commands/kaola-workflow-finalize.md` `b83b5f908b5bdc8bc0cce22d3992a779ba4e1842c2f79428bc1134c0cab2b87a`
- `.cursor/commands/kaola-workflow-finalize.md` `8a31037c2d02e0b6f270d1606cec9a345651017627a9558a647cecd1904ded4e`
- `.opencode/commands/kaola-workflow-finalize.md` `0fead0c2281eeeb4a207b0c15afe0f64cca764b0ccefa3c748965ac26a582132`

No installed skill was edited. `install-all` was not run. No new dependency. No other-forge sink or claim semantics. No real user-project archive, PR, or live probe mutation.

Historical #1098 D4=(a) remains the default refusal. ADR 0031 records the narrow GitHub exception and its provenance. The merge-sink-only sentence and the walkthrough pins that require it were left in place.

## Focused checks against this candidate

All of the following were run from the worktree after the frozen tree was in place. Stdout is copied beside this report. These are not the full walkthrough and not installed compatibility.

| Command | Exit | Evidence SHA-256 |
| --- | --- | --- |
| `node --check` on sink-pr, claim, closure-contract, active-folders | 0, 0, 0, 0 | `check-syntax.txt` `c9f099881453b547118c4d5f3bba2bf3c806b26397bff8f9c9f466493f69fdba` |
| `node scripts/test-active-folders-field-parity.js` | 0, 163 assertions | `check-field-parity.txt` `ea224841ebc14b6d4a2edc1ca53a8afe42ed74a953d4c64046ade4d982c554c6` |
| `node scripts/test-bash-block-guards.js` | 0, 49 assertions | `check-bash-block-guards.txt` `35ba5cb737da26372a70ec4c24217ba027fa139880821df2c662a5ab6b04a2b2` |
| `node scripts/generate-routing-surfaces.js --check` | 0, 24 surfaces byte-match | `check-validators.txt` `8949adf6fbbb2e84355620e8c3c35c2be8b00956cb95e321c416a717faa9ff48` |
| `node scripts/validate-script-sync.js` | 0 | same file |
| `node scripts/validate-workflow-contracts.js` | 0, `Workflow contract validation passed` | same file |
| `node scripts/validate-kaola-workflow-contracts.js` | 0, `Kaola-Workflow Codex contract validation passed` | same file |
| `NO_COLOR=1 node scripts/simulate-workflow-walkthrough.js --only testSinkPr --only testKeepOpen` | 0, `Walkthrough --only subset passed (24 scenarios)` | `check-walkthrough-subset.txt` `77fa4901e189d0ec96f4a53c88009b2641ad124e7387c5350831e7b3914c3ff3` |
| `node /tmp/kw-1113-keepopen-fixture.js` | 0, `FIXTURE_OK` | `check-sink-fixture.txt` `c9c3c30e1f542e987aef4561e087cf9d3c39549b8c90fc42b502ba1fed8368b3` |
| `node /tmp/kw-1113-watch-fixture.js` | 0, `WATCH_FIXTURE_OK` | `check-watch-fixture.txt` `0b1e7456a03e91ba4980b7e995cc7942190c5f9f4f5c91f921b2ca841a45b80d` |

The walkthrough subset printed 23 `PASSED` lines. `testSinkPrLeavesCleanWorktree` is the 24th selected scenario (`simulate-workflow-walkthrough.js` registration at line 12913, function at line 4747). That function has no `PASSED` log line. Exit 0 means it returned without an assertion failure. It covers the clean close-mode OFFLINE path.

Shipped pins that passed inside that subset include `testSinkPrKeepOpenRefusal` and `#1098 T7C` inside `testSinkPrLinkedPosturePublishesArchive` (stderr contains `merge-sink-only`), close-mode missing-`Closes` and base-mismatch refusals, linked-worktree publish, and the #1099 merge-queue argv cases. Explicit mode does not scan close-mode commit messages, so those existing commit texts were not newly refused.

Isolated sink fixture (`/tmp/kw-1113-keepopen-fixture.js`, not a shipped test) uses a local bare origin, a fake `gh`, and an isolated `HOME` whose config has `pr_auto_merge` true. It checked the pure gate, the legacy CLI refusal from main and from a linked worktree, explicit create and reuse with no `gh pr merge`, no GraphQL, and no `--fill`, a body starting `Keeps #72 open.`, extra record fields, a byte-identical retry record, main HEAD and index left in place, archive files on the origin branch, closing-commit refusal before push, `bundle_refused`, OFFLINE with no placeholder, `pr_closed_unmerged`, merged `head_mismatch` before `already_merged`, a clean merged receipt, a merged `closing_present` note with no second PR, and `base_branch: develop` versus base `main` refused before `gh`. It printed the real config hash above and left that file unchanged.

Isolated watch fixture (`/tmp/kw-1113-watch-fixture.js`) ran the worktree `claim.js` `watch-pr` against temp repos and `KAOLA_GH_MOCK_SCRIPT`. Observed ids:

- explicit issue OPEN: receipt `kept_open` / `intentionally_kept_open`, invariant ids empty, no issue close or reopen
- explicit issue CLOSED: `keep_open_violation`, ids `keep-open-pr-violated` only, no reopen
- explicit probe exit 1: ids `remote-members-closed,keep-open-pr-unknown`, token is not `skipped_offline`
- close-mode issue OPEN: `skipped_offline`, no `keep_open_observation`
- direct invariant calls match those id sets
- `readActiveFolders` returns the two new fields, empty when absent

## Defects fixed inside this candidate

1. `validate-workflow-contracts.js` exited 1: `commands/kaola-workflow-finalize.md:134: PROVENANCE_BAN — provenance token "#1113"`. The skeleton and the GitHub slot comment named the issue. Both authoring lines were rewritten without an issue number, ADR id, or D-id, and the surfaces were regenerated. The re-run in `check-validators.txt` exits 0. Issue numbers remain in `CHANGELOG.md`, `docs/`, and ADR 0031, which the ban does not scan.

2. `validate-kaola-workflow-contracts.js` exited 1: `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js must match scripts/kaola-workflow-sink-pr.js`. A header sentence had been added after an earlier edition sync. `edition-sync.js --write` copied that one file. The two sink-pr hashes now match (`0a8be331…`). The re-run exits 0.

3. The first sink-fixture run exited with `FAILURES 1` and `pure conflict, got {"kind":"explicit","base_branch":""}` (session terminal `call-d8bda2c1-e964-4e06-a2eb-12b7db4c86ff-128.log`). The fixture appended a second `branch:` line. `assessKeepOpenPr` signs the first matching field line, so both texts still agreed. The fixture was changed to replace the first branch line. The product signature was not changed. The re-run in `check-sink-fixture.txt` exits 0.

The earlier validator transcript is session log `call-acfc4579-dfd7-41a1-be8c-7ffad3f33eed-155.log` (`CONTRACTS:1` on both commands). The green re-run is the one stored in this cache.

## Independent pins

`kaola-workflow/issue-1113/.cache/keepopen-independent-pins/REPORT.md` is present, 11382 bytes, SHA-256 `841d8e58508eed80af1cf0b75c7c98b53fc707a8081a39a607b5407c4f2a6650`. This delivery hashed it and did not edit it. The proposed test-only patch was not adopted. Shipped acceptance assertions were not changed, dropped, or reseeded. New-mode proof in this delivery is the isolated fixture stdout above. A shipped new-mode test waits until the Host accepts the pins patch and hands it to this worker.

## Scoped local adoption

No installation was performed. No hand-copy into a consumer. No global refresh.

Resolved consumer paths, measured this delivery, are the installed base bytes, not this worktree:

| Installed path | SHA-256 |
| --- | --- |
| `~/.grok/kaola-workflow/scripts/kaola-workflow-sink-pr.js` | `86a450f21418b5b106e9566a53fe60667cc3d751f32b4931822da8b3b049d844` |
| `~/.grok/kaola-workflow/scripts/kaola-workflow-claim.js` | `029bf7a858bfb74f7abe7f0962e2c1062f07fc54d86602cd287be27dcbb29d23` |
| `~/.agents/kaola-workflow/scripts/` same two files | same base hashes |
| `~/.claude/kaola-workflow/scripts/` same two files | same base hashes |
| `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/12.4.0/scripts/` same two files | same base hashes |

Grok’s installed resolver (`~/.grok/commands/kaola-workflow-finalize.md`) uses `./scripts` first only when `./package.json` name is `kaola-workflow`. Otherwise it uses `$GROK_HOME/kaola-workflow/scripts` (default `~/.grok`) first. VRPCadCore has no root `package.json`. A search under `/Users/ylmacstudio/Workspace/vrpcadcore` found no `kaola-workflow-sink-pr.js` and no `kaola-workflow-claim.js`. A Grok consumer there resolves the installed base scripts.

Codex `kaola_script` uses `./plugins/kaola-workflow/scripts/$_n` when that file exists, otherwise `find $HOME/.codex/plugins/cache -path '*/kaola-workflow/*/scripts/$_n'`. VRPCadCore has no local copy, so Codex resolves the 12.4.0 plugin cache, which is the base bytes.

`docs/installation.md` project scope (`--target DIR`, or `--project` for Devin, Droid, and DSH) materializes commands and skills into the project runtime tree. It does not replace the support scripts those resolvers select for a repository that is not the `kaola-workflow` package. A project-only command install would put the new flag text next to the old scripts, which still refuse `comment_keep_open`.

There is no supported switch that points only VRPCadCore at this uncommitted worktree. Scoped adoption is feasible later as a supported install of a Host-accepted commit. This delivery does not do that install.

## Uncertainty and what this delivery does not decide

- The full `simulate-workflow-walkthrough.js` suite and the applicable full producer chains were not run. The 24-scenario subset, the validators, the bash-block guards, and the two `/tmp` fixtures are focused evidence only. They are not installed compatibility and not Host acceptance.
- The unknown-probe double invariant (`remote-members-closed` and `keep-open-pr-unknown` together) is implemented and documented. It was not changed to silence either id.
- GitLab and Gitea generated finalize prose mentions the GitHub exception and still refuses in the slot guard. Their claim and sink sources were not given the mode. The shared `unknown` enum token is present because of byte identity. No focused test that was run froze the previous exact token list. If a later full-chain snapshot requires the old array, that failure belongs to Host review of this candidate; this delivery did not weaken a shipped assertion to hide it.
- No consumer-reaching run was executed against VRPCadCore. No live `gh` probe was mutated. `watch-pr` was not run on the real Kaola-Workflow checkout.
- The candidate is uncommitted. A later commit, if the Host asks for one, will have a different object hash than `candidate.diff`.

## Host handoff

Ready for the Host to review `candidate.diff` (`0e582b2f…`), integrate or reject the independent pins, and then run acceptance and the standard provider lifecycle separately. This worker stops here.
