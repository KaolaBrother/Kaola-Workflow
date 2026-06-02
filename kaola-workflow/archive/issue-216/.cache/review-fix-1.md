# Review Fix 1 — HIGH: archived path skips reset

## Finding routed
HIGH: archived exit-3 path skipped `git reset --hard origin/main`, leaving local main poisoned.

## Fix applied to `scripts/kaola-workflow-sink-merge.js`

Changed guard from:
```javascript
    if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
      process.stderr.write('..., skipping receipt write\n');
      try { execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' }); } catch (_) {}
      return { exitCode: 3 };
    }
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' });
    } catch (_) {}
```

To:
```javascript
    const wasArchived = !fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir);
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' });
    } catch (_) {}
    if (wasArchived) {
      process.stderr.write('..., skipping receipt write\n');
      return { exitCode: 3 };
    }
```

## Test fix applied to `scripts/simulate-workflow-walkthrough.js`

Removed `fs.existsSync(archiveDir)` assertion (archive-on-disk was symptom of skipping reset, not correct behavior). Added `git rev-list --count origin/main..main === '0'` assertion (proves reset ran).

## Codex byte-sync
`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` updated to match, SHA `ac5b694b`.

## Validation
`node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0)
