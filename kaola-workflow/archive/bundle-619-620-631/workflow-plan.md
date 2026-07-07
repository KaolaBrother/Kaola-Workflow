# Workflow Plan — bundle-619-620-631

<!-- plan_hash: 7ae5f50bef3e54b419cd23536b6d9be54db952c8a7f54d693db257b1afb3617a -->

## Meta
speculative_open_policy: auto
labels: area:scripts
validation_command: npm test

Bundle of three DIAGNOSED receipt-integrity / data-loss bug fixes, all landing in the
`sink-merge.js` + `claim.js` family (each roadmap source carries an explicit P2 next-step, so this
is a build DAG, not a shape-first investigation). Direction of every fix is fail-OPEN → fail-CLOSED
(#619 receipt asserts a merge/close that did not happen; #620 a repair tool `-D`s the only copy of
unmerged work; #631 a clean sink false-ALARMS after a mid-flight rebase). Correctness is the driver
(precedence #1): a superficially-passing fix can still fail-open, so a diff-reading `code-reviewer`
(reasoning), the four-chain suite (#307 cross-edition obligation), AND a read-only
`adversarial-verifier` that RUNS the reproductions ("branch survives cleanup? sink_incomplete fires
on a failed close? no false-alarm on a rebased sink?") together form the gate.

**Decomposition + serialization (the disjointness verdict).** The dispatch asked whether the three
fixes are parallel_safe legs or must serialize. Answer: they SHARE files and must SERIALIZE. ALL three
write `scripts/kaola-workflow-claim.js` (+ its byte-identical codex twin + two hand-ported forge
copies); #619 and #631 additionally BOTH write `scripts/kaola-workflow-sink-merge.js` and overlap in
its closure-gate region (~:1289–1390). Same-file writes cannot form a disjoint antichain, and the
byte-identical codex twin plus the live #633 lane-group synthesizer merge-collision hazard make
same-file parallel legs unsafe. So the implement work is decomposed **per FILE, not per issue**
(n1-sink owns every `sink-merge.js` change; n2-claim owns every `claim.js` change) and SERIALIZED
(n1→n2). Per-file (rather than per-issue) is deliberate: (a) it keeps each root file's forge ports
ATOMIC with its canonical edit in ONE node — the sole-root-writer shape that satisfies the #340
forge-port-ordering wall (a per-issue split would write forge ports before a later issue re-edits the
same root); (b) one implementer owns all three region-disjoint edits of a shared file coherently. The
split is faithful — #619 and #631 each span both files, so their fixes land partly in n1-sink and
partly in n2-claim; the reviewer/adversary verify each issue's full AC across the two nodes. Within
each file the touched regions are DISJOINT (`claim.js`: close-helper ~:238–248 / stale-cleanup
~:407–427 + ~:2723–2830 / cmdVerifySink ~:2998–3049), so the coherent single-owner edits never
conflict. `parallel_safe` is validator-derived and is NOT hand-authored here.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-sink | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/test-claim-hardening.js, scripts/test-bundle-finalize.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 9 | sequence | standard | — |
| n2-claim | tdd-guide | n1-sink | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 7 | sequence | standard | — |
| n3-review | code-reviewer | n2-claim | — | 1 | sequence | reasoning | — |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning | — |
| n5-docs | doc-updater | n3-review | docs/decisions/D-619-01.md, docs/api.md, docs/workflow-state-contract.md | 3 | sequence | standard | — |
| n6-finalize | finalize | n4-adversary, n5-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **n1-sink (tdd-guide, standard)** — every `kaola-workflow-sink-merge.js` change across all four
  editions. Fixes: **#619** (1) legacy (non---sink) close path emits `status:'merged'` / exit 0 on a
  failed close (`~:541` + receipt emit `~:657`) → MIRROR the #497 fix already on the `--sink` closure
  step (`~:1207–1222`): emit typed `sink_incomplete` + exit 1 when `remoteIssueClosed === 'failed'` or
  `failed_issue_closures` is non-empty; (2) the sink-side close sites (`closeOne ~:1179`, `~:535`)
  record success on gh exit 0 with the probe only in the catch → probe AFTER close and bucket an
  open-after-exit-0 as failed; (3) `push_upstream` swallows every failure then
  `stepDone('push_upstream')` (`~:1068–1092`) → verify `branch@{u}` parity after the push (contrast the
  fail-closed `assertBranchPushedToUpstream ~:270–307`), record done only on proven parity else
  `push_upstream:'failed'` + the sink_incomplete shape; (4) `worktree_sync` is structurally dead (merge
  step removes the worktree first `~:1086`, so the later search finds no block → wtPath always null)
  yet records done (`~:1115–1152`) → perform the copy pre-removal (capture wtPath first) OR delete the
  step + its `SINK_STEPS` entry so the receipt stops attesting a no-op. **#631** stamp a NEW
  `published_head` field at the closure gate once the live tip resolves (the `~:1289` note region,
  AFTER `doRebase`) — **LANDMINE: do NOT mutate `branch_head`**, which is load-bearing for the #518
  cycle-identity guard (`~:753–813`); `published_head` is ADDITIVE. tdd-guide: each is RED-first-able
  (failed-close → refusal; exit-0-but-open → failed; push-fail → typed; no-op step → gone/real;
  rebased receipt carries a fresh `published_head`).
- **n2-claim (tdd-guide, standard)** — every `kaola-workflow-claim.js` change across all four
  editions; depends on n1-sink (consumes the `published_head` field n1 defines, and reads the stable
  post-n1 tree). Fixes: **#619** the claim.js close-helper (`~:238–248`) returns `'closed'` on gh exit
  0 with the probe only in the catch → post-probe the success path too (completes the "every close
  site post-probes" AC). **#620** `cmdStaleWorktreeCleanup`'s branch loop (`~:2816–2830`) calls
  `removeBranch` (`~:407–416`) which runs `git branch -D` UNCONDITIONALLY; `collectStale` treats a
  closed-on-forge issue with an UNMERGED branch as stale and `worktreeDirtyState` (`~:418–427`) returns
  'clean' for committed-but-unmerged work → the tool orphans the only copy of unmerged work. MIRROR
  sink-merge's is-ancestor pattern (`sink-merge.js:~608–617`): prove
  `merge-base --is-ancestor <branch> <defBranch>` and use `-D` only on proof, else attempt safe `-d`
  and on refusal bucket as `skipped_unmerged` with the tip sha (fail loud, never destroy). **#631**
  `cmdVerifySink` (`~:2998–3049`) prefers `receipt.branch_head` (rebase-stale) → PREFER `published_head`
  when present, fall back to `branch_head` only for legacy receipts. Regions are disjoint; one owner
  edits all three coherently. tdd-guide: RED tests — exit-0-but-open close → failed; closed-issue +
  unmerged-branch fixture SURVIVES `cleanup --execute`; a rebased-mid-flight receipt stays green in
  verify-sink.
- **Cross-edition porting model (both implement nodes).** `sink-merge.js` + `claim.js` are
  COMMON_SCRIPTS: canonical `scripts/` ↔ codex `plugins/kaola-workflow/scripts/` are BYTE-IDENTICAL
  (enforced by `validate-script-sync.js` in the claude chain) — sync the codex twin with a TARGETED
  copy of the edited file (NOT a blanket `edition-sync.js --write`, which would `cp` other COMMON
  scripts). The gitlab/gitea ports (`kaola-gitlab-workflow-*`, `kaola-gitea-workflow-*`) are DIVERGENT
  HAND-PORTS (forge-CLI bodies; guarded only by the export-superset check), NOT regenerated by
  edition-sync — the fix must be RE-IMPLEMENTED in each forge body (which legitimately names its forge
  CLI; the forge-neutral prose rule applies only to agent/command/skill surfaces, untouched here).
  Neither file is a GENERATED_AGGREGATOR, so `generated_port_split` does not apply. Each node is the
  SOLE root-writer of its file, so root+codex+forge-port move ATOMICALLY inside the one node (the
  #340-clean sole-writer shape). Defensive test declarations: n1 adds `test-bundle-finalize.js` +
  `simulate-workflow-walkthrough.js` (a `SINK_STEPS`/receipt change can stale their assertions —
  bundle-617-618 hit exactly this widening) and both nodes carry the forge `test-{gitlab,gitea}-sinks.js`
  (wired into the forge walkthroughs; the ported behavior needs forge-side RED coverage) +
  `test-claim-hardening.js` (the shared claim/sink hardening suite — serial, so the shared test file is
  safe). No contract validator pins `SINK_STEPS`/`branch_head`/`published_head` (grep-confirmed) — none
  declared.
- **n3-review (code-reviewer, reasoning)** post-dominates BOTH code-producing nodes on every path to
  the sink (G1 — the serial chain routes n1/n2 through n3). `reasoning`: these are subtle fail-OPEN
  correctness fixes across four editions — the review must confirm the fail-CLOSED direction, the
  additive `published_head` (branch_head untouched, #518 intact), and byte/hand-port edition parity.
  Runs `validation_command` (`npm test` chains the four edition suites with `&&`; a green result proves
  all four green — the #307 obligation, since every diff touches the edition trees).
- **n4-adversary (adversarial-verifier, reasoning)** — read-only with Bash; RUNS the reproductions
  (closed-issue + unmerged-branch fixture SURVIVES `cleanup --execute`; a failed close yields
  `sink_incomplete` + exit 1 on BOTH the legacy and --sink paths; an exit-0-but-still-open close is
  bucketed failed; a rebased-mid-flight sink stays green in verify-sink; push-failure is typed, not a
  false done) and asks "root-cause fail-CLOSED, or symptom-masked green?" Non-redundant with n3
  (diff-reading) and complementary to the four-chain suite. Sole unsatisfied dep is the n3 gate → opens
  speculatively under `auto`, overlapping its reproduction run with the review.
- **n5-docs (doc-updater, standard)** — records the durable contract changes: `docs/api.md` (the
  sink-receipt schema — add the `published_head` field + note the legacy `sink_incomplete` refusal /
  typed `push_upstream` status / `worktree_sync` disposition), `docs/workflow-state-contract.md`
  (durable receipt / verify-sink contract), and a decision record `docs/decisions/D-619-01.md`
  (D-619-01 is the next free id — no existing D-619/D-620/D-631 record) for the receipt-integrity
  fail-closed hardening + the additive `published_head` schema field + the stale-cleanup is-ancestor
  guard. Sole unsatisfied dep is the n3 gate → speculative-eligible under `auto`; co-opens with n4
  (disjoint: n4 writes nothing, n5 writes docs/, exactly-resolvable paths, no PROTECTED file —
  CHANGELOG stays on the sink). If any doc proves unnecessary the node under-writes with a skip-reason
  (safe).
- **n6-finalize (finalize)** — unique docs/state sink; writes only `CHANGELOG.md`. Depends on n4 AND
  n5 so finalization is provably impossible until the adversarial gate passes AND docs land. Executed
  by the main session (not a subagent) → no model.
- **No security-reviewer (G2)**: labels carry no security sensitivity (bug fixes to git/receipt
  plumbing; no auth/secret/crypto/network-facing input). **No main-session-gate (G3)**: acceptance is
  fully machine-checkable (four chains + RED-first fixtures + adversarial reproductions); no
  GPU/visual/device/human-signoff hinge. **No knowledge-lookup**: every fix is confirmable in-repo
  (reference patterns #497 legacy-close, #397.1 is-ancestor, #518 cycle-identity all live in the same
  two files).

## Node Ledger

| id | status |
| --- | --- |
| n1-sink | complete |
| n2-claim | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-sink) | subagent-invoked | evidence-binding: n1-sink e7db8128d48d | |
| tdd-guide (n2-claim) | subagent-invoked | evidence-binding: n2-claim 685b3e6aebed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review c07b57be26b0 | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary af769b9f68f1 | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs d6480e5637d7 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize b805ef967a96 | |
