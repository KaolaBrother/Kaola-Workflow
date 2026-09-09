# #1053 behavior probes — fresh-session checks on the generated Next surface (candidate 51890a2e prose)

Surface under test: `commands/workflow-next.md` rendered from the candidate skeleton (byte-identical copy at the
time of probing) plus `templates/global/kaola-workflow-global.md`. Fixture: a disposable Node "ledger service"
repo with a known auditor-authorization bug and an `AGENTS.md` regression rule. No forge remote and no claim
script exist in the fixture; every probe was told to state verbatim the forge/claim commands it could not run.

## Evidence classes (read this before the tables)
- **Decision probe** — the agent is bound to read-only limits and asked to decide + explain. It proves how the
  prose is *understood* in a fresh context. It does NOT prove that an unbounded agent would refrain from writes.
- **Act probe** — the agent may read, edit, run tests and commit in a disposable copy with no read-only limit.
  Outcome verified by `git log`/`git status`/re-running tests, not by the agent's report.
- **Real host UAT (headless, decision class)** — the installed CLI of another runtime, non-interactive, read-only
  sandbox where the CLI offers one; the candidate surface was passed in the prompt text (the installed home still
  carried the pre-change surface at probe time). This is a real host executing the prose, but decision-class only.
- Not run: any interactive host session; ZCode (binary absent on this machine); Cursor App/Cloud; Codex/Cursor
  interactive trust flows. Claude Code interactive = this orchestrating session (which ran the PRE-change installed
  surface; the candidate prose reached Claude Code only via subagents).

## A. Claude Code decision probes (fresh general-purpose subagents, sonnet) — original fixture
The original fixture also carried a stale `kaola-workflow/issue-7/mission-list.md` (intended only for scenario 6)
whose `done` rows cite a non-existent commit. That leaked into scenarios 1/2/4: those agents detected the false
`done` record and chose INVESTIGATE-THEN-CONTINUE instead of plain CONTINUE. The specific guidance under test
still held in every case (no requirement sheet, no confirmation, no user question; local evidence decides).
Scenarios 1/2/4 were therefore re-run as act probes on a clean fixture (section B).

| # | scenario | mode chosen | asked user? | notable |
|---|---|---|---|---|
| 1 | clear, authorized task | INVESTIGATE-THEN-CONTINUE (fixture leak) | no | would not ask for requirement doc/restatement/confirmation |
| 2 | fact gap ("Auditors see too much") | INVESTIGATE-THEN-CONTINUE | no | fact settled from `src/authz.js` comment; selected #8 exactly, left issue-7 folder alone |
| 3 | genuine decision (remove role vs deny role; public-API break) | ASK-USER with recommendation | yes (verbatim in probe-3.md) | continued reading-independent work (claim, mission list, core denial + test) |
| 4 | small permission fix, "just do it" | INVESTIGATE-THEN-CONTINUE (fixture leak) | no | evidence still owed: refused path, allowed paths, regressions; "short explanation would not reduce it" |
| 5 | owner-rule correction + wrong-premise note | CONTINUE | no | AGENTS.md edit under owner authorization; premise → issue #7 comment; no memory write, no "anything to remember", no ADR, no scope creep |
| 6 | candidate changed after PASS | (resume) | no | PASS at abc123 invalid for changed bytes; done row immutable; new mission row for re-validation; diff first |
| 7 | pure design request | DECLINE-IMPLEMENTATION | no | no claim of #7, no new issue, no forge write, no ACL code; design note only |

Raw answers: `.cache/probes/probe-1.md` … `probe-7.md`.

