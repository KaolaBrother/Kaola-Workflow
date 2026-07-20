# Workflow Plan — issue #725 (epic Phase C: guard dedup)

<!-- plan_hash: b3342240ee6e72feb892915ac45a0d984ebd6920f09cb09fb073f4bd25904748 -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
validation_command: npm test
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n7-code-certify
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Plan Notes

Phase C ("guard dedup") of epic #725, a FRESH epoch-1 adaptive run claiming issue #725. Phases A and B
already shipped on main (run base `0a9f652a`); this run lands Phase C ONLY and leaves #725 OPEN
(Phases D and E remain). Three genuinely-independent guard-dedup workstreams, each with its own
single-writer code-reviewer gate, serialized as a chain under one tail common certifier:

- WS1 (n1) — `edition-sync.js --check` drops the cosmetic `checkMirrors` re-check of
  COMMON_SCRIPTS / BYTE_IDENTICAL_GROUPS (validate-script-sync is the authoritative owner of that
  check); the unique 12-aggregator-port checking is preserved. Removal + obsolete-test removal, so
  `implementer`.
- WS2 (n3) — the `adaptive-node.js` guard-prologue Layer-1 integrity check replaces the per-mutation
  `--resume-check` subprocess spawn with an in-process recompute of the plan bytes' `plan_hash` (via
  the plan-validator's already-exported `computePlanHash`) compared against the frozen embedded marker;
  a match skips the subprocess, a mismatch/error falls back to the full `--resume-check`. L2/L3 and the
  crash-repair paths are unchanged. A RED-first tamper test proves a tampered plan still refuses
  `plan_integrity_failed` before mutation, so `tdd-guide`.
- WS3 (n5) — delete the two advisory hooks (`kaola-workflow-pre-commit.sh`,
  `kaola-workflow-write-lane.sh`) per the epic's Decision 1, across all four editions, plus their
  hooks.json PreToolUse entries, install.sh cleanup, the install-manifest SUPPORT_HOOKS entries, and
  every four-chain assertion that names them. The surviving `compact-context` +
  `subagent-dispatch-log` hooks are untouched. Mechanical deletion, so `implementer`.

Shape rationale (single-writer gates per leg; NO bundle-wide gate over an antichain of independent
writers): the three producers are DELIBERATELY chained (n1 -> n2 -> n3 -> n4 -> n5), never an antichain
under a shared wall. A common certifier post-dominating an antichain of independent writers cannot be
single-node-repaired on a finding (`uniqueMaximalReviewProducer` finds no unique graph-maximal producer
-> `repair_requires_replan`); chaining gives each per-leg reviewer a scoped surface whose sole covered
writer is graph-maximal, so a leg-local finding reopens that leg IN PLACE. n2 (scoped to n1) and n4
(scoped to n3) are the per-leg change gates; n7-code-certify is the tail common CODE certifier wall —
it post-dominates every code producer (n1/n3/n5) via the chain and reviews the full accumulated frontier
plus the n6 docs delta. Code-reviewer walls, NOT adversarial-verifier change gates: schema-2
adversarial change-gate findings currently settle empty (open defect), so per the interim guidance the
review gates are code-reviewers.

Sensitivity/editions: no Phase C write-set path matches the sensitive-path patterns and no sensitive
label is present, so `security_certifier: none` and no G2 node. The diff touches the edition trees (the
four adaptive-node ports + the gitlab/gitea plugin hook/validator/walkthrough edits), so finalization
requires all four chains green — the Phase-B diff-scoped run-chains self-selects all four at finalize;
`validation_command: npm test` is the complete gate. opencode/kimi are ADDITIVE runtimes (not wired into
npm test / edition-sync / install.sh) and are INTENTIONALLY NOT re-synced in Phase C — their hook copies,
sync-script hook lists, and edition test assertions reconcile at the Phase D cross-edition boundary per
the epic. No new decision record: the adaptive-only direction and the hook-deletion Decision 1 are
already documented by D-725-01 (existing) and the epic issue; Phase C updates CHANGELOG + affected live docs only.

