# Mission 10 part 1 — items 29 + 31 (implementer: impl-1054-constants)

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1054`

## UPDATE 3 — applied the two authorized fixture fixes (mission complete)

Applied, exactly as authorized, in `scripts/test-install-model-rendering.js`: added one
`fs.copyFileSync` line each in `withHookUpdateFixture` (now ~line 743-745) and its `--atomic`
sibling (now ~line 1099-1101), copying `kaola-workflow-adaptive-schema.js` alongside
`install-codex-agent-profiles.js` into the isolated fixture's `scripts/` dir — same pattern as the
existing copy, no assertion touched. `node -c` clean.

**Result: `node scripts/test-install-model-rendering.js` → exit 1** (not the module-resolution
failure — that one is gone; confirmed by running it). The "Cannot find module
'./kaola-workflow-adaptive-schema'" error is fully resolved: the test now progresses far past both
fixture blocks into later mutation-fixture assertions before failing.

**New failure, exactly as you predicted — a stale wording pin, not caused by my fix:**
`AssertionError: description metadata drift: mutation must change config bytes` at
`scripts/test-install-model-rendering.js:1467` (`assert.notStrictEqual(mutated, canonical, …)`, inside
the `for (const fixture of cases)` mutation loop). The `'description metadata drift'` fixture
(defined at lines 1366-1370) does
`text.replace('description = "Precision-first code review specialist', 'description = "Drifted code
review specialist')` — but the live `code-reviewer` description (rendered into `config/agents.toml`
by the current `templates/agents/behavior-contracts.json`) no longer contains "Precision-first code
review specialist" anywhere (it now reads "Code reviewer. Independently examines a frozen candidate
for real defects it introduces…"), so the `.replace()` is a no-op and `mutated === canonical`, tripping
the assertion. This is a concurrent wording-pin removal by tdd-1054-roles's role-redesign work, per
your prediction — not something my fixture-copy change touches or caused.

**Same stale pin recurs at 3 more locations in the same file — reporting all four so the fix lands in
one pass:** `grep -n "Precision-first code review specialist" scripts/test-install-model-rendering.js`
→ lines **1368** (the one that fired), **2836**, **3033**, **3558**. The other three are later in the
file and unreached by this run (it throws at the first failure), but carry the identical stale
substring and will very likely fail the same way once 1368 is fixed. I did not touch any of these —
routing per your instruction to whoever owns that wording pin.

Not touched, per your instruction: `test-agent-model-resolver.js` (already resolved by
tdd-1054-roles), the `#970` walkthrough assertion (routed to tdd-1054-finalize), the stale
`docs/workflow-state-contract.md` ~177 sentence (routed to the docs agent).

Files changed this pass: `scripts/test-install-model-rendering.js` (2 mechanical fixture lines only).

## UPDATE 2 — run-gaps-manual.md kernel-table row + two reported test failures (third pass)

### run-gaps-manual.md removed from KERNEL_ARTIFACT_REGISTRY (done)

Removed the `['.cache/run-gaps-manual.md', 'record', 'evidence', 'agent', …]` row from
`scripts/kaola-workflow-adaptive-schema.js` (was directly above the `finalization-summary.md` row,
~line 1074). `.cache/run-gaps.json` stays: confirmed `scripts/kaola-workflow-gap-sweep.js` still
writes it live (`path.join(defaultCacheDir, 'run-gaps.json')`, its documented default output) and
never references `run-gaps-manual` anywhere. Propagated with `node scripts/edition-sync.js --write`
(3 kernel copies byte-synced); `node scripts/validate-script-sync.js` → 0, all groups in sync.

**Also fixed (in scope, not a test file):** `docs/workflow-state-contract.md`'s own
"Layer-0 Durable-Artifact Ruling" table is cross-checked row-for-row against
`KERNEL_ARTIFACT_REGISTRY` by `test-kernel-conformance.js` PART B — it still had the matching
`run-gaps-manual.md` row (line 51), so removing only the kernel row left the doc table one row longer
than the registry. Removed that doc row too (same file the test reads, not a test/validator itself).

