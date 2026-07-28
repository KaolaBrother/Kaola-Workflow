# 0015 — Kernel journaling as commits: rejected, with the hole closed directly

- **Status:** Accepted
- **Date:** 2026-07-28
- **Supersedes:** nothing. **Resolves:** the evaluate-first migration item on journaling kernel
  writes as git commits, and the question of retiring the hand-rolled ledger hash chain.

## The proposal being evaluated

The argument is short and genuinely attractive. The forge layer named in the four-record kernel
*already is* a tamper-evident journal: git commits are atomic, SHA-chained and conflict-detecting.
If every kernel write were a commit, integrity would be native instead of hand-rolled, and the
hand-rolled ledger hash chain — which re-implements git's DAG over markdown — could retire. It
would also close that chain's own documented hole for free: `## Expansion Records` lives outside
both integrity layers.

The instruction attached to the proposal was *evaluate first*: commit noise and worktree interplay
are real costs, adopt only if the integrity story is strictly better.

## Verdict

**Rejected.** Not deferred, not "revisit later" — the evaluation was performed and the answer is no,
on three independent grounds, any one of which is sufficient. The `## Expansion Records` hole is
real and is closed directly instead, which is the part of the proposal worth keeping.

## The evidence

### 1. The kernel is not always in git's index, by the consumer's own choice — decisive

`kaola-workflow-claim.js:2665-2682` returns the outcome value `skipped_gitignored` when git refuses
to stage the run's project folder because the consumer's repository ignores that path, and
`claim.js:4261` handles that disposition as a normal, non-failing archive outcome. This is shipped
behavior, reachable today.

A kernel journaled as commits is not merely degraded on such a repository — it does not exist.
Every kernel write would be a commit git declines to make, so the integrity substrate would be
present on some consumers and absent on others, with nothing in the durable state able to say
which. That is strictly worse than a hash chain that works identically everywhere, and it is worse
in the specific way the workflow's independence principle exists to prevent: correctness becoming
conditional on a property of someone else's repository.

The hand-rolled chain has no such dependency. It is a file in the run's own folder, and it reads
the same whether or not git can see it.

### 2. Concurrent write legs turn the kernel into an octopus add/add — measured, and already
   documented in the tree

`kaola-workflow-adaptive-node.js:11853-11875` records the exact failure for ONE file. Run telemetry
is parent-owned; when a leg-side invocation dirties the leg's copy and it is swept into the capture
commit, *every* leg branch ADDs the same path independently and the octopus merge fails add/add on
workflow-generated residue. The shipped mitigation is a hard-coded path exclusion, and the code
comment states plainly that when the derivation yields nothing the failure re-appears as a generic
`merge_conflict`.

Parallel-by-default is a theorem here, not a preference: co-opened write legs are the standing
default. Journaling kernel writes as commits generalizes that one excluded path to the whole
kernel. Every co-opened leg would independently commit `workflow-plan.md`, the Node Ledger inside
it, its own `barrier-base-*`/`barrier-open-*` observations, and its evidence file; the octopus merge
would then face add/add and modify/modify on the kernel itself, on every fan-out. The reconciliation
that today happens inside one atomic replace would become a merge the synthesizer has to resolve —
on the very records the synthesizer reads to decide anything.

So the proposal does not merely add cost to concurrency; it puts the kernel into the conflict
surface of the mechanism that makes concurrency safe.

### 3. Commit volume, measured

Observed with `scripts/kernel-write-observer.js` over a real CLI drive of `orient` followed by
`open-next` on a two-node plan (reproducible via `driveKernelCli` in
`scripts/test-kernel-conformance.js`): **12 filesystem writes into the project folder, 9 distinct
artifacts, 5 of them kernel records written through the atomic replace** — `workflow-plan.md`,
`.cache/barrier-base-impl`, `.cache/barrier-open-impl`, `.cache/impl.md`, `.cache/context-packet.md`.

That is ONE node being opened, and it does not include recording evidence, the close barrier, the
ledger flip, or the state pointer update at close. A modest run of a dozen nodes is on the order of
a hundred kernel writes. As commits, into the consumer's own history, interleaved with the change
the user actually asked for.

Commit noise was named up front as a real cost. Measured, it is not a rounding error, and it lands
in an artifact the workflow does not own: the user's git history.

### 4. The integrity story is not strictly better, because the threat model is not adversarial

`docs/api.md:347` states the boundary explicitly: the malicious-editor class was de-scoped when
interception was retired, and the residual for the acceptance surface, the ledger and the expansion
records is the same pre-existing baseline. The integrity layers defend against *accident and crash*
— a torn write, an out-of-band edit, a stale resume — not against an agent that has decided to
rewrite the run's own state.

Against that threat model git adds nothing the chain does not already provide, because an agent that
can edit the ledger can also run `git commit --amend`. Against a genuinely adversarial model git
adds nothing either, for the same reason. The claim "integrity becomes native" is true about the
mechanism and false about the guarantee.

## What is adopted from the proposal

The one substantive point stands: **`## Expansion Records` sits outside both integrity layers.**
`docs/api.md:1810` confirms the section is deliberately outside the `plan_hash` body so that an
expansion record cannot perturb the frozen spine identity — a design property worth keeping, and
also the reason nothing covers it.

That is closed *directly*, not by migration: extend the ledger chain journal to cover the expansion
records as their own chained segment, keeping `plan_hash` scoped to `## Meta` + `## Nodes` +
`## Node Briefs` exactly as it is. The chain already binds a head into the plan; a second covered
segment costs one more digest and changes no freeze semantics. Any replacement remains bound by the
standing constraint that lineage substrate is digest-bound records, never a best-effort sidecar.

This is filed as follow-up work rather than performed here, because it is a change to the
tamper-evidence chain's covered surface and belongs with the chain's own suite, not with the Layer-0
ruling this decision accompanies.

## Consequences

- The hand-rolled ledger hash chain **stays load-bearing**; nothing in the migration plan should be
  read as having decided otherwise by omission.
- Kernel integrity remains self-contained: a file in the run's own folder, identical on every
  consumer repository, independent of whether git can see the path.
- The atomic replace remains the kernel-write primitive, and is now checked in both directions at
  runtime by `scripts/test-kernel-conformance.js`.
- The `## Expansion Records` gap is now a named, filed item rather than an argument for a migration.

## How to re-open this

The verdict rests on three facts. It should be revisited if any of them changes:

1. `skipped_gitignored` stops being reachable — i.e. the workflow requires the project folder to be
   tracked. That is a consumer-environment requirement, and stating requirements to consumers is
   allowed; adopting one silently is not.
2. Co-opened write legs stop sharing a repository, so kernel commits cannot collide at the merge.
3. The threat model widens to include an editor of the run's own state, at which point *neither*
   layer suffices and the question becomes a different one.
