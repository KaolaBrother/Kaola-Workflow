evidence-binding: n7-docs 283ca305ae26

## Summary

Documented the shipped `metric-optimizer` role across exactly the 4 declared files. Every
API/schema claim was diffed against the real committed source (not the issue body or node
evidence alone) before being written; line/behavior citations below.

### 1. `CHANGELOG.md`
Added one `### Added` bullet at the top (most-recent-first convention, matching the existing
`#630` entry immediately below it). Covers: the new `metric-optimizer` role (closed-library
extension: `CANONICAL_ROLES`/`WRITE_ROLES`/`IMPLEMENT_ROLES`, tier `sonnet`) for optimize-shaped
work as the write-side complement of #486; the `optimize(<id>)` `## Meta` contract (all 9
fields + defaults + the `budget_wallclock_minutes` → dispatch-card wait-budget override); the
`metric: <number>` column-0/last-match-wins output contract; OPT-1..6; the D6 evidence contract
(5 tokens) plus the `checkEvidenceShape` non-empty gate; the bounded ratchet protocol (scoped
`git restore`, `git reset --hard` forbidden, the three stop conditions, never-ask→write-halt);
G1/G3 inheritance + the required OPT-5 change-gate. Documented the in-run adversarial catch (R4:
`checkEvidenceShape` initially had no `metric-optimizer` branch → hollow-stub close) as "fixed
and re-reviewed in the same run" — worded to avoid overclaiming a second adversary pass (see
"Note for the team-lead" below). Noted R1/R2/R3 (n5-review) + R5/R7 (n6-adversary) filed as
**#639** — confirmed by reading `gh issue view 639` directly rather than trusting the dispatch
message's issue-number claim. Cross-edition (#307) note included, phrased honestly: the four
chains were run; a recurring `test-{run,gitlab-run,gitea-run}-chains.js` timing-sensitive
sub-suite flaked intermittently across n2/n3/n4/n6-adversary's independent runs, and
n6-adversary's own control run against pristine main (with the #634 diff absent) reproduced the
same flake, confirming it's pre-existing/environmental, not a #634 result — per the
"don't present test-run-chains.js as a #634 result" guardrail.

