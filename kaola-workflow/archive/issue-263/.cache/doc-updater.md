# doc-updater — issue #263 Classify-And-Act

**Date:** 2026-06-06

## Checklist results

### README.md — UPDATED (stale shape counts fixed; Classify-And-Act row already present)

The issue brief stated README was already done (Classify-And-Act row added). Verified: the row is present at line 579 with correct governance note. Found two stale occurrences of the "three shapes" count that were NOT fixed by the issue-263 commit:

- Line 563: "one of three shapes (`sequence`, bounded fan-out …, or a bounded loop)" — updated to "one of four shapes (…, or a selective-execution `select(<group>)` arm)".
- Line 569: "The three shapes (`sequence`, `fanout`, `loop`) are a *grammar*" — updated to "The four shapes (`sequence`, `fanout`, `loop`, `select`) are a *grammar*".

No stale `Planned` label for Classify-And-Act found (grep came up empty). Row count: 7 building-block rows + 1 Composed row = 8 total; the paragraph "The first seven are building blocks; the last row stacks three of them" remains correct (Classify-And-Act is the 7th building block, Composed is the 8th row stacking three of them).

### CHANGELOG.md — UPDATED

Added entry under `## [Unreleased]` covering: `select(<group>)` as a fourth grammar shape, `parseNodeSelector`, G-SEL-1..4, `--selector-check` CLI mode, `selectorCheck` blocking step in commit-node with `armsToNa` return, test coverage, and the README pattern table note. All four editions noted. No version or release-surface line (that is a release step).

### docs/api.md — UPDATED (multiple changes)

**Grammar shape enumeration (line 245):** "exactly three node shapes — `sequence`, `fanout`, `loop`" updated to "exactly four node shapes — `sequence`, `fanout`, `loop`, and `select(<group>)`" with a G-SEL rules summary appended (G-SEL-1 through G-SEL-4 with the actual enforcement logic extracted from source).

**Usage line (line 202):** Added `[--verdict-check [--node-id ID]] [--selector-check --node-id ID]` — both were missing. The usage line now matches the real `--help` output.

**Mode precedence (line 205):** Added `selector-check` and `verdict-check` to the precedence chain. Confirmed actual order from `main()` `if (args.includes(...))` sequence: `resume-check > freeze > gate-verify > record-base > barrier-check > selector-check (line 982) > verdict-check (line 1039) > default`. Note: verdict-check comes AFTER selector-check in the actual code.

**Two new mode bullets:** Added `--verdict-check` (#251, which was entirely absent from api.md despite shipping in 5.3.0) and `--selector-check` (#263) bullet after the `--barrier-check` bullet. Both bullets are grounded in real source code — no fabrication.

**JSON result shapes:** Added `--verdict-check` and `--selector-check` shape entries after `--barrier-check`. The `--selector-check` shapes quote the three real outputs from validator source lines 1009/1021/1035 (non-selector, fail-closed, success). The `--verdict-check` shapes are sourced from `verifyVerdictBlock` return statements (lines 346-402): per-node non-gate self-skip returns `{ ok, nodeId, role, verdict: null, findings_blocking: null, found: false }`; per-node gate pass/fail and whole-plan `{ ok, failures, checked }` shapes are quoted directly from source.

**readySet shape field (line 318):** Updated description from "(`sequence`, `fanout`, or `loop`)" to "(`sequence`, `fanout`, `loop`, or `select`)".

**Commit-node modes table:** Updated per-node row "overallOk depends on" from "barrier pass only" to "barrier pass AND selector pass" — the advisor flagged this as the single most important correction; `combineResults` line 102 confirms `overallOk = barrierPass && selectorPass`. Also added `--verdict-check` (informational) to the "What runs" column.

**Commit-node safety invariants:** Added a bullet for selector-check blocking behaviour and the backward-compat null-means-pass rule.

**Commit-node JSON schema:** Added `verdictCheck` and `selectorCheck` fields to the schema block, with explanation bullets noting `selectorCheck.armsToNa` and the `informational:true` tagging on `gateVerify`/`verdictCheck`.

**Pre-existing gap documented:** `parseNodeVerdict` and `parseNodeSelector` are schema-module functions. Since `parseNodeVerdict` (#251) was never added to api.md, there is no established precedent for a schema-function section. Rather than add `parseNodeSelector` alone (asymmetric), neither was added as a named API entry. The function signature and output are covered inline under `--selector-check`.

### docs/architecture.md — UPDATED

Line 24: "the three shapes (sequence / fan-out / bounded loop)" updated to "the four shapes (sequence / fan-out / bounded loop / selective-execution `select`)".

### docs/workflow-state-contract.md — UPDATED (out-of-scope but accurate-critical)

The `## Nodes` column enumeration listed `| id | role | depends_on | declared_write_set | cardinality | shape |` and `shape ∈ sequence / fanout / loop`. Updated to add `| selector_source |` to the column list and `select(<group>)` to the shape enum, with a one-line explanation of `selector_source` semantics (backward-compatible: absent column is non-arm). This file is referenced from api.md as "The full workflow-plan.md artifact contract … is documented in docs/workflow-state-contract.md" — leaving it stale would undercut that reference. Flagging as an out-of-scope addition; the change is purely additive and accurate.

### .env.example — SKIPPED

No new environment variables were added in #263. Confirmed by grep for `SELECTOR` in schema/validator/commit-node scripts — none.

### Inline comments — SKIPPED (no action needed)

The new functions have `// #263:` comments explaining their purpose and design constraints (fence-blind anchor, last-match-wins, no vocabulary clamp in schema; G-SEL-* mapping in validator). The WHY is documented where non-obvious. No changes needed.

## Accuracy regressions corrected (not in original checklist)

1. **"Three shapes" → "four shapes"** across README (×2), docs/api.md, docs/architecture.md, docs/workflow-state-contract.md. This was a stale-fact regression introduced by #263 adding `select()` as a fourth parsed kind in `parseShape`.
2. **Per-node `selectorCheck` is BLOCKING** — the modes table in api.md previously said "barrier pass only"; the real `combineResults` logic is `overallOk = barrierPass && selectorPass`. Corrected.
3. **`--verdict-check` was entirely absent from api.md** despite shipping in 5.3.0 (#251). Added alongside `--selector-check` to avoid leaving the doc asymmetric.

## BLOCK lines

None. All ground truth was available from the actual source files and `--help` output.
