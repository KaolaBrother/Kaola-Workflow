# Finalization — Summary: issue-929

## Delivered

**#929 — `projectNameForIssue` adopts a roadmap placeholder as the project name.** Closed with a
documentation-and-vocabulary change and **no runtime change in any of the four editions**, by owner
ruling taken in conversation after the measurement below.

The defect is real and was reproduced end to end: a `.roadmap/issue-N.md` carrying
`workflow_project: unclaimed` yields a project folder, worktree, archive destination and sink receipt
all named `unclaimed`, at exit 0, while the branch is correctly `workflow/issue-N`.

**The filed root cause was refuted before anything was built.** The issue attributed the value to this
project's roadmap generator. Measured: no tool here emits it — `readRoadmapIssues:78`,
`buildTableRow:89` and `cmdInitIssue:341` all default to `—`, and across every value of the field ever
committed to this repository the literal `unclaimed` appears **zero** times. It was hand-authored in
the consuming repository. The filed one-line guard (`name !== 'unclaimed'`) would therefore have
written another project's private vocabulary into four hand-maintained copies of the claim path, two
of which have no automated body check.

**No lexical predicate can do this job**, which is why the fix is a sentence and not a check.
`unclaimed` and the real archived project name `pr-sink` are the same lexical object, so any rule
admitting one admits the other; a must-contain-a-hyphen rule rejects the equally plausible name `sink`
while still admitting `not-yet` (measured: 10/10 plausible placeholders adopted, 6/6 plausible names
rejected); and a blocklist has no closed membership. What was missing was a statement of what the
field may contain — `workflow_project` appeared in **zero** prompt surfaces and **zero** lines of
`docs/workflow-state-contract.md`, its only specification hanging off `project-name`, a subcommand
with no callers.

## Files Changed

10 files, +64 / −1, **zero `.js` in any edition**:

- `docs/workflow-state-contract.md` — new `### Roadmap issue-source fields` (+25)
- `docs/api.md` — `project-name` row now specifies the field, not only the subcommand's exit rule
- `templates/routing/init.skeleton.md` — one bullet inside the CLAUDE.md compact template
- `commands/workflow-init.md` ×3 and `skills/kaola-workflow-init/SKILL.md` ×3 — regenerated, never
  hand-edited
- `CHANGELOG.md` — new `[Unreleased] / ### Documentation`

## Test Coverage

No test artifact was authored, deliberately. A documentation-and-skeleton change adds no behaviour to
pin, and inventing a test would pin machinery nobody built. Custody was therefore never in question:
no production behaviour changed, so no implementer wrote or needed a test.

Verification was the existing guards, each run at full scope against the final tree:

- `simulate-workflow-walkthrough.js` — **202/202 scenarios, shard 1/1**, exit 0. Full scope, not the
  fast gate's rotating 1/12 sample.
- `generate-routing-surfaces.js --check` — all 18 surfaces byte-match the skeleton, exit 0. A
  **positive control** ran first: before regeneration the check failed with exactly the 6 expected
  surfaces drifted, and the drift was the authored paragraph, proving the skeleton really feeds them.
- `validate-workflow-contracts.js` — pass, re-run after the final rewording because
  `docs/workflow-state-contract.md` is test-consumed (`:337/:360/:367/:399/:441`).
- `test-opencode-edition.js`, `test-kimi-edition.js`, `test-route-reachability.js` — all exit 0, run
  because the skeleton feeds those additive editions at install time.

## Validation

## Changed Paths

## Documentation Docking

`DOCKED` — `.cache/doc-docking.md`. This run's deliverable *is* documentation, so docking checked the
inverse of the usual question: not whether the code is reflected in the docs, but whether the prose is
true of the code **in every edition**. `README.md` verified as no-impact (zero `workflow_project`
occurrences; it lists `project-name` among subcommands and nothing more).

## Run gaps

Four defects were found in this run's own prose, none by any suite — all by adversarial verification,
across three passes. All four were fixed before finalization; they are recorded here because the
pattern is the finding, not the individual lines.

