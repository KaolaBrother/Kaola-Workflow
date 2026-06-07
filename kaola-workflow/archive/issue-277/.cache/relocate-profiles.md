# Node: relocate-profiles — Evidence Record

non_tdd_reason: profile prose relocation across 3 forge editions; no failing unit test is possible for prose content added to TOML profile files — this is config/scaffolding work with no behavioral logic.

build-green: all 6 declared TOML files parsed cleanly via python3 tomllib (ok reported for each); forbidden-token grep (gh , github, GitHub, pull request, PR URL, PR number, ./scripts) returned no matches across all 6 files; git diff --stat scoped to the 6 declared paths shows exactly 30 insertions and 0 deletions from any non-declared file; grep -ci 'finaliz' on each contractor.toml returned 4 (>0).

## task
Add a concise "Finalize bookkeeping (Phase-6 Step 8a/8b/7/8)" subsection to the `developer_instructions` field of each of the 3 forge editions of contractor.toml, making each profile the sole home of the contractor's finalize method. Add one M4 run-posture clarifier sentence to each of the 3 forge editions of workflow-planner.toml.

## write_set
- plugins/kaola-workflow/agents/contractor.toml
- plugins/kaola-workflow/agents/workflow-planner.toml
- plugins/kaola-workflow-gitlab/agents/contractor.toml
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
- plugins/kaola-workflow-gitea/agents/contractor.toml
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml

## verification_commands

TOML parse (all 6):
  python3 -c "import tomllib,sys; tomllib.load(open(sys.argv[1],'rb')); print('ok',sys.argv[1])" <each file>
  exit 0 for all 6

Forbidden-token grep:
  grep -nE 'gh |github|GitHub|pull request|PR URL|PR number|\./scripts' <all 6 files>
  exit 1 (no matches)

Finalize presence:
  grep -ci 'finaliz' <each contractor.toml>
  4, 4, 4

Diff scope:
  git diff --stat -- <6 declared files>
  6 files changed, 30 insertions(+)

## before_result
contractor.toml x3: zero finalize content (only Method/Boundaries/Output contract sections).
workflow-planner.toml x3: claim+author+handoff owned; no M4 posture clarifier; no stale "does NOT provision a worktree" text present.

## after_result
contractor.toml x3: "Finalize bookkeeping (Phase-6 Step 8a/8b/7/8)" subsection added before Boundaries block; describes Steps 8a/8b/7/8 in concise forge-neutral prose; references scripts by role/name only; no bash, no backslashes, no forbidden tokens.
workflow-planner.toml x3: "Run posture (M4)" sentence added before Hard boundary block; states adaptive claim always provisions a repo-local worktree; no "does NOT provision a worktree" phrasing anywhere.
All 6 TOML files parse cleanly. No forbidden tokens. Diff scoped to declared 6 files only.
