# Workflow Plan — issue #242 (run 1 of 2: Part A ship + Part B planning)

<!-- plan_hash: 7e31d2d42bf6e8370e28f038eab35d678daddae73ada7d1551d0de6a51aba3a1 -->

Scope of THIS frozen plan (agreed two-run split): implement and ship **Part A**
(install-time, profile-aware subagent model resolution) as a **major release**
(Claude `4.0.0` / Codex `2.0.0`), and **plan Part B** (resolve its open decisions
and write an executable Part B plan). Part B *implementation* is a separate
adaptive run (run 2). The tracking issue #242 stays **open** after this run.

## Meta
labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id            | role           | depends_on        | declared_write_set                                                                                                                                                                      | cardinality | shape    |
|---------------|----------------|-------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|----------|
| impl-resolver | tdd-guide      | —                 | scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js, scripts/test-agent-model-resolver.js | 1           | sequence |
| impl-install  | tdd-guide      | impl-resolver     | install.sh, uninstall.sh, scripts/test-install-model-rendering.js, scripts/test-install-adaptive-config.js                                                                              | 1           | sequence |
| version-claude| tdd-guide      | impl-install      | package.json, plugins/kaola-workflow-gitlab/.claude-plugin/plugin.json, plugins/kaola-workflow-gitea/.claude-plugin/plugin.json                                                         | 1           | sequence |
| version-codex | tdd-guide      | version-claude    | plugins/kaola-workflow/.codex-plugin/plugin.json, plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json, plugins/kaola-workflow-gitea/.codex-plugin/plugin.json                       | 1           | sequence |
| review        | code-reviewer  | version-codex     | —                                                                                                                                                                                     | 1           | sequence |
| partb-arch    | code-architect | —                 | —                                                                                                                                                                                     | 1           | sequence |
| partb-doc     | doc-updater    | partb-arch        | docs/investigations/lean-orchestrator-part-b-plan.md                                                                                                                                   | 1           | sequence |
| docs-a        | doc-updater    | review            | docs/architecture.md, docs/api.md, README.md                                                                                                                                          | 1           | sequence |
| finalize      | finalize       | docs-a, partb-doc | CHANGELOG.md                                                                                                                                                                          | 1           | sequence |

## Node Ledger

