# Phase 3 - Plan: issue-210

## Blueprint

Prose-only behavior change (default-delegate, no startup prompt) + additive
contract tests. No script logic, no version bump. Canonical Delegation Contract
block (below) is byte-identical across all 3 forge `kaola-workflow-next/SKILL.md`
(verified `diff` of L27-55). Anchor every edit on a verbatim `old_string`, never a
post-edit line number (the new block is shorter → content shifts up).

### Files to Create
none.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md | replace Delegation Contract block (L27-55) + resume line-2 (L225) | default-delegate, no prompt |
| plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md | same block (L27-55) + resume line-2 (L237) | parity |
| plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md | same block (L27-55) + resume line-2 (L237) | parity |
| scripts/validate-kaola-workflow-contracts.js | sentinel guards @top (~after L89) + 2 #210 policy tests @bottom (after L221) | contract tests (AC) |
| plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js | sentinel guards (after `gitlabNextSkill` ~L249) + 2 policy tests (after L325) | parity |
| plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | sentinel guards (after `giteaNextSkill` ~L256) + 2 policy tests (after L332) | parity |
| README.md | rewrite ONLY delegation paragraph L373-378; DO NOT touch version rows L403-408 | doc (AC) |
| docs/workflow-state-contract.md | reframe `delegation_policy:` field L39-42; PRESERVE L44-47 + L49-56 verbatim | doc (AC) |
| CHANGELOG.md | add bullet under `## [Unreleased]` (L3); no version heading | changelog |

### CRITICAL ordering constraint (TDZ)
The two #210 `assertPolicyAllowed` tests dereference `const repairState` /
`gitlabRepairState` / `giteaRepairState` declared LATER (github L167, gitlab L271,
gitea L278). They MUST be appended at the BOTTOM (after the existing policy
cluster), never at the top sentinel site — top placement throws
`ReferenceError: Cannot access 'repairState' before initialization`. Sentinel
asserts are safe at top (hoisted helpers + string path only).

### Build Sequence (TDD RED→GREEN, validators-first)
1. **G1** — add sentinel guards to all 3 validators (top region). Run validators → RED (new `assertIncludes` fail; `assertNotIncludes` still pass since old prompt strings present).
2. **G2** — apply canonical block + resume line-2 to all 3 next-SKILLs. Re-run each forge validator immediately → GREEN per forge.
3. **G3** — append the 2 #210 `assertPolicyAllowed` tests to all 3 validators (bottom). PASS on arrival (additive).
4. **G4** — README + docs/workflow-state-contract.md + CHANGELOG.
5. **Final gate** — `npm test` all 4 suites exit 0 + `git status --porcelain` shows only the 9 tracked source files.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| G1 | 3 validator sentinel edits | different files |
| G2 | 3 SKILL.md edits | different files |
| G3 | 3 validator policy-test edits | different files (different region than G1) |
| G4 | README, contract.md, CHANGELOG | unrelated files |

(Execution will be done directly/surgically by the orchestrator for byte-exact
parity, not fanned out — sentinel matching is the only failure mode.)

### External Dependencies
none.

## Canonical Delegation Contract block (replaces L27-55, all 3 forges)

```markdown
## Delegation Contract

Codex subagent delegation is the default. The session delegation policy defaults to `delegate` and is established without prompting the user; the workflow complies with its delegated-role contract automatically rather than asking the user to choose.

**Skip this step if `delegation_policy:` is already set in `workflow-state.md`.**

The default `delegation_policy` is `delegate`: invoke the Codex subagent roles (code-explorer, planner, code-architect, tdd-guide, code-reviewer, security-reviewer, doc-updater) for delegated work and record `subagent-invoked` in each compliance ledger. Do not ask the user to choose a delegation policy.

Tool availability is auto-detected, not a user choice. Before phase work, check whether the Codex role profiles are installed at `.codex/agents/kaola-workflow/`. If that directory has no `*.toml` role profiles the subagent tooling is unavailable: keep `delegation_policy: delegate` and, for each Codex role row, record `local-fallback-tool-unavailable` with a non-empty Evidence value naming the absent path (for example `.codex/agents/kaola-workflow/ absent`). An empty Evidence cell fails the repair-state cross-check, so always write the evidence. Never present tool-unavailability as a question.

Set `delegation_policy: local-authorized` (recording `local-fallback-explicit` in each Codex role row) only when the user explicitly asks to disable delegation or authorizes an inline local fallback. Do not select `local-authorized` on your own initiative.

**Write order** — three steps, in sequence:

1. Set `KAOLA_DELEGATION_POLICY=delegate` without asking; use `local-authorized` only on the user's explicit request to disable delegation.
2. Call the startup script (this creates `workflow-state.md`).
3. After startup succeeds and `workflow-state.md` exists, patch the delegation policy into the file:

```bash
printf '\ndelegation_policy: %s\n' "$KAOLA_DELEGATION_POLICY" >> "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
```

Where `KAOLA_DELEGATION_POLICY` is `delegate` by default and `local-authorized` only on the user's explicit request to disable delegation. `tool-unavailable` remains a valid `delegation_policy:` value for legacy state, but new runs detect tool absence as per-row `local-fallback-tool-unavailable` evidence under `delegate` rather than choosing it at startup.

Do not re-ask during the session. Re-establish the default only if `workflow-state.md` is absent.
```

