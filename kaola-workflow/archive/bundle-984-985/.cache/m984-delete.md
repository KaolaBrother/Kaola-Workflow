# m984-delete: delete roadmap.js and every sentence describing it

Task: ADR 0018 §5/§8 build-step 5 — "Delete the file and every sentence describing it, as one
movement." Work done in worktree `.kw/worktrees/bundle-984-985` on branch `workflow/bundle-984-985`.
Nothing committed (per brief). No `git checkout`/`stash`/`restore` used.

## What was deleted

Files removed outright:
- `scripts/kaola-workflow-roadmap.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`
- `scripts/test-forge-roadmap-rules.js`

`package.json`: removed ` && node scripts/test-forge-roadmap-rules.js` from all 5 npm script chains
(`test:kaola-workflow:claude`, `:codex`, `:gitlab`, `:gitea`, `:claude:full`).

`kaola-workflow-install-manifest.js` (canonical + codex-plugin mirror, byte-identical): removed
`'kaola-workflow-roadmap.js'` from `SUPPORT_SCRIPTS` (17→16 entries).

`validate-script-sync.js`: removed roadmap.js from `COMMON_SCRIPTS` and
`FORGE_EXPORT_SUPERSET_FAMILY` (6→5 forge-hand-port families remain: classifier, claim, sink-merge,
active-folders, closure-audit). `test-validate-script-sync.js` already carried the correct
post-retirement floor assertion and comment (`fam.length >= 5`, with a comment explaining the floor
moved from 6 to 5 when roadmap.js retired) and needed no further change — verified by direct read,
not assumed.

`test-kernel-conformance.js`: removed 3 dead atomic-write allowlist entries
(writeFileSync/openSync/renameSync) that named `kaola-workflow-roadmap.js`.

Both canonical contract validators (`validate-workflow-contracts.js`,
`validate-kaola-workflow-contracts.js`) plus their gitlab/gitea twins
(`validate-kaola-workflow-gitlab-contracts.js`, `validate-kaola-workflow-gitea-contracts.js`):
removed roadmap.js from script-existence/manifest-emission lists, deleted dead `assertConcept`/
`assertIncludes` blocks asserting retired prose, fixed one live assertion string (`'roadmap
priority'` → `'priority tier'` — direct fallout of the next.skeleton.md rewrite below).

`scripts/kaola-workflow-adaptive-schema.js` (byte-identical across all 4 editions): one comment
("Mirrors roadmap.js's primitive") named the deleted file as a design precedent; reworded, all 4
copies re-synced (verified byte-identical via `md5`).

`templates/routing/rename-table.js`: one comment example ("claim.js / roadmap.js /
codex-preflight.js keep the same basename shape") named the deleted file; removed it from the list.

## Prose and generated surfaces

`templates/routing/init.skeleton.md`, `next.skeleton.md`, `finalize.skeleton.md`, `slots.js`,
`required-blocks.js`: rewrote both `forge-is-the-backlog` PIN spans, deleted the ROADMAP.md
"Initial File Bodies" template + `.roadmap/` bootstrap block, removed ROADMAP.md from scaffold
trees and the Documentation Map, replaced the Step-2 fetch block with a direct
`node "$CLAIM_JS" list-open` call, fixed "roadmap priority" → "priority tier", fixed finalize prose
that named "stale roadmap sources, mirror rows" / "auto-stashing the claim-time .roadmap/issue-N.md"
(neither exists anymore in `sink-merge.js`/`closure-audit.js`, confirmed by reading the actual
current producer code, not by pattern-matching). Regenerated all 18 routing surfaces
(`generate-routing-surfaces.js --write`, then `--check` verified byte-match after every subsequent
prose edit).

Mutation-proofed `required-blocks.js`'s new `content_tokens` for `nx-forge-is-the-backlog` and
`in-forge-is-the-backlog`: gutted one bullet, confirmed `test-route-reachability.js` reds
specifically on that block across every expected surface, restored byte-identically (diffed against
a scratchpad backup), reran green.

`CLAUDE.md` (root): Durable State Contract section, Key Scripts, Documentation Map — removed
ROADMAP.md-generation prose, `list-open` mentioned on the claim.js line, `_rules.md`-survives prose
added. Final: 198 lines (under the 200-line recommendation).

`README.md`: deleted the `kaola-workflow-roadmap.js` script-table row (three per-forge basenames,
dead — the row described a file that no longer exists); removed "roadmap" from
`simulate-workflow-walkthrough.js`'s table description (that file's roadmap-CLI-testing surface is
gone). **Not touched**: the architecture diagram, "Roadmap cycle" section, and other roadmap-cycle
narrative prose elsewhere in README.md (~12 more hits) — those are editorial/structural
documentation work, not a mechanical "delete stale reference to a deleted script" fix, and per
`mission-list.md` they fall under a separately-tracked "Dock the REMAINING documentation" item. Also
not touched: `CHANGELOG.md`, `docs/api.md` (explicitly reserved for team-lead/impl984docs, confirmed
via mission-list.md), `docs/workflow-state-contract.md`, `docs/investigations/*`,
`docs/decisions/D-*.md` — none of these were named in the brief and the ADR/investigation files are
historical records that should not be rewritten.

