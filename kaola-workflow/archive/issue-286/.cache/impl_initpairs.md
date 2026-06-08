node: impl_initpairs (implementer) — Fix 1a edition-neutral init-template rewrite

non_tdd_reason: prose/operational-text edit to a markdown documentation template (the workflow-init CLAUDE.md template). No behavioral code path; structural correctness is enforced by the byte-identity validators under npm test, not a unit test.

Edit applied (IDENTICAL replacement string in all 6 byte-identity-pair files):
  OLD: "- Use the vendored agent names exactly as installed under `~/.claude/agents`; prefer short names like `planner`. When spawning a Kaola subagent, resolve its installed frontmatter model and pass it explicitly as `model=` on the `Agent(...)` call."
  NEW: "- Use the vendored agent role names exactly as installed; prefer short names like `planner`. When spawning a Kaola subagent, pass the role's configured model on the spawn call — each agent ships its model in its installed profile."

Files (3 byte-identity pairs):
  - commands/workflow-init.md (L119) + plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md (L66)
  - plugins/kaola-workflow-gitlab/commands/workflow-init.md (L119) + plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md (L66)
  - plugins/kaola-workflow-gitea/commands/workflow-init.md (L119) + plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md (L66)

Verification: grep old-text → 0 matches (gone); grep new-text → 6 matches.
regression-green: npm test exit 0 AFTER edit — "OK: 18 common scripts and 7 byte-identical file group in sync", "Kaola-Workflow Codex contract validation passed", "Kaola-Workflow GitLab contract validation passed", "Kaola-Workflow Gitea contract validation passed", "Workflow walkthrough simulation passed". Byte-identity (validate-kaola-workflow-contracts.js per-forge-pair CLAUDE.md template) holds.

NOTE (user-facing): this edits the shared Claude↔Codex template, so the Claude CLAUDE.md guidance also changes (drops the `~/.claude/agents`/`model=` literals, keeps the pass-the-model intent) — AC3's accepted consequence; to be recorded in CHANGELOG/PR by finalize.
