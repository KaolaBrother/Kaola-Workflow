# Workflow Plan — bundle #414 / #418 / #422

<!-- plan_hash: e4aa46193e3f2e4abe96be038d56e111ca499ff7281b77c433fc38a8c1024c6d -->

## Meta
labels: enhancement, area:scripts, forge:gitea

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
|----|------|------------|--------------------|-------------|-------|-------|
| design | code-architect | — | — | 1 | sequence | opus |
| t414 | tdd-guide | design | scripts/simulate-workflow-walkthrough.js, scripts/test-claim-hardening.js | 1 | sequence | sonnet |
| t418-forge-smoke | implementer | design | plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js | 1 | sequence | sonnet |
| t418-manifest-twin | implementer | design | scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 1 | sequence | sonnet |
| parity-anchor | tdd-guide | design | scripts/test-agent-profile-parity.js, scripts/validate-script-sync.js | 1 | sequence | sonnet |
| parity-validators | implementer | parity-anchor | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, package.json | 1 | sequence | sonnet |
| review | code-reviewer | t414, t418-forge-smoke, t418-manifest-twin, parity-validators | — | 1 | sequence | opus |
| docs | doc-updater | review | docs/conventions.md, docs/architecture.md, docs/decisions/D-422-01.md | 1 | sequence | sonnet |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

This bundle is three test/contract-hardening issues with no production-behavior change and no
security-sensitive surface — so the only gate the graph needs is `code-reviewer` (G1)
post-dominating every code/test producer. No G2 (no sensitive node), no main-session-gate (no
GPU/visual/human-only acceptance check).

### Why this shape

