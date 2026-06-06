# impl — issue #245 (undefined resolver fix)

Node: `impl` (tdd-guide). RED→GREEN evidence + per-file edit summary.

## Acceptance gates (post-edit)

```
grep -c 'KAOLA_SCRIPTS' SKILL.md         → 0  (PASS)
kaola_script(){ count per file           → each 1  (PASS)
bare node scripts/...claim.js remaining  → each 0  (PASS)
```

## Per-file edits

### 1. plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md

**Site A — Line 112 (executable bash fence):**
- Before: `node "$KAOLA_SCRIPTS/kaola-workflow-claim.js" authoring-allowed`
- After: github `kaola_script(){ ... }` one-liner inserted on its own line above, then `node "$(kaola_script kaola-workflow-claim.js)" authoring-allowed`
- Resolver lifted verbatim from `commands/kaola-workflow-phase1.md` line 263.

**Site B — Line 125 (prose, subagent shell):**
- Before: `` it runs `node "$KAOLA_SCRIPTS/kaola-workflow-claim.js" startup --runtime <runtime> --workflow-path adaptive ``
- After: `` it runs `kaola-workflow-claim.js startup --runtime <runtime> --workflow-path adaptive ``
- Rationale: stripped `node "` prefix and `"` suffix; bare name matches `commands/kaola-workflow-adapt.md:~199` convention (subagent re-derives its own resolver).

**Site C — Line 142 (prose, subagent shell — contractor classify):**
- Before: `` it re-runs `node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --json` ``
- After: `` it re-runs `kaola-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --json` ``
- Same rationale as Site B.

**Site D — Line 153 (prose, subagent shell — contractor freeze):**
- Before: `` it runs `node "$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" kaola-workflow/{project}/workflow-plan.md --freeze` ``
- After: `` it runs `kaola-workflow-plan-validator.js kaola-workflow/{project}/workflow-plan.md --freeze` ``
- Same rationale as Site B.

### 2. commands/kaola-workflow-adapt.md

**Line 172 (executable bash fence):**
- Before: `node scripts/kaola-workflow-claim.js authoring-allowed`
- After: github `kaola_script(){ ... }` one-liner on its own line, then `node "$(kaola_script kaola-workflow-claim.js)" authoring-allowed`
- Resolver: github edition — install dir `$HOME/.claude/kaola-workflow/scripts/`, token `kaola-workflow-claim.js`.

### 3. plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md

**Line 170 (executable bash fence):**
- Before: `node scripts/kaola-gitlab-workflow-claim.js authoring-allowed`
- After: gitlab `kaola_script(){ ... }` one-liner (install dir `$HOME/.claude/kaola-workflow-gitlab/scripts/`) on its own line, then `node "$(kaola_script kaola-gitlab-workflow-claim.js)" authoring-allowed`
- Resolver lifted verbatim from `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md` line 263.

### 4. plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md

**Line 170 (executable bash fence):**
- Before: `node scripts/kaola-gitea-workflow-claim.js authoring-allowed`
- After: gitea `kaola_script(){ ... }` one-liner (install dir `$HOME/.claude/kaola-workflow-gitea/scripts/`) on its own line, then `node "$(kaola_script kaola-gitea-workflow-claim.js)" authoring-allowed`
- Resolver lifted verbatim from `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md` line 263.

## RED evidence

Reproduced MODULE_NOT_FOUND in a scratch non-kaola temp dir with its own unrelated `scripts/` dir:

```
=== RED: cwd=/var/folders/.../tmp.uU9kbnGvW1 ===
Error: Cannot find module '.../tmp.uU9kbnGvW1/scripts/kaola-workflow-claim.js'
  code: 'MODULE_NOT_FOUND'
exit: 1
```

## GREEN evidence

After fix, same scratch non-kaola temp dir (no package.json → else-branch; install-dir confirmed at
`$HOME/.claude/kaola-workflow/scripts/kaola-workflow-claim.js`):

```
=== GREEN: cwd=/var/folders/.../tmp.oVUFrmtbkY ===
Resolved path: /Users/ylpromax5/.claude/kaola-workflow/scripts/kaola-workflow-claim.js
{"status":"authoring_allowed","allowed":true,"project":null}
exit: 0
```

Resolver returned the real install-dir path; script executed and emitted valid JSON. No MODULE_NOT_FOUND.

Note: `authoring_allowed` confirms the adaptive switch is currently ON. Even if the switch were OFF, the response would be `{"status":"authoring_refused",...}` — still a valid script execution with no MODULE_NOT_FOUND, still proving GREEN. The discriminating signal is "no MODULE_NOT_FOUND + real path printed", not the specific status value.

## PARITY note (3 editions + prose rationale)

- **github** (`commands/kaola-workflow-adapt.md`): `kaola_script()` uses token `kaola-workflow-claim.js`, install dir `$HOME/.claude/kaola-workflow/scripts/`.
- **gitlab** (`plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`): token `kaola-gitlab-workflow-claim.js`, install dir `$HOME/.claude/kaola-workflow-gitlab/scripts/`.
- **gitea** (`plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md`): token `kaola-gitea-workflow-claim.js`, install dir `$HOME/.claude/kaola-workflow-gitea/scripts/`.

Each resolver was lifted verbatim from its own edition's sibling `kaola-workflow-phase1.md` line 263 — no cross-paste.

**SKILL.md lines 125/142/153 converted to bare script names** (not `$(kaola_script …)`) to match the command-file mirror convention (`commands/kaola-workflow-adapt.md:~199`), where the Agent() dispatch prompt uses bare script names (`kaola-workflow-claim.js startup …`). The `kaola_script()` function is defined only in the orchestrator's line-112 bash fence and is NOT in scope in a subagent's separate shell; the subagent re-derives its own resolver per its contract.