| id            | status  |
|---------------|---------|
| impl-resolver | complete |
| impl-install  | complete |
| version-claude| complete |
| version-codex | complete |
| review        | complete |
| partb-arch    | complete |
| partb-doc     | complete |
| docs-a        | complete |
| finalize      | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (impl-resolver) | subagent-invoked | .cache/impl-resolver.md (RED `''≠opus` → GREEN; test-agent-model-resolver + validate-script-sync pass; per-node barrier pass) | |
| tdd-guide (impl-install) | subagent-invoked | .cache/impl-install.md (RED→GREEN; manifest emission profile-aware [higher: security-reviewer→opus; common→sonnet]; bash -n + install tests + npm test + walkthrough pass; per-node barrier pass) | |
| tdd-guide (version-claude) | subagent-invoked | .cache/version-claude.md (package.json + gitlab/gitea .claude-plugin → 4.0.0; JSON valid; per-node barrier pass) | |
| tdd-guide (version-codex) | subagent-invoked | .cache/version-codex.md (3 .codex-plugin → 2.0.0; JSON valid; per-node barrier pass) | |
| code-reviewer | subagent-invoked | review node (G1) — .cache/review.md PASS, no blocking findings; code gates exit 0 (script-sync, vendored-agents, resolver/install tests, walkthrough); validate-workflow-contracts deferred to finalize (README lag, proven not a code regression); per-node barrier pass | |
| code-architect (partb-arch) | subagent-invoked | .cache/partb-arch.md — resolved 4 Part B open decisions (direct-aggregator+contractor@phase6/1; aggregators→COMMON_SCRIPTS; contractor stays sonnet; decision-4 keep orchestrator-authors-DAG, run-2 eval); staged build order + asymmetric mirror topology + run-2 DAG; read-only, 0 production writes; barrier pass | |
| doc-updater (partb-doc) | subagent-invoked | docs/investigations/lean-orchestrator-part-b-plan.md (~135 lines; faithful persistence of partb-arch's 4 decisions + staged build order; docs-only; per-node barrier pass) | |
| doc-updater (docs-a) | subagent-invoked | README.md (6 version lines → 4.0.0/2.0.0, exact validate-workflow-contracts strings) + docs/architecture.md (install-time manifest + resolver precedence) + docs/api.md (manifest contract); per-node barrier pass; only remaining contract gap is CHANGELOG [4.0.0] (finalize owns) | |
| finalize (sink) | orchestrator (no finalize agent) | CHANGELOG [4.0.0] written (history kept); whole-plan --gate-verify + --barrier-check exit 0; offline 4-edition npm test exit 0; commit 6e05f70 on branch workflow/issue-242; tag kaola-workflow--v4.0.0; ONLINE validate-workflow-contracts + drift test exit 0. Checkpoint release: #242 NOT closed; folder/push/.cache deferred to user surface. | |

## Node Briefs

Informational only (not covered by `plan_hash`, which hashes `## Meta` + `## Nodes`).
Reference plan: `docs/investigations/lean-orchestrator-contractor-2026-06-04.md`.

- **impl-resolver** (tdd-guide) — Part A resolver fix. Change precedence in
  `kaola-workflow-resolve-agent-model.js` to **manifest → frontmatter(≠inherit) →
  DEFAULT_AGENT_MODELS → ''**: read a `.kaola-agent-models.json` manifest from
  `path.join(agentDir, '.kaola-agent-models.json')` (tolerate missing/unparseable →
  fall through); `inherit` must no longer shadow the DEFAULT fallback. **Mirror the
  edit BYTE-FOR-BYTE to all 4 copies** (root + 3 plugin trees) — they are a
  byte-identical sync group (`validate-script-sync.js`). Extend
  `test-agent-model-resolver.js`: manifest hit wins; higher-profile security-reviewer
  resolves opus; `inherit` frontmatter + manifest miss falls to DEFAULT; missing
  manifest tolerated. Gate: `node scripts/test-agent-model-resolver.js` and
  `node scripts/validate-script-sync.js` pass.

- **impl-install** (tdd-guide) — manifest emission. In `install.sh`, after
  `install_agent_files`, write `~/.claude/agents/.kaola-agent-models.json` =
  `{ "<agent>": "<model>" }` using `resolve_agent_model_for_install` for every
  `REQUIRED_AGENTS` entry, **omitting** agents that resolve to inherit/empty; honor the
  same `KAOLA_AGENT_DIR` base. In `uninstall.sh`, delete the manifest. Cover with
  `test-install-model-rendering.js` / `test-install-adaptive-config.js`: manifest
  written with correct profile-aware values for `default` AND `higher`
  (security-reviewer = opus under higher). Verify via **install dry-run for both
  profiles** (Part A's behavior only exists after install — unit tests alone can't
  prove it). Do NOT re-pin agent frontmatter (stays `inherit`); the dispatch still
  carries an explicit `model=`, so the badge is preserved/restored. No contractor work
  here (that is Part B).

- **version-claude** (tdd-guide) — bump the Claude/main release scheme `3.23.0 → 4.0.0`
  in `package.json` + the gitlab/gitea `.claude-plugin/plugin.json`. Keep numbers
  consistent with README/CHANGELOG (set to 4.0.0). Major bump = the install-format
  change (new `.kaola-agent-models.json`; existing installs must reinstall).

- **version-codex** (tdd-guide) — bump the independent Codex scheme `1.14.0 → 2.0.0`
  in the three `.codex-plugin/plugin.json`. Keep `test-release-surface-drift.js` green.

- **review** (code-reviewer) — G1 reviewer; post-dominates every code-producing node
  (the two impl nodes + the two version nodes). Confirm byte-identity of the 4 resolver
  copies, the manifest precedence/back-compat, and profile-aware correctness. Verify the
  version numbers VISIBLE at this point are internally consistent — `package.json` +
  gitlab/gitea `.claude-plugin/plugin.json` = `4.0.0`, the three `.codex-plugin/plugin.json`
  = `2.0.0`. Run the **version-independent code gates**: `test-agent-model-resolver.js`,
  `validate-script-sync.js`, `validate-vendored-agents.js`, the two install tests, and
  `simulate-workflow-walkthrough.js`. **DEFER** `validate-workflow-contracts.js` and the
  full `npm test` to **finalize** — that contract requires README's "Claude Code command
  install … `4.0.0`" lines and "Codex … plugin manifest: `2.0.0`" refs, which `docs-a`
  (after this node) bumps; running it here would false-fail on the lagging README. Record
  this deferral in the review evidence so finalize knows it owns the release-surface gate.

- **partb-arch** (code-architect, read-only) — resolve Part B's open decisions and
  design the executable Part B plan. The open decisions to resolve: (1) per-node
  contractor vs. Opus-calls-aggregator-directly in the adaptive loop; (2)
  `next-action`/`commit-node` byte-identical sync group vs. `COMMON_SCRIPTS`; (3)
  contractor profile under `--profile=higher` (default: stay sonnet); **(4) NEW —
  whether the adaptive DAG *planning* should be delegated to a `planner` subagent
  (which has no Write tool, so it could only *propose* the table for the main session
  to write/validate/freeze) vs. the current documented choice that the main orchestrator
  authors the DAG.** For (4), capture the context-leanness-vs-comprehension tradeoff
  (the orchestrator must fully comprehend the DAG anyway to govern/freeze/dispatch it —
  delegating saves authoring-context, not comprehension-context) and note that #44
  ("agent owns reasoning") and the documented "do NOT author the plan table" intent
  push back on it. **User decision: evaluate + implement item (4) in run 2, within
  #242** — record it as a first-class Part B work item, do not implement now. Output is
  analysis only (no file writes).

- **partb-doc** (doc-updater) — persist partb-arch's resolved decisions + build order
  into `docs/investigations/lean-orchestrator-part-b-plan.md` (a docs-only deliverable;
  durable home alongside the existing committed plan). Include the resolved open
  decisions, the staged file-level Part B plan (contractor agent, the two aggregator
  scripts, the seam-by-seam command/skill rewires across all 4 editions + Codex
  mirrors), and item (4) as a Part B work item.

- **docs-a** (doc-updater) — document Part A's user-visible change: the install-time
  `.kaola-agent-models.json` manifest + the new resolver precedence (in
  `docs/architecture.md`, and `docs/api.md` if the resolver/manifest contract belongs
  there). **Critically, bump README to satisfy `validate-workflow-contracts.js`** (the
  finalize release gate): the three `Claude Code command install, {GitHub|GitLab|Gitea}
  edition: \`4.0.0\`` lines AND the three `Codex \`<name>\` plugin manifest: \`2.0.0\``
  refs must all be updated (rootVersion=4.0.0, codex=2.0.0). Docs-only (no review gate),
  but README consistency here is what lets finalize's release-surface check pass.

- **finalize** (finalize sink) — add the `4.0.0` CHANGELOG entry on top (KEEP all
  existing history incl. `3.23.0`). **Own the release-surface gate that review deferred:**
  after docs-a has bumped README, run the FULL `npm test` (including
  `validate-workflow-contracts.js` — cross-file version consistency, now satisfiable) +
  `node scripts/simulate-workflow-walkthrough.js` + `node scripts/test-release-surface-drift.js`;
  all must be green BEFORE the commit. Then commit. This is a **checkpoint release, not a
  closeout** — Part B implementation remains for run 2 — so the normal sink closeout is
  intentionally suppressed on three counts: (1) **do NOT close issue #242** (post a
  progress comment summarizing run 1 — Part A shipped + Part B plan written — and leave
  it OPEN); (2) **keep #242 ACTIVE in the roadmap** (regenerate the mirror so #242 still
  shows as active work pointing to run 2 — do not drop its `.roadmap` source); (3) **do
  NOT archive** `kaola-workflow/issue-242/` (the project folder stays active for run 2).
  Cut the release **tag** `kaola-workflow--v4.0.0` (convention: a single root-version tag
  `kaola-workflow--v<X.Y.Z>` is the source of truth; the Codex `2.0.0` manifests are
  validated *at* that tag by `test-release-surface-drift.js`, not separately tagged) on
  the release commit — a tag is a git action, invisible to the DAG/validator, so cut it
  explicitly. Issue/roadmap/archive disposition is an Opus/orchestrator judgment, not a
  sink default.

## Risk note (pre-freeze, expected)

Expected validator verdict: **in-grammar → ask** (the resolver/test writes touch
`SHARED_INFRA`: `scripts` and `plugins/kaola-workflow/scripts`). No Phase-5 sensitivity
(labels and write paths are clean → no `security-reviewer` needed), no write-role
fan-out, no loop. The ask is surfaced for explicit approval before freeze — expected,
not an error.
