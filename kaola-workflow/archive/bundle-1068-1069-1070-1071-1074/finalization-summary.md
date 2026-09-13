# Finalization summary — bundle-1068-1069-1070-1071-1074

Candidate: `741baf1161067dd614c1fbd8e4bdca555e399f44` on `workflow/bundle-1068-1069-1070-1071-1074`
(base `179e6444`).

## Delivered

- **#1070 — retire historical pins.** Nine tokens deleted from `templates/routing/required-blocks.js`
  (three negation pins, tautological judge tokens, second-round pin retirements), six
  `finalize.skeleton.md` sentences shortened, `teachesMissionEnumeration`/`nextMissionEnumeration`
  and the A3 mutation probe retuned, stale comment residues removed from canonical and
  generated/forge mirrors, ADR 0024 addendum records the retirements. Commit `dfef0420` (+ review
  fixes `82f65a1b`).
- **#1071 — lean the agent-facing skeletons and the global contract.** Every sentence the issue
  names (both rounds) removed from `next.skeleton.md`, `finalize.skeleton.md`,
  `dispatch-contract.md`, and `templates/global/kaola-workflow-global.md` (First Principles to the
  two custody/autonomy items); all required tokens and pins preserved. Commits `628f7f9c`,
  `82f65a1b`, `28df0087` (walkthrough axiom oracle retuned to the intentional lean contract).
  Owner withdrew the numeric line-count gates mid-run — acceptance is issue-listed redundancy
  removal; comment 5651297872 records the attribution and the observed final sizes (160/201/33).
- **#1068 — Cursor adapter to present-tense instructions.** `profile_lookup`, `dispatch_carrier`,
  `availability` reduced to instructions; build-id/app-version/14-role history and Cloud/provider
  mechanics moved into the two measured evidence claims in `docs/cursor-edition.md`; six
  `runtimeNeeds.cursor` pins, two mutation probes, and three stale test asserts retired; Cursor
  agent profiles byte-identical before/after. Commit `e66d0e8d`.
- **#1069 — one dispatch-contract carrier per always-loaded runtime.** The alwaysApply
  rule/global carrier keeps "Runtime dispatch contract (always loaded)" + adapter facts; Next and
  Finalize renders carry a one-sentence pointer; `Contract schema: N` moved from rendered bodies
  into the install receipt. Commit `72271eea` (+ `82f65a1b`, docs `418335cb`). Live post-compact
  Cursor CLI reload recorded: exactly one contract after native `/summarize`.
- **#1074 — Cursor CLI trailers compressed + doctor version authority.** Scoping preamble and
  fail-closed sentence once each, compact Finalize example; `--ensure-target` documented as
  materialization status only (`restart_boundary` belongs to claim/doctor); installed doctor no
  longer reports `stale_version` when `package.json` is absent — it reads the installed receipt
  (`version_source: installed_receipt`) and echoes `receipt_version`. Commits `9233a8b4`,
  `741baf11`. `cursor-grok-4.6-medium` provider evidence retained.

## Files Changed

56 files, +1168/−1307 (`git diff 179e6444 741baf11 --stat`) — net subtraction:

- Authoring sources: `templates/routing/{required-blocks.js,dispatch-contract.md,next.skeleton.md,
  finalize.skeleton.md}`, `templates/global/{kaola-workflow-global.md,runtime-contract-adapters.json}`,
  `templates/agents/runtime-capabilities.json`.
- Scripts: `sync-{cursor,grok,devin}-edition.js`, `generate-agent-profiles.js`,
  `kaola-workflow-global-contract.js`, `kaola-workflow-cursor-surface.js` (doctor version source),
  `simulate-workflow-walkthrough.js` (axiom oracle retune), `validate-workflow-contracts.js`,
  `kaola-workflow-claim.js` (2-line comment residue).
