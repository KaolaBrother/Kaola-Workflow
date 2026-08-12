# Review B — the subtractions (adversarial, read-only)

VERDICT: FAIL — confirmed defects: 1 (LOW, comment-only: test-opencode-edition.js still describes the deleted strip transform in present tense). Every other subtraction check is clean, with measurements below.

Worktree reviewed: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-956-957-958-959-960-961-962` (branch `workflow/bundle-956-957-958-959-960-961-962`), full `git diff HEAD`: 27 files, +208/−842. All sweeps ran in the worktree (`pwd` verified after an early call that had silently run in main; that call's results were discarded and re-run).

## Confirmed defect

### R1 (LOW) — test-opencode-edition.js's A22 comments and failure messages now claim a strip mechanism this diff deleted

- **Failure class**: stale mechanism claim in a shipped test file (violates the stated convention: "specify the result, never the method — a mechanism claim rots and makes the agent wrong", CLAUDE.md Validation Policy / docs/conventions.md).
- **Primary anchor**: `scripts/test-opencode-edition.js:927-935` — A22 header: the Path Intent section "…are STRIPPED at generation time by transformCommandBody … This locks the strip-transform." After this diff there is no strip in `transformCommandBody` to lock (the three opencode strip blocks are deleted at `scripts/sync-opencode-edition.js` in this candidate).
- **Secondary anchors**: `scripts/test-opencode-edition.js:949-952` ("The strip is now keyed to the 'Path Intent' TITLE (sync-opencode-edition.js), and these catch any regression" — no such strip exists); `:515` (enumerates "Path Intent strip" among DECLARED transforms); assertion message texts at `:939`, `:941`, `:943`, `:948`, `:955` say "(stripped at generation…)".
- **Trigger**: any maintainer or agent who reads A22 post-merge to locate or modify the strip in `sync-opencode-edition.js`. Expected: comments describe live machinery. Observed: present-tense claims about deleted machinery.
- **Why nothing catches it**: no guard reads comments; both edition suites exit 0 regardless.
- **Why it is candidate-caused, not pre-existing**: the claims were true at HEAD; this diff deleted their referent. The candidate itself rewrote every OTHER comment stranded by its deletions — `scripts/kaola-workflow-claim.js:2586-2592` (barrier machinery "since deleted… USED to anchor"), `scripts/kaola-workflow-run-chains.js` (plan-validator → evaluateChainReceipt rewrites), `scripts/simulate-workflow-walkthrough.js:47-50`, `scripts/test-suite-registration.js:205-206` — so this block is the one it missed, not a policy choice.
- **Fix custody**: comment/message-only edit in a test file → tdd-guide. The A22 assertions themselves must NOT be touched — they are now the sole enforcement (see custody section below).

## Question-by-question results

### 1. Surviving consumers — all zeros, each with a positive control

All sweeps two-part (git grep -P over tracked; `find | xargs grep` over the six gitignored rendered trees, with per-tree file counts printed so an empty sweep is detectable: .opencode=3458, .opencode-gitea=19, .opencode-gitlab=19, .kimi=19, .kimi-gitea=19, .kimi-gitlab=19). Stem-searched, never basename.

- `run-chain-pool` (stem): tracked hits only in CHANGELOG.md, docs/audits/, kaola-workflow/.roadmap + ROADMAP.md, and archive — all prose about the deletion, no code consumer. Rendered trees: 0/6. Positive control (same pathspec, `test-shard-lib`): 6 live files.
- `fixtures-orphan-legality` stem AND all 8 exports (`ORPHAN_LEGALITY_*`, `CROSS_CHECK_EXPECTED`, `RUN_ORIENT_EXPECTED`, `TOPUP_INCOMPLETE_*`): tracked 0 outside prose, rendered 0/6. `find plugins -name '*orphan*'`: empty — the file had no forge-tree twins, so the deleted install-manifest comment line named a per-forge exclusion that no longer excludes anything; correct to die with it.
- Removed sync symbols, searched per the both-files-define-it rule: `OUT_SKILLS_DIR`, `OUT_HOOKS_DIR` (was defined in BOTH sync scripts — both definitions deleted, so a zero is now the true answer), `OUT_PLUGINS_DIR`, `DEFAULT_STANDARD_MODEL`, `DEFAULT_REASONING_MODEL`: tracked 0, rendered 0/6. Positive control: `OUT_AGENT_DIR` (kept sibling export) → 2 files incl. a live test consumer (`scripts/test-opencode-edition.js`).
- Homonym trap checked and rejected: `resolveTimeoutMs`/`resolveConcurrency` hits in `scripts/kaola-workflow-run-chains.js:1317`/`:1337` and its three plugin copies are run-chains' OWN independent functions (T12-tested in `scripts/test-run-chains.js:425-441`), not the pool's — not consumers.

### 2. Test custody — clean, and A22 is NOT vacuous

- **test-parallel.js arithmetic**: HEAD self-test = 36 assertions passed (run live in the main tree); worktree = 23 passed, 0 failed (exit 0). Delta = 13 = exactly the f6(4)+f7(1)+f8(7)+f9(1) pool assertions. Sections a–e and f1–f5 are byte-untouched by the diff (hunks bound at the (f) heading comment, the `require('./run-chain-pool')` line, and the f6–f9 block); no label renumbered, no assertion loosened. The (f) heading rewrite ("Within-chain step pool + scenario sharding" → "Scenario sharding") is accurate. `shardLib` is still consumed by f1–f5. Chain wiring intact: `test-parallel.js --self-test` remains in both claude chains (package.json:40, :46).
- **A22 verdict: meaningful, not vacuous — it got MORE load-bearing.** Evidence: (a) canonical sources carry none of the stripped patterns — `grep -rn 'Path Intent|KAOLA_ENABLE_ADAPTIVE|Step 0a-1|Codex hooks note' commands/ templates/routing/` → exit 1 — so the strips were dead code and removing them changes generated bytes not at all; (b) with the strip blocks deleted, `transformCommandBody` passes any such content straight through to output, so a future canonical reintroduction of the Path Intent section / `KAOLA_ENABLE_ADAPTIVE` / `Step 0a-1` / Branch A-B prose would now LAND on `.opencode/command/workflow-next.md` and red A22 — previously the strip would have silently eaten it and A22 could only fail if the strip's title-match missed. A22 went from fail-loud net behind a mechanism to the sole enforcement of the adaptive-only-default property. Deliberately not editing it was custody-correct; the residue is R1's comments only. `test-kimi-edition.js` carries no strip-related pins at all (grep exit 1), so the kimi strip removals strand no assertion.
- **No test edited to accommodate a deletion.** Test files in the diff: `test-parallel.js` (pool coverage dies WITH the pool — the rule's legal case) and `test-suite-registration.js` (comment-only hunk, lines 205-206; no assertion changed — and the comment edit is accurate, since the dead-table disclaimer's `COST_HINT` referent died with the pool). `test-opencode-edition.js` / `test-kimi-edition.js`: untouched, both exit 0.

### 3. Enumeration and manifest guards — none broken

- `kaola-workflow-install-manifest.js`: explicit allowlist (`SUPPORT_SCRIPTS`, 17 entries) — neither deleted file was ever in it; the diff is comment-only.
- `scripts/validate-script-sync.js`: explicit `COMMON_SCRIPTS` + `BYTE_IDENTICAL_GROUPS` + `KERNEL_COPIES` rosters — neither deleted file appears (grep: only `kaola-workflow-install-manifest.js` at :66). Exit 0.
- `scripts/test-suite-registration.js` (referenced-script existence sweep across every `node scripts/*.js` invocation): exit 0 — zero dangling references to either deleted file survive.
- package.json chains: no pool/fixtures references; code-tree hash (adaptive-schema) enumerates the tree at runtime, no fixed roster; `test-spawn-classification.js`'s per-file table carries no entry for either deleted file (covered by the stem sweeps' zeros).

### 4. Install-manifest byte pair — identical and enforced

`cmp scripts/kaola-workflow-install-manifest.js plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js` → BYTE-IDENTICAL, exit 0. The pairing is enforced: `kaola-workflow-install-manifest.js` is in `validate-script-sync.js` `COMMON_SCRIPTS` (:66), which runs first in every chain; `validate-script-sync.js` exit 0. gitlab/gitea trees carry no third/fourth copy (ls count 0), so the pair is the whole family.

### 5. S4 — no caller lost; commandSources survives

- Tracked sweep for `--commands-dir` / `--forges`: exit 1 (zero) everywhere — installers, npm scripts, edition sync, generate-routing-surfaces, docs. Rendered trees 0/6. Positive control (same method, surviving modes `--scripts-dir`/`--out-suffix`): install-kimi.sh (2), install-opencode.sh (2), runtime-edition-forge.js (5). The only two shell callers invoke exactly the surviving modes (`install-kimi.sh:113,117`, `install-opencode.sh:143,147`).
- `commandSources` the FUNCTION: defined `scripts/runtime-edition-forge.js:101`, exported `:150`, consumed by `sync-kimi-edition.js:115,119` and `sync-opencode-edition.js:160,164`. Both edition suites exit 0.
- `FORGES` was not orphaned by the `--forges` mode removal: still used at `:49-50` (assertKnownForge) and exported `:142`. `path` still used (:37, :78-79, :105-106). Module `require()`s clean.

### 6. Dead-on-arrival leftovers

- `KAOLA_TEST_TIMEOUT_SCALE`: sole surviving reference is the walkthrough reader itself (`scripts/simulate-workflow-walkthrough.js:47,51`); nothing sets it anywhere (tracked 0 elsewhere, rendered 0/6) — so the rewritten comment's claim "Nothing exports that variable since the within-chain step pool was retired" is TRUE, and the fail-open keep is coherent: scale is permanently 1, original bound holds, exactly as the comment and CHANGELOG state. Note run-chains' chain-level concurrency never exported the scale even before #960, so no widening was lost there.
- No orphaned imports or unreachable error paths found in any edited file; docs carry no live mention of the pool ("step pool"/"chain pool"/"within-chain" in live docs: 0; `test-parallel-batch.js` mentions sit only in dated decisions/investigations records, deleted in prior commits, retained by stated policy).
- The one incoherent leftover is R1 above.

### 7. Should have died and didn't

Nothing orphaned BY these deletions. Two pre-existing consumer-less symbols found while checking — both already dead at HEAD, so not candidate-caused and not admitted: `test-shard-lib.js:127` `runScenario` (exported, zero importers at HEAD and now; TIMING_ON instrumentation hook) and `test-parallel.js:195` `makeShimSpawnFn` (defined, never called, at HEAD and now). Recorded for the orchestrator as out-of-scope observations only. `test-parallel.js` itself is NOT equally dead by the S1 criterion: it has a registered CLI (`test:parallel`, package.json:44) and its self-test is wired into both claude chains.

## Validation runs (real exit codes, none gated on a pipe)

- `node scripts/test-parallel.js --self-test` → exit 0 (23 passed, 0 failed; HEAD baseline 36)
- `node scripts/validate-script-sync.js` → exit 0
- `node scripts/test-suite-registration.js` → exit 0
- `node scripts/test-opencode-edition.js` → exit 0
- `node scripts/test-kimi-edition.js` → exit 0

finding: id=R1 scope=in_scope action=fix status=open severity=low fix_role=tdd-guide rationale=test-opencode-edition.js A22 comments and failure messages (927-935, 949-952, 515, message texts) still claim in present tense a strip transform this diff deleted from sync-opencode-edition.js; comment-only fix, assertions must stay untouched as they are now the sole enforcement

verdict: fail
findings_blocking: 1

review_conclusion: Every subtraction was re-verified consumer-clean with stem searches and positive controls across the tracked tree and all six rendered edition trees; test custody holds exactly (36 to 23 assertions, delta precisely the 13 pool pins; A22 is not vacuous but is now the sole, still-falsifiable enforcement of the adaptive-only property); all enumeration, manifest, byte-pair and registration guards pass green; the single admitted defect is low-severity comment staleness in test-opencode-edition.js describing the deleted strip mechanism.
