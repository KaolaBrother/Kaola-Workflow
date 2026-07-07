evidence-binding: n1-plan 32d4fb4eb0b9
## n1-plan — #636 edit map, VERIFIED against current worktree (all line numbers grepped, not doc-trusted)

Only the `plan-run` topic is touched; finalize/next untouched.

### KEY STRUCTURAL DRIFT (read first) — the Codex-dispatch fence differs across the 3 commands
- **github command** (commands/kaola-workflow-plan-run.md): Codex-dispatch block starts CLEAN on its own line (221 `For any non-null…`); the always-live sentence `Dispatch the base role profile in \`dispatch.agent_type\` (legacy \`dispatch.role\` is only descriptive).` lives SEPARATELY at 170–171 → ONE splice (END, line 241).
- **forge commands** (gitlab + gitea, byte-identical to each other): that always-live sentence is FUSED into the block START at 218–219 (`…is only`/`descriptive). For any non-null…`) → TWO splices (START 219 + END 239). The design doc only described the END splice — the START splice on the forge commands is REAL and must be handled or the always-live base-dispatch sentence is destroyed.

## A. PROSE FENCES (6 surfaces)

### File 1 — commands/kaola-workflow-plan-run.md (github)
1. KEEP Teammate-Mode block (186–219). Do NOT touch 170–171 (separate always-live sentence).
2. REMOVE Codex-dispatch block: delete lines **221–240** in full; on line **241** delete only the leading fragment `variant-missing note. ` so line 241 becomes exactly `Pass \`dispatch.nonce\` (evidence-binding token). Instruct the role to:`. Preserve blank line 220. Bullet list 242–269 = always-live tail, untouched. (END splice: removed content ends `…never emit a variant-missing note.`; preserved tail begins `Pass \`dispatch.nonce\``.)
3. ADD marker `<!-- PIN: teammate-mode -->` as a new line immediately above line 186 `#### Teammate-Mode Dispatch`.

### Files 2 & 3 — forge commands (IDENTICAL edits): plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md + plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
1. KEEP Teammate-Mode block (183–216).
2. REMOVE Codex-dispatch block with BOTH splices:
   - START splice (line 219): line 219 currently `descriptive). For any non-null \`dispatch.codex_reasoning_effort\`, require a`. Replace the tail ` For any non-null \`dispatch.codex_reasoning_effort\`, require a` with ` Pass \`dispatch.nonce\` (evidence-binding token). Instruct the role to:` so 218–219 read:
     `Dispatch the base role profile in \`dispatch.agent_type\` (legacy \`dispatch.role\` is only` / `descriptive). Pass \`dispatch.nonce\` (evidence-binding token). Instruct the role to:`
   - Then DELETE lines **220–239** in full (all Codex-dispatch content incl the now-relocated `Pass \`dispatch.nonce\`… Instruct the role to:` fragment that was on 239). Bullet list (currently 240+) = tail.
   - Net: preserve `Dispatch the base role profile…descriptive).` (START) + `Pass \`dispatch.nonce\`… Instruct the role to:` (END); remove everything Codex-specific between.
3. ADD marker `<!-- PIN: teammate-mode -->` immediately above line 183 `#### Teammate-Mode Dispatch`.