- `noise: the four prose defects were this run's own work-in-progress, fixed before landing — not
  shipped defects. Three of them were one failure class: a prose absolute true of the root/Codex
  edition and false or incomplete for the GitLab/Gitea ports (a fabricated bundle mechanism, a branch
  name asserted as always workflow/issue-N when two editions prefix it, and a source-field list
  missing the labels and url that gitea/gitlab also write). The class is worth remembering: the first
  two passes each cleared the prose against the root edition alone, which is exactly how the branch
  absolute survived pass 1.`
The scanner swept zero classes (`sweptClasses: []`) and the gate is clean, so nothing here is a
reconciliation row. One real run-discovered defect is carried unfiled under Follow-Up Items rather
than recorded here as `filed: #N`, because creating an issue is the user's call to make and it has
been put to them.

## Follow-Up Items

**A latent defect found while verifying, out of scope for #929 and not fixed here.** A project named
`archive`, or any name beginning with `.`, is path-safe and claims successfully as `acquired` — but
`readActiveFolders` skips both classes at `active-folders.js:240`, *before* `isSafeName` is consulted
on the next line. Driven through the real `status` subcommand: the run is reported neither in
`active[]` nor in `drift[]`; `status` returns `count:1` while three projects exist on disk. Such a run
is claimed but invisible to status and to every active-folder sweep — strictly worse than the
misleading-name defect #929 is about. Documented in the new contract section; recommended for its own
issue, awaiting the user's direction.

Recorded, not built, per additive derivation: on GitLab and Gitea the `refresh` path defaults
`workflow_project` to `issue-{N}` rather than `—` (their `cmdInitIssue` still defaults to `—`), so a
reader on those forges may never see `—` in a generated source. This makes no statement in the new
section false — the section states a read-back rule and authoring advice, both valid across all four
editions — and no observed failure demands a change.

Deferred as pre-existing and out of scope, both confirmed by the verifier: `docs/api.md:151`'s
`<target-key>` enumeration lists only `issue-<N>` and `bundle-...` while `foldOriginStaging` uses the
adopted value; and `cmdProjectName` strips `|` and skips `isSafeName`, so it can disagree with the
claim on pipe-bearing and path-unsafe values.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/.cache/chain-receipt.json
- kaola-workflow/archive/issue-929.archived-2026-08-03T14-15-27-770Z/finalization-summary.md

### Orchestrator note on the sink's receipt — a FALSE RED, measured not assumed

`.cache/chain-receipt-sink-teardown.json` is the receipt the sink wrote at 14:15:25 and committed. It
records `gitlab=1, gitea=1`. **It is a false red and the merge is sound.** Preserved rather than
deleted, because a successor finding two red chains in a committed receipt deserves the resolution
next to it.

Why it is false: the sink started at 14:15:21 and that receipt completed at 14:15:25 — four seconds
for four chains, where an honest run on this box takes ~9 minutes. It coincides with worktree
teardown, and the sink itself recorded `post_rebase_tests: skipped`, so nothing there was a real
post-rebase validation.

How it was settled — the decisive measurement, not an argument: all four chains were re-run at the
merged mainline `02471029` after the sink, serially, and came back **green** (claude 339s, codex 6s,
gitlab 95s, gitea 83s; 35/2/3/3 steps; zero red steps; runner exit 0). That run's `codeTreeHash` is
`6ca16a4264a7d7f5` — **byte-identical to both earlier receipts**, so the same tree that the sink
reported red is measurably green when actually validated. `.cache/chain-receipt.json` (14:08:24,
all four green, same tree hash) is the authoritative receipt for this run and is what the finalize
transaction classified as `chains_green`.

Also corrected here: the archive this run first produced was left UNTRACKED in the main checkout while
the sink committed a two-file directory beside it. The two were consolidated by hand into this one
archive; nothing was discarded, and the sink's own `## Sink Findings` block above is kept verbatim.
