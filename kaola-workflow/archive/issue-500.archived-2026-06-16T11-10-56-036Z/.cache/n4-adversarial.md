evidence-binding: n4-adversarial db7d3a321a71

# n4-adversarial — verify n2's L1 leg-couple wire

verdict: pass
findings_blocking: 0

Standard adversarial-verify mode (is the CHANGE correct?). Could not construct any counterexample; all 4 claim surfaces survived with EXECUTED + MUTATION evidence. Tree restored byte-identical (only the 5 n2 files modified).

## Claim 1 — coupling prevents #283/#303 (MUTATION-PROVEN non-vacuous)
Backed up canonical, mutated the formation call site (adaptive-node.js:3824) to gate on consent-ALONE (dropped `resolveLegIsolation(process.env) &&`), re-ran → NEGATIVE-A flipped to EXACTLY 3 failures, localized to NEGATIVE-A: the shared-infra group FORMED (group_id lg-A-B, members [A,B], write_union [scripts/aa.js, scripts/bb.js]) with KAOLA_LEG_ISOLATION OFF, while provisioning at :3908 still requires resolveLegIsolation → group formed but NO legs = the exact clobber window. NEGATIVE-B + POSITIVE-E2E stayed green (surgical). Restored; suite green.

## Claim 2 — test traverses REAL relaxation path (PROVEN both directions)
Classifier returns yellow/shared-infra for scripts/aa.js vs scripts/bb.js (vs green for old disjoint ax.js/by.js) → the `if(dj.verdict==='green') continue` short-circuit at plan-validator.js:1895 is NOT taken → formation hits writeOverlapRelaxable at :1896 (shared-infra relaxes only at policy===coarse, :612, + consent + gatePresent). End-to-end validator probe: WITH consent → result:ok + relaxed:[{kind:shared-infra,policy:coarse}]; WITHOUT consent → refuse. Second mutation forcing the formation arg to false → POSITIVE-E2E RED ("laneGroup formed... got undefined") → e2e green genuinely depends on the production forward (Edit A/B), not coincidence.

## Claim 3 — disjoint-green co-open unaffected
Disjoint pairs (green) short-circuit at validator:1895 BEFORE consent is consulted → forwarded value irrelevant for them. D437-OPEN-READY-GROUP, D437-OPEN-READY-FLAG-OFF, FLAG-OFF byte-identity all green in the 1007-assertion run + through restore.

## Claim 4 — edition parity sanity
Leg-couple call line + consent-forward line byte-identical across canonical + all 3 plugin ports (canonical and plugin-claude exact byte twins). No forge-specific vocab (no github/gitlab/gitea/gh/glab branch) — forge-neutral, byte-replicable. (n5 owns full --check; nothing obvious threatens parity.)

CONCLUSION: coupling non-vacuous (mutation), test exercises the real path (classifier verdict + both-direction probe + forced-false RED), disjoint untouched, editions in parity. verdict: pass / findings_blocking: 0.
