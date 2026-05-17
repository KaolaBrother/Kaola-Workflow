# Planner Output — issue-38

## Recommended Approach: B — Behavior test via simulate-workflow-walkthrough.js

### Approaches Evaluated

**Option A — Contract-only test (minimal)**
- Fix phase4.md:63. Add validate-workflow-contracts.js assertion that porcelain-pattern string is present and `--show-toplevel` is absent in lines 60-70.
- Pros: Smallest diff; quick review.
- Cons: Doesn't exercise behavior — a future edit could look right but be wrong (wrong awk slice index). Hides the regression class.
- Risk: Medium — pure-text check is brittle to whitespace and refactors.
- Complexity: Low.

**Option B — Behavior test via simulate-workflow-walkthrough.js (RECOMMENDED)**
- Fix phase4.md:63. Add Case 17K: from inside `pick17a.worktree_path`, execute the bash one-liner via `execFileSync('bash', ['-c', ...])` and assert `COORD_ROOT` equals `epic17Tmp`.
- Pros: Tests actual behavior. Future regressions in phase4.md fail loudly. Single source of truth stays in markdown.
- Cons: Test runs `bash` (POSIX-only, but so is rest of Case 17).
- Risk: Low.
- Complexity: Low–Medium.

**Option C — New JS subcommand `main-worktree`**
- Add `cmdMainWorktree()`, change phase4.md to `node "$_CLAIM_JS" main-worktree`.
- Pros: DRY across MD + JS callers.
- Cons: Over-engineering — only ONE MD file has the bug. Adds new wire-protocol surface, extra `node` spawn.
- Risk: Medium — subcommand creep.
- Complexity: Medium.

### Key Investigation Findings from Planner
1. Bug is isolated to `phase4.md:63` only. Other `--show-toplevel` usages are for `_TICKER_PID_FILE` (per-worktree path is intentional there). Approach C is over-engineering.
2. `plugins/` mirror is NOT enforced by `validate-workflow-contracts.js`. Plan must add enforcement.
3. `cmdResume.issue` type change (string → integer) is safe: Case 17D/17E don't check the `issue` field numerically. But confirm no external consumer in `commands/*.md`.

## Implementation Steps (Approach B)

### Phase 1: Bug fix + behavior test (one commit)
1. Patch `commands/kaola-workflow-phase4.md:62-68` — replace `git rev-parse --show-toplevel` with `git worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}'`
2. Add Case 17K — from inside `pick17a.worktree_path`, run the bash one-liner, assert `COORD_ROOT == epic17Tmp`

### Phase 2: Negative-path tests (one commit) — MEDIUM-5
3. Case 17G: `resume` with no project/branch context → `resumed: false, reason: cannot determine project`
4. Case 17H: `worktree-finalize --project issue-999` (never provisioned) → non-zero exit, stderr has `worktree not provisioned at`
5. Case 17I: dirty file in `kaola-workflow/issue-701/` → non-zero exit, stderr has `uncommitted changes`
6. Case 17J: verify `worktree-finalize` actually creates a commit (HEAD before vs after differs)

### Phase 3: Contract validator hardening (one commit) — MEDIUM-6
7. Add `assertMatches(file, regex)` helper. Check `if (sub === 'pick-next')` etc. in claim script.
8. Add plugins/ mirror parity check — assert all four `cmd*` function names and `if (sub === ...)` lines exist in both `scripts/` and `plugins/kaola-workflow/scripts/`.

### Phase 4: Claim-script quality polish + plugins/ mirror (one commit)
9. Extract `findMainWorktree(opts)` — replace inline blocks at `cmdResume:2228-2236` and `cmdWorktreeFinalize:2360-2363`. Export the helper. Only extract this one (2 real callers); do NOT extract `fetchOpenIssues`, `scanPhaseArtifacts`, `detectCurrentProject`, `buildClaimedBranchSet` (each has 1 caller — YAGNI).
10. MEDIUM-2: `cmdPickNext:2214` — add `process.stderr.write('pick-next: provisionWorktree failed for ' + project + ': ' + e.message + '\n')` in catch.
11. MEDIUM-3: `cmdResume.issue` — change `project.replace(/^issue-/, '')` to `parseInt(project.replace(/^issue-/, ''), 10)`. Add assertion in Case 17D that `resume17d.issue === 701`.
12. LOW-1 (MEDIUM-3 extension): anchor `refs/heads/` regex in `cmdWorktreeStatus:2319` to `/^refs\/heads\//`.
13. LOW-2: leave 7-arm if/else chain as-is per advisor warning — readable, not on critical path, YAGNI.
14. LOW-4: reformat `module.exports` consistently; add `findMainWorktree` to exports.
15. Mirror steps 9-14 into `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`.

## What NOT to Build
- No new JS subcommand `main-worktree` (Approach C rejected)
- No phase-routing lookup table refactor (LOW-2) — readable as-is per advisor
- No extraction of single-caller helpers (`fetchOpenIssues` etc.)
- No splitting of `cmdPickNext`/`cmdResume`/`cmdWorktreeFinalize` beyond `findMainWorktree` extraction
- No fix for `_TICKER_PID_FILE` `--show-toplevel` usages — those are intentional

## Open Questions / Missing Facts
- Does any external consumer in `commands/*.md` parse `resume.issue` as a string? Grep before merging step 11.
- CI matrix: confirm POSIX-only runners for Case 17K bash invocation.
- CHANGELOG.md scope: list phase4.md fix + `cmdResume.issue` type change under [Unreleased]; lump LOW items as "internal cleanup".
