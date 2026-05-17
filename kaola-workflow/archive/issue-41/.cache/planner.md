# Planner Cache — issue-41

Generated: 2026-05-17

## Cross-Gap Sequencing

| Order | Gap | PR | Rationale |
|-------|-----|----|-----------|
| 1 | Gap 1 (priority labels) | PR A | Defines `analyzeIssue()` scaffold |
| 2 | Gap 2 (claim:none recovery) | PR A | Same files; same test pass |
| 3 | Gap 4 (fast-path) | PR B | Extends `analyzeIssue()`; additive |
| 4 | Gap 3 (phantom advisor) | PR C | Independent hooks subsystem |

Hard dependency: Gap 4 depends on Gap 1's `analyzeIssue()` existing.

## Pre-Plan Corrections (from advisor review)

- Gap 3 cannot scan "recent assistant text" via PostToolUse — hooks receive only `tool_input + tool_response`. Reinterpreted: scan *file content being written* for advisor-citation phrases; require sibling `advisor-*.md` cache file. Catches the actual harm (claims of consultation that left no artifact).
- `workflow-next.md` cap is hard at 265 lines. Gaps 2+4 combined add ~5 lines → must reclaim ≥3 lines from Co-active Leases section (lines 168–183).

---

## Gap 1 — Auto-discover Top-Tier Priority Labels

### Approaches

**1A — Wrapper `analyzeIssue()` that calls `parsePriorityTier()` unchanged**
- New function at claim.js:954 (after `parsePriorityTier`). Returns `{ priority_tier, priority_label, override_label, recommended_path: null, path_signals: [], path_confidence: null }`.
- Auto-discovery: `TOP_TIER_LABEL_REGEX = /^(priority:(critical|highest|p0)|top-?priority|urgent|sev-?[01])$/i`
- Pros: Backward compat; localized risk; placeholder slots ready for Gap 4.
- Cons: Extra function-call layer.
- Risk/Complexity: Low / Small.

**1B — Replace `parsePriorityTier()` and migrate all call sites**
- Pros: Single source of truth.
- Cons: Larger blast radius; conflicts with Gap 4 if it ships separately.
- Risk/Complexity: Medium / Medium.

**1C — Extract to new file `scripts/lib/issue-analyzer.js`**
- Pros: Cleaner separation.
- Cons: New plugin-copy parity machinery needed; out of scope.
- Risk/Complexity: Medium / Medium.

### Recommended: **1A**
Preserves backward compatibility, fits single-file pattern, creates schema shape Gap 4 extends.

### NOT to build
- Do NOT modify `parsePriorityTier` (keep as is; `analyzeIssue` wraps it)
- Do NOT add regex configurability layer (hard-coded heuristic)
- Do NOT change `sortIssueRecords` signature
- Do NOT populate `recommended_path` here (deferred to Gap 4)

---

## Gap 2 — Structured Recovery for `claim: "none"`

### Approaches

**2A — Add `recovery` field to two `claim:'none'` receipts only**
- `computeRecovery(skipped, blocked)` → `'advance_project' | 'consult_advisor' | 'prompt_user'`
- Added to `cmdStartup()` (claim.js:1273-1287) and `cmdPickNext()` (claim.js:2232-2239).
- Recovery derivation:
  - `skipped.length > 0 && blocked.length === 0` → `advance_project`
  - `blocked.length > 0` → `consult_advisor`
  - neither → `prompt_user`
- Pros: Minimal surface; absence in success branches = intentional signal.
- Risk/Complexity: Low / Small.

**2B — Wrap all `writeStartupReceipt` calls in helper**
- Pros: Single point of mutation.
- Cons: Forces success branches to compute and discard recovery; muddies absence=success signal.
- Risk/Complexity: Medium / Medium.

**2C — Persist recovery to `.cache/last-claim-none.md`**
- Pros: Survives across sessions.
- Cons: Adds unneeded filesystem state.
- Risk/Complexity: Medium / Medium.

### Recommended: **2A**
Pure return-value; honors absence=success pattern.

### NOT to build
- Do NOT add `recovery` to `acquired`/`owned` branches
- Do NOT add retry loop inside claim.js
- Do NOT introduce `.recovery/` directory

---

## Gap 3 — Phantom-Advisor Detection (reinterpreted scope)

