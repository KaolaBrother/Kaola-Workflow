#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-adaptive-schema.js (issue #227)
//
// Forge-NEUTRAL constants and pure helpers shared by the adaptive-path machinery
// across all four editions. This file is copied VERBATIM into every edition's
// script directory and enrolled as a byte-identical group in validate-script-sync.js,
// so an edition that hand-ports routeAdaptive / claimProject / the validator but
// forgets to mirror a constant edit fails the sync check. It is the cross-edition
// drift anchor (design doc §"Parity risk").
//
// It contains ONLY forge-neutral data + side-effect-free helpers — no forge CLI
// calls, no remote URLs, no references to sibling script paths or other editions.
// Keep it that way so the byte copies stay legal everywhere (the renamed editions
// reject cross-edition leaks and parent-dir requires).
// ---------------------------------------------------------------------------

// The three legal workflow path NAMES (the closed universe). Adaptive is the
// unconditional default and is ALWAYS legal; `fast`/`full` are install-time opt-ins
// (`installed_paths`) — `claimProject` admits a path iff it is `adaptive` or recorded
// as installed.
const WORKFLOW_PATHS = Object.freeze(['fast', 'full', 'adaptive']);
const ADAPTIVE_PATH = 'adaptive';

// The adaptive executor command + skill the two resume surfaces emit (never
// /kaola-workflow-phase{N}). Toggle-agnostic: resume of a frozen plan ignores the switch.
const PLAN_RUN_COMMAND = '/kaola-workflow-plan-run';
const PLAN_RUN_SKILL = 'kaola-workflow-plan-run';
const ADAPT_COMMAND = '/kaola-workflow-adapt';
const ADAPT_SKILL = 'kaola-workflow-adapt';

// The frozen-plan artifact (the fast-summary.md analogue) + its inner ledger heading.
const PLAN_FILE = 'workflow-plan.md';
const NODES_HEADING = 'Nodes';
const LEDGER_HEADING = 'Node Ledger';

// Node Ledger status enum (single authoritative table inside the plan artifact).
const LEDGER_STATUSES = Object.freeze(['pending', 'in_progress', 'complete', 'n/a']);

// #382/#610: the closed vocabulary for the optional per-node `model` column in `## Nodes`. Two
// runtime-NEUTRAL reasoning-weight tier tokens (no haiku) — no edition consumes them as literal model
// names at dispatch: Claude maps `reasoning`→Opus / `standard`→Sonnet on the Agent(model=…) param;
// Codex uses them only as declarative role/wait metadata while inheriting the parent pair;
// opencode maps them to a provider effort variant. `—`/absent ⇒
// today's role-default metadata resolution. New plans author these neutral tokens. Defined here (the ×4
// byte-identical drift anchor) so the validator, the executor, and every edition share one list.
const NODE_MODEL_TIERS = Object.freeze(['reasoning', 'standard']);

// #610: the legacy→neutral tier alias map. Frozen/archived plans keep their BYTES — a legacy `opus`/
// `sonnet` cell validates at parse (no rewrite, plan_hash unchanged, resume unaffected) by normalizing
// to the neutral token here. New plans author `reasoning`/`standard` directly. normalizeTier() is the
// single alias-resolution seam every tier consumer (TIER_RANK lookup, dispatchEffort, mapTier,
// dispatchEffortOpencode, dispatchModelClaude, dispatchModelCodex, the reasoning-floor check) routes through, so a token is
// interpreted identically everywhere. A neutral token passes through; a legacy alias resolves; an
// out-of-vocab token (e.g. `haiku`) or an absent/blank cell → null (the model_invalid / role-default
// signal — callers guard on `if (node.model)` before treating null as "invalid").
const TIER_ALIASES = Object.freeze({ opus: 'reasoning', sonnet: 'standard' });
function normalizeTier(token) {
  const t = String(token == null ? '' : token).trim().toLowerCase();
  if (t === '') return null;
  if (NODE_MODEL_TIERS.indexOf(t) !== -1) return t;   // neutral token passes through
  if (Object.prototype.hasOwnProperty.call(TIER_ALIASES, t)) return TIER_ALIASES[t]; // legacy alias
  return null;                                          // out-of-vocab → null
}

// #610: the Claude-executor mapping made mechanical (not prose) — a neutral tier resolves to the
// Agent(model=…) alias the Claude runtime dispatches with (`reasoning`→`opus`, `standard`→`sonnet`).
// Legacy aliases pass through the normalizer, so a frozen-plan `opus`/`sonnet` cell yields the same
// Claude model as before. No tier / out-of-vocab → null (role-default resolution). Pure — ×4 anchor.
const TIER_MODEL_CLAUDE = Object.freeze({ reasoning: 'opus', standard: 'sonnet' });
function dispatchModelClaude(tier) {
  const t = normalizeTier(tier);
  return t ? TIER_MODEL_CLAUDE[t] : null;
}

// Codex child strength is inherited from the current parent session, never selected by this tier.
const TIER_MODEL_CODEX = Object.freeze({ reasoning: null, standard: null });
function dispatchModelCodex(tier) {
  const t = normalizeTier(tier);
  return t ? TIER_MODEL_CODEX[t] : null;
}

// Codex role profile policy. Every known profile omits runtime-strength keys and inherits the parent
// pair. The historical standard/reasoning classes remain declarative metadata and wait defaults.
const CODEX_PINNED_STANDARD_ROLES = Object.freeze([
  'code-explorer',
  'knowledge-lookup',
  'tdd-guide',
  'implementer',
  'doc-updater',
  'issue-scout',
  'contractor',
  'metric-optimizer',
]);
const CODEX_PINNED_REASONING_ROLES = Object.freeze([
  'planner',
  'code-architect',
  'build-error-resolver',
  'code-reviewer',
  'security-reviewer',
  'adversarial-verifier',
  'workflow-planner',
  'synthesizer',
]);
function codexProfilePolicy(role, model) {
  const name = String(role == null ? '' : role).trim();
  const pinnedStandard = CODEX_PINNED_STANDARD_ROLES.indexOf(name) !== -1;
  const pinnedReasoning = CODEX_PINNED_REASONING_ROLES.indexOf(name) !== -1;
  const mode = (pinnedStandard || pinnedReasoning) ? 'known' : null;
  const tier = pinnedStandard ? 'standard' : (pinnedReasoning ? 'reasoning' : null);
  return {
    codex_profile_mode: mode === null ? null : 'inherit',
    codex_profile_tier: tier,
    codex_profile_compatible: mode !== null,
  };
}

// #405 (#382 deferred half): the node-dispatchable roles for which a `model: opus` tier earns a
// dedicated Codex `<role>-max` xhigh effort-variant profile. Derived from the #382 planner rubric
// (agents/workflow-planner.md: assign opus when output quality is bounded by *reasoning depth* —
// architecture/design, adversarial gates, security review, root-cause of non-obvious bugs) ∩ the
// Codex per-node reasoning metadata: every base role profile inherits its model and effort. The
// planner tier controls display and wait budget only; a fresh parent-session proof supplies the pair.
// Plan-run deliberately omits transient model/effort spawn overrides and relies on inheritance.
// An absent/blank helper input returns null role-default sentinels for upstream resolution; reaching
// spawn still null is a typed `codex_tier_unresolved` refusal, never a third subagent tier. #610:
// normalizeTier() first, so a frozen-plan legacy `opus`/`sonnet` cell resolves to the SAME pair as its
// neutral tier. No `<role>-max` variant profiles exist; `agent_type` is always the base role.
function dispatchEffort(model, sessionProof) {
  const tier = normalizeTier(model);
  if (tier) {
    const proof = sessionProof && sessionProof.status === 'fresh' ? sessionProof : null;
    return {
      codex_model: proof ? proof.model : null,
      codex_model_source: 'parent_session',
      codex_reasoning_effort: proof ? proof.reasoning_effort : null,
      codex_reasoning_effort_source: 'parent_session',
    };
  }
  return {
    codex_model: null,
    codex_model_source: 'role_default',
    codex_reasoning_effort: null,
    codex_reasoning_effort_source: 'role_default',
  };
}

// The Codex join protocol's per-node WAIT BUDGET (minutes) — the floor a `running` delegated agent is
// never interrupted before. Derived from the node's effort tier, the SAME normalized tier `dispatchEffort`
// reads, so a legacy `opus`/`sonnet` cell resolves to the same budget as its neutral token. Reasoning-tier
// nodes get the larger budget (deeper work runs longer), standard the smaller; an absent/blank/out-of-vocab
// tier resolves to a CONCRETE role-default (never null) so every dispatch card carries a number — the
// non-interrupt rule always has a floor. Values sit ABOVE the observed 10–30-minute runtime of substantive
// role nodes so the budget replaces the improvised 2–7-minute impatience ceiling. A validated optional
// per-node planner override may extend (never shorten) this tier-derived floor through the canonical cap.
const WAIT_BUDGET_MINUTES = Object.freeze({ reasoning: 40, standard: 20 });
const WAIT_BUDGET_MINUTES_DEFAULT = 20; // no tier resolves → concrete role-default (never null)
const WAIT_BUDGET_MINUTES_CAP = 720;
function waitBudgetFloor(model) {
  const tier = normalizeTier(model);
  return tier === 'reasoning' ? WAIT_BUDGET_MINUTES.reasoning
    : tier === 'standard' ? WAIT_BUDGET_MINUTES.standard
      : WAIT_BUDGET_MINUTES_DEFAULT;
}
function waitBudgetMinutes(model) {
  const tier = normalizeTier(model);
  if (tier === 'reasoning') {
    return { wait_budget_minutes: WAIT_BUDGET_MINUTES.reasoning, wait_budget_source: 'planner_model' };
  }
  if (tier === 'standard') {
    return { wait_budget_minutes: WAIT_BUDGET_MINUTES.standard, wait_budget_source: 'planner_model' };
  }
  return { wait_budget_minutes: WAIT_BUDGET_MINUTES_DEFAULT, wait_budget_source: 'role_default' };
}

// #382-opencode (#544 contract-keyed): the GENERAL tier→effort mapping for provider-open
// runtimes (opencode). The {reasoning, standard} tokens are reasoning-weight RANKS, not models;
// opencode is provider-open, so the migration is a two-level compose that never assumes a provider:
//   Level 1 (fixed):        reasoning → 'top' rank · standard → 'second' rank.
//   Level 2 (per contract): rank → that contract's effort variant (top = highest,
//                           second = 2nd-highest), per the provider's API CONTRACT.
//   mapTier(tier, provider) = CONTRACT_EFFORT_TABLE[ contractForProvider(provider) ][ TIER_RANK[normalizeTier(tier)] ].
// #544: the effort KNOB is determined by the provider's API CONTRACT, not its brand name.
// contractForProvider() maps a provider id to one of four contracts (anthropic|openai|google|
// default); the table is keyed by CONTRACT, so GLM-5.2 via z.ai (served under the Anthropic API
// contract) resolves to the `thinking` budget — NOT reasoningEffort. An unknown provider
// resolves to the safe `default` contract (high/medium) instead of null (NO silent de-tier).
//   contract          providers                              opus (top)        sonnet (second)
//   anthropic         anthropic, claude, z.ai/zhipu GLM      max (think 32k)   high (think 16k)
//   openai            openai, gpt, codex                     xhigh             high
//   google            google, gemini                         high              low
//   default           any other (unknown)                    high              medium
// Variant NAMES are provider-relative and preserved across the contract-keying flip (GLM stays
// max/high) — only the OPTIONS payload changes. Pure data + pure helpers (no I/O) — qualifies
// for this ×4 byte-identical drift anchor.
const TIER_RANK = Object.freeze({ reasoning: 'top', standard: 'second' });

// Each entry: { top: {variant, options}, second: {variant, options} }. `variant` is the
// opencode variant NAME (referenced by agent.<role>.variant); `options` is the provider
// model-options payload (passed through to the provider, e.g. thinking / reasoningEffort).
const CONTRACT_EFFORT_TABLE = Object.freeze({
  anthropic: Object.freeze({
    top:    { variant: 'max',  options: { thinking: { type: 'enabled', budgetTokens: 32000 } } },
    second: { variant: 'high', options: { thinking: { type: 'enabled', budgetTokens: 16000 } } },
  }),
  openai: Object.freeze({
    top:    { variant: 'xhigh', options: { reasoningEffort: 'xhigh' } },
    second: { variant: 'high',  options: { reasoningEffort: 'high' } },
  }),
  google: Object.freeze({
    top:    { variant: 'high', options: { reasoningEffort: 'high' } },
    second: { variant: 'low',  options: { reasoningEffort: 'low' } },
  }),
  default: Object.freeze({
    top:    { variant: 'high',   options: { reasoningEffort: 'high' } },
    second: { variant: 'medium', options: { reasoningEffort: 'medium' } },
  }),
});

// Resolve a provider id to its API CONTRACT (the effort KNOB depends on the contract, not the
// brand). GLM-via-z.ai is served under the Anthropic API contract → 'anthropic' (thinking budget).
// The zhipu/zai/glm test runs FIRST so GLM provider ids never fall through to a generic branch.
// Unknown id → 'default' (the safe high/medium contract). Pure (no fs).
function contractForProvider(providerId) {
  const lo = String(providerId || '').toLowerCase();
  if (/zhipu|^zai|z-?ai|glm/.test(lo)) return 'anthropic';   // GLM-via-z.ai → Anthropic contract
  if (/anthropic|claude/.test(lo)) return 'anthropic';
  if (/openai|gpt|codex/.test(lo)) return 'openai';
  if (/google|gemini/.test(lo)) return 'google';
  return 'default';
}

// Resolve a provider id to its effort profile. Falsy id → null (load-bearing backward-compat: the
// no-provider dispatch path for claude/codex must stay behavior-inert). A real but unrecognized
// provider id → CONTRACT_EFFORT_TABLE.default (the safe high/medium contract — NO silent de-tier).
function effortForProvider(providerId) {
  const id = String(providerId || '');
  if (!id) return null;                                       // no provider → null (backward-compat)
  return CONTRACT_EFFORT_TABLE[contractForProvider(id)];      // unknown → 'default' (never null)
}

// The general mapper: tier → {variant, options} for a provider, or null.
// `tier` is a NODE_MODEL_TIERS token (reasoning|standard) or a legacy alias (opus|sonnet); #610:
// normalizeTier() first so a frozen-plan legacy cell resolves to the SAME rank. Unknown tier / provider → null.
function mapTier(tier, providerId) {
  const rank = TIER_RANK[normalizeTier(tier)];
  if (!rank) return null;
  const profile = effortForProvider(providerId);
  if (!profile) return null;
  return profile[rank];
}

// #537 Surface 2: PURE provider resolver for the opencode dispatch twin. buildDispatch calls
// dispatchEffortOpencode(model, ctx.opencode_provider), but NO runtime caller ever populates
// ctx.opencode_provider — so a declared tier silently resolved to role_default. The active
// opencode provider is supplied here from KAOLA_OPENCODE_INHERIT_MODEL (the established
// inherited-model env, "provider/model" form — the same value sync-opencode-edition.js's
// detectInheritModel()/parseModelProvider() consume). Splitting on the first '/' yields the
// bare provider id mapTier()/effortForProvider() expect. env defaults to process.env so the
// real runtime 2-arg call resolves; tests pass a controlled env to stay hermetic. null/'' →
// null (so the UNSET case stays role_default and claude/codex are behavior-inert — they
// consume dispatchEffort/the codex twin, never this function). No fs / no forge-CLI / no
// sibling-path: the file's purity contract is intact.
const OPENCODE_PROVIDER_ENV = 'KAOLA_OPENCODE_INHERIT_MODEL';
function resolveOpencodeProvider(env) {
  const src = env || process.env;
  const raw = String((src && src[OPENCODE_PROVIDER_ENV]) || '').trim();
  if (!raw) return null;
  const i = raw.indexOf('/');
  return i <= 0 ? raw : raw.slice(0, i);
}

// The opencode dispatch twin of dispatchEffort(): emits the resolved opencode variant for
// a node's model tier under a provider, so the executor/plan-run surface carries the
// intended per-node effort. null tier / unknown provider → role_default (the agent's
// configured variant wins), mirroring dispatchEffort's absent-tier branch. When no provider
// is passed, the active provider is PURE-resolved from KAOLA_OPENCODE_INHERIT_MODEL (see
// resolveOpencodeProvider) — the gap closed by #537 Surface 2: the runtime caller never
// populated ctx.opencode_provider, so a declared tier now still reaches a concrete variant.
// #610: mapTier() normalizes, so a legacy `opus`/`sonnet` cell resolves to the same variant.
function dispatchEffortOpencode(model, providerId, env) {
  let pid = providerId;
  if (pid == null || String(pid).trim() === '') pid = resolveOpencodeProvider(env);
  const mapped = mapTier(model, pid);
  return mapped
    ? { opencode_variant: mapped.variant, opencode_variant_source: 'planner_model' }
    : { opencode_variant: null, opencode_variant_source: 'role_default' };
}

// #609/#610: the runtime-native DISPLAY for a per-node tier, so a payload echo of the raw tier
// (e.g. handoff `first_node.model`, the dispatch descriptor) reads natively on every runtime instead
// of surfacing a Claude noun ("sonnet") on Codex/opencode. ADDITIVE — the raw tier stays in the
// payload; consumers attach this alongside it. Each runtime reads its own key:
//   claude   — the Agent(model=…) alias (dispatchModelClaude: reasoning→"opus" / standard→"sonnet"),
//   codex    — "<model> (<effort> reasoning effort)" (the pair expected from the standalone profile),
//   opencode — "<rank> effort variant" (TIER_RANK: reasoning→"top …" / standard→"second …",
//              provider-agnostic — the Level-1 rank of the opencode mapping, always available).
// A legacy alias normalizes first (a frozen-plan `opus` cell displays identically to `reasoning`).
// No tier / out-of-vocab → null (nothing to display natively; the raw `model: null` inherit echo stands).
function modelDisplay(tier) {
  const t = normalizeTier(tier);
  if (!t) return null;
  return {
    claude:   TIER_MODEL_CLAUDE[t],
    codex:    'parent session (' + t + ' tier metadata)',
    opencode: TIER_RANK[t] + ' effort variant',
  };
}

// Caps (verified first-party): FANOUT_CAP default 4 (env KAOLA_FANOUT_CAP);
// LOOP_CAP static loop bound;
// TEST_THRASH_LIMIT >= 3 consecutive failing cycles on the same test (fast.md:64).
const DEFAULT_FANOUT_CAP = 4;
// #375 (D3): read-only batch members are zero-blast-radius (no worktrees, no writes,
// evidence recorded parent-side) — the harness comfortably runs ~8-16 concurrent agents,
// so the cheap half of the system gets its own higher default. KAOLA_FANOUT_CAP stays the
// WRITE-side cap (semantics unchanged).
const DEFAULT_FANOUT_CAP_READONLY = 8;
// #377: the per-node running-set scheduler manifest (post-#364 successor of active-batch.json's
// per-batch state) — `kaola-workflow/{project}/.cache/running-set.json`. Producer: adaptive-node
// open-ready/close-node; consumer: the #376 write-lane containment hook + the #293 legality check.
const RUNNING_SET_NAME = 'running-set.json';
// #585: the project-scoped scheduler mutual-exclusion lockfile —
// `kaola-workflow/{project}/.cache/scheduler.lock`. Acquired O_EXCL by adaptive-node main() before any
// mutating scheduler subcommand body (the worktree-split-guarded set) and released in a finally, so two
// concurrent scheduler invocations on ONE project can never both enter a mutating body. Lives next to
// RUNNING_SET_NAME (the other per-project .cache scheduler artifact). It is barrier-exempt via the
// kaola-workflow/ prefix, so a held lock can never trip the per-node write-set barrier. Byte-identical
// ×4 (the drift anchor).
const SCHEDULER_LOCK_NAME = 'scheduler.lock';
const LOOP_CAP = 5;
const TEST_THRASH_LIMIT = 3;
// #463 Slice 5 (write-overlap): the bounded-repair cap for a `merge_conflict`. A write-leg level that
// does not reconcile (an unmergeable conflict the synthesizer cannot resolve, or a barrier overflow a
// repair could not fix) is repaired up to K=3 attempts, then escalates to a `merge_conflict` consent-
// style halt. Routed LIKE `test_thrash` (a schema constant the orchestrator applies — there is no script
// counter on the adaptive path); a resumed run re-counts attempts from zero, because the COMMIT-based
// union barrier on M — never the attempt counter — is the fail-closed safety gate (a miscounted or reset
// loop only wastes work; it can never land an unverified merge). Byte-identical ×4 with TEST_THRASH_LIMIT.
const MERGE_CONFLICT_REPAIR_LIMIT = 3;

// The review-repair circuit breaker: a logical gate admits at most this many CONSUMED repairs before
// repair-node refuses `repair_limit_reached`. Promoted from a bare literal so the breaker's tightness is
// checkable in ONE place. Same value, same `consumed >= LIMIT` comparison — zero behavior change.
const REVIEW_REPAIR_LIMIT = 5;
// The companion cap on a single attempt's append-only `rebind` ledger. A rebind re-anchors the selected
// writer's barrier baseline onto a synthetic tree that is byte-identical to the old baseline on the
// writer's declared paths (so its reviewed diff is provably unchanged) and agrees with the current tree
// everywhere else (so a proven-attributed sibling write stops poisoning this writer's barrier). Rebinds
// are only ever authorized by ANOTHER gate's recorded repair or by pre-existing sibling content, so this
// cap is a defensive belt over an already-bounded quantity. Byte-identical ×4 with the limits above.
const REVIEW_REBIND_LIMIT = 5;

