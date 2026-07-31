# impl-kernel-trim — evidence

**task**: Delete bucket A minus `mapTier` (20 symbols) + 3 orphaned internal declarations, unexport
bucket B (18 symbols), remove the duplicate `canonicalJson`/`sha256Hex` export pair and the three
orphaned comment blocks, in `scripts/kaola-workflow-adaptive-schema.js` and its three plugin copies,
ending byte-identical. Per the audit at `kaola-workflow/.origin/dead-exports-audit.md`.

**verification_tier**: regression-green

## write_set

Exactly four files, all byte-identical, pure deletions (0 insertions, 273 deletions each):

- `scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`

2090 → 1817 lines per copy. `git diff --numstat` = `0 273` on each; `git diff -U0 | grep -c '^+[^+]'` = 0.

**four-copy digest**: `c36ad01e0bb8d187244ba84cf8f817206d68ac719c84a0ca7fb36f60b9b03d7c`
(was `f73800301c7280476b38068496fc43c9bea78637c9b9df241d941fe54a39fd01`)

**export count**: 93 → **55** = 93 − 20 (A) − 18 (B), as predicted. Zero exports resolve `undefined`.

## Deviation from the brief: TIER_RANK demoted A → B

`TIER_RANK` was on the delete list, but `mapTier` was held by orchestrator decision, and `mapTier`'s
body reads it (`const rank = TIER_RANK[normalizeTier(tier)];`). Deleting it would have left `mapTier`
throwing `ReferenceError` on every call — and neither `node --check` nor `require()` would have caught
it, because the reference is inside a function body. Kept the definition and its comment block
(which documents the two-level compose `mapTier` implements and remains accurate); deleted only its
export line. Export count is unaffected either way.

## What was removed, by category

| category | content |
|---|---|
| tier/model cluster | `TIER_MODEL_CLAUDE` + comment, `dispatchModelClaude`, `TIER_MODEL_CODEX` + comment, `dispatchModelCodex` |
| codex policy | `codexProfilePolicy` |
| wait-budget cluster | 13-line comment, `WAIT_BUDGET_MINUTES`, `_DEFAULT`, `_CAP`, `waitBudgetFloor`, `waitBudgetMinutes` |
| opencode dispatch | `OPENCODE_PROVIDER_ENV`, `resolveOpencodeProvider`, `dispatchEffortOpencode`, `modelDisplay`, all with their comment blocks |
| lane staleness | `LANE_STALENESS_PROVENANCE` + comment |
| curated roots | `CURATED_ROOT_SET`, `isCuratedRoot`, `canonicalCuratedRoot`, with comments |
| envelope vocabulary | 21-line protocol comment, `emit`, `answer` (`refuse` kept — one test calls it) |
| sink progress | `deriveSinkProgressFromState` + 12-line comment |
| kernel records | `isKernelRecordPath` + comment |
| export literal | 20 A lines, 18 B lines, duplicate `canonicalJson`/`sha256Hex`, orphaned `#777` / `#761` / 11-line ADR 0013 comments |

## verification_commands

| command | result | exit |
|---|---|---|
| `node --check` ×4 | PARSE OK | 0 |
| `node -e "require(<each>)"` ×4 | loads | 0 |
| `Object.keys(...).length` ×4 | 55 | 0 |
| `shasum -a 256` ×4 | one digest | 0 |
| survivor parity vs `git show HEAD:` | 55 compared, **0 diffs** (value + function source) | 0 |
| 20 surviving functions exercised | no `ReferenceError`; `mapTier('reasoning','anthropic')` → `{variant:'max',…}` | 0 |
| member-access sweep, all 38 A/B symbols × 7 kernel aliases | **zero hits** | 0 |

## Stranding sweep across the whole deletion set (orchestrator follow-up 2)

The failure class `TIER_RANK` exposed — a deleted module-level binding still referenced from inside
a **surviving** function body, which both `node --check` and `require()` miss — was swept for
systematically rather than only on `mapTier`.

Method: strip comments and string/template/regex literals from the kernel, leaving executable code
only, then grep for all 24 removed identifiers (19 deleted A-symbols + the 3 internal declarations +
`REFUSAL_WHY` and `expansion_id`, which the audit says already resolve to nothing).

- **Result on all four copies: CLEAN — zero occurrences in executable code.**
- **Negative control**: the identical sweep on the pre-edit kernel (`git show HEAD:`) finds
  **52 live references**, so a zero is meaningful and not a broken stripper.
- **Positive control**: `TIER_RANK`, `normalizeTier`, `effortForProvider`, `mapTier`, `refuse`,
  `CURATED_ROOT_LC` all still show code lines after stripping.

**No further demotions are required. `TIER_RANK` was the only one.**

