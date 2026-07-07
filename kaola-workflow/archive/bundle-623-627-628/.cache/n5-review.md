evidence-binding: n5-review 2b59c66058eb
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=low fix_role=implementer rationale=628-AC2-residual docs/plan-run-cards/README.md:17 still frames the speculative-open card consent-only ("policy consent -> open-ready --speculative-consent"); the issue-628 AC greps ALL of docs/plan-run-cards/ for consent-only framing of the default tier, so it fails; README.md is in NO node's declared write set in the frozen plan -> needs a bounded repair (write-set extension) with a one-line three-tier reword before n8-finalize closes #628 in full
resolution: id=R1 fixed via main-session trivial-inline-edit — docs/plan-run-cards/README.md:17 reworded to the three-tier framing (auto default-on / consent opt-in / off serial); grep -ri across docs/plan-run-cards/ now shows ZERO consent-only default-tier framing; docs/** is the isBarrierInvisible allowband (plan-validator.js:220) so the out-of-write-set edit cannot trip unattributed_change; n6-adversary independently confirmed the fix correct+complete+attribution-safe

## G1 gate review — bundle-623-627-628 (n1..n4 accumulated diff)

Reviewed: `git diff bbdaab92^..HEAD` (committed legs n1/n2/n3 via synthesizer merge 102b3411) plus the
uncommitted worktree diff (n4: agents/workflow-planner.md, docs/plan-run-cards/frontier-batch.md).

### 1. No load-bearing routing instruction dropped (n1 debloat) — PASS
- Ladder restub (3 command surfaces): the 7-line stub preserves `dispatch.wait_budget_minutes`,
  the escalation-ladder summary (one SendMessage -> ~5-min grace -> reclaim LAST resort), typed
  `delegation_outcome`, and the full writer-kill-safety operative rule (`reconcile-running-set`,
  `writerHalt: true` -> resolve `revert-overflow`/`repair-node`/consent-halt before re-open), and
  points at the live `<!-- CARD: join-protocol -->` marker. `docs/plan-run-cards/join-protocol.md`
  verified to carry the FULL expansion: tier table (40/20/role-default never-null), all 3 ladder
  rungs, the complete 4-token delegation_outcome vocabulary, adopt/halt verdict semantics, atomic
  leg-discard rule. The 3 SKILLs correctly untouched (they carry the pinned full Join Protocol
  inline — the compliant canonical location; `NEVER interrupted before its wait budget expires`
  present, line-wrapped).
- Speculative restub (all 6 surfaces): 5-line stub keeps `speculative_open_policy: auto` default +
  three-tier (auto/consent/off) + `--speculative-consent` no-op-at-auto + serial-waiting-is-DEGRADED,
  behind the intact `<!-- CARD: speculative-open -->` pointer. `docs/plan-run-cards/speculative-open.md`
  verified to carry every removed detail: full eligibility set (disjointness vs live writers, no
  PROTECTED, exact resolvability, non-sink, leg capability, caps), `speculativeCloseGuard` close
  fence, read KEEP-or-discard vs write unconditional-teardown asymmetry, discard telemetry
  (node/role/gate -> provenance log).
- Cross-edition consistency: gitlab==gitea command diffs byte-identical; all 3 SKILL diffs
  byte-identical; canonical matches modulo pre-existing forge divergence.

### 2. Machine-pinned tokens survive on all six surfaces — PASS
`node scripts/test-route-reachability.js` -> "Route-reachability test passed (260 assertions)." exit 0.
All four contract validators pass: validate-workflow-contracts.js, validate-kaola-workflow-contracts.js
(codex), validate-kaola-workflow-gitlab-contracts.js, validate-kaola-workflow-gitea-contracts.js.
Independent spot-checks: T14 `NAMED teammate` present on command (1) and SKILL (1, line-wrapped, found
via newline-normalized grep); T5b `turn_context.effort` still on the Claude command (fix#2 correctly
NOT fenced); T9 marker + `--speculative-consent` in the stub; n1 ladder tokens all in the stub.

### 3. PROVENANCE_BAN — PASS
Grep of ADDED lines only across commands/ plugins/ agents/ (committed + uncommitted diffs) for
`#[0-9]+` / `D-NNN-NN` / `INV-NN` / ADR: zero matches (exit 1). validate-workflow-contracts.js
(which machine-checks the ban) passes. docs/api.md is not a banned surface and its new section
carries no fabricated provenance.

### 4. #623 consistency across the three surfaces — PASS
All three converge on the canonical spec: rolling `open-ready` top-up = READ-frontier only; WRITE
frontier > cap = fixed group waves (membership/`write_union`/baseline fixed at formation; each wave
pays its own synthesizer-merge + group barrier; next wave = NEW group).
- commands/kaola-workflow-plan-run.md FANOUT_CAP bullet (n1, mirrored on all 6; FANOUT_CAP /
  KAOLA_FANOUT_CAP_READONLY tokens kept)
- agents/workflow-planner.md ~:76-80 (n4)
- docs/plan-run-cards/frontier-batch.md section 6 (n4)
No contradictory framing found.

### 5. #628 correctness — PASS with one residual (R1)
- frontier-batch.md section 3 bullet + section 7 table now three-tier (auto default-on no-consent /
  consent opt-in / off serial-DEGRADED); write eligibility (leg-contained) stated at auto.
- Freeze-legal example: `"api/routes.js"` / `"cli/main.js"` — verified against hasUnresolvableEntry
  (plan-validator.js:756-763: trailing-`/` or glob only); both exact paths legal.
- RESIDUAL (R1): docs/plan-run-cards/README.md:17 ("Speculative open (policy consent -> open-ready
  --speculative-consent / discard-speculative)") is a consent-only framing that survives the AC#2
  directory-wide grep (`gh issue view 628` AC: "A grep for 'speculative' across docs/plan-run-cards/
  shows no consent-only framing of the default tier"). n4 correctly did NOT overflow its declared
  write set (README.md is in no node's write set) and disclosed the file in its evidence; the gap is
  a plan write-set omission, not an implementer error. One-line reword needed before #628 closes in full.

### 6. #627 partial scope — PASS
fix#1 (both restubs) / fix#3 (Goal Attestation -> 3-line stub x4 surfaces where the block actually
exists; enum+rationale moved VERBATIM to docs/api.md new "Goal Attestation" section with accurate
computeGoalCheck/closure-contract grounding) / fix#4 (resolver prefix on finalize crash-recovery x3
commands + workflow-next x6 surfaces, forge-flavored, matching each file's own established pattern
— canonical finalize now has 6 kaola_script occurrences) / fix#5 (rot scar "mirrors lines 305-306,
533-534, 565-566" -> section cite of agents/contractor.md "Step 8a - Artifact Mirror" [verified
extant at :117 with the git-common-dir idiom at :124]; "Raw output goes to:" reunited with its path
block, exactly 1 occurrence per command surface) ALL landed. fix#2 (runtime-dead-prose fencing)
correctly ABSENT — cross-runtime blocks verified still resident (descoped per plan; D-627-01 is
n7's deliverable; #627 must close PARTIAL). n2's evidence honestly corrected the plan's surface
count (Goal Attestation exists on 4 of 6, not 6; scars on the 3 commands only) — verified accurate.

### 7. #307 four chains — PASS (clean, unwaived, single run each)
- npm run test:kaola-workflow:claude -> "Workflow walkthrough simulation passed" + parity 61 assertions, exit 0
- npm run test:kaola-workflow:codex -> "Kaola-Workflow walkthrough simulation passed", exit 0
- npm run test:kaola-workflow:gitlab -> "GitLab Codex workflow walkthrough simulation passed", exit 0
- npm run test:kaola-workflow:gitea -> "Gitea Codex workflow walkthrough simulation passed", exit 0
No flake, no retry needed, no --accept-known-red (the #635 fix at 73ca26db held).

### 8. Scope / merge integrity — PASS
Committed diff = exactly the 19 declared surfaces (6 plan-run + 6 finalize + docs/api.md + 6
workflow-next) + 3 leg evidence .cache files; uncommitted = exactly n4's 2 declared files (+ bundle
state scaffolding, untracked). No conflict markers anywhere in the changed trees. Synthesizer merge
102b3411 landed all three legs' content intact (verified per-surface above).

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | note   |

Verdict: APPROVE the code change itself — zero dropped instructions, zero dropped pins, provenance
clean, four chains green. ONE low-severity in-scope residual (R1: README.md:17 vs #628 AC#2) must be
resolved via bounded repair before n8-finalize closes #628 "in full"; everything else is
finalize-ready as planned (#623 full, #627 partial-by-design, #628 pending the one-line reword).
