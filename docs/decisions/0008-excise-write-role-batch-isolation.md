# 8. Excise the write-role batch member-worktree isolation machinery

Date: 2026-06-11
Status: Accepted
Issue: #364
Relates-to: `docs/decisions/0005-plan-run-owns-node-lifecycle.md` (the per-node
lifecycle this scheduler sits under), #281 (original parallel-batch design), #320/#321
(serial-degrade), #292/#303 (the member-worktree isolation + seal-vacuity work now removed).
Reintroduction-tracked-by: #376 (write-lane containment PreToolUse hook) + #377
(per-node running-set scheduler).

## Context

`kaola-workflow-parallel-batch.js` carried a write-role batch isolation path: per-member
`git worktree add --detach`, seeded snapshots, per-member plan copies, an in-lane
`memberDirty` porcelain check, a gc-anchored `mergeRef` captured at seal, and a
tree-aware `join` that checked the member's sealed tree out into the parent worktree
(~400 lines across the aggregator plus ~120 lines of mandatory plan-run choreography
prose, with a matching E-series/N-series test surface).

That path was **never reachable by default and non-functional if forced:**

1. **Unreachable.** Since #320, `resolveBatchCwdEnforced` defaulted false and `open-batch`
   serial-degraded any write-role frontier *before* provisioning. The only opt-in was the
   undocumented `KAOLA_BATCH_CWD_ENFORCED` env flag.

2. **Non-functional if force-enabled.** The harness cannot force a dispatched subagent's
   working directory — the `Working directory:` line is advisory prose. A member subagent
   wrote to the **parent** worktree, not its assigned member worktree. `seal` then refused
   `empty_member` *after* the work was done, stranding completed edits outside lane
   accounting (the documented #283/#249 isolation leak).

So the machinery added cost (dead code, per-run context, a fragile test surface) for a
capability that could not work. The read-only fan-out batches are unaffected — they need
no worktrees (members share the parent tree; evidence is recorded parent-side).

## Decision

**Excise the write-role member-worktree isolation machinery.** Specifically:

1. `open-batch` and `top-up` serial-degrade a write-role frontier **unconditionally**,
   returning the existing `{result:'ok', degraded:true, reason:'cwd_unenforceable',
   opened:[], …}` shape with zero mutation. The orchestrator routes this to the
   single-node `open-next` path (today's effective behavior — **unchanged**).

2. Delete `snapshotMember`, `anchorMergeRef`, the `worktreeAdd`/`worktreeRemove`/
   `mergeMemberPaths`/`memberDirty`/`snapshotMember`/`anchorMergeRef` io seams, the
   per-member seed/plan-copy provisioning, the `mergeRef` capture in `sealOne`, the
   member-scoped barrier-path branch (the barrier always runs against the parent plan),
   and `join`'s write-role merge loop (`join` is now a manifest-only transition to
   `joined` — read-only batches have nothing to merge).

3. Retire `KAOLA_BATCH_CWD_ENFORCED` / `BATCH_CWD_ENFORCED_ENV` / `resolveBatchCwdEnforced`
   from `kaola-workflow-adaptive-schema.js` (and its byte-identical copies in all four
   trees) and the `cwdEnforced` plumbing through `parallel-batch.js`.

4. Collapse the manifest lifecycle: the `joining` state was only ever written for
   write-role members, so it is now unreachable — removed from `BATCH_STATES`
   (`opening → open → sealed → joined`), from `recommendBatchRoute` (`sealed → join`),
   and from `runJoin`. `joined` stays (the read-only terminal state).

5. Trim the write-role choreography prose from all four plan-run surfaces and remove the
   dead-path tests (E1/E2/E3 e2e worktree, N6 seal-vacuity, N7 deletion-join,
   N8 rename-join, N9 malformed write-role evidence, the resolver unit, the
   `cwdEnforced` control branches). E1 is rewritten to assert the now-unconditional
   degrade via the real CLI.

Measured delta: `kaola-workflow-parallel-batch.js` 1454 → 1177 lines (−277) per edition;
`test-parallel-batch.js` 1893 → ~1565 lines.

## Reintroduction condition

Reintroduce per-member write isolation **only** when the harness gains a real
working-directory / write-lane enforcement primitive. The successor design is:

- **#376** — a `PreToolUse` `Write|Edit` containment hook (`KAOLA_LANE_CONTAINMENT`,
  fail-closed default false) that denies an out-of-lane write at the moment it happens,
  instead of stranding it at seal-time.
- **#377** — a per-node running-set scheduler (`.cache/running-set.json`) that provisions
  one worktree per *node* (not per batch-as-a-unit) only when lane containment resolves
  true, with serial as the permanent fallback.

See `docs/investigations/2026-06-10-parallelism-redesign.md` §D4/§D5.

## Invariants preserved

- **Read-only fan-out batches are byte-behavior-unchanged** (open/top-up/seal/join/
  reconcile/status produce identical results; `join` still reaches `joined`).
- **Serial write behavior is byte-identical** to today's degrade path: a write-role
  frontier opens its siblings one at a time via the single-node `open-next` path.
- **No new env flags, no schema additions** — this is a pure removal under the existing
  serial-degrade contract.