**Adjacent finding, NOT fixed (out of my scope):** the SAME doc, a few lines further down
(~line 177-179), separately says "Five fixed `.cache/*.md` finalize sidecars are optional
(`final-validation.md`, `run-gaps-manual.md`, `selection-evidence.md`, `doc-docking.md`,
`doc-updater.md`)". That sentence is describing `ARCHIVE_CACHE_SIDECAR_MD` in
`scripts/kaola-workflow-claim.js` (off-limits to me), which I read (read-only) and found already
trimmed to exactly THREE entries (`final-validation.md`, `selection-evidence.md`, `doc-docking.md`) —
`run-gaps-manual.md` and `doc-updater.md` are both already gone from the real code (matches a
`simulate-workflow-walkthrough.js` comment: "#1054 item 5: doc-updater.md is retired from
ARCHIVE_CACHE_SIDECAR_MD"). This doc sentence is stale independent of anything I touched. Flagging it
rather than fixing it since it sits next to claim.js's own territory, not mine.

### Verification run

- `node scripts/test-oracle-kernel.js` → **0**, 48 assertions passed.
- `node scripts/test-kernel-conformance.js` → **still 1, but PART B (my direct concern) is now
  fixed** — it no longer throws the "prose ruling and the registry have the same number of rows"
  assertion; it now runs much further (past PART C into PART F's `runVehicles`, which spawns
  `test-sink-merge.js`, `test-claim-hardening.js`, and `simulate-workflow-walkthrough.js` as full
  subprocesses under a write-observer — this is why the run takes minutes, not seconds). The failure
  now is: `simulate-workflow-walkthrough.js` exits non-zero under observation, specifically at
  `testFinalizeReportsMissionListOutcomeWithoutDone` (issue #970): "nothing on the finalize envelope
  reports that this run record contradicts itself. 2 of its 6 items carry an outcome while their
  status is not `done`". **This is unrelated to my kernel edit** — grepped `run-gaps-manual` across
  `simulate-workflow-walkthrough.js`: zero hits. It is a finalize/mission-list envelope concern,
  squarely inside `claim.js`/`finalize.skeleton.md`/`templates/routing/*`, all of which are being
  actively edited by other agents in this same worktree right now (confirmed via `git status`: those
  files carry unstaged changes I did not make). Ran the two OTHER vehicles standalone to isolate:
  `node scripts/test-sink-merge.js` → 0 (1063 assertions); `node scripts/test-claim-hardening.js` →
  0 (838 assertions). Only the walkthrough vehicle is red, and only on a mission-list/finalize
  assertion that has nothing to do with the kernel table row I removed.
- `grep -rln "run-gaps-manual" scripts/test-*.js` → 5 files: `test-finalize-door.js`,
  `test-gap-sweep.js`, `test-issue-1054-finalize-record-simplification.js`, `test-sink-merge.js`,
  `test-validation-runner.js`. Checked each hit with context: none assert on
  `KERNEL_ARTIFACT_REGISTRY` / `classifyDurableArtifact` / `isBookkeepingPath` (the table I edited).
  All concern `ARCHIVE_CACHE_SIDECAR_MD` (claim.js) or `gap-sweep.js`'s manual-seed grammar retirement
  — both mission-7 territory, already handled by other work, not touched by me.

### Reported test failure #1 — test-install-model-rendering.js "Cannot find module" (measured, not fixed)

Confirmed by measurement, not guess: **every real Codex install/deploy layout is safe.** Codex
plugin installation is whole-tree (`git clone` / marketplace cache — the entire
`plugins/kaola-workflow/` directory ships and is resolved as a `__dirname` sibling set), and
`plugins/kaola-workflow/config/hooks.json` — the only mechanism that ever relocates a script to the
stripped-down stable home (`~/.codex/kaola-workflow/scripts/`, via `copyHookScripts`/
`hookReferencedRelPaths`) — references only
`hooks/kaola-workflow-codex-compact-recovery.md`. It never names
`install-codex-agent-profiles.js` or `kaola-workflow-codex-preflight.js`, so neither file is ever
relocated away from its kernel sibling in any real install. `install-all.sh` documents the same
thing: "install-codex-agent-profiles.js deploys AGENT PROFILES only... [serves] what was
[cached/cloned]" — the whole tree, not a hand-picked file.

The actual failure is confined to **two test-authored fixtures inside
`scripts/test-install-model-rendering.js`** (`withHookUpdateFixture` at line ~735, and its
`--atomic` sibling at line ~1087) that build an isolated `fixturePlugin/scripts/` directory and
`fs.copyFileSync` ONLY `install-codex-agent-profiles.js` into it (line 752-753 and 1105-1106) — never
copying the kernel sibling. That simulation was legal before this convergence (the installer needed
no sibling); it is now an incomplete simulation of a real plugin tree. The exact minimal, meaning-
preserving fix at each of the two spots is one additional line right after the existing
`copyFileSync`:
```
fs.copyFileSync(path.join(root, 'plugins', 'kaola-workflow', 'scripts',
  'kaola-workflow-adaptive-schema.js'),
  path.join(fixturePlugin, 'scripts', 'kaola-workflow-adaptive-schema.js'));
```
**I did not apply this** — it is a test file and I was not given explicit authorization to edit it
(unlike the item-29 remainder authorization, which named production files only). Awaiting your call:
authorize me to add those two lines (mechanical, no assertion changes), or route to the test author.

### Reported test failure #2 — test-agent-model-resolver.js (measured; exact location, still unedited)

Exact location: `scripts/test-agent-model-resolver.js:110-121`, function `unknownRoleCheckAcceptsHeavy`,
called at lines 122-127 once for `kaola-workflow-codex-preflight.js` and once for
`install-codex-agent-profiles.js`. It does `src.indexOf('no Codex profile-tier policy')` — a literal
source-text search — and asserts `idx >= 0` then that `CODEX_PINNED_HEAVY_ROLES` appears in the
500-char window before it. That string lived inside `validateProfileText`, which the authorized item-29
convergence moved into the kernel (`scripts/kaola-workflow-adaptive-schema.js`) as its one authoring
source; it is genuinely absent from both consumer files' own source text now, by design, not by
accident. The REST of that test file (requiring `preflight`/`installer` and asserting
`CODEX_PINNED_HEAVY_ROLES` is a correct array via `require()`, plus the later "INSTALL-INVARIANT TIER"
frontmatter-equality loop you asked me to preserve as the generator-correctness witness) all still
pass — verified the frontmatter loop independently since the test throws before reaching it. **I have
not edited this test.** This needs either the probe repointed at the kernel file (same real check, new
location — a legitimate "moved to its one authority" update) or routing to the acceptance/test author.

### Duplicate MANIFEST_BASENAME — confirmed gone

`grep -n "MANIFEST_BASENAME" plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` → 4 hits:
the destructured import (line 14), one usage (`manifestPath`, line 531), one comment mention (line 62),
one export (line 2546). **No duplicate `const MANIFEST_BASENAME =` declaration.** `node -c` on the
file passes clean. Whatever tdd-1054-roles observed mid-edit was almost certainly the intermediate
state of my own edit sequence at the time (I do multiple sequential Edit calls per file); the file is
consistent now.

## UPDATE — item 29 remainder (authorized by team-lead, second pass)

Team lead authorized converging the two items left duplicated in the first pass. Both are now done;
one pre-existing test's methodology broke as a direct, expected consequence and needs the team
lead's/test-author's decision (I did not edit it — see "Blocking finding" below).

### 29a. Codex profile schema → kernel (done)

`MANIFEST_BASENAME`, `RETIRED_PROFILE_FILES`, `EFFORT_VALUES`, `CODEX_ROLE_TOP_LEVEL_FIELDS`,
`escapeRegExp`, `parseTopLevelString`, `parseStringArrayLine`, `sameStringArray`, `tomlKeyLabel`,
`profileTopLevelShape`, `genericShapeReasons`, `agentProfileContract`, `validateProfileText` all moved
into `scripts/kaola-workflow-adaptive-schema.js` (new section right after `CODEX_PINNED_HEAVY_ROLES`,
~215 lines) and are exported. `sha256Hex` was NOT re-added — `agentProfileContract` now calls the
kernel's own pre-existing `sha256Hex` export (identical logic, confirmed before moving) as a same-file
sibling.

Both `kaola-workflow-codex-preflight.js` (all 4 trees) and `install-codex-agent-profiles.js` (all 3
plugin trees) now destructure these from `require('./kaola-workflow-adaptive-schema')` instead of
hand-declaring them; both files' own duplicate `validateProfileText`/helper-function bodies were
deleted. `crypto`'s top-level require was dropped from `kaola-workflow-codex-preflight.js` (dead once
its local `sha256Hex` moved — verified no other use).

Before moving, I re-diffed the two source copies function-by-function: `escapeRegExp` differed by one
`String(value)` guard (preflight had it, installer didn't) and `agentProfileContract` differed by one
stray blank line — both cosmetic, not semantic. Kept the more defensive `escapeRegExp` and the tighter
formatting as the merged version; recorded this in the kernel's new section comment.

Propagation: ran `node scripts/edition-sync.js --write` (the sanctioned propagator, not hand-copy) —
it copied the kernel to the 3 forge trees (byte-sync, MATERIALIZED_SHARED), and copied preflight/
installer to their sibling trees via their existing `BYTE_IDENTICAL_GROUPS` entries. Verified after:
4 kernel copies byte-identical (md5 `15b079da…`), 4 preflight copies byte-identical (md5
`689f47d9…`), 3 installer copies byte-identical (md5 `c51f4d30…`); `node scripts/validate-script-sync.js`
reports all 25 byte-identical groups + kernel parity green, `0 rename-normalized families` issue.
`node scripts/kaola-workflow-codex-preflight.js --help` still runs the real preflight end-to-end:
"ok: 14 roles verified", exit 0. `installer.validateSourceProfiles(...)` still returns `{ ok: true }`.

### 29b. DEFAULT_AGENT_MODELS → generated block (done)

Added to `scripts/generate-agent-profiles.js`: `defaultAgentModelsMap()` (derives `{role: model}` from
`behavior-contracts.json`'s `intent_class` resolved through `runtime-capabilities.json`'s claude
`intent_mapping` — the SAME two-step lookup `markdownFrontmatter()` already uses to write each
`agents/<role>.md` `model:` line), `renderDefaultAgentModelsBlock()`, `checkResolverModels()`, and
`writeResolverModels()`. Wired `checkResolverModels` into `checkGeneratedProfiles` (drift list) and
`writeResolverModels` into `writeGeneratedProfiles` (`--write`), and exported all four plus the marker
constants.

`scripts/kaola-workflow-resolve-agent-model.js`'s `DEFAULT_AGENT_MODELS` block is now wrapped between
`// GENERATED: DEFAULT_AGENT_MODELS (do not edit; source: templates/agents)` and `// END GENERATED`,
alphabetically ordered (was insertion-ordered by rough workflow-stage grouping before — a legitimate
format change, not a value change: verified the 14 role→model pairs are byte-identical to the old
hand-kept map). The 5 per-role historical justification comments (adversarial-verifier, metric-
optimizer, synthesizer, etc.) were collapsed into one comment above the marker, as instructed; the
architecture comments explaining WHY the resolver doesn't decide Claude dispatch, and the
"stays dependency-free" note right after the marker, were kept verbatim and untouched — the resolver
itself still has ZERO new requires (still fs/os/path only), matching that invariant.

Generator only writes the canonical `scripts/kaola-workflow-resolve-agent-model.js`; `edition-sync.js
--write` (already run above) propagated it to the 3 other `BYTE_IDENTICAL_GROUPS` trees.

**Idempotence proof:** `node scripts/generate-agent-profiles.js --check` → 0 both before and after;
`--write` run twice back-to-back → identical md5 (`b6e2592b…`) after both runs, second run makes zero
byte changes.

**Timing note (not a defect, recording for transparency):** while running `--write` the first time, I
observed `templates/agents/behavior-contracts.json` and several `agents/*.md` /
`plugins/*/agents/*.toml` / `plugins/*/config/agents.toml` files carried the SAME mtime as my own
write — another agent (role-redesign work, same #1054 issue) was writing to those files at that exact
moment. I did not hand-edit any of them; `writeGeneratedProfiles()` is a pure, idempotent function of
the JSON sources I never touched. Checked immediately after: `templates/agents/behavior-contracts.json`
parses as valid JSON (not torn), and `--check` reports clean both immediately after and again a few
minutes later. No corruption found, but flagging the overlap since a second `--write` from that other
agent, if still mid-task, will simply re-derive the same deterministic output.

### Blocking finding — do not resolve myself (test file)

`node scripts/test-agent-model-resolver.js` now fails at `unknownRoleCheckAcceptsHeavy()`
(scripts/test-agent-model-resolver.js:110-121). That helper asserts, by literal `indexOf('no Codex
profile-tier policy')` source-text search, that EACH of `kaola-workflow-codex-preflight.js` and
`install-codex-agent-profiles.js` contains its own unknown-role check body with `CODEX_PINNED_HEAVY_ROLES`
nearby. Moving `validateProfileText` (which contains that check) into the kernel — exactly what item 29
asked for — makes that literal string absent from both files' own source text by design; it now lives
only in `kaola-workflow-adaptive-schema.js`. The REST of that same test block (requiring `preflight`/
`installer` and asserting `CODEX_PINNED_HEAVY_ROLES` is a present, correct array via `require()`) still
passes — only the literal-text-location probe is now testing an obsolete assumption. The later
"INSTALL-INVARIANT TIER" frontmatter-equality loop the team lead asked me to preserve as a generator-
correctness witness is UNAFFECTED and verified independently to pass (ran its logic standalone since
the test throws before reaching it): all 14 roles' `agents/<role>.md` frontmatter still equals
`DEFAULT_AGENT_MODELS`. I did not edit this test file — it is explicitly off-limits to me. This needs
either the test's target updated to look at the kernel instead of the two consumer files (a legitimate
"the check moved to its one authority" update, not a weakening), or a team-lead call to accept/reject
the convergence as shipped.

## Item 29 (original) — manually mirrored tier/role/schema constants

Status: **partially complete, remainder deliberately left duplicated with recorded reasons.**

### Converged (done)

`CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` / `CODEX_PINNED_HEAVY_ROLES` now
have ONE authoring source: `scripts/kaola-workflow-adaptive-schema.js` (already named `codexSchema`,
the reference operand in `validate-kaola-workflow-contracts.js`'s existing equality asserts).

- `scripts/kaola-workflow-codex-preflight.js` and its 3 plugin-tree mirrors
  (`plugins/kaola-workflow/scripts/…`, `plugins/kaola-workflow-gitlab/scripts/…`,
  `plugins/kaola-workflow-gitea/scripts/…`) now do
  `const { CODEX_PINNED_STANDARD_ROLES, CODEX_PINNED_REASONING_ROLES, CODEX_PINNED_HEAVY_ROLES } =
  require('./kaola-workflow-adaptive-schema');` instead of re-declaring the three literal arrays.
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` and its gitlab/gitea mirrors: same
  change.
- Verified byte-identity preserved after edit: all 4 preflight copies md5 `7bc50383aa9667c58a706c0660a22259`;
  all 3 installer copies md5 `8224c965f2acbd1f34672be48019ccee`.
- Verified a same-tree sibling `require()` of the kernel does not violate the preflight's documented
  "true 4-tree byte-identical, no edition-specific require()" invariant: the require path is byte-identical
  text in all 4 trees (kernel is a KERNEL_COPIES sibling everywhere), and the precedent already exists —
  `kaola-workflow-validation-runner.js` requires the same kernel and sits in the same
  `BYTE_IDENTICAL_GROUPS` byte-identical family.
- Updated the header comments in both files that asserted "requires ONLY fs+path+os+inline regex" /
  listed these 3 arrays as duplicated — that was true and is now false for these three constants;
  comments now say the kernel is the one exception (adds no edition-specific bytes) and name only the
  remaining genuinely-duplicated facts.

### Left duplicated — reason recorded, no code changed

1. **`MANIFEST_BASENAME`, `RETIRED_PROFILE_FILES`, `EFFORT_VALUES`, `validateProfileText`** (~120-line
   function) between `kaola-workflow-codex-preflight.js` and `install-codex-agent-profiles.js`.
   Re-verified byte-identical between the two files today (diff of the extracted function bodies is
   empty, 3167 bytes each). **Why not converged:** `install-codex-agent-profiles.js` has NO copy in the
   root `scripts/` (Claude) tree — only the 3 plugin trees ship it — so the preflight's root-tree copy
   is structurally unable to `require()` it there; that reason is stated in the code itself
   (`install-codex-agent-profiles.js:56`, `kaola-workflow-codex-preflight.js:36`). The only way to give
   these ONE authoring source is to relocate them into the kernel (`kaola-workflow-adaptive-schema.js`),
   which is documented (`AGENTS.md`) as holding "forge-neutral constants and shared helpers" — moving a
   Codex profile-schema validator into it is a real scope/design decision (touches 4 kernel copies + 4
   preflight copies + 3 installer copies = up to 11 files), not a mechanical single-authority pointer
   swap. Declined without owner sign-off per the escape clause in the assigned task. **Exact edit I would
   make if authorized:** add `MANIFEST_BASENAME`, `RETIRED_PROFILE_FILES`, `EFFORT_VALUES`, and
   `validateProfileText` (plus its helper `parseStringArrayLine`) to
   `scripts/kaola-workflow-adaptive-schema.js`'s exports (and its 3 mirrored kernel copies, keeping
   `KERRNEL_COPIES` byte-identity), then have both `kaola-workflow-codex-preflight.js` (4 copies) and
   `install-codex-agent-profiles.js` (3 copies) destructure them from the kernel require already added
   above, deleting the local declarations. This does **not** require touching
   `scripts/validate-workflow-contracts.js` or `scripts/test-runtime-agent-architecture.js` — neither
   file references `MANIFEST_BASENAME`/`RETIRED_PROFILE_FILES`/`EFFORT_VALUES`/`validateProfileText`
   (checked by grep); `validate-kaola-workflow-contracts.js` (the Codex-only validator, a different file)
   would keep working unchanged since it only asserts on `CODEX_PINNED_*_ROLES`, already converged.

2. **`DEFAULT_AGENT_MODELS`** in `scripts/kaola-workflow-resolve-agent-model.js` (and its 3 kernel-group
   mirrors). **Why not converged:** the file's own comment states it "stays dependency-free so installed
   runtimes can use its metadata without a schema sibling on disk" — an explicit deployment invariant.
   Checked the task's proposed fallback (`agents/generated-agent-manifest.json`): it does **not** carry a
   per-role `model` field (only `behavior_contract_version` + sha256 hashes), so that route is closed.
   The generator's real authority, `templates/agents/behavior-contracts.json` `intent_class` +
   `templates/agents/runtime-capabilities.json` tier bindings, lives only in the repo root and is not
   present in every installed layout this resolver runs from (a bare `~/.codex/kaola-workflow/scripts`
   stable home, for instance). Converging would violate a stated, unverifiable-from-here install-layout
   constraint. Left as-is per the assigned escape clause.

Neither left-duplicated item touches `scripts/validate-workflow-contracts.js` or
`scripts/test-runtime-agent-architecture.js`, and I did not open or edit either file.

## Item 31 — prose-census ratio verdict removed

Status: **complete.**

In `scripts/kaola-workflow-prose-census.js`:
- Removed `RATIO_SLACK`, the ratio-classification branch in `compareMetric` (`proportional` /
  `prose_lagging` / `prose_leading` / `unmeasurable`), the top-level `verdict` field built in
  `compare()`, and the `--fail-on-regression` flag / its non-zero-exit behavior in `main()`.
- Kept as diagnostic-only JSON: `metrics[]` (`metric`, `baseline`, `live`, `ratio_change_pct` — no
  verdict), the `absolute` counts+deltas block, `conditions_removed`/`conditions_added`.
- Updated the header comment (was: "`--compare` prints a proportionality verdict... unless
  `--fail-on-regression`..."), the CLI doc block, and `usage()`/`--help` text to describe the tool
  truthfully as verdict-free and wired into no chain.
- Confirmed via grep that no `package.json` script, chain, or test file (`test-*.js`) references
  `--fail-on-regression`, `RATIO_SLACK`, `compareMetric`, or `prose_lagging` anywhere — only this file
  and historical `kaola-workflow/archive/**` narrative notes mention them.
- `scripts/prose-census-baseline.json` format is untouched (only `compare()`'s live output shape lost
  the `verdict` key); re-ran `--compare` against the committed baseline and it still reads/produces a
  full diagnostic diff with exit 0.

## Focused suites run (exit codes)

| command | exit | notes |
|---|---|---|
| `node scripts/kaola-workflow-codex-preflight.js --help` | 0 | file has no dedicated `--help` branch (pre-existing); runs the real preflight check, 14 roles verified/autofixed |
| `node scripts/test-agent-model-resolver.js` | 0 | "Agent model resolver tests passed" |
| `node scripts/validate-script-sync.js` | 0 | "OK: 14 common scripts, 25 byte-identical groups... 4 Oracle Kernel copies identical at HEAD" (an earlier run this session saw transient claim.js drift from another agent's concurrent edit; re-run after is clean) |
| `node scripts/test-validate-script-sync.js` | 0 | 56 assertions, "validate-script-sync guard tests passed" |
| `node scripts/test-oracle-kernel.js` | 0 | 48 assertions passed |
| `node scripts/test-kernel-conformance.js` | 1 | **pre-existing, not caused by me** — unledgered `kaola-workflow-ledger-compare.js writeFileSync`; `git status`/`git diff` on that file show zero changes from HEAD `6ae5374b`, and I never opened it |
| `node scripts/test-install-manifest-single-source.js` | 0 | "PASSED" (#407/#412) |
| `node scripts/test-install-model-rendering.js` | 1 | **pre-existing/other-author, anticipated by dispatch** — fails on `agents/code-reviewer.md` reviewer scope-clamp wording; that file is already `modified` by another concurrent agent in this worktree, not touched by me |
| `node scripts/kaola-workflow-prose-census.js` (default / `--summary` / `--compare` / `--help`) | 0 (0 for all) | `--compare` output JSON grepped for `"verdict"` → zero matches |
| `node scripts/kaola-workflow-prose-census.js --compare nonexistent-baseline.json` | 1 | expected refusal path (`prose_census_baseline_missing`), unchanged behavior |

`npm test` / walkthrough were not run, per instruction.

## Files changed

- `scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js`
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitlab/scripts/install-codex-agent-profiles.js`
- `plugins/kaola-workflow-gitea/scripts/install-codex-agent-profiles.js`
- `scripts/kaola-workflow-prose-census.js`

Did not touch (first pass): `scripts/validate-workflow-contracts.js`, `scripts/test-runtime-agent-architecture.js`,
`claim.js`, `gap-sweep`, `closure-audit`, `finalize.skeleton`, `docs/api.md`,
`generate-routing-surfaces.js`, `generate-agent-profiles.js`, `sync-*-edition.js`, any test/validator
file, `package.json`.

## Second pass (item 29 remainder) — files changed

- `scripts/kaola-workflow-adaptive-schema.js` + its 3 mirrored kernel copies (kernel, +298 lines each)
- `scripts/kaola-workflow-codex-preflight.js` + its 3 mirrored copies (−318/+~140 lines net each)
- `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js` + its 2 mirrored copies
  (gitlab, gitea) (−328/+~90 lines net each)
- `scripts/generate-agent-profiles.js` (+123 lines: `defaultAgentModelsMap`, `renderDefaultAgentModelsBlock`,
  `checkResolverModels`, `writeResolverModels`, wiring, exports)
- `scripts/kaola-workflow-resolve-agent-model.js` (DEFAULT_AGENT_MODELS block now GENERATED,
  collapsed comments) + its 3 mirrored copies (propagated via `edition-sync.js --write`, not hand-edited)

## Second pass — verification commands (exit codes)

| command | exit | notes |
|---|---|---|
| `node scripts/kaola-workflow-codex-preflight.js --help` | 0 | "ok: 14 roles verified" |
| `node scripts/generate-agent-profiles.js --check` (before writing) | 0 | clean |
| `node scripts/generate-agent-profiles.js --write` (run 1) | 0 | "generated 126 native role profiles across seven runtimes" |
| `node scripts/generate-agent-profiles.js --write` (run 2, idempotence) | 0 | md5 of `kaola-workflow-resolve-agent-model.js` unchanged vs run 1 (`b6e2592b…`) |
| `node scripts/generate-agent-profiles.js --check` (after) | 0 | clean |
| `node scripts/edition-sync.js --write` | 0 | propagated kernel + preflight + installer to 7 forge-tree files |
| `node scripts/validate-script-sync.js` | 0 | "25 byte-identical groups... 4 Oracle Kernel copies identical at HEAD" |
| `node scripts/test-agent-model-resolver.js` | **1** | **blocking finding, test file, not fixed by me** — see "Blocking finding" above; only `unknownRoleCheckAcceptsHeavy`'s literal-text probe fails, value-level (`require()`-based) assertions in the same file pass, and I independently verified the frontmatter-equality witness loop still passes |
| `node scripts/test-install-manifest-single-source.js` | 0 | "PASSED" (#407/#412) |
| `node scripts/validate-vendored-agents.js` | 0 | "Generated agent validation passed for 14 Kaola-authored roles" |
| `node scripts/test-oracle-kernel.js` | 0 | 48 assertions |
| `node scripts/test-kernel-conformance.js` | 1 | **unchanged pre-existing failure** — identical `kaola-workflow-ledger-compare.js writeFileSync` unledgered-writer error as first pass; that file still has zero diff from HEAD |
| `npm run test:kaola-workflow:editions` | 0 | all 8 suites passed: opencode 875, kimi 824, grok 705, cursor 834, cursor-conformance 24, zcode 854, zcode-hook-protocol 32, zcode-install 47 assertions — "edition test lane passed: all 8 suites executed successfully" |

`npm test` / full walkthrough not run, per instruction.
