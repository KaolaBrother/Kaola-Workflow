# Workflow Plan — issue-575

<!-- plan_hash: 9be6b7d287979c0a6ca1df3e3e4a7ffdff8b0e9cf0c7f1cf87198afb90d827fc -->

## Meta
labels: chore, tech-debt, documentation
validation_command: KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test

## Plan Notes

**Goal (#575).** Strip design-rationale *provenance* — hardcoded GitHub issue refs `#NNN`
(including single-digit), decision IDs `D-NNN-NN`, invariant tags `[INV-NN]`, ADR refs, and the
~18 whole provenance CLAUSES (e.g. `(the #291 defect pattern)`, `(the #254 router-rewrite parity
defect)`, `(#546, the #543 G1 pattern)`, lead-ins like `#399: ledger-regression guard`) — from
agent-facing **PROMPT surfaces only**, across all four editions, with **no rule meaning changed**.
(This plan file is durable state, NOT a prompt surface — it cites issue numbers freely.)

**Verified scope (re-greped at authoring, pattern `#[0-9]+|D-[0-9]+-[0-9]+|\[INV-[0-9]+\]`).** 56
files actually carry provenance: claude agents `.md` (8), forge agents `.toml` triple (12 = codex+
gitlab+gitea × {contractor,implementer,tdd-guide,workflow-planner}), claude commands `.md` (6),
forge command ports (12 = gitlab+gitea × {adapt,fast,finalize,phase1,plan-run,workflow-next}),
skill packs (18 = codex+gitlab+gitea × {adapt,fast,finalize,next,plan-run,research}). opencode is
GENERATED from canonical `agents/*.md` + `commands/*.md` by `scripts/sync-opencode-edition.js`, so
stripping canonical makes the 14 derived `.opencode/{agent,command}/*.md` mirrors stale — they move
ATOMICALLY with the canonical strip in n1 (#309/#453 generated-sibling). opencode is in parity NOW
(`test-opencode-edition.js`: 477 assertions green), so the regen changes exactly those 14.

**DO NOT TOUCH (verified clean / out of scope).** Runtime target-issue variable forms
(`KAOLA_TARGET_ISSUE=N`, "issue N") — functional, keep. "Phase N" (the `fast`/`full` six-phase
opt-in + the generic `planner`'s output-template phasing) and `fast-summary` tokens — legitimate,
NOT stale. Forge-noun lines (gitlab MR/glab, gitea PR/tea) — leave verbatim so editions stay
symmetric. `CLAUDE.md` / `CHANGELOG.md` / `docs/` / `docs/decisions/` / roadmap sources — provenance
is LEGITIMATE there (n5/n8 ADD content there but do NOT strip).

**Preserve pinned tokens.** Strip only provenance; PRESERVE every `test-agent-profile-parity.js`
FEATURE_TOKEN where it appears (`write_set_granularity`, `main-session-gate`, `validation_command`,
`KAOLA_PARALLEL_WRITES`, `REASONING_FLOOR_ROLES`, `target_set_indeterminate`,
`simulate-kaola-workflow-walkthrough.js`, the phrase "unsatisfied predecessor is a
high-probability-pass gate"); preserve all route-reachability wiring tokens, env vars, and script
names. Removing a ref must never remove a functional token.

**Decomposition + scheduling.** The strip is split for thoroughness and cross-edition SYMMETRY, not
arbitrarily: each edition-mirror group stays inside ONE node so a single agent strips it identically
(#309 — the .toml triple in n2, the forge command ports in n3, the skill triple in n4). n1 (claude
`.md` + opencode mirrors) is area-disjoint from the forge work (areas `agents`/`commands`/`.opencode`
vs `plugins`), so it co-opens in PARALLEL with the forge chain (D-419-01 (existing) wide frontier). The forge
nodes n2→n3→n4 are SERIAL: `areaForPath` maps every `plugins/kaola-workflow-git{lab,ea}/*` file to
the coarse area `plugins` (it only fine-grains the codex `plugins/kaola-workflow/` tree), so any two
forge write nodes collide at `plugins` and must serialize — the dep edges are the honest response to
that shared coarse lane, not arbitrary ordering. Critical path = n2→n3→n4→n5→n6→n7→n8; n1 hides under
the forge chain.

**Roles.** Prose stripping of prompt surfaces is `doc-updater` work (project convention — prose edits
to agents/commands/skills use doc-updater). A doc-updater touching `.toml` (NON-docs) is
code-producing, so G1 requires `code-reviewer` post-dominance — n2 (the .toml triple) forces the gate;
n7 covers every node anyway. `.md`-only nodes (n1,n3,n4,n5) are docs-trivial but still flow through
the gate.

**Accuracy gates (precedence #1).** This edits the agents' OWN operating instructions — the highest
blast radius on product behavior, and meaning-drift in a rewritten rule is INVISIBLE to every
automated check (chains assert wiring tokens, not prose semantics). So n6 (`adversarial-verifier`,
opus) is an independent semantic skeptic: it (a) reads every diff hunk for meaning-preservation —
especially the ~18 clause-rewrites — and (b) runs a grep-ORACLE for completeness (scan the 56 prompt
files for residual `#[0-9]+`/`D-[0-9]+-[0-9]+`/`[INV-[0-9]+]`; expect ZERO except the allowed runtime
target-issue forms `KAOLA_TARGET_ISSUE=N` / "issue N"), confirming no functional token was stripped
and editions stay symmetric. It is a change gate → emits `verdict: pass`. n7 (`code-reviewer`) then
runs the mechanical acceptance suite.

**Cross-edition obligation (#307) + acceptance.** This reaches the edition trees + the six routing
surfaces (#400), so all four chains must be green. n7 runs `KAOLA_RUN_CHAINS_CONCURRENCY=serial npm
test` (the recorded `validation_command`) — serial concurrency is REQUIRED on this host: the default
`auto` SIGKILLs the octopus-merge test inside `test-adaptive-node.js`. Acceptance = four chains green
sequentially + `simulate-workflow-walkthrough.js` exits 0 + route-reachability green (both inside the
claude chain). Safety verified at authoring: NO contract validator / route-reachability /
vendored-agents check pins a provenance phrase from a prompt file, so stripping breaks no needle.

**Stretch regression guard — DEFERRED (planner's call).** A durable contract banning
`#NNN`/`D-NNN-NN`/`[INV-NN]` inside prompt-surface regions is valuable but a separate cross-edition
sub-project: it needs a new check wired into all four `validate-*-contracts.js` plus a carefully
allowlisted regex (permit `KAOLA_TARGET_ISSUE=N` / "issue N" across every surface). A mis-scoped
regex would false-positive and destabilize the four chains mid-run — a precedence-#1 hazard. This
run's accuracy is already guaranteed by n6's grep-oracle + the CLAUDE.md/conventions/D-575-01 rule.
Defer the durable guard to a focused follow-up issue where its allowlist can be designed and tested.

**Decision record.** `docs/decisions/D-575-01.md` is the next free number (no D-575 record exists).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-strip-claude | doc-updater | — | agents/adversarial-verifier.md, agents/contractor.md, agents/doc-updater.md, agents/implementer.md, agents/issue-scout.md, agents/tdd-guide.md, agents/synthesizer.md, agents/workflow-planner.md, commands/kaola-workflow-adapt.md, commands/kaola-workflow-fast.md, commands/kaola-workflow-finalize.md, commands/kaola-workflow-phase1.md, commands/kaola-workflow-plan-run.md, commands/workflow-next.md, .opencode/agent/adversarial-verifier.md, .opencode/agent/contractor.md, .opencode/agent/doc-updater.md, .opencode/agent/implementer.md, .opencode/agent/issue-scout.md, .opencode/agent/tdd-guide.md, .opencode/agent/synthesizer.md, .opencode/agent/workflow-planner.md, .opencode/command/kaola-workflow-adapt.md, .opencode/command/kaola-workflow-fast.md, .opencode/command/kaola-workflow-finalize.md, .opencode/command/kaola-workflow-phase1.md, .opencode/command/kaola-workflow-plan-run.md, .opencode/command/workflow-next.md, scripts/validate-workflow-contracts.js | 29 | sequence | sonnet | — |
| n2-strip-forge-agents | doc-updater | — | plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow/agents/implementer.toml, plugins/kaola-workflow/agents/tdd-guide.toml, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/implementer.toml, plugins/kaola-workflow-gitlab/agents/tdd-guide.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/implementer.toml, plugins/kaola-workflow-gitea/agents/tdd-guide.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow/scripts/validate-workflow-contracts.js | 13 | sequence | sonnet | — |
| n3-strip-forge-commands | doc-updater | n2-strip-forge-agents | plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/workflow-next.md | 12 | sequence | sonnet | — |
| n4-strip-forge-skills | doc-updater | n3-strip-forge-commands | plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-research/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-research/SKILL.md | 18 | sequence | sonnet | — |
| n4b-strip-adr | doc-updater | n1-strip-claude, n3-strip-forge-commands, n4-strip-forge-skills | commands/kaola-workflow-fast.md, commands/kaola-workflow-phase1.md, commands/kaola-workflow-phase2.md, commands/kaola-workflow-phase3.md, commands/kaola-workflow-phase4.md, commands/kaola-workflow-phase5.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase2.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase3.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase4.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase5.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase2.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase3.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase4.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase5.md, plugins/kaola-workflow/skills/kaola-workflow-plan/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-execute/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-ideation/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-execute/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-ideation/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-review/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-execute/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-ideation/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-review/SKILL.md | 30 | sequence | sonnet | — |
| n5-docs | doc-updater | n1-strip-claude, n4-strip-forge-skills, n4b-strip-adr | CLAUDE.md, docs/conventions.md, docs/decisions/D-575-01.md | 3 | sequence | sonnet | — |
| n6-meaning-verify | adversarial-verifier | n5-docs | — | 1 | sequence | opus | — |
| n7-review | code-reviewer | n6-meaning-verify | — | 1 | sequence | sonnet | — |
| n8-finalize | finalize | n7-review | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-strip-claude | complete |
| n2-strip-forge-agents | complete |
| n3-strip-forge-commands | complete |
| n4-strip-forge-skills | complete |
| n4b-strip-adr | complete |
| n5-docs | complete |
| n6-meaning-verify | complete |
| n7-review | complete |
| n8-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater (n1-strip-claude) | subagent-invoked | deferred_to_group | |
| doc-updater (n2-strip-forge-agents) | subagent-invoked | group_passed | |
| doc-updater (n3-strip-forge-commands) | subagent-invoked | evidence-binding: n3-strip-forge-commands 4d26f8b94e0b | |
| doc-updater (n4-strip-forge-skills) | subagent-invoked | evidence-binding: n4-strip-forge-skills 1fb6e48efadb | |
| doc-updater (n4b-strip-adr) | subagent-invoked | evidence-binding: n4b-strip-adr ebd1cbd5feac | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 1c860a734f01 | |
| adversarial-verifier (n6-meaning-verify) | subagent-invoked | evidence-binding: n6-meaning-verify 9069150a46a5 | |
| code-reviewer | subagent-invoked | evidence-binding: n7-review 5970fefef671 | |
