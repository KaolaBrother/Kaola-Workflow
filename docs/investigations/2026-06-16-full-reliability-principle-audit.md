# Full Reliability + Design-Principle Audit — 2026-06-16

**Question asked:** Is Kaola-Workflow *reliable and concrete*, and have the
design *principles/goals been achieved without compromise*?

**Method:** 13 independent audit dimensions, each run as a finder → adversarial
verifier (refute-if-uncertain, read-only) → completeness-critic sweep, via the
`Workflow` orchestrator. ~94 subagents, ~5.6M tokens. The 5 HIGH and the
security/compliance MEDIUM citations were re-checked by hand against source.
Dimensions: fail-closed gates, atomicity/crash-safety, agent-owns-reasoning
(#44), planner-first/consent (#287), **parallel-write concreteness (#463)**,
cross-edition parity (#307/#400), durable-state contract, design-theory
precedence, DAG-grammar soundness, resume safety, test-coverage honesty,
inert-scaffolding sweep, and the **non-adaptive (fast/full) lane**.

---

## Executive verdict

**Concrete? — Yes.** The core machinery is genuinely built and tested, not
scaffolding. The durable-write primitive (tmp+fsync+atomic-rename), two-phase
manifests, reconcile crash-coverage, the cycle/sink/disjointness/post-dominance
validator, the governance two-phase ack, and — most importantly given its
history — the **#463 close-side parallel-write engine** (octopus merge, per-leg
barrier, parent-clean fence, the commit-based union barrier "B1" fix) are all
real executable git operations with repeatable real-git tests
(`test-adaptive-node.js` SYNTH-*/LEG-BARRIER-*/PARENT-CLEAN-*). The
"closed-COMPLETED-with-inert-scaffolding" relapse did **not** recur for the
engine internals.

**Reliable? — Mostly, with real fail-OPEN holes.** The *default* configuration
sits on the accuracy-first serial fallback and holds under adversarial probing.
But verification confirmed **0 critical, 10 high, ~16 medium** findings — and
two-to-three of the highs are **default-path reachable** (the sink transaction
and the worktree-clean guard), i.e. reachable in a normal run, not only under
opt-in toggles.

**Principles without compromise? — No, but the breaches are characterizable and
fixable, and none is a default-reachable *correctness* loss in the core
executor.** Precedence-by-precedence:

| Principle | Holds? | Where it breaks |
|---|---|---|
| **1. Accuracy non-negotiable / gates fail closed** | Core: yes. Edges: no. | A recurring *fail-open* anti-pattern: an opaque/transient fault is treated as a determinate green or a determinate refuse. Worst case resolves toward irreversible action (worktree removal, false `status:sinked`). |
| **2. Automation & efficiency / faithful decomposition** | Partially — goal shipped but partly **dormant** | The write-parallelism *makespan lever* (#463/#378's headline) is largely **inert on the live path**: the overlap-relaxation tier never receives consent, and leg-isolation / speculative-open are wired in code but invoked by **zero** live skill/command prose. Disjoint co-open + the AC18 probe do work; the rest is reachable only via tests or undocumented env toggles. |
| **3. Cheapest sufficient mechanism** | Mostly yes | One inversion: write parallelism engages on `KAOLA_LANE_CONTAINMENT` alone while the isolation that makes it *safe* is a separate toggle — accuracy traded for makespan under a documented misconfiguration. |

---

## The cross-cutting anti-pattern (root cause of most HIGHs)

> **An opaque or transient fault is collapsed into a determinate outcome, with
> no retry, no structured signal, and no escalation valve.**

It appears on both sides of the fail-closed line:

- **Toward a wrong "green":** `assertWorktreeClean` treats a `git status` throw
  as *clean* and proceeds to a destructive `git worktree remove --force`
  (gates-01). `--sink` swallows `push_main` and `closure` failures and still
  reports `status:sinked` (atomicity-01, completeness gap#1).
- **Toward a wrong "refuse":** the front-door classifier subprocess fault is
  collapsed into one un-retried `target_unavailable`, killing the run with no
  consent valve (#495, already filed). Its safe-direction sibling refuses
  `plan_integrity_failed` on a transient validator crash (gates-03).

The shared fix shape is the project's own bounded-repair-then-escalate
discipline (cf. `test_thrash`/`merge_conflict`): **classify the error, retry the
transient class in-script, and surface a distinct indeterminate signal** —
never silently promote a fact to a determinate verdict.

---

## HIGH findings (verified)

| # | Finding | Reachability | file:line | Right-sized fix |
|---|---|---|---|---|
| H1 | `assertWorktreeClean` fails **open** on a transient `git status` fault, immediately before destructive `git worktree remove --force` | **default-path** | `kaola-workflow-sink-merge.js:172-175` | Invert the catch: a probe that cannot *prove* clean ⇒ refuse (treat as dirty). ~1 line; optional single retry. Not a retry framework. |
| H2 | `--sink` swallows `push_main` **and** `closure` (incl. bundle members) failures, marks the step done, and reports `status:sinked`; the emit lacks `remote_issue_closed`; `closure-audit.js` (the backstop) is wired into **zero** live path | **default-path** | `kaola-workflow-sink-merge.js:966-996, 1047-1057`; `SINK_STEPS:648` | On hard failure, do **not** `stepDone`; record `remote_issue_closed`/push outcome in the receipt mirroring `postMergeCleanup:566`; surface non-`closed` in the emit so the caller can detect/retry. Decide whether to wire or delete `closure-audit.js`. |
| H3 | Front-door classifier subprocess fault → un-retried hard refuse, no consent valve (+ bundle amplifier) | default-path | `kaola-workflow-claim.js:690-692, 1172-1182` | **Already filed as #495** — extend, do not duplicate. |
| H4 | Write co-open engages on `KAOLA_LANE_CONTAINMENT` alone; with leg-isolation off the per-leg barrier + parent-clean fence are skipped and the **snapshot union barrier is attribution-blind** — a cross-member overwrite passes `group_passed` (even under serial dispatch). `Math.max(2,…)` overrides an explicit cap=1. Docs name only `KAOLA_LANE_CONTAINMENT`. | **toggle-gated** (opt-in misconfig) | `kaola-workflow-adaptive-node.js:3815, 3826, 3899, 4394-4421`; `hooks/kaola-workflow-write-lane.sh:90,102-119`; `commands/kaola-workflow-plan-run.md:129-130` | Cheapest: **gate co-open on leg-isolation too** (serial-degrade writers when isolation is off) + fix the docs + drop the cap-floor when the operator set 1. Deeper alternative (not required): make the union barrier attribution-aware. |
| H5 | Serial resume / `open-next` path has **no `plan_hash` integrity gate**; a post-freeze content tamper is dispatched. Recovery card cites orient fields (`plan_frozen`, `resume_state`) that orient never emits, so the human backstop is broken. | requires post-freeze tamper | `kaola-workflow-adaptive-node.js:1631, 3283-3288`; `docs/plan-run-cards/resume.md` | Add the `--resume-check` integrity layer to `open-next` (or make `orient` *refuse* on tamper, not advise); align `resume.md` to orient's real fields. |
| H6 | `FOREIGN_ARCHIVE` Phase-6 staging guard (a fail-closed bash-in-markdown gate) has **zero coverage** — not executed by any test, not even substring-pinned in any of the 4 contract validators. It already shipped a fail-open regression once (#294). | latent / coverage | `commands/kaola-workflow-finalize.md:662-669` (+ gitlab/gitea) | Add a substring pin in the contract validators (the #492 pattern) + a `test-bash-block-guards` case. Grouped with the coverage-honesty issue. |

*(H3 = existing #495.)*

---

## MEDIUM findings (verified)

| # | Finding | file:line | Right-sized fix |
|---|---|---|---|
| M1 | `SENSITIVE_PATTERNS` omit CI/CD (`​.github/workflows`, `.gitlab-ci.yml`) and dotfile-secret (`.env`, `Dockerfile`) paths, so the G2 security gate has no target for a CI-poisoning / secret-leaking edit on a non-`security`-labeled issue | `kaola-workflow-plan-validator.js:248-255` | Extend the pattern list with the CI/deploy/env path families. |
| M2 | `roadmap generate` overwrites the mirror with "No active work" when `.roadmap/` exists **but is empty** (the missing-source guard keys on dir-existence, not source-count) | `kaola-workflow-roadmap.js:113-122` | Broaden the guard to refuse when sources=0 but the prior mirror had active rows. |
| M3 | `resume` without `--project` silently selects the alphabetically-first active folder — a hidden script *selection* (violates #44) | `kaola-workflow-claim.js:1386` | Typed `resume_ambiguous` refusal when ≥2 active folders and no `--project`. |
| M4 | Fast-path Finalization has **no fail-closed compliance backstop** (asymmetric with the full path): `summary-write --verdict PASSED` accepts an N/A-without-skip-reason code-reviewer row and **fabricates** an affirmatively-green `code-reviewer\|invoked` default row; `delegationPolicyCompliance` is **default-permissive** (`ok:true` when `delegation_policy` absent, which `claim.js` never writes) | `kaola-workflow-fast-advance.js:257-261,473-498`; `kaola-workflow-repair-state.js:226-228`; `commands/kaola-workflow-finalize.md:439-448` | Call `unresolvedCompliance` in the fast summary-write/finalize path (the full path already does); make the default row neutral/pending, not green; fail-closed when delegation policy is required but absent. |
| M5 | `write_overlap_policy` relaxation (`writeOverlapRelaxable`) is **unreachable on the live path** — `tryFormLaneGroup` never forwards `--write-overlap-consent`. The coarse/shared-infra co-open win is dead except in tests. (Disjoint co-open + AC18 are unaffected.) | `kaola-workflow-adaptive-node.js:3351` | Part of the inert-levers decision issue (wire or relabel). |
| M6 | Selector-arm `n/a` flip is a **separate write** after the selector node is marked `complete`; a crash between can leave dead arms `pending` and (pending confirmation that next-action surfaces un-armed arms) dispatch the not-chosen branch | `kaola-workflow-adaptive-node.js:2016-2017, 2071-2096` | Fold the arm-flip into the same atomic plan write as the complete-flip, or re-derive on resume. *Caveat: trigger has one unconfirmed dependency — file as medium-with-caveat.* |
| M7 | `test-route-reachability` T5 (the 6-surface #400 propagation gate) **self-disarms**: if the PIN is absent from *all* 6 surfaces it downgrades to a non-blocking `console.warn` | `scripts/test-route-reachability.js:152-169` | Flip the else-branch to a hard assert (require ≥1 pin to exist). Grouped with the coverage-honesty issue. |
| M8 | Hand-ported forge data-layer ports (claim/sink-merge/classifier/roadmap/repair-state/…) have **no systematic shared-function-presence guard** — only ad-hoc token pins. A future edit dropping a shared safety guard in one forge port passes all four static chains. *(Rescued from a vocabulary-collision REFUTED bucket; the verifier confirmed the structural claim is true.)* | `scripts/edition-sync.js`, `scripts/validate-script-sync.js` | Grouped with the coverage-honesty issue: generalize the #492 pin approach (assert shared function names present in each forge port). |
| M9 | `sectionBody` heading-locator is fence-blind (diverges from `locateSection`); a fenced `## Nodes`/`## Meta` example corrupts the parse | `kaola-workflow-classifier.js:180-207` | Add fence tracking to the locator (mirror `locateSection`). *Fails closed (spurious refusal), so authoring-footgun severity.* |

---

## Verified-SOUND (what is genuinely solid — recorded to counter over-correction)

- **#463 engine internals are real and tested**: commit-based union barrier (the
  B1 fix) diffs the merge *commit* with no-silent-loss ancestor inclusion
  (`plan-validator.js:2255-2284`); disjoint merges are mechanical (no agent), the
  synthesizer is reserved for real conflicts with the Opus reasoning floor
  enforced at the dispatch chokepoint; leg barrier / parent-clean fence /
  leg-aware reconcile are repeatably tested.
- **Selection (#44)**: `cmdStartup`/`cmdBootstrap`/`cmdPickNext`/`claimExplicitTarget`/bundle
  all require an explicit target, validate the exact target, and emit typed
  refusals — no auto-pick, no silent substitution. (The lone exception is M3.)
- **Planner-first (#287)**: `planner_control_boundary_violation` is prose-only —
  no approval gate is bolted onto the planner; write-halt reasons are all
  value/standing/thrash escalations, never raw facts.
- **Atomicity spine**: one fsync+tmp+rename primitive backs every durable write;
  manifests/running-set use two/three-phase markers; sink-receipt is atomic with
  a crash-injection test hook; the per-node baseline barrier fails closed on
  every torn-baseline scenario.
- **Grammar/validator**: no malformed plan (cycle, orphan, escaped write-set
  overlap, missing post-dominator, bypassed hash) could be constructed to pass;
  `verifyGateExecution` re-derives coverage at the Phase-6 merge gate (a runtime
  backstop behind the freeze).
- **Injection surface**: `execFileSync` argv everywhere, `assertSafeBranchArg`,
  the #398.2 newline-injection guard, numeric issue parsing, fixed-string awk in
  the #294 archive guard.
- **Default config is accuracy-first**: both write-parallelism toggles and
  speculative-open default OFF; write-role frontiers serial-degrade
  byte-identically to the pre-parallelism behavior (PREC-7).
- **Autopilot `auto`** forces a plan re-freeze (the write-set edit changes the
  `plan_hash`-covered region → re-validation incl. SENSITIVE_PATTERNS +
  disjointness) and halts on value/ambiguous classes (NA-5).

---

## Hardening backlog (report-only — not worth a separate issue)

- `record-base` writes the gc-anchor, `.cache` base SHA, and open-token as
  separate non-atomic `writeFileSync` calls (recoverable via `barrier_base_mismatch`)
  — `atomicity-04/05/06`.
- Batch `seal`/`seal-member` appends a compliance row unconditionally; a re-seal
  after a seal-crash duplicates the row (serial close guards this; batch does not).
- `fast-audit` `parseReviewMode` falls through to `self-review` on a garbled row —
  **report-only** (`process.exit(0)`, no gate consumes it), observability drift (NA-6).
- T4 content-reachability pins are bare substring `.includes()` — pass vacuously
  if the token appears in a comment (`TH-3`).
- Per-leg routing is orchestrator-prose discipline (`dispatch.working_dir` is
  null); backstopped by the parent-clean fence **only when legs are live**
  (`PARALLEL463-003`). AC18 concurrency proof is one-time / non-repeatable
  (`PARALLEL463-004`).
- `fast/full/phase4-advance` carry a *duplicate* private `writeFileAtomic`
  instead of the shared primitive — a 4-edition drift trap (currently correct).
- Autopilot logs `repair_applied` to the digest *before* the operator applies the
  edit — a crash between can miscount the repair bound (`NA-4`).
- #379 map dynamic fan-out and the `auto`/`exact` policies are **honestly
  labeled designed-but-deferred** (freeze-refused) — *working as intended, not
  filed* (inert-5).

---

## Coverage & limits

- Coverage was initially adaptive-path-heavy; the non-adaptive (fast/full) lane
  and the #463 dimension were added in follow-up passes, so all 13 dimensions
  are represented.
- Findings are source-derived. Two dimensions rest partly on runtime behavior
  that source cannot fully pin (AC18 wall-clock concurrency; M6's next-action
  arm-surfacing) — flagged in-place.
- Not exercised end-to-end on a live multi-issue run: this audit is static +
  targeted real-subprocess probes, not a full live regression.

---

## Filed issues

Filed against `KaolaBrother/Kaola-Workflow`, 2026-06-16. #495 (front-door
classifier consent valve) pre-existed and was **extended** (comment) rather than
duplicated. Findings were grouped by root mechanism, not one-per-symptom; low /
hardening items live in the appendix above, not as issues.

| Issue | Finding | Severity |
|---|---|---|
| [#495](https://github.com/KaolaBrother/Kaola-Workflow/issues/495) (extended) | H3 — front-door classifier subprocess fault swallowed; bundle amplifier; safe-direction sibling | HIGH |
| [#496](https://github.com/KaolaBrother/Kaola-Workflow/issues/496) | H1 — `assertWorktreeClean` fail-open before destructive worktree removal | HIGH (default-path) |
| [#497](https://github.com/KaolaBrother/Kaola-Workflow/issues/497) | H2 — `--sink` swallows push_main/closure → false `status:sinked`; `closure-audit.js` unwired | HIGH (default-path) |
| [#498](https://github.com/KaolaBrother/Kaola-Workflow/issues/498) | H4 — containment-only write co-open; attribution-blind union barrier; cap-floor; docs | HIGH (toggle-gated) |
| [#499](https://github.com/KaolaBrother/Kaola-Workflow/issues/499) | H5 — serial resume/open-next skips plan_hash integrity; recovery-card drift | HIGH (requires tamper) |
| [#500](https://github.com/KaolaBrother/Kaola-Workflow/issues/500) | M5 — parallel-write makespan levers inert on live path (decision: wire or relabel) | efficiency-goal |
| [#501](https://github.com/KaolaBrother/Kaola-Workflow/issues/501) | M1 — `SENSITIVE_PATTERNS` omit CI/dotfile → G2 dodgeable | MEDIUM |
| [#502](https://github.com/KaolaBrother/Kaola-Workflow/issues/502) | M2 — `roadmap generate` overwrites mirror on present-but-empty `.roadmap/` | MEDIUM |
| [#503](https://github.com/KaolaBrother/Kaola-Workflow/issues/503) | M3 — `resume` without `--project` silently first-picks a folder (#44) | MEDIUM |
| [#504](https://github.com/KaolaBrother/Kaola-Workflow/issues/504) | M4 — fast-path Finalization has no fail-closed compliance backstop | MEDIUM |
| [#505](https://github.com/KaolaBrother/Kaola-Workflow/issues/505) | H6/M7/M8 — uncovered fail-closed guards + parity-enforcement gaps | MEDIUM (H6 latent-HIGH) |

Not filed (deliberate): #379 map fan-out and the `auto`/`exact` policy tiers are
honestly-labeled designed-but-deferred (working as intended); M6 (selector-arm
non-atomic) and M9 (fence-blind locator, fails closed) and the hardening backlog
are recorded here for context, not as standalone issues.
