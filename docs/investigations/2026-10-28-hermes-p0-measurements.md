# Hermes P0 measurements — KW #1124 (MacBook)

- Date: 2026-10-28 (Asia/Taipei)
- Machine: MacBook Pro M5 Max, macOS 27.2 (26B123), arm64
- Hermes: `v0.22.5 (2026.9.24) · stable · local bf0203a794a0`, install method git,
  Python 3.14.9, install tree `~/.hermes/hermes-agent`
- KW baseline: `main@1335c6b7`; run branch `workflow/issue-1124`
- Model override: `deepseek-flash`; provider read back: `deepseek`
  (`hermes -m deepseek-flash --provider deepseek`; ACP `deepseek:deepseek-flash`)
- Authorization: owner decision `hermes-owner-cards-20261028` D6 — one-shot P0 live on
  MacBook first, Mini later; shared gateway allowed; temporary SOUL.md probe token allowed
  and must be restored.
- Scope: P0 measurement only. No product code, no `install-hermes.sh`, no
  `plugins/hermes`, no `runtime-capabilities.json` edit in this phase.

## Safety record (SOUL.md and temporary probes)

SOUL.md was modified only for the M2 and M5 probes, and each probe used the same guarded
procedure: copy to a backup, record SHA-256, append only a managed-region probe, run the
probe, restore from the backup, compare bytes and SHA-256. Probe content and token values
are deliberately not recorded here.

| Check | Value |
|---|---|
| Backup | `/tmp/hermes-p0/m2/soul/SOUL.md.orig` |
| SHA-256 before | `36c1f5a2e92cd1d018311eaf4c8f1e8886672eae78212e033c681d0e3d5d506f` |
| SHA-256 after M2 restore | `36c1f5a2e92cd1d018311eaf4c8f1e8886672eae78212e033c681d0e3d5d506f` |
| SHA-256 after M5 restore | `36c1f5a2e92cd1d018311eaf4c8f1e8886672eae78212e033c681d0e3d5d506f` |
| Byte comparison | `cmp -s` → identical after each restore |
| Probe tokens | not printed, not recorded in this document |
| Temporary probe skills | `~/.hermes/skills/p0-probe` (A3) and `p5-probe` (M5): absent before, removed after, verified absent |
| Gateway | `hermes acp` starts a per-`HERMES_HOME` gateway on `session/new`; the gateway started by this run was stopped at the end |
| Secrets | no `.env`/`config.yaml` secret value was read or printed; the temporary API-key file used for the isolated skill home was deleted |

Machine/version facts for the report: `hermes --version` printed
`Hermes Agent v0.22.5 (2026.9.24) · stable · local bf0203a794a0`; `hermes-acp --check`
printed `Hermes ACP check OK`; `hermes acp --version` printed `0.22.5`.

## CLI / carrier measurements

