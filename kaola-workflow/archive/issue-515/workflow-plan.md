# Workflow Plan — issue-515

<!-- plan_hash: 976160fc418fa3ca3c416b768e6145e2a78195c24c31c56e6e97add68b12ebdd -->

## Meta

labels: bug, area:workflow-router

## Goal

Make adaptive a **zero-deliberation, non-bypassable default** under switch-ON. Two
complementary levers (both owner-endorsed in the issue), within the project's principle
boundaries (cheapest-sufficient #3; Agent-Owns-Reasoning #44; planner-first #287;
accuracy non-negotiable #1):

1. **Script guard (defense-in-depth — the reciprocal `authoring-allowed` analog).** A
   front-door refusal in `claimProject` so a fast/full claim under an ON switch is
   refused (typed `path_requires_explicit_opt_in`) ONLY when the path was **defaulted**
   (no explicit `--workflow-path` and no `KAOLA_PATH` env) — never when explicitly
   opted in. The guard validates / fails-closed; it never SELECTS the path (#44). It is
   NOT routed through, nor does it block, the planner (#287).
2. **Prose floor (clarity/efficiency).** Add the switch-ON contract — "adaptive is the
   default; path selection is a non-decision under switch-ON; do NOT orient / deliberate /
   advisor-consult to choose a path, and do NOT self-route to fast/full on issue size;
   fast/full require an explicit user path-name escape" — to the fast + full entry
   surfaces (#400 six-surface set for each path), machine-pinned by
   `scripts/test-route-reachability.js` so it cannot drift.

## Plan Notes

- **The correctness crux (n1-architect must settle, carried by n2-guard).** `claimProject`
  line ~788 resolves `const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full'`.
  The `|| 'full'` fallback collapses **defaulted** into **explicit full** — exactly the
  bypass case (an agent reaching the fast/full surface without the router has `KAOLA_PATH`
  unset → resolves to `full` → claim proceeds silently). The guard MUST distinguish
  **explicitly-provided** (`args.workflowPath != null || process.env.KAOLA_PATH` set) from
  **defaulted**, checkable BEFORE the `|| 'full'` collapse, and refuse only the
  defaulted-fast/full-under-ON case.
  Three boundaries that MUST survive (accuracy non-negotiable #1):
  - **Switch-OFF default-to-full stays intact** — Branch A relies on `|| 'full'`; the
    guard fires only when the adaptive switch is ON.
  - **Explicit `KAOLA_PATH=fast|full` and `--workflow-path fast|full` under ON stay
    allowed** (the legitimate user escape).
  - **Adaptive + bundle claims pass `--workflow-path` explicitly** so they are already
    safe; verify the guard does not catch them.
- **Guard placement = inline in `claimProject` (claim.js ×4), NOT a schema helper.**
  Cheapest-sufficient (#3): the defaulted-vs-explicit distinction is a small claim.js-local
  concern reading `args.workflowPath` / `process.env.KAOLA_PATH` at the existing line-788
  seam. Factoring it into the byte-identical `kaola-workflow-adaptive-schema.js` would add 4
  files for zero reuse benefit. The refusal must mirror the existing `workflow_path_refused`
  family shape (status/claim/issue/project/reasoning). n1-architect confirms; if the
  architect overturns to a schema helper, the schema ×4 must be added to n2's write set
  (note `generated_port_split` does NOT apply — claim.js and the schema are hand-mirrored
  forge ports, NOT in GENERATED_AGGREGATORS).
- **Cross-edition claim.js scope (#291/#306).** `claimProject` exists in all 4 editions:
  root `scripts/kaola-workflow-claim.js`, codex twin
  `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, and the two edition-NAMED forge
  ports `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` +
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`. The forge ports are
  hand-mirrored (NOT bounded by validate-script-sync), so all four are in n2's write set —
  the canonical guard is the spec; the forge ports mirror it modulo forge nouns.
- **Six-surface prose, per path (#400 / docs/conventions.md §Routing).** FAST path = 6
  surfaces: `commands/kaola-workflow-fast.md` (github-claude), the two forge commands
  (`plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-fast.md`), and the 3 Codex
  SKILLs (`plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-fast/SKILL.md`).
  FULL path ENTRY = 6 surfaces: `commands/kaola-workflow-phase1.md` + the two forge phase1
  commands, and the 3 `kaola-workflow-research` SKILLs (the full-path entry SKILL).
  Cheapest-sufficient (#3): pin the ENTRY surfaces only (the bypass entry points); the
  script guard non-bypassably covers the rest. Forge-codex SKILLs must stay forge-neutral
  (#341): no `gh`/`glab`, no forge brand/request nouns — verify each touched SKILL with the
  forge `--forbidden-only` check.
- **The new pin is test-route-reachability.js-only (established T8/T9/T10 pattern).** The
  switch-ON-contract pin (a `<!-- PIN: adaptive-default-contract -->` comment + a stable
  literal across the 12 fast+full-entry surfaces) is asserted in `scripts/test-route-reachability.js`
  as a new fail-closed block — matching `fast-compliance-backstop` (T10),
  `leg-isolation-recipe` (T8), `speculative-open` (T9), none of which replicate into the four
  `validate-*-contracts.js`. The forge validators run their own surface-existence
  route-reachability; they do NOT need the new content pin.
- **Decision record D-515-01 (next-free; confirmed — no existing D-515-NN).** Owned by
  n5-doc: record the two-lever design + the defaulted-vs-explicit refinement + the principle
  boundaries. n5-doc also extends `docs/conventions.md` §Routing with the reciprocal
  switch-ON guard (the `authoring-allowed` sibling) since this is a public-interface /
  routing-contract change.
- **Finalize bar (cross-edition diff, #307).** A diff touching the edition trees requires all
  four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run
  sequentially — a green claude chain alone is insufficient. n4-review verifies; n6-finalize
  records the CHANGELOG entry.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | opus |
| n2-guard | tdd-guide | n1-architect | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 11 | sequence | sonnet |
| n3-prose | implementer | n1-architect, n2-guard | commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md, commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md, scripts/test-route-reachability.js | 13 | sequence | sonnet |
| n4-review | code-reviewer | n2-guard, n3-prose | — | 1 | sequence | opus |
| n5-doc | doc-updater | n4-review | docs/decisions/D-515-01.md, docs/conventions.md | 2 | sequence | sonnet |
| n6-finalize | finalize | n5-doc | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-guard | complete |
| n3-prose | complete |
| n4-review | complete |
| n5-doc | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect 30911273ec18 | |
| tdd-guide (n2-guard) | subagent-invoked | evidence-binding: n2-guard 7f3d520668cf | |
| implementer (n3-prose) | subagent-invoked | evidence-binding: n3-prose 29495cc8fa31 | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review f9be419f4619 | |
| doc-updater (n5-doc) | subagent-invoked | evidence-binding: n5-doc e26008a5ae83 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 4cc055e6af25 | |
