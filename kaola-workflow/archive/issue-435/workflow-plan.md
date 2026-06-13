# Workflow Plan — issue-435

<!-- plan_hash: 9cbff96252939bd5013eeae15bce22fdbb5a2723890f8855805a6ff19756bdc9 -->

Run-gap capture gate at finalize: a `kaola-workflow-gap-sweep.js` scanner (`--project X --json`)
that extracts/dedupes run-discovered defects (typed refusals, `--force`/`--attest-*` overrides,
revert/repair invocations) from the project's own `.cache/dispatch-log.jsonl` +
`.cache/provenance-log.jsonl`, plus a `--check` verify-mode gate that refuses finalize
(`gaps_unswept`) until `finalization-summary.md` carries a `## Run gaps` section mapping each swept
reason class to `filed: #N` or `noise: <justification>`. The gate is wired at finalize via
contractor + finalize-command/SKILL prose (mirroring the #432 chain-receipt gate) — NOT inside
cmdFinalize/claim.js. Router/goal prose carries the follow-up-filing rule across all editions.

## Meta
labels: documentation, enhancement, area:workflow-phases

## Coordination constraints (orchestrator-set, parallel-safety — NOT design directives)

- This run MUST NOT edit `scripts/kaola-workflow-claim.js` (or its edition ports): a concurrent
  session runs `cmdFinalize` on every finalize. The `gaps_unswept` gate is therefore realized as a
  `kaola-workflow-gap-sweep.js --check` verify-mode invoked by the contractor finalize step + the
  finalize command/SKILL prose — structurally identical to the #432 `kaola-workflow-run-chains.js`
  chain-receipt gate, which is likewise invoked at finalize WITHOUT a cmdFinalize edit.
- This run MUST NOT touch `scripts/kaola-workflow-release.js` / its edition ports /
  `scripts/test-release.js` (the concurrent session holds #449 there). No node's write set includes
  any of those paths.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-design | code-architect | — | — | 1 | sequence | opus |
| n2-script | tdd-guide | n1-design | scripts/kaola-workflow-gap-sweep.js, scripts/test-gap-sweep.js | 2 | sequence | sonnet |
| n3-port-mirror | implementer | n2-script | plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js | 3 | sequence | sonnet |
| n4-registration | implementer | n2-script | scripts/validate-script-sync.js, scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, package.json | 4 | sequence | sonnet |
| n5-forge-validators | implementer | n3-port-mirror | plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 2 | sequence | sonnet |
| n6-finalize-prose | implementer | n1-design | commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 6 | sequence | sonnet |
| n7-goal-prose | implementer | n1-design | commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md | 6 | sequence | sonnet |
| n8-contractor-prose | implementer | n1-design | agents/contractor.md, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml | 4 | sequence | sonnet |
| n9-review | code-reviewer | n3-port-mirror, n4-registration, n5-forge-validators, n6-finalize-prose, n7-goal-prose, n8-contractor-prose | — | 1 | sequence | opus |
| n10-docs | doc-updater | n9-review | CHANGELOG.md, docs/decisions/D-435-01.md, docs/conventions.md, docs/architecture.md | 4 | sequence | sonnet |
| finalize | finalize | n10-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Why this shape

- **One logic core, propagation-heavy tail.** `n1-design` (opus, read-only `code-architect`) fixes
  the scanner/gate contract — the `--json` scan event schema, reason-class dedup, the `--check`
  `## Run gaps` parse grammar, the `gaps_unswept` typed-refusal shape, and the cmdFinalize-free
  wiring point — and records it in its node evidence (a read-only role declares NO write set; the
  durable decision record `D-435-01` is authored later by `n10-docs`). Everything downstream
  carries out that decision, so it is the single opus reasoning node; the implementers are sonnet.
- **n3 ∥ n4 ready frontier.** Both depend only on `n2-script` and write pairwise-disjoint paths
  (`n3` = the three plugin port files; `n4` = the two root registration scripts + `package.json`),
  so the executor opens them as one batch.
- **n6 ∥ n7 ∥ n8 ready frontier.** All three prose nodes depend only on `n1-design` (they document
  the gate contract, not the implemented script) and write pairwise-disjoint paths, so they batch
  alongside `n2-script` as soon as `n1-design` closes. Authored as plain `sequence` nodes with a
  shared dep (not a `fanout(group)`): the executor batches a shared ready frontier regardless of
  shape, and disjointness holds at top-level-directory granularity.
- **n5 depends on n3**, not n2: the gitlab/gitea contract validators assert the forge port files
  exist, so the ports must be written first.

### Decision-record numbering (#337)

- `docs/decisions/` currently holds `D-432-01 (existing)` and `D-433-01 (existing)`; no `D-435-*` exists, so
  `D-435-01` is the next free id for this issue. `n10-docs` (doc-updater) authors the durable
  record from `n1-design`'s evidence — `n1-design` is read-only and declares no write set.

### Coordination-constrained gate wiring (NO cmdFinalize edit)

- The `gaps_unswept` gate is realized exactly like the #432 `chain-receipt` gate: a forge-neutral
  verify-mode script (`kaola-workflow-gap-sweep.js --check`) invoked at finalize by contractor
  prose (a new Step alongside Step-8c) + the finalize command/SKILL "gate" sections. `cmdFinalize`
  and `scripts/kaola-workflow-claim.js` are NOT in any write set.

### Cross-edition symbol scoping (#306) — full registration surface for a new forge-neutral script

The new `kaola-workflow-gap-sweep.js` mirrors the #432 `kaola-workflow-run-chains.js` registration
surface exactly (a COMMON_SCRIPTS forge-neutral verify-mode script with rename-normalized forge
ports). The registration surface is split across `n3`/`n4`/`n5`:

- **n3-port-mirror**: codex byte-mirror (`plugins/kaola-workflow/scripts/kaola-workflow-gap-sweep.js`,
  byte-identical to canonical) + the two rename-normalized forge ports
  (`kaola-gitlab-workflow-gap-sweep.js`, `kaola-gitea-workflow-gap-sweep.js`). All three files are
  NEW (verified absent at authoring time) and declared as EXACT paths (no #404 dir-to-be trap).
  Canonical spec for each forge port: the canonical scripts/ copy after the
  `kaola-workflow- -> kaola-{forge}-workflow-` prefix transform — body-identical modulo the rename
  (the script carries no forge-specific tokens; the `.cache/*.jsonl` log paths are identical across
  editions).
- **n4-registration**: `scripts/validate-script-sync.js` (add `kaola-workflow-gap-sweep.js` to
  `COMMON_SCRIPTS` AND a new `RENAME_NORMALIZED_FAMILIES` entry for the two forge ports — mirror the
  `run-chains forge ports` family at lines ~245-255); `kaola-workflow-install-manifest.js` (append
  to `SUPPORT_SCRIPTS`) — edited in BOTH its #274 byte-identical copies
  (`scripts/` + `plugins/kaola-workflow/scripts/`), the sync-group pair the validator enforces;
  `package.json` (wire `node scripts/test-gap-sweep.js` into the
  `test:kaola-workflow:claude` chain). `scripts/edition-sync.js` is NOT in scope: it consumes
  `COMMON_SCRIPTS` + `BYTE_IDENTICAL_GROUPS` from validate-script-sync (single-source) and its
  `--write` forge-aggregator list is the five aggregator ports only — a COMMON_SCRIPT with
  rename-normalized ports needs no edition-sync edit (confirmed against the run-chains precedent).
- **n5-forge-validators**: both gitlab and gitea contract validators carry TWO literal lists each
  (`scriptFiles` ~line 252 and `installSupportScripts` ~line 281). Add the forge port name
  (`kaola-{forge}-workflow-gap-sweep.js`) to BOTH lists in BOTH validators.

### Prose propagation surfaces

- **n6-finalize-prose** — the gate "refusal/remedy" section propagates to the #400 SIX surfaces:
  the 3 Claude finalize commands (base + gitlab/gitea forks) + the 3 Codex finalize SKILL packs.
  Mirror the existing `chains_unverified`/`chains_stale` gate section style; add the `gaps_unswept`
  refusal + its remedy (run `kaola-workflow-gap-sweep.js --check`, then map the section). The forge
  command/SKILL copies must stay forge-neutral (#341): name "the forge", never a forge CLI binary.
- **n7-goal-prose** — the Goal-Driven Autonomy guidance gains the rule that "finish the issues"
  INCLUDES filing follow-ups for run-discovered defects (filing satisfies the goal; deferring
  violates it). Propagates to the same SIX surfaces: 3 Claude `workflow-next.md` (base + forks) + 3
  Codex `kaola-workflow-next` SKILL packs.
- **n8-contractor-prose** — the #422 contractor surface: `agents/contractor.md` (the canonical
  finalize method) gains a gap-sweep invocation step alongside Step-8c; the 3 byte-mirror
  `contractor.toml` profiles get the matching forge-neutral prose. Canonical spec: mirror the
  contractor.md addition into each toml modulo edition nouns.

### Gates

- **G1 (code-reviewer post-dominance):** `n9-review` post-dominates every code/prose-producing node
  (`n3`–`n8` directly; `n2-script` transitively via `n3`/`n4`). Required because the run produces a
  new script + edits to validators/manifest/package.json.
- **G2 (security-reviewer):** NOT required. Labels are `documentation, enhancement,
  area:workflow-phases` (none in SENSITIVE_LABELS) and no declared path matches `*security*`.
- **finalize sink** writes only `CHANGELOG.md` (docs/state) — no code write on the sink.

### TDD vs implementer

- **n2-script = tdd-guide**: the scanner+gate has a clean failing-test-first shape — RED: `--check`
  refuses `gaps_unswept` when `## Run gaps` is missing or a swept reason class is unmapped; GREEN:
  it passes once every class maps to `filed: #N` or `noise: <justification>`; plus the `--json` scan
  dedup-by-reason-class behavior. This is the AC's "walkthrough run with one injected typed refusal
  refuses finalize until the summary maps it" — `test-gap-sweep.js` injects a synthetic refusal into
  a temp `.cache/dispatch-log.jsonl` and asserts the refuse→map→pass transition.
- **n3–n8 = implementer**: mechanical cross-edition mirroring / port generation / list-registration
  / prose propagation — behavior-preserving wiring with no natural failing unit test.
  `non_tdd_reason`: cross-edition byte-mirror + registration-list + documentation-prose edits whose
  correctness is enforced by the existing validators (validate-script-sync byte-identity,
  forge contract validators, route-reachability) and by `n2-script`'s own test, not by a new
  per-node unit test.

### Validation expectation (cross-edition diff, #307)

- This diff touches the edition plugin trees and forge contract validators, so all four chains
  (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`) must be green before finalize.
  `n5-forge-validators` should run the forge-neutral standalone check on its changed files; the full
  four-chain green is the contractor's finalize-time evidence.

## Node Ledger

| id | status |
| --- | --- |
| n1-design | complete |
| n2-script | complete |
| n3-port-mirror | complete |
| n4-registration | complete |
| n5-forge-validators | complete |
| n6-finalize-prose | complete |
| n7-goal-prose | complete |
| n8-contractor-prose | complete |
| n9-review | complete |
| n10-docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-design) | subagent-invoked | evidence-binding: n1-design 68560ebc8003 | |
| tdd-guide (n2-script) | subagent-invoked | evidence-binding: n2-script a6eabdf3af19 | |
| implementer (n3-port-mirror) | subagent-invoked | evidence-binding: n3-port-mirror 3ee36b2daec1 | |
| implementer (n4-registration) | subagent-invoked | evidence-binding: n4-registration b803fc6979bd | |
| implementer (n5-forge-validators) | subagent-invoked | evidence-binding: n5-forge-validators 72bff0b93102 | |
| implementer (n6-finalize-prose) | subagent-invoked | evidence-binding: n6-finalize-prose 6f70bafc1352 | |
| implementer (n7-goal-prose) | subagent-invoked | evidence-binding: n7-goal-prose d517cef3079b | |
| implementer (n8-contractor-prose) | subagent-invoked | evidence-binding: n8-contractor-prose 8fbcb9c9dc63 | |
| code-reviewer | subagent-invoked | evidence-binding: n9-review a5dac3c45a21 | |
| doc-updater (n10-docs) | subagent-invoked | evidence-binding: n10-docs 9f558bbdce44 | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize ead5733f3092 | |
