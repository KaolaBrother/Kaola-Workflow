# Doc-Updater — issue-185

## Files Updated
1. **README.md** line ~521 — KAOLA_GH_REMOTE_TIMEOUT_MS entry updated to include 600000ms cap description
2. **.env.example** line ~5 — added cap comment for KAOLA_GH_REMOTE_TIMEOUT_MS
3. **CHANGELOG.md** — new entry under [Unreleased]/Fixed: cap KAOLA_GH_REMOTE_TIMEOUT_MS at 600000ms, lists 6 affected files
4. **docs/api.md** — already updated in Phase 4 (D1 task); verified complete

## Files Skipped
- docs/architecture.md — N/A: timeout validation is runtime guard, not architecture change
- Inline comments — N/A: Math.min(n, 600000) is self-documenting; no new public interface

## Status: complete
