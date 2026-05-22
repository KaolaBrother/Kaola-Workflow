# Phase 3 - Plan: issue-153

Approach A (advisor-approved): resolve concrete model from the profile-applied SOURCE
agent file; rewrite every INSTALLED agent frontmatter `model:` to `inherit` at the copy
chokepoint. Command files keep concrete `model="sonnet|opus|haiku"`. Badge renders
because dispatched concrete differs literally from installed `inherit`.

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `install.sh` | add `agent_source_file()` + `install_managed_agent()` (cp + awk frontmatter rewrite, fail-fast); call helper at both copy sites (292 managed-update, 301 first-install); pivot `resolve_agent_model_for_install` line 366 to read source | core mechanism: installed frontmatter→inherit, resolution reads SOURCE |
| `scripts/test-install-model-rendering.js` | after line 65, read 9 installed `$tmp/.claude/agents/*.md`, assert frontmatter `model: inherit` + managed marker survives | F2 / AC-(a). NOT a COMMON_SCRIPT → no mirror |
| `scripts/validate-workflow-contracts.js` | add block-scoped `assertEveryDispatchHasModel` over the 7 phaseCommands | F3 drop-guard. COMMON_SCRIPT → MUST mirror |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` | byte-identical mirror of F3 edit | byte-identity contract (validate-script-sync COMMON_SCRIPTS) |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | same guard in commandFiles loop (~123-129) | F3 scope = all forges. NOT COMMON_SCRIPT → edit in place |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` | same guard in commandFiles loop (~122-128) | F3 scope = all forges. NOT COMMON_SCRIPT → edit in place |

VERIFIED facts (orchestrator): `$SOURCE_AGENTS_DIR` (source, install.sh:254/268-271),
`$AGENTS_DIR` (installed, 259/272/366); copy sites 292 & 301; resolver pivot line 366;
`extract_agent_model` (345-361) already path-parameterized with the exact frontmatter-toggle
awk idiom the rewrite mirrors; `MANAGED_AGENT_MARKER="kaola-workflow-managed-agent: true"`
(install.sh:38); command dispatch uses `Agent(` on its own line, `subagent_type=`/`model="{TOKEN}"`
indented, closed by `)` on its own line (commands/kaola-workflow-phase1.md:108,141) → the F3
block-walk regex matches. gitlab/gitea validators live ONLY under their plugin trees
(verified via find + package.json:38-39), NOT under scripts/.

### Build Sequence
1. T1 install.sh (mechanism; nothing depends on it being first to WRITE, but T2 RED proof precedes it — see TDD note).
2. T2 F2 test (RED first, then GREEN after T1 — see TDD discipline).
3. T3 F3 claude validator + byte-identical plugin mirror (independent of T1/T2).
4. T4 gitlab guard; T5 gitea guard (independent).
5. Final gate: `node scripts/simulate-workflow-walkthrough.js && npm test`.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1, T3 (2-file unit), T4, T5 | disjoint write sets: install.sh / contracts+mirror / gitlab / gitea |
| serial after T1 | T2 | reads files produced by T1's real install.sh run |

### External Dependencies
None. Pure bash (awk/mktemp/mv, POSIX, bash 3.2 safe — no `declare -A`, no `sed -i`) + Node hand-rolled assert.

## Task List

### Task 1: install.sh — source-read resolver + atomic inherit-rewrite chokepoint
- File: `install.sh`
- Test File: `scripts/test-install-model-rendering.js` (exercised in T2); `bash -n install.sh` syntax.
- Write Set: `install.sh`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. `agent_source_file()` helper (before `install_agent_files`), reusing the 268-271 profile logic with `$SOURCE_AGENTS_DIR`:
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
  2. `install_managed_agent()` helper — cp + frontmatter-scoped awk rewrite, FAIL-FAST (advisor fix):
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
       ' "$dest" > "$tmp" && mv "$tmp" "$dest" || { rm -f "$tmp"; echo "Failed to rewrite frontmatter: $dest" >&2; exit 1; }
     }
     ```
  3. Replace `cp "$source_file" "$dest"` at the managed-update branch (install.sh:292) with `install_managed_agent "$source_file" "$dest"`.
  4. Replace `cp "$source_file" "$dest"` at the first-install branch (install.sh:301) with `install_managed_agent "$source_file" "$dest"`.
  5. Leave marker grep (305-309) and `sha256_file` (311) UNCHANGED — they now operate on the rewritten file (F1: rewrite happens in-loop before 311).
  6. Pivot `resolve_agent_model_for_install` line 366: `extract_agent_model "$AGENTS_DIR/$agent.md"` → `extract_agent_model "$(agent_source_file "$agent")"`. Keep default_agent_model fallback (368) + inherit→empty branch (370-373) intact.
- Mirror: none (install.sh at repo root, not a COMMON_SCRIPT).
- Validate: `bash -n install.sh` (exit 0).

### Task 2: F2 — assert installed agents are `model: inherit` + managed marker survives
- File: `scripts/test-install-model-rendering.js`
- Test File: itself (integration test running real install.sh).
- Write Set: `scripts/test-install-model-rendering.js`
- Depends On: T1 (for GREEN)
- Parallel Group: serial after T1
- Action: MODIFY
- Implement: after line 65, inside the `try`, install target is `$HOME/.claude/agents/` with `HOME: tmp` (line 23):
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
- Mirror: none (NOT a COMMON_SCRIPT; absent from plugin tree).
- Validate: `node scripts/test-install-model-rendering.js` (prints "Install model rendering tests passed").

### Task 3: F3 — block-scoped drop-guard in claude validator + byte-identical plugin mirror
- File: `scripts/validate-workflow-contracts.js` AND `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`
- Test File: the validators themselves; `validate-script-sync.js` proves byte-identity.
- Write Set: `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (ONE task, TWO files, byte-identical, same commit)
- Depends On: none
- Parallel Group: A
- Action: MODIFY (both)
- Implement: add helper near other helpers, invoke inside the existing phaseCommands loop (67-76) after line 72:
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
  then `assertEveryDispatchHasModel(file);` inside the loop.
