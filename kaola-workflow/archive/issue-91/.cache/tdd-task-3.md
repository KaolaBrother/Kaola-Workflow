# TDD Task 3 Evidence - Skill Routing And Intentional Invoked Documentation

Status: complete

## RED

Commands:

```bash
node scripts/validate-kaola-workflow-contracts.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
```

Result: both failed as expected after validator assertions were added.

Key failures:

```text
plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md must include:
extract and reassign `delegation_policy:` alongside `phase` and `next_skill`

GitLab next skill must explicitly resume delegation_policy alongside phase and next_skill
```

## GREEN

Implemented:

- Codex and GitLab next skills now say to extract and reassign
  `delegation_policy:` alongside `phase` and `next_skill` on resume.
- Codex and GitLab ideation/plan/finalize skills now explain that plain
  `invoked` is intentional for non-Codex-role workflow gates.
- Codex and GitLab validators assert those docs remain present.

Commands:

```bash
node scripts/validate-kaola-workflow-contracts.js
node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
```

Results:

```text
Kaola-Workflow Codex contract validation passed
Kaola-Workflow GitLab contract validation passed
```
