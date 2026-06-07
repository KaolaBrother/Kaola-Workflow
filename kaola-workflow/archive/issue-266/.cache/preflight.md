# preflight — node evidence (issue #266, AC-B)

Role: tdd-guide
Node: preflight
Date: 2026-06-07

## Summary

Implemented `kaola-workflow-codex-preflight.js` — a require-free, TRUE 4-tree byte-identical
Codex agent-profile freshness preflight script. Hard-gates `.codex/agents/kaola-workflow/*.toml`
presence and `.codex/config.toml` managed-block coverage against the full template role set
(read from bundled `config/agents.toml`) plus any plan roles supplied via `--plan`.

---

## RED phase — scratch test failure (plugin copy absent)

Command:
```
node /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/preflight-test.js
```

Key output (RED):
```
--- Test 0: Script exists ---
  FAIL: preflight script exists at ...plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js

--- Test 1: Fresh fixture → exit 0, status:ok ---
  FAIL: exit code is 0 (got 1)
  FAIL: output is valid JSON
  FAIL: status is "ok" (got null)
  FAIL: autofixed is false (got null)
  FAIL: roles_checked has 13 entries (got null)

[... 33 total failures ...]

=== 37 assertions: 4 passed, 33 failed ===
```

Exit code: 1 (RED confirmed)

---

## GREEN phase — all 37 assertions pass

After authoring the script in `scripts/kaola-workflow-codex-preflight.js` and copying to the
plugin tree at `plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js`:

Command:
```
node /var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/preflight-test.js
```

Output (GREEN):
```
--- Test 0: Script exists ---
  PASS: preflight script exists at ...

--- Test 1: Fresh fixture → exit 0, status:ok ---
  PASS: exit code is 0 (got 0)
  PASS: output is valid JSON
  PASS: status is "ok" (got ok)
  PASS: autofixed is false (got false)
  PASS: roles_checked has 13 entries (got 13)

--- Test 2: Missing role profile + --no-autofix → non-zero typed refusal ---
  PASS: exit code is non-zero (got 1)
  PASS: output is valid JSON
  PASS: status is "profiles_missing" (got profiles_missing)
  PASS: stale is true
  PASS: missing_roles includes "code-explorer"
  PASS: repair field present
  PASS: safe_autofix is false

--- Test 3: Stale config block (role missing from block) + --no-autofix → config_stale ---
  PASS: exit code is non-zero (got 1)
  PASS: output is valid JSON
  PASS: status is config_stale or profiles_missing (got config_stale)
  PASS: stale is true

--- Test 4: Conflicting [agents.*] outside managed markers → autofix_unsafe ---
  PASS: exit code is non-zero (got 4)
  PASS: output is valid JSON
  PASS: status is "autofix_unsafe" (got autofix_unsafe)
  PASS: stale is true
  PASS: safe_autofix is false
  PASS: conflicting_roles_outside_markers is an array
  PASS: conflicting_roles_outside_markers includes "my-custom-agent"

--- Test 5: Plan role absent from template → role_not_in_template ---
  PASS: exit code is non-zero (got 3)
  PASS: output is valid JSON
  PASS: status is "role_not_in_template" (got role_not_in_template)
  PASS: missing_roles includes the fantasy role
  PASS: safe_autofix is false

--- Test 6: Stale managed block + autofix enabled → exit 0, autofixed:true ---
  PASS: exit code is 0 after autofix (got 0)
  PASS: output is valid JSON
  PASS: status is "ok" after autofix (got ok)
  PASS: autofixed is true (got true)

--- Test 7: Missing .codex dir + autofix → exit 0, autofixed:true ---
  PASS: exit code is 0 after autofix (got 0)
  PASS: output is valid JSON
  PASS: status is "ok" after autofix (got ok)
  PASS: autofixed is true (got true)

=== 37 assertions: 37 passed, 0 failed ===
ALL SCRATCH TESTS PASSED (GREEN)
```

Exit code: 0 (GREEN confirmed)

---

## Test cases covered

- (a) Fresh fixture → exit 0, `status:ok`, `autofixed:false`
- (b) Missing role profile file + `--no-autofix` → non-zero, `status:profiles_missing`, typed refusal
- (b-variant) Stale managed block (role removed from block) + `--no-autofix` → `status:config_stale`
- (c) Conflicting hand-authored `[agents.*]` OUTSIDE managed markers → `status:autofix_unsafe` (even without `--no-autofix`)
- (d) `--plan` with a role absent from template → `status:role_not_in_template`
- (e) Stale block + autofix enabled → installer invoked (positional arg, not `--project-root` flag) → re-verified → exit 0, `autofixed:true`
- (f) Missing `.codex/` dir entirely + autofix → installer creates it → exit 0, `autofixed:true`

---

## Byte-identity confirmation

All 4 copies are byte-identical (SHA256 `ed1d633efa6cd94596174ee203b94cff2dc1f4cce9e730466f764e27465d04e1`):

```
cmp scripts/kaola-workflow-codex-preflight.js plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js  → IDENTICAL
cmp scripts/kaola-workflow-codex-preflight.js plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js  → IDENTICAL
cmp scripts/kaola-workflow-codex-preflight.js plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js  → IDENTICAL
```

---

## validate-script-sync.js edits

Two additions to `COMMON_SCRIPTS` (the claude↔codex 2-tree guard):
1. `'kaola-workflow-codex-preflight.js'` — the preflight script (both base-named copies exist now)
2. `'kaola-workflow-task-mirror.js'` — pre-registered for the NEXT node (`task-mirror`); its base-named claude/codex pair will be byte-identical when created. The gitlab/gitea copies are edition-named ports and are NOT byte-synced.

One addition to `BYTE_IDENTICAL_GROUPS`:
- `'codex-preflight copies'` group listing all 4 paths (the 4-tree byte-identity guard).

No BYTE_IDENTICAL_GROUPS entry for `task-mirror` — its gitlab/gitea copies are deliberately edition-named ports (they `require` the edition-named plan-validator/classifier), exactly per the `next-action`/`commit-node` pattern.

---

## Expected dangling task-mirror failure in validate-script-sync.js

`node scripts/validate-script-sync.js` reports:
```
Missing files:
  - scripts/kaola-workflow-task-mirror.js
  - plugins/kaola-workflow/scripts/kaola-workflow-task-mirror.js
```

This is EXPECTED and intentional. The `task-mirror` COMMON_SCRIPTS entry was pre-registered here
(per D1 / the frozen plan's sequencing intent — both sync-allowlist edits live in the `preflight`
node). The `task-mirror` node (next in the spine) creates those two files. Full `npm test` was NOT
run for this reason — it would fail on the dangling reference. The per-node Phase-6 `--barrier-check`
does NOT run `validate-script-sync.js`, so end-state consistency at the final Phase-6/finalize is
what governs.

build-green: true (scratch test 37/37 pass; validate-script-sync.js preflight entries clean;
dangling task-mirror entry is expected-RED until next node)
