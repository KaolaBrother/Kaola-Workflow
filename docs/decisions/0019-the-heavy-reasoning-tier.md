# 0019 — The heavy-reasoning tier

- **Status:** Accepted 2026-08-24 for the three-tier model (standard / reasoning / heavy).
  **Partial supersession (2026-09-11, Yanlei via Anna-TaskClaimer / #1059 item 1):** the §3
  "one sanctioned reviewer escalation" and related dynamic reviewer→`fable` re-dispatch are
  **retired**. Surfaces already dropped that wording in #1032 (`7e116d6c`); this ADR now records
  the retirement formally rather than describing escalation as current behavior. The Heavy tier
  itself — planner/code-architect defaults and the standard/reasoning/heavy intent mapping —
  remains Accepted and unchanged.
- **Date:** 2026-08-24 (escalation retirement noted 2026-09-11)
- **Extends:** the two-tier role classification (`sonnet`/standard, `opus`/reasoning) — the plan
  vocabulary #610 fixed and every edition derives from. Does not supersede any prior ADR.
- **Owner decisions (recorded 2026-08-24, in conversation):** codex standard tier unchanged;
  planner-class = `planner` + `code-architect`; opencode and kimi behavior unchanged; the two
  default reviewer resting-tier downgrades in §3 confirmed deliberate; Claude bindings stay on
  unversioned aliases so they float with model updates.
- **Owner decision (recorded 2026-09-11):** retire the workflow-owned reviewer→heavy/fable
  escalation carve-out. Rationale: when more power is needed, the main orchestrator should just
  do the work itself — the orchestrator already typically runs a strong model — so a
  workflow-owned reviewer→fable escalation is unnecessary (aligns with #1032 D7).

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

## 3. Role defaults (reviewer→heavy escalation retired)

- **Planner-class** (`planner`, `code-architect`) re-tiers to `fable`. These remain the only two
  frontmatter heavy defaults.
- **Reviewer-class** (`code-reviewer`, `adversarial-verifier`, `security-reviewer` — the
  `generate-reviewer-profiles.js` ROLES set) **stays at reasoning**. There is **no**
  workflow-owned reviewer→`fable` / heavy re-dispatch path.
- **Retired (2026-09-11 / #1059 item 1; surfaces cleared in #1032 `7e116d6c`).** The former "one
  sanctioned escalation" — Claude command-runtime bounded `fable` re-dispatch when a
  reasoning-tier review failed or the surface looked complex, plus the codex routing-contract
  carve-out — is withdrawn and is not current behavior. If more power is needed, the main
  orchestrator does the work itself rather than re-dispatching a reviewer at heavy (Yanlei: the
  orchestrator already typically runs a strong model; aligns with #1032 D7).
- Every other role keeps its tier.

**Two deliberate downgrades, owner-confirmed (still in force for resting tiers).** On codex,
reviewers moved from `gpt-5.6-sol`/high to `gpt-5.6-sol`/medium by default. On claude, reviewers
rest at `opus`, retiring the prior fable-always habit. Heavy remains the planner-class resting
tier; it is not a reviewer escalation target.

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

The grok/cursor “no per-call override” rows remain capability measurements. They are **not** a
remaining named escalation divergence: the workflow-owned reviewer→heavy path is retired
(2026-09-11 / #1059), so those hosts no longer need a carve-out relative to a Claude-only
re-dispatch that is itself withdrawn.

## 5. The reviewer scope clamp

One wording, two placements. The dispatch guidance in `templates/routing/` requires every
reviewer dispatch to state the scope under review — the surface (diff, files, mechanism) and what
acceptance looks like. The reviewer agent bodies carry the counterpart: **findings anchor to the
dispatched surface; anything outside it — architecture-level observations included — is reported
as an observation, never expanded, never acted on.** This specifies the result a finding must
have, not a review method, per `docs/conventions.md`; it does not cap what the reviewer may read,
only what may leave as a finding.

**Retired as an upgrade trigger (2026-09-11 / #1059).** The clamp is not an auto-escalation
clause and does not restore reviewer→`fable` re-dispatch. Surfaces must not grow a
scope-clamp-triggered Heavy upgrade. If the review needs more power, the orchestrator does the
work itself.

## 6. Divergences declared, not papered over

- **No runtime carries a workflow-owned reviewer→heavy escalation** (retired 2026-09-11).
  Grok and Cursor already lacked a per-call override (§4); with the Claude carve-out withdrawn,
  that former "named divergence" is moot. Heavy-variant reviewer agents (`code-reviewer-heavy`,
  …) stay **recorded, not built** (§7) and are not a substitute for the retired path.
- **kimi is single-tier and stays so** (owner). Its renderer drops `model:` entirely; the third
  token passes through with no effect and no kimi surface changes.
- **opencode behavior is unchanged** (owner) — which *forces* one code change rather than zero:
  its tier map classifies `'opus'` or `'fable'` as reasoning (everything else is standard), so a
  `fable` token would otherwise silently
  reclassify `planner` and `code-architect` to standard and drop them from the per-role override
  list. `fable` must classify as reasoning there explicitly. The silent misclassification is the
  observed failure mode that justifies the edit.

## 7. Watch list (recorded, not built)

- Heavy-variant reviewer agents for grok/cursor — still recorded, not built; not a path back to
  the retired reviewer→heavy escalation.
- Auto-escalation triggers, or any inspector on an escalation choice — superseded by retirement;
  do not rebuild.
- Effort pins on claude dispatches (the verified `effort` key stays unused).
- Escalation for any role outside reviewer-class — do not add; orchestrator does heavy work
  itself when needed.

## 8. Blast radius

Frontmatter: `agents/planner.md`, `agents/code-architect.md`. Resolver:
`kaola-workflow-resolve-agent-model.js` `DEFAULT_AGENT_MODELS` (held byte-equal to frontmatter).
Skeletons: `templates/routing/next.skeleton.md` + `finalize.skeleton.md` (codex three-way routing
contract; the former escalation carve-out is retired — see status note) and regeneration of every
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
