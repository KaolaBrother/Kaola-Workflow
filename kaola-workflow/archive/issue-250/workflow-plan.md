# Workflow Plan — issue-250

<!-- plan_hash: ca3f0a58e303a8faf2098da16e49e6faf23415b4b79fdfffb16fa12affdb5797 -->

Add a new **`implementer`** node role to the adaptive path's closed role library, alongside
`tdd-guide`. `implementer` covers legitimate implementation work that has no natural failing-unit-test
to write first (refactors, scaffolding, config/IaC, UI, migrations, glue), verified by a
change-type-appropriate check instead of test-first ceremony. Scope is adaptive-path only.

The correctness of the whole feature reduces to `implementer ∈ IMPLEMENT_ROLES ∩ WRITE_ROLES ∩
CANONICAL_ROLES` in all four validator copies — the silent-miss being adding it to
CANONICAL_ROLES + WRITE_ROLES but NOT IMPLEMENT_ROLES (G1 `code-reviewer` post-dominance is computed
over IMPLEMENT_ROLES, so an `implementer` node would otherwise ship code with no mandatory review
gate). The load-bearing `impl-validator` node therefore also carries a RED→GREEN regression in
`scripts/simulate-workflow-walkthrough.js` proving a plan with an `implementer` node is in-grammar
AND still requires `code-reviewer` post-dominance.

## Topology rationale

**This plan CANNOT use the `implementer` role.** The role does not exist in the installed library
until this issue lands, so a node naming `implementer` would be refused as an unknown role. Every
implement node here is `tdd-guide`. `build-error-resolver` is repair-only and is not used.

**Byte-sync atomicity (NOT validator-enforced — kept correct by node partitioning).** Two file
families must each live entirely inside ONE node, or parallel agents drift the copies and
`validate-script-sync.js` fails:

- **validator ×4** (`scripts/kaola-workflow-plan-validator.js` + the 3 plugin copies) → all in
  `impl-validator`, together with the load-bearing simulate test. Fan-out is impossible: three of the
  four validator paths share the `plugins/` top-level directory and disjointness is checked at
  top-level-directory granularity. One node is both correct and required.
- **resolve-agent-model ×4** (`scripts/kaola-workflow-resolve-agent-model.js` + the 3 plugin copies)
  → all in `impl-model`, together with `install.sh`/`uninstall.sh` (the `DEFAULT_AGENT_MODELS`
  recognition, `REQUIRED_AGENTS`, placeholder, and per-install model resolution must move in lockstep
  with the resolver default). 6 paths = FILE_CEILING exactly.

**FILE_CEILING (6) decomposition.** Every node's declared write set is ≤ 6 exact paths, and no two
nodes share any exact path (so no antichain exact-overlap refusal). The new-profile-file family
(`agents/implementer.md` + 3 codex `.toml` editions + the `.codex/agents/kaola-workflow/implementer.toml`)
is `impl-profiles` (5 paths). Registration (`[agents.implementer]` in the 3 `config/agents.toml` +
`localAgents[]` in `validate-vendored-agents.js`) is `impl-registration` (4 paths), and it
`depends_on impl-profiles` because the registration asserts the profile files already exist.

**Prose split (three nodes — closes cross-edition drift).** The shaping/heuristic + contractor
three-way evidence prose must mention `implementer` everywhere the validator now recognizes it, or the
gitlab/gitea editions drift (their validators recognize `implementer` but their authoring guidance
would not). `prose-commands` carries the contractor three-way evidence rule where the `tdd-guide`
RED→GREEN rule already lives in the GitHub edition (`commands/kaola-workflow-adapt.md`,
`commands/kaola-workflow-plan-run.md`, and the two GitHub-plugin SKILLs — gitlab/gitea have no
adapt/plan-run *skills*, confirmed by inspection). `prose-forge` carries the **gitlab/gitea command
editions** of those same two commands (`plugins/kaola-workflow-{gitlab,gitea}/commands/kaola-workflow-adapt.md`
and `.../kaola-workflow-plan-run.md` — these DO exist and carry the shaping/RED→GREEN prose; without
this node the forge editions silently lose the `implementer` guidance). `prose-planner` carries the
planner heuristic across `agents/workflow-planner.md` + the 3 `plugins/*/agents/workflow-planner.toml`
editions.