Cross-edition sync groups the writers must move atomically: n3 edits the canonical
`scripts/kaola-workflow-adaptive-node.js` and regenerates the codex byte twin + the gitlab/gitea
rename-normalized ports (its canonical spec is the full accumulated root diff vs `0a9f652a`, mirrored in
every hunk modulo forge nouns); `validate-workflow-contracts.js` and its
`plugins/kaola-workflow/scripts/` codex twin stay byte-identical; the canonical
`simulate-workflow-walkthrough.js` and its codex-plugin `simulate-kaola-workflow-walkthrough.js` twin
stay byte-identical; the install-manifest root + codex twin stay byte-identical. Traps: do NOT touch
`kaola-workflow-adaptive-schema.js` (its dormant write-lane resolution machinery becomes dead code but
removing it is out of Phase C scope and it is the byte-identical x4 anchor); do NOT touch the surviving
`compact-context` / `subagent-dispatch-log` hooks or their assertions; keep CLAUDE.md under 200 lines.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-edition-sync-dedup | implementer | — | scripts/edition-sync.js, scripts/test-edition-sync.js | 2 | sequence | — | standard | — | — | — | — | — | — |
| n2-review-edition-sync | code-reviewer | n1-edition-sync-dedup | — | 1 | sequence | — | standard | — | — | the edition-sync --check guard dedup is correct and self-contained: runCheck no longer re-checks the COMMON_SCRIPTS / BYTE_IDENTICAL_GROUPS mirrors (that authoritative check stays owned by validate-script-sync, so no two mechanisms check the same bytes), the unique GENERATED_AGGREGATORS forge-port parity check is preserved intact, the now-orphaned checkMirrors function + its module export are removed with no dangling import and no other caller, the runCheck success message no longer claims a COMMON_SCRIPTS-mirror count it no longer verifies, test-edition-sync.js drops the T9 coverage of the removed re-check and updates its edition-sync import accordingly, and edition-sync --check plus validate-script-sync both stay green with the forge-aggregator parity fully retained | the n1-edition-sync-dedup diff vs run base 0a9f652a — scripts/edition-sync.js (checkMirrors call + function + export removed, success message updated, aggregator-port check preserved) and scripts/test-edition-sync.js (T9 removed, import updated) | sequence | — |
| n3-adaptive-node-hashguard | tdd-guide | n2-review-edition-sync | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | — | reasoning | — | — | — | — | — | — |
| n4-review-hashguard | code-reviewer | n3-adaptive-node-hashguard | — | 1 | sequence | — | reasoning | — | — | the adaptive-node guard-prologue Layer-1 integrity fast-path is correct and preserves per-mutation tamper refusal: the per-mutation --resume-check subprocess spawn is replaced by an in-process recompute of the plan bytes' plan_hash (via the plan-validator's exported computePlanHash) compared against the frozen embedded plan_hash marker, a match skips the subprocess and a mismatch OR any error falls back to the full --resume-check exactly as before, the recompute covers the SAME hash-covered bytes computePlanHash covers (a narrowed region would silently weaken tamper detection), Layer 2 (consent-halt fence) and Layer 3 (live-coordination) are byte-unchanged, the crash-repair path (reconcile-running-set) still runs the full resume-check, a post-freeze-tampered frozen plan STILL refuses plan_integrity_failed with ZERO mutation before every mutating opener (proven RED-first in test-adaptive-node.js), a matching-hash plan takes the fast path and does NOT spawn the subprocess (the dedup is real), and the four adaptive-node editions stay in exact parity (canonical + codex byte twin + gitlab/gitea rename-normalized ports) | the n3-adaptive-node-hashguard diff vs run base 0a9f652a — the four adaptive-node editions' mutationGuardPrologue L1 and the new tamper + fast-path unit coverage in scripts/test-adaptive-node.js, reviewed for hash-region correctness and fallback completeness and cross-edition parity | sequence | — |
| n5-hook-deletion | implementer | n4-review-hashguard | hooks/kaola-workflow-pre-commit.sh, hooks/kaola-workflow-write-lane.sh, plugins/kaola-workflow/hooks/kaola-workflow-pre-commit.sh, plugins/kaola-workflow/hooks/kaola-workflow-write-lane.sh, plugins/kaola-workflow-gitlab/hooks/kaola-workflow-pre-commit.sh, plugins/kaola-workflow-gitlab/hooks/kaola-workflow-write-lane.sh, plugins/kaola-workflow-gitea/hooks/kaola-workflow-pre-commit.sh, plugins/kaola-workflow-gitea/hooks/kaola-workflow-write-lane.sh, hooks/hooks.json, plugins/kaola-workflow/config/hooks.json, plugins/kaola-workflow-gitlab/hooks/hooks.json, plugins/kaola-workflow-gitlab/config/hooks.json, plugins/kaola-workflow-gitea/hooks/hooks.json, plugins/kaola-workflow-gitea/config/hooks.json, scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/validate-script-sync.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js, plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js, scripts/test-install-model-rendering.js, install.sh | 28 | sequence | — | standard | — | — | — | — | — | — |
| n6-docs | doc-updater | n5-hook-deletion | README.md, docs/api.md, docs/architecture.md, docs/conventions.md, docs/workflow-state-contract.md, CLAUDE.md, CHANGELOG.md | 7 | sequence | — | standard | — | — | — | — | — | — |
| n7-code-certify | code-reviewer | n6-docs | — | 1 | sequence | — | reasoning | — | — | the full Phase C candidate is correct and finalize-gate-safe against AC-C: (dedup) no two mechanisms check the same bytes — edition-sync --check no longer duplicates validate-script-sync's COMMON_SCRIPTS/byte-group check, and the adaptive-node L1 no longer spawns a --resume-check subprocess on the hash-match fast-path; (integrity) per-mutation plan integrity is preserved with the tamper test red-to-green and a tampered plan still refusing plan_integrity_failed before mutation; (hooks) both advisory hooks (pre-commit, write-lane) are deleted across all four editions together with their six hooks.json PreToolUse entries, the install.sh lingering-copy cleanup, the two install-manifest SUPPORT_HOOKS entries, and every four-chain assertion that named them (validate-workflow-contracts + its codex byte twin, validate-kaola-workflow-contracts, the gitlab/gitea contract validators, validate-script-sync's two hook byte-copy groups, the four edition walkthroughs' hook test sections + the hook-id-set assertion, and test-install-model-rendering's expected id set), so all four edition chains stay green; the surviving compact-context + subagent-dispatch-log hooks and their assertions are untouched; (docs) the README/api/architecture/conventions/workflow-state-contract/CLAUDE.md delta removes only the two deleted hooks' mentions with no provenance leakage and CLAUDE.md stays under 200 lines, and CHANGELOG documents the guard dedup + hook deletion under [Unreleased]; (scope) opencode/kimi are correctly NOT re-synced here; and all four edition chains are green over the final tree | the full accumulated Phase C candidate vs run base 0a9f652a across all four editions — edition-sync dedup (n1), the adaptive-node L1 integrity fast-path + tamper test (n3), the two-hook deletion and its full wiring/assertion/manifest surface (n5), and the documentation delta (n6) — reviewed against AC-C and the four-chain-green evidence | sequence | — |
| n8-finalize | finalize | n7-code-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### n1-edition-sync-dedup

