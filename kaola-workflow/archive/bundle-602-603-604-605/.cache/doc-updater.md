# doc-updater — finalization audit (bundle-602-603-604-605)

Verdict per Documentation Update Checklist item:
1. README.md — no-impact, verified: greps for "--summary"/"dispatch"/"open-next" hit only pre-existing model-badge and Codex-posture content; nothing quotes the changed output shapes or flags.
2. docs/api.md — FIXED a real gap: the existing `--summary` mode section documented the one-line format but not the new per-opened-node dispatch segment. Added one paragraph documenting the exact segment format (`| opened=<node-id> role=<role> task=<codex_task_name> mode=<codex_dispatch_mode> effort=<E|inherit>`), field provenance, batch behavior (one segment per open-ready member), and the close-only/allDone/refuse exemption — transcribed from dispatchSummarySegments() + the walkthrough regexes, not invented. Also confirmed docs/api.md has no general startup-flag catalog or state-field list needing a --codex-dispatch-mode/codex_dispatch_mode line (those are fully documented in docs/workflow-state-contract.md by the in-plan docs node).
3. CHANGELOG.md — verified-ok: all four [Unreleased] entries' central claims spot-checked against the diff (byte-identity oracle at walkthrough:15565; validate-before-mutate ordering claim.js:144/1441/578; three announcement formats + close-echo present on all 6 surfaces via grep; LEDGER_MUTATING_SUBCOMMANDS matches the 9 listed; buildRunProgress schema matches verbatim; fail-open warn oracle at walkthrough:15740/15788).
4. Architecture docs — no-impact, verified: no run-progress/mirror references; artifact-mirror contracts live in docs/workflow-state-contract.md per the Documentation Map (same precedent as ROADMAP.md).
5. .env.example — no-impact, confirmed: no new process.env reads; the KAOLA_CODEX_DISPATCH_MODE/CODEX_DISPATCH_MODE overrides follow the existing convention of not cataloging internal dispatch-mode knobs (sibling KAOLA_CODEX_MULTI_AGENT_V2 likewise uncataloged).
6. docs/workflow-state-contract.md — verified-ok: both new sections transcribe correctly against claim.js (CODEX_DISPATCH_MODES, resolveCodexDispatchModeFlag, invalid_codex_dispatch_mode, assertNoNewline) and adaptive-node.js (subcommand set, mirror schema, fail-open, lifecycle).

File edited: docs/api.md only (3 insertions). Anti-fabrication: all verified content traceable to real code/command output; no BLOCK lines.

Orchestrator note: docs/api.md is a chain-asserted doc → the binding chain receipt was invalidated by this fix and re-run afterward (see final-validation evidence).
