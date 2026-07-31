# Build ADR 0017: the mission list replaces the node/DAG executor (issue #877)

- item: Write the file format and the four fields — a written convention plus one real file (step 1). Nothing is deleted in this step.
  status: done
  dispatched: self
  result: docs/mission-list.md (the convention) and this file (the real one). Committed 7c7e93db.

- item: Find what is load-bearing outside node execution before the host dies (step 3 input) — the finalize attribution sweep, the consent path in the guard prologue, nonce minting, and which adaptive-schema.js exports survive.
  status: done
  dispatched: subagent `recon-loadbearing` (code-explorer, opus), read-only
  result: kaola-workflow/.origin/877/loadbearing.md. Finalize arm A (validation) is already ~95% plan-independent and `--release-check` is a shipped plan-independent twin to copy; arm B (attribution) cannot port as a verdict because free-text `result` is not a path set — it ports as a report; arm C (post-dominance) deletes. Relocate computeCodeTreeHash / resolveFinalizeCheckRoot / isBarrierInvisible / parseValidationTestConsumes / parseGoal out of plan-validator before it dies. Nonce is derived from the barrier baseline SHA and has ZERO dependents outside node execution — deletes cleanly. adaptive-schema.js: ~73% dies, ~19% survives, ~6% unclear. Unnamed by the ADR: claim.js listRecordedNodeEvidence proves archive completeness from the ledger (same "declared set" problem one layer down), and run-chains shares computeCodeTreeHash with the finalize gate by reference.

- item: Inventory every surface that implements or describes the DAG — canonical scripts, tests, the four editions, prompt surfaces, installer wiring, docs (step 4/5 input).
  status: done
  dispatched: subagent `recon-surfaces` (code-explorer, sonnet), read-only
  result: kaola-workflow/.origin/877/surfaces.md. ~35k canonical script lines, ~77k test lines, ~8k edition walkthroughs, ~16k prompt surfaces, ~10k docs. Easy-to-miss surfaces — kaola-workflow-classifier.js (the antichain/write-set scanner, absent from CLAUDE.md's script list), the 48 hand-maintained plugins/*/agents/*.toml twins, docs/plan-run-cards/ (10 files, wholly DAG), and three enumerated name-lists that must shrink together: install-manifest.js SUPPORT_SCRIPTS, edition-sync.js GENERATED_AGGREGATORS, validate-script-sync.js COMMON_SCRIPTS. Sequencing warning — the contract validators read adaptive-schema's export surface directly and go red the moment it changes, so they move WITH the schema, not after it.

- item: TOOLING TRAP, carried for everyone downstream — kaola-workflow-adaptive-node.js and its three edition copies contain a NUL byte near line 8400, so ripgrep treats them as binary and silently returns matches only for lines below it. Use `rg --text` / `grep -a` or line-range reads, or half the file reads as absent.
  status: done
  dispatched: self
  result: Recorded here; repeated into every dispatch brief that touches those files.

- item: Derive the calls the ADR left open, additively — what forced each to exist? Record the derivation so it is not re-litigated.
  status: done
  dispatched: self
  result: (1) CONSENT MACHINERY DELETES. ADR 0017 is explicit — "a durable valve is only needed once a question must outlive the process that asked it; until that is observed, conversation is the mechanism", and the valve is a watch-list row. So the halt marker, the two .cache journals, consentScopeDigest and the halt_pending refusal all go; "escalate value and irreversible calls to the user" survives as PROSE in the three commands. (2) THE SCHEDULER LOCK DELETES. What forced it to exist was the running-set scheduler's mutual exclusion, which dies; it is a watch-list mechanism already sized, and git history holds the sizing. (3) MODEL TIER TABLES SURVIVE. Subagents remain tools and something must still answer "which model, which effort" per runtime; only the tables keyed on plan-node role semantics (ROLE_KINDS, ROLE_CAPABILITY_MANIFEST, GATE_VERDICT_ROLES, MAIN_SESSION_GATE_ROLE) die. Agent-name-keyed pins survive because the vendored agents survive. (4) workflow-state.md SURVIVES as the claim record. It is not on the retirement list and what forced it to exist — knowing which issue, branch and worktree this run owns across processes — still holds. The mission list replaces workflow-plan.md, its Node Ledger and the per-node .cache evidence, not the claim.

- item: Measure the baseline before anything moves — which suites are green at HEAD, so a post-demolition red is attributable rather than mysterious.
  status: in-flight
  dispatched: self, `npm run test:kaola-workflow:claude` in the background, log at /private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/626957e1-3346-426c-8b88-82dfd75175a4/scratchpad/baseline-claude.log

- item: Observe this run carrying itself end to end — decompose, dispatch, close, and resume after an interrupted dispatch. This item gates every deletion below it (step 2).
  status: todo

- item: Extract the load-bearing pieces onto the list form (step 3) — relocate the plan-independent helpers into the byte-identical adaptive-schema.js, re-point claim.js and run-chains.js off the plan-validator, rewrite the finalize door as validation-plus-report, and re-derive archive completeness now that the ledger is not the required set.
  status: todo

- item: Delete the node executor and let its tests fall out (step 4). Tests are deleted with their mechanism, never repaired ahead of it. Also shrink the three enumerated name-lists in the same change.
  status: todo

- item: Propagate to the four editions and the runtime prompt surfaces (step 5), including agents/*.md and the three hand-maintained plugins/*/agents/*.toml twins that no generator owns. Owner ruling 2026-07-31 — the command surface COLLAPSES TO THREE: /workflow-init, /workflow-next (which now creates and runs the mission list), /kaola-workflow-finalize. /kaola-workflow-adapt and /kaola-workflow-plan-run are deleted, and so is agents/workflow-planner.md; the vendored role agents survive as dispatchable tools.
  status: todo

- item: Rewrite CLAUDE.md to describe what ships and remove its ADR 0017 banner; update README, docs/api.md, architecture, conventions, the state contract and the doc index (step 6, last).
  status: todo

- item: Independent verification before finalize — a Fable-model verifier reads the campaign against ADR 0017 and reports drift, over-reach, or a step claimed but not done.
  status: todo

- item: Finalize — validation chains receipt, CHANGELOG, roadmap, archive this run, close #877. Note for #878: the scheduler lock and the consent valve were deleted rather than kept, so its rows should point at the git ref that holds the sizing.
  status: todo
