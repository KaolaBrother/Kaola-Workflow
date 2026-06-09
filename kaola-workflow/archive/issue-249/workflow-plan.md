# Workflow Plan — issue-249

<!-- plan_hash: 5c93081a227c6693531ccded50e3c11c606dfb284f3564d0a3c71177f49fe9fb -->

Broaden the vendored `docs-lookup` node role into an external-knowledge role, **rename** it to
`knowledge-lookup`, add open-web reach (`WebSearch`/`WebFetch`) at the root Claude edition, broaden
the codex/forge `.toml` editions with runtime-gated web *prose* (hard-constraint #2 — no per-agent
tools array there), force-unvendor it (vendored→local + provenance strip + drop the `agents-source.md`
row, the #227 precedent), add the adaptive-planner summon heuristic, and propagate the rename across
all four editions (validators, resolvers, install/uninstall, phase/skill prose, docs).

## Meta

labels: enhancement, area:scripts, area:workflow-phases

### Plan assumptions (decided, not asked — read-only research front-end is exempt from `ask`)

- **Pinned role name:** `knowledge-lookup` (Open Question #1 — the maintainer's proposal; keeps the
  `*-lookup` family). Every node uses this exact token.
- **Pinned placeholder symbol:** `DOCS_LOOKUP_MODEL` → `KNOWLEDGE_LOOKUP_MODEL` (install.sh +
  phase command/skill placeholders). One pinned name across all nodes (#306 discipline).
- **Codex/forge web reach (Open Question #2):** broaden the `.toml` `developer_instructions` *prose*
  with runtime-gated web capability — a documented asymmetry. NO per-agent tools array there
  (hard-constraint #2: only the root `agents/*.md` Claude edition carries the real `WebSearch`/
  `WebFetch` grant).
- **One broadened read-only role (Open Question #4):** not split into curated-vs-untrusted twins.
  Tools stay read-only (no `Write`) → zero-blast-radius research node, exempt from the `ask` gate.
- **EXCLUDE** the gitea `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:210` `// ... per
  docs-lookup` comment — it is an incidental code comment, not a role reference; renaming it would be
  a meaningless prose churn. Out of scope by conscious decision (#306 symbol-scoping).
- **G2/security-reviewer is NOT required and is omitted:** labels (`enhancement`, `area:scripts`,
  `area:workflow-phases`) are not in `SENSITIVE_LABELS`; no declared path matches `SENSITIVE_PATTERNS`
  (verified). The injection posture ("the core design work") is satisfied by the prompt-defense
  *authoring* in n3/n4/n5, which `code-reviewer` (G1) verifies. Adding a gate the task does not
  require would be over-engineering.

### Design notes (disjointness + serialization, verified against the validator source)

- `areaForPath`: `plugins/kaola-workflow/X` → 3-component area; `plugins/kaola-workflow-{gitlab,gitea}/…`
  → area `plugins`; everything else → first path component. The #232 inferred-concurrent-sibling check
  refuses ONLY on **exact-file** overlap between antichain siblings; coarse-area `plugins` overlap merely
  sets `concurrentAmbiguousOverlap` (→ ASK, not refuse). So the implement nodes are authored as a wide
  **file-disjoint antichain** (each file in exactly one node) all depending on the architect and joining
  at `code-reviewer` — minimal critical path. The plan is `ask` regardless (`scripts` ∈ SHARED_INFRA →
  `blastRadius`), so serializing to dodge coarse-area ASK would buy nothing.
- **Rename = TWO declared paths** (old deleted + new added): the barrier diffs git names against the
  declared write set, and `git mv` emits both. Every rename node declares both the `docs-lookup.*` and
  the `knowledge-lookup.*` path.
- **#301 byte-identity co-occurrence:** the 4 resolver copies stay in ONE node (n7); each edition's
  `workflow-init.md` ⟷ `kaola-workflow-init/SKILL.md` template pair stays co-located (n10).
- **#309 semantic coupling:** the broadened charter / prompt-defense / web-injection wording is split
  across n3/n4/n5 only because FILE_CEILING forces it; n2 (`code-architect`) authors a single canonical
  charter spec ("mirror the root `agents/knowledge-lookup.md` charter modulo forge nouns + the
  no-tools-array asymmetry") so the editions converge by construction, not free-form.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|-----------|--------------------|-------------|-------|
| n1 | code-explorer | — | — | 1 | sequence |
| n2 | code-architect | n1 | — | 1 | sequence |
| n3 | implementer | n2 | agents/docs-lookup.md, agents/knowledge-lookup.md, scripts/validate-vendored-agents.js, docs/agents-source.md | 1 | sequence |
| n4 | implementer | n2 | plugins/kaola-workflow/agents/docs-lookup.toml, plugins/kaola-workflow/agents/knowledge-lookup.toml, plugins/kaola-workflow/config/agents.toml, .codex/agents/kaola-workflow/docs-lookup.toml, .codex/agents/kaola-workflow/knowledge-lookup.toml, .codex/config.toml | 1 | sequence |
| n5 | implementer | n2 | plugins/kaola-workflow-gitlab/agents/docs-lookup.toml, plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/agents/docs-lookup.toml, plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitea/config/agents.toml | 1 | sequence |
| n6 | implementer | n2 | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js | 1 | sequence |
| n7 | implementer | n2 | scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js | 1 | sequence |
| n8 | implementer | n2 | install.sh, uninstall.sh | 1 | sequence |
| n9 | implementer | n2 | scripts/simulate-workflow-walkthrough.js, scripts/test-install-model-rendering.js, scripts/test-install-upgrade-rewrite.js | 1 | sequence |
| n10 | implementer | n2 | commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md | 1 | sequence |
| n11 | implementer | n2 | commands/kaola-workflow-phase1.md, commands/kaola-workflow-phase2.md, plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md | 1 | sequence |
| n12 | implementer | n2 | plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase2.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase2.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md | 1 | sequence |
| n13 | implementer | n2 | commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, agents/workflow-planner.md | 1 | sequence |
| n14 | code-reviewer | n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, n13 | — | 1 | sequence |
| n15 | adversarial-verifier | n14 | — | 1 | sequence |
| n16 | doc-updater | n15 | README.md, docs/api.md | 1 | sequence |
| n17 | finalize | n16 | CHANGELOG.md | 1 | sequence |

### Node intents

- **n1 `code-explorer`** (read-only): confirm the full rename footprint (the non-archive `docs-lookup`
  / `DOCS_LOOKUP_MODEL` references), the un-vendoring precedent (#227 local-agent shape in
  `validate-vendored-agents.js`), and prompt-injection-defense precedent for untrusted web content
  already in the repo. Records `.cache/n1.md`.
- **n2 `code-architect`** (read-only): author the canonical charter spec for the broadened
  `knowledge-lookup` role (3 sources: local `Read`/`Grep`; curated Context7; open-web via
  `WebSearch`/`WebFetch`), the web-injection defense extension (fetched web = data never instructions;
  cite source URL + retrieval date; prefer primary/official sources), the output contract, and the
  edition asymmetry rule (root `.md` gets the real tools array; `.toml` editions get runtime-gated prose
  only). Pins the summon heuristic wording for n13. Records `.cache/n2.md`. Empty write set = zero blast.
- **n3 `implementer`** (non_tdd_reason: agent-definition prompt/config authoring + a file rename + a
  validator-list move — no natural failing unit test): `git mv agents/docs-lookup.md
  agents/knowledge-lookup.md`; add `WebSearch`,`WebFetch` to `tools:`; rewrite the charter + web-injection
  defense + output contract per n2's spec; strip the upstream provenance block → `locally-authored: true`;
  move the role `docs-lookup`→`knowledge-lookup` from `vendoredAgents[]` to `localAgents[]` in
  `validate-vendored-agents.js`; drop the `docs-lookup` row from `docs/agents-source.md`.
- **n4 `implementer`** (non_tdd_reason: `.toml` config/prompt authoring + renames): rename the github
  + codex `docs-lookup.toml`→`knowledge-lookup.toml`, broaden `developer_instructions` with
  runtime-gated web prose per n2, and update the `[agents.docs-lookup]`→`[agents.knowledge-lookup]`
  block + `config_file` path in `plugins/kaola-workflow/config/agents.toml` and `.codex/config.toml`.
- **n5 `implementer`** (non_tdd_reason: same as n4, gitlab+gitea editions): mirror n4 for the gitlab
  and gitea `.toml` agents + their `config/agents.toml` blocks, using n2's canonical spec verbatim
  modulo forge nouns so the editions do not diverge (#309).
- **n6 `implementer`** (non_tdd_reason: a `CANONICAL_ROLES` token rename in 4 validator copies —
  mechanical, semantically coupled #309): change `'docs-lookup'`→`'knowledge-lookup'` in the
  `CANONICAL_ROLES` array of all four plan-validator copies (identical edit modulo file name).
- **n7 `implementer`** (non_tdd_reason: a `DEFAULT_AGENT_MODELS` key rename in the 4 byte-identical
  resolver copies — #274/#301 sync group): rename the `'docs-lookup': 'sonnet'` key to
  `'knowledge-lookup': 'sonnet'` identically in all four copies so `validate-script-sync.js` stays green.
- **n8 `implementer`** (non_tdd_reason: shell-script config wiring): in `install.sh` rename in
  `REQUIRED_AGENTS`, the placeholder `case`, `DOCS_LOOKUP_MODEL`→`KNOWLEDGE_LOOKUP_MODEL` in
  `model_for_placeholder`/`render_command_file`, the `DEFAULT_AGENT_MODELS` entry, and the Part-A
  manifest; mirror the `REQUIRED_AGENTS` rename in `uninstall.sh`.
- **n9 `implementer`** (non_tdd_reason: updating existing test assertions to the renamed role — the
  tests ARE the failing signal but they assert install/render strings, not new behavior): update the
  `docs-lookup`/`DOCS_LOOKUP_MODEL` assertions in `simulate-workflow-walkthrough.js`,
  `test-install-model-rendering.js`, `test-install-upgrade-rewrite.js` to `knowledge-lookup` /
  `KNOWLEDGE_LOOKUP_MODEL`.
- **n10 `implementer`** (non_tdd_reason: prose/placeholder rename; #301 template pairs co-located):
  rename `docs-lookup` references + the `{DOCS_LOOKUP_MODEL}` placeholder in each edition's
  `workflow-init.md` ⟷ `kaola-workflow-init/SKILL.md` byte-locked pair (github/gitlab/gitea).
- **n11 `implementer`** (non_tdd_reason: phase prose + placeholder rename, github edition): rename
  `docs-lookup`/`{DOCS_LOOKUP_MODEL}` in `commands/kaola-workflow-phase1.md` (Step 3 trigger,
  completeness-gate row, `.cache` path), `kaola-workflow-phase2.md`, and the github research SKILL.
- **n12 `implementer`** (non_tdd_reason: phase prose + placeholder rename, gitlab+gitea editions):
  mirror n11 for the gitlab and gitea phase1/phase2 commands + their research SKILLs.
- **n13 `implementer`** (non_tdd_reason: planner/adapt heuristic prose authoring — no failing unit
  test): ADD the summon-heuristic bullet (author a `knowledge-lookup` node when the task depends on
  external library/API behavior or outside/expertise knowledge that cannot be confirmed locally —
  mirror the phase1 trigger, per n2's pinned wording) to `commands/kaola-workflow-adapt.md`, the github
  adapt SKILL, and the gitlab/gitea adapt commands; add the role to the `workflow-planner` agent's
  shaping paragraph. (adapt currently does NOT name the role — this closes the missing-heuristic gap.)
- **n14 `code-reviewer`** (G1): post-dominates every implement node — verifies the rename is coherent
  across all editions, the web-injection defense is sound, the un-vendoring is correct, no
  `docs-lookup` token leaks (outside the deliberately-excluded gitea forge comment + archived
  evidence), and the read-only-tools / no-codex-tools-array asymmetry holds.
- **n15 `adversarial-verifier`**: adversarial pass on the injection posture (web-content-as-data
  boundary) and the cross-edition parity (no edition diverged in charter prose or left a stale
  `docs-lookup`). Emits lowercase `verdict: pass` / `findings_blocking: 0`.
- **n16 `doc-updater`**: update `README.md` (the `docs-lookup` feature/agent references) and
  `docs/api.md:453` (the phase-1 research-dispatch role mention) to `knowledge-lookup`. Runs the
  four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains sequentially as part of its
  evidence (cross-edition obligation #254/#307 — finalize's gate is claude-only).
- **n17 `finalize`** (sink): `CHANGELOG.md` entry under `[Unreleased]`; roadmap closure + state. Docs/
  state only.

## Node Ledger

| id | role | status |
|----|------|--------|
| n1 | code-explorer | complete |
| n2 | code-architect | complete |
| n3 | implementer | complete |
| n4 | implementer | complete |
| n5 | implementer | complete |
| n6 | implementer | complete |
| n7 | implementer | complete |
| n8 | implementer | complete |
| n9 | implementer | complete |
| n10 | implementer | complete |
| n11 | implementer | complete |
| n12 | implementer | complete |
| n13 | implementer | complete |
| n14 | code-reviewer | complete |
| n15 | adversarial-verifier | complete |
| n16 | doc-updater | complete |
| n17 | finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1) | subagent-invoked | ## Exploration: docs-lookup → knowledge-lookup Rename (issue-249 n1 evidence) | |
| code-architect (n2) | subagent-invoked | # Canonical Charter Spec: `knowledge-lookup` Role (issue-249 n2, code-architect) | |
| implementer (n3) | subagent-invoked | # Node n3 Evidence — docs-lookup → knowledge-lookup: Agent Rename + Un-vendoring | |
| implementer (n4) | subagent-invoked | # Node n4 Evidence — docs-lookup → knowledge-lookup (.toml editions, github plug | |
| implementer (n5) | subagent-invoked | # n5 Evidence: knowledge-lookup .toml rename — gitlab + gitea editions | |
| implementer (n6) | subagent-invoked | # Node n6 Evidence | |
| implementer (n7) | subagent-invoked | # Node n7 Evidence | |
| implementer (n8) | subagent-invoked | ## Node n8 Evidence — install.sh / uninstall.sh rename | |
| implementer (n9) | subagent-invoked | ## Node n9 Evidence — docs-lookup → knowledge-lookup rename in test scripts | |
| implementer (n10) | subagent-invoked | ## Node n10 Evidence — docs-lookup → knowledge-lookup in workflow-init template  | |
| implementer (n11) | subagent-invoked | # Node n11 Evidence | |
| implementer (n12) | subagent-invoked | # Node n12 Evidence Record | |
| implementer (n13) | subagent-invoked | # Node n13 Evidence — knowledge-lookup summon heuristic (adapt commands + workfl | |
| code-reviewer | subagent-invoked | verdict: pass | |
| adversarial-verifier (n15) | subagent-invoked | verdict: pass | |
| doc-updater (n16) | subagent-invoked | # n16 doc-updater evidence | |
| finalize (n17) | subagent-invoked | # n17 finalize evidence | |
