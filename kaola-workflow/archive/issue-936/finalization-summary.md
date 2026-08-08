# Finalization — Summary: issue-936

Issue #936 — *Claim release is split across two scripts, so an issue that survives the sink still
OPEN keeps its kw:claim marker and cannot be re-claimed.* Filed from a consumer repo (`vrpai-cli`)
after hitting it live.

## Delivered

**Every sink terminal that leaves an issue OPEN now releases the whole claim — both artifacts.**

A claim is two things: the `workflow:in-progress` label and a `<!-- kw:claim project=<slug> -->`
marker comment posted at claim time. The classifier blocks a re-claim on **either**
(`classifier.js:371-374`, label first and short-circuiting). Only `clearAdvisoryClaim` removed both.

The reported symptom is real, but the issue's headline diagnosis turned out to be the *secondary*
defect, and this is worth carrying into any future reading of #936:

- The shipped finalize surface invokes the sink as `--sink $SINK_KEEP_OPEN_FLAG`
  (`templates/routing/slots.js:124`, all three forges), which routes to `runSinkTransaction`. Its
  closure step sat entirely inside `if (!keepIssueOpen)` (`sink-merge.js:2809`) **with no else arm**,
  so on the production keep-open path the sink released *nothing* — no close, no comment, no label,
  no marker. Measured: exactly 2 forge calls, both read-only probes, while reporting
  `status: sinked`, `closure: done`, exit 0. The positive control (same command without the flag)
  makes 8 calls including both `--remove-label`s.
- Because the label is checked first and **never expires** — while a stranded marker self-heals after
  24h (`classifier.js:216-217`) — **the label is what actually blocked the reporter**, not the marker
  the issue is named after.
- The marker asymmetry the issue documents is real and confirmed, but it lives on `postMergeCleanup`,
  the path the workflow does not take.

Three release sites per sink copy, all terminals that leave an issue open: a new keep-open arm on
`runSinkTransaction`'s closure step, `postMergeCleanup`'s primary arm under keep-open only, and the
`#403.6` keep-open bundle arm. Close paths are deliberately untouched — a marker on a closed issue is
inert, since the classifier short-circuits on closed state before any claim check, so listing and
deleting comments there would be forge round-trips that buy nothing.

The release is **single-sourced** through `clearAdvisoryClaim` rather than respelled in the sink,
which is the one place that knows the marker format. It gains an optional `opts` threaded into all
four of its forge calls and is exported from canonical `claim.js`; both forge claim ports already
exported that name, so the export-superset guard needed no port `claim.js` edit.

**The `opts` pass-through is the load-bearing part.** Both sink entry points
`process.chdir(os.tmpdir())` before doing any work — which is why every forge call in the sink
already carried an explicit cwd — while `clearAdvisoryClaim` passed none and swallows each of its
four failure paths. Calling it as it stood would have run `gh` outside any repository, deleted
nothing, and reported success. That silently-dead fix is the one the test suite was built to catch,
and it does.

## Files Changed

Production (all four editions):

| file | change |
|---|---|
| `scripts/kaola-workflow-claim.js` | `clearAdvisoryClaim` gains `opts`, threaded into all four `ghExec` calls; exported |
| `scripts/kaola-workflow-sink-merge.js` | require + three release sites |
| `plugins/kaola-workflow/scripts/{claim,sink-merge}.js` | byte-identical, via `edition-sync.js --write` |
| `plugins/kaola-workflow-gitlab/scripts/…-{claim,sink-merge}.js` | hand-port: `forge.listIssueNotes` / `deleteIssueNote`, issue-scoped endpoint |
| `plugins/kaola-workflow-gitea/scripts/…-{claim,sink-merge}.js` | hand-port: `forge.listIssueComments` / `deleteIssueComment`, repo-level endpoint, plus `releaseClaimArtifacts` |

Tests (authored under test custody, by a different agent than implemented): `scripts/test-sink-merge.js`,
`scripts/simulate-workflow-walkthrough.js`, `plugins/kaola-workflow-{gitlab,gitea}/scripts/test-{gitlab,gitea}-sinks.js`.

Docs: `CHANGELOG.md`, `docs/workflow-state-contract.md`.

Commits: `40d4a5c9` (fix) · `11366528` (spawn-site classification) · `f1d13b50` (contract clause).

### One regression the implementer introduced and then removed

Gitea's `clearAdvisoryClaim` gates **label** removal on `projectInfo.full_name`, and gitea's
`readProjectInfo` can return it empty — its fallback is `forge.discoverProject()`, which resolves
from cwd, and the process is in tmpdir. Every keep-open site there removed the label unconditionally
before this change, so routing it through `clearAdvisoryClaim` alone would have **stopped removing
the label** whenever identity was unresolved: strictly worse than what shipped. `releaseClaimArtifacts`
falls back to the bare label call on unresolved identity only. A/B'd, not reasoned about: with the
fallback disabled the label is not removed; with it, it is.

## Test Coverage

Four suites, each proven RED at baseline before the fix existed.

**The discrimination is mutation-proven, twice, and that is the point.** The test author built the
plausible wrong fix — export `clearAdvisoryClaim`, call it from the sink, forget the cwd — and the
suite caught it: label clauses green, marker clauses still red, `REJECTED-wrong-cwd:` in the call
log. I then re-proved it against **what ships** rather than what was authored: dropping `forgeOpts`
from the single new `runSinkTransaction` call site reds `test-sink-merge.js` 8 failed / 772 passed
with the same diagnostic; `git checkout --` restores it to 780 assertions, exit 0.

