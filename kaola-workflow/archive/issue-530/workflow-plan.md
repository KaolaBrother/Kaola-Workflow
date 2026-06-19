# Workflow Plan — issue-530

<!-- plan_hash: 9f24fad8ed19b7e601c076bdfacf7478ba049ad4d2d82b85412f58154f4763ff -->

## Meta
issue: 530
project: issue-530
runtime: claude
workflow_path: adaptive
run_posture: in-place
base: feature/opencode-support
shape: investigation (audit, #486 Case A — shape knowable)
labels: documentation, workflow:in-progress, area:scripts, area:workflow-phases
speculative_open_policy: off

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-parity | code-explorer | — | — | 1 | sequence | sonnet |
| n1-runtime | code-explorer | — | — | 1 | sequence | sonnet |
| n1-schema | knowledge-lookup | — | — | 1 | sequence | sonnet |
| n2-decisions | planner | n1-parity,n1-runtime,n1-schema | — | 1 | sequence | opus |
| n3-critique | adversarial-verifier | n2-decisions | — | 1 | sequence | opus |
| n4-e2e | main-session-gate | n2-decisions | — | 1 | sequence | — |
| n5-report | doc-updater | n3-critique,n4-e2e | docs/audits/opencode-edition-audit.md,docs/decisions/D-530-01.md,docs/decisions/D-530-02.md | 1 | sequence | sonnet |
| n6-finalize | finalize | n5-report | CHANGELOG.md | 1 | sequence | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-parity | complete |
| n1-runtime | complete |
| n1-schema | complete |
| n2-decisions | complete |
| n3-critique | complete |
| n4-e2e | complete |
| n5-report | complete |
| n6-finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n1-parity) | subagent-invoked | evidence-binding: n1-parity 2302e630e5eb | |

| code-explorer (n1-runtime) | subagent-invoked | evidence-binding: n1-runtime c8d8366941c6 | |
| knowledge-lookup (n1-schema) | subagent-invoked | evidence-binding: n1-schema 1486f5405cf6 | |
| planner (n2-decisions) | subagent-invoked | evidence-binding: n2-decisions a63e16a438af | |
| adversarial-verifier (n3-critique) | subagent-invoked | evidence-binding: n3-critique 624b0a210ddf | |
| main-session-gate (n4-e2e) | subagent-invoked | evidence-binding: n4-e2e c0fba6694bbb | |
| doc-updater (n5-report) | subagent-invoked | evidence-binding: n5-report d886f1073b17 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize de2a425e3136 | |
## Plan Notes

### Issue shape — AUDIT (not a build), #486 Case A
Issue #530 audits the **opencode edition** (added additively on `feature/opencode-support`) for solidity, reliability, and full alignment with the claude/codex/gitlab/gitea editions. The deliverable is **EVIDENCE + DECISIONS + follow-up references** (not a large feature build). This is a question/audit-shaped issue: the investigation arc (probe → assume → adversarially critique → converge) is fully knowable up front, so the whole DAG is frozen in one run. No speculative fix nodes — any concrete defect found is documented in the report and split into a follow-up issue (satisfies acceptance criterion 4); the implementation of decisions #5/#6 is itself a follow-up (the acceptance criterion is a *recorded decision*, not an implementation).

### Probe frontier — read-only, concurrent (zero blast radius)
The 10 audit dimensions decompose into 3 genuinely-independent read-only angles, authored as sibling `sequence` nodes (no inter-deps) so the scheduler opens them as one ready batch:

- **n1-parity (code-explorer)** — edition-machinery boundary & generation parity. Dimensions **#1 (generation parity / leaked Claude constructs), #5 (route-reachability T-set surface), #6/#7 (edition-machinery boundary / npm-test wiring), #10 (docs discoverability)**. Read `scripts/sync-opencode-edition.js`, `scripts/test-opencode-edition.js` (note current assertion count — issue body says 145, dispatch says 223; record the REAL number), `scripts/test-route-reachability.js` (T4–T11 T-sets, claude+codex only), `scripts/edition-sync.js`, `package.json` (test chain + scripts), `install-opencode.sh`, `README.md`, `docs/README.md`, `CLAUDE.md`. For #5/#6 gather the FACTS both decisions need: what test-route-reachability asserts, what npm test chains, how edition-sync/install.sh treat forges vs runtime. Output: evidence per dimension + the factual inputs to decisions #5/#6.
- **n1-runtime (code-explorer)** — runtime correctness. Dimensions **#2 (model tiers / two-tier opencode.json / reasoning-set completeness incl. the `agents/profiles/higher/` Opus profile question), #3 (hooks: plugin loads under Bun, `throw`-denials, JSON payload shape `tool_input.command`/`tool_input.file_path`/`agent_type`, uncovered canonical behavior), #4 (script resolution `kaola_script()` self-dev `./scripts/` + consumer `~/.claude/kaola-workflow/scripts/`, edge cases linked worktrees / `git -C`)**. Read `opencode.json`, `.opencode/hooks/*.sh`, `.opencode/plugins/kaola-workflow-hooks.js`, and the `kaola_script()` resolver in the hook/runtime scripts. Trace each dispatch path end-to-end on paper.
- **n1-schema (knowledge-lookup)** — external config-schema validity. Dimension **#9**: fetch the live `https://opencode.ai/config.json` schema and validate the committed `opencode.json` structure against it (opencode hard-fails on invalid config), confirm exact reasoning-role coverage and that the committed canonical form is the **provider-agnostic neutral template** (A7: `read('opencode.json') === renderOpencodeJson()` no-args — the `--adapt` personalization must NOT be committed). Flag any schema drift since the edition was authored.

