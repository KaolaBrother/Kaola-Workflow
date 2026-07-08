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
    content_tokens: ['<!-- PIN: gate-instrumentation-provisioning -->', 'KAOLA_GATE_WINDOW_FENCE=0'],
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
      '→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model|default}, effort {effort|inherit})',
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
      'on EVERY dispatch, tiered or not',
      'the unconditional mandate applies identically to this dispatch mode',
      'fork_turns: "none"',
      'reasoning_effort: dispatch.codex_reasoning_effort',
      'fresh child-session effort proof',
      'codex_effort_override_unavailable',
      '`model: standard` -> `high`',
      'legacy `model: opus` -> `xhigh` / `model: sonnet` -> `high` aliases resolve identically',
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
    // node-briefs-relay: the step-3 dispatch bullets that carry a node's
    // authored brief (`goal_line`) verbatim into the role dispatch and
    // instruct the role to read+echo each `upstream_evidence` file's nonce.
    // Raw skeleton text (no SLOT/SPLICE divergence), so it obligates all six
    // surfaces identically.
    block_id: 'pr-node-briefs-relay',
    topic: 'plan-run',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: node-briefs-relay -->',
      'carry it VERBATIM into the role dispatch',
      'record a column-0 `upstream_read: <node-id> <nonce>` line',
      'never from the card — the card never carries it',
    ],
  },

  // ==== finalize (basename kaola-workflow-finalize on both surface types) ====
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
    block_id: 'fn-fast-compliance-backstop',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['<!-- PIN: fast-compliance-backstop -->', 'fast_compliance_unresolved'],
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
    block_id: 'nx-codex-dispatch-mode',
    topic: 'next',
    runtime_tag: 'codex-live',
    surface_type_tag: 'skill',
    content_tokens: ['--codex-dispatch-mode'],
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
    ],
  },
];

const TOPICS = ['plan-run', 'finalize', 'next'];

module.exports = { REQUIRED_BLOCKS, TOPICS };
