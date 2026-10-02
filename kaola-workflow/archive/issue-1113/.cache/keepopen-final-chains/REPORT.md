# Candidate-bound validation — issue #1113 (explicit GitHub singleton keep-open PR lifecycle)

Run: `droid-KW-i1113-chains`, dispatched by Host `zcode-KW-orchestrator-keepopen-pr`.
Date: 2026-10-02. All checks ran inside the run worktree. Workflow-next was invoked to resume
the existing issue-1113 run context: no claims, worktrees, branches, or ledger entries were
created, and the mission ledger was not written (Host owns it).

## Frozen candidate gate (verified before anything ran)

- Worktree: `/Users/ylmacstudio/Workspace/kaola-workflow/.kw/worktrees/issue-1113`
- Branch: `workflow/issue-1113`
- HEAD: `1203f76510f5dff3418b18ae6b5db116e0c1899a` — exact match with the frozen candidate.
- `git status --short --branch`: clean (no tracked or untracked paths) before the first check,
  and re-verified clean after the walkthrough, after the chain, and after every focused suite.
- HEAD re-verified `1203f76510f5dff3418b18ae6b5db116e0c1899a` after all runs. No source mutation
  occurred at any point.

## 1. Required integration chain — walkthrough

- Command: `node scripts/simulate-workflow-walkthrough.js` (full, unsharded)
- Working dir: the worktree
- Exit code: **0**
- Duration: **125s**
- Result: `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":204,"ran":204,"passed":204,"failed":0}` — **204/204 scenarios passed** (spawn census 2535). Includes the keep-open and sink-pr lanes (`testKeepOpenMergeFullChain`, `testSinkPrKeepOpenRefusal`, `testSinkPrUsesFinalizationSummary`, `testSinkPrLinkedPosturePublishesArchive`, `testKeepOpenFinalizeFlagAlias`, and the other sink-pr/watch-pr scenarios).
- Full log: `kaola-workflow/issue-1113/.cache/keepopen-final-chains/logs/walkthrough.log`

## 2. Producer-selected cross-forge validation chain (`npm test` chain set)

- Command: `node scripts/kaola-workflow-run-chains.js --project issue-1113` (run from the worktree root; per `commands/kaola-workflow-finalize.md` this is the producer-selected cross-forge chain command. It executes exactly the `npm test` chain set — `npm run test:kaola-workflow:claude && …codex && …gitlab && …gitea` — with the shared preamble hoisted and run once, and writes the candidate-bound receipt. A separate bare `npm test` was not run: it runs the identical four chains serially and writes no receipt.)
- Exit code: **0** (overall runner exit)
- Duration: **769s** (15:23:28Z → 15:36:16Z; the four chains ran concurrently)
- Preamble (hoisted, all exit 0): `edition-sync.js --materialize-kernel`, `validate-script-sync.js`,
  `test-issue-1056-default-branch-env-contract.js`, `test-forge-finalize-findings.js`,
  `test-forge-archive-scoping.js`, `test-forge-claim-rollback-scoping.js`,
  `test-forge-claim-reserved-project.js`, `test-active-folders-field-parity.js`,
  `generate-routing-surfaces.js --check`, `edition-sync.js --check`
- Chains (from the receipt):
  | chain | command | exitCode | duration | accepted_red | attempts | timed_out |
  |---|---|---|---|---|---|---|
  | claude | `npm run test:kaola-workflow:claude` | 0 | 740.2s | false | 1 | false |
  | codex | `npm run test:kaola-workflow:codex` | 0 | 9.5s | false | 1 | false |
  | gitlab | `npm run test:kaola-workflow:gitlab` | 0 | 178.7s | false | 1 | false |
  | gitea | `npm run test:kaola-workflow:gitea` | 0 | 178.2s | false | 1 | false |

### Chain receipt

