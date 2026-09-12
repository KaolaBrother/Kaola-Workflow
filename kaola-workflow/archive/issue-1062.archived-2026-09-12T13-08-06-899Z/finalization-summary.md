# Finalization summary — issue-1062

## Delivered

The lean-orchestrator redesign of #1062 on branch `workflow/issue-1062` (8 commits over
`origin/main` `c416d8e8`, candidate `04f660951cb8d186337642960f3c53de2e7073cd`):

- **Authority sources.** `templates/agents/behavior-contracts.json` holds 7 roles
  (`code-explorer`, `code-reviewer`, `doc-updater`, `implementer`, `investigator`,
  `knowledge-lookup`, `tdd-guide`) with no `intent_class`; `implementer` v2 absorbs the
  build-error-resolver constraints; `code-reviewer` v4 is the optional clean-context check with
  brief-selectable focus and the ADR 0019 §5 clamp. `templates/agents/runtime-capabilities.json`
  gives Claude / Codex×3 / Grok / Cursor one `subagent_default` each (`sonnet`;
  `gpt-5.6-luna`/`max`; `grok-4.6`/`medium`; `grok-4.6`/`medium`) and marks OpenCode / Kimi /
  ZCode / Devin `role_dispatch: "native_only"` with only `native_routes` and `availability`.
  `provenance.json` down to 7.
- **Generator and kernel.** `generate-agent-profiles.js` renders 7 × 6 = 42 native profiles,
  validates the two adapter classes, writes `**Subagent default:** / **Roles:**` on binding
  surfaces and the native_only design sentence elsewhere; Codex TOMLs pin `model` and
  `model_reasoning_effort`; Grok pins `model: grok-4.6`. `kaola-workflow-adaptive-schema.js`
  ships `CODEX_PINNED_ROLES` / `CODEX_PINNED_MODEL` / `CODEX_PINNED_EFFORT`, `validateProfileText`
  requires the pins, `RETIRED_PROFILE_FILES` covers the 7; preflight treats unpinned pre-#1062
  profiles as migration input. The four native_only `sync-*-edition.js` render no agents; the
  OpenCode `opencode.json` scaffold is gone.
- **Routing prose.** `dispatch-contract.md` carries the executor-not-judge / handback-is-evidence /
  cost-sits-in-main-context / fan-out-by-cut paragraph, "lets a clean context check what your own
  cannot", "the subagent default binding", and the native_only sentence; `next.skeleton.md` states
  the orchestrator holds selection, design, acceptance meaning, the verdict on a read candidate,
  and finalization, with the conditional `tdd-guide`/`implementer` guard; `finalize.skeleton.md`
  uses suggested routes and an `implementer` card with no `model=`; `axioms.md` synced.
- **Validators and installers.** Four contract validators follow the single binding (noun-ban floor
  measured at 46 surfaces). `install.sh`/`uninstall.sh` 7 required + 7 retired; Grok/Cursor retire
  7; Kimi/OpenCode/ZCode/Devin deploy no agents and remove previously installed profiles only when
  Kaola ownership is proven (managed marker; manifest hash where one exists); the Devin doctor
  14-role assertion is gone.
- **Tests** rewritten to the new acceptance meaning (Owner-authorized): render oracle re-based to
  132 comparisons with its baseline re-captured in the same commit; role-redesign, resolver,
  model-rendering, routing-surfaces, runtime-architecture, six edition suites, forge plugin
  walkthroughs and fixtures.
- **Documentation.** ADR 0025 (`docs/decisions/0025-lean-orchestrator-single-subagent-binding.md`);
  ADR 0019 / 0021 / D-687-01 annotated as superseded; README, api, architecture, agents-source,
  runtime-capabilities, conventions, docs index, six edition docs; CHANGELOG `[Unreleased]` with
  the major upgrade note and migration map.
- **This machine reinstalled** from the candidate: `./install-all.sh --yes` PASS on 8 runtimes;
  `./install-all.sh --check` exit 0 `CURRENT`.

