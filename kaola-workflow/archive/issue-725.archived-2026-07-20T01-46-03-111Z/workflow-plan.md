# Workflow Plan — issue #725 — epoch 2

<!-- plan_hash: 140d43789b0697665993b79ef3f872ea26998cbef0f152d007473e31ac5ecaa0 -->

## Meta

project: issue-725
labels: area:scripts, area:workflow-phases, area:workflow-router, enhancement, workflow:in-progress
speculative_open_policy: auto
plan_schema_version: 2
contract_version: 2
epoch_schema_version: 2
epoch_lineage_id: 9dd20b195b0efe673f16fe6a1264b0173ee3574c9ec6c49e344dbbc817cb3627
plan_epoch: 2
parent_plan_hash: b3342240ee6e72feb892915ac45a0d984ebd6920f09cb09fb073f4bd25904748
parent_snapshot_manifest_digest: 52584a58ca5d8ddcd5666259e1f6df77a8b45ff6c4baa21fb2a0a4dc1d39c51b
claim_root_base_digest: 59e3bf182d11182956df3dfa8db2f0e1df12f3eb0cfad24e86c53d30f9fff475
inherited_frontier_digest: 103c4d1707f6f85f1ebd2bd571f3311cfbaa8e8386dcca346f5229b6525b2394
inherited_frontier_classes: code,security
transition_reason: review_repair_requires_replan
source_evidence_digest: f6792a16d6bc53dc1ec8f61672650924ed4a8bb84cb0daefcc0120cdcbeb60bc
planner_binding: 224bf249299d
validation_command: npm test
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: r2-code-certify
security_certifier: r3-security-certify

## Plan Notes

Epoch 2 of Phase C ("guard dedup") of epic #725 — a claim-preserving repair of the epoch-1 frontier.
The frozen epoch-1 parent plan (`workflow-plan.md`, hash `b3342240...`) is an immutable parent and is
never a write target. Claim `issue-725`, branch `workflow/issue-725`, the worktree, claim root, parent
plan hash, and epoch-lineage identity are preserved verbatim from the attested re-plan packet. Run base
is `0a9f652a` (Phases A and B already shipped on main); this epoch lands the Phase C repair only and
leaves #725 OPEN (Phases D and E remain).

The epoch-1 substance was accepted as faithful by the `n7-code-certify` gate (dedup + integrity fast-path
+ hook deletion + docs all verified correct); it failed ONLY the four-chain-green element because five
assertion/consumer surfaces the hook deletion trips were missed by the epoch-1 write-set/needle scoping.
Four of the five anchor in files no epoch-1 node owned (the claim-preserving replan path), and one anchors
inside the completed `n5-hook-deletion` write set — but `n5` is graph-non-maximal (the completed
downstream writer `n6-docs` sits below it), so an in-place single-node repair is impossible and the frontier
routes to this fresh epoch. All five share ONE already-proven fix shape: narrow the assertion/list/count to
the surviving two-hook surface (`SessionStart` compact-context + `SubagentStart` subagent-dispatch-log).

The five surfaces (each red over the epoch-1 candidate; each independently reproduced by the gate):
- R1 — `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (gitlab chain): the fresh-
  install hooks.json assertion hard-requires a populated `PreToolUse` event.
- R2 — `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (gitea chain): the same shape
  over the gitea installed hooks.json.
- R3 — `scripts/test-validate-script-sync.js` (claude chain, step 2): the drift-plant fixture pushes onto
  `rootHooks.hooks.PreToolUse`, a key the deletion removed, throwing at module load.
- R4 — `scripts/sync-opencode-edition.js` (claude chain, step 11, via `test-install-adaptive-config.js` ->
  `install-opencode.sh`): `HOOK_SCRIPTS` still lists the two deleted hook basenames, so `writeHooks`
  ENOENTs regenerating the `.opencode` tree.
- R5 — `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:736` (codex chain): the #409
  `test409StableHomeSurvivesDirDeletion` still asserts `commandCount >= 4` managed hook commands.

