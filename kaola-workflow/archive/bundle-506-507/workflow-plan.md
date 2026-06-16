# Workflow Plan — bundle-506-507

<!-- plan_hash: d4026f82f2a96b14de632c90ddaf98d4b402a0349f10e2f79fe8c04d2090069c -->

## Meta

labels: area:scripts, area:workflow-router, bug

<!--
Bundle of two issues in the SAME anti-pattern family (audit H1: "transient/opaque fault
swallowed → determinate outcome"), both ×4-edition fixes:

  #506 — sink-merge assertWorktreeClean OUTER `git worktree list` probe keeps a fail-open
         `catch (_) { return; }`. Mirror the #496 inversion: distinguish "no worktree exists"
         (legitimate skip) from "probe failed" (cannot prove → fail closed / bounded retry).
  #507 — classifier boundary-2 internal CLI-fetch catch swallows `e` and collapses a transient
         fault to a determinate `target_unavailable`. Apply the #495 three-bucket design at
         boundary-2: classify spawn-fault / timeout-kill / clean-nonzero, bounded retry (N≤2) on
         transient classes only, emit `indeterminate` on persistent transient (→ result:escalate
         via the existing #495 envelope). ACTIVATES the #495 forge forward-compat handlers.

WRITE-SET GROUNDING (verified pre-freeze):
  - classifier.js + sink-merge.js are both COMMON_SCRIPTS byte-pairs: root `scripts/<name>` and the
    codex twin `plugins/kaola-workflow/scripts/<name>` MUST co-occur in one node (#274/#301
    sync-group co-occurrence rule). The gitlab/gitea ports are hand-mirrors (renamed, token-pinned,
    NOT byte-synced) and are kept in the SAME node (semantically coupled cross-edition change, #309;
    no file-count ceiling forces a split, #453).
  - #507 needs NO root/codex claim.js edit: claim.js's verdict→envelope mapping is VERDICT-KEYED
    (scripts/kaola-workflow-claim.js:940 scalar, :1266 bundle) and already routes a parsed
    `verdict:'indeterminate'` (clean exit) → status:target(_set)_indeterminate, result:escalate.
    classifyIssue (:730) JSON.parses the clean-exit stdout and returns the verdict verbatim. The
    forge claim.js forward-compat `indeterminate` handlers already exist (#495) and become reachable.
  - #306 grep of the NEW token `indeterminate` across scripts/ + all plugins/*/scripts/ + the four
    validate-*-contracts.js + adaptive-schema.js found NO classifier-verdict allowlist; the only
    hits are the git-ancestry `ancestry_indeterminate` (release-surface-drift / contracts, unrelated)
    and the existing #495 envelope handlers. No contract-validator edit required.
  - Decision record D-495-01 (existing) already pre-authorizes this boundary-2 follow-up ("Known
    Related Follow-up" section). Editing that record is OUT of this run's write-set: #337 forbids a
    frozen write-set from hardcoding an already-shipped decision-record path, and no AC requires it.
    The boundary-2 resolution is captured by the #507 CHANGELOG entry plus the now-reachable forge
    forward-compat handlers; a slightly-stale "Known Follow-up" note in the record is harmless.

PARALLEL-SAFETY (within the bundle): n1 and n2 are an ANTICHAIN (no dep edge), EXACT-PATH disjoint.
  They share the SHARED_INFRA coarse area `scripts` / `plugins/kaola-workflow/scripts`, and a
  non-shared coarse area `plugins` (the two forge trees). Per the validator's inferred concurrent-
  sibling check: EXACT-file overlap refuses (none here); a coarse-area overlap is flagged ONLY with
  a shared ANCESTOR — n1/n2 are root nodes that converge only at the n3/n5 DESCENDANTS, so the pair
  is skipped (no false refusal). Freezes in-grammar. With write_overlap_policy:off (default) the
  `--parallel-safe` query reports them as NOT co-schedulable (coarse `plugins` overlap) → serial-
  degrade, which is correctness-first and dispatch-blessed. Shared-test-file collision is avoided
  by construction: #506 and #507 use DISJOINT test homes (#506: simulate-workflow-walkthrough.js +
  test-{gitlab,gitea}-sinks.js; #507: test-claim-hardening.js + test-{gitlab,gitea}-workflow-scripts.js).

PARALLEL-SAFETY (with the concurrent #500 machine): #500 owns
  scripts/kaola-workflow-adaptive-node.js, commands/kaola-workflow-plan-run.md, and the 6-surface
  toggle prose — NONE appear in any node write-set here. The only shared file is CHANGELOG.md
  (append-only [Unreleased]; PROTECTED basename, kept on the docs node only; clean rebase).
-->

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-sink-merge-fix | tdd-guide | — | scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js, scripts/simulate-workflow-walkthrough.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js, plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js | 7 | sequence | sonnet |
| n2-classifier-fix | tdd-guide | — | scripts/kaola-workflow-classifier.js, plugins/kaola-workflow/scripts/kaola-workflow-classifier.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js, scripts/test-claim-hardening.js, plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js | 7 | sequence | sonnet |
| n3-review | code-reviewer | n1-sink-merge-fix, n2-classifier-fix | — | 1 | sequence | opus |
| n4-docs | doc-updater | n3-review | CHANGELOG.md | 1 | sequence | sonnet |
| n5-finalize | finalize | n4-docs | — | 1 | sequence | — |

## Plan Notes

- **n1-sink-merge-fix (#506, tdd-guide, sonnet):** RED→GREEN with real-git tests. RED: force the
  OUTER `git worktree list --porcelain` probe in `assertWorktreeClean` to throw (a test seam mirroring
  the existing `KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL` inner-probe seam) and assert the destructive
  `git worktree remove --force` is NOT reached / the sink refuses. GREEN: invert the `catch (_)
  { return; }` to distinguish "no worktree" (legitimate skip) from "probe failed" (cannot prove →
  refuse, with one bounded retry), mirroring the #496 inner-probe inversion. ~1 line of logic per
  edition; NOT a retry framework. Canonical spec for the codex byte-twin = byte-identical to root
  (#274 co-occurrence enforced). Canonical spec for the gitlab/gitea hand-ports = mirror the full
  accumulated root diff modulo forge nouns (the forge ports keep `git`/worktree nouns; no forge-CLI
  noun is involved here). Tests: canonical walkthrough (claude+codex chains) + test-{gitlab,gitea}-sinks.js.
- **n2-classifier-fix (#507, tdd-guide, sonnet):** RED→GREEN with injected crashing CLI fetch. RED:
  inject a crashing forge fetch (`ghExec`/`forge.viewIssue` via execFileSync) per edition; assert a
  PERSISTENT transient fault emits `verdict:'indeterminate'` (→ result:escalate through the existing
  #495 envelope + the now-reachable forge forward-compat handlers) and a DETERMINATE clean-nonzero is
  NOT retried and stays `target_unavailable`. GREEN: stop discarding `e`; classify spawn-fault /
  timeout-kill / clean-nonzero (same `e.code`/`e.signal`/`e.status` taxonomy #495 uses in
  claim.js classifySubprocessError); bounded in-script retry N≤2 on transient classes only.
  Read decision record D-495-01 (existing) (§D4 boundary-1 vs boundary-2) before authoring — DONE at
  plan time; root/codex claim.js confirmed verdict-keyed and OUT of scope. Root + codex twin are
  byte-identical (#274 co-occurrence). gitlab/gitea hand-ports keep forge-neutral nouns (the
  in-process forge path; gitlab `glab`, gitea forge-neutral). Tests: test-claim-hardening.js
  (claude+codex chains) + test-{gitlab,gitea}-workflow-scripts.js — these EXERCISE the previously-
  unreachable #495 forge forward-compat `indeterminate` handlers (AC requirement).
- **n3-review (code-reviewer, opus):** G1 post-dominator over both implements. This fail-open /
  fail-closed-inversion class benefits from adversarial review (assigned opus to concentrate reasoning
  at the gate): verify each probe correctly distinguishes "absent" from "unprovable", that transient
  classification matches the #495 taxonomy, that determinate verdicts are NOT retried, and that no
  edition diverged from the canonical spec.
- **n4-docs (doc-updater, sonnet):** append CHANGELOG.md `[Unreleased]` entries for #506 + #507.
  Public-interface-neutral (no API/schema change — the additive `indeterminate` verdict is already
  documented by #495). Decision record D-495-01 (existing) is intentionally NOT edited (see Meta).
- **n5-finalize (finalize):** docs/state-only sink (Phase-6). No code write.

## Node Ledger

| id | status |
| --- | --- |
| n1-sink-merge-fix | complete |
| n2-classifier-fix | complete |
| n3-review | complete |
| n4-docs | complete |
| n5-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-sink-merge-fix) | subagent-invoked | evidence-binding: n1-sink-merge-fix ff4ac1fab33a | |
| tdd-guide (n2-classifier-fix) | subagent-invoked | evidence-binding: n2-classifier-fix 2630a2c3a14f | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review d38d7ba7fd7c | |
| doc-updater (n4-docs) | subagent-invoked | evidence-binding: n4-docs 0271c8bec402 | |
| finalize (n5-finalize) | main-session-direct | evidence-binding: n5-finalize 78f55b3b3523 | |
