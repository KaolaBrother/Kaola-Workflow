# Dead-export audit — `scripts/kaola-workflow-adaptive-schema.js` (the Oracle Kernel)

Read-only investigation. No tracked file was modified. This file is the only write.

## Setup

- Commit: `0532e684ef997a0df1dc81ba1b67cff8309223a3` (branch `kaola/issue-877`), working tree clean at start.
- Kernel: 2090 lines; `module.exports` literal at `:1970`–`:2090`.
- Four copies confirmed byte-identical (`shasum -a 256` → `f73800301c728047…` for all four).
- Tool constraint honoured: **grep only** (`rg` is not installed on this box; every `rg` sweep here would have
  returned silently empty). All sweeps below are `grep -IFwn` over an explicit `git ls-files` list.
- Search surface: **all 8670 tracked files** minus the four kernel copies. `git ls-files -o --exclude-standard`
  returns **0** untracked files, so the tracked list is the whole surface — scripts, all four plugin trees,
  agents, commands, skills, templates (incl. `templates/opencode/plugins/*.js` and `templates/routing/*`),
  hooks, `install*.sh`, `uninstall.sh`, `package.json`, `opencode.json`, every `.md`.

### Export count

`module.exports` has **95 key lines** but **93 distinct exports** — `canonicalJson` and `sha256Hex` are each
listed twice. Verified at runtime: `Object.keys(require(kernel)).length === 93`.

### Consumption forms searched

A single word-boundary grep is not sufficient, because the kernel is consumed five different ways. All five
were enumerated:

1. direct destructure — `const { X } = require('./kaola-workflow-adaptive-schema.js')`
2. whole-module alias — `const adaptiveSchema = require(...)` then `adaptiveSchema.X` (the dominant form:
   44 files bind an alias; `adaptiveSchema`, `schema`, `giteaSchema`, `gitlabSchema`, `codexSchema`,
   `adaptiveSchema579`, `pv`)
3. **destructure from the alias** — `const { getCoordRoot, mainRootFromCoord } = adaptiveSchema;`
   (`scripts/kaola-workflow-claim.js:22`). *This form was initially missed and produced 11 false positives on
   the first pass; the corrected sweep is what this report is built on.*
4. inline-require member — `require('./kaola-workflow-adaptive-schema').X(...)`. Exactly two symbols reach the
   kernel this way and no other: `writeFileAtomicReplace` (7 sites) and `projectRelativeArtifactPath`
   (`scripts/kernel-write-observer.js:53`).
5. computed access — swept for `adaptiveSchema[`, `schema[`, `Object.keys(schema)`, spread. **Zero hits.**
   No consumer enumerates the export surface dynamically.

### Re-export chains

Every module whose own `module.exports` names a kernel symbol was located and followed to its consumers.
Eight names appear in downstream `module.exports`; each was checked for whether it is a genuine re-export or a
**local same-named definition**:

| name | re-exporting module | verdict |
|---|---|---|
| `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot` | `kaola-workflow-claim.js:5607` (×4 trees) | genuine kernel re-export — keeps them live |
| `writeFileAtomicReplace` | `kaola-{gitea,gitlab}-workflow-roadmap.js:397` | genuine kernel re-export |
| `isValidationInvisible` | `kaola-workflow-validation-runner.js:1116` (×4) | genuine kernel re-export |
| `canonicalJson` | `kaola-workflow-validation-runner.js:1116`, `generate-reviewer-profiles.js:719` | **local duplicate** (own `function canonicalJson` at `:93` / `:188`) — not the kernel's |
| `detectSelfHostNpm` | `kaola-workflow-validation-runner.js:1116` (×4) | **local duplicate** (own definition at `:35`) — the test at `test-validation-runner.js:178` calls the *runner's* copy, not the kernel's |
| `CODEX_PINNED_STANDARD_ROLES`, `CODEX_PINNED_REASONING_ROLES` | `kaola-workflow-codex-preflight.js:4006`, `install-codex-agent-profiles.js:3033` | **local duplicates** (`codex-preflight.js:79/:83`; that file never requires the kernel). The kernel's copies are nonetheless live — the contract validators compare the two |

### Executable verification of the kill list

A scratch copy of the kernel was built with all 21 bucket-A declarations and the 3 dead internal declarations
removed, then measured:

| measurement | command | result | exit |
|---|---|---|---|
| syntax | `node --check <pruned>` | PARSE OK | 0 |
| module load | `node -e "require('<pruned>')"` | loads; 93 → **72** exports; **zero** exports resolve `undefined` | 0 |
| behavioural parity | value/function-source compare of all 72 survivors vs. the real kernel | **0 diffs** across 72 | 0 |
| baseline `test-oracle-kernel.js` | `node scripts/test-oracle-kernel.js` | all **48** assertions passed | 0 |
| baseline `test-kernel-conformance.js` | `node scripts/test-kernel-conformance.js` | **255** assertions passed | 0 |