// #579: single staleness constant for the lane liveness marker. A claim_ts newer than
// this threshold (from the current wall-clock) could be a live co-tenant — classified
// 'ambiguous' (ask). Older (or absent) → 'stale' (resumable leftover / backward compat).
// 24h is conservative: a run completes well within a day; an untouched 24h-old claim
// is very likely abandoned. Byte-identical ×4 (the drift anchor).
const LANE_STALENESS_MS = 86400000; // 24 hours in milliseconds

// The shared, cross-edition intersection of workflow-state.md fields that every
// active-folders parser (canonical + all forge ports) reads and surfaces on the
// returned active-folder item. Using this constant as the single source of truth
// ensures the behavior-parity gate (test-active-folders-field-parity.js) auto-extends
// when a future field is added, and lets callers enumerate the shared surface without
// hard-coding the list. Byte-identical ×4 (the drift anchor).
const SHARED_STATE_FIELDS = Object.freeze([
  'issue_number',
  'phase',
  'issue_numbers',
  'status',
  'bundle_id',
  'closure_policy',
  'next_command',
  'branch',
  'worktree_path',
  'sink',
  'main_root',
  'session_marker',
  'claim_ts',
]);

// Absolute node-count backstop for the plan grammar (DoS / stack-overflow guard).
// Real plans are tiny (the walkthrough's largest fixture is 7 nodes; FANOUT_CAP=4,
// LOOP_CAP=5 bound any single shape). 200 is ~28x the largest realistic plan, so it
// NEVER false-refuses a real plan, while it bounds the validator's DFS depth far below
// the recursion-overflow point: a multi-thousand-node depends_on chain is refused as
// out-of-grammar BEFORE any graph algorithm runs. Lives here (the cap anchor) so all
// four editions share one byte-identical value via the sync check.
const MAX_NODES = 200;

// #634 (metric-optimizer): the bounded budget caps for a metric-ratchet optimize node, validated at
// freeze (OPT-3). budget_iterations must be 1..OPTIMIZE_ITER_CAP; an optional budget_wallclock_minutes
// must be ≤ OPTIMIZE_WALLCLOCK_CAP. ~20–40 cheap iterations is the design's working range, so 50 never
// false-refuses a real ratchet while it bounds the unattended spend; 120 minutes is a conservative
// wall-clock ceiling (the wait-budget ladder applies at runtime, no daemon). Byte-identical ×4 (the
// drift anchor), living beside MAX_NODES (the cap cluster) so all editions share one value via the sync.
const OPTIMIZE_ITER_CAP = 50;
const OPTIMIZE_WALLCLOCK_CAP = 120;

// Barrier escalation markers written durably to workflow-state.md. `security` forces
// security-reviewer post-dominance; `consent` halts a provisional auto-run for the
// user's explicit yes (surfaced on resume, never blindly re-dispatched); `test_thrash`
// escalates a thrashing loop to full. `merge_conflict` (#463 write-overlap) is the typed
// HALT for an unresolvable write-leg convergence (the synthesizer commit barrier): after
// the bounded-repair cap it raises a consent-style halt (reuses `consent_halt: pending`),
// cleared via `clear-halt --reason consent` and RESUMED adaptively — unlike `test_thrash`,
// which is a one-way escalation to the full path. The synthesizer RAISES it: a real conflict bails
// (Slice 4), and after the MERGE_CONFLICT_REPAIR_LIMIT bounded-repair cap the orchestrator escalates to
// this halt (Slice 5). First-detection refusals (member_vacuity for a no-op leg / write_set_overflow / the
// octopus bail) are repaired FIRST; merge_conflict is what they escalate TO after the cap.
const ESCALATION_MARKERS = Object.freeze({
  security: 'security',
  consent: 'consent',
  test_thrash: 'test_thrash',
  merge_conflict: 'merge_conflict',
});

// E2 (#234): a SECOND, durable source of truth for a barrier consent-halt, written into the plan's
// `## Node Ledger` — a section EXCLUDED from computePlanHash (which covers ## Meta + ## Nodes only),
// so it never trips the resume hash check. workflow-state.md's `escalated_to_full: consent` is the
// primary signal; if that file is lost/regenerated (state-downgrade) the halt would silently drop,
// re-running an authorization the user explicitly halted for approval. This plan-local marker
// survives a lost workflow-state.md. PRESENT = pending halt; ABSENT = no pending halt.
const CONSENT_HALT_MARKER = 'consent_halt: pending';
// PURE (no fs): scan ONLY the `## Node Ledger` section for the marker, so a decoy line elsewhere
// cannot force a phantom halt and the read mirrors where the writer puts it. The ledger is
// fence-free by contract, so a self-contained section slice suffices (NOT classifier.sectionBody —
// the classifier is renamed in the forks, which would break this file's cross-edition byte-identity).
function readDurableConsentHalt(planContent) {
  const text = String(planContent || '');
  // #354: route through the shared fence-aware locator so an UPSTREAM FENCED `## Node Ledger`
  // decoy heading cannot be mistaken for the real ledger (the prior `text.match(headRe)` took the
  // first regex hit, fence-blind). Non-decoy behavior is byte-identical.
  const { start, next } = locateSection(text, LEDGER_HEADING);
  if (start < 0) return false;
  const body = next < 0 ? text.slice(start) : text.slice(start, next);
  return /^consent_halt:[ \t]*pending[ \t]*$/m.test(body);
}

// #334: the NON-DELEGABLE main-session gate role. A first-class plan node that is NEVER
// dispatched as a subagent: the main session itself performs the acceptance check (e.g. a
// GPU/visual confirmation that needs human eyes or main-session-only tooling), records
// column-0 `verdict: pass|fail` evidence into .cache/{node-id}.md via record-evidence, and
// closes the node through the same close-and-open-next transaction as any other node.
// Read-only by construction (never in the validator's WRITE_ROLES); a GATE_VERDICT_ROLES
// member (verdict evidence required; never a select arm); excluded from parallel-batch
// membership (the main session cannot run concurrently with itself); carries its own
// freeze-time post-dominance gate (G3) and runtime execution check.
const MAIN_SESSION_GATE_ROLE = 'main-session-gate';

// #251: the mechanical verdict vocabulary a gate/skeptic role emits into its `.cache` evidence file.
const VERDICT_PASS = 'pass';
const VERDICT_FAIL = 'fail';
const VERDICT_VOCABULARY = Object.freeze([VERDICT_PASS, VERDICT_FAIL]);

// #439 (D-419 Part 4): the canonical GATE vocabulary — the verdict-bearing roles that post-dominate code
// nodes and emit a column-0 `verdict: pass|fail` into their `.cache` evidence. The speculative-read
// kernel's eligibility check (next-action) keys on this set: a read node may speculatively jump ahead of
// an UNSATISFIED dependency only when that dependency is one of these gates currently in_progress.
// Mirrors adaptive-node's local GATE_ROLES/VERDICT_ROLES (the same four roles); centralized here as the
// shared, byte-identical-×4 role vocabulary so next-action and adaptive-node classify gates identically.
const GATE_VERDICT_ROLES = Object.freeze(['code-reviewer', 'security-reviewer', 'adversarial-verifier', MAIN_SESSION_GATE_ROLE]);

// #439 (D-419 Part 4): the per-plan `## Meta` field `speculative_open_policy`. All three tiers are LEGAL
// at freeze: `off` (no speculation; the permanent serial fallback), `consent` (speculation gated on a
// per-run `open-ready --speculative-consent`), and `auto` (speculation auto-granted under the structural
// net — no per-run ceremony). `auto` is the FREEZE-TIME DEFAULT: a fresh freeze that omits the field
// materializes an explicit `speculative_open_policy: auto` line into `## Meta` (see
// materializeSpeculativePolicy). The field is hash-covered (eligibility, not a runtime cap — the
// deliberate asymmetry vs. max_concurrent). The ABSENCE fallback is DECOUPLED from this default and stays
// `off` (parseSpeculativePolicy), so an in-flight plan frozen before the flip resumes with exactly its
// frozen posture — the flip applies at freeze, never retroactively. Nothing is refused at freeze anymore
// (SPECULATIVE_OPEN_POLICY_REFUSED_AT_FREEZE is empty); an UNKNOWN value still refuses via the LEGAL
// membership check.
const SPECULATIVE_OPEN_POLICY_DEFAULT = 'auto';
const SPECULATIVE_OPEN_POLICY_LEGAL = Object.freeze(['off', 'consent', 'auto']);
const SPECULATIVE_OPEN_POLICY_REFUSED_AT_FREEZE = Object.freeze([]);

// Freeze-time materialization of the resolved speculative_open_policy into `## Meta`. hasSpeculative-
// PolicyField detects an EXPLICIT `speculative_open_policy:` line in the ## Meta section (decoy-safe via
// locateSection — the SAME Meta-scoping the validator's parseSpeculativePolicy uses). materializeSpec-
// ulativePolicy injects a single `speculative_open_policy: <policy>` line into ## Meta when the field is
// ABSENT so a fresh freeze is self-describing + hash-covered (computePlanHash normalizes the whole ## Meta
// body); it returns content UNCHANGED when the field is already present (author's explicit choice is
// preserved — never re-materialized) or when there is no ## Meta section to inject into. PURE string ops
// (no fs, no forge CLI, no sibling require) — qualifies for this ×4 byte-identical drift anchor.
function hasSpeculativePolicyField(content) {
  const text = String(content == null ? '' : content);
  const { start, next } = locateSection(text, 'Meta');
  if (start < 0) return false;
  const body = next < 0 ? text.slice(start) : text.slice(start, next);
  return /^speculative_open_policy:[ \t]*\S/m.test(body);
}
function materializeSpeculativePolicy(content, policy) {
  const text = String(content == null ? '' : content);
  if (hasSpeculativePolicyField(text)) return text;
  const { start } = locateSection(text, 'Meta');
  if (start < 0) return text;                         // no ## Meta section — nothing to materialize into
  const line = 'speculative_open_policy: ' + policy;
  const headingStart = start + 1;                     // first char of the '## Meta' heading line
  const nl = text.indexOf('\n', headingStart);
  if (nl < 0) return text.replace(/\s*$/, '') + '\n' + line + '\n';  // degenerate: heading at EOF
  return text.slice(0, nl + 1) + line + '\n' + text.slice(nl + 1);
}

// #463 (D-419 write-overlap): the per-plan `## Meta` field `write_overlap_policy` — the WRITE-side knob,
// DISTINCT from #439's read-side speculative_open_policy (writes clobber where reads do not, so they are
// gated with AT LEAST as much; overloading the read field would be a category error). Hash-covered;
// default `off` = today's PREVENT behavior byte-for-byte (no co-open of an overlapping write frontier).
// `disjoint` relaxes a non-shared coarse-area overlap when the concrete files are exact-disjoint and none
// is PROTECTED (the original #463 AC). `coarse` additionally relaxes a shared-infra AREA overlap (still
// exact-disjoint, no PROTECTED file). `exact` (exact-file / overlapping-region optimism) is DESIGNED-but-
// refused at freeze (deferred). Relaxation beyond `off` ALSO requires the per-run, never-persisted
// write-side consent carrier (the `--write-overlap-consent` flag — the write analogue of #439's
// `--speculative-consent`) AND a code-reviewer gate post-dominating the relaxed legs (validator-confirmed,
// leg-scoped). Mirrors speculative_open_policy's shape (Meta, hash-covered, absence parses off, a
// parseSpeculativePolicy-style freeze check).
const WRITE_OVERLAP_POLICY_DEFAULT = 'off';
const WRITE_OVERLAP_POLICY_LEGAL = Object.freeze(['off', 'disjoint', 'coarse']);
const WRITE_OVERLAP_POLICY_REFUSED_AT_FREEZE = Object.freeze(['exact']);

// PURE (no fs): parse a gate/skeptic role's `.cache/{node-id}.md` for its machine verdict. Native
// multiline regex ONLY (no classifier — cross-edition byte-identity). FENCE-BLIND BY ANCHOR: a verdict
// line is recognised ONLY at column 0 (`^verdict:` no leading whitespace). findings_blocking optional
// non-negative int; absent => null. Returns { found, verdict:'pass'|'fail'|null, findings_blocking:number|null }.
function parseNodeVerdict(cacheText) {
  const text = String(cacheText || '');
  const vRe = /^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm;
  let vm, lastVerdictTok = null;
  while ((vm = vRe.exec(text)) !== null) { lastVerdictTok = vm[1].toLowerCase(); }
  const found = lastVerdictTok !== null;
  let verdict = null;
  if (found && VERDICT_VOCABULARY.includes(lastVerdictTok)) verdict = lastVerdictTok;
  const fRe = /^findings_blocking:[ \t]*(\d+)[ \t]*$/gm;
  let fm, lastBlocking = null;
  while ((fm = fRe.exec(text)) !== null) { lastBlocking = parseInt(fm[1], 10); }
  return { found, verdict, findings_blocking: lastBlocking };
}

// #653: PURE parse of the consumer finalize BINDING field in .cache/final-validation.md. Same
// discipline as parseNodeVerdict: native multiline regex ONLY (no classifier — cross-edition
// byte-identity). FENCE-BLIND BY ANCHOR: recognised ONLY at column 0 (`^validated_candidate_hash:`
// no leading whitespace). LAST-MATCH-WINS (a re-run appends a fresh line; the final line is the
// binding). `present` reports ANY column-0 field line — even malformed — so the gate can refuse a
// mangled hash the same as an absent one (both fail-closed via !present || !hash) without a
// malformed value silently reading as "legacy file, field never recorded". `hash` is the last
// WELL-FORMED 64-hex value, lowercased; null when none. Returns { present, hash }.
function parseValidatedCandidateHash(text) {
  const src = String(text || '');
  const present = /^validated_candidate_hash:/m.test(src);
  const re = /^validated_candidate_hash:[ \t]*([0-9a-fA-F]{64})[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(src)) !== null) { last = m[1].toLowerCase(); }
  return { present, hash: last };
}

// #634 (metric-optimizer): PURE parse of a metric_command's stdout for its single machine metric.
// Same discipline as parseNodeVerdict: native multiline regex ONLY (no classifier — cross-edition
// byte-identity). FENCE-BLIND BY ANCHOR: a metric line is recognised ONLY at column 0
// (`^metric:` no leading whitespace). LAST-MATCH-WINS (a command may print progress metrics; the
// final line is the frozen value). Value is a signed decimal. Returns { found, metric:<number>|null }.
// This one-sources the D2 `metric: <number>` output contract so the role's evidence + the verifier's
// reproduction check parse it identically.
function parseMetricValue(text) {
  const src = String(text || '');
  const re = /^metric:[ \t]*(-?\d+(?:\.\d+)?)[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(src)) !== null) { last = m[1]; }
  return { found: last !== null, metric: last !== null ? Number(last) : null };
}

// #263: the mechanical SELECTOR vocabulary a read-only classifier (selector_source) emits
// into its `.cache/{node-id}.md` evidence. Same discipline as parseNodeVerdict: native
// multiline regex ONLY (no classifier import — cross-edition byte-identity). FENCE-BLIND BY
// ANCHOR: a selector line is recognised ONLY at column 0 (`^selector:`). Last-match-wins.
// Value is a single bare token (an arm id — no whitespace). No vocabulary clamp: which arm
// ids are legal is plan-relative and is checked by the validator's --selector-check.
// Returns { found, selector: <arm-id>|null }.
function parseNodeSelector(cacheText) {
  const text = String(cacheText || '');
  const re = /^selector:[ \t]*([^\s]+)[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(text)) !== null) { last = m[1]; }
  return { found: last !== null, selector: last };
}


// #279: the mechanical FINDINGS vocabulary a gate/skeptic role (code-reviewer/security-reviewer/
// adversarial-verifier) emits into its `.cache/{node-id}.md` evidence alongside its verdict. A
// reviewer/verifier records zero or more structured findings; an UNRESOLVED in-scope action:fix
// finding must BLOCK the gate even when verdict:pass / findings_blocking:0, so an actionable in-scope
// defect can never silently become a follow-up (the #279 contract). Three closed vocabularies:
// scope (where the defect lives), action (what to do), status (resolution state).
const FINDING_SCOPE_VOCABULARY = Object.freeze(['in_scope', 'out_of_scope', 'pre_existing', 'needs_user_decision']);
const FINDING_ACTION_VOCABULARY = Object.freeze(['fix', 'follow_up', 'document', 'none']);
const FINDING_STATUS_VOCABULARY = Object.freeze(['open', 'resolved', 'deferred']);
// Gate-relevant finding keys whose VALUES are lowercased during parsing (mirrors parseNodeVerdict's
// value-lowercasing discipline). Non-gate keys (id, severity, raw, unknowns) keep original case.
const GATE_RELEVANT_FINDING_KEYS = Object.freeze(new Set(['scope', 'action', 'status', 'fix_role']));

// PURE (no fs): parse a gate/skeptic role's `.cache/{node-id}.md` for its structured findings. Same
// discipline as parseNodeVerdict: native multiline regex ONLY (no classifier import — cross-edition
// byte-identity). FENCE-BLIND BY ANCHOR: a finding line is recognised ONLY at column 0 (`^finding:`,
// no leading whitespace). FLAT, one finding per line, space/tab-separated `key=value` pairs:
//   finding: id=R1 scope=in_scope action=fix status=open severity=low fix_role=tdd-guide
// Keys are lowercased; gate-relevant values (scope, action, status, fix_role) are also lowercased
// (mirrors parseNodeVerdict's value-lowercasing discipline); first value wins on a duplicate key;
// a token without `=` is ignored; a missing key stays undefined. ABSENT findings block ⇒ []. Returns an array of
// { raw, id?, scope?, action?, status?, severity?, fix_role? } (only `raw` is guaranteed).
function parseNodeFindings(cacheText) {
  const text = String(cacheText || '');
  const re = /^finding:[ \t]*(.+)$/gm;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const finding = { raw: m[1].trim() };
    for (const tok of finding.raw.split(/[ \t]+/)) {
      const eq = tok.indexOf('=');
      if (eq <= 0) continue;
      const key = tok.slice(0, eq).toLowerCase();
      if (finding[key] === undefined) finding[key] = GATE_RELEVANT_FINDING_KEYS.has(key) ? tok.slice(eq + 1).toLowerCase() : tok.slice(eq + 1);
    }
    out.push(finding);
  }
  return out;
}

// PURE (no fs): the #279 gate predicate. Given parsed findings, return those that are an UNRESOLVED
// IN-SCOPE actionable fix — the set whose non-emptiness must fail the verdict gate even on verdict:pass
// / findings_blocking:0. FAIL-CLOSED on the resolution state: a present finding blocks unless its
// status is EXPLICITLY `resolved` or `deferred`, so a missing/unknown status counts as open and a
// reviewer cannot bypass the gate by omitting status. scope and action must be EXPLICITLY in_scope /
// fix (the issue's literal `scope: in_scope, action: fix` predicate). severity is IRRELEVANT to
// blocking — a LOW/MEDIUM in-scope fix still blocks; severity governs urgency/escalation, not the gate.
function unresolvedInScopeFixes(findings) {
  return (Array.isArray(findings) ? findings : []).filter(f =>
    f && f.scope === 'in_scope' && f.action === 'fix' &&
    f.status !== 'resolved' && f.status !== 'deferred');
}

// One source of truth for every review settlement path. An absent blocking count is the
// historical zero value used by the final verifier; malformed/unknown verdicts fail closed.
function evaluateEffectiveVerdict(cacheText) {
  const parsed = parseNodeVerdict(cacheText);
  const findings = parseNodeFindings(cacheText);
  const unresolved = unresolvedInScopeFixes(findings);
  const normalizedBlocking = parsed.findings_blocking === null ? 0 : parsed.findings_blocking;
  let reason = null;
  if (parsed.verdict !== VERDICT_PASS) reason = 'verdict_not_pass';
  else if (normalizedBlocking !== 0) reason = 'blocking_findings';
  else if (unresolved.length !== 0) reason = 'unresolved_in_scope_fix';
  return {
    pass: reason === null,
    verdict: parsed.verdict,
    findings_blocking: normalizedBlocking,
    unresolved_fixes: unresolved,
    reason,
  };
}

// Reviewer contract v2 ------------------------------------------------------
//
// These helpers are deliberately runtime/forge neutral. The validator owns the
// Markdown -> planView adapter; every lifecycle seam consumes this one pure
// representation and never reimplements graph classification or reduction.
const REVIEW_PLAN_SCHEMA_VERSION = 2;
const REVIEW_CONTRACT_VERSION = 2;
const REVIEW_CONTEXT_SCHEMA_VERSION = 2;
const REVIEW_JOURNAL_SCHEMA_VERSION = 2;
const REVIEW_GATE_ROLES = Object.freeze(['code-reviewer', 'security-reviewer', 'adversarial-verifier', 'main-session-gate']);
const REVIEW_AGGREGATIONS = Object.freeze(['sequence', 'replicated_majority', 'partitioned_all']);
const ADVERSARIAL_OUTCOMES = Object.freeze(['refuted', 'not_refuted', 'indeterminate']);
const APPROVAL_OUTCOMES = Object.freeze(['approved', 'changes_requested']);
const FINDING_ANCHOR_KINDS = Object.freeze([
  'candidate_range', 'deleted_base_range', 'tree_entry_change', 'required_absence', 'evidence_observation',
]);
const FINDING_FAILURE_CLASSES = Object.freeze([
  'correctness', 'security', 'data_loss', 'concurrency', 'persistence', 'compatibility',
  'contract', 'validation', 'test_coverage', 'scope_regression', 'performance_regression',
]);
const HEX64_RE = /^[0-9a-f]{64}$/i;
const SHA1_RE = /^[0-9a-f]{40}$/i;
const TREE_MODE_RE = /^[0-7]{6}$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// RFC-8785-shaped canonical JSON for this closed contract. Contract numbers are
// integers only; undefined, sparse arrays, non-finite/fractional numbers, and
// non-plain objects are refused rather than silently normalized.
function canonicalJson(value) {
  const visit = (input, stack) => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') {
      if (!Number.isSafeInteger(input)) throw new Error('canonical_json_number_not_integer');
      return input;
    }
    if (Array.isArray(input)) {
      if (stack.has(input)) throw new Error('canonical_json_cycle');
      stack.add(input);
      const out = input.map((item, index) => {
        if (!Object.prototype.hasOwnProperty.call(input, index) || item === undefined) {
          throw new Error('canonical_json_sparse_or_undefined');
        }
        return visit(item, stack);
      });
      stack.delete(input);
      return out;
    }
    if (!isPlainObject(input)) throw new Error('canonical_json_non_plain_object');
    if (stack.has(input)) throw new Error('canonical_json_cycle');
    stack.add(input);
    const out = {};
    for (const key of Object.keys(input).sort()) {
      if (input[key] === undefined) throw new Error('canonical_json_undefined');
      out[key] = visit(input[key], stack);
    }
    stack.delete(input);
    return out;
  };
  return JSON.stringify(visit(value, new Set()));
}

