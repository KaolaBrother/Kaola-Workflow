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

// issue #770: the path SELECTOR is retired — adaptive is the only workflow path and there
// is no legality gate left to run anywhere, so the `WORKFLOW_PATHS` closed-universe const
// and `isLegalWorkflowPath` helper were removed (dead after the last caller was retired). A
// stale `installed_paths` field from a pre-retirement config is tolerated on read (ignored)
// and never written.
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
  'investigator',
  'knowledge-lookup',
  'tdd-guide',
  'implementer',
  'doc-updater',
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
//   kimi     — same inherit display as codex (sub-agents inherit the session model; the tier is
//              metadata only, never mapped to a variant/effort).
// A legacy alias normalizes first (a frozen-plan `opus` cell displays identically to `reasoning`).
// No tier / out-of-vocab → null (nothing to display natively; the raw `model: null` inherit echo stands).
function modelDisplay(tier) {
  const t = normalizeTier(tier);
  if (!t) return null;
  return {
    claude:   TIER_MODEL_CLAUDE[t],
    codex:    'parent session (' + t + ' tier metadata)',
    opencode: TIER_RANK[t] + ' effort variant',
    kimi:     'parent session (' + t + ' tier metadata)',
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

// Claim-scoped epoch lineage and re-plan transaction contract. These helpers
// stay forge-neutral and side-effect-free so every edition hashes and guards
// the same bytes. Filesystem/Git observation lives in the replan/claim scripts;
// this module owns only normalization, validation, and digest domains.
const EPOCH_SCHEMA_VERSION = 2;
// Schema 1 is a read-only compatibility receipt. New writers emit schema 2,
// whose predecessor/source receipts make every epoch transition recursively
// verifiable after the active transaction rotates.
const REPLAN_TRANSACTION_SCHEMA_VERSION = 2;
const REPLAN_TRANSACTION_SCHEMA_VERSIONS = Object.freeze([1, 2]);
const REVIEW_REPLAN_LIMIT = 2;
const REPLAN_TRANSACTION_NAME = 'replan-transaction.json';
const REPLAN_PLAN_NEXT_NAME = 'workflow-plan.next.md';
const REPLAN_PLANNER_PACKET_NAME = 'replan-planner-packet.json';
const REPLAN_PLANNER_ATTESTATION_NAME = 'replan-planner-attestation.json';
const EPOCH_CONSENT_EXTENSIONS_NAME = 'epoch-consent-extensions.json';
// The standing-consent journal: which consent CLASSES (action + target) the human has granted
// inside this claim, which scope they were granted under, and every application that rode one.
// Sibling of EPOCH_CONSENT_EXTENSIONS_NAME (the ceiling ledger) — same subject, different question.
const CONSENT_GRANTS_NAME = 'consent-grants.json';
const REPLAN_PHASES = Object.freeze([
  'prepared', 'planner_pending', 'child_frozen', 'parent_archived', 'committed',
]);
const REPLAN_STATUSES = Object.freeze(['none', 'in_progress', 'candidate_changed', 'consent_halt']);
const REPLAN_CAS_SEAMS = Object.freeze(['prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation']);
const REPLAN_ACTIVATION_STEPS = Object.freeze([
  'child_plan_promoted',
  'child_state_promoted_fenced',
  'task_mirror_promoted',
  'active_cache_cleaned',
  'transaction_committed',
  'state_unfenced',
]);
const REPLAN_DURABLE_WRITE_LABELS = Object.freeze([
  'after_tx_prepared', 'after_state_prepared_fence', 'after_packet_written', 'after_child_seeded',
  'after_tx_planner_pending', 'after_state_planner_pending_fence', 'after_tx_pre_freeze_cas',
  'after_child_frozen_bytes', 'after_tx_child_frozen', 'after_state_child_frozen_fence',
  'after_tx_pre_snapshot_cas', 'after_snapshot_stage_created', 'after_snapshot_stage_file',
  'after_snapshot_manifest_written', 'after_snapshot_epoch_renamed', 'after_tx_parent_archived',
  'after_state_parent_archived_fence', 'after_tx_pre_activation_cas', 'after_plan_child_promoted',
  'after_tx_child_plan_promoted', 'after_state_child_promoted_fenced',
  'after_tx_child_state_promoted_fenced', 'after_tasks_child_promoted', 'after_tx_task_mirror_promoted',
  'after_tx_cleanup_intent', 'after_cache_unlinked', 'after_tx_active_cache_cleaned', 'after_tx_committed',
  'after_state_unfenced', 'after_tx_state_unfenced', 'after_tx_candidate_changed',
  'after_state_candidate_changed', 'after_tx_reauthored', 'after_child_reauthor_seeded',
  'after_state_reauthor_fence', 'after_consent_ledger', 'after_state_consent_ceiling',
  'after_tx_consent_resumed', 'after_tx_failure_snapshot', 'after_tx_failure_task_mirror',
  'after_tx_failure_cleanup',
  'after_predecessor_history', 'after_source_history',
  // The discard exit (`replan abort`). Journal-ahead ordering: the abort RECORD lands first, then
  // the reversible artifacts, then the transaction, and the fence is dropped LAST — so a crash at
  // any prefix leaves either a still-fenced project a re-run of abort finishes, or a clean one.
  'after_abort_record', 'after_abort_artifact_unlinked', 'after_abort_transaction_unlinked',
  'after_state_abort_unfenced',
]);
const REPLAN_DURABLE_WRITE_LABELS_DYNAMIC = Object.freeze({
  after_snapshot_stage_file: 'after_snapshot_stage_file:<sorted-ordinal>:<path-digest>',
  after_tx_cleanup_intent: 'after_tx_cleanup_intent:<sorted-ordinal>:<path-digest>',
  after_cache_unlinked: 'after_cache_unlinked:<sorted-ordinal>:<path-digest>',
  after_tx_candidate_changed: 'after_tx_candidate_changed:<cas-seam>',
  after_state_candidate_changed: 'after_state_candidate_changed:<cas-seam>',
  after_abort_artifact_unlinked: 'after_abort_artifact_unlinked:<sorted-ordinal>:<path-digest>',
});
// The transaction phases an `abort` may discard, in the order they occur. A transaction is
// abortable only while the parent epoch has NOT been snapshotted: from `parent_archived` onward the
// snapshot directory is a durable kernel record keyed by the PARENT epoch, so discarding the
// transaction beneath it would either strand a manifest naming a transaction that no longer exists
// (which collides with the next prepare) or require deleting a kernel record to clear it. Past that
// line the exit is `resume` (roll forward) or a claim-level discard, never `abort`.
const REPLAN_ABORTABLE_PHASES = Object.freeze(['prepared', 'planner_pending', 'child_frozen']);
const EPOCH_STATE_FIELD_ORDER = Object.freeze([
  'epoch_schema_version',
  'claim_repository_id',
  'claim_identity_digest',
  'claim_root_object_format',
  'claim_root_base_commit',
  'claim_root_base_tree',
  'claim_root_base_digest',
  'epoch_lineage_id',
  'plan_epoch',
  'active_plan_hash',
  'inherited_frontier_digest',
  'inherited_frontier_classes',
  'automatic_review_replans',
  'authorized_epoch_ceiling',
  'case_b_exemption_consumed',
  'replan_status',
  'replan_transaction_id',
  'replan_phase',
  'active_snapshot_manifest_digest',
]);
const HEX64_RE = /^[0-9a-f]{64}$/i;
const OBJECT_ID_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Canonical JSON accepts only the closed semantic value domain used by epoch
// identities. It never invokes toJSON or silently maps an unsupported value to
// null, because either behavior can collapse two distinct authority objects.
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
      const out = [];
      for (let index = 0; index < input.length; index++) {
        if (!Object.prototype.hasOwnProperty.call(input, index) || input[index] === undefined) {
          throw new Error('canonical_json_sparse_or_undefined');
        }
        out.push(visit(input[index], stack));
      }
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

function sha256Hex(bytes) {
  return require('crypto').createHash('sha256').update(bytes).digest('hex');
}

function sha256Canonical(value) {
  return sha256Hex(Buffer.from(canonicalJson(value), 'utf8'));
}

// ===========================================================================
// #777 — ledger tamper-evidence hash chain (per durable WRITE, back-linked).
//
// `plan_hash` covers the immutable half of workflow-plan.md (## Meta + ## Nodes);
// the ## Node Ledger — the execution record — mutates on every legitimate
// transition and is deliberately outside it. This append-only back-linked chain
// reuses verifyConsentLedger's idiom (do NOT invent a second) to give the mutable
// half tamper-EVIDENCE: an out-of-band edit to a ledger status produces a state the
// chain cannot derive.
//
// Granularity is per durable WRITE, not per row: one plan write flips ANY number of
// ledger rows (four paths flip MANY in one atomic write), so a chain entry carries a
// `deltas` array. The head is an HTML-comment sibling of <!-- plan_hash --> after the
// first H1 — OUTSIDE every ## section (so it is outside every sectionBody the hash
// reads and never moves plan_hash), riding the SAME atomic plan write as the row it
// describes. Scope is over parseLedger's id->status map, NEVER section bytes
// (--freeze --repair's normalizeLedgerHeader/reconcileLedger legitimately rewrite
// bytes). Migration is tolerate-and-adopt keyed on head ABSENCE: no head => not in
// force => PASS; the first mutating transition writes a genesis snapshot (not forged
// history); head present + journal missing/unparseable => REFUSE.
// ===========================================================================

const LEDGER_CHAIN_JOURNAL_NAME = 'ledger-chain.json';
const LEDGER_CHAIN_SCHEMA_VERSION = 1;
const LEDGER_CHAIN_HEAD_RE = /<!--[ \t]*ledger_chain_head:[ \t]*([0-9a-f]{64})[ \t]*-->/i;

// The canonical id->status map for the chain. Byte-identical semantics to
// adaptive-node.readLedgerStatuses / validator.parseLedger (header-driven, fence-aware
// via locateSection), so post_ledger_digest is stable across write-time (adaptive-node)
// and verify-time (adaptive-node fast path + validator resume).
function ledgerChainStatusMap(content) {
  const out = {};
  const { start, next } = locateSection(String(content == null ? '' : content), LEDGER_HEADING);
  if (start < 0) return out;
  const text = String(content == null ? '' : content);
  const block = next >= 0 ? text.slice(start, next) : text.slice(start);
  const rows = block.split('\n').filter(l => l.trim().startsWith('|'));
  if (rows.length < 2) return out;
  const header = rows[0].split('|').slice(1, -1).map(c => c.trim().toLowerCase());
  const idIdx = header.indexOf('id');
  const stIdx = header.indexOf('status');
  if (idIdx < 0 || stIdx < 0) return out;
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split('|').slice(1, -1).map(c => c.trim());
    const id = cells[idIdx] || '';
    if (id && !/^[-:\s]+$/.test(id)) out[id] = (cells[stIdx] || '').toLowerCase();
  }
  return out;
}

// Digest over the id->status map — reuses ledgerDigest's scheme (sorted {id,status}
// rows -> sha256Canonical) so post_ledger_digest and ledgerDigest never diverge. Accepts
// either raw plan content or an already-parsed map.
function ledgerChainMapDigest(mapOrContent) {
  const map = (typeof mapOrContent === 'string') ? ledgerChainStatusMap(mapOrContent) : (mapOrContent || {});
  const rows = Object.keys(map).sort().map(id => ({ id, status: map[id] }));
  return sha256Canonical(rows);
}

// Digest over the ## Expansion Records section — RECORDED in every entry (bound into
// entry_digest) but never re-derived at verify time, so raw-section bytes are a fine,
// deterministic-per-write source. Empty section digests to the empty-string constant.
function ledgerChainExpansionDigest(content) {
  const text = String(content == null ? '' : content);
  const { start, next } = locateSection(text, 'Expansion Records');
  if (start < 0) return sha256Canonical('');
  return sha256Canonical(next >= 0 ? text.slice(start, next) : text.slice(start));
}

// The per-write delta set: symmetric diff of two id->status maps. An added row is
// {from:null,to:'pending'} (appendLedgerRows/reconcile absent->pending); a removed row
// {from:...,to:null}. Sorted by id for determinism.
function ledgerChainDeltas(oldMap, newMap) {
  const a = oldMap || {}, b = newMap || {};
  const ids = new Set(Object.keys(a).concat(Object.keys(b)));
  const out = [];
  for (const id of Array.from(ids).sort()) {
    const from = Object.prototype.hasOwnProperty.call(a, id) ? a[id] : null;
    const to = Object.prototype.hasOwnProperty.call(b, id) ? b[id] : null;
    if (from !== to) out.push({ id: id, from: from, to: to });
  }
  return out;
}

function ledgerChainHeadFromContent(content) {
  const m = String(content == null ? '' : content).match(LEDGER_CHAIN_HEAD_RE);
  return m ? m[1].toLowerCase() : null;
}

// Insert or replace the head marker as a sibling of <!-- plan_hash --> (after the first
// H1), OUTSIDE every ## section. Idempotent (replaces an existing marker in place).
function stampLedgerChainHead(content, head) {
  const marker = '<!-- ledger_chain_head: ' + head + ' -->';
  const text = String(content == null ? '' : content);
  if (LEDGER_CHAIN_HEAD_RE.test(text)) return text.replace(LEDGER_CHAIN_HEAD_RE, marker);
  const ph = text.match(/<!--[ \t]*plan_hash:[ \t]*[0-9a-f]{64}[ \t]*-->/i);
  if (ph) {
    const idx = text.indexOf(ph[0]) + ph[0].length;
    return text.slice(0, idx) + '\n' + marker + text.slice(idx);
  }
  const lines = text.split('\n');
  const h1 = lines.findIndex(l => /^#\s+/.test(l));
  if (h1 >= 0) { lines.splice(h1 + 1, 0, '', marker); return lines.join('\n'); }
  return marker + '\n' + text;
}

// Remove the head marker (and the single newline it introduced) — the chain-RESET point.
// --freeze (initial + mid-run --repair) strips it so the next transition re-adopts the
// authoritative post-freeze ledger as a fresh genesis rather than staling the head.
function stripLedgerChainHead(content) {
  return String(content == null ? '' : content)
    .replace(/\n?[ \t]*<!--[ \t]*ledger_chain_head:[ \t]*[0-9a-f]{64}[ \t]*-->[ \t]*/i, '');
}

// Build one back-linked entry: entry_digest = sha256Canonical(entry without entry_digest),
// exactly the verifyConsentLedger idiom.
function buildLedgerChainEntry(fields) {
  const base = {
    schema_version: LEDGER_CHAIN_SCHEMA_VERSION,
    epoch_lineage_id: String(fields.epoch_lineage_id),
    plan_hash: String(fields.plan_hash == null ? '' : fields.plan_hash),
    subcommand: String(fields.subcommand == null ? '' : fields.subcommand),
    genesis: !!fields.genesis,
    deltas: (fields.deltas || []).map(d => ({
      id: String(d.id),
      from: d.from == null ? null : String(d.from),
      to: d.to == null ? null : String(d.to),
    })),
    post_ledger_digest: String(fields.post_ledger_digest),
    expansion_records_digest: String(fields.expansion_records_digest),
    previous_entry_digest: fields.previous_entry_digest == null ? null : String(fields.previous_entry_digest),
  };
  return Object.assign({}, base, { entry_digest: sha256Canonical(base) });
}

// Pure transition planner (does NO I/O): given the plan's OLD head, the prior journal,
// and the transition facts, return the NEW entries array + head — genesis-adopting when
// no head is in force, else truncating any crash roll-forward residue back to the
// committed head before extending. Refuses (never launders) when the on-disk ledger does
// not match the committed head, or the head is absent from the journal.
function extendLedgerChain(input) {
  const entries = [];
  let prev = null;
  if (input.oldHead) {
    if (!input.oldJournal || !Array.isArray(input.oldJournal.entries)) {
      return { ok: false, reason: 'ledger_chain_journal_missing' };
    }
    const idx = input.oldJournal.entries.findIndex(e => e && e.entry_digest === input.oldHead);
    if (idx < 0) return { ok: false, reason: 'ledger_chain_head_not_in_journal' };
    const headEntry = input.oldJournal.entries[idx];
    // Laundering guard: only extend from a state consistent with the committed head.
    if (headEntry.post_ledger_digest !== input.oldLedgerDigest) {
      return { ok: false, reason: 'ledger_chain_ledger_mismatch' };
    }
    for (let i = 0; i <= idx; i++) entries.push(input.oldJournal.entries[i]);
    prev = input.oldHead;
  } else {
    const genesis = buildLedgerChainEntry({
      epoch_lineage_id: input.epochLineageId, plan_hash: input.planHash,
      subcommand: 'genesis', genesis: true, deltas: [],
      post_ledger_digest: input.oldLedgerDigest,
      expansion_records_digest: input.oldExpansionDigest,
      previous_entry_digest: null,
    });
    entries.push(genesis);
    prev = genesis.entry_digest;
  }
  const transition = buildLedgerChainEntry({
    epoch_lineage_id: input.epochLineageId, plan_hash: input.planHash,
    subcommand: input.subcommand, genesis: false, deltas: input.deltas,
    post_ledger_digest: input.newLedgerDigest,
    expansion_records_digest: input.newExpansionDigest,
    previous_entry_digest: prev,
  });
  entries.push(transition);
  return { ok: true, entries: entries, head: transition.entry_digest };
}

// Verify a plan's ledger chain (pure). Mirrors verifyConsentLedger: walk from genesis,
// recompute each entry_digest, check back-links, ANCHOR on the plan's committed head
// (ignoring roll-forward residue after it), and confirm the head entry's
// post_ledger_digest equals the current ledger's map digest.
//   no head              => { ok:true, in_force:false }              (migration: PASS)
//   head + no journal    => refuse ledger_chain_journal_missing
//   head + broken chain  => refuse ledger_chain_{broken_link,entry_digest_mismatch,invalid}
//   head not in journal  => refuse ledger_chain_head_not_in_journal
//   ledger != head state => refuse ledger_chain_ledger_mismatch      (the tamper case)
function verifyLedgerChain(input) {
  const head = input.head;
  if (!head) return { ok: true, in_force: false };
  const journal = input.journal;
  const epochLineageId = input.epochLineageId;
  if (!journal || journal.schema_version !== LEDGER_CHAIN_SCHEMA_VERSION
      || !Array.isArray(journal.entries) || journal.epoch_lineage_id !== epochLineageId) {
    return { ok: false, in_force: true, reason: 'ledger_chain_journal_missing' };
  }
  let previous = null;
  for (let i = 0; i < journal.entries.length; i++) {
    const entry = journal.entries[i];
    if (!entry || entry.schema_version !== LEDGER_CHAIN_SCHEMA_VERSION
        || entry.epoch_lineage_id !== epochLineageId
        || typeof entry.plan_hash !== 'string'
        || typeof entry.subcommand !== 'string'
        || typeof entry.genesis !== 'boolean'
        || !Array.isArray(entry.deltas)
        || typeof entry.post_ledger_digest !== 'string'
        || typeof entry.expansion_records_digest !== 'string'
        || (entry.previous_entry_digest !== null && typeof entry.previous_entry_digest !== 'string')
        || typeof entry.entry_digest !== 'string') {
      return { ok: false, in_force: true, reason: 'ledger_chain_invalid' };
    }
    if (entry.previous_entry_digest !== previous) {
      return { ok: false, in_force: true, reason: 'ledger_chain_broken_link' };
    }
    const copy = Object.assign({}, entry);
    delete copy.entry_digest;
    if (sha256Canonical(copy) !== entry.entry_digest) {
      return { ok: false, in_force: true, reason: 'ledger_chain_entry_digest_mismatch' };
    }
    previous = entry.entry_digest;
    if (entry.entry_digest === head) {
      if (entry.post_ledger_digest !== input.currentLedgerDigest) {
        return { ok: false, in_force: true, reason: 'ledger_chain_ledger_mismatch' };
      }
      return { ok: true, in_force: true, head: head };
    }
  }
  return { ok: false, in_force: true, reason: 'ledger_chain_head_not_in_journal' };
}

function nonEmptyString(value, reason) {
  const text = String(value == null ? '' : value);
  if (!text || /[\r\n\0]/.test(text)) throw new Error(reason);
  return text;
}

function normalizeIssueNumbers(values) {
  if (!Array.isArray(values)) throw new Error('claim_issue_numbers_invalid');
  const out = Array.from(new Set(values.map(value => {
    const number = typeof value === 'number' ? value : Number(String(value));
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error('claim_issue_numbers_invalid');
    return number;
  }))).sort((a, b) => a - b);
  if (!out.length) throw new Error('claim_issue_numbers_invalid');
  return out;
}

function buildClaimIdentity(input) {
  if (!isPlainObject(input)) throw new Error('claim_identity_invalid');
  if (input.schema_version != null && input.schema_version !== EPOCH_SCHEMA_VERSION) {
    throw new Error('claim_identity_schema_invalid');
  }
  const issueNumbers = normalizeIssueNumbers(input.issue_numbers);
  const primaryIssue = Number(input.primary_issue);
  if (!Number.isSafeInteger(primaryIssue) || !issueNumbers.includes(primaryIssue)) {
    throw new Error('claim_primary_issue_invalid');
  }
  const bundleId = input.bundle_id == null || input.bundle_id === ''
    ? null : nonEmptyString(input.bundle_id, 'claim_bundle_id_invalid');
  const worktreePath = nonEmptyString(input.worktree_path, 'claim_worktree_path_invalid');
  if (!require('path').isAbsolute(worktreePath)) throw new Error('claim_worktree_path_invalid');
  return {
    schema_version: EPOCH_SCHEMA_VERSION,
    repository_id: nonEmptyString(input.repository_id, 'claim_repository_id_invalid'),
    issue_numbers: issueNumbers,
    primary_issue: primaryIssue,
    bundle_id: bundleId,
    closure_policy: nonEmptyString(input.closure_policy, 'claim_closure_policy_invalid'),
    branch: nonEmptyString(input.branch, 'claim_branch_invalid'),
    worktree_path: worktreePath,
    claim_ts: nonEmptyString(input.claim_ts, 'claim_ts_invalid'),
    session_marker: nonEmptyString(input.session_marker, 'claim_session_marker_invalid'),
  };
}

function buildClaimRootBase(input) {
  if (!isPlainObject(input)) throw new Error('claim_root_base_invalid');
  if (input.schema_version != null && input.schema_version !== EPOCH_SCHEMA_VERSION) {
    throw new Error('claim_root_schema_invalid');
  }
  const objectFormat = String(input.object_format || '').toLowerCase();
  if (!['sha1', 'sha256'].includes(objectFormat)) throw new Error('claim_root_object_format_invalid');
  const commit = String(input.commit || '').toLowerCase();
  const tree = String(input.tree || '').toLowerCase();
  const objectLength = objectFormat === 'sha1' ? 40 : 64;
  const re = new RegExp('^[0-9a-f]{' + objectLength + '}$');
  if (!re.test(commit) || !re.test(tree)) throw new Error('claim_root_object_id_invalid');
  return {
    schema_version: EPOCH_SCHEMA_VERSION,
    object_format: objectFormat,
    commit,
    tree,
    branch: nonEmptyString(input.branch, 'claim_root_branch_invalid'),
  };
}

function buildEpochLineage(identityInput, rootInput) {
  const claim_identity = buildClaimIdentity(identityInput);
  const claim_root_base = buildClaimRootBase(rootInput);
  const claim_identity_digest = sha256Canonical(claim_identity);
  const claim_root_base_digest = sha256Canonical(claim_root_base);
  const epoch_lineage_id = sha256Canonical({
    schema_version: EPOCH_SCHEMA_VERSION,
    claim_identity_digest,
    claim_root_base_digest,
  });
  return {
    claim_identity,
    claim_identity_digest,
    claim_root_base,
    claim_root_base_digest,
    epoch_lineage_id,
  };
}

// #699: the canonical scalar epoch envelope shared by current-state and
// recursive-snapshot authority readers. A schema-2 state is not identified by
// field width alone: its lineage id is the canonical digest of the persisted
// claim-identity/root digests. Keep this pure so every destructive consumer can
// compose the same typed refusal through its shared verifier instead of
// reimplementing partial presence checks.
function validateEpochStateAuthority(fields) {
  const reject = reason => ({ ok: false, reason });
  if (!isPlainObject(fields)) return reject('state_epoch_authority_invalid');
  if (!Object.prototype.hasOwnProperty.call(fields, 'epoch_schema_version')
      || !String(fields.epoch_schema_version || '').trim()
      || String(fields.epoch_schema_version).trim() === 'none') {
    // Pre-epoch workflow states carry none of the epoch-envelope scalars and
    // remain readable through the historical archive compatibility path. A
    // partially stripped schema-2 state still carries at least one such scalar
    // and is therefore a malformed current authority, not legacy input.
    const hasEpochEnvelope = EPOCH_STATE_FIELD_ORDER.slice(1)
      .some(key => Object.prototype.hasOwnProperty.call(fields, key));
    if (!hasEpochEnvelope) return { ok: true, legacy: true };
    return reject('state_epoch_schema_missing');
  }
  if (String(fields.epoch_schema_version).trim() !== String(EPOCH_SCHEMA_VERSION)) {
    return reject('state_epoch_schema_unsupported');
  }
  if (!Object.prototype.hasOwnProperty.call(fields, 'epoch_lineage_id')
      || !String(fields.epoch_lineage_id || '').trim()
      || String(fields.epoch_lineage_id).trim() === 'none') {
    return reject('state_epoch_lineage_missing');
  }
  const epochLineageId = String(fields.epoch_lineage_id).trim();
  if (!HEX64_RE.test(epochLineageId)) return reject('state_epoch_lineage_invalid');
  const claimIdentityDigest = String(fields.claim_identity_digest || '').trim();
  const claimRootBaseDigest = String(fields.claim_root_base_digest || '').trim();
  if (!HEX64_RE.test(claimIdentityDigest) || !HEX64_RE.test(claimRootBaseDigest)) {
    return reject('state_epoch_lineage_basis_invalid');
  }
  const expectedLineageId = sha256Canonical({
    schema_version: EPOCH_SCHEMA_VERSION,
    claim_identity_digest: claimIdentityDigest,
    claim_root_base_digest: claimRootBaseDigest,
  });
  if (epochLineageId !== expectedLineageId) return reject('state_epoch_lineage_mismatch');
  return {
    ok: true,
    epoch_schema_version: EPOCH_SCHEMA_VERSION,
    epoch_lineage_id: epochLineageId,
    claim_identity_digest: claimIdentityDigest,
    claim_root_base_digest: claimRootBaseDigest,
  };
}

function normalizeDigestList(values, reason) {
  if (!Array.isArray(values)) throw new Error(reason);
  const out = Array.from(new Set(values.map(value => String(value || '').toLowerCase()))).sort();
  if (out.some(value => !HEX64_RE.test(value))) throw new Error(reason);
  return out;
}

function safeRelativePath(value) {
  const p = String(value || '').replace(/\\/g, '/');
  if (!p || p.startsWith('/') || p.includes('\0')) return null;
  const parts = p.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  return p;
}

function buildCandidateView(input) {
  if (!isPlainObject(input) || input.schema_version !== EPOCH_SCHEMA_VERSION
      || !HEX64_RE.test(String(input.claim_root_base_digest || '').toLowerCase())
      || !OBJECT_ID_RE.test(String(input.base_tree || '').toLowerCase())
      || !Array.isArray(input.entries)) {
    throw new Error('candidate_view_invalid');
  }
  const entries = input.entries.map(entry => {
    if (!isPlainObject(entry)) throw new Error('candidate_entry_invalid');
    const path = safeRelativePath(entry.path);
    const kind = String(entry.kind || '');
    const mode = entry.mode == null ? null : String(entry.mode);
    const blobDigest = entry.blob_digest == null ? null : String(entry.blob_digest).toLowerCase();
    if (!path || !['added', 'modified', 'deleted', 'symlink', 'gitlink'].includes(kind)
        || (mode !== null && !/^[0-7]{6}$/.test(mode))
        || (blobDigest !== null && !HEX64_RE.test(blobDigest))
        || typeof entry.code_relevant !== 'boolean'
        || typeof entry.security_relevant !== 'boolean') {
      throw new Error('candidate_entry_invalid');
    }
    return { path, kind, mode, blob_digest: blobDigest,
      code_relevant: entry.code_relevant, security_relevant: entry.security_relevant };
  }).sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
  const keys = entries.map(entry => entry.path + '\0' + entry.kind);
  if (new Set(keys).size !== keys.length) throw new Error('candidate_entry_duplicate');
  return {
    schema_version: EPOCH_SCHEMA_VERSION,
    claim_root_base_digest: String(input.claim_root_base_digest).toLowerCase(),
    base_tree: String(input.base_tree).toLowerCase(),
    entries,
  };
}

function digestCandidateView(input) {
  const candidate_view = buildCandidateView(input);
  return { candidate_view, candidate_digest: sha256Canonical(candidate_view) };
}

function buildInheritedFrontierView(input) {
  if (!isPlainObject(input) || input.schema_version !== EPOCH_SCHEMA_VERSION) {
    throw new Error('inherited_frontier_invalid');
  }
  const classes = Array.from(new Set((input.inherited_frontier_classes || []).map(String))).sort();
  if (classes.some(value => !['code', 'security'].includes(value))) {
    throw new Error('inherited_frontier_classes_invalid');
  }
  const view = {
    schema_version: EPOCH_SCHEMA_VERSION,
    claim_root_base_digest: String(input.claim_root_base_digest || '').toLowerCase(),
    candidate_digest: String(input.candidate_digest || '').toLowerCase(),
    code_digest: String(input.code_digest || '').toLowerCase(),
    security_digest: String(input.security_digest || '').toLowerCase(),
    inherited_frontier_classes: classes,
    changed_entry_digests: normalizeDigestList(input.changed_entry_digests || [], 'inherited_frontier_entry_digests_invalid'),
    validation_obligation_digests: normalizeDigestList(input.validation_obligation_digests || [], 'inherited_frontier_validation_digests_invalid'),
    scope_lineage_ids: normalizeDigestList(input.scope_lineage_ids || [], 'inherited_frontier_scope_ids_invalid'),
  };
  if (!['claim_root_base_digest', 'candidate_digest', 'code_digest', 'security_digest']
    .every(key => HEX64_RE.test(view[key]))) throw new Error('inherited_frontier_digest_invalid');
  return view;
}

function digestInheritedFrontierView(input) {
  const inherited_frontier_view = buildInheritedFrontierView(input);
  return { inherited_frontier_view, inherited_frontier_digest: sha256Canonical(inherited_frontier_view) };
}

function buildScopeLineageId(input) {
  if (!isPlainObject(input)) throw new Error('scope_lineage_invalid');
  const view = {
    schema_version: EPOCH_SCHEMA_VERSION,
    epoch_lineage_id: String(input.epoch_lineage_id || '').toLowerCase(),
    claim_identity_digest: String(input.claim_identity_digest || '').toLowerCase(),
    claim_root_base_digest: String(input.claim_root_base_digest || '').toLowerCase(),
    acceptance_contract_digest: String(input.acceptance_contract_digest || '').toLowerCase(),
    reviewed_surface_digest: String(input.reviewed_surface_digest || '').toLowerCase(),
  };
  if (Object.values(view).slice(1).some(value => !HEX64_RE.test(value))) {
    throw new Error('scope_lineage_digest_invalid');
  }
  return sha256Canonical(view);
}

function parseStateFields(content) {
  const out = Object.create(null);
  for (const line of String(content || '').split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

function writeEpochStateBlock(content, values) {
  const original = String(content || '');
  const current = parseStateFields(original);
  const merged = Object.assign({}, current, values || {});
  // Epoch fields have one canonical home. Strip duplicate scalar lines from
  // legacy/adversarial sections before inserting the authoritative block so a
  // later duplicate cannot override the cache/transaction fence parser.
  const epochKeys = new Set(EPOCH_STATE_FIELD_ORDER);
  const text = original.split(/\r?\n/).filter(line => {
    const match = /^([A-Za-z][A-Za-z0-9_]*):/.exec(line);
    return !match || !epochKeys.has(match[1]);
  }).join('\n');
  const lines = ['## Epoch Lineage'];
  for (const key of EPOCH_STATE_FIELD_ORDER) {
    let value = merged[key];
    if (value === undefined || value === null || value === '') value = 'none';
    if (Array.isArray(value)) value = value.length ? value.join(',') : 'none';
    if (typeof value === 'boolean') value = value ? 'true' : 'false';
    lines.push(key + ': ' + value);
  }
  const block = lines.join('\n') + '\n';
  const heading = /^## Epoch Lineage[ \t]*$/m;
  const match = heading.exec(text);
  if (match) {
    const next = /^## [^\n]+$/gm;
    next.lastIndex = match.index + match[0].length;
    const nextMatch = next.exec(text);
    const end = nextMatch ? nextMatch.index : text.length;
    return text.slice(0, match.index) + block + (nextMatch ? '\n' : '') + text.slice(end);
  }
  const sink = /^## Sink[ \t]*$/m.exec(text);
  if (sink) return text.slice(0, sink.index) + block + '\n' + text.slice(sink.index);
  return text.replace(/\s*$/, '\n\n') + block;
}

function validateReplanTransaction(value) {
  const refuse = (reason, step) => ({ ok: false, reason, step: step || null });
  try {
    if (!isPlainObject(value) || !REPLAN_TRANSACTION_SCHEMA_VERSIONS.includes(value.schema_version)
        || !HEX64_RE.test(String(value.transaction_id || ''))
        || !HEX64_RE.test(String(value.epoch_lineage_id || ''))
        || !REPLAN_PHASES.includes(value.phase)
        || !['in_progress', 'candidate_changed', 'consent_halt', 'committed'].includes(value.outcome)
        || !Number.isSafeInteger(value.planner_attempt) || value.planner_attempt < 1
        || !Number.isSafeInteger(value.transition_cost) || ![0, 1].includes(value.transition_cost)
        || typeof value.transition_reason !== 'string' || !value.transition_reason
        || !isPlainObject(value.parent) || !isPlainObject(value.source) || !isPlainObject(value.cas)
        || !isPlainObject(value.budget) || !isPlainObject(value.planner) || !isPlainObject(value.child)
        || !isPlainObject(value.snapshot) || !isPlainObject(value.activation)
        || !Array.isArray(value.attempts)) return refuse('replan_transaction_invalid');

    const lineage = buildEpochLineage(value.parent.claim_identity, value.parent.claim_root_base);
    if (lineage.epoch_lineage_id !== value.epoch_lineage_id
        || lineage.claim_identity_digest !== value.parent.claim_identity_digest
        || lineage.claim_root_base_digest !== value.parent.claim_root_base_digest
        || !Number.isSafeInteger(value.parent.plan_epoch) || value.parent.plan_epoch < 1
        || !HEX64_RE.test(String(value.parent.plan_hash || ''))
        || !HEX64_RE.test(String(value.parent.plan_digest || ''))
        || !HEX64_RE.test(String(value.parent.ledger_digest || ''))
        || !HEX64_RE.test(String(value.parent.state_pre_fence_digest || ''))
        || !HEX64_RE.test(String(value.parent.state_authority_digest || ''))
        || typeof value.parent.plan_bytes_base64 !== 'string'
        || typeof value.parent.state_bytes_base64 !== 'string'
        || sha256Hex(Buffer.from(value.parent.plan_bytes_base64, 'base64')) !== value.parent.plan_digest
        || sha256Hex(Buffer.from(value.parent.state_bytes_base64, 'base64')) !== value.parent.state_pre_fence_digest) {
      return refuse('replan_transaction_parent_invalid');
    }
    const expectedId = sha256Canonical({
      schema_version: value.schema_version,
      epoch_lineage_id: value.epoch_lineage_id,
      parent_plan_epoch: value.parent.plan_epoch,
      parent_plan_hash: value.parent.plan_hash,
      source_reason: value.source.source_reason,
      source_attempt_ids: Array.isArray(value.source.source_attempt_ids)
        ? value.source.source_attempt_ids.slice().sort() : [],
      prepare_candidate_digest: value.cas.prepare && value.cas.prepare.candidate_digest,
      prepare_inherited_frontier_digest: value.cas.prepare && value.cas.prepare.inherited_frontier_digest,
    });
    if (expectedId !== value.transaction_id) return refuse('replan_transaction_identity_mismatch');
    if (value.schema_version === 2) {
      const predecessor = value.predecessor;
      const predecessorRequired = value.parent.plan_epoch > 1;
      if ((predecessorRequired && !isPlainObject(predecessor))
          || (!predecessorRequired && predecessor !== null)) {
        return refuse('replan_transaction_predecessor_invalid');
      }
      if (predecessorRequired && (!REPLAN_TRANSACTION_SCHEMA_VERSIONS.includes(predecessor.schema_version)
          || !HEX64_RE.test(String(predecessor.transaction_id || ''))
          || predecessor.transaction_id === value.transaction_id
          || predecessor.path !== '.cache/committed-transactions/' + predecessor.transaction_id + '.json'
          || !HEX64_RE.test(String(predecessor.digest || ''))
          || !Number.isSafeInteger(predecessor.size) || predecessor.size < 1)) {
        return refuse('replan_transaction_predecessor_invalid');
      }
    }
    const sourceIds = value.source.source_attempt_ids;
    const sourceKind = value.source.authority_kind || 'review_outcome';
    if (!Array.isArray(sourceIds) || !sourceIds.length
        || sourceIds.some(id => typeof id !== 'string' || !id)
        || JSON.stringify(sourceIds) !== JSON.stringify(Array.from(new Set(sourceIds)).sort())
        || typeof value.source.source_reason !== 'string' || !value.source.source_reason
        || !HEX64_RE.test(String(value.source.source_evidence_digest || ''))
        || !['review_outcome', 'diagnosis_to_build'].includes(sourceKind)
        || (sourceKind === 'review_outcome' && (!HEX64_RE.test(String(value.source.journal_digest || ''))
          || !HEX64_RE.test(String(value.source.handoff_digest || ''))))
        || (sourceKind === 'diagnosis_to_build'
          && !(value.source.journal_digest === null && value.source.handoff_digest === null))) {
      return refuse('replan_transaction_source_invalid');
    }
    if (value.schema_version === 2 && value.source.rotated_from != null) {
      const rotated = value.source.rotated_from;
      if (!isPlainObject(rotated)
          || rotated.path !== '.cache/replan-sources/' + rotated.digest + '.json'
          || !HEX64_RE.test(String(rotated.digest || ''))
          || !Number.isSafeInteger(rotated.size) || rotated.size < 1
          || !HEX64_RE.test(String(rotated.transaction_id || ''))) {
        return refuse('replan_transaction_source_invalid');
      }
    }
    if (!Number.isSafeInteger(value.budget.count_before) || value.budget.count_before < 0
        || !Number.isSafeInteger(value.budget.prospective_count_after)
        || value.budget.prospective_count_after !== value.budget.count_before + value.transition_cost
        || !Number.isSafeInteger(value.budget.ceiling) || value.budget.ceiling < REVIEW_REPLAN_LIMIT
        || value.budget.transition_cost !== value.transition_cost
        || !(value.budget.consent_ledger_digest === null
          || HEX64_RE.test(String(value.budget.consent_ledger_digest || '')))
        || typeof value.budget.case_b_exemption !== 'boolean'
        || typeof value.budget.case_b_exemption_consumed_before !== 'boolean'
        || typeof value.budget.case_b_exemption_consumed_after !== 'boolean') {
      return refuse('replan_transaction_budget_invalid');
    }
    if (value.transition_cost === 0 && (!value.budget.case_b_exemption
        || !isPlainObject(value.budget.case_b_proof)
        || !HEX64_RE.test(String(value.budget.case_b_proof.proof_digest || ''))
        || sha256Canonical(value.budget.case_b_proof.payload) !== value.budget.case_b_proof.proof_digest)) {
      return refuse('replan_transaction_budget_invalid');
    }
    if (typeof value.planner.packet_path !== 'string' || typeof value.planner.child_path !== 'string'
        || typeof value.planner.dispatch_nonce !== 'string' || !value.planner.dispatch_nonce
        || typeof value.planner.profile_identity !== 'string' || !value.planner.profile_identity
        || !(value.planner.packet_digest === null || HEX64_RE.test(String(value.planner.packet_digest || '')))
        || !(value.planner.attestation_digest === null || HEX64_RE.test(String(value.planner.attestation_digest || '')))) {
      return refuse('replan_transaction_planner_invalid');
    }
    const expectedDispatchNonce = sha256Canonical({
      transaction_id: value.transaction_id,
      role: 'workflow-planner',
      planner_attempt: value.planner_attempt,
    }).slice(0, 12);
    if (value.planner.dispatch_nonce !== expectedDispatchNonce) {
      return refuse('replan_transaction_planner_invalid');
    }

    const casNames = ['prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation'];
    for (const seam of casNames) {
      const record = value.cas[seam];
      if (record == null) {
        if (seam === 'prepare') return refuse('replan_transaction_cas_invalid', seam);
        continue;
      }
      if (!isPlainObject(record) || record.seam !== seam || !['match', 'mismatch'].includes(record.result)
          || !HEX64_RE.test(String(record.candidate_digest || ''))
          || record.claim_root_base_digest !== value.parent.claim_root_base_digest
          || !HEX64_RE.test(String(record.inherited_frontier_digest || ''))) {
        return refuse('replan_transaction_cas_invalid', seam);
      }
    }
    if (value.cas.prepare.result !== 'match') return refuse('replan_transaction_cas_invalid', 'prepare');

    const phaseByFailedSeam = {
      prepare: 'prepared',
      pre_freeze: 'planner_pending',
      pre_snapshot: 'child_frozen',
      pre_activation: 'parent_archived',
    };
    if (value.planner_attempt !== value.attempts.length + 1) {
      return refuse('replan_transaction_attempt_invalid');
    }
    for (let index = 0; index < value.attempts.length; index++) {
      const attempt = value.attempts[index];
      const failure = attempt && attempt.failure;
      const prepareCas = attempt && attempt.prepare_cas;
      const failedCas = attempt && attempt.failed_cas;
      if (!isPlainObject(attempt) || attempt.schema_version !== 1
          || !HEX64_RE.test(String(attempt.transaction_id || ''))
          || attempt.outcome !== 'candidate_changed'
          || attempt.planner_attempt !== index + 1
          || !isPlainObject(failure) || failure.reason !== 'replan_candidate_changed'
          || phaseByFailedSeam[failure.seam] !== attempt.phase
          || !isPlainObject(prepareCas) || !isPlainObject(failedCas)
          || !isPlainObject(failure.expected) || !isPlainObject(failure.actual)) {
        return refuse('replan_transaction_attempt_invalid', String(index));
      }
      const tuples = [prepareCas, failedCas, failure.expected, failure.actual];
      if (tuples.some(tuple => !HEX64_RE.test(String(tuple.candidate_digest || ''))
          || tuple.claim_root_base_digest !== value.parent.claim_root_base_digest
          || !HEX64_RE.test(String(tuple.inherited_frontier_digest || '')))
          || canonicalJson(prepareCas) !== canonicalJson(failure.expected)
          || canonicalJson(failedCas) !== canonicalJson(failure.actual)) {
        return refuse('replan_transaction_attempt_invalid', String(index));
      }
      let priorFrontier;
      try { priorFrontier = digestInheritedFrontierView(attempt.prepare_inherited_frontier_view); }
      catch (_) { return refuse('replan_transaction_attempt_invalid', String(index)); }
      if (priorFrontier.inherited_frontier_digest !== prepareCas.inherited_frontier_digest) {
        return refuse('replan_transaction_attempt_invalid', String(index));
      }
      const expectedPriorId = sha256Canonical({
        schema_version: value.schema_version,
        epoch_lineage_id: value.epoch_lineage_id,
        parent_plan_epoch: value.parent.plan_epoch,
        parent_plan_hash: value.parent.plan_hash,
        source_reason: value.source.source_reason,
        source_attempt_ids: sourceIds.slice().sort(),
        prepare_candidate_digest: prepareCas.candidate_digest,
        prepare_inherited_frontier_digest: prepareCas.inherited_frontier_digest,
      });
      if (attempt.transaction_id !== expectedPriorId) {
        return refuse('replan_transaction_attempt_invalid', String(index));
      }
      for (const artifact of [attempt.child, attempt.attestation]) {
        if (artifact === null) continue;
        if (!isPlainObject(artifact) || !HEX64_RE.test(String(artifact.digest || ''))
            || typeof artifact.bytes_base64 !== 'string'
            || sha256Hex(Buffer.from(artifact.bytes_base64, 'base64')) !== artifact.digest) {
          return refuse('replan_transaction_attempt_invalid', String(index));
        }
      }
    }

    let sawNotStarted = false;
    let completed = 0;
    for (const step of REPLAN_ACTIVATION_STEPS) {
      const record = value.activation[step];
      if (!isPlainObject(record) || !['not_started', 'complete'].includes(record.status)) {
        return refuse('replan_activation_journal_invalid', step);
      }
      if (record.status === 'not_started') sawNotStarted = true;
      else {
        if (sawNotStarted || !HEX64_RE.test(String(record.digest || ''))) {
          return refuse('replan_activation_journal_invalid', step);
        }
        completed++;
      }
    }
    if (['prepared', 'planner_pending', 'child_frozen'].includes(value.phase) && completed !== 0) {
      return refuse('replan_activation_journal_invalid');
    }
    if (value.phase === 'committed' && completed < REPLAN_ACTIVATION_STEPS.indexOf('transaction_committed') + 1) {
      return refuse('replan_activation_journal_invalid', 'transaction_committed');
    }
    if (value.phase !== 'committed' && completed >= REPLAN_ACTIVATION_STEPS.indexOf('transaction_committed') + 1) {
      return refuse('replan_activation_journal_invalid', 'transaction_committed');
    }
    if (['child_frozen', 'parent_archived', 'committed'].includes(value.phase)) {
      if (!HEX64_RE.test(String(value.child.digest || ''))
          || !HEX64_RE.test(String(value.child.plan_hash || ''))
          || !HEX64_RE.test(String(value.child.semantic_digest || ''))
          || !HEX64_RE.test(String(value.child.ledger_digest || ''))
          || value.child.all_pending !== true || typeof value.child.bytes_base64 !== 'string'
          || sha256Hex(Buffer.from(value.child.bytes_base64, 'base64')) !== value.child.digest) {
        return refuse('replan_transaction_child_invalid');
      }
      if (value.schema_version === 2
          && (typeof value.child.first_node_id !== 'string' || !value.child.first_node_id
            || typeof value.child.first_node_role !== 'string' || !value.child.first_node_role)) {
        return refuse('replan_transaction_child_invalid');
      }
    }
    if (['parent_archived', 'committed'].includes(value.phase)) {
      if (!HEX64_RE.test(String(value.snapshot.manifest_digest || ''))
          || !HEX64_RE.test(String(value.snapshot.manifest_self_digest || ''))
          || value.snapshot.verified !== true) return refuse('replan_transaction_snapshot_invalid');
    }
    const authorityProjection = value.snapshot.authority_projection;
    const authorityDigest = value.snapshot.authority_digest;
    if (authorityProjection != null || authorityDigest != null) {
      if (!isPlainObject(authorityProjection) || authorityProjection.schema_version !== 2
          || !HEX64_RE.test(String(authorityDigest || ''))
          || sha256Canonical(authorityProjection) !== authorityDigest
          || authorityProjection.transaction_id !== value.transaction_id
          || authorityProjection.epoch_lineage_id !== value.epoch_lineage_id
          || authorityProjection.parent_plan_epoch !== value.parent.plan_epoch) {
        return refuse('replan_snapshot_authority_invalid');
      }
    } else if (value.phase !== 'committed') {
      return refuse('replan_snapshot_authority_invalid');
    }
    if (value.phase === 'committed') {
      if (!value.cas.pre_activation || value.cas.pre_activation.result !== 'match') {
        return refuse('replan_transaction_cas_invalid', 'pre_activation');
      }
      const expectedCommit = sha256Canonical({
        epoch: value.parent.plan_epoch + 1,
        plan_hash: value.child.plan_hash,
        count: value.budget.prospective_count_after,
        snapshot: value.snapshot.manifest_digest,
      });
      if (value.activation.transaction_committed.digest !== expectedCommit) {
        return refuse('replan_activation_journal_invalid', 'transaction_committed');
      }
    }
    return { ok: true, transaction: value };
  } catch (_) {
    return refuse('replan_transaction_invalid');
  }
}

function readReplanFence(stateContent, transaction) {
  const state = parseStateFields(stateContent);
  const stateStatus = state.replan_status || 'none';
  const stateTx = state.replan_transaction_id || 'none';
  if (!transaction) {
    if (stateStatus === 'none' && stateTx === 'none') return { ok: true, fenced: false, state };
    // THE ORPHANED FENCE: the state carries a fence whose transaction file is gone. The remedy
    // already exists and is mechanical — `replan abort` writes an abort record under
    // `phase: 'orphaned_fence'` and drops the fence — so the only thing this arm owes an operator
    // is NAMING it. `abort` is CAS-targeted, and on this arm the id it accepts is the one the
    // STATE records (the only id that still exists anywhere), so the id is carried out with the
    // verb: without it the command cannot even be reconstructed by hand. `replan resume` is NOT
    // the exit here — it refuses `replan_transaction_missing` and the wedge survives.
    return { ok: false, fenced: true, reason: 'replan_integrity_mismatch',
      phase: 'orphaned_fence', transaction_id: stateTx,
      legal_mutation: 'replan abort', state };
  }
  const checked = validateReplanTransaction(transaction);
  if (!checked.ok) {
    // THE VALIDATION ARM — the fourth arm, and it splits THREE ways rather than one. It is reached
    // by the same corruption class as the other three, so answering it with nothing is the same
    // permanent stuck state the orphaned arm above was taught to escape.
    //
    // The discriminator is whether the payload can still prove WHERE the epoch stands. A phase
    // only counts when the object carries a recognised one: an unparseable file arrives here as
    // `{}` (the readers' present-but-unreadable sentinel), and a payload that cannot name its
    // phase cannot prove it is pre-activation.
    //
    //   * PRE-ACTIVATION, phase readable -> `replan abort` genuinely works; NAME it, with the id
    //     the FILE records, because that is the id `abort` CAS-matches when the file is present.
    //   * PAST THE WALL, or phase unreadable -> NEITHER verb accepts. `resume` re-validates and
    //     hands back the identical code; `abort` refuses `replan_abort_irreversible` (whose own
    //     `legal_next` points back at `resume`) or `replan_abort_undecidable` (which already names
    //     `consent`). Naming a replan verb here prints a route that dead-ends on arrival — the
    //     same defect one hop further out — so the honest answer is the ESCALATION itself, and no
    //     command. `consent` is already the vocabulary `abortReplan` uses for exactly this.
    // NAMING `abort` REQUIRES AN ID `abort` WILL ACCEPT, and on this arm the file is present, so
    // `abortReplan` CAS-matches `String(raw.transaction_id || 'none')` — the FILE's id, never the
    // state's. A missing `transaction_id` is one of the things that MAKES a payload schema-invalid,
    // so it lands here routinely, and falling back to the state id would print
    // `abort --transaction <stateId>` against a file recording `none`: refused
    // `replan_abort_transaction_mismatch` on arrival. That is the dead route this whole issue
    // exists to remove, rebuilt one corner over.
    //
    // The orphaned arm above CAN fall back to the state id, and the difference is not a style
    // choice: with no file, `abort` takes its `!raw` branch and compares against the STATE, where
    // that id is the right one. Same fallback, opposite outcome, decided by which branch the file's
    // presence sends `abort` down. So an id is only nameable here when the FILE carries it.
    const phase = isPlainObject(transaction) && typeof transaction.phase === 'string'
      ? transaction.phase : null;
    const fileId = isPlainObject(transaction) && typeof transaction.transaction_id === 'string'
      && transaction.transaction_id.trim() ? transaction.transaction_id : null;
    const abortable = REPLAN_ABORTABLE_PHASES.includes(phase) && Boolean(fileId);
    return { ok: false, fenced: true, reason: checked.reason,
      phase: phase || 'unknown', transaction_id: fileId || stateTx,
      legal_mutation: abortable ? 'replan abort' : 'consent', state };
  }
  const preFenceCrash = transaction.phase === 'prepared' && stateStatus === 'none' && stateTx === 'none';
  if (!preFenceCrash && stateTx !== transaction.transaction_id) {
    // The fence names one transaction and the file on disk names another. Both exits exist; WHICH
    // one is legal is decided by the same irreversibility wall `abortReplan` enforces, read off
    // this transaction: through `child_frozen` the parent epoch has not been snapshotted, so the
    // discard exit is open — and a transaction that validated above can only carry ZERO entered
    // activation steps in those phases, so the phase alone decides it. Past that line the epoch is
    // rotating and the only exit is rolling forward. The id named is the one the FILE records,
    // because that is the id `abort` CAS-matches when the file is present; naming the fence's
    // stranded id would print a command that refuses `replan_abort_transaction_mismatch` on
    // arrival, which is worse than printing none.
    const abortable = REPLAN_ABORTABLE_PHASES.includes(transaction.phase);
    return { ok: false, fenced: true, reason: 'replan_integrity_mismatch',
      phase: transaction.phase, transaction_id: transaction.transaction_id,
      legal_mutation: abortable ? 'replan abort' : 'replan resume', state, transaction };
  }
  const committed = transaction.phase === 'committed'
    && transaction.activation.transaction_committed.status === 'complete'
    && transaction.activation.state_unfenced.status === 'complete';
  if (committed && stateStatus === 'none'
      && stateTx === transaction.transaction_id
      && state.replan_phase === 'committed'
      && state.epoch_lineage_id === transaction.epoch_lineage_id
      && Number(state.plan_epoch) === transaction.parent.plan_epoch + 1
      && state.active_plan_hash === transaction.child.plan_hash
      && state.active_snapshot_manifest_digest === transaction.snapshot.manifest_digest) {
    return { ok: true, fenced: false, committed: true, state, transaction };
  }
  if (committed) {
    return { ok: false, fenced: true, reason: 'replan_integrity_mismatch',
      phase: transaction.phase, transaction_id: transaction.transaction_id,
      legal_mutation: 'replan resume', state, transaction };
  }
  return {
    ok: true,
    fenced: true,
    reason: 'replan_in_progress',
    phase: transaction.phase,
    transaction_id: transaction.transaction_id,
    legal_mutation: 'replan resume',
    state,
    transaction,
  };
}

// `projectMutationGuard` was DELETED here (#847-J). It projected the fence but dropped everything
// the fence resolved on its `!fence.ok` arms — precisely the arms #847 taught to name an exit —
// leaving a static per-condition route that cannot be correct for all four, since the four arms
// have different correct exits. It had no call site in any of the four editions: definition,
// export and one comment, nothing else. An unreferenced export cannot wedge an operator, so there
// was no wedge to repair, only a decoy to remove.

function snapshotManifestDigest(manifest) {
  if (!isPlainObject(manifest)) throw new Error('snapshot_manifest_invalid');
  const copy = Object.assign({}, manifest);
  delete copy.manifest_self_digest;
  return sha256Canonical(copy);
}

function validateSnapshotManifestShape(manifest) {
  if (!isPlainObject(manifest) || ![1, 2].includes(manifest.schema_version)
      || !Number.isSafeInteger(manifest.parent_plan_epoch) || manifest.parent_plan_epoch < 1
      || !HEX64_RE.test(String(manifest.epoch_lineage_id || ''))
      || !HEX64_RE.test(String(manifest.transaction_id || ''))
      || !Array.isArray(manifest.files)
      || manifest.files.some(file => !isPlainObject(file) || !safeRelativePath(file.path)
        || !Number.isSafeInteger(file.size) || file.size < 0
        || !/^[0-7]{3,4}$/.test(String(file.mode || ''))
        || !HEX64_RE.test(String(file.digest || '')))
      || !HEX64_RE.test(String(manifest.manifest_self_digest || ''))
      || snapshotManifestDigest(manifest) !== manifest.manifest_self_digest) {
    return { ok: false, reason: 'snapshot_manifest_invalid' };
  }
  if (manifest.schema_version === 2) {
    if (!isPlainObject(manifest.snapshot_authority_projection)
        || manifest.snapshot_authority_projection.schema_version !== 2
        || !HEX64_RE.test(String(manifest.snapshot_authority_digest || ''))
        || sha256Canonical(manifest.snapshot_authority_projection) !== manifest.snapshot_authority_digest
        || !isPlainObject(manifest.child)
        || manifest.child.path !== REPLAN_PLAN_NEXT_NAME
        || !HEX64_RE.test(String(manifest.child.digest || ''))
        || !HEX64_RE.test(String(manifest.child.plan_hash || ''))
        || !HEX64_RE.test(String(manifest.child.attestation_digest || ''))) {
      return { ok: false, reason: 'snapshot_authority_shape_invalid' };
    }
    const receiptShape = (receipt, kind) => receipt === null || (isPlainObject(receipt)
      && HEX64_RE.test(String(receipt.digest || ''))
      && Number.isSafeInteger(receipt.size) && receipt.size > 0
      && HEX64_RE.test(String(receipt.transaction_id || ''))
      && (kind === 'transaction'
        ? REPLAN_TRANSACTION_SCHEMA_VERSIONS.includes(receipt.schema_version)
          && receipt.path === '.cache/committed-transactions/' + receipt.transaction_id + '.json'
        : receipt.path === '.cache/replan-sources/' + receipt.digest + '.json'));
    if ((Object.prototype.hasOwnProperty.call(manifest, 'transaction_predecessor')
          && !receiptShape(manifest.transaction_predecessor, 'transaction'))
        || (Object.prototype.hasOwnProperty.call(manifest, 'rotated_source')
          && !receiptShape(manifest.rotated_source, 'source'))) {
      return { ok: false, reason: 'snapshot_history_receipt_invalid' };
    }
  }
  const paths = manifest.files.map(file => file.path);
  const folded = paths.map(file => file.toLocaleLowerCase('en-US'));
  if (new Set(paths).size !== paths.length
      || new Set(folded).size !== folded.length
      || JSON.stringify(paths) !== JSON.stringify(paths.slice().sort())) {
    return { ok: false, reason: 'snapshot_manifest_index_invalid' };
  }
  return { ok: true, manifest };
}

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
// which is TERMINAL (clear-halt accepts only consent|security, so it never resumes). The synthesizer RAISES it: a real conflict bails
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

// The DECOY consent-halt detector — ONE rule, ONE wording, shared by BOTH freeze doors: the
// adaptive-handoff entry and `plan-validator --freeze`, the writer the handoff shells and a
// documented public CLI in its own right. A guard living at only one door is a guard on one of two
// doors, and two copies of one refusal is how the typed reason acquires a second spelling; the token
// and the operator prose therefore live HERE, beside the marker they are about.
//
// The discriminator is NEVER-FROZEN, not the marker alone. A GENUINE halt sits on a FROZEN, mid-run
// plan whose marker write-halt wrote; that plan must still re-freeze (the plan-repair path) and must
// still carry the marker out the other side, or the fix converts the consent valve into a freeze
// refusal. An UNFROZEN draft has never run, so a marker on it cannot be a real halt: it is copied in
// from an archived plan used as a skeleton, and because computePlanHash covers `## Meta` + `## Nodes`
// only it would ride the freeze unremarked and wedge the run's very first open-next on halt_pending.
//
// REFUSE rather than strip: stripping would silently clear a consent the user may still be owed.
// PURE (no fs, content only). Returns null when there is nothing to refuse, else the typed
// { reason, error } the caller emits verbatim.
const DECOY_CONSENT_HALT_REASON = 'decoy_consent_halt';
function detectDecoyConsentHalt(planContent) {
  const text = String(planContent || '');
  if (/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(text)) return null;
  if (!readDurableConsentHalt(text)) return null;
  return {
    reason: DECOY_CONSENT_HALT_REASON,
    error: DECOY_CONSENT_HALT_REASON + ': the plan draft carries "' + CONSENT_HALT_MARKER
      + '" in its ## Node Ledger, but nothing has run yet — a fresh run cannot be halted for a '
      + 'consent no one asked for, and the first open-next would refuse halt_pending. The marker '
      + 'is written by write-halt and cleared by clear-halt; it is never authored. Remove the '
      + '"' + CONSENT_HALT_MARKER + '" line from the ## Node Ledger section and '
      + 're-submit (it is most likely copied in from an archived plan used as a skeleton).',
  };
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

// The ROLE-CAPABILITY MANIFEST — the declared role -> capability table the planner is served at
// author time, so the `role` column of a frozen plan is chosen against what a role CAN DO rather
// than against what its NAME suggests. A role name is not a capability: "code-explorer" reads as
// exactly right for a forensic investigation whose brief happens to run a build, and the closed-
// library check only proves the role EXISTS, never that its manifest covers what the brief demands.
//
// DECLARED, not parsed. Only the Claude profiles carry a `tools:` front-matter field at all — the
// Codex/opencode/Kimi profile files have no tools key — so installed-profile parsing cannot be the
// source of truth on three of the four runtimes. The table is pinned to the canonical profiles by a
// bidirectional drift wall in validate-vendored-agents.js (a role added to `agents/` without a row,
// a row without a profile, or any tools/bash/write divergence reds the chain), which is what makes
// a declared constant safe rather than a second copy that silently rots.
//
// Rows:
//   tools          the exact tool manifest, byte-equal to the profile front matter (as a SET)
//   bash_capable   Bash ∈ tools — the one capability that separates "can report on" from "can run"
//   write_capable  Write ∈ tools
//   kind           the role's slot in the library (see ROLE_KINDS)
//
// Evidence transport is deliberately NOT a field: every role self-persists its deliverable to the
// seeded evidence file, so a per-role evidence mode would be a constant wearing a variable's clothes.
//
// Built-in role tokens (finalize / main-session-gate / expansion-point) are declared with an empty
// tool manifest: they are plan vocabulary the main session performs itself, never dispatched as a
// subagent and never backed by a profile on disk.
const ROLE_KINDS = Object.freeze(['producer', 'implement', 'write', 'gate', 'orchestration', 'built-in']);
const ROLE_CAPABILITY_MANIFEST = Object.freeze({
  // Read producers — investigate and report; their deliverable is findings, not edits.
  'code-explorer':        Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob']), bash_capable: false, write_capable: true, kind: 'producer' }),
  'planner':              Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob']), bash_capable: false, write_capable: true, kind: 'producer' }),
  'knowledge-lookup':     Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'mcp__context7__resolve-library-id', 'mcp__context7__query-docs', 'WebSearch', 'WebFetch']), bash_capable: false, write_capable: true, kind: 'producer' }),
  'code-architect':       Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob', 'Bash']), bash_capable: true, write_capable: true, kind: 'producer' }),
  'investigator':         Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob', 'Bash']), bash_capable: true, write_capable: true, kind: 'producer' }),
  // Implement roles — originate code against a declared write set.
  'tdd-guide':            Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Edit', 'Bash', 'Grep']), bash_capable: true, write_capable: true, kind: 'implement' }),
  'implementer':          Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Edit', 'Bash', 'Grep']), bash_capable: true, write_capable: true, kind: 'implement' }),
  'build-error-resolver': Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']), bash_capable: true, write_capable: true, kind: 'implement' }),
  'metric-optimizer':     Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Edit', 'Bash', 'Grep']), bash_capable: true, write_capable: true, kind: 'implement' }),
  // Write roles — mutate tracked files without originating a feature.
  'doc-updater':          Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob']), bash_capable: true, write_capable: true, kind: 'write' }),
  'synthesizer':          Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Edit', 'Bash', 'Grep']), bash_capable: true, write_capable: true, kind: 'write' }),
  // Gates — render a verdict on a recorded claim; never originate the evidence they judge.
  'code-reviewer':        Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob', 'Bash']), bash_capable: true, write_capable: true, kind: 'gate' }),
  'security-reviewer':    Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob', 'Bash']), bash_capable: true, write_capable: true, kind: 'gate' }),
  'adversarial-verifier': Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Grep', 'Glob', 'Bash']), bash_capable: true, write_capable: true, kind: 'gate' }),
  // Orchestration roles — never authored as plan nodes; they drive the run, not a node in it.
  'workflow-planner':     Object.freeze({ tools: Object.freeze(['Read', 'Write', 'Bash', 'Grep', 'Glob']), bash_capable: true, write_capable: true, kind: 'orchestration' }),
  // Built-in plan vocabulary — performed by the main session, never dispatched, no profile on disk.
  'finalize':             Object.freeze({ tools: Object.freeze([]), bash_capable: false, write_capable: false, kind: 'built-in' }),
  'main-session-gate':    Object.freeze({ tools: Object.freeze([]), bash_capable: false, write_capable: false, kind: 'built-in' }),
  'expansion-point':      Object.freeze({ tools: Object.freeze([]), bash_capable: false, write_capable: false, kind: 'built-in' }),
});

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

// PURE (no fs): the REPAIR-RESPONSIBILITY population. Deliberately NOT the same set as
// `unresolvedInScopeFixes` above, because the two answer opposite questions and therefore fail in
// opposite directions:
//
//   - the GATE asks "does this finding block closing?" and must answer NO unless the reviewer
//     EXPLICITLY wrote scope=in_scope action=fix, so that omission cannot manufacture a blocker;
//   - REPAIR asks "is this writer responsible for this finding?" and must answer YES unless the
//     finding is PROVABLY non-blocking, so that omission cannot make a finding silently vanish
//     from a fixer's brief or from the cross-writer ownership partition.
//
// Using the gate predicate here is a FAIL-OPEN bug: a schema-1 flat row such as
// `finding: id=F-A status=open severity=high file=scripts/a.js` carries neither scope nor action,
// so the gate set excludes it, and a brief built from that set silently truncates to a
// single-writer assignment — exactly the "fixer told to fix nothing / mixed ownership silently
// narrowed" defect this predicate exists to prevent.
//
// Exclusion is therefore by POSITIVE PROOF of non-blocking only: an explicitly resolved/deferred
// status, an explicitly non-`in_scope` scope, or an explicitly non-`fix` action. A row missing
// those fields is INCLUDED. `deferred` stays excluded — it is the reviewer's explicit statement
// that the finding is not to be fixed now, and treating it as must-fix is an over-refusal.
function repairResponsibleFindings(findings) {
  return (Array.isArray(findings) ? findings : []).filter(f => {
    if (!f) return false;
    if (f.status === 'resolved' || f.status === 'deferred') return false;
    if (f.scope != null && f.scope !== '' && f.scope !== 'in_scope') return false;
    if (f.action != null && f.action !== '' && f.action !== 'fix') return false;
    return true;
  });
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
// findingAnchorCarriesPath — THE single predicate for "does this anchor kind name a repository PATH?".
// normalizeFindingAnchor branches on it, ROUTABLE_FINDING_ANCHOR_KINDS is DERIVED from it, and the
// record-time routability gate plus the open-time seeded reviewer stub both read that derived constant.
// One predicate, so the kinds a reviewer is SHOWN as routable, the kinds a change gate ADMITS as
// blocking, and the kinds ownership resolution can actually resolve can never drift apart.
//
// WHY IT MATTERS: every downstream router keys on the path — the write-set owner lookup
// (declared_write_set -> owning writer) and the spine milestone lookup (expected_surfaces -> owning
// expansion point). An anchor with no path resolves to NEITHER, so a blocking finding carrying one has
// no in-plan repair target at all.
function findingAnchorCarriesPath(kind) { return String(kind || '') !== 'evidence_observation'; }
const ROUTABLE_FINDING_ANCHOR_KINDS = Object.freeze(FINDING_ANCHOR_KINDS.filter(findingAnchorCarriesPath));
const FINDING_FAILURE_CLASSES = Object.freeze([
  'correctness', 'security', 'data_loss', 'concurrency', 'persistence', 'compatibility',
  'contract', 'validation', 'test_coverage', 'scope_regression', 'performance_regression',
]);
// HEX64_RE, isPlainObject, canonicalJson and sha256Hex are defined once near the top of this module
// (the #692/#699 epoch-authority block) and reused here by the schema-2 review engine; the byte-identical
// duplicates that landed with the #693/#696/#697/#698 merge were removed to keep a single module-scope
// definition (a second `const HEX64_RE` is a redeclaration error, and TDZ forbids relying on the later copy).
const SHA1_RE = /^[0-9a-f]{40}$/i;
const TREE_MODE_RE = /^[0-7]{6}$/;

// #761 (carry-forward from #759) — the OPTIONAL expansion_id binding on a review-journal attempt.
// An expansion record's id is `<point>#<ordinal>` (see the plan-validator's expansionUnitId /
// parseExpansionRecords): the point contains no `#`, `|`, whitespace, or newline (those are the record
// grammar's own delimiters), and the ordinal is a positive integer. A re-expansion produces a SECOND
// record on the same point, so a re-review's journal attempt must name WHICH record it reviewed — that
// is exactly this field. It is OPTIONAL AND IGNORED WHEN ABSENT (an in-flight journal minted before
// this field existed stays valid), and VALIDATED WHEN PRESENT (a malformed value is a typed refusal —
// a binding that cannot be trusted must never pass as if it bound nothing).
const EXPANSION_ID_RE = /^[^\s#|]+#[1-9][0-9]*$/;
// expansionIdFieldOk — QUESTION: "is this attempt's expansion_id field acceptable?" FAILS CLOSED on a
// present-but-malformed value; PASSES on absence (the in-flight-tolerance direction) and on a
// well-formed record id. Returns true/false; the caller emits the typed refusal.
function expansionIdFieldOk(attempt) {
  if (!attempt || !Object.prototype.hasOwnProperty.call(attempt, 'expansion_id')) return true;
  const v = attempt.expansion_id;
  if (v === null) return true;                       // explicit "reviewed no re-expansion record"
  return typeof v === 'string' && v.length <= 256 && EXPANSION_ID_RE.test(v);
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
  const path = findingAnchorCarriesPath(kind) ? normalizeFindingPath(value.path) : null;
  if (findingAnchorCarriesPath(kind) && !path) return { ok: false, reason: 'finding_anchor_path_invalid' };
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
    } else if (findingAnchorCarriesPath(kind) && (!expected
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
  // TWO legitimate delta boundaries. (1) The ordinary one: the previous lineage attempt is a
  // settled, consumed FAIL — the repair the current candidate answers. (2) A FOLDED settled
  // PASS: repair-node folded this gate while repairing a SIBLING gate's failure and durably
  // recorded the boundary tuple on this attempt (the fold marker — the folding repair's
  // attempt id, its selected writer, and this attempt's sealed pass candidate digest/declared
  // map). The marker is validated fail-closed by the journal validator and cross-checked here
  // against the attempt's own sealed partition; a marker that disagrees with it is tampering,
  // never a delta source.
  const fold = isPlainObject(previous.fold) ? previous.fold : null;
  let boundary = null;
  const selectedWriter = previous.repair && previous.repair.selected_writer;
  if (previous.outcome === 'fail' && previous.lifecycle_settled === true
    && selectedWriter && previous.repair.settled === true
    && previous.consumed_by === selectedWriter) {
    boundary = { repair_attempt_id: String(previous.attempt_id), selected_writer: String(selectedWriter) };
  } else if (previous.outcome === 'pass' && previous.lifecycle_settled === true && fold
    && typeof fold.repair_attempt_id === 'string' && fold.repair_attempt_id
    && typeof fold.selected_writer === 'string' && fold.selected_writer
    && fold.candidate_digest === before.digest
    && canonicalJson(fold.candidate_declared) === canonicalJson(before.declared)) {
    boundary = { repair_attempt_id: fold.repair_attempt_id, selected_writer: fold.selected_writer };
  }
  if (!boundary
    || !HEX64_RE.test(String(before.digest || ''))
    || !HEX64_RE.test(String(current.digest || ''))
    || !isCanonicalBlobMap(before.declared) || !isCanonicalBlobMap(current.declared)) {
    // A sealed pass WITHOUT a fold marker is a journal written before fold markers existed:
    // still a hard refusal, but name the sanctioned, documented recovery (release-and-adopt or
    // replan) instead of leaving a bare dead end.
    if (previous.outcome === 'pass' && previous.lifecycle_settled === true) {
      return { ok: false, reason: 'review_repair_delta_unavailable',
        detail: 'the gate\'s previous lineage attempt is a settled pass with no recorded fold boundary '
          + '(a journal written before fold markers existed); sanctioned recovery: release-and-adopt '
          + '(claim release, then a fresh adopt-candidate claim) or a replan prepare from a '
          + 'repair_requires_replan refusal' };
    }
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
    repair_attempt_id: boundary.repair_attempt_id,
    selected_writer: boundary.selected_writer,
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
  // Fold-boundary steady state: when the caller flags this closure as a folded-pass
  // re-certification (the previous lineage attempt is a sealed pass carrying a fold marker),
  // the gate legitimately re-presents an UNCHANGED frontier — its sealed pass had no open
  // findings to shrink. At that boundary, frontier-EQUAL plus proof-clean plus validation-pass
  // is convergence: the re-certification of the repaired tree IS the progress. Without the
  // flag the strict frontier-shrink rule stands unchanged.
  const foldBoundary = value.fold_boundary === true;
  const frontierConverged = current.length < previous.length
    || (foldBoundary && current.length === previous.length);
  const progress = !scopeExpanded && frontierConverged && allResolved && validationPass;
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
  // Fold-marker cross-reference index (see the attempt.fold check below): a marker may only
  // name a folding attempt that exists in THIS journal.
  const attemptsById = new Map();
  for (const row of journal.attempts) {
    if (row && typeof row.attempt_id === 'string' && !attemptsById.has(row.attempt_id)) {
      attemptsById.set(row.attempt_id, row);
    }
  }
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
    // #761: OPTIONAL expansion_id binding — a re-review's attempt names WHICH expansion record it
    // reviewed. Absent => valid (in-flight tolerance). Present-and-malformed => typed refusal.
    if (!expansionIdFieldOk(attempt)) {
      return refuseJournal('review_journal_malformed', 'expansion_id must be a <point>#<ordinal> record id or null');
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
      // Fail-closed re-validation: never trust the STORED blocking_findings/domain_outcome pair —
      // recompute the open-blocker count from receipt.findings (the same predicate ingestion uses)
      // and re-assert approved ⇒ zero open findings, so a hand-crafted receipt cannot carry an open
      // blocker behind a gate_effect:pass.
      const openCount = receipt.findings.filter(finding =>
        isPlainObject(finding) && finding.status !== 'resolved').length;
      if (receipt.blocking_findings !== openCount
        || (attempt.reducer.role !== 'adversarial-verifier'
          && ((receipt.domain_outcome === 'approved' && openCount > 0)
            || (receipt.domain_outcome === 'changes_requested' && openCount === 0)))) {
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
          && row.repair.settled === true && row.consumed_by != null).length,
        // The previous attempt was shape-validated in its own iteration, so a present fold
        // marker is a proven folded-pass boundary here (mirrors the close-side computation).
        fold_boundary: previous.outcome === 'pass' && isPlainObject(previous.fold) });
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
    // The fold boundary marker. repair-node durably records this tuple on a gate attempt it
    // folds whose latest outcome is a settled PASS, so a later reopen of that gate synthesizes
    // the repair delta from the boundary (deriveRepairDelta) instead of wedging on
    // review_repair_delta_unavailable. The marker lives in the journal — never in the purged
    // `.cache/<gate>.md` receipt, whose fold-time purge stays exactly as conservative. Shape is
    // fail-closed: exact keys, sealed-pass-only, the captured candidate byte-equal to the
    // attempt's own sealed partition, and the referenced folding attempt must be a REAL failed
    // attempt in this journal whose selected writer matches the marker's.
    if (attempt.fold !== undefined) {
      const fold = attempt.fold;
      const folding = isPlainObject(fold) && typeof fold.repair_attempt_id === 'string'
        ? attemptsById.get(fold.repair_attempt_id) : undefined;
      if (!isPlainObject(fold)
        || Object.keys(fold).sort().join(',') !== 'candidate_declared,candidate_digest,repair_attempt_id,selected_writer'
        || typeof fold.repair_attempt_id !== 'string' || !fold.repair_attempt_id
        || typeof fold.selected_writer !== 'string' || !fold.selected_writer
        || !HEX64_RE.test(String(fold.candidate_digest || ''))
        || !isCanonicalBlobMap(fold.candidate_declared)
        || attempt.outcome !== 'pass' || attempt.lifecycle_settled !== true
        || fold.candidate_digest !== attempt.candidate_digest
        || canonicalJson(fold.candidate_declared) !== canonicalJson(attempt.candidate_declared)
        || !folding || folding.outcome !== 'fail'
        || !isPlainObject(folding.repair) || folding.repair.selected_writer !== fold.selected_writer) {
        return refuseJournal('review_journal_fold_marker_invalid');
      }
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

// Pure, fail-closed structural validation for the authoritative review journal. Schema-2 journals are
// dispatched to validateReviewJournalV2; schema-1 journals are validated in place. The third argument
// carries two independently-shipped, type-disjoint contracts, sniffed fail-closed: a NUMBER is the
// expected-schema-version enforcement (#693/#696/#697/#698 — reject a journal whose schema_version differs
// from the plan's verified contract); a plain OBJECT is the schema-1 fanout-reduction options (issue-699 —
// { schema2_review_gates } whose plan-owned canonical adapter rows make code/security group outcomes
// authoritative, while a metadata-absent legacy fanout keeps its historical majority rule). Any other value
// (string/array/null) selects neither behavior. No caller needs both at once: a schema-2 journal routes to
// V2 before options are read, and the options path only runs for a schema-1 journal.
function validateReviewJournal(journal, expectedPlanHash, schemaVersionOrOptions) {
  const expectedSchemaVersion = typeof schemaVersionOrOptions === 'number' ? schemaVersionOrOptions : undefined;
  const options = (schemaVersionOrOptions && typeof schemaVersionOrOptions === 'object'
    && !Array.isArray(schemaVersionOrOptions)) ? schemaVersionOrOptions : undefined;
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
  const hasSchema2Contracts = !!options && typeof options === 'object' && !Array.isArray(options)
    && Object.prototype.hasOwnProperty.call(options, 'schema2_review_gates');
  const schema2Contracts = hasSchema2Contracts ? options.schema2_review_gates : [];
  if (!Array.isArray(schema2Contracts)) {
    return refuseJournal('review_journal_schema2_contract_invalid', 'schema2_review_gates must be an array');
  }
  const contractKeys = new Set();
  const contractMembers = new Set();
  let priorContractKey = null;
  const exactContractKeys = ['aggregation', 'logical_gate_key', 'members', 'role'];
  for (const contract of schema2Contracts) {
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)
        || JSON.stringify(Object.keys(contract).sort()) !== JSON.stringify(exactContractKeys)
        || typeof contract.logical_gate_key !== 'string'
        || !['code-reviewer', 'security-reviewer'].includes(contract.role)
        || !['replicated_majority', 'partitioned_all'].includes(contract.aggregation)
        || !Array.isArray(contract.members) || contract.members.length < 1
        || contract.members.some(member => typeof member !== 'string' || !member)
        || JSON.stringify(contract.members) !== JSON.stringify(Array.from(new Set(contract.members)).sort())) {
      return refuseJournal('review_journal_schema2_contract_invalid', 'schema-2 review contract shape is not canonical');
    }
    let keyView;
    try { keyView = JSON.parse(contract.logical_gate_key); }
    catch (_) { return refuseJournal('review_journal_schema2_contract_invalid', 'logical_gate_key must be canonical JSON'); }
    if (!keyView || typeof keyView !== 'object' || Array.isArray(keyView)
        || JSON.stringify(Object.keys(keyView)) !== JSON.stringify(['kind', 'origin', 'members'])
        || keyView.kind !== 'fanout'
        || !Array.isArray(keyView.origin) || !Array.isArray(keyView.members)
        || keyView.origin.some(member => typeof member !== 'string' || !member)
        || keyView.members.some(member => typeof member !== 'string' || !member)
        || JSON.stringify(keyView.origin) !== JSON.stringify(Array.from(new Set(keyView.origin)).sort())
        || JSON.stringify(keyView.members) !== JSON.stringify(contract.members)
        || canonicalLogicalGateIdentity(keyView).key !== contract.logical_gate_key) {
      return refuseJournal('review_journal_schema2_contract_invalid', 'logical_gate_key/member identity is not canonical');
    }
    if (contractKeys.has(contract.logical_gate_key)
        || (priorContractKey !== null && priorContractKey.localeCompare(contract.logical_gate_key) >= 0)) {
      return refuseJournal('review_journal_schema2_contract_invalid', 'schema-2 review contracts must have unique sorted keys');
    }
    contractKeys.add(contract.logical_gate_key);
    priorContractKey = contract.logical_gate_key;
    for (const member of contract.members) {
      if (contractMembers.has(member)) {
        return refuseJournal('review_journal_schema2_contract_invalid', 'schema-2 review contract members overlap');
      }
      contractMembers.add(member);
    }
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
    const intersectingContracts = schema2Contracts.filter(contract =>
      contract.logical_gate_key === canonical.key
      || contract.members.some(member => canonical.members.includes(member)));
    let schema2Contract = null;
    if (intersectingContracts.length) {
      const exactContracts = intersectingContracts.filter(contract =>
        contract.logical_gate_key === canonical.key
        && JSON.stringify(contract.members) === JSON.stringify(canonical.members));
      if (canonical.kind !== 'fanout' || exactContracts.length !== 1 || intersectingContracts.length !== 1) {
        return refuseJournal('review_journal_schema2_gate_mismatch');
      }
      schema2Contract = exactContracts[0];
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
      const evaluatedReceipts = attempt.receipts.map(receipt => evaluateEffectiveVerdict(receipt.body));
      const passCount = evaluatedReceipts.filter(evaluated => evaluated.pass).length;
      const blockerVeto = evaluatedReceipts.some(evaluated =>
        evaluated.findings_blocking > 0 || evaluated.unresolved_fixes.length > 0);
      let passes;
      if (!schema2Contract) {
        passes = passCount > canonical.members.length / 2;
      } else if (schema2Contract.aggregation === 'replicated_majority') {
        passes = !blockerVeto && passCount > canonical.members.length / 2;
      } else {
        passes = !blockerVeto && passCount === canonical.members.length;
      }
      const expectedOutcome = passes ? 'pass' : 'fail';
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

// The single shared global config file (one path, no per-edition namespace). A stale
// `installed_paths` field may linger in a pre-retirement config.json; it is TOLERATED on
// read (ignored) and NEVER written — adaptive is the only legal path. NO env override —
// "installed" is an on-disk fact, not a per-run toggle (#538 retired KAOLA_ENABLE_ADAPTIVE).
const CONFIG_REL_PATH = ['.config', 'kaola-workflow', 'config.json'];
const FANOUT_CAP_ENV = 'KAOLA_FANOUT_CAP';
const FANOUT_CAP_READONLY_ENV = 'KAOLA_FANOUT_CAP_READONLY';
// #364: KAOLA_BATCH_CWD_ENFORCED + resolveBatchCwdEnforced were RETIRED with the write-role
// member-worktree isolation machinery (parallel-batch.js). The harness cannot force a dispatched
// subagent's CWD, so write-role frontiers serial-degrade unconditionally. The successor enforcement
// primitive is the write-lane containment hook (#376, KAOLA_LANE_CONTAINMENT) + the per-node
// running-set scheduler (#377). See docs/decisions/0008-excise-write-role-batch-isolation.md.
// #542: the env name for the parallel-writes DEFAULT-ON opt-OUT. See parallelWritesDefaultOn.
const PARALLEL_WRITES_ENV = 'KAOLA_PARALLEL_WRITES';
// #802: the env name for the serial→parallel SEAM-CHECKPOINT DEFAULT-ON opt-OUT. See seamCheckpointDefaultOn.
const SEAM_CHECKPOINT_ENV = 'KAOLA_SEAM_CHECKPOINT';

// #813: the env name for the test-attribution DEFAULT-ON opt-OUT. See testAttributionDefaultOn.
const TEST_ATTRIBUTION_ENV = 'KAOLA_TEST_ATTRIBUTION';

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

// #542 / #760: parallel-writes-default-ON — the S3 (environment/operator) serializer. When a write
// frontier co-opens, the executor opens ISOLATED per-leg worktrees and writes them CONCURRENTLY — by
// DEFAULT, with no operator toggle. The per-leg worktree isolation (containment) + the mandatory
// post-dominating `synthesizer` reconcile are the correctness net, so the workflow must NOT downgrade
// a frontier to serial out of caution. This predicate drives `legCoupled` in the co-open / leg-
// provisioning gates. Default TRUE; an operator forces serial writes with KAOLA_PARALLEL_WRITES=0|
// false|no — the ONE named S3 serializer this file carries (a positive operator directive is
// present-tense evidence, unlike a guess). Overlapping (non-disjoint) writes are handled entirely by
// the validator's writeOverlapRelaxable ladder, NOT here: #546-G2/#593/#760 relax an ordinary (non-
// PROTECTED) overlap — proven-disjoint, exact-file-disjoint, OR genuinely uncertain (a directory/glob
// declared entry) — by DEFAULT under the retained net (a post-dominating code-reviewer gate); only a
// PROVEN same-file/case-collision overlap or a PROTECTED file still blocks, and --write-overlap-consent
// is vestigial for every relaxable class.
function parallelWritesDefaultOn(env) {
  const raw = (env || {})[PARALLEL_WRITES_ENV];
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return true;
}

// #802: seam-checkpoint-default-ON — the scheduler's REPAIR of a REMOVABLE blocker at the
// serial→parallel seam. Uncommitted production work left in the parent worktree by already-CLOSED
// serial siblings is the guaranteed product of the workflow's OWN finalize-owned-commit policy, not a
// property of the task: it is none of the three named serializers (S1 data dependency, S2 shared
// irreversible effect, S3 failed environment probe), so it must be REPAIRED before dispatch rather
// than impersonate evidence for serial. This predicate drives that repair. Default TRUE; an operator
// restores the `parent_dirty` SERIAL DEGRADE with KAOLA_SEAM_CHECKPOINT=0|false|no — the single serial
// write at the normal co-open site and the `write_awaits_drain` hold at the drain site — mirroring the
// KAOLA_PARALLEL_WRITES=0 recovery posture. The repair itself is two-outcome (commit the attributed
// dirt, or halt on unattributable dirt / a git failure) — never a retry loop, never a silent serial.
// SCOPE OF THE OPT-OUT (stated exactly, because "restores the prior behavior" would not be true): it
// restores the serial degrade ONLY. It does NOT resurrect the legless single-writer co-open that used
// to fire over a dirty parent behind a scratch-observation gate — that path is retired
// UNCONDITIONALLY, as a separate and deliberate tightening, and no toggle brings it back. So a state
// that once legless-co-opened now HOLDS under the opt-out. Both changes point the same way: the toggle
// is never LESS strict than the repair it replaces. It is a fail-closed escape hatch, not a time machine.
function seamCheckpointDefaultOn(env) {
  const raw = (env || {})[SEAM_CHECKPOINT_ENV];
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return true;
}

// #813: test-attribution-default-ON — the barrier's ALLOWLIST ranges over test-like paths exactly as
// it ranges over production paths, so a test file a node creates/edits/deletes must be DECLARED in
// that node's write set or it lands in the existing write_set_overflow / unattributed_write families.
// A verification oracle outside attribution is not an oracle: tests are what the rest of the machinery
// treats as ground truth, so they are the class whose integrity the barrier must guard hardest.
// This governs ATTRIBUTION only — test-like paths remain excluded from SENSITIVITY classification, so
// a declared `test/login.test.js` never demands a security-reviewer by pattern match.
// Default TRUE; an operator restores the pre-attribution exemption BYTE-IDENTICALLY with
// KAOLA_TEST_ATTRIBUTION=0|false|no — the bridge for plans frozen before this rule and for runs
// already in flight. The escape hatch is deliberately an ENV TOGGLE, not a tolerance band inside the
// barrier: a hidden allowband would recreate the same hole under a different name.
function testAttributionDefaultOn(env) {
  const raw = (env || {})[TEST_ATTRIBUTION_ENV];
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
// Whitespace-normalized at the append boundary: table rows stay CONTIGUOUS (a section-trailing
// blank line before the next heading must never migrate into the table) and exactly ONE blank
// line separates the table from the following heading (or a single trailing newline at EOF).
function spliceComplianceSection(content, row) {
  const sec = locateSection(content, 'Required Agent Compliance');
  if (sec.start >= 0) {
    if (sec.next >= 0) return content.slice(0, sec.next).trimEnd() + '\n' + row + '\n' + content.slice(sec.next);
    return content.trimEnd() + '\n' + row + '\n';
  }
  // Section absent — create it below `## Node Ledger` (or at EOF if no ledger).
  const led = locateSection(content, LEDGER_HEADING);
  const newSection = '\n' + COMPLIANCE_SECTION + '\n\n' + COMPLIANCE_HEADER_ROW + '\n' + COMPLIANCE_SEPARATOR + '\n' + row + '\n';
  if (led.next >= 0) return content.slice(0, led.next) + newSection + content.slice(led.next);
  return content.trimEnd() + newSection;
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
  return stampRefusalEnvelope(Object.assign({ result: 'refuse', reason: reason }, extra || {}));
}

// ===========================================================================
// THE ONE KERNEL REFUSAL REGISTRY (ADR 0013 Amendment A1 / M3)
//
// SEVEN enumerated refusal families, all located at L1 / L2 / A3. Advisories, tool
// outcomes and usage errors are NOT in the vocabulary: they carry no family, no
// registry row and no sweep obligation.
//
// Two structural rules make seven sufficient where the census found ~610 strings:
//
//   1. THE ROUTE IS A PURE FUNCTION OF THE PAYLOAD, NOT OF THE CODE. `resolveRoute`
//      dispatches through ONE resolver per family, keyed by that family's declared
//      discriminator enum. This is what lets `kernel_write_failed` route to
//      `environment` on `errno: ENOSPC` and to an idempotent retry verb on a
//      subprocess non-ok WITHOUT minting a second code.
//   2. DUAL EMISSION DURING MIGRATION. Every refusal carries its family AND the
//      legacy `condition` token. `condition` is a payload VALUE, never a registry
//      key — it is diagnostic text and the P2 census metric, and the count of
//      distinct `condition` values is what counts down to zero.
//
// WHY THIS CANNOT BECOME A HAND-KEPT MIRROR (the ADR's named failure mode — "at 459
// codes a unified table would be one more hand-kept compliance mirror of the kind
// #833 subtracts"):
//   - It has SEVEN rows and cannot grow. `test-refusal-route-sweep.js` parses the
//     enumerated list out of the ADR markdown and asserts it equals the registry key
//     set exactly. The registry has no independent content to drift WITH.
//   - The route column is a FUNCTION, not a table of incidents. Each family's route
//     table is keyed by that family's own payload-schema enum, and the sweep asserts
//     the two key sets are equal IN BOTH DIRECTIONS. A discriminator value with no
//     route is a build failure; a route for a value the schema does not declare is a
//     build failure. There is nowhere for a stale row to hide.
//   - The legacy conditions live in an ORDERED CLASSIFIER (pattern rules), not as
//     registry keys. Adding a legacy condition adds no row anywhere.
//
// FORGE-NEUTRALITY IS LOAD-BEARING HERE. This file is byte-copied (never
// rename-rendered) into every edition, so a route may NEVER carry a
// `kaola-workflow-<x>.js` filename. Routes name a SCRIPT ID (`adaptive-node`,
// `replan`, …) plus a bare subcommand token; the consumer maps the id onto its own
// edition's filename.
// ===========================================================================

const KERNEL_REFUSAL_VOCABULARY = Object.freeze([
  'kernel_write_failed',
  'kernel_cas_lost',
  'kernel_integrity_broken',
  'kernel_lock_held',
  'kernel_evidence_missing',
  'sink_verdict',
  'consent_required',
]);

// The CLOSED route vocabulary. A route is either an in-grammar verb (a script id plus
// the subcommand/flag token that script's own main() dispatches on) or one of two
// terminal classes. `consent` is the A3 valve; `environment` names a blocker outside
// the runtime. Nothing else is a legal exit.
const ROUTE_TERMINAL_VERBS = Object.freeze(['consent', 'environment']);
const ROUTE_SCRIPT_IDS = Object.freeze([
  'adaptive-node', 'replan', 'plan-validator', 'adaptive-handoff', 'commit-node',
  'claim', 'run-chains',
]);

// R4: the ONLY routes a non-auto-remediable (integrity) refusal may name. Investigate
// or discard — never a repair verb, because the deviation IS the evidence and a repair
// launders it. The sweep asserts membership; a route outside this set is a build failure.
const INVESTIGATION_OR_DISCARD = Object.freeze([
  'adaptive-node:orient',
  'adaptive-node:write-halt',
  'adaptive-node:discard-speculative',
  'replan:prepare',
  'replan:abort',
  'claim:release',
]);

function routeKey(route) {
  if (!route || typeof route !== 'object') return null;
  return route.script ? route.script + ':' + route.verb : String(route.verb || '');
}

function inGrammar(script, verb, args) {
  return Object.freeze({ verb: verb, script: script, args: args == null ? '' : args });
}
function terminalRoute(verb, args) {
  return Object.freeze({ verb: verb, script: null, args: args == null ? {} : args });
}

// --- family 1: kernel_write_failed -----------------------------------------
// A durable kernel write was ATTEMPTED and factually did not take. Factual, never
// normative. The route splits on the payload, not on a second code: a substrate fault
// (errno) is `environment`; anything else is the idempotent retry verb for the record class.
const WRITE_FAILED_RECORDS = Object.freeze(['plan', 'position', 'evidence', 'forge_chain']);
const WRITE_FAILED_ENVIRONMENT_ERRNOS = Object.freeze(['ENOSPC', 'EACCES', 'EROFS', 'EMFILE', 'EIO']);
// Every transition below is idempotent BY CONSTRUCTION — re-running it after the
// substrate recovers either completes the write or reports it already landed.
// THE FREEZE CHAIN'S VERBS BELONG TO THE PLAN-VALIDATOR, NEVER TO THE HANDOFF. `--freeze-checked`
// / `--freeze` / `--governance-ack` are PLAN-VALIDATOR flags that the handoff SHELLS; the handoff's
// own argv parser reads only --project / --plan / --json / --state-mtime and silently IGNORES them,
// so `adaptive-handoff --freeze-checked <plan> --json` refuses "exactly one of --project or --plan
// required" and an operator who follows it lands nowhere. The handoff's freeze transaction carries
// NO verb flag at all (it is the default run), which is precisely why it cannot be named as a route
// verb — a route names a dispatch token, and that transaction has none.
const WRITE_FAILED_RETRY_BY_RECORD = Object.freeze({
  // The plan record IS workflow-plan.md, and the verb that writes it is the validator's own freeze.
  // It re-validates before writing and re-computes the same plan_hash from the same author-immutable
  // content, so re-running it after the substrate recovers either completes the write or reports
  // exactly why it still cannot land.
  plan: inGrammar('plan-validator', '--freeze', '<plan> --json'),
  position: inGrammar('adaptive-node', 'reconcile-running-set', '--project <P> --json'),
  evidence: inGrammar('adaptive-node', 'record-evidence', '--project <P> --node-id <N> --stdin --json'),
  forge_chain: inGrammar('claim', 'finalize', '--project <P> --json'),
});

// --- family 2: kernel_cas_lost ---------------------------------------------
// A compare-and-set on a durable record LOST: the transition demanded state X, found Y,
// and writing anyway would silently destroy the newer state. Fires BEFORE any mutation,
// so a refused call is a pure no-op. The route is always a RE-READ verb, never a force.
const CAS_RECORDS = Object.freeze([
  'ledger_row', 'evidence_generation', 'review_receipt', 'review_attempt', 'review_context',
  'plan_hash', 'parent_plan', 'parent_state', 'claim_root', 'replan_source', 'governance_ack',
]);
const CAS_ROUTE_BY_RECORD = Object.freeze({
  ledger_row: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  evidence_generation: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  review_receipt: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  review_attempt: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  review_context: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  // A plan_hash CAS is lost against an ALREADY-FROZEN plan (a child's authority/binding, a rebind
  // replay). The re-read of a frozen plan's hash is the validator's resume check: it re-validates
  // library + structure + hash and WRITES NOTHING, which is what "always a re-read verb, never a
  // force" demands. The freeze verb would write, and writing is exactly what is refused here.
  plan_hash: inGrammar('plan-validator', '--resume-check', '<plan> --json'),
  // The ack covers the plan content that was governed, so a stale ack is cured by taking a FRESH
  // hash — which is what `--freeze-checked` returns, without writing. This is the codebase's own
  // shipped answer for governance_ack_stale ("re-run --freeze-checked to get a fresh hash, then
  // --freeze --governance-ack <newHash>"); the flag it names is the validator's, not the handoff's.
  governance_ack: inGrammar('plan-validator', '--freeze-checked', '<plan> --json'),
  parent_plan: inGrammar('replan', 'resume', '--project <P> --json'),
  parent_state: inGrammar('replan', 'resume', '--project <P> --json'),
  claim_root: inGrammar('replan', 'resume', '--project <P> --json'),
  replan_source: inGrammar('replan', 'resume', '--project <P> --json'),
});

// --- family 3: kernel_integrity_broken (R4-protected) ----------------------
// A hash, back-link, lineage or authority anchor does not verify, or the last copy of a
// kernel record would be destroyed. The deviation IS the evidence, so R4 beats R3
// absolutely and the route may NEVER be a repair verb.
//
// The route derives from `kind`, NEVER from a per-anchor table — a per-anchor table is
// exactly how the no-auto-repair rule silently becomes forty hand-kept decisions again.
const INTEGRITY_KINDS = Object.freeze([
  'hash_mismatch', 'chain_break', 'identity_mismatch', 'unattributed_delta', 'replay_binding',
  'absent_anchor', 'schema_mismatch', 'noncanonical_bytes', 'last_copy_in_target', 'cycle',
]);
const INTEGRITY_ANCHORS = Object.freeze([
  'plan_hash', 'ledger_chain', 'epoch_lineage', 'epoch_binding', 'snapshot_manifest',
  'committed_transactions', 'consent_ledger', 'review_journal', 'review_context', 'review_receipt',
  'validation_vector', 'reviewer_profile', 'barrier_base', 'candidate', 'acceptance_anchor',
  'merge_ancestry', 'writer_identity', 'legacy_claim_root',
]);
const INTEGRITY_ROUTE_BY_KIND = Object.freeze({
  hash_mismatch: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  identity_mismatch: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  unattributed_delta: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  absent_anchor: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  schema_mismatch: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  noncanonical_bytes: inGrammar('adaptive-node', 'orient', '--project <P> --json'),
  // A broken back-link, a replayed binding, and a would-be last-copy deletion are the
  // three kinds where CONTINUING is what destroys the evidence — they escalate rather
  // than merely report, through the halt verb's own `integrity` reason.
  chain_break: inGrammar('adaptive-node', 'write-halt', '--project <P> --reason integrity --detail <detail> --json'),
  replay_binding: inGrammar('adaptive-node', 'write-halt', '--project <P> --reason integrity --detail <detail> --json'),
  last_copy_in_target: inGrammar('adaptive-node', 'write-halt', '--project <P> --reason integrity --detail <detail> --json'),
  // A cyclic transaction history can only be DISCARDED — there is no state to re-read.
  cycle: inGrammar('replan', 'abort', '--project <P> --transaction <id> --json'),
});

// --- family 4: kernel_lock_held --------------------------------------------
// Another owner holds the resource this write needs. "Another owner holds it" is the
// same fact at three granularities, so a project folder already holding another run's
// kernel records folds here rather than minting a code.
const LOCK_KINDS = Object.freeze(['scheduler', 'replan_fence', 'project_claim']);

// --- family 5: kernel_evidence_missing -------------------------------------
// A T1 Evidence record required by a transition is ABSENT at a boundary where proceeding
// loses it irrecoverably. `kernel_write_failed` means the write did not take; this means
// the write was never made and the content no longer exists to make it.
//
// ABSENCE ONLY. Token form, wrapped values, ordering, whitespace and absent optional
// fields are normalized on write (R3) and reported as `normalized[]` on the OK envelope.
// A replayed or copied binding is R4 evidence and lives in `kernel_integrity_broken`
// with `kind: 'replay_binding'`, never here.
const EVIDENCE_RECORD_KINDS = Object.freeze(['node_evidence', 'selection_record', 'final_fix_register']);
const EVIDENCE_ROUTE_BY_RECORD_KIND = Object.freeze({
  node_evidence: inGrammar('adaptive-node', 'record-evidence', '--project <P> --node-id <N> --stdin --json'),
  selection_record: inGrammar('claim', 'startup', '--target-issue <N> --target-source <S> --selection-record <path> --json'),
  // The census design named a `record-final-fix` verb that does not exist. The shipped
  // verb is `final-fix-commit`; the scanned in-grammar assertion is precisely what turns
  // that class of mistake (#840: a route naming a dead verb) into a build failure.
  final_fix_register: inGrammar('adaptive-node', 'final-fix-commit', '--project <P> --json --stdin'),
});

// --- family 6: sink_verdict (L2) -------------------------------------------
// ONE composite verdict at the pristine pre-mainline / pre-tag boundary. Report-all in
// one pass — nothing short-circuits. Every specific condition is a `findings[]` row.
const SINK_FINDING_KINDS = Object.freeze([
  'tests_red', 'unattributed_paths', 'unreviewed_change', 'unsettled_review', 'review_wall_absent',
  'sink_already_started', 'missing_consent', 'forge_chain_unsettled', 'writer_identity_swapped',
  'candidate_drift', 'final_fix_production_surface', 'final_fix_register_unverified',
]);
const SINK_UNATTRIBUTED_SUBTYPES = Object.freeze([
  'write_set_overflow', 'write_set_granularity', 'lockfile_write', 'mirror_write', 'count_bump',
  'unattributed_write', 'sensitive_write_unreviewed', 'foreign_archive',
]);

// The per-finding route resolver, seeded by the barrier reason precedence the plan
// validator already owns — the same derivation the shipped `DEVIATION_ROUTES` header
// claims, now with ONE source. `legacy_token` reproduces today's bare-verb route string
// byte-for-byte, so folding the table changes no emitted value.
const SINK_FINDING_ROUTE_BY_SUBTYPE = Object.freeze({
  write_set_overflow: Object.freeze({ route: inGrammar('adaptive-node', 'revert-overflow', '--project <P> --node-id <N> --json'), legacy_token: 'revert-overflow' }),
  write_set_granularity: Object.freeze({ route: inGrammar('adaptive-node', 'revert-overflow', '--project <P> --node-id <N> --json'), legacy_token: 'revert-overflow' }),
  lockfile_write: Object.freeze({ route: inGrammar('adaptive-node', 'revert-overflow', '--project <P> --node-id <N> --json'), legacy_token: 'revert-overflow' }),
  mirror_write: Object.freeze({ route: inGrammar('adaptive-node', 'revert-overflow', '--project <P> --node-id <N> --json'), legacy_token: 'revert-overflow' }),
  count_bump: Object.freeze({ route: inGrammar('adaptive-node', 'revert-overflow', '--project <P> --node-id <N> --json'), legacy_token: 'revert-overflow' }),
  // Writes nobody declared: attribute them onto a surface and re-review, rather than discard.
  unattributed_write: Object.freeze({ route: inGrammar('adaptive-node', 'amend-surface', '--project <P> --node-id <expansion-point> --files "<paths>" --json'), legacy_token: 'amend-surface' }),
  // A sensitive surface with no reviewer gate: the legal cure is ADDING that gate, which
  // is a spine change — a node-level fix cannot conjure a reviewer the frozen plan never
  // contained.
  sensitive_write_unreviewed: Object.freeze({ route: inGrammar('replan', 'shape-refutation', '--project <P> --json'), legacy_token: 'shape_refutation' }),
  // DELIBERATE SILENCE, PRESERVED. Writing another run's archive is not curable by
  // reverting the overflow, by amending the surface, or by reshaping the spine, so naming
  // any verb would misdirect. The sweep must know the null is intentional, not a gap.
  foreign_archive: null,
});
const SINK_FINDING_ROUTE_BY_KIND = Object.freeze({
  tests_red: Object.freeze({ route: inGrammar('run-chains', '--project', '<P> --json'), legacy_token: null }),
  unattributed_paths: Object.freeze({ route: null, legacy_token: null, by_subtype: 'SINK_FINDING_ROUTE_BY_SUBTYPE' }),
  unreviewed_change: Object.freeze({ route: inGrammar('replan', 'shape-refutation', '--project <P> --json'), legacy_token: null }),
  unsettled_review: Object.freeze({ route: inGrammar('adaptive-node', 'route-findings', '--project <P> --node-id <N> --json'), legacy_token: null }),
  review_wall_absent: Object.freeze({ route: inGrammar('replan', 'shape-refutation', '--project <P> --json'), legacy_token: null }),
  sink_already_started: Object.freeze({ route: inGrammar('claim', 'verify-sink', '--project <P> --json'), legacy_token: null }),
  // The A3 valve is reachable from INSIDE the composite without a second code.
  missing_consent: Object.freeze({ route: terminalRoute('consent', {}), legacy_token: null }),
  forge_chain_unsettled: Object.freeze({ route: inGrammar('claim', 'finalize', '--project <P> --json'), legacy_token: null }),
  writer_identity_swapped: Object.freeze({ route: inGrammar('adaptive-node', 'orient', '--project <P> --json'), legacy_token: null }),
  candidate_drift: Object.freeze({ route: inGrammar('claim', 'finalize', '--check --project <P> --json'), legacy_token: null }),
  final_fix_production_surface: Object.freeze({ route: inGrammar('replan', 'shape-refutation', '--project <P> --json'), legacy_token: 'shape_refutation' }),
  final_fix_register_unverified: Object.freeze({ route: inGrammar('adaptive-node', 'final-fix-commit', '--project <P> --json --stdin'), legacy_token: null }),
});

// --- NOT A FAMILY: the final-fix lane's not-in-finalization ADVISE -----------
// R1 admits a typed refusal at exactly three loci — L1 kernel-write integrity, L2 the sink,
// A3 consent. "the terminal finalize row is not in_progress" is none of them: nothing was
// written, nothing is reaching mainline, no values call is pending. It is a wrong-verb-for-
// state condition, which R1 ships as an advisory or a tool, and R3 says the same thing from
// the other side — the remedy is mechanical, so what was missing was a tool, not a wall.
// R4 does not bound it either: an unopened sink is a STATE, not evidence of tampering.
//
// So this carries no family, no registry row and no sweep obligation (see the vocabulary
// header above). What it DOES carry is a route, and deciding that route is this function's
// whole content.
//
// THE ROUTE IS CONDITIONAL, and the condition is OPENABILITY — a MEASURED fact, never the
// ledger status alone. A route is a promise the verb will accept the work, so it may only be
// named where the verb can genuinely keep it:
//   * a pending sink row that is the NEXT SERIALLY-OPENABLE NODE is openable, and
//     `open-next --node-id <sink>` is the ONE verb that flips a pending row to in_progress
//     and records its baseline — exactly and only what `live` requires. This answer fires
//     precisely when the run is NOT in finalization, which is when that ordinary mid-run
//     open path is still available. It is also the codebase's own standing answer for the
//     same fact elsewhere ("Node X is not in_progress ... Open it (open-next) first").
//   * a pending sink whose DEPENDENCIES are not complete is NOT openable, even though its
//     own row reads exactly the same. `open-next` would open some OTHER node while the
//     operator was told it opens the sink — a verb pointed at work it cannot accept, which
//     is the dead-end wedge this project has already had to file as a bug.
//   * NO unique terminal finalize row means there is no node to open AT ALL, and a
//     complete / n/a / unrecorded row is not re-opened by this verb either.
// The unopenable cases carry NO route and say WHICH state closed the exit — the same
// deliberate silence recorded for `foreign_archive` above, and an honest dead end that
// explains itself beats a route that could only refuse.
//
// `openable` is passed IN rather than derived here: it is a fact about the ledger frontier,
// which the caller already holds the plan content to compute, and this file stays free of
// plan-parsing dependencies. Callers MUST fail closed — an unmeasurable frontier is `false`,
// because a wrongly-emitted route is the failure this branch exists to prevent.
//
// The prose and the route are decided TOGETHER, in one place, so they cannot disagree about
// whether an exit exists.
function finalFixSinkAdvice(sink, project, openable) {
  const id = (sink && sink.id) || null;
  const status = (sink && sink.status) || null;
  if (!id) {
    return Object.freeze({
      route: null,
      detail: 'the plan has no unique terminal finalize node — there is no sink row to open, and no '
        + 'verb can conjure one, so this answer names no route: silence is the floor when nothing '
        + 'could keep the promise',
    });
  }
  if (status === 'pending' && openable === true) {
    return Object.freeze({
      route: inGrammar('adaptive-node', 'open-next',
        '--project ' + (project || '<P>') + ' --node-id ' + id + ' --json'),
      detail: 'the terminal sink "' + id + '" is "pending", not in_progress — this run has not entered '
        + 'finalization yet, but the sink IS the next openable node, so open it and re-submit, or '
        + 'land the fix through the ordinary in-plan path at the node that declares the surface',
    });
  }
  if (status === 'pending') {
    return Object.freeze({
      route: null,
      detail: 'the terminal sink "' + id + '" is "pending", not in_progress, and its dependencies are '
        + 'not all complete — it is not the next openable node, so no open verb can accept this work '
        + 'yet and naming one would point you at some other node. Run the plan forward to the sink, '
        + 'or land the fix through the ordinary in-plan path at the node that declares the surface',
    });
  }
  return Object.freeze({
    route: null,
    detail: 'the terminal sink "' + id + '" is "' + (status || 'unrecorded') + '", not in_progress, and no verb re-opens '
      + 'it into finalization from here — land the fix through the ordinary in-plan path, at the node '
      + 'that declares the surface',
  });
}

// --- family 7: consent_required (A3) ---------------------------------------
// An irreversible or value-laden call that no script may make. The resolution verb rides
// in the PAYLOAD, never in the route — `consent` is a closed-vocabulary terminal.
const CONSENT_KINDS = Object.freeze([
  'halt_fence', 'acceptance_change', 'budget_exhausted', 'turn_reference_conflict',
  'disambiguation', 'schema_upgrade',
]);

// ---------------------------------------------------------------------------
// The payload schemas. THE DISCRIMINATOR ENUMS LIVE HERE, ONE PLACE. Each family's
// route table is keyed by its own `values` array, and the sweep proves the two key sets
// equal in both directions — so a new discriminator value without a route, or a route
// for a value the schema does not declare, fails the build.
// ---------------------------------------------------------------------------
const REFUSAL_PAYLOAD_SCHEMAS = Object.freeze({
  kernel_write_failed: Object.freeze({
    discriminator: 'record', values: WRITE_FAILED_RECORDS,
    enums: Object.freeze({ errno: WRITE_FAILED_ENVIRONMENT_ERRNOS }),
    fields: Object.freeze(['record', 'target', 'step', 'path', 'errno',
      'git_stderr_first_line', 'exit_status', 'detail', 'rolled_back', 'retry_verb',
      'retry_script', 'retry_args', 'node_id', 'project', 'condition']),
  }),
  kernel_cas_lost: Object.freeze({
    discriminator: 'record', values: CAS_RECORDS, enums: Object.freeze({}),
    fields: Object.freeze(['record', 'field', 'expected', 'found', 'token', 'blocking_rows',
      'legal_next', 'node_id', 'transaction_id', 'phase', 'seam', 'condition']),
  }),
  kernel_integrity_broken: Object.freeze({
    discriminator: 'kind', values: INTEGRITY_KINDS,
    enums: Object.freeze({ anchor: INTEGRITY_ANCHORS }),
    fields: Object.freeze(['anchor', 'kind', 'expected', 'actual', 'path', 'broken_at', 'epoch',
      'node_id', 'attempt_id', 'bypass_risk', 'auto_remediable', 'legal_exits', 'condition']),
  }),
  kernel_lock_held: Object.freeze({
    discriminator: 'kind', values: LOCK_KINDS,
    enums: Object.freeze({}), secondary_discriminator: 'stale',
    fields: Object.freeze(['kind', 'path', 'holder', 'stale', 'held_for_ms', 'occupying_project',
      'occupying_issue', 'transaction_id', 'phase', 'legal_mutation', 'condition']),
  }),
  kernel_evidence_missing: Object.freeze({
    discriminator: 'record_kind', values: EVIDENCE_RECORD_KINDS,
    enums: Object.freeze({ defect: Object.freeze(['absent', 'unreadable', 'not_json_object', 'wrong_type']) }),
    fields: Object.freeze(['record_kind', 'node_id', 'role', 'expected_path', 'defect',
      'normalized_on_write', 'condition']),
  }),
  sink_verdict: Object.freeze({
    discriminator: 'findings[].kind', values: SINK_FINDING_KINDS,
    enums: Object.freeze({ scope: Object.freeze(['plan', 'release']), subtype: SINK_UNATTRIBUTED_SUBTYPES }),
    fields: Object.freeze(['scope', 'findings', 'checks', 'candidate_digest', 'sink_progress',
      'finalize_transaction', 'condition']),
  }),
  consent_required: Object.freeze({
    discriminator: 'kind', values: CONSENT_KINDS,
    enums: Object.freeze({ halt_reason: Object.freeze(['consent', 'security', 'test_thrash', 'merge_conflict', 'integrity']) }),
    fields: Object.freeze(['kind', 'ask', 'options', 'resolution_verb', 'halt_reason', 'node_id',
      'marker_path', 'clear_command', 'conflicted_paths', 'leg_branches', 'parent_acceptance_digest',
      'child_acceptance_digest', 'item_delta', 'automatic_review_replans', 'authorized_epoch_ceiling',
      'authority_scope', 'candidates', 'round', 'cap', 'context_refs', 'condition']),
  }),
});

// ===========================================================================
// THE CELL-KEYED WHY SLOT — the decomposition that lets the 176 condition-specific
// operator templates be DELETED.
//
//   hint = FACT(payload)   pure field rendering ...................... DERIVED
//        + WHY(cell)       the consequence the fact does not imply .... HAND-AUTHORED, O(cells)
//        + ROUTE(payload)  the verb, as prose ........................ DERIVED
//
// The load-bearing measurement is that WHY is constant per CELL, not per condition. A
// family hint that is constant per FAMILY can never carry ".mirror-tmp leftover" (the same
// sentence has to serve a snapshot fault, a mirror fault and a leg-capture fault alike), so
// the legacy tables survive it. A hint that is constant per CELL can, because
// `running_set_opening_incomplete` / `_close_incomplete` / `_stale_member` are three
// templates today and ONE cell — `kernel_write_failed/position` — tomorrow: their entire
// difference is payload, which the FACT renders.
//
// A clause is authored ONLY where the fact does not already imply the consequence. Every
// clause is forge-neutral (this file is byte-copied into every edition) and names NO verb —
// the verb is the ROUTE slot's job, and a hand-written verb inside a clause is exactly the
// drift the generated exit sentence exists to make impossible.
// ===========================================================================

// refusalScalar / refusalQuoted — the FIELD-PRESENCE GATE. A field the payload does not
// carry renders NOTHING; there is no placeholder path, because a placeholder reads as a
// measurement. NaN and non-finite numbers are absent by construction, never the string
// "NaN"; objects and arrays are absent rather than stringified into nested nulls.
function refusalScalar(value) {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}
function refusalQuoted(value) {
  const s = refusalScalar(value);
  if (s === null) return null;
  return typeof value === 'string' ? JSON.stringify(value) : s;
}

// --- the seven FACT renderers. Payload in, sentence out; nothing else is read. ---
function refusalFactWriteFailed(p) {
  const record = refusalScalar(p.record);
  const target = refusalScalar(p.target);
  const step = refusalScalar(p.step);
  const at = refusalScalar(p.path);
  const errno = refusalScalar(p.errno);
  const detail = refusalScalar(p.detail);
  let s = 'The ' + (record ? record + ' record' : 'durable kernel') + ' write did not take';
  if (target) s += ' (' + target + ')';
  if (step) s += ' at step ' + step;
  if (at) s += ' at ' + at;
  if (errno) s += ': ' + errno;
  if (detail) s += ': ' + detail;
  return s + '.';
}
function refusalFactCasLost(p) {
  const record = refusalScalar(p.record);
  const field = refusalScalar(p.field);
  const seam = refusalScalar(p.seam);
  const expected = refusalQuoted(p.expected);
  const found = refusalQuoted(p.found);
  const legalNext = refusalScalar(p.legal_next);
  let s = 'A compare-and-set on the ' + (record ? record + ' record' : 'kernel record') + ' lost';
  if (field) s += ' on ' + field;
  if (seam) s += ' at ' + seam;
  if (expected && found) s += ': the transition demanded ' + expected + ' and found ' + found;
  else if (expected) s += ': the transition demanded ' + expected;
  else if (found) s += ': the record now reads ' + found;
  s += '. Nothing was mutated';
  if (legalNext) s += ', and the state on disk admits ' + legalNext;
  return s + '.';
}
function refusalFactIntegrityBroken(p) {
  const anchor = refusalScalar(p.anchor);
  const kind = refusalScalar(p.kind);
  const brokenAt = refusalScalar(p.broken_at);
  const at = refusalScalar(p.path);
  const epoch = refusalScalar(p.epoch);
  let s = 'The ' + (anchor ? anchor + ' anchor' : 'kernel integrity anchor')
    + ' failed its ' + (kind ? kind : 'integrity') + ' proof';
  if (brokenAt) s += ' at ' + brokenAt;
  if (at) s += ' (' + at + ')';
  if (epoch) s += ' in epoch ' + epoch;
  return s + '.';
}
function refusalFactLockHeld(p) {
  const kind = refusalScalar(p.kind);
  const holder = isPlainObject(p.holder) ? p.holder : {};
  const sub = refusalScalar(holder.subcommand);
  const pid = refusalScalar(holder.pid);
  const host = refusalScalar(holder.host);
  const occupying = refusalScalar(p.occupying_project);
  let s = 'Another owner holds the ' + (kind ? kind : 'kernel') + ' lock';
  const who = [];
  if (sub) who.push(sub);
  if (pid) who.push('pid ' + pid);
  if (host) who.push('on ' + host);
  if (who.length) s += ' (' + who.join(', ') + ')';
  if (occupying) s += ', occupying project ' + occupying;
  if (p.stale === true) s += ', and the hold is STALE';
  else if (p.stale === false) s += ', and the holder is LIVE';
  return s + '.';
}
function refusalFactEvidenceMissing(p) {
  const recordKind = refusalScalar(p.record_kind);
  const defect = refusalScalar(p.defect);
  const expectedPath = refusalScalar(p.expected_path);
  const nodeId = refusalScalar(p.node_id);
  const role = refusalScalar(p.role);
  // `absent` is this family's DEFINITIONAL predicate (the code is kernel_evidence_missing),
  // not a placeholder standing in for an unmeasured field.
  let s = 'The ' + (recordKind ? recordKind : 'evidence') + ' record this transition requires is '
    + (defect ? defect : 'absent');
  if (expectedPath) s += ' at ' + expectedPath;
  if (nodeId) s += ' for node ' + nodeId;
  if (role) s += ' (' + role + ')';
  return s + '.';
}
function refusalFactSinkVerdict(p) {
  const scope = refusalScalar(p.scope);
  const findings = Array.isArray(p.findings) ? p.findings.filter(isPlainObject) : [];
  const labels = [];
  for (const f of findings) {
    const kind = refusalScalar(f.kind);
    if (!kind) continue;
    // THE SUBTYPE IS THE FINDING HERE. `unattributed_paths` alone tells an operator nothing;
    // which of the eight cures applies is carried entirely by the subtype.
    const subtype = refusalScalar(f.subtype);
    const label = subtype ? kind + '/' + subtype : kind;
    if (labels.indexOf(label) < 0) labels.push(label);
  }
  const n = findings.length;
  let s = 'The ' + (scope ? scope + ' ' : '') + 'sink refused with ' + n + ' finding' + (n === 1 ? '' : 's');
  if (labels.length) s += ' (' + labels.join(', ') + ')';
  return s + ', every precondition evaluated in ONE pass — this is the complete list, not the first failure.';
}
function refusalFactConsentRequired(p) {
  const kind = refusalScalar(p.kind);
  const nodeId = refusalScalar(p.node_id);
  const ask = refusalScalar(p.ask);
  const options = Array.isArray(p.options) ? p.options.map(refusalScalar).filter(Boolean) : [];
  const resolution = refusalScalar(p.resolution_verb);
  let s = 'This is a values call no script may make (' + (kind ? kind : 'consent') + ')';
  if (nodeId) s += ' at node ' + nodeId;
  if (ask) s += ': ' + ask;
  if (options.length) s += ' — recorded options: ' + options.join(' | ');
  if (resolution) s += '; the recorded resolution verb is ' + resolution;
  return s + '.';
}
const REFUSAL_FACT_BY_CODE = Object.freeze({
  kernel_write_failed: refusalFactWriteFailed,
  kernel_cas_lost: refusalFactCasLost,
  kernel_integrity_broken: refusalFactIntegrityBroken,
  kernel_lock_held: refusalFactLockHeld,
  kernel_evidence_missing: refusalFactEvidenceMissing,
  sink_verdict: refusalFactSinkVerdict,
  consent_required: refusalFactConsentRequired,
});

// refusalFact(code, payload) — the FACT clause. `null` for a code outside the enumerated
// vocabulary (never a fabricated sentence). TOTAL: a non-object payload reads as empty.
function refusalFact(code, payload) {
  if (KERNEL_REFUSAL_VOCABULARY.indexOf(code) < 0) return null;
  const render = REFUSAL_FACT_BY_CODE[code];
  if (typeof render !== 'function') return null;
  return render(isPlainObject(payload) ? payload : {});
}

// refusalCellKey(code, payload) — `${code}/${discriminatorValue}`, falling back to
// `${code}/*` when the discriminator is ABSENT or carries a value the family does not
// declare. Inventing a cell for an undeclared value is how a stale key becomes invisible to
// the closure check, so both cases land on the ONE fallback key. TOTAL.
function refusalCellKey(code, payload) {
  if (KERNEL_REFUSAL_VOCABULARY.indexOf(code) < 0) return null;
  const schema = REFUSAL_PAYLOAD_SCHEMAS[code];
  const p = isPlainObject(payload) ? payload : {};
  let value = null;
  if (code === 'sink_verdict') {
    // The declared discriminator is `findings[].kind`; the composite keys on its FIRST
    // declared finding, and the unattributed subtype split belongs to the FACT, not the WHY.
    const findings = Array.isArray(p.findings) ? p.findings : [];
    for (const f of findings) {
      if (isPlainObject(f) && typeof f.kind === 'string') { value = f.kind; break; }
    }
  } else {
    const raw = p[schema.discriminator];
    value = typeof raw === 'string' ? raw : null;
  }
  if (value === null || schema.values.indexOf(value) < 0) return code + '/*';
  return code + '/' + value;
}

// REFUSAL_WHY — ONE CLAUSE PER CELL, keyed `${code}/${discriminatorValue}`. The `${code}/*`
// row is the legal fallback refusalCellKey emits for a discriminator the family does not
// declare; it does NOT satisfy a live cell (assertCellClosure proves that in both
// directions), so it can never quietly close the map.
const REFUSAL_WHY = Object.freeze({
  // --- kernel_write_failed: nothing was recorded, so what is lost is the TRANSITION ---
  'kernel_write_failed/plan': 'Nothing was stamped, so no node may open against this plan yet. A freeze '
    + 'recomputes the same plan_hash from the same author-immutable content, which is why re-running it is '
    + 'safe: it either completes the write or reports the same grammar errors again.',
  'kernel_write_failed/position': 'A half-applied position leaves the ledger and the running set disagreeing '
    + 'about which nodes are open, and can strand a staging tree (.mirror-tmp) or a partial baseline behind. '
    + 'The recorded verb reconciles that pair and clears the residue rather than trusting either side.',
  'kernel_write_failed/evidence': 'Evidence is the only durable account of what this node did, and the close '
    + 'gate reads it — so until the write lands the node cannot close, and the work it describes is invisible '
    + 'to every gate downstream.',
  'kernel_write_failed/forge_chain': 'The forge chain is the last mile: this run\'s own commits are already '
    + 'durable, so what did not land is the announcement, never the work. The run is resumable rather than '
    + 'half-shipped, and nothing is published until the chain settles.',
  'kernel_write_failed/*': 'A durable kernel write is all-or-nothing. A refused write records nothing, so the '
    + 'transition is a no-op and the state you read before it is still the state on disk.',

  // --- kernel_cas_lost: the record MOVED, and forcing it destroys the newer state ---
  'kernel_cas_lost/ledger_row': 'The ledger row moved under this transition — another open, close or repair '
    + 'already applied. Writing anyway would overwrite the newer row and strand whatever depends on it; the '
    + 'ledger is the run\'s position, and hand-editing a row is never the recovery.',
  'kernel_cas_lost/evidence_generation': 'The evidence generation advanced, so the record you are writing '
    + 'belongs to an earlier open. Landing it now would attribute this open\'s work to a generation that has '
    + 'already been read and judged.',
  'kernel_cas_lost/review_receipt': 'A settled review receipt is immutable by design — it is the record later '
    + 'gates cite — so a second write is refused rather than merged. The exit is a fresh attempt, never an '
    + 'edit of the one already settled.',
  'kernel_cas_lost/review_attempt': 'The review attempt already settled, so its verdict is part of this run\'s '
    + 'history. Re-settling it would let a second verdict silently replace the one the plan routed on.',
  'kernel_cas_lost/review_context': 'The review context identifies WHAT was reviewed. Two different contexts '
    + 'under one identity would make every receipt that cites it ambiguous, so the collision is refused rather '
    + 'than resolved by picking one.',
  'kernel_cas_lost/plan_hash': 'The plan hash binds a record to the exact frozen plan it was made under, so a '
    + 'mismatch means the two are describing different plans. Stamping the current hash over the record would '
    + 'erase the only evidence that they ever diverged.',
  'kernel_cas_lost/parent_plan': 'A re-plan epoch is claim-preserving: the parent plan and its ledger stay '
    + 'byte-identical, because every committed epoch is retained and the child is attested against the parent '
    + 'exactly as it was frozen. A parent that moved invalidates that attestation, not the child.',
  'kernel_cas_lost/parent_state': 'The parent state moved while the epoch transition was in flight. Activating '
    + 'the child now would bind it to a claim that no longer describes this run.',
  'kernel_cas_lost/claim_root': 'The claim root is what makes this one run across every epoch. A root that has '
    + 'moved means the folder in front of you and the claim you hold are no longer the same work, and every '
    + 'later attribution would be made against the wrong lineage.',
  'kernel_cas_lost/replan_source': 'The re-plan is prepared from a settled typed review outcome. If that source '
    + 'moved, the child would be authored to answer a finding this run has since resolved differently.',
  'kernel_cas_lost/governance_ack': 'The acknowledgement covers the exact plan content that was governed. The '
    + 'plan was edited between the check and the freeze, so freezing now would ship a plan nobody approved under '
    + 'the approval recorded for one they did.',
  'kernel_cas_lost/*': 'A compare-and-set fires BEFORE any mutation, so this refusal is a pure no-op: the record '
    + 'on disk is the newer one. Re-read it and take the verb that state admits — never force the write.',

  // --- kernel_integrity_broken (R4): the deviation IS the evidence ---
  'kernel_integrity_broken/hash_mismatch': 'The bytes no longer hash to what was recorded, so either the content '
    + 'or the record moved. Re-stamping the hash would make the two agree again and destroy the only evidence '
    + 'that they ever disagreed.',
  'kernel_integrity_broken/chain_break': 'A back-link is gone, so the history can no longer be walked end to end. '
    + 'Every gate downstream reads that chain, and appending past a break is what makes the gap permanently '
    + 'unattributable.',
  'kernel_integrity_broken/identity_mismatch': 'The record was made by a different identity than the one this '
    + 'transition claims. That is exactly the shape a substituted writer or a replayed epoch produces, so '
    + 're-deriving the identity would launder the signal instead of reading it.',
  'kernel_integrity_broken/unattributed_delta': 'Content changed that no declared writer accounts for. An '
    + 'unattributed delta is the one thing a review wall cannot certify, because there is no node whose evidence '
    + 'covers it and no reviewer who was ever shown it.',
  'kernel_integrity_broken/replay_binding': 'The binding was minted for a different open or a different node and '
    + 're-presented here. A replay proves nothing about THIS transition, and accepting it would let one artifact '
    + 'satisfy two gates.',
  'kernel_integrity_broken/absent_anchor': 'The anchor this proof stands on is not there, so the proof cannot be '
    + 'made either way. Absence is not a pass: an anchor that cannot be read is indistinguishable from one that '
    + 'would have failed.',
  'kernel_integrity_broken/schema_mismatch': 'The record does not have the shape its reader expects, so every '
    + 'field read out of it is a guess. A reader that guesses here reports a verdict it never actually computed.',
  'kernel_integrity_broken/noncanonical_bytes': 'The bytes are not in canonical form, so two honest readers can '
    + 'hash them differently — which quietly turns every digest comparison downstream into a coin toss.',
  'kernel_integrity_broken/last_copy_in_target': 'This would destroy the last surviving copy of a kernel record. '
    + 'There is no undo past that point, and no later gate can reconstruct what it never saw.',
  'kernel_integrity_broken/cycle': 'The transaction history refers back to itself, so there is no earlier state '
    + 'to re-read and no order in which to replay it. A cyclic history cannot be repaired into a linear one — it '
    + 'can only be discarded.',
  'kernel_integrity_broken/*': 'The deviation IS the evidence here, so this class is NEVER auto-repaired. Do not '
    + 're-stamp, re-derive or delete the anchor: each of those destroys the only record that it changed.',

  // --- kernel_lock_held: another owner holds it; a lock is a claim, not a stale file ---
  'kernel_lock_held/scheduler': 'Only one orchestrator may drive a project\'s scheduler at a time. The lock is a '
    + 'claim on state, not a file to delete — unlinking it by hand is what lets two writers into the same ledger '
    + '— so it is released by its owner finishing, or removed through the verb that probes liveness first.',
  'kernel_lock_held/replan_fence': 'A re-plan epoch fences ordinary mutation for exactly as long as the transition '
    + 'is open, so the parent plan and ledger stay byte-identical while the child is authored. Writing through the '
    + 'fence is what produces a child attested against a parent that already moved.',
  'kernel_lock_held/project_claim': 'This project folder already holds another run\'s kernel records. Two claims in '
    + 'one folder overwrite each other\'s ledger and evidence, so the occupying run is finished, resumed or '
    + 'discarded — never written over.',
  'kernel_lock_held/*': 'Another owner holds this resource, so the write would race a live writer. A held lock is a '
    + 'claim on state rather than leftover residue: it is released by its owner, never by hand.',

  // --- kernel_evidence_missing: ABSENCE only; form is normalized on write ---
  'kernel_evidence_missing/node_evidence': 'A node closes on its evidence, so with the record absent there is '
    + 'nothing for the close gate to read and the work cannot be attributed to any writer. Record it from the run '
    + 'that produced it — a file authored after the fact restates the self-description the record exists to '
    + 'replace.',
  'kernel_evidence_missing/selection_record': 'An orchestrator-originated claim is auditable only through its '
    + 'selection record. Without one there is no durable account of WHY this target was chosen, so the claim is '
    + 'refused with zero side effects rather than made unaccountably.',
  'kernel_evidence_missing/final_fix_register': 'The register is the only record that a finalize-time fix entered '
    + 'the candidate deliberately, and it is written by the commit verb alone. A missing entry means the change has '
    + 'no owner at the one boundary past which nothing can attribute it — do not delete the changed files, that '
    + 'answers a different fault.',
  'kernel_evidence_missing/*': 'The content this record would have carried no longer exists to be written, so '
    + 'proceeding loses it irrecoverably. Token FORM is never refused here (wrapping, ordering and whitespace are '
    + 'normalized on write), so absence is the whole finding.',

  // --- sink_verdict (L2): the composite verdict at the pristine boundary ---
  'sink_verdict/tests_red': 'The sink is the pristine pre-mainline boundary, so a red chain there is this run\'s '
    + 'own verdict on itself rather than a flake to re-roll. Nothing merges while it stands, and the verdict is '
    + 'owned inside the workflow — no external pipeline can lift it.',
  'sink_verdict/unattributed_paths': 'Paths changed that no node\'s declared write set covers, so no reviewer ever '
    + 'saw them under any authority. The subtype names which cure applies: discard the stray write, attribute it '
    + 'onto a surface and re-review it, or reshape the spine when the plan holds no authority that could certify '
    + 'it. Writing another run\'s archive has no cure at all.',
  'sink_verdict/unreviewed_change': 'A change reached the sink with no settled reviewing authority over it. The '
    + 'legal cure is ADDING that authority, which is a spine change: a node-level fix cannot conjure a reviewer '
    + 'the frozen plan never contained.',
  'sink_verdict/unsettled_review': 'A review attempt is still open, so this run has a verdict pending on work it '
    + 'is about to ship. An unsettled attempt is not a silent pass — the finding has to reach an owner before the '
    + 'sink can read it as resolved.',
  'sink_verdict/review_wall_absent': 'No review wall post-dominates this work, so nothing in the frozen shape was '
    + 'ever obliged to certify it. That is a property of the plan rather than of the code, and only a reshape adds '
    + 'it.',
  'sink_verdict/sink_already_started': 'The sink has already taken an irreversible step, so this run\'s history is '
    + 'no longer editable. Recovery past this point is a follow-up, never a rewrite of what shipped.',
  'sink_verdict/missing_consent': 'An irreversible or value-laden call is waiting on a decision no script may make. '
    + 'The machine has taken this as far as facts go; the remaining choice belongs to a human.',
  'sink_verdict/forge_chain_unsettled': 'The local work is committed but the forge-side handoff has not settled — '
    + 'the branch, the archive or the label is still mid-flight. The run is resumable rather than half-shipped, and '
    + 'nothing is published until the chain closes.',
  'sink_verdict/writer_identity_swapped': 'The identity that wrote the candidate is not the one this run recorded. '
    + 'That is the shape a substituted writer produces, so it is investigated rather than re-stamped.',
  'sink_verdict/candidate_drift': 'The candidate moved after it was certified, so every receipt taken over the old '
    + 'bytes now describes something other than what would ship. Re-reading the whole set is the only way to learn '
    + 'what is still true.',
  'sink_verdict/final_fix_production_surface': 'A finalize-time fix touched production behavior, and that lane '
    + 'records validation apparatus only. A behavior change arriving after every reviewer is discharged is a '
    + 'deviation that is itself evidence — the certification standing over this candidate no longer describes it — '
    + 'so it is reported rather than converted into an admission by a register. No authority in the frozen plan '
    + 'can certify it, so the shape itself is refuted and that is the exit.',
  'sink_verdict/final_fix_register_unverified': 'The register that would attribute this fix does not verify, so it '
    + 'cannot widen the attributed set. It is written by the commit verb alone, so a mismatch means it was edited '
    + 'out of band — and deleting the changed files answers a different fault than the one being reported.',
  'sink_verdict/*': 'Every precondition was evaluated in ONE pass, so this is the complete list rather than the '
    + 'first failure. Each finding carries its own remedy, and the composite is re-read in full afterwards rather '
    + 'than resumed at the one you fixed.',

  // --- consent_required (A3): machines decide facts; humans decide values ---
  'consent_required/halt_fence': 'A durable halt marker fences every mutating verb until it is cleared, and '
    + 'clearing it asserts that the cause is resolved — which is why no script clears its own halt.',
  'consent_required/acceptance_change': 'The acceptance surface is what this run agreed to deliver. Changing it '
    + 'mid-run redefines success after the fact, so it is a standing call for whoever set it, never a repair the '
    + 'plan may make on its own behalf.',
  'consent_required/budget_exhausted': 'The automatic re-plan budget is spent. Extending it is a judgment about '
    + 'whether this run is still converging, and the ceiling rises one slot at a time so that judgment is made '
    + 'deliberately rather than absorbed.',
  'consent_required/turn_reference_conflict': 'The consent reference offered has already been spent on an earlier '
    + 'turn. Reusing it would let one approval authorize a second, different decision, so the reference is refused '
    + 'rather than re-counted.',
  'consent_required/disambiguation': 'The evidence admits more than one reading, and choosing silently is how a run '
    + 'does the wrong work confidently. Nothing was claimed and no state was written, so answering costs one round '
    + 'trip and nothing else.',
  'consent_required/schema_upgrade': 'Upgrading a durable record\'s schema rewrites history this run\'s gates have '
    + 'already read. It is reversible only by restoring the old bytes, so the call belongs to a human before '
    + 'anything is rewritten.',
  'consent_required/*': 'This is a values call, and value, standing and irreversible decisions route to a human '
    + 'rather than being resolved by a script. Machines decide facts; humans decide values.',
});

// assertCellClosure() — BIDIRECTIONAL, and it RETURNS rather than throws.
//   missing — a live cell with no WHY clause (the slot silently renders nothing).
//   stale   — a WHY key that is not a live cell (a renamed discriminator left its clause behind).
// One direction alone lets the map rot invisibly: a renamed value would read green forever while
// the live cell fell back to nothing. The `${code}/*` fallback key is LEGAL and never stale, but it
// does NOT satisfy a live cell — otherwise seven wildcards would close the whole map and the
// cell-keyed slot would be a slot in name only.
function assertCellClosure() {
  const live = new Set();
  const wildcard = new Set();
  for (const code of KERNEL_REFUSAL_VOCABULARY) {
    wildcard.add(code + '/*');
    const schema = REFUSAL_PAYLOAD_SCHEMAS[code];
    if (!schema || !Array.isArray(schema.values)) continue;
    for (const value of schema.values) live.add(code + '/' + value);
  }
  const have = new Set(isPlainObject(REFUSAL_WHY) ? Object.keys(REFUSAL_WHY) : []);
  const missing = [], stale = [];
  for (const key of live) if (!have.has(key)) missing.push(key);
  for (const key of have) if (!live.has(key) && !wildcard.has(key)) stale.push(key);
  missing.sort();
  stale.sort();
  return { ok: missing.length === 0 && stale.length === 0, missing: missing, stale: stale };
}

// routeProse(route) — THE GENERATED EXIT SENTENCE. Every hint ends with exactly this, which is
// the structural reason a hint can never contradict its own route: hand-written prose drifts from
// the verb the machine resolved and nothing notices, but generated prose cannot drift from its own
// input. TOTAL, deterministic, and the EMPTY STRING for an absent route — the deliberate silences
// (no verb resolves the write of another run's archive) must render no exit at all, because naming
// one would misdirect.
//
// FORGE-NEUTRAL: it names a SCRIPT ID and a bare verb, never an edition filename, because this text
// is byte-copied into every edition and a filename would be wrong in three of four.
function routeProse(route) {
  if (!isPlainObject(route)) return '';
  const verb = typeof route.verb === 'string' && route.verb.trim() ? route.verb : '';
  if (!verb) return '';
  if (!route.script) {
    // Terminal classes. The resolution verb rides in the PAYLOAD, never in the route, so the
    // sentence describes the EXIT rather than naming a command that does not exist.
    if (verb === 'consent') {
      return 'Exit: consent — put the decision to the human and record the answer before any further write.';
    }
    if (verb === 'environment') {
      const args = isPlainObject(route.args) ? route.args : {};
      if (args.blocker === 'live_holder') {
        return 'Exit: environment — wait for the live holder to finish, or resume the run that owns it; the hold '
          + 'is released by its owner, never by hand.';
      }
      return 'Exit: environment — clear the blocker outside the runtime, then re-run the transition that refused.';
    }
    return '';
  }
  const args = typeof route.args === 'string' && route.args.trim() ? ' ' + route.args.trim() : '';
  return 'Exit: ' + route.script + ' ' + verb + args + '.';
}

// composeFamilyRefusalHint(code, payload) — THE THREE SLOTS, JOINED. This is the ONE body every
// registry `hint` delegates to; it is a real function declaration, defined above, and every helper
// it calls is defined in this file. (An earlier attempt at this slot delegated to a helper nobody
// wrote: every hint threw ReferenceError, `composeOperatorHint`'s catch degraded it to the caller's
// generic string, and 541 assertions passed over a dead layer. The sweep now calls each hint
// DIRECTLY off the registry, which is the check that would have caught it.)
function composeFamilyRefusalHint(code, payload) {
  const p = isPlainObject(payload) ? payload : {};
  const key = refusalCellKey(code, p);
  const why = key && typeof REFUSAL_WHY[key] === 'string' ? REFUSAL_WHY[key] : '';
  const parts = [refusalFact(code, p), why, routeProse(resolveRoute(code, p))];
  return parts.filter(s => typeof s === 'string' && s.trim()).join(' ');
}

// ---------------------------------------------------------------------------
// The registry — SEVEN rows. `route` and `hint` are FUNCTIONS of the payload, never
// tables of incidents. Hints are forge-neutral: they name VERBS, never script paths.
//
// Every `hint` is now FACT + WHY(cell) + ROUTE. The bodies are one line each BECAUSE the
// variation lives in the payload and the cell, which is exactly what makes the 176 legacy
// condition-specific templates deletable: a hint that is constant per family cannot carry a
// per-condition detail, and a hint that is constant per CELL can.
// ---------------------------------------------------------------------------
const KERNEL_REFUSAL_REGISTRY = Object.freeze({
  kernel_write_failed: Object.freeze({
    locus: 'L1', auto_remediable: true,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.kernel_write_failed,
    route: (p) => {
      if (p.errno && WRITE_FAILED_ENVIRONMENT_ERRNOS.indexOf(p.errno) >= 0) {
        return terminalRoute('environment', { blocker: p.errno, path: p.path || null });
      }
      if (p.retry_verb && p.retry_script) return inGrammar(p.retry_script, p.retry_verb, p.retry_args);
      return WRITE_FAILED_RETRY_BY_RECORD[p.record] || null;
    },
    hint: (p) => composeFamilyRefusalHint('kernel_write_failed', p),
  }),
  kernel_cas_lost: Object.freeze({
    locus: 'L1', auto_remediable: true,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.kernel_cas_lost,
    route: (p) => CAS_ROUTE_BY_RECORD[p.record] || null,
    // The `expected`/`found` pair is FIELD-PRESENCE GATED now. Rendering
    // `JSON.stringify(p.expected == null ? null : p.expected)` printed "demanded null and found
    // null" from a payload carrying neither — four words of fabricated measurement.
    hint: (p) => composeFamilyRefusalHint('kernel_cas_lost', p),
  }),
  kernel_integrity_broken: Object.freeze({
    locus: 'L1', auto_remediable: false,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.kernel_integrity_broken,
    route: (p) => INTEGRITY_ROUTE_BY_KIND[p.kind] || null,
    hint: (p) => composeFamilyRefusalHint('kernel_integrity_broken', p),
  }),
  kernel_lock_held: Object.freeze({
    locus: 'L1', auto_remediable: true,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.kernel_lock_held,
    route: (p) => {
      if (p.kind === 'project_claim') return inGrammar('claim', 'resume', '--project <occupying_project> --json');
      if (p.kind === 'replan_fence') return inGrammar('replan', 'resume', '--project <P> --json');
      if (p.stale) return inGrammar('adaptive-node', 'unlock', '--project <P> --holder <pid|none> --json');
      return terminalRoute('environment', { blocker: 'live_holder', wait_on: (p.holder && p.holder.pid) || null });
    },
    // `stale` is the schema's declared SECONDARY discriminator: it selects the ROUTE arm and is
    // rendered by the FACT, but the WHY key stays `${code}/${kind}` — the secondary split belongs
    // to what happened, not to why it matters.
    hint: (p) => composeFamilyRefusalHint('kernel_lock_held', p),
  }),
  kernel_evidence_missing: Object.freeze({
    locus: 'L1', auto_remediable: true,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.kernel_evidence_missing,
    route: (p) => EVIDENCE_ROUTE_BY_RECORD_KIND[p.record_kind] || null,
    hint: (p) => composeFamilyRefusalHint('kernel_evidence_missing', p),
  }),
  sink_verdict: Object.freeze({
    locus: 'L2', auto_remediable: true,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.sink_verdict,
    // ONE AUTHORITATIVE EXIT PER REFUSAL.
    //
    // The read-all-again verb is the COMPOSITE's route, and only the composite's. With several
    // findings no single verb clears the verdict, so re-reading is the honest exit: it is
    // read-only and does not short-circuit, and following it can never dead-end.
    //
    // A payload naming EXACTLY ONE finding is not a composite. There is nothing to re-read —
    // every refusal in this class is emitted BEFORE anything is written — so a re-read reports
    // nothing at all, and the finding's own remedy route is the one exit that can clear it. The
    // route contract's promise is that a refusal names exactly one exit and that exit accepts the
    // work; a top-level verb that contradicted the per-finding resolver would hand an operator
    // two answers, one of which can never clear the refusal.
    //
    // A single finding whose cure the kernel deliberately does not name (the `foreign_archive`
    // silence, or a bare `unattributed_paths` carrying no subtype) keeps the re-read verb. That is
    // a promise to REPORT again — which re-reading can keep — not a promise to accept a fix, and
    // it leaves the deliberate per-finding null exactly where it lives, in the per-finding
    // resolver the sweep checks.
    route: (p) => {
      const findings = Array.isArray(p.findings) ? p.findings.filter(isPlainObject) : [];
      if (findings.length === 1) {
        const own = resolveSinkFindingRoute(findings[0]);
        if (own) return own;
      }
      return inGrammar('claim', 'finalize', '--check --project <P> --json');
    },
    // The FACT now renders each finding as `kind/subtype`. Rendering the kind alone dropped the
    // field that says what actually happened: eight distinct `unattributed_paths` cells, with
    // eight different cures, all read out as the same four words.
    hint: (p) => composeFamilyRefusalHint('sink_verdict', p),
  }),
  consent_required: Object.freeze({
    locus: 'A3', auto_remediable: false,
    payload_schema: REFUSAL_PAYLOAD_SCHEMAS.consent_required,
    route: () => terminalRoute('consent', {}),
    hint: (p) => composeFamilyRefusalHint('consent_required', p),
  }),
});

// ---------------------------------------------------------------------------
// R4_NON_REMEDIABLE_CELLS — the per-CELL tightening of `auto_remediable`.
//
// The registry flag is a FAMILY DEFAULT, and the family is the wrong grain for R4. R4 asks
// a question about CONTENT — would repairing this deviation launder the evidence? — and one
// composite family holds cells that answer it differently. `sink_verdict` is auto-remediable
// at the family level and correctly so: a red chain is re-run, an out-of-set write is
// reverted, an unattributed write is attributed. But `final_fix_production_surface` is the
// one cell R4 exists to name. A behavior change arriving after every reviewer is discharged
// is not a non-canonical FORM of correct content; it is a deviation that is ITSELF EVIDENCE
// — evidence that the certification standing over this candidate no longer describes it —
// so it is reported, never repaired, and admitting it behind any receipt would convert a
// fact about the run into a receipt saying the opposite. A family-level `true` cannot say
// that, so before this list it said the opposite by default.
//
// TIGHTEN-ONLY, in the same sense as every other axiom in this repo: a listed cell may only
// turn a `true` family into `false`. It can never widen a family that is already `false`,
// and it never touches the FAMILY column, which stays the single three-way-equality source
// shared by the ADR's fenced vocabulary block, the registry and the vocabulary constant.
// ---------------------------------------------------------------------------
const R4_NON_REMEDIABLE_CELLS = Object.freeze([
  'sink_verdict/final_fix_production_surface',
]);

// resolveAutoRemediable(code, payload) — the ONE accessor. TOTAL: `null` for a code outside
// the enumerated vocabulary, the family default otherwise, tightened to `false` for a cell
// this list names. Never throws.
function resolveAutoRemediable(code, payload) {
  const row = KERNEL_REFUSAL_REGISTRY[code];
  if (!row) return null;
  if (row.auto_remediable === false) return false;
  let key = null;
  try { key = refusalCellKey(code, payload); } catch (_) { key = null; }
  if (key && R4_NON_REMEDIABLE_CELLS.indexOf(key) >= 0) return false;
  return row.auto_remediable;
}

// resolveRoute(code, payload) — the ONE route entry point. Total: never throws, returns
// null when the payload carries no discriminator the family knows.
function resolveRoute(code, payload) {
  const row = KERNEL_REFUSAL_REGISTRY[code];
  if (!row) return null;
  try {
    const route = row.route(isPlainObject(payload) ? payload : {});
    return route || null;
  } catch (_) { return null; }
}

// resolveSinkFindingRoute(finding) — the PER-FINDING resolver inside the composite. Keyed
// by `kind`, then by `subtype` for the unattributed family. A null result is the
// deliberate `foreign_archive` silence, not a gap.
function resolveSinkFindingRoute(finding) {
  if (!isPlainObject(finding)) return null;
  if (finding.kind === 'unattributed_paths') {
    const entry = SINK_FINDING_ROUTE_BY_SUBTYPE[finding.subtype];
    return entry ? entry.route : null;
  }
  const entry = SINK_FINDING_ROUTE_BY_KIND[finding.kind];
  return entry ? entry.route : null;
}

// validateRefusalPayload(code, payload) — total, never throws.
// { ok, errors: [] }. Checks the code is enumerated, the family's discriminator is
// present and in its declared enum, and (for the composite) that every finding kind and
// unattributed subtype is declared.
function validateRefusalPayload(code, payload) {
  const errors = [];
  if (KERNEL_REFUSAL_VOCABULARY.indexOf(code) < 0) {
    return { ok: false, errors: ['code "' + code + '" is not in KERNEL_REFUSAL_VOCABULARY'] };
  }
  const schema = REFUSAL_PAYLOAD_SCHEMAS[code];
  const p = isPlainObject(payload) ? payload : {};
  if (code === 'sink_verdict') {
    if (!Array.isArray(p.findings)) errors.push('sink_verdict requires findings[]');
    else {
      p.findings.forEach((f, i) => {
        if (!isPlainObject(f)) { errors.push('findings[' + i + '] is not an object'); return; }
        if (SINK_FINDING_KINDS.indexOf(f.kind) < 0) errors.push('findings[' + i + '].kind "' + f.kind + '" is not declared');
        if (f.kind === 'unattributed_paths' && f.subtype != null
          && SINK_UNATTRIBUTED_SUBTYPES.indexOf(f.subtype) < 0) {
          errors.push('findings[' + i + '].subtype "' + f.subtype + '" is not declared');
        }
      });
    }
    if (p.scope != null && schema.enums.scope.indexOf(p.scope) < 0) errors.push('scope "' + p.scope + '" is not declared');
    return { ok: errors.length === 0, errors: errors };
  }
  const d = schema.discriminator;
  if (p[d] == null) errors.push('missing discriminator "' + d + '"');
  else if (schema.values.indexOf(p[d]) < 0) errors.push(d + ' "' + p[d] + '" is not declared for ' + code);
  for (const key of Object.keys(schema.enums)) {
    if (p[key] != null && schema.enums[key].indexOf(p[key]) < 0) {
      errors.push(key + ' "' + p[key] + '" is not declared for ' + code);
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

// ---------------------------------------------------------------------------
// THE COMPATIBILITY CLASSIFIER — an ORDERED PATTERN RULE LIST, not a per-condition table.
//
// This is the anti-mirror boundary. A legacy condition is classified by MATCHING, so the
// list grows with families and shapes, never with incidents; a token no rule matches is
// UNCLASSIFIED, which is an honest statement of remaining migration work rather than a
// silent default. Nothing here is a registry key.
//
// Rules are matched IN ORDER, first match wins, so the narrow closed families come before
// the broad suffix patterns. A `family: null` rule is an explicit statement that a token
// is NOT in the vocabulary (advisory / tool outcome / usage error / deleted) — it stops a
// later catch-all from claiming it, and the silence becomes deliberate.
// ---------------------------------------------------------------------------
const REFUSAL_COMPATIBILITY_RULES = Object.freeze([
  // --- explicitly OUT of the vocabulary (silence made deliberate) ----------
  { family: null, match: [
    // Advisories that a suffix rule would otherwise claim.
    'runtime_profile_unavailable', 'no_barrier_base', 'no_group_base', 'no_leg_base',
    'barrier_failed', 'group_barrier_failed', 'leg_barrier_failed', 'selector_failed',
    'no_selector_line', 'gate_not_complete', 'node_not_ready', 'no_ready_node',
    'node_not_found', 'node_not_in_ledger', 'plan_missing', 'next_action_failed',
    'certifier_binding_seed_missing', 'upstream_not_consumed', 'repair_requires_replan',
    'repair_limit_reached', 'rebind_limit_reached', 'expansion_point_not_openable',
    // Outcome values on ok envelopes.
    'no_worktree', 'worktree_dir_missing', 'frontier_blocked', 'gate_live', 'fanout_refuted',
    'already_finalized', 'finalize_incomplete', 'project_archived', 'unlink_failed',
    // Usage errors (exit 2, no locus).
    'missing_node_id', 'node_id_required', 'attempt_id_required', 'missing_nodes',
    'too_few_nodes', 'missing_group_id', 'missing_leg_root', 'missing_project',
    'invalid_args', 'invalid_project', 'invalid_reason', 'unknown_flag',
    'finding_json_unreadable', 'expansion_composition_malformed',
    'replan_consent_reference_required',
    // `replan_planner_dispatch_required` states that the planner has not been dispatched YET.
    // Nothing was attempted and nothing failed, so it is a tool ANSWER (`replan resume` returns
    // `result: 'planner_dispatch_required'` and exits 0) and not a refusal at any locus. Listed
    // here so the `/^replan_/` suffix rule below cannot re-claim it into a kernel-write cell whose
    // rendered sentence is false in every clause.
    'replan_planner_dispatch_required',

    // --- READS A TOOL COULD NOT RESOLVE, AND NO KERNEL ANCHOR STANDS ON THEM -------------
    //
    // These are the second half of the `_unavailable` split (the first half is the anchor-read
    // block down in the integrity section). The suffix rule that used to claim the whole family
    // said `record: 'position'` about every one of them, which rendered "the position record write
    // did not take … a half-applied position leaves the ledger and the running set disagreeing" —
    // false in every clause, because nothing was being written and no position exists to half-apply.
    //
    // The split is by WHAT the unresolved read was, never by the token's spelling:
    //   * a KERNEL PROOF ANCHOR could not be read  -> kernel_integrity_broken/absent_anchor. Absence
    //     is not a pass, so the transition may not proceed and the anchor may not be re-derived.
    //   * a TOOL'S OWN PROBE would not answer, and nothing the kernel certifies depends on it -> here.
    //     `kaola-workflow-release.js` asking git for its tag list, `kaola-workflow-claim.js` asking
    //     the forge whether an issue is claimable: a subprocess that would not answer is a fact the
    //     tool reports about its own environment, not a verdict about this run's kernel records.
    //     The vocabulary has SEVEN rows and no row for "a tool's read probe failed"; minting one is
    //     the additive move the ADR forbids, so the honest classification is that these carry no
    //     family. That is a statement, not a gap — a wrong family plus a route that dead-ends is
    //     strictly worse for an operator than no claim at all.
    'release_tag_list_unavailable', 'release_history_unavailable', 'worktree_status_unavailable',
    'candidate_baseline_unavailable', 'candidate_history_unavailable', 'candidate_diff_unavailable',
    // Pre-claim, at Gate 1: the forge would not answer, or the issue is not claimable. Nothing is
    // written (an explicit-target claim refuses with zero side effects), and `target_unavailable` is
    // literally a `verdict:` VALUE on the classifier's envelope — an outcome, like the block above.
    'target_unavailable', 'target_set_unavailable',
    // No leg branches exist to merge. The exact shape of `no_barrier_base` / `no_group_base` /
    // `no_leg_base` three lines up, which are already advisories; it reached a write-failed cell
    // only because `/^no_leg_branches$/` had no rule of its own and the suffix list swept it up.
    'no_leg_branches',
    // `replan_consent_not_requested` is the NEGATION of a consent refusal: the ledger shows no
    // pending request and the budget is not spent, so there is nothing to extend. Nothing was
    // attempted and nothing failed — the tool is reporting the state it found.
    'replan_consent_not_requested',
    // `replan abort` without `--transaction <id>`: a usage error, exactly like the block above.
    'replan_abort_transaction_required',
    // A routing ANSWER, and one that already carries its own exit: the source finding lies inside a
    // milestone's declared surface, so the local re-expansion path answers it and NO EPOCH IS SPENT.
    // The payload sets `route: 'reexpand-open'` itself, so a stamped `replan resume` route
    // CONTRADICTED it — one refusal with two exits, one of which can never clear it.
    'replan_superseded_by_local_reexpansion',
  ] },

  // --- A3: the consent valve ----------------------------------------------
  { family: 'consent_required', patch: { kind: 'halt_fence' }, match: ['halt_pending'] },
  { family: 'consent_required', patch: { kind: 'acceptance_change' },
    match: ['acceptance_repair_fenced', 'replan_child_acceptance_changed'] },
  { family: 'consent_required', patch: { kind: 'budget_exhausted' }, match: ['replan_consent_required'] },
  { family: 'consent_required', patch: { kind: 'turn_reference_conflict' }, match: ['replan_consent_reference_reused'] },
  { family: 'consent_required', patch: { kind: 'disambiguation' },
    match: [/^clarification_/, 'target_ambiguity', 'resume_ambiguous', 'selection_indeterminate'] },
  { family: 'consent_required', patch: { kind: 'schema_upgrade' }, match: ['review_journal_schema_upgrade_required'] },
  { family: 'consent_required', patch: { kind: 'halt_fence', halt_reason: 'merge_conflict' }, match: ['merge_conflict'] },

  // --- L1: lock held ------------------------------------------------------
  { family: 'kernel_lock_held', patch: (c) => ({ kind: 'scheduler', stale: c === 'scheduler_lock_stale' }),
    match: [/^scheduler_lock/, 'scheduler_locked'] },
  { family: 'kernel_lock_held', patch: { kind: 'replan_fence' }, match: ['replan_in_progress'] },
  { family: 'kernel_lock_held', patch: { kind: 'project_claim' },
    match: ['target_occupied', 'target_set_conflicts_active_work'] },

  // --- L1: evidence missing (ABSENCE only) --------------------------------
  { family: 'kernel_evidence_missing', patch: { record_kind: 'node_evidence', defect: 'absent' },
    match: ['evidence_absent'] },
  { family: 'kernel_evidence_missing', patch: { record_kind: 'selection_record', defect: 'absent' },
    match: [/^selection_record_/] },
  { family: 'kernel_evidence_missing', patch: { record_kind: 'final_fix_register', defect: 'absent' },
    match: ['final_fix_register_unverified'] },

  // --- L2: the composite sink verdict -------------------------------------
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'tests_red', detail: c }] }),
    match: [/^chains_/, /^final_validation_/, 'repo_kind_undetermined'] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'unattributed_paths', subtype: c, detail: c }] }),
    match: SINK_UNATTRIBUTED_SUBTYPES },
  // `staging_guard_foreign_archive` is the finalize-time EMISSION of the `foreign_archive`
  // subtype — the same condition under its legacy token — so it classifies to THAT cell, not to
  // the generic `unattributed_write` one. This is the `final_fix_production_surface` remedy below
  // applied where the misfold is BEHAVIOR-VISIBLE rather than coincidental: `unattributed_write`
  // routes to `amend-surface`, and `foreign_archive`'s route is a DELIBERATE null. Folding the two
  // handed the operator an exit that ATTRIBUTES another run's archive onto this run's write set —
  // exactly the laundering the null exists to forbid — while the same hint's WHY clause said the
  // condition has no cure at all. Classifying to its own cell puts the fact, the WHY and the exit
  // in ONE cell, and makes the dedicated `foreign_archive` cell reachable from the only legacy
  // token that means it.
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'unattributed_paths', subtype: 'foreign_archive', detail: c }] }),
    match: ['staging_guard_foreign_archive'] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'unattributed_paths', subtype: 'unattributed_write', detail: c }] }),
    match: ['unattributed_change', 'staging_guard_multi_project',
      'seam_checkpoint_unattributable'] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'unreviewed_change', detail: c }] }),
    match: ['gate_unsatisfied', 'verdict_not_pass', 'rebind_base_not_reviewed',
      'reexpansion_review_wall_missing'] },
  // `final_fix_production_surface` is a DECLARED finding kind in its own right, so it classifies to
  // ITSELF rather than being folded into `unreviewed_change`. Folding it read the same route by
  // coincidence — both cells happen to name `replan shape-refutation` — while putting the bare
  // `route:` token and the structured `refusal_route` in DIFFERENT registry cells, where either can
  // be changed without the other. Classifying to its own kind puts both renderings of the exit in
  // ONE cell (`legacy_token` and `.route` of the same frozen entry), and gives the operator that
  // cell's own WHY clause instead of the generic unreviewed-change one.
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'final_fix_production_surface', detail: c }] }),
    match: ['final_fix_production_surface'] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'unsettled_review', detail: c }] }),
    match: ['review_attempt_unresolved', 'review_attempt_consumed'] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'candidate_drift', detail: c }] }),
    match: [/^candidate_(digest|residue|slice)_changed$/] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'sink_already_started', detail: c }] }),
    match: ['reexpansion_after_sink_started', 'final_fix_after_sink_started'] },
  { family: 'sink_verdict', patch: (c) => ({ findings: [{ kind: 'forge_chain_unsettled', detail: c }] }),
    match: ['implementation_commit_missing', 'impl_commit_not_ancestor', 'active_folder_still_present',
      'archive_folder_missing', 'worktree_lingering', 'branch_lingering'] },

  // --- L1: integrity broken (R4) — keyed by KIND, never by anchor ---------
  { family: 'kernel_integrity_broken', patch: { kind: 'replay_binding' },
    match: ['evidence_stale', 'evidence_unbound', 'review_journal_replay_identity_mismatch'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'cycle' }, match: [/_cycle$/] },
  { family: 'kernel_integrity_broken', patch: { kind: 'unattributed_delta' },
    match: ['candidate_delta_unattributed', 'rebind_base_rewrite_unsafe'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'hash_mismatch' },
    match: [/_hash_mismatch$/, 'plan_integrity_failed', 'mirror_verify_failed'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'chain_break' },
    match: [/^ledger_(chain_journal_missing|missing|unparseable)$/, /^replan_transaction_history_/,
      /^replan_source_history_/, 'expansion_records_malformed', 'review_journal_missing',
      'replan_committed_predecessor_unresolved', 'replan_history_receipt_collision',
      'replan_consent_ledger_invalid'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'last_copy_in_target' },
    match: ['archive_incomplete', 'node_evidence_missing', 'archive_only_in_worktree', 'archive_refused',
      /^cwd_inside_/] },
  { family: 'kernel_integrity_broken', patch: { kind: 'absent_anchor' },
    match: [/^barrier_base_(missing|empty)$/, 'reanchor_provenance_unprovable', 'acceptance_anchor_unreadable',
      'legacy_claim_upgrade_required', 'drop_base_window_open', 'leg_base_unreachable',
      'merge_base_unreachable', 'leg_omitted_from_merge', 'leg_baseline_split', 'barrier_base_mismatch'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'noncanonical_bytes' },
    match: [/_not_canonical$/, /^review_journal_legacy_import_/] },
  { family: 'kernel_integrity_broken', patch: { kind: 'schema_mismatch' },
    match: [/_malformed$/, /_schema2_contract_invalid$/, /_version_mismatch$/, /^replan_transaction_(invalid|attempt_invalid)$/,
      'review_producer_history_invalid', 'state_active_plan_invalid', 'state_epoch_schema_missing',
      'state_current_epoch_authority_invalid', 'replan_child_first_node_invalid'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'identity_mismatch' },
    match: [/_identity_mismatch$/, /^snapshot_.*_mismatch$/, /^epoch_lineage_/, 'epoch_state_mismatch',
      'epoch_contract_invalid', 'current_epoch_authority_invalid', 'replan_child_integrity_failure',
      /^replan_pre_freeze_cas_/, 'writer_identity_changed', 'review_profile_hash_mismatch',
      /^review_context_(mismatch|plan_mismatch)$/, 'review_receipt_identity_invalid'] },

  // --- L1: integrity broken — THE SEALED-ARCHIVE VERIFIER (R4) -------------
  //
  // `verifySnapshotManifest` / `verifyAllEpochSnapshots` / `verifySchema2SnapshotBinding` /
  // `verifyLegacyExternalBinding` are READ-ONLY verifiers over an already-sealed parent epoch.
  // Nothing is being written when they answer, so the write-failed suffix rule below was wrong on
  // both halves at once: it rendered "the position record write did not take" about a verifier that
  // writes nothing, and it stamped `auto_remediable: true` plus a RETRY verb on a seal that does not
  // verify — which is exactly the laundering R4 forbids. A snapshot whose manifest, file index,
  // binding or lineage does not check out IS the evidence; it is reported and investigated, never
  // repaired. The BUILD-path snapshot faults (`buildSnapshot` could not stage or rename) are a
  // different thing and deliberately stay under `kernel_write_failed` below, where an idempotent
  // retry is the correct exit.
  //
  // Every kind chosen here routes to `adaptive-node orient`, which is read-only and NOT in
  // `REPLAN_GUARDED_SUBCOMMANDS`. `chain_break` / `last_copy_in_target` are deliberately NOT used:
  // their route is `adaptive-node write-halt`, which IS replan-guarded, so during the very fence
  // these conditions fire under it would refuse `replan_in_progress` — a route that dead-ends is
  // the defect this contract exists to prevent.
  { family: 'kernel_integrity_broken', patch: { kind: 'absent_anchor' },
    match: ['snapshot_manifest_missing', 'snapshot_authority_unreadable', 'snapshot_epochs_unreadable',
      'snapshot_state_binding_unreadable', 'snapshot_staging_incomplete', 'snapshot_stage_files_missing'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'schema_mismatch' },
    match: ['snapshot_manifest_type_invalid', 'snapshot_epochs_type_invalid', 'snapshot_epoch_entry_invalid',
      'snapshot_epoch_sequence_invalid', 'snapshot_directory_invalid', 'snapshot_path_invalid',
      'snapshot_case_collision', 'snapshot_symlink_refused', 'snapshot_hardlink_refused',
      'snapshot_special_file_refused',
      // The transaction bytes will not parse, so `abort` cannot PROVE the epoch is still
      // pre-activation. Its own payload already says "this is a broken kernel record, not a routine
      // discard" and routes to the consent valve; classifying it as a retryable position write said
      // the opposite to every consumer reading the envelope structurally.
      'replan_abort_undecidable'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'identity_mismatch' },
    match: ['snapshot_child_binding_invalid', 'snapshot_lineage_binding_invalid',
      'legacy_snapshot_binding_unsealed', 'legacy_external_seal_mismatch', 'legacy_child_not_pending'] },

  // --- L1: integrity broken — THE ANCHOR-READ BAND (R4) --------------------
  //
  // A READ THAT COULD NOT RESOLVE IS NOT A WRITE THAT DID NOT TAKE. Every condition here reports
  // that the anchor some proof stands on could not be read — the barrier verdict, the review
  // candidate, the writer identity, the epoch authority, the plan contract, the reviewer profile,
  // the validation vectors, the leg's own cleanliness. Nothing was being written when any of them
  // fired, so the write-failed suffix rule was wrong twice over, exactly as it was for the sealed
  // archive verifiers above: it rendered "the position record write did not take … a half-applied
  // position leaves the ledger and the running set disagreeing" about a read, and it stamped
  // `auto_remediable: true` plus a RETRY verb on a proof that could not be made.
  //
  // `absent_anchor` is the cell that already says the true thing — "an anchor that cannot be read is
  // indistinguishable from one that would have failed" — and it is what every one of these sites
  // already DOES: they fail closed rather than guess. `classifyWriterReconcile` halts on an
  // unverifiable barrier because "neither is proof the writer is clean"; `baseline_partition` refuses
  // rather than guess "absent", because guessing would DELETE a file the baseline still holds;
  // `leg_dirty_probe_failed` refuses because reading a failed probe as "leg is clean" would silently
  // omit real leg content from the octopus merge. Absence is not a pass, in all three.
  //
  // ABSENT IS NOT "PRESENT AND WRONG", and this band keeps the two apart rather than folding them.
  // `review_profile_identity_unavailable` (the identity block is NOT THERE) is here;
  // `review_profile_identity_ambiguous` (it is there TWICE) and `review_profile_hash_mismatch` (it is
  // there and disagrees) are different conditions with different cures and are deliberately not
  // swept in beside it.
  //
  // Every kind here routes to `adaptive-node orient` — read-only, in INVESTIGATION_OR_DISCARD, and
  // NOT in REPLAN_GUARDED_SUBCOMMANDS, so it stays reachable under the re-plan fence. The `anchor`
  // field is deliberately left unset: no rule in this list has ever derived one, and inventing a
  // per-condition anchor is how a kind-keyed route becomes a per-incident table again.
  //
  // THE PRESENT-AND-WRONG HALF OF THE SAME BAND. These four report a value that WAS produced and
  // then failed a shape check — the object-format probe answered with an unrecognized value and the
  // explicit `tree entry malformed` / `blob length malformed` throws land here; the candidate
  // partition was computed and failed its canonical blob-map / residue-digest check; a digest was
  // produced and is not 64-hex; the presence probe answered in a shape that is not an array.
  // Telling an operator "the anchor is not there" sends the investigation after a missing record
  // while the record is sitting in front of it in the wrong shape, and those have opposite cures.
  // `schema_mismatch` is the cell that already says the true thing, and it already carries the SAME
  // route and the SAME `auto_remediable: false` — so this moves the sentence and nothing else. No
  // new kind: minting an eleventh for four conditions is how a kind-keyed route becomes a
  // per-incident table again.
  { family: 'kernel_integrity_broken', patch: { kind: 'schema_mismatch' },
    match: ['baseline_partition_unavailable', 'candidate_digest_unavailable',
      'candidate_partition_unavailable', 'finding_anchor_index_unavailable'] },
  { family: 'kernel_integrity_broken', patch: { kind: 'absent_anchor' },
    match: ['barrier_unavailable', 'candidate_hash_unavailable',
      'writer_identity_unavailable', 'current_epoch_authority_unavailable', 'plan_contract_unavailable',
      'finding_uid_unavailable', 'review_repair_delta_unavailable',
      'review_profile_unavailable', 'review_profile_identity_unavailable',
      'snapshot_verifier_unavailable', 'validation_vector_read_failed', 'leg_dirty_probe_failed'] },

  // --- L1: CAS lost -------------------------------------------------------
  { family: 'kernel_cas_lost', patch: { record: 'ledger_row' },
    match: ['close_transition_disallowed', 'node_not_complete', 'ledger_row_missing',
      'ledger_status_unexpected', 'would_orphan_in_progress', 'would_strand_completed_dependent',
      'expansion_unit_id_collision'] },
  { family: 'kernel_cas_lost', patch: { record: 'evidence_generation' },
    match: [/^evidence_generation_/, /^review_generation_/] },
  { family: 'kernel_cas_lost', patch: { record: 'review_attempt' }, match: ['review_attempt_settled'] },
  { family: 'kernel_cas_lost', patch: { record: 'review_receipt' },
    match: ['review_outcome_receipts_immutable', 'review_receipt_immutable'] },
  { family: 'kernel_cas_lost', patch: { record: 'review_context' }, match: ['review_context_hash_collision'] },
  { family: 'kernel_cas_lost', patch: { record: 'governance_ack' }, match: ['governance_ack_stale'] },
  { family: 'kernel_cas_lost', patch: { record: 'parent_plan' },
    match: ['replan_parent_plan_changed', 'replan_parent_missing', 'replan_parent_hash_invalid'] },
  { family: 'kernel_cas_lost', patch: { record: 'parent_state' }, match: ['replan_parent_state_changed'] },
  { family: 'kernel_cas_lost', patch: { record: 'replan_source' },
    match: ['replan_source_changed', 'replan_source_lineage_mismatch', 'replan_source_conflict'] },
  { family: 'kernel_cas_lost', patch: { record: 'claim_root' },
    match: [/^claim_root_/, 'claim_lineage_digest_mismatch', 'claim_worktree_mismatch',
      'legacy_claim_root_unprovable'] },
  { family: 'kernel_cas_lost', patch: { record: 'plan_hash' },
    match: ['replan_child_authority_unverified', 'replan_child_binding_mismatch', 'rebind_replay_diverged'] },

  // --- L1: write failed — the SUFFIX patterns, matched LAST ---------------
  { family: 'kernel_write_failed', patch: (c) => ({ record: 'plan', step: 'freeze', target: c }),
    match: [/^plan_invalid:/, /^freeze_failed/, 'cannot_reread_plan_after_freeze'] },
  // THERE IS NO `/_unavailable$/` SWEEP RULE, AND ITS ABSENCE IS THE POINT. One suffix pattern used
  // to claim every token spelled that way into `record: 'position'`, on the strength of the spelling
  // alone — a read that could not resolve and a write that did not take are opposite events, and the
  // rule declared them the same one. The band is now split by WHAT the unresolved read was: a kernel
  // proof anchor (the anchor-read band, `kernel_integrity_broken/absent_anchor`) or a tool's own
  // probe (out of the vocabulary, in the first block). A future `_unavailable` token matching neither
  // is UNCLASSIFIED, which is this list's honest remaining-work signal and is what the deleted rule
  // was hiding.
  // THE REPLAN BAND'S EXIT IS `replan resume`, AND ONLY `replan resume`.
  //
  // The record-class default for `position` is `adaptive-node reconcile-running-set`, and every
  // condition matched here fires while the project is REPLAN-FENCED. `reconcile-running-set` is in
  // `REPLAN_GUARDED_SUBCOMMANDS`, so the live guard refuses it `replan_in_progress` for any
  // action except the literal `'replan resume'` — an operator who followed the recorded route was
  // refused a second time, by a different code, with no exit named. That is the exact dead-end the
  // route contract exists to make impossible, and it is fixed here rather than by minting finer
  // codes: ONE payload-carried retry route, correct for the whole band. `replan resume` is
  // idempotent by construction — it re-reads the transaction, re-verifies its seams and rolls the
  // same phase forward or reports the same reason again — which is precisely what the retry arm of
  // this family promises.
  { family: 'kernel_write_failed', patch: (c) => ({ record: 'position', step: c,
    retry_verb: 'resume', retry_script: 'replan', retry_args: '--project <P> --json' }),
    match: [/^replan_/, /^snapshot_/, /^cleanup_/] },
  { family: 'kernel_write_failed', patch: (c) => ({ record: 'evidence', target: c }),
    match: [/^evidence_/, /^review_(context|receipt)_persist_failed$/, 'review_evidence_validation_failed',
      'substitute_evidence_reset_failed'] },
  { family: 'kernel_write_failed', patch: (c) => ({ record: 'forge_chain', target: c }),
    match: ['finalize_commit_failed', 'archive_exception', 'target_set_label_rollback_failed',
      'target_set_mismatch'] },
  { family: 'kernel_write_failed', patch: (c) => ({ record: 'position', target: c }),
    match: [/_persist_failed$/, /_write_failed$/, /_read_failed$/, /_rollback_failed$/,
      /_cleanup_failed$/, /_probe_failed$/, /^baseline_/, /^group_baseline_/, /^mirror_(failed|sync_failed)$/,
      /^leg_(provision|capture)_failed$/, 'ledger_splice_failed', 'seam_checkpoint_failed',
      'finalize_mirror_refused', 'merge_head_unresolved', 'no_leg_branches'] },
]);