The load test is the one that matters for A-vs-B: a module-level initializer referencing a deleted name
(e.g. `CURATED_ROOT_LC = new Map(CURATED_ROOT_PATHS.map(...))` at `:588`) throws at `require` time. It did not.

---

## The 93 symbols

Bucket **A** = delete definition + export line. **B** = keep definition, drop from `module.exports`.
**C** = keep; a real external consumer is named.

| symbol | def lines | bucket | evidence |
|---|---|---|---|
| `LANE_STALENESS_MS` | 492-492 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js:682 (+15 more) |
| `LANE_STALENESS_PROVENANCE` | 498-505 | A | 0 external, 0 internal code refs |
| `SHARED_STATE_FIELDS` | 513-527 | C | TEST-PIN ONLY — scripts/test-active-folders-field-parity.js:17 (+7 more) |
| `PARKED_LANE_PREFIXES` | 629-629 | C | TEST-PIN ONLY — scripts/test-claim-hardening.js:2073 (+3 more) |
| `parsePorcelainPaths` | 635-650 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:12 (+40 more) |
| `isParkedLanePath` | 660-683 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:12 (+31 more) |
| `getCoordRoot` | 742-757 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:12 (+72 more) |
| `mainRootFromCoord` | 763-766 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:12 (+72 more) |
| `resolveMainRoot` | 770-773 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:12 (+19 more) |
| `ADAPTIVE_PATH` | 25-25 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:691 (+7 more) |
| `NEXT_COMMAND` | 32-32 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:692 (+15 more) |
| `NEXT_SKILL` | 33-33 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:693 (+4 more) |
| `PLAN_FILE` | 42-42 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:1785 (+5 more) |
| `NODE_MODEL_TIERS` | 50-50 | B | 0 external; internal: normalizeTier @ 64 |
| `TIER_ALIASES` | 60-60 | B | 0 external; internal: normalizeTier @ 65 |
| `normalizeTier` | 61-67 | B | 0 external; internal: dispatchEffort @ 131 |
| `TIER_MODEL_CLAUDE` | 73-73 | A | 0 external, 0 internal code refs |
| `dispatchModelClaude` | 74-77 | A | 0 external, 0 internal code refs |
| `TIER_MODEL_CODEX` | 80-80 | A | 0 external, 0 internal code refs |
| `dispatchModelCodex` | 81-84 | A | 0 external, 0 internal code refs |
| `CODEX_PINNED_STANDARD_ROLES` | 88-96 | C | TEST-PIN ONLY — plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:494 (+5 more) |
| `CODEX_PINNED_REASONING_ROLES` | 97-105 | C | TEST-PIN ONLY — plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:497 (+5 more) |
| `codexProfilePolicy` | 106-117 | A | 0 external, 0 internal code refs |
| `modelDisplay` | 308-317 | A | 0 external, 0 internal code refs |
| `TIER_RANK` | 202-202 | A | 0 external, 0 internal code refs |
| `CONTRACT_EFFORT_TABLE` | 207-224 | B | 0 external; internal: effortForProvider @ 245 |
| `contractForProvider` | 230-237 | C | scripts/sync-opencode-edition.js:516 (+6 more) |
| `dispatchEffort` | 130-147 | C | TEST-PIN ONLY — scripts/test-agent-model-resolver.js:79 |
| `WAIT_BUDGET_MINUTES` | 162-162 | A | 0 external, 0 internal code refs |
| `WAIT_BUDGET_MINUTES_DEFAULT` | 163-163 | A | 0 external, 0 internal code refs |
| `WAIT_BUDGET_MINUTES_CAP` | 164-164 | A | 0 external, 0 internal code refs |
| `waitBudgetFloor` | 165-170 | A | 0 external, 0 internal code refs |
| `waitBudgetMinutes` | 171-180 | A | 0 external, 0 internal code refs |
| `effortForProvider` | 242-246 | C | scripts/sync-opencode-edition.js:506 (+5 more) |
| `mapTier` | 251-257 | A | 0 external, 0 internal code refs |
| `dispatchEffortOpencode` | 287-294 | A | 0 external, 0 internal code refs |
| `CLAIM_IDENTITY_FIELD_ORDER` | 329-332 | B | 0 external; internal: writeClaimIdentityBlock @ 444,450 |
| `isPlainObject` | 334-338 | C | TEST-PIN ONLY — scripts/test-oracle-kernel.js:252 (+4 more) |
| `canonicalJson` | 343-375 | C | TEST-PIN ONLY — scripts/test-oracle-kernel.js:193 (+21 more) |
| `sha256Hex` | 377-379 | C | TEST-PIN ONLY — scripts/test-oracle-kernel.js:263 (+4 more) |
| `sha256Canonical` | 381-383 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:648 (+8 more) |
| `normalizeIssueNumbers` | 391-400 | B | 0 external; internal: buildClaimIdentity @ 404 |
| `buildClaimIdentity` | 402-424 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:635 (+3 more) |
| `parseStateFields` | 428-435 | B | 0 external; internal: writeClaimIdentityBlock @ 439 |
| `writeClaimIdentityBlock` | 437-470 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:765 (+3 more) |
| `parseValidatedCandidateHash` | 554-561 | B | 0 external; internal: evaluateChainReceipt @ 1660 |
| `parseRecordedVerdict` | 540-552 | B | 0 external; internal: evaluateChainReceipt @ 1651 |
| `CURATED_ROOT_PATHS` | 571-579 | B | 0 external; internal: CURATED_ROOT_LC @ 588 |
| `extractCuratedRootPaths` | 600-613 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js:314 (+7 more) |
| `isCuratedRoot` | 616-616 | A | 0 external, 0 internal code refs |
| `canonicalCuratedRoot` | 621-621 | A | 0 external, 0 internal code refs |
| `writeFileAtomicReplace` | 690-730 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js:89 (+45 more) |
| `emit` | 796-799 | A | 0 external, 0 internal code refs |
| `refuse` | 801-803 | C | TEST-PIN ONLY — scripts/test-outcome-recorder.js:70 |
| `answer` | 805-807 | A | 0 external, 0 internal code refs |
| `deriveSinkProgressFromState` | 822-843 | A | 0 external, 0 internal code refs |
| `NODE_TIMINGS_LOG_NAME` | 885-885 | C | plugins/kaola-workflow-gitea/scripts/kaola-workflow-telemetry-report.js:88 (+17 more) |
| `DISPATCH_LOG_NAME` | 886-886 | C | plugins/kaola-workflow-gitea/scripts/kaola-workflow-telemetry-report.js:88 (+17 more) |
| `OUTCOME_LOG_NAME` | 887-887 | C | plugins/kaola-workflow-gitea/scripts/kaola-workflow-telemetry-report.js:88 (+20 more) |
| `PARENT_OWNED_SIDECARS` | 891-895 | C | TEST-PIN ONLY — scripts/test-outcome-recorder.js:133 |
| `isParentOwnedSidecar` | 900-1969 | C | TEST-PIN ONLY — scripts/test-outcome-recorder.js:157 (+3 more) |
| `OUTCOME_LOG_SCHEMA_VERSION` | 925-925 | C | TEST-PIN ONLY — scripts/test-outcome-recorder.js:83 |
| `OUTCOME_RESULTS` | 932-932 | B | 0 external; internal: buildOutcomeRecord @ 992 |
| `OUTCOME_CLASSIFICATIONS` | 939-939 | C | TEST-PIN ONLY — scripts/test-outcome-recorder.js:88 |
| `buildOutcomeRecord` | 983-1027 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:995 (+13 more) |
| `appendOutcomeRecord` | 970-981 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:994 (+9 more) |
| `KERNEL_RULINGS` | 1061-1061 | C | TEST-PIN ONLY — scripts/test-kernel-conformance.js:81 |
| `KERNEL_RECORDS` | 1062-1062 | C | TEST-PIN ONLY — scripts/test-kernel-conformance.js:68 (+1 more) |
| `KERNEL_ARTIFACT_REGISTRY` | 1064-1124 | C | TEST-PIN ONLY — scripts/test-kernel-conformance.js:42 |
| `classifyDurableArtifact` | 1130-1969 | C | TEST-PIN ONLY — scripts/test-kernel-conformance.js:98 (+7 more) |
| `isKernelRecordPath` | 1142-1144 | A | 0 external, 0 internal code refs |
| `projectRelativeArtifactPath` | 1156-1168 | C | scripts/kernel-write-observer.js:53 |
| `VALIDATION_TEST_CONSUMES` | 1191-1191 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:1099 (+8 more) |
| `SELF_HOST_TEST_CONSUMED` | 1227-1234 | B | 0 external; internal: testConsumes @ 1264 |
| `isBookkeepingPath` | 1204-1969 | C | TEST-PIN ONLY — scripts/test-validation-allowband.js:94 |
| `testConsumes` | 1259-1969 | C | TEST-PIN ONLY — scripts/test-validation-allowband.js:100 |
| `isValidationInvisible` | 1272-1969 | C | TEST-PIN ONLY — scripts/test-validation-allowband.js:108 (+4 more) |
| `detectSelfHostNpm` | 1242-1258 | B | 0 external; internal: computeCodeTreeHash @ 1363 |
| `classifyRepoKind` | 1505-1524 | B | 0 external; internal: evaluateChainReceipt @ 1570 |
| `resolveFinalizeCheckRoot` | 1292-1316 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:3248 (+3 more) |
| `computeCodeTreeHash` | 1358-1377 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:1100 (+8 more) |
| `headAdvanceIsValidationInvisible` | 1426-1438 | B | 0 external; internal: evaluateChainReceipt @ 1611 |
| `attachChainsStaleDiagnostics` | 1453-1456 | B | 0 external; internal: evaluateReleaseReceipt @ 1849,1856,1868 |
| `evaluateChainReceipt` | 1558-1676 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:3250 (+5 more) |
| `evaluateReleaseReceipt` | 1819-1927 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-run-chains.js:809 (+7 more) |
| `evaluateReleasePrepCarryOver` | 1732-1787 | B | 0 external; internal: evaluateReleaseReceipt @ 1866 |
| `CODEX_MANIFEST_RELPATHS` | 1684-1688 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js:16 (+23 more) |
| `CLAUDE_MANIFEST_RELPATHS` | 1689-1692 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js:16 (+15 more) |
| `RELEASE_FILES` | 1693-1693 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-release.js:16 (+31 more) |
| `RELEASE_VERSIONED_JSON_FILES` | 1696-1696 | B | 0 external; internal: evaluateReleasePrepCarryOver @ 1766 |
| `changedPathsSinceBase` | 1936-1969 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:3253 (+3 more) |
| `MISSION_LIST_FILE` | 38-38 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:1784 (+25 more) |
| `parseGoal` | 1963-1968 | C | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:29 (+11 more) |

