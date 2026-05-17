# Phase 1 - Research / Discovery: issue-41

## Deliverable

Four structural improvements to `scripts/kaola-workflow-claim.js` (+ plugin mirror + hooks + new phase command):

- **Gap 1**: `analyzeIssue()` function replacing inline label-scanning, with auto-discovery for non-P* priority labels. Returns `{ priority_tier, recommended_path, path_signals, path_confidence }`.
- **Gap 2**: `recovery` field in `claim: "none"` startup receipt (`advance_project | consult_advisor | prompt_user`).
- **Gap 3**: PostToolUse hook (`hooks/kaola-workflow-phantom-advisor.sh`) that flags "per advisor" phrases without a matching advisor tool call.
- **Gap 4**: Fast-path workflow (`commands/kaola-workflow-fast.md` + `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md`) for trivial issues, gated by `analyzeIssue()` output.

## Why

A prior session bypassed structured routing (claim:none with no guidance → arbitrary issue pick), self-attributed a fake advisor recommendation with zero advisor tool calls, and mis-ranked issues because the host project used `Engine Showcase Gap` instead of `P0/P1`. These four gaps close those failure modes systematically while adding a fast-path for trivial work.

## Affected Area

| File | Gap(s) |
|------|--------|
| `scripts/kaola-workflow-claim.js` | 1, 2, 4 — `parsePriorityTier`, `analyzeIssue`, `writeStartupReceipt`, `cmdStartup` claim:none branch |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 1, 2, 4 — byte-identical mirror (hard contract) |
| `hooks/hooks.json` | 3 — add PostToolUse entry |
| `.claude-plugin/plugin.json` | 3 — mirror PostToolUse entry |
| `hooks/kaola-workflow-phantom-advisor.sh` | 3 — new file |
| `commands/workflow-next.md` | 2, 4 — read `recovery` field; read `recommended_path` (cap: 265 lines; currently 263) |
| `commands/kaola-workflow-fast.md` | 4 — new file |
| `plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md` | 4 — new file |
| `commands/kaola-workflow-phase6.md` | 4 — conditional `fast-summary.md` vs `phase5-review.md` read |
| `scripts/simulate-workflow-walkthrough.js` | 1, 2, 3, 4 — 4 new test cases |
| `scripts/validate-workflow-contracts.js` | 1, 2, 3, 4 — new assertions |
| `scripts/validate-kaola-workflow-contracts.js` | 1, 2, 3, 4 — new assertions |

## Key Patterns Found

1. **`parsePriorityTier(issue, topTierLabels)` — claim.js:936**: Two-pass label check (topTierLabels first, then P0-P3 hardcoded, then tier:4). `analyzeIssue()` must replace/wrap this, not fork it.
2. **`writeStartupReceipt()` — claim.js:529**: Single shape-defining function for all receipt payloads. All new receipt fields (`recovery`, `recommended_path`, `path_signals`, `path_confidence`) belong here, not at call sites.
3. **`readPriorityConfig(root)` — claim.js:922**: Reads from `~/.config/kaola-workflow/config.json` and `{root}/kaola-workflow/config.json`. Gap 1's `gh label list` fetch is a third sub-call inside this function.
4. **`claim: "none"` branch — claim.js:1272-1291**: Currently outputs no `recovery` field. `computeRecovery(skipped, blocked)` → `{ action, reason }` must be added here.
5. **Plugin parity hard contract**: `validate-kaola-workflow-contracts.js:164-168` enforces byte-identical content between `scripts/kaola-workflow-claim.js` and `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`. Every change must be replicated.
6. **Hook pattern (`hooks/kaola-workflow-pre-commit.sh`)**: Bash script, reads `HOOK_INPUT` env as JSON via `node -e`, exits 2 to block, exits 0 to pass. Gap 3 follows this pattern.
7. **Error handling**: `process.stderr.write(...)` for diagnostics, `process.exitCode = N` for non-fatal exits (not `process.exit()`). Never throws to top-level dispatcher.
8. **`workflow-next.md` line cap**: Currently 263 lines, cap enforced at 265. Gap 2 + Gap 4 router changes must be surgical (2 lines maximum total).

## Test Patterns

- **Framework**: Hand-rolled `assert(condition, message)` — throws on failure. No external runner.
- **Location**: `scripts/simulate-workflow-walkthrough.js` (5119 lines)
- **Run**: `node scripts/simulate-workflow-walkthrough.js` — must exit 0 with `Workflow walkthrough simulation passed`
- **Structure**: Epic Case shell-shim pattern. Each case: `fs.mkdtempSync` → `git init` → write `gh` shim → set `env = { KAOLA_KERNEL_SESSION_SKIP: '1', PATH: bin+... }` → `execFileSync` claim.js → `assert` on JSON receipt fields → `fs.rmSync(tmp)`
- **4 new cases needed**: (14c) happy fast-path; (14d) override-conflict; (14e) mid-flight escalation; (14f) claim:none recovery field assertion

## Config & Env

| Name | Purpose |
|------|---------|
| `KAOLA_WORKFLOW_OFFLINE` | Skip all `gh` calls |
| `KAOLA_SESSION_ID` / `CODEX_THREAD_ID` / `CLAUDE_SESSION_ID` | Session identification |
| `KAOLA_COORD_ROOT` | Override coordRoot path |
| `KAOLA_KERNEL_SESSION_SKIP` | Must be `1` in new tests |
| `KAOLA_PATH` | New (Gap 4) — `fast` or `full` env override |
| `~/.config/kaola-workflow/config.json` | Global `priority_top_tier_labels` |
| `kaola-workflow/config.json` | Local `priority_top_tier_labels` |

## External Docs

None — implementation uses existing Node.js `fs`/`path`/`child_process` APIs already in use in `claim.js`. No new external library dependencies.

## GitHub Issue

KaolaBrother/kaola-workflow#41

## Completeness Score

10/10

- Goal clarity: 3/3 — four gaps with concrete symptoms and acceptance criteria
- Expected outcome: 3/3 — per-gap acceptance criteria, test cases specified, contract assertions defined
- Scope boundaries: 2/2 — files enumerated, plugin parity constraint explicit, line cap noted
- Constraints: 2/2 — conservative gate default, byte-identical mirror, KAOLA_KERNEL_SESSION_SKIP test requirement

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | All implementation uses existing Node.js APIs already in claim.js; no external library/framework behavior needed |

## Notes / Future Considerations

- `analyzeIssue()` is the architectural keystone: Gap 1 defines it, Gap 4 extends it, Gap 2 calls it to determine recovery action. Implementation order must respect this dependency: Gap 1 → Gap 4 → Gap 2 (recovery computation can reuse `analyzeIssue` output to suggest `advance_project` when a sibling project is at an early phase and might unblock after fast-path).
- `workflow-next.md` is at 263/265 line cap. Any router additions for Gap 2 + Gap 4 must be minimal; if the cap would be exceeded, open a separate issue to raise it rather than exceeding it silently.
- Gap 3's PostToolUse hook cannot easily access full conversation context (only the tool result). Design as a suspicious-flag (warning) rather than hard-block for the per-artifact lint path; the harder real-time detection belongs in a future session-aware variant.
- Mid-flight escalation from fast-path (`> 3 files`, `≥ 3 test failures`, subagent escalation signal) must write `escalated_to_full: <trigger>` to `workflow-state.md` and re-route to Phase 1 with the in-progress artifact preserved.
