# Phase 3 - Plan: parallel-classifier

## Blueprint

### Files to Create

| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `scripts/kaola-workflow-classifier.js` | Classifier script — classifies open issues as green/yellow/red/blocked | `cmdClassify()`, `classify(issue, claimedLocks, root)`, `readLockFiles(root)`, `readOrCreateConfig()`, `extractCoarseAreas(text)`, `parseDependsOn(labels)`, `parseAreaLabels(labels)` |

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `commands/workflow-next.md` | Rename Step 0 heading; replace code fence with candidate-scan if/fi block; add `Parallel decision:` to Required Output | Pre-claim candidate selection; advisor Bug 1 (if/fi not exit 0) |
| `install.sh` | Add `kaola-workflow-classifier.js` to explicit copy loop | Script must be deployed by installer |
| `scripts/validate-workflow-contracts.js` | Bump cap 220→230; add assertions for classifier.js, install.sh, workflow-next.md | Contract enforcement |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 6 (sub-tests 6A-6F + 6E') | Behavioral test coverage |
| `README.md` | Add classifier.js row to Scripts Reference table | Documentation |
| `CHANGELOG.md` | Add entry under [Unreleased] | Changelog |

### Build Sequence

1. `kaola-workflow-classifier.js` — standalone; no dependencies
2. `commands/workflow-next.md` — depends on classifier interface being final
3. `install.sh` — depends on script filename being final
4. `scripts/validate-workflow-contracts.js` — assertions depend on tasks 1-3 outputs existing
5. `scripts/simulate-workflow-walkthrough.js` — Epic Case 6 depends on classifier.js being runnable
6. `README.md` — documentation; any order
7. `CHANGELOG.md` — documentation; any order; last by convention

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Task 1 (classifier.js) | No dependencies; standalone creation |
| B | Tasks 2, 3, 6 (workflow-next.md, install.sh, README.md) | Disjoint write sets; can start once Task 1 spec frozen |
| C | Tasks 4, 5 (validate-contracts.js, simulate-walkthrough.js) | Disjoint; both depend on A+B being complete |
| D | Task 7 (CHANGELOG.md) | Touches no other file; any time |

### External Dependencies

None. Node.js stdlib only (`fs`, `path`, `os`, `child_process`). `gh` CLI is already a project dependency.

---

## Task List

### Task 1: CREATE `scripts/kaola-workflow-classifier.js`

- **File**: `scripts/kaola-workflow-classifier.js`
- **Test File**: `scripts/simulate-workflow-walkthrough.js` (Epic Case 6)
- **Write Set**: `scripts/kaola-workflow-classifier.js`
- **Depends On**: none
- **Parallel Group**: A
- **Action**: CREATE
- **Mirror**: `scripts/kaola-workflow-claim.js` skeleton (lines 1-30, 380-392); `scripts/kaola-workflow-roadmap.js` parseArgs pattern

**Implement**:

File header (mirror claim.js:1-8):
```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
```

Shared utilities (copy from claim.js — no new shared module):
- `assert(cond, msg)` — same as claim.js
- `isSafeName(name)` — same as claim.js
- `field(content, name)` — same as claim.js (returns first `name: value` line's value)
- `ghExec(args)` — same as claim.js (returns `''` when OFFLINE)
- `getRoot()` — same as claim.js

Config utilities:
```js
const CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json');

function readOrCreateConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (_) {
    const defaults = { parallel_mode: 'auto' };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2) + '\n');
    return defaults;
  }
}
```

Lock-file reader:
```js
function readLockFiles(root) {
  const dir = path.join(root, 'kaola-workflow', '.locks');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.lock'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return null; } })
    .filter(Boolean);
}
```

File-path extraction:
```js
const FILE_PATH_REGEX = /(scripts|commands|hooks|kaola-workflow)\/[A-Za-z0-9_./-]+/g;
const COARSE_AREAS = new Set(['scripts', 'commands', 'hooks', 'kaola-workflow']);

function extractCoarseAreas(text) {
  const matches = text.match(FILE_PATH_REGEX) || [];
  const areas = new Set();
  for (const m of matches) {
    const top = m.split('/')[0];
    if (COARSE_AREAS.has(top)) areas.add(top);
  }
  return areas;
}
```

Label parsers:
```js
const DEPENDS_ON_REGEX = /^depends-on:#(\d+)$/;

function parseDependsOn(labels) {
  for (const lbl of labels) {
    const m = String(lbl.name || lbl).match(DEPENDS_ON_REGEX);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function parseAreaLabels(labels) {
  const areas = new Set();
  for (const lbl of labels) {
    const name = String(lbl.name || lbl);
    if (name.startsWith('area:')) areas.add(name.slice(5).trim());
  }
  return areas;
}
```

Args parser:
```js
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--json') { args.json = true; continue; }
  }
  return args;
}
```

Core `classify(issue, claimedLocks, root)` function:
- Step 1: depends-on check — `parseDependsOn(issue.labels)`; if found and OFFLINE → blocked with "OFFLINE and depends-on:#N label present; conservative block"; if found and online → `ghExec(['issue', 'view', String(depN), '--json', 'state,closedAt'])`, parse state; if state !== 'closed' → blocked
- Step 2: build `candidateAreas = extractCoarseAreas(issue.body)` and `candidateAreaLabels = parseAreaLabels(issue.labels)`
- Step 3: for each lock, read `phase3-plan.md` and `phase1-research.md` from `kaola-workflow/{lock.project}/`; build `claimedAreas = extractCoarseAreas(combined body)`; build `claimedAreaLabels` from `area:*` matches in combined body; check overlap
  - `SHARED_INFRA = new Set(['scripts', 'hooks'])`
  - direct overlap (non-infra area in both sets) → hasDirectOverlap = true
  - infra area in both sets → hasSharedInfraOverlap = true
  - area label in both → hasAreaLabelOverlap = true
- Step 4: apply verdict rules:
  - direct overlap → red ("file-set overlap at coarse area '...' with a claimed project")
  - no path info AND claimed projects exist AND any claimed project in phase ≤ 2 (no phase3-plan.md) → red (conservative)
  - shared-infra overlap → yellow
  - area-label overlap → yellow
  - else → green

`cmdClassify()` function:
- `parseArgs(process.argv.slice(3))`; assert `Number.isFinite(args.issue) && args.issue > 0`
- `readOrCreateConfig()`; if `config.parallel_mode !== 'auto'` → stdout green with "parallel_mode=...; bypassing classifier" + return
- `getRoot()`; `readLockFiles(root)`
- if `locks.some(l => l.issue_number === args.issue)` → `process.exitCode = 2; return` (caller skips)
- OFFLINE branch (from revision 1):
  ```js
  if (OFFLINE) {
    const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
    let labels = [];
    let body = '';
    if (fs.existsSync(roadmapFile)) {
      const content = fs.readFileSync(roadmapFile, 'utf8');
      const nextStep = field(content, 'next_step');
      if (/blocked by #\d+/i.test(nextStep)) {
        const m = nextStep.match(/#(\d+)/);
        if (m) labels = [{ name: 'depends-on:#' + m[1] }];
      }
      try { body = field(content, 'body'); } catch (_) {}
    }
    const result = classify({ number: args.issue, labels, body }, locks, root);
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }
  ```
- online branch: `ghExec(['issue', 'view', String(args.issue), '--json', 'number,title,body,labels,state'])`; parse; if state==='closed' → red; else classify(); stdout write result

Main dispatcher:
```js
function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-classifier.js <classify>');
  if (sub === 'classify') return cmdClassify();
  throw new Error('unknown subcommand: ' + sub);
}

try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
```

Exit codes: 0 (valid verdict including blocked), 1 (hard error), 2 (already-claimed, no stdout).

- **Validate**: `node scripts/kaola-workflow-classifier.js 2>&1 | grep "usage:"`

---

### Task 2: MODIFY `commands/workflow-next.md`

- **File**: `commands/workflow-next.md`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `commands/workflow-next.md`
- **Depends On**: Task 1 (interface settled)
- **Parallel Group**: B
- **Action**: MODIFY
- **Mirror**: existing Step 0 fence style; claim.js bash usage

**Implement**:

Replace lines 45-55 (entire "Startup Step 0 - Sweep And Claim" section) with:

```markdown
## Startup Step 0 - Sweep, Classify, And Claim

If `kaola-workflow-claim.js` is available and `KAOLA_SESSION_ID` is set, run sweep before routing. If the classifier is available and `KAOLA_WORKFLOW_OFFLINE` is not `1`, also classify open issues and claim the first green/yellow candidate:

```bash
CLAIM_JS="${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js"
CLASSIFIER_JS="${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-classifier.js"
node "$CLAIM_JS" sweep

if [ -f "$CLASSIFIER_JS" ] && [ "${KAOLA_WORKFLOW_OFFLINE:-0}" != "1" ]; then
  KAOLA_PICK=""; KAOLA_VERDICT=""
  for ISSUE_N in $(gh issue list --state open --json number --jq '.[].number' 2>/dev/null); do
    RESULT=$(node "$CLASSIFIER_JS" classify --issue "$ISSUE_N" 2>/dev/null)
    VERDICT=$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).verdict)}catch(e){}" <<< "$RESULT" 2>/dev/null)
    if [ "$VERDICT" = "green" ] || [ "$VERDICT" = "yellow" ]; then
      KAOLA_PICK="$ISSUE_N"; KAOLA_VERDICT="$VERDICT"; break
    fi
  done
  if [ -n "$KAOLA_PICK" ]; then
    KAOLA_PROJ=$(node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-roadmap.js" project-name --issue "$KAOLA_PICK" 2>/dev/null || echo "issue-${KAOLA_PICK}")
    node "$CLAIM_JS" claim --session "$KAOLA_SESSION_ID" --project "$KAOLA_PROJ" --issue "$KAOLA_PICK"
    if [ "$KAOLA_VERDICT" = "yellow" ]; then
      mkdir -p "kaola-workflow/${KAOLA_PROJ}/.cache"
      printf 'parallel-classifier: shared-infra warning for issue #%s\n' "$KAOLA_PICK" \
        >> "kaola-workflow/${KAOLA_PROJ}/.cache/parallel-classifier.md"
    fi
  fi
fi
```

If `KAOLA_SESSION_ID` is unset, the script is unavailable, or no candidate passes classify, skip this step and continue to Step 1.
```

Also add one line to the "Required Output Before Routing" block after `Branch:`:
```
Parallel decision: {green|yellow|red|blocked|skipped — classifier verdict or "skipped" if offline/unavailable}
```

Line budget: 211 (current) − 11 (old Step 0) + 27 (new Step 0) + 1 (Required Output line) = 228 lines ≤ 230 cap.

- **Validate**: `wc -l commands/workflow-next.md && node scripts/validate-workflow-contracts.js`

---

### Task 3: MODIFY `install.sh`

- **File**: `install.sh`
- **Test File**: `scripts/validate-workflow-contracts.js`
- **Write Set**: `install.sh`
- **Depends On**: Task 1
- **Parallel Group**: B
- **Action**: MODIFY
- **Mirror**: existing copy loop (lines 113-123)

**Implement**:

In the script copy loop, add `kaola-workflow-classifier.js` after `kaola-workflow-roadmap.js`:

```bash
for script_file in \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-repair-state.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-claim.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-sink-merge.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-roadmap.js \
  "$SOURCE_SCRIPTS_DIR"/kaola-workflow-classifier.js; do
```

- **Validate**: `grep kaola-workflow-classifier.js install.sh`

---

### Task 4: MODIFY `scripts/validate-workflow-contracts.js`

- **File**: `scripts/validate-workflow-contracts.js`
- **Test File**: self-validating
- **Write Set**: `scripts/validate-workflow-contracts.js`
- **Depends On**: Tasks 1, 2, 3
- **Parallel Group**: C
- **Action**: MODIFY
- **Mirror**: existing `assertIncludes` / `assert(exists(...))` pattern

**Implement** (four targeted changes):

1. Line 151 — change `220` to `230`:
   ```js
   assert(routerLines <= 230, `commands/workflow-next.md must remain a thin router; found ${routerLines} lines`);
   ```

2. After `assert(exists('scripts/kaola-workflow-roadmap.js'), ...)`, add:
   ```js
   assert(exists('scripts/kaola-workflow-classifier.js'), 'scripts/kaola-workflow-classifier.js is missing');
   ```

3. After `assertIncludes('install.sh', 'kaola-workflow-roadmap.js');`, add:
   ```js
   assertIncludes('install.sh', 'kaola-workflow-classifier.js');
   ```

4. After `assertIncludes('commands/workflow-next.md', 'kaola-workflow-roadmap.js');`, add:
   ```js
   assertIncludes('commands/workflow-next.md', 'kaola-workflow-classifier.js');
   assertIncludes('commands/workflow-next.md', 'Sweep, Classify, And Claim');
   assertIncludes('commands/workflow-next.md', 'Parallel decision:');
   ```

- **Validate**: `node scripts/validate-workflow-contracts.js`

---

### Task 5: MODIFY `scripts/simulate-workflow-walkthrough.js`

- **File**: `scripts/simulate-workflow-walkthrough.js`
- **Test File**: self
- **Write Set**: `scripts/simulate-workflow-walkthrough.js`
- **Depends On**: Task 1
- **Parallel Group**: C
- **Action**: MODIFY
- **Mirror**: Epic Case structure (lines 329-675)

**Implement**:

Insert Epic Case 6 immediately before the final `console.log('Workflow walkthrough simulation passed');` call. The block uses `fs.mkdtempSync` sandbox, `execFileSync(process.execPath, [...], { env: {...process.env, KAOLA_WORKFLOW_OFFLINE: '1'} })`, and `assert(condition, 'Epic Case 6N: message')`.

Sub-tests (all within one `try/finally` with a single sandbox):
- **6A**: No locked issues, no claimed projects → classify issue → verdict === 'green'
- **6B**: Claimed project with `phase3-plan.md` referencing `commands/` → candidate issue body mentions `commands/` → verdict === 'red'
- **6C**: Claimed project references `scripts/` (shared infra) → candidate issue body mentions `scripts/` → verdict === 'yellow'; verify `.cache/parallel-classifier.md` is written by router simulation
- **6D**: Roadmap file has `next_step: blocked by #20`, OFFLINE=1 → verdict === 'blocked'; `r6D.reasoning.includes('OFFLINE')`
- **6E**: Online (OFFLINE=0), gh shim returns `depends-on:#30` label for issue 15 and `state:open` for issue 30 → verdict === 'blocked'
- **6E'**: Same gh shim but dep state changed to `closed` → verdict !== 'blocked'
- **6F**: Lock file already claims issue 10 → `process.exitCode === 2`

For 6E/6E', create a `gh` shim at `{sandbox}/bin/gh` with `chmod 755`, prepend to `PATH` via env. Shim uses `case "$ARGS" in *"issue view 15"*) ... *"issue view 30"*) ... esac`. 6E' derives `ghShimScript2` by string-replacing the state tokens.

- **Validate**: `node scripts/simulate-workflow-walkthrough.js`

---

### Task 6: MODIFY `README.md`

- **File**: `README.md`
- **Test File**: none
- **Write Set**: `README.md`
- **Depends On**: Task 1
- **Parallel Group**: B
- **Action**: MODIFY
- **Mirror**: existing Scripts Reference table row style

**Implement**:

In the Automation Scripts table, add after the `kaola-workflow-roadmap.js` row:
```markdown
| `kaola-workflow-classifier.js` | Parallel-work classifier — classifies open issues as green/yellow/red/blocked before claim; reads lock files and issue file sets | Startup (Step 0) |
```

- **Validate**: `grep kaola-workflow-classifier.js README.md`

---

### Task 7: MODIFY `CHANGELOG.md`

- **File**: `CHANGELOG.md`
- **Test File**: none
- **Write Set**: `CHANGELOG.md`
- **Depends On**: Tasks 1-6 complete
- **Parallel Group**: D
- **Action**: MODIFY
- **Mirror**: existing [Unreleased] bullet style

**Implement**:

Under `## Unreleased` → `### Added`, append:
```markdown
- `scripts/kaola-workflow-classifier.js`: parallel-work classifier invoked in Startup Step 0 of `workflow-next.md` before claim. Classifies open GitHub issues as `green`, `yellow`, `red`, or `blocked` based on lock-file claimed sets, coarse file-area overlap, shared-infra detection (`scripts/`, `hooks/`), and `depends-on:#N` label resolution via `gh issue view`. Config at `~/.config/kaola-workflow/config.json` (`parallel_mode: auto`). OFFLINE conservative mode: `blocked` when `depends-on` detected; issues already in lock files are filtered before classification (exit code 2).
```

- **Validate**: `grep kaola-workflow-classifier.js CHANGELOG.md`

---

## Advisor Notes

From `.cache/advisor-plan.md`:

- Approach A confirmed sound; build sequence and parallelization plan are correct.
- **Bug 1 (fixed)**: OFFLINE body handling — `cmdClassify` OFFLINE branch must read `body:` field from roadmap file; pass to `classify()` so Epic Cases 6B/6C work.
- **Bug 2 (fixed)**: 6D/6E were same path — redesigned: 6D=OFFLINE conservative, 6E=online dep open (gh shim), 6E'=online dep closed (gh shim); now exercises three distinct code paths.
- **Verified**: "Startup Step 0 - Sweep And Claim" exists at line 45 of `workflow-next.md` (211 lines); rename is correct, not creation.
- **N+1 acceptable**: Router calls classifier.js once per candidate; each online call does one `gh issue view N`. For ≤50 open issues, acceptable; batching is future optimization.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md (embedded in advisor tool result) | |
| architect revisions | invoked | .cache/architect-revision-1.md | |
