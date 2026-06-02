# Advisor — issue-216 Plan Gate

## Verdict

Plan is correct in structure and approach. Four gaps must be folded in as hard Phase 4 gates.

## Gap 1 — Exit-3 is NOT the RED/GREEN discriminator

Current buggy `postMergeCleanup` already `return { exitCode: 3 }`. A RED test that only checks `result.status === 3` would pass even against the buggy code — not a useful discriminator.

**Fix:** The RED/GREEN discriminators are filesystem state ONLY:
- Phantom folder present/absent: `fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-850'))` must be TRUE when RED (buggy), FALSE when GREEN (fixed)
- Receipt present/absent: `fs.existsSync(.../issue-850/.cache/sink-fallback.json)` must be TRUE when RED (buggy), FALSE when GREEN (fixed)
- Archive intact: `fs.existsSync(.../archive/issue-850)` must be TRUE in both worlds (archive should never be wiped by the guard)

**Gate:** When "confirming RED" in Phase 4, confirm it fails specifically on the phantom-folder or receipt assertions, not just vaguely "test failed."

## Gap 2 — Verify test setup creates a real linked worktree

`cmdFinalize --keep-worktree` only commits the archive when `mainRoot2 !== linkedRoot2` (`claim.js:653`) — i.e., run FROM INSIDE a linked worktree. If `startup` doesn't provision a real worktree distinct from `tmp`, the `finalize --keep-worktree` commit branch is skipped and the archive is never committed on the feature branch. The tracked-archive reproduction collapses.

**Fix options:**
1. Run startup inside a real linked worktree and confirm git state directly: `git cat-file -e workflow/issue-850:kaola-workflow/archive/issue-850` must succeed (archive committed on branch), `git cat-file -e workflow/issue-850:kaola-workflow/issue-850/workflow-state.md` must fail (live folder gone on branch).
2. If the startup→finalize orchestration is brittle in-harness, construct the committed-archive-on-branch state with direct git commands: create feature branch, `git mv kaola-workflow/issue-850/ kaola-workflow/archive/issue-850/` (or equivalent), commit. This is the faithful minimum; the "real lifecycle" requirement only precludes committing a live folder to origin/main (which `reset --hard` would restore — wrong state).

**Gate:** Before trusting the test, assert the git state explicitly (option 1 or 2 above).

## Gap 3 — Layer 1 post-checkout early-exit leaves repo on wrong branch

The normal success/exit-3 path leaves the repo on `main`:
- `ffMergeLoop` checks out `main` at line 157/163 before merging
- The existing `postMergeCleanup` exit-3 runs AFTER `ffMergeLoop` with the repo already on `main`, plus `git reset --hard origin/main` before returning

Layer 1 fires AFTER `git checkout args.branch` (line 328) and BEFORE `ffMergeLoop`. Without a restore, the working tree is left on `args.branch` instead of `main`. This is a state inconsistency that a filesystem-only test won't catch.

**Fix:** The Layer 1 early-exit MUST include `try { execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' }); } catch (_) {}` before `process.exitCode = 3; return;`. This matches the rest of the code's pattern of always restoring to main on any exit path.

**Gate:** Add assertion to the test: `execSync('git -C ' + tmp + ' rev-parse --abbrev-ref HEAD', ...).trim() === 'main'` after sink-merge exits.

## Gap 4 — Fourth copy check

`find . -name '*sink-merge*.js'` confirms exactly 4 copies: root, Codex, GitLab, Gitea. GitLab and Gitea already have both guards. Only root and Codex need changes. No fifth copy exists.

## Task ordering clarification

Tasks 2 and 3 are serial (Codex copies root's exact diff), NOT parallel. The plan should label them as serial/sequential in group B, not co-parallel.

## Does this block writing phase3-plan.md?

No. Fold gaps 1–3 as hard Phase 4 gates (not footnotes). The plan structure is otherwise correct.
