# Workflow Plan — issue 606

<!-- plan_hash: d23c11f89fe87a6b3bbcff80fc69d032d45f9b007d1275ed46e6228fe70b87cb -->

## Meta
speculative_open_policy: auto
labels: enhancement, area:scripts, area:workflow-phases
validation_command: npm test

## Plan Notes

**Goal (606).** Mirror the settled Codex dispatch-posture pattern for the Claude runtime's
agent-teams capability, as PROMPT-HARDENING + REPORT-ONLY DETECTION only — no script, gate,
barrier, or scheduler ever reads the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag for a decision.
Three arms:
1. **Report-only detection** — derive `claude_dispatch_posture: teams | classic` (env-var probe
   `$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` first, settings `env`-block fallback), report it in
   `install.sh`'s Claude-edition post-install output and in the `workflow-init` config-audit
   COMMAND surfaces. Non-fatal; NEVER writes user-owned config; remediation LEADS with the
   always-available classic path and qualifies agent teams as experimental + flag-gated.
2. **Teammate-mode dispatch subsection** on the six plan-run routing surfaces (named spawns =
   node id, mailbox returns, `SendMessage` for the existing bounded repair nudges, sync-spawn
   exception, and the REQUIRED one-nudge idle-race discipline), alongside the UNCHANGED classic
   instructions; announcement / evidence / close-echo / gate-non-delegability contracts stay
   explicitly transport-independent.
3. **Machine guards** — contract-validator needles per surface + a route-reachability 6-surface
   pin for the teammate sentinel; PROVENANCE_BAN stays clean.

The sequencing precondition is satisfied: #602/#603/#604/#605 are already in `[Unreleased]`, so the
plan-run surfaces carry the announcement contract and the summary dispatch-card prose this builds
on. The teammate subsection references those shipped contracts; it does not re-author them.

### DAG shape / scheduling rationale

- **Opening 3-wide antichain (n1-detect ∥ n2-prose ∥ n3-docs).** All three are pairwise
  EXACT-PATH disjoint (n1: `install.sh` + `scripts/test-install-model-rendering.js`; n2: the prose
  surfaces + 5 validators + route-reachability under `commands/`/`plugins/`/`scripts/`; n3:
  `docs/decisions/D-606-01.md`), so I add NO dependency edge between them and let the validator
  derive `parallel_safe` (I never hand-annotate it). They co-open in isolated legs by default; a
  host without leg capability serial-degrades (still correct). n2 is the critical path; n1 and n3
  overlap it for free.
- **Why n1-detect is its own node.** The install-time posture derivation is a genuinely
  independent KIND of work (a small bash/detection helper with unit-testable env cases) that is
  file-disjoint from every prose/validator surface. It gets a real failing-test-first cycle: the
  install-model-rendering test asserts the reported posture for env-set / env-unset /
  settings-fallback, RED before the `install.sh` helper exists, GREEN after. `tdd-guide`.
- **Why n2 combines ALL prose with ALL validator needles (one node, no split).** The teammate
  subsection is a SINGLE semantic change spanning six editions (the #309 "one semantic change
  mirrored verbatim modulo forge nouns" invariant — keep it in ONE node so the six surfaces cannot
  diverge). The config-audit posture is a second cross-edition prose change. Their contract needles
  CANNOT be split by arm: four of the five validators are shared across BOTH arms — e.g.
  `scripts/validate-workflow-contracts.js` pins `commands/kaola-workflow-plan-run.md` (arm 2) AND
  `commands/workflow-init.md` (arm 1), and the gitlab/gitea validators pin both their plan-run and
  their workflow-init surfaces. Splitting the prose arms would force the shared validator files to
  overlap two concurrent writers (not disjoint) — so prose + needles live together in ONE node.
  There is no file-count ceiling; splitting a coherent cross-edition set only to lower a count is
  exactly what the grammar forbids. `implementer` (agent-facing prose + markup + mechanical
  propagation needles; no behavioral unit under test).