- Mirror: edit canonical `scripts/` copy, then `cp scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js`.
- Validate: `node scripts/validate-script-sync.js && node scripts/validate-workflow-contracts.js`.

### Task 4: F3 — gitlab drop-guard (edit in place, no mirror)
- File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Write Set: that file only. Depends On: none. Parallel Group: A. Action: MODIFY.
- Implement: same `assertEveryDispatchHasModel` helper + invoke inside the existing `commandFiles.filter(...startsWith('kaola-workflow-'))` loop (~123-129) after `assertIncludes(file,'model="{')`. Reuse the file's existing `read`/`assert` helpers.
- Mirror: none. Validate: `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`.

### Task 5: F3 — gitea drop-guard (edit in place, no mirror)
- File: `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- Write Set: that file only. Depends On: none. Parallel Group: A. Action: MODIFY.
- Implement: same helper + invoke inside the gitea `commandFiles.filter(...)` loop (~122-128).
- Mirror: none. Validate: `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`.

## TDD Discipline (advisor-required, Phase 4 MUST follow)
- **T2 RED-first**: write the F2 assertions and run `node scripts/test-install-model-rendering.js` BEFORE T1 — observe RED (installed agents still carry concrete `model: sonnet|opus|haiku`, so `/\bmodel:\s*inherit\b/` fails). Then implement T1, re-run, observe GREEN. Proves the assertion discriminates.
- **F3 negative-test (T3/T4/T5)**: after adding the guard, temporarily delete one `model="{..._MODEL}"` line from a command source (e.g. `commands/kaola-workflow-phase2.md:90`), run the validator, confirm it FAILS with the expected "Agent( dispatch block at line N missing a model=" message, then restore. Proves the block-walk matches the real dispatch syntax.

## Properties / Edge Cases (non-blocking, record only)
- F1 manifest-before-hash (BLOCKING ordering): rewrite inside `install_managed_agent`, called at 292/301, both before `sha256_file` at 311. Do NOT defer to a post-loop pass.
- Intentional re-install flow shift (document in PR): post-fix `cmp -s` (281) never matches (source concrete vs dest inherit) → all re-runs flow through the manifest path; recorded==current (rewritten hash) + marker present → re-copy via helper → idempotent. Not a regression.
- Source agent with no `model:` line: awk is a no-op, resolver falls to `default_agent_model` (correct legacy); T2 would correctly fail (malformed source flagged loudly). Desired property.
- awk first-frontmatter-block only: bodies contain prose mentioning `model:`; the `closed`/`replaced` toggle enforces first-block-only. Managed marker is in an HTML comment AFTER the closing `---` → preserved by the `{print}` catch-all.
- CHANGELOG `[Unreleased]` entry + README reinstall+restart note: Phase 6 doc-updater scope, NOT this write set.

## Out of Scope (explicit)
- `agents/*.md` + `agents/profiles/higher/*.md` SOURCE frontmatter `model:` values; `source-sha256`; `validate-vendored-agents.js`.
- `scripts/kaola-workflow-resolve-agent-model.js` + `scripts/test-agent-model-resolver.js` (verified off the badge path).
- `validate-script-sync.js` logic / COMMON_SCRIPTS list (only ADD the mirrored T3 copy).
- Command-source `model="{TOKEN}"` placeholders + `render_command_file` substitution (install.sh:390-424).
- `declare -A` (bash 4) and `sed -i`.
- Parallel-dispatch badge visibility (two `Agent` calls in one turn) — issue non-goal.

## Manual AC Verification (out of automated test scope — call out in PR)
Actual badge rendering requires a fresh `bash install.sh --profile=higher` into a real `$HOME` plus a Claude Code RESTART (agent frontmatter cached at session start), then dispatching a workflow subagent and visually confirming the model badge. `npm test` cannot exercise the live Claude Code UI.

## Advisor Notes
Plan APPROVED (`.cache/advisor-plan.md`). One plan-altering fix folded in: T1 awk fail-fast
(`&& mv ... || { rm -f "$tmp"; ...; exit 1; }`) so a failed awk can't clobber the agent with an empty
file. Two TDD procedural items recorded above. No architect revision required.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | advisor approved with no gaps requiring re-architecture; awk fail-fast + TDD items are synthesis of advisor feedback, not redesign |
