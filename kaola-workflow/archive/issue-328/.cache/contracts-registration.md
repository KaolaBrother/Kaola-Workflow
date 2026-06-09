# contracts-registration evidence — issue #328

## task
Bump the agent-profile count assertions from 13 → 14 for the new `issue-scout` profile in the
gitlab and gitea contract validators and forge test scripts; wire the three new test-bundle-*.js
files into the `test:kaola-workflow:claude` package.json chain; confirm validate-script-sync.js
needs no change (root-only test files are not COMMON_SCRIPTS).

## non_tdd_reason
presence/count assertions + test-runner wiring — declarative count literals and package.json chain
entries, no behavioral logic. Category: **Scaffolding / boilerplate** (wiring existing test files
into the runner chain) + **Config / IaC** (count literal updates in contract validators and forge
test scripts).

## write_set (actual touches)
1. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — L143: `=== 13` → `=== 14`, message `'expected 14 GitLab agent profiles'`
2. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — L142: `=== 13` → `=== 14`, message `'expected 14 Gitea agent profiles, got ' + agentFiles.length`
3. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — L1989: `13` → `14`, L1990: `'should install 14 agent TOML files'`; L3353: comment `// Install all 13 profiles` → `// Install all 14 profiles`
4. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — L2039: `13` → `14`, L2040: `'should install 14 agent TOML files'`; L3300: comment `// Install all 13 profiles` → `// Install all 14 profiles`
5. `package.json` — `test:kaola-workflow:claude` chain: inserted `node scripts/test-bundle-state.js && node scripts/test-bundle-claim.js && node scripts/test-bundle-finalize.js &&` between `test-adaptive-node.js` and `test-parallel-batch.js`
6. `scripts/validate-script-sync.js` — NO CHANGE (confirmed: test-bundle-*.js are root-only, like simulate-workflow-walkthrough.js, and correctly not in COMMON_SCRIPTS)

## Before/after snippets

### Edit 1 — gitlab contract validator L143
BEFORE: `assert(agentFiles.length === 13, 'expected 13 GitLab agent profiles');`
AFTER:  `assert(agentFiles.length === 14, 'expected 14 GitLab agent profiles');`

### Edit 2 — gitea contract validator L142
BEFORE: `assert(agentFiles.length === 13, 'expected 13 Gitea agent profiles, got ' + agentFiles.length);`
AFTER:  `assert(agentFiles.length === 14, 'expected 14 Gitea agent profiles, got ' + agentFiles.length);`

### Edit 3 — gitlab forge test L1987-1991
BEFORE:
```
    assert.strictEqual(
      fs.readdirSync(path.join(fresh, '.codex', 'agents', 'kaola-workflow')).length,
      13,
      'should install 13 agent TOML files'
    );
```
AFTER:
```
    assert.strictEqual(
      fs.readdirSync(path.join(fresh, '.codex', 'agents', 'kaola-workflow')).length,
      14,
      'should install 14 agent TOML files'
    );
```
Also L3353 comment: `// Install all 13 profiles` → `// Install all 14 profiles`

### Edit 4 — gitea forge test L2037-2041
BEFORE:
```
    assert.strictEqual(
      fs.readdirSync(path.join(fresh, '.codex', 'agents', 'kaola-workflow')).length,
      13,
      'should install 13 agent TOML files'
    );
```
AFTER:
```
    assert.strictEqual(
      fs.readdirSync(path.join(fresh, '.codex', 'agents', 'kaola-workflow')).length,
      14,
      'should install 14 agent TOML files'
    );
```
Also L3300 comment: `// Install all 13 profiles` → `// Install all 14 profiles`

### Edit 5 — package.json test chain addition
BEFORE: `… node scripts/test-adaptive-node.js && node scripts/test-parallel-batch.js …`
AFTER:  `… node scripts/test-adaptive-node.js && node scripts/test-bundle-state.js && node scripts/test-bundle-claim.js && node scripts/test-bundle-finalize.js && node scripts/test-parallel-batch.js …`

## BLOCKER — upstream omission: validate-vendored-agents.js not updated for issue-scout

