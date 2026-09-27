# Finalization Summary — issue #1098

## Delivered

The PR/MR request sink became an idempotent, re-entrant publisher that carries the run's archive with
the request, and the watchers gained the post-merge reconciliation face that reports those runs.

**§2.1 — request identity and reuse (all three forges).** The existing PR/MR is resolved **before any
push**: the durable `.cache/sink-pr-result.json` record first, then the state's `pr_url` / `mr_url`,
then an open-request scan for this source branch. An OPEN request is reused only after its target
branch and every claimed member's `Closes #n` are verified (a bundle closes all or none); a MERGED one
reports `already_merged` and is never re-pushed, re-created or merged again; a CLOSED-unmerged one is
refused as `pr_closed_unmerged` / `mr_closed_unmerged`. A durable record whose probe fails refuses
(`pr_probe_failed` / `mr_probe_failed`) rather than falling through to discovery, which could push a
squash-merge-deleted branch back and reopen a merged request. Every project-directory read/write
resolves against the main checkout, and a folder that is neither live nor archived is refused before a
request is created. Writes are idempotent: the `## Sink` block is rewritten line-wise only when its
bytes change, the summary no longer appends a duplicate URL, the durable record is left alone when
unchanged.

**§2.1-4 — the archive rides the request.** In the linked posture the archive commit is built from the
main checkout's working tree through the kernel's private index onto the branch tip
(`commitPathsOntoCandidate`), the local branch is advanced ff-only in its worktree holder or by
compare-and-swap `update-ref`, then pushed. Only `kaola-workflow/archive/<project>/` is published — a
live run folder never reaches the request branch. A re-entry re-pushes whenever the local tip differs
from `origin/<branch>`, so a run whose push was refused recovers instead of exiting 0 with the archive
missing from origin. The default branch is never pushed and a push is never forced.

**§2.2 — post-merge reconciliation.** `watch-pr` / `watch-mr` emit `reconciled[]` for archived
`sink: pr` / `sink: mr` runs, scanning the main checkout's archive band and reporting each against
actual forge state. `publication`, `archive` and `closeout` are reported separately; reconciliation
never re-merges, re-creates, or pushes the mainline, and manual closure of a remaining member stays the
orchestrator's call after the merge is verified. The scan is bounded and stateless (a run leaves it
when its archive is tracked at `HEAD` or on the local default branch), runs at most one `git fetch`
per scan, and reconcile probe failures are reported in `probe_errors` on every forge.

**§2.3 — finalize PIN.** The `sink-reports-orchestrator-owns` PIN states what a request sink does after
it publishes; all six rendered surfaces were regenerated and the 1055 render baseline recaptured in the
same commit.

**§2.4 — documentation.** `docs/api.md`, `README.md` and `CHANGELOG.md` describe the shipped behavior.

**Review findings F1–F8.** F1 refused-push re-entry re-pushes; F2 a failed probe of a recorded request
fails closed; F3 `advanceCheckedOutDefault` refuses to rewind a local default with unpushed commits
(ancestry guard, all four kernel copies byte-identical); F4 an already-merged request is never merged
again and all three sinks disclose their lane on stdout; F5 the forge-neutral archive-publish mechanism
lives once in the kernel (`publishPathsOntoRequestBranch`, with `ignoredUntrackedUnder` /
`repoWideIgnoredNames` / `worktreeCheckedOutBranch` reused) instead of ~100 duplicated lines per sink;
F6 OFFLINE from a linked worktree does not commit onto main's HEAD; F7 the reconciliation scan is
bounded and fetches once; F8 stale documentation and the `[object Object]` refusal detail were fixed.

**Unchanged by design.** keep-open stays merge-sink-only and its refusal lines are byte-identical to
the baseline (D4=(a)); the skeleton's `exit 1` is untouched. **OFFLINE semantics keep their pre-#1098
behavior**: in the non-linked posture the metadata follow-up is still staged and committed locally —
including an OFFLINE run started from the main checkout while the run branch lives in a linked dev
worktree — and only a run started from the dev worktree leaves main untouched. Merge-queue behavior is
out of scope and belongs to #1099; no merge-queue logic was added.

## Files Changed

29 files, `+4712 / −401` against `origin/main` at `209be26f`.

Kernel and shared scripts: `scripts/kaola-workflow-adaptive-schema.js` (4 byte-identical copies),
`scripts/kaola-workflow-sink-pr.js` (+ its `plugins/kaola-workflow` mirror),
`scripts/kaola-workflow-claim.js` (+ mirror), `scripts/simulate-workflow-walkthrough.js`.

Forge editions: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js`,
`kaola-gitlab-workflow-claim.js`, `kaola-gitlab-forge.js`;
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`,
`kaola-gitea-workflow-claim.js`.