function sha256Hex(value) {
  return require('crypto').createHash('sha256').update(value).digest('hex');
}

function planNodeId(node) { return node && node.id != null ? String(node.id) : ''; }
function planNodeRole(node) { return node && node.role != null ? String(node.role) : ''; }
function planNodeDepends(node) {
  const value = node && (Array.isArray(node.dependsOn) ? node.dependsOn : node.depends_on);
  return Array.isArray(value) ? value.map(String) : [];
}

// The single gate-mode classifier. This intentionally uses forward
// reachability, not strict post-dominance: a verifier downstream of a producer
// remains a change gate even when another producer -> sink route bypasses it.
function deriveGateMode(planView, node) {
  if (!node || planNodeRole(node) !== 'adversarial-verifier') return null;
  const plan = planView && typeof planView === 'object' ? planView : {};
  const nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
  const byId = new Map(nodes.map(n => [planNodeId(n), n]));
  const nodeId = planNodeId(node);
  if (!nodeId || !byId.has(nodeId)) return 'investigation';
  const sinkId = String(plan.sinkId || plan.sink_id || plan.sink || '');
  if (!sinkId || !byId.has(sinkId)) return 'investigation';
  const adjacency = new Map(nodes.map(n => [planNodeId(n), []]));
  for (const child of nodes) {
    for (const parent of planNodeDepends(child)) {
      if (adjacency.has(parent)) adjacency.get(parent).push(planNodeId(child));
    }
  }
  const reaches = (from, to) => {
    if (from === to) return true;
    const seen = new Set([from]);
    const stack = [...(adjacency.get(from) || [])];
    while (stack.length) {
      const current = stack.pop();
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      stack.push(...(adjacency.get(current) || []));
    }
    return false;
  };
  if (!reaches(nodeId, sinkId)) return 'investigation';
  const producers = plan.changeProducerIds instanceof Set
    ? [...plan.changeProducerIds].map(String)
    : (Array.isArray(plan.changeProducerIds) ? plan.changeProducerIds.map(String) : []);
  return producers.some(id => id !== nodeId && byId.has(id) && reaches(id, nodeId))
    ? 'change_gate' : 'investigation';
}

function requiredReviewTokens(planView, node) {
  if (!node || !REVIEW_GATE_ROLES.includes(planNodeRole(node))) return ['evidence-binding'];
  const base = ['evidence-binding', 'contract_version', 'review_context_hash', 'behavior_contract_hash',
    'resolved_profile_hash', 'candidate_digest', 'domain_outcome'];
  const role = planNodeRole(node);
  if (role === 'adversarial-verifier') {
    base.push('claim_outcome');
    if (deriveGateMode(planView, node) === 'change_gate') {
      base.push('gate_mode', 'gate_claim', 'gate_surface', 'gate_aggregation');
    }
  } else {
    base.push('gate_claim', 'gate_surface', 'gate_aggregation', 'finding_json|findings_none');
  }
  return base;
}

function deriveGateEffect(role, gateMode, domainOutcome, blockingFindings) {
  const r = String(role || '');
  const outcome = String(domainOutcome || '');
  const blockers = Number.isInteger(blockingFindings) && blockingFindings >= 0 ? blockingFindings : 0;
  if (r === 'adversarial-verifier') {
    if (!ADVERSARIAL_OUTCOMES.includes(outcome)) return null;
    if (gateMode === 'investigation') return 'none';
    if (gateMode !== 'change_gate') return null;
    return outcome === 'not_refuted' ? 'pass' : 'fail';
  }
  if (!REVIEW_GATE_ROLES.includes(r) || !APPROVAL_OUTCOMES.includes(outcome)) return null;
  return outcome === 'approved' && blockers === 0 ? 'pass' : 'fail';
}

function buildReviewContext(input) {
  const value = isPlainObject(input) ? input : {};
  for (const forbidden of ['resolved_profile_hash', 'runtime', 'model', 'tools', 'evidence_transport', 'timestamp', 'absolute_path']) {
    if (Object.prototype.hasOwnProperty.call(value, forbidden)) {
      return { ok: false, reason: 'review_context_runtime_specific', field: forbidden };
    }
  }
  const context = { schema_version: REVIEW_CONTEXT_SCHEMA_VERSION };
  const fields = [
    'contract_version', 'behavior_contract_version', 'behavior_contract_hash', 'plan_schema_version',
    'plan_hash', 'claim_identity_digest', 'epoch_lineage_id', 'epoch', 'logical_gate', 'gate_mode',
    'claim_root_base', 'candidate_digest', 'inherited_frontier', 'scope_lineage_id', 'review_phase',
    'attempt_ordinal', 'acceptance_evidence', 'prior_findings', 'repair_delta', 'validation_obligations',
  ];
  for (const field of fields) context[field] = value[field];
  const hashFields = ['behavior_contract_hash', 'plan_hash', 'claim_identity_digest', 'epoch_lineage_id',
    'candidate_digest', 'scope_lineage_id'];
  // A contract-2 gate context requires behavior contract version 2 exactly. A schema-2 gate role whose
  // profile still carries a v1 (or missing) behavior identity is a silent downgrade and must refuse here
  // rather than admit a weaker contract under a v2 plan/dispatch.
  if (context.contract_version !== 2 || context.plan_schema_version !== 2
    || context.behavior_contract_version !== 2
    || !Number.isInteger(context.epoch) || context.epoch < 1
    || !Number.isInteger(context.attempt_ordinal) || context.attempt_ordinal < 1
    || !hashFields.every(field => typeof context[field] === 'string' && HEX64_RE.test(context[field]))) {
    return { ok: false, reason: 'review_context_identity_malformed' };
  }
  if (!['investigation', 'change_gate'].includes(context.gate_mode)
    || !['discovery', 'closure'].includes(context.review_phase)
    || !isPlainObject(context.logical_gate)
    || !REVIEW_AGGREGATIONS.includes(context.logical_gate.aggregation)
    || !Array.isArray(context.logical_gate.members)
    || !Array.isArray(context.logical_gate.surface_digests)
    || !Array.isArray(context.logical_gate.certified_producers)
    || !isPlainObject(context.claim_root_base)
    || typeof context.claim_root_base.commit !== 'string'
    || !/^[0-9a-f]{40,64}$/i.test(context.claim_root_base.commit)
    || !HEX64_RE.test(String(context.claim_root_base.digest || ''))
    || !isPlainObject(context.inherited_frontier)
    || !Array.isArray(context.inherited_frontier.classes)
    || !Array.isArray(context.acceptance_evidence)
    || !Array.isArray(context.prior_findings)
    || !Array.isArray(context.validation_obligations)) {
    return { ok: false, reason: 'review_context_shape_malformed' };
  }
  if ((context.review_phase === 'discovery' && context.repair_delta !== null)
    || (context.review_phase === 'closure'
      && !validateRepairDelta(context.repair_delta, context.candidate_digest).ok)) {
    return { ok: false, reason: 'review_context_repair_delta_malformed' };
  }
  try {
    const bytes = canonicalJson(context);
    return { ok: true, context, bytes, context_hash: sha256Hex(bytes) };
  } catch (error) {
    return { ok: false, reason: 'review_context_not_canonical', detail: error.message };
  }
}

function parseReviewEvidence(input) {
  if (isPlainObject(input)) return { ...input };
  const text = String(input || '');
  const out = {};
  const keys = ['contract_version', 'review_context_hash', 'behavior_contract_hash', 'resolved_profile_hash',
    'candidate_digest', 'domain_outcome', 'claim_outcome', 'gate_mode', 'gate_claim', 'gate_surface',
    'gate_aggregation', 'execution_status', 'gate_effect'];
  for (const key of keys) {
    const re = new RegExp('^' + key + ':[ \\t]*(.*?)\\s*$', 'gm');
    let match, last = null;
    while ((match = re.exec(text)) !== null) last = match[1];
    if (last !== null) out[key] = key === 'contract_version' && /^\d+$/.test(last) ? Number(last) : last;
  }
  out.finding_json = [];
  out.resolution_json = [];
  for (const [key, target] of [['finding_json', out.finding_json], ['resolution_json', out.resolution_json]]) {
    const re = new RegExp('^' + key + ':[ \\t]*(\\{.*\\})[ \\t]*$', 'gm');
    let match;
    while ((match = re.exec(text)) !== null) {
      try { target.push(JSON.parse(match[1])); } catch (_) { target.push({ __malformed: true }); }
    }
  }
  return out;
}

function parseReviewEvidenceIdentity(input) {
  if (isPlainObject(input)) {
    const out = {};
    for (const key of ['contract_version', 'review_context_hash', 'behavior_contract_hash',
      'resolved_profile_hash', 'candidate_digest', 'domain_outcome', 'claim_outcome',
      'gate_mode', 'gate_claim', 'gate_surface', 'gate_aggregation', 'execution_status', 'gate_effect']) {
      if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
    }
    return out;
  }
  const text = String(input || '');
  const out = {};
  for (const key of ['contract_version', 'review_context_hash', 'behavior_contract_hash',
    'resolved_profile_hash', 'candidate_digest', 'domain_outcome', 'claim_outcome',
    'gate_mode', 'gate_claim', 'gate_surface', 'gate_aggregation', 'execution_status', 'gate_effect']) {
    const re = new RegExp('^' + key + ':[ \\t]*(.*?)\\s*$', 'gm');
    let match, last = null;
    while ((match = re.exec(text)) !== null) last = match[1];
    if (last !== null) out[key] = key === 'contract_version' && /^\d+$/.test(last) ? Number(last) : last;
  }
  return out;
}

// Binding verification is deliberately complete before any finding rows are
// inspected. Callers may pass raw evidence text or a parsed object.
function validateReviewEvidenceBinding(evidenceInput, dispatch, context) {
  const evidence = parseReviewEvidenceIdentity(evidenceInput);
  const d = isPlainObject(dispatch) ? dispatch : {};
  const c = isPlainObject(context) ? context : {};
  if (Object.prototype.hasOwnProperty.call(evidence, 'execution_status')
    || Object.prototype.hasOwnProperty.call(evidence, 'gate_effect')) {
    return { ok: false, reason: 'review_reserved_harness_field' };
  }
  if (d.contract_version !== 2 || c.contract_version !== 2 || evidence.contract_version !== 2) {
    return { ok: false, reason: 'review_contract_version_mismatch' };
  }
  let recomputed;
  try { recomputed = sha256Hex(canonicalJson(c)); } catch (_) {
    return { ok: false, reason: 'review_context_malformed' };
  }
  if (!HEX64_RE.test(String(d.review_context_hash || ''))
    || evidence.review_context_hash !== d.review_context_hash
    || d.review_context_hash !== recomputed) {
    return { ok: false, reason: 'review_context_mismatch' };
  }
  if (!HEX64_RE.test(String(d.behavior_contract_hash || ''))
    || evidence.behavior_contract_hash !== d.behavior_contract_hash
    || d.behavior_contract_hash !== c.behavior_contract_hash) {
    return { ok: false, reason: 'review_behavior_mismatch' };
  }
  if (!HEX64_RE.test(String(d.resolved_profile_hash || ''))
    || evidence.resolved_profile_hash !== d.resolved_profile_hash) {
    return { ok: false, reason: 'review_profile_mismatch' };
  }
  if (!HEX64_RE.test(String(d.candidate_digest || ''))
    || evidence.candidate_digest !== d.candidate_digest
    || d.candidate_digest !== c.candidate_digest) {
    return { ok: false, reason: 'review_candidate_mismatch' };
  }
  return { ok: true, evidence };
}

