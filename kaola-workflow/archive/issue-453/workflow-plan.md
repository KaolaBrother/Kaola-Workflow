# Workflow Plan — issue-453

<!-- plan_hash: 8fc6b3e62b6b72e86f751d7e90e571a91c7022bb686357eda7435a7f1e6f11bf -->

Retire the adaptive per-node `FILE_CEILING` hard validator refusal while preserving every other
write-safety wall (exact-path parsing, fail-closed shape refusals, disjointness,
`generated_port_split`, barrier overflow). Maximally cross-edition (#307 four-chain gate mandatory).

## Meta

labels: area:scripts, area:workflow-phases, enhancement

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| schema | implementer | — | scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js, plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js | 1 | sequence | sonnet |
| validator | tdd-guide | schema | scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js, scripts/simulate-workflow-walkthrough.js | 1 | sequence | sonnet |
| planner-profile | doc-updater | — | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence | sonnet |
| adapt-skills | doc-updater | — | plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md | 1 | sequence | sonnet |
| docs | doc-updater | — | docs/api.md, docs/architecture.md, README.md, CHANGELOG.md | 1 | sequence | sonnet |
| review | code-reviewer | schema, validator, planner-profile, adapt-skills, docs | — | 1 | sequence | opus |
| adversarial | adversarial-verifier | review | — | 1 | sequence | opus |
| done | finalize | adversarial | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Why this shape

- **`schema` (implementer, sonnet) — 4-file byte-identical sync group.** Removes the `FILE_CEILING`
  constant + its module export from the adaptive schema. The four copies
  (`scripts/` + the three `plugins/*/scripts/kaola-workflow-adaptive-schema.js`) are a
  `BYTE_IDENTICAL_GROUPS` member (`validate-script-sync.js` label "adaptive-schema constant copies"),
  so the validator's **sync-group gap** wall forces all four into the write-set union (here all four
  are co-declared in one node, satisfying it trivially). Mechanical constant deletion across a
  byte-locked group has no isolated failing unit test — `non_tdd_reason`: byte-identical constant
  removal across the 4-tree sync group; the behavioral assertion lives in the `validator` node's
  walkthrough fixture (a 12-file node freezing in-grammar). Keep the fast-path "absolute backstop of
  6" prose in `fast.md`/fast-`SKILL.md`/README untouched — it is prose-only (no script reads
  `schema.FILE_CEILING`), so it is unaffected by this schema removal.