Drop the cosmetic `checkMirrors` re-check from `edition-sync.js --check` (WS1). `runCheck` (around
scripts/edition-sync.js:155) currently calls `checkMirrors(REPO)` (defined ~:137) which re-verifies the
COMMON_SCRIPTS canonical<->codex mirrors and BYTE_IDENTICAL_GROUPS copies — the header itself documents
this as a cosmetic `--check`/`--write` symmetry, NOT a live hole, because `validate-script-sync.js`
catches the same drift in-chain and is authoritative. Remove the `checkMirrors(REPO)` call and its
`missing`/`drift` push loop from `runCheck`; KEEP the GENERATED_AGGREGATORS forge-port parity loop
intact (that unique 12-port check is the whole point of edition-sync --check). Remove the now-orphaned
`checkMirrors` function definition, its entry in `module.exports` (~:258), and the unused
`COMMON_SCRIPTS` / `BYTE_IDENTICAL_GROUPS` / `checkByteIdenticalGroup` imports if they become unused
after the removal (verify with a grep — if `renameSet`/`renderForgePort` still need part of the require,
keep only what is used). Update the `runCheck` success `console.log` (~:181-183) so it no longer claims a
`COMMON_SCRIPTS.length` mirror count and `BYTE_IDENTICAL_GROUPS.length` group count it no longer
verifies — report only the forge-aggregator-port parity it still checks.

