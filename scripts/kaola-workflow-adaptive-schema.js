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

// The command + skill the two resume surfaces emit. `/workflow-next` is the ONE surface that both
// creates a mission list and works it, so a fresh claim and a resume name the same door — there is
// no separate authoring command to route to any more. The two basenames are ASYMMETRIC by design
// (the command is `workflow-next`, the skill is `kaola-workflow-next`), which is why both spellings
// are named here instead of derived from one another.
const NEXT_COMMAND = '/workflow-next';
const NEXT_SKILL = 'kaola-workflow-next';

// The one durable coordination record: `kaola-workflow/<run>/mission-list.md`. Named here rather
// than spelled at each reader so the file's name lives in the same byte-identical module every
// edition already loads.
const MISSION_LIST_FILE = 'mission-list.md';

// The retired frozen-plan artifact. Kept only as a name: the finalize mirror still has to recognise
// a legacy project folder that carries one, and nothing authors it any more.
const PLAN_FILE = 'workflow-plan.md';
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
  'synthesizer',
]);
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

// Claim identity. Forge-neutral and side-effect-free so every edition hashes the same
// bytes; filesystem/Git observation lives in the claim script, and this module owns only
// normalization and the digest domain.
//
// This was the epoch-lineage contract: it also anchored the claim root's commit/tree, the
// active plan hash, the inherited frontier, the re-plan transaction and the replan ceiling.
// Every one of those named a mechanism the mission list retires, so they are gone rather than
// written as inert `none` — a record that still names something which no longer exists reads to
// a later reader as evidence the thing is real. What survives is the answer to "whose claim is
// this", which the durable claim record still needs.
const CLAIM_IDENTITY_FIELD_ORDER = Object.freeze([
  'claim_repository_id',
  'claim_identity_digest',
]);

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

// Flat `key: value` reader over workflow-state.md. Heading-blind by design: the claim record
// is a small set of scalars and every consumer wants the value, not the section it sits in.
function parseStateFields(content) {
  const out = Object.create(null);
  for (const line of String(content || '').split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (match) out[match[1]] = match[2].trim();
  }
  return out;
}

