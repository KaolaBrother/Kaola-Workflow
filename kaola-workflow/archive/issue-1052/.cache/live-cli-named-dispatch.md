# Isolated live Cursor CLI named-dispatch probe

candidate: `b39af460a0ac1abf094795ef49bf29b9c18badac`
disposable consumer: `/private/var/folders/j6/8368yp9j35597_g9_f148lz00000gn/T/kw-1052-live-consumer-zp6Mb9`
isolated `install-cursor.sh --global --yes --forge=github` into `/tmp/kw-1052-live-cli-probe/cursor-home` (prep only)
new process: `/Users/ylpromax5/.local/bin/cursor-agent --workspace <consumer> --print --output-format stream-json --trust --force --sandbox disabled`
did_not_mutate: user consumer repos, Runner, Kaola-Workflow worktree
did_not_invent: `CURSOR_PRODUCT` / `KAOLA_CURSOR_*` / `CURSOR_WORKSPACE`
session_id: `94906da5-dbf8-40cb-b6a6-0548a4a1fb3e`

## Prep (living CLI-shaped parent + unstamped `startup --runtime cursor`)

claim json included `claim: acquired` and
`cursor_prep: { status: materialized, target: <consumer>, restart_boundary: new_process_same_chat }`.
Project files present: `.cursor/agents/implementer.md`, `.cursor/agents/investigator.md`.

## New-process named dispatch

Parent prompt required `Task` `subagent_type=investigator` and omit per-call `model`.
Child `agentId` `64ccf736-70f5-4175-8498-d45febfe6196` replied exactly `KW1052-LIVE-NAMED-DISPATCH-OK` (`durationMs` 3561).
Print encoding of the call:

- `subagentType.custom.name`: `investigator` (provider encoding, not the controller flat field)
- `model`: `cursor-grok-4.6-medium` (resolved profile default on this CLI; parent instructed omit-model; stream-json does not prove the controller JSON omitted the field)

`cursor-agent` parent model in init was `Cursor Grok 4.6 Extra High` (this is the parent, not the Task per-call pin).

verdict: pass for “new process can see and dispatch a named role after normal-entry prep”.
known_unknown: stream-json always showing a resolved Task `model` vs controller omit-model wire.
