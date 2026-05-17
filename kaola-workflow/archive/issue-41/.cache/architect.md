# Code Architect — Issue-41: Four Gaps

Generated: 2026-05-17

---

## Design Decisions

- **Gap 1 (`analyzeIssue`)**: New advisory wrapper placed after `parsePriorityTier` at line 953, before `sortIssueRecords`. `TOP_TIER_LABEL_REGEX` scoped inside `analyzeIssue` (not folded into `parsePriorityTier`) so existing Epic 14b override behavior is preserved. Output is advisory only.
- **Gap 2 (`computeRecovery`)**: New helper inserted adjacent to the claim:none receipt write in both `cmdStartup()` and `cmdPickNext()`. The recovery field is informational, carries no control flow.
- **Gap 3 (Phantom-Advisor hook)**: Registered ONLY in `hooks/hooks.json`. `.claude-plugin/plugin.json` — NO CHANGES. The assertion at `scripts/validate-workflow-contracts.js:162` explicitly forbids a `hooks` key there; adding it would break CI. Codex has no PostToolUse subsystem — this hook is ECC-only.
- **Gap 4 (Fast-Path)**: `analyzeIssue()` extended with signal scoring. New command and skill files follow the existing `commands/`+`skills/` pairing. Mid-flight escalation logic is identical between the Claude command and Codex skill.
- **Line cap**: `commands/workflow-next.md` currently 263 lines. Gap 2 adds 1 line, Gap 4 adds 2 lines → 266 lines, exceeding cap of 265. The assertion at `scripts/validate-workflow-contracts.js:177` must be raised to 266.
- **Plugin byte-copy**: Every edit to `scripts/kaola-workflow-claim.js` must be immediately followed by `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`. Enforced by `validate-kaola-workflow-contracts.js:164-168`.

---

## Files to Create

| File | Purpose |
|------|---------|
| `hooks/kaola-workflow-phantom-advisor.sh` | PostToolUse hook blocking advisor citations without `.cache/advisor-*.md` |
| `commands/kaola-workflow-fast.md` | Single-pass Plan+Execute+Review command; writes `fast-summary.md` |
| `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` | Codex skill mirror for fast-path |

---

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/kaola-workflow-claim.js` | Insert `analyzeIssue()` + `computeRecovery()` after line 953; wire both into claim:none branches of `cmdStartup()` and `cmdPickNext()`; add `workflow_path` to acquired branch receipt |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-copy after every claim.js edit (never edit directly) |
| `scripts/validate-workflow-contracts.js` | Line 177: raise `<= 265` to `<= 266` |
| `scripts/validate-kaola-workflow-contracts.js` | Lines 70-80: add `'kaola-workflow-fast'` as 10th skill; Lines 125-138: add to phase-skill iteration |
| `hooks/hooks.json` | Add PostToolUse entry for `Write\|Edit` pointing to `kaola-workflow-phantom-advisor.sh` |
| `.claude-plugin/plugin.json` | NO CHANGES (adding hooks key violates validate-workflow-contracts.js:162) |
| `commands/kaola-workflow-phase6.md` | Two sub-changes: prereq block and Read block — conditional on `workflow_path: fast` |
| `commands/workflow-next.md` | +1 line (Gap 2 recovery guidance) +2 lines (Gap 4 routing hint) → 266 total |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic 14c, Epic 14d, Case 8M, Case 15a |

---

## Data Flow

```
[Agent invokes workflow-next with explicit target issue]
       |
       v
cmdStartup() / cmdPickNext()
       |
       +-- analyzeIssue(issue, config)
       |       → advisory { priority_tier, priority_label, override_label,
       |                    recommended_path, path_signals, path_confidence }
       |       → NEVER used for auto-pick
       |
       +-- computeRecovery(skipped, blocked)
       |       → 'advance_project' | 'consult_advisor' | 'prompt_user'
       |
       +-- write claim:none receipt
               { claim:'none', recovery, analysis }

[Agent reads KAOLA_PATH env, decides fast|full]
       |
       v
cmdStartup() acquired branch
       +-- workflow_path: process.env.KAOLA_PATH || 'full'
       +-- write startup receipt with workflow_path

[Phase 6 prereq check]
       +-- workflow_path: fast → require fast-summary.md PASSED
       +-- workflow_path: full → require phase5-review.md PASSED

[PostToolUse phantom-advisor hook]
       Write|Edit fires →
       +-- parse HOOK_INPUT → file_path
       +-- not kaola-workflow/{project}/ → exit 0
       +-- content has advisor citation? → scan .cache/ for advisor-*.md
       +-- none found → exit 2
