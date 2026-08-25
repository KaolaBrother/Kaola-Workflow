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
    block_id: 'nx-main-authored-handoff',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: main-authored-handoff -->',
      'Before each named-role spawn, main writes a compact task-specific brief',
      'Use these labels in this order:',
      'Keep the packet sparse: include only task-specific facts, decisions, bounds, and evidence; do not',
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
  {
    block_id: 'fn-main-authored-handoff',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: main-authored-handoff -->',
      'Before each named-role spawn, main writes a compact task-specific brief',
      'Use these labels in this order:',
      'Keep the packet sparse: include only task-specific facts, decisions, bounds, and evidence; do not',
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
  {
    // The axiom layer is reached from a `next` surface by a POINTER — a short
    // paragraph naming the axioms and where they live — never by carrying the
    // block, which is embedded in the workflow-init CLAUDE.md template instead.
    // The pointer is the only thing on a shipped `next` surface that tells a
    // reader in a consumer repo that a tie-breaking order exists at all, and
    // where to read it; deleting it costs the whole layer at dispatch time and
    // leaves nothing behind to notice.
    //
    // This block was declared once, deleted with the routing-surface
    // extraction, and its absence went unseen because all twelve surfaces kept
    // carrying the pointer anyway. Nothing else watches it: the paragraph sits
    // in the shared skeleton body, so no PIN marker delimits it and the reverse
    // orphan-sentinel has nothing to key on — which is also why this block is
    // CONTENT-LED rather than marker-led. Adding a marker would mean editing the
    // skeleton; the prose is distinctive enough without one.
    //
    // ONE TOKEN PER OBLIGATION, each a short span, so a rewrap or a reworded
    // connective survives and a deleted RULE does not:
    //   - subordination: axioms break ties, they never outrank a shipped rule.
    //     This is the surface's only remaining carrier of that boundary.
    //   - the referent is a NAMED block, not a gesture at "the axioms".
    //   - where that block is, in a form that resolves from a consumer repo —
    //     the part that rots silently, because a pointer that no longer points
    //     still reads fine.
    //   - the axioms are an ORDER; without that they are a list.
    //   - recording the derivation is optional. A pointer that made it a proof
    //     obligation would be a new gate wearing a pointer's name.
    // Each of the five is absent from a `next` surface once the paragraph is
    // removed and appears exactly once while it is there — measured on all
    // twelve — so none is satisfied from elsewhere on the surface.
    block_id: 'nx-first-principles',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'When nothing already settles a situation',
      '`## First Principles` block',
      'workflow-init `CLAUDE.md`',
      'applied in priority order',
      'useful and never required',
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
    // The third measurement, same rule as the other two: a durable destination,
    // compared to nothing. The token is the SENTENCE, not the bare heading —
    // `## Mission List` alone is satisfied by either of its two occurrences on
    // the surface, so it survives losing one of them. This pins the rule that
    // makes all three sections script-owned, which is the thing a surface must
    // not quietly drop.
    block_id: 'fn-mission-list-report',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '`## Validation`, `## Changed Paths` and `## Mission List` are where the finalize transaction\'s own findings land',
    ],
  },
  {
    // The grammar the gap scanner actually parses, stated where the section is
    // written. Four independently-deletable obligations, one token each: a
    // heading carrying a qualifier reads as section-absent, the two bullet forms
    // are the only rows read, and prose or a markdown-table row is not a gap
    // however plainly its issue number sits in the text. Each row token carries
    // its `- <reasonClass> (<sample>):` head, so dropping the head alone reds.
    block_id: 'fn-run-gaps-grammar',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'Write the heading exactly `## Run gaps`, with nothing else on the line',
      '`- <reasonClass> (<sample>): filed: #N` — gap tracked by an open issue.',
      '`- <reasonClass> (<sample>): noise: <one-line justification>` — gap justified as not worth tracking.',
      'a line that is not a bullet in one of those two forms — prose, or a row of a markdown table — is not read as a gap',
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

  // ==== forge-is-the-backlog: one marker, three topics ====
  //
  // "The forge's open list is the backlog truth" (docs/workflow-state-contract.md /
  // this repo's own CLAUDE.md) has no other durable carrier on a shipped surface: a
  // reader in a consumer repo cannot resolve either doc, so the rule is restated on
  // each topic that touches backlog selection, the priority-tier sorter, or the
  // gap-sweep filing/correction step. Same shape as consent-in-conversation — one
  // marker text legitimately repeated across topics, so the REVERSE orphan-sentinel
  // cannot key it to a single block and the marker is declared foreign in
  // scripts/test-route-reachability.js; the FORWARD presence obligation below is
  // what actually enforces each topic's wording.
  {
    // Two independent spans on this one topic: Step 1's "user named neither" bullet
    // (which sources rank the backlog from — the tier-sorted `list-open`, `_rules.md`,
    // active folders, archived summaries) and Step 2's pre-claim shortlist-read
    // paragraph (comment beats body). Tokens are drawn from both, so gutting either
    // span alone — while leaving the other and the marker intact — still reds this
    // block.
    block_id: 'nx-forge-is-the-backlog',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: forge-is-the-backlog -->',
      'the open issue list ordered by its `P0`–`P3` priority tier (`list-open`, below)',
      'Rank by that priority tier, then by scope.',
      'read each shortlisted candidate\'s own body and comments',
      'Comments are current state: where a comment contradicts the body, the comment wins',
    ],
  },
  {
    // Three independent spans inside the injected `## Kaola-Workflow` block this
    // topic writes into a consumer's CLAUDE.md: the `_rules.md`-survives bullet,
    // the roadmap-session-vs-workflow-run split, and the top-priority-labels
    // override. One token per span (plus one extra in the first), so any single
    // span gutted alone — marker and the other two spans intact — still reds.
    block_id: 'in-forge-is-the-backlog',
    topic: 'init',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: forge-is-the-backlog -->',
      'is the one optional local file that survives',
      'nothing else is generated or tracked under',
      'there is no local mirror to refresh',
      'Top-priority labels: declare in `kaola-workflow/config.json` (`priority_top_tier_labels`)',
    ],
  },
  {
    // One span at Step 7, carrying five independent rules: what to file, that what
    // is filed carries a priority tier, how the filed body is typed, that the filing
    // was verified to have landed, and what to do when the run's own findings correct
    // the issue it is closing. The correction rule is what makes "the forge is the
    // backlog truth" survive contact with a run that finds the filed issue was wrong,
    // rather than closing quietly over stale text; the typed-body and verification
    // rules are what keep the thing it files from being unreadable to the next run,
    // or from not existing at all; the tier rule is what keeps it findable, since
    // filing and TIERING are separate duties and the step long mandated only the
    // first — a run that obeyed it exactly produced an untiered issue, which
    // `listOpenIssues` gives tier 99 and sorts LAST, beneath every tiered one.
    // Nothing else on a shipped surface tells a finalize reader that: the sorter's
    // own rule is carried on the NEXT topic, not on the surface doing the filing.
    //
    // Tokens are drawn from every one of the five rules, one per obligation rather
    // than one per paragraph, so gutting a single obligation — the tier duty, its
    // measured consequence, the stamping duty, the reading-derived-cause default,
    // the non-binding remedy label, the duplicate probe, the existence-and-body
    // check, or where that check is recorded — reds this block even with the marker
    // and the other obligations intact. None is a substring of the marker.
    //
    // THE TIER RULE TAKES TWO TOKENS, because it is two obligations. The duty is one;
    // the consequence is the other, and it is pinned separately because it is the
    // part that was MEASURED and the part easy to re-word wrong: an untiered issue is
    // listed and sorts LAST — not hidden, not dropped, not invisible to the sorter. A
    // pin holding only the duty stays green while the reason decays back into that
    // wrong wording, which is exactly what makes a reader treat the label as cosmetic.
    //
    // NOT pinned, deliberately: the scope-limiting close of the typed-body rule
    // ("This adds no measurement obligation…") states what the rule does NOT demand,
    // the negative restatement of the stamping duty ("an unstamped number does not
    // belong in that section") re-expresses an obligation already pinned below, and
    // the tier rule's closing stakes ("so an urgent defect filed untiered ranks below
    // a backlog one") restate its consequence. Pinning any would freeze wording that
    // carries no obligation of its own.
    block_id: 'fn-forge-is-the-backlog',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: forge-is-the-backlog -->',
      'For each real run-discovered defect, file a follow-up and record `filed: #N`.',
      // The tier duty and its measured consequence, in surface order.
      'Give it a priority tier in the same breath',
      'an issue filed without a `P0`–`P3` label sorts **last** on the open list, beneath every tiered issue',
      'append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the scanner, so what is written was actually swept.',
      'post that correction as a comment on the issue before it closes.',
      'Never close quietly against text now known to be wrong.',
      'A correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned out to be, and it lands on the issue it corrects.',
      // The typed body: the section that carries only observation, the stamping duty
      // that makes it observation, the section unconfirmed attributions default into,
      // the label the optional remedy must wear, and the duplicate probe.
      '`## Measured` carries only what this run observed',
      'every figure there names the commit it was measured at and the command or artifact it came from',
      '`## Hypothesis` carries attributions no run has confirmed; a cause derived by reading code lands there by default',
      '`## Proposed remedy (non-binding)` is optional and carries that label when it appears.',
      'Add one `searched:` line recording the duplicate probe you actually ran — its query and its hit count',
      // The filing verification: the check itself, and the record it lands in. The
      // second is not decoration — routing it to the `## Run gaps` row instead would
      // put free text through a strict parser-owned grammar the scanner owns.
      'confirm the issue exists and its body is non-empty, and record the issue number and the body length you saw in this run\'s own record',
      'That record is the mission list\'s result line, never the `## Run gaps` row',
    ],
  },

  // ==== backlog-migration: the reconcile pass, init only ====
  //
  // The retired backlog layer is the one thing init can find in a consumer repo that
  // it must NOT simply scaffold around, and the section is the only carrier of that
  // fact on any shipped surface — a consumer reading this command cannot resolve the
  // decision record it comes from. Losing the section silently would leave init
  // walking past a layer that no longer works and saying nothing.
  //
  // Tokens are drawn from four independent spans — the never-automatic framing, the
  // forced ordering's first step, the halfway rule, and the declining-is-an-answer
  // close — so gutting any one of them while leaving the marker and the other three
  // reds this block. None is a substring of the marker.
  {
    block_id: 'in-backlog-migration',
    topic: 'init',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: backlog-migration -->',
      'Init never deletes it, and installing or upgrading never migrates it.',
      '**Tier first.** Priority labels exist and carry each open issue\'s tier *before* anything is deleted.',
      'Never `git rm --cached`, and never delete from disk alone.',
      'The dangerous state is not *un*-migrated — a tracked, frozen layer is inert and harmless — it is *half*-migrated.',
      '**Declining is a complete answer.**',
    ],
  },
];

const TOPICS = ['next', 'init', 'finalize'];

module.exports = { REQUIRED_BLOCKS, TOPICS };
