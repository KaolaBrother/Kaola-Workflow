'use strict';

// required-blocks.js — the single-source required-block MANIFEST for the six
// routing surfaces per topic (3 Claude commands + 3 Codex SKILLs).
//
// Layer 1 of the routing-surface generation seam: each required block is
// DECLARED ONCE here, and a derived-universe presence checker
// (scripts/test-route-reachability.js :: checkManifest) computes the exact set
// of surfaces every block obligates from topic + tags — never a hand-typed
// file list — so obligating 4-of-6 surfaces by omission is structurally
// impossible.
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
// (<!-- PIN: … -->); the reverse orphan-sentinel matches surface markers back
// to these first tokens. A token that is a bare SUBSTRING of its own marker is
// vacuous against a marker-preserving interior gut — pin the actual rule.

const REQUIRED_BLOCKS = [
  // ==== consent: the whole mechanism, on every surface of all three topics ===
  //
  // The durable consent valve does not exist. What stands in its place is this
  // paragraph, so its presence is not a stylistic preference — deleting it
  // deletes the mechanism, with nothing left to notice. Tokens are interior
  // prose, never substrings of the marker, so a marker-preserving gut still
  // reds.
  {
    block_id: 'nx-consent-in-conversation',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: consent-in-conversation -->',
      'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.',
    ],
  },
  {
    block_id: 'in-consent-in-conversation',
    topic: 'init',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: consent-in-conversation -->',
      'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.',
    ],
  },
  {
    // The consumer's CLAUDE.md is the one artifact loaded in EVERY session of
    // the repo the workflow was installed into; the next surface loads only
    // when the command is invoked, and its text is not addressable from a
    // consumer repo at all — it lives in the installed command/skill tree, not
    // in the repo. So the format is RESTATED here rather than pointed at.
    //
    // The restatement is a strict SUBSET of the next skeleton's wording: the
    // four format bullets of the KW-CLAUDE-TEMPLATE region are built only from
    // whole sentences of `next.skeleton.md`, in that skeleton's own order,
    // shortened by omission and never rephrased. Nothing checks that
    // mechanically — it is the rule for editing this pair. Reword the next
    // skeleton and re-excerpt from it; writing a second wording here is how the
    // two silently drift apart, and a pointer of any kind is the defect this
    // block exists to prevent.
    block_id: 'in-mission-list',
    topic: 'init',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'kaola-workflow/{project}/mission-list.md',
      'Three write moments',
      '**before the work goes out**',
      'where the output was to land',
      'the list minus done minus in-flight',
      'mission, not a specification',
    ],
  },
  {
    block_id: 'fn-consent-in-conversation',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: consent-in-conversation -->',
      'Irreversible and value-laden calls belong to the user — ask, in conversation, before taking one.',
    ],
  },

  // ==== next (ASYMMETRIC: command basename workflow-next, skill basename
  //      kaola-workflow-next) ====
  {
    // The mission list is the run's only coordination record, and the three
    // write moments are the only discipline that keeps it true. `dispatched`
    // written AFTER the work goes out is the exact failure the file exists to
    // prevent, so that ordering is pinned as text rather than left to survive
    // by habit. The FORMAT ITSELF is carried on these surfaces rather than
    // pointed at: a reader of an installed command is in a consumer repo, where
    // no path into this repository's docs resolves. The two order/absence facts
    // are pinned individually because they live nowhere else on a shipped
    // surface, and an unpinned fact is one edit from gone.
    //
    // THE FIELD TABLE IS PINNED BY THE ROW, not by its words. The table is the
    // format's normative definition — it is the only place on a shipped surface
    // that binds each field NAME to its content AND to the write moment it is
    // written at, so the whole table could have been deleted with every token
    // above still present. Each row is one field's complete definition, so the
    // row is the unit.
    //
    // WHY THE ROW AND NOT THE CLAUSE: `**where the output was to land**` also
    // appears in write moment 2 further down the surface. A bare-clause token
    // would therefore stay green while the locator was stripped from the
    // `dispatched` ROW — green for a reason unrelated to the property it names.
    // The row token is what makes the locator undeletable where it is bound to
    // the field.
    //
    // NOT PINNED: the header and delimiter rows. Losing them breaks the table's
    // rendering, which a reader sees immediately, and costs no rule — the rows
    // below carry the format.
    block_id: 'nx-mission-list',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'mission-list.md',
      'status: todo',
      'in-flight',
      'nothing depends on a stable ID',
      'absent fields are simply absent',
      'before the work goes',
      'dispatched: self',
      'mission, not a specification',
      '| `item` | the mission — one line of prose, hints and facts | at creation |',
      '| `status` | `todo` \\| `in-flight` \\| `done` | on change |',
      '| `dispatched` | what went out and to whom, and **where the output was to land** | at dispatch |',
      '| `result` | where the outcome landed — a path, or a few lines inline | at close |',
    ],
  },
  {
    // Resume is the property the whole design was sized to. `dispatched`
    // records what went out, not whether it is alive, so the recovery rule is
    // to check the LOCATOR rather than probe the worker.
    block_id: 'nx-resume-rule',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'Look for the work, not for the worker.',
      'if the output the dispatch promised has landed',
      're-dispatch, unless you can positively show',
    ],
  },
  {
    // Concurrency carries no machinery. This is a SUBTRACTION made durable:
    // the grant is the only thing standing between these surfaces and a
    // re-introduced proof obligation, so its wording is obligated on all six
    // rather than left to survive by habit.
    block_id: 'nx-concurrency-is-judgment',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'Nothing inspects that decision: no disjointness proof, no evidence line, no cap, no approval',
      'Subagents and worktrees are tools, offered and declinable',
    ],
  },
  {
    // The claim survives, and it is bookkeeping: it records the issue, the
    // branch and the worktree, and it answers rather than judging.
    block_id: 'nx-claim-is-bookkeeping',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'The claim is bookkeeping',
      'workflow-state.md',
      '--target-issue',
      '--target-issues',
      'reports a fact about the target rather than a verdict',
    ],
  },

  // ==== finalize (basename kaola-workflow-finalize on both surface types) ====
  {
    // The chain receipt is MEASURED, not enforced, and the finding has to land
    // durably or the conversion is a deletion. Both destinations are pinned:
    // the envelope field and the summary heading.
    block_id: 'fn-validation-report',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '**measures** the receipt and **reports** what it found',
      'It does not refuse',
      'under `validation`',
      '## Validation',
      'finalization-summary.md',
      'chain-receipt.json',
      'final-validation.md',
    ],
  },
  {
    // The attribution sweep became a report. Same rule: the measurement has a
    // durable destination and is compared to nothing.
    block_id: 'fn-changed-paths-report',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '`changed_paths`',
      '## Changed Paths',
      'Nothing compares that list against a',
    ],
  },
  {
    // R3's replacement, and the reason the refusal could go: the sink reports,
    // and the orchestrator is accountable for the branch ending up right. All
    // three resolutions are named, because "merge anyway and report" is the
    // misreading this block exists to prevent.
    block_id: 'fn-sink-reports-orchestrator-owns',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: sink-reports-orchestrator-owns -->',
      // The sink DOES still stop — four operational refusals survive, and a converted finding stops
      // without merging. What it no longer does is judge the work. The old token asserted a
      // categorical "does not refuse" that the code never implemented; these two pin the two halves
      // of the true contract instead, so a relapse in either direction is caught.
      'does not judge your work',
      'stops without merging',
      'This is not "merge anyway and report."',
      'get the merge correct',
      'resynchronize',
      'request instead',
      'clean up after the sink',
      'who is accountable for the branch ending up right',
    ],
  },
  {
    // The one hard stop left in the phase, and the reason it is not a gate: an
    // operation refusing to destroy data is not a workflow judging work.
    block_id: 'fn-archive-loses-nothing',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'fails loudly if it would lose a file',
      'not a workflow judging your work',
      'kaola-workflow/archive/',
    ],
  },
  {
    block_id: 'fn-closure-audit',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    // The bare words 'closure audit' would be a SUBSTRING of the marker itself
    // and therefore vacuous against a marker-preserving interior gut. The two
    // interior sentences below are what this block actually enforces: the sweep
    // exists, and an incomplete sink resumes at the step it named.
    content_tokens: [
      '<!-- PIN: closure-audit -->',
      'after-the-fact drift detector',
      'If the sink reported that it did not complete, the step it names is where to resume',
    ],
  },
  {
    block_id: 'fn-bundle-closure',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: ['--issue-numbers', 'issue_numbers'],
  },
];

const TOPICS = ['next', 'init', 'finalize'];

module.exports = { REQUIRED_BLOCKS, TOPICS };
