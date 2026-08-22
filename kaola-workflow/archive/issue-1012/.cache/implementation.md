# Issue #1012 implementation evidence

## Assigned task

Update `scripts/sync-grok-edition.js` so Grok agents keep `model: inherit` while
receiving exactly one effort field derived from each canonical agent's
frontmatter model token: `sonnet` or `standard` maps to `medium`, and `opus` or
`reasoning` maps to `high`. Unknown or absent tokens fail closed with an error
that names the role and token. Keep generated command cards free of per-call
model overrides and correct the generator header and generated model-dispatch
guidance. This implementation did not read `DEFAULT_AGENT_MODELS` or add a
role roster.

## Design choices

- Added one model-class-to-effort map, not a role roster; the generator reads
  `model:` from each canonical `agents/<role>.md` at render time.
- Normalized surrounding whitespace and token case before matching the four
  accepted class tokens. Any other value, including an absent field, throws a
  role/token-bearing error before an agent is emitted.
- Emitted `model: inherit` followed by one `effort:` line in every generated
  agent frontmatter. Command rendering still strips per-call model cards and
  now explains that model is inherited while effort follows the canonical role
  class.
- The test suite's ignored `.grok`, `.grok-gitlab`, and `.grok-gitea` trees were
  refreshed in the main checkout as required by its linked-worktree fixture
  behavior; no generated tracked surface was edited.

## Verification record

Verification tier: **tests-green**

All commands below ran in
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1012` unless a
different working directory is stated.

### Before production change

```text
$ node scripts/test-grok-edition.js
exit: 1
D0: .grok, .grok-gitlab, and .grok-gitea were present and in parity.
grok-edition test FAILED: 70 failure(s), 473 passed.
```

The failures were the authored missing-effort assertions for the canonical
standard and reasoning roles.

### After production change

```text
$ node scripts/sync-grok-edition.js --refresh-present
exit: 0
sync-grok-edition: refreshed 3 present tree(s): .grok, .grok-gitlab, .grok-gitea.
sync-grok-edition: NOTE — 45 change(s) in a checkout that is not this one.
```

```text
$ node scripts/test-grok-edition.js
exit: 0
D0: .grok is present and in parity with canonical. [tree root: /Users/ylpromax5/Workspace/Kaola-Workflow, not this checkout]
D0: .grok-gitlab is present and in parity with canonical. [tree root: /Users/ylpromax5/Workspace/Kaola-Workflow, not this checkout]
D0: .grok-gitea is present and in parity with canonical. [tree root: /Users/ylpromax5/Workspace/Kaola-Workflow, not this checkout]
grok-edition test passed (543 assertions). [drift-check: 3 tree(s) in parity (.grok, .grok-gitlab, .grok-gitea)] [tree root: /Users/ylpromax5/Workspace/Kaola-Workflow, not this checkout]
```

```text
$ node - <<'NODE' ... NODE
exit: 0
helper probe passed (4 accepted mappings, 3 fail-closed tokens)
```

The direct pure-render probe exercised `sonnet`, `standard`, `opus`, and
`reasoning`, then verified that `haiku`, `gpt`, and an absent token fail for
`probe-role`.

```text
$ node scripts/sync-grok-edition.js --check
exit: 0
sync-grok-edition[github]: 14 agent(s) + 3 command(s) + 2 hook file(s) in parity with canonical.
```

```text
$ git diff --check
exit: 0
```

## Files changed by this implementation

- `scripts/sync-grok-edition.js`
- `kaola-workflow/issue-1012/.cache/implementation.md`