**`kaola-workflow/ROADMAP.md` — deleted, but not by me.** My brief originally fenced this off as an
owner-consent decision I could not take. The owner has since answered "delete it, in this run"; the
orchestrator (team-lead) put `git rm kaola-workflow/ROADMAP.md` to the tree directly, under its own
permissions, after that answer — disk and index in one movement, zero untracked residue. I attempted
the same `git rm` myself first (after the fence was lifted and passed to me) and it was denied
outright by this session's own permission classifier; I did not work around that denial (an `rm` +
`git add` sequence reaching the same end state would have defeated the intent of the block, not been
a legitimate substitution), so I held rather than guess. The orchestrator's run crossed with my
report of the block and is the one that actually reached the file. `kaola-workflow/.roadmap/`
(`_rules.md` + `.gitkeep`) stays tracked and untouched — the one local file ADR §5 preserves.
`kaola-workflow/archive/**` — ~250 historical run-record hits from `grep`, all frozen past-run
artifacts, correctly left alone.

## Every test that died and its mechanism

**Bucket 1 — subject retired, deleted outright** (all confirmed by grepping production code first:
the field/function the test asserted on has zero non-comment producers left in any of the 4
editions):

- `test-forge-roadmap-rules.js` — whole file, subject is roadmap.js itself.
- 10 `testRoadmap*` functions inside `simulate-workflow-walkthrough.js` (canonical) — tested
  roadmap.js's generate/validate/migrate CLI directly. Deleted with a comment naming the retirement
  (ADR 0018 §5) at the site where the shared-tmp group they belonged to now shrinks from 12 to 2
  members.
