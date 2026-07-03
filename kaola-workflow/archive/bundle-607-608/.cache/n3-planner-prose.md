evidence-binding: n3-planner-prose 1bfdbe06d1c2
non_tdd_reason: cross-edition prose propagation across 13 agent/command/skill surfaces (7 planner-authoring surfaces + 6 plan-run surfaces) + validator/route-reachability enforcement wiring across 6 script files; the enforcing needle is authored alongside the prose in the same commit, and correctness is verified by the contract-validator/test chains (all 5 required commands green before and after) — no isolated failing unit test precedes prose-and-needle authoring of this shape.
regression-green:
- `node scripts/validate-workflow-contracts.js` → "Workflow contract validation passed" (exit 0)
- `node scripts/test-route-reachability.js` → "Route-reachability test passed (257 assertions)." (exit 0)
- `node scripts/test-agent-profile-parity.js` → "agent-profile parity tests passed (27 assertions)" (exit 0)
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` → "Kaola-Workflow GitLab contract validation passed" (exit 0)
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → "Kaola-Workflow Gitea contract validation passed" (exit 0)
- All five commands run from the leg root (`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/bundle-607-608/n3-planner-prose`) after all edits landed.
- Byte-mirror invariants re-confirmed post-edit: `diff` clean across the workflow-planner.toml triple (codex/gitlab/gitea) and across the `validate-workflow-contracts.js` byte pair (root ↔ `plugins/kaola-workflow/scripts/`).
- PROVENANCE_BAN self-check: `grep -nE '#[0-9]{1,4}|D-[0-9]{3}-[0-9]{2}|INV-[0-9]+|ADR[ -][0-9]{2,4}'` over all 13 prose surfaces returned no matches (issue/decision refs kept only in the `.js` validator/test comments, which are not agent-facing prompt surfaces).

## Surface-by-surface checklist (13 prose surfaces + 6 validator/test files = 19 files, matching the declared write set exactly)

### Planner authoring guidance (7 surfaces) — new rule: gate instrumentation is provisioned by an upstream writer node inside its declared write set; the gate only runs it; the plan states the durability decision (durable/committed/env-gated vs ephemeral with downstream-owned deletion); out-of-repo scratch stays legal.
1. `agents/workflow-planner.md` — new bullet added to the Grammar section, immediately after the existing "Non-delegable acceptance gates (`main-session-gate`)" bullet. DONE.
2. `plugins/kaola-workflow/agents/workflow-planner.toml` — equivalent sentence inserted into the Method step-2 paragraph, between the main-session-gate description and the FANOUT_CAP sentence. DONE.
3. `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml` — copied byte-identical from the codex twin (the triple was byte-identical before this change and stays byte-identical after — confirmed via `diff`). DONE.
4. `plugins/kaola-workflow-gitea/agents/workflow-planner.toml` — same. DONE.
5. `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md` — new bullet added to "## Shaping guidance (recommendations, not gates)", after the `knowledge-lookup` bullet and before "### Question-shaped & bug-shaped issues". DONE.
6. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md` — same insertion (file otherwise differs from the codex twin only in forge-specific script names/sink nouns elsewhere; this insertion point and text are identical). DONE.
7. `plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md` — same. DONE.

Curated substring shared verbatim across all 7: "the gate never authors or deletes files" (also the parity token, see below).

### Plan-run gate instructions (6 surfaces) — VERBATIM-IDENTICAL block (confirmed via md5 of the inserted span — all six hash to `b88c63ecfa821599e7eb6054812bd0a5`): a `main-session-gate` node body never instructs authoring files; instrumentation is provisioned by an upstream writer node; the gate-window fence exists (in-worktree out-of-band Write/Edit during a gate window denied by default; `KAOLA_GATE_WINDOW_FENCE=0` opt-out; legal exits named). Inserted as a new `<!-- PIN: gate-instrumentation-provisioning -->` block immediately before the existing `<!-- PIN: leg-isolation-recipe -->` anchor (same anchor point confirmed present, byte-identical, in all six files pre-edit).
8. `commands/kaola-workflow-plan-run.md` — DONE.
9. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` — DONE.
10. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` — DONE.
11. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` — DONE.
12. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md` — DONE.
13. `plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md` — DONE.

### Enforcement needles (6 files)
14. `scripts/validate-workflow-contracts.js` — added (a) a standalone `agents/workflow-planner.md` + 3×`kaola-workflow-adapt/SKILL.md` needle for "the gate never authors or deletes files" (placed next to the existing `#334` main-session-gate block), and (b) a new `planRunSurfacesGateFence607` six-surface loop (mirroring the existing `planRunSurfaces606` pattern) asserting `<!-- PIN: gate-instrumentation-provisioning -->` and `KAOLA_GATE_WINDOW_FENCE=0` on all 6 plan-run surfaces. DONE.
15. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-copied from #14 (confirmed byte-identical pair both before and after this change). DONE.
16. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — added the same two needles to the existing `planRunSurface` for-loop (command + SKILL) plus a standalone needle on `agents/workflow-planner.toml` + `skills/kaola-workflow-adapt/SKILL.md` (forge-appropriate `pluginRoot`-relative paths, next to the existing `#334` GitLab main-session-gate block). DONE.
17. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — same, Gitea edition. DONE.
18. `scripts/test-route-reachability.js` — added `T15`, a new six-surface block following the exact T5/T8/T9/T14 pattern, asserting the PIN comment + the `KAOLA_GATE_WINDOW_FENCE=0` literal on all 6 plan-run surfaces (unconditional assert, no self-disarming warn gate). DONE.
19. `scripts/test-agent-profile-parity.js` — added `'the gate never authors or deletes files'` to the curated `FEATURE_TOKENS` list, enforcing md↔toml drift-parity across the workflow-planner.toml triple whenever the token is present in `agents/workflow-planner.md`. DONE.

## Deviations from the dispatch brief
- None. All 19 files in the declared write set were touched and no file outside it was modified (`git status --porcelain` inside the leg lists exactly these 19 paths).
- `commands/kaola-workflow-adapt.md` (the 3 edition command routers) were deliberately NOT touched — they are not in the declared write set and do not currently carry planner-grammar detail (only `agents/workflow-planner.md` + its toml twins + the `kaola-workflow-adapt` SKILL.md packs describe `main-session-gate` authoring), so the planner-authoring rule belongs only on the 7 surfaces edited, consistent with the pre-existing asymmetry in this codebase.
- Layers 2 (runtime gate-window fence in open-next/close/reconcile/write-lane.sh) and 3 (evidence-token check in `checkEvidenceShape`) are out of this node's declared write set and are owned by sibling nodes (n2-gatefence and others per the task list); this node's prose intentionally references the fence's behavior and env-var name (`KAOLA_GATE_WINDOW_FENCE=0`) as specified in the issue text, without asserting on n2's implementation files.
