# Adaptive Workflow Plan — issue-417

<!-- plan_hash: ed39a6c725b9e900a1b96eaeb20ca90256f0c2a3bf2b7c6f81605baa633393d7 -->

docs(post-v5.15.0 staleness sweep): bring CHANGELOG / CLAUDE.md / docs / README and the six
plan-run prose surfaces back in step with what actually shipped at v5.15.0. ALL PROSE-ONLY —
no code, no behavior, no script edits. The contract validators are NOT in any write set: the
only validator-pinned token a node touches is the literal `frontier unit` (pinned in
validate-workflow-contracts.js:802 + the two forge ports), and the cosmetic frontmatter reword
PRESERVES that literal — it updates the dated "one … at a time" wording to reflect the #377
running-set scheduler, it does not remove the pinned phrase.

Scope (13 distinct files, grouped into four INDEPENDENT doc lanes under FILE_CEILING=6, all
disjoint by exact path so they form one ready frontier the executor can open as a batch):

- n_changelog (doc-updater, 1 file = CHANGELOG.md): (a) backfill a 5.15.0 **Fixed** entry for
  commit 91d9e5e — #388 freeze-wall round 2, #389 atomic freeze, #390 model-tier resume gate,
  #385 baseline-freshness token (`barrier-open-<id>`, `stale:head_advanced` WARN) — which is
  essentially un-changelogged (precedent: the e6aaa05 backfill); (b) add the **#401 Part 2**
  entry (0c6e314 promoted the plan-validator into edition-sync GENERATED_AGGREGATORS BEFORE the
  release tag) and amend the existing #401 entry's "Part 2 … is deferred behind #404/#406"
  clause to past-tense-shipped; (c) reword the #383–#392 entry's "Prose ×4" to ×6 (the two
  forge-codex plan-run SKILLs carry the nonce/evidence-binding prose; ×4 is the documented #400
  symptom).

