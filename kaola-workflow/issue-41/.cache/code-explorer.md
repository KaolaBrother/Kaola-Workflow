# Code Explorer — Issue #41: workflow-next robustness

## Entry Points

- `cmdStartup()` — `scripts/kaola-workflow-claim.js:1218`
- `cmdPickNext()` — `scripts/kaola-workflow-claim.js:2190`
- `commands/workflow-next.md` — thin router, currently 263 lines (cap 265)
- `scripts/kaola-workflow-classifier.js` — spawned as subprocess by `classifyIssueCandidate()` at claim.js:1080

---

## Gap 1 — Priority Label Discovery

### `readPriorityConfig(root)` — claim.js:922
Reads `priority_top_tier_labels` from:
- `~/.config/kaola-workflow/config.json`
- `{root}/kaola-workflow/config.json`
Concatenates both arrays. Returns array of label strings.

### `parsePriorityTier(issue, topTierLabels)` — claim.js:936
- Checks `topTierLabels` first → returns `{tier:0, priority_label:null, override_label: label}`
- Then checks `PRIORITY_TIER_BY_LABEL = {P0:0, P1:1, P2:2, P3:3}` → `{tier:N, priority_label: label, override_label:null}`
- Else → `{tier:4, priority_label:null, override_label:null}`

### `analyzeIssue(issue, config)` — does NOT exist yet
Must be added after `parsePriorityTier`. Wraps/extends it.
Returns both `priority_tier` (from Gap 1) AND `recommended_path`/`path_signals`/`path_confidence` (Gap 4).

### Signal weights from `docs/investigations/fast-path-workflow-2026-05-17.md`:
**Pro-fast signals (additive):**
- body ≤30 lines → +2; ≤60 → +1
- AC ≤2 checkboxes → +2; ≤4 → +1
- label `typo|docs|chore|style` → +3
- label `good-first-issue` → +2
- 1 file mention in body → +2; 2-3 files → +1
- unified-diff block in body → +2
- single line/range citation → +2

**Anti-fast vetoes (any one → `full/high`):**
- label `architecture|breaking-change|security|refactor|design`
- ≥2 distinct `area:*` labels
- body references `depends-on:#N` or `blocks:#N`
- body ≥200 lines
- AC ≥8 checkboxes
- ≥5 distinct file paths in body
- "should|need to|must" ≥5 times (complexity signal)

**Decision rule (conservative):**
- any anti → `recommended_path: full, confidence: high`
- pro_score ≥6 and no anti → `recommended_path: fast, confidence: high`
- pro_score ≥4 and no anti → `recommended_path: fast, confidence: medium`
- else → `recommended_path: full, confidence: high`

---

## Gap 2 — Claim:None Structured Fallback

### `cmdStartup()` claim:none branch — claim.js:1272-1291
Writes receipt: `claim:'none'`, `verdict:'none'`, null project/issue, exits code 1.
**No `recovery` field currently.**

### `cmdPickNext()` claim:none branch — claim.js:2232-2239
Writes: `verdict:'none'`, `reason:'no-actionable-issues'`.
**No `recovery` field currently.**

### Recovery field derivation logic:
- `skipped.length > 0 && blocked.length === 0` → `recovery: 'advance_project'` (a sibling project is blocking)
- `blocked.length > 0` → `recovery: 'consult_advisor'` (advisor needed for blocked items)
- neither → `recovery: 'prompt_user'` (truly no candidates)

### `workflow-next.md` claim:none handling — lines 90-95:
Currently just stops routing with no next-step guidance.

---

## Gap 3 — Phantom-Advisor Gate

### Current hook state:
- `hooks/hooks.json` has: SessionStart (2 entries), PreToolUse:Bash (1 entry)
- `.claude-plugin/plugin.json` mirrors the same 3 hooks
- No PostToolUse hook exists anywhere

