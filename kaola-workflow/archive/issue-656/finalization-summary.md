# Finalization - Summary: issue-656

## Delivered

Pinned isolated, self-contained control-plane spawn contracts for `issue-scout` and `workflow-planner` across all Kaola editions. Codex routing now requires direct named-role spawns with literal `fork_turns: "none"`, stable v2 task identities, bounded self-contained briefs, no transient model/effort overrides, and one corrected same-role retry for malformed argument shape. Claude retains its native isolated `Agent(...)` prompts. Structural routing and contract assertions cover the literal objects and reject conflicting, duplicate, unknown, reordered, or inherited-history fields.

## Final Validation Evidence

- Adaptive plan hash: `1e380b43aab4137ec5145bae17a553d15eff47d9bdaa6ee7d6e1aad22903318c`; all ledger rows complete.
- Script-enforced adaptive gates: resume=0, gate=0, barrier=0, verdict=0.
- Self-host validation receipt: `kaola-workflow/issue-656/.cache/chain-receipt.json`, recording exit 0 for the claude, codex, gitlab, and gitea edition chains.
- Terminal gate receipts: n2 pass/findings 0, n3 pass/findings 0, n4 pass/findings 0. Per-instance bridge receipts `adversarial-verifier-v2.md` and `adversarial-verifier-v1-retry.md` reference the final verified node receipts.

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. The routing command/SKILL surfaces are the user-facing contract and `CHANGELOG.md` contains the #656 dock. No separate README, API/schema, setup, architecture, environment, or configuration documentation is affected.

## Run gaps

- in_run_repair (n2-review-contract): filed: #656
- in_run_repair (n3-adversarial-v2): filed: #656
- in_run_repair (n4-adversarial-v1-retry): filed: #656
- manual:fanout-evidence-path-mismatch (Adaptive dispatch emitted only node-id adversarial receipts while Finalization required role-prefixed per-instance receipts; filed as #658.): filed: #658

Follow-up: https://github.com/KaolaBrother/Kaola-Workflow/issues/658

## Closure Decision

CLOSE #656. The final node and all mandatory review/adversarial gates pass; no unresolved R1/R2 finding or user decision remains.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | `.cache/chain-receipt.json` | |
| doc-updater | N/A | `.cache/doc-updater.md` | Routing command/SKILL surfaces are the user-facing contract; CHANGELOG is docked; no separate documentation surface is affected. |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| roadmap refresh | invoked | `kaola-workflow/ROADMAP.md` | |
| archive completed folder | invoked | `kaola-workflow/archive/issue-656` | |
| contractor mechanical finalization | subagent-invoked | contractor dispatch for issue-656 | |
| finalize (n5-finalize) | main-session-direct | `evidence-binding: n5-finalize 916a1a10edd2` | |
| final commit | invoked | `chore: finalize issue-656` | |

## Status

Ready for deterministic archive and final commit on `workflow/issue-656`. Sink dispatch, remote issue closure, push, and merge remain with the main session.

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: attested
