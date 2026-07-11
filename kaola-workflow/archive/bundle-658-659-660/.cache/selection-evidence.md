selection_mode: auto-bundle

```json
{
  "recommended_bundle": {
    "primary_issue": 658,
    "issues": [658, 659, 660],
    "scope": "Resolve the three distinct, verified Kaola-Workflow defects discovered during the #655/#656 Codex financial-agent audit, without modifying financial-agent.",
    "confidence": "high",
    "rationale": "The archived #655 finalization summary explicitly records #658, #659, and #660 as separate follow-ups from the same audit. All are open, unassigned, dependency-free, and unclaimed; no active project folders or live lane markers exist. Their changes converge on workflow runtime/parser/contract tests and cross-edition validation, making one adaptive audit-remediation bundle coherent. Issue #657 should not be implemented because closed #654 already shipped its exact nonce-rotation behavior and regression coverage.",
    "priority_basis": {
      "frontier": "none — no priority signal in roadmap",
      "pick_vs_frontier": "no priority signal; ranked by scope-cohesion",
      "guardrails_honored": "none documented"
    },
    "expected_write_areas": [
      "scripts/kaola-workflow-plan-validator.js",
      "scripts/kaola-workflow-adaptive-node.js",
      "scripts/kaola-workflow-adaptive-schema.js and/or shared section locator",
      "scripts/test-adaptive-node.js",
      "GitLab claim-classification fixtures and dependency stubs",
      "cross-edition generated script copies",
      "route/contract and walkthrough tests",
      "CHANGELOG.md and narrowly required contract documentation"
    ],
    "risks": [
      "#658 changes fail-closed Finalization evidence aggregation and must prevent cross-group receipt contamination.",
      "#660 affects shared parsing/hash/freeze behavior and requires structural malformed-fence refusals without changing valid-plan behavior.",
      "#659 must keep true forge integration behavior intact while making default unit/contract fixtures fully hermetic.",
      "The bundle touches cross-edition surfaces, so all four edition chains must pass sequentially."
    ],
    "dependency_open_state_evidence": {
      "open_issues": {
        "658": "OPEN, unassigned; no declared external dependency; independently reproduced producer/consumer evidence-path mismatch.",
        "659": "OPEN, unassigned; no declared external dependency; independently reproduced ambient glab/network leak in a unit fixture.",
        "660": "OPEN, unassigned; no declared external dependency; independently reproduced fence-blind section-heading selection."
      },
      "claim_state": "No non-archive project directories, active workflow-state files, session markers, or lock files were present.",
      "roadmap_state": "ROADMAP.md reports no active work; .roadmap contains no issue sources or project rules, so there is no roadmap drive-order frontier.",
      "archive_evidence": "archive/issue-655/finalization-summary.md names #658, #659, and #660 as separate filed follow-ups; archive/issue-656/finalization-summary.md independently confirms #658."
    },
    "exclusions": [
      {
        "issue": 657,
        "reason": "Duplicate/already resolved by closed #654. Current main makes seedEvidenceFile nonce-aware, rotates a stale same-node binding even on normal open, force-rotates reopen-node evidence, discards the entire stale body, and contains T2b/T3 regression assertions. archive/issue-654/finalization-summary.md confirms the exact acceptance outcome and all four edition chains passed."
      },
      {
        "issue": 654,
        "reason": "CLOSED and finalized; it already provides the implementation required by #657."
      },
      {
        "issue": 655,
        "reason": "CLOSED and finalized; its archived summary is evidence for the three recommended follow-ups, not remaining implementation work."
      },
      {
        "issue": 656,
        "reason": "CLOSED and finalized; its archived summary independently corroborates #658."
      }
    ]
  }
}
```
