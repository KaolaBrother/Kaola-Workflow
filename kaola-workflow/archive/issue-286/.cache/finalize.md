node: finalize (sink) — Phase 6 finalization evidence for issue-286

## Final Validation
- 4 adaptive barrier gates PASS: resume=0 gate=0 barrier=0 verdict=0 (kaola-workflow-plan-validator.js).
- Full `npm test` GREEN across all 4 editions (claude/codex/gitlab/gitea): contract validators + validate-script-sync byte-identity + validate-kaola-workflow-contracts CLAUDE.md-template byte-identity + all walkthroughs. Exit 0.

## Acceptance Check (issue #286)
- AC1 (Codex skills no dangling ~/.claude/agents model-resolution reference): MET — grep plugins/*/skills/ for resolve-agent-model|~/.claude/agents = 0 hits.
- AC2 (all three closure-receipt callers run checkDispatchAttestations; watch-pr no longer surfaces stale `failed`): MET — github claim.js now 3 calls (cmdFinalize + 2 watch-pr); RED→GREEN regression proves it.
- AC3 (applied across editions byte-identical claude↔codex + forge ports; npm test green all four): MET.

## Documentation
- CHANGELOG.md [Unreleased] ### Fixed entry added (notes the user-facing Claude CLAUDE.md template wording change).
- doc-updater SKIPPED with reason: no public API/schema/setup/architecture change — Fix 1 is prose cleanup in Codex skills, Fix 2 is internal attestation-call wiring (receipt schema unchanged). doc-updater write targets (docs/) are outside the finalize node write-set; CHANGELOG covers the user-visible change.

## Documentation Docking: DOCKED — all 14 changed files reflected in CHANGELOG; no other doc class impacted.

## Closure Decision Scan
- In-scope work complete (both fixes, G1 verdict: pass / findings_blocking: 0).
- Non-blocking findings: R1 (out_of_scope — gitlab/gitea Claude command cards correctly reference resolve-agent-model). R2 (pre_existing — gitlab/gitea sink-merge lack checkDispatchAttestations, a #280 forge-port gap outside this diff). R2 recorded in CHANGELOG as a follow-up; recommend a dedicated follow-up issue (surfaced to user — issue creation is a user-owned roadmap action, not auto-filed).
- #286 is safe to close: no unresolved in-scope work.

## Status: READY FOR FINAL GIT GATE (sink: merge, branch workflow/issue-286)
