# Lifecycle-script inventory for #1055

Investigated in worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`
at commit `5cb85515` (branch `workflow/bundle-1055`). No tracked file was edited. All facts below are
measured (grep/read/`node -e`) against this exact tree unless marked as a live-repo read (§6e), which
was run read-only against `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow` (the main
checkout) with `git worktree list`, `ls`, `git config --get-regexp`, `git for-each-ref`, `git log -1`
only — nothing was written or deleted.

## §1 claim → sink-merge symbols

`scripts/kaola-workflow-sink-merge.js:6` imports 11 symbols; two more (`worktreePathFor`,
`archiveProjectDir`) arrive via four lazy `require('./kaola-workflow-claim.js')` calls at lines 2177,
2327, 3079, 3282.

**Definer per symbol** (grep for `function <name>(` / destructure source in `kaola-workflow-claim.js`):

| Symbol | Defined in | Disposition |
|---|---|---|
| `getCoordRoot` | `kaola-workflow-adaptive-schema.js` (destructured at claim.js:21-22, forwarded in `module.exports`) | pure re-export |
| `mainRootFromCoord` | adaptive-schema (same destructure) | pure re-export |
| `resolveMainRoot` | adaptive-schema (same destructure) | pure re-export |
| `readActiveFolders` | `kaola-workflow-active-folders.js` (destructured at claim.js:7-15, forwarded) | pure re-export |
| `removeWorktree` | claim.js:577 (native `function`) | claim-native |
| `buildClosureReceipt` | claim.js:6607 | claim-native |
| `checkClosureInvariants` | claim.js:3246 | claim-native |
| `defaultBranch` | claim.js:703 | claim-native |
| `appendClosureBlock` | claim.js:2616 | claim-native |
| `clearAdvisoryClaim` | claim.js:980 | claim-native |
| `resolveProjectSlug` | claim.js:351 | claim-native |
| `worktreePathFor` (lazy) | claim.js:372 | claim-native |
| `archiveProjectDir` (lazy) | claim.js:2706 | claim-native |

Claim's own export block, verbatim (`scripts/kaola-workflow-claim.js:6817-6885`):

```
module.exports = {
  archiveProjectDir,
  buildBranchName,
  buildClosureReceipt,
  checkClosureInvariants,
  claimBundle,
  claimExplicitBundle,
  claimExplicitTarget,
  claimProject,
  buildClaimAnchors,
  collectStale,
  defaultBranch,
  ghExec,
  isSafeBranchArg,
  assertSafeBranchArg,
  assertNoNewline,
  classifyWorktreeError,
  resolveCodexDispatchModeFlag,
  CODEX_DISPATCH_MODE_IGNORED_NOTE,
  computeClosePendingFinalize,
  isProbeDegraded,
  removeBranch,
  removeBranchIfMerged,
  postAdvisoryClaim,
  clearAdvisoryClaim,
  resolveProjectSlug,
  cmdAuditLabels,
  cmdLegacyWorktreeCleanup,
  cmdRepairLabels,
  cmdStaleWorktreeCleanup,
  deriveRunPosture,
  getCoordRoot,
  mainRootFromCoord,
  resolveMainRoot,
  resolveSessionMarker,
  legacySiblingWorktreePathFor,
  projectNameForIssue,
  provisionWorktree,
  readActiveFolders,
  readPriorityConfig,
  removeWorktree,
  worktreePathFor,
  verifyImplPublished,
  verifyArchiveComplete,
  cmdVerifySink,
  closeIssueIdempotent,
  sanitizeBarrierTag,
  sweepBarrierRefs,
  cmdBarrierRefSweep,
  mirrorFinalizationArtifacts,
  probeImplementationCommit,
  checkFinalizeStagingGuard,
  appendClosureBlock,
  treeDirty,
  commitDiscardArchive
};
```

Adaptive-schema's export block, the requested range (`scripts/kaola-workflow-adaptive-schema.js:1869-1908`
truncated to the asked-for window, verbatim from 1869):

```
module.exports = {
  LANE_STALENESS_MS,
  SHARED_STATE_FIELDS,
  PARKED_LANE_PREFIXES,
  parsePorcelainPaths,
  splitNulPaths,
  unquoteCStyle,
  isParkedLanePath,
  getCoordRoot,
  mainRootFromCoord,
  resolveMainRoot,
  ADAPTIVE_PATH,
  NEXT_COMMAND,
  NEXT_SKILL,
  PLAN_FILE,
  ...
```

Active-folders' export block, verbatim (`scripts/kaola-workflow-active-folders.js:289-299`):

```
module.exports = {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  probeIssueState,
  prefetchIssueStates,
  getIssueStateSnapshot,
  __resetIssueStateMemo,
  readActiveFolders
};
```

**Identity check** (`node -e`, run from the worktree root; no observable side effect — clean exit,
no stray output beyond the four printed booleans):

```
$ node -e "
const claim = require('./scripts/kaola-workflow-claim.js');
const schema = require('./scripts/kaola-workflow-adaptive-schema.js');
const af = require('./scripts/kaola-workflow-active-folders.js');
console.log('getCoordRoot ===', claim.getCoordRoot === schema.getCoordRoot);
console.log('mainRootFromCoord ===', claim.mainRootFromCoord === schema.mainRootFromCoord);
console.log('resolveMainRoot ===', claim.resolveMainRoot === schema.resolveMainRoot);
console.log('readActiveFolders ===', claim.readActiveFolders === af.readActiveFolders);
"
getCoordRoot === true
mainRootFromCoord === true
resolveMainRoot === true
readActiveFolders === true
```

All four are `===` identical objects across the module boundary: **pure re-export**, not wrappers.
The other nine symbols consumed by sink-merge (`removeWorktree`, `buildClosureReceipt`,
`checkClosureInvariants`, `defaultBranch`, `appendClosureBlock`, `clearAdvisoryClaim`,
`resolveProjectSlug`, `worktreePathFor`, `archiveProjectDir`) are **claim-native** — defined as
`function` declarations inside `kaola-workflow-claim.js` itself, with no forwarding source.

## §2 gitlab/gitea `getCoordRoot` count (5 vs canonical's 2)

**Canonical** (`scripts/kaola-workflow-sink-merge.js`): `getCoordRoot` appears at line 6 (import) and
line 3145 (single call). Line 3145-3146:

```
  // Resolved once for BOTH entry points, in the order each of them used to resolve it for itself.
  const coordRoot = getCoordRoot();
  const mainRoot = mainRootFromCoord(coordRoot);
```

`coordRoot`/`mainRoot` are then reused as local variables through the rest of `main()` — resolved
exactly once.

**gitlab** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`): import line 9
destructures `getCoordRoot` (NOT `mainRootFromCoord`, not `resolveMainRoot`); the file carries its own
local `function mainRootFromCoord(coordRoot) { return path.basename(coordRoot) === '.git' ?
path.dirname(coordRoot) : coordRoot; }` at line 691-693 — logically identical to adaptive-schema's
(`scripts/kaola-workflow-adaptive-schema.js:819-822`, same body) but a hand-duplicated copy, not an
import. Four call sites each re-invoke the composition `mainRootFromCoord(getCoordRoot(root))` inline
(lines 669, 1138, 1150, 2801) instead of hoisting to one `coordRoot`/`mainRoot` pair — hence
1 import + 4 calls = 5 references to `getCoordRoot`. **gitea** is byte-for-byte the same shape (own
`function mainRootFromCoord`, same 4-call inline-composition pattern; confirmed via the same grep, not
reproduced in full above).

**Mechanism**: `scripts/kaola-workflow-sink-merge.js` is a `COMMON_SCRIPTS` entry in
`scripts/validate-script-sync.js` (line 44), which enforces **byte-identity only between
`scripts/` (Claude) and `plugins/kaola-workflow/scripts/` (Codex/GitHub)** — confirmed identical via the
grep of that file's `getCoordRoot` line count (also 2). The gitlab/gitea sink-merge ports are explicitly
excluded from that group. `validate-script-sync.js:400-403` states outright: gitlab/gitea sink-merge and
friends are "**DIVERGENT hand-ports** (not rename-normalized, ~757 vs ~873 lines) so they are NOT in the
byte / rename families above." The only cross-tree guard that DOES apply to them is
`FORGE_EXPORT_SUPERSET_FAMILY` (`validate-script-sync.js:428-431`): it `require()`s the canonical and
each forge port and asserts `Object.keys(port) ⊇ Object.keys(canonical) \ canonicalOnly` — a check on
**exported symbol names only**, never on import shape, call count, or internal logic.
`scripts/edition-sync.js`'s `GENERATED_AGGREGATORS` list (release, gap-sweep, run-chains) does NOT
include sink-merge, so no generator ever regenerates the gitlab/gitea sink-merge files from canonical
either — `edition-sync.js` is confirmed to have no `writeFileSync` touching sink-merge, and
`validate-script-sync.js` has no `writeFileSync` calls at all (grep returned nothing) — it is a
**validator only**, never a writer, for any of the checks discussed here.

**Disposition**: gitlab/gitea sink-merge is a **hand-maintained divergent port**. The extra
`getCoordRoot` calls are a direct, measured consequence: the gitlab/gitea copies never received the
"resolve once, reuse the variable" refactor canonical carries (visible in canonical's own comment at
line 398, "`mainRootFromCoord` is now imported from `kaola-workflow-claim.js` (#579 shared resolver)"),
and instead still locally define and repeatedly re-derive `mainRootFromCoord(getCoordRoot(...))` at
each of 4 call sites. No divergence in *behavior* was found (the local `mainRootFromCoord` body is
functionally identical to the shared one) — the divergence is import structure / call-count only, and
it passes every guard that currently runs against it.

## §3 sink-pr.js and `defaultBranch`

`scripts/kaola-workflow-sink-pr.js:11`: `const { defaultBranch } = require('./kaola-workflow-claim.js');`
— the only symbol imported from claim.

**Definition** (`scripts/kaola-workflow-claim.js:703-729`): a 3-stage offline-safe probe chain —
(1) local `git symbolic-ref --short refs/remotes/origin/HEAD` (no network); (2) if not
`KAOLA_WORKFLOW_OFFLINE`, `git remote show origin` parsed for `HEAD branch: <name>`; (3)
`git ls-remote --symref origin HEAD` parsed for `ref: refs/heads/<name>`; falls back to `'main'`.
Its only claim-internal dependencies are top-of-file imports (`execFileSync` from `child_process`),
the module-level `OFFLINE` constant (`process.env.KAOLA_WORKFLOW_OFFLINE === '1'`, claim.js top of
file), and the module-level `REMOTE_TIMEOUT_MS` constant (claim.js:33). No dependency on any other
claim-native function.

**Adaptive-schema equivalent**: none — `grep -n defaultBranch scripts/kaola-workflow-adaptive-schema.js`
returns nothing. `defaultBranch` is claim-native only.

**gitlab/gitea sinks — same pattern, confirmed**:
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js:13`:
  `const { defaultBranch } = require('./kaola-gitlab-workflow-claim');`, used at line 207 inside a
  `try { targetBranch = defaultBranch(root) || 'main'; } catch (_) { targetBranch = 'main'; }`.
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js:13`:
  `const { getCoordRoot, readActiveFolders, defaultBranch } = require('./kaola-gitea-workflow-claim');`,
  same fallback pattern at line 220.

**Load cost, measured** (`node -e "console.time(...);require(...);console.timeEnd(...)"`, 3 runs each,
cold `require` cache per process):

| Module | Load time (3 runs) |
|---|---|
| `scripts/kaola-workflow-claim.js` | 9.389ms, 9.200ms, 9.132ms |
| `scripts/kaola-workflow-adaptive-schema.js` | 1.609ms, 1.577ms, 1.587ms |

`claim.js` (6885 lines) costs roughly 6x adaptive-schema's load time to require solely for
`defaultBranch` (a ~26-line function with no claim-internal dependency graph beyond three
module-level constants already computed at claim.js's own top-of-file). This is a measured number,
not a judgement about whether the cost matters.

## §4 Cross-consumer table (claim symbols vs the named module set)

Named module set per the brief: sink-merge, sink-pr, validation-runner, run-chains, telemetry-report,
active-folders, walkthrough. Grep of every production (non-`test-*`) file for
`require(['"]\./kaola-workflow-claim`:

```
kaola-workflow-sink-merge.js
kaola-workflow-sink-pr.js
simulate-workflow-walkthrough.js   (in-process require, ONE symbol: readPriorityConfig, line 4804)
validate-workflow-contracts.js     (in-process require, line 742, ONE symbol: mirrorFinalizationArtifacts,
                                     used only as `typeof claimModule.mirrorFinalizationArtifacts ===
                                     'function'` — an export-existence assertion, not a functional call)
```

`kaola-workflow-run-chains.js`, `kaola-workflow-telemetry-report.js`,
`kaola-workflow-active-folders.js`, and `kaola-workflow-validation-runner.js` (the actual file behind
"validation-runner" — distinct from `validate-workflow-contracts.js`) **do not `require` claim.js at
all** (confirmed by grep — zero hits in each). `run-chains.js` requires `adaptive-schema` and its own
`kaola-workflow-validation-runner.js` module instead (lines 145, 154); `active-folders.js` is upstream
of claim (claim requires it, never the reverse).

The walkthrough also drives claim.js as a **spawned CLI subprocess** for nearly everything else (the
`argv.join(' ')` diagnostic at walkthrough:2721 and the `claimScript` path built at walkthrough:42
confirm this is the dominant mode of walkthrough↔claim interaction, not module-level require).

**Symbol → definer → consumers, restricted to the named set** (only in-process `require`, not CLI
spawn, not text-grep assertions):

| Symbol | Definer | Consumers (named set) |
|---|---|---|
| `defaultBranch` | claim-native | sink-merge.js, sink-pr.js — **2 consumers** |
| `readPriorityConfig` | claim-native | walkthrough.js only — 1 consumer |
| `mirrorFinalizationArtifacts` | claim-native | validate-workflow-contracts.js only, export-check only — 1 consumer, non-functional use |
| `getCoordRoot`, `mainRootFromCoord`, `resolveMainRoot`, `readActiveFolders`, `removeWorktree`, `buildClosureReceipt`, `checkClosureInvariants`, `appendClosureBlock`, `clearAdvisoryClaim`, `resolveProjectSlug`, `worktreePathFor`, `archiveProjectDir` | mixed (see §1) | sink-merge.js only — 1 consumer within this set |

**Disposition**: within the seven named modules, `defaultBranch` is the **only** claim symbol consumed
by more than one of them through the claim.js module boundary. Note this table is scoped to the seven
named modules only — `getCoordRoot`/`mainRootFromCoord`/`resolveMainRoot` are re-exports of
adaptive-schema, and adaptive-schema itself is required directly (bypassing claim) by 18 other
production files (measured: `grep -rl "require(.*kaola-workflow-adaptive-schema" scripts/*.js | grep -v
test- | wc -l` → 18); similarly `readActiveFolders`'s true definer, active-folders.js, is required
directly by `kaola-workflow-classifier.js` and `kaola-workflow-closure-audit.js` in addition to claim.
Those broader-than-claim consumer counts are **outside** the seven-module scope the brief specified and
are noted here as an unknown-relevance fact, not folded into the table.

## §5 Cursor host adaptation in claim.js

`grep -n -i cursor scripts/kaola-workflow-claim.js` returns 54 lines total (comments + code). The
functional block spans **lines 1959-2236** (helper functions) plus two call sites in the CLI command
handlers:

| Lines | Function | What it does |
|---|---|---|
| 1968-1972 | `installedCursorSurfaceHelperPath()` | Resolves `$CURSOR_HOME` (or `~/.cursor`) `/kaola-workflow/scripts/kaola-workflow-cursor-surface.js` — the installed helper path. |
| 1977-1979 | `isCursorCliLocalWorkflowPath(args)` | True iff `normalizeHostIdentityToken(args.runtime) === 'cursor'` and the args match a Cursor CLI/local Workflow shape. |
| 1983-1984 | `CURSOR_CLI_DEMONSTRATED_ANCESTOR_HOPS = 8`, `CURSOR_CLI_VERSIONED_INDEX_RE` | Constants: max ancestor-process walk depth; regex matching a versioned `.../YYYY.MM.DD-<hash>/index.js` Cursor CLI executable path. |
| 1990-1995 | `isDemonstratedCursorCliExecutable(tokens)` | True if a `cursor-agent` basename or the versioned-index regex matches one of the parent's argv tokens. |
| 2040-2118 | `parseDemonstratedCursorParentArgv(tokens)` | Parses a captured parent argv for `--workspace <path>` / `--workspace=<path>` (line 2046-2053), collecting the unquoted remainder until the next `--<flag>`. |
| 2119-2132 | `demonstratedCursorWorkspaceApplies(workspace)` | Validates the discovered workspace value. |
| 2133-2156 | `inspectDemonstratedCursorParent()` | Walks up to 8 ancestor PIDs (`process.ppid` at 2134, then `ps -p <pid> -o ppid=` at line 2092-2097 for each further hop) reading each ancestor's argv, looking for a demonstrated Cursor CLI executable with an applicable `--workspace`. |
| 2157-2170 | `applyDemonstratedCursorCliHost(args)` | If `args.runtime === 'cursor'` and `args.cursorWorkspace` is unset, fills it from the ancestor-process inspection. |
| 2173-2182 | `resolveCursorCliEnsureTarget(args, invokingRoot, recordedMainRoot)` | Calls `applyDemonstratedCursorCliHost`, then resolves the ensure-target: explicit `--cursor-workspace` wins, resume falls back to the recorded `main_root`. |
| 2184-2191 | `cursorPrepEnvelope(body)` | Builds the `{ cursor_prep: {...} }` output envelope fragment. |
| 2193-2203 | `refuseCursorPrep(args, diagnostic)` | Emits a `cursor_prep_failed` typed refusal. |
| 2204-2236 | `ensureCursorCliLocalPrep(root, args)` | The entry point: applies host detection, and if this is a Cursor CLI local-workflow path, `spawnSync`s the installed `kaola-workflow-cursor-surface.js --ensure-target <root> --forge=github --json` helper (120s timeout) and validates its JSON `status` is `current` or `materialized`; refuses otherwise. |

**Reachability**: `ensureCursorCliLocalPrep` / `resolveCursorCliEnsureTarget` are called from exactly two
places: `cmdStartup()` (call site claim.js:2398-2401, `#1052: Cursor CLI/local Repo prep is fail-closed
*before* claim mutation`) and `cmdResume()` (call site claim.js:2592-2601). CLI dispatch confirms only
`startup`/`bootstrap` (claim.js:6795) and `resume` (claim.js:6799) reach this code; no other subcommand
(`status`, `finalize`, `sink-fallback`, `verify-sink`, etc.) touches it.

**Tests**: `scripts/test-issue-1052-cursor-cli-startup-prep.js` (1672 lines) is the dedicated pin — it
spawns `kaola-workflow-claim.js` as a subprocess with `CURSOR_HOME` pointed at a fixture and asserts on
the observed `cursor_prep` envelope / refusal shape, not on the internal functions directly. No
`test-claim-*.js` file mentions "cursor" (grep, zero hits). `scripts/test-cursor-edition.js` exists but
tests a **different** concern entirely — the Cursor install/sync EDITION surface
(`kaola-workflow-cursor-surface.js`, `sync-cursor-edition.js`, `install-cursor.sh`), not the claim.js
ancestor-process detection.

**Duplication check**: grep for `-i cursor` in `kaola-workflow-adaptive-schema.js`,
`kaola-workflow-sink-merge.js`, `kaola-workflow-validation-runner.js` found only unrelated matches — the
identifier `cursor` used as a generic string/array-walk loop variable (e.g.
`kaola-workflow-adaptive-schema.js:189-194`, `kaola-workflow-validation-runner.js:421-424`), not the
Cursor host. **Disposition: single-sited in claim.js** — no duplication of the ancestor-process /
`--workspace` detection mechanism anywhere else in the three other modules checked.

## §6 Conditional legacy items (inventory only)

### 6a. Legacy (non-`--sink`) pipeline in sink-merge.js

`main()` spans `scripts/kaola-workflow-sink-merge.js:3113-3414` (302 lines). The `--sink` branch is a
short dispatch at lines 3169-3178:

```
  if (isSinkMode) {
    const defBranch = defaultBranch(mainRoot);
    try { process.chdir(os.tmpdir()); } catch (_) {}
    const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
    args.issueNumbers = memberSet.members;
    args.member_source = memberSet.source;
    runSinkTransaction(args, mainRoot, defBranch);
    return;
  }
```

Everything from line 3179 to the end of `main()` (line 3414) — **236 lines** — is the legacy
(non-`--sink`) body: fetch, `assertCleanWorktree`, `assertNoLiveWorkflowFolder`,
`assertBranchPushedToUpstream`, `assertBranchHasNonWorkflowChanges`, `assertWorktreeClean`, worktree
removal + `.cache` union-stage, checkout, merge-base skip-check, `doRebase`, `ffMergeLoop`,
`postMergeCleanup`.

Of the helper functions that body calls, most (`deriveMemberSet`, `assertWorktreeClean`, `doRebase`,
`ffMergeLoop`, `sinkCopyDir`, `sinkLandStagedUnion`, `armStagedJournalNote`, `disarmStagedJournalNote`)
are **shared** — each has a second call site inside `runSinkTransaction` (line 2006 onward, calls at
2084, 1773/2226/2244/2306/2187/2309 etc. — measured via `grep -c` on each name, 3-4 sites vs. definition
+ 1). But five are **legacy-exclusive** (exactly 2 grep hits: definition + the one legacy-body call):

| Function | Lines | Approx. size | Legacy-exclusive? |
|---|---|---|---|
| `assertCleanWorktree` | 455-477 | 23 | yes (only call: line 3231) |
| `assertNoLiveWorkflowFolder` | 478-538 | 61 | yes (only call: line 3232) |
| `assertBranchHasNonWorkflowChanges` | 643-680 | 38 | yes (only call: line 3248) |
| `assertBranchPushedToUpstream` | 681-744 | 64 | yes (only call: line 3246) |
| `postMergeCleanup` | 912-1221 | 310 | yes (only call: line 3408) |

Legacy-exclusive total: approximately 236 (main-body) + 23 + 61 + 38 + 64 + 310 = **~732 lines**.

**Tests exercising the legacy path**: `scripts/test-sink-merge.js` defines a dedicated
`runSinkLegacy`/`runSinkLegacyAt` helper pair (lines 372-395), distinct from `runSink`/`runSinkAt`
(the `--sink` runner). Comment at line 378-380: "The LEGACY (non-`--sink`) entry point... is the only
way to drive [the two branch-shape preconditions] end to end." Call-site counts: `runSinkLegacy(` — 5,
`runSinkLegacyAt(` — 6, vs. `runSink(` — 41. The legacy path is also driven, via
`assertLegacyEntryPointHoldsTheSameLine973` (line 4514) and `assertLegacyOwnLaneContentStillSinks973`,
across **all four editions** (root/codex/gitlab/gitea) in a `.forEach` loop at test-sink-merge.js:4640
that iterates `[['root', scripts/...], ['codex', plugins/kaola-workflow/...], ['gitlab', ...],
['gitea', ...]]` — confirmed no `runSinkLegacy` symbol appears in the gitlab/gitea plugin-local test
files (`test-gitlab-sinks.js`, `test-gitea-sinks.js` — both grep to zero hits), so the four-edition
legacy-path coverage lives entirely inside canonical `test-sink-merge.js`, parametrized over script
paths.

**Documentation**: `docs/api.md:985-1013+` documents this split explicitly under "**Pre-merge guards**
(all three editions). **Which path runs them is not uniform, and the difference is load-bearing**":
it names all four pre-merge guards, states only `worktree_dirty` runs on `--sink` (via
`sinkPreflight`), and that `assertNoLiveWorkflowFolder`, `assertBranchHasNonWorkflowChanges`, and
`assertBranchPushedToUpstream` are legacy-path only — with an explicit note that their absence on
`--sink` means different things per-guard (not simply "redundant"), and that
`assertBranchHasNonWorkflowChanges`'s absence is "a real difference in behaviour" (constructed/measured:
the legacy path stops with `no_implementation_changes`; `--sink` merges, pushes, and closes on the same
fixture). **Disposition: live, documented public interface**, not dead code — it is the sole
end-to-end driver of two of its five exclusive guard functions and is measured 4x in a dedicated
cross-edition parity test, but it is a much smaller fraction of production test-invocation volume
than `--sink` (11 legacy invocations vs. 41 `--sink` invocations in `test-sink-merge.js`, plus the
973-numbered 4-edition sweep).

### 6b. Legacy/deprecated flags

Grep for `deprecated|DEPRECATED` in claim.js and sink-merge.js: sink-merge.js has zero hits;
claim.js has one incidental comment mention (line 6779, "a deprecated flag") with no matching literal
flag definition nearby. The real signal is `retired`/`RETIRED`/`IGNORED_NOTE`/`warn-and-ignore`, which
identifies three **accept-and-ignore CLI flags**, all in claim.js only (none in sink-merge.js — its
"retired" hits, e.g. lines 1148, 1462, 1757, refer to retired **data fields** in the closure receipt,
not CLI flags):

| Flag | Issue | Behavior |
|---|---|---|
| `--codex-dispatch-mode` | #775 | `resolveCodexDispatchModeFlag` (claim.js:85-88) returns `{present: bool}`; value never validated or persisted. `CODEX_DISPATCH_MODE_IGNORED_NOTE` (line 81-82): `"note: --codex-dispatch-mode has no effect; v2-task-name is the only dispatch mode. Ignoring."` |
| `--workflow-path` | #770 | Stays a `KNOWN_VALUE_FLAGS` entry (claim.js:146-152) so it is never rejected as `unknown_flag`; prints `"--workflow-path is retired; running adaptive"` once per process (latch `workflowPathRetiredWarned`, line 91-93), the captured value is never read by selection logic. |
| `--attest-contractor-spawn` | #816 | Parsed and immediately discarded (claim.js:136-143); prints `FINALIZE_ATTEST_FLAG_RETIRED_NOTE` (line 96-98): `"note: --attest-contractor-spawn has no effect; the finalize seam is orchestrator-owned and records no dispatch attestation. Ignoring."` once per process (latch `finalizeAttestFlagRetiredWarned`). |

`--keep-issue-open` (claim.js:127-133) is a live alias for `--keep-open`, not a deprecation — both
remain functional; excluded from the table above.

**Disposition**: `documented public interface (deprecation shim)` for all three — each is a
deliberate, load-bearing backward-compatibility surface (a caller still passing the old flag must not
hit `unknown_flag`), not residue.

### 6c. Legacy state blocks in workflow-state.md readers

`removeLegacyStateBlocks(content)` (claim.js:944-971) strips, from `workflow-state.md` content on
write: retired H2 blocks `## Lease`, `## Current Position`, `## Last Evidence`, `## Last Updated`,
and 19 retired fields (`session_id`, `owner_session_id`, `last_heartbeat`, `claim_comment_id`,
`expires`, `phase`, `phase_name`, `workflow_path`, `step`, `next_command`, `next_skill`,
`main_session_role`, `implementation_owner`, `fix_owner`, `inline_emergency_fallback_authorized`,
`runtime`, `phase_file`, `cache_file`, `last_command`, `last_result`). Called at two sites: claim.js:2749
(inside `archiveProjectDir`) and claim.js:4695 (inside the terminal-state stamper, alongside
`stampTerminalState`). This is a **write-time sanitizer** (strips legacy blocks when a file is next
touched), not a read-time tolerant-parse path.

Additional legacy-tolerant markers found in `kaola-workflow-adaptive-schema.js`:
- `PLAN_FILE = 'workflow-plan.md'` (line 62-65): comment states this is "the retired frozen-plan
  artifact. Kept only as a name: the finalize mirror still has to recognise a legacy project folder
  that carries one, and nothing authors it any more."
- `fast-summary.md` (line 1096-1097): "legacy marker, never newly authored; both readers (classifier
  scope parse, router folder detection) are tolerant."
