verdict: pass
findings_blocking: 0

# G1 Code Review (re-review after plan-repair) — issue #291

Scope: complete uncommitted working-tree diff, exactly 10 files (6 production
in 3 editions + Claude/Codex plugin pair + 2 test files). Post-dominates both
the `harden` (base fix) and `harden-forge` (port mirror) nodes.

## Fix correctness (R1/R2/R4) — CONFIRMED

- R1 (runSealMember idempotency): guard `if (member.sealed) return {result:'ok',
  ...alreadySealed:true}` placed at the top of runSealMember BEFORE readFile/
  sealOne, so a repeat seal appends no second compliance row. Verified by test
  asserting exactly ONE `tdd-guide (v1)` row after double-seal.
- R2 (runOpenBatch baselines-first): all N baselines recorded BEFORE the ledger
  flip + plan write. On any baseline failure the function returns refuse having
  made ZERO plan/ledger/manifest mutation (no orphan). Comment honestly scopes
  the residual non-atomicity (plan-write → manifest-write gap). Verified by test
  asserting no in_progress rows and no manifest on baseline failure.
- R4 (unsealed-subset predicate): crossCheckStatus (parallel-batch:215) and
  runOrient (adaptive-node:399) both filter to `!m.sealed` before the member-set
  equality vs in_progress rows. Correctly handles partial-seal crash-resume
  (sealed member is `complete` in ledger, removed from comparison set) and the
  full-seal terminal state (empty==empty). Verified at both sites (R4a/R4b).

## Cross-edition mirror integrity — CONFIRMED

- Claude↔Codex byte-identical pair in sync: validate-script-sync.js → OK
  (18 common scripts + 7 byte-identical file group).
- gitlab/gitea ports received the EXACT logic edits: the three patched-function
  regions of parallel-batch hash-identical (md5) across base + gitlab + gitea;
  the R4 adaptive-node line is character-identical across base + both ports.
  Per-file differences are confined to edition-renamed require()/path strings
  OUTSIDE the patched functions.
- Each R-fix present once in every edition (R4 crossCheckStatus, R1
  alreadySealed guard, R2 BASELINES-FIRST marker). Pre-existing runSeal `pending`
  filter (line 501) untouched.

## Scope + green — CONFIRMED

- Exactly 10 tracked files modified; only untracked path is the expected
  kaola-workflow/issue-291/ state dir. No scope creep.
- All editions green: npm test exit 0; direct run = 4/4 contract validators OK,
  5/5 walkthroughs passed (codex + gitlab x2 + gitea x2), 0 failures.
  Unit: parallel-batch 86 assertions, adaptive-node 138 assertions.
- Plan-repair legitimacy: harden-forge role=implementer is correct (mechanical
  port mirror; no edition-level unit harness exists for these functions). Linear
  harden → harden-forge → code-review preserves G1 post-dominance. Ports are
  correctly NOT in any byte-sync group, so parity is a discharged correctness
  obligation, not a script-forced one.

## Findings

(none — clean review)

  Verdict: APPROVE. No CRITICAL or HIGH issues. Zero blocking findings.