**Why a `code-reviewer` node (G1).** Every implement/prose node is `tdd-guide` (`producesCode` true,
non-docs writes), so G1 requires `code-reviewer` to post-dominate all of them. `review` depends on all
SEVEN write nodes (the six implement/prose nodes plus `prose-forge`) and sits on the only route from
each to the sink (removing `review` disconnects them from `finalize`). As read-only gate evidence the
`code-reviewer` node runs and records the #250 feature gates: `node scripts/validate-script-sync.js`,
`node scripts/validate-vendored-agents.js`, `node scripts/simulate-workflow-walkthrough.js`,
`npm test`, and `bash install.sh --dry-run` for both `default` and `higher` profiles (the per-node
adaptive barrier does NOT run these). `code-reviewer` is read-only (not in `WRITE_ROLES`) so its
declared write set is empty.

**Why a `doc-updater` node.** The adaptive role library is a documented public surface. `README.md`
carries the role table and adaptive role enumeration; `docs/api.md` (L197–254) is the canonical
closed-grammar role-library enumeration where the new role belongs for parity with the validator. Both
are written by `docs` before `finalize`. It sits downstream of `review`, writes docs-only paths, so it
does not re-trip G1.

**Sensitivity / why no `security-reviewer` (G2).** Frozen label is `enhancement` — not in the
sensitive set (security/auth/payments/secrets/user-data). No declared write path matches a Phase-5
sensitivity pattern (checked: `install.sh`/`uninstall.sh`/`config/agents.toml`/`.codex/`/forge
`commands/` paths contain none of auth/login/secret/token/credential/payment/session/fs/ etc.). G2
does not fire; no `security-reviewer` node is required.

## Meta

labels: enhancement

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| impl-validator | tdd-guide | explore | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence |
| impl-model | tdd-guide | explore | scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-resolve-agent-model.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-resolve-agent-model.js, install.sh, uninstall.sh | 6 | sequence |
| impl-profiles | tdd-guide | explore | agents/implementer.md, plugins/kaola-workflow/agents/implementer.toml, plugins/kaola-workflow-gitlab/agents/implementer.toml, plugins/kaola-workflow-gitea/agents/implementer.toml, .codex/agents/kaola-workflow/implementer.toml | 5 | sequence |
| impl-registration | tdd-guide | impl-profiles | plugins/kaola-workflow/config/agents.toml, plugins/kaola-workflow-gitlab/config/agents.toml, plugins/kaola-workflow-gitea/config/agents.toml, scripts/validate-vendored-agents.js | 4 | sequence |
| prose-commands | tdd-guide | explore | commands/kaola-workflow-adapt.md, commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md | 4 | sequence |
| prose-forge | tdd-guide | explore | plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 4 | sequence |
| prose-planner | tdd-guide | explore | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 4 | sequence |
| impl-forge-counts | tdd-guide | impl-profiles | plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 4 | sequence |
| review | code-reviewer | impl-validator, impl-model, impl-profiles, impl-registration, prose-commands, prose-forge, prose-planner, impl-forge-counts | — | 1 | sequence |
| docs | doc-updater | review | README.md, docs/api.md | 2 | sequence |
| finalize | finalize | review, docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | |
| impl-validator | complete | |
| impl-model | complete | |
| impl-profiles | complete | |
| impl-registration | complete | |
| prose-commands | complete | |
| prose-forge | complete | |
| prose-planner | complete | |
| impl-forge-counts | complete | |
| review | complete | barrier:0; .cache/review.md present/non-empty; verdict:pass findings_blocking:0; G1 gate satisfied (code-reviewer post-dominates impl-validator/impl-model/impl-profiles/impl-registration/prose-commands/prose-forge/prose-planner/impl-forge-counts); gateVerify informational:true (pre-close state, not blocking); selectorCheck ok:true isSelector:false overallOk:true |
| docs | complete | barrier:0; .cache/docs.md present/non-empty; validate-vendored-agents exit:0; validate-workflow-contracts exit:0; simulate-workflow-walkthrough exit:0; overallOk:true |
| finalize | in_progress | base:d1e403406799bed7affa4fc17dd1db8ae34ac961 |

## Required Agent Compliance

| requirement | status | evidence | notes |
| --- | --- | --- | --- |
| code-reviewer | subagent-invoked | `kaola-workflow/issue-250/.cache/review.md` — verdict:pass findings_blocking:0; G1 gate (code-reviewer post-dominating impl-validator/impl-model/impl-profiles/impl-registration/prose-commands/prose-forge/prose-planner/impl-forge-counts) satisfied; all feature gates exit:0 (validate-script-sync, validate-vendored-agents, simulate-workflow-walkthrough, npm test); barrier exit:0 overallOk:true; gateVerify informational:true | |
