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
  status: done
  dispatched: self, the claude fast gate then a per-suite runner that does not stop at the first red
  result: /private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/626957e1-3346-426c-8b88-82dfd75175a4/scratchpad/baseline-{claude,rest}.log. The fast gate is RED at HEAD — test-adaptive-node shard 5/12 fails 10 of 42 sampled scenarios, which is the recorded 22-failure population showing up on this rotation, and the `&&` chain then aborts so no later suite ran. Every other suite measured independently is GREEN (35+ suites incl. walkthrough shard, claim-hardening, sink-merge, run-chains, the contract validators and the routing-surface generators). So the only pre-existing red lives in a suite this campaign deletes.

- item: Observe this run carrying itself end to end — decompose, dispatch, close, and resume after an interrupted dispatch. This item gates every deletion below it (step 2).
  status: done
  dispatched: self
  result: OBSERVED, all four. Decompose and dispatch and close are demonstrated by the closed items above. For the resume drill the `changelog-draft` dispatch was killed mid-flight on purpose, and recovery was then performed from this file alone — read the H1 for the goal, list the in-flight items with their `dispatched` fields, check each promised output locator on disk, and decide. All three promised outputs were absent; `triage-mixed-tests` could be shown alive, the other two could not, so the dead one was re-dispatched. TWO FINDINGS. (1) The design works: the file carried enough to resume with no context, which is exactly what the usage-limit wipe destroyed. (2) A real gap — `dispatched` records what went out but NOT whether it is still running, and a successor generally cannot probe the liveness of a process it did not start. The fix is a procedure, not a fifth field: look for the WORK, not the worker — if the promised output has landed, close; otherwise re-dispatch unless liveness is provable. That also makes "name where the output was to land" the load-bearing half of the `dispatched` field. Written into docs/mission-list.md under Resuming; no new field, no new machinery.

- item: Triage simulate-workflow-walkthrough.js scenario by scenario — it is the integration suite and covers BOTH the dying DAG and surviving claim/finalize/sink/release behaviour, so wholesale deletion would take real coverage with it. Needs the release-check scenarios located, since that gate is moving to run-chains.
  status: in-flight
  dispatched: subagent `triage-walkthrough` (code-explorer, sonnet), read-only, reporting to kaola-workflow/.origin/877/walkthrough-triage.md

- item: CORRECTION to my own spec, carried here so it is not re-litigated — the finalize chain-receipt gate loses its verdict too. The first draft of step3-extraction-spec.md kept arm A as "the one place a finalize may still stop". That was wrong: ADR 0016's R3 is publication without a content-bound witness, the chain receipt IS that witness, and ADR 0017 names "a witness bound to different bytes" among the things the sink now REPORTS while stating the refusal count reaches zero. Keeping it was preserving a mechanism because removing it makes the system harder to reason about — the exact move the ADR's method note warns about. Arm A now returns a typed finding, finalize does not exit non-zero on it, and the finding is written to finalization-summary.md under ## Validation as well as onto the envelope. Two things deliberately do NOT convert: run-chains --release-check keeps every refusal (release tooling a human invokes, outside the run design, and the project mandates an unwaived four-chain receipt for a tag), and an archive that would LOSE a file still fails loudly (an operation refusing to destroy data is not a workflow judging work).
  status: done
  dispatched: self, plus corrections sent to `extract-impl` and `finalize-door-tests` mid-flight
  result: kaola-workflow/issue-877/step3-extraction-spec.md — the correction is inline in the "finalize door" section and in acceptance clause 3.

- item: Triage the other mixed suites — claim-hardening, gap-sweep, run-chains, sink-merge, refusal-route-sweep, interior-gate-freshness, barrier-base-integrity — and settle whether kaola-workflow-gap-sweep.js itself has a subject left once there are no nodes.
  status: in-flight
  dispatched: subagent `triage-mixed-tests` (code-explorer, sonnet), read-only, reporting to kaola-workflow/.origin/877/mixed-tests-triage.md

- item: Extract the load-bearing pieces onto the list form (step 3) — relocate the plan-independent helpers into the byte-identical adaptive-schema.js, re-point claim.js and run-chains.js off the plan-validator, rewrite the finalize door as validation-plus-report, and re-derive archive completeness now that the ledger is not the required set. The wave is deliberately ADDITIVE: the plan-validator is left running and untouched, so every intermediate commit stays shippable.
  status: in-flight
  dispatched: subagent `extract-impl` (implementer, opus) owns adaptive-schema.js / claim.js / run-chains.js / release.js against kaola-workflow/issue-877/step3-extraction-spec.md. Separately and concurrently, subagent `finalize-door-tests` (tdd-guide, opus) owns scripts/test-finalize-door.js and authors from the spec's Acceptance section alone — custody is split so the implementer is not judged by its own oracle. Baseline for the RED proof is commit 440bb220.

- item: Delete the node executor and let its tests fall out (step 4). Tests are deleted with their mechanism, never repaired ahead of it. Also shrink the three enumerated name-lists in the same change.
  status: todo

- item: Propagate to the four editions and the runtime prompt surfaces (step 5), including agents/*.md and the three hand-maintained plugins/*/agents/*.toml twins that no generator owns. Owner ruling 2026-07-31 — the command surface COLLAPSES TO THREE: /workflow-init, /workflow-next (which now creates and runs the mission list), /kaola-workflow-finalize. /kaola-workflow-adapt and /kaola-workflow-plan-run are deleted, and so is agents/workflow-planner.md; the vendored role agents survive as dispatchable tools.
  status: in-flight
  dispatched: split in two. Subagent `agent-prompts` (implementer, opus) owns agents/*.md and the 48 hand-maintained plugins/*/agents/*.toml twins — delete workflow-planner, strip dead machinery from the other 14 roles, keep the craft, and carry the consent rule as prose since the durable valve is being deleted. The routing half is NOT dispatched yet: the 30 command/SKILL surfaces are GENERATED from 5 skeletons in templates/routing/ by generate-routing-surfaces.js (TOPICS at :78), so that half is "delete 2 skeletons, rewrite 3, regenerate" rather than 30 hand edits — and it waits on the extraction so the finalize skeleton describes the door that actually ships.

- item: Draft the [Unreleased] CHANGELOG entry for the campaign, naming the accepted losses so they are not discovered later as surprises.
  status: in-flight
  dispatched: subagent `changelog-draft` (general-purpose, sonnet), writing to kaola-workflow/.origin/877/changelog-draft.md, forbidden from editing CHANGELOG.md itself

- item: Rewrite CLAUDE.md to describe what ships and remove its ADR 0017 banner; update README, docs/api.md, architecture, conventions, the state contract and the doc index (step 6, last).
  status: todo

- item: Independent verification before finalize — a Fable-model verifier reads the campaign against ADR 0017 and reports drift, over-reach, or a step claimed but not done.
  status: todo

- item: Finalize — validation chains receipt, CHANGELOG, roadmap, archive this run, close #877. Note for #878: the scheduler lock and the consent valve were deleted rather than kept, so its rows should point at the git ref that holds the sizing.
  status: todo
