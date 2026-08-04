# Finalization — Summary: issue-934

Issue: [#934](https://github.com/KaolaBrother/Kaola-Workflow/issues/934) — *claim: the gitlab and
gitea claim ports are compared to nothing, and the behavioural suite reaches claude+codex only*
Outcome: **closed as NOT_PLANNED with no code**, on the owner's ruling, with the measurement recorded.

## Delivered

#934 was filed as an observation with a measurement, proposing no mechanism, and named "a considered
decision that the risk is accepted and this issue closes with no code" as one of its own valid
endings. This run measured the question, put the fork to the owner, and executed the ruling.

**1. The issue's premise was tested and is partly false.** Its title asserts the behavioural suite
reaches claude+codex only. Four suites in fact spawn the gitlab and gitea claim CLIs as child
processes, and the earliest predates both defects the issue cites:

| suite | from | drives per-edition |
|---|---|---|
| `test-claim-hardening.js` (`EDITIONS_906` loops at `:4942`, `:5089`) | #906 | `release`, `status`, `finalize`, `finalize --check` |
| `test-forge-claim-rollback-scoping.js` | #932 | `claim`, `startup` |
| `test-forge-claim-reserved-project.js` | #933 | `claim`, `startup` |
| `test-forge-bundle-lane.js` | — | `startup --target-issues` |

#906's own comment already says it: *"PER EDITION, BEHAVIOURALLY … The source-text pins in P7/P8
above can only say a literal is present; they cannot say the port WORKS. These run it."* The issue's
**static** half holds exactly as written.

**2. The coverage inventory the issue asked for.** **5 of 20 claim subcommand handlers have
per-edition behavioural legs; 15 do not.** Covered: `claim`, `startup`, `release`, `status`,
`finalize`. Uncovered: `authoring-allowed`, `patch-branch`, `watch-pr`, `pick-next`, `resume`,
`worktree-status`, `stale-worktree-check`, `stale-worktree-cleanup`, `legacy-worktree-cleanup`,
`worktree-finalize`, `sink-fallback`, `verify-sink`, `audit-labels`, `repair-labels`,
`barrier-ref-sweep`. Every forge-claim drive uses a literal path, so the enumeration is complete.

**3. "The four ports are behaviourally one shape" does not generalise.** That was established for one
defect class (#933's resolution site). Measured across the whole file, with forge vocabulary
normalised: gitlab↔gitea 200 differing lines, canonical↔forge ~3,130. Normalisation moves only ~4%,
so the divergence is structural. **This refutes one of the four options the issue listed** — a
normalised-hash parity guard is not buildable at file scope. Three most-suspicious residues were
inspected and all three are benign (gitea's `closeIssueIdempotent` label removal is compensated by 9
structurally-aligned `clearAdvisoryClaim` sites; the duplicated `issue_number:` is value-identical;
`issue_iid` is gitea's internal field name, so its use is self-consistent).

**4. The values call went to the owner and was executed.** No forge-port-specific defect has ever
been observed — both #932 and #933 were present in all four editions, canonical included, so a
canonical-only suite would have caught either. Under `.roadmap/_rules.md` (*add only what an observed
failure demands; silence is an answer*) nothing demanded a mechanism. The owner ruled: close with no
code, correct the premise. **Risk knowingly accepted: the 15 uncovered subcommands stay unguarded,
and a divergence there ships silently.**

## Files Changed

**None.** Measured, not assumed: `git rev-list --count main..workflow/issue-934` → `0`;
`git status --porcelain` shows only the untracked run folder. The deliverable is the closing comment:
https://github.com/KaolaBrother/Kaola-Workflow/issues/934#issuecomment-5175248076

This is the intended shape, not an omission. The sink's own pin warns that nothing reports a branch
whose entire diff is bookkeeping — that silence is not a clearance. Stated explicitly here: this run
produced no implementation **by ruling**, and the empty diff is correct.

## Test Coverage

No test added or changed, because no behaviour changed. The run's product is a measurement of
existing coverage, recorded above and on the issue. Adding a suite was the offered alternative and
was declined.

## Validation

Self-host repo. `kaola-workflow-run-chains.js --project issue-934` run from the linked worktree as
the last pre-finalization action; the finalize transaction's own classification of the receipt is
appended under this heading and is authoritative over this paragraph.

This run has a specific reason to care about a green receipt beyond the empty diff: the coverage
inventory was **first attempted by instrumenting all four claim CLIs** with a byte-identical,
CLI-only `appendFileSync` shim keyed on `__filename` (positive-control proven on canonical and
gitea). An armed guard caught it — *"every non-atomic write API in a production script is accounted
for in the exempt ledger with a stated reason"* — and `npm test` exited 1 having produced no
inventory. The instrumentation was reverted and the tree verified clean (`git status` empty, no
`KW934_PROBE` residue anywhere). The chain run therefore doubles as proof the revert was complete.
Incidentally, it is evidence that guard is genuinely armed.

## Changed Paths

Appended by the finalize transaction. Expected content: the run folder only.

## Documentation Docking

Verdict **DOCKED** — `.cache/doc-docking.md`. Zero tracked files changed, so no public behaviour,
API, setup, architecture, environment or validation surface moved; each document carries an explicit
no-impact reason. The one substantive correction (the false premise) is docked in the closing
comment, deliberately not copied into `docs/`: a coverage census in prose is a second copy that rots,
which `docs/conventions.md` already names as a failure mode. `validate-remote` → `ok`; no
`.roadmap/issue-934.md` ever existed, so closure removes no roadmap source.

## Run gaps

None. `kaola-workflow-gap-sweep.js` scanned `.cache/` and returned `sweptClasses: []`, consistent
with a run that found no defects — the three suspicious divergences it inspected were all benign.

- `noise: issue #934's own premise was partly false` — a correction to an issue's text, not a defect
  in the codebase; docked in the closing comment, which is the durable record for a closed issue.

## Follow-Up Items

None filed, deliberately. The reopening trigger is recorded on the issue instead: **a gitlab or gitea
claim port found broken where canonical is correct.** A restatement of the coverage gap alone does
not arm it — #934 already is that, measured. Do not re-file this as a coverage gap.

The owner was offered a watch-list row in `docs/decisions/0017-the-mission-list.md` as a third option
and declined it, so no ADR edit is authorized here.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-934/.cache/chain-receipt.json
- kaola-workflow/archive/issue-934/.cache/doc-docking.md
- kaola-workflow/archive/issue-934/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-934/.cache/run-gaps.json
- kaola-workflow/archive/issue-934/finalization-summary.md
- kaola-workflow/archive/issue-934/mission-list.md
- kaola-workflow/archive/issue-934/workflow-state.md
