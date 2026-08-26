# Issue #1033 runtime-native carrier acceptance — RED record

## Assigned acceptance surface

- `templates/agents/runtime-capabilities.json` owns runtime-specific model and effort identifiers.
  Cursor's rendered Grok model family and ZCode's rendered GLM model must be mutable through only
  their target adapter, and the profile renderer must not carry either identifier as a literal.
- Kimi, Grok, and ZCode adapters declaring `tool_binding: profile_tools` must emit one native
  frontmatter `tools` allowlist per role. The allowlist is derived from the role's behavior
  capability requirements; prose-only restrictions are not enforcement.
- Grok's native profile fields use camelCase. `promptMode`, `permissionMode`, and `agentsMd` must
  reach the runtime; the snake_case near-miss is rejected.
- Project and global ZCode installs merge executable Kaola hooks only into the documented live user
  config at `${ZCODE_HOME}/cli/config.json`. The ignored project `.zcode/config.json` and legacy
  `${ZCODE_HOME}/config.json` are decoys and remain byte-identical. Uninstall strips only Kaola hook
  entries from the live config while retaining user keys and hooks. User-scope agents are the
  authority; project-scope agent staging is not required by the acceptance suite.

## Baseline

- Commit anchor actually checked while the candidate production tree was present:
  `d833af630077876b45e54e7ebdf611fb0a7939cc` (`test: require Kimi native agents (#1033)`).
- The worktree also contained the orchestrator's uncommitted #1033 production candidate. This RED
  therefore falsifies the current candidate, not merely the older clean commit.
- Grok native-key evidence was checked against first-party source
  `xai-org/grok-build@77cd7eb675ba911c225c3aaeeece3a20cbccc426`,
  `crates/codegen/xai-grok-agent/src/config.rs`: `AgentDefinition` uses
  `#[serde(rename_all = "camelCase")]` and declares `prompt_mode`, `permission_mode`, and
  `agents_md`, yielding YAML keys `promptMode`, `permissionMode`, and `agentsMd`.

## Tests authored

- `scripts/test-runtime-agent-architecture.js`
  - mutates Cursor and ZCode model identifiers in adapter data and requires every and only the
    target runtime profiles to change;
  - mutates target effort mapping and requires target-only profile changes;
  - requires exact native `tools` allowlists for all Kimi/Grok/ZCode roles;
  - removes write/shell capabilities from an implementer fixture and requires
    `Write`/`Edit`/`Bash` to disappear from the carrier.
- `scripts/test-grok-edition.js`
  - requires adapter-owned effort knowledge, camelCase native keys, and exact per-role `tools`.
- `scripts/test-zcode-edition.js`
  - requires adapter-owned model/thought knowledge and exact per-role `tools`;
  - exercises the real installer in project/global/no-scripts/uninstall fixtures against the live
    `${ZCODE_HOME}/cli/config.json`, byte-preservation decoys, and executable hook commands.

## Commands and RED signatures

1. `node --check scripts/test-runtime-agent-architecture.js`
2. `node --check scripts/test-grok-edition.js`
3. `node --check scripts/test-zcode-edition.js`

All three syntax checks exited zero.

4. `node scripts/test-runtime-agent-architecture.js`

Exit 1: `runtime-agent-architecture test FAILED: 66 failure(s), 289 passed.`

Acceptance failure signatures included:

- `A10-native[cursor]: adapter data owns rendered model identifier "grok-4.6"`
- `A10-native[zcode]: adapter data owns rendered model identifier "GLM-5.3"`
- `A10-tools[grok/adversarial-verifier]: native frontmatter carries one executable tools allowlist`
- `A10-tools[zcode/mutation]: removing write and shell capabilities removes Write/Edit/Bash from the enforced native allowlist`

5. `node scripts/test-grok-edition.js`

Exit 1: `grok-edition test FAILED: 88 failure(s), 623 passed.`

Acceptance failure signatures included:

- `G0-adapter: sync-grok-edition carries no executable hardcoded effort table; runtime-capabilities.json is the sole runtime identifier authority`
- `G1[adversarial-verifier]: native camelCase promptMode is full — got undefined`
- `G1[adversarial-verifier]: frontmatter contains no ignored snake_case spellings for Grok native fields`
- `G1[planner]: frontmatter carries exactly one executable tools allowlist`

6. `node scripts/test-zcode-edition.js`

Exit 1: `zcode-edition test FAILED: 38 failure(s), 774 passed.`

Acceptance failure signatures included:

- `G0-adapter: runtime-capabilities.json owns the rendered ZCode model identifier GLM-5.3`
- `G1[planner]: frontmatter carries exactly one executable tools allowlist`
- `G8-project: ignored <project>/.zcode/config.json is not used or rewritten`
- `G8-global: legacy ${ZCODE_HOME}/config.json is not used or rewritten`
- `G8-uninstall: seed install first merged Kaola hooks into the live user config`

## Verdict

RED is established against the current production candidate. The test-author context has not run a
green verdict and has not changed production or documentation.
