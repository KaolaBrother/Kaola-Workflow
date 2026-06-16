# Workflow Plan — bundle-496-497

<!-- plan_hash: c54eb86cbb557d25d5f715beaa6496c50d6073199560c0edfbec1370d03f24ec -->

## Meta

labels: bug, area:scripts
issue_numbers: 496, 497
closure_policy: all_or_nothing

## Plan Notes

Same-scope bundle: both #496 and #497 are HIGH default-path-reachable accuracy
defects in the SAME file family (`kaola-workflow-sink-merge.js` ×4 editions —
canonical `scripts/` + byte-identical codex twin
`plugins/kaola-workflow/scripts/` + DIVERGENT gitlab/gitea forge hand-ports that
use the `forge` abstraction). Because both fixes edit the same sink-merge
functions across the same four editions, they CANNOT be authored as parallel
fan-out legs (overlapping write sets; and parallel implementers of the same
divergent-port logic diverge — #309). They are ONE cohesive implementation node.

- #496: `assertWorktreeClean` fails OPEN on a transient `git status` fault
  (`catch (_) { status = ''; }`) immediately before `git worktree remove
  --force`. Fix: invert the catch to fail CLOSED — a probe that cannot PROVE the
  worktree clean refuses with a typed error (treat unprovable as dirty),
  optionally one bounded retry first. ~1 line per edition; not a retry framework.
- #497: the `--sink` transaction marks `push_main` and `closure` steps `done`
  unconditionally even when `git push origin <defBranch>` / `gh issue close`
  fail (caught, stderr-warn-only), then reports `status:sinked`. The #484
  freshness guard only checks LOCAL-default ancestry, which a local FF satisfies,
  so a swallowed push failure yields a false `status:sinked` (issue CLOSED on the
  forge, deliverable un-pushed). Fix: on a hard push/close failure do NOT
  `stepDone`; record `remote_issue_closed`/push outcome into the receipt
  (mirroring `postMergeCleanup:566`); surface a non-`pushed`/non-`closed` outcome
  in the `--sink` emit so the caller can detect and retry.

closure-audit decision — D-497-01 (WIRE): the issue asks to decide WIRE vs
REMOVE the `closure-audit.js` backstop (referenced by zero live command/SKILL
prose). Decision = WIRE, on a defense-in-depth rationale (NOT sunk-cost): the
inline emit fix (#497, n1) is the sink-time TRANSACTIONAL catch (immediate,
specific to this sink); `closure-audit.js` is the after-the-fact RECONCILIATION
sweep (periodic, broad — closed-issue / stale-`workflow:in-progress`-label /
PR-state). Two complementary mechanisms. n2 wires closure-audit into the finalize
sink-card prose across the six #400 finalize-ROUTE surfaces (the 3 finalize
COMMANDS + 3 finalize SKILLS) and adds the machine-enforced reachability
assertion. closure-audit.js itself (×4) is NOT in any write set — n2 only invokes
it from prose, consuming n1's new emit contract.

#400 finalize-route six surfaces (CORRECTED): the route's 6 surfaces are the SAME
route across the three editions — finalize COMMAND + finalize SKILL ×3:
`commands/kaola-workflow-finalize.md` (github root),
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md`,
`plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md`, and the three
`…/skills/kaola-workflow-finalize/SKILL.md`. Verified primary evidence: the
`### Script-owned worktree sink (--sink mode, #429)` hook region lives in all
three finalize COMMANDS (github :870, gitlab :773, gitea :771); `plan-run.md` has
0 sink-card hits and `workflow-next.md` only incidental ones — they are NOT
finalize-route surfaces and are excluded.

Cross-edition coupling: `kaola-workflow-sink-merge.js` is a `COMMON_SCRIPTS`
member (byte-identical canonical↔codex), so the #274 sync-group rule requires its
codex twin in the SAME node as the canonical (n1 declares both). The gitlab/gitea
ports are edition-named, divergent hand-ports — n1 co-writes root + ports
atomically (allowed same-node atomic mirror, #340), mirroring the SAME semantic
fix into each forge structure (not a per-concern enumeration). All four chains
(`claude`, `codex`, `gitlab`, `gitea`) must be green before finalize (#307): n1's
RED→GREEN lands in the canonical `simulate-workflow-walkthrough.js` (claude chain)
and the forge `test-{gitlab,gitea}-sinks.js` (gitlab/gitea chains); the codex
twin rides byte-sync (validate-script-sync) + the codex walkthrough.

n2 depends_on n1 (TRUE dependency, not ordering-for-convenience): the finalize
sink-card prose CONSUMES n1's new `--sink` emit field (the caller-side half of
#497 — detect a non-pushed/non-closed outcome and retry). This dep also removes
the n1/n2 antichain pair (validator inferred-sibling check skips ordered pairs),
which is necessary because both nodes touch the gitlab/gitea forge trees and
those collapse to the coarse area `plugins` in the disjointness classifier — they
could never have been a valid parallel antichain. Serial-via-true-dep is the
correct shape here, not a degraded fallback; no `write_overlap_policy` relaxation.
n2's surfaces are per-edition prose (no sync-group / forge-port-ordering trap).

D-497-01 is the next free decision-record number (no D-496/D-497 records exist).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix-sink-merge | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 1 | sequence | opus |
| n2-wire-closure-audit | implementer | n1-fix-sink-merge | commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, scripts/test-route-reachability.js | 1 | sequence | sonnet |
| n3-review | code-reviewer | n1-fix-sink-merge, n2-wire-closure-audit | — | 1 | sequence | opus |
| n4-docs | doc-updater | n3-review | CHANGELOG.md, docs/api.md, docs/decisions/D-497-01.md | 1 | sequence | sonnet |
| n5-finalize | finalize | n4-docs | CHANGELOG.md | 1 | sequence | — |

non_tdd_reason[n2-wire-closure-audit]: prose/wiring change across the finalize
COMMAND + SKILL surfaces (forge-neutral) plus a route-reachability contract
assertion — there is no natural failing UNIT test for "the finalize card invokes
closure-audit and acts on its output"; correctness is enforced by the
machine-checked reachability contract (test-route-reachability.js reads all six
finalize-route surfaces by path) and the code-reviewer gate, not a RED unit test.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix-sink-merge | complete |
| n2-wire-closure-audit | complete |
| n3-review | complete |
| n4-docs | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix-sink-merge) | subagent-invoked | evidence-binding: n1-fix-sink-merge dc90345dd4ad | |
| implementer (n2-wire-closure-audit) | subagent-invoked | evidence-binding: n2-wire-closure-audit a132fdb00e1e | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 4267097a50e8 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs d8bdc3f853b4 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 521d58007fa0 | |