function matchesRule(rule, condition) {
  for (const m of rule.match) {
    if (typeof m === 'string') { if (m === condition) return true; }
    else if (m instanceof RegExp) { if (m.test(condition)) return true; }
  }
  return false;
}

// classifyRefusalCondition(condition) — the compatibility lookup.
// Returns { family, patch } for a classified token, { family: null, explicit: true } for a
// token a rule deliberately excludes, or null when NOTHING matched (unclassified — the
// P2 remaining-work signal). Total: never throws.
function classifyRefusalCondition(condition) {
  if (typeof condition !== 'string' || !condition) return null;
  for (const rule of REFUSAL_COMPATIBILITY_RULES) {
    if (!matchesRule(rule, condition)) continue;
    if (rule.family === null) return { family: null, explicit: true, patch: {} };
    let patch = {};
    try { patch = typeof rule.patch === 'function' ? rule.patch(condition) : Object.assign({}, rule.patch); }
    catch (_) { patch = {}; }
    return { family: rule.family, explicit: true, patch: patch };
  }
  return null;
}

// ---------------------------------------------------------------------------
// DUAL EMISSION.
//
// `REFUSAL_EMISSION_MODE` is the ONE switch that decides which token rides in `reason`.
//   'compat' (SHIPPED)  — `reason` keeps its LEGACY token, so every consumer that
//                         string-matches today keeps working unchanged; the family rides
//                         in `refusal_family` and the legacy token is mirrored into
//                         `condition` (the census metric).
//   'family'            — `reason` carries the FAMILY and `condition` carries the legacy
//                         token. This is the end state, and it is gated on the consumers
//                         having migrated.
//
// WHAT THE SWITCH ACTUALLY COVERS — and it is NOT every refusal this workflow emits.
//
// Dual emission is a property of `stampRefusalEnvelope`, so it holds on exactly the envelopes
// that PASS THROUGH it: the shared `refuse()` constructor above, and the one direct stamp seam.
// Today that is `kaola-workflow-adaptive-node.js` and `kaola-workflow-replan.js` — and, within
// those, only the sites built by `refuse()` rather than by an object literal.
//
// It does NOT reach `kaola-workflow-claim.js`, `kaola-workflow-plan-validator.js`,
// `kaola-workflow-adaptive-handoff.js`, `kaola-workflow-commit-node.js`,
// `kaola-workflow-next-action.js` or `kaola-workflow-run-chains.js`. Those build refusal
// envelopes as object literals or through their OWN local `refuse` closures, so a refusal from
// one of them carries no `refusal_family`, `refusal_locus`, `refusal_route` or `condition` even
// when its token IS classifiable. A consumer that matches on `refusal_family` therefore misses
// every refusal from those surfaces — including the Gate-1 commitment point
// (`selection_record_missing`, which classifies to `kernel_evidence_missing` and has a real
// route). Do not read "dual emission" as a whole-workflow guarantee; it is a per-call-site one.
//
// SO FLIPPING THE CONSTANT IS NOT THE WHOLE CHANGE. The flip rewrites `reason` on stamped
// envelopes only, and it cannot be extended to the rest by wiring the stamp in at those call
// sites alone: the stamp derives its legacy token from `envelope.condition || envelope.reason`,
// and those surfaces emit `status` / `verdict` / `handoff_status`-shaped envelopes that carry
// NEITHER — so the stamp returns them untouched. Reaching them requires those envelopes to
// carry a `reason` or `condition` FIRST, which is a change to their emitted shape and therefore
// to what their consumers read. That work is not done, and this comment does not pretend it is.
//
// The stamp is ADDITIVE and IDEMPOTENT: it never overwrites a field a caller already set
// (a caller knows its concrete situation; the registry only supplies the default), and it
// never removes or rewrites one.
// ---------------------------------------------------------------------------
const REFUSAL_EMISSION_MODE = 'compat';

