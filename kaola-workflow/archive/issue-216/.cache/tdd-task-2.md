# TDD Task 2 — Root source guard (single pre-reset guard)

## Result: GREEN

**File modified:** `scripts/kaola-workflow-sink-merge.js`

## Actual implementation (differs from plan)

Single guard inserted at lines 213–219 inside the `postMergeCleanup` classified-error catch, BEFORE `git reset --hard origin/main` (now at line 221):

```javascript
213:    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
214:    const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
215:    if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
216:      process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
217:      try { execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' }); } catch (_) {}
218:      return { exitCode: 3 };
219:    }
221:    execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' });
```

## Plan deviation

Layer 1 (early-exit in `main()` post-checkout) was NOT added — it fires on every normal finalize→sink-merge flow (archive always present post-checkout), breaking `testE2EGitHubMergeFullChain`. Full rationale in `phase4-progress.md` deviations section.

## GREEN evidence

`node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0). `testSinkMergeSkipsArchivedProjectPhantom` now PASSES. All prior tests continue to pass.
