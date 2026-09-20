# Issue #1079 M7 — live ZCode ACP legs (candidate evidence)

Date: 2026-09-20. Fixture: `/tmp/kw1079-zcode-live-GDFeAR` (isolated empty Git repository).
Skills under test: deployed into the fixture at PROJECT scope (`.zcode/skills/`) by the
candidate `install-zcode.sh` from worktree `.kw/worktrees/bundle-1079` — i.e. the exact
deliverable bytes, not a hand-staged copy.

## Environment

- ZCode app-server: `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` (installed
  ZCode 3.12.3), node `/opt/homebrew/bin/node` v24.18.0.
- ACP adapter: `kaola-project-runner/skills/zcode-kaola-project-runner/scripts/kaola-zcode-acp.py`,
  version 0.3.3, SHA-256 `d120761356f4f4bde71c4df4949b852d883d3ec6f686917145902bb2e1dc1b5a`
  (the same adapter generation that produced the upstream KPR #94 matrix).
- Mode `yolo`; real GLM account provider. Transport ACP only; no PTY; no credentials in receipts.
- No tracked project files changed; no other session/issue touched; real `~/.zcode` untouched
  (fixture `ZCODE_HOME` used for the deploy step; sessions ran with the user's normal config).

## Result matrix

| # | Leg | Observation | Verdict |
|---|---|---|---|
| 1 | Unique-marker probe (`/kw1079-probe`, fixture-only skill) | ACP `tool_call title=Skill` pending→in_progress→completed (session A events L11-13); `final_text` = `KW1079-PROBE-MARKER-7f3d9a` verbatim | PASS — native Skill invocation loads the body |
| 2 | Initial `/kaola-workflow-next` | `Skill` tool_call triple (A L22-24); model then executed Workflow Next intake (freshness, `list-open`, empty-backlog no-claim stop) and printed the procedure's exact status block | PASS — candidate skill discovered and loaded natively, body authoritative |
| 3 | Manual `/compact` | `turn_completed`, zero failed tools; ACP exposes no compact-specific event (none claimed) | PASS |
| 4 | `/kaola-workflow-next` after compact | a FRESH `Skill` tool_call triple (A L67-69) + correct intake behavior | PASS — post-compact native reload |
| 5 | `/kaola-workflow-finalize` switch (A post-compact; C fresh session) | no `Skill` tool_call; session C model states the skill content was included in the user message, and both legs executed the finalize procedure accurately (blocked verdict, correct run-record checks incl. `workflow-state.md`/`mission-list.md`) with zero prior finalize loading in C | PASS for native loading — carrier was direct slash-body inclusion, not a `Skill` tool_call (see boundary) |
| 6 | Ordinary message ("Reply with exactly KW1079-PLAIN-OK…") | zero tool calls, verbatim reply; no Skill tool_call | PASS — negative leg |
| 7 | New session B `/kaola-workflow-next` | fresh discovery + `Skill` tool_call triple (B L11-13) + Workflow Next intake | PASS — fresh-session native route |
| 8 | Exact stop / zero residue | `agent_exit_code=0`, `residual_pids=[]` for sessions A, B, C; `state=stopped` on status; every send reported `files_changed=0`; fixture repo contains only the deployed `.zcode/` | PASS |
| 9 | Real GLM 1M auto-compact | not run (real 1M-context auto-compaction was not forced) | NOT-VERIFIED (bounded per the run's design freeze) |

## Carrier boundary (honest note)

ZCode 3.12.3 loads a slash-matched skill natively through TWO observed carriers: an ACP
`tool_call title=Skill` (legs 1, 2, 4, 7) and direct inclusion of the skill body in the user
message (leg 5, per the model's own session-C thought: "the skill content is included in the
message"). Which carrier fires for a given `/<name>` turn was not deterministic across these
runs; both are native loading — never AGENTS.md recovery prose, role guessing, or a manual
`read` of the skill file — so the issue's acceptance holds. The `/$<name>` form was proven
upstream (KPR #94 matrix) and was not re-run here.

## Receipts

`preflight-a`, `start-a/b/c`, `send-probe`, `send-next-1`, `send-compact`, `send-next-2`,
`send-finalize`, `send-plain`, `send-next-b`, `send-finalize-c`, `capture-*` (envelopes with
`event_log_path`), `stop-a/b/c`, `status-a/b` — all in this directory as `*.json`.
Raw ACP event logs: `/var/folders/8s/y93yqng93xb4__nl4jlh_g9c0000gn/T/kaola-501/zcode/zcode-kw1079-live-{a,b,c}/*/events.jsonl`
(volatile temp; the `Skill` tool_call triples cited above are at session A lines 11-13/22-24/67-69,
session B lines 11-13).