Shape rationale (single cohesive repair writer under a common certifier wall). The five fixes are one
mechanical class over five genuinely-disjoint files that live in four different edition chains; there is no
file-count ceiling forcing a split, and fanning five one-line edits into five legs would add dispatch +
merge + group-barrier overhead for no critical-path gain, so they are ONE writer node (`r1-hook-assert-
repair`, `implementer` — mechanical narrowings, no natural failing-unit-test to author first; the failing
oracle is the four edition chains). The repair produces code, so it is walled by a common CODE certifier
(`r2-code-certify`) that post-dominates it; the packet's inherited frontier carries BOTH `code` and
`security`, so a common SECURITY certifier (`r3-security-certify`) also post-dominates the frontier to
discharge the inherited security class. Both certifiers are code-reviewer / security-reviewer walls, NOT
adversarial-verifier change gates: schema-2 adversarial change-gate findings currently settle empty (open
defect), so per the interim guidance the review gates are the two reviewer roles — matching the epoch-1
plan's own choice. The chain `r1 -> r2 -> r3 -> r4` makes `r1` the sole root, both certifiers post-dominate
it, and each covers the inherited frontier (no root reaches the sink bypassing either wall). A finding from
either certifier reopens `r1` in place (it is graph-maximal in this epoch).

Scope. The candidate touches the edition trees (the two forge test scripts + the codex-plugin walkthrough),
so finalization requires all four `npm test` chains green — `validation_command: npm test` is the complete
gate. R4 is a MINIMAL narrowing of the opencode generation hook list, forced only because the opencode sync
script is transitively exercised inside the claude chain (`install-opencode.sh`); it is NOT a full opencode
re-sync. opencode and kimi remain additive runtimes (not wired into `npm test`), and their remaining hook-
basename references (`sync-kimi-edition.js`, `test-opencode-edition.js`, `test-kimi-edition.js`) reconcile
at the Phase D cross-edition boundary per the epic — none of them is shelled by any of the four chains, so
they raise no four-chain obligation here. No docs or public-interface change (the epoch-1 `n6-docs` already
recorded the hook removal + guard dedup under CHANGELOG `[Unreleased]`), so no doc node and no new decision
record — the epoch-2 repair only makes the already-documented change's tests green. Traps carried from the
parent: do NOT touch the canonical `scripts/simulate-workflow-walkthrough.js` (it carries no #409/PreToolUse
assertion — the codex twin is not byte-identical to it here); do NOT re-add any `PreToolUse` entry or touch
the surviving compact-context / subagent-dispatch-log hooks or their assertions; do NOT touch
`kaola-workflow-adaptive-schema.js`.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| r1-hook-assert-repair | implementer | — | plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js, plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js, scripts/test-validate-script-sync.js, scripts/sync-opencode-edition.js, plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js | 5 | sequence | — | standard | — | — | — | — | — | — |
| r2-code-certify | code-reviewer | r1-hook-assert-repair | — | 1 | sequence | — | reasoning | — | — | the epoch-2 repair makes all four edition chains green over the full accumulated Phase C candidate and introduces no new code defect across the four editions: the gitlab and gitea fresh-install hooks.json assertions no longer require a PreToolUse event, the script-sync drift-plant fixture plants onto a surviving event instead of the removed PreToolUse key, sync-opencode-edition.js HOOK_SCRIPTS no longer lists the two deleted hook basenames so the in-chain install-opencode.sh regeneration stops ENOENT-ing, and the codex walkthrough #409 managed-hook-command count matches the surviving two managed commands; every surviving hook, assertion, and behavior is preserved and only the five diagnosed surfaces changed | the full accumulated Phase C candidate vs run base 0a9f652a across all four editions — the epoch-1 guard-dedup + two-hook-deletion frontier plus the epoch-2 five-file assertion repair — reviewed against AC-C and the recorded four-chain-green evidence | sequence | — |
| r3-security-certify | security-reviewer | r2-code-certify | — | 1 | sequence | — | reasoning | — | — | the full accumulated Phase C candidate introduces no security regression against the inherited security frontier: deleting the two advisory guard hooks removes only best-effort advisory guidance with no enforced security boundary while the fail-closed barriers, gate-role post-dominance, and per-mutation plan-integrity check remain the real controls, and the epoch-2 repair only narrows test assertions and one generation hook list with no change to any security-relevant runtime path and no exposed secret, credential, or trust surface | the full accumulated Phase C candidate vs run base 0a9f652a, security dimension — the inherited security frontier plus the epoch-2 repair, reviewed for any weakened enforcement, exposed secret, or trust-boundary regression | sequence | — |
| r4-finalize | finalize | r3-security-certify | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Node Briefs

