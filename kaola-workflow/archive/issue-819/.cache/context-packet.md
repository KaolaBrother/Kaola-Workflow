# Context Packet — issue-819

goal: issue #819

key_files:
- CHANGELOG.md
- commands/kaola-workflow-plan-run.md
- docs/api.md
- docs/decisions/D-819-01.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- scripts/kaola-workflow-adaptive-node.js
- scripts/test-adaptive-node.js
- scripts/test-route-reachability.js
- templates/routing/plan-run.skeleton.md
- templates/routing/required-blocks.js

conventions:
## Non-Negotiable Rules
- Think before coding: state assumptions, surface ambiguity, and ask when unclear.
- Read before writing: inspect the target file and relevant surrounding conventions immediately before editing or creating files.
- Keep it simple: solve the requested problem without speculative abstractions.
- Make surgical changes: touch only what the task requires.
- Goal-driven execution: Define verifiable success criteria before starting. Keep the tests in separate custody from the code they judge — whoever implements a behavior does not author its tests. Loop until criteria pass; don't declare done on weak signals.
- Verify facts, don't fabricate: do not guess API/library behavior, interfaces, or signatures — confirm them against documentation, source, or a run before relying on them. Do not claim to understand code, errors, or requirements you have not verified; name what you do not know and find out.
- Reuse before adding: before writing a new interface, search for an existing equivalent and extend it rather than duplicate functionality.
- Escalate irreversible changes: do not unilaterally make hard-to-reverse changes or alter a user-owned contract (public API, schema or data migration, dependency or build-tooling swap, deletion of working capability); state the decision and its evidence, then get confirmation before proceeding.
- **Keep provenance out of agent-facing prompts.** Agent definitions, commands, and skills carry the *rule*, never its origin — no issue refs, decision IDs, invariant tags, or ADR citations in those surfaces. Provenance belongs in `CHANGELOG.md`, `docs/decisions/`, and commit messages. Runtime target-issue variables (`KAOLA_TARGET_ISSUE=N`, `"issue N"`) are not provenance. See `docs/conventions.md`.

join_expectations:
- (no expansion point declares a join constraint yet)
