# Planner Output: issue-42 — Remove /workflow-next-pr + Prompt-Intent + Auto-Fallback

## Selected Approach: B — Structured receipt + claim.js sink-fallback subcommand

### Approach A — Minimum-touch (prose-heavy)
- Summary: exit 3 in sink-merge.js; Phase 6 prose scrapes stderr, writes state mutation inline
- Pros: smallest script delta; no new claim.js subcommand
- Cons: stderr scraping brittle; state mutation duplicated across dual prose copies; hard to test
- Risk: High (prose-drift risk; complex bash in dual-copy Phase 6)
- Complexity: Low script, High prose

### Approach B — Structured receipt + claim.js sink-fallback (RECOMMENDED)
- Summary:
  - sink-merge.js: pre-flight git push --dry-run BEFORE local FF merge; classify stderr → reason token; write .cache/sink-fallback.json; exit 3
  - kaola-workflow-claim.js: new cmdSinkFallback subcommand atomically rewrites ## Sink block to sink: pr + sink_fallback_reason: R
  - Phase 6 prose (dual copy, ~10 lines each): on exit 3, read receipt, call claim.js sink-fallback, dispatch sink-pr.js
- Pros: classification stays where error observed; state mutation in claim.js (correct owner); structured receipt testable; Phase 6 prose changes minimal and symmetric
- Cons: one new claim.js subcommand (~40 lines); adds receipt file
- Risk: Low (fits existing architecture; parity validator covers both scripts)
- Complexity: Medium script (additive), Low prose

### Approach C — Sink-merge invokes sink-pr internally (REJECTED)
- Summary: sink-merge.js detects merge-impossible and directly calls sink-pr.js
- Cons: mixes two concerns; pivot invisible to Phase 6; violates single-responsibility
- Risk: High
- Complexity: Medium script, Zero prose — but wrong shape

## Implementation Phases (17 steps total)

Phase 1 (Script changes):
1. Add sink_fallback_reason field plumbing to kaola-workflow-claim.js (buildSinkBlock/buildLockData)
2. Add cmdSinkFallback subcommand to kaola-workflow-claim.js
3. Add merge-impossible classification + pre-flight to kaola-workflow-sink-merge.js
   - preFlightPushable(): git push --dry-run before FF merge
   - classifyMergeError(stderr): branch_protected|non_fast_forward|permission_denied|null
   - Write .cache/sink-fallback.json {reason, observed_step, observed_at, stderr_excerpt}
   - Exit 3 only for known reasons; exit 1 for transient
4. Mirror both scripts to plugins/

Phase 2 (Phase 6 dispatch):
5. Wrap sink dispatch in commands/kaola-workflow-phase6.md: on exit 3 → read receipt → sink-fallback → sink-pr.js
6. Mirror to plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md

Phase 3 (Intent capture + deletion):
7. Add "Startup Step 0a — PR Intent Capture" to commands/workflow-next.md
8. Mirror to plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
9. Delete commands/workflow-next-pr.md and plugins/.../kaola-workflow-next-pr/SKILL.md

Phase 4 (Validators + docs):
10. Update validate-workflow-contracts.js: remove L299-301; add new assertions
11. Remove 'kaola-workflow-next-pr' from validate-kaola-workflow-contracts.js skills array
12. Mirror validate-workflow-contracts.js to plugins/
13. Update README.md (~L181, ~L414-418)
14. Update CHANGELOG.md
15. Scrub stale design-doc references in codex-parity/phase2-ideation.md and cross-machine-followups/phase2-ideation.md

Phase 5 (Simulator):
16. Add Epic Case 18: 18A (pre-flight pivot), 18B (orchestrated pivot), 18C (transient no-pivot)
    - Use KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE env var for deterministic simulation
17. Intent-capture wire tests (--sink pr → sink: pr in state; no flag → sink: merge)

## Canonical Allow-List for sink_fallback_reason
- branch_protected: push rejected by branch protection rule (GH006)
- non_fast_forward: target moved; rebase needed but push window closed
- permission_denied: token lacks push permission

Non-triggers (must NOT pivot):
- Rebase conflict, network failure, rate limit, worktree dirty, test failure

## Local-Main Pollution Wrinkle
- Primary mitigation: preFlightPushable() runs git push --dry-run BEFORE local FF merge
- Defense in depth: if push fails after local merge → git reset --hard origin/main, then exit 3

## Missing Facts (from planner)
1. git push --dry-run behavior against branch protection on GitHub Enterprise — confirm in sandbox
2. Phase 6 exit-code propagation through agent slash-command pipeline
3. sink-pr.js tolerance of local main ahead of origin — confirmed OK (never touches main)
4. codex-parity/phase2-ideation.md status — annotate vs rewrite decision

## Items NOT to Build
- No set-sink mid-workflow subcommand
- No GitHub label intent
- No per-repo default sink override
- No draft-PR / stacked-PR
- No reverse pivot (pr → merge)
- No NLU keywords in kaola-workflow-claim.js (agent prose only)