- `/^phase[0-9]+-[a-z-]+\.md$/` (line 1098-1099): "retired fast/full-path phase artifacts; never newly
  authored, read only tolerantly."
- A legacy `headSha`-only chain-receipt shape (lines 1390-1395, 1549-1552): freshness check "PREFERS
  the `codeTreeHash` content address and FALLS BACK to the `headSha` pin for a legacy receipt that
  predates the field."

`active-folders.js`: zero "legacy" hits.

**Disposition**: `documented public interface (backward-compat tolerant read / write-time strip)` for
all of the above — each is an explicit, commented compatibility path, none flagged as unreachable.

### 6d. Legacy worktree layout

`legacySiblingWorktreePathFor(root, project)` (claim.js:377-379) computes the OLD sibling-container
worktree path: `<dirname(mainRoot)>/<basename(mainRoot)>.kw/<project>` — as opposed to the current
`worktreePathFor` layout, `<mainRoot>/.kw/worktrees/<project>` (claim.js:372-375). It is consumed by
exactly one caller, `cmdLegacyWorktreeCleanup()` (claim.js:6633-6638, comment: "AC3 (#264): discover and
remove worktrees that were provisioned under the OLD sibling-container path
`<parent>/<repo>.kw/<project>`"), which is a **dedicated CLI subcommand**
(`legacy-worktree-cleanup`, listed in `USAGE` at claim.js:6760) — dry-run by default, requiring
`--execute` plus one of `--archive`/`--export`/`--force` to actually remove anything. No fallback READ
of the legacy layout was found elsewhere (worktree resolution always uses the current
`worktreePathFor` shape); this is a **standalone migration/cleanup tool**, not an active dual-layout
read path. `adaptive-schema.js` and `active-folders.js` carry no worktree-layout fallback of any kind
(grep for `.kw\b` in adaptive-schema returns only the current `PARKED_LANE_PREFIXES` declaration
`.kw/worktrees/`, `.kw/legs/`; zero hits in active-folders.js).

**Disposition**: `documented public interface (dedicated migration command)`, not a read-path fallback.

### 6e. Barrier references

`grep -c -i barrier scripts/kaola-workflow-claim.js` → **42** (matches the brief). `grep -c -i barrier
scripts/kaola-workflow-adaptive-schema.js` → **1**.

**claim.js's 42 hits group into three mechanisms:**

1. **Origin/provenance comment** (claim.js:2658-2667): states the ref namespace
   `refs/kaola-workflow/barrier/<tag>/<node>` was anchored by "the retired DAG-era barrier machinery
   (`adaptive-node.js` / `plan-validator.js`, both since deleted)". Confirmed: neither file exists
   anywhere in the current tree (`find ... -iname "*adaptive-node*" -o -iname "*plan-validator*"`,
   zero hits, main checkout). `sanitizeBarrierTag(name)` (claim.js:2669+) reproduces that deleted
   producer's exact tag computation so today's code can still match its orphaned refs by name.
2. **Archive-time auto-reap** (claim.js:2912-2925, inside `archiveProjectDir`): on archiving a project,
   computes `barrierTag = sanitizeBarrierTag(project)`, builds the prefix
   `refs/kaola-workflow/barrier/<tag>/`, and reaps matching dangling refs for that one project as part
   of the normal archive flow — this branch is **live**, exercised on every archive.
3. **Manual keep-set sweep** (claim.js:5837-6056: `listBarrierSweepWorktreeRoots`, `sweepBarrierRefs`,
   `cmdBarrierRefSweep`): a **dedicated CLI subcommand**, `barrier-ref-sweep` (claim.js:6760 USAGE,
   6809 dispatch), computing a KEEP set from every active `kaola-workflow/<project>/` folder ∪ every
   currently-registered `git worktree list --porcelain` root, then deleting any
   `refs/kaola-workflow/barrier/<tag>/*` ref whose tag is not in that set. Exported for direct unit
   coverage (claim.js:6869-6873, comment: "#686: barrier-ref archive-time reap (`sanitizeBarrierTag`) +
   the legacy keep-set sweep (`sweepBarrierRefs`, `cmdBarrierRefSweep`)").

**adaptive-schema.js's 1 hit** (line 1312, inside `snapshotWorktree`): a temp-index filename,
`kw-barrier-idx-<pid>-<tag>`, used for a throwaway `GIT_INDEX_FILE` during a worktree snapshot. Read in
full context (lines 1306-1318): this has **no relationship** to the git-ref barrier mechanism above —
it is an unrelated, currently-active naming convention for a scratch git index file, not a
compatibility read. Coincidental shared word, not shared code.

**Live-repo READ-ONLY check** (main checkout `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`,
non-mutating commands only):

```
$ git -C .../kaola-workflow worktree list
/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow                           5cb85515 [main]
/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055 5cb85515 [workflow/bundle-1055]

$ ls .../kaola-workflow/kaola-workflow/
archive
bundle-1055

$ ls .../kaola-workflow/.kw/
legs
worktrees

$ git -C .../kaola-workflow config --get-regexp barrier
(exit code 1 — no matching config keys)

$ git -C .../kaola-workflow for-each-ref refs/kaola-workflow/barrier | wc -l
260
```

260 `refs/kaola-workflow/barrier/*` refs are present, spanning tag names from `bundle-617-618` through
`issue-686`. Sampling commit dates: the earliest sampled (`bundle-617-618/n1-fix-617`) is
`2026-07-07 06:11:29 +0800`; the latest sampled (`issue-686/n5-finalize`) is `2026-07-15 06:31:17
+0800`. Current `HEAD` is `2026-09-09 22:41:06 +0800` — roughly 8-9 weeks newer than the youngest
sampled barrier ref, with no refs found beyond `issue-686` in the tag-name range scanned. This is
consistent with (but does not by itself prove) the producer having stopped around issue #686 and the
refs never having been reaped since — `cmdBarrierRefSweep` is a manual, operator-invoked subcommand,
not run automatically, so 260 refs accumulating unreaped is unsurprising if nobody has run
`barrier-ref-sweep` since the producer was retired. No barrier-related `git config` keys exist.

**Disposition**: `live` for the archive-time auto-reap (exercised on every archive) and for
`cmdBarrierRefSweep` (a live, exported, dedicated cleanup command) — both are current maintenance
code operating on refs from a **dead producer**. `sanitizeBarrierTag` is `live` as the shared naming
function both reap paths depend on. The 260 refs themselves are `unknown: not measured whether any
newer barrier ref exists beyond the sampled range, and not measured whether cmdBarrierRefSweep has
ever been run on this machine` — presence is confirmed, staleness is inferred from date sampling only,
not proven for every ref. adaptive-schema's single hit is `dead relationship to the barrier-ref
mechanism` (unrelated code, coincidental name) but itself `live` as a scratch-index helper.
