**Correction from the run that implemented this — two premises in the body did not survive measurement.**

**1. `issues_closed` as specified could never fire.** The body defines it as "size of the claimed set
actually closed (0 under keep-open)", and offers the worked example "a run that filed 4 and closed 4
stamps `net_backlog_delta: 0`".

Measured: on the shipped merge lane `cmdFinalize` closes **zero** issues. `mergeLaneDeferred` defaults
true (`claim.js:4283-4288`; `sink:` defaults to `merge`) and the shipped finalize surface passes
`--keep-worktree`. The real `gh issue close` calls happen later in `sink-merge.js:2917-2974`, and
`appendClosureBlock` is heading-guarded, so the sink can never revise the block finalize already wrote.
`test-bundle-finalize.js:986-995` pins exactly this, asserting `closure.closed === []` and zero close
calls. Taken literally, the field would stamp `+4` on that worked example, and a positive delta on
every ordinary run.

Shipped instead, by owner ruling: **`issues_closed` is the size of the set the run's closure decision
is closing** — what the sink then closes. Keep-open stamps 0. No companion disposition field was added,
because `issue_disposition` already sits directly above it in the same block.

**2. "the parsed `## Run gaps` rows" were not reachable as described.** `run-gaps.json` carries swept
classes and **no issue numbers**; the `filed: #N` refs live only in `finalization-summary.md`'s prose
section, whose parser `parseGapSection` was not exported (`gap-sweep.js:587` was `module.exports =
{ main };`). The export was added so the closure block reports over the same rows the gate refuses on —
one grammar, one spelling.

**3. Partial delivery, deliberate and owner-approved.** The acceptance asks that a missing *or
malformed* gap artifact degrade to `unknown`. Missing is delivered and pinned, including two assertions
that absent and empty stay distinguishable. Malformed is not: the parser returns the same empty array
for an all-unreadable section as for an empty one, and free-text bullets are ignored by design, so
bullet-counting is provably wrong — it fails the `freetext` leg of the new T14. Filed as #997.

What the body got right and measurement confirmed: **zero new forge calls** is achievable, and is now
asserted by a live control.