- Path: `/Users/ylmacstudio/Workspace/kaola-workflow/kaola-workflow/issue-1113/.cache/chain-receipt.json`
  (the runner resolved `--project issue-1113` to the main checkout's project record dir — the
  location the finalize gate reads, per the #546 receipt-path contract)
- headSha: `1203f76510f5dff3418b18ae6b5db116e0c1899a` — **bound to the exact frozen candidate**
- workTreeHash: `clean`
- codeTreeHash: `d9fdd72079cded980ded9a958c04240e498431e7b629a3a0283093978999d703`
- validationTestConsumes: `[]`
- scope: decision `all-four`, reason `edition_coupling`, base `fe7e4443a8c367cfc111c65755191ae6790e810e`, changedFileCount 26 (the runner's auto-scoped diff matches the dispatched changed-surface list)
- **accepted_red / waivers: none.** Every chain carries `accepted_red: false`, `accepted_red_issue: null`; no `--accept-known-red` was passed; no timeouts, no signal deaths, no transient retries (`retried_transient: false`, `attempts: 1` on all four). This is a clean PASS.
- Full log: `kaola-workflow/issue-1113/.cache/keepopen-final-chains/logs/cross-forge-chains.log`
  (the runner emits only its summary to stdout; per-step evidence is in the receipt)

## 3. Focused suites for the changed surfaces

Changed surfaces in `fe7e4443..1203f765` (26 files): `scripts/kaola-workflow-claim.js`,
`scripts/kaola-workflow-sink-pr.js`, `scripts/kaola-workflow-closure-contract.js`,
`scripts/kaola-workflow-active-folders.js`, `templates/routing/finalize.skeleton.md`,
`templates/routing/slots.js`, `scripts/fixtures/issue-1055-render-baseline.json`, the rendered
mirrors under `plugins/kaola-workflow`, `plugins/kaola-workflow-gitlab`, `plugins/kaola-workflow-gitea`
(finalize command + closure-contract + active-folders + claim + sink-pr + finalize SKILL), and docs
(`README.md`, `docs/api.md`, `docs/README.md`, `docs/architecture.md`,
`docs/decisions/0031-explicit-github-keep-open-pr.md`, `docs/workflow-state-contract.md`,
`CHANGELOG.md`, `commands/kaola-workflow-finalize.md`).

Standalone focused runs (all in the worktree, all bound to HEAD `1203f765`):

| # | Suite | Exit | Duration | Changed surface it covers, and why it is the affected suite |
|---|---|---|---|---|
| 1 | `node scripts/test-claim-hardening.js` | 0 | 52s (953 assertions) | `scripts/kaola-workflow-claim.js` (199 lines changed: finalize/keep-open/PR lifecycle gating, closure receipts, #416 keep-open-request semantics). This is the claim-surface behavior suite, and it runs **only** in `test:kaola-workflow:claude:full`, not in the required chain — so a standalone run was needed. Its log contains simulated forge-probe failure output (TLS handshake timeout, rate-limit, unresolvable issue numbers) from its mock-forge failure-shape scenarios; that is expected test output, and the suite verdict is green. |
| 2 | `node scripts/test-sink-merge.js` | 0 | 187s (1258 assertions) | `scripts/kaola-workflow-sink-pr.js` (397 lines changed) serves the sink transaction family that this suite drives end-to-end: keep-open lifecycle semantics (#694 stale keep-open receipt, #705 keep-open roadmap retention, #1096 closure-failure classification), claim-marker release on keep-open (#936/#937), archive/stage scoping. There is no dedicated `test-sink-pr.js`; this and the walkthrough are the behavioral suites for that family. Also claude:full-only, so not covered by the required chain. |
| 3 | `node scripts/validate-workflow-contracts.js` | 0 | <1s | `scripts/kaola-workflow-closure-contract.js` (+ 3 plugin mirrors): pins the closure-contract consumers, the sink-pr structural contract (`updateStateSinkBlock`, `writeFileAtomicReplace`, no `patchLockFile`), the #336 keep-open lane, and the `commands/kaola-workflow-finalize.md` sink-pr wiring. Also green inside the claude chain (receipt step, 327ms). |
| 4 | `node scripts/test-active-folders-field-parity.js` | 0 | <1s | `scripts/kaola-workflow-active-folders.js` (10 lines changed, mirrored in `plugins/kaola-workflow`): its dedicated field-parity suite. Also green in the hoisted preamble (receipt step, 34ms). |
| 5 | `node scripts/generate-routing-surfaces.js --check` | 0 | <1s | `templates/routing/finalize.skeleton.md` + `templates/routing/slots.js` changed: this check verifies the rendered command/skill surfaces (`commands/kaola-workflow-finalize.md` and the plugin mirrors) match the authoring templates — the render contract for the changed routing surfaces. Also green in the hoisted preamble. |
| 6 | `node scripts/test-generate-routing-surfaces.js` | 0 | 1s | Unit suite of the renderer that consumes the changed `templates/routing/slots.js` skeleton/slot set. Also green inside the claude chain (receipt step). |
| 7 | `node scripts/test-issue-1055-render-subtraction-oracle.js` | 0 | <1s | `scripts/fixtures/issue-1055-render-baseline.json` changed (62 lines): this oracle verifies the rendered surfaces against the committed render baseline. Also green inside the claude chain. |
| 8 | `node scripts/edition-sync.js --check` | 0 | <1s | The changed mirrors under `plugins/kaola-workflow`, `-gitlab`, `-gitea` (closure-contract, claim, sink-pr, active-folders, finalize command/SKILL): edition/mirror parity incl. committed kernel parity. Also green in the hoisted preamble and in the gitlab/gitea chains. |

Logs: `kaola-workflow/issue-1113/.cache/keepopen-final-chains/logs/focused-*.log`.

## Coverage by required-chain evidence (not rerun standalone, deliberately)

These suites cover changed surfaces and ran green **inside the required chain**, bound to
`1203f765` by the receipt, so they were not rerun standalone (avoiding full-suite reruns beyond
the required chain):

- `test-kernel-conformance.js` (claude chain step, 389.7s, exit 0) — covers
  `kaola-workflow-sink-pr.js` write-surface classification (append-only / outside-project-space).
- `test-finalize-door.js` (77.5s), `test-bundle-finalize.js` (15.2s),
  `test-issue-1089-mission-ledger.js` (4.2s), `test-forge-finalize-findings.js`,
  `test-forge-archive-scoping.js`, `test-forge-claim-rollback-scoping.js`,
  `test-forge-claim-reserved-project.js`, `test-validate-script-sync.js`,
  `validate-kaola-workflow-contracts.js` (codex), the gitlab/gitea contract validators and
  walkthroughs — all exit 0 in the receipt.
- The claude chain's `simulate-workflow-walkthrough.js --shard auto/12` is superseded by the full
  unsharded walkthrough (chain 1 above).

## Not run, and why

- Bare `npm test` as a separate command: the producer chain runner executed the identical four
  npm test chains (each receipt chain entry is `npm run test:kaola-workflow:<forge>`) plus the
  hoisted preamble, and wrote the required candidate-bound receipt; a separate bare `npm test`
  would duplicate those exact chains with no receipt.
- `npm run test:kaola-workflow:claude:full`, `npm run test:parallel`,
  `npm run test:kaola-workflow:editions`: unrelated full-suite reruns beyond the required chain.
  The unique additive suites from claude:full that touch the changed claim/sink surfaces
  (`test-claim-hardening.js`, `test-sink-merge.js`) were run focused instead (items 1–2 above).
  The additive-runtime edition roots (`.zcode` and siblings) carry no diff in
  `fe7e4443..1203f765`; the changed mirrors are the `plugins/*` roots, covered by items 5–8.
- Docs surfaces (`README.md`, `docs/*`, `CHANGELOG.md`, ADR 0031): no dedicated machine
  validation suite exists for prose docs; the rendered finalize command surface is covered by the
  routing render checks (items 5–7). Nothing to run beyond that.
- The new `explicit_singleton` keep-open PR publication path has **no dedicated in-repo test**
  (repo suites pin the refusal lane #336, the merge-sink keep-open lifecycle, the structural
  contract, and the rendered surfaces). Its positive-path acceptance tests live in the
  independent worker's cache-only artifacts (see the mission ledger: `.cache/keepopen-independent-pins*`),
  which are immutable and outside this dispatch. Everything machine-checkable in this tree was run.

## Waivers

None. No `--accept-known-red` was passed, no `accepted_red` appears anywhere in the receipt, and
every command above exited 0. No failure was observed at any stage; nothing was waived, skipped
silently, or retried.

## Postconditions

- Worktree: clean, HEAD unchanged at `1203f76510f5dff3418b18ae6b5db116e0c1899a`. No tracked file
  was dirtied by any check; nothing was committed, pushed, merged, or edited.
- Main checkout: no tracked-file changes; the only writes were the chain receipt (the runner's
  designed output) and this delivery directory (the declared report location).
- Mission ledger: not written (Host-owned). No claims, worktrees, branches, or ledger entries
  created. `workflow-state.md` untouched.
