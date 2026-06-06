# explore — issue #245 (undefined resolver sites + canonical blocks)

Node: `explore` (code-explorer, read-only). Evidence persisted by orchestrator (code-explorer cannot Write).

## A. Confirmed undefined-resolver invocation sites

### A.1 `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md`
`$KAOLA_SCRIPTS` appears **4×**; `kaola_script(` appears **0×**; `KAOLA_SCRIPTS=` appears **0×** — never defined.

| Line | Text | Shell context |
|------|------|---------------|
| 112 | `node "$KAOLA_SCRIPTS/kaola-workflow-claim.js" authoring-allowed` | **Executable ```bash fence — INLINE ORCHESTRATOR GUARD** (the one actually run). |
| 125 | `"$KAOLA_SCRIPTS/kaola-workflow-claim.js" startup …` | Prose describing what the **workflow-planner subagent** runs (separate shell). |
| 142 | `"$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" … --json` | Prose describing what the **contractor subagent** runs (classify). |
| 153 | `"$KAOLA_SCRIPTS/kaola-workflow-plan-validator.js" … --freeze` | Prose describing what the **contractor subagent** runs (freeze). |

Only line 112 executes in the orchestrator's shell. Lines 125/142/153 are subagent-command prose; the sibling command-file convention (`commands/kaola-workflow-adapt.md:199`) uses **bare script names** in subagent prompts (the subagent re-derives its own `kaola_script`).

### A.2 `commands/kaola-workflow-adapt.md:172` — `node scripts/kaola-workflow-claim.js authoring-allowed` (bare relative, no resolver).
### A.3 `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md:170` — `node scripts/kaola-gitlab-workflow-claim.js authoring-allowed`.
### A.4 `plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md:170` — `node scripts/kaola-gitea-workflow-claim.js authoring-allowed`.

## B. Canonical `kaola_script()` resolver blocks (verbatim, per edition — lift each from its OWN sibling phase1)

### B.1 github/claude — `commands/kaola-workflow-phase1.md` (lines 263 & 330, identical)
```
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
```
Script token: `kaola-workflow-claim.js`. Install dir: `$HOME/.claude/kaola-workflow/scripts/`.

### B.2 gitlab — `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase1.md` (263 & 330)
```
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
```
Script token: `kaola-gitlab-workflow-claim.js`. Install dir: `$HOME/.claude/kaola-workflow-gitlab/scripts/`.

### B.3 gitea — `plugins/kaola-workflow-gitea/commands/kaola-workflow-phase1.md` (263 & 330)
```
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
```
Script token: `kaola-gitea-workflow-claim.js`. Install dir: `$HOME/.claude/kaola-workflow-gitea/scripts/`.

## C. No gitlab/gitea adapt SKILL.md
The adapt skill exists ONLY at `plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md` (github/claude). gitlab/gitea ship no adapt skill.

## Fix-site summary for impl
- SKILL.md:112 → define github `kaola_script()` in the bash fence, rewrite call to `node "$(kaola_script kaola-workflow-claim.js)" authoring-allowed`.
- SKILL.md:125/142/153 → subagent-prompt prose; **OPEN DESIGN Q** (bare names vs `$(kaola_script …)`) — pending advisor reconcile.
- `commands/kaola-workflow-adapt.md:172` → github resolver block + rewrite call.
- gitlab adapt:170 → gitlab resolver block (`kaola-gitlab-workflow-claim.js`) + rewrite call.
- gitea adapt:170 → gitea resolver block (`kaola-gitea-workflow-claim.js`) + rewrite call.
