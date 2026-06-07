# Workflow Plan — issue #262

<!-- plan_hash: 04d3d52d0915f17a0cd98689d17f3089334686d3d85dbca9184122c09e0802a9 -->

## Meta
labels: documentation, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| dedupe-closure | implementer | — | agents/contractor.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md, commands/kaola-workflow-phase6.md | 1 | sequence |
| code-review | code-reviewer | dedupe-closure | — | 1 | sequence |
| docs | doc-updater | code-review | docs/architecture.md, docs/workflow-state-contract.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| dedupe-closure | complete |
| code-review | complete |
| docs | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (dedupe-closure) | subagent-invoked | # Node Evidence: dedupe-closure (issue #262) | |

| code-reviewer | subagent-invoked | verdict: pass | |
| doc-updater (docs) | subagent-invoked | # docs node evidence — issue #262 | |
| finalize (finalize) | subagent-invoked | # Finalize Node Evidence — issue #262 | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of the #262 cleanup. LOW severity, documentation/cleanup.
Option A: `cmdFinalize` (claim.js `archiveProjectDir`) stays the SOLE roadmap-closure
owner (rm + regenerate); the redundant SECOND `rm + generate` runnable body is removed
from the finalize procedure and reduced to STAGING ONLY.

### Where the redundancy actually lives (verified 2026-06-07; corrects the issue body)

The issue body describes a pre-refactor state where the runnable `rm + generate` lived
in `commands/kaola-workflow-phase6.md` Step 7. Since #277-M3 the runnable Mechanical
Finalization body was RELOCATED into `agents/contractor.md` (the SOLE home). So today:

- `agents/contractor.md` Step 7 (lines ~158-184) carries the redundant SECOND
  `rm -f kaola-workflow/.roadmap/issue-N.md` + `node "$ROADMAP_JS" generate` that runs
  AFTER `cmdFinalize` (Step 8b) already did the rm + regenerate via `archiveProjectDir`
  (claim.js:762-811, receipt `roadmap_source_removed`/`roadmap_regenerated`). PRIMARY edit.
- `commands/kaola-workflow-phase6.md` (Claude) already delegates — its "Roadmap
  regeneration" section only REFERENCES the contractor profile and carries NO `rm -f`.
  Doc-note clarification only (closure owned by cmdFinalize; Step 7 stages).
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md` (line ~494) and
  `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md` (line ~493) each still
  carry a STRAY `rm -f kaola-workflow/.roadmap/issue-N.md` block above the
  "runnable body lives exclusively in agents/contractor.md" delegation note. Remove that
  stray rm block so the editions match the Claude command (delegate, do not run).

The three phase6.md editions are NOT byte-identical (forge-specific content; verified by
md5), so this is per-edition prose, not a byte-sync group. `agents/contractor.md` has a
SINGLE edition (no plugin twin; `validate-vendored-agents.js` pairs nothing for it).

### CRITICAL — preserve the git-add staging (NOT redundant)

On the in-place path `cmdFinalize` does NOT `git add` the roadmap mirror (it only stages
on the linked-worktree branch, claim.js ~:755). So the final commit still needs the
roadmap mirror staged. The fix REMOVES the duplicate `rm -f` + `node generate` from
`agents/contractor.md` Step 7 but KEEPS the `git add kaola-workflow/.roadmap/issue-N.md
kaola-workflow/ROADMAP.md` staging line. Reduce Step 7 to: a one-line note that the
closure (rm + regenerate) is performed by `cmdFinalize`/`archiveProjectDir` at Step 8b,
plus the staging `git add` (load-bearing on the in-place path).

### Per-node intent

- **dedupe-closure** (implementer; non_tdd_reason: behavior-preserving prompt/procedure
  text cleanup across agent-profile + command-prompt files — the committed result is
  byte-for-byte unchanged/idempotent, no natural failing unit test; verified by RUNNING
  the existing finalize/sink simulate suites + the contract validators, not by a new unit
  test). Edit the 4 files: remove the redundant `rm -f` + `node generate` from
  `agents/contractor.md` Step 7 (keep the `git add` staging + add the cmdFinalize-owner
  note); remove the stray `rm -f` block from the gitlab + gitea phase6 editions; add the
  closure-owner doc note to `commands/kaola-workflow-phase6.md`. All edits land INSIDE
  this node's frozen write-set.

- **code-review** (code-reviewer). G1: post-dominates the implement node. Read-only
  governance posture (no write set). Even on an all-`.md` change this reviewer sits on the
  single sequential spine before the sink, satisfying post-dominance unconditionally.

- **docs** (doc-updater; docs-only write set → exempt from G1). Reflect the
  single-closure-owner invariant where the finalize/roadmap-closure choreography is
  documented: `docs/architecture.md` (finalize data flow / the cmdFinalize closure owner)
  and `docs/workflow-state-contract.md` (roadmap mirror generated-state contract — the
  closure rm+regenerate is performed once, by cmdFinalize; Step 7 only stages). If a doc
  already states this correctly, record skip-with-reason rather than inventing drift.
  CHANGELOG.md is reserved to the finalize sink (NOT written here).

- **finalize** (finalize sink; writes only `CHANGELOG.md`). Adds the [Unreleased] entry;
  the contractor runs the Phase-6 8a/8b/7/8 bookkeeping at finalize.

### Scope guards

- Do NOT touch any `.codex-plugin/` or `.codex/` path — #262 runs in PARALLEL with #266
  (codex harness). No codex profile/command edits; the codex contractor `.toml` is OUT of
  scope for this issue.
- Single SEQUENCE implement node — NOT fanout-by-edition: gitlab + gitea phase6 both sit
  under the SAME top-level dir `plugins/`, so fanout's top-level-directory disjointness
  check would reject the split.
- Author repo-root-relative paths only; the executor mirrors into the
  `.kw/worktrees/issue-262/` worktree — do NOT list any `.kw/worktrees/...` path.

### Contract pins to preserve (verified)

- `validate-workflow-contracts.js` pins the phase6 dispatch handles (`subagent_type="contractor"`,
  `--keep-worktree`, model badges) — the edit does NOT touch those; it removes only the
  stray roadmap `rm -f` prose. No roadmap-closure runnable token is pinned on the phase6
  editions or on `agents/contractor.md`.
- `validate-vendored-agents.js` pairs no byte-identity twin for `agents/contractor.md`.

### Acceptance (whole-plan, at finalize)

- The roadmap `rm + regenerate` runs EXACTLY ONCE during finalize (in `cmdFinalize`);
  `agents/contractor.md` Step 7 only STAGES (`git add`).
- The committed roadmap state (per-issue file removed, `ROADMAP.md` regenerated + staged)
  is unchanged (idempotent).
- `node scripts/simulate-workflow-walkthrough.js` green.
- `node scripts/validate-workflow-contracts.js` (+ the 3 other contract validators) green.
- `npm test` green ×4 editions (cross-edition contract validators — required because this
  is a multi-edition prompt surface, not just the walkthrough).
- Phase-6 whole-plan `--barrier-check` clean (every changed file in exactly one write-set).

### Out of scope

- Option B (stripping closure out of `cmdFinalize`/`archiveProjectDir`) — larger blast
  radius; `archiveProjectDir` is shared by other callers.
- Codex M1/M2 surfaces and any `.codex-plugin/`/`.codex/` edit — #266.
- Roadmap front-end init/staging (#255 covers the planner-handoff roadmap init).