### r1-hook-assert-repair

Mechanical repair of the five hook-deletion assertion/consumer surfaces the epoch-1 frontier missed. Every
fix is the same class — narrow the named surface to the surviving two managed hooks (`SessionStart`
compact-context + `SubagentStart` subagent-dispatch-log). Read the `n5-hook-deletion` and `n7-code-certify`
evidence files under `kaola-workflow/issue-725/.cache/` first; they carry the exact diagnosis and the
reproduction for each surface. Apply exactly these, and nothing else:

- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (~:2063): the fresh-install
  hooks.json loop `for (const event of ['SessionStart', 'PreToolUse', 'SubagentStart'])` — drop
  `'PreToolUse'` so it iterates `['SessionStart', 'SubagentStart']`. The installed gitlab hooks.json now
  carries exactly those two events.
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (~:2027): the same fix on
  `const requiredEvents = ['SessionStart', 'PreToolUse', 'SubagentStart'];` — drop `'PreToolUse'`.
- `scripts/test-validate-script-sync.js` (~:142, section 6a drift RED-PROOF): the fixture plants a drift
  matcher via `rootHooks.hooks.PreToolUse.push({...})`, but the real `hooks/hooks.json` no longer has a
  `PreToolUse` key, so the expression throws `TypeError` at module load. Plant the drift matcher onto a
  SURVIVING event instead (e.g. `rootHooks.hooks.SubagentStart.push({...})`) — the test's point is that a
  root-only planted matcher is not mirrored into the forge copies, so the family check reports drift for
  every port; the event carrying the plant is immaterial. (Initializing a fresh `PreToolUse` array in the
  fixture only would also work, but planting on a live event is the smaller, clearer change.) Keep the
  planted `id`, matcher, and the "test fixture only" comment intact so the assertion's intent is unchanged.
- `scripts/sync-opencode-edition.js` (~:73-77): remove `'kaola-workflow-pre-commit.sh'` and
  `'kaola-workflow-write-lane.sh'` from the `HOOK_SCRIPTS` array, leaving only
  `'kaola-workflow-subagent-dispatch-log.sh'`. This stops `writeHooks` from `readFileSync`-ing the two
  deleted canonical hook files (ENOENT) when the claude chain's `test-install-adaptive-config.js` shells
  `install-opencode.sh` to regenerate the `.opencode` tree. Do NOT otherwise re-sync opencode, edit
  `opencode.json`, the plugin adapter, or `test-opencode-edition.js` — the full opencode/kimi reconcile is
  deferred to Phase D.
- `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js` (~:736, `test409StableHome
  SurvivesDirDeletion`): change `assert(commandCount >= 4, '#409: expected the four managed hook commands,
  saw ' + commandCount)` to `assert(commandCount >= 2, '#409: expected the two managed hook commands, saw '
  + commandCount)`. After the `PreToolUse` removal the installed hooks.json carries exactly the two managed
  commands. Do NOT touch the canonical `scripts/simulate-workflow-walkthrough.js` — it carries no #409 or
  PreToolUse assertion (the two walkthroughs are not byte-identical here, and validate-script-sync does not
  pair them). Leave the per-command shape asserts (:721/:729) untouched — only the count assertion changes.

Do NOT re-add any `PreToolUse` entry anywhere, and do NOT touch the surviving compact-context /
subagent-dispatch-log hooks or their assertions. non_tdd_reason: five one-line narrowings of already-diagnosed
stale assertions across four edition chains — no new behavior to write a failing unit test for; the failing
oracle is the four edition chains, which must go green over the final tree. Verify with the full four-chain
run (`npm test`, run sequentially — this is a cross-edition diff): all of `test:kaola-workflow:{claude,codex,
gitlab,gitea}` must be green. If any surface you touch reveals a further stale needle NOT in this write set,
surface it as a write-set gap rather than widening scope silently.

