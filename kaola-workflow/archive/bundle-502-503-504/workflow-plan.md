# Adaptive Workflow Plan — bundle-502-503-504

<!-- plan_hash: e11fbdb6e3a832c1522237056e4cd506db523a35cbc8d712af2d72b07e696d9a -->

Same-scope bundle of three MEDIUM reliability-audit bug fixes with mutually-disjoint
write-sets (and disjoint from the concurrently-live #500 adaptive-engine-core set). Each
fix is forge-replicated across the 4 editions and stays in ONE node (cross-edition mirrors
move atomically, #309/#453). All three are bug fixes → `tdd-guide` (RED→GREEN). The three
implement nodes are an antichain (no inter-deps, disjoint write-sets) so the scheduler can
overlap them; a single `code-reviewer` gate post-dominates all three (G1), `doc-updater`
owns CHANGELOG.md, and a unique `finalize` sink closes the run.

## Meta

labels: area:scripts, bug

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-roadmap-empty-source-guard | tdd-guide | — | scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow/scripts/kaola-workflow-roadmap.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence | sonnet |
| n2-resume-ambiguity-guard | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/test-claim-hardening.js | 5 | sequence | sonnet |
| n3-fast-compliance-backstop | tdd-guide | — | scripts/kaola-workflow-fast-advance.js, plugins/kaola-workflow/scripts/kaola-workflow-fast-advance.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-fast-advance.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-fast-advance.js, scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js, commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md, plugins/kaola-workflow/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-fast/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-fast/SKILL.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md, scripts/test-fast-advance.js, scripts/test-route-reachability.js | 22 | sequence | sonnet |
| n4-code-review | code-reviewer | n1-roadmap-empty-source-guard, n2-resume-ambiguity-guard, n3-fast-compliance-backstop | — | 1 | sequence | opus |
| n5-doc-update | doc-updater | n4-code-review | CHANGELOG.md | 1 | sequence | sonnet |
| n6-finalize | finalize | n5-doc-update | — | 1 | sequence | — |

## Plan Notes

- **n1 (#502)** — broaden `guardAgainstMissingRoadmapSource` (roadmap.js:113-122) to refuse
  when the source-file count is 0 (or < prior active-row count) while the prior mirror had
  active rows — key on source-file-count vs prior-active-rows, not dir-existence. The empty-but-
  present `.roadmap/` (only `_rules.md`/`.DS_Store` left) must trip the guard. Forge-replicated:
  4 editions move atomically. RED→GREEN in `simulate-workflow-walkthrough.js` (sole roadmap-guard
  test home; existing roadmap assertions live there, e.g. line ~1017). Scope is fully contained
  in roadmap.js — does NOT touch the `roadmap-source-absent` closure invariant (that lives in
  claim.js/closure-contract.js, owned by n2's lane only for claim.js but NOT edited there).
- **n2 (#503)** — in `cmdResume` (claim.js:1386): when `--project` is absent AND
  `readActiveFolders(root).length > 1`, emit a typed `resume_ambiguous` refusal listing the
  candidate folders (no new token elsewhere — `resume_ambiguous` is net-new). Preserve the
  single-folder back-compat path. Forge-replicated: 4 editions. RED→GREEN in
  `test-claim-hardening.js`.
- **n3 (#504)** — fail-closed compliance backstop on the FAST lane (asymmetric-with-full fix):
  (a) `fast-advance.js` must `require('./kaola-workflow-repair-state.js')` (mirror full-advance's
  edge; forge ports require their forge-named twin) and call `unresolvedCompliance(content, state)`
  in the `summary-write --verdict PASSED`/finalize path; (b) make the default code-reviewer row
  neutral/pending — NOT the fabricated green `invoked` (fast-advance.js:257-261); (c) fail-closed
  when a delegation policy is required but absent. `delegationPolicyCompliance` (repair-state.js:226-
  228) is SHARED with the full path — any "policy absent" fail-close MUST be fast-path-scoped or it
  regresses full-path tests (claude chain). Prose backstop (the mandatory-delegated-code-reviewer
  rule + the neutral/pending default-row example) mirrors across the FULL fast-lane + finalize prose
  surface: 3 fast commands (`kaola-workflow-fast.md` + 2 forge) + 3 fast SKILLs + 3 finalize commands
  + 3 finalize SKILLs (#400/#286 command↔SKILL mirror-consistency — finalize commands and finalize
  SKILLs both carry the delegation-status/mandatory-delegated prose, so editing one without the other
  is the recurring missed-mirror discard). CONSCIOUS EXCLUSION: the FULL-path `phase5.md` (×3)
  `code-reviewer | invoked` default at :310 is out of scope — the full path already self-validates
  fail-closed via `unresolvedCompliance` at every boundary; #504 is the fast-lane asymmetry only.
  RED→GREEN in `test-fast-advance.js`; `test-route-reachability.js` carries the propagated-prose pin
  assertion. None of these scripts are GENERATED_AGGREGATORS, so `generated_port_split` does not
  apply — the 4-edition fan is declared explicitly per the rename-normalized convention.
- **Cross-edition:** every node's edition set is enumerated by EXACT forge-port path (root +
  plugins/kaola-workflow + gitlab `kaola-gitlab-` + gitea `kaola-gitea-`). Run must end with all
  four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green (cross-edition diff).
- **Parallel-safety (#500):** NO write-set member touches the adaptive-engine core
  (`kaola-workflow-adaptive-node.js`, `kaola-workflow-next-action.js`,
  `kaola-workflow-adaptive-schema.js`, `kaola-workflow-plan-validator.js`,
  `commands/kaola-workflow-plan-run.md`, the 3 plan-run SKILL packs). CHANGELOG.md (n5) is the one
  expected trivially-merging shared file.
- **No new ADR / decision record:** three straightforward bug fixes; no architecture decision to
  record. No `D-502/503/504-NN` id is hardcoded anywhere in the write sets.
- **Disjointness:** n1/n2/n3 test homes are distinct (walkthrough / test-claim-hardening.js /
  test-fast-advance.js+test-route-reachability.js); production write-sets are file-disjoint. They
  form an antichain (no dep edges) so the validator may derive parallel-safety; serial-degrade for
  write roles is acceptable (correctness-first).

## Node Ledger

| id | status |
| --- | --- |
| n1-roadmap-empty-source-guard | complete |
| n2-resume-ambiguity-guard | complete |
| n3-fast-compliance-backstop | complete |
| n4-code-review | complete |
| n5-doc-update | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-roadmap-empty-source-guard) | subagent-invoked | evidence-binding: n1-roadmap-empty-source-guard 15dd4c3c8a9b | |
| tdd-guide (n2-resume-ambiguity-guard) | subagent-invoked | evidence-binding: n2-resume-ambiguity-guard c4a1c6908322 | |
| tdd-guide (n3-fast-compliance-backstop) | subagent-invoked | evidence-binding: n3-fast-compliance-backstop 2f85bae8a63c | |
| code-reviewer | subagent-invoked | evidence-binding: n4-code-review 3f8c71570aef | |
| doc-updater (n5-doc-update) | subagent-invoked | evidence-binding: n5-doc-update 913753fb1f7f | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 7e9c45c2d493 | |
