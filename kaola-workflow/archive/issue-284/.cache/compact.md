# Node: compact — SessionStart output-format guard

## task
Add a code comment documenting the SessionStart/compact output contract decision (issue #284 Fact A: keep plain stdout, no envelope wrap) to each of the 3 Codex compact-resume scripts.

## non_tdd_reason
**Config / documentation / code-comment addition** — this node adds explanatory comments to 3 existing scripts without changing any executable behavior. No behavioral logic is added or removed; the output path is identical before and after. Proof = syntax-check green + regression smoke (plain stdout, exit 0) before and after.

## write_set
- plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js

## verification_commands

### Syntax check (before + after — all 3 scripts)
```
node -c plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
node -c plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js
node -c plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js
```

### Regression smoke: empty-stdin, no active workflow (early-return path)
```
echo '' | node plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js
echo '' | node plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js
echo '' | node plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js
```

### Regression smoke: with minimal workflow-state (active-project path)
Run from /tmp/test-compact-284b (contains kaola-workflow/testproj/workflow-state.md):
```
echo '' | node <script>
```

## before_result
All 3 scripts: syntax-check exit 0; run with empty/minimal stdin exits 0 and emits plain-text resume packet (no envelope).

## after_result
All 3 scripts: syntax-check exit 0; run with empty stdin exits 0 (no output, early-return path). Run from active-workflow dir exits 0 and emits:
```
Kaola-Workflow compact resume:
active project: unknown
next skill/command: /kaola-workflow-plan-run
in-progress node: none
pending gates: none
consent-halt markers: consent_halt=none escalated_to_full=false inline_emergency_fallback_authorized=false
task mirror: not generated
```
Output is PLAIN TEXT — no JSON envelope. Behavior is unchanged; only the 4-line comment was inserted above each `process.stdout.write(...)` call.

## regression-green
All checks passed. Exit codes: github-syntax:0, gitlab-syntax:0, gitea-syntax:0, github-run:0, gitlab-run:0, gitea-run:0.
