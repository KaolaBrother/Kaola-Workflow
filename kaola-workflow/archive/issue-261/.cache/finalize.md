# finalize (terminal sink) — Phase-6 validation evidence for #261

AC4 — full `npm test` GREEN across all 4 editions (exit 0):
- claude: "Workflow walkthrough simulation passed"
- codex: validate-script-sync.js (byte-identity, BOTH claim.js + plan-validator.js mirror pairs) PASS; "Kaola-Workflow Codex contract validation passed"; "Kaola-Workflow walkthrough simulation passed"; #238/#239/#266 coverage PASSED
- gitlab: validate-vendored-agents (13 agents) + GitLab contract validation + GitLab + GitLab-Codex walkthroughs all PASSED
- gitea: validate-vendored-agents (13 agents) + Gitea contract validation + Gitea + Gitea-Codex walkthroughs all PASSED

This exercised the CLI→projTag integration path (the per-node tests passed `project` explicitly; npm test runs the full CLI barrier-check path with projTag derived from the plan path).

AC1/AC2/AC3 all shipped + covered (see node evidence): foreign-archive barrier refusal (gate-carveout), narrowed cmdFinalize staging (narrow-finalize), Phase-6 Staging Guard foreign-archive block w/ .archived suffix tolerance (staging-guard). G1 review + G2 security both verdict:pass findings_blocking:0. Docs updated (docs node).

CHANGELOG.md: [Unreleased] ### Fixed entry added for #261 (the finalize node's declared write). Records the S1 non-blocking follow-up ({project} render-token sanitization).

Worktree git status: 11 production files modified across the declared write-set union + CHANGELOG.md; only the intended files. No out-of-scope writes.

Follow-up to FILE at closure: S1 — sanitize the render-time {project} token at its source so every phase6.md {project} interpolation is metachar-safe (security-review non-blocking, action=document).
