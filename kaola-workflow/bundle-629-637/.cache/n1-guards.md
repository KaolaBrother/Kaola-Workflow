evidence-binding: n1-guards aeb7307a7cb4

## Bullet 1 — hooks.json family parity

**Guard-config change** (`scripts/validate-script-sync.js`): added `HOOKS_JSON_FAMILY`
(`reference: 'hooks/hooks.json'`, ports gitlab+gitea) mirroring `CONFIG_HOOKS_FAMILY`, plus
`normalizeHooksJson()` which rewrites ONLY the `kaola-workflow-compact-context` token to
`kaola-{forge}-workflow-compact-context` (the verified sole per-forge diff). Extracted a shared
`checkNormalizedFamily(family, normalizeFn, rootDir, normalizedKind)` primitive (used by
`RENAME_NORMALIZED_FAMILIES`, `CONFIG_HOOKS_FAMILY`, and the new `HOOKS_JSON_FAMILY` — a pure
refactor, no behavior change for the pre-existing families) and wired the new family into the
main check loop + `module.exports`. Updated the stale `hooks/hooks.json is intentionally
excluded...` comment to describe the new coverage.

RED (pre-impl, real `validate-script-sync.js` stashed back to its pre-fix state via
`git stash push -- scripts/validate-script-sync.js`, test run against it):
```
FAIL: #629 bullet 1: HOOKS_JSON_FAMILY declared with hooks/hooks.json as reference
FAIL: #629 bullet 1: normalizeHooksJson exported
FAIL: #629 bullet 1: checkNormalizedFamily exported (shared family-check primitive)
validate-script-sync guard tests FAILED (5 failures, 31 passed)
```
(the other 3 of the 5 failures were bullet 2's, see below — same stash/run.)

GREEN (after `git stash pop` restored the fix):
```
validate-script-sync guard tests passed (40 assertions; 2 canonicalOnly exclusions machine-guarded)
```
Test mechanism (`test-validate-script-sync.js` §6): a tmp-dir FIXTURE plants a new PreToolUse
matcher into a root-copy `hooks/hooks.json` fixture while leaving the gitlab/gitea fixture copies
un-mirrored → `checkNormalizedFamily` reports drift for both ports (RED-provable). A second
assertion runs the SAME check against the REAL repo tree and asserts zero missing/drift — the
real `hooks/hooks.json` triple is already in normalized parity (verified: only the compact-context
token differs), so the guard goes green with NO data-file edit.

No write to any `hooks.json` data file — confirmed via `git status --short` (only the 4 declared
`scripts/*.js` files are modified; no `hooks/` path appears).

## Bullet 2 — config/agents.toml byte parity

**Guard-config change** (`scripts/validate-script-sync.js`): added a `BYTE_IDENTICAL_GROUPS` entry
`'config/agents.toml triple'` covering `plugins/kaola-workflow/config/agents.toml` +
`plugins/kaola-workflow-gitlab/config/agents.toml` + `plugins/kaola-workflow-gitea/config/agents.toml`
(verified byte-identical at HEAD, md5 `579c8575...` for all three). Extracted a shared
`checkByteIdenticalGroup(group, rootDir)` primitive (used for every `BYTE_IDENTICAL_GROUPS` entry —
pure refactor of the pre-existing inline loop) and exported it.

RED (same stash run as bullet 1 — pre-fix `validate-script-sync.js`):
```
FAIL: #629 bullet 2: BYTE_IDENTICAL_GROUPS carries a config/agents.toml triple entry
FAIL: #629 bullet 2: checkByteIdenticalGroup exported (shared byte-group-check primitive)
validate-script-sync guard tests FAILED (5 failures, 31 passed)
```

GREEN (after `git stash pop`):
```
validate-script-sync guard tests passed (40 assertions; 2 canonicalOnly exclusions machine-guarded)
```
Test mechanism (`test-validate-script-sync.js` §7): a tmp-dir FIXTURE copies the real
config/agents.toml content into all three fixture paths, then plants a divergent
`developer_instructions = "PLANTED-DRIFT"` byte into the SECOND copy only → `checkByteIdenticalGroup`
reports exactly 1 drift entry (RED-provable). A second assertion runs the SAME check against the
REAL repo tree and asserts zero missing/drift — the real triple is byte-identical at HEAD, so the
guard goes green with NO data-file edit.

No write to any `agents.toml` data file — confirmed via `git status --short` (only the 4 declared
`scripts/*.js` files are modified; no `config/agents.toml` path appears).

## Bullet 3 — edition-sync --write create-on-missing

**edition-sync.js change**: extracted a shared `syncIfDrift(rootDir, rel, content)` primitive
(write `content` to `rootDir/rel` when the target is ABSENT or its content differs — matches step
(a)'s pre-existing `!fs.existsSync(...) || readFile(rel) !== next` create-on-missing pattern) and
rewired `runWrite()` steps (b) `COMMON_SCRIPTS` codex-sync and (c) byte-identical-group sync to use
it, dropping the old `fs.existsSync(...) && ...` guard that skipped an absent mirror entirely.
Exported `syncIfDrift`.

RED (pre-impl — written and run BEFORE `edition-sync.js` was touched, no stash needed):
```
FAIL: T8: syncIfDrift exported (shared create-on-missing primitive)
TypeError: syncIfDrift is not a function
    at Object.<anonymous> (scripts/test-edition-sync.js:147:19)
```
(test process crashed at the `syncIfDrift` call site — the literal pre-fix failure signature.)

GREEN (after implementing `syncIfDrift` + rewiring steps (b)/(c)):
```
edition-sync tests passed (35 assertions)
```
Test mechanism (`test-edition-sync.js` T8): enrolls a synthetic COMMON-script-shaped member
(`plugins/kaola-workflow/scripts/synthetic-enrolled-member.js`) with an ABSENT mirror in a
throwaway tmp root (never the real repo tree), asserts `syncIfDrift` returns `true` and the mirror
is CREATED with canonical content (was previously silently skipped as "tree already in sync");
also re-asserts idempotency (an already-in-sync mirror is a no-op) and regression-guards the
pre-existing drift-correction behavior (an existing-but-different mirror is still overwritten) —
so the fix is additive, not a weakening.

No write to any real repo mirror — the synthetic member lives only under the tmp dir; `runWrite()`'s
real invocation is untouched in behavior for the already-in-sync real tree (verified below).

## Verification (single pass, all green)

```
$ node scripts/validate-script-sync.js
OK: 24 common scripts, 26 byte-identical groups, 8 rename-normalized families, 2 hooks.json
families (config + hooks dir), and 7 forge export-superset families in sync.
EXIT:0

$ node scripts/test-validate-script-sync.js
validate-script-sync guard tests passed (40 assertions; 2 canonicalOnly exclusions machine-guarded)
EXIT:0

$ node scripts/test-edition-sync.js
edition-sync tests passed (35 assertions)
EXIT:0

$ node scripts/edition-sync.js --check
edition-sync: 10 forge aggregator ports in rename-normalized parity with canonical.
EXIT:0

$ node scripts/simulate-workflow-walkthrough.js
...
Workflow walkthrough simulation passed
EXIT:0
```

`git status --short` after all edits shows ONLY the 4 declared write-set files modified:
`scripts/edition-sync.js`, `scripts/test-edition-sync.js`, `scripts/test-validate-script-sync.js`,
`scripts/validate-script-sync.js`. No `hooks/hooks.json`, no `config/agents.toml`, no forge-port
`.js` file was touched — the two new guard families are green against the ALREADY-in-parity real
data files, and the create-on-missing fix was proven against a synthetic tmp fixture only.

RED: test #629-bullet-1/2 assertions (HOOKS_JSON_FAMILY/checkNormalizedFamily/agents.toml-group/
checkByteIdenticalGroup existence + mechanism) — "validate-script-sync guard tests FAILED (5
failures, 31 passed)" against the pre-fix validate-script-sync.js (via git stash); AND test
T8 "syncIfDrift exported" — TypeError: syncIfDrift is not a function (pre-impl, edition-sync.js
untouched).
GREEN: all 5 bullet-1/2 assertions + T8's ~5 assertions now pass; validate-script-sync guard tests
passed (40 assertions total, up from 36); edition-sync tests passed (35 assertions total, up from 30).
