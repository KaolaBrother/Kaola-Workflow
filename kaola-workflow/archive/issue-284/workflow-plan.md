# Adaptive Workflow Plan — issue-284

<!-- plan_hash: 1158f7e7e426467b5efb75d2464a9b642353b4d8d32338792ca425408d76d8ab -->

adaptive(codex): wire the four Claude lifecycle-hook invariants onto Codex-native events so the
Codex edition gains the same lifecycle-recovery + enforcement guarantees. Codex CLI 0.137.0 has a
stable, Claude-Code-shaped hooks engine (`hooks`/`multi_agent` stable+on; `plugin_hooks` removed —
so deliver via an installer-managed `.codex/hooks.json`, NOT the plugin manifest). Four hooks:
(1) `SessionStart trigger=compact` → wire the existing-but-on-demand codex compact-resume; (2)
`PreToolUse` shell matcher → pre-commit project-mixing guard; (3) `PostToolUse Write|Edit` →
phantom-advisor guard; (4) `SubagentStart *` → the dispatch-log producer that makes the byte-identical
`checkDispatchAttestations` (claim.js / closure-contract.js) finally LIVE on Codex. The hook `.sh`
payload schema is identical to Claude's, so the existing `.sh` producers are reused, not reauthored;
the github-codex edition (`plugins/kaola-workflow/hooks/`) is currently MISSING phantom-advisor and
subagent-dispatch-log, so those two byte-identical copies are added and registered in
`validate-script-sync.js`. WARN-first posture is preserved (a missing producer never hard-blocks;
`multi_agent`-off degrades gracefully). Component-grouped DAG keeping each cross-edition change in ONE
node (#309): design → [installer, hookports] siblings; compact (output-format guard for the 3
compact-resume edition scripts) serializes after installer (shared areas) but runs concurrently with
hookports; → tests → review (G1) → docs → finalize. Labels are non-sensitive and no `*security*` path
is in any write set (G2 not triggered); code-reviewer post-dominates all four code producers (G1);
doc-updater precedes finalize because the `/hooks` one-time trust step + the `multi_agent`-off
precondition are public-doc changes; finalize is the unique docs/state sink (CHANGELOG.md only).

## Meta

labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| design | code-architect | — | — | 1 | sequence |
| installer | tdd-guide | design | plugins/kaola-workflow/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow/config/hooks.json, plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitlab/config/hooks.json, plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js, plugins/kaola-workflow-gitea/config/hooks.json | 1 | sequence |
| hookports | implementer | design | plugins/kaola-workflow/hooks/kaola-workflow-phantom-advisor.sh, plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh, scripts/validate-script-sync.js, uninstall.sh | 1 | sequence |
| compact | implementer | installer | plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js | 1 | sequence |
| tests | tdd-guide | installer, hookports, compact | plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | tests | — | 1 | sequence |
| docs | doc-updater | review | docs/architecture.md, docs/api.md, README.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| design | complete |
| installer | complete |
| hookports | complete |
| compact | complete |
| tests | complete |
| review | complete |
| docs | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect (design) | subagent-invoked | # design node (code-architect) — issue #284 implementation blueprint | |

| tdd-guide (installer) | subagent-invoked | # installer node (tdd-guide) — AC1 managed .codex/hooks.json | |
| implementer (hookports) | subagent-invoked | # hookports node (implementer) — port 2 missing github-codex hooks + sync-regist | |
| implementer (compact) | subagent-invoked | # Node: compact — SessionStart output-format guard | |
| tdd-guide (tests) | subagent-invoked | # tests node (tdd-guide) — issue #284 cross-edition AC coverage | |
| code-reviewer | subagent-invoked | # review node (code-reviewer, G1) — issue #284 | |
| doc-updater (docs) | subagent-invoked | # docs node (doc-updater) — issue #284 | |
| finalize (finalize) | subagent-invoked | # finalize node (sink) — issue #284 | |
## Design Notes

non_tdd_reason (hookports / implementer): the work is creating two byte-identical `.sh` copies
(the existing phantom-advisor + subagent-dispatch-log hooks the github-codex edition is missing),
registering them in `validate-script-sync.js` BYTE_IDENTICAL_GROUPS, and a symmetric `uninstall.sh`
cleanup. There is no natural failing UNIT test: bash hook scripts are invisible to `npm test` (it
never invokes them), and byte-identical file creation + sync-registration is verified by
`validate-script-sync.js` (a cross-edition byte-identity gate run under `npm test`), not by a
new behavioral unit test. The behavioral go-live IS test-covered — in the `tests` node, via the
attestation reads in the Codex walkthroughs.

