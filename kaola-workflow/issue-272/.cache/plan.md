# Implementation Blueprint — issue #272 (plan node evidence)

Make `/kaola-workflow-plan-run` the SOLE owner of the adaptive node lifecycle (incl. the FIRST node);
replace the contractor orient/open/commit+advance prose brackets with TYPED SCRIPT TRANSACTIONS in a
NEW pure-composition script `kaola-workflow-adaptive-node.js`; `/kaola-workflow-adapt` stops dispatching
the first node (routes straight to plan-run after a frozen-ready handoff).

## 0. Recursion-safety invariant (binding for ALL nodes)
NO node's write set touches these five (the orchestrator's live engine, re-invoked every node):
next-action.js, commit-node.js, plan-validator.js, adaptive-schema.js, resolve-agent-model.js.
`adaptive-node.js` is PURE COMPOSITION: child_process-shell + read-only require() of those interfaces;
it NEVER import-and-mutates them. Editing handoff.js is safe (already ran; not re-invoked during plan-run).

## adaptive-node.js contract (NEW; impl-core) — all subcommands: --project P, --json, exit≠0 on refuse
Mirror conventions of commit-node.js / adaptive-handoff.js (hand-rolled, 'use strict', module.exports,
`if (require.main===module) main()`). getRoot() copied from handoff.js. Sibling constants on own lines
(forge one-line-rename pattern): COMMIT_NODE='kaola-workflow-commit-node.js', NEXT_ACTION=..., VALIDATOR=...
shellNode(scriptPath,args) → {exitCode,...json} fail-closed (copy handoff shellHandoff non-git branch).
MOVE spliceLedgerNode INTO this file from handoff.js (handoff drops it). Generalize it:
`spliceLedgerNode(content,id,newStatus,{allowFrom=['pending']})` — flip a ledger status cell only when
current ∈ allowFrom; idempotent; never touch out-of-allowFrom. close path passes allowFrom:['in_progress'].
Self-contained ledger + state + compliance-section writers (do NOT add helpers to adaptive-schema.js).
Crash-safe write order ALWAYS: .cache evidence → ## Node Ledger row → workflow-state.md pointer LAST.

- `orient --project P` (READ-ONLY): shell validator --resume-check + next-action --json; scan markers
  (escalated_to_full in state; consent_halt:pending in ledger; in_progress node + its .cache state
  absent/partial/complete; allDone). Emit typed resume_state for the orchestrator to JUDGE. Never mutates.
- `open-next --project P [--node-id N]` (MUTATES ledger+baseline): next-action; if allDone→{allDone:true}.
  Pick nextNode (or validate N∈readySet else refuse). spliceLedgerNode(...,'in_progress'). Shell
  `commit-node <plan> --node-id N --start --json` (idempotent baseline). Emit {opened:{id,role,model,...}}.
  REPLACES handoff step6 AND plan-run step-1 advance — first node opened here, uniformly.
- `record-evidence --project P --node-id N --stdin` (MUTATES .cache): read stdin, write verbatim to
  .cache/{N}.md (mkdir -p). Fixes #264 chat-only brittleness. Emit {wrote,bytes}.
