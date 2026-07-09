# Adaptive Workflow Plan - issue-648

<!-- plan_hash: 80a3fd7f360fe21b68ba3546910c51d813760ae2727ddef8039d3ad0c48a1c95 -->

Reduce repeated finalize-tail validation work by making receipt sequencing explicit, adding
diagnostic culprit paths for stale chain receipts, and allowing consumer final-validation evidence
to cite an unchanged terminal gate run.

## Meta

labels: enhancement
validation_command: npm test
validation_test_consumes: README.md, CHANGELOG.md, docs/api.md, docs/workflow-state-contract.md, docs/agents-source.md
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-explore | code-explorer | - | - | 1 | sequence | standard |
| n2-stale-culprits | tdd-guide | n1-explore | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence | reasoning |
| n3-runtime-prose | implementer | n1-explore | templates/routing/plan-run.skeleton.md, templates/routing/slots.js, commands/kaola-workflow-plan-run.md, commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 14 | sequence | standard |
| n4-review | code-reviewer | n2-stale-culprits, n3-runtime-prose | - | 1 | sequence | reasoning |
| n5-docs | doc-updater | n4-review | docs/api.md, docs/decisions/D-648-01.md | 2 | sequence | standard |
| n6-adversarial | adversarial-verifier | n5-docs | - | 1 | sequence | reasoning |
| n7-finalize | finalize | n6-adversarial | CHANGELOG.md, kaola-workflow/ROADMAP.md | 2 | sequence | - |

## Node Briefs

### n1-explore

Map the existing chain receipt freshness path, finalization prose surfaces, skill mirrors, and
walkthrough coverage before editing. Confirm the exact validator helpers to reuse for visibility
classification and the exact command/skill paragraphs that must carry the sequencing and citation
rules. Record likely test commands and any write-set concerns in evidence.

### n2-stale-culprits

Implement the additive `chains_stale` diagnostic fields without changing the refusal decision:
compute best-effort stale paths only when the receipt has a resolvable clean stamped tree, classify
them with the same validation-visible predicate used by the code-tree hash, cap emitted paths, and
degrade to the existing generic refusal on uncertainty. Add the requested walkthrough cases for
prose-only, code, inert-doc pass, unresolvable head, and dirty-stamp degradation. Keep the canonical
validator and all generated edition ports in sync with `npm run sync:editions`.

### n3-runtime-prose

Add provenance-free, forge-neutral runtime prose to the plan-run and finalize command/skill mirrors:
the self-host chain receipt stamp is the last action before Finalization after all test-consumed prose
lands; validation-invisible workflow state and inert docs do not stale the receipt; `chains_stale`
diagnostics still require a full restamp; consumer `final-validation.md` may cite an unchanged
terminal change-gate validation run using the specified fields when the boundary is truthful.
`non_tdd_reason`: agent-facing prose and prompt wiring, validated by existing routing/contract checks
rather than a meaningful failing unit test.

### n4-review

Review the code and prompt-surface changes together. Verify `chains_stale` remains fail-closed with
the same `reason`, the new payload fields are additive, generated validator ports match canonical,
the command/skill mirrors are semantically aligned, and no agent-facing prompt gained provenance
noise.

### n5-docs

Document the additive finalize-check emit fields in `docs/api.md` and write decision record
`D-648-01` for the sequencing/diagnostic/citation contract. Confirm docs describe current behavior
without changing the consumer finalize-check gate semantics.

### n6-adversarial

Try to refute the final result against the issue acceptance criteria. Specifically check for hidden
receipt invalidation after docs/prose edits, stale-kind misclassification, consumer citation
fail-open risk, cross-edition drift, and missing six-surface propagation. Run focused validation
where useful and record concrete evidence.

### n7-finalize

Apply the CHANGELOG entry, regenerate roadmap state, run the final validation/receipt flow after the
last test-consumed prose edit, sweep run gaps, close issue 648, and archive/release the workflow
folder.

## Plan Notes

- **Delegation recovery.** The main session invoked the installed `workflow-planner` role twice.
  Both attempts claimed/logged dispatch but stalled before authoring `workflow-plan.md`; this plan
  preserves the claimed adaptive project and continues through the same validator/handoff scripts
  rather than discarding live workflow state.
- **Generated validator coupling.** `kaola-workflow-plan-validator.js` is a generated aggregator, so
  n2 declares the canonical script, the codex twin, and both forge-renamed ports in one node. The
  node also declares the walkthrough file that carries the new finalize-check cases.
- **Prompt-surface coupling.** n3 keeps the plan-run generated source templates, rendered command
  surfaces, and SKILL mirrors together so the stamp-last and consumer-citation rules cannot drift
  between runtime surfaces. The prose must stay forge-neutral and must not include issue numbers,
  decision ids, invariant tags, or ADR citations.
- **Docs after review.** `docs/api.md` is test-consumed prose, so n5 intentionally lands before
  final validation. The final chain receipt must be stamped only after n5 and n7's CHANGELOG edit are
  complete.
- **Validation.** The final validation command is `npm test`, which runs the claude, codex, gitlab,
  and gitea chains sequentially in this repo. Focused node validation should include
  `node scripts/simulate-workflow-walkthrough.js`, `npm run sync:editions`, route reachability, and
  the edition contract validators as relevant.

## Node Ledger

| id | status |
| --- | --- |
| n1-explore | complete |
| n2-stale-culprits | complete |
| n3-runtime-prose | complete |
| n4-review | complete |
| n5-docs | complete |
| n6-adversarial | complete |
| n7-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-explore) | subagent-invoked | evidence-binding: n1-explore 51876192226e | |
| implementer (n3-runtime-prose) | subagent-invoked | deferred_to_group | |
| tdd-guide (n2-stale-culprits) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n4-review 2da7266a4a5c | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 0ed5bca52ad1 | |
| adversarial-verifier (n6-adversarial) | subagent-invoked | evidence-binding: n6-adversarial c35a0f74e153 | |
| finalize (n7-finalize) | main-session-direct | evidence-binding: n7-finalize 846d7b8aab38 | |
