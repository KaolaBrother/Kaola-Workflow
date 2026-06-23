# Workflow Plan — issue-566

<!-- plan_hash: 0356a0161fa77be58ba51f88272add6dd6b67429d68a7910b25542a1ae71203a -->

harden(observability): capture dispatched model in `dispatch-log.jsonl` — the plan `model` column is the one frozen-plan field with no closed loop.

## Meta

labels: enhancement, area:scripts
validation_command: npm test

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-payload-probe | knowledge-lookup | — | — | 1 | sequence | sonnet |
| n2-dispatch-model-field | tdd-guide | — | hooks/kaola-workflow-subagent-dispatch-log.sh, plugins/kaola-workflow/hooks/kaola-workflow-subagent-dispatch-log.sh, plugins/kaola-workflow-gitlab/hooks/kaola-workflow-subagent-dispatch-log.sh, plugins/kaola-workflow-gitea/hooks/kaola-workflow-subagent-dispatch-log.sh, scripts/simulate-workflow-walkthrough.js | 5 | sequence | sonnet |
| n3-review | code-reviewer | n2-dispatch-model-field | — | 1 | sequence | opus |
| n4-docs | doc-updater | n1-payload-probe, n3-review | CHANGELOG.md, docs/architecture.md, docs/workflow-state-contract.md | 3 | sequence | sonnet |
| finalize | finalize | n4-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Goal / acceptance (issue #566, LOW severity, observability — NOT correctness)
The per-node `model` column is the only frozen-plan field with no closed loop. Make the dispatched model **observable** in `dispatch-log.jsonl` — additive, backward-compatible, **no new gate, no blocking behavior, no bespoke validator** (explicit non-goals per the issue).

- **Acceptance:** SubagentStart records written by `hooks/kaola-workflow-subagent-dispatch-log.sh` carry a model field; absent field tolerated by all existing readers (they key on `agent_type` — verified: `checkDispatchAttestations` in `kaola-workflow-claim.js`, `kaola-workflow-closure-contract.js`, the M1 hook-existence test).

### Design — dual-field, payload-agnostic (robust regardless of the open question)
The issue flags an open question: *does the SubagentStart hook payload expose the dispatched `model`?* The implementation is **best-effort and does not branch on the answer**, so it is correct either way:
- **Always emit `model_planned`** — resolve the agent's tier via the existing `scripts/kaola-workflow-resolve-agent-model.js <agent_type> --raw` (manifest → frontmatter → `DEFAULT_AGENT_MODELS` → `''`). This is the "honest partial" the issue asks for: the plan's intended tier, always populated for a known role.
- **Opportunistically emit `model`** — parse it from the STDIN payload alongside `agent_type`/`agent_id`/`cwd` (empty if absent). When a runtime's payload carries it, the *actual* dispatched tier is captured; otherwise the line simply omits/empties `model` and `model_planned` remains.
- **`n1-payload-probe` (knowledge-lookup, read-only)** resolves the open question for **doc accuracy only** (which of claude/opencode/codex SubagentStart payloads actually carry `model`), feeding `n4-docs`. It is a parallel sibling of `n2` (hidden behind the longer implement step) — the implementation never blocks on it.

### n2 implementation notes (tdd-guide)
- **RED first:** extend the existing M1 hook block in `scripts/simulate-workflow-walkthrough.js` (around the `#277` hook-existence assertions) to invoke `hooks/kaola-workflow-subagent-dispatch-log.sh` with a crafted SubagentStart payload inside a tmp git repo carrying an active `kaola-workflow/{project}/workflow-state.md`, then assert the appended `dispatch-log.jsonl` line contains a non-empty `model_planned` and reflects a payload-supplied `model`. Watch it fail, then implement to GREEN.
- **Hook edit (4 byte-identical copies — the `validate-script-sync.js` sync-group at `:157`):** add the resolver call and the payload parse to the `node -e` JSON builder. Keep the hook **fail-open** (exit 0 always): wrap the resolver invocation (`MODEL_PLANNED=$(node "$RESOLVER" "$AGENT_TYPE" --raw 2>/dev/null || printf '')`) so a missing/unresolvable resolver never breaks dispatch logging. Locate the resolver relative to the hook: `$(dirname "$0")/../scripts/kaola-workflow-resolve-agent-model.js` (in both the installed plugin tree and the dev repo, `hooks/` and `scripts/` are siblings). Consolidating the four payload-field parses into one `node -e` pass is fine if cheap; otherwise mirror the existing per-field parse pattern.
- **All four hook copies MUST stay byte-identical** (enforced by `validate-script-sync.js` in the claude + codex chains). Edit them as one set.
- After editing the canonical `hooks/` copy, refresh the gitignored `.opencode/hooks/` mirror by running `node scripts/sync-opencode-edition.js` (local hygiene so `node scripts/test-opencode-edition.js` stays green; `.opencode/` is gitignored so it is NOT a committed write and is intentionally absent from the declared write set).

### Explicit exclusions (keep minimal — per issue non-goals)
- **No edit to `scripts/kaola-workflow-claim.js` backfill entries.** They are dispatch-log records but NOT SubagentStart records (claim/contractor self-attest), so they are out of the acceptance target. `claim.js` is a 4-edition sync-group canonical (`COMMON_SCRIPTS`); touching it would 4× the scope for optional polish. The absent field is tolerated (backward-compatible) — exactly the acceptance.
- **No warn-only finalize note.** Comparing logged model vs the plan `model` column needs mapping dispatch entries to plan nodes — more than "a few lines" — so SKIP it per the issue ("if it costs more than that, skip it; the log field alone is the deliverable").
- **No new gate, no new validator script, no schema migration.**

### n4 docs notes (doc-updater)
- `docs/architecture.md:56` and `docs/workflow-state-contract.md:42-44` document the dispatch-log record fields as `ts, agent_type, agent_id, cwd`. Update both to include the new `model` / `model_planned` field, wording reflecting `n1-payload-probe`'s finding (e.g. "model when the payload exposes it; else model_planned from the resolver"). No contract validator pins this literal field list (verified) — the doc edits are safe.
- Add a `## [Unreleased]` CHANGELOG entry (LOW, observability): single additive JSONL field, backward-compatible, cross-edition (canonical + codex byte-twin + gitlab/gitea hook copies), four chains green.

### Cross-edition / validation
- Touches `plugins/kaola-workflow-{gitlab,gitea}/hooks/` → **#307 four-chain obligation**; `validation_command: npm test` chains all four (recorded once, reused by nodes + Finalization per D-547-01 (existing)). The hook is a sync-group (not a forge hand-port); `validate-script-sync.js` enforces byte-identity.
- No routing-prose change → no #400 six-surface obligation. No agent-profile change → no #340 registration surface.

### DAG shape / gate rationale
- `n1` ∥ `n2` antichain (read-only probe + the implement step co-open); `n3` (code-reviewer, opus gate) post-dominates `n2` (the only code-producing node — G1 ✓; sole path `n2→n3→n4→finalize`); `n4` is serialized after `n3` so the gate provably post-dominates, matching the proven review→docs→finalize pattern. No sensitive/destructive node and machine-verifiable acceptance → no G2 `security-reviewer`, no G3 `main-session-gate`. `n1` is read-only → no gate obligation on its path.

## Node Ledger

| id | status |
| --- | --- |
| n1-payload-probe | complete |
| n2-dispatch-model-field | complete |
| n3-review | complete |
| n4-docs | complete |
| finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| knowledge-lookup (n1-payload-probe) | subagent-invoked | evidence-binding: n1-payload-probe 0974938a2331 | |
| tdd-guide (n2-dispatch-model-field) | subagent-invoked | evidence-binding: n2-dispatch-model-field c464e29e3976 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 791b3c0c0286 | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 03362a304e7e | |
