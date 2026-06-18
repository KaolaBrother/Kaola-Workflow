evidence-binding: n3-review 3cb2e082e90d
verdict: pass
findings_blocking: 0

# n3-review — G1 code-review gate for issue #522

Reviewed the accumulated branch diff (all uncommitted; HEAD === origin/main).
20 files: n1 = 4x claim.js + root walkthrough + root test-claim-hardening +
2x forge walkthrough fixtures + 2x forge workflow-scripts tests; n2 = 10 prose
surfaces (4x contractor, 3x finalize command, 3x SKILL.md).

## Adversarial checklist — all PASS

1. Gate precedes the commit, both paths — PASS. Gate at claim.js:2063-2092,
   `return` on refusal, BEFORE archiveProjectDir (2093, the rename), in-place
   worktree removal (2174), and keep-worktree `chore: archive` commit (2470).
   Unconditional (outside any keepWorktree branch).
2. Fail-closed — PASS. Any non-`pass` validator result -> output({result:refuse,
   reason:finalize_gate_unverified, inner_reason, operator_hint}, 1) + return.
   output() sets process.exitCode=1. Carries inner reason + operator_hint.
3. No bypass flag — PASS. No --skip-receipt-check/--no-verify added.
4. Reuses existing --finalize-check — PASS. Shells unchanged plan-validator
   --finalize-check --json (dual-mode). plan-validator.js + run-chains.js
   UNCHANGED (git diff --stat empty).
5. Plan-absent N/A — PASS. Guarded by fs.existsSync(livePlanPath); no plan ->
   skip -> proceed. Scenario C proves a non-adaptive finalize succeeds.
6. Cross-edition byte-fidelity — PASS. claude vs codex claim.js ZERO DIFF.
   gitlab/gitea ports identical modulo forge noun (validator script name only),
   forge-neutral (no gh/glab literal). Both forge validator scripts exist.
7. RED-first test bites — PASS. test-claim-hardening Scenario A asserts non-zero
   exit + reason==finalize_gate_unverified + HEAD unchanged (no archive commit).
   That reason string is produced ONLY by the new gate; pre-fix returned exit 0
   status:closed. 103 assertions pass (real exit 0).
8. Fixtures faithful — PASS. Scenario B seeds a real chain-receipt.json bound to
   actual HEAD, all-green chains. Root + forge walkthroughs seed real
   final-validation.md (verdict: pass) + initGitRepo for the attribution sweep.
   No gate disabled. The forge KAOLA_ENABLE_ADAPTIVE='0' is a #515 guard, not a
   disabler.
9. n2 prose consistency — PASS. contractor.md Step 8b describes gate fail-closed
   before archive rename w/ finalize_gate_unverified; Step 8c flips run-chains
   ownership to orchestrator (subagent VERIFY-OR-FAIL-CLOSED), lists
   chains_unverified/stale/red. route-reachability + all 4 contract validators +
   edition-sync GREEN. Forge prose forge-neutral.
10. Scope — PASS. All 20 files within n1(12) U n2(10). Only untracked item is the
    project-local .cache evidence dir. No stray files.

## Codex-twin propagation probe (the discriminating check)
The codex chain runs plugins/kaola-workflow/scripts/simulate-kaola-workflow-
walkthrough.js (separate file, NOT in this diff). Its finalize fixtures
(issue-284 via startup, issue-333) write NO workflow-plan.md (cmdStartup/Bootstrap
never write PLAN_FILE), so the gate is N/A there -> no receipt fixture needed ->
codex chain unaffected. The root walkthrough got the +46 receipt fixture because
it DOES exercise an adaptive finalize. No sibling-site drift.

Verdict: APPROVE. Clean, surgical, fail-closed, cross-edition faithful, well-tested.
Note: the orchestrator runs the full 4-chain gate; this review ran only fast
read-only checks (claim-hardening, route-reachability, 4 contract validators,
edition-sync — all green).

## Uncovered-finalize-fixture probe (item 8, advisor-prompted sibling-site sweep)
Gate keys strictly on fs.existsSync(livePlanPath) (PHYSICAL workflow-plan.md),
not on KAOLA_ENABLE_ADAPTIVE or any state-file field. Swept every finalize call
in test files NOT in the diff that the claude/forge chains run:
- scripts/test-bundle-finalize.js (claude chain, NOT in diff): multiple finalize
  calls incl. --keep-worktree, but writes NO physical workflow-plan.md (the
  `- workflow-plan` at L123 is a ## Pending Gates STATE FIELD, not a plan file;
  state declares workflow_path: adaptive but never materializes the plan). Every
  finalize there -> gate N/A -> proceeds. No fixture needed. Unaffected.
- plugins/kaola-workflow-{gitea,gitlab}/scripts/test-*-workflow-scripts.js: the
  only finalize subcommand is the keep-worktree 'finalize-project' (gitea L1022 /
  gitlab L993), set up via writeState() which writes ONLY workflow-state.md (no
  plan file). The plan-file writes (L3805+) target DIFFERENT validator-test
  project dirs, never the finalize target. Gate N/A -> finalize proceeds ->
  archive assertions pass. The KAOLA_ENABLE_ADAPTIVE='0' addition is a #515 guard
  for the file's OTHER non-finalize tests; it cannot and need not gate the
  file-existence check. Unaffected.
CONCLUSION: fixtures were added EXACTLY where the gate fires (root walkthrough
adaptive finalize; gitea/gitlab walkthrough consumer-mode finalize). Every
plan-absent finalize correctly needs none. Faithful propagation, NOT a
sibling-site gap. Item 8 now verified across every named file. verdict: pass holds.
