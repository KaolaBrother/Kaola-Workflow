# Node Evidence: contracts — issue #281

non_tdd_reason: Contract presence-assertions (existence + substring checks) — declarative, no behavioral unit; the assertions are verified at finalize, not by a unit test.

## Task
Add presence-assertions for `kaola-workflow-parallel-batch.js` (and its forge variants) plus forward-reference assertions for `frontier unit` (plan-run executor) and `EFFICIENT DAGs` (workflow-planner profile) to all 5 validator files.

## Write Set
1. `scripts/validate-workflow-contracts.js` (root)
2. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (claude — BYTE-IDENTICAL pair)
3. `scripts/validate-kaola-workflow-contracts.js` (codex)
4. `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
5. `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`

## Assertions Added

### Files 1 & 2 (byte-identical pair): scripts/validate-workflow-contracts.js
- `assert(exists('scripts/kaola-workflow-parallel-batch.js'))` — script presence in root
- `assert(exists('plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js'))` — script presence in claude plugin
- `assertIncludes('install.sh', 'kaola-workflow-parallel-batch.js')` — install.sh registration (already-true)
- `assertIncludes('commands/kaola-workflow-plan-run.md', 'frontier unit')` — FORWARD REF: added by plan-run-semantics node
- `assertIncludes('agents/workflow-planner.md', 'EFFICIENT DAGs')` — FORWARD REF: added by planner-profile node

### File 3: scripts/validate-kaola-workflow-contracts.js
- `assert(exists(\`${pluginRoot}/scripts/kaola-workflow-parallel-batch.js\`))` — claude-plugin copy presence

### File 4: plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
- Added `kaola-gitlab-workflow-parallel-batch.js` to `scriptFiles` array (existence check)
- Added `kaola-gitlab-workflow-parallel-batch.js` to `installSupportScripts` array (install.sh check)
- `assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'frontier unit')` — FORWARD REF
- `assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'EFFICIENT DAGs')` — FORWARD REF

### File 5: plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- Added `kaola-gitea-workflow-parallel-batch.js` to `scriptFiles` array (existence check)
- Added `kaola-gitea-workflow-parallel-batch.js` to `installSupportScripts` array (install.sh check)
- `assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'frontier unit')` — FORWARD REF
- `assertIncludes(pluginRoot + '/agents/workflow-planner.toml', 'EFFICIENT DAGs')` — FORWARD REF

## Verification Commands and Results

### Syntax checks (node --check — does NOT execute assertions)
```
node --check scripts/validate-workflow-contracts.js                                        exit 0
node --check plugins/kaola-workflow/scripts/validate-workflow-contracts.js                 exit 0
node --check scripts/validate-kaola-workflow-contracts.js                                  exit 0
node --check plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js  exit 0
node --check plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js    exit 0
```
All 5 validators: SYNTAX OK

### Byte-identical diff (files 1 & 2)
```
diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js
(empty — files are byte-identical)
```

### Script existence (already-true assertions)
```
scripts/kaola-workflow-parallel-batch.js                              EXISTS
plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js       EXISTS
plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-parallel-batch.js  EXISTS
plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-parallel-batch.js    EXISTS
```

### install.sh registration (already-true assertions)
```
grep "parallel-batch" install.sh:
  line 158: kaola-workflow-parallel-batch.js
  line 188: kaola-gitlab-workflow-parallel-batch.js
  line 223: kaola-gitea-workflow-parallel-batch.js
```

### Assertion substring presence (grep confirms)
All added assertion substrings confirmed present in each file via grep.

## Forward-Reference Note
The `frontier unit` and `EFFICIENT DAGs` assertions are forward-references satisfied by nodes plan-run-semantics (node 8) and planner-profile (node 9); they will pass at finalize. The per-node barrier does NOT run these contract validators. The target files are:
- `commands/kaola-workflow-plan-run.md` — written by plan-run-semantics
- `agents/workflow-planner.md` — written by planner-profile
- `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` — written by plan-run-semantics
- `plugins/kaola-workflow-gitlab/agents/workflow-planner.toml` — written by planner-profile
- `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` — written by plan-run-semantics
- `plugins/kaola-workflow-gitea/agents/workflow-planner.toml` — written by planner-profile
- `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` — written by plan-run-semantics
The github validate-workflow-contracts.js checks `commands/kaola-workflow-plan-run.md` and `agents/workflow-planner.md` (shared root files). The gitlab/gitea validators check their edition-specific command and agent files.

## CASE-SENSITIVITY PINS (critical — assertIncludes does NOT lowercase)
These are the EXACT byte-match substrings that must appear in the respective target files:
- `frontier unit` — LOWERCASE. Nodes 8 must emit this exact lowercase form in ALL four plan-run files (commands + SKILL). The plan notes say "FRONTIER UNIT" in uppercase; the assertion pins lowercase — node 8 MUST use lowercase.
- `EFFICIENT DAGs` — As written (uppercase EFFICIENT, mixed DAGs). Node 9 must emit this exact string in agents/workflow-planner.md AND in the three edition workflow-planner.toml files (the gitlab/gitea validators check the `.toml` files, not just the shared `.md`).

Node 9 MUST write `EFFICIENT DAGs` into the edition `.toml` files, not only into `agents/workflow-planner.md`. The `.toml` files are in node 9's declared write set.

## Verification Result
build-green
