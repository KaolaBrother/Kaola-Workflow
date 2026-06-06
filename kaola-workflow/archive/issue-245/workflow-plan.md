# Workflow Plan — issue-245

<!-- plan_hash: b4bb92beecf0a2bd53d74cadf768644bb0404cce201b4cc3ca213567fba093a4 -->

## Meta
labels: bug, area:workflow-phases
summary: Insert the canonical `kaola_script()` path resolver into the adaptive skill + 3 edition adapt command files, which currently invoke a Kaola script via an UNDEFINED resolver (`$KAOLA_SCRIPTS` / bare `scripts/...`), causing MODULE_NOT_FOUND on the first authoring-guard call in consumer projects that do not vendor the scripts. Mechanical/trivial fix mirroring the resolver already used in the non-adaptive entries (e.g. kaola-workflow-phase1.md).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|-----------|--------------------|-------------|-------|
| explore | code-explorer | — | — | 1 | sequence |
| impl | tdd-guide | explore | plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md | 1 | sequence |
| review | code-reviewer | impl | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | evidence | notes |
|----|--------|----------|-------|
| explore | complete | .cache/explore.md | per-node barrier pass (read-only, no write set) |
| impl | complete | .cache/impl.md | per-node barrier pass (4 declared adapt files, baseline b5790706); RED MODULE_NOT_FOUND → GREEN resolver resolves real install-dir path; thrash 0 |
| review | complete | .cache/review.md | per-instance barrier pass (no write set; barrierCheck pass, 0 errors/sensitiveHits/outOfAllow); G1 verdict PASS (APPROVE) — CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0 |
| finalize | complete | .cache/finalize.md | per-node barrier pass (CHANGELOG.md only, baseline 6487c9dd); barrierCheck pass (0 errors/sensitiveHits/outOfAllow); gateVerify ok (no unsatisfied gates); docs/state only |

## Node Briefs

### explore (code-explorer) — locate the undefined resolver + the canonical pattern to copy

Read-only. Confirm the exact site in each of the 4 in-scope files where a Kaola script is invoked via the UNDEFINED resolver (`$KAOLA_SCRIPTS` / bare `scripts/...`), and read the canonical `kaola_script()` resolver as used in a non-adaptive entry (e.g. `commands/kaola-workflow-phase1.md`) so the implement node copies the proven block verbatim. Record findings to `.cache/explore.md`. No writes.

### impl (tdd-guide) — insert the canonical `kaola_script()` resolver into all 4 in-scope files

Owns exactly these 4 files (kept together in ONE sequence node so the shared `plugins` top-level dir is not split by a fan-out):
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md

Replace the undefined resolver with the canonical `kaola_script()` block (the same resolver already used by the non-adaptive entries), so the first authoring-guard call resolves the script path instead of throwing MODULE_NOT_FOUND in a consumer project that does not vendor the scripts. Surgical: touch only the resolver site; do not reword unrelated prose, rubrics, or contracts. Record RED (reproduce/identify the undefined-resolver site) → GREEN (resolver inserted, parity across the 3 editions) in `.cache/impl.md`. Barrier touches ONLY these 4 declared files.

### review (code-reviewer) — G1 over the impl node

Adversarial review: confirm ONLY the resolver insertion landed in the 4 files, that the inserted block matches the canonical `kaola_script()` resolver, cross-edition parity across github/gitlab/gitea + the skill, and that no unrelated prose/rubric/contract changed. Verdict to `.cache/review.md`.

### finalize (finalize sink) — `CHANGELOG.md` `[Unreleased]` only

Append a "#245: insert canonical `kaola_script()` resolver into the adaptive skill + 3 edition adapt commands (fixes MODULE_NOT_FOUND on first authoring-guard call)" entry under `CHANGELOG.md` `[Unreleased]`. Docs/state only.

## Required Agent Compliance

| node                    | status           | evidence                                                                         |
|-------------------------|------------------|----------------------------------------------------------------------------------|
| code-explorer (explore) | subagent-invoked | `.cache/explore.md` — READ-ONLY findings: 4 undefined-resolver sites (SKILL.md:112 + 3 edition adapt:170/172) + canonical `kaola_script()` resolver blocks per edition (github/gitlab/gitea); per-node barrier pass (no write set) |
| tdd-guide (impl)        | subagent-invoked | `.cache/impl.md` — RED: MODULE_NOT_FOUND reproduced in scratch non-kaola dir; GREEN: `kaola_script()` resolver inserted into all 4 declared files (SKILL.md site A `$(kaola_script …)` + sites B/C/D bare-name prose; 3 edition adapt bash fences), resolves real `$HOME/.claude/.../scripts/` path, no MODULE_NOT_FOUND; thrash 0; per-node barrier pass (barrierCheck pass, 0 errors/sensitiveHits/outOfAllow, baseline b5790706) |
| code-reviewer           | subagent-invoked | `review` node (G1 GATE over impl) — `.cache/review.md`: VERDICT PASS (APPROVE), G1 gate satisfied; per-instance barrier pass (no write set; barrierCheck pass, 0 errors/sensitiveHits/outOfAllow); COMPLETENESS/PER-EDITION CORRECTNESS/WELL-FORMEDNESS/SURGICAL/GRAMMAR-GATE all PASS; severity CRITICAL 0 / HIGH 0 / MEDIUM 0 / LOW 0 |
| finalize (sink)         | orchestrator (no finalize agent) | `finalize` node (SINK, non-gate) — `.cache/finalize.md`: appended #245 `[Unreleased]` entry to `CHANGELOG.md` (docs/state only, no source/code change); per-node barrier pass (CHANGELOG.md only, baseline 6487c9dd; barrierCheck pass, 0 errors/sensitiveHits/outOfAllow; gateVerify ok, no unsatisfied gates) |
