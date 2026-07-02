evidence-binding: n4-docs 923f189abddf

Documented the FINAL (post-repair, post-re-verification) semantics of #585 (scheduler
mutual-exclusion O_EXCL lock, no auto-takeover) and #590 (baseline-first `open-next`
reorder), transcribed from the real diff (`git diff scripts/kaola-workflow-adaptive-schema.js
scripts/kaola-workflow-adaptive-node.js`) and the n1/n2/n3 evidence trail (incl. the
in-run adversarial refutation of the first auto-takeover design and its repair).

## Files written (all 7 in the declared write set)

1. `CHANGELOG.md` — two new `### Fixed` entries under `[Unreleased]`, siblings of the
   existing #589 entry (inserted after it, before `## [6.17.0]`). #585 entry: root cause
   (advisory-only guard, no OS lock), the two races (open-ready×2 double-open,
   close-node×2 lost complete-flip, both 5/5 pre-fix via the `raceN` two-process harness),
   the O_EXCL lock design (acquire boundary, SPLIT_GUARDED_SUBCOMMANDS, release/exit-hook),
   the REFUTED auto-takeover history (6/500 @ N=2, 111/500 @ N=6 pre-repair; 0/500 both
   post-repair) per the #579-entry gate-catch-in-CHANGELOG precedent, the typed
   `scheduler_locked`/`scheduler_lock_stale` reasons, residual accepted risks, suite growth
   1078→1127, and the #307 four-chains-green line. #590 entry: the ledger-flip-before-baseline
   hazard, the reorder + `baseline_failed`/pending-row semantics, the new `no_barrier_base`
   hint, RED-first evidence, and the #307 line. Both cite their decision records.

2. `docs/decisions/D-585-01.md` (new) — Context (advisory-only guard + the two races),
   Decision (O_EXCL claim primitive, contention-is-typed-non-blocking-refusal, fail-closed
   no-auto-takeover, release contract) with four explicit "### Rejected" subsections
   (auto-takeover — the empirical refutation; verify-after-claim/CAS-lite; inode-verified
   rename; a dedicated takeover sub-lock) plus a "why not flock/fcntl" note (no Node-core
   binding; O_EXCL is the one dependency-free atomic primitive available). Consequences
   section enumerates the residual accepted risks (PID reuse, create-then-write-failure
   orphan window, operator-misuse cross-unlink, NFSv2 caveat) verbatim from n3's
   re-verification note.

3. `docs/decisions/D-590-01.md` (new) — Context (the crash-window hazard, why
   `reconcile-running-set` cannot cover it), Decision (the reorder + the new
   `no_barrier_base` hint), Consequences (no more orphan in_progress-without-baseline rows,
   byte-identical otherwise, orthogonal to the #585 lock), and an "Alternatives considered"
   section explaining why hint-only (the issue's own "alternatively" option) was rejected as
   insufficient on its own.

4. `docs/api.md` — added `scheduler_locked` / `scheduler_lock_stale` bullets to the
   "Mutual-exclusion + integrity reason codes (Cluster S)" list, as siblings of
   `scheduler_active`/`batch_active`; added a `no_barrier_base` hint note in the same
   refusal-vocabulary area (the reason itself is pre-existing/plan-validator-owned — only
   the adaptive-node hint entry is new); added a new "### Scheduler mutual-exclusion lock
   (`.cache/scheduler.lock`, issue #585)" subsection (right before "Speculative-read
   kernel") documenting the acquire boundary, the SPLIT_GUARDED_SUBCOMMANDS set, the holder
   JSON payload shape, the claim/classify contract, and the barrier-exempt/transient nature
   of the artifact.

5. `docs/workflow-state-contract.md` — added a `scheduler.lock` bullet to the `.cache/`
   inventory (sibling of `active-batch.json`), documenting it as a transient coordination
   artifact (holder payload `{pid, host, ts, subcommand}`), barrier-exempt, never archived
   as live state, and safe manual removal restricted to a confirmed-dead holder from one
   session.

6. `docs/architecture.md` — added two paragraphs in the running-set scheduler section
   (right after the existing "Wall-clock overlap ... never overclaim concurrency" paragraph,
   before "Coordination kernel"): one on the #585 mutual-exclusion lock (why the prior guard
   was advisory-only, what the lock wraps, the two typed refusal reasons), one on the #590
   baseline-first reorder (crash-window framing, cross-reference to open-ready's Phase 2→3
   order).

7. `docs/plan-run-cards/frontier-batch.md` — added a "**Scheduler lock contention (issue
   #585)**" note + 2-row refusal/repair table after the `open-ready` refusal-reason
   paragraph (§3), noting the lock is acquired by every subcommand on the card
   (`open-ready`/`close-node`/`reconcile-running-set`), with `scheduler_locked` → wait+retry
   and `scheduler_lock_stale` → verify-dead + one-session `rm` + re-run, cross-referencing
   D-585-01 for the rejected-takeover rationale.

## Anti-fabrication checks performed

- Read the real diffs (`kaola-workflow-adaptive-schema.js`, `kaola-workflow-adaptive-node.js`)
  directly — confirmed `SCHEDULER_LOCK_NAME`, `acquireProjectLock`/`isStaleLock`/
  `releaseProjectLock` signatures, the `main()` lock-acquire/finally-release wiring, the
  `SPLIT_GUARDED_SUBCOMMANDS` membership (`open-next`/`open-ready`/`close-node`/
  `close-and-open-next`/`reconcile-running-set`/`write-halt`/`clear-halt`/`reopen-node`/
  `revert-overflow`/`repair-node`/`route-findings`/`discard-speculative`), and the exact
  #590 reorder (baseline shell moved above the `spliceLedgerNode` flip).
- Fetched the real issue bodies (`gh issue view 585/590 --json body`) rather than relying
  on paraphrase, and cross-checked the CHANGELOG's "issue AC explicitly permits stale
  takeover OR typed operator hint" claim against the literal AC text.
- Pulled the exact empirical race numbers (5/5, 6/500, 111/500, 0/500 at N=2 and N=6, suite
  1078→1127) verbatim from n2/n3's evidence rather than re-deriving or rounding.
- Grepped all 7 written files for `scheduler_locked`/`scheduler_lock_stale` post-write to
  confirm consistent exact-token spelling everywhere (no `scheduler-lock`/camelCase drift).

## Verification

- `node scripts/validate-workflow-contracts.js` → exit 0 ("Workflow contract validation
  passed").
- `node scripts/validate-kaola-workflow-contracts.js` → exit 0 ("Kaola-Workflow Codex
  contract validation passed").
- `node scripts/test-route-reachability.js` → exit 0 ("Route-reachability test passed (185
  assertions)").
- No `scripts/` or command/skill prose files touched — only the 7 declared docs surfaces.
