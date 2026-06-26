evidence-binding: n3-review 0f57c8f21ddf
<!-- verdict: paste verdict here -->
verdict: pass
<!-- findings_blocking: paste findings_blocking here -->
findings_blocking: 0

## Review summary (n3-review, code-reviewer / opus)

All 6 review axes PASS over the 12-surface diff (6 plan-run + 6 finalize). Both points of
use — plan-run §5 "All done" and the finalize pre-contractor step — now gate
`run-chains.js` on self-host detection and route consumer (non-npm) repos to the plan's
`validation_command` + `.cache/final-validation.md` (#475); self-host behavior unchanged.
Cross-edition parity verified (self-host / consumer / validation_command / column-0
`verdict: pass` sentinels all 12/12). Every PIN comment and the `final-validation.md`
contract needle preserved. Forge-neutral plugin prose (no gh/glab/tea). No scope creep —
only the 12 `.md` files changed. The reviewer independently ran the full four-chain suite
(claude/codex/gitlab/gitea all RC=0) + `simulate-workflow-walkthrough.js` +
`test-route-reachability.js` (152 assertions). One non-blocking nit (R1): plan-run
synopsis pointers (~L102/L213 + mirrors) still say "run chains" shorthand — pre-existing,
out of AC scope, optional future polish. No blocking defects.
