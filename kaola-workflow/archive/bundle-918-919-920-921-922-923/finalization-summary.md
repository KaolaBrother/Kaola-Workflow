# Finalization — Summary: bundle-918-919-920-921-922-923

Six issues, closed as one set. Five of the six lived on a single unpoliced surface:
`edition-sync.js:30-34` keeps the data-layer forge ports hand-ported, absent from `COMMON_SCRIPTS`
and `RENAME_NORMALIZED_FAMILIES`, so no parity or byte-identity check can witness a wording, a
function or an entire feature present on one side and missing on the other. Two new
behavioural-per-forge suites now cover it.

## Delivered

| issue | outcome |
|---|---|
| **#918** | The two forge roadmap generators emit canonical's shared rules wording; the source-of-truth sentence moved into the HEADER where canonical states it; the forge-specific issue-id bullet stayed forge-specific. **The surface-vs-generator disagreement turned out to be on canonical too**, so all four editions were fixed rather than the two the issue named. |
| **#919** | The dead `persistExpansionRollupToSummary` / `parseExpansionRecords` pair deleted from both forge claim ports (2,926 bytes each, byte-identical). **Not merely dead — a latent crash**: the shared schema no longer exports `parseExpansionRecords`, so the call threw `TypeError`, swallowed by the function's own broad catch. |
| **#920** | The measurably-false "`git add` is all-or-nothing over its pathspec list" claim removed from all 12 message sites across four editions, in **both** findings — the issue named only one. `archive_unstaged` / `residue_unstaged` now carry the **measured** unstaged set instead of the attempted list. |
| **#921** | `docs/api.md` scopes `archive_unstaged` to its emitting editions and corrects its semantics; `residue_unstaged` marked genuinely all-four. |
| **#922** | The forge archive-staging pathspec scoped, so a foreign project's live folder and archive band can no longer enter `chore: archive <project>` at exit 0. The `git rm -r --cached` that forces the project's own live folder off the branch is retained. |
| **#923** | **Branchless (`--branch TBD`) removed from every edition** rather than ported to the forges — reversed on measurement, on the owner's call. |

### The two reversals worth recording

**#923 was going to be ported.** The owner initially chose full four-edition parity. Measuring the
premise first showed both producers named in the feature's own comment are gone — nothing writes
`branch: TBD` (the claim has recorded a real branch since feature-branch-at-claim-time; `patch-branch`
survives only as the migration *away* from the legacy value), and the adaptive planner that preserved
`TBD` retired with the DAG. It had never run: `branch_mode` in **zero** archived receipts across ~373
archived runs, `branch: TBD` in **zero** archived `workflow-state.md`, and `branch_mode` had no reader
anywhere including `docs/api.md`. The only callers left were the suites testing it. Porting would have
spread producer-less machinery from two editions to four.

**#920 and #918 were both wider than filed**, found by the coverage rather than by reading the issues.

## Files Changed