function normalizeFindingPath(raw) {
  if (typeof raw !== 'string' || !raw || raw.includes('\\') || /[\0-\x1f\x7f]/.test(raw)
    || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;
  let path = raw;
  while (path.startsWith('./')) path = path.slice(2);
  const parts = path.split('/').filter(part => part !== '.');
  if (!parts.length || parts.some(part => !part || part === '..')) return null;
  path = parts.join('/');
  if (path.normalize('NFC') !== path) return null;
  return path;
}

function normalizeObjectId(format, value) {
  const f = String(format || '').toLowerCase();
  const id = String(value || '').toLowerCase();
  if (f === 'sha1' && SHA1_RE.test(id)) return { object_format: f, object_id: id };
  if (f === 'sha256' && HEX64_RE.test(id)) return { object_format: f, object_id: id };
  return null;
}

function normalizeTreeEntry(value, format) {
  if (value === null) return null;
  if (!isPlainObject(value) || !TREE_MODE_RE.test(String(value.tree_mode || ''))) return undefined;
  const id = normalizeObjectId(format, value.object_id);
  return id ? { tree_mode: String(value.tree_mode), object_id: id.object_id } : undefined;
}

function normalizeFindingAnchor(input, options) {
  const value = isPlainObject(input) ? input : {};
  const kind = String(value.kind || '');
  const opts = isPlainObject(options) ? options : {};
  if (!FINDING_ANCHOR_KINDS.includes(kind)) return { ok: false, reason: 'finding_anchor_kind_invalid' };
  const path = kind === 'evidence_observation' ? null : normalizeFindingPath(value.path);
  if (kind !== 'evidence_observation' && !path) return { ok: false, reason: 'finding_anchor_path_invalid' };
  let anchor;
  if (kind === 'candidate_range') {
    const oid = normalizeObjectId(value.object_format, value.object_id);
    if (!oid || !/^(?:100644|100755|120000)$/.test(String(value.tree_mode || ''))
      || !Number.isInteger(value.start) || !Number.isInteger(value.end)
      || value.start < 0 || value.end <= value.start
      || (Number.isInteger(value.blob_length) && value.end > value.blob_length)) {
      return { ok: false, reason: 'finding_anchor_candidate_range_invalid' };
    }
    anchor = { kind, path, object_format: oid.object_format, tree_mode: String(value.tree_mode),
      object_id: oid.object_id, start: value.start, end: value.end };
  } else if (kind === 'deleted_base_range') {
    const oid = normalizeObjectId(value.object_format, value.object_id);
    const hunk = String(value.deletion_hunk_digest || value.deletion_patch_digest || '').toLowerCase();
    if (!oid || !TREE_MODE_RE.test(String(value.tree_mode || ''))
      || !HEX64_RE.test(String(value.parent_candidate_digest || '')) || !HEX64_RE.test(hunk)
      || !Number.isInteger(value.start) || !Number.isInteger(value.end)
      || value.start < 0 || value.end <= value.start
      || (Number.isInteger(value.blob_length) && value.end > value.blob_length)) {
      return { ok: false, reason: 'finding_anchor_deleted_range_invalid' };
    }
    anchor = { kind, parent_candidate_digest: String(value.parent_candidate_digest).toLowerCase(), path,
      object_format: oid.object_format, tree_mode: String(value.tree_mode), object_id: oid.object_id,
      start: value.start, end: value.end, deletion_hunk_digest: hunk };
  } else if (kind === 'tree_entry_change') {
    const format = String(value.object_format || '').toLowerCase();
    if (!['sha1', 'sha256'].includes(format)) return { ok: false, reason: 'finding_anchor_object_format_invalid' };
    const base = normalizeTreeEntry(value.base, format);
    const candidate = normalizeTreeEntry(value.candidate, format);
    if (base === undefined || candidate === undefined || (base === null && candidate === null)
      || canonicalJson(base) === canonicalJson(candidate)) {
      return { ok: false, reason: 'finding_anchor_tree_change_invalid' };
    }
    anchor = { kind, path, object_format: format, base, candidate };
  } else if (kind === 'required_absence') {
    if (!HEX64_RE.test(String(value.acceptance_clause_digest || ''))
      || !HEX64_RE.test(String(value.candidate_tree_digest || ''))) {
      return { ok: false, reason: 'finding_anchor_absence_invalid' };
    }
    anchor = { kind, path, acceptance_clause_digest: String(value.acceptance_clause_digest).toLowerCase(),
      candidate_tree_digest: String(value.candidate_tree_digest).toLowerCase() };
  } else {
    const observation = String(value.observation_key || '');
    if (!HEX64_RE.test(String(value.producer_evidence_digest || ''))
      || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(observation)) {
      return { ok: false, reason: 'finding_anchor_evidence_invalid' };
    }
    anchor = { kind, producer_evidence_digest: String(value.producer_evidence_digest).toLowerCase(),
      observation_key: observation };
  }
  if (value.trigger_digest !== undefined) {
    if (!HEX64_RE.test(String(value.trigger_digest))) return { ok: false, reason: 'finding_trigger_digest_invalid' };
    anchor.trigger_digest = String(value.trigger_digest).toLowerCase();
  }
  // Optional harness-supplied candidate index. When present it is authoritative;
  // absence of the index keeps this helper a structural pure normalizer.
  const index = opts.anchor_index;
  if (index && path) {
    const entries = kind === 'deleted_base_range' ? index.base_entries : index.candidate_entries;
    const expected = entries && entries[path];
    if (kind === 'required_absence') {
      if (index.candidate_entries && Object.prototype.hasOwnProperty.call(index.candidate_entries, path)) {
        return { ok: false, reason: 'finding_required_absence_present' };
      }
      if (index.candidate_tree_digest && anchor.candidate_tree_digest !== index.candidate_tree_digest) {
        return { ok: false, reason: 'finding_candidate_tree_mismatch' };
      }
    } else if (kind === 'tree_entry_change') {
      const baseExpected = index.base_entries
        && Object.prototype.hasOwnProperty.call(index.base_entries, path) ? index.base_entries[path] : null;
      const candidateExpected = index.candidate_entries
        && Object.prototype.hasOwnProperty.call(index.candidate_entries, path) ? index.candidate_entries[path] : null;
      const project = entry => entry === null ? null : {
        tree_mode: entry.tree_mode, object_id: entry.object_id,
      };
      if (anchor.object_format !== index.object_format
        || canonicalJson(anchor.base) !== canonicalJson(project(baseExpected))
        || canonicalJson(anchor.candidate) !== canonicalJson(project(candidateExpected))) {
        return { ok: false, reason: 'finding_anchor_tree_change_mismatch' };
      }
    } else if (kind !== 'evidence_observation' && (!expected
      || expected.object_format !== anchor.object_format || expected.tree_mode !== anchor.tree_mode
      || expected.object_id !== anchor.object_id
      || (Number.isInteger(expected.blob_length) && anchor.end > expected.blob_length))) {
      return { ok: false, reason: 'finding_anchor_candidate_mismatch' };
    }
    if (kind === 'deleted_base_range' && index.parent_candidate_digest
      && anchor.parent_candidate_digest !== index.parent_candidate_digest) {
      return { ok: false, reason: 'finding_parent_candidate_mismatch' };
    }
  }
  if (index && kind === 'evidence_observation' && Array.isArray(index.evidence_digests)
    && !index.evidence_digests.includes(anchor.producer_evidence_digest)) {
    return { ok: false, reason: 'finding_evidence_observation_unbound' };
  }
  return { ok: true, anchor };
}

function computeFindingUid(scopeLineageId, primaryAnchor) {
  if (!HEX64_RE.test(String(scopeLineageId || ''))) return null;
  try { return sha256Hex(canonicalJson({ scope_lineage_id: String(scopeLineageId).toLowerCase(), primary_anchor: primaryAnchor })); }
  catch (_) { return null; }
}

function normalizeFindingSet(findings, options) {
  const opts = isPlainObject(options) ? options : {};
  const scopeLineageId = String(opts.scope_lineage_id || '').toLowerCase();
  if (!HEX64_RE.test(scopeLineageId) || !Array.isArray(findings)) {
    return { ok: false, reason: 'finding_set_malformed' };
  }
  const byUid = new Map();
  for (const input of findings) {
    if (!isPlainObject(input) || !FINDING_FAILURE_CLASSES.includes(input.failure_class)
      || !isPlainObject(input.trigger)) return { ok: false, reason: 'finding_malformed' };
    const triggerKeys = ['precondition_digest', 'input_digest', 'expected_digest', 'observed_digest'];
    if (!triggerKeys.every(key => HEX64_RE.test(String(input.trigger[key] || '')))) {
      return { ok: false, reason: 'finding_trigger_malformed' };
    }
    const trigger = {};
    for (const key of triggerKeys) trigger[key] = String(input.trigger[key]).toLowerCase();
    const triggerDigest = sha256Hex(canonicalJson(trigger));
    const primaryInput = { ...(input.primary_anchor || {}), trigger_digest: triggerDigest };
    const primary = normalizeFindingAnchor(primaryInput, opts);
    if (!primary.ok) return primary;
    const secondary = [];
    for (const raw of (Array.isArray(input.secondary_anchors) ? input.secondary_anchors : [])) {
      const normalized = normalizeFindingAnchor(raw, opts);
      if (!normalized.ok) return normalized;
      secondary.push(normalized.anchor);
    }
    const secondaryMap = new Map(secondary.map(anchor => [canonicalJson(anchor), anchor]));
    const secondaryAnchors = [...secondaryMap.values()].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
    const uid = computeFindingUid(scopeLineageId, primary.anchor);
    if (!uid) return { ok: false, reason: 'finding_uid_unavailable' };
    if (input.uid !== undefined && String(input.uid).toLowerCase() !== uid) {
      return { ok: false, reason: 'finding_uid_mismatch' };
    }
    const immutable = { failure_class: input.failure_class, trigger, primary_anchor: primary.anchor };
    const normalized = {
      uid, failure_class: input.failure_class, trigger, trigger_digest: triggerDigest,
      primary_anchor: primary.anchor, secondary_anchors: secondaryAnchors,
      severity: input.severity == null ? null : String(input.severity),
      scope: input.scope == null ? null : String(input.scope),
      action: input.action == null ? null : String(input.action),
      status: input.status == null ? null : String(input.status),
      fix_role: input.fix_role == null ? null : String(input.fix_role),
      proof_digest: input.proof_digest == null ? null : String(input.proof_digest).toLowerCase(),
    };
    if (byUid.has(uid)) {
      const prior = byUid.get(uid);
      if (canonicalJson(prior.immutable) !== canonicalJson(immutable)) {
        return { ok: false, reason: 'finding_uid_collision', uid };
      }
      const merged = new Map([...prior.finding.secondary_anchors, ...secondaryAnchors]
        .map(anchor => [canonicalJson(anchor), anchor]));
      prior.finding.secondary_anchors = [...merged.values()].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
      continue;
    }
    byUid.set(uid, { immutable, finding: normalized });
  }
  return { ok: true, findings: [...byUid.values()].map(value => value.finding).sort((a, b) => a.uid.localeCompare(b.uid)) };
}

// The authoritative current-candidate artifacts a closure resolution is allowed
// to cite. A resolution's validation_vector_digest must name the vector_id of an
// actual current-candidate PASS vector, and its evidence_digest must name that
// vector's durable receipt_sha256. Both are harness-recomputed from the bound
// validation vectors, so a reviewer cannot invent a well-formed 64-hex digest and
// have it count as proof. Returns lowercase sorted digest arrays.
function authoritativeResolutionArtifacts(vectors, candidateDigest) {
  const cand = String(candidateDigest || '').toLowerCase();
  const vectorDigests = new Set();
  const evidenceDigests = new Set();
  for (const vector of Array.isArray(vectors) ? vectors : []) {
    if (!isPlainObject(vector)) continue;
    if (String(vector.candidate_digest || '').toLowerCase() !== cand) continue;
    if (vector.outcome !== 'pass') continue;
    if (HEX64_RE.test(String(vector.vector_id || ''))) vectorDigests.add(String(vector.vector_id).toLowerCase());
    if (HEX64_RE.test(String(vector.receipt_sha256 || ''))) evidenceDigests.add(String(vector.receipt_sha256).toLowerCase());
  }
  return {
    validation_vector_digests: [...vectorDigests].sort(),
    evidence_digests: [...evidenceDigests].sort(),
  };
}

// A closure resolution is deliberately a closed record.  In particular, a
// reviewer cannot attach an unbound prose "proof" and have it count as removal
// from the frontier: every identity below is supplied by the harness context.
// When the binding carries the authoritative current-candidate artifact sets, the
// referenced validation-vector and evidence digests must resolve to one of them —
// a fabricated well-formed digest fails closed here rather than laundering a UID
// off the frontier.
function normalizeResolutionSet(resolutions, binding) {
  const rows = Array.isArray(resolutions) ? resolutions : null;
  const expected = isPlainObject(binding) ? binding : {};
  if (!rows) return { ok: false, reason: 'review_resolution_set_malformed' };
  const allowed = ['uid', 'repair_attempt_id', 'validation_vector_digest', 'evidence_digest', 'candidate_digest'];
  const knownVectorDigests = Array.isArray(expected.known_validation_vector_digests)
    ? new Set(expected.known_validation_vector_digests.map(value => String(value).toLowerCase())) : null;
  const knownEvidenceDigests = Array.isArray(expected.known_evidence_digests)
    ? new Set(expected.known_evidence_digests.map(value => String(value).toLowerCase())) : null;
  const byUid = new Map();
  for (const raw of rows) {
    if (!isPlainObject(raw) || Object.keys(raw).some(key => !allowed.includes(key))
      || Object.keys(raw).length !== allowed.length) {
      return { ok: false, reason: 'review_resolution_malformed' };
    }
    const row = {};
    for (const key of allowed) row[key] = String(raw[key] == null ? '' : raw[key]).toLowerCase();
    if (!HEX64_RE.test(row.uid) || !row.repair_attempt_id
      || !HEX64_RE.test(row.validation_vector_digest) || !HEX64_RE.test(row.evidence_digest)
      || !HEX64_RE.test(row.candidate_digest)) {
      return { ok: false, reason: 'review_resolution_malformed' };
    }
    if (expected.repair_attempt_id != null && row.repair_attempt_id !== String(expected.repair_attempt_id).toLowerCase()) {
      return { ok: false, reason: 'review_resolution_repair_mismatch', uid: row.uid };
    }
    if (expected.candidate_digest != null && row.candidate_digest !== String(expected.candidate_digest).toLowerCase()) {
      return { ok: false, reason: 'review_resolution_candidate_mismatch', uid: row.uid };
    }
    if (knownVectorDigests && !knownVectorDigests.has(row.validation_vector_digest)) {
      return { ok: false, reason: 'review_resolution_vector_unbound', uid: row.uid };
    }
    if (knownEvidenceDigests && !knownEvidenceDigests.has(row.evidence_digest)) {
      return { ok: false, reason: 'review_resolution_evidence_unbound', uid: row.uid };
    }
    if (byUid.has(row.uid) && canonicalJson(byUid.get(row.uid)) !== canonicalJson(row)) {
      return { ok: false, reason: 'review_resolution_collision', uid: row.uid };
    }
    byUid.set(row.uid, row);
  }
  return { ok: true, resolutions: [...byUid.values()].sort((a, b) => a.uid.localeCompare(b.uid)) };
}

function deriveRepairDelta(input) {
  const value = isPlainObject(input) ? input : {};
  const previous = value.previous_attempt;
  const current = value.current_candidate;
  if (!isPlainObject(previous) || !isPlainObject(current)) {
    return { ok: false, reason: 'review_repair_delta_unavailable' };
  }
  const before = effectiveCandidate(previous);
  const selectedWriter = previous.repair && previous.repair.selected_writer;
  if (previous.outcome !== 'fail' || previous.lifecycle_settled !== true
    || !selectedWriter || previous.repair.settled !== true
    || previous.consumed_by !== selectedWriter
    || !HEX64_RE.test(String(before.digest || ''))
    || !HEX64_RE.test(String(current.digest || ''))
    || !isCanonicalBlobMap(before.declared) || !isCanonicalBlobMap(current.declared)) {
    return { ok: false, reason: 'review_repair_delta_unavailable' };
  }
  const paths = [];
  const keys = Array.from(new Set([...Object.keys(before.declared), ...Object.keys(current.declared)])).sort();
  for (const path of keys) {
    const prior = Object.prototype.hasOwnProperty.call(before.declared, path) ? before.declared[path] : null;
    const after = Object.prototype.hasOwnProperty.call(current.declared, path) ? current.declared[path] : null;
    if (prior !== after) paths.push({ path, before: prior, after });
  }
  return { ok: true, repair_delta: {
    repair_attempt_id: String(previous.attempt_id),
    selected_writer: String(selectedWriter),
    before_candidate_digest: String(before.digest).toLowerCase(),
    after_candidate_digest: String(current.digest).toLowerCase(),
    paths,
  } };
}

function validateRepairDelta(delta, expectedCandidateDigest) {
  if (!isPlainObject(delta)) return { ok: false, reason: 'review_repair_delta_malformed' };
  const allowed = ['repair_attempt_id', 'selected_writer', 'before_candidate_digest', 'after_candidate_digest', 'paths'];
  if (Object.keys(delta).some(key => !allowed.includes(key)) || Object.keys(delta).length !== allowed.length
    || typeof delta.repair_attempt_id !== 'string' || !delta.repair_attempt_id
    || typeof delta.selected_writer !== 'string' || !delta.selected_writer
    || !HEX64_RE.test(String(delta.before_candidate_digest || ''))
    || !HEX64_RE.test(String(delta.after_candidate_digest || ''))
    || (expectedCandidateDigest && delta.after_candidate_digest !== expectedCandidateDigest)
    || !Array.isArray(delta.paths)) {
    return { ok: false, reason: 'review_repair_delta_malformed' };
  }
  const seen = new Set();
  let priorPath = null;
  for (const row of delta.paths) {
    if (!isPlainObject(row) || Object.keys(row).some(key => !['path', 'before', 'after'].includes(key))
      || Object.keys(row).length !== 3 || !normalizeFindingPath(row.path)
      || row.path !== normalizeFindingPath(row.path) || seen.has(row.path)
      || (priorPath !== null && priorPath.localeCompare(row.path) >= 0)
      || !(row.before === null || (typeof row.before === 'string' && CANONICAL_TREE_ENTRY_RE.test(row.before)))
      || !(row.after === null || (typeof row.after === 'string' && CANONICAL_TREE_ENTRY_RE.test(row.after)))
      || row.before === row.after) {
      return { ok: false, reason: 'review_repair_delta_malformed' };
    }
    seen.add(row.path);
    priorPath = row.path;
  }
  return { ok: true, repair_delta: delta };
}

function findingAnchorPaths(finding) {
  const anchors = [finding && finding.primary_anchor,
    ...((finding && Array.isArray(finding.secondary_anchors)) ? finding.secondary_anchors : [])];
  return Array.from(new Set(anchors.filter(anchor => anchor && typeof anchor.path === 'string')
    .map(anchor => anchor.path))).sort();
}

// Closure-frontier admission is separate from progress.  It proves complete
// coverage of the previous frontier and classifies genuinely new blockers as
// either repair regressions (anchored in the exact repair delta) or scope
// expansion (durable re-plan), before the numeric progress reducer runs.
function assessFindingClosure(input) {
  const value = isPlainObject(input) ? input : {};
  const prior = Array.isArray(value.prior_findings) ? value.prior_findings : [];
  const current = Array.isArray(value.current_findings) ? value.current_findings : [];
  const priorByUid = new Map(prior.map(finding => [String(finding && finding.uid || ''), finding]));
  const currentByUid = new Map(current.map(finding => [String(finding && finding.uid || ''), finding]));
  if (priorByUid.has('') || currentByUid.has('') || priorByUid.size !== prior.length || currentByUid.size !== current.length) {
    return { ok: false, reason: 'review_finding_frontier_malformed' };
  }
  for (const finding of current) {
    if (!['open', 'resolved'].includes(String(finding.status || ''))) {
      return { ok: false, reason: 'review_finding_status_invalid', uid: finding.uid };
    }
  }
  const missing = [...priorByUid.keys()].filter(uid => !currentByUid.has(uid)).sort();
  if (missing.length) return { ok: false, reason: 'review_prior_uid_missing', missing_uids: missing };
  for (const [uid, before] of priorByUid) {
    const after = currentByUid.get(uid);
    const immutable = finding => ({ failure_class: finding.failure_class, trigger: finding.trigger,
      primary_anchor: finding.primary_anchor });
    if (canonicalJson(immutable(before)) !== canonicalJson(immutable(after))) {
      return { ok: false, reason: 'finding_uid_collision', uid };
    }
  }
  const delta = value.repair_delta;
  const deltaCheck = validateRepairDelta(delta, value.candidate_digest);
  if (!deltaCheck.ok) return deltaCheck;
  const deltaPaths = new Set(delta.paths.map(row => row.path));
  const repairDeltaUids = [];
  const expandedUids = [];
  for (const finding of current) {
    if (priorByUid.has(finding.uid) || finding.status === 'resolved') continue;
    const bound = findingAnchorPaths(finding).some(path => deltaPaths.has(path));
    (bound ? repairDeltaUids : expandedUids).push(finding.uid);
  }
  repairDeltaUids.sort();
  expandedUids.sort();
  return { ok: true, scope_expanded: expandedUids.length > 0,
    repair_delta_uids: repairDeltaUids, expanded_uids: expandedUids };
}

function reduceReviewReceipts(input) {
  const value = isPlainObject(input) ? input : {};
  const aggregation = String(value.aggregation || '');
  const role = String(value.role || '');
  const mode = value.gate_mode == null ? null : String(value.gate_mode);
  const members = Array.isArray(value.expected_members) ? value.expected_members.map(String) : [];
  const surfaces = Array.isArray(value.expected_surfaces) ? value.expected_surfaces.map(String) : [];
  const receipts = Array.isArray(value.receipts) ? value.receipts : [];
  const incomplete = reason => ({ complete: false, execution_status: 'failed', domain_outcome: null, gate_effect: null, reason });
  if (!REVIEW_AGGREGATIONS.includes(aggregation) || !REVIEW_GATE_ROLES.includes(role)
    || !members.length || members.length !== surfaces.length) return incomplete('review_reducer_shape_invalid');
  if (aggregation === 'sequence' && members.length !== 1) return incomplete('review_sequence_cardinality_invalid');
  if (aggregation === 'replicated_majority' && new Set(surfaces).size !== 1) return incomplete('review_replica_surface_mismatch');
  if (aggregation === 'partitioned_all' && new Set(surfaces).size !== surfaces.length) return incomplete('review_partition_surface_duplicate');
  if (receipts.length !== members.length) return incomplete('review_receipt_missing');
  const byMember = new Map();
  for (const receipt of receipts) {
    if (!isPlainObject(receipt) || receipt.execution_status !== 'complete'
      || !members.includes(String(receipt.node_id)) || byMember.has(String(receipt.node_id))) {
      return incomplete('review_receipt_identity_invalid');
    }
    byMember.set(String(receipt.node_id), receipt);
  }
  for (let i = 0; i < members.length; i++) {
    if (!byMember.has(members[i]) || String(byMember.get(members[i]).surface || '') !== surfaces[i]) {
      return incomplete('review_receipt_surface_mismatch');
    }
  }
  const ordered = members.map(id => byMember.get(id));
  let domainOutcome;
  if (role === 'adversarial-verifier') {
    if (ordered.some(receipt => !ADVERSARIAL_OUTCOMES.includes(receipt.domain_outcome))) {
      return incomplete('review_domain_outcome_invalid');
    }
    if (aggregation === 'sequence') domainOutcome = ordered[0].domain_outcome;
    else if (aggregation === 'partitioned_all') {
      domainOutcome = ordered.some(r => r.domain_outcome === 'refuted') ? 'refuted'
        : (ordered.some(r => r.domain_outcome === 'indeterminate') ? 'indeterminate' : 'not_refuted');
    } else {
      const count = outcome => ordered.filter(r => r.domain_outcome === outcome).length;
      domainOutcome = count('not_refuted') > ordered.length / 2 ? 'not_refuted'
        : (count('refuted') * 2 >= ordered.length ? 'refuted' : 'indeterminate');
    }
  } else {
    if (ordered.some(receipt => !APPROVAL_OUTCOMES.includes(receipt.domain_outcome))) {
      return incomplete('review_domain_outcome_invalid');
    }
    const blockers = ordered.some(receipt => Number(receipt.blocking_findings || 0) > 0
      || receipt.domain_outcome === 'changes_requested');
    if (aggregation === 'replicated_majority') {
      const approvals = ordered.filter(receipt => receipt.domain_outcome === 'approved'
        && Number(receipt.blocking_findings || 0) === 0).length;
      domainOutcome = !blockers && approvals > ordered.length / 2 ? 'approved' : 'changes_requested';
    } else {
      domainOutcome = blockers ? 'changes_requested' : 'approved';
    }
  }
  const blocking = ordered.reduce((sum, receipt) => sum + Math.max(0, Number(receipt.blocking_findings || 0)), 0);
  return { complete: true, execution_status: 'complete', domain_outcome: domainOutcome,
    gate_effect: deriveGateEffect(role, mode, domainOutcome, blocking), blocking_findings: blocking,
    reducer_inputs: ordered };
}

// An inherited obligation is the immutable pair {command_id, required_pass_vector_id}. command_id encodes
// the command / environment / tool identity (it excludes the candidate), so it is stable across a repair;
// required_pass_vector_id is the candidate-A proof and stays as durable audit metadata. The candidate-bound
// vector id necessarily changes when a repair produces candidate B, so satisfaction is a COMPARABLE current-
// candidate pass — same command_id, bound to the current candidate — NOT a re-appearance of the A vector id.
// Requiring exact vector-id equality would make every substantive repair non-progress (the R2 defect).
function compareValidationObligations(obligations, vectors, currentCandidateDigest) {
  if (!Array.isArray(obligations) || !Array.isArray(vectors)) return { status: 'drift', reason: 'validation_shape_invalid' };
  if (!obligations.length) return { status: 'pass', matched: [] };
  const current = String(currentCandidateDigest || '').toLowerCase();
  const matched = [];
  for (const obligation of obligations) {
    if (!isPlainObject(obligation) || !HEX64_RE.test(String(obligation.command_id || ''))
      || !HEX64_RE.test(String(obligation.required_pass_vector_id || ''))) {
      return { status: 'drift', reason: 'validation_obligation_invalid' };
    }
    const candidates = vectors.filter(vector => vector && vector.command_id === obligation.command_id);
    if (!candidates.length) return { status: 'drift', reason: 'validation_command_drift', command_id: obligation.command_id };
    // When the current candidate digest is known, require the satisfying vector to bind it. A same-command
    // vector left over from another candidate cannot certify the current one (validation_candidate_drift).
    const boundToCurrent = current
      ? candidates.filter(vector => String(vector.candidate_digest || '').toLowerCase() === current)
      : candidates;
    if (current && !boundToCurrent.length) {
      return { status: 'drift', reason: 'validation_candidate_drift', command_id: obligation.command_id };
    }
    const vector = boundToCurrent[boundToCurrent.length - 1];
    if (vector.outcome === 'fail') return { status: 'fail', reason: 'validation_failed', command_id: obligation.command_id };
    if (vector.outcome !== 'pass') return { status: 'inconclusive', reason: 'validation_inconclusive', command_id: obligation.command_id };
    matched.push({ command_id: obligation.command_id, required_pass_vector_id: obligation.required_pass_vector_id,
      current_pass_vector_id: vector.vector_id });
  }
  return { status: 'pass', matched };
}

function assessReviewProgress(input) {
  const value = isPlainObject(input) ? input : {};
  const previous = Array.from(new Set(Array.isArray(value.previous_open_uids) ? value.previous_open_uids.map(String) : [])).sort();
  const current = Array.from(new Set(Array.isArray(value.current_open_uids) ? value.current_open_uids.map(String) : [])).sort();
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const removed = previous.filter(uid => !currentSet.has(uid));
  const added = current.filter(uid => !previousSet.has(uid));
  const deltaUids = new Set(Array.isArray(value.repair_delta_uids) ? value.repair_delta_uids.map(String) : []);
  const scopeExpanded = added.some(uid => !deltaUids.has(uid));
  const resolutions = Array.isArray(value.resolutions) ? value.resolutions : [];
  const knownVectorDigests = Array.isArray(value.known_validation_vector_digests)
    ? new Set(value.known_validation_vector_digests.map(v => String(v).toLowerCase())) : null;
  const knownEvidenceDigests = Array.isArray(value.known_evidence_digests)
    ? new Set(value.known_evidence_digests.map(v => String(v).toLowerCase())) : null;
  // A UID only leaves the frontier with a resolution whose digests resolve to
  // authoritative current-candidate artifacts. When the caller supplies the known
  // sets, an unbound (fabricated) digest fails the membership test and the UID
  // cannot count toward progress.
  const resolutionFor = uid => resolutions.find(r => r && r.uid === uid
    && r.repair_attempt_id === value.repair_attempt_id
    && r.candidate_digest === value.candidate_digest
    && HEX64_RE.test(String(r.validation_vector_digest || ''))
    && HEX64_RE.test(String(r.evidence_digest || ''))
    && (!knownVectorDigests || knownVectorDigests.has(String(r.validation_vector_digest).toLowerCase()))
    && (!knownEvidenceDigests || knownEvidenceDigests.has(String(r.evidence_digest).toLowerCase())));
  const allResolved = removed.every(uid => !!resolutionFor(uid));
  const validationPass = value.validation && value.validation.status === 'pass';
  const progress = !scopeExpanded && current.length < previous.length && allResolved && validationPass;
  const idempotencyMaterial = {
    logical_gate_key: value.logical_gate_key || null,
    scope_lineage_id: value.scope_lineage_id || null,
    repair_attempt_id: value.repair_attempt_id || null,
    before_candidate_digest: value.before_candidate_digest || null,
    candidate_digest: value.candidate_digest || null,
  };
  const idempotencyKey = sha256Hex(canonicalJson(idempotencyMaterial));
  const replay = new Set(Array.isArray(value.seen_idempotency_keys) ? value.seen_idempotency_keys : []).has(idempotencyKey);
  let consecutive = Number.isInteger(value.previous_consecutive_nonprogress)
    ? Math.max(0, value.previous_consecutive_nonprogress) : 0;
  if (!replay) consecutive = progress ? 0 : consecutive + 1;
  let stopReason = null;
  if (scopeExpanded) stopReason = 'review_scope_expanded';
  else if (!progress && Number.isInteger(value.consumed_repairs)
    && value.consumed_repairs >= REVIEW_REPAIR_LIMIT) stopReason = 'review_repair_limit';
  else if (!progress && consecutive >= 2) stopReason = 'review_nonconvergent';
  return {
    progress: progress && !replay,
    reason: replay ? 'review_progress_replay' : (progress ? null
      : (scopeExpanded ? 'review_scope_expanded'
        : (!allResolved ? 'review_resolution_proof_missing'
          : (!validationPass ? 'review_validation_nonprogress' : 'review_frontier_nonprogress')))),
    stop_reason: stopReason,
    replan_required: stopReason === 'review_scope_expanded' || stopReason === 'review_nonconvergent',
    consecutive_nonprogress: consecutive,
    idempotency_key: idempotencyKey,
    previous_open_uids: previous,
    current_open_uids: current,
  };
}

// Canonical logical-gate identity. Display labels remain useful operator metadata but never
// participate in the key, so a reusable fan-out label cannot alias another resolved group.
function canonicalLogicalGateIdentity(input) {
  const value = input && typeof input === 'object' ? input : {};
  const kind = value.kind === 'fanout' ? 'fanout' : 'sequence';
  const origin = Array.from(new Set(Array.isArray(value.origin) ? value.origin.map(String) : [])).sort();
  const members = Array.from(new Set(Array.isArray(value.members) ? value.members.map(String) : [])).sort();
  return {
    key: JSON.stringify({ kind, origin, members }),
    kind,
    id: value.id == null ? (members[0] || null) : String(value.id),
    origin,
    members,
  };
}

// A tree-entry identity as the review candidate records it: '<6-digit octal mode> <40-hex sha>'. The MODE
// is load-bearing, not decoration — git records the exec bit, the symlink flag and the gitlink flag in the
// mode ALONE (a symlink's blob is its target-path bytes, so a symlink and a plain file holding that same
// text share one blob sha). A sha-only identity is therefore a WEAKER measuring stick than the whole-tree
// digest, the residue digest, the re-anchor safety assertion and the barrier — all of which see the mode —
// and anything the stick cannot see falls in no partition of the rebind proof and is silently waived.
const CANONICAL_TREE_ENTRY_RE = /^[0-7]{6} (?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

// A canonical blob map: a plain object whose keys are sorted repo-relative paths and whose values are
// tree-entry identities. Canonical form is what makes a byte-comparison against a freshly computed map sound.
// #688 (item 4, R6): ORDER-INSENSITIVE by construction — a plain JS object always enumerates
// canonical-integer keys (e.g. "10", "2024") FIRST, in ascending numeric order, ahead of EVERY string
// key regardless of insertion order. That forced reordering can diverge from a pure lexicographic sort
// purely as an engine artifact (a string key that sorts before the integer key lexicographically still
// enumerates AFTER it), so comparing Object.keys(value)'s native enumeration order against its own
// sorted form rejects a correctly-built map for no reason connected to how it was built. Sort once and
// validate shape only — no caller relies on the raw enumeration order (every lookup in this codebase is
// per-key, never a whole-object stringify comparison).
function isCanonicalBlobMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.every(k => k && normalizeFindingPath(k) === k
    && typeof value[k] === 'string' && CANONICAL_TREE_ENTRY_RE.test(value[k]));
}

// A writer-identity tuple as recorded in producer_bindings (and in a rebind record's overlay). The
// baseline IS the anchored ref and the generation IS its 12-char prefix — a tampered pair cannot pass.
function isWriterIdentityTuple(identity) {
  return !!identity && typeof identity === 'object' && !Array.isArray(identity)
    && ['baseline', 'anchored_ref', 'open_token', 'generation', 'ref']
      .every(k => typeof identity[k] === 'string' && identity[k] !== '')
    && identity.baseline === identity.anchored_ref
    && identity.generation === identity.baseline.slice(0, 12);
}

// The non-aborted rebind records of an attempt, in array order (which the chain check pins to the dense
// generation order). An aborted record is an inert crash artifact: it never moved a ref and never binds.
function nonAbortedRebinds(attempt) {
  return (attempt && Array.isArray(attempt.rebind) ? attempt.rebind : []).filter(r => r && r.aborted !== true);
}

// THE single accessor for "what candidate is this attempt bound to RIGHT NOW". The attempt's own
// candidate_digest / candidate_declared are IMMUTABLE forever (transaction_key hashes the digest into the
// attempt identity); a settled rebind record supplies an append-only OVERLAY that moves the binding
// without rewriting one byte of history.
function effectiveCandidate(attempt) {
  const settled = nonAbortedRebinds(attempt).filter(r => r.settled === true);
  const last = settled.length ? settled[settled.length - 1] : null;
  return last
    ? { digest: last.candidate_digest, declared: last.candidate_declared }
    : { digest: attempt && attempt.candidate_digest, declared: (attempt && attempt.candidate_declared) || {} };
}

// The same overlay rule for the writer's barrier identity: after a rebind moved the writer's baseline to
// the synthetic re-anchored commit, the EFFECTIVE binding is the one the rebind recorded.
function effectiveProducerBinding(attempt, writer) {
  const settled = nonAbortedRebinds(attempt).filter(r => r.settled === true
    && r.producer_bindings && r.producer_bindings[writer]);
  if (settled.length) return settled[settled.length - 1].producer_bindings[writer];
  return (attempt && attempt.producer_bindings) ? attempt.producer_bindings[writer] : undefined;
}

// Pure, fail-closed structural validation for the authoritative review journal. Runtime code may
// perform additional plan-relative proofs, but no caller is allowed to accept malformed durable state.
function validateReviewJournalV2(journal, expectedPlanHash) {
  const refuseJournal = (reason, detail) => ({ ok: false, reason, detail: detail || null });
  if (!journal || !isPlainObject(journal) || journal.schema_version !== REVIEW_JOURNAL_SCHEMA_VERSION
    || journal.contract_version !== REVIEW_CONTRACT_VERSION) {
    return refuseJournal('review_journal_version_unsupported', 'schema_version and contract_version must equal 2');
  }
  if (!HEX64_RE.test(String(journal.plan_hash || ''))
    || (expectedPlanHash && String(journal.plan_hash).toLowerCase() !== String(expectedPlanHash).toLowerCase())) {
    return refuseJournal('review_journal_plan_hash_mismatch');
  }
  if (!Array.isArray(journal.attempts)) return refuseJournal('review_journal_malformed', 'attempts must be an array');
  const ids = new Set();
  const txs = new Set();
  const ordinals = new Map();
  // Durable review history is indexed by scope lineage (epoch_lineage_id + scope_lineage_id), NOT by the
  // logical gate key. The gate key hashes member node ids, so renaming/re-planning a gate would otherwise
  // reset an otherwise-identical scope back to discovery; scope_lineage_id deliberately excludes the node
  // id. Gate identity is attempt metadata. Issue 699 owns the cross-epoch activation/CAS that carries a
  // scope lineage across plan hashes; this reader/validator exposes the scope-keyed contract it consumes.
  const lineageByScope = new Map();
  const scopeKey = attempt => String(attempt.epoch_lineage_id).toLowerCase() + ''
    + String(attempt.scope_lineage_id).toLowerCase();
  for (const attempt of journal.attempts) {
    if (!isPlainObject(attempt)) return refuseJournal('review_journal_malformed', 'attempt must be an object');
    const required = ['attempt_id', 'ordinal', 'plan_hash', 'contract_version', 'logical_gate',
      'transaction_key', 'candidate_digest', 'candidate_declared', 'candidate_residue_digest',
      'epoch_lineage_id', 'gate_mode', 'scope_lineage_id',
      'context_hashes', 'profile_hashes', 'review_phase', 'prior_open_uids', 'current_open_uids',
      'current_findings', 'findings', 'resolutions', 'route_candidates', 'repair_delta',
      'validation_obligations', 'validation_vectors',
      'progress', 'reducer', 'receipts', 'outcome', 'reason', 'settlement_command',
      'lifecycle_settled', 'producer_bindings', 'repair', 'rebind', 'consumed_by'];
    const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(attempt, key));
    if (missing.length) return refuseJournal('review_journal_malformed', 'missing attempt fields: ' + missing.join(', '));
    if (typeof attempt.attempt_id !== 'string' || !attempt.attempt_id || ids.has(attempt.attempt_id)) {
      return refuseJournal(ids.has(attempt.attempt_id) ? 'review_journal_duplicate_attempt_id' : 'review_journal_malformed');
    }
    ids.add(attempt.attempt_id);
    if (attempt.contract_version !== 2 || attempt.plan_hash !== journal.plan_hash
      || !HEX64_RE.test(String(attempt.transaction_key || '')) || txs.has(attempt.transaction_key)
      || !HEX64_RE.test(String(attempt.candidate_digest || ''))
      || !HEX64_RE.test(String(attempt.candidate_residue_digest || ''))
      || !isCanonicalBlobMap(attempt.candidate_declared)
      || !HEX64_RE.test(String(attempt.epoch_lineage_id || ''))
      || !HEX64_RE.test(String(attempt.scope_lineage_id || ''))) {
      return refuseJournal('review_journal_identity_mismatch');
    }
    txs.add(attempt.transaction_key);
    if (!Number.isInteger(attempt.ordinal) || attempt.ordinal < 1
      || !['investigation', 'change_gate'].includes(attempt.gate_mode)
      || !['discovery', 'closure'].includes(attempt.review_phase)
      || !['close-node', 'close-and-open-next'].includes(attempt.settlement_command)
      || typeof attempt.lifecycle_settled !== 'boolean') {
      return refuseJournal('review_journal_malformed', 'attempt scalar fields invalid');
    }
    const gate = attempt.logical_gate;
    if (!isPlainObject(gate) || !HEX64_RE.test(String(gate.key || ''))
      || !['sequence', 'group'].includes(gate.kind) || !Array.isArray(gate.members)
      || !REVIEW_AGGREGATIONS.includes(gate.aggregation)
      || !HEX64_RE.test(String(gate.claim_digest || '')) || !Array.isArray(gate.surface_digests)
      || gate.surface_digests.some(value => !HEX64_RE.test(String(value || '')))
      || !Array.isArray(gate.certified_producers)
      || JSON.stringify(gate.members) !== JSON.stringify(Array.from(new Set(gate.members.map(String))).sort())) {
      return refuseJournal('review_journal_identity_mismatch');
    }
    const gateIdentity = { kind: gate.kind, members: gate.members, claim_digest: gate.claim_digest,
      surface_digests: gate.surface_digests, aggregation: gate.aggregation,
      certified_producers: gate.certified_producers };
    if (sha256Hex(canonicalJson(gateIdentity)) !== gate.key) {
      return refuseJournal('review_journal_identity_mismatch');
    }
    if (!Array.isArray(attempt.context_hashes)) {
      return refuseJournal('review_journal_malformed', 'context_hashes must be an array');
    }
    const expectedTransaction = sha256Hex(canonicalJson({
      plan_hash: journal.plan_hash, logical_gate_key: gate.key,
      candidate_digest: attempt.candidate_digest,
      context_hash: attempt.context_hashes.length === 1 ? attempt.context_hashes[0] : null,
    }));
    if (expectedTransaction !== attempt.transaction_key) {
      return refuseJournal('review_journal_transaction_key_mismatch');
    }
    if (!ordinals.has(scopeKey(attempt))) ordinals.set(scopeKey(attempt), []);
    ordinals.get(scopeKey(attempt)).push(attempt.ordinal);
    if (!Array.isArray(attempt.context_hashes) || !Array.isArray(attempt.profile_hashes)
      || attempt.context_hashes.some(value => !HEX64_RE.test(String(value)))
      || attempt.profile_hashes.some(value => !HEX64_RE.test(String(value)))
      || !Array.isArray(attempt.prior_open_uids) || !Array.isArray(attempt.current_open_uids)
      || !Array.isArray(attempt.current_findings) || !Array.isArray(attempt.findings)
      || !Array.isArray(attempt.resolutions) || !Array.isArray(attempt.route_candidates)
      || !Array.isArray(attempt.validation_obligations) || !Array.isArray(attempt.validation_vectors)
      || !Array.isArray(attempt.receipts) || !Array.isArray(attempt.rebind)
      || !isPlainObject(attempt.reducer) || !isPlainObject(attempt.producer_bindings)
      || !isPlainObject(attempt.repair)) {
      return refuseJournal('review_journal_malformed', 'attempt collection fields invalid');
    }
    if (attempt.context_hashes.length !== 1
      || JSON.stringify(attempt.context_hashes) !== JSON.stringify([...new Set(attempt.context_hashes)].sort())
      || JSON.stringify(attempt.profile_hashes) !== JSON.stringify([...new Set(attempt.profile_hashes)].sort())
      || JSON.stringify(attempt.prior_open_uids) !== JSON.stringify([...new Set(attempt.prior_open_uids)].sort())
      || JSON.stringify(attempt.current_open_uids) !== JSON.stringify([...new Set(attempt.current_open_uids)].sort())
      || [...attempt.prior_open_uids, ...attempt.current_open_uids].some(value => !HEX64_RE.test(String(value || '')))
      || canonicalJson(attempt.current_findings) !== canonicalJson(attempt.findings)) {
      return refuseJournal('review_journal_malformed', 'attempt canonical collections invalid');
    }
    const receiptIds = new Set();
    for (const receipt of attempt.receipts) {
      if (!isPlainObject(receipt) || receipt.schema_version !== 2 || receipt.contract_version !== 2
        || receipt.execution_status !== 'complete' || !gate.members.includes(receipt.node_id)
        || receiptIds.has(receipt.node_id) || !HEX64_RE.test(String(receipt.review_context_hash || ''))
        || !HEX64_RE.test(String(receipt.behavior_contract_hash || ''))
        || !HEX64_RE.test(String(receipt.resolved_profile_hash || ''))
        || receipt.candidate_digest !== attempt.candidate_digest
        || !HEX64_RE.test(String(receipt.raw_evidence_sha256 || ''))
        || !Array.isArray(receipt.findings) || !Array.isArray(receipt.resolutions)
        || !Array.isArray(receipt.validation_vectors)
        || receipt.gate_effect !== deriveGateEffect(attempt.reducer.role, attempt.gate_mode,
          receipt.domain_outcome, receipt.blocking_findings)) {
        return refuseJournal('review_journal_receipt_binding_mismatch');
      }
      receiptIds.add(receipt.node_id);
    }
    if (receiptIds.size !== gate.members.length || gate.members.some(member => !receiptIds.has(member))) {
      return refuseJournal('review_journal_receipt_binding_mismatch');
    }
    const expectedContextHashes = [...new Set(attempt.receipts.map(receipt => receipt.review_context_hash))].sort();
    const expectedProfileHashes = [...new Set(attempt.receipts.map(receipt => receipt.resolved_profile_hash))].sort();
    const expectedSurfaceDigests = gate.members.map(member => {
      const receipt = attempt.receipts.find(row => row.node_id === member);
      return sha256Hex(String(receipt.surface || ''));
    });
    if (canonicalJson(expectedContextHashes) !== canonicalJson(attempt.context_hashes)
      || canonicalJson(expectedProfileHashes) !== canonicalJson(attempt.profile_hashes)
      || canonicalJson(expectedSurfaceDigests) !== canonicalJson(gate.surface_digests)) {
      return refuseJournal('review_journal_receipt_binding_mismatch');
    }
    const normalizedFindings = normalizeFindingSet(attempt.receipts.flatMap(receipt => receipt.findings), {
      scope_lineage_id: attempt.scope_lineage_id,
    });
    if (!normalizedFindings.ok || canonicalJson(normalizedFindings.findings) !== canonicalJson(attempt.findings)) {
      return refuseJournal(normalizedFindings.reason || 'review_journal_findings_mismatch');
    }
    const expectedRoutes = attempt.receipts.flatMap(receipt => receipt.findings.map(finding => ({
      source_node: receipt.node_id, finding_id: finding.uid,
    })));
    if (attempt.route_candidates.length !== expectedRoutes.length) {
      return refuseJournal('review_journal_route_mismatch');
    }
    const remainingRoutes = expectedRoutes.slice();
    for (const route of attempt.route_candidates) {
      const allowedRouteKeys = ['source_node', 'finding_id', 'id', 'scope', 'action', 'status',
        'severity', 'fix_role', 'ownership_candidates', 'owning_node', 'raw'];
      if (!isPlainObject(route) || Object.keys(route).some(key => !allowedRouteKeys.includes(key))
        || !gate.members.includes(route.source_node) || route.id !== route.finding_id
        || !HEX64_RE.test(String(route.finding_id || '')) || typeof route.raw !== 'string'
        || !Array.isArray(route.ownership_candidates)
        || canonicalJson(route.ownership_candidates) !== canonicalJson([...new Set(route.ownership_candidates)].sort())
        || (route.ownership_candidates.length === 1
          ? route.owning_node !== route.ownership_candidates[0] : route.owning_node !== null)) {
        return refuseJournal('review_journal_route_mismatch');
      }
      const index = remainingRoutes.findIndex(expected => expected.source_node === route.source_node
        && expected.finding_id === route.finding_id);
      if (index < 0) return refuseJournal('review_journal_route_mismatch');
      remainingRoutes.splice(index, 1);
    }
    const vectors = [];
    const vectorKeys = new Set();
    for (const vector of attempt.receipts.flatMap(receipt => receipt.validation_vectors)) {
      if (!isPlainObject(vector) || !HEX64_RE.test(String(vector.command_id || ''))
        || !HEX64_RE.test(String(vector.candidate_digest || ''))
        || vector.candidate_digest !== attempt.candidate_digest
        || !HEX64_RE.test(String(vector.vector_id || ''))
        || !['pass', 'fail', 'inconclusive'].includes(vector.outcome)
        || !HEX64_RE.test(String(vector.receipt_sha256 || ''))) {
        return refuseJournal('review_journal_validation_vector_malformed');
      }
      const key = canonicalJson(vector);
      if (!vectorKeys.has(key)) { vectorKeys.add(key); vectors.push(vector); }
    }
    vectors.sort((a, b) => (a.command_id + ':' + a.vector_id).localeCompare(b.command_id + ':' + b.vector_id));
    if (canonicalJson(vectors) !== canonicalJson(attempt.validation_vectors)) {
      return refuseJournal('review_journal_validation_vector_mismatch');
    }
    for (const obligation of attempt.validation_obligations) {
      if (!isPlainObject(obligation) || Object.keys(obligation).sort().join(',') !== 'command_id,required_pass_vector_id'
        || !HEX64_RE.test(String(obligation.command_id || ''))
        || !HEX64_RE.test(String(obligation.required_pass_vector_id || ''))) {
        return refuseJournal('review_journal_validation_obligation_malformed');
      }
    }
    const expectedSurfaces = gate.members.map(member => {
      const receipt = attempt.receipts.find(row => row.node_id === member);
      return receipt ? receipt.surface : '';
    });
    const reduced = reduceReviewReceipts({ aggregation: gate.aggregation, role: attempt.reducer.role,
      gate_mode: attempt.gate_mode, expected_members: gate.members,
      expected_surfaces: expectedSurfaces, receipts: attempt.receipts });
    if (!reduced.complete || attempt.reducer.complete !== true
      || attempt.reducer.domain_outcome !== reduced.domain_outcome
      || attempt.reducer.gate_effect !== reduced.gate_effect
      || attempt.reducer.blocking_findings !== reduced.blocking_findings) {
      return refuseJournal('review_journal_outcome_mismatch');
    }
    const lineage = lineageByScope.get(scopeKey(attempt)) || [];
    if (attempt.ordinal !== lineage.length + 1
      || attempt.review_phase !== (lineage.length ? 'closure' : 'discovery')) {
      return refuseJournal('review_journal_phase_mismatch');
    }
    const previous = lineage.length ? lineage[lineage.length - 1] : null;
    let expectedProgress;
    if (!previous) {
      if (attempt.repair_delta !== null || attempt.prior_open_uids.length !== 0
        || attempt.resolutions.length !== 0) {
        return refuseJournal('review_journal_phase_mismatch');
      }
      expectedProgress = { progress: null, reason: null, stop_reason: null, replan_required: false,
        consecutive_nonprogress: 0, idempotency_key: null,
        previous_open_uids: [], current_open_uids: attempt.findings
          .filter(finding => finding.status !== 'resolved').map(finding => finding.uid).sort() };
    } else {
      if (attempt.scope_lineage_id !== previous.scope_lineage_id
        || attempt.epoch_lineage_id !== previous.epoch_lineage_id
        || canonicalJson(attempt.validation_obligations) !== canonicalJson(previous.validation_obligations)) {
        return refuseJournal('review_journal_lineage_mismatch');
      }
      const delta = deriveRepairDelta({ previous_attempt: previous,
        current_candidate: { digest: attempt.candidate_digest, declared: attempt.candidate_declared,
          residue_digest: attempt.candidate_residue_digest } });
      if (!delta.ok || canonicalJson(delta.repair_delta) !== canonicalJson(attempt.repair_delta)) {
        return refuseJournal('review_journal_repair_delta_mismatch');
      }
      const expectedPriorFindings = previous.current_findings
        .filter(finding => finding.status !== 'resolved');
      const closure = assessFindingClosure({ prior_findings: expectedPriorFindings,
        current_findings: attempt.findings, repair_delta: attempt.repair_delta,
        candidate_digest: attempt.candidate_digest });
      if (!closure.ok) return refuseJournal(closure.reason, (closure.missing_uids || []).join(','));
      const authoritativeArtifacts = authoritativeResolutionArtifacts(attempt.validation_vectors, attempt.candidate_digest);
      const normalizedResolutions = normalizeResolutionSet(attempt.receipts.flatMap(receipt => receipt.resolutions), {
        repair_attempt_id: attempt.repair_delta.repair_attempt_id,
        candidate_digest: attempt.candidate_digest,
        known_validation_vector_digests: authoritativeArtifacts.validation_vector_digests,
        known_evidence_digests: authoritativeArtifacts.evidence_digests,
      });
      if (!normalizedResolutions.ok
        || canonicalJson(normalizedResolutions.resolutions) !== canonicalJson(attempt.resolutions)) {
        return refuseJournal(normalizedResolutions.reason || 'review_journal_resolution_mismatch');
      }
      const previousOpen = expectedPriorFindings.map(finding => finding.uid).sort();
      const currentOpen = attempt.findings.filter(finding => finding.status !== 'resolved')
        .map(finding => finding.uid).sort();
      if (canonicalJson(previousOpen) !== canonicalJson(attempt.prior_open_uids)
        || canonicalJson(currentOpen) !== canonicalJson(attempt.current_open_uids)) {
        return refuseJournal('review_journal_frontier_mismatch');
      }
      const validation = compareValidationObligations(attempt.validation_obligations, attempt.validation_vectors,
        attempt.candidate_digest);
      expectedProgress = assessReviewProgress({ previous_open_uids: previousOpen,
        current_open_uids: currentOpen, repair_delta_uids: closure.repair_delta_uids,
        resolutions: attempt.resolutions, repair_attempt_id: attempt.repair_delta.repair_attempt_id,
        candidate_digest: attempt.candidate_digest, validation,
        known_validation_vector_digests: authoritativeArtifacts.validation_vector_digests,
        known_evidence_digests: authoritativeArtifacts.evidence_digests,
        logical_gate_key: gate.key, scope_lineage_id: attempt.scope_lineage_id,
        before_candidate_digest: attempt.repair_delta.before_candidate_digest,
        seen_idempotency_keys: lineage.map(row => row.progress && row.progress.idempotency_key).filter(Boolean),
        previous_consecutive_nonprogress: previous.progress
          && Number.isInteger(previous.progress.consecutive_nonprogress)
          ? previous.progress.consecutive_nonprogress : 0,
        consumed_repairs: lineage.filter(row => row.outcome === 'fail' && row.repair
          && row.repair.settled === true && row.consumed_by != null).length });
    }
    if (!isPlainObject(attempt.progress) || canonicalJson(attempt.progress) !== canonicalJson(expectedProgress)) {
      return refuseJournal('review_journal_progress_mismatch');
    }
    const reducerPass = reduced.gate_effect === 'pass' || reduced.gate_effect === 'none';
    const progressPass = attempt.review_phase === 'discovery' || attempt.progress.progress === true;
    const expectedOutcome = reducerPass && progressPass ? 'pass' : 'fail';
    const expectedReason = expectedOutcome === 'pass' ? null
      : (attempt.review_phase === 'closure' && !attempt.progress.progress
        ? attempt.progress.reason : 'review_gate_failed');
    if (attempt.outcome !== expectedOutcome || attempt.reason !== expectedReason) {
      return refuseJournal('review_journal_outcome_mismatch');
    }
    lineage.push(attempt);
    lineageByScope.set(scopeKey(attempt), lineage);
    for (const identity of Object.values(attempt.producer_bindings)) {
      if (!isWriterIdentityTuple(identity)) return refuseJournal('review_journal_writer_identity_malformed');
    }
    const selectedWriter = attempt.repair.selected_writer;
    if (Object.keys(attempt.repair).sort().join(',') !== 'selected_writer,settled'
      || !(selectedWriter === null || (typeof selectedWriter === 'string' && selectedWriter))
      || !(attempt.repair.settled === null || typeof attempt.repair.settled === 'boolean')
      || !(attempt.consumed_by === null || (typeof attempt.consumed_by === 'string' && attempt.consumed_by))
      || (selectedWriter !== null && !attempt.producer_bindings[selectedWriter])
      || (attempt.consumed_by !== null && attempt.consumed_by !== selectedWriter)
      || (attempt.consumed_by !== null && attempt.repair.settled !== true)
      || (attempt.outcome === 'pass' && (selectedWriter !== null || attempt.consumed_by !== null || attempt.rebind.length))) {
      return refuseJournal('review_journal_repair_state_malformed');
    }
    let expectedBase = selectedWriter && attempt.producer_bindings[selectedWriter]
      ? attempt.producer_bindings[selectedWriter].baseline : null;
    let expectedGeneration = 1;
    for (const record of attempt.rebind) {
      if (!isPlainObject(record) || !Number.isInteger(record.generation) || record.generation < 1
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(record.base_before || ''))
        || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(record.base_after || ''))
        || !HEX64_RE.test(String(record.candidate_digest || ''))
        || !isCanonicalBlobMap(record.candidate_declared)
        || !isPlainObject(record.producer_bindings)
        || !Object.values(record.producer_bindings).every(isWriterIdentityTuple)
        || !Array.isArray(record.absorbed) || !Array.isArray(record.attributed_to)
        || typeof record.settled !== 'boolean' || typeof record.aborted !== 'boolean'
        || (record.aborted && record.settled)) {
        return refuseJournal('review_journal_rebind_malformed');
      }
      if (!record.aborted) {
        const overlay = selectedWriter && record.producer_bindings[selectedWriter];
        if (!selectedWriter || record.generation !== expectedGeneration
          || record.base_before !== expectedBase || !overlay
          || overlay.baseline !== record.base_after) {
          return refuseJournal('review_journal_rebind_chain_invalid');
        }
        expectedBase = record.base_after;
        expectedGeneration += 1;
      }
    }
  }
  for (const values of ordinals.values()) {
    values.sort((a, b) => a - b);
    if (values.some((value, index) => value !== index + 1)) return refuseJournal('review_journal_duplicate_ordinal');
  }
  return { ok: true };
}

