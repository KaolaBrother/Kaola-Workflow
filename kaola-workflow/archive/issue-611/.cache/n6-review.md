evidence-binding: n6-review c98bf4fa6b67
verdict: pass
findings_blocking: 0
finding: id=R1 scope=out_of_scope action=note status=open severity=low fix_role=none rationale=Two parsers for the delegation_outcome token diverge in grammar — schema.parseDelegationOutcome uses [A-Za-z_]+ while the ENFORCING checkEvidenceShape inline check (adaptive-node.js:959) uses \S+. They agree on all 4 valid tokens and on alpha/underscore invalid tokens; they diverge only on tokens with digits/punctuation, where the gate is STRICTER (fail-closed refuse) and the exported helper is laxer (treats as absent -> completed). No enforcement path consumes the helper, so no correctness hole; latent duplicate-parser smell only.
finding: id=R2 scope=in_scope action=none status=resolved severity=high fix_role=none rationale=AC3 writer-reconcile fail-open (resultless/unrecognized barrier -> silent adopt) was REFUTED by the n4 adversarial gate and repaired to positive-confirmation at 7cfb48b0; re-verified NOT-REFUTED. Confirmed present and correct at HEAD 778bffa8; +6 tests (T611-AC3 i-vi) exercise every crash shape. Non-blocking, recorded for provenance.

# n6-review — issue-611 Codex dispatch join protocol — VERDICT: pass (APPROVE)

Reviewed git diff f19bc181..HEAD (37 files, +3391/-45). READ-ONLY on repo; only write is this evidence file.

## Machine gate results (Part 2)

Four-chain receipt (kaola-workflow/issue-611/.cache/chain-receipt.json), judged from CONTENT:
- headSha: 778bffa800e80cdfed5dd9d08c3bd3ca733a9f6d == git rev-parse HEAD — MATCH
- claude  exitCode 0, timed_out false
- codex   exitCode 0, timed_out false
- gitlab  exitCode 0, timed_out false
- gitea   exitCode 0, timed_out false
- Run: KAOLA_RUN_CHAINS_CONCURRENCY=serial (mandatory on this box), default timeout unmodified; background process exited 0.

Standalone gates (real exit codes captured directly, not via a masking pipe):
- node scripts/sync-opencode-edition.js --check -> exit 0 (15 agents + 11 commands + 1 plugin in parity; no --write needed)
- node scripts/test-opencode-edition.js -> exit 0 (499 assertions)
- node scripts/test-install-model-rendering.js -> exit 0 (Install model rendering tests passed)

## AC checklist (Part 1) — all 7 MET