---

## A — DELETE ENTIRELY (21)

Zero external consumers in any form, and zero references from live kernel code once the transitive closure is
taken. Ordered by declaration line, with the contiguous comment block above each declaration (which goes with it):

| symbol | declaration | leading comment | note |
|---|---|---|---|
| `TIER_MODEL_CLAUDE` | 73 | 69–72 | only reader is `dispatchModelClaude` (:76) and `modelDisplay` (:312), both dead |
| `dispatchModelClaude` | 74–77 | — | |
| `TIER_MODEL_CODEX` | 80 | 79 | only reader is `dispatchModelCodex` (:83), dead. Value is `{reasoning:null, standard:null}` — it answers nothing even when called |
| `dispatchModelCodex` | 81–84 | — | |
| `codexProfilePolicy` | 106–117 | — | |
| `WAIT_BUDGET_MINUTES` | 162 | 149–161 | readers are `waitBudgetFloor` (:167–168) and `waitBudgetMinutes` (:174,:177), both dead |
| `WAIT_BUDGET_MINUTES_DEFAULT` | 163 | — | |
| `WAIT_BUDGET_MINUTES_CAP` | 164 | — | |
| `waitBudgetFloor` | 165–170 | — | |
| `waitBudgetMinutes` | 171–180 | — | |
| `TIER_RANK` | 202 | 182–201 | readers are `mapTier` (:252) and `modelDisplay` (:314), both dead. The 20-line comment above it goes too |
| `mapTier` | 251–257 | 248–250 | **see caveat below** |
| `dispatchEffortOpencode` | 287–294 | 279–286 | |
| `modelDisplay` | 308–317 | 296–307 | |
| `LANE_STALENESS_PROVENANCE` | 498–505 | 494–497 | |
| `isCuratedRoot` | 616 | 614–615 | |
| `canonicalCuratedRoot` | 621 | 617–620 | |
| `emit` | 796–799 | 775–795 | **see finding below** |
| `answer` | 805–807 | — | **see finding below** |
| `deriveSinkProgressFromState` | 822–843 | 810–821 | |
| `isKernelRecordPath` | 1142–1144 | 1140–1141 | |