### Approaches

**3A — PostToolUse on Write/Edit, scan file path + content** (recommended)
- Triggers on `Write`/`Edit`. Reads `HOOK_INPUT` JSON.
- If path is under `kaola-workflow/{project}/` and content matches `/per advisor|advisor (recommends|said|suggested|advised)/i`, scan `kaola-workflow/{project}/.cache/` for `advisor-*.md`.
- If none found, exit 2.
- Mirrors `kaola-workflow-pre-commit.sh` exactly.
- Risk/Complexity: Low / Small-Medium.

**3B — Stop-hook end-of-session scan**
- Logs only (cannot block in time). Good follow-up if 3A misses Bash-redirect paths.
- Risk/Complexity: Low / Small.

**3C — PreToolUse(Task)+PostToolUse(Write) marker pairing**
- Most accurate but two hooks, new state directory, marker race conditions.
- Risk/Complexity: Medium / Medium.

### Recommended: **3A (ship first), 3B (follow-up if needed)**

### NOT to build
- Do NOT attempt to read assistant transcript
- Do NOT block on Bash redirections in v1
- Do NOT enforce on `.cache/*.md` files themselves
- Do NOT add marker-file system

---

## Gap 4 — Fast-Path Workflow

### Approaches

**4A — New skill + command + state field; Phase 6 conditional read** (recommended)
- New `commands/kaola-workflow-fast.md` (Plan + Execute + Review → `fast-summary.md`)
- New `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`
- `workflow_path: fast|full` in `workflow-state.md` (absence = full)
- `analyzeIssue()` populates `path_*` fields (extends Gap 1 scaffold)
- Phase 6 conditional read: `fast-summary.md` when `workflow_path: fast`
- Mid-flight escalation: convention-based (skill instructs subagent)
- `KAOLA_PATH=fast|full` env override → stored in receipt as `workflow_path`
- Risk/Complexity: Medium / **Large**

**4B — Reuse Phase 4 with `fast: true` flag**
- Conflates two distinct workflows; harder to escalate cleanly.
- Risk/Complexity: Medium / Medium.

**4C — Fast path entirely in router (no new command)**
- Violates thin-router rule; busts 265-line cap.
- Risk/Complexity: High / Small.

### Recommended: **4A**

### Mid-flight escalation (convention-based)
- `>3 files touched` → `escalated_to_full: scope_files`
- `≥3 consecutive test failures` → `escalated_to_full: test_thrash`
- subagent escalation signal → `escalated_to_full: subagent_escalation`
Skill writes field to workflow-state.md, marks fast-summary.md superseded, routes to Phase 1.

### NOT to build
- Do NOT auto-generate fast-summary.md from existing phase artifacts
- Do NOT route to `/kaola-workflow-fast` when a `phase*.md` already exists
- Do NOT change Phase 1–5 commands beyond Phase 6 conditional read
- Do NOT enforce mid-flight escalation in hook layer
- Do NOT make `fast` the default without `analyzeIssue()` deciding

---

## Phasing Summary

| PR | Scope | Test Burden |
|----|-------|-------------|
| PR A | Gap 1 + Gap 2 | 4–6 new test cases |
| PR B | Gap 4 | 6–8 new test cases |
| PR C | Gap 3 | 2–3 hook integration tests |

---

## Missing Facts That Would Change Recommendations

1. Whether `validate-kaola-workflow-contracts.js:133-138` iterates hardcoded skill list (confirmed: it does; fast skill must be added explicitly in PR B).
2. Whether `KAOLA_WORKTREE_NATIVE=1` affects fast-path routing (both modes must be tested).
3. Whether `plugins/kaola-workflow/.codex-plugin/plugin.json` requires PostToolUse mirror (if yes, Gap 3 has a third registration point).

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Gap 4 signal-weights silently misroute issues | `path_signals` array in receipt for diagnostics; KAOLA_PATH override |
| Router line cap blocks Gaps 2+4 | Reclaim from Co-active Leases before adding; validate locally |
| Gap 3 hook slows session on every write | Path-prefix early-exit on first hook line |
| Plugin byte-copy drift | `cp scripts/X plugins/.../scripts/X` as last step before every commit |
| fast-summary.md schema clashes with future Phase 5 changes | Define as superset of Phase 6's actual consumed fields |
