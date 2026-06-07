# Node review (code-reviewer, G1) — issue #289

Post-dominates the single code producer (implement). Reviewed the #289 fail-open fix.

Findings:
1. Correctness: gate-relevant values (scope/action/status/fix_role) lowercased at the single
   assignment site; scope/action/status are exactly the unresolvedInScopeFixes predicate fields, so
   the blocking set is complete. Mixed-case In_Scope/Fix/Open now yields length===1 (blocks).
   fix_role is only cosmetic in plan-validator.js:396 (never compared) — lowercasing it is harmless
   mirror-consistency.
2. Scope: case-normalization ONLY, no vocabulary clamp added (unknown values still parse + don't
   block — the explicit out-of-scope non-behavior preserved). Non-gate keys (id/severity/raw/unknown)
   keep original case.
3. 4-edition byte-identity green: all 4 copies md5 6206e9bb89cb9bb2c268c8fbc8d49503; validate-script-sync
   passes ("17 common scripts and 7 byte-identical file group in sync").
4. Test quality: regression asserts the gate BLOCKS (length===1) on mixed-case, correctly placed in
   testAdaptiveVerdictCheck #279 block.
5. Write-set clean: exactly the 4 schema copies + simulate-workflow-walkthrough.js. CHANGELOG handled
   at finalize (outside frozen write-set, per #279 precedent).
6. npm test fully green across github/codex/gitlab/gitea editions incl. contract validators.
Repo-wide consumer check: every parseNodeFindings consumer feeds unresolvedInScopeFixes (wants
lowercase) + the cosmetic projection; no consumer expects original-case values. No regression risk.

Severity tally: CRITICAL 0, HIGH 0, MEDIUM 0, LOW 0. APPROVE.

verdict: pass
findings_blocking: 0
