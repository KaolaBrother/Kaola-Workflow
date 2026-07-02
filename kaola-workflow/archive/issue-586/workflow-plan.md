# Workflow Plan — issue-586

<!-- plan_hash: 64eaaf0634f09f1209352d13ac1acb7faa42474457c6608a185e42b991392ec6 -->

Retire the `kaola-workflow-parallel-batch.js` subsystem. It is provably OFF the live executor
path (the running-set scheduler in `kaola-workflow-adaptive-node.js` superseded it — CLAUDE.md
states adaptive-node "does NOT shell it"; the issue confirms adaptive-node's three matches are
prose comments, not calls, and outside tests the references are registries only). It carries real
crash-safety defects (no `'sealing'` marker; compliance-row double-apply; non-atomic
`reconcile --abort`) and its operator card documents a CLI that does not exist. The issue author
chose RETIREMENT (mirrors the ADR-0008 excision precedent). This plan removes the dead
IMPLEMENTATION (script ×4 editions + its test + registry wiring), strips every parallel-batch
REFERENCE from the operator card / routing surfaces / docs, and records the decision in an ADR.
Cross-edition (#307): the removal touches registries + all four edition trees, so all four
`npm run test:kaola-workflow:*` chains must be green (run sequentially) before finalize.

## Meta

labels: bug, documentation, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-remove | implementer | — | scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js, scripts/test-parallel-batch.js, scripts/edition-sync.js, scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/validate-script-sync.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, package.json, scripts/test-adaptive-node.js, scripts/test-bundle-state.js | 17 | sequence | sonnet |
| n2-docs | doc-updater | n1-remove | docs/plan-run-cards/frontier-batch.md, docs/plan-run-cards/README.md, docs/plan-run-cards/repair-routing.md, docs/README.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/workflow-state-contract.md, docs/decisions/D-586-01.md, CLAUDE.md, README.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 17 | sequence | sonnet |
| n3-review | code-reviewer | n1-remove, n2-docs | — | 1 | sequence | opus |
| n4-finalize | finalize | n3-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Direction (issue-authorized)
The issue author chose **retire, not fix** ("Prefer retirement"; the code is provably dead;
mirrors the ADR-0008 excision precedent). This plan does not add crash-safe markers or rewrite the
CLI — it removes the subsystem and records the decision.

### Scope boundary — what is retired vs deliberately untouched
- **Retired (n1):** the standalone `parallel-batch` aggregator (canonical + codex byte-twin + both
  forge ports), its test `test-parallel-batch.js`, and every registry/test that wires or pins it.
- **Deliberately UNTOUCHED (dispatch constraint: "the running-set scheduler must NOT be touched —
  it's the live path"):** the successor engine `kaola-workflow-adaptive-node.js`,
  `kaola-workflow-adaptive-schema.js`, and `kaola-workflow-plan-validator.js` (and their edition
  ports) retain their internal **design-lineage comments** that mention parallel-batch (e.g.
  "Mirrors parallel-batch runReconcile", "the SAME verdict the parallel-batch crossCheckStatus gate
  gives") and the defensive `batch_active` / `active-batch.json` guard. These are historical
  annotations in the live path + defensive code, NOT the subsystem. The issue itself confirms
  nothing require()s or shells parallel-batch.js from the live scheduler, so its deletion does not
  break runtime. Whether the now-orphaned `batch_active` guard should also be removed is a separate
  live-path change deserving its own RED-first treatment — a clean follow-up, out of this
  retirement's scope. This scope boundary is recorded in D-586-01 so it is a deliberate, reviewable
  decision, not a missed reference. n3-review confirms these are the ONLY surviving mentions and
  that they are intentional lineage, not dangling calls.

### frontier-batch.md is REWRITTEN, not deleted (design decision the planner owns)
The dispatch's retirement recipe lists `frontier-batch.md (delete)` and flags that a dangling card
reference would break route-reachability. Investigation shows the "frontier unit" concept is a
**live** concept, not a parallel-batch artifact: the running-set scheduler (`open-ready` /
`close-node` / `reconcile-running-set`) IS a frontier fan-out engine, and `<!-- PIN: frontier
unit -->` + the literal `frontier unit` are pinned on all SIX routing surfaces by
`scripts/test-route-reachability.js` T5 AND by three contract validators
(`validate-workflow-contracts.js:898` + its codex byte-twin, `...gitlab-contracts.js:779`,
`...gitea-contracts.js:784`). The card, however, documents a nonexistent parallel-batch CLI
(`open-batch` / `seal-member` / `--batch-id` / `--nodes` / `--evidence-file`; §9 describes the
ADR-0008-excised isolation design). So n2 **rewrites** the card to document ONLY the live
running-set scheduler CLI truthfully (every example copy-pastes against the real
`adaptive-node.js` subcommands), stripped of every parallel-batch reference. This satisfies the AC
("no card references to the subsystem remain") AND preserves the live-engine operator docs + the
route-reachability contract, WITHOUT invasively editing the enforcement tests or removing a live
concept. Deleting the card instead would force retiring the T5 + three contract pins and would
delete the only operator card for the live frontier engine — a documentation regression and a
larger blast radius. The 6 routing surfaces keep their `<!-- CARD: frontier-batch -->`,
`<!-- PIN: frontier unit -->`, `frontier unit`, and `docs/plan-run-cards/frontier-batch.md`
pointer; n2 only corrects the card-block prose that names the nonexistent subcommands to the real
`open-ready` / `close-node` / `reconcile-running-set` CLI. **n2 MUST preserve every existing
PIN/CARD marker on all 6 surfaces** (frontier unit, speculative-open, adaptive-default-contract,
etc.) — only the frontier-batch card-block prose changes.

### n1 write-set coupling (why 17 files are ONE atomic node)
- **generated_port_split wall:** `kaola-workflow-parallel-batch.js` is a GENERATED_AGGREGATOR
  (edition-sync.js), so the canonical + codex twin + both forge ports MUST be declared in the same
  node (they are). Deleting them is atomic anyway.
- **sync-group gap (#274):** the byte-twin pairs `validate-workflow-contracts.js` ↔ codex twin and
  `kaola-workflow-install-manifest.js` ↔ codex twin are COMMON_SCRIPTS members; both halves are
  declared here so no peer is orphaned.
- **module-require atomicity:** `scripts/test-adaptive-node.js` `require()`s
  `./kaola-workflow-parallel-batch` at two sites (S-293cc + one sibling) and `test-bundle-state.js`
  names it in a comment; deleting the module while a chain-run test still requires it would red the
  claude chain, so the deletions + these test edits MUST land together. n1 removes ONLY the two
  `crossCheckStatus` import blocks (which pin the deleted script's own function) and leaves the live
  S-RT9 `batch_active` guard test intact (it constructs `active-batch.json` directly — no
  parallel-batch import — so it survives).
- **registry removals for chain-greenness:** remove the parallel-batch entry from
  `edition-sync.js` GENERATED_AGGREGATORS, `validate-script-sync.js` COMMON_SCRIPTS,
  `kaola-workflow-install-manifest.js` (×2 byte-twins), the existence/needle asserts in
  `validate-workflow-contracts.js` (×2 byte-twins, lines ~701/725/749/871-874) +
  `validate-kaola-workflow-contracts.js` (~568/582-583) + gitlab/gitea contract validators
  (~257/284/728-732 and ~257/285/733-737), and drop `&& node scripts/test-parallel-batch.js` from
  `package.json`'s `test:kaola-workflow:claude` chain. After these, `edition-sync --check` and
  `validate-script-sync` no longer look for the deleted ports (they iterate the now-shortened
  lists). No test pins a "four aggregators" COUNT (verified) — only per-file assertIncludes, which
  are removed with the file.

### Verification is the four chains (why implementer, not tdd-guide)
The removal itself has no natural failing-unit-test — its correctness is: the four chains go GREEN
once the formerly-referencing tests/registries are removed/updated (a missed reference reds a
chain). This is the objective completeness oracle. `non_tdd_reason`: deletion-heavy behavior-
preserving refactor; verification is the four-chain green, not a new RED-first unit test.

### n2 doc reference sweep (each parallel-batch mention resolved consciously)
- `CLAUDE.md` — remove the "Key Scripts" parallel-batch entry.
- `docs/api.md` — reword the "four aggregators host OPERATOR_HINT_REGISTRY" to THREE
  (adaptive-node, commit-node, plan-validator); drop parallel-batch from the guard-prologue and
  dual-emit-shim prose; reword "excluded from parallel-batch membership" to the live fan-out/
  running-set concept.
- `docs/architecture.md` — remove the "fourth aggregator" parallel-batch description + status route.
- `docs/conventions.md` — drop parallel-batch from the generated-forge-aggregator-ports list; reword
  the "four aggregators" operator_hint line to three.
- `docs/workflow-state-contract.md` — remove/retire the `active-batch.json` parallel-batch manifest
  bullet (the live running-set uses `running-set.json`).
- `docs/README.md` + `docs/plan-run-cards/README.md` — reword the frontier-batch card row to the
  running-set scheduler (no "batch subcommands"); the pointer target stays `frontier-batch.md`.
- `docs/plan-run-cards/repair-routing.md` — the "four aggregators carry operator_hint" list → three.
- `README.md` — retire the parallel-batch "Responsibility split" section (684/690/694); reword the
  main-session-gate "never a parallel-batch member" (675) to "never a fan-out member".
- 6 routing surfaces — correct the frontier-batch card-block prose to the real
  `open-ready`/`close-node`/`reconcile-running-set` CLI (keep the pin + card pointer).
- HISTORICAL records left untouched: `docs/decisions/0008-*.md`, `0010-*.md`, D-419-01 (existing), D-420-02 (existing), D-445-01 (existing) (they record past decisions — history is not rewritten), and existing
  CHANGELOG entries (append-only; the new #586 entry is n4's job).

### Decision record
`docs/decisions/D-586-01.md` (next free — the D-586 series is empty; no textual conflict). Records:
running-set scheduler owns the frontier path; parallel-batch retired (dead + defective, ADR-0008
precedent); the scope boundary above (lineage comments + `batch_active` guard intentionally left in
the live path, orphaned-guard cleanup deferred).

### Dependency rationale
- **n1-remove → (none):** the atomic removal; opens immediately.
- **n2-docs → n1-remove:** serial after the removal so the card/ADR/docs describe the real
  post-retirement tree. (Also n1 and n2 both touch the coarse `plugins` write area, so they are not
  co-schedulable regardless — a dep edge is the correct expression.)
- **n3-review (code-reviewer, opus) → n1-remove n2-docs:** G1 gate; post-dominates both
  code-producing nodes. Opus because this is a high-blast-radius cross-edition removal touching
  contract validators + registries + the live-adjacent test surface — correctness is concentrated
  at the gate. Verifies: four chains green, no dangling parallel-batch reference outside the
  deliberately-retained lineage comments, the rewritten card copy-pastes against the real CLI, the
  ADR records the scope boundary.
- **n4-finalize → n3-review:** unique docs/state sink; writes the #586 CHANGELOG entry only.

No security-reviewer (no sensitive surface), no main-session-gate (no non-delegable acceptance
check — the four chains are delegable), no adversarial-verifier (a mechanical retirement with a
machine oracle; opus code-reviewer + four chains is the cheapest sufficient gate), no
knowledge-lookup (no external-library dependency).

## Node Ledger

| id | status |
| --- | --- |
| n1-remove | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-remove) | subagent-invoked | evidence-binding: n1-remove 0b7d8646f129 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs 14f0d546fdb8 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 5b70f14f60ed | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 771c5dad0149 | |