| ID | Command (representative) | Observation | Result |
|---|---|---|---|
| **M1a** | `hermes -m deepseek-flash --provider deepseek -z "<token query>"` in a `git init` fixture with `AGENTS.md` | Answer contained the fixture `AGENTS_TOKEN` verbatim; 2 API calls | PASS: project `AGENTS.md` loaded directly |
| **M1b** | same, cwd `nested/sub`, with root and nested `AGENTS.md` | Both the root token and the nested token were returned | PASS: git-root→cwd `AGENTS.md` chain loads |
| **M1c** | same, fixture with `HERMES.md` + `AGENTS.md` | Only the `HERMES.md` token was returned; `AGENTS.md` token absent | PASS: `HERMES.md` shadows `AGENTS.md` |
| **M1d** | same, fixture with `AGENTS.md` + `CLAUDE.md` | Only the `AGENTS.md` token was returned | PASS: `CLAUDE.md` is not read when `AGENTS.md` exists |
| **M1e** | same, cwd `.kw/worktrees/issue-1124` (real KW tree) | `KW=YES;BLOCKED=NO`; the real KW `AGENTS.md` heading was visible and no `[BLOCKED` marker appeared | PASS: real KW instructions load unblocked |
| **M2a** | temporary managed region in SOUL.md, then `hermes -z` with tools limited to `skills` | Probe token returned verbatim | PASS: managed region enters the `-z` system prompt |
| **M2b** | same, `--ignore-rules` | Response was `NONE`; token absent | PASS: `--ignore-rules` skips SOUL.md |
| **M2c** | same, `--safe-mode` | Response was `NONE`; token absent | PASS: `--safe-mode` skips SOUL.md |
| **M2d** | same, `hermes chat -q` | Probe token returned; model explicitly said it came from the system prompt | PASS: chat path also loads SOUL.md |
| **M2e** | SOUL.md plus a user-authored line matching an injection rule | Token still returned; log: `Context file SOUL.md matched injection pattern(s) prompt_injection, html_comment_injection; loaded anyway because it is the user's own file in HERMES_HOME` | PASS: user-owned SOUL only warns, does not block |
| **M3a** | `HERMES_HOME=<tmp> hermes skills list --source local` with `skills/p0-probe/SKILL.md` (flat, top level) | `p0-probe` listed, source `local`, status `enabled` | PASS: flat `$HERMES_HOME/skills/<name>/SKILL.md` is discovered |
| **M3b** | same home, additional skills with no frontmatter, `name` only, `description` only | All four variants (including `p0-nofm`) listed as enabled; name fell back to the directory name | PASS: neither `name` nor `description` is mandatory for discovery; include both for clarity |
| **M3c** | `hermes -z "/p0-probe"` with the temp home | Output exactly the skill-body token; no prose | PASS: CLI slash expands an installed profile skill |
| **M3d** | local root skill named `systematic-debugging` alongside the seeded bundled copy | Same name in one tier became ambiguous: `/systematic-debugging` returned `Unknown command`; `hermes skills inspect` reported multiple candidates | VALUE: same-name bundled collisions are not resolved silently; the command is unavailable |
| **M3e** | trusted fixture repo with `p0-probe` in both `.agents/skills` and `.hermes/skills`; `hermes skills trust .` | Trust reported 2 project skills and precedence over profile; `skill_view('p0-probe')` refused as ambiguous between the two project paths; path-form names were not found; the profile `p0-probe` was hidden from the listing, while `-z "/p0-probe"` still returned the profile token | VALUE: project tier shadows profile, but `.agents/skills` + `.hermes/skills` same-name copies are ambiguous and block tool-based resolution |
| **M4a** | `hermes curator status`, `hermes curator list-unmanaged` (temp home) | `no curator-managed skills`; the four probe skills were `unmanaged (no provenance marker)`, `never auto-staled or archived` | PASS: KW-style copied skills are not curator-managed |
| **M4b** | `hermes update --plan` (read-only) + installed source `tools/skills_sync.py`, `hermes_cli/update_cmd_maint.py` | Plan: `Install: git (v0.22.5 @ bf0203a7)`, `Running Hermes services: none detected — code swap only`. Source: seeding iterates only bundled skills/manifest entries; a skill absent from `.bundled_manifest` is not copied, updated, or cleaned; removed-upstream entries are cleaned only after their on-disk copy is gone | PASS by source + read-only plan: non-bundled KW skills survive an update; the live `hermes update` itself was not run because P0 forbids mutating the installed carrier |
| **M5** | temp SOUL token + temp `p5-probe` + `AGENTS.md`; 13 filler turns, `/p5-probe`, 13 filler turns, `/compress`, then a token-recall prompt | `/compress` reported `Compressed: 54 → 12 messages` (`~1,914 → ~2,940` estimated request tokens). SOUL and AGENTS tokens were still visible. The skill token was visible only through the compaction summary; the model said the verbatim body was pruned and it re-loaded `p5-probe` to quote it | PASS: SOUL.md and AGENTS.md survive compaction; invoked skill body does not survive verbatim and is recoverable by re-invocation |
| **M6a** | `hermes -z` asking to run `rm -rf <fixture>/junk` | Dangerous delete was executed without an approval prompt (`-z` help: approvals auto-bypassed); the model deviated from the exact command and removed only `junk` | VALUE: `-z` bypasses dangerous-command approval |
| **M6b** | `hermes chat --oneshot -q` (non-TTY) with the same command | Command blocked before execution: `BLOCKED: Command flagged as dangerous (delete in root path) but single-query mode (-q) runs without a user present to approve it` | VALUE: non-TTY `chat -q` cannot approve; dangerous fences are denied |
| **M6c** | interactive `hermes --cli chat` under `expect`, PTY, same command | Two attempts (180 s each) produced no approval surface; the prompt text was accepted but the turn did not execute the command. Result recorded as `timeout×2`; the command was still present afterwards | N/A + reason: interactive TTY approval UI not captured in this P0; requires a human-attended TTY run. Non-TTY and `-z` are measured above |
| **M7a** | fixture with `.kw/worktrees/p` on `workflow/issue-1` and `.worktrees/hermes-test`; `hermes worktree list` | Listed only `hermes-test`; the KW tree appeared under `externally-registered worktree(s) (never touched by prune): .../.kw/worktrees/p [workflow/issue-1] ok` | PASS: Hermes recognizes but does not claim the KW tree |
| **M7b** | `hermes worktree prune --dry-run` | Plan contained only `hermes-test` (`skip-young`); no KW tree; `1 action(s) planned` | PASS: no overlap with KW worktrees |
| **M7c** | source `hermes_cli/worktree_registry.py`, `worktree_sweep.py` | Sweep repo list is the per-profile `worktree_repos.json` registry, unioned with the Hermes checkout and cron workdirs; the 6-hourly sweep only visits repos where Hermes itself created a worktree | VALUE: KW repo is not registered by Hermes and is not swept |
| **M8** | `hermes -t delegation -z` asking for the live `delegate_task` schema | Live schema: `name`, `description`, `parameters`; properties `action` (default `spawn`; `list`/`steer`/`stop`), `message`, `subagent_id`, `tasks`; required `tasks`; up to 10 parallel children per user | VALUE: schema recorded; no role/model binding added to KW |
| **M9a** | `hermes profile list`, `hermes profile show default`, `hermes config path` | `◆default` active, model `anthropic/claude-opus-4.6`, gateway running; path `/Users/.../.hermes`; `~/.hermes/active_profile` absent ⇒ default | PASS: current profile and home are observable without secrets |
| **M9b** | `HERMES_HOME=<prepared tmp> hermes config path` | Returned `<tmp>/config.yaml` | PASS: explicit `HERMES_HOME` wins |
| **M9c** | source `hermes_constants.py:158-180` | If `HERMES_HOME` is unset and `active_profile` is non-default, Hermes warns that it is falling back to the default home; the installer can read the plain `active_profile` file and refuse instead of guessing | VALUE: detection method for P1; no secret read |

