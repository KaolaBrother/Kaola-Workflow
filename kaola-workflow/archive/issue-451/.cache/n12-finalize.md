evidence-binding: n12-finalize 8b5d807d31e6

Finalize node (the Phase-6 sink anchor). MANDATORY #307 four-chain evidence + CHANGELOG entry.

four_chain_receipt: kaola-workflow/issue-451/.cache/chain-receipt.json
- headSha e7116d15 == current HEAD (fresh, not stale)
- claude exit 0 (146s), codex exit 0 (8s), gitlab exit 0 (68s), gitea exit 0 (50s) — 4/4 GREEN, 0 failed, 0 accepted-red waivers.
- Every node touched the edition trees, so a green claude chain alone is insufficient; all four were run sequentially and recorded.

changelog: CHANGELOG.md [Unreleased] gains the #451 entry under ### Removed (the `<role>-max` matrix retirement + the 8-part session-effort rebuild; D-451-01). n12 write set = CHANGELOG.md only.

gate_status: every code/sensitive node post-dominated by the completed code-reviewer (n10-review, verdict:pass, findings_blocking:0); no security-reviewer node required (no auth/payments/secrets touch — config TOML + dispatch wiring only); D451 dispatch-effort test green (752 assertions).
