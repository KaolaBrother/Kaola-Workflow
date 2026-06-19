# Adaptive Workflow Plan — issue-539

<!-- plan_hash: f1418d078b5c17de44881b49603d09fbccdb3a218bfae374431cd36285f28733 -->

bug/enhancement(adaptive/opencode): `cmdFinalize` forwards no `--base` to the plan-validator's
`--finalize-check`, so the attribution sweep always diffs `main...HEAD` and refuses with
`unattributed_change` on a shared multi-issue branch (blocking per-issue finalization). Folded in:
the opencode edition path-flip via an opencode-only strip-transform (mechanism B) so it runs
file-disjoint from the concurrently-in-flight #538 on `main`.

## Meta

labels: bug, enhancement, area:scripts, area:workflow-router

Two file-disjoint parts, authored as a serial chain (NOT parallel siblings): both write under the
`scripts/` top-level directory (n1: `scripts/kaola-workflow-claim.js` +
`scripts/simulate-workflow-walkthrough.js`; n2: `scripts/sync-opencode-edition.js` +
`scripts/test-opencode-edition.js`), so the top-level-directory parallel-safety check cannot treat
them as a ready antichain — n2 depends on n1. The actual files touched are disjoint; the dep is the
conservative serialization the write-lane overlap forces (the serial-degrade fallback, not a design
goal), costing one node of makespan.

**n1 — finalize `--base` forwarding (cross-edition, #307 four-chain).** `cmdFinalize`
(claim.js:2070) shells the validator with `--finalize-check --json` and forwards no `--base`, so the
sweep's `base` always defaults to `main` (plan-validator.js:2510 already accepts `--base REF` on the
whole-plan finalize-check; the per-node `--barrier-check` REJECTS `--base` as the anti-laundering
guard — that stays untouched). Source `--base` from a `--base <ref>` flag and/or `KAOLA_FINALIZE_BASE`
env, **defaulting to unset** (→ `main`, byte-equivalent to today for branch-per-issue runs). This
unblocks shared-branch finalization: the orchestrator passes `--base <project-merge-base>` (or
`--base HEAD` for an in-place run whose own changes are already verified by the chain receipt's
`workTreeHash`). ×4 byte-identical (claim.js + codex twin + gitlab/gitea forge ports). The RED test
pins BOTH directions: finalizing a shared branch with two issues' committed work — WITH `--base
<merge-base>` passes the gate; WITHOUT it, refuses `unattributed_change` (current behavior, pinned).
n1 runs all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains sequentially as
cross-edition evidence (#307 — a green claude chain alone is insufficient; the mirror must stay
byte-identical).

**n2 — opencode edition path-flip (mechanism B, additive — NO #307 four-chain).** opencode carries
the same path-switch logic #538 retires, in its GENERATED router commands (`workflow-next.md` has the
Path Intent / adaptive-switch-resolution step; `kaola-workflow-adapt.md` / `kaola-workflow-fast.md`
carry the "downgrade to full/fast" auto-fallback wording). **Mechanism B (CHOSEN, not A):** add an
opencode-only section-strip rule to `transformCommandBody` (mirror the existing badge-block strip at
sync-opencode-edition.js:190) that drops the Path Intent section + the downgrade auto-fallback
wording **only when rendering opencode**. Canonical `commands/*.md` stays UNTOUCHED — #538 is editing
those exact files on `main` right now and a canonical edit here is a guaranteed merge conflict.
Regenerate via `node scripts/sync-opencode-edition.js --write` (NEVER hand-edit generated
`.opencode/command/*`; `--check` flags drift). `install-opencode.sh` decision (standalone, not
`install.sh --forge`): either align to #538's adaptive-only-default + `--with-fast`/`--with-full`
opt-ins, OR explicitly scope it out with rationale recorded in the node evidence/CHANGELOG. opencode
is an additive runtime edition (D-530-02 (existing)) → NOT wired into `npm test`/`edition-sync.js`/the SIX
routing surfaces → verify with `sync-opencode-edition.js --check`, `test-opencode-edition.js`, and
`simulate-workflow-walkthrough.js` only. The opencode-flip diff is file-disjoint from #538; the sole
shared-file touchpoint is `claim.js` via the finalize fix (different functions — `cmdFinalize` vs
#538's `claimProject` path validation — git will almost certainly auto-merge; watch-point at PR
time, NOT a plan-level dep).

**Gates.** No security labels (bug/enhancement/area:scripts/area:workflow-router) → G2
security-reviewer not triggered. n3 (code-reviewer, opus) post-dominates both code producers (n1,
n2): the finalize-gate semantics are security-adjacent, so the reviewer explicitly verifies (a) the
forwarded `--base` does NOT weaken the per-node anti-laundering guard (plan-validator.js:2159-2163
untouched) and (b) the default-unset path is byte-equivalent to today. No main-session-gate — all
acceptance is machine-verifiable by the nodes (chains green, `--check` parity green, no Path Intent in
generated commands). No speculative_open_policy: the only post-gate node (n4 doc-updater) WRITES, so
it is ineligible to speculative-open behind n3.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
|----|------|------------|--------------------|-------------|-------|-------|
| n1-finalize-base | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence | sonnet |
| n2-opencode-flip | tdd-guide | n1-finalize-base | scripts/sync-opencode-edition.js, .opencode/command/workflow-next.md, .opencode/command/kaola-workflow-adapt.md, .opencode/command/kaola-workflow-fast.md, .opencode/command/kaola-workflow-finalize.md, .opencode/command/kaola-workflow-phase1.md, install-opencode.sh, scripts/test-opencode-edition.js, docs/opencode-edition.md | 9 | sequence | sonnet |
| n3-code-review | code-reviewer | n1-finalize-base, n2-opencode-flip | — | 1 | sequence | opus |
| n4-doc-update | doc-updater | n3-code-review | CHANGELOG.md, README.md | 2 | sequence | sonnet |
| n5-finalize | finalize | n4-doc-update | kaola-workflow/issue-539/workflow-state.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-finalize-base | complete |
| n2-opencode-flip | complete |
| n3-code-review | complete |
| n4-doc-update | complete |
| n5-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-finalize-base) | subagent-invoked | evidence-binding: n1-finalize-base b2c254d2c442 | |
| tdd-guide (n2-opencode-flip) | subagent-invoked | evidence-binding: n2-opencode-flip 6044c6ff2d11 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-code-review c476fdf6aa1f | |
| doc-updater (n4-doc-update) | subagent-invoked | evidence-binding: n4-doc-update e7c0fae84941 | |