function validateReviewJournal(journal, expectedPlanHash, expectedSchemaVersion) {
  const refuseJournal = (reason, detail) => ({ ok: false, reason, detail: detail || null });
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    return refuseJournal('review_journal_malformed', 'journal must be an object');
  }
  if (expectedSchemaVersion && journal.schema_version !== expectedSchemaVersion) {
    return refuseJournal('review_journal_version_mismatch', 'journal schema does not match verified plan contract');
  }
  if (journal.schema_version === REVIEW_JOURNAL_SCHEMA_VERSION) {
    return validateReviewJournalV2(journal, expectedPlanHash);
  }
  if (journal.schema_version !== 1) {
    return refuseJournal('review_journal_version_unsupported', 'schema_version must equal 1');
  }
  if (typeof journal.plan_hash !== 'string' || !/^[0-9a-f]{64}$/i.test(journal.plan_hash)) {
    return refuseJournal('review_journal_malformed', 'plan_hash must be 64 hexadecimal characters');
  }
  if (expectedPlanHash && journal.plan_hash.toLowerCase() !== String(expectedPlanHash).toLowerCase()) {
    return refuseJournal('review_journal_plan_hash_mismatch');
  }
  if (!Array.isArray(journal.attempts)) {
    return refuseJournal('review_journal_malformed', 'attempts must be an array');
  }
  const ids = new Set();
  const txKeys = new Set();
  const ordinalKeys = new Set();
  for (const attempt of journal.attempts) {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
      return refuseJournal('review_journal_malformed', 'attempt must be an object');
    }
    const requiredAttemptFields = ['attempt_id', 'ordinal', 'plan_hash', 'logical_gate', 'transaction_key',
      'candidate_digest', 'candidate_declared', 'candidate_residue_digest', 'generations',
      'settlement_command', 'outcome', 'reason', 'receipts', 'findings',
      'route_candidates', 'lifecycle_settled', 'repair', 'rebind', 'consumed_by'];
    const missingAttemptFields = requiredAttemptFields.filter(k => !Object.prototype.hasOwnProperty.call(attempt, k));
    if (missingAttemptFields.length) return refuseJournal('review_journal_malformed', 'missing attempt fields: ' + missingAttemptFields.join(', '));
    if (typeof attempt.attempt_id !== 'string' || !attempt.attempt_id) return refuseJournal('review_journal_malformed', 'attempt_id is required');
    if (ids.has(attempt.attempt_id)) return refuseJournal('review_journal_duplicate_attempt_id');
    ids.add(attempt.attempt_id);
    if (typeof attempt.plan_hash !== 'string' || String(attempt.plan_hash).toLowerCase() !== journal.plan_hash.toLowerCase()) {
      return refuseJournal('review_journal_plan_hash_mismatch');
    }
    if (typeof attempt.transaction_key !== 'string' || !/^[0-9a-f]{64}$/i.test(attempt.transaction_key)
      || typeof attempt.candidate_digest !== 'string' || !/^[0-9a-f]{64}$/i.test(attempt.candidate_digest)
      || typeof attempt.candidate_residue_digest !== 'string' || !/^[0-9a-f]{64}$/i.test(attempt.candidate_residue_digest)) {
      return refuseJournal('review_journal_malformed', 'transaction_key/candidate_digest/candidate_residue_digest must be 64 hexadecimal characters');
    }
    // The candidate's DECLARED-PATH entry map: every path of the candidate tree that lies in the union of
    // every plan node's declared write set. Canonical form (sorted keys, '<mode> <sha>' values) so a
    // byte-comparison against a freshly computed map is meaningful. Bounded by the plan, never the repo.
    if (!isCanonicalBlobMap(attempt.candidate_declared)) {
      return refuseJournal('review_journal_malformed', 'candidate_declared must be a canonical {path: "<mode> <sha>"} map with sorted keys');
    }
    if (txKeys.has(attempt.transaction_key)) return refuseJournal('review_journal_duplicate_transaction_key');
    txKeys.add(attempt.transaction_key);
    if (!attempt.logical_gate || typeof attempt.logical_gate !== 'object') return refuseJournal('review_journal_malformed', 'logical_gate required');
    const canonical = canonicalLogicalGateIdentity(attempt.logical_gate);
    if (attempt.logical_gate.key !== canonical.key || attempt.logical_gate.kind !== canonical.kind
      || JSON.stringify(attempt.logical_gate.origin) !== JSON.stringify(canonical.origin)
      || JSON.stringify(attempt.logical_gate.members) !== JSON.stringify(canonical.members)) {
      return refuseJournal('review_journal_identity_mismatch');
    }
    if (!Number.isInteger(attempt.ordinal) || attempt.ordinal < 1) return refuseJournal('review_journal_malformed', 'ordinal must be a positive integer');
    const ordinalKey = canonical.key + '\n' + attempt.ordinal;
    if (ordinalKeys.has(ordinalKey)) return refuseJournal('review_journal_duplicate_ordinal');
    ordinalKeys.add(ordinalKey);
    if (!Array.isArray(attempt.generations) || attempt.generations.length !== canonical.members.length) {
      return refuseJournal('review_journal_malformed', 'generations must cover every logical-gate member');
    }
    const generations = attempt.generations.map(g => ({ member: String(g && g.member), nonce: String(g && g.nonce) }))
      .sort((a, b) => a.member.localeCompare(b.member));
    if (generations.some(g => !g.member || !g.nonce)
      || JSON.stringify(generations.map(g => g.member)) !== JSON.stringify(canonical.members)) {
      return refuseJournal('review_journal_identity_mismatch');
    }
    const crypto = require('crypto');
    const expectedTx = crypto.createHash('sha256').update(JSON.stringify({
      plan_hash: journal.plan_hash, logical_gate_key: canonical.key,
      candidate_digest: attempt.candidate_digest, generations,
    })).digest('hex');
    if (expectedTx !== attempt.transaction_key) return refuseJournal('review_journal_transaction_key_mismatch');
    if (!['close-node', 'close-and-open-next'].includes(attempt.settlement_command)
      || ![null, 'pass', 'fail'].includes(attempt.outcome)
      || !(attempt.reason === null || typeof attempt.reason === 'string')
      || typeof attempt.lifecycle_settled !== 'boolean'
      || !Array.isArray(attempt.receipts) || !Array.isArray(attempt.findings) || !Array.isArray(attempt.route_candidates)
      || !attempt.repair || typeof attempt.repair !== 'object') {
      return refuseJournal('review_journal_malformed', 'attempt field types invalid');
    }
    const receiptMembers = new Set();
    const generationByMember = new Map(generations.map(g => [g.member, g.nonce]));
    for (const receipt of attempt.receipts) {
      if (!receipt || typeof receipt.node_id !== 'string' || receiptMembers.has(receipt.node_id)
        || !canonical.members.includes(receipt.node_id) || typeof receipt.generation !== 'string'
        || receipt.generation !== generationByMember.get(receipt.node_id) || typeof receipt.body !== 'string'
        || typeof receipt.receipt_sha256 !== 'string' || typeof receipt.effective_pass !== 'boolean'
        || ![null, 'pass', 'fail'].includes(receipt.verdict)
        || !Number.isInteger(receipt.findings_blocking) || receipt.findings_blocking < 0) {
        return refuseJournal('review_journal_identity_mismatch');
      }
      receiptMembers.add(receipt.node_id);
      const expectedReceipt = crypto.createHash('sha256').update(receipt.body).digest('hex');
      if (receipt.receipt_sha256 !== expectedReceipt) return refuseJournal('review_journal_receipt_hash_mismatch');
      const bindingLines = Array.from(receipt.body.matchAll(/^evidence-binding:[^\n]*$/gm));
      const exactBinding = /^evidence-binding:[ \t]+([^ \t\n]+)[ \t]+([^ \t\n]+)[ \t]*$/.exec(
        bindingLines.length === 1 ? bindingLines[0][0] : '');
      if (!exactBinding || exactBinding[1] !== receipt.node_id
        || exactBinding[2] !== receipt.generation) {
        return refuseJournal('review_journal_receipt_binding_mismatch');
      }
      const evaluated = evaluateEffectiveVerdict(receipt.body);
      if (receipt.effective_pass !== evaluated.pass || receipt.verdict !== evaluated.verdict
        || receipt.findings_blocking !== evaluated.findings_blocking) {
        return refuseJournal('review_journal_receipt_verdict_mismatch');
      }
    }
    if ((canonical.kind === 'sequence' && attempt.receipts.length !== 1)
      || attempt.receipts.length < 1 || attempt.receipts.length > canonical.members.length) {
      return refuseJournal('review_journal_malformed', 'receipt cardinality invalid');
    }
    if (canonical.kind === 'sequence') {
      const exact = evaluateEffectiveVerdict(attempt.receipts[0].body);
      const expectedOutcome = exact.pass ? 'pass' : 'fail';
      if (attempt.outcome !== expectedOutcome || attempt.reason !== exact.reason) {
        return refuseJournal('review_journal_outcome_mismatch');
      }
    } else if (attempt.outcome !== null) {
      if (attempt.receipts.length !== canonical.members.length) {
        return refuseJournal('review_journal_fanout_quorum_mismatch');
      }
      const passCount = attempt.receipts.filter(receipt => evaluateEffectiveVerdict(receipt.body).pass).length;
      const expectedOutcome = passCount > canonical.members.length / 2 ? 'pass' : 'fail';
      const expectedReason = expectedOutcome === 'pass' ? null : 'fanout_refuted';
      if (attempt.outcome !== expectedOutcome || attempt.reason !== expectedReason) {
        return refuseJournal('review_journal_outcome_mismatch');
      }
    }
    const canonicalize = value => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (!value || typeof value !== 'object') return value;
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
      return out;
    };
    const sortedRows = rows => rows.map(canonicalize)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const expectedFindings = [];
    for (const receipt of attempt.receipts) {
      for (const finding of parseNodeFindings(receipt.body).filter(f => f && f.id)) {
        expectedFindings.push({ source_node: receipt.node_id, ...finding });
      }
    }
    if (JSON.stringify(sortedRows(attempt.findings)) !== JSON.stringify(sortedRows(expectedFindings))) {
      return refuseJournal('review_journal_findings_mismatch');
    }
    if (attempt.route_candidates.length !== expectedFindings.length) {
      return refuseJournal('review_journal_route_mismatch', 'route cardinality must match canonical findings');
    }
    const remainingFindings = expectedFindings.slice();
    const routeKeys = new Set(['source_node', 'finding_id', 'id', 'scope', 'action', 'status',
      'severity', 'file', 'ownership_candidates', 'owning_node', 'fix_role', 'raw']);
    for (const route of attempt.route_candidates) {
      if (!route || typeof route !== 'object' || Array.isArray(route)
        || Object.keys(route).some(key => !routeKeys.has(key))
        || typeof route.source_node !== 'string' || typeof route.finding_id !== 'string'
        || route.id !== route.finding_id || typeof route.raw !== 'string'
        || !Array.isArray(route.ownership_candidates)
        || route.ownership_candidates.some(id => typeof id !== 'string' || !id)) {
        return refuseJournal('review_journal_route_mismatch');
      }
      const candidates = route.ownership_candidates;
      const sortedUnique = Array.from(new Set(candidates)).sort();
      if (JSON.stringify(candidates) !== JSON.stringify(sortedUnique)
        || (candidates.length === 1 ? route.owning_node !== candidates[0] : route.owning_node !== null)) {
        return refuseJournal('review_journal_route_mismatch');
      }
      const findingIndex = remainingFindings.findIndex(f => f.source_node === route.source_node
        && f.id === route.finding_id && f.raw === route.raw);
      if (findingIndex < 0) return refuseJournal('review_journal_route_mismatch');
      const finding = remainingFindings.splice(findingIndex, 1)[0];
      for (const key of ['scope', 'action', 'status', 'severity', 'file', 'fix_role']) {
        const findingHas = Object.prototype.hasOwnProperty.call(finding, key);
        const routeHas = Object.prototype.hasOwnProperty.call(route, key);
        if (findingHas !== routeHas || (findingHas && route[key] !== finding[key])) {
          return refuseJournal('review_journal_route_mismatch');
        }
      }
    }
    if (remainingFindings.length) return refuseJournal('review_journal_route_mismatch');
    if (Object.prototype.hasOwnProperty.call(attempt, 'producer_bindings')) {
      if (!attempt.producer_bindings || typeof attempt.producer_bindings !== 'object'
        || Array.isArray(attempt.producer_bindings)) {
        return refuseJournal('review_journal_malformed', 'producer_bindings must be an object');
      }
      for (const [producer, identity] of Object.entries(attempt.producer_bindings)) {
        if (!producer || !isWriterIdentityTuple(identity)) {
          return refuseJournal('review_journal_writer_identity_malformed');
        }
      }
    }
    // The append-only REBIND ledger. Each record moves the selected writer's barrier baseline from
    // `base_before` to a synthetic `base_after` that keeps the writer's declared paths byte-identical to
    // the old baseline (so its reviewed diff is unchanged) while absorbing a proven-attributed sibling
    // delta. History is never rewritten: the attempt's own candidate_digest / candidate_declared /
    // transaction_key / producer_bindings stay immutable, and the records chain base-to-base so a forged
    // or reordered ledger cannot smuggle in an unproven baseline.
    if (!Array.isArray(attempt.rebind)) {
      return refuseJournal('review_journal_rebind_malformed', 'rebind must be an array');
    }
    if (attempt.rebind.length > REVIEW_REBIND_LIMIT) {
      return refuseJournal('review_journal_rebind_malformed', 'rebind ledger exceeds REVIEW_REBIND_LIMIT');
    }
    for (const record of attempt.rebind) {
      if (!record || typeof record !== 'object' || Array.isArray(record)
        || !Number.isInteger(record.generation) || record.generation < 1
        || typeof record.base_before !== 'string' || !/^[0-9a-f]{40}$/i.test(record.base_before)
        || typeof record.base_after !== 'string' || !/^[0-9a-f]{40}$/i.test(record.base_after)
        || typeof record.candidate_digest !== 'string' || !/^[0-9a-f]{64}$/i.test(record.candidate_digest)
        || !isCanonicalBlobMap(record.candidate_declared)
        || !record.producer_bindings || typeof record.producer_bindings !== 'object' || Array.isArray(record.producer_bindings)
        || !Object.entries(record.producer_bindings).every(([p, id]) => p && isWriterIdentityTuple(id))
        || !Array.isArray(record.absorbed)
        || !record.absorbed.every(a => a && typeof a === 'object' && !Array.isArray(a)
          && typeof a.path === 'string' && a.path
          && (a.from_blob === null || (typeof a.from_blob === 'string' && CANONICAL_TREE_ENTRY_RE.test(a.from_blob)))
          && (a.to_blob === null || (typeof a.to_blob === 'string' && CANONICAL_TREE_ENTRY_RE.test(a.to_blob)))
          && typeof a.owner === 'string' && a.owner)
        || JSON.stringify(record.absorbed.map(a => a.path)) !== JSON.stringify(record.absorbed.map(a => a.path).slice().sort())
        || !Array.isArray(record.attributed_to)
        || !record.attributed_to.every(id => typeof id === 'string' && id)
        || JSON.stringify(record.attributed_to) !== JSON.stringify(record.attributed_to.slice().sort())
        || typeof record.settled !== 'boolean' || typeof record.aborted !== 'boolean'
        || (record.aborted === true && record.settled === true)) {
        return refuseJournal('review_journal_rebind_malformed', 'rebind record shape invalid');
      }
    }
    if (attempt.rebind.length) {
      const selectedForRebind = attempt.repair && attempt.repair.selected_writer;
      if (!Object.prototype.hasOwnProperty.call(attempt, 'producer_bindings') || !selectedForRebind) {
        return refuseJournal('review_journal_rebind_chain_invalid', 'a rebind requires producer_bindings and a selected repair writer');
      }
      if (attempt.outcome === 'pass') {
        return refuseJournal('review_journal_rebind_chain_invalid', 'a passing attempt can never carry a rebind');
      }
      const chain = nonAbortedRebinds(attempt);
      if (chain.some((r, i) => r.generation !== i + 1)) {
        return refuseJournal('review_journal_rebind_chain_invalid', 'non-aborted rebind generations must be dense 1..N in order');
      }
      const origin = attempt.producer_bindings[selectedForRebind];
      if (!origin) {
        return refuseJournal('review_journal_rebind_chain_invalid', 'the selected repair writer has no producer binding to rebind');
      }
      let expectedBase = origin.baseline;
      for (const record of chain) {
        if (record.base_before !== expectedBase) {
          return refuseJournal('review_journal_rebind_chain_invalid', 'rebind base_before must continue the recorded chain');
        }
        const overlay = record.producer_bindings[selectedForRebind];
        if (!overlay || overlay.baseline !== record.base_after) {
          return refuseJournal('review_journal_rebind_chain_invalid', 'rebind overlay must bind the selected writer to base_after');
        }
        expectedBase = record.base_after;
      }
      // An aborted record is inert (its ref write never happened), so it must be anchored at the base
      // that was effective where it sits — it can never claim to have moved the chain forward.
      let effectiveAt = origin.baseline;
      for (const record of attempt.rebind) {
        if (record.aborted === true) {
          if (record.base_before !== effectiveAt) {
            return refuseJournal('review_journal_rebind_chain_invalid', 'an aborted rebind must be anchored at the effective base');
          }
        } else {
          effectiveAt = record.base_after;
        }
      }
    }
    if ((attempt.outcome === null && (canonical.kind !== 'fanout' || attempt.lifecycle_settled || attempt.reason !== null))
      || (attempt.outcome === 'pass' && attempt.reason !== null)
      || (attempt.outcome === 'fail' && typeof attempt.reason !== 'string')
      || (attempt.lifecycle_settled && attempt.outcome === null)) {
      return refuseJournal('review_journal_illegal_transition');
    }
    const selected = attempt.repair.selected_writer;
    const repairSettled = attempt.repair.settled;
    if (!(selected === null || (typeof selected === 'string' && selected !== '')) || ![null, false, true].includes(repairSettled)
      || (repairSettled !== null && selected === null)
      || (attempt.consumed_by !== null && (typeof attempt.consumed_by !== 'string' || attempt.consumed_by === ''))
      || (attempt.consumed_by !== null && (attempt.outcome !== 'fail' || repairSettled !== true || selected !== attempt.consumed_by))
      || (attempt.outcome === 'pass' && (selected !== null || repairSettled !== null || attempt.consumed_by !== null))) {
      return refuseJournal('review_journal_illegal_transition');
    }
  }
  return { ok: true, journal };
}

