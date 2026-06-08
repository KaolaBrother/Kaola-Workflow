# Documentation Update Assessment — issue #297

**Date:** 2026-06-08
**Fix:** worktree-finalize MAIN-repo staged `.roadmap/issue-N.md` orphan reconciliation

## Checklist findings

### README.md — no update needed
No public feature, CLI, env var, or install step changed. The fix is internal to `archiveProjectDir`. README describes the worktree-finalize command at a user-facing level; the fix is transparent to the user (sink-merge clean check now passes where it previously failed, but that is a bug correction, not a behavior change a user documents).

### CHANGELOG.md — already done
`[Unreleased]` entry present at line 6–7, authored before this node ran. No additional edit needed.

### docs/api.md — no update needed
The existing paragraph at **api.md:206** (under "Roadmap Closure Cleanup (Automatic)") describes what `cmdFinalize` stages into the **feature-branch commit**. The #297 fix is orthogonal: it drops a staged-ADD orphan from the **MAIN repo's index** (`git rm --cached` at claim.js:842), which is a different index and a different operation. The paragraph remains fully accurate; no sentence becomes false.

The `roadmap_source_removed` receipt field (documented at api.md:1079, 1123, 1155, 1177, 1208) is set by `fs.unlinkSync` at claim.js:817–821. The #297 block (claim.js:832–848) runs after that assignment and never touches `roadmapSourceRemoved`. Receipt contract is intact.

No new CLI flag, exit code, env var, or JSON field was introduced.

### docs/architecture.md — no update needed
The #297 fix does not alter the architecture. `archiveProjectDir` is already documented as the closure locus. The architecture.md:155 text describes the #261 archive-scoping fix; that is untouched. The MAIN-index orphan cleanup is an internal index operation inside an already-described function, not a structural change.

### .env.example — no update needed
No new environment variables introduced.

### Inline comments — no update needed
The fix at claim.js:822–848 includes a self-contained block comment (lines 822–831) explaining the orphan scenario, the gate condition (`cat-file -e HEAD:<relpath>`), and why the committed-on-HEAD case is skipped. No additional inline documentation is required.

## Conclusion

No documentation files require editing. All six checklist items are either already complete (CHANGELOG) or confirm no change is needed. The fix is a pure internal correctness correction with no public API, CLI, env, or receipt-contract surface change.
