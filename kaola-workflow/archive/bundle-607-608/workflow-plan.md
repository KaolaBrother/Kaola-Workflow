# Workflow Plan — bundle-607-608

<!-- plan_hash: b7f3b5b78390233a99c6accf972f5958ba108da283282d5836fc9c38ca3b821b -->

## Meta

goal: Bundle #607 (main-session-gate runtime write fence — three layers) + #608 (run-chains timeout observability + default recalibration). Same-scope bundle; largely-disjoint write sets sharing the four-chain gate.
labels: bug, area:scripts, area:workflow-phases
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-runchains | tdd-guide | — | scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-run-chains.js | 9 | sequence | sonnet |
| n2-gatefence | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, hooks/kaola-workflow-write-lane.sh, plugins/kaola-workflow/hooks/kaola-workflow-write-lane.sh, plugins/kaola-workflow-gitlab/hooks/kaola-workflow-write-lane.sh, plugins/kaola-workflow-gitea/hooks/kaola-workflow-write-lane.sh, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/test-adaptive-node.js | 13 | sequence | opus |
| n3-planner-prose | implementer | — | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js, scripts/test-agent-profile-parity.js | 19 | sequence | sonnet |
| n4-adversary | adversarial-verifier | n2-gatefence | — | 1 | sequence | opus |
| n5-docs | doc-updater | n1-runchains, n2-gatefence, n3-planner-prose | CHANGELOG.md, docs/decisions/D-607-01.md, docs/decisions/D-608-01.md, docs/workflow-state-contract.md, docs/conventions.md, docs/architecture.md, docs/api.md, README.md, .env.example | 9 | sequence | sonnet |
| n5s-envsec | security-reviewer | n5-docs | — | 1 | sequence | sonnet |
| n6-review | code-reviewer | n4-adversary, n5s-envsec | — | 1 | sequence | opus |
| n7-finalize | finalize | n6-review | — | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-runchains | complete |
| n2-gatefence | complete |
| n3-planner-prose | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-review | complete |
| n7-finalize | complete |
| n5s-envsec | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-runchains) | subagent-invoked | deferred_to_group | |

| implementer (n3-planner-prose) | subagent-invoked | deferred_to_group | |
| tdd-guide (n2-gatefence) | subagent-invoked | group_passed | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary 8f28af7dbd68 | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 1fe7f8a3b392 | |
| security-reviewer | subagent-invoked | evidence-binding: n5s-envsec 71c07417afc8 | |
| code-reviewer | subagent-invoked | evidence-binding: n6-review 8e28a9237116 | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize f2bb81e4aecc | |
## Plan Notes

Shape: n1 ∥ n2 ∥ n3 are an exact-file-disjoint write antichain (coarse-relaxation default-on co-open into isolated legs, reconciled at the group barrier). n4 (adversarial gate over the subtle fence) depends only on n2 so it overlaps n3/n5. n5 (docs) depends on the full impl frontier and MUST land before n6 runs the four chains so the HEAD-bound receipt covers the docs commit. n6 post-dominates every code-producing node (G1) via n5 (n1/n2/n3) and n4 (n2). No main-session-gate node is authored — the run has no gate window, so #607's own fence stays inert during this run (safe by construction).

Shared cross-node token spec (both n2 and n3 author to the issue text, not to each other): env opt-out `KAOLA_GATE_WINDOW_FENCE=0` (default-ON); running-set entry `kind: 'gate'`; close-time evidence token `instrumentation: none | <node-id>`; the deny refusal names the legal exits (upstream writer node / route-findings / repair-node / write-halt --reason consent).

