evidence-binding: n3-review eb8902b68c5f
verdict: pass
findings_blocking: 0

## Review summary (re-review after repair)

R1 is genuinely and completely closed across both lane-group formation sites (the normal
`liveNodes.length === 0` co-open AND the speculative-write `openingSpeculative` arm), with no
live regression. Verified against the code, the tests, and green runs of both
`node scripts/test-adaptive-node.js` (1413 assertions) and `node scripts/simulate-workflow-walkthrough.js`.

The new speculative-branch guard (scripts/kaola-workflow-adaptive-node.js:4271-4284) sits before
`selectSpeculativeWriteGroup` runs, so no group is ever selected on a dirty parent — no
provision-then-discard window. The exclusion covers ALL write candidates in the batch (nothing
opens at all), mirroring the sibling `no_leg_capability` exclusion pattern. `T597-3b` proves the
clean-parent case is unaffected (writerW still opens speculatively). `T615-SPEC-DIRTY-DEGRADE` is
a real subprocess/real-repo test whose key assertion (`speculativeWriteExcluded.reason ===
'parent_dirty'`) is non-vacuous. N1 (eager subprocess spawn) and N3 (cosmetic check divergence)
were both correctly fixed with no new bug introduced. N2 (silent degrade reason on the
non-speculative path) and N4 (approximate line-number comments) are reasonably deferred —
observability/cosmetic only, no correctness impact. All three forge ports are byte-identical to
canonical after forge-name normalization.

Reminder for the finalize node: this diff touches the edition trees, so the four-chain
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` evidence must be recorded before
finalization per the project's validation policy (already run green during n2-fix's repair pass;
finalize should still record/confirm this per policy).

## Findings (informational — all resolved or reasonably deferred, none blocking)

finding: R1 — scripts/kaola-workflow-adaptive-node.js — resolved (non-blocking): speculative-branch parent-dirty guard verified complete at lines 4271-4284; both lane-group formation sites now gated; empirically confirmed green with no starvation (excluded write waits for its gate, then opens via the normal serial path).

finding: N1 — scripts/kaola-workflow-adaptive-node.js — resolved (non-blocking): fence check inlined as the last conjunct at line 4335; correct left-to-right short-circuit, validator subprocess spawns only when a group could actually form.

finding: N3 — scripts/kaola-workflow-adaptive-node.js — resolved (non-blocking): helper acceptance check at line 3714 now literally mirrors the close fence's own check at line 5048.

finding: N2 — scripts/kaola-workflow-adaptive-node.js — deferred (non-blocking): the non-speculative serial-degrade path still carries no reason field distinguishing it from an ordinary serial choice; observability-only, no correctness impact; a good candidate for a focused follow-up.

finding: N4 — scripts/kaola-workflow-adaptive-node.js — deferred (non-blocking): line-number references in comments are this file's established (approximate, self-restaling) convention; purely cosmetic.