### 2. `docs/decisions/D-634-01.md` (new ADR)
Shape-matched `D-630-01.md`/`D-636-01.md` (Date/Status/Issue/Related header, ## Context, ##
Decision, ## Consequences, ## Non-goals / accepted residual, ## Alternatives considered).
Records: the decision to add one closed-library role rather than a new grammar shape; why a new
role (evidence contract genuinely differs — cites the exact `ROLE_TOKEN_REGISTRY` divergence);
why the contract lives in `## Meta` not node columns (avoids the hand-ported
`classifier.readPlanNodes` twin-parser — verified this claim against `plan-validator.js`'s own
comment at parseNodes, `scripts/kaola-workflow-plan-validator.js:504-510`); the OPT-1..6 rules;
the D6/R4 hollow-stub fix; the ratchet protocol; alternatives rejected (reuse `implementer`,
`loop(<cap>)` re-dispatch, global never-ask, agent-invented metric) — all four taken directly
from n1-plan's own "why not" reasoning (`.cache/n1-plan.md` D1 section), cross-checked against
the shipped code. Non-goals section names the #639 deferrals + the D7-listed future work
(multi-metric/Pareto, agent-proposed metric, playbook accumulation, patience auto-tuning,
optimize fan-out grammar) verbatim from the issue body's own "Deferred, recorded here" line.
Provenance (issue/decision refs) is present throughout, per this file's documented convention.

### 3. `docs/api.md`
New self-contained section `### \`## Meta\` field \`optimize(<node-id>)\` — the metric-optimizer
contract (issue #634 / D-634-01)`, inserted between the existing `#547` Meta-fields section and
the `run-chains.js` script section (matching that neighborhood's existing subsection style —
`### \`## Meta\` fields ...`, `### Speculative-open kernel ...`, etc.). Covers, in order: role
membership + G1/G3 inheritance; the full Meta block grammar with an example (field list, defaults
— every field/default diffed against `parseOptimizeContracts`,
`scripts/kaola-workflow-plan-validator.js:455-503`); the two budget caps (`OPTIMIZE_ITER_CAP=50`,
`OPTIMIZE_WALLCLOCK_CAP=120`, `kaola-workflow-adaptive-schema.js:331-332`); the `metric: <number>`
output contract (`parseMetricValue`, `kaola-workflow-adaptive-schema.js:481-487`); all six OPT
rules with their exact refusal semantics (diffed line-by-line against
`scripts/kaola-workflow-plan-validator.js:1465-1528` and OPT-5 against `:1808-1815`); the D6
evidence contract + the `checkEvidenceShape` non-empty branch (diffed against
`scripts/kaola-workflow-adaptive-node.js:1074-1086`, including the exact regex
`^<token>:[ \t]*(\S.*)$`); and the dispatch-card threading (`optimizeDispatchCtx`/`buildDispatch`,
diffed against `scripts/kaola-workflow-adaptive-node.js:1270-1305`). Additionally updated the
PRE-EXISTING `opened` payload `dispatch` sub-object doc (the `#444`/`#611` section, now
immediately below the new section) — added the `optimize?` field and widened the
`wait_budget_source` enum to include `'optimize_budget'`, plus a short prose paragraph — since
leaving that enum incomplete would make my own new section immediately inconsistent with the
pre-existing doc it cross-references. No field, default, cap value, or refusal reason string was
guessed; every one was read from the shipped source, not the issue body or n1-plan's proposal
(which predated n2's real implementation).

### 4. `docs/architecture.md`
Added one brief paragraph in the "Workflow Paths (fast/full/adaptive)" section, right after the
existing G1/G2/G3 post-dominance-gates sentence and before "**Components.**" — describing
optimize-shaped work as a composed shape (ordinary role + Meta contract, no new node shape, no
scheduler change), the sibling of the still-unshipped #486, with pointers to the new `docs/api.md`
section and the ADR. Also fixed a now-stale count directly touched by this change: the "Agent
Profile Structure" section's roster line said "15 base-role profiles (15 files, 15 triples)" —
verified against `ls agents/*.md` (now 16 files) and n3-register's own validator-run evidence
("Vendored agent validation passed for 16 agents") — updated to 16, attributing the delta to
`metric-optimizer` (#634). This is the one place outside my 4-file declaration I touched, and it's
inside one of my own 4 declared files (`docs/architecture.md`) — not scope creep, since leaving a
role-roster count wrong in the very paragraph adjacent to my own new content would be an
inaccuracy in a file I am editing anyway.

## Provenance / scope check
Grepped my own additions in all 4 files for accuracy against source; did not touch any file
outside the 4 declared (`CHANGELOG.md`, `docs/decisions/D-634-01.md`, `docs/api.md`,
`docs/architecture.md` — confirmed via `git status --porcelain`). Did not reference CI/CD as a
gate. Did not present `test-run-chains.js`'s environmental flake as a #634 result.

## Note for the team-lead (not a doc-file change — flagging for the orchestrator)
Per `dispatch-log.jsonl` and the task tracker, `n6-adversary`'s ONE recorded run (evidence-binding
`de0655416c81`, still the current `.cache/n6-adversary.md` content) found the R4 hollow-stub gap
and returned `verdict: fail`. The bounded repair that followed re-dispatched the fix to
`n2-engine` (`n2-r4fix` in the dispatch log) and a re-review to `code-reviewer`
(`n5-review-2`, the current `R4-REREVIEW` content in `.cache/n5-review.md`) — both of which I
read and cited. I did NOT find a second `n6-adversary` dispatch confirming the fix; the task
tracker still lists `#68 n6-adversary` as `pending`. I've worded the CHANGELOG/ADR text to say
the fix was "fixed and re-reviewed in the same run" (accurate to what I could verify) rather than
claiming the adversary itself re-verified, so nothing here needs correcting once `n6-adversary`
re-runs — but since it's the designated change-gate whose `verdict: fail` currently sits in its
evidence file, `n8-finalize`'s `--verdict-check` will need a passing `n6-adversary` verdict
recorded before it can succeed. Surfacing this now in case it isn't already on the plan.
