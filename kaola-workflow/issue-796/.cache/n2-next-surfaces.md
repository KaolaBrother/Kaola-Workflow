evidence-binding: n2-next-surfaces 4ed7b1fee634
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: scaffolding/glue on agent-facing prose + generated-surface rendering — this is prose + a template render, not behavioral logic with a natural failing unit test. The machine assertions that pin the new wording (P1-P6, P9, P12, P15) are added downstream in n5, because a needle asserting text that has not landed yet is red by construction; verification here is the generator's own round-trip contract (--check byte-equality) plus the existing route-reachability/generator test suites, per verification_tier smoke-integration.
<!-- regression-green|build-green|smoke-integration -->
regression-green: see verification_commands below — all real exit codes captured directly (never piped through `| tail`).
<!-- OPEN n1-route-spec's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: n1-route-spec 4fbcce962322

verification_tier: smoke-integration

task: Land all five findings (F1-F5) on the `next` routing topic per n1-route-spec §1 (lane n2), implementing D1/D2/D3 verbatim without re-deciding them:
- F1: fix the numbered-step trap where the active-folder step ran unconditionally ahead of, and could silently overwrite, a user-named target — swap + add an explicit named-target-wins condition (both COMMAND and SKILL regions; SKILL additionally needed an "Extra fix" adding a named-target step that never existed there at all).
- F2 (D1): add the described-task route — a free-form task description resolves to exactly one issue before the claim (via `/kaola-workflow-adapt <description>`), never entering the no-target backlog survey.
- F3: reorder Step 0c "Auto-bundle entry" so "single-issue is the default" is stated in the FIRST paragraph, not after ~80 lines of bundle-shaped prose.
- F4: reword the router's backlog-reader citation from two non-existent headings (`Backlog Inventory` / `What You May Read`) to the real planner heading (`No-target survey mode`), using the load-bearing citation shape `its own *<Name>* section`.
- F5 (D2): reword the Selection-record paragraph to name the `workflow-planner` as the sidecar's writer (`selection-evidence.md`), matching already-shipped docs.

Implemented via the skeleton + ONE slots.js key only; never hand-edited a rendered surface — all six `workflow-next` outputs were produced solely by `node scripts/generate-routing-surfaces.js --write`.

write_set (files actually changed):
- templates/routing/next.skeleton.md (both COMMAND and SKILL regions — §1.1 through §1.6 of the spec)
- templates/routing/slots.js (`nx-sk-004`: leading `2.` -> `3.` in all three forge variants, per §1.7 — the renumbering forced by the SKILL "Extra fix" named-target step)
- commands/workflow-next.md (rendered output of --write)
- plugins/kaola-workflow-gitlab/commands/workflow-next.md (rendered output)
- plugins/kaola-workflow-gitea/commands/workflow-next.md (rendered output)
- plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (rendered output)
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md (rendered output)
- plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md (rendered output)

Not touched (declared for co-movement only, per n1-route-spec §5 table — verified no change was needed): templates/routing/required-blocks.js, scripts/test-route-reachability.js.

verification_commands (run from the leg root, real `$?` captured directly, never via a piped `| tail`):
1. `node scripts/generate-routing-surfaces.js --write` -> "generate-routing-surfaces --write: rendered 12 surfaces." exit 0
2. `git status --short` after --write -> only the 6 next-topic rendered surfaces + the 2 source files changed (plan-run topic untouched, confirming the skeleton edit was scoped correctly)
3. `node scripts/generate-routing-surfaces.js --check` -> "generate-routing-surfaces --check: all 12 surfaces byte-match the skeleton." exit 0
4. `node scripts/test-generate-routing-surfaces.js` -> "test-generate-routing-surfaces: all 280 assertions passed." exit 0
5. `node scripts/test-route-reachability.js` -> "Route-reachability test passed (2221 assertions)." exit 0
6. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/commands/workflow-next.md` -> "Kaola-Workflow GitLab forbidden-only check passed (1 file(s))" exit 0
7. `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js --forbidden-only plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` -> same message, exit 0
8. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/commands/workflow-next.md` -> "Kaola-Workflow Gitea forbidden-only check passed (1 file(s))" exit 0
9. `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js --forbidden-only plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` -> same message, exit 0
10. Manual needle-preservation grep across all six rendered next surfaces for: `auto-bundle entry`, `No target (auto-bundle entry)`, `Branch first on whether the user named an issue`, `selection-evidence`, `thin router`, `--target-issue`, `watch-pr`, `## Co-active Folders`, `workflow-plan.md exists ->` — all present where expected (watch-pr's absence on the gitlab command/skill is pre-existing forge asymmetry (mr-form), not something this lane touched).
11. Manual grep confirming `Backlog Inventory` / `What You May Read` no longer appear anywhere in the six next surfaces (P9 will assert this in n5) — confirmed zero hits.
12. Manual grep confirming P1 ordering (named-target line precedes active-folder line), P2 (`do not read, adopt, or fall back to an active folder`), P3 (`User described a task but named no issue`), P4 (`the backlog survey NEVER runs on this branch`), P6 (`Single-issue is the default here`), P12 (`The planner is that sidecar`) all present in commands/workflow-next.md at the expected relative positions.

before_result: pre-change tree — `git status --short` clean on the leg branch before any edit; `node scripts/generate-routing-surfaces.js --check` on the untouched tree passes trivially (skeletons are reverse-engineered from committed surfaces, so `--check` is a byte-for-byte no-op on a clean tree per the script's own header comment) — this is the documented baseline, not a run I separately invoked, since my first script invocation was `--write` itself.

after_result: all 5 checks above (regenerate, check, test-generate-routing-surfaces, test-route-reachability, both forge forbidden-only pairs) green with real captured exit codes, all listed under verification_commands. `git status --short` after `--write` shows exactly the 8 files in write_set changed and nothing else (no plan-run-topic drift, no stray hand-edits to a rendered surface).

Notes for downstream lanes:
- The citation phrase `its own *No-target survey mode* section` (COMMAND region, and mirrored as `its own *No-target survey mode*\nsection` — line-wrapped but whitespace-normalized-identical — in the SKILL region) is implemented VERBATIM per n1-route-spec's explicit instruction; not re-derived. This is what P10 (n5) will parse.
- SKILL region's Selection-record paragraph intentionally keeps the pre-existing local idiom of NOT appending "role" to `workflow-planner` in that one paragraph (matching what was already there pre-change), per the spec's own instruction to "keep the SKILL region's existing spellings ... do not import command phrasing" — this is a deliberate deviation from the general command->skill substitution table, scoped to that one paragraph only, not an oversight.
- No write-set escape occurred; every file touched is in the declared write set.