22 files: 4 × `sink-merge` (branchless removal), 4 × `claim` (#919 deletion, #920 messages, #922
scoping), 4 × `roadmap` (#918 convergence), 2 new test suites, 3 modified test suites,
`package.json` (chain registration), `docs/api.md`, `CHANGELOG.md`, `kaola-workflow/ROADMAP.md`.

## Test Coverage

Two new behavioural-per-forge suites, both registered in **all five** chain definitions:

- `scripts/test-forge-archive-scoping.js` — #922. 72 assertions. Includes a prefix-collision arm
  (`issue-9220` vs `issue-922`) that a naive `startsWith` fix would sail through.
- `scripts/test-forge-roadmap-rules.js` — #918. 90 assertions across four checks: shared bullets
  converge, forge-specific prose stays forge-specific, source-of-truth has one structural position,
  and rendered surface agrees with generator output.

Extended: `scripts/test-forge-finalize-findings.js` (+279 lines) for #920/#921. Modified:
`test-sink-merge.js`, `test-gitlab-sinks.js`, `test-gitea-sinks.js` — #711 coverage **deleted with
its mechanism**, never rewritten to keep passing. `test-sink-merge.js` gained a two-arm #923 pin
(a control naming an obviously-absent branch plus the `TBD` arm, held to one shared assertion set so
neither can be guarded more weakly) and its label now reads `…/#893/#923`.

**Custody held throughout**: every test artifact was authored by `tdd-guide` subagents; the
implementer wrote production code and never its own tests.

**Every guard mutation-proven, one site at a time** — an N-site mutant proves coverage of ≥1, never N:

| mutation | result |
|---|---|
| unscope gitlab archive staging only | 5 gitlab FAILs, **0 gitea** |
| unscope gitea only | 5 gitea FAILs, **0 gitlab** |
| delete gitlab's `git rm --cached` | exactly 1 FAIL — the live-folder regression guard |
| all-or-nothing restored, canonical only | 2 canonical FAILs, 0 elsewhere |
| all-or-nothing restored, gitlab residue only | 1 gitlab, **0 gitea** |
| `archive_unstaged` reverted to attempted list | 1 canonical |
| docs edition scope falsified | 1 static |
| drop a shared rules bullet, gitlab only | check A 1 + gitlab D3 2, others 0 |
| source-of-truth back into a gitlab rule | check C 1 + gitlab D3 2, gitea 0 |
| revert rules bullet 3, canonical only | check A 4 + canonical D3 2, forges 0 |

**Two mutations silently failed to apply and were caught and redone** — one by a `grep -c` returning
0, one by an anchor miss. A mutation that does not mutate proves nothing, and counting it would have
been worse than not running it.

## Validation

Four chains, run from inside the linked worktree so the receipt binds to the tree that was validated,
**each chain's own exit code echoed separately** because a SIGTERMed chain makes the compound status
read green: claude 0, codex 0, gitlab 0, gitea 0, with zero 143/137 in any log.

Receipt `headSha 3973af23e015cc99cb19b82e2fa7566797205107` — equal to the worktree HEAD. Scope
`all-four` / `edition_coupling`, 22 changed files.

**The walkthrough was run at FULL scope separately: 202/202 scenarios, exit 0.** The fast gate sampled
it at shard 1/12 (17 of 202); that slice is not the suite, and green there is not green here.

Confirmed the two new suites actually executed in all four chains rather than being silently absent.
`test-suite-registration.js` first reported both as unregistered — the guard doing its job — and now
passes at 40 registered / 3 exempt.

## Changed Paths

Reported by the finalize transaction on its envelope and appended below by it.

## Documentation Docking

`DOCKED` — see `.cache/doc-docking.md`. Two gaps found and fixed, one of them notable: the
`docs/api.md` edition caveat **went stale inside this very diff**, because #922 falsified the
reasoning #921 was documenting. That is the previous bundle's count-drift shape recurring in a new
place — one issue's fix invalidating another's prose, invisible to every chain — and it was caught by
reading, not by a gate.

`doc-updater` was **not dispatched**; skip-with-reason recorded in `.cache/doc-updater.md`. Every
surface here is a structured field table where an inferring doc pass produces confident-wrong
semantics no chain can see. The edition scope is additionally pinned behaviourally rather than merely
asserted.

## Run gaps

Scanner swept clean: `sweptClasses: []`, no gap classes observed in `.cache/`.

## Follow-Up Items

1. **Untyped envelope on an OFFLINE sink against a nonexistent branch.** Measured by T4 while proving
   #923's removal safe: with `KAOLA_WORKFLOW_OFFLINE=1`, a sink whose branch has no ref dies at the
   merge checkout with exit 1 and git's own message naming the branch, but **no typed envelope and no
   journal**. It is loud and correctly attributable, so #923's acceptance criterion is met. It is
   **pre-existing and general** — the shape for any nonexistent branch, not something the removal
   introduced. Recorded, not built, per the watch-list discipline; not filed without the owner's word.
2. **`.roadmap/issue-*.md` sources were never created for #918–#923.** The mirror therefore read "No
   active work" for the whole run while six issues were open, and `validate` / `validate-remote` both
   passed *vacuously* on an empty set. Closure had no source files to remove. Filing them is a roadmap
   reorganization and belongs to the owner.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/chain-receipt.json
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/dispatch-log.jsonl
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/doc-docking.md
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/doc-updater.md
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/origin/selection-record.json
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/run-gaps.json
- kaola-workflow/archive/bundle-918-919-920-921-922-923/.cache/t4-branchless-testplan.md
- kaola-workflow/archive/bundle-918-919-920-921-922-923/finalization-summary.md
- kaola-workflow/archive/bundle-918-919-920-921-922-923/mission-list.md
- kaola-workflow/archive/bundle-918-919-920-921-922-923/workflow-state.md
