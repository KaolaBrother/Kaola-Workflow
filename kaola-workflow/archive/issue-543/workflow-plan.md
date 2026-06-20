# Adaptive Workflow Plan — issue #543

<!-- plan_hash: f411cc9dff1a6f46050ec0d2265fa86e5a31a11887bed31ba6a99c0d7916013b -->

Port #538 `--with-fast`/`--with-full` opt-in partition to Codex + opencode
(default = adaptive-only). Folded #544-run-discovered scope: make the opencode
edition standalone (kill the `.claude/` path leak in `sync-opencode-edition.js
transformCommandBody` + `install-opencode.sh install_support_scripts()`).

## Meta

labels: workflow:in-progress
speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-knowledge-lookup | knowledge-lookup | — | — | 1 | sequence | sonnet |
| n2-code-explorer | code-explorer | — | — | 1 | sequence | sonnet |
| n3-planner | planner | n1-knowledge-lookup,n2-code-explorer | — | 1 | sequence | opus |
| n4-tdd-opencode-tests | tdd-guide | — | scripts/test-opencode-edition.js | 1 | sequence | sonnet |
| n5-implementer-opencode | implementer | n4-tdd-opencode-tests | install-opencode.sh,scripts/sync-opencode-edition.js,docs/opencode-edition.md,.opencode/command/kaola-workflow-adapt.md,.opencode/command/kaola-workflow-auto.md,.opencode/command/kaola-workflow-fast.md,.opencode/command/kaola-workflow-finalize.md,.opencode/command/kaola-workflow-phase1.md,.opencode/command/kaola-workflow-phase2.md,.opencode/command/kaola-workflow-phase3.md,.opencode/command/kaola-workflow-phase4.md,.opencode/command/kaola-workflow-phase5.md,.opencode/command/kaola-workflow-plan-run.md,.opencode/command/workflow-init.md,.opencode/command/workflow-next.md,.opencode/agent/adversarial-verifier.md,.opencode/agent/build-error-resolver.md,.opencode/agent/code-architect.md,.opencode/agent/code-explorer.md,.opencode/agent/code-reviewer.md,.opencode/agent/contractor.md,.opencode/agent/doc-updater.md,.opencode/agent/implementer.md,.opencode/agent/issue-scout.md,.opencode/agent/knowledge-lookup.md,.opencode/agent/planner.md,.opencode/agent/security-reviewer.md,.opencode/agent/synthesizer.md,.opencode/agent/tdd-guide.md,.opencode/agent/workflow-planner.md,.opencode/plugins/kaola-workflow-hooks.js,.opencode/hooks/kaola-workflow-pre-commit.sh,.opencode/hooks/kaola-workflow-subagent-dispatch-log.sh,.opencode/hooks/kaola-workflow-write-lane.sh | 1 | sequence | sonnet |
| n6-implementer-codex | implementer | n3-planner | plugins/kaola-workflow/.codex-plugin/plugin.json,plugins/kaola-workflow-gitlab/.codex-plugin/plugin.json,plugins/kaola-workflow-gitea/.codex-plugin/plugin.json,plugins/kaola-workflow/scripts/install-codex-agent-profiles.js,plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js,plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js,scripts/validate-kaola-workflow-contracts.js,plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js,plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js,scripts/validate-workflow-contracts.js,plugins/kaola-workflow/scripts/validate-workflow-contracts.js,scripts/kaola-workflow-release.js,plugins/kaola-workflow/scripts/kaola-workflow-release.js,scripts/test-install-model-rendering.js,plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js,plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js,plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence | sonnet |
| n7-code-reviewer-opencode | code-reviewer | n5-implementer-opencode | — | 1 | sequence | opus |
| n8-code-reviewer-codex | code-reviewer | n6-implementer-codex | — | 1 | sequence | opus |
| n9-doc-updater | doc-updater | n7-code-reviewer-opencode,n8-code-reviewer-codex | docs/decisions/D-543-01.md,README.md | 1 | sequence | sonnet |
| n10-finalize | finalize | n9-doc-updater | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Two genuinely-independent lanes (wide ready frontier)

n1 + n2 + n4 open immediately as the ready frontier (three siblings). The Codex
lane (n1→n2→n3→n6→n8) has research-upfront because the Codex marketplace plugin
partition mechanism is genuinely uncertain (can a default `codex plugin add` ship
optional skill components? can the plugin cache's skills dir be pruned
post-install? is a plugin split viable?). The opencode lane (n4→n5→n7) is
well-defined by the issue spec and goes straight to test-first implementation.
The two lanes have DISJOINT declared write sets (Codex writes under
`plugins/kaola-workflow*/` + root `scripts/validate-*.js` + `scripts/kaola-workflow-release.js`;
opencode writes under `install-opencode.sh` + `scripts/sync-opencode-edition.js` +
`scripts/test-opencode-edition.js` + `.opencode/**` + `docs/opencode-edition.md`).

