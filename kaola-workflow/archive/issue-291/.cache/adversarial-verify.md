verdict: pass
findings_blocking: 0
finding: id=F1 scope=pre_existing action=follow_up status=deferred severity=low fix_role=none rationale=Single-in_progress with all-sealed-manifest paths diverge between crossCheckStatus (orphan_member_set_mismatch) and runOrient (ok, batch:null, legacy single-node path) — pre-existing structural split not introduced by R4

## Claim Under Test

"The issue #291 change is CORRECT, COMPLETE, and REGRESSION-FREE. It fixes three non-blocking parallel-batch hardening follow-ups, applied across ALL FOUR editions (github/codex/gitlab/gitea):
 - R1: `runSealMember` gained a `member.sealed` idempotency guard so a re-run no longer appends a duplicate `## Required Agent Compliance` row.
 - R2: `runOpenBatch` reordered to BASELINES-FIRST so a mid-loop baseline failure makes ZERO plan/ledger mutation (no orphan) — honestly scoped: shrinks but does not eliminate the orphan window (the plan-write→manifest-write gap remains; not fully atomic).
 - R4: the AC#5 legality gate now compares in_progress against UNSEALED manifest members (`.filter(m => !m.sealed)`) at BOTH coordinated sites — `crossCheckStatus` (parallel-batch.js) AND the `runOrient` gate (adaptive-node.js) — so a legitimate partial-seal crash-resume is no longer misread as `orphan_multi_in_progress`, while genuine member-set mismatches still flag orphan.
 The 10-file change is: the 6 base files (2 byte-identical Claude↔Codex PROD pairs + 2 single-source tests) plus the 4 gitlab/gitea edition-named port mirrors. All unit tests + all 4 editions' contracts/walkthroughs are green; R3 is explicitly out of scope."

## Disproof Attempt

### R1: `runSealMember` idempotency guard

Attack: attempted to slip a duplicate compliance row by:
1. Calling `runSealMember` on a member with `sealed: true` → confirmed it returns `{ result: 'ok', alreadySealed: true }` and makes ZERO writes.
2. Tested truthy-but-not-strictly-true sealed values (`sealed: 'true'`, `sealed: 1`) — all correctly trigger the guard (JS truthy check `if (member.sealed)` catches all these).
3. Called `runSealMember` twice on the same member using a real filesystem fixture — confirmed exactly ZERO compliance rows were added on the second call.

Guard returns before any mutation: the code path is `if (member.sealed) { return { result: 'ok', ... alreadySealed: true }; }` — this is a hard early-return before `readFile(planPath)` and before calling `sealOne`.

No bypass path found.

### R2: BASELINES-FIRST ordering

Attack: constructed a scenario where commit-node --start fails for the SECOND member (v1 baseline succeeds, v2 baseline fails):
- Result: `{ result: 'refuse', reason: 'baseline_failed', nodeId: 'v2' }`
- Plan on disk: both v1 and v2 remain `pending` — no ledger flip occurred
- Manifest: NOT written
- Stray baseline side-effect confirmed: v1's barrier-base file IS written before v2 fails. This is the documented honest-scope residue — the claim explicitly says "the plan-write→manifest-write gap remains; not fully atomic." The stray baseline is idempotent (overwritten on retry).

NEW FAILURE MODE checked: when the 2nd baseline fails, the first member's baseline-marker file IS recorded in .cache. This is a known, documented, non-blocking side-effect. It does NOT cause an orphan ledger state (plan is unmodified). A subsequent `open-batch` re-call will overwrite those stray baseline markers idempotently.

### R4: unsealed-subset predicate correctness at both sites

Site (a) — `crossCheckStatus` in parallel-batch.js:
- Partial-seal: `members=[{a,sealed:true},{b,sealed:false},{c,sealed:false}]`, `inProgressIds=['b','c']` → `valid: true, orphan: false` (correct)
- Genuine orphan (stray in_progress): `inProgressIds=['x','y']` vs unsealed `['b','c']` → `valid: false, orphan: true` (correct)
- Stray in_progress not in manifest: `inProgressIds=['b','stray']` vs unsealed `['b','c']` → orphan (correct)
- Missing unsealed member from in_progress: `inProgressIds=['b']` vs unsealed `['b','c']` → orphan (correct)
- All sealed + empty in_progress: `setsEqual=(0===0)=true` → `valid_batch` (edge case; semantically correct for a sealed-state batch)
- P6c pre-existing test: members with NO `sealed` field (undefined) — `!m.sealed = !undefined = true` → included in unsealed set, mismatch still flagged orphan (correct)

