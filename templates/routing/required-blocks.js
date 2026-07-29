'use strict';

// required-blocks.js — the single-source required-block MANIFEST for the six
// #400 routing surfaces per topic (3 Claude commands + 3 Codex SKILLs).
//
// Layer 1 of the routing-surface generation seam: each required block is
// DECLARED ONCE here, and a derived-universe presence checker
// (scripts/test-route-reachability.js :: checkManifest) computes the exact set
// of surfaces every block obligates from topic + tags — never a hand-typed
// file list — so obligating 4-of-6 surfaces by omission is structurally
// impossible. The manifest is an ADDITIVE-SUPERSET over the existing T-pins:
// a machine-checked superset proof folds every legacy in-scope token; anything
// not cleanly foldable stays a residual additive pin.
//
// Record shape:
//   { block_id, topic, runtime_tag, surface_type_tag, content_tokens }
//
// TAG SEMANTICS (both load-bearing; the checker asserts consistency):
//   runtime_tag       claude-live  => command surfaces only
//                     codex-live   => skill surfaces only
//                     both         => follow surface_type_tag
//   surface_type_tag  command | skill | both
//   (a claude-live block carrying surface_type_tag:'skill' — or codex-live +
//    'command' — is an inconsistent/orphan manifest entry and reds.)
//
// content_tokens are DISTINCTIVE VERBATIM substrings of the current committed
// surface, matched whitespace-normalized (norm() = replace(/\s+/g,' ')). The
// FIRST content_token of a marker-bearing block is its semantic marker
// (<!-- PIN: … --> / <!-- CARD: … -->); the reverse orphan-sentinel matches
// surface markers back to these first tokens.

