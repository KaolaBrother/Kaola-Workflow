## Summary

Cursor named-role dispatch and the installed Cursor doctor had two independent defects at the
10.1.1 boundary:

1. a Workflow Next parent could translate an exact-tier requirement into the generic Task `model`
   field, overriding a named profile instead of letting that profile resolve its tier; and
2. the installed `kaola-workflow-cursor-surface.js --doctor` tried to read
   `templates/agents/runtime-capabilities.json` from the installed support root even though the
   installer did not deploy that file.

Both are fixed by commit `5a0a1895817771992b2ebb81199eec25ec721b88`. The design remains
subtractive: one schema-parameterized Cursor dispatch rule, one capability registry, no host
guessing, no dynamic prompt append, no JavaScript prompt replacement, and no pre/post-tool prompt
injection.

## Corrected baseline and measured failures

The original report was directionally correct but one inference was not: Cursor did not lack
`cursor-grok-4.6-medium` or `cursor-grok-4.6-high`. A fresh diagnostic parent on 10.1.1 proved that
named calls which omit `model` resolve through the project profiles. The failing production parent
had instead emitted an explicit xhigh model for a standard role after treating the generic model
enum as the capability authority.

This run re-established the two failures on base
`be2addc6f8e06fd41626c7ffac4d029da5250162`:

- the focused behavioral oracle was RED because generated Cursor guidance did not state that an
  exact-tier requirement is a post-resolution assertion;
- the real installed helper exited non-zero with `ENOENT` for
  `~/.cursor/kaola-workflow/templates/agents/runtime-capabilities.json`;
- `--ensure-target` still worked on 10.1.1, proving the doctor crash was an installed-layout
  authority gap rather than a named-dispatch failure; and
- the post-#1044 Workflow Next size was measured rather than copied from the issue's older
  14,783-byte observation.

## Decision of record

The Cursor runtime adapter now owns one rule, parameterized only by the live Task schema and the
receipt-verified materialized profile:

1. inspect the current Task schema and send only fields it exposes;
2. when the exact Kaola role is in the live `subagent_type` enum and its project receipt is valid,
   call Task with the flat `subagent_type: "<role>"` field and **MUST omit** per-call `model`;
3. treat an exact-tier requirement as a post-resolution assertion, never as authorization to fill
   the generic model field;
4. do not interpret missing medium/high values in the generic model enum as a named-profile
   capability gap; and
5. verify the resolved tier from provider evidence such as
   `providerOptions.cursor.modelName` when available. A TUI child transcript is insufficient, and
   internal `subagentType.custom.name` is provider encoding rather than controller call shape.

If the exact role is absent, the parent evaluates real built-in/generic routes under their own
identities, distinguishes `not_materialized` from a runtime capability gap, and re-evaluates the
next mission independently. CLI, App Local, and Cloud keep separate installation and reload
receipts; the operation prompt does not ask the model to guess which host it is on.

This is why the design does not add three host-specific prompts, a script that chooses and appends a
prompt, or pre/post-tool hooks. The live schema already supplies the varying runtime fact, while the
single adapter wording supplies the invariant decision rule.

## Implementation

- `templates/agents/runtime-capabilities.json` now carries machine-readable Cursor
  `dispatch_conformance` plus the stronger dispatch carrier wording.
- `generate-agent-profiles.js` validates all conformance fields. Routing/doctor-only conformance is
  excluded from native profile hashes, so unchanged role profiles do not churn.
- the Cursor global transaction receipt-owns the exact registry at
  `${CURSOR_HOME:-~/.cursor}/kaola-workflow/templates/agents/runtime-capabilities.json`;
  `--no-scripts` still deploys this non-executable authority.
- the installed helper reads that managed file, and doctor returns it as `dispatch_contract`.
- the focused suite performs a hermetic global install, removes any source-checkout dependency,
  runs installed doctor and ensure-target, verifies receipt ownership, and checks generated Next
  and Finalization call-shape prose.
- fast, full, and edition producer chains now include that focused suite.
- README, API, architecture, Cursor edition, runtime capability, and changelog documentation all
  describe the same source/install/doctor/provider boundary.

During full-edition validation this run also found a separate post-#1044 test residue: deleting the
last OpenCode compact plugin also deleted `templates/opencode/plugins/`, while the edition test still
called `readdirSync` as if that directory must exist. The test now treats an absent retired directory
as the empty allowlist and creates/removes the mutation-probe directory transactionally. This is a
test-harness repair only; no OpenCode compact plugin was restored.

## Final candidate measurements

Measured from the isolated candidate install produced by
`5a0a1895817771992b2ebb81199eec25ec721b88`:

| artifact | bytes | SHA-256 |
|---|---:|---|
| project `workflow-next.md` | 15,121 | `2fc2199dd952c982dde30f5a5e1a716c993fb72f90a900390a023207996f7ab9` |
| project `kaola-workflow-finalize.md` | 23,192 | `892a4649fc7b93cbe316c0622fb606b62ac26a11f2d7aabdea7f3495958ff373` |
| installed `runtime-capabilities.json` | 38,205 | `293e39ca30ce97fb4ab23c13e0adb7a5d5f76efd8f497487d2927cd314f17650` |

