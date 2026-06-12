# Workflow Plan — issue-447

<!-- plan_hash: b72666c2416ea05b54d5a2ffdde7cdc0ab7df85049f3f6f6aeea29e6cfab1ea8 -->

Global-install Codex lifecycle hooks into `~/.codex` (decouple from per-repo
`workflow-init`; force-refresh on every install/upgrade). Cross-edition change:
the Codex agent-profile installer is byte-identical across the three plugin
editions; behavior + symmetric uninstall + tests + prose all move together.

## Meta

labels: documentation, enhancement, workflow:in-progress, area:scripts
sensitivity: false
blast_radius: false
issue: 447

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-installer-global-hooks | tdd-guide | — | plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, uninstall.sh, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 1 | sequence | sonnet |
| n2-model-rendering-test | implementer | n1-installer-global-hooks | scripts/test-install-model-rendering.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js | 1 | sequence | sonnet |
| n3-code-review | code-reviewer | n2-model-rendering-test | — | 1 | sequence | opus |
| n4-doc-init-template | doc-updater | n3-code-review | plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md | 1 | sequence | sonnet |
| n5-doc-readme | doc-updater | n4-doc-init-template | README.md | 1 | sequence | sonnet |
| finalize | finalize | n5-doc-readme | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Shape & dependency rationale

A behavior change with a clean failing-test-first signal (hooks must land at
`~/.codex`, and no `<project>/.codex/hooks.json` may be written) → `tdd-guide`
for n1. n2 extends an existing test harness (no product logic) →
`implementer`. n3 (`code-reviewer`) post-dominates both code-producing nodes
(G1). The docs split in two because the `kaola-workflow-init` SKILL prose is
byte-paired with its `commands/workflow-init.md` peer (the #301 workflow-init
template group: 3 SKILLs + 3 command pairs = 6 files, exactly `FILE_CEILING`),
so the README cannot share that node — n4 owns the 6-file init template group,
n5 owns README, both before the docs-only `finalize` sink. Strictly sequenced —
a single coupled cross-edition change, not pairwise-independent legs, so no
fan-out.

### n1 — installer global-hook retarget + symmetric uninstall + forge tests (tdd-guide, sonnet)

Core behavior change. The three `install-codex-agent-profiles.js` copies are a
**byte-identical group** (`BYTE_IDENTICAL_GROUPS` in `validate-script-sync.js`,
also `edition-sync.js --check`): edit the canonical
`plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` and run
`npm run sync:editions` so the gitlab/gitea copies stay byte-identical — all
three paths are in the write set because the node writes all three. The
canonical spec for the two forge copies is "byte-identical to the canonical
modulo nothing" (no forge nouns in this installer; its filename keeps the
canonical name across editions).

Implementation (per issue Design):
- Derive the hook target from `os.homedir()/.codex` instead of
  `path.join(projectRoot, '.codex')`. `updateHooks()` + `copyHookScripts()`
  write `~/.codex/hooks.json` + `~/.codex/kaola-workflow/{hooks,scripts}`;
  `buildManagedHooks()` substitutes the **global** stable home into
  `__KW_PLUGIN_ROOT__`. Leave `copyAgentProfiles()` / `updateConfig()`
  targeting `<projectRoot>` (AC2 — profiles + managed `[agents.*]` config block
  stay project-local). Keep the final stdout `path.relative(...)` lines
  coherent with the new global hook target.
- `uninstall.sh`: clean the **global** `~/.codex/hooks.json` managed entries +
  `~/.codex/kaola-workflow/` (currently `$PWD/.codex/...` at L210/L267). Keep
  the project-local profile/config cleanup (`$PWD/.codex/agents/kaola-workflow`,
  managed `[agents.*]` block at L278-279) as-is. Update the "ASYMMETRY: install
  writes project-local" comments (L207) to reflect global hooks (AC4).
  `uninstall.sh` is `bash -n`-checked in the claude chain.

