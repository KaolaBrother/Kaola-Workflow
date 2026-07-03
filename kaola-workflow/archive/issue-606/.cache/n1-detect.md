evidence-binding: n1-detect 0457e8b88cc3
<!-- RED: paste RED here -->
RED: `node scripts/test-install-model-rendering.js` (leg `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/legs/issue-606/n1-detect`) — added 3 `#606` posture cases to the new block (spawnSync + tmpdir sandboxing, following the file's existing convention). Ran BEFORE any install.sh change:

```
AssertionError [ERR_ASSERTION]: #606: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 must report claude_dispatch_posture: teams; got: Kaola-Workflow — installer
Forge: github
...
Disjoint parallel writes are default-ON (set KAOLA_PARALLEL_WRITES=0 to force serial).

Hooks installed to: .../.claude/kaola-workflow/hooks/hooks.json
...
    at scripts/test-install-model-rendering.js:502:7
EXIT_CODE=1
```
Failed exactly as expected: `claude_dispatch_posture:` never appeared in install.sh's stdout because the detection did not exist yet.

<!-- GREEN: paste GREEN here -->
GREEN: added `detect_claude_dispatch_posture()` to `install.sh` (env-var probe `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` first, else a python3 scan of `~/.claude/settings.json` / `$PWD/.claude/settings.json` / `$PWD/.claude/settings.local.json` `"env"` blocks for the same flag, else `classic`; read-only, never fatal) plus a report block in the post-install summary printing `claude_dispatch_posture: <teams|classic>` and, when `classic`, the classic-led remediation (leads with "Classic subagents ... are always available", then names agent teams as experimental and `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in a settings `"env"` block).

```
$ node scripts/test-install-model-rendering.js
Install model rendering tests passed
EXIT_CODE=0

$ bash -n install.sh
bash -n EXIT_CODE=0
```
4/4 new `#606` assertions green (env-var teams; classic default + remediation wording; settings-file fallback teams; settings.json byte-unchanged after install), plus the full pre-existing suite in the same run (all prior assertions in `test-install-model-rendering.js` still pass — no regression).

Also ran `node scripts/simulate-workflow-walkthrough.js` per task instruction: exits 0, "Workflow walkthrough simulation passed" (full log tail confirms). Checked first — install.sh is NOT exercised by that suite (no `install.sh`/`execFileSync`/`spawnSync` invocation of it anywhere in `scripts/simulate-workflow-walkthrough.js`; the two `install.sh` string hits are write-set fixture literals, not actual invocations), so this run is a clean regression check only, not additional install.sh coverage.

Surprises: none structural. Two design calls worth flagging for n2/n3: (1) "project" settings scope for install.sh is `$PWD` (the invoking shell's cwd) since install.sh never `cd`s away from it, even in curl|bash re-exec mode — this matches Claude Code's real project-settings resolution (cwd-relative), distinct from `$SCRIPT_DIR` (which can be a throwaway clone dir). (2) printed report line format is `claude_dispatch_posture: teams|classic` (snake_case key, matching the literal substring required) under a human header line `Kaola-Workflow Claude dispatch posture:` — deliberately never carries an issue number in the echoed text (only in bash comments), consistent with the provenance-in-comments-only convention already used throughout install.sh (`#538`, `#363`, `#2 / D-542-01`, etc. all live in comments, never in `echo` strings).
