# Phase 3 - Plan: issue-41

## Resolved Phase 1 Contradiction

Phase 1 code-explorer.md incorrectly stated that `.claude-plugin/plugin.json` "mirrors the same 3 hooks." Direct inspection confirmed: plugin.json has no `hooks` key. Adding one violates `validate-workflow-contracts.js:162` (`assert(!Object.prototype.hasOwnProperty.call(pluginJson, 'hooks'), 'plugin.json must not declare hooks/hooks.json')`). Gap 3 phantom-advisor hook registers ONLY in `hooks/hooks.json` — not plugin.json. Codex has no PostToolUse subsystem; this is ECC-only by design.

## #44 Design Contract Incorporated

`constraint-issue44.md` governs all implementation: "The agent owns issue selection. Scripts only validate and claim explicit targets." #41 proceeds before #44 lands because no new auto-pick logic is added:
- `analyzeIssue` outputs: advisory only, no control flow
- `computeRecovery`: informational for agent, no script-level auto-claim
- `workflow_path`: set by agent via env var (`KAOLA_PATH=fast`), not decided by script

---

## Blueprint

### Files to Create

| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `hooks/kaola-workflow-phantom-advisor.sh` | PostToolUse hook blocking advisor citations in workflow files without backing `.cache/advisor-*.md` | `HOOK_INPUT` JSON → `file_path`, `content`; exits 2 on phantom citation |
| `commands/kaola-workflow-fast.md` | Single-pass Plan+Execute+Review command; writes `fast-summary.md` | `## Goal Contract`, `## Startup Receipt Guard`, `workflow_path: fast`, mid-flight escalation |
| `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` | Codex skill mirror for fast-path | Same required sections as command; `test_thrash` threshold ≥ 3 consecutive RED→RED |

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Add `TOP_TIER_LABEL_REGEX`, `analyzeIssue()`, `computeRecovery()`; wire `recovery` into claim:none branches; wire `workflow_path` into acquired branch | Gaps 1, 2, 4 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-copy after every claim.js edit | Parity enforced by validate-kaola-workflow-contracts.js:164-168 |
| `scripts/validate-workflow-contracts.js` | Line ~177: raise `<= 265` to `<= 266` | PR-A only; workflow-next.md grows to 266 lines |
| `scripts/validate-kaola-workflow-contracts.js` | Add `'kaola-workflow-fast'` as 10th skill (PR-B only, alongside SKILL.md creation) | Skill list gated on SKILL.md existing |
| `hooks/hooks.json` | Add PostToolUse entry for `Write\|Edit` pointing to phantom-advisor script | Gap 3 hook registration |
| `.claude-plugin/plugin.json` | NO CHANGES | validate-workflow-contracts.js:162 forbids hooks key |
| `commands/kaola-workflow-phase6.md` | Conditional prereq block and conditional Read block (fast → fast-summary.md; full/absent → phase5-review.md) | Gap 4 phase 6 routing |
| `commands/workflow-next.md` | +1 line (Gap 2 recovery guidance) +2 lines (Gap 4 routing hint) → 266 total | Must follow cap raise (Task 3a) |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic 14c, Epic 14d, Case 8M (PR-A); Case 15a (PR-B) | Test coverage for all 4 gaps |

### Build Sequence

1. Task 1: `analyzeIssue()` + `computeRecovery()` in claim.js → byte-copy (verify line numbers first)
2. Task 2: Wire into claim:none branches + `workflow_path` in acquired branch → byte-copy (sequential after Task 1)
3. Task 3a: Cap raise only in validate-workflow-contracts.js (parallel to Task 1)
4. Task 4: Router line update in workflow-next.md (after Task 3a)
5. Task 3b + Task 7: Skill list addition + fast command + SKILL.md (PR-B, parallel to each other, after PR-A lands)
6. Task 6: Phase 6 conditional (PR-B, parallel to Task 7, depends on Task 2)
7. Task 5: Phantom-advisor hook + hooks.json (PR-C, fully independent)
8. Task 8: Test cases — 14c/14d/8M in PR-A; 15a in PR-B

