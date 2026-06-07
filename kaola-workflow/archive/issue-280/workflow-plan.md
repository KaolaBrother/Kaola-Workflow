# Adaptive Workflow Plan — issue-280

<!-- plan_hash: 6da66f7b770c3cb13c5f167fa00b9c7f1acd7a2c0afcd3fd773682b652ad0943 -->

adaptive: fix the #277 closure attestations (`claim_planner_attested`,
`finalize_contractor_attested`) false-failing `failed` on a clean, fully-delegated adaptive run, via
two distinct mechanisms, both fixed within a 6-path write-set. RE-AUTHOR: the prior frozen plan was
discarded because its `fix` write-set carried `hooks/kaola-workflow-subagent-dispatch-log.sh` — a
3-way byte-sync group (hooks/ + gitlab + gitea = 8 paths > FILE_CEILING) that is UN-editable, so
Mechanism 1 had no reachable fix inside the ceiling. EMPIRICAL FINDING (settled by the orchestrator
via a live two-sided probe; do NOT re-investigate): there is NO harness env var that distinguishes a
subagent dispatch from the main session — a delegated subagent and the main session see byte-identical
env (CLAUDECODE=1, CLAUDE_CODE_SESSION_ID, AI_AGENT, etc.; no CLAUDE_AGENT_TYPE/SUBAGENT_TYPE exists).
Therefore M1 CANNOT gate on a harness env var and CANNOT be a claim.js-only fix; the only correct
signal is a CALLER-SUPPLIED FLAG that the planner passes in its OWN claim invocation — which is why
`agents/workflow-planner.md` is in the write-set (replacing the dead hook path). Linear chain
fix → review → finalize: code-reviewer post-dominates the only code producer `fix` (G1); none of the
write-set paths match a `*security*`/auth/secret/fs SENSITIVE_PATTERN and the labels
(bug / area:scripts / area:workflow-phases) are NOT in SENSITIVE_LABELS {security,auth,payments,
secrets,user-data} ⇒ G2 NOT triggered, no security-reviewer node; finalize is the unique docs/state
sink (CHANGELOG.md only). No doc-updater: behavior-only bug fix with no user-facing API/schema change;
CHANGELOG is the sink's job. No `design`/`planner` node: recon is COMPLETE and validated against the
real code (see Design Notes).

## Meta

labels: bug, workflow:in-progress, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| fix | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, agents/workflow-planner.md, scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | fix | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
| --- | --- |
| fix | complete |
| review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (fix) | subagent-invoked | # fix node evidence — issue #280 | |

| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | # finalize node evidence — issue-280 (Phase-6 sink) | |
## Design Notes

Root cause is FULLY traced and verified against the real code (read-only recon already done — do NOT
re-derive). Two mechanisms, both fixed within the 6-path `fix` write-set above.

EMPIRICAL FINDING (settled; do NOT re-investigate): NO harness env var distinguishes a subagent
dispatch from the main session — a delegated subagent and the main session see byte-identical env
(CLAUDECODE=1, CLAUDE_CODE_SESSION_ID, AI_AGENT, etc.; no CLAUDE_AGENT_TYPE/SUBAGENT_TYPE exists).
Therefore M1 cannot gate on env and cannot be claim.js-only; the only correct signal is a
CALLER-SUPPLIED FLAG the planner passes in its OWN claim invocation.

