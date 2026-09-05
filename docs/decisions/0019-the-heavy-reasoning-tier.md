# 0019 — The heavy-reasoning tier

- **Status:** Accepted 2026-08-24. The three-tier implementation is present in Issue #1018 / PR
  #1019 on this branch and is pending merge to `main`; this record now describes the shipped
  candidate surfaces rather than the former two-tier-only state.
- **Date:** 2026-08-24
- **Extends:** the two-tier role classification (`sonnet`/standard, `opus`/reasoning) — the plan
  vocabulary #610 fixed and every edition derives from. Does not supersede any prior ADR.
- **Owner decisions (recorded 2026-08-24, in conversation):** codex standard tier unchanged;
  planner-class = `planner` + `code-architect`; opencode and kimi behavior unchanged; the
  grok/cursor escalation gap accepted as a declared divergence; the two default downgrades in §3
  confirmed deliberate; Claude bindings stay on unversioned aliases so they float with model
  updates.

## 1. What forced this

Two observations from running the workflow, not a design review:

- **The top tier existed only as a habit.** Reviewer-class dispatches on this machine ran at the
  top Claude tier by a standing out-of-repo practice ("override reviewers to the top alias") that
  no surface carries and no other machine inherits. A rule that lives nowhere is the failure: the
  distinction the habit was groping at — *reasoning is the reviewer default; the top tier is the
  escalation* — is not expressible in a two-tier vocabulary, so it stayed unrecorded.
- **Top-tier reviewers overthink.** Review output wanders outside the dispatched surface —
  re-litigating architecture, proposing redesigns of functions the dispatch never asked about.
  The cost lands twice: tokens spent producing out-of-scope findings, and orchestrator context
  taxed re-scoping them afterwards.

A third named tier turns the habit into a rule, and the scope clamp (§5) addresses the second
observation at its source rather than by capping the tier.

## 2. The decision

One canonical axis, three tokens, declared where the two existing ones already live — the
`model:` frontmatter of `agents/<role>.md`: `sonnet` = standard, `opus` = reasoning, **`fable` =
heavy-reasoning**. Every edition keeps deriving its binding from that token; no new authoring
surface exists.

| tier | claude | codex | grok | cursor | opencode | kimi | zcode |
|---|---|---|---|---|---|---|---|
| standard | `sonnet` | `gpt-5.6-luna` / `max` | inherit + `effort: medium` | `grok-4.6[effort=medium]` | session model | session model | `GLM-5.3` / `thoughtLevel: high` |
| reasoning | `opus` | `gpt-5.6-sol` / `medium` | inherit + `effort: high` | `grok-4.6[effort=high]` | per-role override list | session model | `GLM-5.3` / `thoughtLevel: max` |
| heavy | `fable` | `gpt-5.6-sol` / `high` | inherit + `effort: xhigh` | `grok-4.6[effort=xhigh]` | classifies as reasoning | session model | `GLM-5.3` / `thoughtLevel: max` |