### Problem
`scripts/validate-vendored-agents.js` asserts that `agents/` contains EXACTLY the listed agents
(L61-64: `JSON.stringify(actualAgents) === JSON.stringify(expectedAgents)`). `agents/issue-scout.md`
was added by the `scout-role` node but `validate-vendored-agents.js` was NOT in any node's write
set — `issue-scout` was never added to the `localAgents` array (L27-35).

All three required chains (`gitlab`, `gitea`, `claude`) run `validate-vendored-agents.js` and fail:
```
Error: agents directory must contain exactly: adversarial-verifier.md, build-error-resolver.md, ...
  (issue-scout.md is present in agents/ but not in the expected list)
```

### Required repair (single-line)
Add `'issue-scout'` to `localAgents` in `scripts/validate-vendored-agents.js` (L27-35):
```js
const localAgents = [
  'adversarial-verifier',
  'code-reviewer',
  'contractor',
  'implementer',
  'issue-scout',      // ADD THIS LINE — #328 locally-authored read-only profile
  'knowledge-lookup',
  'security-reviewer',
  'workflow-planner',
];
```

### Confirmed: issue-scout.md passes localAgents checks
`agents/issue-scout.md` has:
- YAML front matter at byte 0 (`---` at line 1) ✓
- `name: issue-scout` ✓
- `model: sonnet` ✓
- `kaola-workflow-managed-agent: true` in the provenance comment ✓
It is locally-authored (not vendored), so `localAgents` (provenance-exempt) is the correct array.

### Category for expand
Same node, same category (presence/count assertions). The write-set expansion adds
`scripts/validate-vendored-agents.js` to this node's 6-file allowlist as item #7.

## REPAIR APPLIED — validate-vendored-agents.js (write-set expansion approved by orchestrator)

Orchestrator swapped `scripts/validate-script-sync.js` (confirmed no-change) OUT of this node's
write set and added `scripts/validate-vendored-agents.js` IN (plan re-frozen, new plan_hash).
Updated declared write set (6 = FILE_CEILING): validate-vendored-agents.js, package.json, the two
forge contract validators, the two forge test scripts.

### Edit 7 — scripts/validate-vendored-agents.js localAgents array (L27-35)
BEFORE:
```js
const localAgents = [
  'adversarial-verifier',
  'code-reviewer',
  'contractor',
  'implementer',
  'knowledge-lookup',
  'security-reviewer',
  'workflow-planner',
];
```
AFTER:
```js
const localAgents = [
  'adversarial-verifier',
  'code-reviewer',
  'contractor',
  'implementer',
  'issue-scout',
  'knowledge-lookup',
  'security-reviewer',
  'workflow-planner',
];
```
`issue-scout` placed alphabetically between `implementer` and `knowledge-lookup`, consistent with
the array's existing ordering. The localAgents per-file checks all pass against
`agents/issue-scout.md` (front matter at byte 0, `name: issue-scout`, `model: sonnet`,
`kaola-workflow-managed-agent: true`). Confirmed by `Vendored agent validation passed for 14 agents`
in the claude/gitlab/gitea chain output.

## verification_commands — REAL exit codes (captured via `$?` / explicit redirect, NOT piped)

| # | command | real exit | sentinel |
|---|---------|-----------|----------|
| 1 | `npm run test:kaola-workflow:gitea` | **0** | `Gitea Codex workflow walkthrough simulation passed` |
| 2 | `npm run test:kaola-workflow:claude` | **0** | `Workflow walkthrough simulation passed` |
| 3 | `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | **0** | `GitLab workflow script tests passed` |
| 4 | `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | **0** | `Gitea workflow script tests passed` |
| 5 | `npm run test:kaola-workflow:gitlab` | **1** (BLOCKED — see below) | fails at `assertNoForbidden` |

### claude chain (exit 0) — the three new test-bundle files RAN
Chain output confirms all three new units executed and passed inside the chain:
- `test-bundle-state: all 25 tests passed`
- `test-bundle-claim: all 63 tests passed`
- `test-bundle-finalize: all 57 tests passed`
- `validate-script-sync.js`: `OK: 18 common scripts and 7 byte-identical file group in sync` (test-bundle-*.js correctly NOT in COMMON_SCRIPTS — Decision 4 confirmed)
- `validate-vendored-agents.js`: `Vendored agent validation passed for 14 agents`
- `Workflow walkthrough simulation passed` (item 4 of the required verification runs INSIDE the claude chain as its last step)

