# Workflow Plan — bundle 688-689-691

<!-- plan_hash: 6c241b828794e7c5a07e293b850c885f8622c26db8e78c50069cf99985034bec -->

## Meta
speculative_open_policy: auto
labels: workflow:in-progress
validation_command: npm test

## Plan Notes

**Bundle goal.** Three LOW, fail-closed / mechanical hardening follow-ups filed during recent runs,
each with the exact fix already in its GitHub body. All three are file-disjoint and internal (no
public interface, env var, script/agent registration, or forge-token change), so they ship as ONE
atomic cross-edition run:

- **#688 — fail-closed hardening of the #683 rebind-proof (four unreachable-today edges).** (1)
  `proveRebindAdmissible`'s `(ledgerStatuses || {})` default must FAIL CLOSED — refuse attribution
  when the ledger is absent instead of degrading to the pre-#683 admit-all semantics
  (`scripts/kaola-workflow-adaptive-node.js`, `const statuses = ledgerStatuses || {}` ~L1607). (2)
  the R7 owner-gate liveness quantifier `(members||[]).some(m => ledgerStatuses[m] !== 'complete')`
  must restrict to `status ∈ {'pending','in_progress'}` so a selector-pruned `n/a` gate is NOT
  treated as "will re-review" (same file). (3) a reserved-name grammar refusal for node ids at
  FREEZE in `kaola-workflow-plan-validator.js` (a node literally named `__proto__` / another
  `Object.prototype` key freezes in-grammar today, then poisons `readLedgerStatuses`' plain-object
  status map — land the fix at the grammar, noting the `readLedgerStatuses` key-drop ripple). (4)
  order-insensitive canonicalization in `isCanonicalBlobMap` (`kaola-workflow-adaptive-schema.js`
  ~L706) so a canonical-integer declared-path key (`10`, `2024`) — which JS enumerates numeric-first,
  out of insertion order — no longer fails its own enumeration-order check; sort-on-check is the
  minimal, byte-identical-preserving fix (the grammar-refusal alternative is also acceptable per AC).
- **#689 — parent-dir fsync in the fast/full/phase4 `writeFileAtomic` helpers.** The identical
  `tmp + fsync + rename` algorithm in `kaola-workflow-full-advance.js` (~L121),
  `kaola-workflow-fast-advance.js` (~L103), and `kaola-workflow-phase4-advance.js` (~L89) each fsyncs
  the tmp file but never fsyncs the PARENT DIRECTORY after `renameSync`, so a settled durable-state
  write can revert to its pre-rename entry after power loss. Apply the exact #685 shape
  (`writeFileAtomicReplace` in `kaola-workflow-adaptive-schema.js` L1337-1354): open the dir `'r'`,
  `fsyncSync` it, close in `finally`, PLATFORM FAIL-SOFT (never rethrow, never turn a previously
  accepted write into a refusal, never swallow the real rename/`ENOSPC` error).
- **#691 — barrier-ref-sweep keep-pass (c) `existsSync`→`statSync` fail-closed.** In
  `sweepBarrierRefs`'s keep-pass (c) (`kaola-workflow-claim.js` L3266-3276) the
  `if (!fs.existsSync(stateFile)) continue;` guard returns false when the state file is unreachable
  because its PARENT project directory is `chmod 000` (EACCES-through-parent), so a live project whose
  DIRECTORY is chmod-000 is dropped from the keep set and its live barrier gc-anchor reaped. Replace
  the boolean split with a `statSync` in try/catch that KEEPS on any non-`ENOENT` fault (clean
  `ENOENT` stays reapable). Tighten-only, sweep-local, only ever ADDS to keep.

### DAG shape / scheduling rationale

- **Single-writer node landing all three fixes (n1-harden).** #688, #689, #691 are pairwise
  FILE-DISJOINT and all small mechanical edits. They ship in ONE `tdd-guide` node with the union
  write set — not per-issue parallel writers under a shared gate. This is deliberate and
  non-negotiable: a bundle-wide adversarial fan-out over an ANTICHAIN of independent writers cannot
  be single-node-repaired (`repair_requires_replan`) and wedges the run; a single unique maximal
  producer makes the review + adversarial gates trivially single-writer-repairable. There is no
  file-count ceiling forcing a split, and these edits are cohesive cross-edition mirror work.