**Current mapping note (2026-09-05, #1049).** The historical matrix above and the measurements in
§4 remain unchanged. Current Codex dispatch uses `gpt-5.6-luna`/`max` for standard,
`gpt-6-astra`/`medium` for reasoning, and `gpt-6-astra`/`high` for heavy; role profiles omit a
fixed model and inherit the active host policy.

Claude aliases are unversioned on purpose (owner): they float with model updates. Claude effort is
**not** pinned — all three tiers run the runtime's default effort. A per-subagent `effort` key
exists (§4) and stays unused until an observed failure demands it; the tier axis on claude is
model-only.

## 3. Role defaults and the one sanctioned escalation

- **Planner-class** (`planner`, `code-architect`) re-tiers to `fable`. These are the only two
  frontmatter edits.
- **Reviewer-class** (`code-reviewer`, `adversarial-verifier`, `security-reviewer` — the
  `generate-reviewer-profiles.js` ROLES set) **stays at reasoning**. The orchestrator may
  re-dispatch a reviewer at heavy in exactly two situations: a reasoning-tier attempt failed to
  finish the review, or the surface is judged complex enough before dispatch. That is a judgment
  call, not a trigger table — nothing inspects it, consistent with how concurrency carries no
  machinery.
- Claude's command runtime carries this one bounded `fable` re-dispatch. Generated additive command
  surfaces retain the required reviewer scope-and-acceptance wording but omit the dynamic escalation
  because those runtimes have no equivalent per-call override.
- The codex routing contract's "do not escalate, downgrade, or override" pin is reworded to carry
  this single carve-out. One wording; every runtime that renders the contract reads it.
- Every other role keeps its tier.

**Two deliberate downgrades, owner-confirmed.** On codex, reviewers move from `gpt-5.6-sol`/high
to `gpt-5.6-sol`/medium by default, with sol/high now the escalation target rather than the
resting state. On claude, reviewers rest at `opus` with `fable` as the escalation target,
retiring the fable-always habit. Both trade nothing on axiom 1 — the heavy tier remains one
decision away — and stop resting spend at the top of the range (axiom 3).

## 4. What was measured before deciding (2026-08-24)

| claim | verdict | source |
|---|---|---|
| `fable` is a valid model alias in claude agent frontmatter and dispatch | verified (Claude Code ≥ 2.1.170; availability-gated) | code.claude.com/docs `model-config.md` alias table, `agent-sdk/subagents.md` |
| claude supports per-subagent `effort` (`low`/`medium`/`high`/`xhigh`/`max`) | verified — and deliberately unused here | code.claude.com/docs `model-config.md` § effort |
| codex `model_reasoning_effort` ladder includes `medium`/`high` (and `xhigh` < `ultra`) | verified in-repo | `test-install-model-rendering.js` #775 posture cases; `init.skeleton.md` |
| grok-4.6 accepts `xhigh` reasoning effort, exact spelling | verified at the API; verified at the CLI session flag (`--reasoning-effort xhigh`, CLI 1.0.5) | docs.x.ai reasoning page; local probe `archive/issue-1012/.cache/live-grok.md` |
| grok agent-frontmatter `effort:` honors `medium`/`high`/`xhigh` | verified by the #1018 live probe | `kaola-workflow/issue-1018/.cache/live-grok.md` |
| grok `spawn_subagent` has a per-call effort or model parameter | refuted — parameter set is prompt/description/subagent_type/background/isolation/resume_from/cwd | official user guide `16-subagents.md`; matches `docs/grok-edition.md:63` |
| cursor grok-4.6 effort levels | verified: `xhigh`, `high` (default), `medium`, `low` | cursor.com/docs `models/grok-4-6` |
| cursor frontmatter bracket grammar `model: <id>[effort=…]` | verified as grammar; the literal `grok-4.6[effort=xhigh]` string appears in no doc | cursor.com/docs `subagents` |
| cursor Task dispatch can override model/effort per call | no such mechanism documented | cursor.com/docs `subagents` |

The #1018 live probe closed the Grok heavy cell: a generated planner carrying
`effort: xhigh` reached a child with `reasoning_effort: xhigh` on Grok CLI 1.0.5. The
candidate evidence is retained at `kaola-workflow/issue-1018/.cache/live-grok.md`.

## 5. The reviewer scope clamp

One wording, two placements. The dispatch guidance in `templates/routing/` requires every
reviewer dispatch to state the scope under review — the surface (diff, files, mechanism) and what
acceptance looks like. The reviewer agent bodies carry the counterpart: **findings anchor to the
dispatched surface; anything outside it — architecture-level observations included — is reported
as an observation, never expanded, never acted on.** This specifies the result a finding must
have, not a review method, per `docs/conventions.md`; it does not cap what the reviewer may read,
only what may leave as a finding.

## 6. Divergences declared, not papered over

- **grok and cursor cannot escalate dynamically.** Effort lives in the generated agent pin and
  the dispatch call carries no override (§4, both refuted/undocumented). Reviewers there rest at
  their pinned `high` and the escalation move simply does not exist on those runtimes. This is a
  named divergence — capabilities genuinely differ — not a rewrite. Heavy-variant reviewer agents
  (`code-reviewer-heavy`, …) would close the gap and are **recorded, not built** (§7).
- **kimi is single-tier and stays so** (owner). Its renderer drops `model:` entirely; the third
  token passes through with no effect and no kimi surface changes.
- **opencode behavior is unchanged** (owner) — which *forces* one code change rather than zero:
  its tier map classifies `'opus'` or `'fable'` as reasoning (everything else is standard), so a
  `fable` token would otherwise silently
  reclassify `planner` and `code-architect` to standard and drop them from the per-role override
  list. `fable` must classify as reasoning there explicitly. The silent misclassification is the
  observed failure mode that justifies the edit.

## 7. Watch list (recorded, not built)

- Heavy-variant reviewer agents for grok/cursor — build only if the resting-at-high divergence
  observably hurts a run.
- Auto-escalation triggers, or any inspector on the escalation choice.
- Effort pins on claude dispatches (the verified `effort` key stays unused).
- Escalation for any role outside reviewer-class.

## 8. Blast radius

Frontmatter: `agents/planner.md`, `agents/code-architect.md`. Resolver:
`kaola-workflow-resolve-agent-model.js` `DEFAULT_AGENT_MODELS` (held byte-equal to frontmatter).
Skeletons: `templates/routing/next.skeleton.md` + `finalize.skeleton.md` (codex three-way routing
contract, escalation carve-out, scope-stating dispatch guidance) and regeneration of every
rendered surface. Also `init.skeleton.md`: the consumer-`CLAUDE.md` managed block's one
tier-naming example — `planner (reasoning tier)` — misstates planner's tier once it moves to
heavy; the rule it illustrates (function + tier, never a vendor model) is unchanged, only the
example instance updates (`planner (heavy-reasoning tier)`). No test pins that literal. Sync: `sync-grok-edition.js` (`GROK_MODEL_EFFORTS` + prose),
`sync-cursor-edition.js` (pin map + allowlist), `sync-opencode-edition.js` (tier classification).
Reviewer bodies: the three reviewer agents (scope clamp; contract hashes re-stamp). Tests
(tdd-guide custody): the tier tables pinned in `test-grok-edition.js`, `test-cursor-edition.js`,
`test-install-model-rendering.js` (#610 pins), opencode/kimi suites, all three contract-validator
copies, the walkthrough. Edition-touching diff → the full four-chain gate plus each additive
edition suite. Docs: `CHANGELOG.md`, `docs/architecture.md`/`docs/conventions.md` as touched.
