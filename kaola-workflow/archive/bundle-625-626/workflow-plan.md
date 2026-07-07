# Workflow Plan — bundle-625-626

<!-- plan_hash: 49878ba7a60a0dafd5d99398c977cdc036166e08b655e10c1753fc8aaa127882 -->

Same-scope bundle of two `bug(agents)` corrections to the dispatched agent profiles
(`agents/*.md`, their `plugins/*/agents/*.toml` twins, and the `agents/profiles/higher/`
model variants). Both issues edit agent-profile prose/config only — no runtime-script code path
changes. They are bundled because **`agents/tdd-guide.md` (+ its toml twins) is edited by BOTH
issues** (#625 evidence contract + #626 coverage gate), so the same file cannot be split across
concurrent write nodes.

**#625 — four profile defects.** (1, high) The evidence-persistence contract is INVERTED between the
agent profiles and the executor. The canonical role-kind contract lives in
`commands/kaola-workflow-plan-run.md` §"Evidence-persistence contract per role-kind" (lines ~355-363)
AND, byte-identical, in the codex `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`
(lines ~363-368): WRITE-role agents (`implementer`, `tdd-guide`, `synthesizer`) SELF-WRITE their
`.cache` evidence, INCLUDING the seeded `evidence-binding:` header; READ-ONLY gates
(`adversarial-verifier`, `code-reviewer`, `security-reviewer`) CANNOT self-write — they RETURN the
verdict/findings block and the orchestrator persists it via `record-evidence --stdin`. The six
profiles currently say the OPPOSITE (write roles told to RETURN / "Do NOT self-write"; read-only
gates told to "Save to"/"Emit the block at the top of `.cache/<node-id>.md`"). (2, medium)
`security-reviewer` carries `Write, Edit` tool grants while sibling gate `code-reviewer` is read-only
— a self-review integrity hole; drop `Write`/`Edit` to match `code-reviewer` and reframe remediation
prose as route-out (`fix_role=…`). (3, low) `agents/workflow-planner.md` references a retired
"Phase 1 knowledge-lookup trigger" — adaptive has no phases; drop the sentence. (4, low)
`agents/build-error-resolver.md` routes to non-existent agents `refactor-cleaner` / `architect`
— map to installed roles (`code-architect`; refactors route to `implementer`).

**#626 — two vendored profiles assume absent toolchains.** (1, high) `agents/doc-updater.md`
hardcodes a codemap/TypeScript mission (`npx tsx scripts/codemaps/generate.ts`, `madge`, `jsdoc2md`,
a `docs/CODEMAPS/` structure) absent in most repos (this one included) — has already fabricated
sections live. Conditionalize on detection; otherwise reconcile the doc surfaces the repo actually
declares (README, CHANGELOG, `docs/*.md`, `.env.example`) and skip-with-reason. (2, medium)
`agents/tdd-guide.md` mandates a `npm run test:coverage` 80% gate that may not exist; conditionalize
on detection, else verify via the project's recorded `validation_command`.

**Cross-edition (#307).** The diff touches all three `plugins/*/agents/*.toml` edition mirrors
(byte-identical across codex/gitlab/gitea per agent) — a cross-edition change, so all four
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains must be green (run sequentially)
before finalize. `agents/*.md` and `plugins/*/agents/*.toml` are PRODUCTION under the barrier
(#424) — every touched file is declared exactly.

## Meta

labels: bug, area:agents
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
validation_test_consumes: docs/agents-source.md
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-write-evidence | implementer | — | agents/implementer.md, agents/synthesizer.md, agents/tdd-guide.md, plugins/kaola-workflow/agents/implementer.toml, plugins/kaola-workflow/agents/synthesizer.toml, plugins/kaola-workflow/agents/tdd-guide.toml, plugins/kaola-workflow-gitlab/agents/implementer.toml, plugins/kaola-workflow-gitlab/agents/synthesizer.toml, plugins/kaola-workflow-gitlab/agents/tdd-guide.toml, plugins/kaola-workflow-gitea/agents/implementer.toml, plugins/kaola-workflow-gitea/agents/synthesizer.toml, plugins/kaola-workflow-gitea/agents/tdd-guide.toml | 12 | sequence | standard |
| n2-gate-evidence | implementer | — | agents/adversarial-verifier.md, agents/code-reviewer.md, agents/security-reviewer.md, agents/profiles/higher/code-reviewer.md, agents/profiles/higher/security-reviewer.md, plugins/kaola-workflow/agents/adversarial-verifier.toml, plugins/kaola-workflow/agents/code-reviewer.toml, plugins/kaola-workflow/agents/security-reviewer.toml, plugins/kaola-workflow-gitlab/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitlab/agents/code-reviewer.toml, plugins/kaola-workflow-gitlab/agents/security-reviewer.toml, plugins/kaola-workflow-gitea/agents/adversarial-verifier.toml, plugins/kaola-workflow-gitea/agents/code-reviewer.toml, plugins/kaola-workflow-gitea/agents/security-reviewer.toml | 14 | sequence | standard |
| n3-independent | implementer | — | agents/workflow-planner.md, agents/build-error-resolver.md, agents/doc-updater.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow/agents/build-error-resolver.toml, plugins/kaola-workflow/agents/doc-updater.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/build-error-resolver.toml, plugins/kaola-workflow-gitlab/agents/doc-updater.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/build-error-resolver.toml, plugins/kaola-workflow-gitea/agents/doc-updater.toml | 12 | sequence | standard |
| n4-review | code-reviewer | n1-write-evidence, n2-gate-evidence, n3-independent | — | 1 | sequence | reasoning |
| n5-docs | doc-updater | n4-review | docs/agents-source.md | 1 | sequence | standard |
| n6-finalize | finalize | n5-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### DAG shape / scheduling rationale
- **Three write nodes as a disjoint antichain (n1 ∥ n2 ∥ n3), NOT a fan-out.** The work splits into
  three genuinely-independent, exact-file-disjoint lanes, each internally cohesive around ONE
  semantic sub-contract, so one implementer per lane writes it consistently by construction:
  - **n1 = the WRITE-role evidence sub-contract** (implementer/synthesizer/tdd-guide) + the #626
    tdd-guide coverage conditionalization (same tdd-guide files — file-coupling, so it must ride n1).
  - **n2 = the READ-ONLY gate evidence sub-contract** (adversarial-verifier/code-reviewer/
    security-reviewer, incl. both `agents/profiles/higher/` variants) + the #625 security-reviewer
    `Write`/`Edit` drop (same security-reviewer files).
  - **n3 = the three independent single-agent fixes** (workflow-planner Phase-1 ref;
    build-error-resolver dead routes; doc-updater codemap mission) — disjoint agents, no shared
    logic with n1/n2.
  They are separate `sequence` rows with `depends_on: —` (an antichain), NOT `fanout(<group>)`:
  fan-out is N-instances-of-one-role over a partition of ONE work item; these are three distinct
  work items. The sets are pairwise exact-file-disjoint, every entry is an exact path (no
  directory/glob), no set carries a PROTECTED file, and the code-reviewer gate (n4) post-dominates
  all three — so the co-open safety net (NET-1 gate + NET-2 no-protected + exact-path resolvability)
  holds and the scheduler derives `parallel_safe` and co-opens all three by default. Splitting the
  6-agent evidence contract into two cohesive halves (n1/n2) roughly halves the critical path of the
  bulk work while keeping each half converged on its own canonical sub-contract. `parallel_safe` is
  validator-derived — NOT hand-annotated.
- **n4-review (code-reviewer, reasoning) — G1 gate.** Post-dominates every code-producing node
  (n1, n2, n3 write `agents/*.md` + `plugins/*/agents/*.toml`, which are PRODUCTION under #424). The
  evidence-contract INVERSION is subtle — getting the DIRECTION wrong per role-kind, or dropping a
  pinned needle, would reintroduce the exact `evidence_unbound`/`evidence_shape_failed` class the
  issue is fixing — so the gate is `reasoning` over `standard` implementers (strong reviewer, cheap
  implementers). It also owns the #307 four-chain verification.
- **n5-docs (doc-updater, standard) depends ONLY on n4-review → speculative-open eligible.** Its
  sole unsatisfied predecessor is a high-probability-pass review over mechanical prose edits; its
  write set is exactly one non-PROTECTED, exactly-resolvable file (`docs/agents-source.md`); it is
  not the sink. Under `speculative_open_policy: auto` the executor may open it speculatively and
  overlap the review (write speculation is DISCARD-ONLY on a gate fail — bounded, one small doc).
- **n6-finalize (sink).** Docs/state only (`CHANGELOG.md`); the #307 four-chain evidence must be
  recorded before finalize per `validation_command`. CHANGELOG is PROTECTED and kept OFF n5 so n5
  stays speculative-eligible.
- **No security-reviewer gate (no G2).** No node's write set matches a `SENSITIVE_PATTERNS` path
  (auth/secret/token/fs//payment/.env/…): `agents/security-reviewer.*` does NOT match `/security/`,
  and there is no such pattern. Dropping `Write`/`Edit` from the security-reviewer profile is
  security-HARDENING (removes capability), reviewed by n4. No security label.
- **No main-session-gate.** Every acceptance check is delegable: the four chains, the agent-profile
  parity validators, and the forge forbidden-token scans all run under Bash in a subagent.
- **No knowledge-lookup.** The canonical evidence contract is LOCAL and edition-consistent (Claude
  command + codex SKILL carry byte-identical role-kind prose); nothing depends on external
  library/API behavior.

### Canonical specs the implementers align TO (do not re-decide the direction)
- **n1 write-role evidence (implementer/synthesizer/tdd-guide).** For each `.md` and each edition
  `.toml`, align to the WRITE-role half of the role-kind contract: the agent SELF-WRITES its
  `.cache/<node-id>.md` evidence into the executor-seeded file and PRESERVES the seeded
  `evidence-binding:` header verbatim (read it from the seeded file; never add/alter/strip it).
  Remove the current "RETURN … / Do NOT self-write" framing. `evidence-binding` currently appears
  ZERO times in these three write-role bodies — the header-preservation rule must be named. The
  toml twins DO carry the evidence prose (confirmed) and are real edits here.
- **n1 tdd-guide coverage (#626).** Conditionalize the coverage gate: "if the repo exposes a
  coverage command, run it; otherwise verify via the project's recorded `validation_command`;
  coverage targets apply only where the project defines them." Remove the unconditional
  "Required: 80%+" framing. (tdd-guide is VENDORED — see Vendored-divergence note.)
- **n2 gate evidence (adversarial-verifier/code-reviewer/security-reviewer + higher variants).**
  Align to the READ-ONLY half: the gate RETURNS its verdict/findings block for `record-evidence
  --stdin`; it MUST NOT attempt to author/save `.cache` files. Remove "Save to …" / "Emit the block
  at the top of `.cache/<node-id>.md`". **PRESERVE the `finding: id=` machine-readable
  findings-emission needle** — `validate-workflow-contracts.js` (#290/#288) asserts its presence in
  all five reviewer bodies (`agents/code-reviewer.md`, `agents/security-reviewer.md`,
  `agents/adversarial-verifier.md`, and both `agents/profiles/higher/{code-reviewer,security-reviewer}.md`);
  dropping it fails the claude chain. The verdict-block/findings CONTRACT stays; only the
  who-persists-it (self-write → return) flips.
- **n2 security-reviewer tools (#625 defect 2).** Change the `.md` frontmatter tools line in BOTH
  `agents/security-reviewer.md` and `agents/profiles/higher/security-reviewer.md` from
  `["Read","Write","Edit","Bash","Grep","Glob"]` to `["Read","Grep","Glob","Bash"]` (match
  code-reviewer). Reframe any remediation prose as route-out (`fix_role=security`), never
  self-remediation. The codex toml already say "Do not edit files"; align their prose to route-out
  where they imply remediation. The toml carry no `tools:` frontmatter (codex controls tools
  elsewhere) — the toml edit here is prose only.
- **n3 workflow-planner Phase-1 (#625 defect 3).** Drop the "This mirrors the Phase 1
  knowledge-lookup trigger." sentence in `agents/workflow-planner.md`; the preceding sentences
  already state the trigger fully. (`.md`-only — the toml carries no Phase-1 ref.)
- **n3 build-error-resolver routes (#625 defect 4).** Map the dead route names in
  `agents/build-error-resolver.md`: `refactor-cleaner` → `implementer` (refactors route to
  implementer); `architect` → `code-architect`. (`.md`-only.)
- **n3 doc-updater codemap (#626 defect 1).** Gate the codemap/TypeScript mission on detection in
  `agents/doc-updater.md`: "if the repo has `scripts/codemaps/` / `docs/CODEMAPS/`, regenerate them;
  otherwise reconcile the doc surfaces the repo actually declares (README, CHANGELOG, `docs/*.md`,
  `.env.example`) against the diff; never invent sections; skip-with-reason when a surface has no
  real change." (`.md`-only; doc-updater is VENDORED — see Vendored-divergence note.)
- **n3 toml editions are declared defensively.** The three n3 missions are currently `.md`-only
  (the codex/forge toml do not carry the Phase-1 ref, the dead route names, or the codemap mission),
  so the nine n3 toml are declared-but-likely-unwritten (legal; the barrier refuses only out-of-set
  writes). Declared so that a discovered "mirror where applicable" toml edit stays in-set without a
  mid-run `write_set_overflow` stall. Do NOT invent a toml edit to fill them.

### Cross-edition mechanics
- Each affected agent's three edition `.toml` (codex/gitlab/gitea) are byte-identical mirrors of
  each other; apply the SAME edit to all three per agent. There is no `sync:editions` regeneration
  for agent tomls (they are hand-maintained byte-mirrors, not GENERATED_AGGREGATOR forge ports).
- **Forge-neutrality (hard).** All plugin agent/command/skill prose must stay forge-neutral — no
  forge CLI binary names, no forge brand names, no forge-specific request nouns; write "the forge
  CLI" / "the forge". A CLI example copied from an issue is a forbidden token. Verify each changed
  toml immediately with the count-independent scan
  (`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
  --forbidden-only <files>` and the gitea twin) rather than waiting for the full chains.
- No agent is ADDED or REMOVED — the 15-agent count, `config/agents.toml` registration, install/
  uninstall manifests, `resolve-agent-model`, `CANONICAL_ROLES`, and `GATE_ROLES`/
  `GATE_VERDICT_ROLES` sets are all UNCHANGED (this is content-only editing of existing agents).

### Vendored-divergence bookkeeping (n5-docs)
- `agents/tdd-guide.md`, `agents/doc-updater.md`, and `agents/build-error-resolver.md` are VENDORED
  (upstream-provenanced) agents; the others (implementer/synthesizer + the gate trio +
  workflow-planner) are provenance-exempt local agents. Vendored-body divergence is explicitly
  tolerated (`docs/agents-source.md`: the recorded `source-sha256` is an "upstream-identity
  reference, not a byte-equality claim"; `validate-vendored-agents.js` checks provenance FORMAT
  only, not content) — so these body edits pass the parity validator.
- BUT the Refresh Procedure (`docs/agents-source.md` step 7) says "re-apply the Local Overrides
  after any re-vendor." So n5 MUST record the three new body divergences under §"Local Overrides"
  in `docs/agents-source.md` (tdd-guide coverage conditionalization; doc-updater codemap
  conditionalization; build-error-resolver route remap) so a future re-vendor does not silently
  revert them. n5 ADDS to that section — it must PRESERVE the pinned-commit needle and the Vendored
  Files table rows that `validate-vendored-agents.js` asserts. Docs-only, no code.

### Deliberate scope boundaries (do NOT expand)
- **The plan-validator `WRITE_ROLES` set (which lists `security-reviewer`) is intentionally
  LEFT UNCHANGED.** The issue fixes the agent's DISPATCHED tool grant (the profile), not the
  validator's conservative "Write-by-manifest" role modeling; they are independent, and the
  validator being conservative is harmless (no plan gives a read-only gate a write set). Changing
  `WRITE_ROLES` would be a 4-edition GENERATED_AGGREGATOR behavior change with test churn that no
  AC asks for. If a reviewer judges it warranted, it is a follow-up, not this run's scope.
- **No new contract/grep test** is added to pin the evidence-contract direction or the absence of
  codemap/coverage hardcodes. The AC requires the EXISTING parity tests + four chains green, not a
  new brittle prose-grep assertion. This is instruction/config prose alignment
  (`non_tdd_reason`: agent-profile prose corrections, behavior-preserving to the runtime scripts,
  no meaningful failing unit test — verified by the parity validators, forge forbidden-token scans,
  and the four edition chains), hence `implementer`, not `tdd-guide`.
- No decision-record (ADR) is authored — these are straightforward profile bug fixes, not an
  architecture decision; no `D-625/626-NN` id is hardcoded.

## Node Ledger

| id | status |
| --- | --- |
| n1-write-evidence | complete |
| n2-gate-evidence | complete |
| n3-independent | complete |
| n4-review | complete |
| n5-docs | complete |
| n6-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n2-gate-evidence) | subagent-invoked | deferred_to_group | |
| implementer (n3-independent) | subagent-invoked | deferred_to_group | |
| implementer (n1-write-evidence) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | # Review — n4-review (bundle-625-626), G1 gate over n1/n2/n3 | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 64415ffaca45 | |