function stampRefusalEnvelope(envelope) {
  if (!isPlainObject(envelope)) return envelope;
  const actionable = envelope.result === 'refuse' || envelope.result === 'halt' || envelope.result === 'warn';
  if (!actionable) return envelope;
  const legacy = envelope.condition || envelope.reason;
  if (typeof legacy !== 'string' || !legacy) return envelope;
  if (envelope.condition == null) envelope.condition = legacy;

  const classified = classifyRefusalCondition(legacy);
  if (!classified || !classified.family) return envelope;
  const row = KERNEL_REFUSAL_REGISTRY[classified.family];
  if (!row) return envelope;

  if (envelope.refusal_family == null) envelope.refusal_family = classified.family;
  if (envelope.refusal_locus == null) envelope.refusal_locus = row.locus;
  // The payload the resolver reads is the envelope itself, widened by the classifier's
  // derived discriminator — so a call site that already carries the discriminator wins.
  const payload = Object.assign({}, classified.patch, envelope);
  for (const key of Object.keys(classified.patch)) {
    if (envelope[key] == null) payload[key] = classified.patch[key];
  }
  // R4 is a property of the CELL, not of the family. A composite family that is
  // auto-remediable overall still holds cells that must never be repaired, so the flag is
  // RESOLVED from the payload rather than read off the family row — otherwise the one
  // deviation R4 exists to name ships with no `auto_remediable` stamp at all, which reads as
  // "repair it" to every consumer. Still stamped only when FALSE and only when the caller
  // left it unset: the stamp stays additive and idempotent.
  if (envelope.auto_remediable == null && resolveAutoRemediable(classified.family, payload) === false) {
    envelope.auto_remediable = false;
  }
  if (envelope.refusal_route == null) {
    const route = resolveRoute(classified.family, payload);
    if (route) envelope.refusal_route = route;
  }
  if (REFUSAL_EMISSION_MODE === 'family') envelope.reason = classified.family;
  return envelope;
}

