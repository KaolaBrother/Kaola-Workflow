node: impl_opskills (implementer) — Fix 1b drop resolve-agent-model dispatch clause

non_tdd_reason: prose/operational-text edit to two Codex-only markdown skill bodies (plan-run + adapt). No runtime code path reads them as code; no natural failing unit test. Verification is npm test (Codex contract validator pins concept tokens).

Edit 1 — plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md (~L168-170):
  OLD: "...Codex delegates to the matching agent profile; resolve its model via `node "$KAOLA_SCRIPTS/kaola-workflow-resolve-agent-model.js" <role>`). Pass"
  NEW: "...Codex delegates to the matching agent profile by role name; the role's `model_reasoning_effort` tier in its `agents/<role>.toml` profile is the model signal). Pass"

Edit 2 — plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md (~L22-23):
  OLD: "The author **never** sets a model — it comes only from `resolve-agent-model`."
  NEW: "The author **never** sets a model — on Codex it comes from the role's `model_reasoning_effort` tier in its `agents/<role>.toml` profile (selected by role name)."

Verified in worktree: new text present, old text gone in both files; repo-root copies unmodified (no pollution).
regression-green: npm test exit 0 across all 4 suites — claude (walkthrough passed), codex (contract validation + walkthrough passed), gitlab (walkthrough + codex walkthrough passed), gitea (walkthrough + codex walkthrough passed). Codex assertConcept/assertIncludes pins on adapt skill (workflow-plan.md, ## Nodes, post-dominate, finalize, FANOUT_CAP, plan_hash, typed refusal, workflow-planner, MUST delegate) all still satisfied.