// The Codex join protocol's typed DELEGATION OUTCOME — an OPTIONAL column-0 `delegation_outcome: <token>`
// line a node's evidence may carry to record how its delegation resolved, replacing a free-text "it stalled
// so I did it myself". Closed vocabulary; ABSENT ⇒ `completed` (back-compat: existing evidence has no such
// line and must not red). Same PURE regex discipline as parseNodeVerdict/parseNodeFindings (native multiline,
// no classifier — cross-edition byte-identity; FENCE-BLIND BY ANCHOR at column 0; last-match-wins; value
// lowercased). Returns { found, outcome, valid } — `outcome` is the parsed token or the `completed` default;
// `valid` is true when absent OR the present token is in the vocabulary (a caller enforces on false).
const DELEGATION_OUTCOME_DEFAULT = 'completed';
const DELEGATION_OUTCOME_VOCABULARY = Object.freeze(['completed', 'returned_partial', 'interrupted_unresponsive', 'interrupted_obsolete']);
function parseDelegationOutcome(cacheText) {
  const text = String(cacheText || '');
  const re = /^delegation_outcome:[ \t]*([A-Za-z_]+)[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(text)) !== null) { last = m[1].toLowerCase(); }
  const found = last !== null;
  return {
    found,
    outcome: found ? last : DELEGATION_OUTCOME_DEFAULT,
    valid: !found || DELEGATION_OUTCOME_VOCABULARY.includes(last),
  };
}

