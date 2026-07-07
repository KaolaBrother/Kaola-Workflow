evidence-binding: n7-finalize 60630fde1ffb
node: n7-finalize
role: finalize (main-session-direct sink; docs/state only)
compliance: main-session-direct

## Shaping-run finalize — bundle-630-636 (#630 + #636)

READ-ONLY shaping run (Case B). This finalize node is the sink; it writes ONLY docs/state
(both `docs/**` — barrier-invisible allowband). #630 and #636 STAY OPEN — this is a design
CHECKPOINT, not a closure.

### Written (declared write set)
- `docs/investigations/2026-07-08-630-636-routing-generation-seam.md` — the full settled design
  (repaired Candidate D two-layer: manifest presence-guarantee across all 18 surfaces incl finalize
  + byte-generation for plan-run/next; ship #636 first standalone then #630; the corrected #636
  write-set incl the #611-fork SKILL-only split; the by-construction regression battery; flip-premises).
- `CHANGELOG.md` — [Unreleased] ### Documentation entry recording the shaping run + design doc.

### Investigation trail (all evidence in .cache)
- n1-probe-surfaces, n2-probe-machinery, n3-probe-pins (read-only probes, concurrent).
- n4-assume-design (planner opus): candidates A/B/C/D + falsification → recommended two-layer D.
- n5-critique-design (adversarial-verifier fable): RAN the chains; verdict FAIL, findings_blocking 3
  (R1 #636 write-set gap proven four-chain-red; R2 by-construction under-specified; R3 drift-class
  premise + gitea booby-trap). Investigation adversary → verdict-check EXEMPT; findings FED n6.
- n6-converge-shape (planner opus): folded R1/R2/R3 in with line-precise re-verification →
  the settled, buildable design.

### Design outcome
Two sequential build re-plans PENDING: Run 1 = #636 standalone (corrected write-set), Run 2 = #630
two-layer on the fenced base. Both are fresh frozen runs authored from the investigation doc.

### Goal checkpoint
This is the SHAPING half of the bundle. goal_check satisfied by USING the kaola-workflow skills,
delegating the subagents the workflow demanded (3 probes + 2 planner + 1 adversary at fable),
producing + surfacing the design inputs — NOT by the end-state "issues finished." #630 + #636 stay
OPEN for the build runs.

goal_check: satisfied (KAOLA_GOAL set; shaping-run semantics — issues intentionally stay open)
verdict: pass
findings_blocking: 0
