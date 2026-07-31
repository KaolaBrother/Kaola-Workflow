# ADR 0017 Build sequence step 3 — load-bearing extraction survey

Read-only reconnaissance. Every claim below is cited `file:line`. No file was modified.

**Tooling caveat, read this first.** `scripts/kaola-workflow-adaptive-node.js` (19,003 lines) contains a
NUL byte at byte offset ~568,299 (≈ line 8,400). ripgrep classifies the file as binary and **stops
searching there**. Any grep over that file silently returns results only for lines ≲ 8,390 — e.g.
`function mutationGuardPrologue` (real location **12312**) returns zero matches plus a
`binary file matches` warning. The four edition copies
(`plugins/kaola-workflow/scripts/…`, `plugins/kaola-workflow-git{lab,ea}/scripts/…`) have the same
defect. Anyone auditing this file during the deletion campaign must use `rg --text` / `grep -a` or a
line-range read, or they will conclude that half the file does not exist.

---

## 1. The finalize door and the whole-plan attribution sweep

### Where it lives

| Piece | Location |
|---|---|
| Finalize gate call site (the only one that matters) | `scripts/kaola-workflow-claim.js:4111-4124` — inside `cmdFinalize`, placed **before** `archiveProjectDirSafely` so a refusal has zero side effects |
| The probe that shells the validator | `scripts/kaola-workflow-claim.js:3783-3826` (`probeFinalizeValidationGate`); argv built at `3805-3806`, `--base` forwarded at `3806` |
| Second (read-only) call site | `scripts/kaola-workflow-claim.js:3898` inside `evaluateFinalizePreconditions` (the `--check` one-pass report, `3839-3900`) |
| Refusal wrapper | `claim.js:4115` → `finalize_gate_unverified` carrying the validator's inner reason |
| The gate itself | `scripts/kaola-workflow-plan-validator.js:7286-7659` (the `--finalize-check` branch of `main()`) |
| CLI help text (the contract in prose) | `plan-validator.js:6167-6175` |
| Pre-flight root resolution | `plan-validator.js:6239` → `resolveFinalizeCheckRoot` at `747-780` |
| Pre-flight re-plan fence | `plan-validator.js:6241-6249` → `readFinalizeReplanFence` at `4205` |

### What it actually computes, in order

**(pre) Re-plan fence** — `plan-validator.js:6241-6249`. Refuses if a re-plan transaction is mid-flight.
**(pre) Committed-epoch binding** — `plan-validator.js:7287-7294` → `validateCommittedEpochBinding` at `4219`.

**(A) Validation gate**, dual-mode by repo kind (`plan-validator.js:7319-7473`):
- Repo-kind discriminator `7327-7362`: self-host iff `package.json` at the git top-level declares
  `test:kaola-workflow:{claude,codex,gitlab,gitea}`. Present-but-unreadable/unparseable →
  `repo_kind_undetermined` (fail-closed).
- **Self-host arm** `7366-7433`: reads `<plan-dir>/.cache/chain-receipt.json`; freshness by
  `receipt.codeTreeHash` vs `computeCodeTreeHash(gitTop, projTag, extra)` (`5915-5935`), falling back
  to a `headSha` pin with an inertness escape (`headAdvanceIsValidationInvisible`, `5983`).
  Precedence `chains_unverified > chains_stale > chains_empty > chains_red`.
- **Consumer arm** `7434-7473`: reads `<plan-dir>/.cache/final-validation.md`, requires a column-0
  `verdict: pass` (`schema.parseNodeVerdict`) **and** a column-0 `validated_candidate_hash`
  (`schema.parseValidatedCandidateHash`) equal to the recomputed code-tree hash.
- **Plan coupling of arm A is exactly one call**: `parseValidationTestConsumes(content)` at `7464`
  (and `7391` replays the same band off the receipt) — the `## Meta` `validation_test_consumes`
  band widening. Everything else in arm A is plan-independent.

**(B) The attribution sweep** (`plan-validator.js:7474-7623`) — this is the part that dies:
1. `resolveEpochLineagePlans(content, planPath)` `7483` (defined `4150`) — unions **sealed parent
   epoch** plans from `.cache/epochs/`; unverified lineage → `epoch_lineage_unverified` `7484-7497`.
2. `git diff <base>...HEAD --name-only` `7502`; git failure fails **closed** as `unattributed_change`
   `7504-7508`.
3. Builds the attributed set from **four** sources:
   - the narrow allowband — `isBarrierInvisible(p, projTag)` (`plan-validator.js:457-471`:
     `docs/**`, repo-root `CHANGELOG.md`, repo-root `README.md`, `kaola-workflow/{project}/**`),
     plus a blanket `!/^kaola-workflow\//` at `7598`;
   - **`complete`-node declared write sets** — `7518-7525`, over
     `planNodesWithExpansions(content)` (`1692`, spine + recorded expansion units) keyed by
     `parseLedger(content)` (`1841`);
   - sealed parent-epoch `complete` nodes' write sets `7533-7539`;
   - the sink-owned **final-fix register** `.cache/final-fixes.json` `7555-7580`, verified via
     `schema.verifyFinalFixRegister` + `classifyFinalFixSurface` (`686`).