### Files 4,5,6 — the 3 SKILLs (IDENTICAL): plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md + gitlab + gitea
1. KEEP the Codex-dispatch `## Dispatch` section (72–96) — Codex-native, stays. CONFIRM the separate `## Codex Join Protocol` section (98–152) is NOT part of the fence — it STAYS (holds dispatch.wait_budget_minutes / delegation_outcome / writerHalt required by SKILL-side #611-join).
2. REMOVE Teammate-Mode block: delete lines **241–263** inclusive (from `#### Teammate-Mode Dispatch` 241 through `the transport, never the contract.` 262 + trailing blank 263). Line 240 (blank) then 264 (`Delegate to the base role profile matching \`dispatch.agent_type\`. Apply the task-name and reasoning-effort rule above. Pass \`dispatch.nonce\`…`) = always-live tail, untouched (its "reasoning-effort rule above" referent survives since Codex block 81–96 stays).
3. ADD marker `<!-- PIN: codex-dispatch -->` as a new line immediately under the `## Dispatch` heading (line 72), above `Reasoning effort and identity:` (74).

### A.3 marker recommendation: ADD the two markers now (spec lists them; PROVENANCE_BAN-safe — same shape as existing PIN markers; ZERO chain risk — no validator asserts their presence/absence + no closed-set marker check today; each surface keeps ONE runtime block + ONE marker: command→teammate-mode, SKILL→codex-dispatch).

## B. VALIDATOR/TEST EDITS (6 files) — assertion-level

### File 7 — scripts/test-route-reachability.js (TWO separate `planRunSurfaces` arrays)
1. T5b array → SKILL-only: array **183–190** (header comment 178–181, loop 191–203). Delete 3 command entries (184,186,188); keep 3 SKILL entries (185,187,189). Loop body unchanged. The #610 sub-filter at 209 (`.filter(f=>f.includes('/skills/'))`) becomes a harmless no-op — leave it. Comment 178–181 → update to 3 Codex SKILL surfaces (comment-only).
2. T14 array → command-only: array **451–458** (comment 446–448, loop 459–465). Delete 3 SKILL entries (453,455,457); keep 3 command entries (452,454,456). Loop body unchanged. Comment 446–448 → 3 Claude command surfaces (comment-only).
3. These are TWO separate arrays in two block scopes — two independent edits.

### File 8 — scripts/validate-workflow-contracts.js
1. #582 command-side T5b assertion → DELETE lines **955–961** (comment `// #582…` + the 5 assertIncludes('commands/kaola-workflow-plan-run.md',…)/assertNotIncludes lines).
2. #606 planRunSurfaces606 → command-only: array 983–990 (comment 980–982, loop 991–994). Delete 3 SKILL entries (**987–989**); keep 3 command (984–986). Loop body unchanged. Comment 980–982 → command-only.
3. #611-fork planRunSurfaces611ForkTurns → SKILL-only ← THE CRITICAL ONE: array 1017–1024 (comment 1013–1016, loop 1025–1029). Delete 3 command entries (**1018–1020**); keep 3 SKILL (1021–1023). Loop body (1025–1029 incl assertNotIncludes 'not a valid path for tiered nodes') unchanged. Comment 1013–1016 → SKILL-only. LEAVE untouched: codexJoinProtocolSurfaces611 (1035–1046, already SKILL-only) + claudeJoinProtocolSurfaces611 (1051–1061, already command-only).

### File 9 — plugins/kaola-workflow/scripts/validate-workflow-contracts.js (BYTE MIRROR of File 8)
IDENTICAL edits at IDENTICAL line numbers (#582 955–961, planRunSurfaces606 983–990, planRunSurfaces611ForkTurns 1017–1024 all match root). Kept byte-identical by a COMMON-byte guard — apply File-8's three edits verbatim; the two files MUST remain byte-identical post-edit (editing only one reds the chain).

### File 10 — scripts/validate-kaola-workflow-contracts.js (github codex validator)
1. #606 teammate-on-github-SKILL → DELETE lines **642–644** (comment `// #606: teammate-mode…` + 2 assertIncludes(`${pluginRoot}/skills/…/SKILL.md`,…) lines).
2. #611-fork loop [SKILL, root command] → SKILL-only: loop **811–818** (comment 808–810). Delete line **813** (`'commands/kaola-workflow-plan-run.md'`); keep 812 (`${pluginRoot}/skills/…/SKILL.md`). Loop body (815–817) unchanged. Comment 808–810 → SKILL only.
   LEAVE untouched: #598 AC4 loop (798–806, asserts `## Gate-Role Degradation Notice` — symmetric both surfaces); SKILL-side #582 pins (786–792, already SKILL); join-protocol pins (820+).

### File 11 — plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
THREE-WAY split of the shared [command, SKILL] loop (spans **774–814**; iterates pluginRoot+'/commands/…' and pluginRoot+'/skills/…/SKILL.md').
- STAYS in shared loop (symmetric): #602 (778–780), #604 (784–787), #605 (790), #607 (799–800), #611-join (811–813).
- REMOVE from shared loop → relocate command-only: #606 block = comment 792 + assertions 793–794.
- REMOVE from shared loop → relocate SKILL-only: #611-fork block = comment 802–803 + assertions 804–806 (all three incl assertNotIncludes(planRunSurface,'not a valid path for tiered nodes')).
- After the loop (after line 814), ADD:
```
// #606: teammate-mode dispatch subsection — Claude-runtime block, command surface only.
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', "spawn each node's role agent as a NAMED teammate");
assertIncludes(pluginRoot + '/commands/kaola-workflow-plan-run.md', 'send EXACTLY ONE request for the deliverable, then wait');
// #611: fork_turns:"none" unconditional mandate — Codex-dispatch block, SKILL surface only.
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'on EVERY dispatch, tiered or not');
assertIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'the unconditional mandate applies identically to this dispatch mode');
assertNotIncludes(pluginRoot + '/skills/kaola-workflow-plan-run/SKILL.md', 'not a valid path for tiered nodes');
```
(pluginRoot = 'plugins/kaola-workflow-gitlab' here; keep the pluginRoot+'/…' idiom.)
- DO NOT TOUCH the mr|pr) finalize-sink contract pins at lines **296** and **335** — deliberate contracts.

### File 12 — plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
Same three-way split at gitea line numbers (shared loop spans **779–819**):
- STAYS: #602 (783–785), #604 (789–792), #605 (795), #607 (804–805), #611-join (816–818).
- REMOVE → command-only: #606 block = comment 797 + assertions 798–799.
- REMOVE → SKILL-only: #611-fork block = comment 807–808 + assertions 809–811.
- After the loop (after line 819), ADD the same two groups as File 11 (pluginRoot='plugins/kaola-workflow-gitea').
- DO NOT TOUCH the mr|pr) finalize-sink contract pins at lines **303** and **342**.

