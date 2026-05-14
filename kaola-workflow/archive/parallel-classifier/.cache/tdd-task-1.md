# TDD Task 1: CREATE kaola-workflow-classifier.js

## Status: COMPLETE

## Files Modified
- `scripts/kaola-workflow-classifier.js` (295 lines, created)

## RED Evidence
```
$ node scripts/kaola-workflow-classifier.js 2>&1; echo "exit:$?"
usage: kaola-workflow-classifier.js <classify>
exit:1
```

## GREEN Evidence
- No args → exit 1 + usage message (RED/GREEN confirmed)
- Clean env (no root) OFFLINE classify #99 → `{"verdict":"green","reasoning":"no file-set overlap..."}`
- Already-claimed issue → exit 2, no stdout
- OFFLINE + roadmap "blocked by #12" → `{"verdict":"blocked","reasoning":"OFFLINE and depends-on:#12..."}`
- Config bypass → `{"verdict":"green","reasoning":"parallel_mode=disabled; bypassing classifier"}`

## Deviations
None.
