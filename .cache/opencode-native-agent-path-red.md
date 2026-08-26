# OpenCode native agents and commands path — RED evidence

## Assigned acceptance

Freeze the OpenCode-native filesystem contract for issue #1033 without changing production code:

- project profiles are exactly the 14 canonical roles at `.opencode/agents/<role>.md`;
- global profiles are exactly the same 14 roles at `<config>/agents/<role>.md`;
- project commands are exactly the three workflow commands at `.opencode/commands/<command>.md`;
- global commands are exactly the same three commands at `<config>/commands/<command>.md`;
- generator check/write and install/reinstall converge idempotently on those plural paths;
- legacy singular `agent/` migration deletes only files whose prior manifest hash proves Kaola
  ownership, preserves edited or unrecorded user profiles, and removes the directory only when empty;
- legacy singular `command/` migration deletes only the complete Kaola current/retired allowlist,
  preserves unknown user files, and removes the directory only when empty;
- an unmanaged same-name profile already present in the plural directory makes project and global
  installation fail closed without overwriting it or deploying other profiles;
- project and global uninstall remove Kaola-owned plural agents and commands plus their legacy
  singular counterparts while preserving unrelated user files and `opencode.json`;
- command, config, plugin, hook, and support-script behavior outside the path migration remains intact.

The current official OpenCode documentation was checked immediately before authoring the tests:

- `https://opencode.ai/docs/agents/` names project `.opencode/agents/` and global
  `~/.config/opencode/agents/`.
- `https://opencode.ai/docs/commands/` names project `.opencode/commands/` and global
  `~/.config/opencode/commands/`.

## Test artifact

`scripts/test-opencode-edition.js` now contains the independent `NATIVE-AGENT-PATH (#1033)`
acceptance band and mechanically points the existing OpenCode profile/command assertions at the
plural native paths. The band uses real `sync-opencode-edition.js` and `install-opencode.sh`
processes against isolated project and config-root fixtures; it does not mock the generator or
installer.

The exact accepted rosters are pinned as:

- 14 profiles: `adversarial-verifier`, `build-error-resolver`, `code-architect`, `code-explorer`,
  `code-reviewer`, `doc-updater`, `implementer`, `investigator`, `knowledge-lookup`,
  `metric-optimizer`, `planner`, `security-reviewer`, `synthesizer`, `tdd-guide`.
- 3 commands: `kaola-workflow-finalize`, `workflow-init`, `workflow-next`.

Plausible near-misses caught explicitly include writing both singular and plural trees, deleting an
unmanaged profile on collision, treating a user-edited manifest entry as still owned, sweeping an
unknown singular command, cleaning only current commands but not retired commands, skipping global
layout migration, leaving legacy generated directories after `--write`, and uninstall passing
vacuously because the plural install never happened.

## Baseline and commands

Baseline commit actually checked out for the RED run:

`bb139e8abc70889fbfa69dea330827f086189ce6`

The shared workflow worktree also contained the parent run's concurrent #1033 all-runtime WIP; the
OpenCode generator and installer under test still resolved and deployed singular `agent/` and
`command/` paths. The acceptance test is the only file from this subtask in that working-tree delta.

Commands run:

```text
node --check scripts/test-opencode-edition.js
git diff --check -- scripts/test-opencode-edition.js
node scripts/test-opencode-edition.js
```

The syntax and diff checks exited zero. The project-owned edition command exited 1 with this final
summary:

```text
opencode-edition test FAILED: native plural layout absent after 46 recorded failure(s), 402 passed.
```

## Expected RED signatures

The baseline failures name the false acceptance claims directly:

```text
N1 (#1033): sync.OUT_AGENT_DIR names the OpenCode-native plural path .opencode/agents/;
got .../.opencode/agent

N2 (#1033): sync --write generates EXACTLY 14 native profiles under .opencode/agents/ — got []

N1-command (#1033): sync.OUT_COMMAND_DIR names the OpenCode-native plural path
.opencode/commands/; got .../.opencode/command

N2-command (#1033): sync --write generates EXACTLY 3 workflow commands under
.opencode/commands/ — got []

N5-retire (#1033): sync --write removes both retired singular generated directories

N6-project (#1033): project install deploys exactly 14 profiles to .opencode/agents/ — got []

N6-project (#1033): commands deploy exactly at the native commands/ path — got []

N6-global (#1033): global install deploys exactly 14 profiles to <config>/agents/ — got []

N6-global (#1033): commands deploy exactly at the native commands/ path — got []

N8-project (#1033): install retires an unchanged Kaola-owned singular profile

N8-command-project (#1033): project install retires every Kaola current/retired command from
singular command/ — left ["kaola-workflow-finalize.md","workflow-init.md","workflow-next.md"]

N8-command-global (#1033): global install retires every Kaola current/retired command from
singular command/ — left ["kaola-workflow-finalize.md","workflow-init.md","workflow-next.md"]

N10-project (#1033): unmanaged same-name plural profile makes project install fail closed

N10-global (#1033): unmanaged same-name plural profile makes global install fail closed

N11-project (#1033) anti-vacuity: seed install created the exact plural roster before uninstall

N11-command-global (#1033) anti-vacuity: seed install created the exact global plural command
roster before uninstall
```

These are intentional RED results. No green verdict is claimed by the test author.