- AC1 (Join Protocol on all 3 Codex SKILL packs, A-F): MET. Codex Join Protocol section is BYTE-IDENTICAL across the 3 codex SKILLs (extracted + diff'd), carries <!-- PIN: join-protocol -->, encodes A(wait budget)/B(long-poll drain-all)/C(escalation ladder + delegation_outcome)/D(writer kill-safety + halt-then-reopen closure)/F(frontier discipline + slot awareness). No timeout/patience number left to improvisation.
- AC2 (wait_budget_minutes on every dispatch card): MET. schema.waitBudgetMinutes(model) sits beside dispatchEffort and routes through the SAME normalizeTier — legacy opus->reasoning->40 / sonnet->standard->20 verified (T611-AC2). Spread into the single buildDispatch builder (all 3 openers: open-next @2026, close-and-open-next @2509, open-ready @4514). Never null: absent/blank/out-of-vocab -> concrete role_default 20. Walkthrough asserts a positive-integer budget + valid source on the open-next card; unit tests cover reasoning/standard/legacy/none.
- AC3 (reconcile writer kill-safety, typed verdict, fail-closed): MET. classifyWriterReconcile is POSITIVE-CONFIRMATION post the n4 adversarial fix (7cfb48b0): adopt ONLY on explicit result pass|ok (or vacuous no_barrier_base); refuse+outOfAllow -> halt/write_set_overflow + paths; resultless {exitCode:N} or unrecognized token -> halt/barrier_unverifiable; null/non-object -> halt/barrier_unavailable. Non-destructive (never auto-deletes); writerHalt hint surfaced. +6 tests (T611-AC3 i-vi) incl. real SIGKILL/non-JSON/missing-validator subprocess shapes. api.md truth table matches the classifier row-for-row; reconcile output field names (rolledForward/rolledBack/closedDropped/staleDropped/reconciled) verified real. AC3 literal adopt|revert|halt wording -> shipped adopt|halt from reconcile with revert retained as the orchestrator's pre-existing revert-overflow step; consistently documented across ADR/CHANGELOG/api.md/card with sound reuse-before-adding + non-destructive rationale. Substantively MET.
- AC4 (fork_turns none unconditional): MET. Mandated on v2 AND v1 dispatch across all 6 surfaces (on EVERY dispatch, tiered or not + the unconditional mandate applies identically to this dispatch mode); the retired only-for-tiered-nodes qualifier is banned by assertNotIncludes in all 4 validators.
- AC5 (typed delegation_outcome): MET. Optional column-0 token, closed 4-word vocabulary, absent=>completed (back-compat), unknown=>typed refusal (missingTokenClass: delegation_outcome). checkEvidenceShape places the check BEFORE the role branches AND the universal n/a carve-out (verified adaptive-node.js:958-965 precedes main-session-gate @970 and n/a @1020) so it governs every role uniformly and fails closed regardless of node resolution. Walkthrough (simulate-workflow-walkthrough.js) exercises completed (absent-default + explicit) AND an interrupted path (interrupted_unresponsive) + the unknown-token refusal.
- AC6 (preflight/installer bounds report): MET. deriveMultiAgentV2Bounds emits 6 fields (max_concurrent_threads_per_session[_source], effective_subagent_width, min/max/default_wait_timeout_ms); honest observed_default(4)/config/not_applicable/n/a labeling; report-only (only writes stdout, never touches exitCode — verified in both preflight CLI and installer render blocks); version-guarded (0.142.5 note + agents.max_threads-invalid-under-v2 caveat) same as #598. Installer surfaces MULTI_AGENT_V2_BOUNDS_NOTE documenting the recommended [features.multi_agent_v2] config. Full end-to-end (fresh + v2-enabled installer stdout) + pure-unit coverage in the codex walkthrough.
- AC7 (six-surface propagation + chains): MET. fork_turns + join-protocol prose pinned across all 6 surfaces by the 4 contract validators (claude: command + codex SKILL; codex: all 6; gitlab/gitea: own command + SKILL); all 6 CARD/PIN: join-protocol markers present; both referenced cards (join-protocol.md, speculative-open.md) exist; README + card table docked. Walkthrough + all four chains green.

## Cross-edition parity (#307)

- kaola-workflow-adaptive-schema.js byte-IDENTICAL across canonical + both forge ports (drift anchor holds); waitBudgetMinutes + parseDelegationOutcome present in all 4.
- classifyWriterReconcile + barrier_unverifiable (x2) + waitBudgetMinutes (x2) present in all 4 adaptive-node copies (canonical + codex twin + gitlab/gitea forge-renamed ports).
- deriveMultiAgentV2Bounds + effective_subagent_width present in all 4 codex-preflight copies; root == claude-plugin byte-identical.

## Code quality / security

- No secrets, hardcoded credentials, eval, or shell-injection surfaces in the added lines. New console.log lines are legitimate installer/preflight report output matching the pre-existing dispatch-posture print pattern (not debug logging).
- Docs accuracy verified against code: api.md dispatch-card shape, classifier truth table, reconcile JSON shape, and the 6-field bounds report all match the implementation. ADR D-611-01 is thorough and transparent (documents the in-run adversarial refutation + repair, and the AC3-wording interpretation).
- CHANGELOG [Unreleased] Added entry is complete and accurate (all six arms, the fail-open->fail-closed repair story, non-goals, cross-edition list).

## Verdict

APPROVE (verdict: pass, findings_blocking: 0). No CRITICAL or HIGH issues. All 7 ACs MET; four chains + opencode suite + install-model-rendering all green at HEAD 778bffa8. One LOW non-blocking note (R1: latent duplicate-parser grammar divergence for delegation_outcome, no enforcement-path impact). The one HIGH-class risk (R2: writer-reconcile fail-open) was caught by the n4 adversarial gate and is confirmed resolved at HEAD.