- n_claude_docs (doc-updater, 4 files = CLAUDE.md, docs/api.md, docs/architecture.md,
  docs/workflow-state-contract.md): (a) CLAUDE.md **Key Scripts** — add the 4th aggregator
  `scripts/kaola-workflow-parallel-batch.js`; extend the adaptive-node bullet with
  `open-ready`/`close-node`/`reconcile-running-set`; extend the plan-validator bullet with
  `--freeze-checked`/`--governance-ack` + the emit envelope; rewrite the adaptive-handoff bullet
  to the post-#408 fused 3→2-spawn chain; note the #383 mutual-exclusion guard prologue.
  (b) docs/api.md — rewrite the `:327` "the dedicated `<role>-max` … is a tracked follow-up"
  clause to the LIVE shipped `<role>-max` xhigh mapping (#405); extend the validator section
  (currently only #381 round-1 write-set refusals) with the #388 round-2 shapes, #389 atomic
  freeze, #390 point-of-use `model_invalid` gate. (c) docs/architecture.md — the
  "## Model Resolution (Install-Time, Profile-Aware)" section (`:374`) is pre-#382; add a
  cross-reference to the per-node `model` column + the plan-beats-install precedence (#382).
  (d) docs/workflow-state-contract.md — the `.cache/` inventory stops at evidence +
  `dispatch-log.jsonl`; add `running-set.json`, `active-batch.json`, `barrier-base-<id>`,
  `barrier-open-<id>`.

- n_readme (doc-updater, 1 file = README.md): (a) the parallelism section (~:615-629) stops at
  #281 ("one FRONTIER UNIT at a time") — add the #377 running-set scheduler; (b) the Codex
  reasoning-effort table (~:455-473) omits the shipped #405 `<role>-max` mapping — add it;
  (c) the Codex hooks section (~:869-892) doesn't mention the #409 stable home
  `.codex/kaola-workflow/{hooks,scripts}` — add it.

- n_planrun_cosmetic (doc-updater, 6 files = FILE_CEILING, the SIX plan-run surfaces): ONE
  coherent cross-edition cosmetic change held in ONE node (#309/#400 six-surface parity) over a
  SHARED CANONICAL SPEC so the editions converge by construction: (i) reword the
  "(current Claude Code)" parenthetical (~:273 in the claude command; the forge-named ports
  carry the twin) runtime-neutral → "when the harness supports background subagent dispatch";
  (ii) update the dated "one frontier unit at a time" frontmatter `description:` to reflect the
  #377 running-set scheduler — body prose is already consistent; frontmatter is dated — while
  KEEPING the literal token `frontier unit` (pinned by all three command-tree contract
  validators). Each surface gets the SAME edit modulo forge nouns; never a free-form rewrite.

DAG shape: the four doc lanes are independent ROOTS with pairwise-disjoint exact-path write
sets (n_changelog = CHANGELOG.md; n_claude_docs = CLAUDE.md + docs/; n_readme = README.md;
n_planrun_cosmetic = commands/ + plugins/*/{commands,skills}). They share only the code-reviewer
DESCENDANT, never an ancestor, so the #232 inferred concurrent-sibling coarse-area check is
skipped (no false ASK) and no exact-file overlap exists. EVERY write target is a docs-path
(`.md` or `docs/`), so `producesCode` is false on every node ⇒ G1 does NOT structurally fire and
the finalize sink (CHANGELOG.md + workflow-state.md) is docs/state-only. The single code-reviewer
node is added DELIBERATELY (not to satisfy G1) to review the cross-edition six-surface parity and
the "prose ×4 → ×6" / freeze-literal-preservation edits — quality insurance on a propagation-prone
diff (this is a cross-edition prose diff, so the main session verifies all four npm chains at
finalize per the #307 policy). Critical path = 3 levels (lane → review → finalize).

Model tiers (#382): the four doc lanes are `sonnet` — each CARRIES OUT an already-specified edit
(no architecture decision, the WHAT is fixed by this issue + the file:line anchors above). The
review node is `opus` — concentrate reasoning at the join/gate where cross-edition parity and the
contract-literal preservation are bounded by review depth, not at the mechanical doc writers
(fan-out economics: a strong reviewer over cheap implementers). The finalize sink carries NO model
(never dispatched as a subagent).

No decision record (D-417-NN) is created: this is a prose-staleness sweep with no architectural
decision; the next free record number is reserved for genuine ADR work.

## Meta

labels: documentation, enhancement

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
|----|------|------------|--------------------|-------------|-------|-------|
| n_changelog | doc-updater | — | CHANGELOG.md | 1 | sequence | sonnet |
| n_claude_docs | doc-updater | — | CLAUDE.md, docs/api.md, docs/architecture.md, docs/workflow-state-contract.md | 4 | sequence | sonnet |
| n_readme | doc-updater | — | README.md | 1 | sequence | sonnet |
| n_planrun_cosmetic | doc-updater | — | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 6 | sequence | sonnet |
| review | code-reviewer | n_changelog, n_claude_docs, n_readme, n_planrun_cosmetic | — | 1 | sequence | opus |
| finalize | finalize | review | CHANGELOG.md, kaola-workflow/issue-417/workflow-state.md | 1 | sequence | — |

## Node Ledger

| id | status |
|----|--------|
| n_changelog | complete |
| n_claude_docs | complete |
| n_readme | complete |
| n_planrun_cosmetic | complete |
| review | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater (n_changelog) | subagent-invoked | b8e05a5fd36c | |
| doc-updater (n_claude_docs) | subagent-invoked | d01ed2e04813 | |
| doc-updater (n_readme) | subagent-invoked | dec903b2671e | |
| doc-updater (n_planrun_cosmetic) | subagent-invoked | 5ca0042ec2ad | |
| code-reviewer | subagent-invoked | c6427fba8517 | |
| finalize (finalize) | main-session-direct | 94de84e2b101 | |
