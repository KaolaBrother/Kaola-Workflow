evidence-binding: n5-tier-prose 79c51679c30a

non_tdd_reason: mechanical token/prose rewording (opus/sonnet -> reasoning/standard with legacy
aliases) + enforcement-pin resync (contract-validator B2 scrub patterns + T5b pins) + ADR/doc
authoring. No new behavioral logic — the schema-level normalizeTier/dispatchModelClaude/modelDisplay
behavior this prose describes was already implemented and unit-tested by n4 (test-adaptive-node,
test-next-action, test-adaptive-handoff, test-agent-model-resolver, test-install-model-rendering,
simulate-workflow-walkthrough #610 legacy-alias fixture). This node only makes the authoring/dispatch
prose and the contract-enforcement pins match that already-tested behavior; nothing here has a
natural failing-unit-test of its own (a prose string cannot RED against a jest-style assertion — the
"test" for prose IS the contract-validator pin, which I both write and satisfy in the same node).

regression-green: full suite run before and after edits, from the worktree root
(/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-609-610). BEFORE (post-n4, pre-my-edit):
not independently re-run (n4's own evidence records its suites green at handoff; I inherited that
baseline). AFTER (this node's edits applied):
- node scripts/validate-workflow-contracts.js -> "Workflow contract validation passed" (EXIT 0)
- node scripts/validate-kaola-workflow-contracts.js -> "Kaola-Workflow Codex contract validation passed" (EXIT 0)
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> "Kaola-Workflow GitLab contract validation passed" (EXIT 0)
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js -> "Kaola-Workflow Gitea contract validation passed" (EXIT 0)
- node scripts/test-route-reachability.js -> "Route-reachability test passed (260 assertions)." (EXIT 0)
- node scripts/test-agent-profile-parity.js -> "agent-profile parity tests passed (27 assertions)" (EXIT 0)
- node scripts/sync-opencode-edition.js --write -> regenerated .opencode/agent/workflow-planner.md only (gitignored, untracked); "write complete (1 file(s) updated)" (EXIT 0)
- node scripts/test-opencode-edition.js -> "opencode-edition test passed (499 assertions)." (EXIT 0) — SAME count as pre-edit (499), confirming zero new/broken assertions, in particular the S2/B2 capitalized-Opus/Sonnet body-wide sweep stayed green because every new opus/sonnet mention I authored is lowercase.
- node scripts/test-install-model-rendering.js -> "Install model rendering tests passed" (EXIT 0) (out of my write set; verified unaffected)
- node scripts/simulate-workflow-walkthrough.js -> "Workflow walkthrough simulation passed" (EXIT 0), including the #610 legacy-alias fixture n4 added

## Per-surface summary

### Prose (neutral tokens `{reasoning|standard}`, one legacy-alias mention per surface)
- `agents/workflow-planner.md` — "Model assignment" section (was `{opus, sonnet}`) renamed to
  `{reasoning, standard}`; added one legacy-alias sentence ("the legacy `opus`/`sonnet` aliases
  remain accepted... but new plans should author the neutral tokens") and one Claude-dispatch
  mapping sentence using LOWERCASE `Agent(model="opus")`/`Agent(model="sonnet")` literals (not
  capitalized "Opus"/"Sonnet" prose — see deviation below); the frozen-plan example row's `model`
  cell `opus` -> `reasoning`. Frontmatter `model: opus` (line 5, the agent's OWN Claude dispatch
  model) left untouched — not a plan-column token.
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/agents/workflow-planner.toml`
  (byte-identical triple, verified) — "Model assignment" paragraph: `{opus|sonnet}` -> `{reasoning|
  standard}` + one legacy-alias clause, same three places kept in step.
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/kaola-workflow-adapt/SKILL.md`
  — the `model` grammar bullet: `{opus|sonnet}` -> `{reasoning|standard}` + one legacy-alias clause
  ("the legacy `opus`/`sonnet` aliases remain accepted... — new plans should author the neutral
  tokens"). The existing "on Codex the reasoning tier -> `xhigh`, the standard tier -> `high`"
  mapping sentence was already neutral pre-existing text — untouched.
- `plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/kaola-workflow-plan-run/SKILL.md`
  — the Dispatch section's descriptor-mapping line: `model: opus -> xhigh, model: sonnet -> high`
  became `model: reasoning -> xhigh, model: standard -> high` with a parenthetical documenting the
  legacy alias mapping resolves identically (re-using the exact `model: opus`/`model: sonnet`
  substring shape, already B1-exempt in the codex contract validators, so no new scrub pattern was
  needed for this specific line).
- `commands/kaola-workflow-{adapt,plan-run}.md` + the gitlab/gitea command ports (6 files): **no
  edits made**. Verified by grep before touching anything — none of these 6 files mention the plan
  model-column vocabulary at all (`opus`/`sonnet`/`{reasoning|standard}`/`model_invalid`/"model
  column" all absent); they delegate the grammar exclusively to `agents/workflow-planner.md` per
  their own text ("This command holds only the dispatch handle... the full procedure lives
  exclusively in agents/workflow-planner.md"). The pre-existing "Opus"/"Opus-floor" mentions in
  these 6 files describe the actual Claude Agent dispatch model for the workflow-planner subagent /
  the synthesizer's reasoning floor — a DIFFERENT, legitimate usage (not the plan tier vocabulary),
  already whitelisted by #609/#537 and left untouched.

### Enforcement pins (all now neutral-token-primary + alias-aware)
- `scripts/validate-workflow-contracts.js` + its byte-twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`:
  **no changes made.** Grepped exhaustively for any `opus`/`sonnet`/`{opus|sonnet}`/`model: opus`/
  `model: sonnet` pin in this file — found none (the only near-hit, `assertNotIncludes('commands/
  kaola-workflow-plan-run.md', '\`sonnet\`/absent')`, is an unrelated #602 stale-phrasing guard on a
  file I made no edits to). The task brief's "~936-939" line reference did not correspond to any
  opus/sonnet content in the current file — this is a deviation worth noting (see below). The
  byte-twin identity was re-verified (`diff` clean) after confirming no edit was needed.
- `scripts/validate-kaola-workflow-contracts.js` (main codex): (1) the B2 model-noun scrub function
  gained a third exemption pattern, `` .replace(/`opus`\/`sonnet`/g, '') ``, for the new
  legacy-alias-pair notation I introduced in prose (comment + assert message updated to describe
  the three now-exempt B1 shapes). (2) the `` `model: sonnet` -> `high` `` pin at the #451/#582
  block became two assertions: `` `model: standard` -> `high` `` (the neutral primary) AND the
  literal legacy-alias sentence fragment (alias-aware, not just neutral-token-aware, per the task
  brief).
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`: identical two
  changes mirrored (B2 scrub pattern + #451/#582 pin split into neutral + alias assertions).
- `scripts/test-route-reachability.js` T5b: the codex-skill-surfaces loop's single
  `` `model: sonnet` -> `high` `` assertion became two — `` `model: standard` -> `high` `` (neutral)
  and the legacy-alias-mapping sentence fragment (alias-aware). The unrelated negative
  `sonnet\`/absent` guard at the top of T5b (a #602 stale-phrasing check) was left as-is — it
  doesn't match anything I wrote, so it stays valid and green with no edit needed.
- `scripts/test-agent-profile-parity.js`: **no changes needed.** None of the 10 curated
  `FEATURE_TOKENS` reference the tier vocabulary; since I mirrored the workflow-planner.md and the
  three .toml twins' edits verbatim-identically, no token's md<->toml presence moved. Verified green
  (27 assertions, same count).

### ADR + docs
- `docs/decisions/D-610-01.md` (new; number confirmed free — no D-610-*.md existed) — records the
  supersession of the "opus/sonnet stay the portable vocabulary" ruling (docs/opencode-edition.md's
  prior text + the #537 CHANGELOG "Canonical-vocabulary preserved" note), the schema mechanics (owned
  by n4, referenced not re-derived), the prose/enforcement mechanics (this node), and — as a
  documented Decision point + Alternatives-considered entry — the choice to phrase the Claude
  dispatch-mapping sentence with lowercase `Agent(model="opus")`/`Agent(model="sonnet")` literals
  rather than capitalized "Opus"/"Sonnet" prose nouns (see Deviation below for why).
- `docs/opencode-edition.md`: updated the "Model effort" section's Level-1 ruling (`opus`/`sonnet`
  are now documented as the legacy aliases of `reasoning`/`standard`, with a pointer to D-610-01),
  the table column headers (`opus` -> top / `sonnet` -> second became `reasoning` -> top /
  `standard` -> second), the `dispatchEffort(opus->xhigh)` mention -> `dispatchEffort(reasoning->
  xhigh)`, and the "planner authors `opus`/`sonnet` per node" sentence -> "authors `reasoning`/
  `standard` (or a legacy `opus`/`sonnet` alias) per node". Left untouched: line 33 ("Claude Code
  uses a closed model vocabulary (`opus`/`sonnet`)" — still literally true of the Agent tool
  parameter, unrelated to the plan-column rename) and the "canonical `opus` roles" phrase (describes
  agent-frontmatter `model: opus` pins on specific role profiles, a different concept from the plan
  tier column).

## Deviations from the task brief (flagged, not silently absorbed)

1. **`scripts/validate-workflow-contracts.js` line "~936-939" pin did not exist.** I grepped the
   file exhaustively before and after edits; it contains zero opus/sonnet/model-column pins (the
   Claude-edition validator legitimately does not scan for Claude model nouns, per its own
   `assertNotIncludes` comment — "Claude-edition commands/*.md legitimately name models"). No action
   was needed or taken on this file or its byte-twin.
2. **Claude dispatch-mapping sentence uses lowercase `Agent(model="opus")`/`Agent(model="sonnet")`
   literals, not the literally-requested capitalized "reasoning -> Opus, standard -> Sonnet"
   phrasing.** `agents/workflow-planner.md` is the canonical source rendered into the opencode
   mirror (`.opencode/agent/workflow-planner.md`) by `sync-opencode-edition.js`. That generator's
   `rewriteClaudeModelNouns()` purges only a fixed list of KNOWN capitalized noun-phrase shapes (e.g.
   "Opus orchestrator", "reasoning-class (Opus)") — it has no rule for a brand-new phrase like
   "dispatches via Opus". Writing "Opus"/"Sonnet" capitalized there would have leaked through
   untouched and RED'd `test-opencode-edition.js`'s body-wide B2 sweep (`/\b(Opus|Sonnet)\b/`,
   out of my write set — I was instructed to report rather than edit it). The lowercase
   `Agent(model=...)` phrasing conveys the identical fact (reasoning dispatches as opus, standard as
   sonnet) more precisely (it's literally the tool parameter value) with zero risk to that file.
   Verified: `test-opencode-edition.js` stayed at exactly 499 assertions, all green, after my edit
   and the `sync-opencode-edition.js --write` regeneration. Documented as an explicit Alternative in
   D-610-01.
3. **`scripts/test-opencode-edition.js` has stale (but functionally harmless) COMMENTS** at lines
   ~239-240 ("`{opus, sonnet}`, always lowercase and backtick-wrapped... the workflow-planner's
   'Model assignment' guidance"), ~316 ("NODE_MODEL_TIERS {opus,sonnet} stays the portable plan
   vocabulary"), ~510 ("NODE_MODEL_TIERS {opus,sonnet} stays the cross-edition internal token"), and
   ~548 ("the planner's verbatim canonical body legitimately keeps {opus,sonnet} as the... model-
   column vocabulary"). These comments describe pre-#610 vocabulary and are now slightly inaccurate
   prose (the actual assertions they annotate — the capitalized-noun B2 sweep and the S2 badge-
   section checks — are unaffected and still pass, confirmed at 499/499 green). This file is
   explicitly OUT OF my declared write set; per the task brief's own instruction ("if it needs an
   edit to stay green, STOP and report it... the orchestrator will route it") I did not edit it. It
   does NOT need an edit to stay green (verified), but the comments would benefit from a follow-up
   doc-only touch-up (update the four comment blocks to say `{reasoning, standard}` with legacy
   `opus`/`sonnet` aliases) — routing this as a low-priority follow-up, not a blocker.

## Self-verify checklist (task item 7)
- [x] node scripts/validate-workflow-contracts.js — GREEN
- [x] node scripts/validate-kaola-workflow-contracts.js — GREEN
- [x] node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js — GREEN
- [x] node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js — GREEN
- [x] node scripts/test-route-reachability.js — GREEN (260 assertions)
- [x] node scripts/test-agent-profile-parity.js — GREEN (27 assertions)
- [x] node scripts/sync-opencode-edition.js --write && node scripts/test-opencode-edition.js — GREEN (499 assertions, unchanged count)
- [x] node scripts/simulate-workflow-walkthrough.js — GREEN ("Workflow walkthrough simulation passed")
