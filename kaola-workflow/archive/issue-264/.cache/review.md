verdict: pass
findings_blocking: 0

# Code review — issue #264 (review node, G1 gate) — RE-VERIFICATION (fix accepted)

Reviewer: code-reviewer (adaptive G1 gate, post-dominates the implement chain).
Scope: uncommitted change set on `main` (repo-root adaptive run). `kaola-workflow/**`
artifacts ignored. The prior BLOCKING finding (B1) was fixed by a routed build-error-resolver
(`.cache/review-fix.md`); this pass re-verifies the fix against primary source + re-runs all suites.

## VERDICT: PASS — 0 blocking findings (B1 resolved; both non-blocking nits fixed & verified)

The prior blocker — the AC6 `Working directory:` directive placed as an Agent()-block sibling
field OUTSIDE the dispatch prompt (inert, since the contractor reads it from the prompt) — is
RESOLVED. The directive is now the leading sentence INSIDE `prompt="..."` at all 6 dispatch sites
in each of the 3 plan-run command files, where contractor.md Method 5 reads it. The two
non-blocking nits (mirror once-guard, resolver `-d` guard) were folded in and are bash-verified.
All nine acceptance criteria are now delivered; all three walkthroughs exit 0.

## B1 RESOLUTION — VERIFIED (primary source)

- **Directive now in-prompt, all 6 sites, Claude command** (`commands/kaola-workflow-plan-run.md`):
  lines 88 (orient), 173 (advance), 189 (tdd-guide), 202 (code-reviewer), 215 (build-error-resolver),
  234 (commit+advance). Each `prompt="..."` now begins:
  `Working directory: ${ACTIVE_WORKTREE_PATH} — run all scripts and resolve every relative path from
  this directory (it is the provisioned worktree for adaptive; when it equals the repo root, behavior
  is unchanged). <original prompt...>`. NO bare Agent()-block sibling-field occurrence remains; the
  only other `Working directory:` hits (lines 66, 70, 222) are narrative prose, not dispatch fields.
- **Consumer contract matched.** contractor.md Method 5 (unchanged): "When the dispatch **PROMPT**
  carries a `Working directory: <path>` line, run all scripts and resolve relative arguments from
  that directory." Producer (in-prompt) and consumer (reads prompt) now align. The load-bearing
  contractor brackets (orient/advance/commit+advance — which run `commit-node.js` + the barrier) and
  every role dispatch now receive the cwd directive → cwd == worktree → relative plan path resolves to
  the worktree copy → impl lands on `workflow/issue-N` → per-node + Phase-6 barriers diff the worktree.
- **Forge parity.** gitlab + gitea `commands/kaola-workflow-plan-run.md`: 6 directive-in-prompt sites
  + 6 descriptions each; zero bare sibling fields. The Adaptive Worktree resolver/mirror block
  (lines 38-71) is byte-identical across all 3 copies (`diff` clean). Codex SKILL.md was already
  correct (prose form) and untouched.
- **No engine drift.** Fix is markdown-only: claim.js / sink-merge.js / commit-node.js /
  next-action.js remain byte-identical root vs Codex (validate-script-sync clean). The modified-file
  set is unchanged from the original change set (only the 3 plan-run.md files within it were touched).

## NON-BLOCKING NITS — FIXED & BASH-VERIFIED

- **(was MEDIUM) Mirror once-guard** (plan-run.md:58): now
  `if [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ] && [ ! -f "$ACTIVE_WORKTREE_PATH/kaola-workflow/{project}/workflow-plan.md" ]`.
  Truth table empirically confirmed: worktree==pwd → SKIP (repo-root run, this issue); worktree!=pwd
  & plan absent → MIRROR (first entry); worktree!=pwd & plan present → SKIP (resume-safe, no clobber
  of the advanced ledger). Resolves the resume-clobber regression.
- **(was LOW) Resolver `-d` existence guard** (plan-run.md:47): now
  `[ -z "$ACTIVE_WORKTREE_PATH" ] || [ ! -d "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"`.
  Bash `(A||B)&&C` precedence empirically confirmed: empty → fallback; recorded-but-nonexistent dir →
  fallback; real existing worktree → kept. Strengthens the empty-`worktree_path` fallback (this run).

## SUITES (all exit 0)
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed";
  `testPlanRunWiredForWorktree: PASSED`, `testAdaptiveWorktreeProvisionedE2E: PASSED` (ACTIVE arm).
- gitlab `simulate-gitlab-workflow-walkthrough.js` → exit 0.
- gitea `simulate-gitea-workflow-walkthrough.js` → exit 0.

## AC SUMMARY (all delivered)
AC1 (.kw/worktrees/<project> default ×4), AC2 (.gitignore `.kw/`), AC3/AC4 (legacy cleanup: dry-run
default, git-owned removal, dirty-skip, empty-container rmdir), AC5 (no-nesting via mainRootFromCoord),
**AC6 (adaptive isolation — NOW DELIVERED: suppression dropped + executor operates in the worktree via
the in-prompt cwd directive + resolver/mirror with once-guard & -d guard; repo-root/empty-worktree
fallback preserved)**, AC7 (sink safety floor, both arms proven), AC8 (real e2e: claim→worktree→impl→
finalize→sink, asserts merged main contains impl), AC9 (forge claim + sink-merge + plan-run parity).
Engine D2 n/a nodes (commit-node/next-action) confirmed unchanged + path-agnostic via
`plan-validator.js:76 findRepoRoot` matching a worktree `.git` FILE.

## Notes
- The D4 residual risk (e2e proves the mechanism, not the literal plan-run bash) is now fully
  discharged: the in-prompt placement is the responsibility of this review node and is verified by
  primary-source read + grep (6/6 sites in-prompt, 0 bare fields, ×3 files) + the matched consumer
  contract. The Codex SKILL.md being the canonical correct form corroborates the fix shape.
- Finalize for this issue remains hand-driven (repo-root adaptive run: no branch ref; see memory
  project_adaptive_repo_root_finalize).
