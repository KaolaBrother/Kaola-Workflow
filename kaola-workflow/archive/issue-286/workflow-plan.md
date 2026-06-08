# Adaptive Workflow Plan — issue-286

<!-- plan_hash: 56c9fb549e157a8bc7f68c47d8ac9544d4c3cb290479d385c1bbccddace67ba7 -->

fix(codex): drop the Claude-only model resolver from the Codex skills + run closure
attestation on all receipt paths. Two orthogonal alignment fixes (follow-ups to #266),
fully file:line-audited (two prior passes were discarded for INCOMPLETE write-sets that
edited only the SKILL.md half of each init-template byte-identity pair and omitted the
adapt skill).

- Fix 1 — drop the `~/.claude/agents`-reading `model=`/resolver-dispatch instruction. It
  splits into TWO file-groups that CANNOT share a node (8 files > FILE_CEILING 6):
  - Fix 1a (impl_initpairs, 6 files = FILE_CEILING): the init-template lives INSIDE the
    `<!-- KW-CLAUDE-TEMPLATE-START/END -->` region that validate-kaola-workflow-contracts.js
    (lines 429-443) enforces BYTE-IDENTICAL within each forge PAIR — so each pair
    (command + init SKILL) MUST be edited TOGETHER. The rewrite is EDITION-NEUTRAL (shared
    byte-identically claude↔codex per AC3): drop the `~/.claude/agents` + `model=` literals,
    KEEP the "pass the role's configured model on the spawn call" intent. This DOES change
    the user-facing Claude CLAUDE.md template — the issue's accepted AC3 consequence,
    recorded in CHANGELOG/PR body (handled by the finalize node), not shipped silently.
  - Fix 1b (impl_opskills, 2 files): the operational Codex skills — plan-run/SKILL.md (~line
    169 dispatch clause) + adapt/SKILL.md (~lines 22-23 "comes only from resolve-agent-model").
    github Codex only (gitlab/gitea have no adapt skill and no plan-run resolver ref).
  Both 1a and 1b are prose/operational-text edits with no natural failing unit test ⇒
  role `implementer` (non_tdd_reason recorded below); verification = `npm test` green.

- Fix 2 (test_closure_attest, 5 files): `checkDispatchAttestations` (claim.js:51) runs only
  after the cmdFinalize receipt; it is MISSING after the two watch-pr `buildClosureReceipt`
  callers (~:1326, ~:1347). Add it to BOTH watch-pr paths across all FOUR claim.js editions
  (the scripts/ ↔ plugins/kaola-workflow/scripts/ byte-pair edited IDENTICALLY, plus the two
  forge forks), and extend the existing watch-pr MERGED harness in the walkthrough with a
  closure-attestation assertion. `closure-contract.js` is NOT involved and is NOT in the
  write-set. Genuinely test-first ⇒ role `tdd-guide`.

DAG shape: the three implement nodes are independent ROOTS (disjoint write-sets — Fix 1a =
commands/ + plugins/*/{commands,skills}; Fix 1b = plugins/kaola-workflow/skills; Fix 2 =
scripts/ + plugins/*/scripts/). They share only the code-reviewer DESCENDANT, never an
ancestor, so the inferred concurrent-sibling coarse-area check is skipped (no false ASK) and
no exact-file overlap exists. One code-reviewer (G1) post-dominates all three code producers;
one unique finalize sink (docs/state only) closes the plan. Critical path = 3 levels.

## Meta

labels: enhancement, area:scripts

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| impl_initpairs | implementer | — | commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md | 6 | sequence |
| impl_opskills | implementer | — | plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md | 2 | sequence |
| test_closure_attest | tdd-guide | — | scripts/kaola-workflow-claim.js, plugins/kaola-workflow/scripts/kaola-workflow-claim.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js, scripts/simulate-workflow-walkthrough.js | 5 | sequence |
| review | code-reviewer | impl_initpairs, impl_opskills, test_closure_attest | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md, kaola-workflow/issue-286/workflow-state.md | 1 | sequence |

<!-- impl_initpairs non_tdd_reason: edition-neutral prose edit to the init-template region —
     drop the `~/.claude/agents`+`model=` literals from three byte-identity command/SKILL
     pairs, keeping the "pass the role's configured model" intent. Markdown documentation,
     no behavioral logic and no natural failing unit test; change-type verification is
     `npm test` byte-identity green. -->
<!-- impl_opskills non_tdd_reason: operational-text edit removing the Claude-only resolver
     dispatch clause from two Codex skill bodies (plan-run + adapt). Prose, not a code path;
     no natural failing unit test. -->

## Node Ledger

| id | status |
|----|--------|
| impl_initpairs | complete |
| impl_opskills | complete |
| test_closure_attest | complete |
| review | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (impl_initpairs) | subagent-invoked | node: impl_initpairs (implementer) — Fix 1a edition-neutral init-template rewrit | |

| implementer (impl_opskills) | subagent-invoked | node: impl_opskills (implementer) — Fix 1b drop resolve-agent-model dispatch cla | |
| tdd-guide (test_closure_attest) | subagent-invoked | node: test_closure_attest (tdd-guide) — Fix 2 closure attestation on all receipt | |
| code-reviewer | subagent-invoked | verdict: pass | |
| finalize (finalize) | subagent-invoked | node: finalize (sink) — Phase 6 finalization evidence for issue-286 | |
## Design Notes

- impl_initpairs (implementer, 6 files = FILE_CEILING): the target sentence ("Use the
  vendored agent names exactly as installed under ~/.claude/agents ... pass it explicitly as
  model=") is INSIDE the `<!-- KW-CLAUDE-TEMPLATE-START/END -->` region. EACH forge pair must
  be edited TOGETHER (command + init SKILL) or the byte-identity assertions in
  validate-kaola-workflow-contracts.js (lines 429-443) trip. Rewrite is EDITION-NEUTRAL —
  reads correctly for the Claude command AND the byte-identical Codex skill (AC3). Drop the
  `~/.claude/agents` + `model=` literals; keep the intent that each agent ships its model in
  its installed profile (passed on the spawn call). NO contract validator pins these prose
  tokens (verified) — removal is safe. This was the gap that discarded the two prior passes:
  they edited only the SKILL.md halves and omitted the command halves + the adapt skill.
- impl_opskills (implementer, 2 files): plan-run/SKILL.md (~line 169) drop the "resolve its
  model via ...resolve-agent-model.js <role>" dispatch clause (Codex delegates by role name);
  adapt/SKILL.md (~lines 22-23) rewrite "the author never sets a model — it comes only from
  resolve-agent-model" so it does not dangle the Claude-only resolver (the model comes from
  the role's `model_reasoning_effort` tier). gitlab/gitea have no adapt skill and no plan-run
  resolver ref (verified) — github Codex only.
- test_closure_attest (tdd-guide, 5 files, RED→GREEN): `checkDispatchAttestations`
  (claim.js:51) is LOCAL to claim.js and currently runs only after the cmdFinalize receipt
  (~:951/965); add it after the two watch-pr `buildClosureReceipt` callers (~:1326, ~:1347)
  so every close path runs the M2 attestation step (`missing` when no producer,
  `attested`/`violation` when one exists — never a stale `failed` default). Apply across all
  FOUR claim.js editions: the scripts/ ↔ plugins/kaola-workflow/scripts/ github PAIR is
  byte-identical (validate-script-sync COMMON_SCRIPTS) — edit IDENTICALLY; gitlab/gitea are
  forge ports of the same logical fix. Failing-test-first against the existing watch-pr MERGED
  harness in simulate-workflow-walkthrough.js (~line 3125 and ~4465-4523): extend it with a
  closure-attestation assertion that is RED before the fix. `closure-contract.js` is NOT in
  the write-set. RED proof on FULL `npm test` (the gitlab/gitea contract validators do not run
  under the walkthrough alone).
- review (code-reviewer, G1): post-dominates all three code producers (impl_initpairs,
  impl_opskills, test_closure_attest). Labels are non-sensitive (enhancement / area:scripts)
  and no write-set touches a `*security*`/auth/secret/CI surface ⇒ code-reviewer alone
  satisfies the gates; G2 not triggered, no security-reviewer node required.
- finalize (finalize): unique docs/state sink. CHANGELOG.md [Unreleased] entry MUST explicitly
  note the user-facing Claude CLAUDE.md-template wording change (AC3) + the watch-pr closure
  attestation fix (AC2) + the Codex resolver-reference removal (AC1). No doc-updater node:
  the only public-interface-doc change is the CLAUDE.md template itself, which IS the
  impl_initpairs edit; the CHANGELOG note (authored here) records it. workflow-state.md is the
  durable Phase-6 state. `npm test` must be green across all four editions before sink.
