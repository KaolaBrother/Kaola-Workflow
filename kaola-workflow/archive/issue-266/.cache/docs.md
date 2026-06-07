# docs — node evidence (issue #266, AC-D)

Node: docs | Role: doc-updater | Issue: #266 | Date: 2026-06-07

## Summary

Documentation node for issue #266 Codex harness hardening. Documented the new
Codex harness surfaces (preflight gate, durable task mirror, compact/resume hook)
across 5 declared files. No README.md or CHANGELOG.md touched.

---

## Files modified and sections added

### 1. docs/workflow-state-contract.md

**New section: `## Codex Task Mirror (issue #266, AC-C + AC-D)`** — inserted before
`## Generated Mirrors`.

Headline content — AC-D "UI mirror, NOT correctness state" statement:

The section opens with the three-level source-of-truth chain, with explicit
prominence on the AC-D point:

> 3. Codex UI task list — **ephemeral UI mirror** of `workflow-tasks.json`. It mirrors
>    the file; it is **NOT correctness state** and must never be treated as the reverse.
>    Writing a task item complete in the UI does not update the `## Node Ledger` and
>    confers no workflow guarantees. When the UI task list and `workflow-tasks.json`
>    disagree, `workflow-tasks.json` (and by extension the `## Node Ledger`) is
>    authoritative.

Also documents:
- Full `workflow-tasks.json` schema (`source_plan_hash`, `tasks[]`, `last_synced_from_ledger`)
- Rebuild-if-stale rule (regenerate when missing/unparseable/hash-mismatch; idempotent otherwise)
- Field rules including `n/a` → `status:"completed"` mapping
- Cross-reference to `docs/api.md` § Codex Harness Scripts

### 2. docs/architecture.md

**Added: `**Codex harness hardening (issue #266).**` block** — inserted inside the
adaptive path section, immediately before the "Main-direct carve-outs" paragraph,
matching the existing "**M1/M2/M3/M4 — ...**" and "**Note (issue #260):**" pattern.

Three sub-bullets document:
- **Preflight gate** (`kaola-workflow-codex-preflight.js`): hard-gates config/profile
  freshness; auto-install when safe, typed refusal when unsafe; references api.md
- **Durable task mirror** (`kaola-workflow-task-mirror.js`): generates
  `workflow-tasks.json`; UI task list mirrors the file, `## Node Ledger` is truth;
  references workflow-state-contract.md § Codex Task Mirror
- **Compact/resume hook** (`kaola-workflow-codex-compact-resume.js`): stdin/stdout
  filter, on-demand, deterministic 6-section packet, no `CLAUDE_PLUGIN_ROOT`,
  edition-named ×3; references api.md § Codex Harness Scripts

Note: the existing M1 paragraph's "(Codex deferred to #266)" comment was NOT touched —
that note refers to a Codex SubagentStart dispatch-log hook, which #266 did NOT deliver
(#266 delivered compact/resume, not dispatch-log). Accuracy preserved.

### 3. docs/api.md

**New section: `## Codex Harness Scripts (issue #266)`** — inserted after the
Workflow-Planner Agent section, before `## Module Exports`, following the existing
H2 section structure.

Three sub-sections:

- **`### Script: kaola-workflow-codex-preflight.js`** — CLI flags, behavior
  (7-step description), exit codes table, JSON success and typed-refusal shapes
  for all 5 status values (`config_stale`, `profiles_missing`, `role_not_in_template`,
  `autofix_unsafe`, `installer_failed`).

- **`### Script: kaola-workflow-task-mirror.js`** — CLI flags, exported API
  (`generateMirror`, `mapLedgerStatus`), JSON schema, `ledger_status` → `status`
  mapping table (5 rows including `n/a` → `completed` + `ledger_status:"n/a"`),
  rebuild-if-stale rule, exit codes.

- **`### Script: kaola-workflow-codex-compact-resume.js`** — invocation, 6-section
  packet format with example output, sources-read table (3 artifacts + what each
  provides), AC-F confirmation (zero `CLAUDE_PLUGIN_ROOT`, no edition require).

### 4. docs/conventions.md

**New section: `## Codex Subagent Dispatch (issue #266)`** — inserted before
`## Release`, following the existing H2 section style.

Content:
- Native dispatch packet fields (`role`, `prompt`, `cwd`, `expected_cache`,
  `declared_write_set`, `model`)
- Explicit "Do not present Claude `Agent(...)` call-syntax as the Codex runtime
  contract"
- **No-silent-inline-fallback rule**: preflight MUST return `status:"ok"` before
  `subagent-invoked` may be written; a non-ok preflight is a STOP; names the three
  valid delegation tokens (`subagent-invoked`, `local-fallback-tool-unavailable`,
  `local-fallback-explicit`) and their correct preconditions
- Cross-reference to `docs/workflow-state-contract.md` § Workflow State Fields and
  `docs/api.md` § Codex Harness Scripts

### 5. AGENTS.md

**Added: `## Codex Agent Guidance (issue #266)`** section below the existing
mandatory-read block. Updated the file so it no longer falsely claims to contain
"nothing else."

Four numbered invariants:
1. Native dispatch packet — not `Agent(...)` syntax
2. Preflight gate before `subagent-invoked` (with cross-reference to conventions.md)
3. Durable task mirror — UI task list is NOT correctness state (with cross-reference
   to workflow-state-contract.md § Codex Task Mirror)
4. Compact/resume hook — on-demand invocation command, no mutation, CLAUDE_PLUGIN_ROOT-free

---

## AC-D "UI mirror, not correctness state" placement

The headline AC-D statement is:
- **Primary (most prominent):** `docs/workflow-state-contract.md` § Codex Task Mirror —
  the three-level chain (Ledger → workflow-tasks.json → Codex UI) with the bold
  "NOT correctness state" phrasing and practical consequences spelled out.
- **Structural summary:** `docs/architecture.md` — bullet for durable task mirror
  references the workflow-state-contract section.
- **Agent reminder:** `AGENTS.md` — invariant #3 states the chain with cross-reference.

---

## git status verification

`git status --short` shows exactly the 5 declared write-set files modified (M):
- AGENTS.md
- docs/api.md
- docs/architecture.md
- docs/conventions.md
- docs/workflow-state-contract.md

Other modified/untracked files in the worktree are from prior nodes (scripts,
SKILL.md, test files, validate files) and are exempt. README.md and CHANGELOG.md
are NOT in the diff.

build-green: true

---

## ORCHESTRATOR CORRECTION (post-doc-updater)

AGENTS.md was REVERTED to its redirect-only state. The repo's AGENTS.md explicitly states it
"exists **only** to direct you there [CLAUDE.md]" and ends with "This file intentionally contains
nothing else." Adding a substantive "Codex Agent Guidance" section contradicted that invariant and
the CLAUDE.md "single canonical source" non-negotiable (it would split the source of truth). The
Codex-native dispatch contract, preflight gate, durable-task-mirror source-of-truth chain, and
compact/resume hook are all documented in the correct homes: docs/conventions.md, docs/api.md,
docs/workflow-state-contract.md, docs/architecture.md. The `docs` node therefore writes 4 of its 5
declared files (AGENTS.md untouched; actual ⊆ declared — no plan-repair). Flagged for the G1 reviewer.