// ---------------------------------------------------------------------------
// deriveDeviationRoutes() — the shipped bare-verb `route:` table, DERIVED from the
// per-finding resolver above so the two cannot drift. This is the fold: the routes have
// ONE source, and the aggregator that emits them holds no independent copy.
// `foreign_archive`'s absence is preserved by the null entry.
// ---------------------------------------------------------------------------
function deriveDeviationRoutes() {
  const out = {};
  for (const subtype of Object.keys(SINK_FINDING_ROUTE_BY_SUBTYPE)) {
    const entry = SINK_FINDING_ROUTE_BY_SUBTYPE[subtype];
    if (entry && entry.legacy_token) out[subtype] = entry.legacy_token;
  }
  for (const kind of Object.keys(SINK_FINDING_ROUTE_BY_KIND)) {
    const entry = SINK_FINDING_ROUTE_BY_KIND[kind];
    if (entry && entry.legacy_token) out[kind] = entry.legacy_token;
  }
  return out;
}

// ---------------------------------------------------------------------------
// composeOperatorHint — THE ONE HINT LOOKUP, shared by every aggregator that owns a
// legacy template table. The chain is: the caller's legacy template (so today's text is
// reproduced byte-for-byte and the forge ports keep their renamed script paths) → the
// FAMILY hint from the kernel registry → the caller's generic fallback.
//
// The middle rung is the fold's actual win: the generic fallback used to fire for every
// emitted code with no template, and a classified code now gets its family's hint instead.
//
// THE FAMILY-HINT RUNG IS NOT WRAPPED IN A CATCH, AND THAT IS THE POINT. A bare
// `catch (_) { /* fall through */ }` around `row.hint(merged)` conflates two categories the
// operator needs told apart:
//
//   * a PROGRAMMING ERROR (ReferenceError, TypeError — a helper that was never written, a
//     renamed export, a typo). Falling back cannot recover it, and degrading it to the generic
//     string destroys the only signal that the layer is dead. That is not hypothetical: an
//     earlier attempt at the WHY slot deleted all seven hint bodies for a helper it never wrote,
//     every hint threw, this catch swallowed all seven, and 541 assertions passed over a corpse.
//   * a PAYLOAD IT CANNOT RENDER. This one IS recoverable, and the generic fallback is right.
//
// A bare catch cannot distinguish them, so it optimises for the wrong one: it guarantees the
// recoverable case never inconveniences anyone at the price of guaranteeing the unrecoverable
// case is never reported — a fail-OPEN guard in the middle of a fail-closed kernel. The split is
// therefore IN BAND: a hint signals "I cannot render this" by returning null / '' (which falls
// through below exactly as before), and anything THROWN propagates. "Cannot render" is a value;
// "is broken" is an exception; the two stop being the same event.
// ---------------------------------------------------------------------------
function composeOperatorHint(reason, ctx, legacyTable, genericFallback) {
  const safeCtx = isPlainObject(ctx) ? ctx : {};
  const tmpl = legacyTable && legacyTable[reason];
  if (typeof tmpl === 'function') {
    try {
      const out = tmpl(safeCtx);
      if (typeof out === 'string' && out.trim()) return out;
    } catch (_) { /* fall through to the family hint */ }
  }
  const classified = classifyRefusalCondition(reason);
  if (classified && classified.family) {
    const row = KERNEL_REFUSAL_REGISTRY[classified.family];
    if (row && typeof row.hint === 'function') {
      const merged = Object.assign({}, classified.patch, safeCtx);
      for (const key of Object.keys(classified.patch)) {
        if (safeCtx[key] == null) merged[key] = classified.patch[key];
      }
      // NO CATCH — see the header. An unrenderable payload returns null/'' and falls through;
      // a thrown error is a dead layer and must reach the caller.
      const out = row.hint(merged);
      if (typeof out === 'string' && out.trim()) return out;
    }
  }
  return genericFallback;
}

