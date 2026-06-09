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

// The three legal workflow paths. `claimProject` whitelists {fast, full} when the
// adaptive switch is OFF and this full set when ON.
const WORKFLOW_PATHS = Object.freeze(['fast', 'full', 'adaptive']);
const WORKFLOW_PATHS_NO_ADAPTIVE = Object.freeze(['fast', 'full']);
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

// Caps (verified first-party): FANOUT_CAP default 4 (env KAOLA_FANOUT_CAP);
// LOOP_CAP static loop bound; FILE_CEILING absolute backstop of 6 (fast.md:63);
// TEST_THRASH_LIMIT >= 3 consecutive failing cycles on the same test (fast.md:64).
const DEFAULT_FANOUT_CAP = 4;
const LOOP_CAP = 5;
const FILE_CEILING = 6;
const TEST_THRASH_LIMIT = 3;

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
// escalates a thrashing loop to full.
const ESCALATION_MARKERS = Object.freeze({
  security: 'security',
  consent: 'consent',
  test_thrash: 'test_thrash',
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
  const headRe = new RegExp('^##\\s+' + LEDGER_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm');
  const m = text.match(headRe);
  if (!m) return false;
  const after = text.slice(m.index + m[0].length);
  const nextH2 = after.search(/^##\s/m);
  const body = nextH2 < 0 ? after : after.slice(0, nextH2);
  return /^consent_halt:[ \t]*pending[ \t]*$/m.test(body);
}

// #251: the mechanical verdict vocabulary a gate/skeptic role emits into its `.cache` evidence file.
const VERDICT_PASS = 'pass';
const VERDICT_FAIL = 'fail';
const VERDICT_VOCABULARY = Object.freeze([VERDICT_PASS, VERDICT_FAIL]);

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
// switch field and its env mirror. Precedence: env KAOLA_ENABLE_ADAPTIVE > config
// enable_adaptive > default OFF.
const CONFIG_REL_PATH = ['.config', 'kaola-workflow', 'config.json'];
const ENABLE_ADAPTIVE_FIELD = 'enable_adaptive';
const ENABLE_ADAPTIVE_ENV = 'KAOLA_ENABLE_ADAPTIVE';
const FANOUT_CAP_ENV = 'KAOLA_FANOUT_CAP';
// #320: a write-role parallel batch only stays isolated if each member subagent
// actually runs from its own member worktree. This harness cannot FORCE a
// dispatched subagent's CWD (the `Working directory:` line is advisory prose), so
// write-role batches leak edits to the parent worktree. This env flag asserts that
// the runtime CAN force member-worktree CWD; default FALSE means write-role batches
// degrade to serial BEFORE dispatch instead of leaking. Set only by a future
// harness that gains a real cwd-forcing primitive.
const BATCH_CWD_ENFORCED_ENV = 'KAOLA_BATCH_CWD_ENFORCED';

// Resolve the adaptive switch with precedence env > config > default OFF.
// The OFF guarantee rests on the STRICT `config.enable_adaptive === true` on-test
// (never `!== false`): an absent field is falsy → OFF. The env mirror is `1`/`0`.
function resolveEnableAdaptive(config, env) {
  const e = env || {};
  const raw = e[ENABLE_ADAPTIVE_ENV];
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return !!(config && config[ENABLE_ADAPTIVE_FIELD] === true);
}

// Resolve the fan-out cap (env override, else default), clamped to a sane minimum.
function resolveFanoutCap(env) {
  const raw = (env || {})[FANOUT_CAP_ENV];
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_FANOUT_CAP;
}

// #320: resolve whether the runtime can force member-worktree CWD for batch
// subagents. Fail-closed default FALSE — only an explicit 1/true/yes opts in.
function resolveBatchCwdEnforced(env) {
  const raw = (env || {})[BATCH_CWD_ENFORCED_ENV];
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function isLegalWorkflowPath(value, adaptiveEnabled) {
  return (adaptiveEnabled ? WORKFLOW_PATHS : WORKFLOW_PATHS_NO_ADAPTIVE).includes(value);
}

module.exports = {
  WORKFLOW_PATHS,
  WORKFLOW_PATHS_NO_ADAPTIVE,
  ADAPTIVE_PATH,
  PLAN_RUN_COMMAND,
  PLAN_RUN_SKILL,
  ADAPT_COMMAND,
  ADAPT_SKILL,
  PLAN_FILE,
  NODES_HEADING,
  LEDGER_HEADING,
  LEDGER_STATUSES,
  DEFAULT_FANOUT_CAP,
  LOOP_CAP,
  FILE_CEILING,
  TEST_THRASH_LIMIT,
  MAX_NODES,
  ESCALATION_MARKERS,
  CONSENT_HALT_MARKER,
  readDurableConsentHalt,
  VERDICT_PASS,
  VERDICT_FAIL,
  VERDICT_VOCABULARY,
  parseNodeVerdict,
  parseNodeSelector,
  FINDING_SCOPE_VOCABULARY,
  FINDING_ACTION_VOCABULARY,
  FINDING_STATUS_VOCABULARY,
  parseNodeFindings,
  unresolvedInScopeFixes,
  CURATED_ROOT_PATHS,
  extractCuratedRootPaths,
  isCuratedRoot,
  canonicalCuratedRoot,
  CONFIG_REL_PATH,
  ENABLE_ADAPTIVE_FIELD,
  ENABLE_ADAPTIVE_ENV,
  FANOUT_CAP_ENV,
  BATCH_CWD_ENFORCED_ENV,
  resolveEnableAdaptive,
  resolveFanoutCap,
  resolveBatchCwdEnforced,
  isLegalWorkflowPath,
};
