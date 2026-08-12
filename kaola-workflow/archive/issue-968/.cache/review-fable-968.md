# review-fable-968 — full-diff review, branch workflow/issue-968

Reviewer: code-reviewer (Fable). Candidate: uncommitted working-tree diff in
/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-968 (24 files, prose only, no script
changes). Suites not run per dispatch (walkthrough in flight); `node
scripts/generate-routing-surfaces.js --check` run in the worktree: all 18 surfaces byte-match,
exit 0.

## Findings, most severe first

### R1 — MEDIUM — contradiction sweep incomplete: surviving one-issue-per-run prose the new default now contradicts

Failure class: doc contradiction / incomplete propagation of the new rule.
Confidence: high (each anchor read in context).

The change makes three-to-five issues the normal run and rewrites the admission test, but several
surviving statements still teach the old singular default. Trigger: an agent (or a consumer repo)
reads any of these surfaces after this ships; expected: prose consistent with the new set-default;
observed: one-issue-per-run or same-scope-admission phrasing.

Primary anchor:
- `templates/routing/init.skeleton.md:316` — "One file per run. A run claims its issue, then
  writes `kaola-workflow/{project}/mission-list.md`." In the `### How a run is coordinated`
  section (skill region). Renders today to three tracked SKILL surfaces
  (`plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md:232`,
  `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md:232`,
  `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md:232`) and onward to the kimi
  trees. This is the same file the diff edits three lines above; the sweep stopped at the
  KW-CLAUDE-TEMPLATE region.

Secondary anchors (same root cause; orchestrator may treat severally):
- `templates/routing/finalize.skeleton.md:258-264` — the Keep-open terminal mode is written
  entirely in the singular ("A run can be complete as a cycle while the issue stays OPEN ...
  `.roadmap/issue-N.md` is preserved and the mirror still lists the issue"). The mechanism is
  whole-run: the close loop is skipped entirely (`scripts/kaola-workflow-claim.js:4819`) and
  `kept_open` is the whole `issueSet` (`:4911`) — exactly the whole-set semantics the candidate's
  own new ADR row documents. With bundles now the norm, this section under-describes the cost of
  keep-open (every finished sibling stays open, every claim released) on the surface where the
  keep-open decision is actually taken.
- `templates/routing/finalize.skeleton.md:380-382` — "it will merge, push and close the issue"
  (sink narrative; on a bundle it closes every member). Also `:148`, `:195` — "the issue
  statement" singular in the walkthrough step (a bundle has N issue statements).
- `templates/routing/next.skeleton.md:129-132` — Step 3 still instructs the singular claim as the
  primary path ("Set `KAOLA_TARGET_ISSUE` to the issue you selected") with the multi-issue form as
  the "swap" aside — emphasis inverted relative to the new default the same file sets at `:58`.
- `README.md:1375-1379` and `README.md:1390-1400` — "every active issue runs in a repo-local
  worktree ... file edits in one issue do not interfere with another", heading "### Per-issue Git
  worktrees", "each active issue has its own checkout". Worktrees are per claimed set (per
  project); the same subsection's "Run one session per issue" WAS updated to "per claimed set",
  so the sweep visited this neighbourhood and left these behind.
- `CLAUDE.md:45`, `docs/workflow-state-contract.md:21`, `:306`, `docs/architecture.md:86` — "which
  issue, which branch, which worktree". The candidate changed this exact phrase to "which issues"
  in the consumer template (`init.skeleton.md:153`) but left the repo's own docs singular — the
  two wordings of one rule now diverge.
- `scripts/test-bundle-claim.js:1233` — live comment: "(a same-scope bundle is the guarded
  exception the ranking rules allow)" — states the retired admission rule verbatim. Comment only,
  no assertion pins the old prose, so no suite reds; it just misdescribes the rule now.

Why existing guards do not catch it: no validator or test pins any of the retired sentences
(measured: grep of the retired phrases across `scripts/` and `plugins/*/scripts/` returns only the
test-bundle-claim comment), and generate-routing-surfaces --check proves skeleton/render parity,
not prose consistency between sections.

### R2 — LOW — CHANGELOG propagation count is wrong: "12 more" edition surfaces, measured 18

Failure class: false measurement claim in a consumer-facing record.
Confidence: high (directly measured).

