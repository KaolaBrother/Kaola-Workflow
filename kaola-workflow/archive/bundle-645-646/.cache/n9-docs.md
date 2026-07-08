evidence-binding: n9-docs c5862c20d49f
<!-- docs_updated: paste docs_updated here -->
docs_updated: (1) CHANGELOG.md — added two [Unreleased]/### Added bullets ahead of the #642 entry: #645 (canonical `templates/axioms.md` axiom layer, embed-not-copy design, tie-breaker/tighten-only rules, `nx-first-principles` required-blocks pointer) and #646 (issue-scout `agents/profiles/higher/issue-scout.md` opus tier, atomic `install.sh` two-list wiring, command-only placeholder, the #328 reversal / #443 regression closure, plus the in-run opencode scout-dispatch mangle repair). (2) docs/decisions/D-645-01.md — CREATE, mirroring D-644-01's structure (Context/Decision/Consequences/Non-goals): records the single-canonical-file-via-embed-not-copy rationale, the reference-pointer-not-full-block choice for the six `next` surfaces, the optional/non-blocking tie-breaker derivation, and the tighten-only hard boundary. (3) docs/decisions/D-646-01.md — CREATE, same structure: records the #328 reversal rationale, the atomic two-list install.sh wiring (the #443 partial-land lesson), the command-surface-only placeholder scope, the unchanged resolver defaults, the no-edit-to-edition-validators reasoning, and the in-run opencode-mangle repair. (4) docs/conventions.md — appended two new surgical sections after the existing "Main-session-gate write fence" section (matching the file's chronological-append convention): "First Principles axiom layer (#645)" (canonical file, embed mechanism, drift guard, tie-breaker/tighten-only rules) and "Issue-scout higher-profile model tier (#646)" (the higher/common tier shape, atomic install.sh wiring, command-only placeholder scope, unchanged resolver defaults).

## Task

Write the pre-gate provenance-bearing documentation for the completed #645 (first-principles axiom
layer) + #646 (issue-scout model-tier governance) bundle: CHANGELOG entries, two new decision
records, and a conventions.md addendum. This node runs BEFORE the four-chain receipt (n10-finalize
owns that gate), so the CHANGELOG had to be complete at this point per the repo's docs-before-chains
discipline.

## write_set

Exactly the four declared paths: `CHANGELOG.md`, `docs/decisions/D-645-01.md` (CREATE),
`docs/decisions/D-646-01.md` (CREATE), `docs/conventions.md`. `git status --short` confirms no other
tracked repo file was touched by this node (everything else in the tree is pre-existing state from
n1–n8 plus the orchestrator's own `.cache`/`workflow-plan.md`/`workflow-state.md` scheduler files).

## Sources read to ground the docs

`kaola-workflow/bundle-645-646/.cache/n1-architect.md` (build sequence + key decisions),
`n2-explore.md` (the #328/#443 regression trap + exact install.sh insertion points), `n3-scout.md`,
`n4-axiom.md`, `n5-next-seam.md`, `n6-enforcement.md` (the in-run R1 opencode-mangle repair + its
load-bearing RED proof), `n7-review.md` (R1 verified-fixed), `n8-adversary.md` (full-diff NOT-REFUTED
verdict, 4 disproof attempts all failed), `templates/axioms.md` (the shipped axiom text), and
`docs/decisions/D-644-01.md` (the structural template mirrored for both new decision records).

## verification_commands (+ results)

1. `git diff c4fff9571cd7ce9fd0341f557260e92cbe93cbb1 --stat` (pre-read, before my edits) —
   confirmed the 24-file accumulated diff from n3–n6 landed as described in the upstream evidence,
   grounding the CHANGELOG prose in the real diff rather than only the cache summaries.
2. `git status --short` (post-edit) — exactly the 4 write-set paths modified/created, plus this
   node's own `.cache/n9-docs.md`; nothing outside the declared set touched.
3. `node scripts/simulate-workflow-walkthrough.js` — exit 0, final line "Workflow walkthrough
   simulation passed" (regression-green tier; confirms the docs-only edit did not perturb the suite,
   including the new `testAxiomBlockByteIdentity` scenario n6 added).
4. Read-back of `docs/conventions.md`'s tail and `git diff --stat` to confirm the two new sections
   landed cleanly with no stray placeholder text left behind (an intermediate `TESTMARKER` sentinel
   used to work around an Edit old_string mismatch was fully replaced before this evidence was
   written).

Did NOT run the four-chain `npm test` (per instruction — that gate belongs to n10-finalize) and did
not touch any shipped agent/command/skill surface (provenance stayed out of those, confined to the
four docs-band paths as instructed).

## before_result

Baseline: CHANGELOG.md's `## [Unreleased]` → `### Added` section ended with the #642 node-channel
entry as its first bullet (n1–n8's work already landed underneath it via the merged/carried diff).
`docs/decisions/` had 20 files (D-611-01.md through D-644-01.md), no D-645-01/D-646-01. `docs/
conventions.md` ended at the "Main-session-gate write fence and upstream instrumentation
provisioning (#607)" section, 553 lines. `templates/axioms.md` existed (authored by n4) but was
undocumented in both CHANGELOG and conventions.md.

## after_result

CHANGELOG.md gains two new `### Added` bullets (inserted ahead of the #642 entry, matching the file's
newest-first-within-section ordering) for #645 and #646, each ending with a `Decision record:` cite
and a `Cross-edition (#307):` cite naming the touched surfaces and the four-chain requirement, matching
every other entry's established style in this section. `docs/decisions/D-645-01.md` and
`D-646-01.md` are new files, each following D-644-01's exact section shape (title / Date / Status /
Issue / Related / Context / Decision / Consequences / Non-goals). `docs/conventions.md` gains two new
sections at the end (555 → 592 lines), cross-referencing both new decision records. `node scripts/
simulate-workflow-walkthrough.js` re-verified green after all edits.