## Files Changed

`git diff --stat c416d8e8..04f66095`: 158 files across `templates/agents/`, `templates/routing/`,
`templates/axioms.md`, `scripts/` (generator, kernel, preflight, resolver, six sync scripts, four
validators, 28 test/simulation files, `fixtures/issue-1055-render-baseline.json`), `agents/`
(7 retired removed, 7 regenerated, manifest), `commands/`, `plugins/*/{agents,config,commands,
skills,scripts}`, nine install/uninstall shell scripts, `opencode.json`, `.gitignore`, `README.md`,
`CHANGELOG.md`, `docs/` (12 files + new ADR 0025).

Commits: `80d324a0` authority/generator · `72c4c60d` routing prose · `b153482b` validators/installers
· `64d6b57e` ZCode sweep marker gate · `e5153c16` Kimi sweep exact-bytes gate · `8ec4c234`
acceptance · `7b52e20c` docs · `04f66095` sweep.

## Test Coverage

Acceptance legs executed on the frozen candidate `04f66095`:

- Automated (receipt): `node scripts/kaola-workflow-run-chains.js --project issue-1062` — scope
  `all-four` (edition coupling, 158 changed files vs `c416d8e8`); chains `claude`
  (`npm run test:kaola-workflow:claude`, 486.7 s, 51 steps exit 0), `codex`, `gitlab`, `gitea` all
  exit 0, 1 attempt each, no accepted red; `workTreeHash: clean`.
- Automated (direct, handoff 6 on the same candidate): `npm test`, `npm run
  test:kaola-workflow:editions` (9 suites), `npm run test:kaola-workflow:claude:full`,
  `node scripts/simulate-workflow-walkthrough.js` (178/178), `generate-agent-profiles --check`
  (42 renders), `generate-routing-surfaces --check` (24 surfaces), `edition-sync --check`,
  `validate-script-sync` — all exit 0.
- Grep acceptance (issue §7.9 / §7.10): zero-hit and must-hit gates recorded in the Mission List's
  final item; only installer/uninstaller retired-name lists, the kernel `RETIRED_PROFILE_FILES`,
  and the generator's two vocabulary-rejection lines remain in scope.
- Environment: live `./install-all.sh --yes` then `--check` on this macOS machine (exit 0,
  `CURRENT`); retired profiles removed from every runtime carrier; `~/.config/devin/AGENTS.md` and
  `~/.cursor/rules/kaola-workflow-global.mdc` carry the new adapter blocks; `devin doctor --json`
  reports no agent profiles configured.