## Resume-clause edit (each forge)
- PRESERVE line 1 verbatim (validator anchor): `On resume, extract and reassign \`delegation_policy:\` alongside \`phase\` and \`next_skill\`;`
- REPLACE line 2 `if it is absent, return to the Delegation Contract before phase work continues.` WITH `if it is absent, default \`delegation_policy\` to \`delegate\` without prompting and continue.`

## Sentinels (lift byte-exact into each validator; each is on a single prose line)
NOT-includes (RED guards, prompt retired):
- `Ask the user once at startup`
- `How should delegation be handled`

includes (new default contract):
- `Codex subagent delegation is the default.`
- `` The default `delegation_policy` is `delegate` ``
- `KAOLA_DELEGATION_POLICY=delegate`  ← locks deterministic default (AC line 2)
- `.codex/agents/kaola-workflow/`
- `` record `local-fallback-tool-unavailable` with a non-empty Evidence value ``
- `only when the user explicitly`
- `` default `delegation_policy` to `delegate` without prompting ``

#210 policy tests (append at bottom of each validator; row = [role,status,evidence,skipReason]):
- `assertPolicyAllowed('delegate', [['code-explorer','local-fallback-tool-unavailable','.codex/agents/kaola-workflow/ absent','']], 'issue #210 default-delegate auto-detected tool-unavailable (regression lock)')`
- `assertPolicyAllowed('local-authorized', [['code-explorer','local-fallback-explicit','user disabled delegation','']], 'issue #210 explicit local fallback path')`  ← the genuinely new coverage

## Task List

### Task 1: Validator sentinel guards (×3 forges)
- Files: scripts/validate-kaola-workflow-contracts.js; plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js; plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js
- Write Set: those 3 files (top region)
- Action: MODIFY. Add the 2 not-includes + 7 includes sentinel asserts on the next-SKILL, in EACH file's own idiom (github: assertIncludes/assertNotIncludes helpers; gitlab/gitea: confirm helpers exist, else `assert(read(f).includes(s))` / `assert(!read(f).includes(s))`).
- Validate: `node <each validator>` → RED until Task 2.

### Task 2: Canonical prose (×3 forge next-SKILLs)
- Write Set: the 3 next-SKILL.md files
- Action: MODIFY. Replace L27-55 block + resume line-2. Anchor on verbatim old_string.
- Validate: `node <each validator>` → GREEN; `diff` the rewritten L27-55 across the 3 to confirm byte-identity.

### Task 3: #210 policy tests (×3 validators, bottom)
- Write Set: the 3 validator files (bottom region)
- Action: MODIFY. Append the 2 assertPolicyAllowed calls AFTER the existing policy cluster (below the `*RepairState` require). TDZ-safe.
- Validate: `node <each validator>` → GREEN.

### Task 4: Docs + CHANGELOG
- Write Set: README.md (L373-378 only), docs/workflow-state-contract.md (L39-42 only), CHANGELOG.md (Unreleased bullet)
- Action: MODIFY. README/contract reframe to default-delegate; preserve version rows + vocab/enforcement paragraphs.
- Validate: final `npm test`.

## Advisor Notes
Two gaps caught & folded in: (1) TDZ — policy tests at bottom only; (2)
KAOLA_DELEGATION_POLICY was never assigned after removing the ask-step → restore an
explicit `Set KAOLA_DELEGATION_POLICY=delegate` step + lock it with a sentinel.
Per-forge: verify helper existence; run each validator RED→GREEN per forge. Final
gate via `git status --porcelain` (untracked artifacts hide from `git diff --name-only`).
Full notes: `.cache/advisor-plan.md`.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md (primary-source verified; caught TDZ) | |
| advisor plan gate | invoked | .cache/advisor-plan.md (caught KAOLA_DELEGATION_POLICY assignment gap) | |
| architect revisions | N/A | — | advisor gaps were prose/test refinements folded directly; no blueprint re-architecture needed |