In `scripts/test-edition-sync.js`, remove test T9 (~:175-220) which exists ONLY to prove the removed
`checkMirrors` re-check catches COMMON_SCRIPTS/byte-group drift, and update the top-of-file
`require('./edition-sync')` destructure (:9) to drop `checkMirrors`. Do not touch the other
edition-sync tests (forge-aggregator parity is still checked and still tested).

non_tdd_reason: this is a dedup REMOVAL of a redundant cosmetic re-check plus the removal of the single
test that only covered that re-check — there is no new behavior to write a failing test for; correctness
is that `edition-sync --check` and `validate-script-sync` both stay green with forge-aggregator parity
fully retained and no same-bytes double-check remaining. Verify: `node scripts/edition-sync.js --check`
and `node scripts/test-edition-sync.js` green.

### n2-review-edition-sync

Per-leg change gate for n1 (scoped single-writer gate). Read n1's evidence file first. Verify against
the n1 diff only (gate_surface): the COMMON_SCRIPTS/byte-group re-check is gone from runCheck, the
forge-aggregator-port parity loop is untouched, checkMirrors is fully removed (function + export +
import) with no dangling reference, the success message is honest, T9 is removed and the test import is
fixed, and both edition-sync --check and validate-script-sync stay green. Record a gate verdict, not
implementation advice; zero findings is valid. A finding reopens n1 in place (n1 is the sole writer this
gate covers).

### n3-adaptive-node-hashguard