// ---------------------------------------------------------------------------
// The discharge OWNER PROJECTION — a durable leaf -> owning-milestone mapping written by the
// discharge transaction itself (expand-close, and the re-discharge after a re-expansion) into the
// barrier-invisible `.cache/epoch-projections/` band. Routing verdicts belong to the machine at the
// commitment point; the route between points stays free of traps. Discharge is the commitment point
// that changes the node view (the interior collapses out of the spine view), so discharge owns the
// translation — the orchestrator never authors this file (no orchestrator-facing verb).
//
// The journal route validators canonicalize BOTH recorded and recomputed route rows through this
// projection before comparison (a leaf id maps to its milestone; a spine id maps to itself), so a
// journal that recorded interior-LEAF owners before the discharge survives the discharge without
// mutation, while an owner in NEITHER the current node table NOR the projection still refuses
// `review_journal_route_mismatch` (the tamper gate keeps its teeth).
//
// Append-only per epoch: a re-expansion that re-discharges APPENDS a superseding entry rather than
// rewriting one; the epoch replan activation owns cleanup of the whole band (fence-exempt there).
// Every entry is digest-bound to the plan hash and the discharge event, so cross-epoch residue and
// crash-torn bytes are detectable and fold to NOTHING (fail-closed: an entry that cannot be
// verified contributes nothing, which can only ever keep a refusal in place, never lift one).
// ---------------------------------------------------------------------------
const EPOCH_PROJECTIONS_DIR = 'epoch-projections';
const OWNER_PROJECTION_NAME = 'owner-projection.json';
const OWNER_PROJECTION_SCHEMA_VERSION = 1;

