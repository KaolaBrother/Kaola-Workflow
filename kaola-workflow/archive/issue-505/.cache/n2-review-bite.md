evidence-binding: n2-review-bite f148399b7997
verdict: pass
findings_blocking: 0

finding: id=R1 scope=in_scope action=none status=resolved severity=low fix_role=none rationale=all-asserts-bite-demonstrated-incl-codex-via-sync-gate-byte-perfect-restore

## G1 "enforce the enforcer" gate — n2-review-bite

Post-dominates n1-enforce-coverage. Each new assert was MUTATED to confirm it BITES
(turns the relevant chain RED for the RIGHT reason), then restored byte-perfect. Worktree
confirmed byte-clean: exactly n1's 6 modified tracked files; all 6 diff-empty vs the
pre-mutation pristine snapshot. One mutation at a time; grep-confirmed the pinned substring
genuinely ABSENT before each run (no substring-suffix vacuity); never used `git checkout`.

### Per-item bite-demonstration table

| Item | Mutation | grep of pinned string after mutation | Observed RED | Error names the right pin? | Restored |
| --- | --- | --- | --- | --- | --- |
| 1 — FOREIGN_ARCHIVE contract pin (root) | stripped `BLOCKED: a foreign project's archive band is staged` from `commands/kaola-workflow-finalize.md` | 0 (genuinely absent) | `node scripts/validate-workflow-contracts.js` exit=1 | YES — "must include: BLOCKED: a foreign project's archive band is staged" | byte-perfect (diff empty), re-green exit 0 |
| 1b — bash-block guard-runner (Test E) | made FOREIGN_ARCHIVE guard fail-OPEN (`exit 1`→`exit 0`, line 680) in the EXACT prose Test E extracts | guard now exits 0 on a staged foreign band | `node scripts/test-bash-block-guards.js` exit=1 (1 failed, 18 passed) | YES — "E (#505/#294): Staging Guard exits 1 ...; got exit 0" (ran the REAL extracted bash) | byte-perfect (diff empty), re-green exit 0 |
| 2 — T5 hard-assert | removed `<!-- PIN: frontier unit -->` from ALL SIX #400 surfaces (drives anyHasPin=false → hardened else-branch) | 0 on all 6 | `node scripts/test-route-reachability.js` exit=1 | YES — "T5: <!-- PIN: frontier unit --> not found in any plan-run surface — pin must be present on all 6 surfaces" (the `assert(anyHasPin,...)`, no longer console.warn) | all 6 byte-perfect (diff empty), re-green exit 0 |
| 3 — forge shared-fn pin (gitlab) | renamed `closeIssueIdempotent`→`renamedFnZZZ` in `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (exact substring made absent, no suffix trap) | 0 (genuinely absent) | `node ...validate-kaola-workflow-gitlab-contracts.js` exit=1 | YES — "...kaola-gitlab-workflow-claim.js must include: closeIssueIdempotent" | byte-perfect (diff empty), re-green exit 0 |
| 5 — codex byte-pair sync enforcement | appended a divergence marker to the mirror `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` so it is no longer byte-identical to root | mirror diverged from root | `node scripts/validate-script-sync.js` exit=1 | YES — "Out of sync (scripts/ vs plugins/kaola-workflow/scripts/): - validate-workflow-contracts.js" | byte-perfect (diff empty), byte-pair identical again, re-green exit 0 |

All asserts BITE. None is vacuous.

### Codex ITEM-1 mechanism — corrected after verification (the advisor caught my first, wrong, justification)

My initial run invoked `node plugins/kaola-workflow/scripts/validate-workflow-contracts.js` directly and saw exit 1
at line ~164 ("phase1.md missing"). My FIRST note wrongly called this a "cwd artifact resolved by the npm chain."
That was wrong and unverified. The actual, verified mechanism (read from `package.json` + `validate-script-sync.js`):

- `test:kaola-workflow:codex` runs `validate-script-sync.js && validate-kaola-workflow-contracts.js && <codex walkthrough>`.
  It NEVER invokes the mirror `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` standalone.
- That mirror resolves its `root` via `__dirname/..` (script-location, NOT cwd) = the plugin dir, so a direct
  repo-root invocation dies at line ~164 before ever reaching the #505 pins (~962). It is a byte-synced copy,
  not a standalone-executed validator — hence "byte-identity ⇒ codex pin bites" needed a separate proof.
- The codex tree has NO `commands/kaola-workflow-finalize.md` (codex uses a finalize SKILL), and `FOREIGN_ARCHIVE`
  is correctly ABSENT from the entire codex tree (only present in the mirror validator's pin text). So there is
  no codex finalize-command surface to pin: ITEM 1 is root/gitlab/gitea by design (matches n1's evidence).
- Codex ITEM-1 enforcement IS real, achieved TRANSITIVELY: `validate-script-sync.js` (run by the codex chain)
  forces the mirror byte-identical to root, and root's ITEM-1 pin bites (BITE 1). BITE 5 proves the sync gate
  itself bites: breaking the mirror's identity reds `validate-script-sync.js`. So a silent drop of the codex
  copy's pin → mirror diverges from root → codex chain RED. Non-vacuous.
- `scripts/validate-kaola-workflow-contracts.js` (the codex-tree contract validator the chain runs) passed green
  in-chain ("Kaola-Workflow Codex contract validation passed").

### Read-only verifications

- root↔codex byte-pair: `diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` → empty (IDENTICAL); re-confirmed after all bites incl. BITE 5.
- No edition cross-wiring introduced: the n1 #505 diff in the gitlab validator pins only gitlab paths/nouns; gitea pins only gitea. The 3 pre-existing "gitlab" hits in the gitea validator are forge-leak detection patterns + a `--forge` case list — NOT in the #505 hunk.
- Green-on-arrival (pins match CURRENT reality, not vacuous): FOREIGN_ARCHIVE substrings present in all 3 finalize.md (root/gitlab/gitea); `<!-- PIN: frontier unit -->` present on all 6 plan-run surfaces; all pinned shared fns present in both gitlab and gitea ports.
- gitlab/gitea ITEM-1 not separately bitten: BITE 3 proved the gitlab validator executes and its `assertIncludes` bites on absence; ITEM 1 uses the same function on a file confirmed green-on-arrival — transitive coverage. (Codex differed only because its copy is never executed standalone — resolved above via BITE 5.)

### Final clean-state confirmation (all four editions green via PROPER invocation)

- root contract validator: `node scripts/validate-workflow-contracts.js` → exit 0
- codex chain: `npm run test:kaola-workflow:codex` → exit 0 ("Kaola-Workflow Codex contract validation passed" + "walkthrough simulation passed"); `validate-script-sync.js` → exit 0 (26 common scripts, 25 byte-identical groups in sync)
- gitlab contract validator: exit 0
- gitea contract validator: exit 0
- route-reachability: exit 0 (170 assertions)
- bash-block-guards: exit 0 (19 assertions)

### Byte-perfect restoration proof

- All 6 n1-modified files diff-empty vs `/tmp/pristine` snapshot taken BEFORE any mutation (restore target = n1's modified state, NOT HEAD; never used `git checkout`).
- `commands/kaola-workflow-finalize.md` temporarily mutated for items 1 & 1b, restored byte-perfect (absent from `git status`).
- `git status --porcelain` shows exactly n1's 6 ` M` tracked files. Untracked `kaola-workflow/issue-505/` (active state) and `kaola-workflow/nonexistent-{gl,gt}-445-test/` (known test-scratch leak) are untracked and out of barrier scope — left untouched (NOT removed: that would be its own out-of-scope action).

Verdict: PASS — every new assert demonstrably bites for the right reason (root/gitlab directly; codex transitively via the sync gate, BITE 5); byte-pair identical; no cross-wiring; all four editions green via proper invocation; worktree byte-clean. 0 blocking findings.