Replace the adaptive-node guard-prologue Layer-1 per-mutation `--resume-check` subprocess with an
in-process plan-hash compare (WS2). `mutationGuardPrologue` (scripts/kaola-workflow-adaptive-node.js
~:8315, the L1 block ~:8324-8330) currently does, when `cfg.integrity`:
`shell(validatorPath, [planPath, '--resume-check', '--json'])` and refuses `plan_integrity_failed` on a
non-zero/`ok!==true` result. Change L1 to: read the plan bytes, recompute the plan_hash in-process via
the plan-validator's exported `computePlanHash` (already `require`d elsewhere in this file; see the
existing `require('./kaola-workflow-plan-validator')` sites and the local `planHashFromContent` marker
extractor ~:2992), and compare the recompute against the frozen embedded `<!-- plan_hash: ... -->`
marker. On a MATCH, the plan is untampered — skip the subprocess (the dedup). On a MISMATCH, a missing
marker, or ANY error (read failure, computePlanHash throw), FALL BACK to the full
`shell(validatorPath, [planPath, '--resume-check', '--json'])` and refuse `plan_integrity_failed`
exactly as today. The in-process recompute MUST cover the same hash-covered bytes computePlanHash covers
— do not re-implement a narrower hash; call computePlanHash so the two never drift. Leave L2 (consent
halt) and L3 (live-coordination) byte-unchanged. Leave the crash-repair paths (reconcile-running-set,
mirror-project's own resume-check ~:5324) unchanged — full resume-check still runs there.

RED-first tests in `scripts/test-adaptive-node.js`: (a) a post-freeze-tampered plan (mutate a
declared_write_set AFTER freeze so the recomputed hash != the embedded marker) still refuses
`plan_integrity_failed` with zero mutation through a mutating opener (open-next/open-ready) — this is the
AC-C tamper test and must be RED against a naive fast-path that trusts the marker without recomputing;
(b) a matching-hash (untampered) frozen plan takes the fast path and does NOT spawn the validator
subprocess for L1 (assert the dedup — e.g. via a shell spy / call count) while still succeeding. The
end-to-end walkthrough already carries the #387 tamper assertion
(simulate-workflow-walkthrough.js ~:1540, open-ready over a tampered plan -> plan_integrity_failed) —
your change MUST keep it green; do not edit the walkthrough (it belongs to n5's write set).

Cross-edition (HARD): edit the canonical `scripts/kaola-workflow-adaptive-node.js`, then regenerate the
codex byte twin (`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`) and the gitlab/gitea
rename-normalized ports (`kaola-{gitlab,gitea}-workflow-adaptive-node.js`) — the canonical spec is the
full accumulated root diff vs 0a9f652a mirrored in every hunk modulo forge nouns. Keep
`validate-script-sync` + `edition-sync --check` green (adaptive-node is a GENERATED_AGGREGATOR family).
Verify: `node scripts/test-adaptive-node.js` and `node scripts/simulate-workflow-walkthrough.js` green;
all four chains at the certifier/finalize.

### n4-review-hashguard

Per-leg change gate for n3 (scoped single-writer gate; reasoning tier — this is the correctness-critical
per-mutation integrity guard). Read n3's evidence first. Verify by RE-EXECUTION, not prose: confirm the
tamper test is genuinely RED-first (a fast-path that trusts the marker without recomputing lets a
tampered plan through) and GREEN after; confirm a matching-hash plan skips the subprocess (the dedup is
real) yet still succeeds; confirm the in-process recompute uses computePlanHash over the SAME bytes (a
narrowed hash region would silently weaken tamper detection — this is the primary hazard to hunt);
confirm the mismatch/error fallback reaches the full --resume-check and still refuses
`plan_integrity_failed` before any mutation; confirm L2/L3 and the reconcile-running-set path are
unchanged; confirm the four adaptive-node editions are in exact parity and the walkthrough #387
assertion stays green. Record a gate verdict; a finding reopens n3 in place (n3 is graph-maximal in this
gate's covered set).

### n5-hook-deletion

Delete the two advisory hooks and remove every reference to them across the four editions (WS3, Decision
1). DELETE (8 files): the `kaola-workflow-pre-commit.sh` and `kaola-workflow-write-lane.sh` scripts under
`hooks/`, `plugins/kaola-workflow/hooks/`, `plugins/kaola-workflow-gitlab/hooks/`, and
`plugins/kaola-workflow-gitea/hooks/`. EDIT the six hooks.json (`hooks/hooks.json`, the github
`plugins/kaola-workflow/config/hooks.json`, and both the `hooks/hooks.json` + `config/hooks.json` under
gitlab and gitea): remove the two `PreToolUse` entries (`kaola-workflow:pre-commit-guard` matcher Bash,
and `kaola-workflow:write-lane` matcher Write|Edit); KEEP the `SessionStart` compact-context and the
`SubagentStart` subagent-dispatch-log entries. EDIT the install-manifest (root + codex twin
`plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js`, kept byte-identical): drop
`'kaola-workflow-pre-commit.sh'` and `'kaola-workflow-write-lane.sh'` from `SUPPORT_HOOKS` (~:90-94),
leaving only `'kaola-workflow-subagent-dispatch-log.sh'`. EDIT install.sh: add `rm -f` lingering-copy
cleanup for the two now-unlisted hooks in `$SUPPORT_HOOKS_DIR` (mirror the existing phantom-advisor
`rm -f` precedent ~:619) so a prior install's copies are swept; no other install.sh change is needed
(SUPPORT_HOOK_NAMES is single-sourced from the manifest).

EDIT the four-chain assertions that name the two hooks: `scripts/validate-workflow-contracts.js` and its
byte-identical codex twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (drop the
pre-commit `assertIncludes` ~:274/287 and the write-lane block ~:288-292/308 — keep them byte-identical);
`scripts/validate-kaola-workflow-contracts.js` (drop the pre-commit assert ~:287);
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` and the gitea twin
(drop their hook asserts); `scripts/validate-script-sync.js` (remove the `pre-commit hook copies` and
`write-lane hook copies` byte-copy groups ~:96-101/168-174). EDIT the four edition walkthroughs
(`scripts/simulate-workflow-walkthrough.js`; the codex twin
`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`, kept byte-identical with the
canonical; and `simulate-gitlab-workflow-walkthrough.js` + `simulate-gitea-workflow-walkthrough.js`):
remove the pre-commit hook test section (canonical ~:44/578-581), the write-lane harness (~:714-852),
and update the hook-id-set assertion (~:680-689) to the surviving set
`['kaola-workflow:compact-context', 'kaola-workflow:subagent-dispatch-log']`. EDIT
`scripts/test-install-model-rendering.js` (~:3407): drop `kaola-workflow:pre-commit-guard` and
`kaola-workflow:write-lane` from the expected id set.

Traps: do NOT touch `kaola-workflow-adaptive-schema.js` (its write-lane resolution machinery /
`KAOLA_LANE_CONTAINMENT` becomes dead code, but removing it is out of Phase C scope and it is the
byte-identical x4 anchor). Do NOT touch the surviving compact-context / subagent-dispatch-log hooks or
their assertions. Do NOT re-sync or edit opencode/kimi (sync-opencode-edition.js / sync-kimi-edition.js /
test-opencode-edition.js / test-kimi-edition.js still reference the hook names — that reconciles at Phase
D per the epic; those suites are not in npm test). If any four-chain contract-validator or forge-test
needle that this deletion trips is NOT in the declared write set, surface it as a write-set gap rather
than widening scope silently.

non_tdd_reason: mechanical deletion of two dormant advisory hooks and removal of their wiring/assertions
across four editions — no new behavior to write a failing test for; correctness is the four edition
chains staying green with the hook references removed. Verify: `npm test` (all four chains — this is a
cross-edition diff) green over the deletion.

### n6-docs

Update the live docs to reflect the hook deletion and record Phase C, keeping prose accurate and
provenance-free. Remove ONLY the `kaola-workflow-pre-commit.sh` / `kaola-workflow-write-lane.sh` (and the
`pre-commit`/`write-lane`) mentions from README.md (7 hits), docs/api.md (4), docs/architecture.md (1),
docs/conventions.md (1), docs/workflow-state-contract.md (1), and CLAUDE.md (line ~117: change
"Background hooks (pre-commit, subagent-dispatch-log) are advisory" to name only the surviving
subagent-dispatch-log hook). KEEP every reference to the surviving compact-context +
subagent-dispatch-log hooks. Add a CHANGELOG.md entry under [Unreleased] documenting Phase C (guard
dedup: edition-sync --check drops the redundant COMMON_SCRIPTS/byte-group re-check; adaptive-node L1
integrity uses an in-process plan_hash fast-path; the two advisory hooks are removed). No provenance
(issue refs / ADR ids) in any prompt/doc surface per docs/conventions.md; do not author a new decision
record (D-725-01 (existing) + the epic issue already cover the direction). Keep CLAUDE.md under 200 lines. Read the
n5 evidence to describe exactly what shipped. Do not restate deleted-hook behavior as if it still exists.

### n7-code-certify

The named schema-2 common CODE certifier wall for Phase C — post-dominates every code producer
(n1/n3/n5) via the chain and reviews the full accumulated frontier plus the n6 docs delta. Read the n1,
n3, n5, n6 evidence files and the issue #725 Phase C spec / AC-C before reviewing. Verify against the
full candidate diff vs run base 0a9f652a across all four editions, re-executing where practical: (dedup)
edition-sync --check no longer duplicates validate-script-sync's COMMON_SCRIPTS/byte-group check and the
adaptive-node L1 skips the subprocess on a hash match — no two mechanisms check the same bytes; (integrity)
the tamper test is red->green and a tampered plan still refuses plan_integrity_failed before mutation, with
the in-process recompute covering the full computePlanHash region; (hooks) both hooks are gone across all
four editions with their hooks.json entries, install.sh cleanup, manifest SUPPORT_HOOKS, and EVERY
four-chain assertion updated, the surviving two hooks untouched; (docs) the doc delta removes only the two
deleted hooks' mentions, no provenance, CLAUDE.md < 200 lines, CHANGELOG records the phase; (scope)
opencode/kimi correctly NOT re-synced; (green) all four edition chains green over the final tree. Record a
gate verdict, not implementation advice; zero findings is valid; admit only concrete candidate-caused
defects with an exact trigger. A finding whose owner is n5 (graph-maximal) reopens n5 in place; a finding
localized to an upstream leg that the per-leg gate missed routes to that owner.

### n8-finalize

Unique sink, run main-session-direct. This is a PARTIAL close of epic #725 (Phase C of A-E) — leave #725
OPEN and the workflow:in-progress label in place (Phases D and E remain; do NOT close #718 or any other
issue). Confirm the named code certifier (n7-code-certify) is complete and fresh. The candidate touches
the edition trees, so four-chain verification is required — run the Meta validation_command (`npm test`,
the four chains) over the final tree; the Phase-B diff-scoped run-chains self-selects all four chains for
this run. Generate the sink chain receipt with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` (this host SIGKILLs a
concurrent run-chains). Sink the Phase-C feature commit from `workflow/issue-725`: feature commit ->
serial run-chains receipt (--project) -> cmdFinalize --keep-worktree/--keep-open -> push branch ->
sink-merge --sink from the MAIN root. Do NOT put close/fix/resolve keywords next to `#725` in any commit
body or push (a closing keyword auto-closes the epic on push). Verify #725 stays OPEN after the push.
opencode/kimi are NOT re-synced or run in Phase C (deferred to Phase D). Write no tracked file from this
node beyond the sink transaction's own bookkeeping.

## Node Ledger

| id | status |
| --- | --- |
| n1-edition-sync-dedup | complete |
| n2-review-edition-sync | complete |
| n3-adaptive-node-hashguard | complete |
| n4-review-hashguard | complete |
| n5-hook-deletion | complete |
| n6-docs | complete |
| n7-code-certify | pending |
| n8-finalize | pending |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-edition-sync-dedup) | subagent-invoked | evidence-binding: n1-edition-sync-dedup 2e53c1a30463 | |
| code-reviewer (n2-review-edition-sync) | subagent-invoked | evidence-binding: n2-review-edition-sync 619d1e44ad82 | |
| tdd-guide (n3-adaptive-node-hashguard) | subagent-invoked | evidence-binding: n3-adaptive-node-hashguard 71c22497046c | |
| code-reviewer (n4-review-hashguard) | subagent-invoked | evidence-binding: n4-review-hashguard 7864d7df420e | |
| implementer (n5-hook-deletion) | subagent-invoked | evidence-binding: n5-hook-deletion bc92adfeddf3 | |
| doc-updater (n6-docs) | subagent-invoked | evidence-binding: n6-docs 5bc22f0ddcd8 | |
| code-reviewer (n7-code-certify) | pending | | |
| finalize (n8-finalize) | pending | | |