// buildOwnerProjectionEntry — the ONE writer-side entry shape. `records` keep their (deterministic)
// expansion-record parse order; `leaves` are stored sorted so the canonical form is byte-stable.
function buildOwnerProjectionEntry(core) {
  const entry = {
    point: String(core && core.point || ''),
    plan_hash: String(core && core.plan_hash || '').toLowerCase(),
    discharged_at: String(core && core.discharged_at || ''),
    records: (Array.isArray(core && core.records) ? core.records : []).map(String),
    leaves: (Array.isArray(core && core.leaves) ? core.leaves : []).map(String).sort(),
  };
  return Object.assign({}, entry, { projection_digest: sha256Hex(canonicalJson(entry)) });
}

// verifyOwnerProjectionEntry — total, never throws. TRUE only when the entry is well-formed AND its
// digest binds { point, plan_hash, discharged_at, records, leaves } byte-for-byte.
function verifyOwnerProjectionEntry(entry) {
  if (!isPlainObject(entry)) return false;
  if (typeof entry.point !== 'string' || !entry.point) return false;
  if (typeof entry.plan_hash !== 'string' || !/^[0-9a-f]{64}$/.test(entry.plan_hash)) return false;
  if (typeof entry.discharged_at !== 'string' || !entry.discharged_at) return false;
  if (!Array.isArray(entry.records) || entry.records.some(r => typeof r !== 'string' || !r)) return false;
  if (!Array.isArray(entry.leaves) || entry.leaves.some(id => typeof id !== 'string' || !id)) return false;
  if (JSON.stringify(entry.leaves) !== JSON.stringify(entry.leaves.slice().sort())) return false;
  if (typeof entry.projection_digest !== 'string' || !/^[0-9a-f]{64}$/.test(entry.projection_digest)) return false;
  const core = { point: entry.point, plan_hash: entry.plan_hash, discharged_at: entry.discharged_at,
    records: entry.records, leaves: entry.leaves };
  return sha256Hex(canonicalJson(core)) === entry.projection_digest;
}

