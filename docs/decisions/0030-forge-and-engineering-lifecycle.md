# ADR 0030 — Forge and engineering lifecycle, no runtime bias

Status: Accepted · Date: 2026-09-28 · Issue: #1111

Supersedes the dispatch-or-inline judgment retained by ADR 0029 decision 2. ADR 0029's retirement
of Kaola roles, profiles, and model bindings stands.

## Decision

1. Kaola-Workflow manages the forge backlog, claims, the mission ledger, workspace and commit
   ownership, and the delivery lifecycle: validation evidence, merge, closure, archive, and
   cleanup. It keeps user authorization and existing safety boundaries.
2. Whether to use a subagent, how to divide work, and which native type, model, effort, width,
   nesting, or recovery the host uses belong to the current harness and the user's instructions.
   Active prompts may state that boundary. They do not add a dispatch policy, a batch-size
   preference, or a platform type catalog.
3. Codex diagnostics report the config values they read and where those values came from. A missing
   `features.multi_agent_v2` flag or a reasoning-effort value is not a session capability or a
   dispatch authorization. Absent numeric fields stay absent.
4. Finalization records the candidate, the acceptance outcome, evidence locations, known failures
   or unverified scope, and the validation measurement the transaction already writes. It does not
   require a second QA pass or a `DOCKED`/`BLOCKED` documentation file. Kaola Project Runner's
   documentation guidance should read that same lifecycle record (paired with KPR #213). A consumer
   that does not install the Runner still finalizes from the project's own evidence.