- **`tdd-guide`, RED-first per fix.** Every fix has a natural failing unit test: a synthetic
  absent-ledger `proveRebindAdmissible` call and an `n/a`-arm construction / direct-call assertion
  (#688.1/2); a `__proto__`-node-id freeze-refusal (#688.3); an integer-keyed `candidate_declared`
  that must pass `isCanonicalBlobMap` after the fix (#688.4); a parent-dir-fsync-after-rename
  assertion via the established `fs`-singleton monkey-patch seam (#689); a chmod-000 live-project
  KEEP with a clean-ENOENT-still-reapable control (#691). Test-first, GREEN after.
- **Strict serial gate chain, single-writer-repairable.** n1-harden → n2-review (code-reviewer, G1
  post-dominates the sole code-producing node) → n3-adversary (adversarial-verifier, the single
  change-gate skeptic over the one reviewed writer) → n4-finalize (unique sink). n3 depends on n2
  (never on n1) so code-reviewer post-dominance holds and n3 stays speculative-eligible under `auto`
  (its sole unsatisfied dep is the high-probability-pass review gate; both gates are read-only over
  the same n1 candidate, so a speculative overlap is a free makespan win and its evidence is
  keep-or-discard on a review fail).
- **No design node.** Every fix is already-decided (exact fix in each issue body); the direction
  lives in n1's brief. No `planner`/`code-architect`.
- **No security-reviewer (G2), no main-session-gate (G3), no knowledge-lookup, no doc-updater.**
  Labels carry no sensitivity → no G2. Every acceptance check is delegable + machine-checkable (the
  four chains, the per-helper RED tests) → no non-delegable gate. Every fact (fix sites, the #685
  reference shape, edition classifications) is confirmed locally → no knowledge-lookup. These are
  internal hardening: NO public surface, API, README, env var, or new decision record changes →
  no doc-updater. CHANGELOG lands in the finalize sink.
- **CHANGELOG in the finalize sink.** The sink writes `CHANGELOG.md` (a permitted docs write on the
  sink). CHANGELOG is not test-consumed, so writing it at finalize cannot stale the four-chain code
  receipt. Provenance (issue refs / D-683-01 (existing) / D-686-01 (existing)) belongs ONLY in CHANGELOG + commit message,
  never in the shipped script prose.

### Write-set completeness (recurring-overflow checklist, walked)

- **GENERATED_AGGREGATOR port-split (n1).** `kaola-workflow-adaptive-node.js` and
  `kaola-workflow-plan-validator.js` are both in `GENERATED_AGGREGATORS`, so each MUST declare all
  four editions: canonical `scripts/<base>`, codex twin `plugins/kaola-workflow/scripts/<base>`, and
  the renamed gitlab/gitea ports `plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{forge}-workflow-<base>`.
  Both full sets are declared (splitting them is `generated_port_split`-by-construction).
- **BYTE_IDENTICAL group (n1).** `kaola-workflow-adaptive-schema.js` is a 4-tree byte-identical group
  (same base name in all four trees, NOT renamed) — all four copies declared; the #688.4 edit must
  keep them byte-identical.
- **COMMON_SCRIPTS + RENAME_NORMALIZED forge ports (n1).** `kaola-workflow-claim.js`,
  `kaola-workflow-fast-advance.js`, `kaola-workflow-full-advance.js`, and
  `kaola-workflow-phase4-advance.js` are byte-identical claude↔codex with renamed gitlab/gitea forge
  ports — all four editions of each declared (a canonical edit regenerates the codex twin + forge
  ports).
- **Test files (root-only, n1).** `test-adaptive-node.js` (#688 all four items — it already spawns
  the plan-validator with `--freeze` and exercises `isCanonicalBlobMap`), `test-fast-advance.js`,
  `test-full-advance.js`, `test-phase4-advance.js` (#689), `test-claim-hardening.js` (#691). Tests
  are NOT edition-ported (single file each).
- **No moving contract-validator pin / registration surface.** No new script, agent, exported
  symbol, forge token, env var, or renamed file is introduced — purely internal logic + a new
  freeze-refusal reason and (optionally) a schema canonicalization. So NO `validate-*-contracts.js`,
  `validate-vendored-agents.js`, `install.sh`/`uninstall.sh`, `resolve-agent-model.js`, or
  agent-registration surface edits are required; the changes stay inside the touched files' editions.
- **`.cache` receipts** are recorded parent-side and barrier-exempt — none declared.
- **`simulate-workflow-walkthrough.js` NOT declared.** All four #688 edges are unreachable through
  the CLI today and the #689/#691 fixes are fail-soft/tighten-only, so the integration walkthrough's
  valid-plan / normal-flow paths do not change; the RED-first regressions live in the dedicated
  `test-*` files.

### Cross-edition + validation

- **Every edit is a cross-edition diff → all four chains.** `test:kaola-workflow:{claude,codex,gitlab,gitea}`
  must be green, run SEQUENTIALLY, before Finalization (a green claude chain alone is insufficient —
  `npm test`'s `&&` short-circuits). This bundle touches `test-adaptive-node.js` / the heavy
  adaptive-node + plan-validator chains, which on this box can SIGKILL the run-chains octopus merge
  under default concurrency — run the chains with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` at finalize.
- **Non-goals (writers must honor).** No change to #683 rebind semantics, the partition proof, or any
  LIVE refusal (these are strictly-tighter hardening of already-unreachable inputs). No change to the
  adaptive-path helpers #685 already fixed. `sweepBarrierRefs` change is sweep-local — do NOT alter
  the shared `readActiveFolders`.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-harden | tdd-guide | — | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-fast-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-full-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-phase4-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-fast-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-full-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-phase4-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-fast-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-full-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-phase4-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, scripts/kaola-workflow-adaptive-node.js, scripts/kaola-workflow-adaptive-schema.js, scripts/kaola-workflow-claim.js, scripts/kaola-workflow-fast-advance.js, scripts/kaola-workflow-full-advance.js, scripts/kaola-workflow-phase4-advance.js, scripts/kaola-workflow-plan-validator.js, scripts/test-adaptive-node.js, scripts/test-claim-hardening.js, scripts/test-fast-advance.js, scripts/test-full-advance.js, scripts/test-phase4-advance.js | 1 | sequence | standard |
| n2-review | code-reviewer | n1-harden | — | 1 | sequence | reasoning |
| n3-adversary | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-adversary | CHANGELOG.md | 1 | sequence | — |

## Node Briefs

### n1-harden

Land all three hardening fixes with a RED-first regression for each. The exact fix for every item is
in its GitHub issue body (`gh issue view 688 / 689 / 691`) — read them. Do NOT change #683 rebind
semantics, the partition proof, any LIVE refusal, or the #685-fixed adaptive-path helpers; these are
strictly-tighter hardening of already-unreachable inputs plus one fail-soft durability mirror.

#688 (four edges):
1. `proveRebindAdmissible` (`scripts/kaola-workflow-adaptive-node.js`, `const statuses = ledgerStatuses
   || {}` ~L1607): make it FAIL CLOSED on an absent ledger — refuse attribution when `ledgerStatuses`
   is missing rather than degrading to admit-all. RED: a synthetic absent-ledger call must now refuse.
2. Same file, R7 owner-gate liveness quantifier `(a.logical_gate.members||[]).some(m =>
   ledgerStatuses[m] !== 'complete')`: restrict to `status ∈ {'pending','in_progress'}` so a
   selector-pruned `n/a` gate is excluded. RED: a direct-call assertion (or an `n/a`-arm construction
   if reachable in the harness).
3. Reserved node-id grammar refusal at FREEZE in `kaola-workflow-plan-validator.js`: a node id that
   is a `__proto__` / `Object.prototype` key must be refused in-grammar (land at the grammar, mind the
   `readLedgerStatuses` key-drop ripple). RED: a plan with a `__proto__` node id must refuse at freeze.
4. `isCanonicalBlobMap` (`kaola-workflow-adaptive-schema.js` ~L706): make the enumeration-order check
   ORDER-INSENSITIVE (sort keys before the order comparison) so a canonical-integer declared-path key
   (`10`, `2024`) that JS enumerates numeric-first no longer fails its own check. RED: an
   integer-keyed `candidate_declared` map must pass after the fix. Keep the four schema copies
   byte-identical.

#689: add the parent-dir fsync after `renameSync` to `writeFileAtomic` in
`kaola-workflow-full-advance.js` (~L121), `kaola-workflow-fast-advance.js` (~L103),
`kaola-workflow-phase4-advance.js` (~L89), copying the exact #685 shape from
`writeFileAtomicReplace` in `kaola-workflow-adaptive-schema.js` (L1337-1354): open the dir `'r'`,
`fsyncSync`, close in `finally`, PLATFORM FAIL-SOFT — the dir-fsync block must never rethrow, never
change the return value, never turn a previously accepted write into a refusal, and never swallow the
real rename/`ENOSPC` error above it. RED per helper (or a shared one) via the `fs`-singleton
monkey-patch seam: assert the parent dir is fsynced after rename.

#691: in `sweepBarrierRefs` keep-pass (c) (`kaola-workflow-claim.js` L3266-3276) replace
`if (!fs.existsSync(stateFile)) continue;` + the readFile try/catch with a single `fs.statSync` in
try/catch that KEEPS the tag on ANY non-`ENOENT` fault (EACCES/EISDIR/EPERM/…) and stays reapable on
a clean `ENOENT`. Tighten-only, sweep-local — do NOT touch the shared `readActiveFolders`. RED in
`test-claim-hardening.js`: a live project whose project DIRECTORY is chmod-000 must be KEPT; a
genuinely-absent (clean ENOENT) state file must stay reapable. Guard with a `process.getuid()`
root-skip and restore perms + `rmSync` in a `finally` with vars hoisted above the try.

Cross-edition: adaptive-node.js + plan-validator.js are GENERATED_AGGREGATORS (edit all 4 editions,
keep the forge ports as exact renamed mirrors modulo forge nouns); adaptive-schema.js is a 4-tree
byte-identical group (keep byte-identical); claim.js + the three advance scripts are byte-identical
claude↔codex with renamed gitlab/gitea ports (edit all 4 of each). No new script/agent/token/env var,
so no contract-validator or registration-surface edits. After focused GREEN, run all four chains
sequentially (cite the Meta `validation_command`); do not duplicate the full suite per fix.

### n2-review

Review the whole n1 candidate (G1). Confirm each fix is exactly the issue-body fix and strictly
TIGHTEN-ONLY: #688.1 fails closed on absent ledger without breaking the live threaded-ledger path;
#688.2 restricts to `{pending,in_progress}` without dropping a genuinely-live gate; #688.3 refuses
reserved node-ids at freeze without breaking valid ids; #688.4 canonicalization keeps the four schema
copies byte-identical and does not admit a truly non-canonical blob; #689 dir-fsync is platform
fail-soft and never converts an accepted write into a refusal nor swallows a real error; #691 keeps on
non-ENOENT and stays reapable on clean ENOENT and does not touch `readActiveFolders`. Verify every
RED test is non-vacuous (fails without the fix), the GENERATED_AGGREGATOR ports are exact renamed
mirrors, and the byte-identical schema group stays identical. Confirm NO change to #683 semantics or
any live refusal. Reject any scope creep beyond the three issues.

### n3-adversary

Independently try to REFUTE the candidate. Concretely: prove each RED regression genuinely fails
without the fix (revert-in-scratch), not just passes with it. Attempt to construct a case where
#688.1's fail-closed default breaks a live rebind proof, where #688.2's `{pending,in_progress}`
restriction wrongly excludes a live gate, where #688.3's grammar refusal rejects a legitimate id or
misses a prototype key, or where #688.4's canonicalization admits a non-canonical map. For #689,
verify the dir-fsync is fail-soft on a directory that cannot be opened/fsynced and that a real
rename/ENOSPC error still propagates. For #691, verify the clean-ENOENT path is still reapable (no
keep-everything). Run all four `test:kaola-workflow:{claude,codex,gitlab,gitea}` chains SEQUENTIALLY
(with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` given the adaptive-node/plan-validator chains) and confirm
green. Return pass only if no counterexample survives and no live refusal or #683 semantic changed.

### n4-finalize

Unique sink. Write the `CHANGELOG.md` `[Unreleased]` entry for #688/#689/#691 (provenance lives here
and in the commit message, never in shipped script prose). Verify n2 + n3 evidence and the fresh
all-green four-chain receipt (run serially) before closing. Do not re-open scope or claim any behavior
beyond the three reviewed fixes.

## Node Ledger

| id | status |
| --- | --- |
| n1-harden | complete |
| n2-review | complete |
| n3-adversary | complete |
| n4-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-harden) | subagent-invoked | evidence-binding: n1-harden f9a8f0a8faa9 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 35b7f9e283d0 | |
| adversarial-verifier (n3-adversary) | subagent-invoked | evidence-binding: n3-adversary 38744c1d6cb7 | |
