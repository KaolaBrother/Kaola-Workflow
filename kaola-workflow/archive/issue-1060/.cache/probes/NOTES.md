# #1060 probe recipes (fixed; execute as written, report deviations)

All probes run in `/tmp/kw-fusion-probe` created by `make-fixture.sh`. Never edit
`~/.config/devin/config.json`, `~/.config/devin/agents/`, or the live orchestrator session.
Model selection is always per invocation via `--model`. Auth in this shell is already
`Logged in (via Devin)`; use `env -i HOME=$HOME PATH=$PATH devin …` only if a child reports
`Not logged in`, and record that you did.

## F15/F16 parent catalog per model (non-interactive)

```
for m in fusion-claude-fable-5-1-high-sidekick-swe-2-medium fusion adaptive claude-fable-5-1-high gpt-6-astra-high swe-2-medium glm-5-3-high; do
  ./run-parent.sh "$m" "f15-$m"; done
```
Evidence per model: `out/f15-<m>.stdout.txt` (MODEL/TOOLS/SIDEKICK/PROFILES/markers), `out/f15-<m>.session`
(`sessions.model`), `out/f15-<m>.export.json` (grep `model_name`, `generation_model`), then
`./db-queries.sh <session-id>`.

## F17 mid-session `/model` switch (interactive, tmux)

tmux session `kw1060-f17`, cwd `/tmp/kw-fusion-probe`:
1. `devin --model fusion-claude-fable-5-1-high-sidekick-swe-2-medium --permission-mode auto`
2. Send the F15 prompt; capture pane → `out/f17-1-fusion.txt`.
3. `/model adaptive`; send the F15 prompt again; capture → `out/f17-2-adaptive.txt`.
4. `/model fusion-claude-fable-5-1-high-sidekick-swe-2-medium`; prompt again → `out/f17-3-fusion.txt`.
5. `/exit`. Record `sessions.model` for that session id (what the DB stores after switching).
Also test the resume path: `devin -r <session-id> --model adaptive -p "<F15 prompt>"` → `out/f17-4-resume-adaptive.txt`.

## F18–F22 sidekick facts (interactive Fusion child, tmux `kw1060-sk`)

Start `devin --model fusion-claude-fable-5-1-high-sidekick-swe-2-medium --permission-mode auto` in
`/tmp/kw-fusion-probe`. Prompts, one per turn, capture each reply to `out/f18-22-<n>.txt`:

1. F19/F20: `Use the sidekick tool with block true and this exact message: "Do not call any tool. Reply with: TOOLS=<your exact tool names>; PROFILES=<subagent profiles you can dispatch or NONE>; SIDEKICK=<YES/NO if you have a tool named sidekick>; RUN_SUBAGENT=<YES/NO>; AGENTS_MARKER=<count of KW-PROBE-PROJECT-AGENTS-MARKER-1060 in your context>; UPS_MARKER=<count of KW-PROBE-UPS-MARKER-1060>; RECOVERY_MARKER=<count of KW-COMPACT-RECOVERY-V2>; POWERED=<your 'You are powered by' sentence verbatim or NONE>". Paste its reply verbatim.`
2. F21a: `Use the sidekick tool, block true: "Run in your shell: cd /tmp && export KW_SK=alpha && (sleep 600 &) && echo PID=$! && pwd && echo KW_SK=$KW_SK". Paste the reply verbatim.`
3. F21b: `Use the sidekick tool, block true: "Run in your shell: pwd; echo KW_SK=$KW_SK; pgrep -f 'sleep 600' | head -3". Paste the reply verbatim.`
4. `/compact`
5. F21c: repeat prompt 3 → does the sidekick still remember cwd/env/process?
6. F22a: `Use the sidekick tool, block true: "Create the file /tmp/kw-fusion-probe/out/sk-write-fg.txt containing KW-SK-WRITE-FG. Report the exact tool result text."` (no prior write grant; observe whether the TUI prompts, auto-denies, or passes; capture the verbatim text).
7. F22b: `Use the sidekick tool with block false: "Create /tmp/kw-fusion-probe/out/sk-write-bg.txt containing KW-SK-WRITE-BG and report the exact tool result." Then wait for its report with read_subagent and paste it verbatim.`
8. F21d: `/exit`, then `devin -r <session-id>` in the same tmux window and send prompt 3 again → does the sidekick survive exit+resume?
8b. F17b (closes the F17 unknown): still in the resumed session, `/model adaptive`, wait for `✓ Model set to Adaptive`, then send: `Use the sidekick tool with block true and the message "Reply with exactly: SK_AFTER_SWITCH_OK and your 'You are powered by' sentence". Paste the result verbatim, or the exact error if the tool is unavailable.` Capture → `out/f17b-sidekick-after-switch.txt`. Then `/model fusion-claude-fable-5-1-high-sidekick-swe-2-medium` and repeat once → `out/f17b-sidekick-after-switch-back.txt`.
9. Run `./db-queries.sh <session-id>` → `out/f18-db.txt`. F18 is the sidekick chain's `powered by` line
   (`subagent_heads` gives the chain node; the sidekick's system node is the root of that chain).
10. `out/hooks.log`: count `UPS` lines vs user prompts sent (did the hook fire for sidekick turns?),
    and list `PRE tool=` names (does `sidekick` appear as a tool_name?).

## F23–F25 subagent routing under a Fusion parent (non-interactive)

Prompt file `out/f23-prompt.txt`:
```
Dispatch these subagent profiles one at a time in the foreground with the prompt "go", and paste each reply verbatim under a heading with the profile name: kwp-unpinned, kwp-fable, kwp-fable-full, kwp-swe, kwp-swe-full, kwp-fusion, kwp-fusion-full, kwp-astra, kwp-gpt, kwp-astra-full, kwp-adaptive, subagent_general. If a dispatch fails, paste the exact error text. Do nothing else.
```
`./run-parent.sh fusion-claude-fable-5-1-high-sidekick-swe-2-medium f23-fusion-parent out/f23-prompt.txt`
then `./db-queries.sh <session-id>` → `out/f23-db.txt`: one `powered by` line per child chain is the model carrier
per `model:` value (F25) and for the unpinned profile (F23) and `subagent_general` (F24).
Repeat once with `--model adaptive` as `f23-adaptive-parent` for the control.
`devin doctor --json` run from `/tmp/kw-fusion-probe` → `out/f25-doctor.json` (does it validate `model:` values?).

## F26 installer checks under Fusion

From the main repo root (not the fixture): `./install-devin.sh --check --forge=github > out/f26-devin-check.txt 2>&1;
./install-all.sh --check > out/f26-all-check.txt 2>&1`. Record exit codes. Read-only by contract; confirm `git status --short` is unchanged after.

## F27 cross-session resume

Owned by the orchestrator: snapshot `kaola-workflow/issue-1060/mission-list.md` to `out/f27-before.md`, exit the
Fusion session, start `devin --model adaptive` in the repo, run `/workflow-next`, snapshot again to `out/f27-after.md`,
and record the resumed parent's `MODEL=` answer and `sessions.model`.

## F28 cost visibility

Already captured: `kaola-workflow/issue-1060/.cache/devin-models-list.txt` (prices per id). Add: every `cogs_json`
and `metadata` field on the probe sessions (`sqlite3 … "select cogs_json, metadata from sessions where id=…"`),
and any usage/billing field in the exports. Record verbatim; no arithmetic.

## Cleanup (last mission)

`rm -rf /tmp/kw-fusion-probe`; `tmux kill-session -t kw1060-f17; tmux kill-session -t kw1060-sk`;
`devin doctor --json` must again read exactly the 14 Kaola names. Copy `out/` into
`kaola-workflow/issue-1060/.cache/out/` before deleting the fixture.