### Assume — n2-decisions (planner, opus, read-only reasoning)
Synthesize the three probes into: (a) a **defect inventory** (every concrete defect found, each tagged fix-now-vs-follow-up with a one-line rationale), and (b) **2–3 candidate answers for each of the two decisions**, each candidate carrying an explicit **falsification test** ("a probe/repro shows ___ if true, ___ if false"):
- **Decision #5 (route-reachability):** should opencode become a FORMAL surface in `test-route-reachability.js` T4–T11 T-sets (joining claude+codex), or stay checked only in `test-opencode-edition.js` A9?
- **Decision #6 (edition-machinery boundary):** should `test:kaola-workflow:opencode` be wired into `npm test` (CI enforcement alongside the other 4 chains), or stay additive (runtime-not-forge)?
Record the leading candidate + the falsification criteria in `.cache/n2-decisions.md`. No repo writes (planner is not a WRITE_ROLE); the doc-updater transcribes the final decisions.

### Critique + E2E — parallel siblings after n2-decisions (both depend only on n2)
- **n3-critique (adversarial-verifier, opus, read-only+Bash):** tries to REFUTE the leading decisions against the probe evidence and hunts for defects the probes missed (independent re-read of the edition tree). Then **runs the four cross-edition chains to falsify "no regression"** — `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` (must be green; this diff touched the edition trees by adding `kaola-workflow-adaptive-schema.js` to the codex/gitlab/gitea editions — acceptance criterion 5). This verifier is an **investigation skeptic** (post-dominates no code node) → it emits an analytical `verdict` (do the audit's claims hold? are the 4 chains green?) but is exempt from the change-gate verdict block. Record chain output + any refutation in `.cache/n3-critique.md`.
- **n4-e2e (main-session-gate, non-delegable):** acceptance criterion 2 — a real **end-to-end opencode cycle** completes (`/workflow-init` → next → a phase → `/kaola-workflow-finalize`) with workflow state persisted under `kaola-workflow/{project}/`. No subagent can run a cycle in a *different* agent runtime — the opencode runtime is device-in-hand for a claude-spawned subagent, and the main session IS the opencode runtime here. **CRITICAL: use a throwaway test project (e.g. `e2e-smoke`) so this does NOT clobber the live issue-530 run; if claim mutual-exclusion blocks a second project, fall back to a script-level simulation (`node scripts/simulate-workflow-walkthrough.js` + a traced `kaola_script()` resolution) and record which path was taken.** Record `verdict: pass` + `findings_blocking: 0` + the persisted-state evidence in `.cache/n4-e2e.md`.

### Converge — n5-report (doc-updater, sonnet)
Writes three docs (all `.md` under `docs/`, barrier-invisible, NOT code → no G1):
- `docs/audits/opencode-edition-audit.md` — the comprehensive audit report: **one section per checklist row (#1–#10)**, each resolved with EVIDENCE or a conscious accept-with-rationale; a defect table (defect → fix-now/follow-up → referenced follow-up issue title); the E2E-cycle result; the 4-chain regression result. This single document satisfies acceptance criterion 1.
- `docs/decisions/D-530-01.md` — the **recorded decision on #5 (route-reachability)**: opencode joins the formal T-set surface OR stays checked in test-opencode-edition.js A9, with rationale + alternatives considered. (D-530-01 verified free: no existing D-530 records.)
- `docs/decisions/D-530-02.md` — the **recorded decision on #6 (edition-machinery boundary)**: `test:kaola-workflow:opencode` wired into `npm test` OR stays additive, with rationale. Together D-530-01/02 satisfy acceptance criterion 3.

### Sink — n6-finalize
`CHANGELOG.md` entry under [Unreleased] summarizing the opencode-edition audit outcome + the two decisions. Docs/state write only (terminal node discipline).

### Why no speculative fix nodes
Freeze-once (#486): the plan is immutable for the run, and the scope of any code fix depends on what the probes find. Any concrete defect is therefore documented in the report and **split into a follow-up issue referenced there** (acceptance criterion 4's explicit alternative). If a decision resolves to "join the formal machinery", its implementation is a follow-up run authored from these findings — the acceptance criterion is a *recorded decision*, not an in-this-issue implementation.