```

---

## Build Sequence

1. Task 1: `analyzeIssue()` + `computeRecovery()` in claim.js → byte-copy
2. Task 2: Wire both into claim:none branches + `workflow_path` in acquired branch → byte-copy
3. Task 3: Validator updates (cap raise, fast-skill entries) — parallel to Task 1
4. Task 4: Router line update — after Task 3
5. Task 5: Phantom-Advisor hook — fully independent (Group C)
6. Task 6: Phase 6 conditional — after Task 2
7. Task 7: Fast-path command + skill — after Task 3; parallel to Task 6
8. Task 8: Test cases — after Tasks 1+2+7

---

## Task List

### Task 1 — Gap 1+2 Core Functions (PR-A, Group A)

- File: `scripts/kaola-workflow-claim.js`
- Test file: `scripts/simulate-workflow-walkthrough.js`
- Write set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends-on: nothing
- Action: INSERT after line 953 (after `parsePriorityTier`, before `sortIssueRecords`)

```javascript
const TOP_TIER_LABEL_REGEX = /^(priority:(critical|highest|p0)|top-?priority|urgent|sev-?[01])$/i;

function analyzeIssue(issue, config) {
  const labels = issueLabelNames(issue);  // helper already in claim.js
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
  // Signal scoring (Gap 4 signals; advisory only)
  const body = (issue.body || '');
  const bodyLower = body.toLowerCase();
  const acCheckboxes = (body.match(/- \[[ x]\]/gi) || []).length;
  const fileMatches = (body.match(/`[^`]+\.[a-z]{2,4}`|[\w/-]+\.\w{2,4}/g) || []).length;
  const path_signals = [];
  let pro_score = 0;

  // Anti-fast vetoes (any one → full/high)
  const ANTI_LABELS = /architecture|breaking-change|security|refactor|design/i;
  const hasAntiLabel = labels.some(l => ANTI_LABELS.test(l));
  const areaLabels = labels.filter(l => /^area:/i.test(l));
  const hasDependsOn = /depends-on:#\d+|blocks:#\d+/i.test(body);
  const bodyLines = body.split('\n').length;
  const hasAnti = hasAntiLabel || areaLabels.length >= 2 || hasDependsOn
    || bodyLines >= 200 || acCheckboxes >= 8 || fileMatches >= 5
    || (bodyLower.match(/\b(should|need to|must)\b/g) || []).length >= 5;

  if (!hasAnti) {
    // Pro-fast additive signals
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
- Write set: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends-on: Task 1
- Action — three insertion points:
  1. `cmdStartup()` claim:none branch (~line 1272): Add `recovery: computeRecovery(skipped || [], blocked || [])` and `analysis: analyzeIssue(issue, config)` to the receipt object.
  2. `cmdPickNext()` claim:none branch (~line 2232): Same two fields.
  3. `cmdStartup()` acquired branch (~line 1294): Add `workflow_path: process.env.KAOLA_PATH || 'full'` to the receipt object.
- Validate: `node scripts/simulate-workflow-walkthrough.js` then byte-copy.

---

### Task 3 — Contract Validator Updates (PR-A, Group A-parallel)

- Write set: `scripts/validate-workflow-contracts.js`, `scripts/validate-kaola-workflow-contracts.js`
- Depends-on: nothing (parallel to Task 1)
- Action:
  - `validate-workflow-contracts.js:177` — `<= 265` → `<= 266`
  - `validate-kaola-workflow-contracts.js` lines 70-80 — add `'kaola-workflow-fast'` as 10th entry
  - `validate-kaola-workflow-contracts.js` lines 125-138 — add `'kaola-workflow-fast'` to phase-skill iteration
- Validate: `node scripts/validate-kaola-workflow-contracts.js` (expected to fail on fast SKILL.md until Task 7 completes; correct behavior).

---

### Task 4 — Router Line Update (PR-A, Group A-sequential after Task 3)

- Write set: `commands/workflow-next.md`
- Depends-on: Task 3 (cap raised first)
- Action: Add 3 lines total to relevant sections:
  - 1 line: under claim:none handling — "Agent reads `recovery` field and asks, stops, or selects explicit new target before next claim."
  - 2 lines: fast-path routing hint — "If `KAOLA_PATH=fast` is set, startup records `workflow_path: fast`. Agent sets this after reading `analyzeIssue` advisory output."
- Validate: `wc -l commands/workflow-next.md` → 266; `node scripts/validate-workflow-contracts.js`.

---

### Task 5 — Phantom-Advisor Hook (PR-C, Group C)

- Write set: `hooks/kaola-workflow-phantom-advisor.sh`, `hooks/hooks.json`
- Depends-on: nothing
- Action — shell script: parse HOOK_INPUT, early-exit if not kaola-workflow path, check content for advisor citation pattern, scan .cache/ for `advisor-*.md`, exit 2 if none found.
- Action — `hooks/hooks.json`: add PostToolUse entry `{"matcher":"Write|Edit","type":"command","command":"./hooks/kaola-workflow-phantom-advisor.sh","timeout":10,"id":"kaola-workflow:phantom-advisor"}`.
- CONSTRAINT: Do NOT edit `.claude-plugin/plugin.json`.
- Validate: `chmod +x hooks/kaola-workflow-phantom-advisor.sh`; `node scripts/validate-workflow-contracts.js`.

---

### Task 6 — Phase 6 Fast-Path Conditional (PR-B, Group B)

- Write set: `commands/kaola-workflow-phase6.md`
- Depends-on: Task 2
- Action: Two sub-changes — conditional prereq block and conditional Read block (default to `full` when `workflow_path` absent).
- Validate: Review diff; `node scripts/validate-workflow-contracts.js`.

---

### Task 7 — Fast-Path Command + Skill (PR-B, Group B parallel)

- Write set: `commands/kaola-workflow-fast.md`, `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`
- Depends-on: Task 3
- Action — both files must contain: `## Goal Contract`, `## Startup Receipt Guard`, `.startup.json`, `verify-startup`, `startup receipt does not authorize`, `## Session Heartbeat`, `workflow_path: fast` recording, single-pass Plan+Execute+Review structure, `fast-summary.md` artifact, mid-flight escalation triggers.
- Validate: `node scripts/validate-kaola-workflow-contracts.js` must pass (all 10 skills including fast).

---

### Task 8 — Test Cases (PR-A for 14c/14d/8M; PR-B for 15a)

- Write set: `scripts/simulate-workflow-walkthrough.js`
- Depends-on: Tasks 1+2 (for 14c/14d/8M); Task 7 (for 15a)
- Action:
  - Epic 14c: `analyzeIssue` returns advisory struct with all required fields; no auto-pick triggered.
  - Epic 14d: `computeRecovery` returns correct enum value for all 3 cases.
  - Case 8M: `claim:none` receipt has `recovery` field; no subsequent auto-claim.
  - Case 15a: `KAOLA_PATH=fast` → receipt has `workflow_path:'fast'`; absent `KAOLA_PATH` → `workflow_path:'full'`.
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0.

---

## Parallelization Groups

| Group | Tasks | Constraint |
|-------|-------|-----------|
| A | 1 → 2 (sequential), 3 (parallel to 1), 4 (after 3) | claim.js tasks sequential; validator parallel |
| B | 6, 7 (parallel to each other) | both depend on A landing |
| C | 5 | fully independent |

---

## Edge Cases

1. `analyzeIssue` called on issue with no labels: `issueLabelNames` returns `[]`, regex never matches, `parsePriorityTier` handles empty labels, `priority_tier` defaults to whatever `parsePriorityTier` returns for no-label issue.
2. `computeRecovery` called with undefined arrays: Guarded with `(skipped || [])` and `(blocked || [])`.
3. Phantom-Advisor hook with no HOOK_INPUT: `JSON.parse('{}')` produces empty object, `FILE_PATH` empty, exits 0.
4. Phantom-Advisor hook where `.cache/` dir doesn't exist: `ls` returns non-zero, no advisor file found, exits 2. Correct — blocks write.
5. `workflow_path` absent from legacy `workflow-state.md`: Phase 6 defaults to `full` path.
6. `KAOLA_PATH` set to unrecognized value: `process.env.KAOLA_PATH || 'full'` records `full` only when absent; Phase 6 must check for exact string `'fast'`.
7. Byte-copy skipped: `validate-kaola-workflow-contracts.js:164-168` detects diff and fails CI.
8. Fast-path `test_thrash` threshold: SKILL.md must define concrete count (≥3 consecutive RED→RED on same test).

---

## Explicit Out of Scope (#44 Constraint)

- No `--target-issue` flag on scripts
- No typed-refusal error classes (`target_occupied`, `target_unavailable`, etc.)
- No auto-pick quarantine or removal of first-available logic
- No `analyzeIssue` output used for control flow in scripts
- No Codex-side hooks (no changes to `.claude-plugin/plugin.json`)
- No modification to `parsePriorityTier()` or `sortIssueRecords()`
- No changes to phase1 through phase5 commands (only phase6 modified)
- No changes to `kaola-workflow-roadmap.js`, `kaola-workflow-sink-merge.js`, `kaola-workflow-sink-pr.js`
