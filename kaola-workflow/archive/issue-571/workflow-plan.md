# Workflow Plan — issue-571

<!-- plan_hash: 1a6a5a80fb6391e7b6d239238d2af9735b8c8de158adee4c88da3f17a6e39616 -->

Make Codex agent **profiles** global by default (`~/.codex`) — Claude-edition "install once,
works everywhere" parity. Hooks are already global; this flips the *agent-profile* default. The
real coupling is the **preflight gate** (`kaola-workflow-codex-preflight.js`), which today inspects
only the project `.codex` scope and autofix-installs a redundant project-local copy under a
global-only install. Flip the gate to accept the global scope (fail closed when NEITHER scope is
valid), make the Codex init surface scaffolding-only (stop mandating the per-repo `$PWD` agent
install), add a self-documenting `--global` installer flag, and rewrite the docs that assert
profiles are "project-local". Cross-edition (#307) → all four `npm run test:kaola-workflow:*`
chains must be green.

## Meta

labels: enhancement, area:scripts, area:workflow-phases
validation_command: npm test

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | opus |
| n2-engine | tdd-guide | n1-architect | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, scripts/test-install-model-rendering.js | 13 | sequence | sonnet |
| n3-init | implementer | n1-architect | commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md | 6 | sequence | sonnet |
| n4-contracts | implementer | n2-engine, n3-init | scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 3 | sequence | sonnet |
| n5-adversarial | adversarial-verifier | n2-engine | — | 1 | sequence | opus |
| n6-review | code-reviewer | n2-engine, n3-init, n4-contracts, n5-adversarial | — | 1 | sequence | opus |
| n7-docs | doc-updater | n6-review | README.md, docs/architecture.md, docs/api.md, docs/decisions/D-571-01.md | 4 | sequence | sonnet |
| n8-finalize | finalize | n7-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Open design questions — recommended resolutions (n1-architect finalizes against the code)
The issue poses three; the planner records parity-driven recommendations. n1-architect grounds them
in the actual preflight autofix flow + installer arg handling, then writes the rationale to its
`.cache` evidence; n7-docs renders the durable decision into `docs/decisions/D-571-01.md` (next free
record — the D-571 series is empty).
1. **Keep project-local as an opt-in override** (do NOT remove). The installer already supports both
   scopes; removal is a larger breaking change unwarranted by the issue and breaks back-compat.
2. **Preflight scope policy = accept EITHER valid scope** (global `~/.codex` OR project `<repo>/.codex`),
   **fail closed when NEITHER is valid** — the minimal change that satisfies the AC verbatim
   ("passes on the global scope and still fails closed when neither global nor project scope is
   valid"). "Prefer global" is at most an autofix-target refinement, not the gate predicate.
3. **Add the `--global` flag** (targets `os.homedir()/.codex`) AND keep the positional `"$HOME"`
   form working (additive, back-compat). The init surface + docs then read `--global` instead of
   `"$HOME"`.

### Dependency rationale (why the edges, why the antichain)
- **n1-architect (code-architect, opus, read-only)**: the 3 design questions are decisions that
  constrain every downstream node, so they are resolved ONCE up front and grounded in the real
  preflight `inspectScope`/autofix flow + installer arg parsing. Read-only; emits the canonical
  implementation spec (exact fail-closed predicate, `--global` semantics, project-local-as-opt-in)
  + the ADR decision body as `.cache` evidence. Opus: the scope-policy + fail-closed predicate are
  the subtle reasoning floor the cheaper nodes execute against.
- **n2-engine (tdd-guide, sonnet) → n1**: the behavioral core. RED-first — write the failing
  preflight tests (global-scope-only install ⇒ gate PASSES; neither scope valid ⇒ gate FAILS
  CLOSED) into the codex walkthrough `simulate-kaola-workflow-walkthrough.js` (the canonical
  preflight/installer test surface — ENGINE-only, asserts no init-template prose), THEN flip
  `kaola-workflow-codex-preflight.js` to accept the global `~/.codex` scope and add the installer
  `--global` flag. **Byte-identical sync groups (validate-script-sync `BYTE_IDENTICAL_GROUPS`):**
  preflight is a 4-tree byte group (root + 3 plugins) and the installer a 3-tree byte group
  (3 plugins, NO root copy) — all members declared in THIS node so the byte mirrors move atomically
  (sync-group gap #274 satisfied; the four/three files stay byte-equal). Engine test surfaces
  co-located: the 2 forge-codex walkthroughs (which SHELL the test-scripts), the 2 forge
  `test-{gitlab,gitea}-workflow-scripts.js` (#447 hooks-global + preflight-scope assertions), and
  `test-install-model-rendering.js` (claude chain; line ~217 "agent profiles stay project-local"
  comment + the global-hooks AC1 — the narrative this issue flips). No file-count ceiling (#453);
  a cohesive cross-edition engine+test set stays in ONE node.
- **n3-init (implementer, sonnet) → n1**: the Codex init surface becomes scaffolding-only — drop the
  mandated per-repo `install-codex-agent-profiles.js "$PWD"` Step-5 agent install; point to the
  one-time global install/upgrade (`--global`). **The init template is a 6-surface byte-paired set
  (#301 / #400 init flavour):** each edition's `commands/workflow-init.md` is byte-identical to its
  `skills/kaola-workflow-init/SKILL.md` (`validate-script-sync.js` "workflow-init template pair"
  groups: github = root `commands/workflow-init.md` ↔ `plugins/kaola-workflow/skills/.../SKILL.md`;
  gitlab/gitea analogous). The "Codex hooks note" we are rewriting lives in the byte-SHARED region,
  so all SIX files MUST move identically — command ↔ SKILL byte-parity is re-checked by
  `validate-script-sync.js` in every chain. **non_tdd_reason**: init-template prose default-flip; no
  natural failing-unit-test — the runtime assertions live in the contract validators (the coupled
  n4). DISJOINT from n2 (commands/ + skills/ vs scripts/) → antichain sibling of n2. Coupled
  cross-edition prose kept in ONE node (#309): canonical = the github init template; the gitlab/gitea
  surfaces mirror it modulo forge nouns (the forge contract validators pin the forge-specific
  installer path, e.g. `*/kaola-workflow-gitlab/*/scripts/install-codex-agent-profiles.js` — keep
  those references; only the per-repo *mandate* changes).
- **n4-contracts (implementer, sonnet) → n2, n3**: the 3 edition contract validators
  (`scripts/validate-kaola-workflow-contracts.js` is codex-standalone; the 2 forge validators are
  hand-maintained, NOT generated aggregators) assert BOTH init-SKILL content (the installer-path
  `assertIncludes` + cross-edition SKILL parity) AND installer module behavior (`require(installer)`),
  so they can only be aligned AFTER both the engine (n2) and the init surface (n3) land — hence
  depends on both. **non_tdd_reason**: contract-assertion alignment to the new default, no new
  isolated unit.
- **n5-adversarial (adversarial-verifier, opus, read-only) → n2**: independent skeptic on the
  issue's central invariant — actively try to make the gate PASS when it must fail closed (neither
  scope valid; a malformed/partial global scope; a stale managed block). Has Bash → EXECUTES the
  preflight in each scope combination rather than only reading the diff. Routes into n6 (no
  sink-path bypassing the G1 reviewer). Opus: fail-closed-bypass reasoning is the high-risk floor.
- **n6-review (code-reviewer, opus, G1) → n2, n3, n4, n5**: post-dominates EVERY code-producing
  node (n2 tdd-guide, n3/n4 implementers) — every path from each to the sink passes through n6.
  Opus: a cross-edition gate-contract flip whose failure modes (silent project-local fallback; a
  fail-OPEN regression) are subtle.
- **n7-docs (doc-updater, sonnet) → n6**: docs-only, describes the REVIEWED behavior. Rewrites the
  "project-local" assertions to the global-default model — `README.md` (~437/441/495/500/917),
  `docs/architecture.md` (~62 preflight, ~64 "agent profiles ... remain project-local"),
  `docs/api.md` (~1169/1210/1281/1322/1390 `--project-root`/project-local prose; keep project-local
  as the documented opt-in) — and authors `docs/decisions/D-571-01.md` from n1's `.cache` decision.
  No contract validator pins the doc "project-local" phrasing (verified), so the docs are decoupled
  from the test surface.
- **n8-finalize (finalize, sink) → n7**: CHANGELOG.md `[Unreleased]` entry only (sink-legal docs
  write). **MANDATORY finalize evidence (#307):** all four chains green run SEQUENTIALLY
  (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`) — every n2/n3/n4 write touches the
  edition trees, so a green claude chain alone is insufficient (npm test short-circuits on `&&`).
  opencode is additive — D-530-02 (existing) — and unaffected; no separate obligation.

### Out of scope (verified — do NOT include)
- **`scripts/simulate-workflow-walkthrough.js` (claude walkthrough)** — its "preflight" hits are the
  finalize-SINK preflight (`sinkPreflight`), NOT the codex preflight (0 `codex-preflight` refs); its
  `skills/kaola-workflow-init` hits are plan-fixture write-set paths, not content assertions.
- **`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (+ its `scripts/` byte-twin,
  the claude contract validator)** — pins codex-preflight EXISTENCE only (~776/778) + unrelated
  `commands/workflow-init.md` banners (MANDATORY-read, durable-state concept, retired vocabulary);
  asserts NEITHER the codex-install note NOR "project-local", so the n3 init-note rewrite does not
  break it. Touching it would needlessly drag in its COMMON_SCRIPTS byte-twin.
- **No agent-set delta (#340)** — this changes install SCOPE, adds/removes no `agents/*` profile, so
  the 22-path registration surface does NOT apply.
- **No generated-aggregator split (#431)** — none of the write-set files are in `GENERATED_AGGREGATORS`
  (adaptive-node/next-action/commit-node/parallel-batch/adaptive-handoff/plan-validator…); preflight
  & installer are byte-identical mirrors, not forge-renamed ports.

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-engine | complete |
| n3-init | complete |
| n4-contracts | complete |
| n5-adversarial | complete |
| n6-review | complete |
| n7-docs | complete |
| n8-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect e657acf314c9 | |
| tdd-guide (n2-engine) | subagent-invoked | evidence-binding: n2-engine b72a772f6b88 | |
| adversarial-verifier (n5-adversarial) | subagent-invoked | evidence-binding: n5-adversarial 8734410d3680 | |
| implementer (n3-init) | subagent-invoked | evidence-binding: n3-init c38eed02b83c | |
| implementer (n4-contracts) | subagent-invoked | evidence-binding: n4-contracts 7d5b120d3fba | |
| code-reviewer | subagent-invoked | evidence-binding: n6-review 0a76a0ca24b0 | |
| doc-updater (n7-docs) | subagent-invoked | evidence-binding: n7-docs 04b9d2106559 | |
| finalize (n8-finalize) | main-session-direct | evidence-binding: n8-finalize 3b3bb4c6652d | |