Hermetic install results:

- global transaction: 37 receipt-owned files;
- project materialization: 18 receipt-owned files;
- every global and project file reported `current` with no collision;
- installed doctor exited zero without a source checkout and returned
  `dispatch_contract.named_model_field = "omit"` and
  `dispatch_contract.exact_tier = "post_resolution_assertion"`;
- installed `--ensure-target` returned `current`; and
- the candidate intentionally reported `stale_version` at the release-freshness layer because these
  new bytes still carried package version 10.1.1 before the next release. That is a prerelease
  version fact, not byte or receipt drift; final released installation proof belongs to #1046.

## Fresh live Cursor CLI acceptance

The final candidate was materialized into a fresh temporary Git repository and opened in a new
managed Cursor CLI session. No repository writes or shell calls were permitted inside the three
children.

- Cursor CLI: `2026.08.25-3e8eec8`
- parent requested/resolved model: `cursor-grok-4.6-xhigh`, effort=xhigh, fast=false
- live Task schema contained `code-explorer`, `code-reviewer`, and `planner`
- the generic Task model enum exposed xhigh but not the medium/high named-profile slugs
- the parent read candidate Workflow Next and all three profile frontmatters before dispatch
- all three controller calls used flat `subagent_type` and omitted `model`, `resume`,
  `file_attachments`, and `run_in_background`

Provider stores were read independently after the children completed:

| intent / role | child id | controller `model` | provider `modelName` | marker |
|---|---|---|---|---|
| standard / `code-explorer` | `74be9459-a782-41df-934a-24fc4a12d4ca` | omitted | `cursor-grok-4.6-medium` | `KW1045-STANDARD-OK` |
| reasoning / `code-reviewer` | `1dea776a-6343-4013-951c-9376337c2b94` | omitted | `cursor-grok-4.6-high` | `KW1045-REASONING-OK` |
| heavy / `planner` | `0158bb78-4cd5-43ce-8675-7d38a8f3b89d` | omitted | `cursor-grok-4.6-xhigh` | `KW1045-HEAVY-OK` |

The exact owned tmux session was then stopped and verified absent. This closes the original model
escape: no standard/reasoning child was rewritten to xhigh, and missing generic enum values did not
produce a named-route gap.

## CLI, App Local, and Cloud capability boundary

The earlier three-host probe remains part of the evidence:

- standalone CLI and App Local both exposed all 14 project-materialized Kaola names and proved flat
  named dispatch with no per-call model;
- the tested Cloud Build without the selected project's materialization was built-in-only, so its
  result was `not_materialized`, not a named-route capability claim; and
- the corrected saved Cloud environment path requires machine authority plus selected-repository
  materialization, a tested and user-saved Build, and a new top-level Agent in that same repository.

The candidate live re-test above exercised standalone CLI. App Local and Cloud do not need different
operation prose: they consume the same schema-parameterized rule but retain independent install/save
and live-catalog proof. Cross-runtime and post-release live installation acceptance is tracked by
#1046 and must not be inferred from the CLI result.

## Validation

Focused and structural acceptance on the frozen candidate:

- `node scripts/test-issue-1045-cursor-conformance.js` — 24 assertions PASS
- `node scripts/test-cursor-edition.js` — 834 assertions PASS across GitHub/GitLab/Gitea trees
- `node scripts/test-opencode-edition.js` — 874 assertions PASS on a clean worktree
- `node scripts/test-runtime-agent-architecture.js` — 786 assertions PASS
- `node scripts/test-generate-routing-surfaces.js` — 524 assertions PASS
- `node scripts/generate-agent-profiles.js --check` — 14 roles, 7 runtimes, 126 native renders current
- `npm run test:kaola-workflow:editions` — all 8 edition suites PASS
- `node scripts/test-spawn-classification.js` — PASS after classifying the new hermetic process site

Producer-selected final receipt:

- receipt window: `2026-08-30T16:56:11.445Z` to `2026-08-30T17:06:06.810Z`
- scope: `all-four`, reason `edition_coupling`, 14 changed files
- code-tree hash: `fa13c0482b73516c7cce249303bbadb68389123eda10ee479313044d97fae879`
- claude: PASS, 569,619 ms
- codex: PASS, 9,150 ms
- gitlab: PASS, 107,643 ms
- gitea: PASS, 106,631 ms
- no accepted red, retry, timeout, or signal in any chain

## Acceptance disposition

All #1045 acceptance clauses are satisfied at implementation commit `5a0a1895`:

- installed doctor and ensure-target work without a source checkout;
- exact named standard/reasoning/heavy calls omit per-call model and independently resolve to
  medium/high/xhigh;
- the generic model enum cannot create a named-profile capability gap;
- call shape, resolved profile, and provider evidence remain separate field spaces;
- one schema-parameterized rule serves CLI/App Local/Cloud without host guessing or dynamic prompt
  composition; and
- host materialization is reported independently, with absent Cloud bytes typed as
  `not_materialized`.

The issue is ready for Workflow Finalization, archive, sink, and closure. The next release and the
post-release all-runtime installation/live-proof transaction remain the explicit scope of #1046.