- **`design` (code-architect, opus).** #422 is registry-driven: it defines a contract mapping each
  `agents/<name>.md` profile to the feature tokens that must appear in BOTH the .md and its three
  `.toml` twins (e.g. `write_set_granularity` / "EXACT file" for workflow-planner; ledger-compare /
  sync-order for contractor; the #382 model-assignment tokens). That registry, plus the #418
  family-mechanism extensions (config/hooks.json rename-normalized family; the gitlab↔gitea
  twin-pair proposal), constrains every downstream contract node. Reasoning-bounded design that the
  implementers carry out → opus. Read-only, 0 production writes.

- **Three independent legs off `design` (t414, t418-forge-smoke, t418-manifest-twin), shape
  `sequence`.** These are NOT a single-role fan-out group (a `fanout(<g>)` must be N instances of
  ONE role over disjoint sets, and these are three different roles). They are plain `sequence`
  nodes that share one ready frontier (all depend only on `design`), so the executor opens the
  ready ones together; runtime batch-eligibility is decided by disjoint write sets, and t414 +
  t418-manifest-twin both touch `scripts/`, so the executor will serialize that pair while
  t418-forge-smoke (plugin trees only) can run alongside. The shapes are correct and safe; the
  ordering between same-`scripts/` siblings is the executor's to choose.
  - **t414 (tdd-guide):** #414 is pure test coverage for the #397 sink-side behaviors that no test
    references today. RED-first: a bare-remote fixture, post-race-recovery sink scenario in
    `simulate-workflow-walkthrough.js` asserting the branch-delete ordering (remote `push --delete`
    FIRST, then `merge-base --is-ancestor <branch> <defBranch>` verify, then `branch -D`) with NO
    spurious `branch-worktree-resolved` violation, plus a `defaultBranch` probe-chain unit
    (`symbolic-ref` → `remote show` → `ls-remote --symref` → `main`) in `test-claim-hardening.js`.
    A failing assertion can be written first → tdd-guide.
  - **t418-forge-smoke (implementer):** #418.5 — add at least one smoke scenario to EACH forge
    walkthrough (gitlab + gitea) exercising a new adaptive path (scheduler running-set /
    `--freeze-checked` / `governance_ack_stale` / `write_set_granularity`) under the forge mock.
    non_tdd_reason: forge-mock walkthrough scenarios are integration-glue against generated ports,
    not unit-testable logic with a natural failing assertion.
  - **t418-manifest-twin (implementer):** #418.2 install-manifest exclusion-comment enumeration
    (`kaola-workflow-install-manifest.js:52` — name ALL intentional per-forge exclusions:
    github edition-sync / fixtures-orphan-legality / fast-audit / install-manifest /
    release-surface-drift; gitlab/gitea install-codex-agent-profiles; ledger-compare tracked
    separately) + #418.4 gitea twin parity (add the gitlab claim.js:1779 #369 clarifying comment
    "(never `skipped_offline`, the OFFLINE-only token)." to the gitea twin at the matching site
    ~1779). The install-manifest edit MUST land in BOTH `scripts/kaola-workflow-install-manifest.js`
    and its byte-identical codex peer `plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js`
    (#274 common-script pair) — the validator refuses a one-sided edit. non_tdd_reason:
    comment/doc-comment enumeration with no behavior to test-first. NOTE: #418.2's package.json half
    (chain `test-parallel --self-test`) is NOT here — it lands in `parity-validators` to keep
    package.json on a single serial lane (see below).

- **Contract-wiring spine (parity-anchor → parity-validators), serial by SHARED FILES.** Two files
  are written by more than one concern, so a fan-out would not be disjoint — they MUST serialize:
  - `scripts/validate-script-sync.js`: #418.1 (config/hooks.json rename-normalized family) AND #422
    (byte-group for the .toml triple) both add to its family registry.
  - `package.json`: #418.2 (`test-parallel.js --self-test` appended to the claude chain) AND #422
    (the new `test-agent-profile-parity.js` appended to the claude chain) both edit the chain.
  - **parity-anchor (tdd-guide):** authors the NEW `scripts/test-agent-profile-parity.js` RED
    fixture (goes RED when a feature paragraph is added to an `agents/*.md` without the matching
    token in the .toml family — reproduce the #404 planner gap as the RED case per #422 AC; GREEN at
    HEAD once #413 already landed) AND extends `scripts/validate-script-sync.js` (toml-triple
    byte-group + the #418.1 config/hooks.json rename-normalized family; consider the
    root↔gitlab↔gitea `hooks/hooks.json` family too). RED-first → tdd-guide.
  - **parity-validators (implementer):** wires the #422 md↔toml token-pin asserts into ALL FOUR
    contract validators — note the github↔codex pair (`scripts/validate-workflow-contracts.js` and
    `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`) are BYTE-IDENTICAL (md5 match
    at HEAD), so the same hunk lands in both; plus `scripts/validate-kaola-workflow-contracts.js`
    (codex) and the gitlab/gitea contract validators — mirroring the #400 route-reachability assert
    placement. Also appends BOTH new chain entries to `package.json` (#418.2 test-parallel
    --self-test + the #422 test). non_tdd_reason: contract-assert wiring + chain plumbing; the
    behavior is proven by parity-anchor's RED fixture going GREEN, not by a new unit here.

- **review (code-reviewer, opus) — G1.** Post-dominates every code/test producer (t414,
  t418-forge-smoke, t418-manifest-twin, parity-validators; parity-anchor is covered transitively
  via parity-validators). opus: the cross-edition parity reasoning (4-validator token coverage,
  byte-pair integrity, family-registry correctness, RED-fixture actually bites) is exactly the
  subtle-correctness judgment that earns the higher tier.

- **docs (doc-updater, sonnet).** #422 adds a durable contract pattern → a decision record
  (`docs/decisions/D-422-01.md` — next free in the `D-422` series; no existing D-414/D-418/D-422
  record at HEAD) and convention/architecture notes for the new agent-profile-parity family and the
  config/hooks.json family. Carries an already-made decision into prose → sonnet.

- **finalize (finalize, sonnet by role default).** Docs-only sink: CHANGELOG.md entry for the
  bundle. Carries NO model cell (the sink is never dispatched as a subagent). A non-docs write here
  would trip code-reviewer.

### Cross-edition + registration-surface notes

- **#422 adds NO new agent profile** — it adds a token-PIN contract over the EXISTING profiles, so
  the #340 22-path agent-registration surface does NOT apply (no new `agents/<name>.{md,toml}`, no
  CANONICAL_ROLES bump, no install.sh/uninstall.sh/resolve-agent-model edit). The 3 `.toml` twins
  are byte-identical today (verified), which is exactly why a byte-group in
  `validate-script-sync.js` (parity-anchor) + md↔toml token pins (parity-validators) closes both
  drift directions without touching the profiles themselves.

- **Cross-edition verification is mandatory before finalize (#307).** This bundle edits the edition
  trees (forge walkthroughs, forge contract validators, gitea claim twin, codex install-manifest
  peer) AND `package.json` (the chain definitions). All four
  `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green, run SEQUENTIALLY
  (a green claude chain alone is insufficient — `npm test` short-circuits on `&&`). The whole-plan
  barrier + gate-verify run at finalize.

- **Forge-neutral prose (#341).** The forge-walkthrough smoke scenarios and the gitea claim comment
  stay forge-neutral in any plugin prose; the gitea #369 comment is mirrored verbatim from the
  gitlab twin modulo forge nouns (the canonical spec is "mirror gitlab claim.js:1779 verbatim").

- **`validate-script-sync.js`, the contract validators, and `test-*.js` are PRODUCTION** (not
  isTestPath-exempt) — they are inside the per-node barrier and must be in a node's write set, which
  they are.

## Node Ledger

| id | status |
|----|--------|
| design | complete |
| t414 | complete |
| t418-forge-smoke | complete |
| t418-manifest-twin | complete |
| parity-anchor | complete |
| parity-validators | complete |
| review | complete |
| docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (design) | subagent-invoked | d5ce7535d0b9 | |
| tdd-guide (t414) | subagent-invoked | 26c475607762 | |
| implementer (t418-forge-smoke) | subagent-invoked | b87017bb5c6e | |
| implementer (t418-manifest-twin) | subagent-invoked | c3cb0472fa5e | |
| tdd-guide (parity-anchor) | subagent-invoked | ff929642636e | |
| implementer (parity-validators) | subagent-invoked | a603a8f9310c | |
| code-reviewer | subagent-invoked | 705b2e520c27 | |
| doc-updater (docs) | subagent-invoked | eeaee89b3891 | |
| finalize (finalize) | main-session-direct | b0a90c8e3837 | |
