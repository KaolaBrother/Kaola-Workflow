# scout-role node evidence — issue #328

non_tdd_reason: declarative agent profile prose — no behavioral unit under test, profiles are descriptive

## Task

Author the new read-only `issue-scout` agent profile across all 4 editions:
- `agents/issue-scout.md` (root markdown profile)
- `plugins/kaola-workflow/agents/issue-scout.toml`
- `plugins/kaola-workflow-gitlab/agents/issue-scout.toml`
- `plugins/kaola-workflow-gitea/agents/issue-scout.toml`

## Category

Scaffolding / boilerplate — new declarative agent profile files carrying no behavioral logic. These profiles are descriptive text consumed by dispatchers; they do not implement algorithms or side-effecting logic.

## Write Set (actual)

1. `agents/issue-scout.md` — root markdown profile with YAML frontmatter (`name`, `description`, `model: sonnet`, `tools: ["Read","Grep","Glob","Bash"]`) and locally-authored provenance comment. Includes Prompt Defense Baseline + read-only role contract + recommended_bundle JSON output spec.
2. `plugins/kaola-workflow/agents/issue-scout.toml` — TOML profile for the claude/codex plugin edition.
3. `plugins/kaola-workflow-gitlab/agents/issue-scout.toml` — TOML profile for the gitlab plugin edition.
4. `plugins/kaola-workflow-gitea/agents/issue-scout.toml` — TOML profile for the gitea plugin edition.

## Edition Parity Notes

All three plugin .toml files are byte-identical. This matches the universal convention confirmed by inspecting the 13 existing agent profiles: `diff -r` between kaola-workflow/, kaola-workflow-gitlab/, and kaola-workflow-gitea/ agents dirs shows only a minor prose diff in workflow-planner.toml and a .gitkeep in gitlab — all other agents including code-explorer are byte-identical across editions. Writing issue-scout's three .toml files as forge-neutral and byte-identical is correct; introducing forge-specific prose would make issue-scout the lone diverging agent against the established convention.

The root .md uses locally-authored provenance (not the vendored upstream/MIT block from code-explorer.md, which is an external vendor artifact). Pattern sourced from `agents/implementer.md`.

## Structural Parity with code-explorer

| Aspect | code-explorer.md | issue-scout.md |
|--------|-----------------|----------------|
| Frontmatter | `name`, `description`, `model: sonnet`, `tools` | same keys |
| Provenance comment | vendored upstream block | locally-authored block |
| Prompt Defense Baseline | present | present |
| Role body | exploration protocol | read-only clustering protocol |
| .toml schema | `model_reasoning_effort` + `developer_instructions` | same keys |
| Edition count | 3 (byte-identical .toml) | 3 (byte-identical .toml) |

issue-scout adds `Bash` to tools (beyond code-explorer's `[Read, Grep, Glob]`) to support `gh issue list` / `gh issue view` forge reads. This is correct per the issue §A spec and design.md §CONTRACT.

## Verification Commands

### Baseline (before changes)

```
node scripts/simulate-workflow-walkthrough.js
# → Workflow walkthrough simulation passed (exit 0)

node scripts/validate-script-sync.js
# → OK: 18 common scripts and 7 byte-identical file group in sync (exit 0)
```

### After changes

```
node scripts/simulate-workflow-walkthrough.js
# → Workflow walkthrough simulation passed (exit 0)

node scripts/validate-script-sync.js
# → OK: 18 common scripts and 7 byte-identical file group in sync (exit 0)
```

build-green

## Notes

- The gitlab/gitea contract validators (`validate-kaola-workflow-{gitlab,gitea}-contracts.js`) assert `agentFiles.length === 13` and will transiently report 14 until the `contracts-registration` node bumps the count. This is expected and is NOT a failure of this node.
- issue-scout is NOT in WRITE_ROLES / IMPLEMENT_ROLES / GATE_VERDICT_ROLES — only in CANONICAL_ROLES (that edit belongs to the `validator-roles` node) and in REQUIRED_AGENTS/default_agent_model (the `scout-registration` node).
- No COMMON_SCRIPTS or BYTE_IDENTICAL_GROUPS entries are needed for agent profile files.