Test-first (the failing assertions this node turns green):
- `plugins/kaola-workflow-{gitlab,gitea}/scripts/test-*-workflow-scripts.js`:
  repoint the hook-location assertions (currently `<target>/.codex/hooks.json`,
  e.g. the #325 R2 black-box checks around L2007/L2042/L2061) at the temp-`HOME`
  `~/.codex/hooks.json`, and add an assertion that **no** `<project>/.codex/
  hooks.json` is written (AC1, AC5 — only the global file carries the four
  `kaola-workflow:` entries). These two forge test files are NOT byte-identical
  (they carry forge nouns); give them a shared canonical spec — "assert hooks at
  `os.homedir()/.codex`, assert no project-local hooks.json" — so they converge.
- These tests run inside the gitlab/gitea chains (AC7).

Forbidden-token note: the installer touches the edition plugin trees, but it is
a `.js` installer with no agent/command/skill prose — no forge-CLI-binary or
brand tokens to leak. Still keep the gitlab/gitea copies forge-neutral and
byte-identical to canonical.

### n2 — model-rendering test coverage (implementer, sonnet)

`scripts/test-install-model-rendering.js` runs in the **claude** chain. It
currently exercises `install.sh` forge rendering and does **not** call the codex
profile installer. Extend it (or align its hook-location assertions) so the
global-hook invariant is covered in the claude chain too: assert the codex
installer writes `~/.codex/hooks.json` under a temp `HOME` and writes no
`<project>/.codex/hooks.json` (AC1). `non_tdd_reason`: test-harness extension
only — no product logic; the behavior under test is implemented by n1, and the
assertion is spec-driven (AC1). Sequenced after n1 so both describe the same
`~/.codex` target invariant coherently.

### n3 — code review (code-reviewer, opus)

Gate (G1) over both code-producing nodes. Opus because the review must reason
about: byte-identity of the three installer copies after `sync:editions` (no
hand-edit drift — the `#347` class), the **symmetry** of install-writes-global
vs uninstall-cleans-global (an asymmetry reintroduces the double-fire the issue
removes — AC4/AC5), idempotence + content-hash stability of the global refresh
(AC3), and that `copyAgentProfiles()`/`updateConfig()` were left project-local
(AC2). Verify with the four chains where reachable; the forge hook-location
tests are the AC1/AC5 backstop.

### n4 — docs: workflow-init template group across editions (doc-updater, sonnet)

The three `kaola-workflow-init/SKILL.md` files are each byte-paired with their
`commands/workflow-init.md` peer (the #301 workflow-init template group — the
validator refuses a node that declares a SKILL without its command pair). Six
files, exactly `FILE_CEILING`. The three SKILL/command pairs are **semantic
mirrors, not byte-identical** across editions (forge nouns differ); shared
canonical spec: "mirror the claude edition's hook prose verbatim modulo forge
nouns." Keep each SKILL↔command byte-locked template region (the
`KW-CLAUDE-TEMPLATE` block) in sync within its edition.

Prose change (AC6): hooks are global and refreshed every install/upgrade; the
`install-codex-agent-profiles.js "$PWD"` step still passes `$PWD` (profiles are
project-local) but the prose must no longer describe `.codex/hooks.json` as
project-local. Migration note: an existing project-local `.codex/hooks.json`
must be removed to avoid double-fire — `uninstall.sh` handles it, or document a
one-line `rm`.

Decision record: no `D-447-NN` record is mandated by the ACs; if a record is
written here, use `D-447-01` (next free — the repo records no `D-447*` today).
This node writes no decision file in its declared set.

### n5 — docs: README global-hooks model (doc-updater, sonnet)

`README.md`: "Codex packs → Install" + "Hook policy → Codex lifecycle hooks"
(~L375-389, L904-933) — hooks are global (`~/.codex/hooks.json` +
`~/.codex/kaola-workflow/{hooks,scripts}`), installed/refreshed on every
install/upgrade, one-time `/hooks` trust (re-trust only after a hook's content
changes). Remove the project-local framing and the "user scope intentionally
empty / don't install into `~/.codex`" note from the prior README pass
(commit 614c19f2, ~L433-434). The "Update an existing Codex install" flow keeps
the project target for profiles but global hooks land automatically. Sequenced
after n4 so the README and the init-template prose stay consistent.

### finalize — docs-only sink

Writes `CHANGELOG.md` only (`[Unreleased]` entry: global Codex hooks, decoupled
from per-repo workflow-init, force-refresh on install/upgrade). Docs-only write
set keeps the sink off the G1 gate.

### Cross-edition gate (CLAUDE.md / AC7)

This diff touches `plugins/kaola-workflow*/` and the forge test scripts, so all
four chains must be green before Finalization (run sequentially — `npm test`
short-circuits on the first failure):
`npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea`. The
installer byte-group is additionally guarded by `validate-script-sync.js`
(claude chain) and `edition-sync.js --check` (gitlab/gitea chains).

## Node Ledger

| id | status |
| --- | --- |
| n1-installer-global-hooks | complete |
| n2-model-rendering-test | complete |
| n3-code-review | complete |
| n4-doc-init-template | complete |
| n5-doc-readme | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-installer-global-hooks) | subagent-invoked | evidence-binding: n1-installer-global-hooks eaadd3d98195 | |
| implementer (n2-model-rendering-test) | subagent-invoked | evidence-binding: n2-model-rendering-test 8a343f1564de | |
| code-reviewer | subagent-invoked | evidence-binding: n3-code-review 179d934c27de | |
| doc-updater (n4-doc-init-template) | subagent-invoked | evidence-binding: n4-doc-init-template 06bd61fcc351 | |
| doc-updater (n5-doc-readme) | subagent-invoked | evidence-binding: n5-doc-readme d6ca82a9602e | |
| finalize (finalize) | main-session-direct | evidence-binding: finalize 3ae71a4ec8f9 | |