- **n4-review (`code-reviewer`, opus) post-dominates every code-producing node on every path to
  the sink (G1).** n5-finalize depends only on n4; n4 depends on n1, n2, n3. opus because the
  review is reasoning-bound: cross-edition prose consistency across the prose surfaces,
  forge-neutrality in the plugin trees, PROVENANCE_BAN cleanliness, the exact idle-race one-nudge
  wording, AND the two load-bearing negatives (report-only boundary: detection never writes user
  config; zero behavior change: no script/gate/barrier reads the flag). n4 runs `validation_command`
  (the four chains) as the falsifiable proof.
- **No adversarial-verifier, no security-reviewer, no main-session-gate.** This is prose-hardening
  + a report-only detector; the four contract chains + the install test + the opus reviewer ARE the
  external oracle (same cheapest-sufficient shape as issue-578). No sensitive label (enhancement,
  area:scripts, area:workflow-phases) → no G2. Every acceptance check (chains, install test) is
  delegable → no main-session-gate. No `knowledge-lookup` — every fact (the flag name, the settings
  fallback, the six-surface set) is confirmable locally + is already stated in the ratified design.

### Write-set completeness (the recurring-overflow checklist, walked)

- **#301 workflow-init byte-pair sync-group — DECLARED, not written.** Each workflow-init COMMAND is
  byte-paired with its `kaola-workflow-init` SKILL template (they share a byte-identical CLAUDE.md
  template block), so the freeze wall requires the SKILL peer in the SAME node whenever the command
  is declared — even though the config-audit posture line lands OUTSIDE the template block. The
  three SKILL packs (`plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/
  kaola-workflow-init/SKILL.md`) are therefore DECLARED in n2 but NOT modified: because the posture
  line goes outside the template block, the SKILL templates stay byte-identical to their commands,
  the SKILL packs keep reporting the Codex posture untouched, and the per-node barrier attributes
  zero writes to them (over-declaration of an existing file is allowed).
