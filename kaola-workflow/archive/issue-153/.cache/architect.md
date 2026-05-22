# code-architect — issue-153 executable blueprint (agent a8a672fa253f18c58, model=opus, 2026-05-22)

Approach A (advisor-approved). Resolve concrete model from profile-applied SOURCE agent file;
rewrite every INSTALLED agent frontmatter `model:` to `inherit` at the copy chokepoint. Command
files keep concrete `model="sonnet|opus|haiku"`; badge renders because dispatched concrete differs
literally from installed `inherit`.

## Design decisions
- D1: pivot `resolve_agent_model_for_install` (install.sh:366) to read profile-applied SOURCE, not installed.
- D2: centralize profile selection in `agent_source_file <agent>` (reuse install.sh:269-271 logic).
- D3: atomic cp+rewrite chokepoint `install_managed_agent`; rewrite BEFORE sha256_file at 311 (F1 BLOCKING).
- D4: awk frontmatter-scoped rewrite (`/^---$/` toggle), no `sed -i` (bash3.2/BSD/GNU); managed marker is
  in HTML comment AFTER closing `---` → preserved by catch-all `{print}`.
- D5: F3 drop-guard is BLOCK-scoped not file-scoped (existing `assertIncludes(file,'model="{')` at line 72
  is weak — survives a dropped line if any block still has one).

## Files to Create: NONE (confirmed).

## Files to Modify
| File | Change | Why |
|---|---|---|
| install.sh | add `agent_source_file()` + `install_managed_agent()`; call helper at copy sites 292 & 301; pivot resolver line 366 | core mechanism |
| scripts/test-install-model-rendering.js | after line 65, read 9 installed `$tmp/.claude/agents/*.md`, assert `model: inherit` + managed marker | F2/AC-a + advisor#3. NOT a COMMON_SCRIPT → no mirror |
| scripts/validate-workflow-contracts.js | add block-scoped F3 drop-guard over 7 phaseCommands (57-65 loop 67-76) | F3. COMMON_SCRIPT → MUST mirror |
| plugins/kaola-workflow/scripts/validate-workflow-contracts.js | byte-identical mirror of F3 edit | byte-identity contract |
| plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js | same guard in commandFiles loop 123-129 | F3 all-forge. NOT COMMON_SCRIPT → in place |
| plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | same guard in commandFiles loop 122-128 | F3 all-forge. NOT COMMON_SCRIPT → in place |

## PATH CORRECTION (VERIFIED by orchestrator via find + package.json:38-39)
gitlab/gitea validators live under `plugins/kaola-workflow-{gitlab,gitea}/scripts/`, NOT `scripts/`.
The Phase 2 write-set path was stale. These two are NOT COMMON_SCRIPTS → edited in place, no mirror.

## Build Sequence
1. T1 install.sh (mechanism). 2. T2 F2 test (depends T1). 3. T3 F3 claude+mirror (independent).
4. T4 gitlab (independent). 5. T5 gitea (independent). Final: npm test.

## Task List

### T1 — install.sh: source-read resolver + atomic inherit-rewrite chokepoint
- Write set: install.sh only. Depends: none. Parallel group A. Action: MODIFY.
- Implement:
  1. `agent_source_file()` helper (before install_agent_files):
     ```bash
     agent_source_file() {
       local agent="$1"; local file_name="$agent.md"
       local source_file="$SOURCE_AGENTS_DIR/$file_name"
       if [[ "$PROFILE" == "higher" && -f "$SOURCE_AGENTS_DIR/profiles/higher/$file_name" ]]; then
         source_file="$SOURCE_AGENTS_DIR/profiles/higher/$file_name"
       fi
       printf '%s\n' "$source_file"
     }
     ```
     NOTE: implementer must confirm the source-agents-dir variable name actually used in install.sh
     (architect assumed `$SOURCE_AGENTS_DIR`; the copy loop at 268-271 references the real var — match it).
  2. `install_managed_agent()` helper:
     ```bash
     install_managed_agent() {
       local source="$1"; local dest="$2"
       cp "$source" "$dest"
       local tmp; tmp="$(mktemp)"
       awk '
         BEGIN { in_fm=0; closed=0; replaced=0 }
         NR==1 && $0=="---" { in_fm=1; print; next }
         in_fm && !closed && $0=="---" { closed=1; in_fm=0; print; next }
         in_fm && !closed && !replaced && $0 ~ /^[[:space:]]*model[[:space:]]*:/ {
           match($0, /^[[:space:]]*model[[:space:]]*:[[:space:]]*/)
           print substr($0,1,RLENGTH) "inherit"; replaced=1; next
         }
         { print }
       ' "$dest" > "$tmp"
       mv "$tmp" "$dest"
     }
     ```
  3. Replace `cp "$source_file" "$dest"` at managed-update branch (~292) with `install_managed_agent "$source_file" "$dest"`.
  4. Replace `cp "$source_file" "$dest"` at first-install branch (~301) with `install_managed_agent "$source_file" "$dest"`.
  5. Marker grep (305-309) + sha256_file (311) UNCHANGED — now operate on rewritten file. Do NOT move 311.
  6. Pivot line 366: `extract_agent_model "$AGENTS_DIR/$agent.md"` → `extract_agent_model "$(agent_source_file "$agent")"`. Keep default_agent_model fallback (368) + inherit→empty branch (370-373).
