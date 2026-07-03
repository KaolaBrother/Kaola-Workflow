evidence-binding: n1-synth-install dc201cd2b923
<!-- RED: paste RED here -->
RED: `node scripts/test-install-model-rendering.js` (after adding `synthesizer` to the `requiredAgents` roster loop + a `manifest['synthesizer'] === 'opus'` assertion in the higher-profile manifest block, BEFORE touching install.sh/uninstall.sh) — failed with:
```
Error: ENOENT: no such file or directory, open '/var/folders/.../kaola-install-models-Xxq8up/.claude/agents/synthesizer.md'
    at Object.readFileSync (node:fs:440:20)
    at Object.<anonymous> (scripts/test-install-model-rendering.js:90:26)
```
Confirms install.sh never deployed `agents/synthesizer.md` into a fresh install's `.claude/agents/`, exactly the reported defect (`REQUIRED_AGENTS` omitted `synthesizer`).
<!-- GREEN: paste GREEN here -->
GREEN: added `synthesizer` to the `REQUIRED_AGENTS` array in both `install.sh` and `uninstall.sh` (appended after `issue-scout`, matching existing quoting/ordering style). Re-ran `node scripts/test-install-model-rendering.js`:
```
Install model rendering tests passed
```
`echo $?` → `EXIT_CODE=0`. All assertions green including the new roster-loop check (installed frontmatter is `model: inherit` + carries the managed marker) and the new higher-profile manifest assertion (`manifest['synthesizer'] === 'opus'`, sourced straight from `agents/synthesizer.md`'s `model: opus` frontmatter via `extract_agent_model` — no `profiles/higher/synthesizer.md` needed since the base file already pins opus). Also re-ran the full `node scripts/simulate-workflow-walkthrough.js` as a sanity check: `Workflow walkthrough simulation passed`, `EXIT_CODE=0`.

### Files changed
- `install.sh`: `REQUIRED_AGENTS` array — appended `"synthesizer"` (14 → 15 roles, now matching the Codex/opencode roster).
- `uninstall.sh`: `REQUIRED_AGENTS` array — same append, so uninstall now also removes the managed `synthesizer.md` and folds it into the "managed agent manifest still has entries" remaining-check.
- `scripts/test-install-model-rendering.js`: added `synthesizer` to the `requiredAgents` roster-loop array (line ~88) and a `manifest['synthesizer'] === 'opus'` assertion in the higher-profile `.kaola-agent-models.json` block (line ~149, right after the `workflow-planner` assertion).

### Surprises / notes
- No `agents/profiles/higher/synthesizer.md` was needed (as flagged in the task) — `agents/synthesizer.md`'s frontmatter already pins `model: opus` unconditionally, and `resolve_agent_model_for_install` / `extract_agent_model` read that directly regardless of `--profile`, so both higher and common profiles resolve synthesizer to opus.
- No command-file placeholder work was needed either: grepped `commands/*.md` for `SYNTHESIZER_MODEL` and found none (only narrative mentions of "synthesizer" in `kaola-workflow-plan-run.md` / `kaola-workflow-adapt.md` prose), so `install.sh`'s `render_command_file` placeholder list (12 entries) is untouched and correctly does not need a 13th placeholder.
- `default_agent_model()` (the sonnet/opus fallback table in install.sh) was left untouched — it's only consulted when a source file's frontmatter model is missing/empty, which is never the case for `synthesizer.md`.
