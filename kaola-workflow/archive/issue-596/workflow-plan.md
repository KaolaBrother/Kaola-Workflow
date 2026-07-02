# Adaptive Workflow Plan — issue-596

<!-- plan_hash: cfce5ef70af02f74c3a5a419e786054e326aab9126883e447d6c2fbdf2c282a2 -->

feat(adaptive/scheduler): graduate the deferred speculative-WRITE half onto the leg
machinery — a write node whose only unsatisfied dependency is an in-progress gate opens
speculatively in an isolated leg; gate pass → the leg merges through the existing per-leg
barrier → octopus path; gate fail → the leg is torn down (write members are discard-only)
and the parent worktree is never touched.

## Meta

labels: enhancement, area:scripts, area:workflow-phases

validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

Extends the shipped speculative-READ kernel (D-419-02 (existing) Part 4) to write-bearing nodes. The
deferral's original blocker — a git-level revert of speculative writes in the PARENT worktree —
is obsolete now that per-leg worktree isolation (ADR-0010) is live: for a leg-resident
speculative writer, discard = do-not-merge-the-leg + tear-it-down + reset-the-ledger-row; the
parent is never written, so there is nothing to revert. The remaining work is wiring existing
machinery together, split static-vs-runtime exactly like normal write co-open:
- STATIC (next-action.js, ×4 editions): lift the single `isReadOnly` exclusion so a write-bearing
  node becomes `speculativePending`-eligible when — policy authorizes; pending and not normally
  ready; exactly one unsatisfied direct dep = an in-progress gate-verdict-role node; declared set
  EXACTLY resolvable (concrete paths, no directory/glob); NO PROTECTED file; not the sink. Members
  carry their declared set for the runtime side. Byte-identical shape at `off` (the flag-off
  invariant is preserved: `speculativePending` stays omitted).
