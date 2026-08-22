# Issue #1013 implementation evidence

## Assigned task

Implement the Cursor generator's canonical model-class pins and truthful model-free dispatch
guidance. `sonnet` and `standard` canonical tokens render raw, unquoted
`model: grok-4.6[effort=medium]`; `opus` and `reasoning` render raw, unquoted
`model: grok-4.6[effort=high]`. Unknown or absent tokens fail closed with an agent-specific error.
Task cards continue to strip per-call model placeholders and reject dispatch residue. The installer
model comment was updated to describe generated per-tier frontmatter while preserving the statement
that no user-specific per-role config is seeded.

## Verification tier

tests-green

## Before implementation

- Command: `node scripts/test-cursor-edition.js`
- Exit: `1`
- Result: D0 found `.cursor`, `.cursor-gitlab`, and `.cursor-gitea` in parity; the authored RED
  suite reported `29 failure(s), 521 passed` for inherit frontmatter and unknown-class rejection.

## Implementation

Changed production paths only:

- `scripts/sync-cursor-edition.js`
- `install-cursor.sh` (comment/help prose only; no installer behavior change)

The generated trees were refreshed for the present forge variants at the shared tree root:
`.cursor/`, `.cursor-gitlab/`, and `.cursor-gitea/`. They are generated/ignored outputs, not source
ownership changes.

## After verification

- Command: `node --check scripts/sync-cursor-edition.js`
- Exit: `0`
- Result: syntax accepted.

- Command: `bash -n install-cursor.sh`
- Exit: `0`
- Result: shell syntax accepted.

- Command: `node scripts/sync-cursor-edition.js --forge=github --write`
- Exit: `0`
- Result: refreshed 15 generated files.

- Command: `node scripts/sync-cursor-edition.js --forge=gitlab --write`
- Exit: `0`
- Result: refreshed 15 generated files.

- Command: `node scripts/sync-cursor-edition.js --forge=gitea --write`
- Exit: `0`
- Result: refreshed 15 generated files.

- Command: `node scripts/test-cursor-edition.js`
- Exit: `0`
- Result: `cursor-edition test passed (550 assertions)`; all three generated trees were in parity.

- Command: `node scripts/sync-cursor-edition.js --forge=github --check`
- Exit: `0`
- Result: `14 agent(s) + 3 command(s) + 2 hook file(s) in parity with canonical.`

- Command: `node scripts/sync-cursor-edition.js --forge=gitlab --check`
- Exit: `0`
- Result: `14 agent(s) + 3 command(s) + 2 hook file(s) in parity with canonical.`

- Command: `node scripts/sync-cursor-edition.js --forge=gitea --check`
- Exit: `0`
- Result: `14 agent(s) + 3 command(s) + 2 hook file(s) in parity with canonical.`

- Command: `git diff --check`
- Exit: `0`
- Result: no whitespace errors.

- Command: a read-only `renderAgent` probe for `sonnet`, `standard`, `opus`, `reasoning`, absent,
  and unsupported tokens
- Exit: `0`
- Result: medium/high pins matched the four known tokens; absent and unsupported values threw
  useful errors naming the agent and the accepted token allowlist.

No commit was created.