### n1 — knowledge-lookup (Codex marketplace/plugin model)

Research the Codex plugin install model: (1) does `codex plugin add` support any
post-install hook or opt-in-component mechanism? (2) can the plugin cache's
`skills/` directory be pruned post-install without breaking the plugin? (3) is
splitting into multiple marketplace plugins (core/fast/full) a viable, documented
pattern? (4) how does `installed_paths` semantics map to a plugin that bundles all
skills in `./skills/`? This mirrors the issue's "mirror installed_paths semantics
where the plugin packaging allows" hedge — the research determines WHICH mechanism
is feasible.

### n2 — code-explorer (Codex install chain read)

Read the full Codex install/release chain end-to-end and produce a precise
write-set + mechanism-options memo: `install-codex-agent-profiles.js` (×3,
byte-identical per validate-script-sync.js line 206), `plugin.json` (×3),
`release.js` (root + codex plugin), the four `validate-*-contracts.js`, the four
test surfaces (`test-install-model-rendering.js`, `simulate-kaola-workflow-walkthrough.js`,
the two forge `test-*-workflow-scripts.js`), and the `scripts/validate-workflow-contracts.js`
↔ `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` byte-twin
relationship (confirmed IDENTICAL; MUST move in the same node).

### n3 — planner (Codex partition mechanism design, read-only)

From n1 + n2 evidence, design the Codex partition mechanism. Falsification test:
the chosen mechanism MUST (a) make a default Codex install ship adaptive-only
(skills for fast/full NOT present or NOT reachable), (b) make `--with-fast`/
`--with-full` reachable via explicit opt-in, (c) keep all four cross-edition
chains green, (d) mirror `install.sh` semantics (read-modify-write UNION of
`installed_paths`, never removes). Record the design spec + the EXACT narrowed
write set to `.cache/` for n6. The declared write set of n6 is the comprehensive
union; the implementer narrows to the design's subset.

### n4 — tdd-guide (opencode partition + absence assertions, RED)

