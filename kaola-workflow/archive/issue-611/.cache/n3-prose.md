evidence-binding: n3-prose 174c1e0d925f
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: prose propagation + validator pins authored alongside — agent-facing surface text (commands/*.md, SKILL.md) and the machine-enforced contract pins that turn a drop RED are authored together; there is no isolated failing behavioral unit to write first (the "test" IS the six-surface substring pin added in the same change).
<!-- regression-green|build-green|smoke-integration -->
regression-green: verification_tier: regression-green

Commands run (from the leg root
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-611/n3-prose`), all exit 0:

- `node scripts/validate-workflow-contracts.js` -> "Workflow contract validation passed"
- `node scripts/validate-kaola-workflow-contracts.js` -> "Kaola-Workflow Codex contract validation passed"
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` -> "Kaola-Workflow GitLab contract validation passed"
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` -> "Kaola-Workflow Gitea contract validation passed"
- `node scripts/test-route-reachability.js` -> "Route-reachability test passed (260 assertions)." — UNEDITED file, green with no change required (the fork_turns pin there is a plain substring check that survives the wording change; no new join-protocol T-block needed there since the join-protocol needles are covered by the four contract validators above, which ARE in this node's write set)
- `node scripts/simulate-workflow-walkthrough.js` -> "Workflow walkthrough simulation passed" (run twice, both clean, exit 0)

Before this node's edit, the baseline (post-n1-engine) already had all of the above green (n1 only
touched adaptive-node.js/adaptive-schema.js/test-adaptive-node.js/simulate-workflow-walkthrough.js).
This node's edit is prose + validator pins only; the four validators and route-reachability are
the "test" for a propagation change of this shape (a partial drop on any of the six plan-run
surfaces reds one of them) — full suite ran clean AFTER the edit, confirming no propagation gap.

One self-caught regression during self-verification: the first draft of the fork_turns rewording
introduced a mid-phrase line-wrap inside `reasoning_effort: dispatch.codex_reasoning_effort` (a
newline where the existing test-route-reachability.js T5b assertion expects a single space,
since it does raw `content.includes(...)` with no whitespace normalization, unlike the
`assertIncludes`/`norm()` helper the four contract validators use). Caught by running
test-route-reachability.js per the task's mandatory checklist; fixed by rejoining the line in all
six surfaces; re-ran all five checks clean afterward.

## Per-surface checklist

**Codex SKILL packs (3) — full Join Protocol A–F, `fork_turns:"none"` unconditional:**
- [x] `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
- [x] `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`
- [x] `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`

New `## Codex Join Protocol` section (anchored `<!-- PIN: join-protocol -->`) inserted between the
existing `## Dispatch` and `## Gate-Role Degradation Notice` sections, byte-identical across all
three (verified via `diff`; only the pre-existing per-forge script-name/title substitutions
differ). Encodes:
- A — `dispatch.wait_budget_minutes` on every card; a `running` agent is NEVER interrupted before
  budget expiry.
- B — long-poll `wait_agent` loop (one call per iteration, long timeout, multi-id where
  supported), drain-all on wake via `list_agents` + `record-evidence`/`close-node`/best-effort
  `close_agent`, `send_message` status-probes PROHIBITED.
- C — escalation ladder (`followup_task` → grace window → `interrupt_agent` + `followup_task` →
  reclaim as LAST resort), typed `delegation_outcome` vocabulary recorded in evidence.
- Writer kill-safety — in-place writers non-interruptible before budget+ladder; isolated-leg
  discard is the only interruptible path; mandatory `reconcile-running-set` + honor `writerHalt`
  before re-opening a halted node (closes the halt→reopen laundering hole).
- F — same-turn frontier spawns, one join loop per frontier, width counts RUNNING members only,
  reactive (not proactive) spawn-refusal retry.

**Claude/forge command surfaces (3) — runtime-appropriate equivalent, `fork_turns:"none"`
unconditional:**
- [x] `commands/kaola-workflow-plan-run.md`
- [x] `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`
- [x] `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`

Extended the existing `#### Teammate-Mode Dispatch` subsection (right after the pre-existing
idle-race paragraph, before the "When classic" paragraph) with a "Wait budget, escalation, and
writer kill-safety" block in Claude vocabulary (`SendMessage` instead of
`followup_task`/`interrupt_agent`), referencing the SAME `dispatch.wait_budget_minutes`,
`delegation_outcome` vocabulary, and `reconcile-running-set`/`writerHalt` contract as the Codex
side, plus a `<!-- CARD: join-protocol -->` pointer to the new card for readers who want the
Codex-native mechanics. Content is byte-identical across all three (verified via `diff`; only the
pre-existing per-forge substitutions differ).

**`fork_turns: "none"` unconditional mandate (AC4)** — updated in all 6 files above: the Codex v2
dispatch line now passes `fork_turns: "none"` on EVERY call (tiered or not) alongside
`task_name`/`agent_type`, with `reasoning_effort` staying conditional on a non-null
`codex_reasoning_effort`; the v1 fallback line now states the SAME unconditional mandate applies
identically to that dispatch mode. The retired "inherited-history forks are not a valid path for
tiered nodes" framing (which tied the rule to tiered dispatch only) was removed and replaced with
"the dispatch card is self-contained by contract, so no role spawn ever forks the parent's
history" (an unconditional rationale).

**New reference card:**
- [x] `docs/plan-run-cards/join-protocol.md` (new) — detailed mechanics matching the existing
  card style (`resume.md`/`speculative-open.md`/`frontier-batch.md`): wait-budget table, long-poll
  drain-all loop, escalation ladder + delegation_outcome vocabulary table, writer kill-safety +
  the actual `reconcile-running-set` JSON verdict shape (verified against the n1-engine source:
  `classifyWriterReconcile` in `scripts/kaola-workflow-adaptive-node.js`, reasons
  `in_write_set`/`write_set_overflow`/`barrier_unverifiable`/`no_baseline`), frontier discipline +
  slot awareness, and a quick-reference ASCII diagram.

**Enforcement pins — 4 validators (byte-pair + 2 forge twins), following the existing
`planRunSurfaces606`/`607` sentinel pattern:**
- [x] `scripts/validate-workflow-contracts.js` — three new six-surface loops: (1)
  `planRunSurfaces611ForkTurns` pins the unconditional mandate + bans the retired qualifier phrase
  across all 6 surfaces; (2) `codexJoinProtocolSurfaces611` pins the `<!-- PIN: join-protocol -->`
  anchor + wait-budget/delegation_outcome/writerHalt tokens on the 3 Codex SKILL packs; (3)
  `claudeJoinProtocolSurfaces611` pins the same wait-budget/writerHalt/delegation_outcome tokens +
  the "Writer kill-safety" heading on the 3 Claude/forge command surfaces.
- [x] `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical copy of the
  above (verified `diff` clean after `cp`; this pair is a documented SYNC-GROUP).
- [x] `scripts/validate-kaola-workflow-contracts.js` — added the equivalent pins scoped to the two
  surfaces this validator owns (its own SKILL pack + the shared root `commands/` file), following
  its existing `for (planRunSurface of [SKILL, 'commands/...'])` pattern at the #598 AC4 block.
- [x] `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
  extended the existing shared `for (planRunSurface of [pluginRoot commands, pluginRoot
  SKILL])` loop (the same loop #602/#604/#605/#606/#607 already extend) with the new #611 checks,
  plus two SKILL-only / command-only single-file pins for the join-protocol anchor and the
  "Writer kill-safety" heading respectively.
- [x] `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — identical
  structure/edit to the gitlab twin (forge-neutral, only `pluginRoot` differs).

**`scripts/test-route-reachability.js`** — NOT in this node's write set, NOT edited. Its existing
T5b block does a plain substring check for the literal `fork_turns: "none"` text (present,
unconditionally, in all 6 files after this change) and for
`reasoning_effort: dispatch.codex_reasoning_effort` (present, single-space, after the line-wrap
fix above) — both still pass with zero edits to that file. No existing pattern in that file
requires a new join-protocol T-block (the join-protocol content is covered by the four contract
validators, which own that job per the existing division of labor between the root
route-reachability test and the per-edition contract validators).

## Out-of-set observations (not acted on, for the team/finalize to route)

- `docs/plan-run-cards/README.md` is the card index (`## Cards` table) and explicitly documents
  that new cards are NOT part of the six-surface propagation contract ("These cards are NOT part
  of the six-surface resident prose... They live once under `docs/plan-run-cards/`"), so its
  absence from any node's declared write set is not itself a contract violation. It is, however,
  the existing DISCOVERABILITY convention — every prior card (`resume.md`, `governance.md`,
  `repair-routing.md`, `reopen-complete-node.md`, `frontier-batch.md`, `speculative-open.md`) is
  listed in that table. `docs/plan-run-cards/join-protocol.md` is NOT in my declared write set (nor
  in n5-docs's: `CHANGELOG.md, docs/decisions/D-611-01.md, docs/api.md, docs/architecture.md,
  docs/conventions.md`), so I did not touch it. Recommend a small follow-up (a one-line table row
  addition) at finalize or as a future issue.
- PROVENANCE_BAN — confirmed all six prose surfaces + the new card carry zero `#NNN`/`D-NNN-NN`/
  `INV-NN`/ADR/PR·MR·AC# tokens (the validator's own PROVENANCE_BAN scan over `agents/commands`
  and `agents.toml`/`skills/SKILL.md` passed in all four contract-validator runs above). The
  `#611`-prefixed comments I added are confined to the `.js` validator scripts themselves, which
  are NOT prompt surfaces and are NOT scanned by PROVENANCE_BAN (matches the existing convention —
  every prior `#582`/`#602`/`#606`/`#607` pin comment in these same files carries its issue number).
