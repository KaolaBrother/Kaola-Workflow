# Workflow Plan — bundle #712, #716, #717

<!-- plan_hash: bed0dfb8bc2ce871e7901baa9d28f6656229df49c1bb02ec4e3cef98e6678899 -->

## Meta

project: bundle-712-716-717
labels: bug, workflow:in-progress, area:scripts, area:workflow-phases
speculative_open_policy: auto
plan_schema_version: 2
validation_command: npm test && node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js
validation_cwd: .
validation_repetitions: 1
validation_pass_rule: all
validation_timeout_minutes: 120
validation_env_allowlist:
code_certifier: n4-code-review
security_certifier: none
inherited_frontier_digest: none
inherited_frontier_classes: none

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| n1-reviewer-profile-resolution | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js, scripts/simulate-workflow-walkthrough.js | 6 | sequence | — | reasoning | — | — | — | — | — | — |
| n2-preflight-builtin-roles | tdd-guide | — | scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-codex-preflight.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-codex-preflight.js, scripts/test-install-model-rendering.js | 5 | sequence | — | standard | — | — | — | — | — | — |
| n3-documentation | doc-updater | n1-reviewer-profile-resolution, n2-preflight-builtin-roles | CHANGELOG.md, docs/api.md | 2 | sequence | — | standard | — | — | — | — | — | — |
| n4-code-review | code-reviewer | n3-documentation | — | 1 | sequence | — | reasoning | — | — | both fix lanes implement the diagnosed root causes exactly, carry RED-first regression proof in every touched edition copy, and leave every unchanged-runtime behavior (kimi, opencode, claude self-dev, unknown-layout fail-closed, override precedence, delegated-role refusals) intact | complete candidate: the adaptive-node and codex-preflight four-edition families, their claude-chain test surfaces, and the documentation delta | sequence | — |
| n5-falsify-review-gate-fixes | adversarial-verifier | n4-code-review | — | 1 | sequence | — | reasoning | — | — | schema-2 review gates now open on fresh claude installs and versioned codex plugin caches, mixed-role plans pass exact-plan preflight while truly missing delegated roles still refuse, and no previously-passing runtime layout or refusal path regressed | runtime-layout detection and profile-resolution matrix (claude native install, claude legacy probed dir, claude self-dev, codex source-tree, codex versioned cache across all three codex editions, kimi, opencode, unknown) plus the preflight role-classification matrix (delegated, built-in non-delegable, unknown) | sequence | n1-reviewer-profile-resolution, n2-preflight-builtin-roles |
| n6-finalize | finalize | n5-falsify-review-gate-fixes | — | 1 | sequence | — | — | — | — | — | — | — | — |

## Plan Notes

This bundle fixes three same-scope schema-2 review-gate unblock bugs, all living on the
reviewer-profile resolution / runtime-detection / profile-preflight surface. The issues arrive with
root causes diagnosed and live reproductions recorded, so no probe or design node is needed; the
implementation direction is settled here and recorded in the node briefs (compact-plan posture).

`n1-reviewer-profile-resolution` carries #712 and #717 in ONE node: both bugs are inside
`detectReviewRuntime()` / `reviewerProfilePath()` in `scripts/kaola-workflow-adaptive-node.js`, one
function family whose candidate ordering is a single semantic decision (a wrong order silently binds
a wrong-runtime reviewer identity). adaptive-node is a GENERATED_AGGREGATOR, so the canonical root
edit plus its codex twin and both forge ports move atomically in this node — edit
`scripts/kaola-workflow-adaptive-node.js`, then regenerate with `node scripts/edition-sync.js --write`
and prove `node scripts/edition-sync.js --check` green; the canonical spec for every port is the full
accumulated root diff from the run base, mirrored in every hunk modulo forge nouns.

`n2-preflight-builtin-roles` carries #716: `kaola-workflow-codex-preflight.js` is a require-free,
four-tree byte-identical group, so all four copies must end byte-identical (edit the root copy,
replicate the exact bytes to the three plugin copies, prove `node scripts/validate-script-sync.js`
green). Mirror alignment beyond byte identity is machine-enforced by that same check in the claude
and codex chains, so no forge test file needs to move.

The two writers touch disjoint exact paths and neither consumes the other, so they are authored as a
sequence-shaped antichain with no dep edge — the validator derives `parallel_safe`; never hand-author
that annotation. `n3-documentation` precedes the common certifier because `CHANGELOG.md` and
`docs/api.md` are self-host test-consumed freshness surfaces. `n4-code-review` is the named common
code certifier wall post-dominating both code producers; `n5-falsify-review-gate-fixes` is the
standalone adversarial change gate certifying both producers. No `security-reviewer`: the frozen
labels carry no sensitive label and no declared path matches the sensitive patterns. No
`main-session-gate`: acceptance is fully machine-checkable (RED-first regressions, the adversarial
matrix, and the recorded validation command at finalize).

