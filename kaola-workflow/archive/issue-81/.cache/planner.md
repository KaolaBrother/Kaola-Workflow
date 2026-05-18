# Planner Output — Issue #81

## Problem Summary

`scripts/kaola-workflow-claim.js` lines 366-378 (`cmdStartup` no-target branch) silently surfaces a sole-active folder as `verdict: owned` when invoked with no `--target-issue`. CLAUDE.md lines 21-22 declare the opposite contract: "Startup scripts validate, not select… They refuse auto-pick with typed refusals. Ambiguity handling: When next issue is ambiguous or conflicts with active state, ask or stop."

Three command/skill docs (`commands/workflow-next.md` step 5, `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` step 5, `plugins/kaola-workflow-gitlab/commands/workflow-next.md` step 5) instruct the agent to rely on this carve-out: "If exactly one active folder is already present (startup will return verdict: owned), skip steps 1-4 and route to that project."

Notes:
- `cmdBootstrap` is an alias for `cmdStartup` (router line 602). No separate sole-active branch exists.
- `cmdPickNext` (lines 389-395) already returns `no_target` unconditionally without a target. No change needed.
- `cmdResume` (line 397) intentionally picks the first active folder — different contract, out of scope.
- Every existing test invocation passes `--target-issue` explicitly. No regression test depends on the sole-active no-target branch.

---

## Option A — Explicit-Always (script + docs bend to CLAUDE.md)

### Change surface
1. `scripts/kaola-workflow-claim.js` lines 370-378: remove `if (active.length === 1)` sole-active branch. All no-target calls return `{ verdict: 'no_target', claim: 'none', project: null, issue: null }`, exit 1.
2. `commands/workflow-next.md` step 5 (line 56): rewrite — agent inspects active folders via `node "$CLAIM_JS" status`, when exactly one active folder exists sets `KAOLA_TARGET_ISSUE` to that folder's issue number before calling startup. Resume affordance survives; script-side selection does not.
3. `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` step 5: same rewrite.
4. `plugins/kaola-workflow-gitlab/commands/workflow-next.md` step 5: same rewrite.
5. `CLAUDE.md` lines 21-22: one-line confirmation that startup never selects including the sole-active case; agent's responsibility to set `KAOLA_TARGET_ISSUE` from `status` output.
6. `scripts/simulate-workflow-walkthrough.js`: add three regression scenarios (0/1/multiple active without `--target-issue`). All three assert `verdict: 'no_target'`, `claim: 'none'`, exit non-zero.

### Pros
- Restores single authoritative contract; script never selects, only validates
- Removes hidden sole-active selection — matches "Agent Owns Reasoning; Scripts Own Atomicity" principle (issue #44)
- Agent still resumes sole active folder; it just states the issue number first (already required by docs step 7)
- Zero existing tests depend on removed branch
- Symmetrical with `cmdPickNext` (already returns `no_target` unconditionally)

### Cons
- Agent must read `node CLAIM_JS status` before startup in sole-active case (already step 3 in docs; reordering, not new work)
- Resume UX is one step less magical: missing `KAOLA_TARGET_ISSUE` returns `no_target` instead of routing silently

### Risks
- Medium: doc/script drift — if four-doc rewrite is incomplete, agents loop on `no_target`. Mitigated by regression tests and verbatim `node CLAIM_JS status` pattern in all three docs.
- Low: external callers (none known) that depend on sole-active branch would break.

### Complexity: Small
One script delete (5-7 lines), three small doc rewrites (~3-5 lines each), one CLAUDE.md tweak (1-2 lines), three new test cases (~40 lines using existing `runNode` + offline-claim pattern).

### Architectural fit: Strong
CLAUDE.md is authoritative; this makes implementation match the contract.

---

## Option B — Sole-Active-Allowed (CLAUDE.md bends to script + docs)

### Change surface
1. `scripts/kaola-workflow-claim.js`: no change.
2. `CLAUDE.md` lines 21-22: amend with explicit carve-out for sole-active resume affordance.
3. Three command/skill docs: tighten step 5 to label as intentional exception, name verdict explicitly.
4. `scripts/simulate-workflow-walkthrough.js`: add three regression scenarios. Sole-active case asserts `verdict: 'owned'`, `claim: 'owned'`, exit 0.

### Pros
- Smallest code change (zero script lines)
- Preserves one-call sole-active resume magic (most common post-interruption case)
- Locks current behavior into regression test

### Cons
- Weakens CLAUDE.md's "scripts validate, not select" rule — sole-active branch IS selection-by-omission
- Adds exception to a rule whose value is its sharp edge
- Inconsistent with `cmdPickNext` (no carve-out there)
- Erodes the contract incrementally

### Risks
- Low technical risk (code already works this way)
- Medium governance risk: undermines the agent-owns-reasoning model from issue #44

### Complexity: Trivial
Four doc edits, three test cases, no script change.

### Architectural fit: Weak
Contradicts the principle stated above the rule it amends. Issue #44 added this principle deliberately.

---

## Option C — Route sole-active through `cmdResume` (Rejected)

Rejected: introduces `cmdResume` into the startup flow with a different JSON shape, requiring a second response parser in all three docs; widens scope without resolving the contract conflict; just moves selection to a different command.

---

## Recommendation: Option A

CLAUDE.md is the authoritative contract, deliberately tightened in issue #44. The sole-active branch in `cmdStartup` contradicts the "scripts validate, not select" rule. Cost is one script delete + four small doc edits + three regression tests — all using existing patterns. No existing test breaks. The resume affordance survives via agent-side `status` check. Option B requires arguing CLAUDE.md was wrong on a recent deliberate rule; no evidence supports that.

---

## Out-of-Scope (explicit)

- `cmdResume` — different command, different documented contract, not named in issue #81
- `cmdPickNext` — already returns `no_target` correctly
- `cmdBootstrap` — alias for `cmdStartup`; fixing `cmdStartup` covers it
- ROADMAP.md regeneration — phase-6 concern
- Worktree cleanup / `.kw` sibling logic — independent surface
- `KAOLA_SINK` / PR-intent capture machinery — orthogonal
- `KAOLA_TARGET_ISSUE` env-var propagation pattern — already works; only prose needs editing

---

## Relevant File Paths

- `scripts/kaola-workflow-claim.js` lines 366-387 (`cmdStartup`); line 602 (bootstrap alias); lines 389-395 (`cmdPickNext`); line 397 (`cmdResume`)
- `CLAUDE.md` lines 17-25
- `commands/workflow-next.md` step 5 line 56; bash glue lines 80-100
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` step 5 line 66
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md` step 5 line 56
- `scripts/simulate-workflow-walkthrough.js` lines 74-100 (`runNode` at line 20; `runClaimOnline` at line 405)