- **Byte-identical SYNC-GROUP pair (validator).** `scripts/validate-workflow-contracts.js` and
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are byte-identical (enforced by
  `validate-script-sync.js`); a needle added to one MUST be added byte-identically to the other.
  BOTH are in n2. It is NOT a GENERATED_AGGREGATOR (not in `edition-sync.js`'s list), so there is
  no `generated_port_split` obligation and no forge-renamed port of it.
- **All five contract validators** are in n2: the byte pair above, the codex github
  `scripts/validate-kaola-workflow-contracts.js` (pins the github SKILL teammate sentinel), and the
  two forge ports `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
  and `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` (each pins
  its edition's plan-run command + SKILL + workflow-init command).
- **Route-reachability** `scripts/test-route-reachability.js` is in n2: the teammate subsection is a
  six-plan-run-surface change, so it gets a T5-style all-six-surface pin (any surface missing the
  sentinel reds the claude chain).
- **The install test** `scripts/test-install-model-rendering.js` is in n1 (the RED/GREEN oracle for
  the posture report; it also asserts the detection NEVER mutates the settings file — the
  report-only boundary made mechanical).
- **`.cache` receipts** are recorded parent-side and barrier-exempt; none are declared.

### Placement / forge-neutrality / provenance discipline (implementer must obey)

- The config-audit posture line goes OUTSIDE the `KW-CLAUDE-TEMPLATE-BEGIN/END` block (in the
  Codex-hooks-note region of each workflow-init COMMAND), so it never perturbs the cross-forge
  CLAUDE.md-template byte-parity check. It is WRITTEN into the THREE workflow-init COMMAND surfaces
  ONLY; the three `kaola-workflow-init` SKILL packs stay byte-unchanged (see the sync-group clause
  above).
- The Claude posture line is a forge-neutral, Claude-runtime concept — write it identically across
  the three command surfaces. The teammate subsection likewise goes on ALL SIX plan-run surfaces
  (commands + SKILL packs), qualified by runtime + flag, mirrored verbatim modulo nothing.
  `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and `SendMessage` are runtime tokens, NOT forge-CLI tokens
  — they do not violate the plugin forge-neutrality rule (no `gh`/`glab`, no forge brand).
- PROVENANCE_BAN: NO issue refs (`#606`), decision IDs (`D-606-01`), or invariant tags in ANY
  prompt surface. State the rule, not its origin. Provenance lives in CHANGELOG / the decision
  record / commit messages only.

### Canonical spec for the teammate subsection (all six surfaces converge on this)

Placed in the Dispatch step next to the announcement contract, as a subsection qualified by
runtime + flag:
- **When agent teams is enabled (Claude runtime, flag on):** spawn each node's role agent as a
  NAMED teammate, name = node id, so the announcement lines and mailbox traffic are
  self-documenting; expect spawns to return immediately and results to arrive as teammate messages;
  use `SendMessage` for the bounded repair nudges the surfaces already define (the K=2 out-of-lane
  nudge, mid-run write-set-widening addressed to the SAME agent) instead of re-dispatching fresh
  agents; use a synchronous spawn only when a blocking result is genuinely required before the next
  decision.
- **Idle-race discipline (required wording):** an idle notification is not a deliverable and
  carries no ordering guarantee relative to the agent's final message; on idle-without-deliverable
  send EXACTLY ONE request for the deliverable, then wait — a second ask before the first answer
  produces duplicate deliveries.
- **When classic (flag off / other runtimes):** the existing synchronous dispatch flow, verbatim,
  stays the documented default path.
- All existing contracts — evidence-persistence per role-kind, the announcement formats, the
  close-echo line, gate non-delegability — hold IDENTICALLY in both modes; teammate mode changes
  the transport, never the contract.

### Decision record

`docs/decisions/D-606-01.md` is the next free number (no `D-606-*` record exists). It records the
Claude dispatch-posture convention: report-only detection (env-var probe → settings fallback),
the settled boundary that user-owned config is reported on but NEVER written, that the teammate
subsection is a transport upgrade for the existing running-set choreography (not a new lane or
grammar), and that no script/gate/barrier reads the flag (zero behavior change; classic-only runs
with no degradation). No `docs/conventions.md` / `docs/architecture.md` edit — kept surgical to the
issue's stated surfaces. The decision content is fixed by the ratified design, so n3 authors it in
parallel with the impl; the reviewer confirms it matches the landed implementation.

### Acceptance mapping

- AC1 (install.sh + config-audit report `claude_dispatch_posture`, non-fatal, classic-led
  remediation) → n1 (install.sh report + test) + n2 (three workflow-init COMMAND config-audit
  lines).
- AC2 (six plan-run surfaces carry the teammate subsection alongside unchanged classic
  instructions; contracts transport-independent) → n2.
- AC3 (validators pin the new prose per surface; removal reds the corresponding chain;
  PROVENANCE_BAN clean) → n2 (5 validators + route-reachability), verified by n4.
- AC4 (zero behavior change; classic-only session no degradation) → enforced by the non-goal
  (no flag read in any script) and verified by n4 + the green four chains.
- AC5 (#307 four chains green, run sequentially) → n4 runs `validation_command` (`npm test`).
  Note: on this box `test-adaptive-node.js` (in the claude chain) can SIGKILL the octopus merge
  under default run-chains concurrency — the executor should set
  `KAOLA_RUN_CHAINS_CONCURRENCY=serial` when running the chains.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-detect | tdd-guide | — | install.sh, scripts/test-install-model-rendering.js | 2 | sequence | sonnet | — |
| n2-prose | implementer | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js | 18 | sequence | sonnet | cross-edition agent-facing prose hardening (teammate subsection ×6 plan-run surfaces + config-audit posture ×3 command surfaces) plus mechanical contract-validator/route-reachability propagation needles; no behavioral unit under test — the validators are propagation guards authored within this node, not a failing-unit-test-first cycle. The three kaola-workflow-init SKILL packs are declared for the #301 byte-pair wall but left byte-unchanged |
| n3-docs | doc-updater | — | docs/decisions/D-606-01.md | 1 | sequence | sonnet | — |
| n4-review | code-reviewer | n1-detect, n2-prose, n3-docs | — | 1 | sequence | opus | — |
| n5-finalize | finalize | n4-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-detect | complete |
| n2-prose | complete |
| n3-docs | complete |
| n4-review | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater (n3-docs) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-detect) | subagent-invoked | deferred_to_group | |
| implementer (n2-prose) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review 98d97d23e50c | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 724a04f7881e | |