## B. Claude Code act probes (write-enabled disposable copies, clean fixture)
| copy | scenario | what the agent actually did (git-verified by the orchestrator) | asked user? |
|---|---|---|---|
| act-A | pure design request | untracked `docs/design/per-resource-acl-design.md` (110 lines) only; `src/`/`test/` untouched; no commit; no claim | none |
| act-B | clear, authorized task | commit `ba4dee9`: `src/authz.js` auditor branch → `resource.auditable === true`; 3 regression assertions; four-field mission list; `node test/run.js` RED before (`true !== false`) → `authz.test ok` after (re-run by orchestrator: exit 0) | none; no requirement sheet/confirmation requested |
| act-C | small fix, "just do it" | commit `0887d96`: same fix; refused path (auditable:false, field absent), allowed path (auditable:true), pre-existing admin/owner assertions; RED→GREEN proof kept. "Just do it" shortened the write-up, not the verification | none |
| act-D | fact gap | (pending at time of writing — see appendix) | |

## C. Real host UAT, headless, decision class (candidate surface passed in the prompt)
Prompts: `.cache/probes/host-prompt-*.txt` equivalents in scratch; logs copied to `.cache/probes/host-*.log`.
| host (version) | invocation | design request | fact gap |
|---|---|---|---|
| Codex CLI 0.153.4 | `codex exec -s read-only` | CONTINUE (research only): no claim/#7, no new issue, no forge write, no ACL code; quotes the research/design sentence | INVESTIGATE-THEN-CONTINUE; fact from code comment; no question |
| OpenCode 1.18.17 (glm-5.3) | `opencode run` | INVESTIGATE-THEN-CONTINUE; no claim/issue/forge/implementation; offered a non-blocking question about tracking | CONTINUE; fact from code; no question |
| Grok CLI 1.0.24 | `grok -p --output-format plain` | CONTINUE (design only); no claim/issue/forge/code | INVESTIGATE-THEN-CONTINUE; fact from code; no question |
| Kimi Code 0.34.0 | `kimi -p` | CONTINUE (design only); no claim/issue/forge/code; asked a non-blocking "file it as an issue? handle #7 first?" | CONTINUE; fact from code; no question |
| Cursor CLI 2026.09.02 | `cursor-agent -p --trust --mode plan` | DECLINE-IMPLEMENTATION; no claim/issue/forge/code (answered in Chinese) | (pending at time of writing — see appendix) |
| ZCode | — | NOT RUN: `zcode` binary absent on this machine (only `~/.zcode` home exists) | NOT RUN |
First attempts on cursor/grok/kimi failed on CLI flags, not on the prose (`--trust` required; `--output-format plain`; `-p` cannot combine with `-y`); those attempt-1 logs are kept.

## D. What these probes do and do not establish
- Establish: in fresh contexts on six real runtimes' prose consumers (Claude Code subagents + five headless CLIs),
  the two additions are read the intended way; on Claude Code, write-enabled agents actually implemented a clear
  task with evidence, refused to implement on a design request, and did not lower evidence for a "just do it" fix.
- Do not establish: full interactive host UAT on any runtime; behavior with a live forge (all forge/claim commands
  were stated, not run); ZCode at all; Cursor App/Cloud. No speed or rework-rate claim is made (no baseline).

## Appendix — results that landed after the tables above were written
- **act-D (fact gap, write-enabled):** commits `3b918b3` (fix + 3 auditor assertions) and `30521b1` (record) on the
  disposable copy; fact established from the `src/authz.js` comment, no user question; RED `true !== false` before,
  `authz.test ok` after (re-run by the orchestrator: exit 0). Note: act-D first received a truncated brief and answered
  as a read-only decision probe; it was re-briefed and then acted. Both answers agree on investigate-vs-ask.
- **Cursor CLI fact gap:** attempt 2 (`--output-format text --mode plan`) exited 0 after 110 s but captured NO answer
  text (empty stdout) — recorded as *no result*, not as PASS; a third attempt with `--output-format json` was launched
  and is recorded below if it produced output.
- **Cursor CLI fact gap, attempt 3 (`--output-format json --mode plan`, 95 s, exit 0):** INVESTIGATE-THEN-CONTINUE;
  the gap is a repository FACT (auditor branch + comment), not a decision; select #8 exactly and do not adopt the
  issue-7 folder; no user question; quotes the "When a fact is missing…" sentence. Log:
  `.cache/probes/host-cursor-factgap-json.log`. The empty attempt 2 was a text-format output issue, not a prose issue.