- `testGitlabFinalizeRoadmapResidueDetection` (#428) / `testGiteaFinalizeRoadmapResidueDetection`
  (#428) / `testCodexFinalizeRoadmapResidueDetection` (#428) — three near-identical functions across
  the gitlab, gitea, and codex-plugin walkthroughs. Entire premise was
  `closure_receipt.roadmap_removed`/`roadmap_removed_by_root` (the dual-root roadmap receipt) and
  `.roadmap/issue-N.md` removal on finalize. Neither field has a producer anywhere; confirmed by
  grep before deleting. Nothing else in the scenario (plain single-issue finalize to closed) was a
  distinct case — already covered elsewhere in each file.
- ~40 closure-audit drift-class test functions inside `test-gitlab-workflow-scripts.js` and
  `test-gitea-workflow-scripts.js` (offline-classifier-evidence blocks, mirror-clean invariants,
  roadmap-CLI subcommand tests) — see prior session notes; these were already deleted before this
  compaction and are not re-described here in full, but are covered by the two forge test suites now
  passing green (461 and 467 spawn-census respectively).

**Bucket 2/3 — subject alive, roadmap incidental to setup, surgically trimmed** (not deleted):

- `testGitlabBundleFinalizeRoadmapCleanup` → renamed `testGitlabBundleFinalizeOnlineAllClosedArchives`
  (and its gitea twin `testGiteaBundleFinalizeOnlineAllClosedArchives`). The online-multi-issue-close
  + archive-integrity core (status:closed, archive exists, closure_invariants.ok) is alive and not
  covered elsewhere online; only the `receipt.roadmap_regenerated === 'regenerated'` assertion and
  the `.roadmap/issue-N.md`-removal / `roadmap_sources_removed` assertions were dead (both fields
  confirmed to have zero producers). Trimmed those four blocks, kept the rest, renamed to describe
  what the function now actually tests.
- `testGitlabBundleSingleIssueStateHasNoBundleFields` / gitea twin / the codex plugin's `main()`
  no-name equivalent (issue 163) / `testCodexFinalizeNeutralizesArchivedResume333` (issue 284) /
  `testSelectionEvidenceDockingCodex` (issues 653203, 653204) — **the largest live behavioral change
  this deletion surfaced**: ADR 0018 §5 retired the offline claim-evidence path entirely.
  `kaola-workflow-classifier.js`'s `OFFLINE` arm now unconditionally answers `target_unverified` for
  any issue not already in an active local folder — there is no longer *any* way for a fresh
  single-issue offline claim to acquire, by design (the named accepted loss: ".roadmap/issue-N.md as
  the classifier's only local proof an issue exists, gone"). Every one of these tests planted
  `.roadmap/issue-N.md` and called `startup --target-issue N` offline expecting `claim: 'acquired'`;
  all five crashed with `target_unverified`/`claim: 'none'`. Fixed by switching each `startup` call
  from offline to online against a `glab`/`gh`/`tea` mock reporting the target issue open — not a
  test-authoring decision, a mechanical port of the same pattern already used by other
  already-passing tests in the same files (`writeBundleGlabMockScript`/`writeBundleTeaMockScript` +
  `glSpawnBundle`/`gtSpawnBundle`, and a new `runClaimOnlineAcquire()` helper added to the codex
  plugin's walkthrough for the 3 call sites there, since that file's `runClaim()` hardcodes
  offline). This is the ONE piece of this task that is a genuine behavior port, not a mechanical
  deletion — flagged here explicitly per the brief's "stop and report" instruction on judgment calls,
  though in this case the port was unambiguous (the mock-based online pattern already existed
  side-by-side in the same files for other scenarios) so I completed it rather than stopping.
- `testKeepOpenArchiveStamp333` (codex plugin) and the two selection-evidence-docking finalize calls
  — each had a `plantRoadmap(root, N, '')` call immediately before a `finalize --project` call on an
  already-active folder. Finalize does not reclassify a target (it operates on an existing folder),
  so these calls were dead setup with no assertion depending on them; removed.

**Not touched — vestigial but harmless, left alone**: a handful of already-passing tests across the
gitlab/gitea/codex-plugin walkthroughs still call `glPlantRoadmapIssue`/`gtPlantRoadmapIssue`/
`plantRoadmap` before an *online* bundle-claim or an already-active-folder finalize
(`testGitlabBundleClaimCreatesOneFolder`, `testGitlabBundleDuplicateIssueBlocking`,
`testCodexFinalizeClosesIssueBundleMembers`, `testCodexBundleFinalizeAllOpenCloseIsPending`, and
their gitea/gitlab equivalents). None of these assert on anything the planted file produces (online
classification goes through the forge mock, not `.roadmap/`), so the calls are dead fixture writes
that happen to be harmless. Not removed: touching already-green suites for zero functional gain
risked new regressions for no benefit, and the volume (a dozen+ call sites across 3 files) is a
distinct, low-risk cleanup pass better done on its own. Flagged here as a finding, not fixed.

## Anything stopped on

Nothing. Every crash traced to either (a) a fully retired field/function (bucket 1, deleted with
evidence) or (b) a live subject whose setup used the now-retired offline-evidence mechanism (bucket
2/3, ported to the already-established online-mock pattern). No case required a judgment call beyond
what the brief already anticipated and licensed.

## Gate exit codes (each run standalone, exit code echoed directly — never piped)

| Gate | Exit |
|---|---|
| `node scripts/generate-routing-surfaces.js --check` | 0 |
| `node scripts/validate-script-sync.js` | 0 |
| `node scripts/validate-workflow-contracts.js` | 0 |
| `node scripts/validate-kaola-workflow-contracts.js` | 0 |
| `node scripts/test-route-reachability.js` (331 assertions) | 0 |
| `node scripts/simulate-workflow-walkthrough.js` (full, unsharded, 185/185 scenarios) | 0 |
| `node scripts/test-forge-bundle-lane.js` (59 assertions) | 0 |
| `node scripts/test-forge-finalize-findings.js` (253 passed) | 0 |
| `node scripts/test-priority-list-open.js` (18 tests) | 0 |
| `node scripts/test-sink-merge.js` (1063 assertions) | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | 0 |
| `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (spawn-census 461) | 0 |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (spawn-census 467) | 0 |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | 0 |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | 0 |
| `node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` | 0 |
| `node scripts/test-kernel-conformance.js` (251 assertions) | 0 |
| `node scripts/test-validate-script-sync.js` (56 assertions) | 0 |

All nineteen exit 0.

## Run-based acceptance (executed, not just read)

```
$ node scripts/kaola-workflow-claim.js status
{"active":[],"drift":[],"count":0}
exit 0

$ node scripts/kaola-workflow-claim.js list-open
{"issues":[
  {..."number":985,"title":"The pick step selects work from titles alone...","labels":[...,"P1"]...},
  {..."number":984,"title":"Retire the local backlog layer: the forge is the backlog (build ADR 0018)","labels":[...,"P2"]...}
]}
exit 0
```
`list-open` correctly tier-sorts #985 (P1) ahead of #984 (P2), live against the real forge, offline
classification path fully absent from this call (list-open doesn't touch it).

## Corrections to the brief

- **"canonical's two [contract validators] are already clean" was WRONG.** Both
  `validate-workflow-contracts.js` and `validate-kaola-workflow-contracts.js` still had multiple dead
  `assertConcept`/`assertIncludes` blocks asserting retired prose/functions, plus one live assertion
  (`'roadmap priority'`) broken by my own prose rewrite. Both needed substantial repair, not just the
  forge pair the brief flagged as needing work.
- **The install-manifest "retired name" framing implicitly suggested a name-pruning mechanism was
  needed** — it wasn't. `install.sh`'s generic stale-support-script sweep (lines 220-234) already
  removes any installed script no longer in the manifest automatically; scripts don't need an
  explicit `RETIRED_COMMANDS`-style allowlist the way commands do (commands share one
  `$COMMANDS_DIR` across forges, scripts each get their own per-forge install directory). Only the
  `SUPPORT_SCRIPTS` array entry itself needed removing — no separate retirement-list edit.
- **The brief's Gates list did not mention the two forge test suites
  (`test-gitlab-workflow-scripts.js`, `test-gitea-workflow-scripts.js`) or the three forge/codex
  walkthrough files** (`simulate-gitlab-workflow-walkthrough.js`,
  `simulate-gitea-workflow-walkthrough.js`, `simulate-kaola-workflow-walkthrough.js`) as gates to
  re-run, but the brief's own "measured deletion surface" section named the two test suites as files
  needing fixes, and the three walkthrough files crashed with the exact same offline-claim-evidence
  retirement pattern once reached. All five are now fixed and verified green above, beyond the
  explicit Gates list but squarely inside "every sentence describing it, as one movement."
- Everything else in the brief — the four deletion targets, the hazard-already-cleared claim, the
  four things that would bite, the `_rules.md`-survives requirement — held up as stated.

## Files changed (this session's portion)

Deleted: `scripts/kaola-workflow-roadmap.js`,
`plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js`,
`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`,
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js`,
`scripts/test-forge-roadmap-rules.js`.

Modified: `package.json`, `scripts/kaola-workflow-install-manifest.js` +
`plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js`,
`scripts/validate-script-sync.js`, `scripts/test-kernel-conformance.js`,
`scripts/validate-workflow-contracts.js` + `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`,
`scripts/validate-kaola-workflow-contracts.js`,
`plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`,
`plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`,
`plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`,
`plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`,
`scripts/simulate-workflow-walkthrough.js`,
`plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`,
`plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`,
`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`,
`scripts/kaola-workflow-adaptive-schema.js` (+3 mirrors, byte-identical),
`templates/routing/rename-table.js`, `templates/routing/init.skeleton.md`,
`templates/routing/next.skeleton.md`, `templates/routing/finalize.skeleton.md`,
`templates/routing/slots.js`, `templates/routing/required-blocks.js`,
all 18 generated routing surfaces (regenerated, not hand-edited), `CLAUDE.md`, `README.md`.

Not modified by me (reserved / out of scope, see above): `CHANGELOG.md`, `docs/api.md`,
`docs/workflow-state-contract.md`, `docs/decisions/**`, `docs/investigations/**`,
`kaola-workflow/.roadmap/`, `kaola-workflow/archive/**`, the rest of README.md's roadmap-cycle
prose. `kaola-workflow/ROADMAP.md` — deleted, but by the orchestrator under its own permissions
after the fence was lifted, not by me; see the corrected note above.

## Verification tier

`tests-green` for the behavioral port (offline→online claim-evidence tests); `regression-green` for
everything else (pure deletions/prose fixes with no behavior change). Nineteen independent gate runs
plus two live run-based acceptance commands, all recorded above with real output and exit codes.