// #440: classification table for write_set_overflow SUBTYPES — narrowed structural families that
// `barrierCheck` in plan-validator.js can use to give plan-run a more actionable refusal reason.
// Three subtypes, each carrying:
//   key      — the machine-readable subtype token (matches the property name)
//   patterns — an array of RegExp (literal file-path pattern matching, forge-neutral)
//
// lockfile_write: a write to a dependency-lock or tool-lock file. These files are auto-generated by
//   package managers and must never be in a node's declared write set — their presence signals a
//   package-manager side-effect leaking out of the expected scope.
// mirror_write:   a write to a byte-identical mirror copy of another declared file.  The canonical
//   example is the ×4 adaptive-schema.js group — a plan that lists only ONE copy has an apparent
//   overflow when the sync check propagates it. Detecting this structurally lets plan-run surface an
//   actionable "sync the other copies" prompt instead of a generic overflow refusal.
// count_bump:     a write to a count-assertion surface (validate-*-contracts.js,
//   test-*-workflow-scripts.js). These files contain hard-coded role/script counts that must advance
//   in lockstep with the feature being added; a count_bump write not declared in the plan is a
//   strong signal that the count-advancing step was omitted from the write set.
//
// PURE data: no forge CLI references, no file I/O — qualifies for the ×4 byte-identical group.
const WRITE_SET_OVERFLOW_SUBTYPES = Object.freeze({
  lockfile_write: Object.freeze({
    key: 'lockfile_write',
    patterns: Object.freeze([
      /(?:^|\/)package-lock\.json$/,
      /(?:^|\/)yarn\.lock$/,
      /(?:^|\/)pnpm-lock\.yaml$/,
      /(?:^|\/)Cargo\.lock$/,
      /(?:^|\/)Gemfile\.lock$/,
      /(?:^|\/)composer\.lock$/,
      /(?:^|\/)go\.sum$/,
      /(?:^|\/)\.lock$/,
      /\.lock$/,
    ]),
  }),
  mirror_write: Object.freeze({
    key: 'mirror_write',
    patterns: Object.freeze([
      /(?:^|\/)kaola-workflow-adaptive-schema\.js$/,
    ]),
  }),
  count_bump: Object.freeze({
    key: 'count_bump',
    patterns: Object.freeze([
      /(?:^|\/)validate-[^/]+-contracts\.js$/,
      /(?:^|\/)test-[^/]+-workflow-scripts\.js$/,
    ]),
  }),
});

// #238: curated, high-collision-risk ROOT (slashless) filenames — CI/CD, container, secrets,
// dependency-lock, and build manifests where two concurrent projects editing the same one clobber.
// This is a FOURTH, DISTINCT path vocabulary, kept here on purpose so it cannot drift across the four
// editions and so its meaning stays separate from its neighbours: SENSITIVE_PATTERNS = *security*
// (plan-validator), SHARED_INFRA = *shared dirs* (classifier), area logic = *top-level dir*. Membership
// here means only "collision-prone if co-edited". Slash-bearing CI paths (`.github/workflows/*`) are
// handled by the classifier's FILE_PATH_REGEX, NOT this set. Cross-project overlap on a curated root
// name is routed to ASK (yellow), never RED — the candidate side is free issue-body prose where even a
// curated name can be mentioned casually, so the safe direction is over-ask, not over-block.
const CURATED_ROOT_PATHS = Object.freeze([
  'Dockerfile', 'Containerfile', 'docker-compose.yml', 'docker-compose.yaml', '.dockerignore',
  'Makefile', 'Jenkinsfile', 'Procfile', 'Vagrantfile',
  '.env', '.env.example', '.env.local', '.npmrc', '.nvmrc', '.gitlab-ci.yml', '.travis.yml',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'requirements.txt', 'pyproject.toml',
  'Gemfile', 'Gemfile.lock', 'pom.xml', 'build.gradle', 'composer.json', 'composer.lock',
  'secrets.yaml', 'secrets.yml', 'tsconfig.json',
]);
const CURATED_ROOT_SET = new Set(CURATED_ROOT_PATHS);
// Case-insensitive lookup: lowercased name -> canonical name. On case-insensitive filesystems
// (macOS/Windows) `makefile`/`Makefile`, `dockerfile`/`Dockerfile`, `gemfile`/`Gemfile` are the SAME
// physical file (v3.21.0). Matching folds case and maps back to the canonical name so the candidate
// and claimed sides intersect (and the reasoning string reads `Makefile`, not `makefile`). On
// case-sensitive Linux this can over-ASK on a `makefile`-vs-`Makefile` pair — the safe direction, and
// a curated overlap is only a yellow caution, never a block. (No two curated names share a lowercase
// form, so the map has no key collisions.)
const CURATED_ROOT_LC = new Map(CURATED_ROOT_PATHS.map(p => [p.toLowerCase(), p]));
// Pure (no fs): tokenize free text and return the curated root filenames present (canonical-cased), by
// EXACT token membership (a curated name buried inside a larger word never matches). The tokenizer
// keeps `/`, so a slash-bearing path tokenizes WITH its slashes and therefore can never collide with a
// slashless curated name — slash paths stay the classifier's FILE_PATH_REGEX job, curated roots stay
// this one. v3.21.0: each token is canonicalized before membership so the SAME physical file compares
// equal on both the candidate and claimed sides — the tokenizer leaves sentence punctuation glued to a
// path (a leading "./", a collapsed "//", a trailing "/" or a sentence-ending "."), none of which a
// curated ROOT basename ever legitimately carries, and case is folded (see CURATED_ROOT_LC). Without
// this, prose like "edit the Dockerfile." / "./Dockerfile" / "makefile" missed exact membership — a
// fail-open, since the candidate side is the ONLY detector for slashless root files. Nested paths keep
// their inner slashes (e.g. "config/Dockerfile"), so they still never match a root basename.
function extractCuratedRootPaths(text) {
  const found = new Set();
  for (const raw of String(text || '').split(/[^A-Za-z0-9_.\/-]+/)) {
    if (!raw) continue;
    const tok = raw
      .replace(/^(?:\.\/)+/, '')   // leading ./ (repeated)
      .replace(/\/{2,}/g, '/')     // collapsed //
      .replace(/\/+$/, '')         // trailing /
      .replace(/\.+$/, '');        // trailing sentence "." (no curated name ends in a dot)
    const canon = CURATED_ROOT_LC.get(tok.toLowerCase());
    if (canon) found.add(canon);
  }
  return found;
}
// Case-insensitive membership test, so the claimed side can fold STRUCTURED declared paths directly (no
// lossy re-tokenize of a stringified write-set blob) while reusing the one curated vocabulary.
function isCuratedRoot(p) { return CURATED_ROOT_LC.has(String(p || '').toLowerCase()); }
// Canonical curated name for a path (case-folded), or null. The structured-claimed fold MUST store the
// CANONICAL name (not the raw declared token) so it intersects the canonical candidate/prose sets —
// otherwise a non-canonical-case declaration (e.g. a plan writing `dockerfile`) never matches a
// canonical candidate `Dockerfile` and the curated overlap fails open. Mirrors extractCuratedRootPaths.
function canonicalCuratedRoot(p) { return CURATED_ROOT_LC.get(String(p || '').toLowerCase()) || null; }

// The single shared global config file (one path, no per-edition namespace) + the
// list-valued opt-in field. `installed_paths` is the install-time record of which EXTRA
// paths ({fast, full}) the installer wrote; adaptive is implicit-always and NEVER appears
// in it. Default `[]` (adaptive-only) when the field is absent/malformed. NO env override —
// "installed" is an on-disk fact, not a per-run toggle (#538 retired KAOLA_ENABLE_ADAPTIVE).
const CONFIG_REL_PATH = ['.config', 'kaola-workflow', 'config.json'];
const INSTALLED_PATHS_FIELD = 'installed_paths';
const FANOUT_CAP_ENV = 'KAOLA_FANOUT_CAP';
const FANOUT_CAP_READONLY_ENV = 'KAOLA_FANOUT_CAP_READONLY';
// #364: KAOLA_BATCH_CWD_ENFORCED + resolveBatchCwdEnforced were RETIRED with the write-role
// member-worktree isolation machinery (parallel-batch.js). The harness cannot force a dispatched
// subagent's CWD, so write-role frontiers serial-degrade unconditionally. The successor enforcement
// primitive is the write-lane containment hook (#376, KAOLA_LANE_CONTAINMENT) + the per-node
// running-set scheduler (#377). See docs/decisions/0008-excise-write-role-batch-isolation.md.
// #376: the successor flag. The write-lane PreToolUse hook (hooks/kaola-workflow-write-lane.sh) DENIES
// an out-of-lane Write/Edit at write time — fail-closed default FALSE; the hook is dormant (fail-open)
// until a real .cache/running-set.json manifest of open write-nodes exists (#377). Per-edition: set
// only where the hook is registered AND a live deny-capability probe has passed (Codex deny semantics
// may differ — keep it unset there until proven).
const LANE_CONTAINMENT_ENV = 'KAOLA_LANE_CONTAINMENT';

// #542: the env name for the parallel-writes DEFAULT-ON opt-OUT. See parallelWritesDefaultOn.
const PARALLEL_WRITES_ENV = 'KAOLA_PARALLEL_WRITES';

// Resolve the installed opt-in paths from config. Adaptive is implicit-always and is NEVER in this
// array (legality short-circuits adaptive in isLegalWorkflowPath). No env override: the per-session
// KAOLA_ENABLE_ADAPTIVE switch is retired (#538) — "installed" is an install-time fact, not a per-run
// toggle. Returns a frozen, de-duplicated subset of {fast, full}; any unknown token in config is
// dropped, so a hand-edited junk value cannot make a bogus path legal.
function resolveInstalledPaths(config) {
  const raw = (config && Array.isArray(config[INSTALLED_PATHS_FIELD])) ? config[INSTALLED_PATHS_FIELD] : [];
  const optIn = WORKFLOW_PATHS.filter(p => p !== ADAPTIVE_PATH); // ['fast','full'] — the only opt-ins
  return Object.freeze(optIn.filter(p => raw.includes(p)));
}

// Resolve the fan-out cap (env override, else default), clamped to a sane minimum.
function resolveFanoutCap(env) {
  const raw = (env || {})[FANOUT_CAP_ENV];
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_FANOUT_CAP;
}

// #375 (D3): the READ-ONLY-batch fan-out cap (env override, else default 8), clamped to a
// sane minimum. Mirrors resolveFanoutCap; used only for read-only batch kinds. Write-role
// batches keep resolveFanoutCap (the conservative write-side cap).
function resolveFanoutCapReadonly(env) {
  const raw = (env || {})[FANOUT_CAP_READONLY_ENV];
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_FANOUT_CAP_READONLY;
}

// #376: resolve whether the write-lane containment hook should ENFORCE (deny out-of-lane writes).
// Fail-closed default FALSE — only an explicit 1/true/yes opts in (successor of the retired #320
// resolveBatchCwdEnforced shape). The hook is additionally dormant until a running-set.json exists.
function resolveLaneContainment(env) {
  const raw = (env || {})[LANE_CONTAINMENT_ENV];
  return raw === '1' || raw === 'true' || raw === 'yes';
}

// #542: parallel-writes-default-ON. The workflow's design principle (D-542-01): when the PLANNER
// proves a write frontier is a disjoint antichain (`parallel_safe`), the executor opens ISOLATED
// per-leg worktrees and writes them CONCURRENTLY — by DEFAULT, with no operator toggle. The per-leg
// worktree isolation (containment) + the mandatory post-dominating `synthesizer` reconcile are the
// correctness net, so the workflow must NOT downgrade a planner-proven-disjoint frontier to serial
// out of caution. This predicate drives `legCoupled` in the co-open / leg-provisioning gates.
// Default TRUE; an operator forces serial writes with KAOLA_PARALLEL_WRITES=0|false|no. Genuinely
// OVERLAPPING (non-disjoint) writes are NOT affected here — they still require an explicit
// --write-overlap-consent + a leg-scoped code-reviewer gate (the validator's relaxation path).
function parallelWritesDefaultOn(env) {
  const raw = (env || {})[PARALLEL_WRITES_ENV];
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return true;
}

// #579: parked-lane selectivity — applied ON TOP of each clean-check site's existing untracked
// posture (claim.js treeDirty, sink-merge assertCleanWorktree/assertWorktreeClean). Byte-identical
// ×4 drift anchor; pure string helpers (no I/O, no forge CLI, no sibling require).

// Repo-relative path PREFIXES for per-lane scratch spaces. A path under one of these
// prefixes is a "parked lane path" when its project segment is NOT owned by this run.
const PARKED_LANE_PREFIXES = Object.freeze(['kaola-workflow/', '.kw/worktrees/', '.kw/legs/']);

// Parse git porcelain v1 output into an array of repo-relative fwd-slash paths.
// Strips the 2-char XY status column + leading space; takes the DESTINATION for rename lines.
// Both untracked (??) and tracked (M/D/A/…) files are included — the caller applies any
// --untracked-files filtering at the git invocation level.
function parsePorcelainPaths(statusText) {
  const result = [];
  const lines = String(statusText || '').split('\n');
  for (const line of lines) {
    if (line.length < 3) continue;
    let p = line.slice(3); // drop "XY "
    // Rename: "old -> new" → take destination
    const arrowIdx = p.indexOf(' -> ');
    if (arrowIdx >= 0) p = p.slice(arrowIdx + 4);
    // Strip surrounding quotes (git uses them for special chars)
    if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
    p = p.trim();
    if (p) result.push(p);
  }
  return result;
}

// Return true iff `relPath` is a non-owned lane scratch path that the clean-check
// should IGNORE. A path is parked iff ALL three conditions hold:
//   1. It starts with one of the PARKED_LANE_PREFIXES.
//   2. Its second path segment (the project name) is NOT in ownedProjects.
//   3. The project segment is "normal" — not a dot-prefixed special dir (.roadmap),
//      not a reserved name (archive, ROADMAP.md, config.json), not empty.
// Everything else (real code, shared durable state, the run's own project folder) → false.
// Fail-closed: an unrecognized / empty project segment → false (treat as non-ignored).
function isParkedLanePath(relPath, ownedProjects) {
  const p = String(relPath || '').replace(/\\/g, '/');
  let matchedPrefix = '';
  for (const prefix of PARKED_LANE_PREFIXES) {
    if (p.startsWith(prefix)) { matchedPrefix = prefix; break; }
  }
  if (!matchedPrefix) return false;
  // Second segment = project name (e.g. "issue-99" from "kaola-workflow/issue-99/…")
  const rest = p.slice(matchedPrefix.length);
  const slashIdx = rest.indexOf('/');
  const seg = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  if (!seg) return false;
  // Reject dot-prefixed specials (.roadmap), reserved bare names (archive), and
  // files that sit DIRECTLY under the prefix with no project segment (ROADMAP.md, config.json).
  if (seg.startsWith('.')) return false;
  if (seg === 'archive') return false;
  // If the segment looks like a bare file name (no slash follows AND the prefix is kaola-workflow/),
  // it is a shared root-level file (ROADMAP.md, config.json) — stay strict.
  if (matchedPrefix === 'kaola-workflow/' && slashIdx < 0) return false;
  // Own project: NOT exempted.
  const owned = ownedProjects || [];
  if (owned.includes(seg)) return false;
  return true;
}

// #353: crash-safe durable-state write — tmp + fsync + atomic rename, so a crash mid-write can
// never leave a TORN workflow-plan.md (plan_hash mismatch → --resume-check bricks the run with no
// recovery) or workflow-state.md (a torn file is silently skipped by readActiveFolders → the
// project goes invisible). Returns false when content is unchanged (no write). Mirrors roadmap.js's
// primitive; placed here (the ×4 byte-anchor + a COMMON_SCRIPT) to avoid a new-file registration.
function writeFileAtomicReplace(filePath, content) {
  const fs = require('fs');
  const path = require('path');
  let existing = '';
  try { existing = fs.readFileSync(filePath, 'utf8'); } catch (_) {}
  if (existing === content) return false;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.' + process.pid + '.' + Date.now() + '.' + Math.random().toString(16).slice(2) + '.tmp');
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw err;
  }
  // #685 (R17): fsync the PARENT DIRECTORY after the rename settles — on POSIX filesystems a rename's
  // directory-entry update is not itself durable until the containing directory is fsynced, so without
  // this a settled write can still revert to the pre-rename entry after power loss even though the tmp
  // file's own contents were fsynced above. Node has no dedicated "fsync a directory" API, so this opens
  // the directory read-only, fsyncs that fd, and closes it. Platform fail-soft is a HARD requirement:
  // some platforms/filesystems refuse to open or fsync a directory (Windows, EISDIR/EACCES/EINVAL) —
  // degrade silently to the pre-#685 behavior rather than turning a previously-accepted write into a
  // refusal; nothing in this block may rethrow or affect the return value.
  let dirFd;
  try {
    dirFd = fs.openSync(dir, 'r');
    fs.fsyncSync(dirFd);
  } catch (_) {
    // fail-soft: directory fsync unsupported/denied here — the rename above already succeeded.
  } finally {
    if (dirFd !== undefined) { try { fs.closeSync(dirFd); } catch (_) {} }
  }
  return true;
}