- RUNTIME (adaptive-node.js, ×4 editions): `open-ready --speculative-consent` re-verifies exact-path
  disjointness (case-folded) against every currently-open write node via the SAME authoritative
  predicate normal co-open uses (the validator `--parallel-safe` path; post-#593 exact granularity),
  requires leg capability, provisions a leg (base = parent HEAD at open), marks the running-set entry
  `speculative: true` + `speculativeGate` + leg fields, and counts against the write fan-out / lane
  ceiling like a normal write member. `speculativeCloseGuard` is UNCHANGED (it already keys on
  `speculative: true` role-agnostically, so a speculative writer cannot reach `complete` before its
  gate — close-fence / G1 post-dominance preserved exactly). Gate pass → close flows through the
  existing per-leg barrier → merge (a real textual conflict fails closed at the existing merge-conflict
  refusal and the node redoes serially — no new merge code). Gate fail → `discard-speculative` is
  extended to tear down the leg (worktree + branch + leg-base ref via the existing teardown;
  `sweepOrphanLegs` crash-backstop) in ADDITION to its ledger-reset / baseline-drop / evidence-discard;
  write members are DISCARD-ONLY on fail (asymmetry with reads, on purpose — code on a refuted premise
  is rework risk and the repaired upstream may void the leg base). `reconcile-running-set` gains the
  crashed-speculative-write arm: roll-forward ONLY if the gate is complete with `verdict: pass`,
  else roll back via the same discard path (idempotent; orphan sweep covers a half-provisioned leg).

Cross-edition ×4 aggregator diff (`next-action.js`, `adaptive-node.js`, and the `plan-validator.js`
hedge are all GENERATED_AGGREGATORS): the four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`
chains must be green before Finalization (run sequentially — `npm test` short-circuits on the first
`&&` failure). No SIX-routing-surface change is needed: the plan-run card pointer is already generic
(`covers open-ready --speculative-consent, discard-speculative, gate verdict:fail rollback`) and does
not say "read-only", so only the card body (`docs/plan-run-cards/speculative-open.md`) changes.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-impl | tdd-guide | — | scripts/kaola-workflow-next-action.js, plugins/kaola-workflow/scripts/kaola-workflow-next-action.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js, scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/test-next-action.js, scripts/test-adaptive-node.js | 14 | sequence | sonnet |
| n2-adversarial | adversarial-verifier | n1-impl | — | 1 | sequence | opus |
| n3-review | code-reviewer | n2-adversarial | — | 1 | sequence | opus |
| n4-docs | doc-updater | n3-review | docs/architecture.md, docs/api.md, docs/plan-run-cards/speculative-open.md, docs/decisions/D-596-01.md, CHANGELOG.md | 5 | sequence | sonnet |
| n5-finalize | finalize | n4-docs | CHANGELOG.md, kaola-workflow/issue-596/workflow-state.md | 2 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-impl | complete |
| n2-adversarial | complete |
| n3-review | complete |
| n4-docs | complete |
| n5-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-impl) | subagent-invoked | evidence-binding: n1-impl df9489ed7283 | |

| adversarial-verifier (n2-adversarial) | subagent-invoked | evidence-binding: n2-adversarial bf77cf161668 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 2d4237aad2af | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 430a673e5bb7 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 81814c3cdb3b | |
## Plan Notes

- **Topology (linear: implement → refute → review → document → finalize).** The work is a genuine
  dependency chain, not forced serialization. The static (next-action) and runtime (adaptive-node)
  halves are one coherent eligibility-split on cross-edition mirrors that MUST move atomically (the
  runtime consumes the static emission), so they live in ONE node — splitting would only add a serial
  edge with zero parallelism gain (no file-count ceiling forces a split). The two gates are serial
  because G1 post-dominance requires the code-reviewer to lie on every path from the code node to the
  sink; two parallel gates would open a bypass path. Docs run AFTER both gates so they document the
  fully-vetted, final machinery (doc accuracy > the modest makespan cost; a single-issue run has no
  parallel issue-work to overlap the docs against).
- **Adversarial-verifier (n2) is included on purpose.** This graduates a design DEFERRED for
  "double-gating and roll-back complexity"; the discard / reconcile / leg-teardown invariants (AC4
  parent byte-identical after discard, AC7 idempotent crash rollback with no orphan leg) are exactly
  the subtle concurrency/rollback surface where an independent refuter — read-only but with Bash, so
  it RUNS the real-git fail/crash repros — earns its serial cost. Opus on both gates; sonnet on the
  implementer, which carries out an already-detailed spec ("wiring existing machinery together"),
  with the two opus gates as the reasoning net.
- **`speculative_open_policy` is OFF (omitted).** This DAG has exactly one code-reviewer gate and it
  reviews SUBSTANTIVE NOVEL machinery — a genuinely uncertain gate, not the high-probability-pass
  (small mechanical diff) gate the speculative-open rubric requires; the only low-rework-cost
  downstream writer (n4-docs) would be betting on that uncertain gate. Forcing a speculative-write
  topology here would violate the rubric's own criteria (high-prob-pass gate AND low/bounded rework),
  so it is declined. The live end-to-end exercise that #597's precondition needs belongs to a
  naturally-suited later run (e.g. a bundle where issue B's small writer waits on issue A's small,
  high-probability-pass gate), not to the run that first ships the machinery.
- **`plan-validator.js` (×4) is a declared HEDGE.** The issue makes the validator change conditional
  ("only if the `--parallel-safe` reuse needs a speculative entry point"). The existing
  `--parallel-safe --nodes A,B[,C]` predicate is general-purpose and already reused by normal write
  co-open (`tryFormLaneGroup`), so the runtime disjointness check (candidate vs currently-open writers)
  most likely reuses it WITHOUT a new entry point. The four validator editions are declared up front
  anyway — as a GENERATED_AGGREGATOR group (all-or-none per `generated_port_split`) — so that IF a
  small speculative entry point is needed, it lands without a mid-run `write_set_overflow`; if not,
  the files are left untouched (harmless, in-sync at `edition-sync --check`).
- **Planner authoring-rubric deferred to #597.** `#596` ships the write-speculation MACHINERY behind
  the consent flag, default `off` — an experimental opt-in. The "when to author write speculation"
  guidance in `agents/workflow-planner.md` (+ its parity-locked `.toml` twins) belongs to #597 (the
  `auto`-tier default-flip / productionization, gated on this run's live proof). Touching the `.toml`
  twins would also make a doc node code-producing (`isDocsPath` classifies `.toml` as non-docs),
  breaking G1. This run keeps the MECHANISM doc accurate by updating the card
  (`docs/plan-run-cards/speculative-open.md` — a docs-path `.md`) to state that write members are now
  eligible behind consent and are discard-only on fail, framing the rubric's read-only wording as the
  conservative interim default the default-flip revisits.
- **Decision record:** `docs/decisions/D-596-01.md` is the next free number for #596 (D-593/594/595
  exist; no D-596-* yet).
- **CHANGELOG discipline:** the `[Unreleased]` entry is written by n4-docs (before Finalization runs
  the chains), so the finalize-node chain receipt is never staled by a late docs write; n5-finalize
  re-declares `CHANGELOG.md` for sink attribution (n5 is downstream of n4, so the shared declaration
  is dependency-ordered, never a concurrent-write conflict).
- **AC coverage:** AC1-8 (happy/close-fence/pass/fail/refusals/cap/crash/inertness) land as real-git
  tests in `scripts/test-adaptive-node.js` + static-eligibility units in `scripts/test-next-action.js`
  (both root-only, no forge ports); AC8 inertness re-runs the existing read-speculation tests unchanged
  at `off`. AC9 (four chains + walkthrough) is the Finalization gate; the walkthrough is inert at `off`
  and needs no edit.