### r2-code-certify

The named schema-2 common CODE certifier wall for the epoch-2 repair (`code_certifier`) — post-dominates the
sole code producer `r1-hook-assert-repair` and covers the inherited code frontier. Read the `r1` evidence
file, the epoch-1 `n7-code-certify` evidence (the five findings + their reproductions), and the issue #725
Phase C spec / AC-C before reviewing. Verify by RE-EXECUTION, not prose: run the four edition chains
sequentially (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`) — or at minimum each of the five
diagnosed reproductions plus the previously-green steps the deletion could still perturb — and confirm all
four are green over the final tree. Confirm each of the five fixes is exactly the surviving-two-hook
narrowing and nothing broader: no `PreToolUse` re-added, the surviving hooks and their assertions untouched,
the canonical walkthrough untouched, opencode limited to the `HOOK_SCRIPTS` narrowing (no wider opencode/kimi
edit), and no stray write outside the five declared files. Record a gate verdict, not implementation advice;
zero findings is valid; admit only concrete candidate-caused defects with an exact trigger. A finding reopens
`r1-hook-assert-repair` in place (it is graph-maximal in this epoch). Emit the certifier receipt with
`certifier_kind: code` and the inherited-frontier binding intact.

### r3-security-certify

The named schema-2 common SECURITY certifier wall (`security_certifier`) — discharges the inherited security
class the packet carries. Read the `r1` and `r2` evidence and the epoch-1 `n5-hook-deletion` evidence first.
The candidate introduces no new sensitive-path change, so this wall certifies the ACCUMULATED Phase C
candidate against the inherited security frontier: confirm that deleting the two advisory guard hooks
(pre-commit, write-lane) removes only best-effort advisory guidance and weakens no ENFORCED control — the
fail-closed barriers, gate-role post-dominance, per-mutation plan-integrity check, and consent/live-
coordination fences remain the real security boundary; confirm the epoch-2 repair changes only test
assertions and one generation hook list, touching no auth/secret/credential/trust surface; and confirm no
secret or provenance leak is introduced. Record a gate verdict; zero findings is valid; a finding reopens
`r1-hook-assert-repair` in place. Emit the certifier receipt with `certifier_kind: security` and the
inherited-frontier binding intact.

### r4-finalize

Unique sink, run main-session-direct. This is a PARTIAL close of epic #725 (Phase C of A-E) — leave #725
OPEN and the `workflow:in-progress` label in place (Phases D and E remain; do NOT close #718 or any other
issue). Confirm the named code certifier (`r2-code-certify`) and security certifier (`r3-security-certify`)
are complete and fresh. The candidate touches the edition trees, so four-chain verification is required — run
the Meta `validation_command` (`npm test`, the four chains) over the final tree; the diff-scoped run-chains
self-selects all four chains for this run. Generate the sink chain receipt with
`KAOLA_RUN_CHAINS_CONCURRENCY=serial` (this host SIGKILLs a concurrent run-chains). Sink the accumulated
Phase-C feature commit from `workflow/issue-725`: feature commit -> serial run-chains receipt (--project) ->
cmdFinalize --keep-worktree/--keep-open -> push branch -> sink-merge --sink from the MAIN root. Do NOT put
close/fix/resolve keywords next to `#725` in any commit body or push (a closing keyword auto-closes the epic
on push). Verify #725 stays OPEN after the push. opencode/kimi are NOT re-synced or run in Phase C (deferred
to Phase D). Write no tracked file from this node beyond the sink transaction's own bookkeeping.

## Node Ledger

| id | status |
| --- | --- |
| r1-hook-assert-repair | complete |
| r2-code-certify | complete |
| r3-security-certify | complete |
| r4-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (r1-hook-assert-repair) | subagent-invoked | evidence-binding: r1-hook-assert-repair e1060655efe5 | |
| code-reviewer (r2-code-certify) | subagent-invoked | evidence-binding: r2-code-certify 2bce2139e21f | |
| security-reviewer (r3-security-certify) | subagent-invoked | evidence-binding: r3-security-certify c46c6860bd4c | |
| finalize (r4-finalize) | main-session-direct | evidence-binding: r4-finalize 12dff2f15549 | |
