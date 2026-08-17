# Acceptance — bundle-992-993-994

Each claimed issue's stated acceptance, against what satisfies it. One partial is declared, not hidden.

## #994 — typed follow-up body contract

| acceptance | evidence | verdict |
|---|---|---|
| A filed follow-up carries the three sections and the `searched:` line; every numeric claim sits in `## Measured` with a stamp or in `## Hypothesis` | Rule shipped in `finalize.skeleton.md` Step 7, inside the `forge-is-the-backlog` pin, rendered to 6 tracked surfaces + 6 edition trees. **Demonstrated, not just asserted**: this run's own three follow-ups (`.cache/followup-*.md`) are written to the contract, with stamps `@c62e8a3f` and probe results | PASS |
| A claim that later proves wrong is traceable to its type | Structural: the three sections partition evidence from inference from proposal. Exercised live — the worktree/edition-tree follow-up puts its measured effect under `## Measured` and its untraced root cause under `## Hypothesis` | PASS |
| The `independent slices` guidance and the correction-comment rule are byte-untouched | `git diff --numstat` = `+16/-0` on skeleton and all 6 surfaces; `git diff -U0 \| grep -c '^-[^-]'` = **0 deleted lines anywhere**. Proven structurally, not by inspection | PASS |
| Surfaces regenerate clean across all reached runtimes/editions | `generate-routing-surfaces --check` → 18 surfaces byte-match (re-run by orchestrator); `test-route-reachability` → 331 assertions over 12 obligated finalize surfaces incl. opencode/kimi rendered in memory | PASS |

## #992 — filing existence / non-empty-body verification

| acceptance | evidence | verdict |
|---|---|---|
| A run records an existence + non-empty-body verification per filing, in the run's own record | Rule shipped in Step 7, same pin. Recorded on the mission-list result line, never the `## Run gaps` row. Applied by this run at Step 7 | PASS |
| The empty-body failure mode is caught in the same finalize, not at the next audit | The duty sits in Step 7, the same phase as the filing itself — not deferred to a later gate | PASS |
| `## Run gaps` row grammar, `samplesMatch`, and both refusal directions byte-untouched | **Verified by reading the whole diff**: `gap-sweep.js` changed `+4/−1`, and the change is exactly `module.exports = { main }` → `{ main, parseGapSection }` plus a 3-line rationale comment. The row regex at `:265`, `samplesMatch`, `gaps_unswept` and `observed_gap_unseeded` are untouched | PASS |
| Layer 2 (forge probe in `--check`) | **Owner-declined.** n1-design's syntactic floor re-affirmed; recorded durably in `CHANGELOG.md` as the issue's body requires | PASS (as decided) |

## #993 — backlog delta in the closure receipt

| acceptance | evidence | verdict |
|---|---|---|
| Every archived run's `## Closure` block carries the four fields, consistent with its `## Run gaps` rows and sink block; 4-filed/4-closed → `0`, the 14-filing shape → `+10` | `test-bundle-finalize.js:1004-1249`, three legs incl. both worked examples from the issue body; suite green at 192 | PASS |
| Keep-open stamps `issues_closed: 0` without any forge call it does not make today | Walkthrough keep-open leg (`:349-358`); zero-forge-call control at `test-bundle-finalize.js:1198-1228`, **armed** by a temporary mutant that fired 4 assertions and was reverted | PASS |
| A missing **or malformed** gap artifact degrades to explicit `unknown`, never a silently wrong `0` | **PARTIAL — declared, not hidden.** Missing/unlocatable → `unknown` across all three derived fields, pinned by `test-finalize-door.js` T14 incl. two PAIR assertions that absent ≠ empty. **Malformed is NOT delivered**: `parseGapSection` returns the same `[]` for an all-rows-unreadable section as for an empty one, and free-text bullets are ignored by design so bullet-counting is wrong (proven — it fails T14's `freetext` leg). Owner ruled: ship two states, file the rest. Filed as its own slice | **PARTIAL, owner-accepted** |
| `issues_closed` semantics | Redefined after measurement refuted the issue's wording (finalize closes nothing on the shipped lane; the block is write-once). Owner ruled: claimed-set size. No fifth field — `issue_disposition` above it already carries the disposition | PASS (as decided) |

## Confirmations

- Tests pass per the validation result, not a re-run universal suite: bundle-finalize 192 · finalize-door 587 · walkthrough 184/184 full scope · sink-merge 1063 · route-reachability 331 · generate-routing-surfaces 18 · validate-script-sync 0 · edition-sync 0.
- No type/lint pipeline exists in this repo (Node scripts only) — no-impact, not skipped.
- No unresolved review findings. No debug statements: the diff adds no `console.log` to production paths; the only new output is the four receipt lines.
- Both new guards are mutation-proven armed, one mutant at a time, not merely green.
