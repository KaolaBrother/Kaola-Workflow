# Workflow Plan — bundle-585-590

<!-- plan_hash: 3465fc9f8bef3ff6b1885583b802d5357d304075dd5dd635857f2726c302e922 -->

Same-scope bundle of two crash/concurrency-safety fixes in the scheduler's mutation paths.

**#590 (bug, LOW severity, asymmetric hazard):** serial `runOpenNext` flips the ledger row to
`in_progress` BEFORE recording the node baseline (`spliceLedgerNode` write at the plan, then
`commit-node --start`) — the inverse of the crash-safe ordering `runOpenReady` deliberately uses
(Phase 2 baseline on disk, Phase 3 single plan write). A crash in the window leaves `in_progress`
with no baseline; `reconcile-running-set` does not cover the serial path, so a later close refuses
`baseline_missing`. Fix: reorder baseline-first (an orphaned baseline is harmless — recordBase is
idempotent/overwriting on the next open), and sharpen the `baseline_missing` operator hint to name
the idempotent `open-next` re-invoke as the repair if the current hint text is judged insufficient.

**#585 (enhancement):** scheduler mutual exclusion is ADVISORY-ONLY — Layer-3 coordination is a
pure read (`probeCoordination`) + in-memory refusal (`coordinationRefusal`); every durable-state
mutation is an unlocked whole-file read-modify-write; `writeFileAtomicReplace` is atomic per file
but has no compare-and-swap. Two concrete lost-update races: concurrent `open-ready`×2
(double-open, or an `in_progress` ledger row invisible to `reconcile-running-set` because
`running-set.json` holds only the last writer's set) and concurrent `close-node`×2 (second
whole-file plan rewrite clobbers the first member's `complete` flip). Fix direction (issue-preferred
option a): a project-scoped lockfile acquired O_EXCL before any mutating subcommand body, with
stale-PID takeover so a crashed holder never wedges the project, and a typed emit-envelope refusal
on contention. The RED-first proof is the suite's missing genuine two-process race test
(`Promise.all` of two real subprocesses on one project, `open-ready`×2 and `close-node`×2).