### PreToolUse:Bash hook pattern (kaola-workflow-pre-commit.sh):
```bash
# reads HOOK_INPUT env var:
node -e "try{const d=JSON.parse(process.env.HOOK_INPUT);...}catch(e){}"
```

### Gap 3 implementation shape:
- New `PostToolUse` hook on `Write` or `Edit` (when writing `workflow-state.md`)
- Script: `hooks/kaola-workflow-phantom-advisor.sh` (or `.js`)
- Must be added to both `hooks/hooks.json` AND `.claude-plugin/plugin.json`
- Scans recent assistant text for `/per advisor|advisor (recommends|said|suggested)/i`
- Blocks if matched AND no `.cache/advisor-*.md` written in same session

---

## Gap 4 — Fast-Path Workflow

### New command: `commands/kaola-workflow-fast.md`
- Single-pass Plan + Execute + Review
- Writes `fast-summary.md` artifact
- Phase 6 reads `fast-summary.md` instead of `phase5-review.md` when `workflow_path: fast`

### New skill: `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`
- 10th skill directory (current 9: execute, finalize, ideation, init, next, next-pr, plan, research, review)

### `workflow-state.md` new field:
```
workflow_path: fast | full  (default: full; absence = full)
```

### Phase 6 prereq check modification:
- Currently hard-requires `phase5-review.md` with `PASSED` status
- Gap 4: when `workflow_path: fast`, reads `fast-summary.md` instead

### Mid-flight escalation triggers:
- >3 files touched → `scope_files`
- ≥3 consecutive test failures → `test_thrash`
- subagent says "needs more investigation" → `subagent_escalation`
Writes `escalated_to_full: <trigger>` to workflow-state.md, re-routes to Phase 1.

### Startup visibility:
```
Selected #245 — fast path (confidence: high, signals: label=typo, body_lines=12, files=1)
```

### KAOLA_PATH env var:
Parallel to `KAOLA_SINK`. Values: `fast` or `full`. User can override gate via this env var.

---

## Test Infrastructure

### `scripts/simulate-workflow-walkthrough.js` — 5119 lines, hand-rolled assert
Issue-41 needs 4+ new test cases:
1. Happy fast-path (trivial issue → fast → finalize)
2. Override-conflict (user says "full" on fast-gated → full; user says "fast" on anti-signal → fast + warning)
3. Mid-flight escalation (>3 files touched → escalate to full)
4. claim:none with recovery field assertion

Model on Epic 14a/14b for `analyzeIssue` signal tests, Case 8L for claim:none routing.

### `scripts/validate-workflow-contracts.js` — line 177 has `<= 265` cap
New assertions needed for:
- `analyzeIssue` function exists in claim.js
- `recovery` field in claim:none branch
- fast-path command file exists
- fast-path skill directory exists

### Plugin parity:
`validate-script-sync.js` enforces byte-identical copies of COMMON_SCRIPTS:
```bash
cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
```

---

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-claim.js` | All 4 gaps touch this — priority tier, startup, pick-next |
| `scripts/kaola-workflow-classifier.js` | Gap 1 may extend or stay in claim.js |
| `commands/workflow-next.md` | Gap 2 claim:none branch; Gap 4 routing; 263 lines (cap 265) |
| `commands/kaola-workflow-fast.md` | Gap 4 new fast-path command |
| `hooks/hooks.json` | Gap 3 new PostToolUse hook |
| `.claude-plugin/plugin.json` | Gap 3 mirror |
| `hooks/kaola-workflow-pre-commit.sh` | Pattern reference for Gap 3 |
| `scripts/simulate-workflow-walkthrough.js` | New test cases for all 4 gaps |
| `scripts/validate-workflow-contracts.js` | New assertions; plugin byte-copy |
| `docs/investigations/fast-path-workflow-2026-05-17.md` | Design authority for Gap 1 and Gap 4 |
| `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` | New skill for Gap 4 |
| `commands/kaola-workflow-phase6.md` | Gap 4 conditional read (fast-summary.md vs phase5-review.md) |