## Cross-check ledger (every removed prose token's assertion neutralized)
- Command Codex tokens (fork_turns/reasoning_effort/effort-proof/codex_effort_override_unavailable): asserted only by T5b (F7→SKILL-only) + #582 (F8/9→deleted). No forge-command/github-codex command assertion (all already SKILL-scoped). Covered.
- Command #611-fork tokens (`on EVERY dispatch, tiered or not`, `the unconditional mandate applies identically to this dispatch mode`): asserted by planRunSurfaces611ForkTurns (F8/9→SKILL-only), [SKILL,root command] loop (F10→SKILL-only), forge shared loops (F11/12→SKILL-only). NOT in test-route-reachability. Covered.
- SKILL teammate tokens (`spawn each node's role agent as a NAMED teammate`, `send EXACTLY ONE request for the deliverable, then wait`): asserted by T14 (F7→command-only), planRunSurfaces606 (F8/9→command-only), github-SKILL #606 (F10→deleted), forge shared loops (F11/12→command-only). Covered.
- #611-join/#598/#602/#604/#605/#607: symmetric, untouched. mr|pr) contract pins: untouched.
- CHANGELOG.md is NOT in this 12-file map (n6-finalize handles it); D-636-01.md is n5-docs.

## RISK CALLOUT
The #611-fork SKILL-only shrink is MANDATORY across all four validators — F8 (drop 1018–1020), F9 (byte-identical), F10 (drop command entry line 813), F11/12 (relocate #611-fork out of the shared loop to SKILL-only). If ANY one keeps the command entry while the command's Codex-dispatch block is fenced out, `on EVERY dispatch, tiered or not`/`the unconditional mandate applies identically to this dispatch mode` gets asserted on a command that no longer contains them → all four chains RED. This is the correction the shaping-run adversary proved missing.

delegation_outcome: completed