Write failing assertions in `scripts/test-opencode-edition.js` for: (1) default
deploy (`install-opencode.sh` with no flags) copies adaptive-core commands ONLY
(adapt, auto, finalize, plan-run, workflow-init, workflow-next) — NOT fast.md,
NOT phase1..5.md; (2) `--with-fast` deploys `kaola-workflow-fast.md` +
`installed_paths:['fast']`; (3) `--with-full` deploys `kaola-workflow-phase1..5.md`
+ `installed_paths:['full']`; (4) `--with-fast --with-full` deploys both +
`installed_paths:['fast','full']`; (5) ZERO references to `CLAUDE_PLUGIN_ROOT` or
`~/.claude/kaola-workflow` in the generated `.opencode/` tree (commands AND agent
profiles — the folded #544-run-discovered absence assertion). These assertions
MUST fail against the current state (the leak exists; the partition doesn't).

### n5 — implementer (opencode: partition + .claude leak fix + regen, GREEN)

Make n4's failing tests green. Three coupled concerns sharing ONE edition write
surface (must move atomically):
1. **Generator transform** (`scripts/sync-opencode-edition.js
   `transformCommandBody`): rewrite the `kaola_script()` shell resolver to
   opencode-native paths (`${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts`
   + `./scripts`); no `$CLAUDE_PLUGIN_ROOT`, no `~/.claude/`. Also rewrite the
   "Re-derive your own script paths" prose in agent profiles (currently references
   `$CLAUDE_PLUGIN_ROOT/scripts` then `$HOME/.claude/kaola-workflow/scripts`).
2. **Installer partition** (`install-opencode.sh`): add `--with-fast`/`--with-full`
   flags; `copy_tree()` conditionally copies `kaola-workflow-fast.md` (only with
   `--with-fast`) and `kaola-workflow-phase1..5.md` (only with `--with-full`);
   `install_support_scripts()` deploys to the opencode-native dir
   (`${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/kaola-workflow/scripts`), NOT
   `~/.claude/kaola-workflow/scripts`; `seed_kaola_config` keeps `installed_paths`
   in lockstep with the opt-ins passed (currently always `[]`; becomes
   `['fast']`/`['full']`/`['fast','full']`); header comment (lines ~22–37) rewritten
   from "scoped out" deferral to the partition description.
3. **Docs** (`docs/opencode-edition.md`): document the partition (no longer
   "scoped out"); the § Path selection subsection updated.
4. **Regenerate** the `.opencode/` tree (`node scripts/sync-opencode-edition.js
   --write`) — ALL 12 command files + 15 agent files regenerated from canonical
   with the resolver + prose rewrite applied; the 3 hooks + 1 plugin file are
   in scope as well (the regeneration touches the tree holistically).

non_tdd_reason: n4 is the test-first node (RED); this node makes them GREEN. The
work is generator+installer+prose wiring with no behavioral logic — the failing
tests in n4 (partition coverage + absence assertion) are the external adversary
the model cannot rubber-stamp.

### n6 — implementer (Codex partition, depends on n3 design)

Implement the Codex partition mechanism designed by n3. The declared write set is
the COMPREHENSIVE Codex install/release surface; the implementer narrows to n3's
design subset. Byte-twin invariants (enforced by `validate-script-sync.js`):
- `scripts/validate-workflow-contracts.js` ↔ `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
  (confirmed IDENTICAL — MUST be edited in lockstep or the codex chain reds).
- `install-codex-agent-profiles.js` ×3 plugin trees (byte-identical triplet).
- `plugin.json` ×3 (version-coupled, asserted by validate-workflow-contracts.js lines 544-558).
Forge-port mirrors: if `scripts/kaola-workflow-release.js` changes, its codex twin
`plugins/kaola-workflow/scripts/kaola-workflow-release.js` MUST mirror (the root
file does NOT exist in the gitlab/gitea trees — verified). Keep all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (the #307
cross-edition obligation — a Codex plugin-tree diff triggers it).

non_tdd_reason: the test surface IS the four contract validators
(`scripts/validate-kaola-workflow-contracts.js` + the three forge twins) — the
SAME files this node modifies — plus the four `npm` chain-green receipts; no
separate failing unit test exists because the contract assertions ARE the gate.
The contract validator assertions serve as the external adversary.

### n7 + n8 — code-reviewer (G1 gates, opus)

n7 reviews n4+n5 (opencode lane): the `.claude/` leak fix is subtle — verify the
resolver rewrite produces ZERO `CLAUDE_PLUGIN_ROOT`/`~/.claude/` tokens in ALL
generated files; verify the partition logic matches install.sh semantics (UNION,
never removes); verify `install_support_scripts()` honors `$OPENCODE_CONFIG_DIR`.
n8 reviews n6 (Codex lane): verify the byte-twin invariants hold; verify the
four chains stay green; verify the mechanism matches n3's design spec.

### n9 — doc-updater

Materialize `docs/decisions/D-543-01.md` (D-543-01 is next-free for issue #543 —
verified: no existing D-543-* in `docs/decisions/`; the highest is D-544-01 (existing)
for a different issue). The decision record documents BOTH the Codex partition
meanism (from n3's design) AND the opencode .claude-leak fix (folded #544-run-
discovered). Update `README.md` to reflect the behavioral-parity-across-editions
posture (default = adaptive-only on Claude, Codex, and opencode).

### n10 — finalize (sink)

CHANGELOG.md entry under `## [Unreleased]` documenting: Codex partition (#543),
opencode partition + .claude-leak fix (folded #544-run-discovered), four-chain-
green + opencode-suite-green receipts, D-543-01.

## Node Ledger

| id | status |
| --- | --- |
| n1-knowledge-lookup | complete |
| n2-code-explorer | complete |
| n3-planner | complete |
| n4-tdd-opencode-tests | complete |
| n5-implementer-opencode | complete |
| n6-implementer-codex | complete |
| n7-code-reviewer-opencode | complete |
| n8-code-reviewer-codex | complete |
| n9-doc-updater | complete |
| n10-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| knowledge-lookup (n1-knowledge-lookup) | subagent-invoked | evidence-binding: n1-knowledge-lookup c27b6f5af027 | |
| code-explorer (n2-code-explorer) | subagent-invoked | evidence-binding: n2-code-explorer a3801c3a512e | |
| planner (n3-planner) | subagent-invoked | evidence-binding: n3-planner 4caebbf32bf7 | |
| tdd-guide (n4-tdd-opencode-tests) | subagent-invoked | evidence-binding: n4-tdd-opencode-tests cf8be6edf399 | |
| implementer (n5-implementer-opencode) | subagent-invoked | evidence-binding: n5-implementer-opencode f3b784bad307 | |
| code-reviewer | subagent-invoked | evidence-binding: n7-code-reviewer-opencode b07f3f0e95dd | |
| implementer (n6-implementer-codex) | subagent-invoked | evidence-binding: n6-implementer-codex 19b04a26846f | |
| doc-updater (n9-doc-updater) | subagent-invoked | evidence-binding: n9-doc-updater da48b4551b5a | |
| finalize (n10-finalize) | main-session-direct | # n10-finalize (main-session-direct) — CHANGELOG sink | |
