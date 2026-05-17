# Phase 2 - Ideation: issue-41

## Approaches Evaluated

### Gap 1 — Auto-discover Top-Tier Priority Labels

#### Option 1A: Wrapper `analyzeIssue()` calling `parsePriorityTier()` unchanged
- Summary: New function at claim.js after `parsePriorityTier`. Returns `{ priority_tier, priority_label, override_label, recommended_path, path_signals, path_confidence }`. Top-tier label auto-discovery via `TOP_TIER_LABEL_REGEX`.
- Pros: Backward compat; localized risk; placeholder slots ready for Gap 4.
- Cons: Extra function-call layer.
- Risk: Low
- Complexity: Small

#### Option 1B: Replace `parsePriorityTier()` and migrate all call sites
- Pros: Single source of truth.
- Cons: Larger blast radius; conflicts with Gap 4.
- Risk: Medium
- Complexity: Medium

#### Option 1C: Extract to new file `scripts/lib/issue-analyzer.js`
- Pros: Cleaner separation.
- Cons: New plugin-copy parity machinery.
- Risk: Medium
- Complexity: Medium

---

### Gap 2 — Structured Recovery for `claim: "none"`

#### Option 2A: Add `recovery` field to two `claim:'none'` receipts only
- Summary: `computeRecovery(skipped, blocked)` → `'advance_project' | 'consult_advisor' | 'prompt_user'`. Added only to `cmdStartup()` and `cmdPickNext()` claim:none branches. Absence-of-field = success.
- Pros: Minimal surface; honors absence=success pattern.
- Cons: None significant.
- Risk: Low
- Complexity: Small

#### Option 2B: Wrap all `writeStartupReceipt` calls in helper
- Cons: Forces success branches to compute and discard recovery; muddies signal.
- Risk: Medium
- Complexity: Medium

#### Option 2C: Persist recovery to `.cache/last-claim-none.md`
- Cons: Unneeded filesystem state across sessions.
- Risk: Medium
- Complexity: Medium

---

### Gap 3 — Phantom-Advisor Detection

#### Option 3A: PostToolUse on Write/Edit, scan file path + content *(scope-reduced variant of (b))*
- Summary: Triggers on `Write`/`Edit`. Reads `HOOK_INPUT` JSON. If path is under `kaola-workflow/{project}/` and content matches advisor-citation phrases, scans `.cache/` for `advisor-*.md`. Exits 2 if none found.
- Known limitation: Only catches advisor citations written to workflow artifacts. Citations that exist only in conversation (never written to a file) will not be caught by this hook. Chat-only phantom-advisor claims are out of scope for v1.
- Pros: Catches the core harm (workflow files claiming advisor consultation without artifact); mirrors pre-commit pattern.
- Cons: Does not catch Bash-redirect paths; misses pure-chat citations.
- Risk: Low
- Complexity: Small-Medium

#### Option 3B: Stop-hook end-of-session scan
- Pros: Logs only; good follow-up if 3A misses redirects.
- Risk: Low
- Complexity: Small

#### Option 3C: PreToolUse(Task)+PostToolUse(Write) marker pairing
- Pros: Most accurate.
- Cons: Two hooks, new state directory, marker race conditions.
- Risk: Medium
- Complexity: Medium

---

### Gap 4 — Fast-Path Workflow

#### Option 4A: New skill + command + state field; Phase 6 conditional read
- Summary: New `commands/kaola-workflow-fast.md` (Plan+Execute+Review → `fast-summary.md`). New `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`. `workflow_path: fast|full` in `workflow-state.md`. `analyzeIssue()` populates `path_*` fields. Phase 6 reads `fast-summary.md` when `workflow_path: fast`. `KAOLA_PATH=fast|full` env override.
- Optional enhancement: Add `fast_path_caps` block to `workflow-state.md` logging signal counts and threshold used; Phase 6 reads this as a sanity check before finalizing.
- Pros: Clean separation; escalation path via state field; minimal Phase 1-5 changes.
- Cons: Large scope.
- Risk: Medium
- Complexity: Large

#### Option 4B: Reuse Phase 4 with `fast: true` flag
- Cons: Conflates two distinct workflows; harder to escalate.
- Risk: Medium
- Complexity: Medium

#### Option 4C: Fast path entirely in router (no new command)
- Cons: Violates thin-router rule; busts 265-line cap.
- Risk: High
- Complexity: Small

---

## Advisor Findings

Source: `.cache/advisor-ideation.md`

All four recommended options (1A, 2A, 3A, 4A) approved with three required adjustments:

1. **Router line pre-step**: Before implementing claim:none and fast-path router text in `workflow-next.md`, verify reclaimable lines exist. If Co-active Leases section (lines 168-183) cannot be shortened without semantic loss, raise the cap in `validate-workflow-contracts.js:177` as a tracked decision.

2. **Gap 3 known limitation**: 3A is a scope-reduced variant of approach (b). Chat-only advisor citations (never written to a workflow artifact) will not be caught. Documented above.

3. **Gap 4 optional enhancement**: `fast_path_caps` block in `workflow-state.md` as optional PR B addition.

Pre-commit checks run and passed:
- `git show 4df454c --stat`: Only cache/state files touched; no implementation conflicts.
- `sed -n '168,183p' commands/workflow-next.md`: Co-active Leases section contains semantic bash commands; NOT freely reclaimable.

---

## Selected Approaches

| Gap | Selection | Rationale |
|-----|-----------|-----------|
| Gap 1 | **1A** | Backward compat; localized risk; creates schema shape Gap 4 extends |
| Gap 2 | **2A** | Pure return-value; honors absence=success pattern |
| Gap 3 | **3A** (ship first), 3B follow-up if needed | Catches core harm; mirrors pre-commit pattern; known limitation documented |
| Gap 4 | **4A** | Clean separation; Mid-flight escalation via state field; minimal Phase 1-5 changes |

---

## PR Sequencing

| PR | Gaps | Test Burden |
|----|------|-------------|
| PR A | Gap 1 + Gap 2 | 4–6 new test cases |
| PR B | Gap 4 | 6–8 new test cases |
| PR C | Gap 3 | 2–3 hook integration tests |

Hard dependency: Gap 4 depends on Gap 1's `analyzeIssue()` existing (PR A must ship first).

---

## Out of Scope (explicit)

- Do NOT modify `parsePriorityTier` (keep as-is; `analyzeIssue` wraps it)
- Do NOT add regex configurability layer
- Do NOT change `sortIssueRecords` signature
- Do NOT add `recovery` to `acquired`/`owned` branches
- Do NOT add retry loop inside claim.js
- Do NOT introduce `.recovery/` directory
- Do NOT attempt to read assistant transcript in Gap 3 hook
- Do NOT block on Bash redirections in Gap 3 v1
- Do NOT enforce Gap 3 on `.cache/*.md` files themselves
- Do NOT add marker-file system for Gap 3
- Do NOT auto-generate fast-summary.md from existing phase artifacts
- Do NOT route to `/kaola-workflow-fast` when a `phase*.md` already exists
- Do NOT change Phase 1–5 commands beyond Phase 6 conditional read
- Do NOT enforce mid-flight escalation in hook layer
- Do NOT make `fast` the default without `analyzeIssue()` deciding

---

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