### The whole tier/model/wait-budget cluster is dead, and it dies transitively

The prior reviewer's suspicion holds, but the reason matters for the implementer: most of these constants
*do* have internal readers — the readers are themselves dead. Deleting only the leaf functions and keeping the
constants would leave 6 orphaned tables. The closure is: `dispatchModelClaude`/`dispatchModelCodex`/
`modelDisplay`/`mapTier`/`waitBudgetFloor`/`waitBudgetMinutes` have no external caller, so
`TIER_MODEL_CLAUDE`/`TIER_MODEL_CODEX`/`TIER_RANK`/`WAIT_BUDGET_MINUTES*` lose their last reader and go with them.

The brief's caution about `kaola-workflow-resolve-agent-model.js`, `install-codex-agent-profiles.js`,
`sync-opencode-edition.js`, `sync-kimi-edition.js` and the agent `.toml` generators was checked specifically
and **does not save any of these**:

- `kaola-workflow-resolve-agent-model.js:49` (all four trees) names `normalizeTier` **in a comment only**
  (`// … mirrors the schema's normalizeTier() alias map`). It has its own resolution table.
- `install-codex-agent-profiles.js` and `kaola-workflow-codex-preflight.js` **never require the kernel**
  (`grep -c adaptive-schema` → 0). Their `CODEX_PINNED_*` are their own.