### n1-runchains (#608, tdd-guide, sonnet)
- Persist the existing internal `_timedOut` marker into the receipt per-chain entry as `timed_out: true|false` (absent on legacy receipts ⇒ false). Name TIMEOUT + the `KAOLA_RUN_CHAINS_TIMEOUT_MS` remedy inline in the failure-summary line when `timed_out` is true.
- Relay the same distinction in the finalize gate's `chains_red` operator hint (`getOperatorHint`/hint registry in kaola-workflow-plan-validator.js, ~line 88) — hint text only, no barrier-logic change.
- Recalibrate `resolveTimeoutMs` default `900000 → 1800000` (30 min); env override behavior unchanged. Update the `resolveTimeoutMs` doc comment default reference.
- RED-first guard in scripts/test-run-chains.js: a synthetic timeout produces `timed_out:true` + `exitCode:1` + the TIMEOUT-labelled summary line; a green chain records `timed_out:false`. Update the existing T12 assertion (`resolveTimeoutMs({}) === 900000 → 1800000`).
- Edition parity is mechanical: run-chains.js is a COMMON_SCRIPT (canonical↔codex byte pair via validate-script-sync) + RENAME_NORMALIZED forge ports; plan-validator.js is a GENERATED_AGGREGATOR (codex byte twin + regenerated forge ports). All four copies of EACH move together — declared. Do NOT touch adaptive-node.js (n2 owns it). `node scripts/test-run-chains.js` is NOT in `npm test` — run it explicitly to self-verify.

