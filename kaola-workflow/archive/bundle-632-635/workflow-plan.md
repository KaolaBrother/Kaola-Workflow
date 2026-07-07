# Workflow Plan — bundle-632-635

<!-- plan_hash: d0b20c5b90df181cf9c1e08b739b8d743603af278f6084119baf400bfeeb946b -->

## Meta
speculative_open_policy: auto
labels: area:scripts
validation_command: npm test

Bundle of two DISJOINT, diagnosed script fixes with genuinely-independent write areas, so the two
implement nodes are authored as an ANTICHAIN (a `parallel_safe` write lane group — the first lane-group
run since the #633 tracked-evidence-seeding fix shipped, main 3a4b4734). Both are DIAGNOSED build work
(each roadmap source carries an explicit P2 next-step + a prescribed fix direction), not a shape-first
investigation. Correctness is the driver (precedence #1): #632 is a fail-OPEN greenness bug (mirror the
established #618 `chains_empty` precedent) and #635 is the load-sensitive signal-death flake that has
forced `--accept-known-red …:635` waivers on every bundle this session — a HALF-fix (merely less flaky,
not deterministic) would keep the waivers coming, so a reasoning-tier reviewer AND a read-only
adversarial-verifier that empirically RUNS the harness under induced load ("genuinely load-insensitive,
or symptom-masked?") are non-redundant gates. #632 touches the edition trees ⇒ the #307 four-chain
obligation binds at finalize; #635's fix is CLAUDE-chain-only (see Plan Notes — the forge test files
carry NO signal-death assertions, correcting the dispatch brief's assumption).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-release-greenness | tdd-guide | — | scripts/kaola-workflow-release.js, plugins/kaola-workflow/scripts/kaola-workflow-release.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-release.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js, scripts/test-release.js | 5 | sequence | standard | — |
| n2-runchains-flake | implementer | — | scripts/test-run-chains.js | 1 | sequence | standard | test-harness reliability fix — the deliverable IS the test file; there is no separate behavioral unit-under-test, and correctness is proven by repeated load-insensitive passes, not a new failing unit test |
| n3-review | code-reviewer | n1-release-greenness, n2-runchains-flake | — | 1 | sequence | reasoning | — |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning | — |
| n5-docs | doc-updater | n3-review | docs/decisions/D-632-01.md | 1 | sequence | standard | — |
| n6-finalize | finalize | n4-adversary, n5-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Lane-group shaping (n1 ∥ n2), NOT scope-widening.** The two fixes touch genuinely-disjoint files:
  #632 lives in the `release.js` family (+ its `test-release.js` surface); #635 lives in
  `test-run-chains.js`. They are an ANTICHAIN (no dep edge between them) so the validator derives
  `parallel_safe` and the scheduler co-opens them as isolated per-leg worktrees BY DEFAULT
  (`parallelWritesDefaultOn`). They are EXACT-FILE-disjoint (all exact paths, no directory/glob token),
  so the antichain inferred-disjointness check (validator ~`:1595`) passes: no exact-file overlap, no
  barrier-invisible allowband collision (CHANGELOG.md is kept off both legs — on the finalize sink — and
  the ADR is on n5, a downstream serial node, not a co-leg), and no shared ancestor to trip the coarse
  arm. Both legs sharing the `scripts/` AREA is fine — the #593 coarse relaxation co-opens exact-file-
  disjoint legs by default. Parallelism is a means, not a goal (precedence #3): it is used here only
  because the work genuinely decomposes into disjoint files. NEVER hand-add `parallel_safe` — it is
  validator-derived.
- **n1-release-greenness (tdd-guide, standard) — #632 fail-OPEN greenness fix, RED-first.**
  `chainReceiptGreenness` (`scripts/kaola-workflow-release.js:249`) returns `{green:true}` when
  `receipt.chains` is an EMPTY array or a non-array (missing) — the loop body never runs, so "zero chains
  verified" is indistinguishable from "all chains green" (the SECOND fail-open consumer; the #618 fix
  only closed the plan-validator's `--finalize-check` gate, `plan-validator.js:2817`). Fix: insert an
  empty/missing-chains guard returning `{green:false, reason:'chains_empty'}` in the precedence slot
  BEFORE the red-chain loop and AFTER the `chains_stale` HEAD-bound check — exactly mirroring the #618
  precedence `chains_unverified > chains_stale > chains_empty > chains_red`. RED test in
  `scripts/test-release.js`: assert `chainReceiptGreenness` (or the `--verify` `chain_greenness`
  envelope) over `{chains:[]}` AND over a receipt with no `chains` key returns `green:false,
  reason:'chains_empty'` (both currently fail OPEN). `standard` because this is a mechanical fix against
  a written precedent; the reasoning gates below are the safety net.
- **VALUE-CALL RESOLUTION (#632 stale `--cut` comment) — resolved to informational-only, NOT escalated.**
  The line-364 comment `// … it blocks --cut` is FACTUALLY WRONG: `chainReceiptGreenness` is referenced
  ONLY inside `runVerify` (`:340`); `runCut` (`:378`) never reads greenness (verified: zero `green`
  references in the `runCut` body). The issue asks for an explicit call on whether `--cut` should GATE
  on greenness or stay informational. This is NOT genuinely ambiguous — the documented release
  sequencing runs the OFFLINE pre-cut check BEFORE the ONLINE `npm test` that produces the green receipt,
  so `--cut` cannot gate on a receipt that does not yet exist at cut time; gating it would break the
  documented flow. Resolution: KEEP `--cut` informational-only, fix the fail-open, and CORRECT the stale
  comment to state reality (greenness is surfaced as a `chain_warning` at `--verify`; `--cut` does not
  gate on it). This changes no user-owned contract (it preserves current behavior), so no consent-halt
  is warranted; `decision:ask` if the handoff records it is advisory metadata only. Recorded durably in
  `docs/decisions/D-632-01.md` (n5) so a future reader does not re-litigate "why doesn't `--cut` block
  on a red chain?"
- **Edition porting (#632 write set — all four move ATOMICALLY in n1).** `kaola-workflow-release.js` is
  NOT a GENERATED_AGGREGATOR (so `generated_port_split` does not fire), but it is a byte-identical
  claude↔codex twin (verified `diff -q` identical) + rename-normalized gitlab/gitea forge ports (all four
  carry the SAME bug at the same lines). They are one cohesive cross-edition change and must move
  together (semantic coupling; no file-count ceiling forces a split). The node edits the canonical root,
  mirrors the codex byte-twin, and hand-ports the two forge renames modulo forge nouns; keep the fix
  forge-neutral (no CLI-binary/brand tokens — the release script carries none today). `test-release.js`
  is a CLAUDE-ONLY root test (NOT in any sync family — verified) — no edition copies are declared.
- **n2-runchains-flake (implementer, standard) — #635 load-sensitive signal-death flake, CLAUDE-CHAIN-
  ONLY, ONE FILE.** `scripts/test-run-chains.js` T26/T27/T28 write a self-SIGKILL mock
  (`makeSelfKillScript`, `:72`) and race a real `process.kill(pid,'SIGKILL')` against the runner's own
  per-chain timer; under load the child is reaped as SIGTERM/timeout first, so a DIFFERENT subset of
  `signal==='SIGKILL'` / `timed_out===false` assertions fails each run. Fix per the roadmap next-step:
  make the signal-death delivery DETERMINISTIC — PREFER injecting the terminating signal via the runner's
  stub/mock seam (no real race), or FALL BACK to a generous settle window + assert on the killed-by-
  signal CLASS (`exitCode===1`) rather than the exact signal name where the harness cannot guarantee
  which signal wins. HARD SCOPE GUARD: do NOT change `kaola-workflow-run-chains.js`'s own
  signal→exitCode mapping (that is the CORRECT #618 fix, `run-chains.js:208`/`:296`) — only the TEST
  HARNESS's ability to reliably deliver its own signal. `implementer` (not tdd-guide) because there is
  no natural failing behavioral unit test — the artifact IS the test file and the pass criterion is
  load-insensitivity, verified by repeated runs (n4), not a new RED unit. `standard` tier; the reasoning
  adversary is the load-insensitivity safety net.
- **#635 scope correction (verified, do NOT expand to the forge test files).** The dispatch brief
  suggested the forge counterparts `test-gitlab-run-chains.js` / `test-gitea-run-chains.js` also carry
  the flake. They do NOT: both contain ONLY G1/G2/G3 (classifier-callable + determinate-red + transient-
  retry) assertions with `makeCounterMock` determinate exits — NO SIGKILL, NO self-kill, NO signal
  assertion (verified by reading both). The signal-death flake exists ONLY in the root
  `scripts/test-run-chains.js`, which is invoked ONLY by the CLAUDE chain (package.json `test-run-chains.js`;
  the root walkthrough does not run it). So #635's write set is exactly ONE file; touching the forge
  test files would be scope-widening with no fix content.
- **n3-review (code-reviewer, reasoning)** post-dominates BOTH code nodes n1 and n2 (G1). `reasoning`
  because the review must confirm: (a) #632's byte/rename edition parity across four `release.js`
  editions, (b) the `chains_empty` guard sits in the correct fail-closed precedence slot and the RED
  test genuinely fails pre-fix, (c) the stale-comment correction matches reality, and (d) #635's fix does
  NOT touch `run-chains.js`'s signal→exitCode mapping (the critical scope guard). Runs
  `validation_command` (`npm test` — the four chains, the #307 cross-edition obligation since #632
  touches `plugins/kaola-workflow{,-gitlab,-gitea}/`).
- **n4-adversary (adversarial-verifier, reasoning)** — read-only with Bash; the PRIMARY validator of
  #635's acceptance criterion (load-insensitivity), which a single four-chain pass cannot prove. RUNS
  `test-run-chains.js` REPEATEDLY under induced concurrency/load and asks "are T26/T27/T28 now genuinely
  deterministic, or merely less flaky (symptom-masked)?"; also confirms #632's greenness actually REFUSES
  `{chains:[]}` / missing-chains (not vacuously passing). Non-redundant with n3 (diff-reading) and with
  the one-pass suite. Sole unsatisfied dep is the n3 gate ⟹ speculative-open-eligible under `auto`;
  read-node keep-or-discard on a fail.
- **n5-docs (doc-updater, standard)** — writes ONLY the NEW decision record `docs/decisions/D-632-01.md`
  (D-632-01 is the next free id — no existing D-632/D-635 record), capturing the #632 value-call
  resolution (informational-only `--cut` + the fail-open close). No `docs/api.md`/`docs/conventions.md`
  touch: `release.js`'s `chainReceiptGreenness` reason enum is NOT documented there (verified — api.md
  documents only the plan-validator `--finalize-check` gate). No CHANGELOG here (protected file kept on
  the sink). #635 is a test-harness reliability fix needing no ADR (CHANGELOG suffices). Exactly-
  resolvable single-file write set, no protected file, sole dep is the n3 gate ⟹ speculative-open-
  eligible behind n3; disjoint sibling of n4 (n4 writes nothing).
- **n6-finalize (finalize)** — unique docs/state sink; writes only `CHANGELOG.md` (`[Unreleased]`, one
  entry covering both #632 fail-closed greenness and #635 flake determinism). Depends on BOTH
  n4-adversary and n5-docs so finalization is provably impossible until the adversarial load-insensitivity
  gate passes AND the ADR lands.
- **SELF-VALIDATING FINALIZE — try the UNWAIVED receipt FIRST.** Because #635 fixes the very flake that
  has forced `--accept-known-red …:635` on every prior bundle, if the fix is genuine the finalize
  four-chain pass should go LITERALLY green with NO `--accept-known-red` waiver. The orchestrator SHOULD
  attempt an unwaived `run-chains.js` receipt first at finalize; only fall back to a waiver (naming a
  DIFFERENT open issue, never :635) if a genuinely-unrelated red appears. A clean unwaived receipt is
  itself the strongest evidence #635 landed.
- **No security-reviewer (G2)**: labels carry no security sensitivity (`area:scripts`; both are
  bug/test fixes). **No main-session-gate (G3)**: acceptance is fully machine-checkable — the RED-first
  greenness test, the repeated load-insensitive harness runs, and the four chains; no GPU/visual/device/
  human-signoff hinge. **No knowledge-lookup**: every fix is confirmable in-repo (the #618 precedent at
  `plan-validator.js:2817`, the `chainReceiptGreenness` fail-open at `release.js:249`, the self-kill race
  at `test-run-chains.js:72`).

## Node Ledger

| id | status |
| --- | --- |
| n1-release-greenness | complete |
| n2-runchains-flake | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-release-greenness) | subagent-invoked | deferred_to_group | |
| implementer (n2-runchains-flake) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review ef9bf5590f2c | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary 7706bac8525d | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 05d6480c6a44 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 3c9fb433ec0c | |