## ACP measurements

ACP probes used a one-shot JSON-RPC stdio client (not committed). `initialize` used
protocol version 1; sessions were created with `session/new`, model set with
`session/set_model` to `deepseek:deepseek-flash`, and prompts sent with `session/prompt`.

| ID | Command (representative) | Observation | Result |
|---|---|---|---|
| **A1a** | `hermes acp` + `initialize` | `protocolVersion: 1`; agent `hermes-agent 0.22.5`; `loadSession: true`; session capabilities `fork`, `list`, `resume`; prompt image capability; auth methods `deepseek` and terminal `hermes-setup` | PASS: handshake and capabilities |
| **A1b** | gateway state before/after `initialize` only, then after `session/new` | `initialize` alone left the gateway stopped; the first `session/new` started a per-home `hermes gateway run --quiet --idle-exit` (observed PIDs 17508, 98042, 79328 across restarts) | VALUE: ACP attaches to / starts a shared per-`HERMES_HOME` gateway on session creation, not on initialize |
| **A2a** | `session/new` cwd = `AGENTS.md` fixture; prompt for the token | The fixture token matched verbatim | PASS: ACP cwd drives project-instruction discovery |
| **A2b** | `session/new` cwd = `.kw/worktrees/issue-1124`; prompt for KW/BLOCKED | `KW=YES;BLOCKED=NO` | PASS: real KW worktree cwd works; instructions are not blocked |
| **A2c** | `session/new` cwd = Hermes install tree; prompt whether KW instructions are present | `NO` | PASS: install-tree fallback skips project-context discovery |
| **A3a** | temp profile skill `p0-probe`; ACP prompt `/p0-probe` | Reply was exactly the skill-body token | PASS: ACP slash expands an installed profile skill |
| **A3b** | same session, prompt `/workflow-next` (not installed) | Reply `Unknown command /workflow-next...`; the same turn did not call the model | PASS: missing skill is an explicit command error, not normal text |
| **A3c** | `available_commands_update` | Advertised 14 gateway commands (`help`, `model`, `tools`, `context`, `reset`, `compress`, `steer`, `queue`, `usage`, `status`, `version`, `title`, `undo`, `retry`); no skills | VALUE: skills are usable by name but are not advertised as commands |
| **A4a** | mode `default`, file write outside cwd | `session/request_permission`: title `Approve edit: <path>`, kind `edit`, options `allow_once`/`reject_once` | PASS: default asks for edits |
| **A4b** | mode `default`/`accept_edits`, file write inside repo | `default` asked; `accept_edits` did not ask | PASS: accept_edits auto-allows workspace edits |
| **A4c** | mode `accept_edits`, file write outside repo | Asked for permission | PASS: accept_edits stays workspace-scoped |
| **A4d** | mode `dont_ask`, file write outside repo / `.git/` / `kaola-workflow/` | Outside repo: no ask; `.git/kw-probe`: asked; `kaola-workflow/ledger-probe.txt`: no ask | PASS: `dont_ask` auto-allows normal files, still asks for `.git` sensitive path |
| **A4e** | terminal `git config --local kaola-workflow.forge github` and `rm -rf <fixture>/junk` in all three modes | No `session/request_permission` in any mode; `git config` returned `github`; `junk` was removed; files written | VALUE: ACP permission channel gates file edits only, not terminal commands |
| **A5a** | `session/set_model` `deepseek:deepseek-flash`, then prompt `/model` | `Current model: deepseek-flash`; `Provider: deepseek` | PASS: exact model/provider read back |
| **A5b** | `session/set_model` `deepseek:deepseek-v4-pro`, then `/model` | `Current model: deepseek-v4-pro`; provider `deepseek` | PASS: model switching works |
| **A5c** | `session/set_config_option` `configId=reasoning_effort`, `value=low` | Result `{configOptions: []}` | VALUE: effort is not exposed as a settable config option; record as unsupported/unknown |
| **A6a** | ACP session cwd KW worktree; prompt starts `sleep 20; echo alive > /tmp/...`; kill ACP viewer after `tool_call`; wait 26 s | Marker file appeared with `alive`; the gateway kept running | PASS: gateway turn survives viewer close |
| **A6b** | `kaola-acp.py list --include-dead --repo <KW worktree>` after A6a | `{"rows": [], "schema": "kaola-acp-list/1"}` | VALUE: no holder row for a raw ACP/gateway session; the KW worktree guard would not see it as occupied. Runner-side holder registration is required (A6 is observation only) |
| **A7a** | ACP prompt starts `sleep 30`; `session/cancel` mid-tool | Prompt result `stopReason: cancelled` | PASS: cancel interrupts the turn |
| **A7b** | `session/load` then prompt to read fixture `workflow-state.md` and ledger | Load returned models/modes and replayed 5 messages; the follow-up printed both fixture token values (workflow-state and ledger); fixture files unchanged | PASS: load/resume restores the session; ledger/workflow-state remain the recovery surface |