- MECHANISM 1 (planner spawn unloggable) — FIX = planner self-attest via flag.
  Root cause: the SubagentStart hook (`hooks/kaola-workflow-subagent-dispatch-log.sh`) loops over
  EXISTING active projects (`kaola-workflow/*/workflow-state.md` with status:active) and appends to
  each `.cache/dispatch-log.jsonl`. When the `workflow-planner` is dispatched FIRST, no project state
  file exists yet (the planner's OWN claim creates it), so the loop attributes the planner spawn to
  nothing → it is never logged → `claim_planner_attested:failed`/`missing` even on a legit delegated
  dispatch. The hook already does `mkdir -p`; it is NOT a missing-dir bug, and the hook is UN-editable
  here (3-way byte-sync group: hooks/ + gitlab + gitea = 8 paths > ceiling). The hook is therefore
  NOT in the write-set (this is the exact fix the discarded plan got wrong).
  - Fix part A (`agents/workflow-planner.md`, ~line 96): append a flag to the planner's claim/startup
    invocation, e.g. `node <claim.js> startup --runtime claude --workflow-path adaptive
    [--sink <sink>] --target-issue <N> --attest-planner-spawn`. This flag is the caller signal: only a
    genuinely-dispatched `workflow-planner` running its relocated procedure passes it.
  - Fix part B (`scripts/kaola-workflow-claim.js` ×2 byte-pair): parse the new flag; in the adaptive
    authoring claim path (claimProject success path, after writeState, before the `acquired` return),
    when the flag is set, `mkdir -p kaola-workflow/{project}/.cache/` and append one
    `{"ts":...,"agent_type":"workflow-planner","agent_id":"claim-backfill","cwd":root}` line to
    `dispatch-log.jsonl`. Wrap in try/catch (fail-open; attestation is warn-first, must NEVER block the
    claim). `fs`+`path` already required.
  - AC2 correctness (CRITICAL): the back-fill is gated STRICTLY on the flag. A #276 zero-spawn inline
    bypass (main session improvising the claim WITHOUT running the relocated planner procedure) does
    NOT pass the flag → no marker → stays `missing`/`failed`. This matches #277 §6 "Honest limits":
    the detector catches the casual/accidental bypass, not a determined one. Do NOT back-fill
    unconditionally on adaptive claims (that would attest #276 and break AC2).
  - `checkDispatchAttestations` (claim.js ~line 51, matches `agent_type === 'workflow-planner'`) stays
    UNCHANGED — the back-filled line makes it pass naturally.

- MECHANISM 2 (sink-merge re-checks the archived log) — FIX = archive-first re-check.
  Root cause: `kaola-workflow-sink-merge.js` builds its closure_receipt via `buildClosureReceipt(...)`
  WITHOUT calling `checkDispatchAttestations`, so `emptyReceipt`'s `'failed'` default survives; and
  `cmdFinalize` already moved live `.cache/` → `kaola-workflow/archive/{project}/.cache/`.
  `cmdFinalize` (claim.js ~939) does it correctly:
  `checkDispatchAttestations([archiveCacheDir, liveCacheDir], receipt)` archive-first.
  - Fix (`scripts/kaola-workflow-sink-merge.js` ×2 byte-pair): import the EXPORTED
    `checkDispatchAttestations` from claim.js (it is exported), and call it archive-first —
    `checkDispatchAttestations([path.join(archiveDest,'.cache'),
    path.join(mainRoot,'kaola-workflow',project,'.cache')], receipt)` — immediately after
    `buildClosureReceipt(...)` and before `checkClosureInvariants`. `archiveDest` + `mainRoot` are
    already in scope. Do NOT change `emptyReceipt`'s default; do NOT touch `closure-contract.js`
    (keeps the write-set off the ceiling, avoids a 4-tree forge-parity blast radius).

- BYTE-MIRROR (#274 / validate-script-sync.js): `kaola-workflow-claim.js` and
  `kaola-workflow-sink-merge.js` are each a byte-identical PAIR (`scripts/` ⇄
  `plugins/kaola-workflow/scripts/`). The IDENTICAL edit lands in BOTH copies of each (4 paths).
  `agents/workflow-planner.md` is a SINGLE file (no byte-mirror; the 3 Codex `.toml` planner ports are
  NOT edited — Codex attestation is #266/#286 scope, and NO validator forces `.md`↔`.toml` parity).
  `simulate-workflow-walkthrough.js` is a single copy. Total declared write-set = 6 paths =
  FILE_CEILING exactly. Do NOT add a 7th path.

- RED proof (MANDATORY, `tdd-guide`): write failing regressions in
  `scripts/simulate-workflow-walkthrough.js` FIRST:
  - AC1 behavioral: a claim run WITH `--attest-planner-spawn` plus a contractor dispatch-log line ⇒
    `claim_planner_attested` AND `finalize_contractor_attested == 'attested'` in BOTH the
    `cmdFinalize` receipt AND the sink-merge closure_receipt.
  - AC2 behavioral: a claim run WITHOUT the flag and zero spawns ⇒ both stay `missing`/`failed`.
  - NON-CIRCULAR contract guard: assert `agents/workflow-planner.md`'s startup invocation LITERALLY
    contains the flag token (so production actually passes it — the behavioral test alone is circular
    since it sets the flag itself). Put this assertion in `simulate-workflow-walkthrough.js`
    (`validate-workflow-contracts.js` is NOT in the write-set).
  - Run `node scripts/simulate-workflow-walkthrough.js` AND full `npm test` (byte-sync + contract
    validators run only under `npm test`). NEVER `git checkout -- <file>` during a plant→revert proof
    — it nukes the in-flight fix; restore via `.bak` or inverse edit.

- review node (code-reviewer, G1): post-dominates the only code producer (`fix`). G2 NOT triggered
  (non-sensitive labels; no `*security*`/auth/secret/fs path in any write-set) — no security-reviewer
  node.

- finalize node: unique docs/state sink. CHANGELOG.md [Unreleased] entry only. DISJOINTNESS: issue
  #281 (parallel ready-set execution) is owned on another machine and touches the executor surface
  (next-action.js / adaptive-node.js / plan-run); this plan's write-set is deliberately disjoint from
  those files — clean parallel merge. The repo carries UNTRACKED #281 leftovers
  (docs/investigations/2026-06-07-parallel-ready-set-execution-design.md and
  kaola-workflow/.roadmap/issue-281.md) — keep them OUT of the Phase-6 commit and ensure ROADMAP regen
  does NOT inject a stray #281 row.