### Parallelization Plan

| Group | Tasks | Why Safe in Parallel |
|-------|-------|----------------------|
| A-seq | 1 → 2 | Same file (claim.js); must be sequential |
| A-par | 3a | Different file (validate-workflow-contracts.js); disjoint from claim.js |
| A-seq2 | 4 | Depends on 3a (cap raised before lines added) |
| B-par | 3b, 6, 7 | Disjoint files; 3b depends on 7's SKILL.md; ship together |
| C | 5 | Fully independent; no shared files |

### External Dependencies

- `issueLabelNames(issue)` — helper already in claim.js (used in analyzeIssue)
- `parsePriorityTier(issue, config)` — existing function in claim.js (called from analyzeIssue)
- `process.env.KAOLA_PATH` — env var; no new package dependency
- `HOOK_INPUT` JSON from Claude Code hooks system — shell parsing only

---

## Task List

### Task 1 — Gap 1+2 Core Functions (PR-A, Group A-parallel/sequential)

- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: none (but verify line numbers first — see prerequisite below)
- Parallel Group: A-sequential with Task 2; A-parallel with Task 3a
- Action: MODIFY

**Prerequisite — verify insertion points before editing:**
```bash
# Verify insertion point after parsePriorityTier
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(948,960).forEach((l,i)=>console.log(i+949,l))"

# Verify cmdStartup() claim:none branch
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(1268,1280).forEach((l,i)=>console.log(i+1269,l))"

# Verify cmdPickNext() claim:none branch
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(2228,2238).forEach((l,i)=>console.log(i+2229,l))"

# Verify cmdStartup() acquired branch
node -e "const fs=require('fs'); const lines=fs.readFileSync('scripts/kaola-workflow-claim.js','utf8').split('\n'); lines.slice(1290,1300).forEach((l,i)=>console.log(i+1291,l))"
```

Adjust actual insertion line numbers after reading output. Do not implement against recalled numbers.

