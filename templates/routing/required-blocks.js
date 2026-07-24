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
    block_id: 'pr-planner-wait-budget',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: planner-wait-budget -->',
      "dispatch card's frozen `wait_budget_minutes` value and source are authoritative",
      '`planner_override` may extend but never shorten',
      'must not interrupt or re-nudge before that floor expires',
      'complete governed deliverable',
      '`optimize_budget`',
    ],
  },
  {
    block_id: 'pr-frontier-unit',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['<!-- PIN: frontier unit -->', 'frontier unit'],
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
    content_tokens: ['<!-- PIN: gate-instrumentation-provisioning -->'],
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
      '→ running {node_id} · {role} inline (…reason token…)',
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
    block_id: 'pr-codex-dispatch',
    topic: 'plan-run',
    runtime_tag: 'codex-live',
    surface_type_tag: 'skill',
    content_tokens: [
      '<!-- PIN: codex-dispatch -->',
      'on EVERY role dispatch',
      'the unconditional mandate applies identically to this dispatch mode',
      'fork_turns: "none"',
      'dispatch.codex_profile_mode',
      'Omit both `model`',
      'codex_tier_unresolved',
      'current parent session',
      'Codex 0.144 durable-result override',
      'dispatch.evidence_file',
      'record-evidence',
      '--verify --json',
      'delegation_outcome: returned_partial',
      'transport_error: encrypted_return',
      'direct `agents` namespace',
      'never dispatch through `functions.exec` or Code Mode',
      'codex_v2_encrypted_transport_unsafe',
      'codex_v2_role_transport_unsafe',
      'agents.spawn_agent',
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
      'NEVER interrupted before its wait budget expires',
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
    block_id: 'nx-codex-dispatch-mode',
    topic: 'next',
    runtime_tag: 'codex-live',
    surface_type_tag: 'skill',
    content_tokens: [
      '--codex-dispatch-mode',
      'direct `agents.spawn_agent` tool',
      'never dispatch through `functions.exec` or Code Mode',
      'codex_v2_encrypted_transport_unsafe',
      'codex_v2_role_transport_unsafe',
      'agents.spawn_agent',
      'task_name: "issue_scout"',
      'agent_type: "issue-scout"',
      'fork_turns: "none"',
      'isolated, self-contained control-plane brief',
      'argument-shape refusal',
      'exactly once',
    ],
  },
  {
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
      'issue-scout',
      'Skip this entire step when `KAOLA_PATH=adaptive`',
      'path_not_installed',
      // #646: the governed issue-scout model placeholder — command-only (install.sh
      // renders {X_MODEL} placeholders in COMMANDS; no SKILL.md may carry one), so it
      // rides this claude-live/command block, not the both/both blocks above.
      'model="{ISSUE_SCOUT_MODEL}"',
      'isolated, self-contained control-plane brief',
      'argument-shape refusal',
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