4. Anything left → `unattributed_change` `7616-7623`, with a context-bound `route` to
   `final-fix-commit` computed at `7585-7615` (offered only while the terminal sink row is
   `in_progress` **and** the sink is still pristine — `schema.finalizeSinkStatus` +
   `schema.deriveSinkProgressFromState`).

**(C) Gate execution / post-dominance** (`plan-validator.js:7644-7653`) — `verifyGateExecution`
(`2994-3110ish`) re-runs `gateUncovered` over the ledger with gate roles relabelled by completion
(G1 code-reviewer, G2 security-reviewer, G3 main-session-gate, G4 certifier). Refuses
`gate_unsatisfied`. This is R3 enforcement and it is 100% DAG.

### What it would have to read instead, under a list of items with a free-text `result`

- **(A) ports almost unchanged and there is already a working model for it.** `--release-check`
  (`plan-validator.js:6013-6042+`) is *already* a **plan-independent** twin of arm A: no plan path,
  receipt from the git top-level, same `chains_*` precedence family. The finalize validation gate
  can be re-pointed the same way. The only thing to relocate is `validation_test_consumes` — today a
  `## Meta` field (`plan-validator.js:1034`), consumed by both the gate (`7464`) and the run-chains
  producer (`run-chains.js:1039`). Under a list it becomes either a header line or a constant.
  `computeCodeTreeHash` (`5915`) and `resolveFinalizeCheckRoot` (`747`) are plan-independent already.
- **(B) does not port as a verdict, and this should be said plainly.** The sweep's entire teeth come
  from *declared* write sets — a machine-checkable path set authored **before** the work. ADR 0017
  removes declared write sets and names this as an accepted loss. `result` is specified as "a path,
  or a few lines inline" — free text, so it is not a path set, and any attempt to parse it into one
  re-invents the declaration. The honest port is the R3 treatment the ADR already prescribes for the
  sink: **emit the measurement** (`git diff base...HEAD --name-only`, minus the allowband) **beside
  the recorded per-item locators, and let the orchestrator reconcile.** No verdict.
- **There is already a measured per-item locator, and it is the closest thing to `result` that ships.**
  The `## Node Ledger` carries a `wrote` column: `LEDGER_WROTE_COLUMN` /
  `LEDGER_WROTE_CELL_CAP = 12` (`adaptive-node.js:2953-2958`), lifted off the barrier envelope by
  `closeLocatorFromBarrier` (`2964`), rendered by `renderWroteCell` (`2995`, drops
  `^kaola-workflow/` bookkeeping, caps at 12 with a `+K more` tail), spliced by `spliceLedgerWrote`
  (`3014`). Crucially it is **measured by git at close**, not authored — the design comment at
  `2949-2951` explicitly rules it a *measurement whose obligation is honesty, not enforcement*. That
  is exactly ADR 0017's posture, and it is the piece worth carrying into `result`. Note the
  positional-parse hazard recorded at `3005-3008`: the finalize worktree-regression guard reads
  `cells[2]` as status, which is why the column is appended and never inserted.
- **(C) is deleted outright.** Nothing in the list form post-dominates anything.

---

## 2. The guard prologue and where the consent path physically lives

`mutationGuardPrologue(opts, cfg)` — **`adaptive-node.js:12312-12398`** (doc block `12140-12156`;
note the doc block is separated from the body by the unrelated `#777` block at `12157-12310`).
Three layers, fixed order, zero mutation on any trip:

| Layer | Lines | What it does | Verdict |
|---|---|---|---|
| 1 — integrity | `12321-12355` | in-process `computePlanHash` fast path vs the embedded `<!-- plan_hash -->`; on any miss shells `plan-validator --resume-check` → `plan_integrity_failed` (`12339-12344`). Then **always** `verifyLedgerChainForPlan` (`12241-12263`) because the ledger sits outside `plan_hash` (`12345-12354`) | **dies** — `plan_hash`, the freeze chain and the ledger chain are all retired |
| 2 — consent-halt fence | `12376-12387` | `readDurableConsentHalt(planContent)` → `haltParkScope` → `refuse('halt_pending', …)` | **the consent path** |
| 3 — live coordination | `12389-12395` | `probeCoordination` (`12090`) → `coordinationRefusal` (`12110`) → `serial_node_live` / `scheduler_active` | **dies** — running-set scheduler |

Call sites: `runOpenNext` `adaptive-node.js:7813` (`{integrity:true, halt:true, excl:['scheduler']}`),
`runCloseAndOpenNext` `8350` (`{halt:true}`). Guarded-subcommand sets:
`SPLIT_GUARDED_SUBCOMMANDS` `95-115`, `REPLAN_GUARDED_SUBCOMMANDS` `120-128`,
`LEDGER_MUTATING_SUBCOMMANDS` `197-202`.