- Not executed: Cursor Cloud environment rebuild (Owner's dashboard); Codex child `turn_context`
  verification of the TOML pin, Grok CLI re-measure, and the Cursor Fast-pricing read (issue §10,
  non-blocking, Owner machine); the §7.8 provider-usage cost comparison (Owner-owned).

## Acceptance walk (issue §7)

1. Authority JSON shape — `80d324a0`; asserted by `test-issue-1054-role-redesign.js`,
   `test-runtime-agent-architecture.js`, generator validation.
   1a. Renders per runtime — `generate-agent-profiles --check` (Claude 7 `model: sonnet`; Codex 3×7
   pinned TOMLs; Grok 7 `grok-4.6`/`medium`; Cursor 7 `grok-4.6[effort=medium]`; four editions zero)
   — `test-{grok,cursor,opencode,kimi,zcode,devin}-edition.js`.
2. `code-reviewer` / `implementer` bodies — `80d324a0`; other bodies byte-identical.
3. Routing prose — `72c4c60d`; `validate-workflow-contracts.js`, `test-issue-105{1,3}-*.js`,
   `test-generate-routing-surfaces.js`; §7.10 must-hit gate.
4. Zero drift, 42 renders — receipt preamble + `--check` outputs.
5. Installers — `b153482b`, `64d6b57e`, `e5153c16`; install/uninstall suites; live `--check` PASS.
6. Tests green, receipt bound to the candidate — `chain-receipt.json` (`headSha: 04f66095`).
7. ADR 0025, status notes, doc counts, CHANGELOG — `7b52e20c`, `04f66095`; `.cache/doc-docking.md`.
8. Cost comparison — Owner-owned, non-blocking (§11.1 #13); listed under Follow-Up.
9. / 10. Grep gates — recorded in the Mission List's final item (handoff 6 output).
11. Validators — `b153482b` (routed-fix `implementer`, floor 46, binding regex, TOML two-key assertion).
12. Installers — `b153482b` (+ the two ownership-gate fixes).
13. Oracle re-baselined; role-redesign / routing-surface rosters — `8ec4c234`.
14. native_only command surfaces name no Kaola role as dispatchable — `80d324a0`, `72c4c60d`;
    verified on fresh Devin/OpenCode/Kimi/ZCode trees in handoff 6.

Issue §8 "not built" honored: no counters, caps, thresholds, auto-escalation, review gate, swarm,
cost ledger, or Grok `/workflow` `native_routes`; `custody` keeps its brief-level meaning.

## Validation

verdict: pass
command: `node scripts/kaola-workflow-run-chains.js --project issue-1062`
receipt: `kaola-workflow/issue-1062/.cache/chain-receipt.json`
head: `04f660951cb8d186337642960f3c53de2e7073cd` (`workTreeHash: clean`)
chains: claude (exit 0, 486.7 s) · codex (exit 0) · gitlab (exit 0) · gitea (exit 0); scope `all-four`; no accepted red.

## Changed Paths

(finalize transaction findings land here)

## Documentation Docking

`.cache/doc-docking.md` — DOCKED at `04f66095`. All AGENTS.md checklist files updated or recorded
no-impact; retired-vocabulary grep over live docs is zero; version bump deferred to
`kaola-workflow-release.js --prepare --version 12.0.0` (major).

## Follow-Up Items

- `install.sh` placeholder rendering (`TDD_GUIDE_MODEL` / `DOC_UPDATER_MODEL`) has no consumer
  after this change — filed: #1066 (P3, verified open, body non-empty). Issue §8 asked for this
  separate issue.
- `finalize --check` from the worktree first returned `archive_authority_ambiguous` /
  `mirror: skipped_post_archive` because `kaola-workflow/archive/issue-1062/` already existed from
  an earlier run archived under the same project name and the worktree had no live copy yet;
  unblocked by copying the main-root live folder into the worktree (byte-identical, `diff -r`).
  Run-discovered defect — filed: #1067 (P2, verified open, body non-empty).
- §7.8 one-off provider-usage cost comparison before/after — Owner-owned, recorded as an issue
  comment when done; no run-cost ledger (per `_rules.md`). Not blocking.
- Issue §10 non-blocking measurements on the Owner's machine: a Codex child's `turn_context`
  `model`/`effort` under the TOML pin (openai/codex #33667 / #33881); Grok CLI child effort with
  `model: grok-4.6` pinned; whether Cursor `grok-4.6[effort=medium]` lands on Fast pricing
  (`providerOptions.cursor.modelName`). Recorded in ADR 0025 Consequences; no new issue filed.
- Release: cut 12.0.0 with `scripts/kaola-workflow-release.js --prepare --version 12.0.0` after
  merge; Cursor Cloud saved environment must be rebuilt; other machines rerun `./install-all.sh --yes`.
- Pre-existing dead history link in CHANGELOG (`docs/plan-run-cards/reopen-complete-node.md`) left
  untouched as history.

## Readiness

All seven missions done; chain receipt green and bound to the frozen candidate; documentation
docked; this machine reinstalled and `--check` CURRENT; follow-up filed. Closure decision: close
#1062 on merge (no keep-open member). Ready for closure, archive, and merge sink.