// foldOwnerProjection — the read side. Folds the parsed file into { present, leaf_to_milestone,
// points } for the CURRENT plan hash. A file of the wrong schema version, a wrong-epoch plan hash,
// or entries that fail verification all fold to the EMPTY projection (identity canonicalization).
// Entries fold in append order: a later entry for the same point SUPERSEDES (its leaf set is the
// full interior at re-discharge), and the leaf union always maps to the same owning point.
function foldOwnerProjection(parsed, planHash) {
  const empty = { present: false, leaf_to_milestone: {}, points: [] };
  if (!isPlainObject(parsed) || parsed.schema_version !== OWNER_PROJECTION_SCHEMA_VERSION
    || parsed.plan_hash !== planHash || !Array.isArray(parsed.entries)) return empty;
  const leafToMilestone = {};
  const points = new Set();
  for (const entry of parsed.entries) {
    if (!verifyOwnerProjectionEntry(entry) || entry.plan_hash !== planHash) continue;
    points.add(entry.point);
    for (const id of entry.leaves) leafToMilestone[id] = entry.point;
  }
  return { present: points.size > 0, leaf_to_milestone: leafToMilestone,
    points: Array.from(points).sort() };
}

// canonicalizeRouteOwners — normalize ONE route row's owners through the projection. A discharged
// interior leaf id maps to its owning milestone; any other id (a spine node, an unknown id) maps to
// itself. The candidates are re-deduplicated + sorted and `owning_node` is re-derived, so a row
// whose leaves collapse onto ONE milestone becomes uniquely milestone-owned. PURE: returns a new
// row; every non-owner field is carried over untouched. Applied to BOTH the recorded journal rows
// and the recomputed expectation before they are compared, never to the stored journal itself.
function canonicalizeRouteOwners(row, leafToMilestone) {
  if (!isPlainObject(row)) return row;
  const map = isPlainObject(leafToMilestone) ? leafToMilestone : {};
  const candidates = Array.isArray(row.ownership_candidates) ? row.ownership_candidates : [];
  const mapped = Array.from(new Set(candidates.map(id =>
    (id != null && Object.prototype.hasOwnProperty.call(map, id)) ? map[id] : id))).sort();
  return Object.assign({}, row, { ownership_candidates: mapped,
    owning_node: mapped.length === 1 ? mapped[0] : null });
}

// ---------------------------------------------------------------------------
// THE SINK-OWNED FINAL-FIX REGISTER — the ONE commitment point at which a fix produced DURING
// finalization enters the candidate. Zero regulation on HOW the fix is produced (inline, or
// dispatched to whichever role fits: no mandated mode, no justifier, no approval); full regulation
// HERE, where the fix is recorded and the finalize attribution sweep starts crediting it.
//
// The register is a per-run `.cache` artifact owned by the LIVE sink: it may only be written while
// the terminal finalize row is `in_progress` AND the sink is still PRISTINE (nothing pushed). After
// the sink's first irreversible step the record is immutable history and recovery is a follow-up
// issue, never a rewrite.
//
// DIGEST-BOUND, because the sweep reads it as an ATTRIBUTION source: an unverified register is a
// laundering primitive (append a path, and an unreviewed file ships attributed). The digest covers
// { schema_version, plan_hash, entries } and every entry re-states its own gates, so the sweep can
// re-prove the whole file rather than trust it. A register that does not verify refuses its OWN
// typed reason — never `unattributed_change`, whose documented cure (delete the file) would be a lie
// about the real fault.
//
// The two helpers below are the SINGLE source both the writer (adaptive-node's final-fix-commit) and
// the reader (the plan validator's finalize attribution sweep) use, so the two can never disagree
// about what "verified" means. `classify` is injected — the surface classifier lives with the
// allowband predicates in the plan validator, and this module stays dependency-free.
// ---------------------------------------------------------------------------
const FINAL_FIX_REGISTER_NAME = 'final-fixes.json';
const FINAL_FIX_SUBCOMMAND = 'final-fix-commit';
const FINAL_FIX_REGISTER_SCHEMA_VERSION = 1;
const FINAL_FIX_SURFACE_CLASSES = ['validation-apparatus', 'production'];

// The digest binds the register's whole meaning-carrying core. Recomputable by anyone holding the
// file: the point is DETECTION of an out-of-band edit, not secrecy.
function computeFinalFixRegisterDigest(register) {
  const core = {
    schema_version: (register && register.schema_version) != null
      ? register.schema_version : FINAL_FIX_REGISTER_SCHEMA_VERSION,
    plan_hash: String((register && register.plan_hash) || ''),
    entries: Array.isArray(register && register.entries) ? register.entries : [],
  };
  return sha256Hex(Buffer.from(canonicalJson(core), 'utf8'));
}

// verifyFinalFixRegister — total, never throws. Re-proves the file AND every entry's own gates.
// Returns { ok: true, files: [...] } (the union of attributed paths, sorted) or { ok: false, reason,
// detail }. FAIL-CLOSED in every direction: an unknown schema, a foreign plan_hash, a broken digest,
// a red rerun, a receipt bound to another command, or a PRODUCTION-surface entry (whatever paperwork
// it carries) all refuse rather than attribute.
function verifyFinalFixRegister(parsed, planHash, classify) {
  if (!isPlainObject(parsed)) return { ok: false, reason: 'register_malformed', detail: 'not a JSON object' };
  if (parsed.schema_version !== FINAL_FIX_REGISTER_SCHEMA_VERSION) {
    return { ok: false, reason: 'register_schema_unknown',
      detail: 'schema_version ' + JSON.stringify(parsed.schema_version) + ' (expected ' + FINAL_FIX_REGISTER_SCHEMA_VERSION + ')' };
  }
  if (typeof parsed.plan_hash !== 'string' || !/^[0-9a-f]{64}$/.test(parsed.plan_hash)) {
    return { ok: false, reason: 'register_plan_hash_malformed', detail: String(parsed.plan_hash) };
  }
  if (planHash && parsed.plan_hash !== planHash) {
    return { ok: false, reason: 'register_plan_hash_mismatch',
      detail: 'register is bound to plan ' + parsed.plan_hash + ', not ' + planHash };
  }
  if (!Array.isArray(parsed.entries)) return { ok: false, reason: 'register_malformed', detail: 'entries is not an array' };
  if (typeof parsed.digest !== 'string' || computeFinalFixRegisterDigest(parsed) !== parsed.digest) {
    return { ok: false, reason: 'register_digest_mismatch',
      detail: 'the recorded digest does not bind the recorded entries — the register was edited out of band' };
  }
  const files = new Set();
  for (const entry of parsed.entries) {
    const gate = verifyFinalFixEntry(entry, classify);
    if (!gate.ok) return { ok: false, reason: gate.reason, detail: 'entry ' + JSON.stringify(entry && entry.ordinal) + ': ' + gate.detail };
    for (const p of entry.files) files.add(p);
  }
  return { ok: true, files: Array.from(files).sort(), entries: parsed.entries.length };
}