### n2-gatefence (#607 layers 2+3, tdd-guide, opus)
- FIRST do the `kind` consumer audit named in the issue before changing state shape: excl-scheduler guard (mutating-subcommand prologue), open-ready slot math + `liveHasWrite` (~line 4006), `selectSpeculativeWriteGroup`, close/removal + `reconcile-running-set`. Confirm a live `kind:'gate'` entry cannot false-fence or miscount; if the audit surfaces a real conflict, fall back to the issue's stated alternative (hook parses the `## Node Ledger` for an in_progress main-session-gate) rather than forcing the state channel.
- Layer 2 state channel: `open-next`, when opening a main-session-gate, records it into `.cache/running-set.json` as `kind:'gate'`; close and `reconcile-running-set` remove it (id-keyed removal already exists).
- Layer 2 hook rule (c) in kaola-workflow-write-lane.sh: when any open node is `kind:'gate'`, deny (exit 2) a Write/Edit landing INSIDE the active worktree outside the workflow bands (`kaola-workflow/`, `.cache/`) UNLESS it falls under a co-open write node's declared lane. Carve-outs are load-bearing and MUST hold: co-open writer lanes allowed, member worktrees allowed, out-of-repo paths allowed, workflow bands allowed. Default-ON with `KAOLA_GATE_WINDOW_FENCE=0` opt-out; EVERY existing #376 fail-open exit (missing manifest, unparseable stdin, non-git cwd) preserved byte-for-byte when no gate is open. Refusal message names the legal exits.
- Layer 3 close-time token in adaptive-node.js `checkEvidenceShape` (the local main-session-gate branch, ~line 955 — NOT plan-validator.js SHAPE_REQUIREMENTS; #608's n1 owns plan-validator.js this run): require `instrumentation: none | <node-id>`; refuse close on absence; when it names a node, that node must exist in the ledger as a writer whose declared write set covers the instrumentation.
- Tests: extend the write-lane hook allow/deny harness in scripts/simulate-workflow-walkthrough.js (~line 808) with the gate-window matrix (fabricated stdin + fixture manifests; write-then-delete during a simulated gate window refused at write time). In scripts/test-adaptive-node.js add open-next-records-`kind:'gate'`, the kind-consumer non-false-fence cases, and the evidence-token refusal; UPDATE the existing T8g main-session-gate evidence-shape fixtures to carry `instrumentation: none` (they will otherwise red under layer 3). Grep all four `simulate-*-walkthrough.js` + the tests for any main-session-gate evidence-close fixture and add `instrumentation: none` where needed — the edition walkthroughs are declared defensively.
- Edition parity: adaptive-node.js is a GENERATED_AGGREGATOR (all four declared); write-lane hook is byte-identical ×4 (sync-group, all four declared). next-action.js is NOT touched (it reads plan shape, not running-set kind — confirm during the audit).

### n3-planner-prose (#607 layer 1, implementer, sonnet)
- non_tdd_reason: cross-edition prose propagation across 13 agent/command/skill surfaces plus contract-validator + route-reachability enforcement wiring; the enforcing needle is authored alongside the prose (verified by the four contract-validator chains + route-reachability), no isolated failing unit test precedes it.
- Planner authoring guidance (agents/workflow-planner.md + the 3 workflow-planner.toml twins + the 3 kaola-workflow-adapt SKILLs): when a main-session-gate needs instrumentation to execute (probe scene/test/fixture INCLUDING build wiring), an upstream writer node (tdd-guide/implementer) authors it in its DECLARED write set; the gate only runs it. State the durability decision in the plan (durable+env-gated preferred, or ephemeral with the DELETION owned by a downstream writer/finalize node — the gate never authors or deletes files). Keep md↔toml parity (agent-profile-parity curated tokens); if a new curated token is added, wire it in scripts/test-agent-profile-parity.js.
- Plan-run gate instructions (the SIX plan-run surfaces): a main-session-gate node body never instructs authoring files; note the gate-window fence exists (in-worktree out-of-band writes are denied during a gate window). Propagate verbatim-identical across all six surfaces.
- Enforcement: add one contract-validator needle per new pinned line in EACH edition validator (validate-workflow-contracts.js canonical↔codex byte pair + the two forge contract validators) + route-reachability coverage so a dropped surface reds the chain. Stay forge-neutral (no `gh`/`glab`/brand tokens, no `plugins/<root>/scripts` literal in forge validators); PROVENANCE_BAN clean (no `#NNN`/`D-NNN-NN` in the prompt surfaces).

### n4-adversary (adversarial-verifier, opus)
- Read-only change gate over n2 (verdict-checked). Try to REFUTE the fence's correctness: construct writes that SHOULD be denied but slip through (probe-file shape during a gate window) and writes that MUST stay allowed (co-open writer lane, member worktree, out-of-repo scratch, workflow bands) but get false-fenced; verify all #376 fail-open exits are preserved when no gate is open; verify the kind-consumer audit holds (no miscount/false-fence from a live `kind:'gate'` entry). Emit `verdict: pass|fail` + `findings_blocking: N` (column 0).

### n5-docs (doc-updater, sonnet)
- Add a NEW `## [Unreleased]` section to CHANGELOG.md (6.19.0 is already released) with a Fixed entry for #607 and #608. Author docs/decisions/D-607-01.md and D-608-01.md (both fresh — next free numbers). Document the running-set.json `kind:'gate'` schema addition in docs/workflow-state-contract.md. Note the gate-window fence + upstream-provisioning convention in docs/conventions.md; update docs/architecture.md if the write-lane/running-set mechanism structure changed. Docs-only (chain-asserted docs written BEFORE n6's chain run).

### n5s-envsec (security-reviewer, sonnet)
- Read-only security gate post-dominating n5-docs (added at the mid-run write-set widening: n5 gained docs/api.md, README.md, .env.example — the .env.example write classifies n5 sensitive under G2). Review n5's full diff with emphasis on the .env.example / README / docs env-var edits: no secrets introduced, no dangerous default flipped, documented defaults match the shipped code (run-chains 1800000; gate fence default-ON with =0 opt-out). Emit `verdict: pass|fail` + `findings_blocking: N`.

### n6-review (code-reviewer, opus)
- Review the full diff (n1/n2/n3/n5) incl. prose↔impl agreement on the shared token spec. Run the four chains SEQUENTIALLY over HEAD with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` (octopus-merge SIGKILL avoidance) — the recalibrated 1800000 default should now cover the claude chain; also run the standalone `node scripts/test-run-chains.js` (not in npm test). Record the HEAD-bound chain receipt. Emit `verdict: pass` + `findings_blocking: 0`.

### n7-finalize (finalize sink)
- State/docs bookkeeping only (finalization-summary + archive). CHANGELOG/docs already landed in n5.