// #585: scheduler mutual-exclusion lock — a project-scoped O_EXCL lockfile so two concurrent scheduler
// invocations on ONE project can never both pass into a mutating body. The pre-#585 coordination guard
// was ADVISORY-ONLY (a pure read of state files + an in-memory refusal decision, no OS-level exclusion),
// so every durable-state mutation was a lockless whole-file read-modify-write: concurrent open-ready
// double-opened a frontier and concurrent close-node clobbered a sibling's complete flip. The lock wraps
// the WHOLE guarded subcommand (incl. the layered guard prologue) at the adaptive-node CLI boundary; the
// run* bodies stay lock-free (the in-memory test harness never enters main()). Placed here beside
// writeFileAtomicReplace (the ×4 byte-anchor + a COMMON_SCRIPT) to avoid a new-file registration.
//
// Contract: one serial orchestrator is the designed model, so contention is a typed NON-blocking refuse
// (never a spin-wait / queue). A crashed holder must never permanently wedge the project — a stale lock
// (a dead same-host PID, or an old/corrupt cross-host payload) is CLASSIFIED stale:true and refused;
// recovery is ONE explicit operator removal of the lockfile (from one session only), then re-run.
// Auto-takeover is deliberately ABSENT: an unlink executes a stale decision made BEFORE the unlink, so
// two concurrent takers holding the same stale decision both acquire (each unlinks the other's fresh
// claim and re-claims) — and POSIX/Node-core has no atomic compare-and-delete to close that window.
// Fail-closed refusal is the only safe recovery; the worst case is one manual rm (cheap), never a
// double-acquire (which would silently reopen the lost-update races this lock exists to close).

// Module-level: the lock path THIS process currently holds, cleaned by a one-time process exit hook so a
// crash that skips the caller's finally still drops the lock (belt-and-suspenders around the CLI's
// try/finally). Installed lazily on first acquire so scripts that only require() the schema add no hook.
let _heldSchedulerLock = null;
let _schedulerExitHookInstalled = false;
function _installSchedulerExitHook() {
  if (_schedulerExitHookInstalled) return;
  _schedulerExitHookInstalled = true;
  process.on('exit', () => {
    if (_heldSchedulerLock) {
      try { require('fs').unlinkSync(_heldSchedulerLock); } catch (_) {}
      _heldSchedulerLock = null;
    }
  });
}

// isStaleLock(holder) — decide whether a lock's parsed payload belongs to a dead holder.
//   same-host + valid pid: probe process.kill(pid, 0) — ESRCH → dead → stale; alive / EPERM → live.
//   cross-host or missing/invalid pid: age fallback — ts older than LANE_STALENESS_MS → stale.
//   null / non-object / no usable ts → stale (a corrupt payload).
// PURE REFUSAL CLASSIFIER: its verdict only selects the typed refusal reason (a stale holder refuses
// distinctly from a live one so the operator hint can name the manual recovery). It can never affect an
// acquire OUTCOME — no acquire path unlinks or takes over another process's lock on a stale verdict.
function isStaleLock(holder) {
  const os = require('os');
  if (!holder || typeof holder !== 'object') return true;
  const sameHost = holder.host && holder.host === os.hostname();
  if (sameHost && Number.isInteger(holder.pid) && holder.pid > 0) {
    try {
      process.kill(holder.pid, 0);
      return false; // signal 0 delivered → the process is alive → live holder
    } catch (err) {
      if (err && err.code === 'ESRCH') return true;  // no such process → dead → stale
      return false; // EPERM (exists, owned by another user) or any other error → conservatively live
    }
  }
  // Cross-host or missing/invalid pid → age-based.
  const ts = (typeof holder.ts === 'number') ? holder.ts : Date.parse(holder.ts);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) > LANE_STALENESS_MS;
}

// acquireProjectLock(lockPath, { subcommand }) — O_EXCL claim; NEVER unlinks another process's lock.
//   → { ok:true, release } (clean claim) | { ok:false, stale:<boolean>, holder }.
// On EEXIST the holder is only CLASSIFIED (isStaleLock — the pure refusal classifier): a dead/aged
// holder is returned as stale:true and REFUSED — recovery is one explicit operator removal of the
// lockfile, then a re-run. holder is null for a corrupt/unparseable payload. The returned release()
// unlinks OUR OWN lock (idempotent) and clears the held-lock marker.
function acquireProjectLock(lockPath, opts) {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  _installSchedulerExitHook();
  const payload = JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    ts: Date.now(),
    subcommand: (opts && opts.subcommand) || null,
  });
  let fd;
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fd = fs.openSync(lockPath, 'wx'); // O_EXCL | O_CREAT — fails EEXIST if a holder exists
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    _heldSchedulerLock = lockPath;
    return { ok: true, release: () => releaseProjectLock(lockPath) };
  } catch (err) {
    if (fd !== undefined) {
      // openSync('wx') already claimed the file (fd is only reset to undefined after the full
      // write+fsync+close sequence succeeds) — we provably own it. A failure anywhere in between
      // (payload write, fsync, or close) would otherwise orphan an empty/partial lockfile: the
      // held-lock marker is never set, so neither release() nor the exit hook would ever clean it up.
      // Best-effort unlink OUR OWN just-created file before rethrowing — this can only ever remove
      // the file THIS call just created via 'wx', never another process's lock.
      try { fs.closeSync(fd); } catch (_) {}
      try { fs.unlinkSync(lockPath); } catch (_) {}
      throw err;
    }
    if (!(err && err.code === 'EEXIST')) throw err;
  }

  // EEXIST — classify the holder for the typed refusal. NEVER unlink here: an unlink executes a stale
  // decision made before it, so two concurrent takers holding the same stale decision would BOTH
  // acquire (each removes the other's fresh claim and re-claims). Recovery is operator-explicit.
  let raw = '';
  try { raw = fs.readFileSync(lockPath, 'utf8'); } catch (_) { raw = ''; }
  let holder = null;
  try { holder = JSON.parse(raw); } catch (_) { holder = null; }
  if (holder && typeof holder === 'object') {
    return { ok: false, stale: isStaleLock(holder), holder };
  }
  // Corrupt/empty payload — possibly a fresh lock caught between O_EXCL and its payload write. Classify
  // by the lockfile's mtime (this only SETS the refusal flavor, never a takeover): a just-created file
  // is NOT stale (protect the fresh holder mid-write); a truly old corrupt leftover IS stale.
  let mtimeMs = Date.now();
  try { mtimeMs = fs.statSync(lockPath).mtimeMs; } catch (_) {}
  return { ok: false, stale: (Date.now() - mtimeMs) > LANE_STALENESS_MS, holder: null };
}

// releaseProjectLock(lockPath) — unlink (swallow ENOENT) + clear the held-lock marker. Idempotent.
function releaseProjectLock(lockPath) {
  const fs = require('fs');
  try { fs.unlinkSync(lockPath); } catch (_) {}
  if (_heldSchedulerLock === lockPath) _heldSchedulerLock = null;
}

// #579: shared main-root resolver — single canonical source for getCoordRoot / mainRootFromCoord /
// resolveMainRoot, previously triplicated across claim.js, adaptive-node.js, and sink-merge.js.
// Hosted here (the ×4 byte-identical drift anchor) so all editions share ONE copy; the inline
// require convention keeps module load side-effect-free. claim.js and adaptive-node.js import these
// and drop their local re-impls; sink-merge.js imports via claim.js re-export.

// Resolve the common-dir of the git repo rooted at `root`. In a linked worktree,
// `git rev-parse --git-common-dir` returns the shared .git directory in the main checkout
// (e.g. /main/.git/worktrees/wt-name → path.resolve to /main/.git).
// Falls back to path.join(root, '.git') on any error (non-git dir / old git version).
function getCoordRoot(root) {
  const { execFileSync } = require('child_process');
  const path = require('path');
  // Fallback to process.cwd() when root is absent (mirrors claim.js's getRoot() default).
  const r = root || process.cwd();
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: r,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return path.resolve(r, raw);
  } catch (_) {
    return require('path').join(r, '.git');
  }
}

// Given the coordRoot (output of getCoordRoot), return the main checkout root.
// A plain repo: coordRoot = /main/.git → basename is '.git' → dirname is /main.
// A bare-worktrees layout: coordRoot = /main/.git → same.
// If coordRoot is NOT a path ending in '.git', it is already the main root (rare).
function mainRootFromCoord(coordRoot) {
  const path = require('path');
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}

// Convenience: resolve the main checkout root directly from a (possibly linked-worktree) root.
// Returns `root` (or process.cwd() when root is absent) on any error (fail-open: best-effort).
function resolveMainRoot(root) {
  const r = root || process.cwd();
  try { return mainRootFromCoord(getCoordRoot(r)); } catch (_) { return r; }
}

// #354: the SINGLE fence-aware locator for a `## {heading}` markdown section — the one home for
// ALL `## Node Ledger` / `## Required Agent Compliance` section access across readers/writers.
// Returns char offsets matching the legacy `content.indexOf('\n## ' + heading)` /
// `content.indexOf('\n## ', start + 1)` pair, but with FENCE TRACKING in the heading-locator loop so
// (a) an UPSTREAM FENCED `## {heading}` decoy is skipped and (b) a fenced `## ` line INSIDE the
// section does not prematurely end it. `start` = offset of the '\n' before the real heading line
// (-1 when the section is absent, appears only fenced, or sits at file start with no leading '\n');
// `next` = offset of the '\n' before the next fence-depth-0 `## ` heading after it (-1 → EOF).
// PURE String ops only — NO classifier import, preserving the ×4 byte-identity contract (see the
// readDurableConsentHalt note above). Prefix match mirrors the legacy indexOf semantics.
// #665: the closer check is RUN-LENGTH-aware (mirrors the classifier's markdownFenceTransition
// semantics locally): a closer must be the SAME family AND have a run-length >= the OPENER's AND
// an empty/whitespace-only suffix. The prior family-only check let a SHORTER same-family fence
// nested inside a longer one close it early, exposing a fenced decoy heading as "unfenced". FIRST-
// HIT selection among unfenced heading candidates is unchanged; a genuine duplicate unfenced
// heading (vanishingly rare malformed input) still resolves to the first-hit — a deliberate
// documented fallback, since this {start,next} offset-pair contract has no ambiguous-status
// channel the way classifier.sectionBodyState does, and every existing caller already tolerates
// first-hit-wins here.
function locateSection(content, heading) {
  const lines = String(content).split('\n');
  // #673: ANCHORED heading match — byte-parity with the classifier's oracle
  // (classifier.sectionBodyState's headRe: `^##\s+<escaped heading>\s*$`), replacing the loose
  // `startsWith('## ' + heading)` PREFIX test that false-positived on a longer decoy heading
  // (`## Node Ledger Extra`) and false-negatived on legal extra intra-heading whitespace
  // (`##  Node Ledger` two-space, `##\tNode Ledger` tab). Same escape as the classifier so a
  // heading containing regex metacharacters behaves identically in both.
  const escapedHeading = String(heading).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headRe = new RegExp('^##\\s+' + escapedHeading + '\\s*$');
  // #673: the next-heading TERMINATOR is likewise anchored to `^##\s` (matches the classifier's
  // `/^##\s/` collecting-loop terminator) instead of the loose `startsWith('## ')`, which missed a
  // tab-headed (`##\tAppendix`) following section and let its body bleed into the prior slice.
  const nextHeadRe = /^##\s/;
  const fenceRe = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
  let inFence = false, fam = '', fenceLen = 0;
  let off = 0, start = -1, headingLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.match(fenceRe);
    if (fm) {
      const f = fm[1][0], len = fm[1].length;
      if (!inFence) { inFence = true; fam = f; fenceLen = len; }
      else if (f === fam && len >= fenceLen && /^\s*$/.test(fm[2])) { inFence = false; fam = ''; fenceLen = 0; }
    // #673: `i > 0` is KEPT — NOT a stylistic no-op. A heading at absolute line 0 has no leading
    // '\n', so `start = off - 1` would collapse to -1 regardless of match style, colliding with the
    // "-1 = absent" sentinel; without this guard a line-0 false "match" would `break` the scan
    // immediately and hide a genuine heading later in the same content (a WORSE divergence than the
    // documented, structurally-unreachable line-0 gap — see T6e-d in test-adaptive-node.js).
    } else if (!inFence && i > 0 && headRe.test(ln)) {
      start = off - 1; headingLine = i; break;
    }
    off += ln.length + 1; // +1 for the consumed '\n'
  }
  if (start < 0) return { start: -1, next: -1 };
  let off2 = off + lines[headingLine].length + 1;
  inFence = false; fam = ''; fenceLen = 0;
  let next = -1;
  for (let i = headingLine + 1; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.match(fenceRe);
    if (fm) {
      const f = fm[1][0], len = fm[1].length;
      if (!inFence) { inFence = true; fam = f; fenceLen = len; }
      else if (f === fam && len >= fenceLen && /^\s*$/.test(fm[2])) { inFence = false; fam = ''; fenceLen = 0; }
    } else if (!inFence && nextHeadRe.test(ln)) {
      next = off2 - 1; break;
    }
    off2 += ln.length + 1;
  }
  return { start, next };
}

// #354: the canonical `## Required Agent Compliance` section shape — ONE home for the header/
// separator/format string (was duplicated near-verbatim in adaptive-node.spliceComplianceRow and
// parallel-batch.appendComplianceRow). Both now delegate the section-find/append to this helper;
// the batch-specific row CONSTRUCTION stays in the caller.
const COMPLIANCE_SECTION    = '## Required Agent Compliance';
const COMPLIANCE_HEADER_ROW = '| Requirement | Status | Evidence | Skip Reason |';
const COMPLIANCE_SEPARATOR  = '|-------------|--------|----------|-------------|';

// spliceComplianceSection — append a pre-built row to `## Required Agent Compliance`, creating the
// section below `## Node Ledger` if absent. Fence-aware (via locateSection). Idempotent creation.
function spliceComplianceSection(content, row) {
  const sec = locateSection(content, 'Required Agent Compliance');
  if (sec.start >= 0) {
    if (sec.next >= 0) return content.slice(0, sec.next) + '\n' + row + content.slice(sec.next);
    return content.trimEnd() + '\n' + row + '\n';
  }
  // Section absent — create it below `## Node Ledger` (or at EOF if no ledger).
  const led = locateSection(content, LEDGER_HEADING);
  const newSection = '\n' + COMPLIANCE_SECTION + '\n\n' + COMPLIANCE_HEADER_ROW + '\n' + COMPLIANCE_SEPARATOR + '\n' + row + '\n';
  if (led.next >= 0) return content.slice(0, led.next) + newSection + content.slice(led.next);
  return content.trimEnd() + newSection;
}

function isLegalWorkflowPath(value, installedPaths) {
  return value === ADAPTIVE_PATH || (Array.isArray(installedPaths) && installedPaths.includes(value));
}

// ---------------------------------------------------------------------------
// #355: unified emit / refuse protocol — the shared refusal envelope + framed-output
// constructor for the adaptive scripts.
//
// emit(obj) writes EXACTLY ONE compact JSON line LAST (never pretty-printed): a caller
// recovering the payload with the last-valid-JSON-line parser (safeJsonParse in the
// aggregators) always round-trips it, even if the script logged a warning/debug line
// before its result. A multi-line pretty JSON would NOT parse line-by-line, so emit is
// deliberately single-line. The default stream is stdout (refusals belong on stdout too,
// so a non-zero exit still carries a machine-readable reason — the task-mirror stderr bug
// this protocol fixes); pass { stream: process.stderr } only for genuinely out-of-band logs.
//
// refuse(reason, extra) builds the canonical refusal envelope { result:'refuse', reason, ... }
// shared across the adaptive scripts; callers branch on result === 'refuse' and read `reason`.
// Per-subcommand payloads may carry extra fields (additive); pass backward-compat keys (e.g.
// `status`, `errors`) via `extra` so existing consumers keep working.
// ---------------------------------------------------------------------------
function emit(obj, opts) {
  const stream = (opts && opts.stream) || process.stdout;
  stream.write(JSON.stringify(obj) + '\n');
}

function refuse(reason, extra) {
  return Object.assign({ result: 'refuse', reason: reason }, extra || {});
}

module.exports = {
  LANE_STALENESS_MS,
  SHARED_STATE_FIELDS,
  PARKED_LANE_PREFIXES,
  parsePorcelainPaths,
  isParkedLanePath,
  getCoordRoot,
  mainRootFromCoord,
  resolveMainRoot,
  WORKFLOW_PATHS,
  ADAPTIVE_PATH,
  PLAN_RUN_COMMAND,
  PLAN_RUN_SKILL,
  ADAPT_COMMAND,
  ADAPT_SKILL,
  PLAN_FILE,
  NODES_HEADING,
  LEDGER_HEADING,
  LEDGER_STATUSES,
  NODE_MODEL_TIERS,
  TIER_ALIASES,
  normalizeTier,
  TIER_MODEL_CLAUDE,
  dispatchModelClaude,
  TIER_MODEL_CODEX,
  dispatchModelCodex,
  CODEX_PINNED_STANDARD_ROLES,
  CODEX_PINNED_REASONING_ROLES,
  codexProfilePolicy,
  modelDisplay,
  TIER_RANK,
  CONTRACT_EFFORT_TABLE,
  contractForProvider,
  dispatchEffort,
  WAIT_BUDGET_MINUTES,
  WAIT_BUDGET_MINUTES_DEFAULT,
  WAIT_BUDGET_MINUTES_CAP,
  waitBudgetFloor,
  waitBudgetMinutes,
  effortForProvider,
  mapTier,
  dispatchEffortOpencode,
  DEFAULT_FANOUT_CAP,
  DEFAULT_FANOUT_CAP_READONLY,
  RUNNING_SET_NAME,
  SCHEDULER_LOCK_NAME,
  acquireProjectLock,
  releaseProjectLock,
  isStaleLock,
  LOOP_CAP,
  TEST_THRASH_LIMIT,
  MERGE_CONFLICT_REPAIR_LIMIT,
  REVIEW_REPAIR_LIMIT,
  REVIEW_REBIND_LIMIT,
  MAX_NODES,
  OPTIMIZE_ITER_CAP,
  OPTIMIZE_WALLCLOCK_CAP,
  ESCALATION_MARKERS,
  CONSENT_HALT_MARKER,
  readDurableConsentHalt,
  MAIN_SESSION_GATE_ROLE,
  VERDICT_PASS,
  VERDICT_FAIL,
  VERDICT_VOCABULARY,
  GATE_VERDICT_ROLES,
  SPECULATIVE_OPEN_POLICY_DEFAULT,
  SPECULATIVE_OPEN_POLICY_LEGAL,
  SPECULATIVE_OPEN_POLICY_REFUSED_AT_FREEZE,
  hasSpeculativePolicyField,
  materializeSpeculativePolicy,
  WRITE_OVERLAP_POLICY_DEFAULT,
  WRITE_OVERLAP_POLICY_LEGAL,
  WRITE_OVERLAP_POLICY_REFUSED_AT_FREEZE,
  parseNodeVerdict,
  parseValidatedCandidateHash,
  parseMetricValue,
  parseNodeSelector,
  FINDING_SCOPE_VOCABULARY,
  FINDING_ACTION_VOCABULARY,
  FINDING_STATUS_VOCABULARY,
  parseNodeFindings,
  unresolvedInScopeFixes,
  evaluateEffectiveVerdict,
  REVIEW_PLAN_SCHEMA_VERSION,
  REVIEW_CONTRACT_VERSION,
  REVIEW_CONTEXT_SCHEMA_VERSION,
  REVIEW_JOURNAL_SCHEMA_VERSION,
  REVIEW_GATE_ROLES,
  REVIEW_AGGREGATIONS,
  ADVERSARIAL_OUTCOMES,
  APPROVAL_OUTCOMES,
  FINDING_ANCHOR_KINDS,
  FINDING_FAILURE_CLASSES,
  canonicalJson,
  sha256Hex,
  deriveGateMode,
  requiredReviewTokens,
  deriveGateEffect,
  buildReviewContext,
  parseReviewEvidence,
  parseReviewEvidenceIdentity,
  validateReviewEvidenceBinding,
  normalizeFindingAnchor,
  computeFindingUid,
  normalizeFindingSet,
  normalizeResolutionSet,
  authoritativeResolutionArtifacts,
  deriveRepairDelta,
  validateRepairDelta,
  assessFindingClosure,
  reduceReviewReceipts,
  compareValidationObligations,
  assessReviewProgress,
  canonicalLogicalGateIdentity,
  validateReviewJournal,
  validateReviewJournalV2,
  isCanonicalBlobMap,
  isWriterIdentityTuple,
  nonAbortedRebinds,
  effectiveCandidate,
  effectiveProducerBinding,
  DELEGATION_OUTCOME_DEFAULT,
  DELEGATION_OUTCOME_VOCABULARY,
  parseDelegationOutcome,
  WRITE_SET_OVERFLOW_SUBTYPES,
  CURATED_ROOT_PATHS,
  extractCuratedRootPaths,
  isCuratedRoot,
  canonicalCuratedRoot,
  CONFIG_REL_PATH,
  INSTALLED_PATHS_FIELD,
  FANOUT_CAP_ENV,
  FANOUT_CAP_READONLY_ENV,
  LANE_CONTAINMENT_ENV,
  PARALLEL_WRITES_ENV,
  resolveInstalledPaths,
  resolveFanoutCap,
  resolveFanoutCapReadonly,
  resolveLaneContainment,
  parallelWritesDefaultOn,
  writeFileAtomicReplace,
  locateSection,
  spliceComplianceSection,
  isLegalWorkflowPath,
  emit,
  refuse,
};