The recorded `validation_command` is `npm test` (the four edition chains, sequential) plus the two
additive-edition suites: the detection change touches code that `test-kimi-edition.js` and
`test-opencode-edition.js` assert on, and those suites are not wired into `npm test`. Nodes run only
focused RED/GREEN checks while producing; Finalization runs the full recorded command once over the
final post-documentation tree. Decision records were checked: no `D-712-*`, `D-716-*`, or `D-717-*`
record or mention exists, and these three diagnosed bug fixes warrant no new ADR, so none is
allocated.

## Node Briefs

### n1-reviewer-profile-resolution

Fix #712 and #717 at the resolver, in the canonical `scripts/kaola-workflow-adaptive-node.js` only,
then regenerate the three edition ports (`node scripts/edition-sync.js --write`; `--check` must be
green). Read both issue bodies first; the repros and root causes there are the specification.

#717 — `detectReviewRuntime()` recognizes Codex only via the source-tree pattern
`/[/\\]plugins[/\\]kaola-workflow(?:-(?:gitlab|gitea))?[/\\]scripts$/`. The installed plugin cache
inserts version and marketplace segments
(`.../plugins/cache/<marketplace>/kaola-workflow[-gitlab|-gitea]/<version>/scripts`), so detection
falls through to `claude` and `reviewerProfilePath()` probes a non-existent `.md`. Extend detection
so installed GitHub/GitLab/Gitea codex cache layouts resolve to runtime `codex`, while source-tree
and self-development layouts keep current behavior. Constraints: the explicit
`KAOLA_WORKFLOW_RUNTIME` override stays authoritative (it is evaluated first today — keep it first);
the kimi branch must still fire before the opencode pattern; an unrecognized layout must keep
falling through and fail closed as `review_profile_unavailable` against a genuinely absent profile —
never bind a wrong-runtime profile by a loose match.