const REQUIRED_BLOCKS = [
  // ==== plan-run (basename kaola-workflow-plan-run on both surface types) ====
  {
    block_id: 'pr-reviewer-contract-v2-execution',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: reviewer-contract-v2-execution -->',
      'the opener\'s dispatch card is the sole runtime envelope',
      '`behavior_contract_hash`',
      '`resolved_profile_hash`',
      '`review_context_hash`',
      '`validation_obligations`',
      '`.cache/validation-vectors/`',
      '`replan_required`',
      'The harness never selects a writer or replacement DAG.',
      '`contract_version: 1`',
    ],
  },
  {
    block_id: 'pr-frontier-unit',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    // 'frontier unit' alone is a substring of its own marker (self-satisfying — the marker's
    // continued presence would pass this token even if the pointer paragraph below it were
    // deleted; kept only because the legacy T5 SUPERSET-PROOF still names it). The pointer path
    // is the distinctive token: ALL content_tokens are required (AND), so deleting the pointer
    // paragraph while leaving the marker + legacy literal in place still reds.
    content_tokens: ['<!-- PIN: frontier unit -->', 'frontier unit',
      'docs/plan-run-cards/frontier-batch.md'],
  },
  {
    block_id: 'pr-leg-isolation-recipe',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['<!-- PIN: leg-isolation-recipe -->', '--write-overlap-consent'],
  },
  {
    // #767: the spine expansion-lifecycle driving prose — the keystone that makes progressive
    // elaboration user-reachable. Raw skeleton text (REGION-neutral, no SLOT/SPLICE divergence),
    // so it obligates all six plan-run surfaces identically. The interior tokens are distinctive
    // command/directive strings, never substrings of the marker itself.
    block_id: 'pr-expansion-lifecycle',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: expansion-lifecycle -->',
      'expansionPending',
      'readyToExpand',
      'readyToDischarge',
      'expand-open',
      'expand-close',
      'expansion_unit_role_gate_unsupported',
    ],
  },
  {
    block_id: 'pr-speculative-open',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['<!-- CARD: speculative-open -->', '--speculative-consent'],
  },
  {
    block_id: 'pr-gate-instrumentation',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    // The marker alone is not distinctive — the marker's continued presence would pass this
    // block even if the interior rule were rewritten to say the opposite. Pin the actual rule.
    content_tokens: ['<!-- PIN: gate-instrumentation-provisioning -->',
      'never instructs authoring files — it verifies',
      "provisions it inside that node's own declared write set"],
  },
  {
    block_id: 'pr-dispatch-card-visibility',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      "take the dispatch card from the summary line's `opened=` segment or from `.cache/<op>-envelope.json`. Never dispatch without the card in view.",
      'Every spawn parameter comes from the dispatch card.',
      'plan-run orchestrator: driving {project} — {N} nodes; each role subagent will be announced at dispatch.',
      '→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model}, effort {effort})',
      '← {node_id} · {role} returned: {verdict or one-line outcome}',
      '→ running {node_id} · {role} inline',
      '{node-id} → complete; opened: {next-id|—}',
    ],
  },
  {
    block_id: 'pr-teammate-mode',
    topic: 'plan-run',
    runtime_tag: 'claude-live',
    surface_type_tag: 'command',
    content_tokens: [
      '<!-- PIN: teammate-mode -->',
      "spawn each node's role agent as a NAMED teammate",
      'send EXACTLY ONE request for the deliverable, then wait',
    ],
  },
  {
    block_id: 'pr-join-protocol-claude',
    topic: 'plan-run',
    runtime_tag: 'claude-live',
    surface_type_tag: 'command',
    content_tokens: [
      '<!-- CARD: join-protocol -->',
      'dispatch.wait_budget_minutes',
      'Writer kill-safety',
      'writerHalt',
      'delegation_outcome',
    ],
  },
  {
    // #775: Codex >=0.145.0 owns sub-agent model/reasoning resolution itself
    // (no guaranteed parent-session equality); codex_tier_unresolved and the
    // 0.142/0.144 transport-unsafe refusals are retired — Codex resolves the
    // model/effort pair independently and there is no longer a transport gate.
    block_id: 'pr-codex-dispatch',
    topic: 'plan-run',
    runtime_tag: 'codex-live',
    surface_type_tag: 'skill',
    content_tokens: [
      '<!-- PIN: codex-dispatch -->',
      'on EVERY role dispatch',
      'fork_turns: "none"',
      'dispatch.codex_profile_mode',
      'Omit both `model`',
      'direct `agents` namespace',
      'never dispatch through `functions.exec` or Code Mode',
      'agents.spawn_agent',
    ],
  },
  {
    // The role-substitution channel is only worth having if routed prose REACHES it: a remedy no
    // surface names is dead weight. Pin the trigger, the command, the claim-preserving guarantee,
    // and the consent fallback on all six surfaces.
    block_id: 'pr-role-capability-coverage',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: role-capability-coverage -->',
      'cannot cover the node brief',
      'capability_gap',
      'substitute-role',
      'BYTE-IDENTICAL',
      'write-halt --reason consent',
      'is **NOT evidence**',
      'substitute_self_noop',
      'substitute_evidence_reset_failed',
      'evidence_reset: true',
      'derived from the DISPATCH TARGET',
    ],
  },
  {
    // The evidence-persistence contract is RUNTIME-INVARIANT: every role, on every runtime,
    // self-persists its full deliverable to the seeded evidence file and returns a compact
    // summary. It used to live inside the codex-only dispatch block because only that runtime
    // enforced self-write; now that the contract is universal, it is a 6-surface block of its
    // own — keeping it under a runtime-scoped block would let the two halves silently diverge.
    block_id: 'pr-evidence-persistence',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'One contract, every role, every runtime',
      'dispatch.evidence_file',
      'SOLE write exception',
      'record-evidence',
      '--verify --json',
      'is the FALLBACK channel, never the primary one',
      'delegation_outcome: returned_partial',
      'transport_error: encrypted_return',
    ],
  },
  {
    block_id: 'pr-join-protocol-codex',
    topic: 'plan-run',
    runtime_tag: 'codex-live',
    surface_type_tag: 'skill',
    content_tokens: [
      '<!-- PIN: join-protocol -->',
      'dispatch.wait_budget_minutes',
      'delegation_outcome',
      'writerHalt',
    ],
  },
  {
    // #634: metric-optimizer dispatch prose — the 2nd/3rd tokens are distinctive
    // interior content, NOT substrings of the marker itself (the #637 lesson
    // applied proactively: 'dispatch.optimize' and the card path do not appear
    // inside '<!-- CARD: metric-optimizer -->').
    block_id: 'pr-metric-optimizer-card',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- CARD: metric-optimizer -->',
      'dispatch.optimize',
      'docs/plan-run-cards/metric-optimizer.md',
    ],
  },
  {
    // node-briefs-relay: the step-3 dispatch bullets that relay the shared
    // context packet verbatim into every role dispatch, carry a node's
    // authored brief (`goal_line`) verbatim into the role dispatch, and
    // instruct the role to read+echo each `upstream_evidence` file's nonce.
    // Raw skeleton text (no SLOT/SPLICE divergence), so it obligates all six
    // surfaces identically.
    block_id: 'pr-node-briefs-relay',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: node-briefs-relay -->',
      'relay it VERBATIM into every role dispatch as the',
      'carry it VERBATIM into the role dispatch',
      'record a column-0 `upstream_read: <node-id> <nonce>` line',
      'never from the card — the card never carries it',
    ],
  },
  {
    // Mirror-before-dispatch: the operator applies the returned taskTransitions to the visible
    // task list BEFORE spawning the role agent, so the live view never lags the ledger. Raw
    // skeleton text at the step-3 dispatch seam (no SLOT/SPLICE divergence), so it obligates all
    // six plan-run surfaces identically. The distinctive tokens are interior prose, not substrings
    // of the marker.
    block_id: 'pr-mirror-before-dispatch',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: mirror-before-dispatch -->',
      'Apply the returned `taskTransitions` to the visible task list BEFORE',
      'the ledger stays authoritative',
      "the mirror is the operator's only live view",
    ],
  },
  {
    // The execution-mode judgment grant: dispatch-vs-inline is the orchestrator's
    // per-unit economic call, and NO justifier, evidence line, or approval attaches
    // to it. This is a SUBTRACTION made durable — the grant is the only thing standing
    // between the six plan-run surfaces and a re-introduced spawn mandate, so its
    // wording is obligated on all six rather than left to survive by habit. Raw
    // skeleton text (REGION-neutral, no SLOT/SPLICE divergence). The tokens are
    // distinctive interior prose, never a marker substring.
    //
    // SCOPE, decided rather than incidental: this pin catches DELETION and abridgement
    // of the grant. It does NOT catch a mandate re-ADDED alongside a grant left
    // nominally intact. A paired absence audit was built for that case and REJECTED —
    // deciding whether prose binds an obligation needs to know who the obligation
    // binds, and a keyword filter cannot: the prototype passed five natural dispatch
    // mandates while convicting seven of nine faithful renditions of the rules it was
    // required to leave alone. Both errors pointed away from the philosophy it guarded.
    // Do not "fix" this by adding a vocabulary scan; a real structural check
    // (subject-of-obligation extraction) or nothing.
    block_id: 'pr-execution-mode-judgment',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'Everywhere else execution mode is your judgment, per unit — dispatch production, keep decisions.',
      'Delegating discretionary production is the default;',
      'and interpretation/adjudication may run inline, closed with `--main-session-direct`.',
    ],
  },
  {
    block_id: 'pr-replan-control-plane',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: replan-plan-run -->',
      '`replan_in_progress`',
      'single legal mutation',
      '`replan_phase`',
      '`parent_plan_hash`',
      '`child_plan_hash`',
      '`last_cas_result`',
      '`replan_planner_dispatch_required`',
      '`workflow-plan.next.md`',
      '`.cache/replan-planner-attestation.json`',
      '`planner_control_boundary_violation`',
    ],
  },

  // ==== finalize (basename kaola-workflow-finalize on both surface types) ====
  {
    block_id: 'fn-reviewer-contract-v2-finalization',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: reviewer-contract-v2-finalization -->',
      '`plan_schema_version: 2`',
      '`contract_version: 2`',
      '`code_certifier`',
      '`security_certifier`',
      '`resolved_profile_hash`',
      '`review_context_hash`',
      '`candidate_digest`',
      '`validation_obligations`',
      '`.cache/validation-vectors/`',
      '`contract_version: 1`',
    ],
  },
  {
    // 'closure-audit' (2nd token) is a bare SUBSTRING of the marker itself
    // ('<!-- PIN: closure-audit -->'), so it is vacuous against a marker-
    // preserving interior gut (#637). 'sink_incomplete' is a DISTINCTIVE
    // interior token (not a marker substring, edition-neutral) verified
    // present on all six finalize surfaces — it is the genuine presence
    // obligation this block exists to enforce.
    block_id: 'fn-closure-audit',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['<!-- PIN: closure-audit -->', 'closure-audit', 'sink_incomplete'],
  },
  {
    block_id: 'fn-gate-barrier',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['--resume-check', '--gate-verify', '--barrier-check', '--verdict-check', 'workflow_path: adaptive'],
  },
  {
    block_id: 'fn-bundle-closure',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['--issue-numbers', 'issue_numbers'],
  },
  {
    // final-validation.md is present on all 6 finalize surfaces; the tighter
    // typed refusal `final_validation_unverified` is a github command+skill pin
    // only (the gitlab/gitea finalize COMMANDS are the 2:1 rewrite and lack it),
    // so it stays a residual additive pin (RESIDUAL_ALLOWLIST) — not a both/both
    // content token.
    block_id: 'fn-final-validation-gate',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['final-validation.md'],
  },
  {
    block_id: 'fn-replan-control-plane',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: replan-finalize -->',
      '`replan_in_progress`',
      'single legal mutation',
      '`replan_phase`',
      '`parent_plan_hash`',
      '`child_plan_hash`',
      '`last_cas_result`',
      '`replan_planner_dispatch_required`',
      '`workflow-plan.next.md`',
      '`.cache/replan-planner-attestation.json`',
      '`planner_control_boundary_violation`',
    ],
  },

  // ==== next (ASYMMETRIC: command basename workflow-next, skill basename
  //      kaola-workflow-next) ====
  {
    block_id: 'nx-claim-escalate',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['<!-- PIN: claim-escalate -->', 'result: escalate'],
  },
  {
    block_id: 'nx-adaptive-route',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['kaola-workflow-plan-run', 'auto-bundle'],
  },
  {
    // #645 axiom pointer — the shared-body First Principles reference line
    // (tie-breaker + tighten-only). Raw skeleton text above every REGION, so it
    // obligates all six next surfaces identically. Non-marker tokens (distinctive
    // verbatim prose), so no reverse orphan-sentinel obligation.
    block_id: 'nx-first-principles',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'First Principles axioms',
      'never cite one to skip a typed gate, refusal, or barrier',
    ],
  },
  {
    // #789: issue-scout is fully retired — the no-target backlog survey folded into the
    // workflow-planner (dispatched by the separate adapt surface), so the "next" SKILL no longer
    // dispatches any agent of its own and carries no distinct control-plane literal here.
    // `watch-pr` is forge-renamed to `watch-mr` on the gitlab next command, so
    // it cannot be a command-obligating content token; it stays a residual
    // additive pin (RESIDUAL_ALLOWLIST). The rest hold across all 3 commands.
    block_id: 'nx-router-command',
    topic: 'next',
    runtime_tag: 'claude-live',
    surface_type_tag: 'command',
    content_tokens: [
      'thin router',
      'active folders',
      '--target-issue',
      'This step never runs; it is retained only for the shared',
      'typed-refusal classification below',
    ],
  },
  {
    block_id: 'nx-replan-control-plane',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: replan-next -->',
      '`replan_in_progress`',
      'single legal mutation',
      '`replan_phase`',
      '`parent_plan_hash`',
      '`child_plan_hash`',
      '`last_cas_result`',
      '`replan_planner_dispatch_required`',
      '`workflow-plan.next.md`',
      '`.cache/replan-planner-attestation.json`',
      '`planner_control_boundary_violation`',
    ],
  },
];

const TOPICS = ['plan-run', 'finalize', 'next'];

module.exports = { REQUIRED_BLOCKS, TOPICS };
