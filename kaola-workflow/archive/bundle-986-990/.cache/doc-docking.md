# Documentation docking — bundle-986-990

Verdict: **DOCKED**

Done inline in the main session. Subagents were declined for this run, `doc-updater` included —
the skill offers the dispatch, it does not mandate it. Recorded here rather than left implicit,
and the anti-fabrication requirement is met the only way it can be for an inline pass: every
statement below is either a path that exists or a command output quoted from this run.

## Changed files reviewed (16, all in commit df70e9c7)

| file | change | doc consequence |
|---|---|---|
| `templates/routing/init.skeleton.md` | new `## Step 5 — Legacy Backlog Layer` + one summary bullet | init's contract changed → api.md, architecture.md, CHANGELOG |
| `templates/routing/slots.js` | new `in-migration-heading`; `in-summary-heading` → Step 6 | none beyond the above |
| `templates/routing/required-blocks.js` | new `in-backlog-migration` manifest entry | none — internal test manifest |
| `commands/workflow-init.md` + 5 plugin/skill surfaces | GENERATED, not hand-edited | none — rendered output |
| `scripts/simulate-workflow-walkthrough.js` | helper renamed, `root` dropped, comments repaired | none — test-internal identifier |
| `scripts/test-forge-finalize-findings.js`, `scripts/test-forge-bundle-lane.js` | comment citations follow the rename | none |
| `CHANGELOG.md` | Added (#986), Changed (#990) | is the doc |
| `docs/api.md`, `docs/architecture.md`, `docs/decisions/0018-…md` | updated | are the docs |

## Documents checked

- **`README.md`** — no-impact, deliberate. Its `/workflow-init` mentions are install lines, the
  overview diagram's one-line caption, and Codex-profile notes. None enumerates the command's steps,
  so none became wrong. Checked by reading every hit of `workflow-init` in the file.
- **`docs/api.md`** — UPDATED. The command table's `Owns` cell for `/workflow-init` now names the
  reconcile pass.
- **`docs/architecture.md`** — UPDATED. Same, with the never-automatic constraint spelled out.
- **`docs/decisions/0018-the-forge-is-the-backlog.md`** — UPDATED. Status line moves from "step 6 is
  not done and owns the remaining risk" to step 6 shipped, and carries the correction this run made
  to the record (halfway fails in both directions).
- **`CHANGELOG.md`** — UPDATED under `[Unreleased]`, one entry per issue.
- **`docs/conventions.md`** — no-impact. No new convention was established; the run applied the
  existing mutation-proof and generated-surface rules rather than adding to them.
- **`docs/workflow-state-contract.md`** — no-impact. Nothing about the claim record or the run
  record changed.
- **`docs/README.md`** — no-impact. No document was added or removed.
- **`.env.example`** — no-impact. No environment variable was added, read or retired.
- **Project `CLAUDE.md`** — no-impact, and checked rather than assumed: its Durable State Contract
  already says `_rules.md` is the one surviving local file and that nothing else under `.roadmap/`
  is generated or tracked. This run adds a migration path for repos that still carry the retired
  layer; it changes nothing about what this repo tracks.
- **Issue comments** — #990 carries the written decision the issue asked for, posted before
  finalization (`issues/990#issuecomment-5306133670`).

## Gaps found and fixed

One, found while writing this table: the rename's own scope. #990's body named only
`simulate-workflow-walkthrough.js`, but the identifier was cited by name in two other test files.
Fixed in the same commit rather than filed — leaving them would have produced exactly the dangling
citation the issue exists to remove.
