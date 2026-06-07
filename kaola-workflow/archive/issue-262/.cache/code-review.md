verdict: pass
findings_blocking: 0

## Code Review — issue #262 (dedupe-closure)

Reviewed the 4-file, behavior-preserving doc/procedure cleanup that makes `cmdFinalize`
the SOLE owner of per-issue roadmap closure (rm `.roadmap/issue-N.md` + regenerate
`ROADMAP.md`) and reduces Mechanical-Finalization Step 7 to STAGING ONLY.

### Checklist results

1. CRITICAL — load-bearing git-add staging PRESERVED. `agents/contractor.md` Step 7
   still contains `git add kaola-workflow/.roadmap/issue-N.md kaola-workflow/ROADMAP.md`
   (line 167). On the in-place worktree path cmdFinalize does the rm+regen but does NOT
   git-add the mirror, so this stage is required and survived. PASS.

2. Redundant `rm -f …issue-N.md` + `node … generate` runnable bodies REMOVED from
   contractor.md Step 7 and from all three phase6 editions. grep for
   `rm -f kaola-workflow/.roadmap/issue-N.md` → zero hits across the 4 files; grep for
   `ROADMAP_JS`/`kaola_script` runnable fn in phase6 → zero hits. The two residual
   `…roadmap.js generate` mentions (gitlab:492, gitea:491) are PROSE describing what
   cmdFinalize does, not fenced bash bodies. PASS.

3. INTERNAL CONSISTENCY — `grep -rn "contractor executes it" agents commands plugins`
   → zero hits. All 3 phase6 editions + contractor.md now consistently state the
   closure (rm+regenerate) is owned by cmdFinalize at Step 8b and Step 7 only stages.
   PASS.

4. SCOPE — `git status --porcelain` shows only the 4 expected modified files plus the
   expected untracked `kaola-workflow/issue-262/` project folder. No edits to scripts/,
   docs/, CHANGELOG.md, or any .codex-plugin/ / .codex/ path (parallel to #266). PASS.

5. Pinned dispatch tokens (`subagent_type="contractor"`, `--keep-worktree`, model
   badges) untouched — no diff hunk intersects those lines. PASS.

6. BEHAVIOR-PRESERVING / EXACTLY-ONCE — Verified the premise against source
   (read-only, in scope): `scripts/kaola-workflow-claim.js` `archiveProjectDir`
   (lines 792–810), invoked by `cmdFinalize` (line 876), performs the closure for
   `statusValue === 'closed'`: `fs.unlinkSync(.roadmap/issue-N.md)` (798) +
   `roadmapModule.regenerateRoadmap(root)` (805). The assertion baked into all edited
   docs is therefore TRUE; removing the duplicated Step-7 body leaves closure happening
   exactly once (cmdFinalize), not zero times. The cmdFinalize invocation and the Step-7
   git-add are unmoved by this diff, so the finalize choreography/ordering is unchanged.
   PASS.

### Non-blocking observations
- None. Clean, surgical, consistent across all four editions.

### Rationale
All six checklist items pass; the deletion's premise is verified in the script (not just
asserted in prose), so the change is genuinely behavior-preserving and idempotent. No
CRITICAL or HIGH findings. Verdict: pass / findings_blocking: 0.