Site (b) — `runOrient` AC#5 gate in adaptive-node.js:
- Partial-seal crash-resume: plan has `a=complete, b=in_progress, c=in_progress`, manifest has `a=sealed, b=unsealed, c=unsealed` → `result: ok`, `batch != null`, NOT refused as orphan (correct)
- T20d mismatch scenario: manifest `[impl-core unsealed, review unsealed]` with `in_progress=[impl-core, impl-other]` → `refuse, orphan_multi_in_progress` (correct regression non-regression)
- `batch.members` output includes ALL 3 members (sealed+unsealed) for visibility while AC#5 comparison uses only unsealed

Set vs sorted-array equivalence (confirmed, not overclaimed): For the inputs that reach the unsealed-filter comparison, both sites produce the same valid/invalid determination. Set-based (`runOrient`) is inherently order-independent; sorted-array (`crossCheckStatus`) is made order-independent by explicit `.sort()`. Out-of-order inputs tested — both agree.

Pre-existing structural divergence (not introduced by R4): There is a confirmed single-in_progress path divergence between the two sites, present in both pre-R4 and post-R4 code. Given manifest `[{id:'a', sealed:true}]` and `inProgressIds=['a']` (one stale row, member already sealed):
- `crossCheckStatus`: unsealed=[], ip=['a'] → sets-unequal → `orphan_member_set_mismatch`
- `runOrient`: `inProgressNodes.length=1` (not > 1) → legacy single-node path → `result: ok, batch: null`

This divergence is structural, arising from `runOrient`'s `else if (inProgressNodes.length > 1)` multi-in_progress guard vs `crossCheckStatus`'s manifest-present strict-set check. It exists before and after R4. The R4 change (adding `.filter(m => !m.sealed)`) does not create this divergence and does not change its reachability class — stale single-in_progress with all-sealed manifest is a corrupt/torn state reachable only via crash between barrier and ledger flip. Recorded as `scope=pre_existing, action=follow_up, status=deferred` (F1 above).

### Cross-edition completeness

Verified all 10 files contain the R1, R2, and R4 fixes:
- R1 (`if (member.sealed)` + `alreadySealed: true`): present in all 4 parallel-batch editions
- R2 (`BASELINES-FIRST` comment + `Write the manifest LAST` comment): present in all 4 parallel-batch editions
- R4 (`.filter(m => !m.sealed)` + `R4 (#291)` comment): present in all 4 parallel-batch editions AND all 4 adaptive-node editions

Claude↔Codex byte-identical pair: `diff scripts/kaola-workflow-parallel-batch.js plugins/kaola-workflow/scripts/kaola-workflow-parallel-batch.js` → no output (byte-identical). Same for adaptive-node. GitLab/Gitea ports differ ONLY in the 6-7 filename-rename lines (verified with diff).

`node scripts/validate-script-sync.js` → "OK: 18 common scripts and 7 byte-identical file group in sync."

### Green claim verification

Actually executed (not prose-trusted):
- `node scripts/test-parallel-batch.js` → "parallel-batch tests passed (86 assertions)" EXIT 0
- `node scripts/test-adaptive-node.js` → "adaptive-node tests passed (138 assertions)" EXIT 0
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed" EXIT 0
- `npm test` (full 4-edition suite) → EXIT 0 confirmed (background task b3guy7cj0 completed with exit code 0)

The R4a test (`R4 site (a): crossCheckStatus with PARTIAL-SEAL manifest`) passes. The R4b test (`R4 site (b): runOrient PARTIAL-SEAL`) passes. The R1 test (`R1: runSealMember idempotency`) passes. The R2 test (`R2: runOpenBatch BASELINES-FIRST atomicity`) passes.

### What I could NOT break

- No path through `runSealMember` that re-enters `sealOne` after the guard
- No scenario where the unsealed-filter breaks the genuine-orphan detection
- No missing edition: all 4 carry all 3 fixes
- No test that passes vacuously (R2 test exercises real filesystem, R1 exercises real compliance-row count, R4a/R4b test the specific boundary)
- No divergence on inputs that reach the unsealed-filter predicate (the two-in_progress partial-seal case the claim is about)

The honest-scope caveat on R2 (stray baseline + plan→manifest gap) is accurately stated and does not constitute a false claim.
The pre-existing single-in_progress divergence between sites (F1) was not introduced by R4 and is outside the claim's scope.

## Verdict

NOT-REFUTED (confidence: high)

All three fixes (R1, R2, R4) behave exactly as claimed at their stated scope. All four editions are patched. The Claude↔Codex pair is byte-identical. The full npm test suite exits 0. The honest-scope caveat on R2 is accurately documented. The single-in_progress site-divergence (F1) is pre-existing, not introduced by R4, and is explicitly recorded as out-of-scope/pre_existing.