**Insert after `parsePriorityTier` function (verify exact line):**
```javascript
const TOP_TIER_LABEL_REGEX = /^(priority:(critical|highest|p0)|top-?priority|urgent|sev-?[01])$/i;

function analyzeIssue(issue, config) {
  if (!issue) return null;
  const labels = issueLabelNames(issue);
  const topMatch = labels.find(l => TOP_TIER_LABEL_REGEX.test(l));
  let priority_tier, priority_label, override_label;
  if (topMatch) {
    priority_tier = 0;
    override_label = topMatch;
    priority_label = topMatch;
  } else {
    const parsed = parsePriorityTier(issue, config ? config.topTierLabels : []);
    priority_tier = parsed.tier;
    priority_label = parsed.priority_label;
    override_label = parsed.override_label;
  }
  const body = (issue.body || '');
  const bodyLower = body.toLowerCase();
  const acCheckboxes = (body.match(/- \[[ x]\]/gi) || []).length;
  const fileMatches = (body.match(/`[^`]+\.[a-z]{2,4}`|[\w/-]+\.\w{2,4}/g) || []).length;
  const path_signals = [];
  let pro_score = 0;

  const ANTI_LABELS = /architecture|breaking-change|security|refactor|design/i;
  const hasAntiLabel = labels.some(l => ANTI_LABELS.test(l));
  const areaLabels = labels.filter(l => /^area:/i.test(l));
  const hasDependsOn = /depends-on:#\d+|blocks:#\d+/i.test(body);
  const bodyLines = body.split('\n').length;
  const hasAnti = hasAntiLabel || areaLabels.length >= 2 || hasDependsOn
    || bodyLines >= 200 || acCheckboxes >= 8 || fileMatches >= 5
    || (bodyLower.match(/\b(should|need to|must)\b/g) || []).length >= 5;

  if (!hasAnti) {
    if (bodyLines <= 30) { pro_score += 2; path_signals.push('body_lines<=30'); }
    else if (bodyLines <= 60) { pro_score += 1; path_signals.push('body_lines<=60'); }
    if (acCheckboxes <= 2) { pro_score += 2; path_signals.push('ac<=2'); }
    else if (acCheckboxes <= 4) { pro_score += 1; path_signals.push('ac<=4'); }
    if (labels.some(l => /^(typo|docs|chore|style)$/i.test(l))) {
      pro_score += 3; path_signals.push('label:docs/chore');
    }
    if (labels.some(l => /^good-first-issue$/i.test(l))) {
      pro_score += 2; path_signals.push('label:good-first-issue');
    }
    if (fileMatches === 1) { pro_score += 2; path_signals.push('files=1'); }
    else if (fileMatches <= 3) { pro_score += 1; path_signals.push('files<=3'); }
    if (/```diff/.test(body)) { pro_score += 2; path_signals.push('diff_block'); }
    if (/line \d+(-\d+)?/i.test(body)) { pro_score += 2; path_signals.push('line_citation'); }
  } else {
    path_signals.push('anti:veto');
  }

  let recommended_path, path_confidence;
  if (hasAnti) {
    recommended_path = 'full'; path_confidence = 'high';
  } else if (pro_score >= 6) {
    recommended_path = 'fast'; path_confidence = 'high';
  } else if (pro_score >= 4) {
    recommended_path = 'fast'; path_confidence = 'medium';
  } else {
    recommended_path = 'full'; path_confidence = 'high';
  }

  return { priority_tier, priority_label, override_label, recommended_path, path_signals, path_confidence };
}

function computeRecovery(skipped, blocked) {
  if ((skipped || []).length > 0 && (blocked || []).length === 0) return 'advance_project';
  if ((blocked || []).length > 0) return 'consult_advisor';
  return 'prompt_user';
}
```

- Validate: `node -e "require('./scripts/kaola-workflow-claim.js')"` then byte-copy.

---

### Task 2 — Gap 2 Receipt Integration (PR-A, Group A-sequential)

- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Task 1
- Parallel Group: A-sequential after Task 1
- Action: MODIFY

Three insertion points (verify exact lines at Phase 4 start):

1. **`cmdStartup()` claim:none branch (~line 1272)**: Add to receipt object:
   ```javascript
   recovery: computeRecovery(skipped || [], blocked || [])
   ```
   Note: Do NOT add `analysis` field here — no issue object available at claim:none.

2. **`cmdPickNext()` claim:none branch (~line 2232)**: Same single field:
   ```javascript
   recovery: computeRecovery(skipped || [], blocked || [])
   ```

3. **`cmdStartup()` acquired branch (~line 1294)**: Add to receipt object:
   ```javascript
   workflow_path: process.env.KAOLA_PATH === 'fast' ? 'fast' : 'full'
   ```

- Validate: `node scripts/simulate-workflow-walkthrough.js` then byte-copy.

---

### Task 3a — Cap Raise Only (PR-A, Group A-parallel to Task 1)

- Write Set: `scripts/validate-workflow-contracts.js`
- Depends On: none (parallel to Task 1)
- Parallel Group: A-parallel
- Action: MODIFY

Verify line ~177 content, then change `<= 265` to `<= 266`.

- Validate: `node scripts/validate-workflow-contracts.js`

---

### Task 4 — Router Line Update (PR-A, Group A-sequential after Task 3a)

- Write Set: `commands/workflow-next.md`
- Depends On: Task 3a (cap raised first)
- Parallel Group: A-sequential after 3a
- Action: MODIFY

Add 3 lines total:
- 1 line under claim:none handling: `Agent reads \`recovery\` field and asks, stops, or selects explicit new target before next claim.`
- 2 lines fast-path routing hint: `If \`KAOLA_PATH=fast\` is set, startup records \`workflow_path: fast\`. Agent sets this after reading \`analyzeIssue\` advisory output.`

- Validate: `wc -l commands/workflow-next.md` → 266; `node scripts/validate-workflow-contracts.js`

---

### Task 5 — Phantom-Advisor Hook (PR-C, Group C)

- Write Set: `hooks/kaola-workflow-phantom-advisor.sh`, `hooks/hooks.json`
- Depends On: none (fully independent)
- Parallel Group: C
- Action: CREATE + MODIFY
- CONSTRAINT: Do NOT edit `.claude-plugin/plugin.json`

**Shell script `hooks/kaola-workflow-phantom-advisor.sh`:**
```bash
#!/bin/sh
# Blocks advisor citations in workflow files without backing .cache/advisor-*.md

HOOK_INPUT="${HOOK_INPUT:-}"
[ -z "$HOOK_INPUT" ] && exit 0

FILE_PATH=$(echo "$HOOK_INPUT" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d.join('')).file_path||'')}catch(e){}})" 2>/dev/null || true)
[ -z "$FILE_PATH" ] && exit 0

# Only check kaola-workflow project artifacts
echo "$FILE_PATH" | grep -q 'kaola-workflow/[^/]*/[^/]' || exit 0

CONTENT=$(echo "$HOOK_INPUT" | node -e "const d=[];process.stdin.on('data',c=>d.push(c));process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d.join('')).content||'')}catch(e){}})" 2>/dev/null || true)
[ -z "$CONTENT" ] && exit 0

ADVISOR_PATTERN='advisor (says|recommends|confirms|approved|noted)|per (the )?advisor|advisor gate (passed|approved)|\.cache\/advisor-'
echo "$CONTENT" | grep -qiE "$ADVISOR_PATTERN" || exit 0

# Has advisor citation — verify backing artifact exists
PROJECT_DIR=$(echo "$FILE_PATH" | grep -oE 'kaola-workflow/[^/]+')
CACHE_DIR="$(git rev-parse --show-toplevel 2>/dev/null)/$PROJECT_DIR/.cache"
if ! ls "$CACHE_DIR"/advisor-*.md >/dev/null 2>&1; then
  echo "phantom-advisor: $FILE_PATH cites advisor but no .cache/advisor-*.md found in $CACHE_DIR" >&2
  exit 2
fi
exit 0
```

**`hooks/hooks.json` entry:**
```json
{"matcher":"Write|Edit","type":"command","command":"./hooks/kaola-workflow-phantom-advisor.sh","timeout":10,"id":"kaola-workflow:phantom-advisor"}
```

- Validate: `chmod +x hooks/kaola-workflow-phantom-advisor.sh`; `node scripts/validate-workflow-contracts.js`

---

### Task 6 — Phase 6 Fast-Path Conditional (PR-B, Group B)

- Write Set: `commands/kaola-workflow-phase6.md`
- Depends On: Task 2 (workflow_path field established)
- Parallel Group: B (parallel to Task 7 and Task 3b)
- Action: MODIFY

Two sub-changes:
1. **Prereq block**: If `workflow_path === 'fast'`, require `fast-summary.md PASSED`; else require `phase5-review.md PASSED`. Default when `workflow_path` absent: treat as `full`.
2. **Read block**: Same conditional — read `fast-summary.md` when `workflow_path === 'fast'`; read `phase5-review.md` otherwise.

- Validate: Review diff; `node scripts/validate-workflow-contracts.js`

---

### Task 7 — Fast-Path Command + Skill (PR-B, Group B)

- Write Set: `commands/kaola-workflow-fast.md`, `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`
- Depends On: Task 3a (cap constraint already met)
- Parallel Group: B (parallel to Task 6 and Task 3b)
- Action: CREATE

Both files must contain:
- `## Goal Contract`
- `## Startup Receipt Guard`
- Reference to `.startup.json`
- `verify-startup` command
- Text "startup receipt does not authorize"
- `## Session Heartbeat`
- `workflow_path: fast` recording mechanism
- Single-pass Plan+Execute+Review structure writing `fast-summary.md`
- Mid-flight escalation triggers (write `escalated_to_full: <trigger>` to workflow-state.md, re-route to Phase 1)
- `test_thrash` threshold: ≥ 3 consecutive RED→RED on same test triggers escalation

- Validate: `node scripts/validate-kaola-workflow-contracts.js` must pass (all 10 skills)

---

### Task 3b — Skill List Addition (PR-B, Group B — with Task 7)

- Write Set: `scripts/validate-kaola-workflow-contracts.js`
- Depends On: Task 7 (SKILL.md must exist)
- Parallel Group: B (ship in same PR as Task 7)
- Action: MODIFY

After verifying exact lines:
- Add `'kaola-workflow-fast'` as 10th entry in skill name list (~lines 70-80)
- Add `'kaola-workflow-fast'` to phase-skill iteration (~lines 125-138)

- Validate: `node scripts/validate-kaola-workflow-contracts.js` → must pass with all 10 skills

---

### Task 8 — Test Cases (PR-A for 14c/14d/8M; PR-B for 15a)

- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Tasks 1+2 (for 14c/14d/8M); Task 7 (for 15a)
- Action: MODIFY

**Epic 14c** (`analyzeIssue` advisory output):
- Call `analyzeIssue` with a mock issue; assert returned struct has all 6 fields: `priority_tier`, `priority_label`, `override_label`, `recommended_path`, `path_signals`, `path_confidence`.
- Negative: assert no auto-pick code path was triggered (no subsequent claim call in test context).

**Epic 14d** (`computeRecovery` enum):
- Case `skipped=[x], blocked=[]` → assert returns `'advance_project'`.
- Case `skipped=[], blocked=[y]` → assert returns `'consult_advisor'`.
- Case `skipped=[], blocked=[]` → assert returns `'prompt_user'`.
- Negative: assert no auto-claim follows the return value.

**Case 8M** (claim:none receipt has `recovery` field):
- Simulate claim:none; assert receipt object has `recovery` field.
- Assert receipt object does NOT have `analysis` field.
- Negative: assert no subsequent auto-claim attempt after claim:none receipt.

**Case 15a** (`KAOLA_PATH` env var → `workflow_path`):
- Set `process.env.KAOLA_PATH = 'fast'`; simulate startup; assert receipt has `workflow_path: 'fast'`.
- Unset `KAOLA_PATH`; simulate startup; assert receipt has `workflow_path: 'full'`.
- Set `process.env.KAOLA_PATH = 'invalid'`; simulate startup; assert receipt has `workflow_path: 'full'` (strict equality check).

- Validate: `node scripts/simulate-workflow-walkthrough.js` → exits 0

---

## Advisor Notes

Source: `.cache/advisor-plan.md`

Four blockers addressed in `.cache/architect-revision-1.md`:
1. `analyzeIssue` null guard added; `analysis` removed from claim:none receipts (no issue available there).
2. `KAOLA_PATH` uses strict equality `=== 'fast'` — typos and empty values map to `'full'`.
3. Task 3 split: cap raise (3a) in PR-A; skill-list addition (3b) in PR-B alongside SKILL.md.
4. Gap 3 advisor citation regex explicitly defined: `ADVISOR_PATTERN='advisor (says|recommends|confirms|approved|noted)|per (the )?advisor|advisor gate (passed|approved)|\.cache\/advisor-'`.

Line numbers in claim.js (953, 1272, 2232, 1294) and validate-kaola-workflow-contracts.js (70-80, 125-138, 164-168) are unverified estimates. Phase 4 Task 1 must begin with the verification bash commands listed in Task 1 above.

#44 order: safe to proceed. Blueprint adds no auto-pick logic. Task 8 tests include negative assertions confirming no auto-claim follows claim:none.

Phase 1 code-explorer.md contradiction resolved: plugin.json has no hooks key; architect is correct; Gap 3 hook is ECC-only in `hooks/hooks.json`.

---

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | 4 blockers resolved |