// verifyFinalFixEntry — ONE recorded entry's own gates, re-proved from the bytes. Total; never
// throws. Deliberately does NOT re-run anything: it re-checks that the receipt the writer accepted
// is still internally coherent, which is exactly what an out-of-band editor has to break.
function verifyFinalFixEntry(entry, classify) {
  if (!isPlainObject(entry)) return { ok: false, reason: 'register_entry_malformed', detail: 'not an object' };
  if (typeof entry.failed_command !== 'string' || !entry.failed_command.trim()) {
    return { ok: false, reason: 'register_entry_malformed', detail: 'failed_command is missing' };
  }
  if (typeof entry.fix_commit !== 'string' || !/^[0-9a-f]{7,40}$/.test(entry.fix_commit)) {
    return { ok: false, reason: 'register_entry_malformed', detail: 'fix_commit is not a resolved rev' };
  }
  if (!Array.isArray(entry.files) || !entry.files.length
    || entry.files.some(p => typeof p !== 'string' || !p.trim() || /[*?]|\/$/.test(p))) {
    return { ok: false, reason: 'register_entry_malformed', detail: 'files must be a non-empty list of exact repo-relative paths' };
  }
  const rerun = entry.rerun;
  if (!isPlainObject(rerun) || rerun.command !== entry.failed_command) {
    return { ok: false, reason: 'register_entry_receipt_unbound',
      detail: 'the rerun receipt does not name the exact failed command' };
  }
  if (rerun.exit_code !== 0) {
    return { ok: false, reason: 'register_entry_rerun_red', detail: 'rerun exit_code ' + JSON.stringify(rerun.exit_code) };
  }
  if (typeof rerun.candidate_hash !== 'string' || !/^[0-9a-f]{64}$/.test(rerun.candidate_hash)) {
    return { ok: false, reason: 'register_entry_receipt_unbound', detail: 'rerun.candidate_hash is not a candidate binding' };
  }
  if (FINAL_FIX_SURFACE_CLASSES.indexOf(entry.surface_class) === -1) {
    return { ok: false, reason: 'register_entry_malformed', detail: 'unknown surface_class ' + JSON.stringify(entry.surface_class) };
  }
  if (typeof classify === 'function') {
    let recomputed = null;
    try { recomputed = classify(entry.files); } catch (_) { recomputed = null; }
    if (!recomputed || recomputed.surface_class !== entry.surface_class) {
      return { ok: false, reason: 'register_entry_surface_mismatch',
        detail: 'recorded surface_class "' + entry.surface_class + '" does not match the paths it names' };
    }
  }
  // THE SCOPE WALL, re-proved on the READ side. The register attributes VALIDATION APPARATUS only, so
  // a production-surface entry never verifies — with or without paperwork. The commit verb refuses to
  // write one, so an entry that carries it was edited out of band; and crediting it would let the sink
  // ship product behavior no reviewing authority ever saw, with a finalize register standing in for
  // the certification. That is a deviation laundered into a receipt, which R4 forbids outright: the
  // deviation is itself the evidence, and evidence is reported, not repaired.
  if (entry.surface_class === 'production') {
    return { ok: false, reason: 'final_fix_production_surface',
      detail: 'a production-surface entry is never attributable — the lane records validation-apparatus '
        + 'fixes only, and no receipt on the entry can stand in for a certification over the product' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// deriveSinkProgressFromState — the ONE derivation of "has the sink taken its first irreversible
// step?", shared by the adaptive node's sink-progress probe and the plan validator's finalize
// deviation route so the two can never disagree about whether the lane is open. Resolves the run's
// branch from `workflow-state.md` (NEVER `git rev-parse HEAD`: the sink runs main-session-direct
// from the MAIN root, so HEAD would make the predicate inert), then treats a PUSHED branch —
// `origin/<branch>` exists — as the first irreversible step.
//
// THREE-VALUED and FAIL-CLOSED: only 'pristine' admits. A missing origin ref is the pristine
// not-yet-pushed signal; ANY other failure (no branch pointer, git error, non-repo) collapses to
// 'unknown', because the dangerous direction is a false 'pristine' after a push.
// ---------------------------------------------------------------------------
function deriveSinkProgressFromState(io) {
  const readFile = io && io.readFile;
  if (typeof readFile !== 'function') return { state: 'unknown', evidence: 'no readFile seam' };
  let branch = null;
  try {
    const st = readFile(io.statePath);
    const m = /^branch:\s*(\S+)\s*$/m.exec(String(st || ''));
    if (m) branch = m[1];
  } catch (_) { branch = null; }
  if (!branch) return { state: 'unknown', evidence: 'no branch: pointer in workflow-state.md (cannot derive sink progress)' };
  const root = (io && io.repoRoot) || process.cwd();
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/' + branch],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (String(out).trim()) return { state: 'started', evidence: 'origin/' + branch + ' exists — the sink has pushed (irreversible)' };
    return { state: 'pristine', evidence: 'origin/' + branch + ' unresolved — the sink has not pushed' };
  } catch (e) {
    if (e && e.status === 1) return { state: 'pristine', evidence: 'no origin/' + branch + ' — the sink has not pushed' };
    return { state: 'unknown', evidence: 'git rev-parse for origin/' + branch + ' failed (status ' + (e && e.status) + ') — cannot derive sink progress' };
  }
}

// finalizeSinkStatus — the plan's UNIQUE terminal sink row, read through whatever ledger accessor
// the caller already holds. `live` is the finalize-context predicate every deviation route keys on:
// exactly one `finalize` node, and its ledger row is `in_progress`. A plan with zero or several
// finalize rows is NOT finalize context (fail-closed: no route, no lane).
function finalizeSinkStatus(nodes, statusOf) {
  const list = (Array.isArray(nodes) ? nodes : []).filter(n => n && n.role === 'finalize');
  if (list.length !== 1) return { id: null, status: null, live: false };
  const id = list[0].id;
  let status = null;
  try { status = statusOf(id); } catch (_) { status = null; }
  status = (status == null || status === '') ? null : String(status).toLowerCase();
  return { id, status, live: status === 'in_progress' };
}

// ===========================================================================
// M2 — THE OUTCOME RECORDER, AND THE PARENT-OWNED SIDECAR SET IT JOINS.
//
// ADR 0013's M2 is the MEASUREMENT stage: every refusal and every lifecycle outcome is
// recorded, so the migration can rank codes by real frequency x interruption cost instead of
// by audit anecdote. P4 makes the ordering load-bearing — the recorder lands WITH the registry
// batch, because a "before" captured after the deletions it measures is not a measurement.
//
// This is the RECORDER only. It writes events; nothing in the runtime reads them back and no
// gate consults them. The reporting/ranking layer is M3 and follows.
//
// FAIL-OPEN IS A HARD REQUIREMENT, not a nicety. Telemetry that can refuse, wedge or slow a run
// would itself be a mid-run serializer — exactly the class T9 and P3 exist to delete. So the
// write half swallows every error, and a run whose recorder cannot write simply proceeds
// unmeasured.
//
// ---------------------------------------------------------------------------
// THE PARENT-OWNED SIDECAR SET — why a SET, and not a second hard-coded path.
//
// A run sidecar is written by whichever process happens to make the lifecycle call. Under a
// co-opened write frontier that process may be running inside a LEG worktree, which is a
// checkout of the same tree — so the repo-relative sidecar path resolves INSIDE the leg and the
// leg's own copy is what gets dirtied. The synthesizer's per-leg capture sweep (`git add -A`)
// then stages that path in EVERY leg independently, and the octopus merge fails add/add on
// workflow-generated residue: a `merge_conflict` on a frontier that has nothing to do with
// telemetry. There is no merge-side backstop; the failure surfaces as the generic refusal.
//
// The parent's copy is the authoritative one (it is the copy a reader reads), so the cure is to
// keep every member OUT of the leg capture entirely. That cure has to be a SET, in the kernel,
// read by both the writers and the capture sweep: a second hard-coded path beside the first
// fixes one instance and leaves the NEXT sidecar to rediscover the same bug — the
// one-call-site-at-a-time pattern that made the archive family recur four times.
//
// MEMBERSHIP RULE, and it is mechanically checkable: a member is parent-owned run telemetry —
// an append-only sidecar whose writer swallows every error, that no gate reads, and that the
// Layer-0 ruling below classifies `preference`. The last clause is the guard that matters:
// excluding a `record` path from the capture sweep would silently DROP leg-authored kernel
// content from the merge, turning a merge fix into an evidence-loss defect.
// `scripts/test-outcome-recorder.js` asserts that over the whole set.
// ===========================================================================
const NODE_TIMINGS_LOG_NAME = 'node-timings.jsonl';
const PROVENANCE_LOG_NAME = 'provenance-log.jsonl';
const DISPATCH_LOG_NAME = 'dispatch-log.jsonl';
const OUTCOME_LOG_NAME = 'outcome-log.jsonl';

// Project-relative (`kaola-workflow/{project}/`-relative) paths, POSIX separators. ORDER IS NOT
// SIGNIFICANT — this is a membership set, not a precedence list.
const PARENT_OWNED_SIDECARS = Object.freeze([
  '.cache/' + NODE_TIMINGS_LOG_NAME,
  '.cache/' + PROVENANCE_LOG_NAME,
  '.cache/' + DISPATCH_LOG_NAME,
  '.cache/' + OUTCOME_LOG_NAME,
]);

// isParentOwnedSidecar(relPath) — TOTAL membership test over project-relative paths. Normalizes
// separators and a leading `./` so a caller that built the path with path.join on Windows, or
// with a relative prefix, gets the same answer.
function isParentOwnedSidecar(relPath) {
  const rel = String(relPath == null ? '' : relPath)
    .replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  return PARENT_OWNED_SIDECARS.indexOf(rel) >= 0;
}

// ---------------------------------------------------------------------------
// THE RECORD SHAPE.
//
// ONE JSON object per line, UNIFORM: every key is present on every line, in a fixed order, so a
// consumer can `split('\n').map(JSON.parse)` and project columns without presence-testing. The
// M2 brief names four things to capture — (code, triage wall-clock, re-dispatch?, phase) — and
// only two of them are observable AT the emit point. That is a genuine underspecification in the
// ADR, and it is resolved here by recording what makes the other two DERIVABLE rather than by
// fabricating them:
//
//   * `reason` / `condition` / `family` / `locus` / `route`  — the code, at both granularities
//     the dual-emission migration needs, plus its machine-readable exit.
//   * `op`      — the PHASE. The subcommand is the phase in this runtime: there is no coarser
//     phase field a lifecycle call carries, and a finer one would be invented.
//   * `ts` + `ms` — the invocation's end instant and its own wall-clock. TRIAGE wall-clock is an
//     INTER-EVENT property (the gap between a refusal and the next recorded event for the same
//     project) and re-dispatch is another (a repeated `op`/`node` pair after a refusal). Neither
//     exists at the emit point; both are a subtraction over consecutive lines, which is M3's job.
// ---------------------------------------------------------------------------
const OUTCOME_LOG_SCHEMA_VERSION = 1;
// The envelope `result` values this runtime emits. Anything else records as 'other' rather than
// being dropped: an unrecognised result is itself a measurement.
const OUTCOME_RESULTS = Object.freeze(['ok', 'refuse', 'halt', 'warn']);
// How the emitted token related to the enumerated vocabulary, which is the P2 census metric:
//   'family'       — it classified into one of the seven kernel families;
//   'excluded'     — a rule deliberately states it is NOT in the vocabulary (advisory / tool
//                    outcome / usage error), so the silence is intentional;
//   'unclassified' — nothing matched. This is the remaining-migration-work signal, and counting
//                    it is the whole reason the field exists.
const OUTCOME_CLASSIFICATIONS = Object.freeze(['family', 'excluded', 'unclassified']);

// buildOutcomeRecord(input) — PURE. `{ script, op, project, node, envelope, ts, duration_ms }` in,
// one canonical record object out, or `null` when there is no phase to attribute the event to.
//
// THERE IS DELIBERATELY NO try/catch IN THIS BODY, and that is the point. A recorder that
// swallowed its own programming errors would go dead silently and every suite that only asserts
// "the verb still succeeded" would stay green over a corpse — which is exactly how seven hint
// bodies once threw ReferenceError while 541 assertions passed. The fail-open obligation is
// discharged by the CALLER (the append helper wraps this in a catch), and the suite calls this
// function DIRECTLY and asserts a fully-populated record, so a dead layer is red.
function buildOutcomeRecord(input) {
  const i = isPlainObject(input) ? input : {};
  const envelope = isPlainObject(i.envelope) ? i.envelope : {};
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const op = str(i.op);
  if (!op) return null;   // an event with no phase cannot be ranked; recording it would be noise

  const rawResult = str(envelope.result) || 'ok';
  const result = OUTCOME_RESULTS.indexOf(rawResult) >= 0 ? rawResult : 'other';
  const ms = Number(i.duration_ms);

  // Only an ACTIONABLE outcome carries a family projection — the same predicate
  // stampRefusalEnvelope uses, so the recorder and the envelope agree by construction.
  const actionable = result === 'refuse' || result === 'halt' || result === 'warn';
  const reason = str(envelope.reason);
  const condition = actionable ? (str(envelope.condition) || reason) : null;

  let family = null;
  let locus = null;
  let route = null;
  let classified = null;
  if (actionable) {
    const hit = classifyRefusalCondition(condition);
    family = str(envelope.refusal_family) || (hit && hit.family ? hit.family : null);
    if (family) classified = 'family';
    else if (hit) classified = 'excluded';
    else classified = 'unclassified';

    locus = str(envelope.refusal_locus);
    if (family && !locus) {
      const row = KERNEL_REFUSAL_REGISTRY[family];
      locus = row ? row.locus : null;
    }

    // Prefer the route the envelope was already stamped with; re-resolve only when the caller
    // never went through `refuse()`. The classifier's derived discriminator widens the payload
    // exactly as stampRefusalEnvelope widens it, so both paths resolve the same verb.
    if (isPlainObject(envelope.refusal_route)) {
      route = routeKey(envelope.refusal_route);
    } else if (family) {
      const patch = (hit && isPlainObject(hit.patch)) ? hit.patch : {};
      const payload = Object.assign({}, patch, envelope);
      for (const key of Object.keys(patch)) {
        if (envelope[key] == null) payload[key] = patch[key];
      }
      route = routeKey(resolveRoute(family, payload));
    }
  }

  return {
    v: OUTCOME_LOG_SCHEMA_VERSION,
    ts: str(i.ts) || new Date().toISOString(),
    script: str(i.script) || 'unknown',
    op: op,
    project: str(i.project),
    node: str(i.node),
    result: result,
    reason: reason,
    condition: condition,
    family: family,
    locus: locus,
    route: route || null,
    classified: classified,
    ms: Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null,
  };
}

// ===========================================================================
// THE LAYER-0 DURABLE-ARTIFACT REGISTRY (the four-record ruling).
//
// The durable kernel is EXACTLY four records — plan / position / evidence / forge — and every
// other durable artifact a run leaves on disk is either DERIVABLE from those four or a
// PREFERENCE a successor is free to re-decide. That is a claim about every file in a project
// folder, so it is only meaningful once every file is ruled. This table is the machine-readable
// form of the ruling; the prose form — with the derivation written out for every `derivable` row
// and the loss-safety argument for every `preference` row — lives in
// `docs/workflow-state-contract.md` § Layer-0 durable-artifact ruling, and
// `scripts/test-kernel-conformance.js` asserts the two are EQUAL row-for-row, in order. A row
// present in one and not the other fails the build.
//
// Each row is `[matcher, ruling, record, writer, note]`:
//   * `matcher`  — a project-relative path (POSIX separators, no leading slash) or a RegExp over it.
//   * `ruling`   — 'record' | 'derivable' | 'preference'.
//   * `record`   — for 'record' rows only: which of the four ('plan' | 'position' | 'evidence' |
//                  'forge'). null otherwise. A 'record' row with a null owner is a FIFTH record
//                  wearing a label, and the conformance suite rejects it.
//   * `writer`   — 'script' | 'agent'. DESCRIPTIVE, not the atomicity switch: it names who authors
//                  the CONTENT. The atomic-write obligation keys on `ruling === 'record'` and binds
//                  every SCRIPT write to such a path, whoever authored the content — an agent's own
//                  shell redirection cannot be made atomic by this runtime, but the moment a script
//                  writes a record the obligation applies.
//   * `note`     — one line. For 'derivable', the DERIVATION (function + inputs). For 'preference',
//                  why it is safe to lose across a resume. For 'record', which question it answers.
//
// Ordering is significant: the FIRST matching row wins. Every literal-string matcher therefore
// precedes any pattern that could swallow it, and the two broad bands (the `.cache/origin/`
// reconnaissance band and the free-form evidence band) sit LAST, after every narrower rule.
// `test-kernel-conformance.js` proves that mechanically: each literal row must classify to itself.
// ===========================================================================
const KERNEL_RULINGS = Object.freeze(['record', 'derivable', 'preference']);
const KERNEL_RECORDS = Object.freeze(['plan', 'position', 'evidence', 'forge']);

const KERNEL_ARTIFACT_REGISTRY = Object.freeze([
  // ---- Plan -------------------------------------------------------------------------------
  ['workflow-plan.md', 'record', 'plan', 'script',
    'goal, decomposition, per-unit write sets + dependencies, epoch lineage — and, in ## Node Ledger, the position'],
  ['.cache/' + LEDGER_CHAIN_JOURNAL_NAME, 'record', 'plan', 'script',
    'the tamper-evidence chain over the ledger transitions; with a head stamped in the plan its absence is unrecoverable by construction'],
  ['.cache/acceptance-anchor.json', 'record', 'plan', 'script',
    'holds the acceptance surface BYTES across repair iterations that have already overwritten the plan that carried them'],
  ['.cache/' + REPLAN_TRANSACTION_NAME, 'record', 'plan', 'script',
    'the only statement of which of the 41 durable epoch-fork writes have landed; an interrupted fork is unresumable without it'],
  [REPLAN_PLAN_NEXT_NAME, 'record', 'plan', 'script',
    'the authored child plan before activation — the sole copy of the next epoch; it sits beside the parent at the project root, not under .cache/'],
  ['.cache/' + REPLAN_PLANNER_PACKET_NAME, 'record', 'plan', 'script',
    'the snapshot-authority projection the child is bound to; the child cannot be re-verified without it'],
  ['.cache/' + REPLAN_PLANNER_ATTESTATION_NAME, 'record', 'plan', 'script',
    'the planner attestation covering the child image'],
  [/^\.cache\/epochs\/[^/]+\/manifest\.json$/, 'record', 'plan', 'script',
    'the sealed parent epoch identity — the live tree no longer holds the parent plan'],
  [/^\.cache\/committed-transactions\/[^/]+\.json$/, 'record', 'plan', 'script',
    'the rotated committed-transaction receipts that survive the live transaction reset — the lineage predecessor chain'],

  // ---- Position ---------------------------------------------------------------------------
  ['workflow-state.md', 'record', 'position', 'script',
    'the resume pointer: status, phase, step, pending gates, sink mode, branch, worktree, epoch fields, halt markers'],
  ['.cache/' + RUNNING_SET_NAME, 'record', 'position', 'script',
    "carries state:'opening' — written BEFORE any ledger flip, so the crash window it names is by construction absent from the ledger"],
  [/^\.cache\/barrier-base-[^/]+$/, 'record', 'position', 'script',
    'the baseline tree SHA observed at open; a point-in-time observation the advancing tree destroys'],
  [/^\.cache\/barrier-open-[^/]+$/, 'record', 'position', 'script',
    'the HEAD SHA at open; the staleness half of the same observation'],

  // ---- Evidence ---------------------------------------------------------------------------
  ['.cache/' + EPOCH_CONSENT_EXTENSIONS_NAME, 'record', 'evidence', 'script',
    'the hash-chained record of human consent grants; the cached ceiling in workflow-state.md is DERIVED from it, never the reverse'],
  ['.cache/' + CONSENT_GRANTS_NAME, 'record', 'evidence', 'script',
    'the standing-consent journal: which classes the human granted, under which claim scope, and every application that rode one. A RECORD because the A3 valve READS it to decide whether to raise at all, and a human answer is not recomputable from the other three'],
  ['.cache/review-attempts.json', 'record', 'evidence', 'script',
    'the settlement state of the adversarial-review oracle: which failure is unconsumed, which repair consumed it, the per-gate repair count'],
  ['.cache/chain-receipt.json', 'record', 'evidence', 'script',
    'the tests-green oracle receipt (npm repo kind), candidate-bound'],
  ['.cache/' + FINAL_FIX_REGISTER_NAME, 'record', 'evidence', 'script',
    'an extension of the Evidence record: the attribution source for fixes produced during finalization'],
  ['.cache/replan-source.json', 'record', 'evidence', 'script',
    'the settled, unconsumed review outcome that authorizes an epoch fork'],
  ['.cache/role-substitutions.json', 'record', 'evidence', 'script',
    'the durable divergence between the frozen role cell and what actually ran; folds into the compliance row at close'],
  ['.cache/run-gaps.json', 'record', 'evidence', 'script',
    'the run-gap sweep result; its writer refuses to overwrite a prior cycle, so it is durable gap evidence'],
  ['.cache/origin/selection-record.json', 'record', 'evidence', 'script',
    'the gate-validated selection record; the degenerate form exists so "explicit target" is distinguishable from "record lost"'],
  [/^\.cache\/replan-sources\/[^/]+\.json$/, 'record', 'evidence', 'script',
    'the rotated source-authority history a later epoch re-verifies its predecessor against'],
  [/^\.cache\/review-contexts\/[^/]+\.json$/, 'record', 'evidence', 'script',
    'the canonical gate context a receipt binds to'],
  [/^\.cache\/review-receipts\//, 'record', 'evidence', 'script',
    'the normalized member receipts the reducer votes over'],
  [/^\.cache\/review-claim-roots\/[^/]+\.json$/, 'record', 'evidence', 'script',
    'the claim-root binding a receipt was taken against'],
  [/^\.cache\/review-certifiers\//, 'record', 'evidence', 'script',
    'certifier identity bound into the gate receipt'],
  [/^\.cache\/review-findings\//, 'record', 'evidence', 'script',
    'the immutable finding set a gate settled on'],
  [/^\.cache\/validation-vectors\/[^/]+\.json$/, 'record', 'evidence', 'script',
    'local validation-runner receipts: exact command, environment digests, repeated results, bound candidate'],
  [/^\.cache\/epochs\/[^/]+\/files\//, 'record', 'evidence', 'script',
    'the immutable parent proof tree; cross-epoch review history indexes into it'],
  ['.cache/final-validation.md', 'record', 'evidence', 'agent',
    'the tests-green oracle receipt (consumer repo kind), candidate-hash bound; recorded by the agent, not a producer script'],
  ['.cache/selection-evidence.md', 'record', 'evidence', 'agent',
    'the no-target selection rationale, docked verbatim; not faithfully reconstructible after the claim'],
  ['.cache/run-gaps-manual.md', 'record', 'evidence', 'agent',
    'agent/operator-authored gap items — an input no script can regenerate'],
  ['.cache/shape-refutation.md', 'record', 'evidence', 'agent',
    'the refutation packet a shape re-plan cites as its diagnosis source'],
  ['finalization-summary.md', 'record', 'evidence', 'agent',
    'the terminal artifact; the script-owned ## Attestation section is appended to it presence-guarded'],

  // ---- Forge ------------------------------------------------------------------------------
  ['.cache/sink-receipt.json', 'record', 'forge', 'script',
    'step-by-step record of what has already reached the outside world; disposed at terminal success, when the forge itself becomes the authority'],
  ['.cache/sink-fallback.json', 'record', 'forge', 'script',
    'the sink fallback journal, same lifetime rule as sink-receipt.json'],

  // ---- Derivable --------------------------------------------------------------------------
  ['.cache/findings-route.json', 'derivable', null, 'script',
    'runRouteFindings(.cache/<gate>.md, workflow-plan.md) — re-run `route-findings --project P --node-id N`; no script reads it back'],
  ['.cache/run-progress.json', 'derivable', null, 'script',
    'buildRunProgress(workflow-plan.md, op) — a pure function of the plan; no script reads it back'],
  ['workflow-tasks.json', 'derivable', null, 'script',
    'generateMirror({ planContent }) in kaola-workflow-task-mirror.js regenerates the Codex task mirror from ## Nodes + ## Node Ledger'],
  [/^\.cache\/epoch-projections\//, 'derivable', null, 'script',
    'ensureOwnerProjection(plan, planHash, point, parseExpansionRecords(plan)) for each discharged point — leaves/records come from ## Expansion Records, discharged points from ## Node Ledger; only discharged_at is unrecoverable and foldOwnerProjection never reads it'],
  [/^\.cache\/[a-z-]+-envelope\.json$/, 'derivable', null, 'script',
    'the cached stdout of a --summary subcommand invocation; re-run the subcommand (the read-only emitters are idempotent). No script reads it back'],

  // ---- Preference -------------------------------------------------------------------------
  ['.cache/' + SCHEDULER_LOCK_NAME, 'preference', null, 'script',
    'transient O_EXCL coordination; ABSENCE is the normal unlocked state between invocations'],
  ['.cache/active-batch.json', 'preference', null, 'script',
    'no writer remains since #364; the running-set is its successor and every reader treats absence as the normal case'],
  ['.cache/' + NODE_TIMINGS_LOG_NAME, 'preference', null, 'script',
    'best-effort telemetry, writer swallows every error; its only consumer reports a diagnostic, never a verdict'],
  ['.cache/' + PROVENANCE_LOG_NAME, 'preference', null, 'script',
    'best-effort audit trail, writer swallows every error; no gate reads it'],
  ['.cache/' + DISPATCH_LOG_NAME, 'preference', null, 'script',
    'hook-written spawn log; the attestation check is WARN-FIRST, so absence degrades to a warning, never a wrong outcome'],
  ['.cache/' + OUTCOME_LOG_NAME, 'preference', null, 'script',
    'the M2 refusal/outcome recorder: append-only economics telemetry whose writer swallows every error and which no gate, transition or successor decision reads — losing it costs a measurement, never a verdict. NOT derivable: which refusal fired, in which invocation, at what wall-clock is not recomputable from the four records once the process exits, and claiming a derivation there would be the more dangerous label'],
  ['.cache/wedged-attestation.json', 'preference', null, 'script',
    'historical residue; no producer and no consumer remains in the tree'],
  [/^\.cache\/aborted-transactions\/[^/]+\.json$/, 'preference', null, 'script',
    'the abort log of a DISCARDED re-plan transaction, a deliberate sibling of committed-transactions/ that is deliberately NOT in the committed-authority chain — an abandoned transaction has no successor to bind to. Its only reader is the re-abort merge in writeAbortRecord, which treats absence as a first abort; no gate, transition or successor decision reads it, and crash-mid-abort resume is carried by the fence plus the missing transaction file through the orphaned-fence branch, which reads no record back. Losing it costs the forensic trail — phase, parent binding, removed-artifact digests — never a verdict. NOT derivable: the artifacts whose digests it names are unlinked by the same call'],
  ['fast-summary.md', 'preference', null, 'agent',
    'legacy marker, never newly authored; both readers (classifier scope parse, router folder detection) are tolerant'],
  [/^phase[0-9]+-[a-z-]+\.md$/, 'preference', null, 'agent',
    'retired fast/full-path phase artifacts; never newly authored, read only tolerantly'],
  [/^\.cache\/\.cache\//, 'preference', null, 'agent',
    'historical double-nested .cache residue from a fixed path-join defect; no writer, no reader'],

  // ---- The two broad bands, LAST by construction -------------------------------------------
  [/^\.cache\/origin\//, 'record', 'evidence', 'agent',
    'pre-claim reconnaissance folded into the project at claim time'],
  [/^\.cache\/[^/]+\.(?:md|log|txt|json|jsonl|diff|patch)$/, 'record', 'evidence', 'agent',
    'the free-form evidence band: per-node evidence and the attachments it cites — what was produced, how verified, where it lives'],
  [/^[^/]+\.md$/, 'record', 'evidence', 'agent',
    'the project-root prose band: agent-authored run reports docked beside the plan'],
]);

// classifyDurableArtifact — total over project-relative paths. Returns the first matching registry
// row, or `{ ruling: 'unclassified' }` for a path no row covers. Callers MUST treat 'unclassified'
// as a failure, never as a default ruling: an unclassified durable artifact inherits neither the
// atomic-write obligation nor resume coverage, which is the exact defect this registry closes.
function classifyDurableArtifact(relPath) {
  const rel = String(relPath == null ? '' : relPath).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!rel) return { path: rel, ruling: 'unclassified', record: null, writer: null, note: null, matcher: null };
  for (const [matcher, ruling, record, writer, note] of KERNEL_ARTIFACT_REGISTRY) {
    const hit = (typeof matcher === 'string') ? (rel === matcher) : matcher.test(rel);
    if (hit) return { path: rel, ruling, record, writer, note, matcher: String(matcher) };
  }
  return { path: rel, ruling: 'unclassified', record: null, writer: null, note: null, matcher: null };
}

// isKernelRecordPath — the atomicity predicate. TRUE exactly for the durable artifacts ruled
// `record`, i.e. the ones whose writes must be atomic and whose loss breaks resume-from-durable-state.
function isKernelRecordPath(relPath) {
  return classifyDurableArtifact(relPath).ruling === 'record';
}

// Folder names directly under `kaola-workflow/` (or under `kaola-workflow/archive/`) that are NOT
// project folders. `archive/exports/` holds worktree-diff salvage patches keyed by issue, not run
// state, so a path inside it is not a durable kernel artifact of any project.
const NON_PROJECT_FOLDERS = Object.freeze(['archive', 'exports']);

// projectRelativeArtifactPath — map an ABSOLUTE path to its `kaola-workflow/{project}/`-relative
// form, or null when the path is not inside a workflow project folder. Archive folders map to the
// same relative space as live ones (an archived run is the same artifact set, stamped terminal), and
// a leg worktree's mirror of the project folder maps identically — the write-set band is what makes
// a path a kernel artifact, not which checkout it sits in.
function projectRelativeArtifactPath(absPath) {
  const norm = String(absPath == null ? '' : absPath).replace(/\\/g, '/');
  const parts = norm.split('/');
  const idx = parts.lastIndexOf('kaola-workflow');
  if (idx < 0) return null;
  let rest = parts.slice(idx + 1);
  if (rest[0] === 'archive') rest = rest.slice(1);
  // rest[0] is now the project folder name; anything shallower is shared root state, not a project.
  if (rest.length < 2) return null;
  if (rest[0].startsWith('.')) return null;   // .roadmap/, .locks/, .origin/ staging — not project state
  if (NON_PROJECT_FOLDERS.includes(rest[0])) return null;
  return rest.slice(1).join('/');
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
  EPOCH_SCHEMA_VERSION,
  REPLAN_TRANSACTION_SCHEMA_VERSION,
  REPLAN_TRANSACTION_SCHEMA_VERSIONS,
  REVIEW_REPLAN_LIMIT,
  REPLAN_TRANSACTION_NAME,
  REPLAN_PLAN_NEXT_NAME,
  REPLAN_PLANNER_PACKET_NAME,
  REPLAN_PLANNER_ATTESTATION_NAME,
  EPOCH_CONSENT_EXTENSIONS_NAME,
  CONSENT_GRANTS_NAME,
  REPLAN_PHASES,
  REPLAN_STATUSES,
  REPLAN_CAS_SEAMS,
  REPLAN_ACTIVATION_STEPS,
  REPLAN_ABORTABLE_PHASES,
  REPLAN_DURABLE_WRITE_LABELS,
  REPLAN_DURABLE_WRITE_LABELS_DYNAMIC,
  EPOCH_STATE_FIELD_ORDER,
  isPlainObject,
  canonicalJson,
  sha256Hex,
  sha256Canonical,
  // #777 — ledger tamper-evidence hash chain
  LEDGER_CHAIN_JOURNAL_NAME,
  LEDGER_CHAIN_SCHEMA_VERSION,
  LEDGER_CHAIN_HEAD_RE,
  ledgerChainStatusMap,
  ledgerChainMapDigest,
  ledgerChainExpansionDigest,
  ledgerChainDeltas,
  ledgerChainHeadFromContent,
  stampLedgerChainHead,
  stripLedgerChainHead,
  buildLedgerChainEntry,
  extendLedgerChain,
  verifyLedgerChain,
  normalizeIssueNumbers,
  buildClaimIdentity,
  buildClaimRootBase,
  buildEpochLineage,
  validateEpochStateAuthority,
  buildCandidateView,
  digestCandidateView,
  buildInheritedFrontierView,
  digestInheritedFrontierView,
  buildScopeLineageId,
  parseStateFields,
  writeEpochStateBlock,
  validateReplanTransaction,
  readReplanFence,
  snapshotManifestDigest,
  validateSnapshotManifestShape,
  MAX_NODES,
  OPTIMIZE_ITER_CAP,
  OPTIMIZE_WALLCLOCK_CAP,
  ESCALATION_MARKERS,
  CONSENT_HALT_MARKER,
  readDurableConsentHalt,
  DECOY_CONSENT_HALT_REASON,
  detectDecoyConsentHalt,
  MAIN_SESSION_GATE_ROLE,
  ROLE_KINDS,
  ROLE_CAPABILITY_MANIFEST,
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
  repairResponsibleFindings,
  evaluateEffectiveVerdict,
  REVIEW_PLAN_SCHEMA_VERSION,
  REVIEW_CONTRACT_VERSION,
  REVIEW_CONTEXT_SCHEMA_VERSION,
  REVIEW_JOURNAL_SCHEMA_VERSION,
  REVIEW_GATE_ROLES,
  // #761: the OPTIONAL expansion_id binding on a review-journal attempt (a re-review names WHICH
  // expansion record it reviewed) + its fail-closed field validator — exported for direct pins.
  EXPANSION_ID_RE,
  expansionIdFieldOk,
  REVIEW_AGGREGATIONS,
  ADVERSARIAL_OUTCOMES,
  APPROVAL_OUTCOMES,
  FINDING_ANCHOR_KINDS,
  ROUTABLE_FINDING_ANCHOR_KINDS,
  findingAnchorCarriesPath,
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
  FANOUT_CAP_ENV,
  FANOUT_CAP_READONLY_ENV,
  PARALLEL_WRITES_ENV,
  SEAM_CHECKPOINT_ENV,
  TEST_ATTRIBUTION_ENV,
  resolveFanoutCap,
  resolveFanoutCapReadonly,
  parallelWritesDefaultOn,
  seamCheckpointDefaultOn,
  testAttributionDefaultOn,
  writeFileAtomicReplace,
  locateSection,
  spliceComplianceSection,
  emit,
  refuse,
  // --- ADR 0013 Amendment A1 / M3: the ONE kernel refusal registry ---
  KERNEL_REFUSAL_VOCABULARY,
  KERNEL_REFUSAL_REGISTRY,
  REFUSAL_PAYLOAD_SCHEMAS,
  REFUSAL_COMPATIBILITY_RULES,
  REFUSAL_EMISSION_MODE,
  ROUTE_TERMINAL_VERBS,
  ROUTE_SCRIPT_IDS,
  INVESTIGATION_OR_DISCARD,
  WRITE_FAILED_RETRY_BY_RECORD,
  WRITE_FAILED_ENVIRONMENT_ERRNOS,
  CAS_ROUTE_BY_RECORD,
  INTEGRITY_ROUTE_BY_KIND,
  INTEGRITY_ANCHORS,
  EVIDENCE_ROUTE_BY_RECORD_KIND,
  SINK_FINDING_ROUTE_BY_KIND,
  SINK_FINDING_ROUTE_BY_SUBTYPE,
  SINK_FINDING_KINDS,
  SINK_UNATTRIBUTED_SUBTYPES,
  CONSENT_KINDS,
  LOCK_KINDS,
  routeKey,
  resolveRoute,
  resolveSinkFindingRoute,
  finalFixSinkAdvice,
  R4_NON_REMEDIABLE_CELLS,
  resolveAutoRemediable,
  // The cell-keyed WHY slot: hint = FACT(payload) + WHY(cell) + ROUTE(payload). REFUSAL_WHY is the
  // ONE hand-authored table (O(cells), not O(conditions)); everything else here is derived.
  REFUSAL_WHY,
  refusalCellKey,
  assertCellClosure,
  routeProse,
  refusalFact,
  validateRefusalPayload,
  classifyRefusalCondition,
  stampRefusalEnvelope,
  deriveDeviationRoutes,
  composeOperatorHint,
  // The discharge owner projection (.cache/epoch-projections/): the ONE entry shape, its digest
  // verification, the append-order fold, and the route-owner canonicalization both journal route
  // validators apply — the cross-edition anchor for the discharge commitment-point translation.
  EPOCH_PROJECTIONS_DIR,
  OWNER_PROJECTION_NAME,
  OWNER_PROJECTION_SCHEMA_VERSION,
  buildOwnerProjectionEntry,
  verifyOwnerProjectionEntry,
  foldOwnerProjection,
  canonicalizeRouteOwners,
  // The sink-owned final-fix register (the finalize deviation route's ONE commitment point): the
  // filename + verb constants, the digest binding, and the fail-closed verifier BOTH the writer
  // (adaptive-node) and the finalize attribution sweep (plan-validator) prove the file through.
  FINAL_FIX_REGISTER_NAME,
  FINAL_FIX_SUBCOMMAND,
  FINAL_FIX_REGISTER_SCHEMA_VERSION,
  FINAL_FIX_SURFACE_CLASSES,
  computeFinalFixRegisterDigest,
  verifyFinalFixRegister,
  verifyFinalFixEntry,
  // The finalize-context predicates the deviation routes key on: one derivation of "has the sink
  // pushed?" and one reading of the unique terminal sink row.
  deriveSinkProgressFromState,
  finalizeSinkStatus,
  // ADR 0013 M2 — the outcome recorder's PURE half plus the parent-owned sidecar set. The set is
  // the ONE list both the sidecar writers and the leg capture sweep read; the builder is the one
  // record shape every edition emits.
  NODE_TIMINGS_LOG_NAME,
  PROVENANCE_LOG_NAME,
  DISPATCH_LOG_NAME,
  OUTCOME_LOG_NAME,
  PARENT_OWNED_SIDECARS,
  isParentOwnedSidecar,
  OUTCOME_LOG_SCHEMA_VERSION,
  OUTCOME_RESULTS,
  OUTCOME_CLASSIFICATIONS,
  buildOutcomeRecord,
  // The Layer-0 durable-artifact registry (ADR 0013 T1/T2): the machine-readable ruling of every
  // durable artifact as record / derivable / preference, the total classifier over it, the T2
  // record predicate, and the absolute->project-relative mapper the write interception uses.
  KERNEL_RULINGS,
  KERNEL_RECORDS,
  KERNEL_ARTIFACT_REGISTRY,
  classifyDurableArtifact,
  isKernelRecordPath,
  projectRelativeArtifactPath,
};
