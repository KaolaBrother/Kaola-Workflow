evidence-binding: n1-plan-run-debloat 388cb31f3a60
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: Behavior-preserving refactor — prose restructuring of 6 agent-facing routing surfaces (plan-run command + SKILL, ×3 editions). No natural failing unit test exists; the standing guardrail is the route-reachability + contract-validator token pins, kept GREEN before and after. Full existing suite green both sides.
<!-- regression-green|build-green|smoke-integration -->
regression-green: PASS — full existing suite green before AND after the change (route-reachability 260/260 both times; all four contract validators pass both times; walkthrough passes).

## Task
#627 fix#1 (debloat two re-bloated blocks back to card pointers) + #623 (plan-run rolling-topup scope-fix), across the 6 plan-run surfaces.

## Write set (exactly these 6, confirmed via `git status --porcelain`)
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

## Before/after line counts
| surface | before | after | delta |
|---|---|---|---|
| github command | 480 | 458 | -22 |
| github SKILL | 494 | 490 | -4 |
| gitlab command | 474 | 452 | -22 |
| gitlab SKILL | 494 | 490 | -4 |
| gitea command | 474 | 452 | -22 |
| gitea SKILL | 494 | 490 | -4 |
| total | 2910 | 2832 | -78 |

## Blocks restubbed (exact)
1. LADDER debloat (#627 fix#1) — COMMAND surfaces only (3 files). The ~25-line "Wait budget,
   escalation, and writer kill-safety" + "Writer kill-safety" ladder collapsed to a 7-line stub
   that PRESERVES the machine-pinned tokens `dispatch.wait_budget_minutes`, `Writer kill-safety`,
   `writerHalt`, `delegation_outcome`, `reconcile-running-set`, and points at the existing
   `<!-- CARD: join-protocol -->` marker → docs/plan-run-cards/join-protocol.md. The 3 SKILL
   surfaces were NOT touched here: they carry the FULL A-F Codex Join Protocol inline, pinned
   (`<!-- PIN: join-protocol -->` + `NEVER interrupted before its wait budget expires`) — that is
   the compliant canonical location, not a re-bloat target.
2. SPECULATIVE-OPEN debloat (#627 fix#1) — ALL 6 surfaces. The ~14-line "Speculative gate-overlap
   is default-on" paragraph collapsed to a 5-line stub behind the intact `<!-- CARD: speculative-open -->`
   marker, PRESERVING `--speculative-consent` (T9) and the `speculative_open_policy: auto` default
   framing (three-tier auto/consent/off; auto is DEFAULT; serial waiting is the DEGRADED path).
   Consistent with n4's card fix (both = auto-default three-tier).

## #623 wording applied (Shared canonical spec, Surface 1 — ALL 6 surfaces)
The FANOUT_CAP bullet's false "top-up re-run of open-ready drains wider frontiers as members close"
clause was corrected to: the rolling top-up re-run of `open-ready` (admitting a NEW member as a slot
frees) drains a wider READ fan-out only; a WRITE frontier wider than `FANOUT_CAP` does NOT top-up
into a live lane group (group membership / `write_union` / baseline fixed at group formation, and
`write_node_exclusive` fires while any member is live) — it runs as fixed group waves: the first ≤cap
members form a group and run to completion (each wave paying its own synthesizer-merge + group
barrier), then the next wave forms as a NEW group, so makespan is the sum of the per-wave maxima, not
a rolling drain. `FANOUT_CAP` / `KAOLA_FANOUT_CAP_READONLY` tokens kept.

## Machine-pinned token survival — CONFIRMED on all 6 surfaces
Route-reachability pass line (identical before and after):
    Route-reachability test passed (260 assertions).
Per-surface token counts (grep -o | uniq -c) confirm survival: T5 (`<!-- PIN: frontier unit -->`),
T5b (`fork_turns: "none"`, `reasoning_effort: dispatch.codex_reasoning_effort`, `fresh child-session
effort proof`, `codex_effort_override_unavailable`), T8 (`<!-- PIN: leg-isolation-recipe -->` +
`--write-overlap-consent`), T9 (`<!-- CARD: speculative-open -->` + `--speculative-consent`), T12,
T14, T15 (`<!-- PIN: gate-instrumentation-provisioning -->` + `KAOLA_GATE_WINDOW_FENCE=0`) all intact
(none of those blocks were in the edit scope). Ladder/join tokens verified two ways (validator +
independent normalized-includes check, since `Writer kill-safety` and `NEVER interrupted before its
wait budget expires` are line-wrapped and `assertIncludes` whitespace-normalizes):
`Writer kill-safety`=true on all 3 commands; `NEVER interrupted before its wait budget expires`=true
on all 3 SKILLs.

## Provenance-clean
PROVENANCE scan of the edited regions across all 6 files: no `#NNN` / `D-NNN-NN` / `INV-NN` / ADR
tokens introduced. `validate-workflow-contracts.js` PROVENANCE_BAN passes.

## Verification commands (before → after)
- node scripts/test-route-reachability.js  → exit 0, "Route-reachability test passed (260 assertions)." (before AND after)
- node scripts/validate-workflow-contracts.js → "Workflow contract validation passed" (before AND after)
- node scripts/validate-kaola-workflow-contracts.js → "Kaola-Workflow Codex contract validation passed" (before AND after)
- node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js → "...GitLab contract validation passed" (before AND after)
- node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js → "...Gitea contract validation passed" (before AND after)
- node scripts/simulate-workflow-walkthrough.js → "Workflow walkthrough simulation passed" (after)
- git status --porcelain → exactly the 6 declared write-set files, nothing else.