## SECOND BLOCKER — gitlab chain (exit 1): upstream `gh` reference in scout-role's forge toml

### Problem
`npm run test:kaola-workflow:gitlab` now clears `validate-vendored-agents.js` (14 agents) AND my
`=== 14` count assertion, then fails LATER at `assertNoForbidden` (gitlab contract validator L147):
```
Error: plugins/kaola-workflow-gitlab/agents/issue-scout.toml contains forbidden reference: /\bgh\b/
```
The OLD `=== 13` short-circuited before the forbidden-check loop was ever reached, so my count bump
EXPOSED this latent defect — it did not cause it.

### Complete violation set (enumerated in one pass — no further peeling needed)
Exactly ONE line in EACH forge toml (authored by the `scout-role` node), identical text:
```
plugins/kaola-workflow-gitlab/agents/issue-scout.toml:10:- Open issues via the forge CLI (gh issue list, gh issue view);
plugins/kaola-workflow-gitea/agents/issue-scout.toml:10:- Open issues via the forge CLI (gh issue list, gh issue view);
```
No other forbidden hits in either file (ran the full gitlab + gitea forbidden pattern set).

### Scope: gitlab-only failure, but fix BOTH forge tomls for correctness
- gitlab `assertNoForbidden` forbids `/\bgh\b/` → TRIPS on line 10 → gitlab chain RED.
- gitea `assertNoForbidden` forbids `/\bglab\b/`, `gitlab.com`, `GitLab`, `MR …`, `merge request` —
  it does NOT forbid `gh`, so the gitea chain PASSES (exit 0) DESPITE the github noun. The gitea
  toml line 10 is still a correctness defect (a gitea profile naming `gh`) and should be fixed for
  forge-neutrality even though no gitea assertion catches it.
- root `agents/issue-scout.md` (L31, L53) and the claude `.toml` legitimately keep `gh` — github
  edition. Do NOT touch those.

### Required repair (NOT in my write set — these 4 tomls belong to the `scout-role` node)
Re-open `scout-role` (owns exactly `agents/issue-scout.md` + the 3 plugin `.toml`s). Fix line 10 in
the gitlab AND gitea `issue-scout.toml`. Lowest-risk options (orchestrator/scout-role picks):
1. Forge-neutral phrasing (matches forge `code-explorer.toml`, which names NO CLI):
   `- Open issues via the forge CLI;`
2. Edition-specific CLI nouns: gitlab `glab issue list, glab issue view`; gitea `tea issue list …`.
   If using `glab`, it clears gitlab's `/\b[a-z]+glab\b/` (bare `glab` has no preceding letter, so
   no match) — but it WOULD still be safe; verify. `tea` clears gitea's list.
Option 1 is the minimal, lowest-risk fix.

## non_tdd_reason
presence/count assertions + test-runner wiring — declarative count literals and package.json chain
entries, no behavioral logic.

## build-green
My SIX declared-set edits are correct and durable, and verified green where my edits are exercised:
- claude chain: **exit 0** (validate-vendored-agents fix + the three test-bundle files ran + walkthrough)
- gitea chain: **exit 0** (count bump to 14 satisfied)
- gitlab forge test (direct): **exit 0** (count bump to 14 satisfied)
- gitea forge test (direct): **exit 0** (count bump to 14 satisfied)
- gitlab chain: **exit 1** — BLOCKED by the upstream `gh` reference in scout-role's
  `plugins/kaola-workflow-gitlab/agents/issue-scout.toml:10`, OUTSIDE this node's write set. Cannot
  honestly record gitlab build-green until scout-role repairs that line. My count-bump edit to the
  gitlab contract validator is itself correct (the chain advances past it to the unrelated forbidden
  check). Everything in MY write set is build-green; the gitlab chain RED is a separate
  upstream-owned file.