- Validate: `bash -n install.sh`.

### T2 — F2: assert installed agents inherit + managed marker survives
- Write set: scripts/test-install-model-rendering.js only. Depends: T1. Serial after T1. MODIFY.
- Implement: after line 65, inside try, install target agents at `$HOME/.claude/agents/` (HOME=tmp at line 23):
  ```js
  const requiredAgents = ['code-explorer','docs-lookup','planner','code-architect','tdd-guide',
    'build-error-resolver','code-reviewer','security-reviewer','doc-updater'];
  for (const agent of requiredAgents) {
    const installed = fs.readFileSync(path.join(tmp,'.claude','agents',agent+'.md'),'utf8');
    const fmEnd = installed.indexOf('\n---', 3);
    const frontmatter = installed.slice(0, fmEnd === -1 ? installed.length : fmEnd);
    assert(/\bmodel:\s*inherit\b/.test(frontmatter), agent+' installed frontmatter must be model: inherit');
    assert(installed.includes('kaola-workflow-managed-agent: true'), agent+' installed file must keep managed marker');
  }
  ```
- Mirror: none. Validate: `node scripts/test-install-model-rendering.js`.

### T3 — F3 block-scoped drop-guard: claude validator + byte-identical plugin mirror (ONE task, TWO files)
- Write set: scripts/validate-workflow-contracts.js + plugins/kaola-workflow/scripts/validate-workflow-contracts.js (BOTH, byte-identical, same commit). Depends: none. Parallel A. MODIFY both.
- Implement: add helper near other helpers, invoke inside phaseCommands loop (67-76) after line 72:
  ```js
  function assertEveryDispatchHasModel(file) {
    const lines = read(file).split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!/^Agent\(\s*$/.test(lines[i])) continue;
      let hasSubagent = false, hasModel = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\)\s*$/.test(lines[j])) break;
        if (/subagent_type="[^"]+"/.test(lines[j])) hasSubagent = true;
        if (/model="\{[A-Z_]+_MODEL\}"/.test(lines[j])) hasModel = true;
      }
      assert(!hasSubagent || hasModel,
        file + ' has an Agent( dispatch block at line ' + (i+1) + ' missing a model="{..._MODEL}" line');
    }
  }
  ```
  Then `assertEveryDispatchHasModel(file);` inside the loop.
  NOTE: implementer must confirm command files actually use the `Agent(\n` multi-line form with `)` on
  its own line. If the templates use `Task(` or a different shape, adapt the open/close regex to match the
  real dispatch syntax in commands/*.md before asserting (read a command file first).
- Mirror method: edit canonical scripts/ copy, then `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
- Validate: `node scripts/validate-script-sync.js && node scripts/validate-workflow-contracts.js`.

### T4 — F3 gitlab (edit in place, no mirror)
- Write set: plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js only. Depends none. Parallel A. MODIFY.
- Implement: same helper; invoke in commandFiles.filter(...startsWith('kaola-workflow-')) loop (123-129) after `assertIncludes(file,'model="{')`. Validator's read/assert helpers exist (18-20, 61-63).
- Validate: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`.

### T5 — F3 gitea (edit in place, no mirror)
- Write set: plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js only. Depends none. Parallel A. MODIFY.
- Implement: same helper + invocation in gitea commandFiles.filter loop (122-128).
- Validate: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`.

## Parallelization
Group A (disjoint write sets): T1, T3 (2-file unit), T4, T5. Serial after T1: T2.
Final gate: `node scripts/simulate-workflow-walkthrough.js && npm test`.

## Edge cases / ordering risks
1. F1 manifest-before-hash (BLOCKING): rewrite inside install_managed_agent, called at 292/301 before 311.
2. Intentional re-install flow shift (document in PR): cmp(281) never matches post-fix → all re-runs via
   manifest path; recorded==current (rewritten hash) → idempotent. Not a regression.
3. awk first-frontmatter-block only (bodies mention model: in prose).
4. preserve managed marker (HTML comment after closing ---), source-sha256, name, description; match()/RLENGTH
   preserves key prefix + indentation.
5. bash 3.2: no declare -A, no sed -i; awk→mktemp→mv, POSIX-only.
6. F3 block-scoped not file-scoped.
7. mirror byte-identity: only validate-workflow-contracts.js mirrors; gitlab/gitea do NOT.

## Out of scope
agents/*.md + profiles/higher/*.md source model: values; source-sha256 + validate-vendored-agents.js;
kaola-workflow-resolve-agent-model.js + test-agent-model-resolver.js (off-path); validate-script-sync.js
logic/COMMON_SCRIPTS; command-source {TOKEN} placeholders + render_command_file; declare -A / sed -i;
parallel-dispatch badge visibility (non-goal).

## Validation
Per-task above. Manual: `bash -n install.sh`. Final: `node scripts/simulate-workflow-walkthrough.js`,
`npm test`. Manual AC (out of automated scope, call out in PR): fresh `bash install.sh --profile=higher`
into real $HOME + Claude Code restart, dispatch a subagent, visually confirm the model badge.
