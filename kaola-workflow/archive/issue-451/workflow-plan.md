# Workflow Plan — issue-451

<!-- plan_hash: d0ae4b0129d777b1ab962d9a7781c483fc7bb05a74971402d145ed1efc518a54 -->

Supersede #405: stop shipping/dispatching `<role>-max.toml`. One base profile per role; the
planner's per-node model tier drives Codex reasoning effort at dispatch (opus tier → session
effort `xhigh`; otherwise role default). The base profile must OMIT `model_reasoning_effort` so
the planner-selected session effort wins (PR #14807, Codex 0.139), not a pinned per-role tier.

## Meta

labels: enhancement, workflow:in-progress, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | opus |
| n2-schema | tdd-guide | n1-architect | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 4 | sequence | sonnet |
| n3-dispatch | tdd-guide | n1-architect, n2-schema | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | sonnet |
| n4-codexinstall | implementer | n1-architect, n2-schema | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js | 7 | sequence | sonnet |
| n5-deletions | implementer | n1-architect | plugins/kaola-workflow/config/agents.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/config/agents.toml, plugins/kaola-workflow/agents/planner-max.toml, plugins/kaola-workflow/agents/code-architect-max.toml, plugins/kaola-workflow/agents/tdd-guide-max.toml, plugins/kaola-workflow/agents/code-reviewer-max.toml, plugins/kaola-workflow/agents/security-reviewer-max.toml, plugins/kaola-workflow/agents/adversarial-verifier-max.toml, plugins/kaola-workflow-gitlab/agents/planner-max.toml, plugins/kaola-workflow-gitlab/agents/code-architect-max.toml, plugins/kaola-workflow-gitlab/agents/tdd-guide-max.toml, plugins/kaola-workflow-gitlab/agents/code-reviewer-max.toml, plugins/kaola-workflow-gitlab/agents/security-reviewer-max.toml, plugins/kaola-workflow-gitlab/agents/adversarial-verifier-max.toml, plugins/kaola-workflow-gitea/agents/planner-max.toml, plugins/kaola-workflow-gitea/agents/code-architect-max.toml, plugins/kaola-workflow-gitea/agents/tdd-guide-max.toml, plugins/kaola-workflow-gitea/agents/code-reviewer-max.toml, plugins/kaola-workflow-gitea/agents/security-reviewer-max.toml, plugins/kaola-workflow-gitea/agents/adversarial-verifier-max.toml | 21 | sequence | sonnet |
| n6-stripeffort | implementer | n1-architect, n4-codexinstall | plugins/kaola-workflow/agents/adversarial-verifier.toml, plugins/kaola-workflow/agents/build-error-resolver.toml, plugins/kaola-workflow/agents/code-architect.toml, plugins/kaola-workflow/agents/code-explorer.toml, plugins/kaola-workflow/agents/code-reviewer.toml, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow/agents/doc-updater.toml, plugins/kaola-workflow/agents/implementer.toml, plugins/kaola-workflow/agents/issue-scout.toml, plugins/kaola-workflow/agents/knowledge-lookup.toml, plugins/kaola-workflow/agents/planner.toml, plugins/kaola-workflow/agents/security-reviewer.toml, plugins/kaola-workflow/agents/tdd-guide.toml, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitlab/agents/build-error-resolver.toml, plugins/kaola-workflow-gitlab/agents/code-architect.toml, plugins/kaola-workflow-gitlab/agents/code-explorer.toml, plugins/kaola-workflow-gitlab/agents/code-reviewer.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/doc-updater.toml, plugins/kaola-workflow-gitlab/agents/implementer.toml, plugins/kaola-workflow-gitlab/agents/issue-scout.toml, plugins/kaola-workflow-gitlab/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitlab/agents/planner.toml, plugins/kaola-workflow-gitlab/agents/security-reviewer.toml, plugins/kaola-workflow-gitlab/agents/tdd-guide.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitea/agents/build-error-resolver.toml, plugins/kaola-workflow-gitea/agents/code-architect.toml, plugins/kaola-workflow-gitea/agents/code-explorer.toml, plugins/kaola-workflow-gitea/agents/code-reviewer.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/doc-updater.toml, plugins/kaola-workflow-gitea/agents/implementer.toml, plugins/kaola-workflow-gitea/agents/issue-scout.toml, plugins/kaola-workflow-gitea/agents/knowledge-lookup.toml, plugins/kaola-workflow-gitea/agents/planner.toml, plugins/kaola-workflow-gitea/agents/security-reviewer.toml, plugins/kaola-workflow-gitea/agents/tdd-guide.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 42 | sequence | sonnet |
| n7-validators | implementer | n1-architect, n2-schema, n5-deletions | scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 3 | sequence | sonnet |
| n8-walkthroughs | implementer | n1-architect, n4-codexinstall, n5-deletions | plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 5 | sequence | sonnet |
| n9-skills | implementer | n1-architect, n2-schema | plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 3 | sequence | sonnet |
| n10-review | code-reviewer | n2-schema, n3-dispatch, n4-codexinstall, n5-deletions, n6-stripeffort, n7-validators, n8-walkthroughs, n9-skills | — | 1 | sequence | opus |
| n11-docs | doc-updater | n10-review | docs/decisions/D-451-01.md, README.md, docs/api.md, docs/architecture.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md | 7 | sequence | sonnet |
| n12-finalize | finalize | n11-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### AC6 runtime-feasibility (settled — fold into n1 evidence, NO main-session-gate)
Codex 0.139 has no per-spawn reasoning-effort field. A base profile that OMITS
`model_reasoning_effort` makes a spawned agent inherit the parent SESSION effort; PR #14807 (in
0.139) makes agent-config WIN over project-profile. The codex plan-run SKILL (n9) sets the session
effort per the dispatch descriptor before spawning, so per-node effort is session-scoped. AC6 is
satisfied by this authoritative version-pinned docs evidence; live observation is NOT required.
n1-architect (read-only) records this proof as `.cache` design evidence; n11-docs writes the durable
`docs/decisions/D-451-01.md` (next free record id — the series is empty for #451) capturing both the
AC6 feasibility proof and the AC4-obsolete deviation (the `<role>-max` xhigh effort-variant mechanism
shipped in #405 is removed).

### Dependency rationale (why the edges, why the antichain)
- n2-schema → n1: design contract (`dispatchEffort(model)` signature: opus → `{xhigh, planner_model}`,
  else `{null, role_default}`; remove `OPUS_ELIGIBLE_ROLES` + `variantProfileText` + their exports).
- n3-dispatch → n2: `buildDispatch` (adaptive-node.js:952) adds `agent_type=role` + spreads
  `dispatchEffort(model)`, IMPORTED from the schema — n2 must export it first or n3's
  `test-adaptive-node.js` REDs. **`kaola-workflow-adaptive-node.js` is a GENERATED_AGGREGATOR**
  (edition-sync.js:47): n3 declares all 4 edition files in ONE node (generated_port_split). The
  implementer edits CANONICAL + codex twin then runs `npm run sync:editions` to REGENERATE the 2
  forge ports (`kaola-gitlab/gitea-workflow-adaptive-node.js`) — never hand-edit them
  (byte-checked by edition-sync `--check`). adaptive-schema is NOT generated (byte-identical,
  canonical name across all four) so n2 edits all 4 copies identically by hand.
- n4-codexinstall → n1, n2: make `model_reasoning_effort` OPTIONAL in `validateProfileText`
  (preflight ×4 + install ×3); delete the `-max` generator + `generateMaxVariants` +
  `OPUS_ELIGIBLE_ROLES`/`variantProfileText` import; add the 6 `-max` filenames
  (`{planner,code-architect,tdd-guide,code-reviewer,security-reviewer,adversarial-verifier}-max.toml`)
  to `RETIRED_PROFILE_FILES` in BOTH install-codex-agent-profiles.js (×3, so pruneStaleProfiles
  removes them) AND codex-preflight.js (×4, so the stale-file check accepts their absence); preserve
  user-owned profiles via extraUnmanaged; profile count 20→14.
- n5-deletions → n1: remove the 6 `[agents.<role>-max]` tables from each `config/agents.toml`;
  `git rm` (DELETE explicitly, do NOT rely on `sync:editions` to prune) all 18 `<role>-max.toml`
  across the 3 editions. Survived forge `-max` files would red n7's `agentFiles.length === 14`.
- n6-stripeffort → n1, n4: strip the `model_reasoning_effort = "..."` line from the 14 base
  `agents/<role>.toml` × 3 editions = 42 files. This is the GAP that killed attempt 2. WHY mandatory:
  a pinned base effort WINS over the session (PR #14807), so without omission the planner's tier
  can't drive effort → the feature ships INERT. Depends on n4 because C's `validateProfileText`
  relaxation is what lets the stripped base profiles still validate. The base `.toml` are byte-grouped
  by validate-script-sync (agent-profile toml triple) — keep all 3 editions byte-synced. No
  file-count ceiling (#453) — a 42-file node is legal.
- n7-validators → n1, n2, n5: contract validators ×3 (the github `validate-kaola-workflow-contracts.js`
  is STANDALONE — no byte-mirror twin). Drop the `-max` derivation guard + the bijection/stray-max
  guards + the `variantProfileText`/`OPUS_ELIGIBLE_ROLES` import + the SKILL `<role>-max` pin
  (`assertIncludes(... SKILL.md, '<role>-max')` at github validator ~line 696); add a forbid (0
  `*-max.toml`, 0 `[agents.*-max]` tables); flip the profile count 20→14 (gitlab/gitea
  `agentFiles.length === 20`). Depends on n5 so the forbid/count assert real post-deletion state.
- n8-walkthroughs → n1, n4, n5: github-codex `simulate-kaola-workflow-walkthrough.js` (delete the
  #405 max-variant test; flip the three `=== 20` profile-count asserts at ~1078/1090/1091 to 14) +
  the 2 forge codex walkthroughs (`simulate-{gitlab,gitea}-codex-workflow-walkthrough.js`: drop the
  inline `model_variant_missing`/`-max` asserts) + the 2 forge `test-{gitlab,gitea}-workflow-scripts.js`
  (flip the count-20 asserts → 14; these are run by BOTH forge walkthroughs).
- n9-skills → n1, n2: the 3 codex plan-run SKILLs carry DISPATCH LOGIC (codex runtime behavior, not
  docs) — implementer under code-reviewer (G1). Drop `-max`/`model_variant_missing`/`OPUS_ELIGIBLE`;
  rewrite to "spawn `dispatch.agent_type` (the base role); if `codex_reasoning_effort` non-null ensure
  the session effort = it before spawning." Semantically-coupled cross-edition prose kept in ONE node
  (#309); canonical spec = the github-codex SKILL section, forge SKILLs mirror it modulo forge nouns.
- n10-review (code-reviewer G1, opus): post-dominates EVERY code-producing node
  (n2,n3,n4,n5,n6,n7,n8,n9). Opus because the change spans the dispatch path + installer + validators
  across 4 editions and the failure mode (inert feature) is subtle.
- n11-docs (doc-updater): PURE docs only — also authors `docs/decisions/D-451-01.md` (the AC6 proof +
  AC4-obsolete deviation, per n1-architect's `.cache` design evidence). `docs/api.md` (lines ~646 `<role>-max` clause, ~934/~1097
  "legal `model_reasoning_effort`" → now-optional), `docs/architecture.md` (~62 preflight "legal
  `model_reasoning_effort`" → optional), `README.md` (~507-520 the `xhigh` table + `<role>-max`
  dispatch sentence → session-effort model). The 3 `kaola-workflow-adapt/SKILL.md` carry a now-stale
  `model_reasoning_effort profile tier` prose line (#306 grep hit beyond A–I) — correct it to the
  session-effort inheritance model; coupled cross-edition prose, canonical = github-codex adapt SKILL.
- n12-finalize (sink): CHANGELOG.md only (new `[Unreleased]` entry; old #405 entries stay as
  history). MANDATORY EVIDENCE: the #307 four-chain green
  (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` run sequentially) — every node touches
  the edition trees, so a green claude chain alone is insufficient.

### Out of scope (confirmed clean by #306 grep — do NOT include)
- install.sh / uninstall.sh REQUIRED_AGENTS, resolve-agent-model.js, CANONICAL_ROLES,
  validate-vendored-agents.js, root `agents/*.md` — grepped clean for `-max`/`model_reasoning_effort`
  (`-max` matched only `-maxdepth` in a `find` flag, not a profile ref).
- The 3 Claude plan-run COMMANDS (`commands/kaola-workflow-{adapt,plan-run}.md`) — AC7 pass-through;
  grepped clean (the only `commands/` hit is `-maxdepth` in `commands/workflow-init.md`).
- scripts/simulate-workflow-walkthrough.js — its `20` hits are roadmap issue numbers, not profile counts.
- docs/investigations/* — historical point-in-time records, frozen by convention.
- validate-script-sync.js:205 — a stale COMMENT ("Includes the 6 -max model variants"); the
  agent-toml triple group is built by a DYNAMIC readdir, so deletion auto-updates it and no assertion
  reads the comment. Not a chain/freeze failure; left untouched.
- `--max N` CLI flag refs in parallel-batch.js / adaptive-node.js, and `20` in test-bundle-claim.js —
  incidental, not profile refs.

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-schema | complete |
| n3-dispatch | complete |
| n4-codexinstall | complete |
| n5-deletions | complete |
| n6-stripeffort | complete |
| n7-validators | complete |
| n8-walkthroughs | complete |
| n9-skills | complete |
| n10-review | complete |
| n11-docs | complete |
| n12-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect baa07eb810ea | |
| tdd-guide (n2-schema) | subagent-invoked | evidence-binding: n2-schema 523694bad903 | |
| tdd-guide (n3-dispatch) | subagent-invoked | evidence-binding: n3-dispatch c8d9b103eead | |
| implementer (n4-codexinstall) | subagent-invoked | evidence-binding: n4-codexinstall 056e942eed9d | |
| implementer (n5-deletions) | subagent-invoked | evidence-binding: n5-deletions 80baa214e500 | |
| implementer (n6-stripeffort) | subagent-invoked | evidence-binding: n6-stripeffort aeb421fd3ebc | |
| implementer (n7-validators) | subagent-invoked | evidence-binding: n7-validators 9417676d75bc | |
| implementer (n8-walkthroughs) | subagent-invoked | evidence-binding: n8-walkthroughs 6792f7a25638 | |
| implementer (n9-skills) | subagent-invoked | evidence-binding: n9-skills 5e4ea7413332 | |
| code-reviewer | subagent-invoked | evidence-binding: n10-review 140a63c726e8 | |
| doc-updater (n11-docs) | subagent-invoked | evidence-binding: n11-docs 23bf2b8e2a00 | |
| finalize (n12-finalize) | main-session-direct | evidence-binding: n12-finalize 8b5d807d31e6 | |
