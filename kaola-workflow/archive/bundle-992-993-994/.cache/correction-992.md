**Record of what shipped — layer 2 was declined, not deferred.**

This issue proposed two layers and said the first was sufficient alone. Layer 1 shipped: Step 7 now
requires confirming, after filing, that the issue exists and its body is non-empty, and recording the
number and body length in the run's own record — the mission-list result line, never the `## Run gaps`
row, whose grammar the scanner owns.

**Layer 2 — wiring a forge adapter into the `--check` online probe — was put to the owner and
declined.** n1-design's syntactic floor stands re-affirmed rather than raised: `gap-sweep.js` stays
forge-neutral bookkeeping, and no new refusal enters a design whose refusal count is zero over
something that destroys nothing. The issue's own text anticipated this outcome ("If n1-design's floor
is re-affirmed instead, record that decision and ship layer 1 alone"), and this comment plus the
`CHANGELOG.md` entry are that record.

**One clause resolved differently than the body anticipated.** The body says per-forge divergence is
declared "where a forge cannot express the check". Measured: all three forges *can* express an
existence and non-empty-body check, so there is no capability difference to declare, and the
renderer's own rule is that a region whose reason cannot name a runtime difference is drift rather
than divergence. The prose therefore names no forge CLI and carries no `<!-- REGION -->` — one wording
on all twelve finalize surfaces.

Acceptance verified: the `## Run gaps` row grammar, `samplesMatch`, and both refusal directions
(`gaps_unswept`, `observed_gap_unseeded`) are byte-untouched — the only change to `gap-sweep.js` is
exporting `parseGapSection` for #993, plus its rationale comment.
