evidence-binding: n6-finalize 88399f484844
node: n6-finalize
role: finalize (main-session-direct sink)
compliance: main-session-direct

## Finalize — bundle-629-637 (#629 edition-guard net + #637 fn-closure-audit hardening)

### Script-enforced barrier (4 gates)
- --resume-check: pass
- --gate-verify: pass (n3-review + n4-adversary post-dominate the 2 code legs, both complete)
- --barrier-check: pass (0 errors, 0 unattributed)
- --verdict-check: pass (n3-review verdict:pass + n4-adversary verdict:pass — n4 CHANGE-gate covered)

### Chain-receipt gate (self-host, UNWAIVED)
- kaola-workflow-run-chains.js --project bundle-629-637: claude/codex/gitlab/gitea ALL exit 0, accepted_red=false.
- NO waiver (#635 fixed). headSha 28660428 == HEAD. --finalize-check: pass.

### Run-gap sweep
- gap-sweep sweptClasses: [] (empty); --check clean.
- No in_run_repair (all nodes passed first-try, no reopen), no deferred_red_chain (unwaived).
- Run gaps (finalization-summary): R1 (edition-sync --check asymmetry, pre-existing) → filed #638;
  R2 (checkManifest whole-file scoping, pre-existing) → noise; n3 R0 → noise (clean review).

### Both gates
- n3-review (code-reviewer fable): verdict pass, 0 findings; ran the FULL four chains green.
- n4-adversary (adversarial-verifier fable, CHANGE-gate): verdict pass, 0 blocking; 7 live plants all correct
  (repo byte-clean); every guard bites on real drift; #637 token reds the exact historic vacuous-gut. R1→#638.

### Production validation
- #633 lane-group fix RE-VALIDATED (4th clean group this session): n1-guards ∥ n2-manifest octopus-merged
  (kw-synth f5c502a6) to group_passed, synthesized:true, NO manual pre-seed.

### #637 closed loop
The fn-closure-audit vacuity was surfaced by #630's OWN change-gate adversary — the workflow's self-review
generated its own follow-up, fixed + re-verified in the same session.

### Implementation commit
- Legs auto-committed via the synthesizer (kw-synth f5c502a6); 28660428 = the 2 ADRs + CHANGELOG (finalize).

goal_check: satisfied (KAOLA_GOAL set)
verdict: pass
findings_blocking: 0