- `close-and-open-next --project P --node-id N`: port plan-run.md step3 (a-e), order a→b→c→e→d:
  (a) evidence-shape PRESENCE check by role (resolve role via parseNodes): tdd-guide needs BOTH tokens
      `RED` AND `GREEN` (or explicit n/a reason); implementer needs `non_tdd_reason` AND a change-type
      token (one of regression-green / build-green / smoke-integration) (or n/a); other write/gate roles:
      evidence file present (or n/a). Missing → typed refuse {reason:'evidence_missing',expected:[...]},
      NO mutation. (Presence only — NOT sufficiency; orchestrator owns sufficiency.)
  (b) shell `commit-node <plan> --node-id N --json` (per-node barrier; barrier+selector BLOCKING).
  (c) ONLY IF exitCode===0 && result==='ok' && evidence present: flip ledger N→complete (or n/a via
      allowFrom:['in_progress']); emit ONE `## Required Agent Compliance` row — for code-reviewer/
      security-reviewer key by BARE role string, per-instance disambiguation in Evidence column only
      (canonical format delegationPolicyCompliance() expects). Compliance section lives OUTSIDE plan_hash
      region (like ## Node Ledger); create it idempotently below ## Node Ledger if absent.
  (e) SELECTOR ROUTING (BEFORE d): if selectorCheck.isSelector && selectorCheck.ok → for each id in
      selectorCheck.armsToNa write ledger row→n/a note `selected: <selected> (not this arm)`. If ok===false
      → refuse, no advance. isSelector===false → no action.
  (d) FUSED ADVANCE (ONLY IF barrier exit0 & node now terminal): next-action; if next ready node, open it
      (in_progress + commit-node --start). Report {closed:N,opened:{...}|null,allDone}.
  On barrier fail / missing evidence / selector_invalid → typed refuse, NO advance, NO close. test_thrash≥3
  tally + consent escalation DECISION STAY orchestrator-owned (not scripted); adaptive-node only transcribes
  via write-halt.
- `write-halt --project P --node-id N --reason consent|security|test_thrash`: write escalated_to_full:<reason>
  into workflow-state.md + consent_halt:pending into ## Node Ledger (#234). For reason=consent write BOTH
  consent + security markers (matches plan-run.md 255-261). Idempotent. Emit {halt:'written',markers:[...]}.

test-adaptive-node.js (NEW): hand-rolled assert (mirror test-commit-node.js). Export pure cores with
injected shell/readFile/writeFile seams. Cover: spliceLedgerNode all transitions; evidence-shape (tdd RED+GREEN,
impl non_tdd_reason+change-type, n/a); close-and-open-next (barrier0→close+compliance(bare role)+advance;
barrier1→refuse no-advance; selector arms→n/a before advance); open-next (first open, N-not-ready refuse, allDone);
write-halt (both markers, idempotent); record-evidence (stdin→.cache); orient (read-only, asserts no writeFile);
shellNode seam (stub exiting 1 + canned json). package.json: add `&& node scripts/test-adaptive-node.js` to
test:kaola-workflow:claude (next to test-adaptive-handoff.js, #255-consistent).

## impl-handoff: strip first-node-open (4 handoff scripts + 2 tests)
handoff: drop step5 (commit-node --start baseline) + step6 (spliceLedgerNode in_progress); remove COMMIT_NODE
const; MOVE spliceLedgerNode out (to adaptive-node); keep freeze/resume-check/computeNextAction(advisory
first_node)/roadmap/Planning-Evidence. Rename return handoff_status `ready_to_dispatch_first_node`→`ready_to_run`;
checklist drops first_node_opened+baseline_recorded; keep first_node{} advisory. main() exit gate token rename.
Update header doc + write-order comment. Apply SAME to codex copy (BYTE-IDENTICAL) + gitlab/gitea renamed ports
(drop their renamed COMMIT_NODE const). test-adaptive-handoff.js: token rename everywhere; delete first_node_opened
/baseline_recorded asserts; drop commit-node:--start stub. simulate-workflow-walkthrough.js testAdaptiveHandoff*:
token rename; DELETE ledger-in_progress + barrier-base-<node1> existence asserts (handoff no longer opens/baselines);
keep plan_hash freeze + first_node advisory asserts. ADD a testAdaptiveNode* E2E (register in runner list ~7966) that
either shells scripts/test-adaptive-node.js or builds a tmp repo+frozen plan and drives open-next→record-evidence→
close-and-open-next (asserts ledger transitions, barrier-base written by open-next, compliance row, fused advance).

## impl-prose-claude: adapt.md + plan-run.md + codex skill mirrors + workflow-planner.md/.toml
adapt.md: ready_to_run branch drops "dispatch first_node IMMEDIATELY"→route to /kaola-workflow-plan-run; line 239
prose update. plan-run.md: step1 advance→`adaptive-node.js open-next`; step2 dispatch UNCHANGED + note evidence via
`record-evidence --stdin`; step3 bracket→`adaptive-node.js close-and-open-next` (keep the WHAT prose but mark
SCRIPT-ENFORCED); step4 judge STAYS orchestrator + halt via `write-halt`; orient→`adaptive-node.js orient`. codex
SKILL mirrors (adapt+plan-run): same ports via $KAOLA_SCRIPTS. agents/workflow-planner.md + codex
workflow-planner.toml: rewrite the handoff-success section (lines ~127,137,141-171) — handoff no longer opens node1/
records baseline/dispatches first node; returns ready_to_run; checklist drops first_node_opened+baseline_recorded;
orchestrator routes to plan-run (does NOT dispatch first_node).

## impl-prose-forge: gitlab+gitea adapt.md+plan-run.md + 2 workflow-planner.toml
Same edits as claude, with forge script names (kaola-gitlab/gitea-workflow-adaptive-node.js). Read each forge
plan-run.md first (mirrors claude with forge names). Update both forge workflow-planner.toml handoff sections.

## impl-ports: codex copy + 2 forge ports + install.sh + validate-script-sync
cp scripts/kaola-workflow-adaptive-node.js → plugins/kaola-workflow/scripts/ (BYTE-IDENTICAL). gitlab/gitea ports:
copy + rename sibling consts + require() (kaola-gitlab/gitea-workflow-{commit-node,next-action,plan-validator,
resolve-agent-model}). install.sh 3 arrays: add kaola-workflow-adaptive-node.js (github+codex), kaola-gitlab-
workflow-adaptive-node.js, kaola-gitea-workflow-adaptive-node.js — next to each adaptive-handoff entry.
validate-script-sync.js COMMON_SCRIPTS: add 'kaola-workflow-adaptive-node.js' (claude↔codex byte-identical).

## impl-validators: contract validators (claude canonical + codex byte-mirror + codex validator)
validate-workflow-contracts.js: line 543 token→'ready_to_run'; add assertIncludes('install.sh',
'kaola-workflow-adaptive-node.js'/'kaola-gitlab-...'/'kaola-gitea-...') mirroring #255 handoff asserts (511-516);
optional assert exists adaptive-node.js. plugins/kaola-workflow/scripts/validate-workflow-contracts.js: BYTE-IDENTICAL
copy of the canonical (COMMON_SCRIPTS pins it — this is the BLOCKING mirror that was missing). validate-kaola-workflow-
contracts.js (codex, no mirror): line 451 token→'ready_to_run'; add assert exists codex adaptive-node.js.

## impl-docs: ADR0005 + architecture + CLAUDE.md + README
docs/decisions/0005-plan-run-owns-node-lifecycle.md (NEW, Extends:0004, Issue:#272): plan-run sole owner incl first
node; contractor brackets → adaptive-node typed transactions; handoff returns ready_to_run (no node1 open/baseline);
recursion-safety; 5 subcommands + mutation contracts. architecture.md adaptive section: brackets→adaptive-node;
add adaptive-node to the 4-edition/COMMON_SCRIPTS/install.sh sentence. CLAUDE.md Key Scripts: update handoff entry
(drop node1-open, ready_to_run); ADD adaptive-node.js entry. README: drop node1-open from handoff narrative,
ready_to_run, mention adaptive-node.js.

## review (code-reviewer post-dominates all impl) → finalize (CHANGELOG.md + npm test ×4 green + sink + close #272)

## Risks / notes
- npm test is RED between impl-prose-claude (token rename in prose) and impl-validators (repins). Per-node barrier
  (commit-node) is the gate, NOT npm test; npm test only green at review/finalize. Don't treat mid-run red as failure.
- adaptive-node.js claude(impl-core) vs codex copy(impl-ports) are byte-identical but in different nodes; copy EXACT
  bytes; validate-script-sync only runs at npm test (finalize) so intermediate absence is fine.
- forge contract validators do NOT pin the token (verified) — no extra forge-validator node needed.