- `sync-opencode-edition.js` **does** consume the kernel, but only `contractForProvider` (`:516`) and
  `effortForProvider` (`:506`) — both bucket C, both kept. Its `mapTier` references (`:173`, `:247`, `:537`)
  are prose it *writes into generated files*, not calls.
- `sync-kimi-edition.js` does not reference the kernel at all.

### Caveat on `mapTier` — the one A-list entry with a non-code consequence

`mapTier` is never called anywhere, so deleting it breaks nothing at runtime. But its **name is baked into
generated opencode prose**:

- `scripts/sync-opencode-edition.js:247` — `'`mapTier(tier, provider)` resolves the variant: …'`
- `scripts/sync-opencode-edition.js:537` — `lines.push('  // mapTier(tier, provider). tier → variant:');`
- `install-opencode.sh:424` and 4 comment sites in `scripts/test-opencode-edition.js`

Deleting the function leaves generated agent bodies documenting a function that no longer exists. That is
documentation drift, not a break — but it is a real decision the implementer should make deliberately
(rename the prose, or leave `mapTier` alone). `mapTier` also has by far the widest doc footprint of any
A-list symbol: `README.md`, `CHANGELOG.md`, `docs/decisions/D-544-01.md`, `D-610-01.md`, `D-703-01.md`,
`docs/opencode-edition.md`, `docs/kimi-edition.md`.

### Surprising finding: the kernel's shared envelope vocabulary is vestigial

`emit`, `refuse` and `answer` are described in a 21-line comment (`:775`–`:795`) as *"the two envelopes every
script shares"*. Measured:

- `emit` — **zero** callers, kernel-internal or external. The 262 word-matches across the repo are the English
  word in comments plus unrelated locals (e.g. `const emit = { watched }` at `kaola-workflow-claim.js:5369`,
  and `emitFinalizeCommitFailure`). No script imports it; no script defines its own `emit` either.
- `answer` — **zero** callers. The 237 matches are the English word and the `result: 'answer'` **string**
  in test assertions, which is the JSON vocabulary, not this constructor.
- `refuse` — exactly **one** caller in the entire repo: `scripts/test-outcome-recorder.js:70`
  (`schema.refuse('evidence_absent', …)`). It is bucket C only because a test exercises it.

So the "ONE shared envelope" the comment claims is shared by nothing. `emit` and `answer` are bucket A.
`refuse` is kept (a test calls it), but the implementer should know it is a test-only survivor — if that
assertion moves, the whole trio goes.

---

## B — UNEXPORT ONLY (18)

Live kernel code calls these; nothing outside the kernel does. Remove the `module.exports` line, keep the
definition. Each row names the internal caller that keeps it alive.

| symbol | kept alive by | at |
|---|---|---|
| `NODE_MODEL_TIERS` | `normalizeTier` | :64 |
| `TIER_ALIASES` | `normalizeTier` | :65 |
| `normalizeTier` | `dispatchEffort` | :131 |
| `CONTRACT_EFFORT_TABLE` | `effortForProvider` | :245 |
| `CLAIM_IDENTITY_FIELD_ORDER` | `writeClaimIdentityBlock` | :444, :450 |
| `normalizeIssueNumbers` | `buildClaimIdentity` | :404 |
| `parseStateFields` | `writeClaimIdentityBlock` | :439 |
| `parseValidatedCandidateHash` | `evaluateChainReceipt` | :1660 |
| `parseRecordedVerdict` | `evaluateChainReceipt` | :1651 |
| `CURATED_ROOT_PATHS` | `CURATED_ROOT_LC` (module-level initializer) | :588 |
| `OUTCOME_RESULTS` | `buildOutcomeRecord` | :992 |
| `SELF_HOST_TEST_CONSUMED` | `testConsumes` | :1264 |
| `detectSelfHostNpm` | `computeCodeTreeHash` | :1363 |
| `classifyRepoKind` | `evaluateChainReceipt` | :1570 |
| `headAdvanceIsValidationInvisible` | `evaluateChainReceipt` | :1611 |
| `attachChainsStaleDiagnostics` | `evaluateReleaseReceipt` | :1849, :1856, :1868 |
| `evaluateReleasePrepCarryOver` | `evaluateReleaseReceipt` | :1866 |
| `RELEASE_VERSIONED_JSON_FILES` | `evaluateReleasePrepCarryOver` | :1766 |

Notes on three the brief singled out:

- `SELF_HOST_TEST_CONSUMED` — `scripts/test-validation-allowband.js:103` mentions it inside an **assertion
  message string**, and `:13` in a comment. Neither reads the export; the test calls `pv.testConsumes()` and
  `pv.isBookkeepingPath()`. Unexporting is safe, but that message string will name a symbol that is no longer
  exported — worth a one-word edit.