- **`validator` (tdd-guide, sonnet) — 4 generated-aggregator files + the claude-chain walkthrough.**
  `kaola-workflow-plan-validator.js` is BOTH a `GENERATED_AGGREGATORS` member (#401 Part 2) AND a
  `COMMON_SCRIPTS` byte-pair (root ↔ codex `plugins/kaola-workflow/scripts/`), with two forge-named
  ports (`kaola-{gitlab,gitea}-workflow-plan-validator.js`). The `generated_port_split` wall (which
  this issue must PRESERVE) forces the canonical + codex twin + both forge ports into the **SAME
  node** — done here. The change: delete `if (n.writeSet.size > schema.FILE_CEILING) { … }` (the only
  adaptive consumer of the constant) plus the two stale comments (header "caps: … FILE_CEILING per
  node …" and the line ~991 "Placed BEFORE the FILE_CEILING check …" placement note, rewording the
  latter to reference the shape checks it actually orders against). The `tdd-guide` failing test goes
  in `scripts/simulate-workflow-walkthrough.js` (the claude chain): convert the existing A2
  `FILE_CEILING` **refusal** fixture (7 root files expecting `/FILE_CEILING/`) into a **positive**
  exact-file fixture (≥ 12 exact repo-relative files in one write-role node ⇒ `result: in-grammar`
  when gates/deps/disjointness are otherwise valid — the issue's headline AC). Also retune the A3
  agent-registration "22 paths / FILE_CEILING=6 → 5 impl nodes" fixture and its comment so the
  surface no longer needs five nodes purely for the file-count reason (the agent-registration-gap
  union check is count-independent and must stay green). Depends_on `schema` so the constant is gone
  before the validator stops referencing it. **Disjoint from `schema`** (different files) and
  sequenced (so the two safely touch related logic without an antichain collision). 5 files ≤ current
  freeze ceiling. Negative fixtures that MUST still refuse (per AC) — directory-shaped, bare existing
  directory, absolute, backslash, `..`, empty-normalized, case-collision, `generated_port_split`,
  concurrent-sibling overlap (incl. with a large write set) — stay asserting refusal.

- **`planner-profile` (doc-updater, sonnet) — `.md` + 3 `.toml` semantic mirror group.** Replaces the
  "SPLIT into sequenced same-role nodes / do not raise the ceiling" guidance in
  `agents/workflow-planner.md` and the three `plugins/*/agents/workflow-planner.toml` mirrors with the
  issue's **semantic-grouping rubric** (declare exact paths only; keep semantically-coupled
  cross-edition / generated files in ONE node even at high count; fan out only genuinely-independent
  disjoint work; split only when the decomposition is semantically clean and does not create
  edition/prose divergence; prefer planner-selected role/model effort over multiplying implementers to
  fit a count). Remove the `FILE_CEILING=6` cap statement and the `#309`/`#447` clauses' "fits under
  `FILE_CEILING` / exceed the six-file ceiling so split" phrasing, keeping their cross-edition-cohesion
  intent. The `.md` → 3-`.toml` set is a semantic mirror (#309/#341): edited together against ONE
  canonical spec so the four profiles converge by construction; `test-agent-profile-parity.js`
  `FEATURE_TOKENS` does NOT pin `FILE_CEILING`, so removal does not break parity. **G1 fires on this
  node** because `.toml` is non-docs (`isDocsPath` keys on `.md`/`docs/` only) — covered by `review`.

- **`adapt-skills` (doc-updater, sonnet) — 3 `kaola-workflow-adapt` SKILL packs.** Re-scopes the
  `FILE_CEILING (6 …) / splits into sequenced same-role nodes` lines in the codex-github + gitlab +
  gitea adapt SKILL packs to the semantic-grouping rubric. All-`.md` → docs → no G1 required, but
  routed through `review` for uniform coverage.

- **`docs` (doc-updater, sonnet) — api.md, architecture.md, README, CHANGELOG.** `docs/api.md`: the
  grammar line ~690 "`≤ FILE_CEILING (6) files per node`" clause and the `generated_port_split`
  fix-prose "without violating `FILE_CEILING`" / agent-registration "the 22-path surface cannot fit
  `FILE_CEILING`=6" cross-references all go stale and must be rescoped/removed; the #381 shape-refusal
  prose "checked **before** the `FILE_CEILING` count" must be reworded (the count is gone). Confirm
  `docs/architecture.md` mentions and scope/remove. `README.md`: ensure the only six-file statement is
  the **fast-path** backstop (already worded "fast path … absolute backstop of 6"), explicitly
  fast-only — no adaptive six-file inference. `CHANGELOG.md`: add the `[Unreleased]` entry. All four
  are `.md`/`docs/` → docs → no G1 required; routed through `review`. CHANGELOG.md is re-declared by
  the `finalize` sink, but `done` transitively depends on `docs` (via the gates), so the two are
  sequenced — never an antichain — and the disjointness wall does not fire.

### Gates

- **G1 (code-reviewer post-dominance):** `review` depends on ALL five work nodes and is the sole
  predecessor chain to the sink, so it post-dominates every code-producing node — `schema`,
  `validator` (implement roles), and `planner-profile` (doc-updater touching non-docs `.toml`). opus,
  because the value is bounded by reasoning depth: confirming a safety-wall **removal** is surgical and
  that exact-path parsing / shape refusals / disjointness / `generated_port_split` / barrier overflow
  are untouched.
- **`adversarial` (adversarial-verifier, opus):** adversarially confirms the issue's core safety
  invariant — that NO write-safety wall weakened. Reasons specifically about: can a directory / glob /
  absolute / backslash / `..` / case-collision / bare-existing-dir token now slip through? Does
  `generated_port_split` still refuse a split canonical aggregator? Do concurrent-sibling and select
  overlap checks still fire (including when a node has a large write set)? Does the per-node barrier
  still refuse out-of-declared actual writes? Post-dominated by nothing but the sink.
- **No G2 (security-reviewer):** labels carry no `security` and the change touches no sensitivity
  category (auth/payments/user-data/secrets/crypto). The safety-relevant nature is covered by the
  adversarial gate, not G2.
- **No design/architect node:** the issue fully specifies the change (exact lines/constants to remove);
  this is a rule **removal**, not a novel design.

### Cross-edition / four-chain (#307)

This diff touches all four edition trees (schema ×4, plan-validator ×4, planner.toml ×3, adapt
SKILL ×3) plus root docs, so it is a maximally cross-edition change: Finalization requires all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run sequentially (a green
claude chain alone is insufficient — `npm test` short-circuits on the first `&&` failure). The
`validator` and `adapt-skills` nodes touch the `plugins/*` trees, so each should run the standalone
`--forbidden-only` forge contract check on its changed files immediately rather than waiting for the
full chains. The existing contract-validator pins on the fast-path "absolute backstop of 6" remain
unchanged and are now explicitly fast-path-only.

## Node Ledger

| id | status |
| --- | --- |
| schema | complete |
| validator | complete |
| planner-profile | complete |
| adapt-skills | complete |
| docs | complete |
| review | complete |
| adversarial | complete |
| done | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (schema) | subagent-invoked | evidence-binding: schema 204a592e149b | |
| tdd-guide (validator) | subagent-invoked | evidence-binding: validator 37f3c2ccb44e | |
| doc-updater (planner-profile) | subagent-invoked | evidence-binding: planner-profile 64367cf3ceb8 | |
| doc-updater (adapt-skills) | subagent-invoked | evidence-binding: adapt-skills c90740bee444 | |
| doc-updater (docs) | subagent-invoked | evidence-binding: docs c128249680e5 | |
| code-reviewer | subagent-invoked | evidence-binding: review 295e0ab8de88 | |
| adversarial-verifier (adversarial) | subagent-invoked | evidence-binding: adversarial 621619a634e4 | |
| finalize (done) | main-session-direct | evidence-binding: done 796d31e6c071 | |