The gh mock is cwd-honest — it walks up for `.git` and rejects like real `gh` if it finds none — with
a positive-control leg so the cwd clause cannot pass vacuously.

**The issue's own named regression test is pinned** (`2bb344bb`). #936 asked for: *finalize a
keep-open issue, then assert `startup --target-issue N` returns `owned`/`acquired` rather than
`user_target_blocked`.* Acceptance found nothing covering it, and the gap was real rather than
pedantic: the other legs read the marker back in a spelling **this suite chose**, so they are blind
by construction to the three parties that each spell the marker independently — the producer
(`claim.js:937`), the deleter (exact, case-sensitive, `project=` only), and the detector
(`classifier.js:215`, tolerant of whitespace and also accepting `sess=`). The census measured the
detector as **strictly wider** than the deleter, which is exactly where an unclearable-but-blocking
marker lives.

The added leg therefore **spells the marker nowhere**: it seeds through the real producer
(`postAdvisoryClaim`), releases through the real sink, and reads the verdict off the real classifier
via `startup`. It carries a positive control — a freshly claimed issue must first come back
`user_target_blocked`, or the post-release `acquired` would prove nothing.

**Coverage hole worth knowing:** `scripts/test-sink-merge.js` (the dedicated sink suite) runs in **no
chain** — only the never-mandated `claude:full` tier. A green four-chain receipt does not cover it. It
was run by hand: 780 assertions, exit 0.

Final state: walkthrough 208/208 exit 0 at full scope (baseline 206, +2 legs); `test-sink-merge.js`
780 assertions; both port sink suites exit 0; `test-spawn-classification.js` green with its ceiling
table untouched; four-chain receipt green and unwaived, bound to `2bb344bb` with a clean tree.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. Two documents updated (`CHANGELOG.md`; the keep-open terminal's
contract bullet at `docs/workflow-state-contract.md:271`, which listed what that terminal does and
omitted claim release entirely). Seven checked and deliberately left alone with reasons, including
`docs/api.md:1280`, whose `clearAdvisoryClaim` sentence remains true — the return enum and receipt
shape are untouched and only an optional trailing parameter was added.

Done inline rather than dispatched, because every structured fact was already established by
measurement in this run and the standing caution is that a doc agent fabricates schema unless
dictated exact text or given real `--json` output to diff.

## Run gaps

- manual:unreconciled-project-slug (clearAdvisoryClaim keys its marker deletion on the operator-supplied --project, which finalize never reconciles against the durable record): filed: #937
- manual:offline-finalize-reports-closed (an OFFLINE finalize returns skipped_offline before touching the forge yet still emits status: closed, leaving both claim artifacts on every member): filed: #938
- manual:finalize-refusal-before-claim-clear (six cmdFinalize refusal paths return before the claim-clearing loop at claim.js:4605): filed: #939
- manual:undiscriminating-blocked-message (and blocked is label-first-OR-marker. An operator cannot tell which artifact to clear): filed: #938

The fourth was folded into #938 as its adjacent cheap fix rather than filed separately.

## Follow-Up Items

Three follow-ups filed at the user's explicit direction, each reproduced against the real scripts
with a mock forge (recipes in `.cache/reachability.md`):

- **#937** — `clearAdvisoryClaim` keys marker deletion on the operator-supplied `--project`, which
  finalize never reconciles against the durable record. A case-variant slug **under**-deletes at exit
  0 with no warning (reproduced on this case-insensitive volume); a *missing* slug falls back to a
  generic regex and **over**-deletes every project's marker. Filed with both directions and the
  detector-wider-than-deleter gap noted.
- **#938** — an OFFLINE finalize returns `skipped_offline` before touching the forge yet still emits
  `status: closed`, stranding both artifacts on every member. The single door that reproduces what
  #936's reporter actually saw. Filed as a values question for the owner, not a fix: a refusal would
  break the offline posture.
- **#939** — six `cmdFinalize` refusals return before the claim-clearing loop. **Filed with its
  premise already in doubt**, and it says so: keeping the claim on a refusal is plausibly correct,
  and its only measured hazard was the sink no-op this run fixed.

Not filed, recorded here: the `--project`-falsy over-delete fallback has no producer today (all eight
call sites pass a non-empty string), and no `sess=` marker producer exists despite the detector
accepting one.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-936/.cache/asymmetry.md
- kaola-workflow/archive/issue-936/.cache/baseline.md
- kaola-workflow/archive/issue-936/.cache/chain-receipt.json
- kaola-workflow/archive/issue-936/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-936/.cache/doc-docking.md
- kaola-workflow/archive/issue-936/.cache/edition-census.md
- kaola-workflow/archive/issue-936/.cache/implementation.md
- kaola-workflow/archive/issue-936/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-936/.cache/reachability.md
- kaola-workflow/archive/issue-936/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-936/.cache/run-gaps.json
- kaola-workflow/archive/issue-936/.cache/test-baseline.md
- kaola-workflow/archive/issue-936/finalization-summary.md
- kaola-workflow/archive/issue-936/mission-list.md
- kaola-workflow/archive/issue-936/workflow-state.md