non_tdd_reason (compact / implementer): a CONDITIONAL output-format guard, not new behavior. AC2
("the resume packet is injected after `/compact`") is mechanism-agnostic; Scope item 1's prose says
"via additionalContext/hookSpecificOutput" but the WORKING shipped Claude `compact-context.js`
(wired to `SessionStart/compact` in hooks.json) emits PLAIN stdout (`process.stdout.write`), and the
3 Codex compact-resume scripts already emit the same plain stdout. Whether an envelope wrap is needed
depends on a Codex-CLI-0.137.0 SessionStart injection fact (plain-stdout-injects vs envelope-required)
that could not be resolved from the code (context7 unavailable in this planner shell). DEFENSIVE
INCLUSION: the 3 edition scripts are in this node's write-set so the implementer can wrap the output in
`hookSpecificOutput.additionalContext` IF AND ONLY IF Codex requires it — otherwise leave the plain
stdout untouched (a declared-but-unwritten path is free; under-declaring would force a discard mid-run
because the frozen set can't expand). The behavioral verification (packet injected on compact) is
covered in the `tests` node's Codex walkthroughs. There is no natural failing UNIT test for "stdout
shape conditional on the host CLI"; this is wiring/config-shaped, hence implementer.

Disjointness for compact (areaForPath):
- compact areas: `plugins/kaola-workflow/scripts` (github-codex, 3-seg) + `plugins` (gitlab+gitea
  edition-named ports collapse to bare `plugins`). These 3 compact-resume scripts are edition-named
  ports, NOT in any byte-identical sync group.
- compact SHARES `plugins/kaola-workflow/scripts` AND bare `plugins` with installer → it CANNOT be an
  installer sibling (would be RED); hence `depends_on: installer` (serialized).
- compact ∥ hookports IS disjoint (hookports = `plugins/kaola-workflow/hooks`, `scripts`,
  `uninstall.sh`) → after installer completes, compact and hookports form a concurrent ready frontier,
  which is in-grammar (inferred-concurrent-sibling disjointness, #232).

installer (tdd-guide): the installer is `.js` and unit-testable — `scripts/test-install-adaptive-config.js`
is the standing precedent. The failing-test-first is "install-codex-agent-profiles produces a managed
`.codex/hooks.json` registering the four hooks, idempotently between BEGIN/END markers, and surfaces
the one-time `/hooks` trust step" (AC1). The 3 `config/hooks.json` template sources mirror the existing
`config/agents.toml` pattern; declaring all 6 paths is defensive — unused declared paths are free,
under-declaring forces a discard. Extending the EXISTING `install-codex-agent-profiles.js` means all
existing call sites (the three `kaola-workflow-init` SKILL.md) inherit the new behavior with NO
SKILL.md edit and NO `SUPPORT_SCRIPT_NAMES` change.

tests (tdd-guide) — VERIFIED test homes (the test surface is asymmetric across editions):
- github-codex: `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` carries BOTH
  the install-profiles coverage (`runInstallProfiles`) AND the attestation fields (lines 578-599);
  github-codex has no separate `test-*-workflow-scripts.js` — the walkthrough IS its suite.
- gitlab: install-profiles coverage lives in `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
  (`runInstallProfiles` ~L1931, run in-chain via the gitlab walkthrough), while the attestation field
  assertions live in `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-codex-workflow-walkthrough.js`
  (`claim_planner_attested` L26-27). BOTH are in scope.
- gitea: symmetric — `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (install,
  `runInstallProfiles` ~L1981) + `plugins/kaola-workflow-gitea/scripts/simulate-gitea-codex-workflow-walkthrough.js`
  (attestation L26-27).
5 files total, ≤ FILE_CEILING. The four gitlab/gitea files all collapse to area `plugins` under
areaForPath, so they CANNOT be split into per-edition siblings (they would collide RED) — they stay
together in this one `tests` node (within-node co-location is fine; disjointness is enforced between
SIBLINGS, not within a node). Asserts hook registration in `.codex/hooks.json`, the now-live
attestation (AC3: `claim_planner_attested: attested` / `finalize_contractor_attested: attested` once
the SubagentStart producer populates `.cache/dispatch-log.jsonl`; the byte-identical
`checkDispatchAttestations` in claim.js / closure-contract.js already exists — only a Codex producer +
wiring was missing), AND AC2 packet-injection-after-compact. This is a CROSS-EDITION diff: the
finalize/test evidence bar is ALL FOUR chains green —
`npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && \
npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — run SEQUENTIALLY (npm test
short-circuits on the first `&&` failure, so a green claude chain alone is insufficient evidence per
docs/conventions.md #307).

Disjointness check (areaForPath, sibling installer vs hookports):
- installer areas: `plugins/kaola-workflow/scripts`, `plugins/kaola-workflow/config`,
  `plugins` (gitlab+gitea collapse to bare `plugins`).
- hookports areas: `plugins/kaola-workflow/hooks`, `scripts`, `uninstall.sh`.
- No shared area between the two → RED-free siblings off `design`. (`scripts` is in SHARED_INFRA,
  but only hookports touches it; installer does not, so no overlap to even reach the yellow carve-out.)

Gates: code-reviewer (review) post-dominates the FOUR code producers installer/hookports/compact/tests
(G1); labels are non-sensitive + no `*security*` path in any write set (G2 not triggered); doc-updater
(docs) precedes finalize because the `/hooks` one-time trust step and the `multi_agent`-off
graceful-degrade precondition are public-interface doc changes (AC5); finalize is the unique sink and
writes docs/state only (CHANGELOG.md).