#712 — on a claude install the reviewer profiles land in Claude Code's native agent directory
(`~/.claude/agents/{role}.md`, honoring the claude config-dir env override when set), but the claude
branch of `reviewerProfilePath()` only probes `path.join(__dirname, '..', 'agents', role + '.md')`,
which under an installed `~/.claude/kaola-workflow/scripts/` contains no reviewer profiles. Give the
claude runtime an ordered candidate list in the same shape as the existing opencode/kimi branches:
probe the native installed location, keep the currently-probed location (the documented symlink
workaround and any already-linked install must keep resolving), and keep the self-dev canonical
`agents/{role}.md` next to a source checkout's `scripts/`. Default on a total miss to a candidate
that yields `review_profile_unavailable`, never a silent wrong-runtime binding. Installed claude
profiles carry a valid `resolved_profile_hash` self-hash, so no hash re-stamping or installer change
is in scope — the resolver-side fix is the whole fix (the issue's stated either/or; resolver-side
matches the shipped #708 opencode pattern and closes with the smallest blast radius).

RED first, in `scripts/test-adaptive-node.js` and the reviewer-identity section of
`scripts/simulate-workflow-walkthrough.js`: synthesize the exact versioned cache tuples for all
three codex editions (copy the canonical script into a temp `plugins/cache/<marketplace>/<edition>/<version>/scripts`
layout and require it there), the claude native-install layout, the legacy probed-dir layout, an
unknown layout (must refuse fail-closed), and override precedence (`KAOLA_WORKFLOW_RUNTIME=codex`
wins without any path hints). GREEN must show `resolveReviewerProfileIdentity` returning ok for all
three gate roles through the claude native path and the codex cache paths, and unchanged behavior for
kimi, opencode, and self-dev. Focused checks while producing:
`node scripts/test-adaptive-node.js && node scripts/simulate-workflow-walkthrough.js && node scripts/edition-sync.js --check`.
Also run `node scripts/test-kimi-edition.js && node scripts/test-opencode-edition.js` before closing —
they assert the detection branches you are editing adjacent to, and `npm test` does not run them.

### n2-preflight-builtin-roles

Fix #716 in the four byte-identical copies of `kaola-workflow-codex-preflight.js`: edit
`scripts/kaola-workflow-codex-preflight.js`, replicate the exact resulting bytes to
`plugins/kaola-workflow/scripts/`, `plugins/kaola-workflow-gitlab/scripts/`, and
`plugins/kaola-workflow-gitea/scripts/`, and prove `node scripts/validate-script-sync.js` green. The
script is deliberately require-free (fs + path + inline regex only) — do not add a `require`, an
import, or any edition-specific token, or the byte-identity group and the forge forbidden-token walls
break.

Root cause: `runPreflight` computes `rolesNotInTemplate = planRoles.filter(r => !templateRoles.includes(r))`
and `readPlanRoles` returns every `## Nodes` role, so the built-in, intentionally non-delegable roles
`main-session-gate` and `finalize` refuse a valid frozen plan with `role_not_in_template`. Exclude
exactly those built-in non-delegable roles from the template/profile availability check (a named
constant set at the filter site is enough — keep it adjacent to `readPlanRoles`/`runPreflight` so the
mirrors stay obvious). Preserve `role_not_in_template` fail-closed for any unknown or genuinely
missing DELEGATED role, and keep the required-role union behavior for delegated plan roles.

RED first in `scripts/test-install-model-rendering.js`, beside the existing preflight `--plan`
driving fixtures: (a) a frozen schema-2-shaped plan mixing delegated roles with `main-session-gate`
and `finalize` must pass exact-plan preflight when all delegated profiles are fresh; (b) a plan with
an unknown delegated role must still exit nonzero with `role_not_in_template` naming that role;
(c) a truly missing delegated profile must still refuse. GREEN shows the downstream reproduction
entry (`--project-root ... --no-autofix --json --plan ...`) succeeding with no fake profiles for the
non-delegable roles. Focused check while producing:
`node scripts/test-install-model-rendering.js && node scripts/validate-script-sync.js`.

### n3-documentation

Read both implement-node evidence files first. Add one `[Unreleased]` CHANGELOG entry covering all
three fixes (bundle closes #712, #716, #717 together). Update the `role_not_in_template` /
preflight-vocabulary description in `docs/api.md` so it states that built-in non-delegable roles
(`main-session-gate`, `finalize`) are exempt from template/profile availability while unknown
delegated roles still refuse, and correct any runtime-detection description that the #712/#717
resolver behavior makes stale. Docs only; no decision record is allocated for this bundle.

### n4-code-review

Act as the named schema-2 common code certifier for both producers. Read the three issue bodies, the
n1/n2 RED/GREEN evidence, and the n3 documentation diff. Verify each issue's acceptance criteria
against the actual diff: the claude native-install candidate order and fail-closed default (#712);
the three-edition versioned-cache tuples, override precedence, unchanged kimi/opencode/self-dev
detection, and open-next/open-ready/close-and-open-next identity binding (#717); the built-in-role
exclusion with `role_not_in_template` preserved for unknown delegated roles, and byte-identity of all
four preflight copies plus regeneration correctness of the three adaptive-node ports (#716). Confirm
no edition port was hand-edited (generated headers intact, `edition-sync --check` and
`validate-script-sync.js` green in evidence). Zero findings is a valid verdict; admit only concrete
candidate-caused defects with an exact trigger and proof.

### n5-falsify-review-gate-fixes

Standalone adversarial change gate certifying both producers. Try to refute the headline claim with
the strongest falsification you can construct: build the runtime-layout matrix (claude native
install, claude legacy probed dir, claude self-dev checkout, codex source-tree, codex versioned
cache for github/gitlab/gitea, kimi install, opencode install, and an unknown layout) and show any
cell that mis-detects, binds the wrong profile, or newly refuses; swap or reorder candidates to show
a silent wrong-runtime binding; drop the override and show precedence drift; submit plans that mix
delegated, built-in, and unknown roles and show any mis-classification; mutate one byte of a single
preflight mirror or forge port and show the drift escaping a check. Run the existing reproductions
from the three issue bodies against the candidate. Record a gate verdict, not implementation advice;
pass only if no counterexample survives.

### n6-finalize

Unique sink. Run the Meta `validation_command` once over the final post-documentation tree — all
four edition chains sequentially green via `npm test`, then `node scripts/test-kimi-edition.js` and
`node scripts/test-opencode-edition.js` — record the content-addressed receipt, verify the named
code certifier and the standalone adversarial gate are complete and fresh, then close issues
712,716,717 together under the bundle all-or-nothing closure policy. Write no tracked file from this
node.

## Node Ledger

| id | status |
| --- | --- |
| n1-reviewer-profile-resolution | complete |
| n2-preflight-builtin-roles | complete |
| n3-documentation | complete |
| n4-code-review | complete |
| n5-falsify-review-gate-fixes | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-reviewer-profile-resolution) | subagent-invoked | evidence-binding: n1-reviewer-profile-resolution 0126b9d3ef32; barrier: deferred_to_group | |
| tdd-guide (n2-preflight-builtin-roles) | subagent-invoked | evidence-binding: n2-preflight-builtin-roles faef57844c0a; barrier: group_passed | |
| doc-updater (n3-documentation) | subagent-invoked | evidence-binding: n3-documentation 91d32191ea7f | |
| code-reviewer (n4-code-review) | subagent-invoked | evidence-binding: n4-code-review 483d04c1c98f | |
| adversarial-verifier (n5-falsify-review-gate-fixes) | subagent-invoked | evidence-binding: n5-falsify-review-gate-fixes 64eaea6a2837 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 22e91e8c44b6 | |
