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

// #382: the closed vocabulary for the optional per-node `model` column in `## Nodes`. Two TIER
// tokens only (no haiku) — Claude editions map them to the Agent(model=…) param; Codex maps them to
// a reasoning-effort variant profile. `—`/absent ⇒ today's role-static resolution. Defined here (the
// ×4 byte-identical drift anchor) so the validator, the executor, and every edition share one list.
const NODE_MODEL_TIERS = Object.freeze(['opus', 'sonnet']);

// #405 (#382 deferred half): the node-dispatchable roles for which a `model: opus` tier earns a
// dedicated Codex `<role>-max` xhigh effort-variant profile. Derived from the #382 planner rubric
// (agents/workflow-planner.md: assign opus when output quality is bounded by *reasoning depth* —
// architecture/design, adversarial gates, security review, root-cause of non-obvious bugs) ∩ the
// Codex per-node reasoning effort (#451, supersedes #405): Codex 0.139 has no per-spawn
// reasoning_effort override, so base role profiles OMIT `model_reasoning_effort` and inherit the
// parent session's effort (agent-config wins over project-profile, PR #14807). The planner's per-node
// tier maps to a portable dispatch signal here — `opus` asks the codex session for `xhigh` before the
// spawn; `sonnet`/absent leaves the standing session effort. No `<role>-max` variant profiles exist
// anymore (the matrix was retired); `agent_type` is always the base role.
function dispatchEffort(model) {
  return model === 'opus'
    ? { codex_reasoning_effort: 'xhigh', codex_reasoning_effort_source: 'planner_model' }
    : { codex_reasoning_effort: null, codex_reasoning_effort_source: 'role_default' };
}

// #382-opencode (#544 contract-keyed): the GENERAL tier→effort mapping for provider-open
// runtimes (opencode). Claude Code's {opus, sonnet} are reasoning-weight RANKS, not models;
// opencode is provider-open, so the migration is a two-level compose that never assumes a provider:
//   Level 1 (fixed):        opus → 'top' rank · sonnet → 'second' rank.
//   Level 2 (per contract): rank → that contract's effort variant (top = highest,
//                           second = 2nd-highest), per the provider's API CONTRACT.
//   mapTier(tier, provider) = CONTRACT_EFFORT_TABLE[ contractForProvider(provider) ][ TIER_RANK[tier] ].
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
const TIER_RANK = Object.freeze({ opus: 'top', sonnet: 'second' });

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

// The general mapper: Claude tier → {variant, options} for a provider, or null.
// `tier` is a NODE_MODEL_TIERS token (opus|sonnet); unknown tier / provider → null.
function mapTier(tier, providerId) {
  const rank = TIER_RANK[String(tier || '').toLowerCase()];
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
// configured variant wins), mirroring dispatchEffort's sonnet/null branch. When no provider
// is passed, the active provider is PURE-resolved from KAOLA_OPENCODE_INHERIT_MODEL (see
// resolveOpencodeProvider) — the gap closed by #537 Surface 2: the runtime caller never
// populated ctx.opencode_provider, so a declared tier now still reaches a concrete variant.
function dispatchEffortOpencode(model, providerId, env) {
  let pid = providerId;
  if (pid == null || String(pid).trim() === '') pid = resolveOpencodeProvider(env);
  const mapped = mapTier(model, pid);
  return mapped
    ? { opencode_variant: mapped.variant, opencode_variant_source: 'planner_model' }
    : { opencode_variant: null, opencode_variant_source: 'role_default' };
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

// #439 (D-419 Part 4): the per-plan `## Meta` field `speculative_open_policy`. `off` (default,
// permanent fallback) and `consent` are LEGAL at freeze; `auto` is DESIGNED-but-refused at freeze
// (write-overlap auto-eligibility is deferred). The field is hash-covered (eligibility, not a runtime
// cap — the deliberate asymmetry vs. max_concurrent). Activation also requires per-run
// `open-ready --speculative-consent` (never persisted in the frozen plan).
const SPECULATIVE_OPEN_POLICY_DEFAULT = 'off';
const SPECULATIVE_OPEN_POLICY_LEGAL = Object.freeze(['off', 'consent']);
const SPECULATIVE_OPEN_POLICY_REFUSED_AT_FREEZE = Object.freeze(['auto']);

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
// leg-scoped). Mirrors speculative_open_policy's shape (Meta, hash-covered, default off, a
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
  return true;
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
function locateSection(content, heading) {
  const lines = String(content).split('\n');
  const prefix = '## ' + heading;
  const fenceRe = /^(`{3,}|~{3,})/;
  let inFence = false, fam = '';
  let off = 0, start = -1, headingLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.trim().match(fenceRe);
    if (fm) {
      const f = fm[1][0];
      if (!inFence) { inFence = true; fam = f; }
      else if (f === fam) { inFence = false; fam = ''; }
    } else if (!inFence && i > 0 && ln.startsWith(prefix)) {
      start = off - 1; headingLine = i; break;
    }
    off += ln.length + 1; // +1 for the consumed '\n'
  }
  if (start < 0) return { start: -1, next: -1 };
  let off2 = off + lines[headingLine].length + 1;
  inFence = false; fam = '';
  let next = -1;
  for (let i = headingLine + 1; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.trim().match(fenceRe);
    if (fm) {
      const f = fm[1][0];
      if (!inFence) { inFence = true; fam = f; }
      else if (f === fam) { inFence = false; fam = ''; }
    } else if (!inFence && ln.startsWith('## ')) {
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
  TIER_RANK,
  CONTRACT_EFFORT_TABLE,
  contractForProvider,
  dispatchEffort,
  effortForProvider,
  mapTier,
  dispatchEffortOpencode,
  DEFAULT_FANOUT_CAP,
  DEFAULT_FANOUT_CAP_READONLY,
  RUNNING_SET_NAME,
  LOOP_CAP,
  TEST_THRASH_LIMIT,
  MERGE_CONFLICT_REPAIR_LIMIT,
  MAX_NODES,
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
  WRITE_OVERLAP_POLICY_DEFAULT,
  WRITE_OVERLAP_POLICY_LEGAL,
  WRITE_OVERLAP_POLICY_REFUSED_AT_FREEZE,
  parseNodeVerdict,
  parseNodeSelector,
  FINDING_SCOPE_VOCABULARY,
  FINDING_ACTION_VOCABULARY,
  FINDING_STATUS_VOCABULARY,
  parseNodeFindings,
  unresolvedInScopeFixes,
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
