# Node Evidence: dedupe-closure (issue #262)

## task
Roadmap-closure de-duplication: the per-issue rm + regenerate block ran twice
during finalize (once in `cmdFinalize`/`archiveProjectDir` Step 8b, and again in
the contractor Step 7 body). Fix: make `cmdFinalize` the sole closure owner;
reduce contractor Step 7 to staging only. Remove stray `rm -f` blocks from gitlab
and gitea phase6.md editions. Add doc notes to Claude phase6.md and contractor.md.

## non_tdd_reason
Behavior-preserving refactor — restructures procedure text in prompt/markdown files
without changing observable execution behavior (closure still happens exactly once,
owned by cmdFinalize); proof = full suite green before and after.

## write_set
- agents/contractor.md
- commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md

## changes_summary

### A) agents/contractor.md (Step 7)
REMOVED:
- "If this project was linked to GitHub issue N, delete its per-issue roadmap file:" prose + bash block:
  `rm -f kaola-workflow/.roadmap/issue-N.md`
- "(`rm -f` is idempotent — safe if the file is missing or no issue was linked.)" note
- "Regenerate `ROADMAP.md` from the remaining per-issue files:" prose + bash block:
  `kaola_script(){ ... }` helper + `ROADMAP_JS=...` + `[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" generate`
- "Stage both the deleted per-issue file and the regenerated `ROADMAP.md` together in the final commit:" preamble

KEPT:
- `git add kaola-workflow/.roadmap/issue-N.md kaola-workflow/ROADMAP.md` staging block (load-bearing)

ADDED:
- One-sentence note: closure (rm + regenerate) is performed by `cmdFinalize`/`archiveProjectDir`
  at Step 8b; Step 7 now only stages the result.
- Section retitled: "Step 7 - Roadmap git-add Staging"

### B) plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md (~line 491)
REMOVED stray block:
  "If this project was linked to GitLab issue N, delete its per-issue roadmap file:"
  ```bash
  rm -f kaola-workflow/.roadmap/issue-N.md
  ```
  "(`rm -f` is idempotent — safe if the file is missing or no issue was linked.)"

KEPT: delegation note ("The roadmap-regen + git-add staging runnable body lives
exclusively in `agents/contractor.md`...") and all surrounding prose.

### C) plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md (~line 491)
REMOVED stray block (same pattern as gitlab):
  "If this project was linked to Gitea issue N, delete its per-issue roadmap file:"
  ```bash
  rm -f kaola-workflow/.roadmap/issue-N.md
  ```
  "(`rm -f` is idempotent — safe if the file is missing or no issue was linked.)"

KEPT: delegation note and all surrounding prose.

### D) commands/kaola-workflow-phase6.md (Claude)
No removals (already no runnable rm/generate block).
ADDED: Short doc note above the delegation sentence clarifying that the actual
closure (rm + regenerate) is owned by `cmdFinalize`/`archiveProjectDir` at Step 8b,
and that the contractor Step 7 body only stages the result — ensuring single ownership.

## verification_commands
- node scripts/simulate-workflow-walkthrough.js
- node scripts/validate-workflow-contracts.js
- grep for `rm -f.*\.roadmap/issue-N\.md|node.*roadmap.*generate` across all 4 files

## before_result
- simulate-workflow-walkthrough.js: exit 0, "Workflow walkthrough simulation passed"
- validate-workflow-contracts.js: exit 0, "Workflow contract validation passed"

## after_result
- simulate-workflow-walkthrough.js: exit 0, "Workflow walkthrough simulation passed" — regression-green
- validate-workflow-contracts.js: exit 0, "Workflow contract validation passed" — build-green
- grep: zero hits (no runnable bash blocks with rm/generate remain in any of the 4 files)
- git status --porcelain: only the 4 declared files modified; no out-of-scope changes

## non_blocking_doc_accuracy_note
The delegation notes in all three phase6.md editions still say "the contractor
executes it: delete ..., run generate, then git add both files" — which no longer
matches the staging-only Step 7 in contractor.md. The task explicitly said to
preserve the delegation note verbatim (contract validator pins those strings).
The stale phrasing is a doc-accuracy issue only; behavior is unchanged. Surface
to orchestrator for a follow-up if desired.

## Follow-up: delegation-prose consistency fix
The orchestrator confirmed `validate-workflow-contracts.js` does NOT pin the
phase6 "contractor executes it" delegation sentence (it pins `archiveProjectDir`,
receipt fields, and roadmap-safeguard function names), so the stale paragraph is
editable and IS in-scope for #262 (the 3 phase6 editions are in the declared write
set). Made 3 surgical edits to remove the contradiction:

1) commands/kaola-workflow-phase6.md (Claude) — replaced the stale second paragraph
   ("The roadmap-regen + git-add staging runnable body lives exclusively in ... The
   contractor executes it: delete ..., run `kaola-workflow-roadmap.js generate`,
   then `git add` both files.") with staging-only phrasing: the contractor stages
   the closure result with `git add` and does NOT perform the delete or generate;
   those run once in `cmdFinalize` / `archiveProjectDir` (Step 8b). Kept the
   first (already-corrected) note paragraph intact.

2) plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md — replaced the
   sole stale paragraph (script name `kaola-gitlab-workflow-roadmap.js`) with the
   corrected note: closure (delete + regenerate) owned by cmdFinalize at Step 8b,
   contractor Step 7 only stages the result, does not re-run delete/generate,
   closure happens exactly once.

3) plugins/kaola-workflow-gitea/commands/kaola-workflow-phase6.md — same as gitlab
   with script name `kaola-gitea-workflow-roadmap.js`.

Re-verification (from worktree):
- node scripts/simulate-workflow-walkthrough.js → exit 0, "Workflow walkthrough
  simulation passed" — regression-green
- node scripts/validate-workflow-contracts.js → exit 0, "Workflow contract
  validation passed" — build-green
- grep "contractor executes it" across agents/commands/plugins → zero hits (stale
  phrasing fully removed)
- git status --porcelain → only the 4 declared files modified; no out-of-scope
  changes. The contradiction #262 exists to remove is now gone.