- `detectSelfHostNpm` — the kernel's copy is a **duplicate** of `kaola-workflow-validation-runner.js:35`.
  `test-validation-runner.js:178` tests the runner's, not the kernel's. Unexport the kernel's; do **not**
  delete it (`computeCodeTreeHash` calls it at `:1363`).
- `CURATED_ROOT_PATHS` — dies as an export but must stay as a definition: `CURATED_ROOT_LC` at `:588` is a
  module-level initializer over it, and `extractCuratedRootPaths` (bucket C, 8 production consumers) reads
  `CURATED_ROOT_LC`. `CURATED_ROOT_SET` at `:580`, however, is dead (see below).

---

## C — KEEP (54)

**34 with production consumers.** `LANE_STALENESS_MS`, `SHARED_STATE_FIELDS`, `PARKED_LANE_PREFIXES`,
`parsePorcelainPaths`, `isParkedLanePath`, `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot`,
`ADAPTIVE_PATH`, `NEXT_COMMAND`, `NEXT_SKILL`, `PLAN_FILE`, `contractForProvider`, `effortForProvider`,
`sha256Canonical`, `buildClaimIdentity`, `writeClaimIdentityBlock`, `extractCuratedRootPaths`,
`writeFileAtomicReplace`, `NODE_TIMINGS_LOG_NAME`, `DISPATCH_LOG_NAME`, `OUTCOME_LOG_NAME`,
`buildOutcomeRecord`, `appendOutcomeRecord`, `projectRelativeArtifactPath`, `VALIDATION_TEST_CONSUMES`,
`resolveFinalizeCheckRoot`, `computeCodeTreeHash`, `evaluateChainReceipt`, `evaluateReleaseReceipt`,
`CODEX_MANIFEST_RELPATHS`, `CLAUDE_MANIFEST_RELPATHS`, `RELEASE_FILES`, `changedPathsSinceBase`,
`MISSION_LIST_FILE`, `parseGoal`.

**20 whose only consumers are tests or contract validators.** These are C — a real file breaks if they go —
but the implementer should know none of them is read by shipping code:

`SHARED_STATE_FIELDS`, `PARKED_LANE_PREFIXES`, `CODEX_PINNED_STANDARD_ROLES`, `CODEX_PINNED_REASONING_ROLES`,
`dispatchEffort`, `isPlainObject`, `canonicalJson`, `sha256Hex`, `refuse`, `PARENT_OWNED_SIDECARS`,
`isParentOwnedSidecar`, `OUTCOME_LOG_SCHEMA_VERSION`, `OUTCOME_CLASSIFICATIONS`, `KERNEL_RULINGS`,
`KERNEL_RECORDS`, `KERNEL_ARTIFACT_REGISTRY`, `classifyDurableArtifact`, `isBookkeepingPath`, `testConsumes`,
`isValidationInvisible`.

Two that are genuinely surprising:

- **`dispatchEffort`** has exactly **one** consumer in the whole repo — `scripts/test-agent-model-resolver.js:79`.
  It is the only thing keeping `normalizeTier` (and through it `NODE_MODEL_TIERS` and `TIER_ALIASES`) out of
  bucket A. Retire that one assertion and four more symbols become deletable.
- **`CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES`** exist in the kernel *only* so the four
  contract validators can assert the kernel's copy equals `codex-preflight.js`'s and
  `install-codex-agent-profiles.js`'s copies. The kernel's copy is a third duplicate whose sole purpose is to
  be compared against the other two.

---

## Duplicate keys — confirmed

`canonicalJson` and `sha256Hex` each appear twice in the export literal:

- `:2009`, `:2010` — inside the hash-primitive cluster, immediately before `sha256Canonical` at `:2011`.
- `:2021`, `:2022` — under the orphaned `#761` comment at `:2019`–`:2020`.

Both occurrences name the same identifier, so the duplication is inert at runtime (last wins, same value) —
`Object.keys()` returns 93, not 95. **The first pair (`:2009`–`:2010`) should survive**; it sits with
`isPlainObject`/`sha256Canonical`, which is where the primitives belong. Delete `:2021`–`:2022` together with
the `#761` comment directly above them, which is the reason they were duplicated in the first place.

## Orphaned comments — confirmed and mapped

Every comment block inside the export literal was checked against its adjacent symbol:

| lines | text | verdict |
|---|---|---|
| `:2012` | `// #777 — ledger tamper-evidence hash chain` | **orphaned.** The symbol below it is `normalizeIssueNumbers`, which has nothing to do with a hash chain. The chain exports are gone |
| `:2019`–`:2020` | `// #761: the OPTIONAL expansion_id binding … + its fail-closed field validator — exported for direct pins.` | **orphaned.** Nothing named `expansion_id` remains in the kernel. Its "payload" is the duplicate `canonicalJson`/`sha256Hex` pair |
| `:2031`–`:2041` | the `ADR 0013 Amendment A1 / M3` block — narrates `REFUSAL_WHY`, the actionable-result predicate, the discharge owner projection, the sink-owned final-fix register | **orphaned, 11 lines, no adjacent symbol whatsoever.** `REFUSAL_WHY` does not exist anywhere in the repo (only in this run's own working note, `kaola-workflow/.origin/877/loadbearing.md`) |
| `:2042`–`:2043` | `// The finalize-context predicates the deviation routes key on: one derivation of "has the sink pushed?" and one reading of the unique terminal sink row.` | attached to `deriveSinkProgressFromState` (`:2044`) — but describes **two** things where one export remains. Goes with that symbol, which is bucket A |
| `:2045`–`:2047`, `:2058`–`:2060`, `:2067`–`:2068` | ADR 0013 M2 / Layer-0 registry / validation surface | **legitimate** — each has live adjacent symbols |

The rest of the file was swept the same way: every identifier mentioned in a kernel comment was resolved
against the kernel's declarations and then against the repo. All remaining comment-only mentions are
legitimate cross-references (`FILE_PATH_REGEX`, `SHARED_INFRA`, `SENSITIVE_PATTERNS` point at the classifier
and plan-validator; `detectInheritModel`/`parseModelProvider` at `sync-opencode-edition.js`; `WORKFLOW_PATHS`
at `:21` explicitly *documents a retirement*, which is intentional). **`REFUSAL_WHY` at `:2032` is the only
comment-mentioned identifier that resolves to nothing.**

## Other dead weight

**Three non-exported top-level declarations become unreachable** once bucket A goes. They must be deleted in
the same edit or they become new orphans:

| symbol | lines | why it dies |
|---|---|---|
| `OPENCODE_PROVIDER_ENV` | `:270` (comment `:259`–`:269`) | only reader is `resolveOpencodeProvider` (`:273`) |
| `resolveOpencodeProvider` | `:271`–`:277` | only reader is `dispatchEffortOpencode` (`:289`), bucket A |
| `CURATED_ROOT_SET` | `:580` | **already dead today** — declared, never read. `CURATED_ROOT_LC` at `:588` is the map everything actually uses. This one is pure dead weight independent of the campaign |

**A dead validator block, outside the kernel but load-bearing on the kernel's require:**
`scripts/validate-kaola-workflow-contracts.js:566`–`:589`. It requires the kernel at `:569`
(`const schema = require(…adaptive-schema.js)`) and **never reads `schema`**. It then builds `installedSkills`
from the filesystem and loops `for (const target of emittedSkillTargets)` — where `emittedSkillTargets` is
declared as an empty literal `[]` at `:571` and never appended to. The assertion inside can never execute.
This is a `#400` route-reachability contract that asserts nothing. Reporting it, not fixing it — it is
adjacent to the campaign and would be cheap to remove in the same pass, but it is a separate decision.

---

## Blast radius: validator and test pins

**The sequencing trap does not fire on this kill list.** Measured: **no A-bucket or B-bucket symbol is read
by any validator or test in any form** — zero `schema.X` member accesses, zero destructures, zero string pins
in an executable position. Every validator/test occurrence of an A/B name is a **comment or an assertion
*message* string**. The A deletions and B unexports can land in one commit without touching a single
assertion.

The pins that *do* read the export surface, and what they read (none of it A or B):

| file | lines | what it pins |
|---|---|---|
| `scripts/validate-script-sync.js` | `:93`–`:97` `KERNEL_COPIES`; `:209`–`:210` byte-identity family; `:414`–`:429` `checkCommittedKernelParity()`; `:583`, `:590` | **the four-copy byte-identity anchor.** This is the real sequencing constraint: all four copies must change in the same commit, and `checkCommittedKernelParity` reads `git ls-tree HEAD`, so a working-tree-only edit reds it |
| `scripts/test-kernel-conformance.js` | `:42` `KERNEL_ARTIFACT_REGISTRY`; `:68` `KERNEL_RECORDS`; `:81` `KERNEL_RULINGS`; `:83` `KERNEL_RECORDS`; `:98`, `:302`, `:488`, `:490`, `:505`, `:528`, `:539` `classifyDurableArtifact`; `:359`–`:371` fs-API classification rows naming the kernel file; `:634` | all bucket C, all kept |
| `scripts/test-oracle-kernel.js` | `:84`, `:91` `writeFileAtomicReplace`; `:193`–`:249` `canonicalJson` (≈20 assertions); `:252`–`:256` `isPlainObject`; `:263`–`:269` `sha256Hex`; `:271`–`:279` `sha256Canonical` | all bucket C, all kept |
| `scripts/validate-kaola-workflow-contracts.js` | `:426`–`:436` `codexSchema.CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES`; `:569` (the dead require above) | C |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | `:490` require; `:494`, `:497` `giteaSchema.CODEX_PINNED_*` | C |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | `:489` require; `:493`, `:496` `gitlabSchema.CODEX_PINNED_*` | C |
| `scripts/validate-workflow-contracts.js` (+ plugin twin) | `:914` — comment naming `TIER_ALIASES` | prose only |
| `scripts/test-agent-model-resolver.js` | `:28` `schema.CODEX_PINNED_STANDARD_ROLES` + `CODEX_PINNED_REASONING_ROLES`; `:79` `dispatchEffort` | C — `:79` is the sole thing keeping `dispatchEffort`/`normalizeTier` alive |
| `scripts/test-validation-allowband.js` | `:94` `isBookkeepingPath`; `:100`, `:103` `testConsumes`; `:108` `isValidationInvisible` | C |
| `scripts/test-outcome-recorder.js` | `:70` `refuse`; `:83` `OUTCOME_LOG_SCHEMA_VERSION`; `:88` `OUTCOME_CLASSIFICATIONS`; `:133` `PARENT_OWNED_SIDECARS`; `:157` `isParentOwnedSidecar`; `:200`, `:207` `appendOutcomeRecord` | C |
| `scripts/test-active-folders-field-parity.js` | `:17` `SHARED_STATE_FIELDS` | C |
| `scripts/test-claim-hardening.js` | `:36` destructures `writeFileAtomicReplace`, `NEXT_COMMAND`; `:2072`–`:2073` alias + `PARKED_LANE_PREFIXES` | C |

### Does any test assert the export COUNT or the full export list?

**No.** Swept for `Object.keys` / `Object.getOwnPropertyNames` / spread over any kernel alias across every
`.js` file: the only two hits are `test-kernel-conformance.js:68` (spreads `schema.KERNEL_RECORDS`, a
specific array) and `test-agent-model-resolver.js:28` (spreads the two `CODEX_PINNED_*` arrays). Neither
touches the export surface itself. Nothing counts exports; nothing enumerates them.

---

## Estimated deleted lines

Per copy, then ×4 (byte-identity must be preserved):

| item | lines |
|---|---|
| 21 bucket-A declarations + 3 dead internal declarations | 118 |
| their attached leading comment blocks | 117 |
| bucket-A `module.exports` lines | 21 |
| bucket-B `module.exports` lines | 18 |
| duplicate `canonicalJson` / `sha256Hex` keys (`:2021`–`:2022`) | 2 |
| orphaned comments (`:2012`, `:2019`–`:2020`, `:2031`–`:2041`) | 14 |
| **per copy** | **≈290** |
| **×4 byte-identical copies** | **≈1160** |

Sanity-checked against the executable prune, which removed **139** lines using declaration extents only
(no leading comments, no B unexports, no orphan comments) and left a file that parses, loads, and produces
identical values for all 72 survivors.

---

## Unresolved / stated honestly

1. **`mapTier` is a judgement call, not a fact.** Zero callers is measured. Whether to delete a function whose
   name is written into generated opencode agent prose (`sync-opencode-edition.js:247`, `:537`) is a decision
   about documentation coherence that I did not make. If it is deleted, that prose and 7 docs need the same edit.
2. **I did not run the four chains, the walkthrough, or the edition suites.** The brief forbade it (a sink
   transaction is merging this branch). What I proved instead is stronger for the A/B split but narrower in
   scope: the pruned kernel parses, loads, and is value-identical on every survivor, and no test or validator
   references any A/B symbol in executable position. A full-suite run is still the implementer's obligation
   before claiming this verified — **and note that per this repo's own rule the fast gate samples the
   walkthrough at 1/12, so a green fast gate would not confirm it.**
3. **Archived run records were excluded from the consumer surface, deliberately.** ~30 files under
   `kaola-workflow/archive/**/.cache/*.json` and historical `.md` contain A-list symbol names (e.g.
   `codexProfilePolicy` in `archive/issue-687…/review-attempts.json`). These are frozen run artifacts, not
   code; nothing loads them. I am confident this is correct, but it is a scoping decision worth stating.
4. **`.md` doc references are reported but not resolved.** Deleting bucket A leaves stale mentions in
   `CHANGELOG.md` and several ADRs. Per-symbol doc lists are in the A section. The `emit`/`answer` doc counts
   (≈50 files each) are **noise** — those are the English words and the `result: 'answer'` JSON token, not the
   symbols; do not chase them.
5. **One thing I could not fully settle: whether bucket B is worth doing at all.** Unexporting 18 symbols is
   provably safe, but it saves 18 lines and removes no code. The value is a smaller advertised surface, which
   is a design preference, not a measurement. I have no evidence bearing on that call.