Behavioral acceptance guard for BOTH: single-orchestrator serial invocation is behaviorally
UNCHANGED (existing `test-adaptive-node.js` + walkthrough green); a crashed lock holder must not
permanently wedge a project. Cross-edition (#307): `kaola-workflow-adaptive-node.js` is a
GENERATED_AGGREGATOR (canonical + codex byte-twin + gitlab/gitea rename-generated forge ports);
`kaola-workflow-adaptive-schema.js` is the byte-identical-×4 drift anchor (canonical name in all
four trees) — all four `npm run test:kaola-workflow:*` chains must be green (run sequentially)
before finalize.

## Meta

labels: bug, enhancement, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-lock-design | code-architect | — | — | 1 | sequence | opus |
| n2-impl | tdd-guide | n1-lock-design | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow/scripts/kaola-workflow-commit-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-commit-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-commit-node.js, scripts/test-adaptive-node.js, scripts/test-commit-node.js | 14 | sequence | opus |
| n3-adversarial | adversarial-verifier | n2-impl | — | 1 | sequence | opus |
| n4-docs | doc-updater | n2-impl | CHANGELOG.md, docs/decisions/D-585-01.md, docs/decisions/D-590-01.md, docs/architecture.md, docs/api.md, docs/workflow-state-contract.md, docs/plan-run-cards/frontier-batch.md | 7 | sequence | sonnet |
| n5-review | code-reviewer | n3-adversarial, n4-docs | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### DAG shape / scheduling rationale
- **Why ONE implement node for two issues (n2-impl):** both fixes edit the SAME generated
  aggregator `kaola-workflow-adaptive-node.js`. A generated aggregator + its codex twin + forge
  ports must move atomically in one node (generated_port_split wall), and a forge-port write must
  be downstream of ALL root edits (forge-port ordering wall) — two sequential nodes each carrying
  the ×4 aggregator set are therefore out of grammar by construction (the earlier node's port
  writes can never be downstream of the later node's root edit). The sanctioned shape is one
  atomic implement node. Inside n2 the work is internally sequenced with SEPARATE evidence
  sections per issue: #590 RED → GREEN first (small, contained reorder), then #585 RED race tests
  → lock (so the race tests run against the already-corrected serial path).
- **n3-adversarial ∥ n4-docs (antichain):** both depend only on n2; n3 is read-only, n4 writes
  docs only. Allowband surfaces (CHANGELOG.md, docs/**) are declared on exactly ONE leg (n4) of
  this parallel group. n5 (code-reviewer) then post-dominates every code-producing node (n2, n4)
  on every path to the sink — G1.
- No security-reviewer (no security label; this is crash-safety hardening of workflow-internal
  state files, not a sensitive surface). No main-session-gate (every acceptance check — chains,
  race tests, walkthrough — is delegable). No knowledge-lookup (all behavior confirmable locally:
  Node fs O_EXCL semantics are already used in-repo by `writeFileAtomicReplace`'s `'wx'` open).
- speculative_open_policy stays default-off: no read-only node has a sole-gate unsatisfied
  predecessor (n3's predecessor n2 is an implement, not a gate).

### n1-lock-design (code-architect, opus, read-only) — the #585 decisions that constrain n2
Produce a written spec in evidence covering, at minimum:
1. **Lock placement.** The issue-preferred option (a): project-scoped lockfile acquired with
   O_EXCL before any mutating subcommand body — covering the multi-file ledger + running-set
   transaction (option (b) generation-CAS alone still allows interleaving between the two files).
   Decide WHERE acquisition lives. HARD CONSTRAINT: `scripts/test-adaptive-node.js` drives most
   subcommands through an in-memory harness (`rsHarness`, fake `/p/...` paths, injected
   `readFile`/`writeFile`/`cacheExists`/`shell`) — a lock that does real fs I/O inside the exported
   `run*` functions would break hundreds of green assertions or silently no-op. Candidate shapes:
   acquire in the CLI `main()` dispatch boundary around mutating subcommands (exported functions
   stay lock-free; every real process goes through `main()`), or an injectable lock hook on `opts`
   defaulting to the real implementation. The design must state which subcommands acquire the lock
   (the mutating set: open-next / open-ready / close-node / close-and-open-next / record-evidence /
   reconcile-running-set / write-halt / clear-halt / repair-node / reopen-node / revert-overflow —
   n1 verifies this inventory against the actual dispatcher) and which stay lock-free (read-only:
   orient / status-class subcommands).
2. **Lock file location + format.** Natural home: `kaola-workflow/{project}/.cache/` next to
   `running-set.json` (barrier-invisible under the `kaola-workflow/{project}/**` allowband).
   Content: holder PID + timestamp (+ hostname if cheap) for the stale probe.
3. **Stale-PID takeover semantics.** `process.kill(pid, 0)` probe (mind EPERM = alive); dead
   holder → takeover that cannot double-grant (e.g. unlink-then-O_EXCL-retry: two racers both
   unlink, only one wins the `'wx'` open; the loser gets EEXIST and refuses). A crashed holder
   never permanently wedges the project — that is an acceptance criterion.
4. **Typed contention refusal.** Emit-envelope style (a typed `reason`, e.g. `scheduler_lock_held`,
   carrying holder PID/age + an operator hint via adaptive-node's OPERATOR_HINT_REGISTRY), never a
   raw error. No forge tokens in hint text.
5. **Helper placement.** Lock helpers in `kaola-workflow-adaptive-schema.js` (the ×4 byte-identical
   drift anchor, where `writeFileAtomicReplace` lives — avoids a new-file registration surface);
   wiring in `kaola-workflow-adaptive-node.js`. Additive only: existing contract-validator needles
   (`writeFileAtomicReplace`, `OPERATOR_HINT_REGISTRY`, guard-prologue pins) must keep matching.
6. **Deterministic RED race test shape.** How `Promise.all` of two real `node` subprocesses on one
   real temp project deterministically exhibits the lost update / double-open against current code
   (`open-ready`×2 and `close-node`×2) — e.g. a test-only env-var delay seam between read and
   write, or an eventual-consistency assertion robust to interleave variance; and how the same test
   goes GREEN post-fix (one process wins, the other returns the typed contention refusal or a
   correct post-state). Flaky-by-timing tests are not acceptable; the suite already contains
   real-subprocess `execFileSync` blocks to pattern-match.
7. **Ratify the #590 reorder:** baseline-first inside `runOpenNext` (mirror `runOpenReady`
   Phase 2 → Phase 3); confirm no interaction with the lock wrapping the subcommand body, and
   confirm the orphaned-baseline-on-flip-failure claim (recordBase idempotent/overwriting).

### n2-impl (tdd-guide, opus) — both fixes, internally sequenced, per-issue evidence
**Part 1 — #590 reorder (do first):**
- RED: a simulated crash between the ledger flip and the baseline record (fault-injection seam or
  hand-built state, matching the suite's existing crash-window style) currently yields the
  `baseline_missing` dead-end narrative; after the fix the same crash point leaves a pending
  ledger row + recorded baseline (clean re-open). Post-fix invariant: NO state where the ledger
  says `in_progress` but no baseline exists on the serial path.
- Reorder `runOpenNext`: shell `commit-node --start` (baseline on disk) BEFORE the
  `spliceLedgerNode` plan write. Keep the post-open steps (timing, provenance, evidence seed,
  dispatch descriptor) semantically unchanged. Serial-path behavior otherwise byte-identical.
- The `baseline_missing` operator hint lives in `scripts/kaola-workflow-commit-node.js`
  OPERATOR_HINT_REGISTRY and already names open-next ("Run open-next first, or ... repair-node");
  sharpen it to name the idempotent `open-next` re-invoke as the serial-path repair ONLY if the
  current text is judged insufficient against the issue's AC. The commit-node edition set (×4, a
  GENERATED_AGGREGATOR) + `scripts/test-commit-node.js` are declared so this optional hint edit
  stays in-set; if the hint is left untouched those declared files are simply not written
  (declared-but-unwritten is legal; the barrier refuses only out-of-set writes).

**Part 2 — #585 lockfile (implements exactly the n1 spec):**
- RED: the genuine two-process interleave test (`Promise.all` of two real subprocesses on one
  project) for `open-ready`×2 and `close-node`×2, observing a lost update or double-open against
  current code; GREEN with the lock (winner proceeds, loser gets the typed refusal).
- Acceptance: (1) races closed; (2) crashed holder → stale takeover works (test: write a lock file
  with a dead PID, next invocation takes over); (3) existing suite + walkthrough green (serial
  behavior unchanged — the lock is acquired/released around each single invocation); (4) the
  contention refusal is a typed emit-envelope reason with an operator hint.
- Opus tier: concurrency-primitive code (O_EXCL, takeover races, EPERM-alive probes) plus a
  deterministic two-process race test is reasoning-bounded work with high rework cost; the serial
  path every run depends on must stay behaviorally identical.

**Cross-edition mechanics (both parts):**
- After editing canonical, regenerate forge ports via `npm run sync:editions` (the gitlab/gitea
  `kaola-{forge}-workflow-{adaptive-node,commit-node}.js` files are generated, never hand-edited)
  and byte-copy the codex twins; `kaola-workflow-adaptive-schema.js` moves as a byte-identical ×4
  group (canonical name in ALL four trees — it is NOT forge-renamed). `edition-sync.js --check` +
  `validate-script-sync.js` must pass before the node closes.
- Runtime lock files are created under `kaola-workflow/{project}/.cache/` at TEST time inside temp
  projects only; nothing outside the declared write set is committed.

### n3-adversarial (adversarial-verifier, opus, read-only) — attack both fixes
Refute, at minimum: (a) a two-racer stale-takeover double-grant window; (b) lock leak on a
non-crash error path (refusal mid-body) wedging the NEXT invocation; (c) the in-memory harness
silently bypassing the lock such that the new tests never exercise production acquisition; (d) the
race tests passing against PRE-fix code (i.e. not genuinely RED-first — verify by reasoning over
the test structure and the recorded RED evidence); (e) the #590 reorder leaving any crash point
where the ledger says `in_progress` with no baseline on the serial path; (f) any serial-path
behavior change (envelope shape, exit codes, refusal reasons) the suite would miss. Bash is
available: may re-run `node scripts/test-adaptive-node.js` or targeted repros read-only.

### n4-docs (doc-updater, sonnet)
- `CHANGELOG.md` under `[Unreleased]` `### Fixed`: one entry per issue (#590 reorder; #585 lock),
  each recording the cross-edition four-chain obligation and the decision-record pointer.
- `docs/decisions/D-590-01.md` + `docs/decisions/D-585-01.md` (both series empty — next free;
  verified against docs/decisions/ on 2026-07-02).
- `docs/architecture.md` + `docs/api.md`: the scheduler's mutual-exclusion story changes from
  advisory-only to lock-enforced — update the guard-prologue / running-set descriptions and the
  typed-reason inventory where they enumerate refusal reasons.
- `docs/workflow-state-contract.md`: document the new lock file under
  `kaola-workflow/{project}/.cache/` (transient runtime artifact, holder PID + stale takeover).
- `docs/plan-run-cards/frontier-batch.md`: the running-set CLI operator card — add the contention
  refusal + repair to its reason-code coverage if it enumerates them.
- Do not touch the 6 routing surfaces (commands/skills): no card pointer, PIN, or routing prose
  changes — pure behavior hardening beneath the existing CLI surface. If n4 discovers an assertion
  surface pinning changed prose, that is a finding to route back, not a silent extra write.

### n5-review (code-reviewer, opus) — G1 gate
Post-dominates n2 and n4. Verifies: RED-first evidence for both issues; serial-path
behavior-unchanged claim; edition parity (edition-sync --check, validate-script-sync green); all
four chains green (run sequentially; on this box use KAOLA_RUN_CHAINS_CONCURRENCY=serial if
run-chains.js is used — the auto concurrency SIGKILLs the octopus-merge test in
test-adaptive-node.js); docs match the shipped behavior; no contract-validator needle broken.

### n6-finalize (sink)
Docs/state bookkeeping only (CHANGELOG touch-ups if attribution requires); the four-chain #307
evidence must be recorded before finalize per the validation_command above.

## Node Ledger

| id | status |
| --- | --- |
| n1-lock-design | complete |
| n2-impl | complete |
| n3-adversarial | complete |
| n4-docs | complete |
| n5-review | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-lock-design) | subagent-invoked | evidence-binding: n1-lock-design be9697048080 | |
| tdd-guide (n2-impl) | subagent-invoked | evidence-binding: n2-impl 2e467ae3f30b | |
| adversarial-verifier (n3-adversarial) | subagent-invoked | evidence-binding: n3-adversarial b3c5c502f2d0 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 923f189abddf | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 97bff48da5a7 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 26f97586c40f | |
