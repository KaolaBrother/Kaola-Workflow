# Workflow Plan — issue #270

<!-- plan_hash: 9d95306bbd444ff1ac8af293225c85bb325d37016aa9cd93ca5aed97b67c9cc6 -->

Docs-only update of a single dated investigation file:
`docs/investigations/2026-06-06-six-workflow-patterns.md`. Issue #270 asks to update the
**Classify-And-Act** material so it reflects reality: the pattern **shipped in #263**
(commit `84d6e23`), so the "the one gap" / future-tense framing must change to
past/shipped tense, and the section should cross-reference the follow-ups **#267, #268,
#269**. The rest of the document is unchanged. No code, no public-interface change — a
historical design record being corrected after its design landed.

## Topology rationale

**Why three nodes (grounding → docs → finalize).** The work is a single-file prose edit,
but the edit is fact-bearing: it must assert that Classify-And-Act shipped in #263 at
`84d6e23` and must cite #267–#269 correctly. A read-only `code-explorer` grounding node
runs first to locate the Classify-And-Act region (headings at lines ~120, ~142, ~151,
~170, ~192, the verdict table near line 17, and the §"The one gap" framing) and to
verify the ship facts (commit `84d6e23` exists and added the `select(...)` shape; #267,
#268, #269 are the follow-ups) so the `doc-updater` rewrites from confirmed reality, not
from memory. The `doc-updater` then makes the single-file edit. `finalize` records the
user-visible change in `CHANGELOG.md`.

**Why no `code-reviewer` (G1 does not fire).** `doc-updater` is a WRITE role, but
`producesCode` returns true for a WRITE role only when its declared write set touches a
**non-docs** path. The sole declared path,
`docs/investigations/2026-06-06-six-workflow-patterns.md`, matches `isDocsPath` (both
`\.md$` and the `docs/` tree), so `producesCode` is false and the G1 code-reviewer
post-dominance wall is not triggered. This is the trivial-docs band the grammar exempts.

**Why no `security-reviewer` (G2 does not fire).** Frozen labels are `documentation,
area:scripts, area:workflow-phases` — none in the Phase-5 sensitive set
(auth/payments/secrets/user-data). The only declared write path is a docs `.md` file,
which is exempt from the sensitivity scan (`isDocsPath`). No sensitive node, no sensitive
write, so no G2 node is required.

**Sink.** `finalize` writes only `CHANGELOG.md` (docs/state bookkeeping) — the sole legal
write band for the terminal node.

## Meta
labels: documentation, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| ground | code-explorer | — | — | 1 | sequence |
| docs | doc-updater | ground | docs/investigations/2026-06-06-six-workflow-patterns.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| ground | complete |
| docs | complete |
| finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (ground) | subagent-invoked | # Node `ground` (code-explorer, read-only) — grounding evidence for issue #270 | |
| doc-updater (docs) | subagent-invoked | # Node `docs` (doc-updater) — evidence for issue #270 | |
| finalize (finalize) | subagent-invoked | # Node `finalize` (sink) — issue-270 | |