function writeClaimIdentityBlock(content, values) {
  const original = String(content || '');
  const current = parseStateFields(original);
  const merged = Object.assign({}, current, values || {});
  // Claim-identity fields have one canonical home. Strip duplicate scalar lines from
  // legacy/adversarial sections before inserting the authoritative block so a later
  // duplicate cannot override what a reader takes for the claim's identity.
  const identityKeys = new Set(CLAIM_IDENTITY_FIELD_ORDER);
  const text = original.split(/\r?\n/).filter(line => {
    const match = /^([A-Za-z][A-Za-z0-9_]*):/.exec(line);
    return !match || !identityKeys.has(match[1]);
  }).join('\n');
  const lines = ['## Claim Identity'];
  for (const key of CLAIM_IDENTITY_FIELD_ORDER) {
    let value = merged[key];
    if (value === undefined || value === null || value === '') value = 'none';
    if (Array.isArray(value)) value = value.length ? value.join(',') : 'none';
    if (typeof value === 'boolean') value = value ? 'true' : 'false';
    lines.push(key + ': ' + value);
  }
  const block = lines.join('\n') + '\n';
  const heading = /^## Claim Identity[ \t]*$/m;
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


// #579: single staleness constant for the lane liveness marker. A claim_ts newer than
// this threshold (from the current wall-clock) could be a live co-tenant — classified
// 'ambiguous' (ask). Older (or absent) → 'stale' (resumable leftover / backward compat).
// 24h is conservative: a run completes well within a day; an untouched 24h-old claim
// is very likely abandoned. Byte-identical ×4 (the drift anchor).
//
// IT IS A GUESS, AND IT STAYS — as a LABELLED DEFAULT, not as a deletion. This threshold turns an
// age into the categorical `lane_bucket: stale`, which is a verdict the age alone cannot support,
// and the obvious repair is to emit the raw fields and delete the constant. That repair is worse
// than the defect. It does not remove the guess; it MOVES it — out of a named, exported, documented
// constant with a precedence table in `docs/workflow-state-contract.md`, and into an un-recorded
// threshold each caller re-invents per call and records nowhere. Handing a reader a list it cannot
// rank is not a tool; it is the refusal with the stop removed and the reasoning deleted.
//
// So the obligation on every consumer is BOTH: emit the inputs the verdict was computed from
// (`claim_ts`, `session_marker`, the holder-probe result) AND this constant beside them, tagged with
// LANE_STALENESS_PROVENANCE so a reader can see what was assumed, re-derive the verdict, or
// substitute a better threshold. A default a reader can see and disagree with is strictly more
// honest than either a bare category or a bare number.
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

// byte-identity). FENCE-BLIND BY ANCHOR: recognised ONLY at column 0 (`^validated_candidate_hash:`
// no leading whitespace). LAST-MATCH-WINS (a re-run appends a fresh line; the final line is the
// binding). `present` reports ANY column-0 field line — even malformed — so the gate can refuse a
// mangled hash the same as an absent one (both fail-closed via !present || !hash) without a
// malformed value silently reading as "legacy file, field never recorded". `hash` is the last
// WELL-FORMED 64-hex value, lowercased; null when none. Returns { present, hash }.
// PURE (no fs): read the machine verdict an agent recorded into a validation receipt. Native
// multiline regex ONLY (no classifier import — this module is the cross-edition byte anchor).
// FENCE-BLIND BY ANCHOR: a verdict line is recognised ONLY at column 0 (`^verdict:`, no leading
// whitespace). LAST-MATCH-WINS. findings_blocking is an optional non-negative int; absent => null.
// Returns { found, verdict: 'pass'|'fail'|null, findings_blocking: number|null }.
function parseRecordedVerdict(receiptText) {
  const text = String(receiptText || '');
  const vRe = /^verdict:[ \t]*([A-Za-z-]+)[ \t]*$/gm;
  let vm, lastVerdictTok = null;
  while ((vm = vRe.exec(text)) !== null) { lastVerdictTok = vm[1].toLowerCase(); }
  const found = lastVerdictTok !== null;
  let verdict = null;
  if (found && (lastVerdictTok === 'pass' || lastVerdictTok === 'fail')) verdict = lastVerdictTok;
  const fRe = /^findings_blocking:[ \t]*(\d+)[ \t]*$/gm;
  let fm, lastBlocking = null;
  while ((fm = fRe.exec(text)) !== null) { lastBlocking = parseInt(fm[1], 10); }
  return { found, verdict, findings_blocking: lastBlocking };
}

function parseValidatedCandidateHash(text) {
  const src = String(text || '');
  const present = /^validated_candidate_hash:/m.test(src);
  const re = /^validated_candidate_hash:[ \t]*([0-9a-fA-F]{64})[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(src)) !== null) { last = m[1].toLowerCase(); }
  return { present, hash: last };
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

function refuse(reason, extra) {
  return Object.assign({ result: 'refuse', reason: reason }, extra || {});
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
const DISPATCH_LOG_NAME = 'dispatch-log.jsonl';
const OUTCOME_LOG_NAME = 'outcome-log.jsonl';

// Project-relative (`kaola-workflow/{project}/`-relative) paths, POSIX separators. ORDER IS NOT
// SIGNIFICANT — this is a membership set, not a precedence list.
const PARENT_OWNED_SIDECARS = Object.freeze([
  '.cache/' + NODE_TIMINGS_LOG_NAME,
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
// `answer` is here because a converted site emits it at exit 0 while still carrying a finding.
// Without the member every such outcome recorded as the string 'other' (:6281 below), which would
// have made the conversion wave look, in the one durable log that measures outcomes, like a wave
// of unrecognised results.
const OUTCOME_RESULTS = Object.freeze(['ok', 'refuse', 'halt', 'warn', 'answer']);
// How the emitted token related to the enumerated vocabulary, which is the P2 census metric:
//   'family'       — it classified into one of the seven kernel families;
//   'excluded'     — a rule deliberately states it is NOT in the vocabulary (advisory / tool
//                    outcome / usage error), so the silence is intentional;
//   'unclassified' — nothing matched. This is the remaining-migration-work signal, and counting
//                    it is the whole reason the field exists.
const OUTCOME_CLASSIFICATIONS = Object.freeze(['family', 'excluded', 'unclassified']);

// The result tokens that mean "this event REPORTED something" rather than "it succeeded". The
// recorder keys its classification columns on membership here.
const ACTIONABLE_RESULTS = Object.freeze(['refuse', 'halt', 'warn', 'answer']);

// buildOutcomeRecord(input) — PURE. `{ script, op, project, node, envelope, ts, duration_ms }` in,
// one canonical record object out, or `null` when there is no phase to attribute the event to.
//
// THERE IS DELIBERATELY NO try/catch IN THIS BODY, and that is the point. A recorder that
// swallowed its own programming errors would go dead silently and every suite that only asserts
// "the verb still succeeded" would stay green over a corpse — which is exactly how seven hint
// bodies once threw ReferenceError while 541 assertions passed. The fail-open obligation is
// discharged by the CALLER (the append helper wraps this in a catch), and the suite calls this
// function DIRECTLY and asserts a fully-populated record, so a dead layer is red.
// appendOutcomeRecord(cacheDir, record) — the recorder's WRITE half, relocated here beside its
// builder because the module it used to live in is gone. Unchanged in behaviour:
//
//   1. IT NEVER THROWS. Any fault — a missing directory, a read-only disk, a builder that
//      returned null — returns false and leaves the caller's outcome untouched. Telemetry that
//      could refuse would be a mid-run serializer.
//   2. IT CREATES NO DIRECTORY. The append happens only into a `.cache/` that ALREADY exists, so
//      a measurement can never be the reason a folder appears on disk.
//   3. A REFUSAL NEVER CREATES THE LOG. Several refusals are contractually pure no-ops, byte for
//      byte; creating a file during such a call would break the contract for a measurement. A
//      SUCCESS has already written whatever it writes, so seeding the log there costs nothing.
//      What is lost is narrow and named: a refusal in a run that has not yet had one successful
//      call goes unmeasured.
//
// This catch is what discharges the fail-open obligation for buildOutcomeRecord, which
// deliberately has none of its own.
function appendOutcomeRecord(cacheDir, record) {
  if (!record) return false;
  try {
    const fs = require('fs');
    const path = require('path');
    if (!fs.existsSync(cacheDir)) return false;
    const logPath = path.join(cacheDir, OUTCOME_LOG_NAME);
    if (record.result !== 'ok' && !fs.existsSync(logPath)) return false;
    fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
    return true;
  } catch (_) { return false; /* best-effort: the recorder never alters an outcome */ }
}

function buildOutcomeRecord(input) {
  const i = isPlainObject(input) ? input : {};
  const envelope = isPlainObject(i.envelope) ? i.envelope : {};
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const op = str(i.op);
  if (!op) return null;   // an event with no phase cannot be ranked; recording it would be noise

  const rawResult = str(envelope.result) || 'ok';
  const result = OUTCOME_RESULTS.indexOf(rawResult) >= 0 ? rawResult : 'other';
  const ms = Number(i.duration_ms);

  // An ACTIONABLE outcome is one a reader may want to rank: it reported rather than succeeded.
  const actionable = ACTIONABLE_RESULTS.indexOf(result) >= 0;
  const reason = str(envelope.reason);
  const condition = actionable ? (str(envelope.condition) || reason) : null;

  // family / locus / route are READ off the envelope, never re-derived. The registry that used to
  // classify them is gone with the routing contract it served, so these are populated only when a
  // caller stamped them itself — which nothing in this tree does today. The columns survive
  // because the log is append-only and a reader must be able to parse an older line; a record that
  // silently changed shape would break the projection rather than the classification.
  const family = actionable ? str(envelope.refusal_family) : null;
  const locus = actionable ? str(envelope.refusal_locus) : null;
  const route = actionable && isPlainObject(envelope.refusal_route)
    ? String(envelope.refusal_route.verb || '') || null : null;
  const classified = actionable ? (family ? 'family' : 'unclassified') : null;

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
  [MISSION_LIST_FILE, 'record', 'plan', 'agent',
    'the goal in its H1 and, per item, the mission / status / dispatched / result — decomposition and position in one file'],

  // ---- Position ---------------------------------------------------------------------------
  ['workflow-state.md', 'record', 'position', 'script',
    'the resume pointer: status, phase, step, pending gates, sink mode, branch, worktree, claim lineage'],

  // ---- Evidence ---------------------------------------------------------------------------
  ['.cache/chain-receipt.json', 'record', 'evidence', 'script',
    'the tests-green oracle receipt (npm repo kind), candidate-bound'],
  ['.cache/run-gaps.json', 'record', 'evidence', 'script',
    'the run-gap sweep result; its writer refuses to overwrite a prior cycle, so it is durable gap evidence'],
  ['.cache/origin/selection-record.json', 'record', 'evidence', 'script',
    'the gate-validated selection record; the degenerate form exists so "explicit target" is distinguishable from "record lost"'],
  [/^\.cache\/validation-vectors\/[^/]+\.json$/, 'record', 'evidence', 'script',
    'local validation-runner receipts: exact command, environment digests, repeated results, bound candidate'],
  ['.cache/final-validation.md', 'record', 'evidence', 'agent',
    'the tests-green oracle receipt (consumer repo kind), candidate-hash bound; recorded by the agent, not a producer script'],
  ['.cache/selection-evidence.md', 'record', 'evidence', 'agent',
    'the no-target selection rationale, docked verbatim; not faithfully reconstructible after the claim'],
  ['.cache/run-gaps-manual.md', 'record', 'evidence', 'agent',
    'agent/operator-authored gap items — an input no script can regenerate'],
  ['finalization-summary.md', 'record', 'evidence', 'agent',
    'the terminal artifact; the script-owned ## Attestation section is appended to it presence-guarded'],

  // ---- Forge ------------------------------------------------------------------------------
  ['.cache/sink-receipt.json', 'record', 'forge', 'script',
    'step-by-step record of what has already reached the outside world; disposed at terminal success, when the forge itself becomes the authority'],
  ['.cache/sink-fallback.json', 'record', 'forge', 'script',
    'the sink fallback journal, same lifetime rule as sink-receipt.json'],

  // ---- Derivable --------------------------------------------------------------------------
  [/^\.cache\/[a-z-]+-envelope\.json$/, 'derivable', null, 'script',
    'the cached stdout of a --summary subcommand invocation; re-run the subcommand (the read-only emitters are idempotent). No script reads it back'],

  // ---- Preference -------------------------------------------------------------------------
  ['.cache/' + NODE_TIMINGS_LOG_NAME, 'preference', null, 'script',
    'best-effort telemetry, writer swallows every error; its only consumer reports a diagnostic, never a verdict'],
  ['.cache/' + DISPATCH_LOG_NAME, 'preference', null, 'script',
    'hook-written spawn log; a diagnostic record of who was dispatched, read by no gate and by no successor decision'],
  ['.cache/' + OUTCOME_LOG_NAME, 'preference', null, 'script',
    'the M2 refusal/outcome recorder: append-only economics telemetry whose writer swallows every error and which no gate, transition or successor decision reads — losing it costs a measurement, never a verdict. NOT derivable: which refusal fired, in which invocation, at what wall-clock is not recomputable from the four records once the process exits, and claiming a derivation there would be the more dangerous label'],
  ['.cache/wedged-attestation.json', 'preference', null, 'script',
    'historical residue; no producer and no consumer remains in the tree'],
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
    'the free-form evidence band: per-item evidence and the attachments it cites — what was produced, how verified, where it lives'],
  [/^[^/]+\.md$/, 'record', 'evidence', 'agent',
    'the project-root prose band: agent-authored run reports docked beside the mission list'],
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

// ===========================================================================
// THE VALIDATION SURFACE — relocated here because its previous host is a plan
// reader and the plan is going away.
//
// Everything below answers a question about the REPOSITORY, not about a plan: is the chain receipt
// bound to this tree, does this release candidate carry an unwaived full-coverage receipt, which
// paths did this branch touch. None of it ever needed a node, a ledger or a write set — it lived in
// the plan validator only because that is where the finalize verb happened to be wired.
//
// It lands in THIS file for one reason: this is the module that is byte-identical across all four
// editions and is already required by the claim, sink and chain-producer scripts. Producer and gate
// must compute the same hash over the same band, and the only way to guarantee that is one function
// and one constant, read by both — which is exactly what the arrangement it replaces relied on.
// ===========================================================================

const VALIDATION_GIT_MAX_BUFFER = 64 * 1024 * 1024;

// Paths this repo's own validation READS but the default code band treats as invisible
// (docs/** is invisible so a doc edit does not invalidate a receipt). Widening this makes the
// freshness key STRICTER, never looser. 32 archived plans declared such a widening per-run; almost
// all of them named docs/plan-run-cards/**, which this campaign deletes.
const VALIDATION_TEST_CONSUMES = Object.freeze([]);

// A repo-root-relative path is BOOKKEEPING — written by the run itself rather than by the work, so
// a change to it is not a change to the product — iff it matches one of:
//   - docs/**                       — the documentation tree (any depth).
//   - CHANGELOG.md (repo root only) — release notes.
//   - README.md    (repo root only) — project readme.
//   - kaola-workflow/{project}/**   — the active project's run state + `.cache/` evidence.
// Matching is path-SHAPE, not suffix: a nested `plugins/.../README.md` is NOT at the repo root, so
// it is OUTSIDE the band; `agents/*.md`, `commands/*.md`, `plugins/*/skills/**/*.md`,
// `plugins/*/agents/*.toml` are all behavioral and stay visible. Pure (no fs). `project` is the
// active project folder name; when absent, the generic `kaola-workflow/{anything}/**` band is
// honored so a caller with no project context never false-flags another run's state.
function isBookkeepingPath(p, project) {
  const rel = String(p || '').trim().replace(/^\.\//, '');
  if (!rel) return false;
  if (rel === 'CHANGELOG.md') return true;          // repo-root only
  if (rel === 'README.md') return true;             // repo-root only
  if (/^docs\//.test(rel)) return true;             // docs/** (any depth)
  if (project) {
    if (rel === 'kaola-workflow/' + project) return true;
    if (rel.startsWith('kaola-workflow/' + project + '/')) return true;
    return false;
  }
  return /^kaola-workflow\/[^/]+\//.test(rel);
}

// The prose files this repo's OWN chain tests read as input, so a change to one CAN flip a chain
// verdict and must therefore stay code-visible:
//   - README.md                        — validate-workflow-contracts (usage/env-var tokens).
//   - CHANGELOG.md                     — validate-workflow-contracts (`## [<version>]` heading).
//   - docs/api.md                      — both contract validators (closure schema, forge-parity).
//   - docs/workflow-state-contract.md  — both contract validators (durable-sources cross-ref).
//   - docs/agents-source.md            — validate-vendored-agents (vendored-agent provenance).
// Fail-closed by direction: a path NOT proven inert stays CODE (an over-broad list only costs an
// extra re-run, never a missed regression). Pure (no fs).
const SELF_HOST_TEST_CONSUMED = Object.freeze([
  'README.md',
  'CHANGELOG.md',
  'docs/api.md',
  'docs/workflow-state-contract.md',
  'docs/agents-source.md',
]);
// SELF_HOST_TEST_CONSUMED is a self-host assumption (the four kaola-workflow test chains read these
// prose files). A consumer repo has no such chains, so CHANGELOG/README/docs stay validation-
// invisible there (matching isBookkeepingPath). detectSelfHostNpm probes package.json for a
// `test:kaola-workflow:<edition>` script — the exact predicate run-chains.js resolveChains uses.
// Memoized per repoRoot. Fail-closed: an indeterminate repo reads as self-host (stricter band).
// ENOENT (no package.json) → genuine consumer.
const _validationSelfHostCache = new Map();
function detectSelfHostNpm(repoRoot) {
  const fs = require('fs');
  const path = require('path');
  const key = String(repoRoot || '');
  if (_validationSelfHostCache.has(key)) return _validationSelfHostCache.get(key);
  let result;
  try {
    const pkgRaw = fs.readFileSync(path.join(key || '.', 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    const scripts = (pkg && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
    result = ['claude', 'codex', 'gitlab', 'gitea'].some(n => typeof scripts['test:kaola-workflow:' + n] === 'string');
  } catch (e) {
    result = (e && e.code === 'ENOENT') ? false : true;
  }
  _validationSelfHostCache.set(key, result);
  return result;
}
function testConsumes(p, extra, opts) {
  const rel = String(p || '').trim().replace(/^\.\//, '');
  if (!rel) return false;
  // The self-host list applies ONLY to self-host repos. Default self_host=true is fail-closed.
  const selfHost = !(opts && opts.self_host === false);
  if (selfHost && SELF_HOST_TEST_CONSUMED.indexOf(rel) !== -1) return true;
  return Array.isArray(extra) && extra.indexOf(rel) !== -1;
}
// A path is VALIDATION-INVISIBLE (excluded from the code-tree hash; a fresh receipt may be cited
// over it) iff a change to it cannot flip a chain verdict. = the bookkeeping band PLUS the whole
// `kaola-workflow/` run-state tree (never code-under-test; folded in PROJECT-INDEPENDENTLY so the
// producer and gate agree even if the project tag differs), MINUS any test-consumed prose (which
// stays CODE). testConsumes is checked FIRST so a verdict-affecting doc is never excluded. Pure.
function isValidationInvisible(p, project, testConsumedExtra, opts) {
  const rel = String(p || '').trim().replace(/^\.\//, '');
  if (!rel) return false;
  if (testConsumes(rel, testConsumedExtra, opts)) return false;   // verdict-affecting prose stays CODE
  if (isBookkeepingPath(rel, project)) return true;
  if (/^kaola-workflow\//.test(rel)) return true;                 // whole run-state tree
  return false;
}

// The run archive resolves against MAIN's project root regardless of invocation cwd, so a
// SOURCE-MISSING finalize resume is handed a project folder that lives in MAIN's archive while the
// candidate under validation — the branch, its commits, and the working tree the finalize gate
// reasons about — is the LINKED WORKTREE the caller invoked from. Deriving the root from the folder
// path alone then aims the candidate hash and the chain-receipt freshness arm at the wrong working
// tree, and a settled re-entry refuses over a candidate nothing changed.
//
// Narrow by construction: it applies only when the caller's cwd is a DIFFERENT working tree of the
// SAME repository (proven by `git worktree list`, not guessed) and that tree does not contain the
// folder. Every ordinary invocation — cwd inside the folder's own tree — resolves exactly as before,
// and any probe failure falls back to the passed-in root, so the gate keeps failing closed.
function resolveFinalizeCheckRoot(planRoot) {
  const fs = require('fs');
  const { execFileSync } = require('child_process');
  const topLevel = dir => {
    try {
      return fs.realpathSync(execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
    } catch (_) { return ''; }
  };
  let cwdTop, planTop;
  try { cwdTop = topLevel(process.cwd()); } catch (_) { return planRoot; }
  planTop = topLevel(planRoot);
  if (!cwdTop || !planTop || cwdTop === planTop) return planRoot;
  let listed = '';
  try {
    listed = execFileSync('git', ['-C', planTop, 'worktree', 'list', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: VALIDATION_GIT_MAX_BUFFER });
  } catch (_) { return planRoot; }
  const sameRepo = listed.split('\n')
    .filter(l => l.startsWith('worktree '))
    .some(l => {
      try { return fs.realpathSync(l.slice('worktree '.length).trim()) === cwdTop; } catch (_) { return false; }
    });
  return sameRepo ? cwdTop : planRoot;
}

// Snapshot the LANDABLE worktree into a throwaway index and return the tree SHA. The index is first
// seeded from HEAD (`read-tree HEAD`), then `git add -A` layers the working state on top. This
// captures exactly the set that will be committed and merged: tracked changes (INCLUDING a
// modification to a tracked-but-gitignored file — committed then later gitignored, but still
// tracked, so still landable) + untracked-NON-ignored files. Genuinely-untracked .gitignored paths
// stay OUT OF SCOPE: the sink only ever stages approved/explicit paths (never `git add -f`), so such
// a write never lands. A zero-commit repo has no HEAD → the read-tree is skipped (the bare
// empty-index `add -A` still records a valid base). The index lives OUTSIDE the repo (os.tmpdir) and
// is keyed by pid+tag so concurrent callers never collide, and so its own path can never leak into
// the snapshot.
function snapshotWorktree(root, tag) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const idx = path.join(os.tmpdir(), 'kw-barrier-idx-' + process.pid + '-' + String(tag).replace(/[^A-Za-z0-9_-]/g, '_'));
  try { fs.unlinkSync(idx); } catch (_) {}
  try { fs.unlinkSync(idx + '.lock'); } catch (_) {}
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: idx });
  try {
    try { execFileSync('git', ['-C', root, 'read-tree', 'HEAD'], { env, stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    execFileSync('git', ['-C', root, 'add', '-A'], { env, stdio: ['ignore', 'ignore', 'ignore'] });
    return execFileSync('git', ['-C', root, 'write-tree'], { env, encoding: 'utf8' }).trim();
  } finally {
    try { fs.unlinkSync(idx); } catch (_) {}
    try { fs.unlinkSync(idx + '.lock'); } catch (_) {}
  }
}

// A content address of the CODE-RELEVANT landable tree — the chain-receipt freshness key. A bare
// headSha pin forces a full re-run on ANY new commit, including a docs-only / CHANGELOG-narrative /
// run-state-only commit whose code tree is byte-identical (a measured ~30-min waste per finalize).
// This hash flips iff a verdict-affecting path changes: snapshotWorktree() captures the
// committed+working LANDABLE set, `ls-tree -r` enumerates it as `<mode> <type> <sha>\t<path>`,
// isValidationInvisible() drops the inert prose / run state, and the surviving lines (path + blob
// sha, so content changes flip the hash) are sha256'd in sorted order. Returns null on ANY git
// failure so the caller fails CLOSED (treat as stale → re-run). `testConsumedExtra` is the optional
// band widening, replayed from the receipt at the gate so producer and gate compute the IDENTICAL
// band. THE PRODUCER AND THE GATE MUST BOTH REACH THIS ONE FUNCTION — a second copy is a second
// answer, and the disagreement shows up as an unreproducible chains_stale.
function computeCodeTreeHash(root, project, testConsumedExtra, opts) {
  const crypto = require('crypto');
  const { execFileSync } = require('child_process');
  // Auto-detect self_host (consumer repos exclude CHANGELOG/README/docs from the candidate hash).
  // An explicit opts.self_host overrides the probe (test seam + deterministic calls).
  const selfHost = (opts && opts.self_host !== undefined) ? opts.self_host : detectSelfHostNpm(root);
  const visibilityOpts = { self_host: selfHost };
  let treeSha;
  try { treeSha = snapshotWorktree(root, 'validation'); } catch (_) { return null; }
  if (!treeSha) return null;
  let listing;
  try { listing = execFileSync('git', ['-C', root, 'ls-tree', '-r', treeSha], { encoding: 'utf8', maxBuffer: VALIDATION_GIT_MAX_BUFFER }); } catch (_) { return null; }
  const lines = listing.split('\n').map(s => s.replace(/\r$/, '')).filter(Boolean).filter(line => {
    const tab = line.indexOf('\t');
    const rel = tab >= 0 ? line.slice(tab + 1) : line;
    return !isValidationInvisible(rel, project, testConsumedExtra, visibilityOpts);
  });
  lines.sort();
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

const STALE_PATHS_LIMIT = 20;
// ONE visibility filter behind both readers below, so the stale-culprit diagnostics and the
// bookkeeping-advance predicate can never disagree about which paths a verdict depends on.
// Drops everything isValidationInvisible() classifies as inert; returns a sorted, de-duped array.
function filterVisiblePaths(rawLines, project, extra) {
  const seen = new Set();
  const paths = [];
  for (const raw of rawLines) {
    const rel = String(raw || '').trim().replace(/^\.\//, '');
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    if (!isValidationInvisible(rel, project, extra)) paths.push(rel);
  }
  paths.sort();
  return paths;
}

// Culprit hints: the stamped COMMIT vs the TREE IN FRONT OF US (uncommitted edits + untracked
// files included) — a diagnostic, so it casts the widest net. null on ANY git failure.
function visibleChangedPathsSince(root, project, stampedHead, extra) {
  const { execFileSync } = require('child_process');
  let diffOut = '';
  let untrackedOut = '';
  try {
    diffOut = execFileSync('git', ['-C', root, 'diff', stampedHead, '--name-only'], { encoding: 'utf8', maxBuffer: VALIDATION_GIT_MAX_BUFFER });
    untrackedOut = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: VALIDATION_GIT_MAX_BUFFER });
  } catch (_) {
    return null;
  }
  return filterVisiblePaths((diffOut + '\n' + untrackedOut).split('\n'), project, extra);
}

// A LEGACY (headSha-only) receipt pins the gate to an exact COMMIT, so ANY new commit reads as
// stale — including the finalize transaction's OWN `chore: archive` bookkeeping commit, which the
// transaction authors BEFORE this gate re-runs on a crash-resumed re-entry. That dead-ends the
// resume behind a receipt only a hand re-run could refresh: a blocker the workflow itself created,
// which is a repair obligation, never evidence. Resolve it with the SAME visibility predicate the
// codeTreeHash arm already uses: the advance is inert iff every path differing between the two
// COMMITS is validation-invisible.
//
// Deliberately commit-to-commit, NOT tree-to-commit. This arm is a statement about the receipt's
// binding to a commit and has never considered working-tree dirt (a sha match passes today no
// matter how dirty the tree is), so widening it to the worktree here would make a RESUME stricter
// than the first-pass run it resumes.
//
// Not a loosening for genuine drift: one visible path (code, or test-consumed prose) still refuses,
// and any git failure or unresolvable sha reads false. Modern receipts never reach here.
function headAdvanceIsValidationInvisible(root, project, receipt, currentHead) {
  const { execFileSync } = require('child_process');
  const stampedHead = String((receipt && receipt.headSha) || '').trim();
  const head = String(currentHead || '').trim();
  if (!stampedHead || !head) return false;
  const extra = Array.isArray(receipt && receipt.validationTestConsumes) ? receipt.validationTestConsumes : [];
  let diffOut = '';
  try {
    diffOut = execFileSync('git', ['-C', root, 'diff', stampedHead, head, '--name-only'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: VALIDATION_GIT_MAX_BUFFER });
  } catch (_) { return false; }
  return filterVisiblePaths(diffOut.split('\n'), project, extra).length === 0;
}

function computeChainsStaleDiagnostics(root, project, receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  const stampedHead = String(receipt.headSha || '').trim();
  if (!stampedHead || receipt.workTreeHash !== 'clean') return null;
  const extra = Array.isArray(receipt.validationTestConsumes) ? receipt.validationTestConsumes : [];
  const paths = visibleChangedPathsSince(root, project, stampedHead, extra);
  if (!paths || !paths.length) return null;
  const proseCount = paths.filter(p => testConsumes(p, extra)).length;
  const staleKind = proseCount === paths.length ? 'prose-only' : (proseCount === 0 ? 'code' : 'mixed');
  const out = { stale_paths: paths.slice(0, STALE_PATHS_LIMIT), stale_kind: staleKind };
  if (paths.length > STALE_PATHS_LIMIT) out.stale_paths_truncated = true;
  return out;
}
function attachChainsStaleDiagnostics(payload, root, project, receipt) {
  const diag = computeChainsStaleDiagnostics(root, project, receipt);
  return diag ? Object.assign(payload, diag) : payload;
}

// The condition-specific operator templates for the validation family, carried across verbatim so
// the text an operator reads does not change with the code's address. Anything not listed falls
// through to the generic fallback: the kernel registry's family-hint rung is gone with the registry.
const VALIDATION_HINTS = Object.freeze({
  chains_unverified: () => 'No chain receipt found. Run kaola-workflow-run-chains.js after the last commit so HEAD is covered.',
  chains_stale: () => 'Chain receipt is stale — the tree advanced since the chains ran. Regenerate the receipt over HEAD.',
  chains_empty: () => 'Chain receipt has an empty chains[] array — zero chains were verified. Regenerate the receipt with kaola-workflow-run-chains.js over a resolved chain set (the producer itself refuses to write an empty chains[] receipt; see the no_chains refusal).',
  chains_red: (ctx) => {
    const timedOut = (ctx && Array.isArray(ctx.timedOutChains)) ? ctx.timedOutChains.filter(Boolean) : [];
    if (timedOut.length) {
      return `One or more chains are RED with no waiver — ${timedOut.join(', ')} hit the per-chain TIMEOUT (not necessarily a real test failure). Raise KAOLA_RUN_CHAINS_TIMEOUT_MS and re-run, or investigate a hang; any other (non-timeout) red chain still needs a fix or an explicit waiver (--accept-known-red <name>:<open-issue>).`;
    }
    return 'One or more chains are RED with no waiver. Fix the failing chain or waive it explicitly (--accept-known-red <name>:<open-issue>).';
  },
  chains_waived: (ctx) => `Chain(s) waived (accepted_red) in the receipt${ctx && Array.isArray(ctx.waivedChains) && ctx.waivedChains.length ? ': ' + ctx.waivedChains.join(', ') : ''}. A waiver is legal at adaptive finalize but a release tag requires an UNWAIVED all-green four-chain receipt — fix the waived chain and regenerate the receipt with kaola-workflow-run-chains.js at the release-candidate commit.`,
  chains_incomplete: (ctx) => `Chain receipt does not cover the full declared chain set${ctx && Array.isArray(ctx.missingChains) && ctx.missingChains.length ? ' — missing: ' + ctx.missingChains.join(', ') : ''}. A release requires a receipt over EVERY declared test:kaola-workflow:* edition chain — regenerate with kaola-workflow-run-chains.js (no --chains subset) at the release-candidate commit.`,
  final_validation_unverified: () => 'No agent validation evidence at .cache/final-validation.md. In a consumer (non-npm) repo the agent owns verification: record .cache/final-validation.md with the validation result + a column-0 `verdict: pass` before finalize.',
  final_validation_failed: () => '.cache/final-validation.md is present but does not record `verdict: pass` (column 0). The agent\'s own validation did not pass — remediate and re-record, or fix the failing checks before finalize.',
  final_validation_unbound: () => 'final-validation.md lacks a column-0 validated_candidate_hash — record one with `kaola-workflow-validation-runner.js record --project <project> --verdict pass --command "<the validation command you ran>"`, invoked from the working tree you validated (the gate hashes the tree its own shell is in, so a record written from another checkout binds the wrong candidate); if the tree may have moved since, re-run the validation command first.',
  final_validation_stale: () => 'A relevant source/test/test-consumed file changed after validation — or the record was written from a different checkout than this one. Re-run the validation command, then re-record with `kaola-workflow-validation-runner.js record --project <project> --verdict pass --command "<the validation command you ran>"`, invoked from the working tree you validated (the gate hashes the tree its own shell is in, and a linked worktree and main differ until the branch merges); never hand-patch the hash.',
  repo_kind_undetermined: () => 'package.json is present but UNREADABLE/unparseable, so the repo kind (self-host npm vs consumer) cannot be determined. The finalize gate refuses rather than silently using the weaker consumer gate. Fix the file permissions or the malformed JSON, or remove package.json if this is genuinely a non-npm consumer repo, then re-run.',
});
// A template signals "I cannot render this payload" by returning null / '' and falls through to the
// generic string; anything THROWN propagates. That split is deliberate and predates this file: a
// bare catch cannot tell an unrenderable payload from a dead layer, and swallowing the second is how
// seven hint bodies once threw ReferenceError while 541 assertions passed over the corpse.
function validationHint(reason, ctx) {
  const safeCtx = isPlainObject(ctx) ? ctx : {};
  const tmpl = VALIDATION_HINTS[reason];
  if (typeof tmpl === 'function') {
    const out = tmpl(safeCtx);
    if (typeof out === 'string' && out.trim()) return out;
  }
  return 'Validation reported (reason: ' + reason + '). Regenerate the chain receipt over the current tree and re-run.';
}

// The repo-kind discriminator, shared by the finalize gate and the release gate: self-host iff the
// package.json at the GIT TOP-LEVEL declares an EDITION chain script
// `test:kaola-workflow:<claude|codex|gitlab|gitea>` — the EXACT predicate run-chains resolveChains
// uses, so the producer and the gate never disagree about the repo kind.
//
// THREE states, not two, so a transient fault never silently downgrades a genuine self-host to the
// WEAKER consumer gate (a fail-OPEN):
//   (1) package.json ABSENT (ENOENT)                    → GENUINE consumer.
//   (2) PRESENT but UNREADABLE (EACCES/EIO) or UNPARSEABLE → INDETERMINATE: repo_kind_undetermined.
//   (3) readable JSON, no edition chain script          → genuine consumer.
// Returns { kind: 'self-host' | 'consumer' | 'undetermined', pkgPath, detail }.
function classifyRepoKind(root) {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  let pkgRoot = root;
  try { pkgRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() || root; } catch (_) { pkgRoot = root; }
  const pkgPath = path.join(pkgRoot, 'package.json');
  let pkgRaw = null;
  try {
    pkgRaw = fs.readFileSync(pkgPath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { kind: 'consumer', pkgPath, detail: null };
    return { kind: 'undetermined', pkgPath, detail: 'unreadable (' + ((e && e.code) || (e && e.message) || 'unknown') + ')' };
  }
  let pkg;
  try { pkg = JSON.parse(pkgRaw); } catch (_) { return { kind: 'undetermined', pkgPath, detail: 'unparseable JSON' }; }
  const scripts = (pkg && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
  const names = ['claude', 'codex', 'gitlab', 'gitea'].filter(n => typeof scripts['test:kaola-workflow:' + n] === 'string');
  return { kind: names.length ? 'self-host' : 'consumer', pkgPath, detail: null, chains: names };
}

// evaluateChainReceipt — THE ONE VALIDATION VERDICT, and the one place a finalize may still stop.
//
// First Principle 5: own your own verdicts. The question "did this repo's own tests pass over THIS
// tree" is answered from artifacts this workflow produced, with no plan, no ledger and no external
// pipeline in the loop. Called IN PROCESS — there is no subprocess to spawn and no file to parse a
// verdict back out of.
//
// IT REPORTS; IT DOES NOT REFUSE. The chain receipt is precisely the content-bound witness the old
// publication refusal named, and that refusal is now a report like every other one: the measurement
// is unchanged and what the caller does with it is what changed. This function returns a typed
// FINDING; the caller records it and acts. That is not a weakening of "own your own verdicts" — we
// still compute the verdict from our own chains rather than from a system we do not own, and we
// hand it to the party accountable for the result instead of enforcing it against them.
//
// DUAL-MODE by repo kind:
//   • SELF-HOST (npm): a machine-verifiable `.cache/chain-receipt.json` should exist, be fresh, be
//     non-empty, and be all-green-or-waived. Freshness PREFERS the codeTreeHash content address and
//     FALLS BACK to the headSha pin for a legacy receipt that predates the field (a code or
//     test-consumed-prose change still flips the hash).
//   • CONSUMER (non-npm product repo): the agent OWNS verification, so the measurement is the
//     agent's recorded `.cache/final-validation.md` — presence, a column-0 `verdict: pass`, and a
//     column-0 `validated_candidate_hash` equal to the recomputed code-tree hash. It COMPARES TWO
//     HASHES; it never re-executes tests.
//
// Typed classification family (structural, never string-matched), most severe first:
//   chains_unverified > chains_stale > chains_empty > chains_red > chains_green, and on the
//   consumer arm final_validation_unverified > final_validation_failed > final_validation_unbound >
//   final_validation_stale > chains_green. `repo_kind_undetermined` classifies an indeterminate
//   repo — the one state in which NO measurement can be taken at all.
//
// opts: { cacheDir (required), project, receiptPath, head, currentCodeTree, testConsumedExtra }.
// Returns { classification, green, mode, chains, detail, operator_hint, ...diagnostics }.
function evaluateChainReceipt(root, opts) {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const options = opts || {};
  const cacheDir = options.cacheDir;
  const projTag = options.project || null;
  const finding = (classification, detail, extra) => Object.assign(
    { classification, green: false, mode: null,
      operator_hint: validationHint(classification, extra && extra.hintCtx), detail },
    (extra && extra.payload) || {});

  const repoKind = classifyRepoKind(root);
  if (repoKind.kind === 'undetermined') {
    return finding('repo_kind_undetermined',
      ['package.json at ' + repoKind.pkgPath + ' is present but ' + repoKind.detail
        + ' — the repo kind (self-host npm vs consumer) cannot be determined, so neither measurement'
        + ' can be taken; the weaker consumer reading is NOT silently substituted']);
  }
  // The hash band addresses the GIT TOP-LEVEL so the gate and the run-chains producer — which uses
  // its own getGitTopLevel(cwd) — address the SAME tree and never falsely disagree.
  let hashRoot = root;
  try { hashRoot = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() || root; } catch (_) { hashRoot = root; }

  if (repoKind.kind === 'self-host') {
    const receiptPath = options.receiptPath || path.join(cacheDir, 'chain-receipt.json');
    let receiptRaw = null;
    try { receiptRaw = fs.readFileSync(receiptPath, 'utf8'); } catch (_) { receiptRaw = null; }
    const withMode = f => Object.assign(f, { mode: 'chain-receipt' });
    if (receiptRaw == null) {
      return withMode(finding('chains_unverified', ['no chain receipt at ' + receiptPath
        + ' — run kaola-workflow-run-chains.js after the LAST commit so HEAD is covered; prose "all four chains green" is not evidence']));
    }
    let receipt = null;
    try { receipt = JSON.parse(receiptRaw); } catch (_) { receipt = null; }
    if (!receipt || typeof receipt !== 'object') {
      return withMode(finding('chains_unverified', ['chain receipt at ' + receiptPath + ' is unparseable JSON — regenerate it']));
    }
    if (typeof receipt.codeTreeHash === 'string' && receipt.codeTreeHash) {
      const extra = Array.isArray(receipt.validationTestConsumes) ? receipt.validationTestConsumes : VALIDATION_TEST_CONSUMES;
      const currentCodeTree = options.currentCodeTree || computeCodeTreeHash(hashRoot, projTag, extra);
      if (!currentCodeTree || String(receipt.codeTreeHash).trim() !== currentCodeTree) {
        return attachChainsStaleDiagnostics(withMode(finding('chains_stale',
          ['chain receipt codeTreeHash "' + receipt.codeTreeHash + '" != current code-tree hash "'
            + (currentCodeTree || '(unresolved)') + '" — code (or test-consumed prose) changed since the chains ran; regenerate the receipt'])),
        hashRoot, projTag, receipt);
      }
    } else {
      const currentHead = options.head || (() => { try { return execFileSync('git', ['-C', hashRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch (_) { return ''; } })();
      if (!currentHead || String(receipt.headSha || '').trim() !== currentHead) {
        // A sha mismatch alone cannot tell "the code advanced" from "the workflow advanced HEAD past
        // its own receipt with a bookkeeping commit". Ask which paths actually moved before saying
        // stale — an inert advance is not staleness.
        if (!headAdvanceIsValidationInvisible(hashRoot, projTag, receipt, currentHead)) {
          return attachChainsStaleDiagnostics(withMode(finding('chains_stale',
            ['chain receipt headSha "' + (receipt.headSha || '(missing)') + '" != current HEAD "'
              + (currentHead || '(unresolved)') + '" — the tree advanced since the chains ran; regenerate the receipt over HEAD'])),
          hashRoot, projTag, receipt);
        }
      }
    }
    const chains = Array.isArray(receipt.chains) ? receipt.chains : [];
    const chainRows = chains.map(c => ({ name: c.name || null, exitCode: c.exitCode, accepted_red: c.accepted_red === true }));
    // An EMPTY chains[] is NOT the same as an all-green one: the red filter below is vacuously empty
    // over an empty array, so "no red chains" would be indistinguishable from "no chains ran at
    // all". Classified on its own token BEFORE the red check, mirroring the producer's own no_chains
    // guard.
    if (chains.length === 0) {
      return withMode(finding('chains_empty', ['chain receipt at ' + receiptPath
        + ' has an empty chains[] array — zero chains were verified; regenerate the receipt with kaola-workflow-run-chains.js over a resolved chain set']));
    }
    const redChains = chains.filter(c => c && c.exitCode !== 0 && c.accepted_red !== true);
    if (redChains.length) {
      const names = redChains.map(c => c.name || '(unnamed)').join(', ');
      const timedOutChains = redChains.filter(c => c && c.timed_out === true).map(c => c.name || '(unnamed)');
      return withMode(finding('chains_red',
        ['chain(s) RED with no waiver: ' + names + ' — fix the chain or waive it explicitly (--accept-known-red <name>:<open-issue>)'],
        { hintCtx: { timedOutChains },
          payload: { chains: chainRows,
            redChains: redChains.map(c => ({ name: c.name || null, exitCode: c.exitCode, timed_out: c.timed_out === true })) } }));
    }
    return { classification: 'chains_green', green: true, mode: 'chain-receipt', chains: chainRows,
      detail: [chains.length + ' chain(s) green over this tree'], operator_hint: null };
  }

  const fvPath = path.join(cacheDir, 'final-validation.md');
  const withFvMode = f => Object.assign(f, { mode: 'final-validation', chains: [] });
  let fvRaw = null;
  try { fvRaw = fs.readFileSync(fvPath, 'utf8'); } catch (_) { fvRaw = null; }
  if (fvRaw == null || !fvRaw.trim()) {
    return withFvMode(finding('final_validation_unverified', ['no agent validation evidence at ' + fvPath
      + ' — a consumer (non-npm) repo records its validation in .cache/final-validation.md (with a column-0 `verdict: pass`), not a chain receipt']));
  }
  const fv = parseRecordedVerdict(fvRaw);
  if (!fv.found || fv.verdict !== 'pass') {
    return withFvMode(finding('final_validation_failed',
      ['.cache/final-validation.md does not record `verdict: pass` (column 0) — the agent\'s own validation did not pass (found verdict: ' + (fv.found ? fv.verdict : '(none)') + ')']));
  }
  // The verdict proves the validation PASSED, not that it validated THIS candidate. Both directions
  // are classified rather than assumed away: an absent/malformed binding is final_validation_unbound
  // (an omitted field must not read as bound); a mismatch is final_validation_stale, with both
  // hashes carried so a reader can check the claim rather than take it on trust.
  const bind = parseValidatedCandidateHash(fvRaw);
  if (!bind.present || !bind.hash) {
    return withFvMode(finding('final_validation_unbound', ['.cache/final-validation.md carries no well-formed'
      + ' column-0 `validated_candidate_hash:` line — the pass verdict is not bound to a candidate snapshot; record one computed after the last relevant edit']));
  }
  const extra = Array.isArray(options.testConsumedExtra) ? options.testConsumedExtra : VALIDATION_TEST_CONSUMES;
  const currentCandidate = options.currentCodeTree || computeCodeTreeHash(hashRoot, projTag, extra);
  if (!currentCandidate || currentCandidate !== bind.hash) {
    return withFvMode(finding('final_validation_stale',
      ['recorded validated_candidate_hash "' + bind.hash + '" != current code-tree hash "'
        + (currentCandidate || '(unresolved)') + '" — a relevant source/test/test-consumed file changed after the recorded validation; re-run the validation command and re-record final-validation.md with a fresh hash'],
      { payload: { recorded_candidate_hash: bind.hash, current_candidate_hash: currentCandidate || null } }));
  }
  return { classification: 'chains_green', green: true, mode: 'final-validation', chains: [],
    detail: ['agent validation recorded and bound to this tree'], operator_hint: null,
    validated_candidate_hash: currentCandidate };
}

// The release-prep surface (#877) — the ONE list of files a release cut may touch: the release
// script's --prepare step stamps exactly these files and refuses a worktree carrying anything
// else. Lives here, in the base-named byte-identical kernel, so every edition reads one wording.
const RELEASE_PLUGIN_BASE = 'plugins/kaola-workflow';
const CODEX_MANIFEST_RELPATHS = Object.freeze([
  RELEASE_PLUGIN_BASE + '/.codex-plugin/plugin.json',
  RELEASE_PLUGIN_BASE + '-gitlab/.codex-plugin/plugin.json',
  RELEASE_PLUGIN_BASE + '-gitea/.codex-plugin/plugin.json',
]);
const CLAUDE_MANIFEST_RELPATHS = Object.freeze([
  RELEASE_PLUGIN_BASE + '-gitlab/.claude-plugin/plugin.json',
  RELEASE_PLUGIN_BASE + '-gitea/.claude-plugin/plugin.json',
]);
const RELEASE_FILES = Object.freeze(['CHANGELOG.md', 'README.md', 'package.json', ...CODEX_MANIFEST_RELPATHS, ...CLAUDE_MANIFEST_RELPATHS]);

// evaluateReleaseReceipt — THE PRE-TAG RELEASE GATE. A check-only twin of the chain-receipt arm
// above, pinned STRICTLY to the release-candidate commit. Reads only the receipt + local git
// (self-owned: no CI/CD, no forge calls); mutates nothing. Deltas vs the finalize arm, each of them
// load-bearing:
//   • NO project folder — at release time the run is archived, so the receipt default is the git
//     top-level's .cache/chain-receipt.json, overridable via opts.receiptPath.
//   • BINDING: strict headSha equality against the candidate (default HEAD) is the ONLY route. The
//     codeTreeHash content-address relaxation is deliberately NOT used, and neither is any
//     ancestor-plus-release-prep-diff relaxation: #881 shipped one and #888 measured that the
//     sink's `chore: archive <project>` commit always interposes off-surface paths, so the branch
//     could not fire in the only release sequence the workflow has. A tag names an exact commit,
//     and the four-chain run at that commit is mandatory. Anything else refuses chains_stale.
//   • headSha 'unknown'/missing is a REFUSAL, never a pass (release.js's own greenness probe treats
//     headSha === 'unknown' as green; this gate must not copy that leniency — an unbound receipt
//     proves nothing about the candidate).
//   • a DIRTY-stamped receipt (workTreeHash != 'clean') refuses: the chains validated the commit
//     PLUS uncommitted edits, not the tree the tag would name.
//   • ANY waived chain (accepted_red) refuses chains_waived — a waiver is legal at finalize, never
//     for a release tag.
//   • the receipt must COVER the full resolved chain set. A SUBSET receipt is a legitimate producer
//     output but never four-chain release evidence: chains_incomplete. An unresolvable chain set
//     fails CLOSED with repo_kind_undetermined, because a release is self-host-by-definition and an
//     empty expected set would make coverage vacuous.
// Typed precedence family: chains_unverified > chains_stale > chains_empty > repo_kind_undetermined
// > chains_incomplete > chains_red > chains_waived — coverage before greenness.
// opts: { receiptPath, candidate }. Returns { ok: true, mode: 'release-check', candidate, chains }
// or { ok: false, reason, operator_hint, errors, ... }.
function evaluateReleaseReceipt(root, opts) {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const options = opts || {};
  // KEY ORDER IS PART OF THE PORT: reason, hint, payload, errors — the emitted envelope is
  // byte-identical to the verb this replaces, so a caller diffing the two sees nothing move.
  const refuseWith = (reason, errors, extra) => Object.assign(
    { ok: false, reason, operator_hint: validationHint(reason, extra && extra.hintCtx) },
    (extra && extra.payload) || {}, { errors });

  const receiptPath = options.receiptPath || path.join(root, '.cache', 'chain-receipt.json');
  let receiptRaw = null;
  try { receiptRaw = fs.readFileSync(receiptPath, 'utf8'); } catch (_) { receiptRaw = null; }
  if (receiptRaw == null) {
    return refuseWith('chains_unverified', ['no chain receipt at ' + receiptPath
      + ' — run kaola-workflow-run-chains.js at the release-candidate commit so the tag names a verified tree']);
  }
  let receipt = null;
  try { receipt = JSON.parse(receiptRaw); } catch (_) { receipt = null; }
  if (!receipt || typeof receipt !== 'object') {
    return refuseWith('chains_unverified', ['chain receipt at ' + receiptPath + ' is unparseable JSON — regenerate it']);
  }
  // Candidate = the exact commit the tag would name. rev-parse ^{commit} normalizes a ref/short sha
  // to the full sha; an unresolvable candidate fails CLOSED into the stale arm ('(unresolved)').
  const candidateArg = options.candidate || 'HEAD';
  let candidate = '';
  try { candidate = execFileSync('git', ['-C', root, 'rev-parse', '--verify', candidateArg + '^{commit}'], { encoding: 'utf8' }).trim(); } catch (_) { candidate = ''; }
  const stamped = String(receipt.headSha || '').trim();
  if (!stamped || stamped === 'unknown') {
    return attachChainsStaleDiagnostics(refuseWith('chains_stale',
      ['chain receipt headSha "' + (stamped || '(missing)') + '" is not bound to a commit — a release tag names an exact commit; regenerate the receipt with kaola-workflow-run-chains.js at the release-candidate commit']),
    root, null, receipt);
  }
  // BINDING: strict sha equality, and nothing else. A tag names an exact commit.
  if (!candidate) {
    return attachChainsStaleDiagnostics(refuseWith('chains_stale',
      ['chain receipt headSha "' + stamped + '" cannot be checked against release candidate "(unresolved)"'
        + ' — the candidate did not resolve to a commit; pass a resolvable --candidate (default HEAD)']),
    root, null, receipt);
  }
  if (stamped !== candidate) {
    return attachChainsStaleDiagnostics(refuseWith('chains_stale',
      ['chain receipt headSha "' + stamped + '" is not the release candidate "' + candidate
        + '" — a release tag names an exact commit; regenerate the receipt at the candidate commit with kaola-workflow-run-chains.js']),
    root, null, receipt);
  }
  if (receipt.workTreeHash !== 'clean') {
    return refuseWith('chains_stale', ['chain receipt was stamped over a DIRTY worktree (workTreeHash "'
      + (receipt.workTreeHash || '(missing)') + '" != "clean") — the chains validated the commit plus uncommitted edits, not the tree the tag would name; commit everything and regenerate the receipt']);
  }
  const chains = Array.isArray(receipt.chains) ? receipt.chains : [];
  if (chains.length === 0) {
    return refuseWith('chains_empty', ['chain receipt at ' + receiptPath
      + ' has an empty chains[] array — zero chains were verified; regenerate the receipt with kaola-workflow-run-chains.js over a resolved chain set']);
  }
  // COVERAGE: resolve the expected chain set from package.json (the exact predicate run-chains
  // resolveChains and the finalize discriminator use, so producer and gate never disagree). Fail
  // CLOSED on an unresolvable set: passing coverage against an empty expected set would let ANY
  // receipt through (a fail-open).
  const pkgPath = path.join(root, 'package.json');
  let expectedChains = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const scripts = (pkg && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
    expectedChains = ['claude', 'codex', 'gitlab', 'gitea'].filter(n => typeof scripts['test:kaola-workflow:' + n] === 'string');
  } catch (_) { expectedChains = null; }
  if (!expectedChains || expectedChains.length === 0) {
    return refuseWith('repo_kind_undetermined', ['cannot resolve the release chain set from ' + pkgPath
      + ' (missing/unreadable/unparseable package.json, or no test:kaola-workflow:* edition chain scripts declared) — the release gate verifies the receipt against the FULL declared chain set and refuses rather than passing a vacuous coverage check']);
  }
  const gotChains = new Set(chains.map(c => c && c.name).filter(Boolean));
  const missingChains = expectedChains.filter(n => !gotChains.has(n));
  if (missingChains.length) {
    return refuseWith('chains_incomplete',
      ['chain receipt covers only [' + Array.from(gotChains).join(', ') + '] of the declared chain set ['
        + expectedChains.join(', ') + '] — missing: ' + missingChains.join(', ')
        + '; a release demands the FULL unwaived set — regenerate with kaola-workflow-run-chains.js (no --chains subset) at the candidate commit'],
      { hintCtx: { missingChains }, payload: { missingChains, expectedChains } });
  }
  const redChains = chains.filter(c => c && c.exitCode !== 0 && c.accepted_red !== true);
  if (redChains.length) {
    const names = redChains.map(c => c.name || '(unnamed)').join(', ');
    const timedOutChains = redChains.filter(c => c && c.timed_out === true).map(c => c.name || '(unnamed)');
    return refuseWith('chains_red',
      ['chain(s) RED with no waiver: ' + names + ' — a release candidate must be all-green; fix the chain and regenerate the receipt'],
      { hintCtx: { timedOutChains },
        payload: { redChains: redChains.map(c => ({ name: c.name || null, exitCode: c.exitCode, timed_out: c.timed_out === true })) } });
  }
  const waivedChains = chains.filter(c => c && c.accepted_red === true);
  if (waivedChains.length) {
    const names = waivedChains.map(c => c.name || '(unnamed)');
    return refuseWith('chains_waived',
      ['chain(s) waived (accepted_red): ' + names.join(', ')
        + ' — a waiver is legal at adaptive finalize but a release tag requires an UNWAIVED all-green receipt; fix the waived chain and regenerate the receipt at the candidate commit'],
      { hintCtx: { waivedChains: names },
        payload: { waivedChains: waivedChains.map(c => ({ name: c.name || null, exitCode: c.exitCode, accepted_red_issue: c.accepted_red_issue || null })) } });
  }
  return { ok: true, mode: 'release-check', candidate,
    chains: chains.map(c => ({ name: c.name || null, exitCode: c.exitCode, accepted_red: false })) };
}

// changedPathsSinceBase — the branch-level MEASUREMENT the finalize attribution refusal became.
//
// It used to compare this list against declared write sets and refuse anything left over. Declared
// write sets are gone, and a free-text result is not a path set — parsing one back into one would
// re-invent the declaration this design removed. So the comparison goes and the measurement stays:
// the caller reports these paths and records them durably, and a reader decides whether they belong.
// A git failure yields null (unknown), which is reported as such — it is not a verdict either way.
function changedPathsSinceBase(root, base, project) {
  const { execFileSync } = require('child_process');
  let diffOut;
  try {
    diffOut = execFileSync('git', ['-C', root, 'diff', String(base || 'main') + '...HEAD', '--name-only'],
      { encoding: 'utf8', maxBuffer: VALIDATION_GIT_MAX_BUFFER });
  } catch (_) { return null; }
  const seen = new Set();
  const out = [];
  for (const raw of diffOut.split('\n')) {
    const rel = String(raw || '').trim();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    if (isBookkeepingPath(rel, project) || /^kaola-workflow\//.test(rel)) continue;
    out.push(rel);
  }
  out.sort();
  return out;
}

// parseGoal — the run's goal, read from the mission list's H1 (`# <goal>`). One line, at the top of
// the one file, because the same usage limit that kills a subagent applies to the session holding
// the goal in context.
//
// The H1 is the WHOLE grammar: the FIRST `# ` heading wins, so an item's prose further down cannot
// displace it. Tolerates a leading UTF-8 BOM. Returns { goal: <string> } when present, { goal: null }
// when absent — the same shape its readers already destructure. Pure (no fs).
function parseGoal(content) {
  const text = String(content || '').replace(/^﻿/, '');
  const m = text.match(/^#[ \t]+(.+?)[ \t]*$/m);
  const goal = m ? m[1].trim() : '';
  return { goal: goal || null };
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
  NEXT_COMMAND,
  NEXT_SKILL,
  PLAN_FILE,
  CODEX_PINNED_STANDARD_ROLES,
  CODEX_PINNED_REASONING_ROLES,
  contractForProvider,
  dispatchEffort,
  effortForProvider,
  mapTier,
  isPlainObject,
  canonicalJson,
  sha256Hex,
  sha256Canonical,
  buildClaimIdentity,
  writeClaimIdentityBlock,
  writeFileAtomicReplace,
  refuse,
  // ADR 0013 M2 — the outcome recorder's PURE half plus the parent-owned sidecar set. The set is
  // the ONE list both the sidecar writers and the leg capture sweep read; the builder is the one
  // record shape every edition emits.
  NODE_TIMINGS_LOG_NAME,
  DISPATCH_LOG_NAME,
  OUTCOME_LOG_NAME,
  PARENT_OWNED_SIDECARS,
  isParentOwnedSidecar,
  OUTCOME_LOG_SCHEMA_VERSION,
  OUTCOME_CLASSIFICATIONS,
  buildOutcomeRecord,
  appendOutcomeRecord,
  // The Layer-0 durable-artifact registry (ADR 0013 T1/T2): the machine-readable ruling of every
  // durable artifact as record / derivable / preference, the total classifier over it, the T2
  // record predicate, and the absolute->project-relative mapper the write interception uses.
  KERNEL_RULINGS,
  KERNEL_RECORDS,
  KERNEL_ARTIFACT_REGISTRY,
  classifyDurableArtifact,
  projectRelativeArtifactPath,
  // The validation surface. ONE band constant and ONE hash helper, read by BOTH the producer
  // (run-chains) and the gates (finalize, release) — a second copy of either is a second answer.
  VALIDATION_TEST_CONSUMES,
  isBookkeepingPath,
  testConsumes,
  isValidationInvisible,
  resolveFinalizeCheckRoot,
  computeCodeTreeHash,
  evaluateChainReceipt,
  evaluateReleaseReceipt,
  CODEX_MANIFEST_RELPATHS,
  CLAUDE_MANIFEST_RELPATHS,
  RELEASE_FILES,
  changedPathsSinceBase,
  MISSION_LIST_FILE,
  parseGoal,
};
