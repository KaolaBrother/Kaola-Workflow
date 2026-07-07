evidence-binding: n6-adversary 6f2a91d98154
verdict: pass
findings_blocking: 0

## Claim Under Test

"The #623/#627/#628 routing-surface debloat in bundle-623-627-628 is behavior-preserving — NO load-bearing routing/dispatch/lifecycle instruction silently dropped, every machine-pinned token survives on all six surfaces, #623/#628 corrections consistent + correct." Baseline: bbdaab92^ (parent of kw-stub; git merge-base HEAD origin/main = 73ca26db, its direct parent).

## Attack 1 — content-diff the debloat (critical): FAILED to refute

commands/kaola-workflow-plan-run.md diff vs bbdaab92^ = 3 hunks (ladder restub 25→7, FANOUT_CAP #623 rewrite, speculative restub 15→5). Enumerated every removed line, verified its live home:
- Ladder block removed items (tier-derived budgets 40/20/role-default-never-null; never-improvise-ceiling; rung1 SendMessage+changed-file-list; rung2 ~5min grace + partial-evidence ask; rung3 reclaim/inline-redo-LAST; 4-token delegation_outcome vocabulary + never-free-text; in-place-writer non-interruptible-no-exception; interruptible→isolated-leg; atomic leg discard; reconcile-running-set + writerHalt + revert-overflow/repair-node/consent-halt) — ALL verified present in docs/plan-run-cards/join-protocol.md (§1/§3/§4). 7-line stub retains operative inline summary + <!-- CARD: join-protocol --> pointer. The 3 SKILLs correctly NOT restubbed (zero ladder hunks; retain pinned full inline Join Protocol + <!-- PIN: join-protocol --> + wrapped "NEVER interrupted before its wait budget expires").
- Speculative block removed items (structural-net; no-decision:ask; full eligibility set; speculativeCloseGuard; read-KEEP-vs-write-teardown asymmetry; discard telemetry; consent-remains-authorable) — ALL verified present in docs/plan-run-cards/speculative-open.md (§1/§4/§5/§6 + Authoring). 5-line stub keeps three-tier/auto-default/no-op-flag/serial-DEGRADED behind <!-- CARD: speculative-open -->.
- Cross-surface: gitlab==gitea plan-run command diffs byte-identical; 3 SKILL diffs byte-identical; canonical-vs-forge diff-of-diffs differs only in hunk offsets. Finalize: Goal Attestation enum+rationale+example moved word-for-word to docs/api.md (line-by-line compared; only addition = accurate grounding sentence vs computeGoalCheck/closure-contract); "Raw output goes to:" reunited (moved not dropped); fix#5 section-cite verified vs real tree (agents/contractor.md:117 "### Step 8a - Artifact Mirror"); 3 finalize SKILL diffs identical except 1 hunk-offset. workflow-next: pure resolver-prefix inserts, zero removals. Full inventory: committed = exactly 19 declared surfaces + 3 leg evidence; uncommitted = n4's 2 files + orchestrator README.md R1 fix. No strays, no conflict markers.

## Attack 2 — pin survival non-vacuous: FAILED

test-route-reachability.js (260 assertions, exit 0) + all 4 contract validators (workflow/codex/gitlab/gitea, exit 0) on the CURRENT worktree (incl n4 + R1 fix). Independent whitespace-normalized includes (catches line-wrapped pins): T5, T5b (fork_turns:"none", reasoning_effort: dispatch.codex_reasoning_effort, fresh child-session effort proof, codex_effort_override_unavailable), T8 (--write-overlap-consent), T9 (marker + --speculative-consent), T12 (all 7 literal strings from test source), T14 (NAMED teammate + one-nudge sentence), T15 (KAOLA_GATE_WINDOW_FENCE=0) — all present on all 6 plan-run surfaces; T6+T10 on all 6 finalize; T7 (result: escalate)+T4 on all 6 workflow-next; ladder tokens in the 3 command stubs. Zero MISSING — validators not vacuous.

## Attack 3 — #623 consistency + #628 correctness: FAILED

- #623: command bullet (:251-258), workflow-planner.md (:76-80), frontier-batch.md §6 (:227-232) state SAME semantics (rolling open-ready top-up = READ only; WRITE > cap = fixed group waves, membership/write_union/baseline fixed at formation, each wave own merge+barrier, next=NEW group). Command adds write_node_exclusive + makespan — strict superset, no contradiction.
- #628 AC: grep -ri across docs/plan-run-cards/ shows ZERO consent-only default-tier framing. README.md:17 (R1 fix) now three-tier (auto default-on / consent opt-in / off serial) — correct+complete; docs/plan-run-cards/README.md matches /^docs\// allowband (isBarrierInvisible plan-validator.js:220) so the out-of-write-set fix cannot trip unattributed_change. (Non-blocking: speculative-open.md H1 title "auto | consent" without off — auto first, body covers off; not consent-only-default, outside write sets.)
- #628 freeze-legality EXECUTED both directions: minimal 4-node plan with declared_write_set api/routes.js / cli/main.js → result:"in-grammar" exit 0; same with old api/ / cli/ → result:"refuse" reason:"plan_invalid" dir-shaped errors on both, exit 1. Proven by execution.

## Attack 4 — PROVENANCE_BAN + #627-partial: FAILED

Added-lines-only grep (committed range + worktree diff) across commands/, plugins/, agents/ for #NNN / D-NNN-NN / INV-NN / ADR-: zero matches. fix#2 correctly ABSENT: turn_context/fork_turns/codex_effort_override_unavailable still resident in Claude command (:225-235); #### Teammate-Mode Dispatch (:241) + wrapped NAMED teammate still resident in Codex SKILLs — descoped by design. Walkthrough smoke green.

## Could NOT find
No removed instruction lacking a live card home; no missing pin under whitespace normalization; no cross-surface contradiction; no freeze-illegal example; no provenance token on an added agent-facing line. Covered every removed hunk on all 19 committed surfaces + 3 uncommitted files, via execution not inspection.

## Verdict
NOT-REFUTED (confidence: high) — debloat is content-covered, pin-complete, consistent; #628 corrections proven by execution; R1 README fix correct+complete+attribution-safe. verdict: pass
