# Workflow Plan — bundle-617-618

<!-- plan_hash: 0fda43d5471dff596f0e69c983b0de663333c01254837368294fcb476be0c792 -->

## Meta
speculative_open_policy: auto
labels: area:scripts
validation_command: npm test

Bundle of two coupled finalize/sink fail-open bug fixes. Both are DIAGNOSED (each roadmap
source carries an explicit P1 next-step), so this is a build DAG, not a shape-first investigation.
The two fixes are exact-file-disjoint (sink-merge/claim/closure-contract vs run-chains/plan-validator/
run-chains-test/package.json) even though both live under scripts/ + plugins/, so they co-open as a
`coarse` (exact-file-disjoint) antichain by default; the validator derives `parallel_safe` — it is NOT
hand-authored. Correctness is the driver here (precedence #1): the entire class of bug is a fail-OPEN
(a false green), which a diff-reading reviewer and the four-chain suite — the latter partly CIRCULAR
for #618 because npm test exercises the very run-chains/plan-validator being fixed — can miss. Hence a
read-only `adversarial-verifier` that RUNS the reproductions (SIGKILL'd chain, empty-chains receipt,
close-before-merge ordering) and asks "actually fail-CLOSED now, or masked?" as a non-redundant gate.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-fix-617 | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js, scripts/test-bundle-finalize.js, scripts/test-claim-hardening.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 17 | sequence | standard | — |
| n2-fix-618 | tdd-guide | — | scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-run-chains.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js, plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js, package.json | 12 | sequence | standard | — |
| n3-review | code-reviewer | n1-fix-617, n2-fix-618 | — | 1 | sequence | reasoning | — |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning | — |
| n5-docs | doc-updater | n3-review | docs/decisions/D-617-01.md, docs/workflow-state-contract.md | 2 | sequence | standard | — |
| n6-finalize | finalize | n4-adversary, n5-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **n1-fix-617 (tdd-guide, standard)** — #617: an issue can be closed while the merge sink never
  runs. Fix per the roadmap next-step: state-derived close deferral + a `merge-base --is-ancestor`
  gate + closure-last `SINK_STEPS` ordering (today `closure` precedes `push_main` in
  `kaola-workflow-sink-merge.js:SINK_STEPS`), and make the `remote-closed-after-publish` invariant
  (declared in `kaola-workflow-closure-contract.js` but NEVER evaluated by
  `checkClosureInvariants` in `kaola-workflow-claim.js`) fail LOUD. tdd-guide because the fix is
  test-first-able: a RED test asserts closure lands AFTER publish/merge and that a
  closed-but-not-merged state raises a violation. Cross-edition: `sink-merge.js` + `claim.js` are
  COMMON (root↔codex byte) with rename-normalized gitlab/gitea ports; `closure-contract.js` is a
  4-tree byte-identical group — all edition peers move ATOMICALLY in this one node (byte/rename sync
  validators refuse a split). closure-contract ×4 declared defensively (the invariant lives there;
  include so a co-mover slip cannot stall). Tests land in the already-wired `test-bundle-finalize.js`
  + `test-claim-hardening.js` (NOT the walkthrough — keeps this node exact-file-disjoint from n2).
- **n2-fix-618 (tdd-guide, standard)** — #618: chain-receipt greenness fails OPEN. Fix per the
  roadmap next-step: (a) fail-closed signal mapping in `kaola-workflow-run-chains.js` (a
  signal-killed chain — `r.status==null && r.signal` — currently yields exitCode 0 = FALSE GREEN;
  today only `SIGTERM` is caught as a timeout), (b) `chains_empty` refusal — the producer must not
  declare green with zero chains AND the CONSUMER `--finalize-check` in
  `kaola-workflow-plan-validator.js` (`chains = Array.isArray(receipt.chains) ? receipt.chains : []`
  then vacuously passes) must refuse an empty `chains[]`, and (c) wire the orphaned
  `scripts/test-run-chains.js` into the claude chain via `package.json`. `plan-validator.js` is a
  GENERATED_AGGREGATOR, so all four editions are declared together (generated_port_split wall);
  `run-chains.js` is COMMON + rename-normalized forge ports (declared for byte/rename sync). Forge
  run-chains TEST ports declared defensively in case the new signal/empty assertions mirror. tdd-guide
  because a RED test can construct a SIGKILL'd chain and an empty-chains receipt and assert the
  refusal fires.
- **n1 / n2 are an antichain (no dep edge) with exact-file-disjoint write sets** → `coarse`
  exact-file-disjoint co-open BY DEFAULT (#546-G2/#593 relaxation); the scheduler overlaps them. Never
  hand-add `parallel_safe`.
- **n3-review (code-reviewer, reasoning)** post-dominates BOTH code-producing nodes on every path to
  the sink (G1). `reasoning` because these are subtle fail-OPEN correctness fixes across four editions
  — the review must confirm the fail-CLOSED direction and the byte/rename edition parity, and reason
  about the irreversible issue-closure ordering. It runs `validation_command` (the four chains — the
  #307 cross-edition obligation, since every diff touches the edition trees).
- **n4-adversary (adversarial-verifier, reasoning)** — read-only with Bash; RUNS the reproductions
  (SIGKILL'd chain → non-zero, empty-chains receipt → refusal, `closure` cannot precede `push_main`,
  closed-but-not-merged → loud violation) and asks "root-cause fail-CLOSED, or symptom-masked green?"
  Non-redundant with n3 (diff-reading) and with the four-chain suite (partly CIRCULAR for #618: npm
  test exercises the very run-chains/plan-validator under change). Sole unsatisfied dep is the n3 gate,
  so it opens speculatively under `auto`.
- **n5-docs (doc-updater, standard)** — records the durable contract clarification: a decision record
  `docs/decisions/D-617-01.md` (D-617-01 is the next free id — no existing D-617/D-618 record) for the
  fail-loud closed⇒merged invariant + fail-closed chain greenness, and updates
  `docs/workflow-state-contract.md` (closure step ordering + chain-receipt greenness are durable
  state/finalize-contract concerns). NO `CHANGELOG.md` here (protected file kept on the sink) and both
  paths are exactly-resolvable docs → speculative-eligible behind the n3 gate; sibling of n4 (disjoint,
  n4 writes nothing). If either doc proves unnecessary the node under-writes with a skip-reason (safe).
- **n6-finalize (finalize)** — unique docs/state sink; writes only `CHANGELOG.md`. Depends on n4 and
  n5 so finalization is provably impossible until the adversarial gate passes AND docs land.
- **No security-reviewer (G2)**: labels carry no security sensitivity (bug/scripts). **No
  main-session-gate (G3)**: acceptance is machine-checkable (four chains + adversarial repro), no
  GPU/visual/device/human-signoff hinge. **No knowledge-lookup**: everything is confirmable in-repo.
- **Mid-run write-set widening (n1-fix-617)**: the `SINK_STEPS` reorder (closure now runs after
  `push_main`) makes a pre-existing assertion stale in three test files that assert
  `receipt.steps.push_main === 'pending'` immediately after a close — now correctly `'done'` since
  `push_main` runs first. n1-fix-617's declared_write_set widened (14→17) to add
  `scripts/simulate-workflow-walkthrough.js`, `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`,
  `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — a mechanical consequence of the same fix,
  not new scope. Re-frozen before n1's close.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix-617 | complete |
| n2-fix-618 | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-fix-618) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-fix-617) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | # Review: n3-review (bundle-617-618) — post-dominating gate over n1-fix-617 + n2 | |
| adversarial-verifier (n4-adversary) | subagent-invoked | # Adversarial verification: n4-adversary (bundle-617-618) | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 541c6df01c8a | |
