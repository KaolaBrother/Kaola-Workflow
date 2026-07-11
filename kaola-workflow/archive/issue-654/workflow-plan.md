# Workflow Plan — issue-654

<!-- plan_hash: e786a140ad0518f3cbbf649801b1f75ebcf462d9d2f802ab35c0177b65261806 -->

## Meta
speculative_open_policy: auto
labels: bug, workflow:in-progress, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea

Fix the adaptive writer-repair lifecycle so a downstream gate keeps its blocking evidence while the
writer is being repaired, then receives a mechanically fresh evidence file when the repaired writer
closes and the gate genuinely opens under a new nonce. Same-open crash/resume must remain byte-for-byte
idempotent, and malformed or cross-node bindings must remain fail-closed.

This is a compact, settled bug fix: the issue already identifies the common helper and required
behavior, so the implementation direction is carried in the TDD node brief rather than adding a
design node. The canonical adaptive-node aggregator, its generated Codex/forge ports, and both root
regression surfaces move atomically in one test-first node.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix-gate-evidence-rotation | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 6 | sequence | standard |
| n2-review | code-reviewer | n1-fix-gate-evidence-rotation | — | 1 | sequence | reasoning |
| n3-adversarial-lifecycle | adversarial-verifier | n2-review | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-adversarial-lifecycle | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

- Cross-edition symbol scoping found `seedEvidenceFile`, `forceRotate`, `nonce_rotated`, and
  `repair-node` in the canonical adaptive-node aggregator plus its Codex byte-copy and both generated
  forge ports. No command, skill, agent-registration, installer, or contract-validator prose change
  is required for this helper-level behavior fix.
- `scripts/kaola-workflow-adaptive-node.js` is a `GENERATED_AGGREGATOR`; the implementation node owns
  all four coupled edition files and must edit the canonical root file, then run
  `npm run sync:editions` to regenerate the other three. Never hand-edit a generated port.
- The test and implementation surfaces are intentionally one cohesive TDD node: the RED lifecycle
  assertions exercise the same helper and fused opener being changed, and the generated ports must
  move atomically with the canonical source. There is no safe or useful file-disjoint fan-out.
- The recorded Meta validation command is the consumer suite and must run sequentially before
  finalization. Focused RED/GREEN work should run `node scripts/test-adaptive-node.js` and the
  integration acceptance should run `node scripts/simulate-workflow-walkthrough.js` before reusing
  the full four-chain command.
- Evidence for every dispatched node belongs under
  `kaola-workflow/issue-654/.cache/<node-id>.md`; do not create a bare worktree-root `.cache` receipt.

## Node Briefs

### n1-fix-gate-evidence-rotation

Implement the settled repair lifecycle test-first. RED in `scripts/test-adaptive-node.js` using real
temporary directories: prove an existing same-node/same-nonce partial file is preserved byte-for-byte;
an existing exact line-1 `evidence-binding: <same-node> <different-nonempty-nonce>` is entirely
reseeded with the fresh binding and role-token stubs, returns `nonce_rotated: true`, and contains none
of the old verdict, `findings_blocking`, or `upstream_read` values; a malformed binding or different
bound node id is preserved so the existing typed `evidence_unbound`/shape refusal remains available;
and the open/fused dispatch nonce equals the binding nonce actually written. Extend the repair fixture
to prove `repair-node` folds the downstream reviewer and deletes only its barrier baseline while
retaining its blocking evidence body for the reopened writer to consume.

Add a real integration walkthrough in `scripts/simulate-workflow-walkthrough.js` covering writer →
blocking reviewer → `repair-node` → repaired writer close → reviewer reopened with a new nonce →
successful reviewer close, with no manual cache mutation. GREEN by making the single
`seedEvidenceFile` helper nonce-aware: preserve byte-for-byte only for the same node and same nonce;
for the same node and a different non-empty nonce, reseed the entire file exactly as a fresh open;
leave malformed/cross-node bindings untouched and fail-closed; keep explicit `forceRotate=true`
authoritative. Do not delete downstream review evidence inside `runRepairNode`, because that report is
the repair brief. Keep all open paths converged on the helper; do not add orchestrator-side header
patching. After GREEN, run `npm run sync:editions`, verify the three generated copies match the
canonical source modulo forge renames, run the focused tests, then reuse the Meta validation command.

### n2-review

Review the complete bug-fix diff and test evidence. Confirm the same-open path is truly byte-identical,
nonce rotation occurs only for an exact same-node binding with a different non-empty nonce, explicit
`forceRotate` still wins, malformed/cross-node evidence cannot be laundered, and repair retains the
blocking reviewer report until the next genuine open. Check that every opener still uses the common
helper, the returned dispatch nonce matches the newly seeded binding, the lifecycle test performs no
manual cache rewrite, and all four generated adaptive-node editions are synchronized. Require focused
tests plus the sequential four-chain receipt recorded in Meta.

### n3-adversarial-lifecycle

Try to refute the repaired lifecycle with a hermetic temp-directory reproduction. Exercise repeated
writer-repair cycles, not just one: each repair must leave the prior blocking report readable while
the writer is in progress, each subsequent downstream gate open must discard the prior attempt's
verdict/body under its fresh nonce, and each gate must close successfully without a manual header edit.
Also probe same-open crash/resume with a partial body and cross-node/malformed line-1 bindings. Report
whether the fix proves the root invariant or merely masks the first recurrence; this node is read-only.

### n4-finalize

Finalize only after review and adversarial verification pass. Add a concise `CHANGELOG.md` entry under
Unreleased describing automatic downstream gate evidence rotation after writer repair while preserving
same-open resume evidence. Reuse the Meta four-chain validation receipt and preserve existing changelog
formatting.

## Node Ledger

| id | status |
| --- | --- |
| n1-fix-gate-evidence-rotation | complete |
| n2-review | complete |
| n3-adversarial-lifecycle | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix-gate-evidence-rotation) | subagent-invoked | evidence-binding: n1-fix-gate-evidence-rotation 5710e0d58838 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 0ca198bd6efb | |
| adversarial-verifier (n3-adversarial-lifecycle) | subagent-invoked | evidence-binding: n3-adversarial-lifecycle 7c5b01a6cc59 | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 5e7d422712f9 | |