- Tests: cursor/devin/grok/opencode editions, issue-1044/1045/1046/1051/1053, route-reachability,
  runtime-agent-architecture, `fixtures/issue-1055-render-baseline.json` (recaptured for the
  intentional renders per the oracle's own policy).
- Generated mirrors: `commands/`, `hooks/`, `.devin/skills/`, `plugins/kaola-workflow*/` —
  regenerated, never hand-edited.
- Docs: `README.md`, `CHANGELOG.md` `[Unreleased]`, `docs/{api,conventions,cursor-edition,
  runtime-capabilities}.md`, `docs/decisions/0024` addendum.
- `.gitignore`: probe/fixture hygiene line.

Commits: `dfef0420`, `628f7f9c`, `e66d0e8d`, `72271eea`, `82f65a1b`, `9233a8b4`, `418335cb`,
`28df0087`, `2c367fea`, `741baf11`.

## Test Coverage

- Focused suites at the candidate: cursor-edition 619 + conformance 24, opencode 668, kimi 434,
  grok 412, zcode 470 + hook-protocol 32 + install 49, devin pass; runtime-agent-architecture,
  route-reachability, issue-1044/1045/1046/1051/1053 all green.
- Mutation-probe verified: deleting the live-schema phrase trips the intended ZCode test failure
  (assertion semantics restored, not weakened).
- Kernel conformance 248 assertions; render-subtraction oracle 5 assertions over 132 render
  comparisons.

Acceptance legs: automated (chains, editions, walkthrough, conformance, oracle) executed at
`741baf11`. Live Cursor CLI leg executed on the frozen candidate after installation — PTY,
build v2026.09.10-fd3934a, actual model `cursor-grok-4.6-xhigh` (provider-readable): workspace
trust → rule in context → native `/summarize` → rule re-injection with the dispatch contract
exactly once → `/workflow-next` dispatch executed end-to-end to a correct pre-claim stop.
Evidence `parallel-cursor-preflight/final-741baf11/carrier-repro-nontmp.md`. Not executed:
authenticated Claude live session (no account), Cursor App UI, Cursor Cloud deploy — consistent
with the handoff's scope.

## Validation

verdict: pass
command: `node plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js --project bundle-1068-1069-1070-1071-1074`
receipt: `kaola-workflow/bundle-1068-1069-1070-1071-1074/.cache/chain-receipt.json` — `headSha`
741baf11, `workTreeHash: clean`, scope `all-four` (edition_coupling).
chains: claude (exit 0), codex (exit 0), gitlab (exit 0), gitea (exit 0).
walkthrough: `node scripts/simulate-workflow-walkthrough.js` — 178/178 at 741baf11.
editions: `npm run test:kaola-workflow:editions` — 9/9 suites pass at 741baf11.
installation: `./install-all.sh --yes` all 8 runtimes; `./install-all.sh --check` dry-run all PLAN
at 741baf11; Cursor authority receipt `11.1.1`, 27 files current, `version_source: installed_receipt`.

History of the frozen candidate: the first all-four attempt failed twice on stale oracles —
`testAxiomBlockByteIdentity` pinned the five-principle block #1071 intentionally retired
(retuned `28df0087`), and the #1055 render oracle compared intentional new renders to the old
baseline (recaptured `2c367fea` per the oracle's own `--write-baseline` policy). No ceiling raised,
no test weakened.

## Changed Paths

Reported by `finalize --check` (`checks.changed_paths`, `dirty_paths: []`): 50 paths —
`.gitignore`; `commands/{workflow-next,kaola-workflow-finalize}.md`;
`hooks/kaola-workflow-compact-recovery.md`; the generated mirrors under
`plugins/kaola-workflow{,-gitlab,-gitea}/` (commands, hooks, skills, plus each forge's
`*-workflow-claim.js` and the codex `validate-workflow-contracts.js`); `scripts/` — the five
sync/generate scripts, `kaola-workflow-{claim,cursor-surface,global-contract}.js`,
`simulate-workflow-walkthrough.js`, `validate-workflow-contracts.js`, the
`issue-1055-render-baseline.json` fixture, and the ten retuned test files; and the authoring
sources under `templates/{routing,global,agents}/`. Documentation paths are listed under
Files Changed.

## Documentation Docking

`.cache/doc-docking.md` — DOCKED at 741baf11.

## Follow-Up Items

- Carrier discrepancy resolved without product change: Cursor CLI withholds user-level rules in a
  world-writable cwd outside `$HOME` (vendor boundary); injects them in normal trusted workspaces.
  No second carrier was shipped — a project copy would double-inject under `$HOME` and violate
  #1069's exactly-once acceptance. Raw comparison evidence recorded
  (`carrier-repro-nontmp.md`, independent `carrier-discrepancy.md`); residual boundary
  discriminator (outside-home vs world-writable) noted there as an unknown, not a defect.
- Corrections landed on their own issues (#1071: 5651297872; #1074: 5651298952; #1069: 5651299085).
- No run-discovered defect remains unfiled; the mid-run `ensure-target` projection experiment was
  reverted uncommitted — the worktree is byte-identical to the receipted candidate.

## Closure decision

Close all five (#1068, #1069, #1070, #1071, #1074) together; all-or-nothing policy per
`workflow-state.md`. No release or version bump is part of this run.

## Readiness

All missions done; validation receipt green and bound to the frozen candidate; documentation
docked; live acceptance recorded; installed convergence verified. Ready for finalize check,
transaction, merge sink, closure audit.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/.cache/doc-docking.md
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/.cache/mirror-digest.json
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/finalization-summary.md
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/mission-list.md
- kaola-workflow/archive/bundle-1068-1069-1070-1071-1074/workflow-state.md
