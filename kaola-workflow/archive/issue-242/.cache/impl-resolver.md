# impl-resolver evidence — issue #242 Part A

## (a) RED evidence

Tests run against the OLD resolver (before implementation), showing new cases fail:

```
node:assert:152
  throw new AssertionError(obj);
  ^

AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

'' !== 'opus'

    at Object.<anonymous> (/Users/ylpromax5/Workspace/Kaola-Workflow/scripts/test-agent-model-resolver.js:45:10)
    ...
  actual: '',
  expected: 'opus',
  operator: 'strictEqual',

EXIT: 1
```

The first failure is at line 45: `planner` with frontmatter `inherit` + no manifest → old resolver
short-circuits via `modelFromFile` (returns `'inherit'`), maps to `''`, and never reaches
`DEFAULT_AGENT_MODELS`. New cases 1/2 would also fail for the same root cause (manifest not read).

## (b) GREEN evidence

After implementing the new precedence in `resolveAgentModel`:

```
node scripts/test-agent-model-resolver.js
Agent model resolver tests passed
EXIT: 0

node scripts/validate-script-sync.js
OK: 11 common scripts and 5 byte-identical file group in sync.
EXIT: 0
```

Both gate commands pass. Files 2/3/4 are byte-identical to file 1 (confirmed by validate-script-sync.js).

## (c) Summary of precedence change

Old resolver: `modelFromFile(name, dir) || DEFAULT_AGENT_MODELS[name] || ''` — any truthy
frontmatter value (including `'inherit'`) short-circuited the DEFAULT fallback, then `inherit→''`
discarded the DEFAULT entirely.

New resolver follows a strict 4-step precedence:
1. Read `.kaola-agent-models.json` from agentDir (manifest written at install time). If it has
   an own-property for the agent name, return that value (`inherit`→`''`). Missing or unparseable
   manifest falls through silently (try/catch).
2. Read frontmatter from `<name>.md`. Only return it if non-empty AND not `inherit`. A frontmatter
   of `inherit` now falls through instead of shadowing step 3.
3. `DEFAULT_AGENT_MODELS[name]` — the static per-role table (e.g. `planner→opus`).
4. Return `''`.

This means install.sh's `model: inherit` rewrite no longer silently kills the DEFAULT fallback,
and a manifest entry (carrying profile-aware values like `opus` for security-reviewer) always wins.
