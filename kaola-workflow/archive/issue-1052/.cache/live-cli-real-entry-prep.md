# Isolated real Cursor CLI normal-entry prep + named dispatch

candidate: `b39af460a0ac1abf094795ef49bf29b9c18badac`
disposable consumer: `/private/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-real-entry-consumer-mYhsG1`
isolated `install-cursor.sh --global --yes --forge=github` into `/tmp/kw-1052-real-entry-probe/cursor-home`
did_not_mutate: user consumer repos, Runner, Kaola-Workflow worktree
did_not_invent: `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`
did_not_use: fake CLI-shaped parent, helper `--ensure-target` before the CLI, controller `--product`/`--host`/`--cursor-workspace`

## Real CLI process ran the generated Next first fence

process: `/Users/ylpromax5/.local/bin/cursor-agent --workspace <consumer> --print --output-format stream-json --trust --force --sandbox disabled`
pid: `23641`
ps args: `bash /Users/ylpromax5/.local/bin/cursor-agent --workspace /private/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-real-entry-consumer-mYhsG1 --print --output-format stream-json --trust --force --sandbox disabled You are in a disposable empty git consumer used only for Kaola-Workflow issue 1052 live proof. Do not edit files except by running the generated Workflow startup fence below. Do not create .cursor/agents yourself. Do not run install-cursor.sh. Do not run --ensure-target. Do not add --product, --host, --cursor-workspace, or any identity flags to claim.js. Do not export CURSOR_PRODUCT, CURSOR_HOST, KAOLA_CURSOR_*, or CURSOR_WORKSPACE. Your only job: use your Shell tool to run this exact command from the current workspace: bash "/tmp/kw-1052-real-entry-probe/kw-1052-generated-startup.sh" Return the command stdout verbatim, including any JSON. Then stop. Do not dispatch a named Task.`
agents before tool call: `false`
agents after tool call: implementer=true investigator=true
claim JSON from the real CLI Shell stdout (embedded in the `--print` result text): `claim: acquired`, `cursor_prep.status: materialized`, `cursor_prep.target: <consumer>`, `cursor_prep.restart_boundary: new_process_same_chat`, `selected_project: bundle-10529`
parser note: a naive last-JSON-line scan of stream-json reported `stdoutHasClaim=false` because the claim object lived inside the result string, not as a top-level JSON line
parent chain includes `cursor-agent` and `--workspace`: `true`
wrapper (probe-scoped, not claim.js flags): isolated `CURSOR_HOME`, forge mocks, `KAOLA_TARGET_ISSUES=10529`; explicitly unset `CURSOR_PRODUCT` / `CURSOR_HOST` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`
ancestor dump was taken in the same Shell immediately before the generated fence (`python3 -` is hop 0 of that dump, not a fake CLI). `claim.js` then ran under that bash → Cursor Shell zsh → this `cursor-agent --workspace <consumer>`. Hop 6 is the parent Kaola-Workflow CLI and does not share git identity with the consumer.
generated fence file: `/tmp/kw-1052-real-entry-probe/generated-startup-fence.sh`
ancestor dump: `/tmp/kw-1052-real-entry-probe/prep-diag/ancestors.txt`
stream-json: `/tmp/kw-1052-real-entry-probe/prep-agent.jsonl`

### Ancestor hops inside the Shell

```
0 pid=33846 ppid=33824 args=python3 -
1 pid=33824 ppid=33791 args=bash /tmp/kw-1052-real-entry-probe/kw-1052-generated-startup.sh
2 pid=33791 ppid=23641 args=/bin/zsh -c builtin export PATH="/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"; snap=$(command cat <&3); builtin unsetopt aliases 2>/dev/null; builtin unalias -m '*' 2>/dev/null || true; builtin eval "$snap" && { builtin unsetopt nounset 2>/dev/null || true; builtin eval "${__CURSOR_SANDBOX_ENV_RESTORE:-}" 2>/dev/null; builtin export PWD="$(builtin pwd)"; builtin setopt aliases 2>/dev/null; alias sudo='sudo -A'; builtin eval "$1" < /dev/null; }; COMMAND_EXIT_CODE=$?; dump_zsh_state >&4; builtin exit $COMMAND_EXIT_CODE -- bash "/tmp/kw-1052-real-entry-probe/kw-1052-generated-startup.sh"
3 pid=23641 ppid=22901 args=/Users/ylpromax5/.local/bin/cursor-agent --use-system-ca /Users/ylpromax5/.local/share/cursor-agent/versions/2026.09.02-c22c1a3/index.js --workspace /private/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-real-entry-consumer-mYhsG1 --print --output-format stream-json --trust --force --sandbox disabled You are in a disposable empty git consumer used only for Kaola-Workflow issue 1052 live proof. Do not edit files except by running the generated Workflow startup fence below. Do not create .cursor/agents yourself. Do not run install-cursor.sh. Do not run --ensure-target. Do not add --product, --host, --cursor-workspace, or any identity flags to claim.js. Do not export CURSOR_PRODUCT, CURSOR_HOST, KAOLA_CURSOR_*, or CURSOR_WORKSPACE. Your only job: use your Shell tool to run this exact command from the current workspace: bash "/tmp/kw-1052-real-entry-probe/kw-1052-generated-startup.sh" Return the command stdout verbatim, including any JSON. Then stop. Do not dispatch a named Task.
4 pid=22901 ppid=22847 args=node /tmp/kw-1052-real-entry-probe.js
5 pid=22847 ppid=94434 args=/bin/zsh -c builtin export PATH="/usr/bin:/bin:/usr/sbin:/sbin${PATH:+:$PATH}"; snap=$(command cat <&3); builtin unsetopt aliases 2>/dev/null; builtin unalias -m '*' 2>/dev/null || true; builtin eval "$snap" && { builtin unsetopt nounset 2>/dev/null || true; builtin eval "${__CURSOR_SANDBOX_ENV_RESTORE:-}" 2>/dev/null; builtin export PWD="$(builtin pwd)"; builtin setopt aliases 2>/dev/null; alias sudo='sudo -A'; builtin eval "$1" < /dev/null; }; COMMAND_EXIT_CODE=$?; dump_zsh_state >&4; builtin exit $COMMAND_EXIT_CODE -- node /tmp/kw-1052-real-entry-probe.js
6 pid=94434 ppid=94330 args=/Users/ylpromax5/.local/bin/cursor-agent --use-system-ca /Users/ylpromax5/.local/share/cursor-agent/versions/2026.09.02-c22c1a3/index.js --workspace /Users/ylpromax5/Workspace/Kaola-Workflow --model cursor-grok-4.6-xhigh
7 pid=94330 ppid=25645 args=/Users/ylpromax5/miniforge3/bin/python3 /Users/ylpromax5/Workspace/kaola-project-runner/skills/cursor-cli-kaola-project-runner/scripts/kaola-pane-relay.py --tmux-bin /opt/homebrew/bin/tmux --session cursor-cli-kaola-issue-1052 --pane-id %181 --repo /Users/ylpromax5/Workspace/Kaola-Workflow --runtime-path /Users/ylpromax5/.local/bin/cursor-agent --exact-process-title  -- --workspace /Users/ylpromax5/Workspace/Kaola-Workflow --model cursor-grok-4.6-xhigh
8 pid=25645 ppid=1 args=/opt/homebrew/bin/tmux new-session -d -s grok-kaola-kaolaterminal -c /Users/ylpromax5/Workspace/kaolaterminal
```

## New-process named dispatch at the same prepared workspace

pid: `40492`
session_id: `0515d885-ad97-400d-8d17-6a05f0c7e0e0`
exit: `0`
marker present: `true`
investigator mentioned: `true`
child `agentId` `24ed6482-f96f-4ae7-b280-c6a7c915542c` replied `KW1052-LIVE-NAMED-DISPATCH-OK` (`durationMs` 5390)
print encoding of the call: `subagentType.custom.name=investigator` (provider encoding); resolved Task `model: cursor-grok-4.6-medium` (profile default). Parent instructed omit-model; stream-json does not prove the controller JSON omitted `model`.
stream-json: `/tmp/kw-1052-real-entry-probe/dispatch-agent.jsonl`
known_unknown: stream-json may show a resolved Task model even when the parent omitted the field. Same-process hot load was not claimed.

verdict: pass