### The consent halt, end to end

**There is no single "halt file". A halt is four writes across three surfaces:**

| Surface | Written | Read | Cleared |
|---|---|---|---|
| `consent_halt: pending` line inside `## Node Ledger` of **`workflow-plan.md`** | `adaptive-node.js:9302-9323` (inserted directly after the `## Node Ledger` heading via `locateSection`) | `adaptive-schema.js:1586-1595` `readDurableConsentHalt` (section-scoped, `^consent_halt:[ \t]*pending$`); marker constant `adaptive-schema.js:1581` | `removeDurableConsentHalt` `adaptive-node.js:9399-9409` |
| `escalated_to_full: <reason>` in **`workflow-state.md`** | `adaptive-node.js:9299-9300`, `9326` (state written LAST — crash-safe ordering) | `hasEscalatedMarker` `adaptive-node.js:9421-9423`; `ESCALATION_MARKERS` `adaptive-schema.js:1568` | `runClearHalt` `adaptive-node.js:9425+` |
| **`.cache/consent-halts.json`** — the halt register (#871) | `appendHaltRegisterRow` `adaptive-node.js:9196-9219`, called at `9337-9343` | `reviewSchema.readHaltRegister` / `openHaltRows` `adaptive-schema.js:1678-1715` | `clearHaltRegisterRows` `adaptive-node.js:9229-9242` (rows stamped `cleared_at`, never deleted) |
| **`.cache/consent-grants.json`** — the standing-grant journal (#846) | `writeConsentStore` `adaptive-node.js:9053-9055`; grant/apply/revoke entries at `9280-9281`, `9360-9370`, `9137` | `readConsentStore` `9044`, `foldConsentGrants` `9060-9077`, `consentGrantsView` `9106-9113` | `syncConsentScope` `9126-9143` revokes on scope move |

Writer: `runWriteHalt` **`adaptive-node.js:9244-9392`**. Valid reasons
`['consent','security','test_thrash','merge_conflict','integrity']` (`9254`).
Clearer: `runClearHalt` **`adaptive-node.js:9425+`** — accepts only `consent|security` (`9428-9431`),
so `integrity` / `test_thrash` halts are terminal by construction (`9248-9253`).
Other readers of the marker: `kaola-workflow-repair-state.js:368`,
`kaola-workflow-replan.js:1281` (`replanBlockedByHalt`), `adaptive-handoff.js:1018` (the decoy strip),
`runOrient` `adaptive-node.js:7362`.

### Consent vs. node-lifecycle machinery — the split

**Consent (survives, in some form):**
- the two markers + the two `.cache/` journals, and the write/clear verbs — but note the halt marker
  currently lives **inside the plan file's ledger section**, so its host dies. It has to move to
  `.cache/` or to a field on the list.
- `consentScopeDigest` `adaptive-node.js:9009-9022` — binds a grant to
  claim identity + epoch lineage + plan epoch + active plan hash + replan status/tx. **Four of its six
  fields are DAG/epoch fields.** Under a list, only `claim_identity_digest` survives; the digest has to
  be re-derived or the standing-grant feature drops. `consentClassKey` `9034-9040` (action:target) is
  clean and portable.
- `KERNEL_ARTIFACT_REGISTRY` rows for both journals: `adaptive-schema.js:6697-6700`.

**Node-lifecycle machinery that dies with the DAG:**
- `haltParkScope` `adaptive-node.js:12275-12310` and `executionNodesForPlan` `9166-9180` and
  `parkedAtRaise` `9186-9191` — the *scoping* of a halt to the halting node's dependent subgraph is
  pure graph work (`reviewSchema.dependentSubgraph`, `adaptive-schema.js:1716-1749`). Under a list
  there is no dependency edge, so a halt either parks the run or parks nothing. Note the fail-closed
  ladder at `12366-12375`: every unknown already parks the whole run, so "park everything" is the
  shipped default behaviour and the list form simply makes it the only behaviour.
- Layer 1 in its entirety (plan_hash + ledger chain).
- Layer 3 in its entirety (`readCoordinationState` `12052-12082`, `probeCoordination` `12090-12102`,
  `coordinationRefusal` `12110-12138`).
- `refreshTaskMirror` / `buildTransition` calls in `runWriteHalt` (`9389-9390`).

---

## 3. Nonce minting

**One mint site pattern, two copies.** The nonce is *not* random — it is the **first 12 hex chars of
the per-node barrier baseline tree SHA**, i.e. it is derived, not minted:

- `adaptive-node.js:7999-8000` (`runOpenNext`):
  `String(baselineResult.recordBase.base).slice(0, 12)` where `baselineResult` is
  `commit-node --start` (`--record-base`).
- `adaptive-node.js:8797-8798` (the `close-and-open-next` fused advance) — identical derivation, and
  the comment at `8841-8846` records that reading the *top-level* `base` instead of the nested
  `recordBase.base` is the historical `#411 BUG A`.
- `runOpenReady` uses the same derivation (referenced at `8842`).

**Consumers:**
1. **Evidence-binding header** — `seedEvidenceFile` `adaptive-node.js:2611`, line built at `2650`:
   `evidence-binding: <node-id> <nonce>` becomes line 1 of `.cache/{node-id}.md`.
2. **Close-time staleness check** — `readNonce(planPath, nodeId, readFile)` called at
   `adaptive-node.js:8403`; a mismatch is `evidence_stale`. This is the **anti-replay** function: it
   proves the evidence was written against *this* open, not a previous attempt's.
3. **Dispatch card** — `buildDispatch(..., { nonce })` `adaptive-node.js:8012-8013`, `8808-8809`.
4. **`upstream_read` consumed-proof** — `checkUpstreamConsumed` `adaptive-node.js:4097-4142`, which
   reads the upstream's line-1 nonce via `readUpstreamEvidenceNonce` `4148-4155` and requires the
   consumer to echo `upstream_read: <up-id> <nonce>`. ADR 0017 names this as an accepted loss.
5. **Fan-out member binding** — `plan-validator.js:3533-3549`: each `canonical-node-id` fan-out member's
   evidence binding must match its own `barrier-base-<member>` prefix; duplicates and foreign bindings
   are refused.
6. **G4 certifier receipt** — `plan-validator.js:2402-2404`.

**Does anything outside node execution depend on a nonce? No.** Counted occurrences of `nonce`
across `scripts/kaola-*.js`: `adaptive-node.js` (many), `replan.js` (11), `adaptive-schema.js` (6),
`plan-validator.js` (4), `adaptive-handoff.js` (1) — **zero** in `claim.js`, `sink-merge.js`,
`run-chains.js`, `roadmap.js`, `task-mirror.js`, `closure-audit.js`.

The `replan.js` / `adaptive-schema.js` / `adaptive-handoff.js` occurrences are a **different nonce**:
`planner.dispatch_nonce` in the re-plan transaction, `sha256Canonical({transaction_id, role:
'workflow-planner', planner_attempt}).slice(0,12)` — validated at `adaptive-schema.js:1125-1132`. It
binds the planner dispatch to the epoch transaction and dies with the epoch machinery.

So: **the nonce is purely a node-execution anti-replay device, and nothing outside node execution
reads it.** ADR 0017's watch-list row "stale / replayed / cross-copied evidence → provenance stamps:
open, baseline ref, author, time" is exactly the generalization of this mechanism, and it is correctly
on the watch list rather than the build list.

---

## 4. `scripts/kaola-workflow-adaptive-schema.js` — full export inventory (7,145 lines)

Byte-identical across all four editions; imported by 14 shipped scripts and ~15 test suites. Line
spans below are the definition ranges; counts are approximate (±5%) and total to the file.

### (b) SURVIVES — must keep living in this one byte-identical file (~1,340 lines, ~19%)

| Exports | Lines | Why it survives |
|---|---|---|
| `isPlainObject`, `canonicalJson`, `sha256Hex`, `sha256Canonical`, `HEX64_RE` | 454-529 (~76) | generic; used by everything including the consent journal |
| `writeFileAtomicReplace` | 4078-4143 (~66) | the atomic-write primitive. Consumers outside the DAG: `claim.js:759-760`, `sink-merge.js:512,823`, `validation-runner.js:1055`, `prose-census.js:714`, `gap-sweep.js:240` |
| `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot` | 4320-4371 (~52) | worktree topology; `claim.js`, `sink-merge.js:6` |
| `parsePorcelainPaths`, `isParkedLanePath`, `PARKED_LANE_PREFIXES` | 4017-4077 (~61) | dirty-tree classification at the claim consent-ask; `claim.js:3863` |
| `LANE_STALENESS_MS`, `LANE_STALENESS_PROVENANCE`, `SHARED_STATE_FIELDS` | 1502-1545 (~44) | stale-worktree sweep; `claim.js:2255,4774` |
| `CURATED_ROOT_PATHS`, `extractCuratedRootPaths`, `isCuratedRoot`, `canonicalCuratedRoot` | 3865-3920 (~56) | consumed by `kaola-workflow-classifier.js:8` |
| `parseStateFields` | 972-980 (~9) | `workflow-state.md` reader, used everywhere |
| `locateSection` | 4372-4428 (~57) | generic fence-aware markdown section locator — the list file will want it |
| `emit`, `refuse`, `answer`, `casLostAnswer` | 4468-4553 (~86) | envelope emitters. `task-mirror.js:36` imports `{emit, refuse}` |
| `parseValidatedCandidateHash` | 1902-1917 (~16) | consumer-mode finalize binding (arm A) |
| `deriveSinkProgressFromState` | 6417-6443 (~27) | "has the sink pushed?" derived from `workflow-state.md`, not from a node row |
| `NODE_TIMINGS_LOG_NAME`, `PROVENANCE_LOG_NAME`, `DISPATCH_LOG_NAME`, `OUTCOME_LOG_NAME`, `PARENT_OWNED_SIDECARS`, `isParentOwnedSidecar`, `OUTCOME_LOG_SCHEMA_VERSION`, `OUTCOME_RESULTS`, `OUTCOME_CLASSIFICATIONS`, `buildOutcomeRecord` | 6494-6661 (~168) | telemetry. Consumers outside the DAG: `telemetry-report.js:88-92`, `run-chains.js:926-934` |
| `ADAPTIVE_PATH`, `PLAN_FILE`, `PLAN_RUN_COMMAND`/`_SKILL`, `ADAPT_COMMAND`/`_SKILL` | 25-36 (~12) | `claim.js` uses `PLAN_FILE` at 7 sites and `ADAPTIVE_PATH` at 3; these become the list file's name and its command |
| `KERNEL_RULINGS`, `KERNEL_RECORDS`, `KERNEL_ARTIFACT_REGISTRY`, `classifyDurableArtifact`, `isKernelRecordPath`, `projectRelativeArtifactPath` | 6662-6836 (~175) | the durable-artifact registry survives as a concept but **~60% of its rows name DAG artifacts** (`6667-6695` plan/position rows, `6717-6730` review rows) — it needs a rewrite, not a delete |
| `CONSENT_HALT_MARKER`, `readDurableConsentHalt`, `HALT_REGISTER_*`, `readHaltRegister`, `openHaltRows`, `CONSENT_GRANTS_NAME`, `ESCALATION_MARKERS` | 1568-1715 minus `dependentSubgraph` (~100) | consent — survives only if the valve stays durable; ADR 0017 says conversation is the mechanism until a question must outlive the process |
| `DELEGATION_OUTCOME_*`, `CAPABILITY_GAP_OUTCOME`, `parseDelegationOutcome` | 3785-3825 (~41) | the vocabulary a `dispatched`/`result` field would reuse |

### (a) DIES WITH THE DAG (~5,250 lines, ~73%)

| Exports | Lines | Bucket |
|---|---|---|
| `NODES_HEADING`, `LEDGER_HEADING`, `LEDGER_STATUSES`, `MAX_NODES` | 36-40, 1546 (~10) | plan grammar |
| `DEFAULT_FANOUT_CAP`, `DEFAULT_FANOUT_CAP_READONLY`, `RUNNING_SET_NAME`, `LOOP_CAP`, `TEST_THRASH_LIMIT`, `MERGE_CONFLICT_REPAIR_LIMIT`, `REVIEW_REPAIR_LIMIT`, `REVIEW_REBIND_LIMIT`, `OPTIMIZE_ITER_CAP`, `OPTIMIZE_WALLCLOCK_CAP` | 322-366, 1554-1555 (~55) | caps + scheduler |
| Epoch/replan constants + `validateReplanTransaction` + `readReplanFence` + snapshot manifest + `buildClaimRootBase`/`buildEpochLineage`/`buildCandidateView`/`digestCandidateView`/`buildInheritedFrontierView`/`digestInheritedFrontierView`/`buildScopeLineageId`/`validateEpochStateAuthority`/`writeEpochStateBlock` | 367-453, 783-1015, 1016-1501 (~730) | epochs, re-plan CAS |
| Ledger tamper-evidence chain (`LEDGER_CHAIN_*`, `ledgerChain*`, `extendLedgerChain`, `verifyLedgerChain`, `stampLedgerChainHead`, `stripLedgerChainHead`, `buildLedgerChainEntry`) | 530-737 (~208) | ledger |
| `dependentSubgraph` | 1716-1749 (~34) | `depends_on` |
| `MAIN_SESSION_GATE_ROLE`, `ROLE_KINDS`, `ROLE_CAPABILITY_MANIFEST`, `VERDICT_*`, `GATE_VERDICT_ROLES` | 1750-1828 (~79) | roles |
| `SPECULATIVE_OPEN_POLICY_*`, `hasSpeculativePolicyField`, `materializeSpeculativePolicy`, `WRITE_OVERLAP_POLICY_*` | 1829-1879 (~51) | plan Meta policies |
| `parseNodeVerdict`, `parseMetricValue`, `parseNodeSelector`, `FINDING_*_VOCABULARY`, `parseNodeFindings`, `unresolvedInScopeFixes`, `repairResponsibleFindings`, `evaluateEffectiveVerdict` | 1880-2049 minus 1902-1917 (~155) | gate verdicts + `select()` |
| **The entire reviewer-contract v2 engine**: `REVIEW_*` versions, `REVIEW_GATE_ROLES`, `REVIEW_AGGREGATIONS`, `ADVERSARIAL_OUTCOMES`, `APPROVAL_OUTCOMES`, `FINDING_ANCHOR_KINDS`, `EXPANSION_ID_RE`, `expansionIdFieldOk`, `deriveGateMode`, `requiredReviewTokens`, `deriveGateEffect`, `buildReviewContext`, `parseReviewEvidence*`, `validateReviewEvidenceBinding`, `normalizeFindingAnchor`, `computeFindingUid`, `normalizeFindingSet`, `normalizeResolutionSet`, `authoritativeResolutionArtifacts`, `deriveRepairDelta`, `validateRepairDelta`, `assessFindingClosure`, `reduceReviewReceipts`, `compareValidationObligations`, `assessReviewProgress`, `canonicalLogicalGateIdentity`, `validateReviewJournal`, `validateReviewJournalV2`, `isCanonicalBlobMap`, `isWriterIdentityTuple`, `nonAbortedRebinds`, `effectiveCandidate`, `effectiveProducerBinding` | 2050-3784 (~1,735) | **the single largest block in the file** |
| `WRITE_SET_OVERFLOW_SUBTYPES` | 3826-3864 (~39) | write sets |
| `FANOUT_CAP_ENV`, `FANOUT_CAP_READONLY_ENV`, `PARALLEL_WRITES_ENV`, `SEAM_CHECKPOINT_ENV`, `TEST_ATTRIBUTION_ENV`, `resolveFanoutCap`, `resolveFanoutCapReadonly`, `parallelWritesDefaultOn`, `seamCheckpointDefaultOn`, `testAttributionDefaultOn`, `CONFIG_REL_PATH` | 3921-4016 (~96) | toggles for machinery that dies |
| `spliceComplianceSection` (+ the compliance table constants) | 4429-4467 (~39) | `## Required Agent Compliance` |
| **The refusal kernel**: `KERNEL_REFUSAL_VOCABULARY`, `KERNEL_REFUSAL_REGISTRY`, `REFUSAL_PAYLOAD_SCHEMAS`, `REFUSAL_COMPATIBILITY_RULES`, `REFUSAL_EMISSION_MODE`, `ROUTE_TERMINAL_VERBS`, `ROUTE_SCRIPT_IDS`, `INVESTIGATION_OR_DISCARD`, `WRITE_FAILED_*`, `CAS_ROUTE_BY_RECORD`, `INTEGRITY_*`, `EVIDENCE_ROUTE_BY_RECORD_KIND`, `SINK_FINDING_*`, `CONSENT_KINDS`, `LOCK_KINDS`, `routeKey`, `resolveRoute`, `resolveSinkFindingRoute`, `finalFixSinkAdvice`, `foreignSelectorAdvice`, `R4_NON_REMEDIABLE_CELLS`, `resolveAutoRemediable`, `REFUSAL_WHY`, `refusalCellKey`, `assertCellClosure`, `routeProse`, `refusalFact`, `validateRefusalPayload`, `classifyRefusalCondition`, `stampRefusalEnvelope`, `ACTIONABLE_RESULTS`, `isActionableResult`, `deriveDeviationRoutes`, `composeOperatorHint` | 4554-6212 (~1,658) | ADR 0017: **the refusal count reaches zero**. `composeOperatorHint` and `isActionableResult` are the only plausible survivors here |
| `EPOCH_PROJECTIONS_DIR`, `OWNER_PROJECTION_*`, `buildOwnerProjectionEntry`, `verifyOwnerProjectionEntry`, `foldOwnerProjection`, `canonicalizeRouteOwners` | 6213-6304 (~92) | expansion/discharge |
| `FINAL_FIX_REGISTER_*`, `FINAL_FIX_SUBCOMMAND`, `FINAL_FIX_SURFACE_CLASSES`, `computeFinalFixRegisterDigest`, `verifyFinalFixRegister`, `verifyFinalFixEntry` | 6305-6416 (~112) | exists only to widen the attribution sweep — dies with it |
| `finalizeSinkStatus` | 6444-6493 (~50) | reads the unique terminal sink **node row** |

### (c) UNCLEAR (~450 lines, ~6%) — and why

1. **Model tier / dispatch-effort tables** — `NODE_MODEL_TIERS`, `TIER_ALIASES`, `normalizeTier`,
   `TIER_MODEL_CLAUDE`, `dispatchModelClaude`, `TIER_MODEL_CODEX`, `dispatchModelCodex`,
   `CODEX_PINNED_STANDARD_ROLES`, `CODEX_PINNED_REASONING_ROLES`, `codexProfilePolicy`,
   `dispatchEffort`, `WAIT_BUDGET_*`, `waitBudgetFloor`, `waitBudgetMinutes`, `TIER_RANK`,
   `CONTRACT_EFFORT_TABLE`, `contractForProvider`, `effortForProvider`, `mapTier`,
   `dispatchEffortOpencode`, `modelDisplay` — **lines 49-321 (~272)**.
   *Why unclear:* the `model` **cell** on a node dies (ADR 0017: an item carries "no role, no
   model"). But subagents and worktrees remain tools, and something still has to answer "which model
   and which effort for this dispatch" per runtime. Two of these tables are keyed on **role**
   (`CODEX_PINNED_*_ROLES`, `codexProfilePolicy`) and die with the role vocabulary; the
   tier→model/effort mapping is runtime knowledge that does not depend on the DAG. Consumers outside
   node execution: `kaola-workflow-resolve-agent-model.js`, `test-agent-model-resolver.js`,
   `test-kimi-edition.js:41`, `test-opencode-edition.js:26`, `sync-opencode-edition.js:62`,
   `generate-routing-surfaces.js:47`. **This is a values call for the owner, not a mechanical one.**

2. **The project scheduler lock** — `SCHEDULER_LOCK_NAME`, `acquireProjectLock`,
   `releaseProjectLock`, `isStaleLock`, `probeLockLiveness`, `_installSchedulerExitHook` —
   **lines 4144-4319 (~176)**.
   *Why unclear:* it is the running-set scheduler's mutual exclusion, so it looks like it dies. But
   it is also exactly ADR 0017's watch-list row *"two honest live writers on one file → CAS with the
   conflict returned as data; lease with liveness probe"* — and `probeLockLiveness` (`4177-4229`) is
   a working liveness probe with cross-host handling already written. The ADR says that mechanism is
   **sized but not built**; this code is the sizing. It should be deliberately retired or
   deliberately kept as the pre-built answer, not deleted by accident.

3. **`buildClaimIdentity` + `normalizeIssueNumbers`** — lines 744-782 (~39).
   *Why unclear:* `claim.js:823` calls `buildClaimIdentity` and it is the input to
   `consentScopeDigest`. It is claim bookkeeping, not DAG — but it currently emits into the epoch
   state block (`writeEpochStateBlock`, `claim.js:993`) which dies. It survives as a *function*;
   its *sink* has to change.

---

## 5. Load-bearing outside node execution that ADR 0017 did NOT name

These are real import edges from surviving subsystems into the dying ones. All verified.

### 5.1 `claim.js` imports five functions from the plan-validator — `claim.js:27`

```js
const { parseGoal, parseLedger, parseExpansionRecords, expansionRecordEfficiency,
        renderAgentComplianceSection } = require('./kaola-workflow-plan-validator');
```

| Function | Call site | What breaks |
|---|---|---|
| `parseGoal` | `claim.js:3344` | reads the `goal:` line from `## Meta`. **This is precisely ADR 0017's header goal line** — it ports directly, but the reader has to move out of the validator |
| `parseLedger` | `claim.js:5320` inside `listRecordedNodeEvidence` (`5316-5326`) | **The archive-completeness proof.** Every `complete` ledger row implies `.cache/<id>.md` must exist in the archive; `verifyArchiveComplete` (`5349`, via `5393`) refuses a lossy archive on that basis. Archiving is a kernel-record operation that survives — but its required-set derivation is DAG-shaped. Under a list this becomes "every `done` item's `result` locator", which is free text and therefore not a file list. **This is a second, unnamed instance of the same problem as the attribution sweep.** |
| `parseExpansionRecords` + `expansionRecordEfficiency` | `claim.js:2437-2450` inside `persistExpansionRollupToSummary` (`2433`) | expansion telemetry into `finalization-summary.md`. Dies cleanly |
| `renderAgentComplianceSection` | `claim.js:2768` | renders `## Required Agent Compliance` from (nodes × ledger × `.cache`) at archive time — `plan-validator.js:1859-1880` documents it as fully derived. Dies cleanly |

### 5.2 `run-chains.js` — two edges, both live on every self-host run

- `run-chains.js:1032` → `plan-validator.parseValidationTestConsumes` (`1039`) and
  `plan-validator.computeCodeTreeHash` (`1041`). The comment at `1026-1031` states the reason
  explicitly: producer and gate must call the **same** helper or they disagree. `computeCodeTreeHash`
  is plan-independent (`plan-validator.js:5915`) but currently lives in the dying file — **it must be
  relocated, not deleted.**
- `run-chains.js:926` → `adaptive-node.appendOutcomeRecord` + `buildOutcomeRecord` (telemetry;
  fail-open at `935`). The recorder is re-exported from adaptive-node (`18804-18814`) but
  `buildOutcomeRecord` actually lives in adaptive-schema — the re-export exists only so forge ports
  need one require. Survives; the require target must move.

### 5.3 `sink-merge.js` — `sink-merge.js:6,9,12`

Imports 14 functions from `claim.js` (`getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot`,
`parsePorcelainPaths`, `isParkedLanePath`, `readActiveFolders`, `removeWorktree`,
`buildClosureReceipt`, `checkClosureInvariants`, `checkDispatchAttestations`, `defaultBranch`,
`appendClosureBlock`, `persistAttestationToSummary`, `persistExpansionRollupToSummary`),
`resolveChains` from `run-chains.js`, and `adaptiveSchema.writeFileAtomicReplace` (`512`, `823`).
Only `persistExpansionRollupToSummary` is DAG-coupled. `checkClosureInvariants` (`claim.js:3156`)
reasons over the roadmap + archive, not the plan. **The sink is nearly clean already** — consistent
with ADR 0017 asking only that R3 become a report.

### 5.4 `task-mirror.js:31` — `planNodesWithExpansions`, `parseLedger`, `readStoredHash`

Generates `workflow-tasks.json` (the Codex task mirror) from `## Nodes` + `## Node Ledger`.
`KERNEL_ARTIFACT_REGISTRY` rules it `derivable` (`adaptive-schema.js:6753-6754`). It also imports
`{emit, refuse}` from the schema (`36`). **It dies with the DAG or is re-pointed at the list.**
Note `refreshTaskMirror` is called from ~every adaptive-node lifecycle verb (e.g. `9390`), so the
call sites go with them.

### 5.5 `repair-state.js:10-11`

Imports the whole plan-validator plus `adaptiveSchema.readDurableConsentHalt` (`368`). Its job is
regenerating `workflow-state.md` from the plan — a crash-recovery derivation that has no meaning
once the list is the record.

### 5.6 `next-action.js:32-35`

Pure DAG (`parseNodes`, `parseLedger`, `parseSpeculativePolicy`, `uniqueSink`, `expansionUnitNodes`,
… + `LEDGER_STATUSES`, `GATE_VERDICT_ROLES`). Dies entirely. Also pulls
`enforceReasoningFloor` / `loadCodexSessionProof` from `resolve-agent-model.js` — see UNCLEAR item 1.

### 5.7 The contract validators and generators read the schema directly

`generate-routing-surfaces.js:47`, `sync-opencode-edition.js:62`,
`validate-kaola-workflow-contracts.js:749,941,996,1166` (the last one loops all four editions),
`test-route-reachability.js:66`, `test-kernel-conformance.js:37`, `test-substrate-conversion.js:106`.
These are the machinery that enforces the SIX-surface propagation rule and cross-edition byte
identity. **They are not tests of the DAG — they are tests of the propagation discipline**, and they
will fail the moment the schema's export surface changes, before any behaviour is touched. Sequence
the campaign so these are updated with the schema, not after it.

### 5.8 `classifier.js:8` and `telemetry-report.js:88-92`

Both import narrow, surviving slices (`CURATED_ROOT_PATHS`; the three log-name constants). No action
beyond keeping those exports.

### 5.9 `ledger-compare.js` — the worktree→main regression guard

`claim.js:3495` and `3700` lazily require `compareLedgers` to refuse a worktree→main mirror that
would regress the ledger (`claim.js:3490-3520`). This is **worktree management, not node execution**,
but its safety property is expressed entirely in ledger terms. Under a list the equivalent question
("would this mirror lose a `done` item?") still needs an answer, and nothing in ADR 0017 names it.

---

## Summary of the four items

1. **Finalize door** — arm A (validation) is already 95% plan-independent and `--release-check`
   (`plan-validator.js:6042`) is a shipped, working, plan-independent twin to copy. Arm B (attribution)
   cannot port as a verdict because free-text `result` is not a path set; port it as a *report*.
   Arm C (post-dominance) deletes. Relocate `computeCodeTreeHash`, `isBarrierInvisible`,
   `resolveFinalizeCheckRoot`, `parseValidationTestConsumes` out of the dying file.
2. **Guard prologue** — `adaptive-node.js:12312`. Layer 2 is the consent path and it is worth ~100
   schema lines + ~250 adaptive-node lines; **its marker currently lives inside the plan's ledger
   section and must move**, and `consentScopeDigest` loses 4 of its 6 binding fields. Layers 1 and 3
   delete outright.
3. **Nonce** — derived (not minted) from the barrier baseline SHA at
   `adaptive-node.js:7999` / `8797`; consumed only by evidence binding, close-time staleness,
   fan-out member binding, and the `upstream_read` proof. **Zero dependents outside node execution.**
   Deletes cleanly; the watch-list "provenance stamps" row is its generalization.
4. **adaptive-schema.js** — ~73% dies (~5,250 lines, dominated by the 1,735-line reviewer-contract
   engine and the 1,658-line refusal kernel), ~19% survives (~1,340 lines: crypto/JSON, atomic write,
   worktree topology, porcelain parsing, curated roots, state parsing, section locator, emitters,
   telemetry, artifact registry, consent), ~6% unclear (~450 lines: the model-tier/dispatch-effort
   tables, and the project scheduler lock which is simultaneously dying machinery and a pre-built
   watch-list mechanism).

**The two things the ADR did not name that most deserve attention:**
`listRecordedNodeEvidence` (`claim.js:5316`) — archive completeness is proven from the ledger, and it
is the same "declared set" problem as the attribution sweep, one layer down; and
`computeCodeTreeHash` (`plan-validator.js:5915`) — a plan-independent function that both the
finalize gate and the run-chains producer call by shared reference, sitting inside the file that dies.