`effortForProvider` (mapTier's third dependency, :254) confirmed bucket C and safe: defined at :179,
exported at :1770, consumed in production by `scripts/sync-opencode-edition.js:506` and by 7
executable assertions in `scripts/test-opencode-edition.js` (:416, :426, :432, :439, :445 ×2).
All three of `mapTier`'s dependencies are intact — `normalizeTier` :61, `TIER_RANK` :139,
`effortForProvider` :179.

## Function-exercise check (orchestrator follow-up 3)

Added as a standing verification step, since export count and a clean `require()` both stay green
through this failure class.

- All **32** function-valued exports called with benign arguments in a sandboxed temp cwd:
  **zero ReferenceErrors**, on all four copies.
- A deeper probe drove every reader of the 18 unexported bucket-B symbols, and each returned a real
  value identical to the pre-edit kernel (paths/SHAs normalized):

| bucket-B symbol | exercised through | observed |
|---|---|---|
| `classifyRepoKind`, `parseRecordedVerdict`, `parseValidatedCandidateHash`, `headAdvanceIsValidationInvisible` | `evaluateChainReceipt` | reached `chains_green: true` |
| `attachChainsStaleDiagnostics`, `evaluateReleasePrepCarryOver`, `RELEASE_VERSIONED_JSON_FILES` | `evaluateReleaseReceipt` | reached `chains_stale` (the branch that calls them) |
| `detectSelfHostNpm` | `computeCodeTreeHash` | real 64-hex hash |
| `normalizeIssueNumbers` | `buildClaimIdentity` | `['9',7,7,'8']` → `[7,8,9]` (dedupe + sort) |
| `CLAIM_IDENTITY_FIELD_ORDER`, `parseStateFields` | `writeClaimIdentityBlock` | emitted `## Claim Identity` block |
| `CURATED_ROOT_PATHS` (via `CURATED_ROOT_LC`) | `extractCuratedRootPaths` | `["Dockerfile","package.json","Makefile"]` (case-folded) |
| `OUTCOME_RESULTS` | `buildOutcomeRecord` | in-vocab passes; out-of-vocab → `'other'` |
| `SELF_HOST_TEST_CONSUMED` | `testConsumes` | returned |
| `NODE_MODEL_TIERS`, `TIER_ALIASES`, `normalizeTier`, `CONTRACT_EFFORT_TABLE` | `dispatchEffort`, `mapTier` | legacy `opus`/`sonnet` aliases resolve as before |
| `TIER_RANK` (demoted) | `mapTier` | `reasoning`→`max`, `sonnet`→`high`, `haiku`→`null` |

Every probe was run against both the edited kernel and `git show HEAD:` and **diffed identical**.

## before_result / after_result

All suites green **before and after** — this is the regression evidence.

| suite | before | after |
|---|---|---|
| `test-oracle-kernel.js` | 48 assertions passed, exit 0 | 48 assertions passed, exit 0 |
| `test-kernel-conformance.js` | 255 assertions passed, exit 0 | 255 assertions passed, exit 0 |
| `validate-script-sync.js` | OK, exit 0 | OK, exit 0 |
| `validate-workflow-contracts.js` | passed, exit 0 | passed, exit 0 |
| `validate-kaola-workflow-contracts.js` | passed, exit 0 | passed, exit 0 |

Adjacent kernel-consuming suites, run after (not requested, run because bucket-B unexports could
plausibly reach them) — all exit 0: `test-agent-model-resolver`, `test-validation-allowband` (18),
`test-outcome-recorder` (85), `test-active-folders-field-parity` (61), `test-validation-runner`,
`test-opencode-edition` (442).

`validate-script-sync` reports `committed kernel parity: 4 Oracle Kernel copies identical at HEAD` —
it reads `git ls-tree HEAD`, so it is judging the four *committed* copies, which are still the
pre-edit ones. It does not see the working tree. It will keep passing after the orchestrator commits,
because the four new copies are identical to each other.

## Findings — stale comments left in place (deletions-only constraint)

Two comments attached to **kept** definitions now name deleted symbols. Fixing either requires
rewriting prose, which the brief excluded. Routing them rather than editing:

- `:56` (above `TIER_ALIASES`, kept) — names `dispatchEffortOpencode`, `dispatchModelClaude`,
  `dispatchModelCodex` as tier consumers that route through `normalizeTier`. All three are gone.
- `:366` (above `LANE_STALENESS_MS`, kept) — "tagged with `LANE_STALENESS_PROVENANCE`". Gone.
- export literal, Layer-0 registry comment — still says "the T2 record predicate", which was
  `isKernelRecordPath`. Gone.

`refuse` (bucket C, kept) lost its header comment: that comment documented the `emit`/`refuse`/`answer`
trio as a unit and, with two of the three deleted, described mostly absent functions. A replacement
one-liner would have been an addition.

## Declined to delete

- **`mapTier`** — held by orchestrator decision (shipped consumer docs name it).
- **`TIER_RANK` definition** — see deviation above; `mapTier` reads it.
- **`refuse`** — bucket C; `scripts/test-outcome-recorder.js:70` calls it.
- **`validate-kaola-workflow-contracts.js:566-589`** (the dead `emittedSkillTargets` loop the audit
  flagged) — outside my write set; not touched.