`CHANGELOG.md` (new [Unreleased] entry, "Renders to **18 tracked surfaces** and, through the two
edition transforms, to **12 more** across the `.opencode*` and `.kimi*` trees — verified by
measurement rather than assumed"). Measured in the main checkout: the sentences this diff rewrites
are present on **18** edition-tree surfaces — all three routing topics in all six generated trees
(`.opencode`, `.opencode-gitlab`, `.opencode-gitea` commands; `.kimi`, `.kimi-gitlab`,
`.kimi-gitea` skills), each matched by grepping the old prose the diff replaces. All six trees are
generated by the two edition transforms from sources this diff changes, so the true reach is
18 tracked + 18 generated, not 18 + 12. The "verified by measurement" framing makes the wrong
number worse than no number.

### R3 — LOW — new ADR watch-list row undercounts the contract's prose footprint ("seven surfaces")

Failure class: sizing inaccuracy in the row whose stated purpose is sizing.
Confidence: moderate-high (~80%; the literal-token reading is defensible, the sizing reading is
not).

`docs/decisions/0017-the-mission-list.md` (new row): "...and stated in prose on seven surfaces —
one skeleton and its six renders." The literal token "all-or-nothing" does appear on exactly seven
next-family surfaces (`templates/routing/next.skeleton.md` + six renders). But the declared
contract the sentence is sizing is also stated as "all of them, or none" on the finalize family —
`templates/routing/finalize.skeleton.md:439` plus its six renders, text this same diff edits and
which the CHANGELOG itself calls "the closure half, which keeps 'all of them, or none' verbatim" —
and in `README.md:1332`. A reader using the row to size a change to the closure contract misses
roughly half its prose footprint.

## Clean categories (checked, nothing found)

1. Contradiction sweep elsewhere: `agents/` (14 profiles) carry no one-issue or same-scope
   phrasing; `docs/api.md`, `docs/conventions.md`, `docs/opencode-edition.md`,
   `docs/kimi-edition.md`, ADR 0017 body, and the contract validators are clean. Historical
   records (CHANGELOG back-entries, `docs/decisions/D-420-01.md`, `D-796-01.md`, archived runs)
   legitimately describe the old rule as history — not defects.
2. Mechanism claims in the new prose: all verified against code.
   - Nothing caps bundle size: `scripts/kaola-workflow-claim.js:1898-1911` — only empty-set
     refusal plus per-issue validation; `BUNDLE_SIZE_ADVISORY = 8` at `:1907`, untouched.
   - The note fires only above 8: `targets.length > BUNDLE_SIZE_ADVISORY` (`:1908`), matching
     README's "Only a set larger than 8 draws the note".
   - All-or-nothing closure holds finished siblings: keep-open is a whole-run boolean
     (`claim.js:137`, `:144`), close loop skipped entirely under keep-open (`:4819`), `kept_open`
     = whole `issueSet` (`:4911`). Verified.
   - `closure_policy: all_or_nothing` untouched: written at `claim.js:1776`, validated at
     `adaptive-schema.js:164`; no script in the diff.
   - `KAOLA_BUNDLE_MAX_ISSUES` retired with enforcement: comment at `claim.js:1905-1906`;
     `target_set_not_same_scope` absent from all scripts (never built). Verified.
   - Archive measurement reproduced exactly: 26 most recent archived runs by mtime give member
     counts [1,1,3,7,4,2,1,4,5,1,1,3,1,1,1,2,1,1,1,1,1,1,6,6,7,4] — median 1, mean 67/26 = 2.58
     (2.6), 14 of 26 single. Matches the CHANGELOG claim.
3. ADR row citations: every cited anchor spot-checked and resolving to what the row claims —
   `claim.js:137/:144/:1776/:2442-2467/:4819/:4911`; `sink-merge.js:1906/:2263` (the one
   production caller of the per-member seam, degenerating to whole-run); `adaptive-schema.js:164`;
   `closure-audit.js:272-279` (non-all_or_nothing drops to primary alone); `test-sink-merge.js:781`
   (per-member excludeIssues test); root walkthrough `:13548-13551` and `#903` control
   `:10208-10219`; gitlab walkthrough `:333-334`; gitea `:479-480`; codex fixture-only `:1802`,
   `:1862`; `docs/workflow-state-contract.md:271-275`, `:382`; `next.skeleton.md:58`, `:70`. Only
   the "seven surfaces" count (R3) is off.
4. Internal consistency of the new rule: three-to-five default and eight ceiling coherent
   everywhere both appear; README's "not a second threshold anything checks" matches code. The
   runs-alone test is byte-identical between `next.skeleton.md:68-72` and `README.md:1311`; the
   init-template variant (`init.skeleton.md:153`) is a three-prong compression with the same
   prongs in the same order, consistent with that bullet list's existing register; the
   README-vs-skeleton admission-sentence framing difference ("issues share a run when" vs
   "Members are admissible when") mirrors the pre-change paraphrase pattern, not a new divergence.
5. Consumer-facing template region: the three edited KW-CLAUDE-TEMPLATE lines
   (`init.skeleton.md:153`, `:167`, `:176`) name no vendor, no model, no command, no Phase token;
   all mission-list vocabulary needles the contract validator pins ('mission-list.md', the four
   field tokens, 'Three write moments', 'the list minus done minus in-flight') survive; region
   markers intact (`:106`/`:208`). No validator or walkthrough pins the retired wording, so no
   suite should red on this diff for prose reasons.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=one-issue-prose-survives-sweep-init-skeleton-316-plus-anchors
finding: id=R2 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=changelog-edition-surface-count-12-measured-18
finding: id=R3 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=adr-row-seven-surfaces-undercounts-closure-contract-prose
verdict: fail
findings_blocking: 3
review_conclusion: The prose change is mechanically sound — renders byte-match, every mechanism claim and nearly every ADR citation verified against code, and the archive measurement reproduces exactly — but the contradiction sweep it exists to perform left one-issue-per-run phrasing alive at init.skeleton.md:316 and in the finalize keep-open section, and two of its own counts (12 edition surfaces, seven prose surfaces) are measurably under.
