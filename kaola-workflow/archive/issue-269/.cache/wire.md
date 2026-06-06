# Wire Evidence — issue-269 (node: wire)

## Summary of changes

### 1. `commands/kaola-workflow-plan-run.md` (canonical)

- **Location**: Line 198, inside the step-3 contractor prompt string.
- **What**: Inserted `(e) SELECTOR ROUTING` sub-step after `(d) FUSED ADVANCE`'s closing clause (`...report the condition and stop (the orchestrator owns the halt).`) and before the final `Do NOT dispatch a role...` sentence.
- **Text inserted**: `(e) SELECTOR ROUTING — ONLY IF \`selectorCheck.isSelector === true\` AND \`selectorCheck.ok === true\` (barrier already exited 0 above): read \`selectorCheck.armsToNa\` from the barrier JSON. For each arm-id in \`armsToNa\`, write its \`## Node Ledger\` row to \`n/a\` with note \`selected: <selectorCheck.selected> (not this arm)\`. These writes MUST happen BEFORE the fused advance in (d) so \`next-action\` sees the n/a rows as TERMINAL when computing the new ready set. If \`selectorCheck.ok === false\` (missing/foreign selector), do NOT mark any arm n/a — report the condition and stop (the orchestrator owns the halt). Non-selector nodes (\`selectorCheck.isSelector === false\`) require no action.`

### 2. `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` (Codex mirror)

- **Location**: Lines 106-107 (in the step 3 prose paragraph).
- **What**: Inserted selector routing paragraph between `Never mark a gate row \`n/a\` while a node it post-dominates reached \`complete\`.` and `**Then, ONLY IF the barrier exited 0**...`.
- **Text inserted**: `**Selector routing (ONLY when \`selectorCheck.isSelector === true\` and \`selectorCheck.ok === true\`):** read \`selectorCheck.armsToNa\` from the barrier JSON. For each arm-id in that list, write its \`## Node Ledger\` row to \`n/a\` with note \`selected: <selectorCheck.selected> (not this arm)\`. These writes MUST precede the fused advance so \`next-action\` sees them as TERMINAL. If \`selectorCheck.ok === false\` (missing/foreign selector), do NOT mark any arm — report and stop (the orchestrator owns the halt). Non-selector nodes (\`selectorCheck.isSelector === false\`) require no action.`

### 3. `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` (Gitea edition)

- **Location**: Line 198, inside the step-3 contractor prompt string (uses `kaola-gitea-workflow-commit-node.js`).
- **What**: Same `(e) SELECTOR ROUTING` text as file 1 — identical verbatim, no localization.

### 4. `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` (GitLab edition)

- **Location**: Line 198, inside the step-3 contractor prompt string (uses `kaola-gitlab-workflow-commit-node.js`).
- **What**: Same `(e) SELECTOR ROUTING` text as file 1 — identical verbatim, no localization.

### 5. `docs/api.md`

- **Location**: After line 397 (the `--node-id requires a value` bullet) and before line 399 (`## Contractor Agent`).
- **What**: Inserted new `## Selector routing — orchestrator contract` section (lines 399–431 in the updated file) with:
  - Three JSON shape examples (non-selector, valid selector, fail-closed selector)
  - Contractor protocol (3-step numbered list)
  - How n/a rows interact with `next-action` (depends_on + allDone predicates)
  - Resume re-entry paragraph

## Verification

- All three command files (1, 3, 4): `(e) SELECTOR ROUTING` is inline in the one-line prompt string, after `(d)` and before the final `Do NOT dispatch...` sentence. Confirmed by re-read at line 198.
- SKILL.md (file 2): Selector routing prose inserted between `Never mark a gate row n/a...` and `**Then, ONLY IF the barrier exited 0**...`, without introducing blank lines that would split the paragraph. Confirmed by re-read at lines 106-108.
- docs/api.md (file 5): New section at lines 399-431, anchored between early-refuse note and `## Contractor Agent`. Inner `\`\`\`json` fences preserved; outer `\`\`\`markdown` wrapper not included. Confirmed by re-read.
