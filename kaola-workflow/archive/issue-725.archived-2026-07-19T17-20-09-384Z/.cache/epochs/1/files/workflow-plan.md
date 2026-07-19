# Workflow Plan — issue #725 (epic Phase B: receipt diet — per-step timing + diff-scoped run-chains)

<!-- plan_hash: 3628c722ce42946dc80f16c00be32532b2f3b9eb65d88cb9a15af702fa7a1813 -->

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
code_certifier: n3-code-review
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Plan Notes

Phase B ("receipt diet") of epic #725 — the SECOND sequential adaptive run of the epic. Phase A
(retire fast/full) already shipped to main and archived; this run's scope is B0–B3 ONLY, entirely on
the `run-chains` four-edition family. The epic's other phases (C guard-dedup, D prompt-diet, E
mega-test prune) are OUT of scope and land in later runs. This run ends in a PARTIAL close: #725 stays
OPEN for Phase C; no other issue (notably #718) is touched.

Scope (from the issue #725 Phase-B section — the issue body carries the fine-tuned inventories/traps):
- B0 instrument-first: `run-chains` records per-STEP wall-clock durations in the chain receipt (today
  it records only per-CHAIN `duration_ms`). Cuts are justified against measured numbers.
- B1 diff-scoped chains: `run-chains` computes the diff scope vs the run base — an edition-touching
  diff runs all four chains, a claude-only diff runs the claude chain alone; the scope decision + diff
  evidence go in the receipt. `release.js --release-check` keeps its UNCONDITIONAL all-four requirement.
- B2 hoist cross-chain repeats into a run-once shared preamble (each chain stays individually runnable).
- B3 (optional) parallel forge chains — the concurrency + per-chain TMPDIR isolation substrate already
  exists in run-chains; drop B3 without blocking the phase if step-decomposition makes isolation harder
  to prove cheaply.

Shape — deliberately SERIAL, single producer under a code-reviewer wall. B0–B3 are sequential
refinements of the SAME cohesive four-edition write set (the run-chains canonical + codex byte twin +
gitlab/gitea rename-normalized ports + their tests), which must move atomically — they are NOT
genuinely-independent disjoint work, so there is no antichain to fan out. The code-reviewer (n3)
post-dominates BOTH producers (the n1 implementation and the n2 docs), so it is trivially the unique
graph-maximal producer wall and any finding reopens the relevant producer IN PLACE (no replan). The
change gate is a `code-reviewer` wall, NOT an `adversarial-verifier` change gate, per the interim
schema-2 guidance (an AV gate over a producer set has a documented antichain-wedge repair hazard;
prefer the code-reviewer wall). No separate design node — the architecture forks are settled directly
in n1's brief (the issue body already did most of the design); n1 is reasoning-tier because it IS the
architect and the change is finalize-gate-critical.

Sensitivity/editions: no sensitive surface or label (run-chains touches no auth/secret/fs-segment/CI
path), so `security_certifier: none` and no G2 node. run-chains has NO opencode/kimi edition copy and
is not in edition-sync's mirror set, and Phase B is neither Phase A nor D, so no opencode/kimi re-sync
is required — `validation_command: npm test` (the four chains) is the complete gate. The Phase-B diff
itself touches the edition trees, so the new diff-scoped run-chains will correctly self-select all four
chains at THIS run's finalize (a built-in end-to-end self-test).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-receipt-diet | tdd-guide | — | scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-run-chains.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js, scripts/test-run-chains.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-run-chains.js, plugins/kaola-workflow-gitea/scripts/test-gitea-run-chains.js | 7 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-docs | doc-updater | n1-receipt-diet | CLAUDE.md, CHANGELOG.md | 2 | sequence | — | standard | — | — | — | — | — | — |
| n3-code-review | code-reviewer | n2-docs | — | 1 | sequence | — | reasoning | — | — | the receipt diet is correct and finalize-gate-safe: every executed step records a per-step wall-clock duration in the receipt; the diff-scope decision runs all four chains for any edition-touching diff and the claude chain alone only for a genuinely claude-only diff, failing closed to all four on any unresolved base or git error, with the scope decision plus touched-path diff evidence recorded in the receipt; the receipt stays strictly ADDITIVE so the existing chains[] verdict contract (name, exitCode, accepted_red, headSha, workTreeHash) that plan-validator --finalize-check and release-check and the walkthrough/test-release synthetic fixtures read is unchanged; release.js --release-check still requires an unconditional all-four receipt (chains_incomplete on a subset); each hoisted cross-chain repeat runs exactly once in the combined run while every chain stays individually runnable standalone; the #547 code-tree freshness hash still validates a scoped receipt; all four run-chains editions stay in parity (byte-identical claude↔codex, rename-normalized gitlab/gitea) with all four chains green and the measured >=50% common-case wall-clock cut recorded; and the CLAUDE.md/CHANGELOG documentation delta describes only the shipped behavior with no provenance leakage and CLAUDE.md under 200 lines | the full candidate: the run-chains four-edition family (canonical scripts/ copy, the codex byte twin under plugins/kaola-workflow/scripts/, the gitlab and gitea rename-normalized ports), its test surfaces (test-run-chains.js and the two forge test ports test-gitlab-run-chains.js / test-gitea-run-chains.js), and the n2 documentation delta (CLAUDE.md Validation Policy + CHANGELOG), reviewed against the accumulated diff vs the claim root base and n1's before/after timing evidence | sequence | — |
| n4-finalize | finalize | n3-code-review | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-receipt-diet | complete |
| n2-docs | complete |
| n3-code-review | pending |
| n4-finalize | pending |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-receipt-diet) | subagent-invoked | evidence-binding: n1-receipt-diet 8176ed345212 | |
| doc-updater (n2-docs) | subagent-invoked | evidence-binding: n2-docs 500c77477a04 | |
| code-reviewer (n3-code-review) | pending | | |
| finalize (n4-finalize) | pending | | |

## Node Briefs

### n1-receipt-diet

Implement Phase B (B0–B3) in the run-chains four-edition family + tests, RED-first. Goal: cut the
~50-minute all-four finalize cost for the common claude-only case by >=50% at FIXED correctness. This
node is the architect too — the direction below is binding.

Current state (read first): `scripts/kaola-workflow-run-chains.js` shells each chain as ONE opaque
subprocess via `CHAIN_COMMANDS` (`npm run test:kaola-workflow:<edition>`), timing only the whole chain
(`duration_ms`). It ALREADY has core-gated concurrent dispatch (`resolveConcurrency`, `runChainAsync`,
a bounded pool), per-chain private TMPDIR isolation (`createIsolatedChainSpec`), transient-retry
(`runChainWithRetry`), and a `KAOLA_RUN_CHAINS_CONCURRENCY` / `--serial` fallback. The receipt is
`.cache/chain-receipt.json` with `{ headSha, workTreeHash, chains: [{ name, exitCode, command,
duration_ms, accepted_red, accepted_red_issue }] }`.

Architecture (forks settled here):
- B0 step decomposition + per-step timing: decompose each chain into its `&&`-joined step list and run
  the steps itself so each can be timed. SOURCE OF TRUTH for the step lists = the package.json
  `test:kaola-workflow:*` scripts, parsed READ-ONLY (split on `&&`, trim). Do NOT edit package.json —
  "each chain stays individually runnable" via `npm run test:kaola-workflow:<edition>` must remain true,
  so package.json is the read-only source. If a manifest is preferable, embed it INSIDE run-chains.js —
  do NOT add a new manifest file (it would be outside the declared write set and stall the barrier).
  Record each executed step as `{ command, duration_ms, exitCode }` in a per-chain `steps[]` array
  NESTED under the existing chain entry. This is ADDITIVE — keep every existing chains[] field.
- B1 diff-scope: compute the diff scope vs the run base (reuse the base the finalize flow already
  resolves — the claim-root base / merge-base with the default branch; if unresolved, FAIL CLOSED to
  all four). Scope rule: if the diff touches any edition-coupling path — `plugins/kaola-workflow-{gitlab,
  gitea}/`, the codex twin tree `plugins/kaola-workflow/`, the codex/forge contract validators, or any
  edition-port script (a COMMON_SCRIPTS / BYTE_IDENTICAL_GROUPS / RENAME_NORMALIZED_FAMILIES member) —
  run ALL FOUR chains; otherwise run the CLAUDE chain only. Record the scope decision + the touched-path
  diff evidence in the receipt. A claude-only diff yields a receipt whose chains[] holds only the claude
  entry — this is ALREADY the supported "subset receipt" shape at adaptive finalize (plan-validator
  --finalize-check tolerates a subset; only release requires all-four), so no gate change is needed.
- B1 release stays all-four: `release.js --release-check` / `--tag` must keep requiring an unconditional
  all-four receipt (it refuses `chains_incomplete` on a subset). The auto-scoping applies to the
  finalize/default run-chains path ONLY. Verify run-chains still produces a full four-chain receipt when
  invoked for release / without scope narrowing, so the release gate is untouched.
- B2 hoist repeats: run a run-once shared preamble for steps that appear in multiple chains —
  `test-active-folders-field-parity` (all four), `generate-routing-surfaces --check` (all four),
  `validate-vendored-agents` (claude+gitlab+gitea), `validate-script-sync` (claude+codex). Dedup by
  command identity: run each once (attributed to the preamble in the receipt) and skip re-running it in
  the individual chains DURING THE COMBINED RUN. Each chain must stay individually runnable standalone —
  the dedup lives in run-chains' combined-run composition, never by removing steps from package.json.
- B3 (optional) parallel forge chains: the concurrency + per-chain TMPDIR isolation already exists.
  Confirm isolation still holds under the step-decomposed model (each chain's steps run within the
  chain's isolated env), keep the `--serial` / `KAOLA_RUN_CHAINS_CONCURRENCY` fallback, and record the
  concurrency mode in the receipt. If step-decomposition makes per-chain isolation harder to prove
  cheaply, DROP B3 (keep serial) without blocking the phase.
- B0 instrument-first evidence: record the BEFORE baseline (measured all-four wall-clock) and the AFTER
  (claude-only scoped run + all-four scoped run) in the node evidence so the >=50% common-case cut (AC-B)
  rests on measured numbers, not line counts.

Cross-edition parity (HARD): land the change in all four run-chains editions in lockstep. Canonical
`scripts/kaola-workflow-run-chains.js` and the codex twin `plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js`
are BYTE-IDENTICAL; the gitlab/gitea ports are RENAME-NORMALIZED (`kaola-workflow-*` ->
`kaola-{forge}-workflow-*`). `validate-script-sync.js` runs in the chains and enforces this — regenerate
the ports via the rename transform; do not hand-diverge. The forge run-chains ports require() their forge
classifier's `isTransientFetchStderr`; keep that call intact.

Tests (RED-first) in `scripts/test-run-chains.js`, mirrored into the two forge test ports (which exec the
forge run-chains ports on mock chains inside the gitlab/gitea walkthrough chains): assert (1) per-step
timings present in the receipt; (2) a claude-only diff -> claude-only chains[]; (3) an edition-touching
diff -> all-four chains[]; (4) the scope decision + diff evidence recorded; (5) a hoisted repeat runs
exactly once in the combined run; (6) the release / all-four path still yields a full four-chain receipt;
(7) fail-closed to all-four on an unresolved base.

Traps: (a) #547 content-addressed validation-receipt freshness hash (`computeCodeTreeHash` /
`isValidationInvisible`) — a scoped receipt must still compute the correct freshness key so the finalize
staleness check passes. (b) Keep the receipt strictly ADDITIVE — simulate-workflow-walkthrough.js's
finalize-gate fixtures and test-release.js's synthetic receipts construct their OWN receipts and read the
chains[] verdict contract; never remove/rename an existing chains[] field. (c) The Phase-B diff itself
touches the edition trees, so this run's own finalize must self-select all-four — a good end-to-end
self-test. Validation: `npm test` (all four chains green — the change touches edition ports).

### n2-docs

Update `CLAUDE.md` Validation Policy to name run-chains as the diff-scope authority: the cross-edition
rule is UNCHANGED (a cross-edition diff still requires all four chains) — run-chains now APPLIES it
automatically at finalize, and release stays unconditional all-four. Keep CLAUDE.md under 200 lines
(currently 142). Add a `CHANGELOG.md` entry under [Unreleased] describing the receipt diet (per-step
timings, diff-scoped finalize receipt, hoisted run-once preamble, optional parallel forge chains).
Describe ONLY the behavior actually shipped by n1 (read its evidence; do not fabricate schema). NO
provenance (no issue refs, no ADR ids) in CLAUDE.md prose per docs/conventions.md — provenance lives in
CHANGELOG/commit only. Standard tier.

### n3-code-review

Gate the full candidate (n1 code + n2 docs) against the gate_claim. Read n1's evidence (including its
before/after timing numbers) and the accumulated diff vs the claim root base. Verify: per-step timings
recorded; diff-scope correct AND fail-closed to all-four on any unresolved base/git error; the receipt is
strictly additive so the chains[] verdict contract the finalize gate, release-check, and the
walkthrough/test-release fixtures read is preserved; release.js --release-check still demands an
unconditional all-four receipt; each hoisted repeat runs exactly once while every chain stays
individually runnable; the #547 freshness hash validates a scoped receipt; four-edition run-chains parity
holds; all four chains are green; the measured >=50% common-case wall-clock cut is recorded; and the
CLAUDE.md/CHANGELOG delta describes only shipped behavior with no provenance leakage (CLAUDE.md < 200
lines). This is the sole change gate (no adversarial-verifier per the interim schema-2 guidance).
Reasoning tier.

### n4-finalize

Terminal sink, run main-session-direct. The Phase-B diff touches the edition trees, so the four-chain
verification is required — the new diff-scoped run-chains self-selects all four chains for this run;
record the all-four GREEN chain receipt. PARTIAL close: leave #725 OPEN (Phase C remains); do NOT close
#718 or any other issue. Sink per the standard adaptive finalize path (feature commit -> run-chains
receipt -> cmdFinalize --keep-worktree/--keep-open -> push branch -> sink-merge from the main root),
verifying the issue stays OPEN afterward.
