<!-- plan_hash: 242604a642595eebc948b615ecd522c5f3c8a59a06d55daf3a73cb006ba30a54 -->
<!-- workflow-plan for issue-528 -->
<!-- shape: #486 Case-B read-only SHAPING run (probe -> assume -> adversarially falsify -> converge -> record) -->

## Meta

issue: 528
labels: —
project: issue-528
run_kind: shaping

<!--
WHY a read-only shaping run and not a build DAG (#486 Case B):

#528 pursues the C1 cross-chain axis that D-526-01 (existing) labelled "SAFE but FUTILE" for the single
claude chain, but argues it IS a real win for the FOUR-chain `npm test` gate (sum-of-chains
~25-28min -> max-of-chains ~claude ~10min). The issue is explicitly MEASUREMENT-FIRST with a
FORKED acceptance criterion: (a) ship a concurrent run-chains.js proven race-safe + attribution-
preserving + canonical-receipt-ordered with a MEASURED contention-surviving win, OR (b) document
"the win does not survive contention / is not worth the complexity" (continuing the D-523/D-526
evidence-first discipline).

The SHAPE of the remaining work (build the 4-edition concurrent dispatch + tests, vs. a docs-only
decision record) depends ENTIRELY on what the measurement finds. AC#3 is the make-or-break gate
and it REQUIRES a contended host (<=4 cores) — and D-526-01 (existing)'s reopen condition #2 says the same.
This authoring host is 18-core, so a valid make-or-break number cannot be produced here (any
concurrent win measured here is an upper bound that does NOT transfer — the exact trap D-526-01 (existing)
documented). Authoring a frozen build DAG that pre-commits to shipping the concurrent code would
launder an UNVALIDATED guess into the plan and sail through a green artifact-vs-plan verdict.
Therefore: a short read-only shaping run that PROBES the surface, ATTEMPTS the contention-aware
measurement (adversarial-verifier with Bash), CONVERGES on the localized finding + recommended
build SHAPE (or the document-not-worth-it conclusion), and RECORDS it in D-528-01. The orchestrator
then RE-PLANS as a fresh frozen run (new plan_hash) authored FROM the findings — honoring
freeze-once by pure composition, no in-place thaw.

Decision-record number: D-528-01 is the next free in the D-528 series (no existing D-528-* record).
-->

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-survey | code-explorer | — | — | 1 | sequence | sonnet |
| n2-method | knowledge-lookup | — | — | 1 | sequence | sonnet |
| n3-assume | planner | n1-survey, n2-method | — | 1 | sequence | opus |
| n4-falsify | adversarial-verifier | n3-assume | — | 1 | sequence | opus |
| n5-converge | planner | n4-falsify | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-converge | docs/decisions/D-528-01.md, CHANGELOG.md | 1 | sequence | — |

<!--
Node intent (procedure each node must carry out):

n1-survey (code-explorer, read-only) — map the C1 cross-chain surface for run-chains.js:
  the serial `for (const name of chains) { spawnSync(...) }` dispatch loop (~lines 252-287 of
  scripts/kaola-workflow-run-chains.js), the per-chain receipt fields that must survive
  out-of-order completion (exitCode, command, duration_ms, accepted_red, accepted_red_issue),
  the canonical chain order (KNOWN_CHAINS) the receipt must re-sort to, the `--accept-known-red`
  waiver path, the `KAOLA_RUN_CHAINS_TIMEOUT_MS` per-chain timeout (D-512-01 (existing), 900s), and the
  four edition copies: scripts/ root, plugins/kaola-workflow/ (codex byte-identical),
  plugins/kaola-workflow-gitlab/ + plugins/kaola-workflow-gitea/ (rename-normalised). CONFIRM the
  race-safety preconditions the issue asserts: four chains are independent OS processes with
  separate $TMPDIR roots and no shared writable state; check for any accidental shared $TMPDIR
  subdir-name collision across editions and that ~/.config/kaola-workflow/config.json stays
  read-only under concurrent reads. Write evidence to
  kaola-workflow/issue-528/.cache/n1-survey.md.

n2-method (knowledge-lookup, read-only) — establish the MEASUREMENT methodology and the
  Node.js bounded-concurrent-dispatch pattern: spawn (async) + a small N<=4 pool vs spawnSync;
  how to buffer per-child stderr without interleaving; how to measure makespan PROPERLY (medians
  over multiple reps, warmup, the contention knee at N=2 and N=4, oversubscription inversion on a
  <=4-core host where each chain spawns subprocess TREES). Surface the >2x-serial-stddev decision
  bar (D-523's ~28% jitter / D-526's ~24.5% swing, >7.8s structural analogue). Write evidence to
  kaola-workflow/issue-528/.cache/n2-method.md.

n3-assume (planner) — given the surface (n1) + methodology (n2), state 2-3 candidate dispositions,
  EACH with an explicit falsification criterion tied to AC#3: (A) the four-chain-gate win SURVIVES
  contention on a <=4-core host AND attribution/receipt-ordering are preservable -> recommend a
  BUILD run shaped as: concurrent run-chains.js (bounded spawn pool, per-child env copy, buffered
  per-chain stderr, canonical-order receipt re-sort, serial fallback default), the four edition
  copies (root + codex-byte-identical + gitlab/gitea rename-normalised), test-run-chains.js
  coverage for out-of-order completion + canonical ordering + waiver-under-concurrency, and all
  four chains green (#307); (B) the win does NOT survive contention -> recommend a docs-only
  D-528-01 (document-not-worth-it, continuing D-523/D-526; selective `--chains`/`--only` remains
  the lever). State the explicit HOST-VALIDITY criterion: a make-or-break number is only valid on
  a <=4-core contended host; an 18-core measurement is an upper bound that does not transfer.
  Write evidence to kaola-workflow/issue-528/.cache/n3-assume.md.

n4-falsify (adversarial-verifier, read-only, HAS Bash) — the make-or-break gate and the
  investigation's adversary. ATTEMPT the contention-aware measurement with a bounded-concurrent
  N=2/N=4 PROXY vs serial (medians, warmup) and try to REFUTE the leading "ship it" hypothesis:
  does the four-chain-gate win decisively exceed 2x serial stddev, AND can THIS host produce a
  VALID make-or-break number (18-core => almost certainly NOT, per AC#3 + D-526-01 (existing) reopen cond #2)?
  Also adversarially check the race-safety claim (does any in-process hazard — a module-top env,
  a mutate/restore pair, a shared $TMPDIR subdir name — survive concurrent whole-chain runs?). This
  is an INVESTIGATION adversarial-verifier (read-only, does NOT post-dominate a code node, so it is
  --verdict-check EXEMPT per advVerifierIsChangeGate). Write evidence to
  kaola-workflow/issue-528/.cache/n4-falsify.md.

n5-converge (planner) — record the localized finding + the recommended SHAPE for the follow-on
  build run (or the document-not-worth-it conclusion), WITH the explicit premise that would flip
  the call (e.g. "a <=4-core contended measurement showing median win > 2x serial stddev with
  preserved ordered attribution flips this to a BUILD run"). State clearly which fork (A build /
  B docs-only) the evidence supports and what the orchestrator should re-plan. Write evidence to
  kaola-workflow/issue-528/.cache/n5-converge.md.

n6-finalize (finalize, docs/state only) — write the shaping findings into the decision record
  docs/decisions/D-528-01.md (next free in the D-528 series) and add a CHANGELOG.md entry under
  [Unreleased]. Docs/state-only sink (no code write) — sink-legal. If the orchestrator re-plans a
  BUILD run from fork (A), that is a fresh frozen run authored from these findings (freeze-once,
  no in-place thaw).
-->

## Node Ledger

| id | status |
| --- | --- |
| n1-survey | complete |
| n2-method | complete |
| n3-assume | complete |
| n4-falsify | complete |
| n5-converge | complete |
| n6-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-survey) | subagent-invoked | evidence-binding: n1-survey 1c4c9e7e41dc | |

| knowledge-lookup (n2-method) | subagent-invoked | evidence-binding: n2-method 9eaa57246095 | |
| planner (n3-assume) | subagent-invoked | evidence-binding: n3-assume bbecf0e1db29 | |
| adversarial-verifier (n4-falsify) | subagent-invoked | evidence-binding: n4-falsify 66cacf514ac5 | |
| planner (n5-converge) | subagent-invoked | evidence-binding: n5-converge 0112470d4340 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 106063406bbe | |
## Plan Notes

- Shape: #486 Case-B read-only SHAPING run. All non-sink nodes are read-only
  (`declared_write_set: —`); the sole write is the docs/state-only `finalize` sink
  (`docs/decisions/D-528-01.md`, `CHANGELOG.md`). Zero code blast radius — no code-producing node,
  so no G1 `code-reviewer` / G2 `security-reviewer` / G3 `main-session-gate` is required.
- Decision-record id: `D-528-01` — next free in the D-528 series (no existing `D-528-*` record at
  authoring time; grepped `docs/` + `CHANGELOG.md`).
- Frontier: n1-survey and n2-method are an independent read-only antichain (no dep between them) so
  the scheduler overlaps them on the read frontier; n3-assume joins them. The remaining chain
  (n3 -> n4 -> n5 -> n6) is a true dependency chain (each consumes the prior's evidence), so it is
  correctly serial — n4's measurement needs n3's hypotheses, n5's convergence needs n4's refutation
  attempt, n6 records n5's verdict.
- n4-falsify is an INVESTIGATION `adversarial-verifier` (read-only, depends on n3-assume, does NOT
  post-dominate a code-producing node) — `--verdict-check` exempt by `advVerifierIsChangeGate`
  (plan-validator). It is the make-or-break measurement gate AND the structural skeptic.
- Re-plan contract (freeze-once): on fork (A) "ship concurrent run-chains.js", the orchestrator
  authors a FRESH frozen BUILD run (new `plan_hash`) FROM these findings — concurrent dispatch in
  all four `run-chains.js` editions (root + codex byte-identical + gitlab/gitea rename-normalised),
  `test-run-chains.js` coverage, all four `npm run test:kaola-workflow:*` chains green (#307). On
  fork (B) the run terminates with D-528-01 as a docs-only record (zero code blast radius, no #307
  obligation), exactly as D-526-01 (existing) did for C3.
