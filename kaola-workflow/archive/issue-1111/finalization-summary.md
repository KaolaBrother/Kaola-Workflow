# Finalization — Summary: issue-1111

Issue **#1111** — 减法：KW 回归 forge 与工程生命周期，移除运行时偏好及重复 QA、文档流程.
Branch `workflow/issue-1111`. Accepted head `c54d905df65fffb9917947a6d121a1e4b3f75952`.
Base is `6e514f4cd67c17fb8a0e6adef13be41f1ba5b708` (the #1110 sink, `origin/main` at finalize).

## Delivered

Kaola-Workflow no longer adds a runtime dispatch, scheduling, or subagent-catalog policy, and finalization no longer requires a second QA pass or a `DOCKED`/`BLOCKED` documentation ledger. Active prompts keep the host boundary. Codex and Claude diagnostics report the config values they read. `dispatch_posture` stays null. ADR 0030 records the split. `templates/axioms.md` is no longer an active source.

Three commits, replayed onto the #1110 sink. Pre-rebase SHA, then the SHA on this branch:

- `47fb3625` → `5d0a6876325fb5fb8351cae027fbedace7426aef` — drop the runtime bias and the per-issue QA ceremony.
- `51fff9fe` → `7922d37142336c64b3b596cb113ef5fc277ab435` — clear QA defects D1–D10.
- `2918b3ef` → `c54d905df65fffb9917947a6d121a1e4b3f75952` — clear the five chain failures N1, P1, P2, P3, and R1.

Author and committer on each are KaolaBrother `<yanleichen@hotmail.com>`. No trailers.

Quality story, in order:

- Independent QA on `47fb3625`: **ACCEPT WITH DEFECTS**, no human-decision blocker. `/tmp/kw-i1111-qa/qa-verdict.md`. Surface inventory `/tmp/kw-i1111-qa/surface-inventory.md`, `/tmp/kw-i1111-qa/surfaces.tsv`.
- Repair of D1–D10 and the STEP6 comment landed at `51fff9fe` (now `7922d371`).
- Bounded recheck of that repair: D1–D10 and STEP6 **FIXED**, and the candidate was not chain-green. `/tmp/kw-i1111-qa/recheck.md`.
- Repair of N1 (finalize custody reflow), P1 (#1055 render baseline), P2 (#1044 carrier floor 4500 B, ceiling 7500 B), P3 (GitLab and Gitea `dispatch_posture === null`), and R1 (`docs/workflow-state-contract.md`) landed at `2918b3ef` (now `c54d905d`).
- Bounded recheck 2: N1, P1, P2, P3, and R1 **FIXED**. Previously red suites green. `/tmp/kw-i1111-qa/recheck2.md`. Run logs `/tmp/kw-i1111-qa/recheck2-runs/`.
- The branch was then rebased onto `6e514f4c`. Host-reported bounded revalidation of the five previously red suites, `generate-routing-surfaces.js --check`, both contract validators, `test-claim-hardening.js`, and `simulate-workflow-walkthrough.js` was green both before that rebase and on `c54d905d` after it. This session did not find a separate log for that pair. The producer chain below is the receipt bound to the published candidate.

Acceptance against the issue's ten checks:

1. Active prompts, installers, and diagnostics were reviewed. The inventory and the D1–D10 repair cover the surfaces QA first found still teaching the deleted policy, including `install.sh`, Next resume, conventions, finalize frontmatter, plugin catalogs, edition docs, installation and API wording, compact-protocol rows, and agents-source ownership.
2. The deleted dispatch, model, concurrency, and batch preferences are gone from active prompts. Negative contract guards forbid the old sentences. Recheck 2 found those phrases only in the guards and in archived history.
3. Codex doctor output reports config facts and leaves `dispatch_posture` null. Claude install reports `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` as the env or settings value it read. A missing flag is not a capability verdict.
4. Assertions and docs that existed only to protect the deleted policy were retired or rewritten. Lifecycle suites stayed. `templates/axioms.md` is deleted as an active source after the reference check.
5. Claim, ledger, workspace, finalize, merge, closure, archive, and cleanup are the retained lifecycle. `claim.js` was not edited. The producer chain on `c54d905d` is green, including the integration walkthrough inside the Claude chain.
6. Finalization records evidence it already has. It does not open a second QA pass. The binding check is the chain receipt, not a sentence match.
7. The minimal lifecycle record is this summary plus the chain receipt. KPR #213 is the paired retarget; see Follow-Up Items. A consumer that does not install the Runner still finalizes from the project's own evidence.
8. Retired checks are the ones that required the deleted policy to be present. Behavior and lifecycle checks remain, and the chain ran them. Nothing red was waived.
9. Routing surfaces were regenerated and `generate-routing-surfaces.js --check` passed inside the chain (24 surfaces). No install, release, or tag was performed. An isolated install into a user config was not run; the issue and this assignment both forbid that install.
10. The deletions and the reasons are the three commit messages, ADR 0030, and the `[Unreleased]` changelog entry. Success was not defined as preserving old prompt bytes or old assertion counts.

## Files Changed

74 files, `6e514f4c` to `c54d905d`, +1391 / −2117.

- Prompts and renders: `templates/routing/dispatch-contract.md`, `finalize.skeleton.md`, `next.skeleton.md`, `required-blocks.js`, `slots.js`; `commands/workflow-next.md`, `commands/kaola-workflow-finalize.md`; the GitLab and Gitea command copies; the three plugin Next and Finalize skills.
- Diagnostics and install: `install.sh`, `scripts/kaola-workflow-codex-preflight.js`, and the three plugin copies of that preflight and of `install-codex-agent-profiles.js`.
- Adapter facts: `templates/agents/runtime-capabilities.json`, `scripts/runtime-adapter-facts.js`. Deleted active source: `templates/axioms.md`.
- Docs: `README.md`, `AGENTS.md`, `CHANGELOG.md`, `docs/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/installation.md`, `docs/conventions.md`, `docs/agents-source.md`, `docs/runtime-capabilities.md`, `docs/workflow-state-contract.md`, the eight edition docs, ADR 0029 note, ADR 0030.
- Catalogs: five plugin `plugin.json` files.
- Tests and fixtures: `scripts/fixtures/issue-1055-render-baseline.json`, `scripts/test-issue-1044-prompt-bundle.js`, `scripts/test-issue-1101-native-only.js`, `scripts/test-install-model-rendering.js`, `scripts/test-runtime-agent-architecture.js`, `scripts/test-route-reachability.js`, `scripts/test-finalize-door.js`, `scripts/simulate-workflow-walkthrough.js`, `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`, the GitLab and Gitea workflow-script tests, and the edition suites touched by the render change (`test-cursor-edition.js`, `test-grok-edition.js`, `test-zcode-edition.js`, `test-generate-routing-surfaces.js`, `test-issue-1045-cursor-conformance.js`, `scripts/sync-cursor-edition.js`, `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`).

## Test Coverage

Producer chain at `c54d905d`, `KAOLA_WORKFLOW_OFFLINE=1`, worktree clean. Command: `node scripts/kaola-workflow-run-chains.js --project issue-1111 --json`, from `.kw/worktrees/issue-1111`. Receipt: `.cache/chain-receipt.json`.

- `headSha` `c54d905df65fffb9917947a6d121a1e4b3f75952`
- `workTreeHash` `clean`
- `codeTreeHash` `4105b1a419f4add9524603fb99b39b53036d607b6627917d633d5670b0f8b268`
- Scope `all-four` / `edition_coupling` / 74 files
- Started `2026-09-28T09:52:04.372Z`, completed `2026-09-28T10:04:22.146Z`
- Claude exit 0 in 712227 ms (55 steps). Codex exit 0 in 9391 ms. GitLab exit 0 in 174689 ms. Gitea exit 0 in 173984 ms. No retries, no timeouts.
- Log: `/tmp/kw-i1111-finalize-chains.log`

Earlier evidence that still matches this candidate's bytes for the repaired surfaces: `/tmp/kw-i1111-qa/qa-verdict.md`, `/tmp/kw-i1111-qa/recheck.md`, `/tmp/kw-i1111-qa/recheck2.md`.

Not run in this finalize session: a machine-global or user-config install, a release, and a tag. No chain was waived.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- AGENTS.md
- CHANGELOG.md
- README.md
- commands/kaola-workflow-finalize.md
- commands/workflow-next.md
- docs/README.md
- docs/agents-source.md
- docs/api.md
- docs/architecture.md
- docs/conventions.md
- docs/cursor-edition.md
- docs/decisions/0029-native-subagents-only.md
- docs/decisions/0030-forge-and-engineering-lifecycle.md
- docs/devin-edition.md
- docs/droid-edition.md
- docs/dsh-edition.md
- docs/grok-edition.md
- docs/installation.md
- docs/kimi-edition.md
- docs/opencode-edition.md
- docs/runtime-capabilities.md
- docs/workflow-state-contract.md
- docs/zcode-edition.md
- install.sh
- plugins/kaola-workflow-gitea/.claude-plugin/plugin.json
- plugins/kaola-workflow-gitea/.codex-plugin/plugin.json
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/commands/workflow-next.md
- plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json
- plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/commands/workflow-next.md
- plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
- plugins/kaola-workflow/.codex-plugin/plugin.json
- plugins/kaola-workflow/scripts/install-codex-agent-profiles.js
- plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js
- plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
- plugins/kaola-workflow/scripts/validate-workflow-contracts.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-codex-preflight.js
- scripts/runtime-adapter-facts.js
- scripts/simulate-workflow-walkthrough.js
- scripts/sync-cursor-edition.js
- scripts/test-cursor-edition.js
- scripts/test-finalize-door.js
- scripts/test-generate-routing-surfaces.js
- scripts/test-grok-edition.js
- scripts/test-install-model-rendering.js
- scripts/test-issue-1044-prompt-bundle.js
- scripts/test-issue-1045-cursor-conformance.js
- scripts/test-issue-1101-native-only.js
- scripts/test-route-reachability.js
- scripts/test-runtime-agent-architecture.js
- scripts/test-zcode-edition.js
- scripts/validate-kaola-workflow-contracts.js
- scripts/validate-workflow-contracts.js
- templates/agents/runtime-capabilities.json
- templates/axioms.md
- templates/routing/dispatch-contract.md
- templates/routing/finalize.skeleton.md
- templates/routing/next.skeleton.md
- templates/routing/required-blocks.js
- templates/routing/slots.js

## Documentation Docking

DOCKED. Evidence: `.cache/doc-docking.md`. README, the docs index, API, architecture, installation, conventions, the workflow-state contract, agents-source, runtime capabilities, the eight edition docs, the changelog, ADR 0030, and `AGENTS.md` match the candidate. Historical changelog entries and archived run records were left as history.

The installed v12.3.1 prompt required this file. The #1111 prompt does not. This run followed the prompt that was loaded.

## Follow-Up Items

No new issue filed. The items below are accepted known notes.

- **Q1, long-line fragility.** `templates/routing/finalize.skeleton.md` keeps the custody sentence on one line so the whitespace-pinned needles in `scripts/test-issue-1101-native-only.js` match. Recheck 2 measured that line at 166 columns and called it cosmetic: the skeleton already had lines over 100 columns, and a later rewrap of this paragraph will redden that suite again. The optional fix is a whitespace-normalized comparison. It was left outside this delta. `/tmp/kw-i1111-qa/recheck2.md`.
- **Q2, baseline `captured_at_commit`.** `scripts/fixtures/issue-1055-render-baseline.json` records `captured_at_commit` `51fff9fe0307527059ba6b37f4a2dfe9398183ba`. That is the pre-rebase SHA from capture time. The file rides in `c54d905d`. A commit cannot record its own hash, and the rebase did not rewrite the label. The stored render hashes match this candidate; the #1055 oracle passed in recheck 2 and again inside the Claude chain. The label is provenance, not the pin.
- **KPR #213 doc-docking retarget.** Paired issue KaolaBrother/kaola-project-runner#213 is closed completed at `2026-09-28T09:06:02Z`. Upstream `skills/kaola-project-runner/references/doc-maintenance.md` now says the effective Kaola-Workflow finalize contract owns docking procedure, and that where the installed Workflow still runs documentation docking, it records this. It no longer asks the Host to keep a second doc ledger. The copies loaded on this machine still have the pre-#213 sentences: `~/.grok/skills/kaola-project-runner/references/doc-maintenance.md` lines 21 and 37, and the same file under `~/.agents/skills` and `~/.zcode/skills`. This run satisfied that loaded text by writing `.cache/doc-docking.md`. No Runner install was performed. Later runs that load the #1111 prompt record acceptance in this summary and do not require the `DOCKED`/`BLOCKED` file (ADR 0030 decision 4).

searched: no new follow-up was filed, so there is no duplicate probe for a new issue. KPR #213 was confirmed with `gh issue view 213 --repo KaolaBrother/kaola-project-runner` (state CLOSED, reason COMPLETED).

## Readiness

Accepted head `c54d905d` is the candidate. The chain receipt is bound to that commit. Sink is merge. Issue #1111 closes on the verified merge. No release, tag, or install.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1111/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1111/.cache/doc-docking.md
- kaola-workflow/archive/issue-1111/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1111/finalization-summary.md
- kaola-workflow/archive/issue-1111/mission-ledger.jsonl
- kaola-workflow/archive/issue-1111/workflow-state.md