Tests: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`,
`test-gitlab-workflow-scripts.js`; `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`,
`test-gitea-workflow-scripts.js`.

Rendered and documentation surfaces: `templates/routing/finalize.skeleton.md`,
`commands/kaola-workflow-finalize.md`, the three forge `commands/kaola-workflow-finalize.md` and
`skills/kaola-workflow-finalize/SKILL.md`, `scripts/fixtures/issue-1055-render-baseline.json`,
`docs/api.md`, `README.md`, `CHANGELOG.md`.

## Test Coverage

Focused legs (all run on the frozen candidate, isolated HOME):

| Suite | Result |
|---|---|
| `npm test` (claude, codex, gitlab, gitea producer chains) | exit 0 |
| `node scripts/simulate-workflow-walkthrough.js` | exit 0 — 199/199 scenarios |
| `node scripts/validate-script-sync.js` | exit 0 — 18 byte-identical groups, 5 export-superset families |
| `node scripts/generate-routing-surfaces.js --check` | exit 0 — 24 surfaces |
| `test-gitlab-sinks.js` / `test-gitlab-workflow-scripts.js` | exit 0 / 0 |
| `test-gitea-sinks.js` / `test-gitea-workflow-scripts.js` | exit 0 / 0 |
| `npm run test:kaola-workflow:editions` | exit 0 — 11/11 |
| `test-kernel-conformance.js` / `test-claim-hardening.js` | exit 0 / 0 (875 assertions) |
| `test-route-reachability.js` / `test-release-surface-drift.js` | exit 0 / 0 |
| `prose-census` and the four contract validators | exit 0 |

New tests, each RED before its fix and GREEN after: `testSinkPrRePushesArchiveAfterRefusedPush`,
`testSinkPrProbeFailureFailsClosed`, `testSinkPrOfflineDoesNotCommitOnMain`,
`testSinkPrLiveFolderIsNeverPushed`, `testWatchPrReconcileRefusesToRewindLocalDefault`,
`testWatchPrLocalOnlyRunIsBoundedAfterReconcile`, the GitLab/Gitea identity blocks, and the CLI-level
already-merged cases that pin F4 at `main()` (RED with the early return removed).

Chain receipt: `.cache/chain-receipt.json`, `headSha=933cdce5…`, `codeTreeHash=2dc72973…`, four chains
exit 0, unwaived; `--release-check --candidate HEAD` exit 0.

Independent review: three rounds by a separate Claude reviewer. Round 1 FAIL (F1–F8), round 2 FAIL
(B1, B2), round 3 targeted re-check PASS on `b1f91c40`; the docs-consistency follow-up was accepted by
the Host at `933cdce5`.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- README.md
- commands/kaola-workflow-finalize.md
- docs/api.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- scripts/fixtures/issue-1055-render-baseline.json
- scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-claim.js
- scripts/kaola-workflow-sink-pr.js
- scripts/simulate-workflow-walkthrough.js
- templates/routing/finalize.skeleton.md

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. `docs/api.md`, `README.md` and `CHANGELOG.md` were updated to the
shipped behavior; the six rendered finalize surfaces were regenerated from the skeleton. `AGENTS.md`
and `docs/decisions/` were checked and need no change: no source-layout, command, validation-chain, or
architectural decision moved.

## Follow-Up Items

- **#1099** owns merge-queue behavior; deliberately untouched here.
- **N5 (report-only, not filed).** `sink-merge` still carries its own `ignoredUntrackedUnder` /
  `repoWideIgnoredNames` copies in all three editions although the kernel now exports them. Raised by
  the reviewer as a duplication observation, explicitly report-only, and not a defect this issue
  introduced.
- **Known limit (documented, not a defect).** A merged run whose archive reached neither origin nor
  the local default branch is reported on every reconciliation scan. Bounding it would require the
  durable marker file the design deliberately does not write; recorded in `docs/api.md` as a known
  limit.

No run-discovered defect was filed as a new issue: the review findings were all fixed inside this run,
and no other blocking defect was found.

## Readiness

Ready to finalize and sink to main by merge. Candidate `933cdce5`, frozen and clean, chain receipt
bound to it, independent review passed, documentation docked, ledger's six missions all `done`.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1098/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1098/.cache/doc-docking.md
- kaola-workflow/archive/issue-1098/.cache/docs-posture-fix.md
- kaola-workflow/archive/issue-1098/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1098/.cache/review-round-fixes.md
- kaola-workflow/archive/issue-1098/.cache/review-round2-fixes.md
- kaola-workflow/archive/issue-1098/finalization-summary.md
- kaola-workflow/archive/issue-1098/mission-ledger.jsonl
- kaola-workflow/archive/issue-1098/workflow-state.md