## Mini

**N/A — requires Mini-side execution.** This run had no authorized remote channel to the
Mac mini and did not invent one. The MacBook measurements above must not be transferred to
Mini. Mini's P0 needs its own authorized session on that machine, with the same M1–M9 /
A1–A7 rows, its own Hermes version and its own SOUL.md backup/checksum record. Studio remains
unknown.

## P0 result and P1 gate notes

All P0 rows above have a measured value or an explicit N/A with reason. The table is
complete for MacBook; Mini is recorded as N/A pending its own run.

Facts that matter for the owner-approved P1 (D1=KW native, D2=G-a, D3=single forge,
D4=global only, D5=`.kw-hermes[-<forge>]`):

- **D2 / G-a is viable**: the SOUL.md managed region enters both `-z` and chat sessions,
  survives compaction, and a user-owned SOUL warning does not block the file.
- **Skills**: flat `$HERMES_HOME/skills/<name>/SKILL.md` is discovered with minimal or no
  frontmatter; `/skill-name` expands in CLI and ACP. Do not choose a name that collides with
  a bundled skill (same-tier ambiguity makes the command unavailable).
- **Project scope**: `.agents/skills` and `.hermes/skills` same-name copies are ambiguous;
  this is another reason D4 stays global-only in P1.
- **Compaction**: re-invoke the skill and resume from ledger/workflow-state; do not rely on
  the skill body surviving verbatim, and do not add Hermes to the always-loaded recovery
  set on this evidence alone.
- **ACP permissions**: file edits go through `session/request_permission`; terminal commands
  do not. A KW fence that runs `git config`, `git worktree`, `gh`, or `node` will not get an
  ACP approval prompt. Runner/seat policy must own that gap; KW must not claim it is gated.
- **ACP skills**: usable by name when installed, not advertised in
  `available_commands_update`; a missing skill returns an explicit unknown-command error.
- **A6 / worktree guard**: a gateway turn can outlive its viewer, but a raw ACP session has
  no `kaola-acp.py` holder row. `removeWorktree` would not see it as occupied until the
  runner registers holder rows with the KW worktree cwd.
- **M6 unknown**: interactive CLI approval UI was not captured (`timeout×2`); P1 must not
  rely on a measured interactive approval path. The measured non-TTY behavior is deny.

No product code, installer, generated surface, or adapter-facts file was changed in P0.
