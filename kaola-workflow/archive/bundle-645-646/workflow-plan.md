# Workflow Plan — bundle 645-646

<!-- plan_hash: c69c9315e1e783ca437ab576e2482fd3350fab63274cfdc4df6f6b4e87d273aa -->

## Meta
speculative_open_policy: auto
labels: enhancement, workflow:queued, area:workflow-router
validation_command: npm test

## Plan Notes

**Bundle goal.** Two independent, prose-and-config cross-edition changes shipped in one adaptive run:

- **#645 — first-principles axiom layer for consumer surfaces.** ONE canonical five-axiom prose
  file (`templates/axioms.md`, ≤20 lines, plain language, ZERO provenance markers), byte-identity
  drift guard wired into the CLAUDE-chain walkthrough (thus under `npm test`); a one-line axiom
  reference (axiom pointer + tie-breaker + tighten-only clause) atop the SIX `next` routing surfaces
  machine-enforced by the required-block manifest + route-reachability; the axiom block embedded in
  the SIX `workflow-init` CLAUDE.md-template surfaces so consumer repos carry it from day one; the
  opencode surfaces inherit the prose (regenerated from root `commands/`) and get an additive
  presence assertion in `test-opencode-edition.js`. NO scheduler/validator/gate LOGIC change — prose
  + one drift guard only.
- **#646 — govern the issue-scout model tier.** New `agents/profiles/higher/issue-scout.md`
  (reasoning-class `model: opus`) so `--profile=higher` installs land `issue-scout: opus` in the
  manifest while `--profile=common` keeps sonnet; dispatch-side wiring — `ISSUE_SCOUT_MODEL` added to
  `install.sh`'s `render_command_file` placeholder list + `model_for_placeholder` case list, plus an
  install-rendered `model="{ISSUE_SCOUT_MODEL}"` line in the scout dispatch prose of the `workflow-next`
  COMMAND surfaces. `DEFAULT_AGENT_MODELS['issue-scout']` stays `sonnet`; `REASONING_FLOOR_ROLES`
  UNCHANGED (scout is NOT a floor role — this is a quality raise, not a safety floor). Codex side is
  prose-only (the three `issue-scout.toml` twins carry no model line).

### DAG shape / scheduling rationale

- **Parallel read frontier (n1-architect ∥ n2-explore), zero blast radius.** `n1-architect`
  (reasoning) settles the DESIGN sub-decisions that constrain every writer: the canonical axiom-file
  placement + byte-identity mechanism + the exact walkthrough drift-guard shape, the six-surface
  reference-line insertion strategy in the `next` generation seam, the scout-model-line placement
  (COMMAND-only, install-rendered), and the machine-enforcement design (required-block manifest entry
  + which of the 5 contract validators each pin lands in). `n2-explore` (standard) is the cheap
  fact-sweep: grep `ISSUE_SCOUT_MODEL` + the profile file across ALL FOUR plugin trees, enumerate the
  exact `install.sh` placeholder/case insertion points, capture the existing higher-profile-role pin
  pattern (`validate-workflow-contracts.js:873-874`) and the `model="{..._MODEL}"` dispatch-pin
  pattern to mirror. Both read-only (`—`), no dep edge → co-open at the read cap.
- **The ONE proven-disjoint parallel-write antichain (n3-scout ∥ n4-axiom).** `n3-scout`
  (#646: `agents/profiles/higher/issue-scout.md`, `install.sh`) and `n4-axiom` (#645:
  `templates/axioms.md` + the 6 `workflow-init` surfaces) are PAIRWISE top-level-directory disjoint
  (n3 → {agents, root `install.sh`}; n4 → {templates, commands, plugins}). I add NO dep edge between
  them and let the validator derive `parallel_safe` (never hand-annotated); they co-open in isolated
  legs and merge MECHANICALLY (disjoint → no synthesizer). This is the ONLY genuinely-independent
  new-file/foundation split — exactly the "genuinely-disjoint scaffolding" the brief allows as a
  parallel-leg candidate. A host without leg support serial-degrades (still correct).
- **Everything else SERIALIZES — the shared-surface bottleneck.** #645 and #646 BOTH edit the SAME
  `next` generation seam (`templates/routing/next.skeleton.md` + `slots.js` → regenerate the 6 next
  surfaces) AND the SAME 5 contract validators. Those shared surfaces are NOT co-openable as parallel
  legs (they overlap on `templates/`, `commands/`, `plugins/`, `scripts/`), so the plan is
  deliberately mostly-serial past the antichains: `n5-next-seam` (the shared generation seam,
  carrying BOTH the axiom reference line and the scout model line in one regeneration pass) →
  `n6-enforcement` (all machine-enforcement in one reviewable layer). `n5` depends on n3 (scout
  convention) + n4 (axiom source it references) + n1; `n6` depends on n3 + n4 + n5 (everything it
  pins must exist first — chicken-and-egg: a contract pin/required-block reds if its target content
  is absent, so enforcement post-dominates the content that satisfies it).
- **Why n5 combines both issues' `next`-surface edits into ONE node.** The axiom reference line and
  the scout model line land in the SAME skeleton + `slots.js` and force the SAME regeneration of the
  SAME 6 surfaces. Two separate nodes would double-regenerate the same files (overlapping writers,
  not disjoint) and can only serialize anyway. One atomic regeneration pass keeps the 6 surfaces
  consistent. There is no file-count ceiling forcing a split.
- **Why n6 concentrates ALL machine-enforcement.** The 5 contract validators are shared by BOTH
  issues' pins (axiom-line presence, scout profile-file pin, `ISSUE_SCOUT_MODEL` placeholder pin),
  and the drift guard / route-reachability / model-render test all need every content node landed
  first. Concentrating them in one enforcement node (a) makes the guards reviewable in one place and
  (b) is the only correct ordering (post-dominates all content). `tdd-guide`: the drift guard +
  route-reachability + install-render assertions ARE the failing-test-first oracle for the
  machine-enforcement — RED before the pins/content, GREEN after.
- **Gates: n7-review (code-reviewer, G1) post-dominates every code-producing node** (n3, n4, n5, n6
  all on IMPLEMENT paths; n7 depends on all four → every path to the sink passes through it).
  **n8-adversary (adversarial-verifier)** is the change-gate skeptic over the whole reviewed change —
  it independently confirms the two load-bearing NEGATIVES (#645: no scheduler/validator/gate LOGIC
  change; #646: `DEFAULT_AGENT_MODELS['issue-scout']` still `sonnet` + `REASONING_FLOOR_ROLES`
  untouched) and audits the tie-breaker-derivation contract stays OPTIONAL (no close-gate change).
  Both gates run on the reasoning tier.
- **No security-reviewer (G2), no main-session-gate (G3), no knowledge-lookup.** Labels
  (enhancement, workflow:queued, area:workflow-router) carry NO sensitivity → no G2. Every acceptance
  check is delegable + machine-checkable (the four chains, the walkthrough drift guard, the install
  test, the opencode suite) → no non-delegable gate. Every fact (the six-surface set, the byte-identity
  pattern, the install-render wiring, the five axioms) is confirmable locally / already stated in the
  issue design records → no knowledge-lookup.
- **CHANGELOG in a pre-finalize docs node (n9), NOT the sink.** Writing CHANGELOG / chain-asserted
  docs after the finalize chain receipt makes it stale; n9-docs writes CHANGELOG + the decision
  records + the conventions note BEFORE n10-finalize. The finalize sink declares `—` (its closure
  bookkeeping — state/ledger + `.cache/final-validation.md` — is barrier-invisible / barrier-exempt).

### Write-set completeness (recurring-overflow checklist, walked)

- **`next` generation seam (n5).** The 6 next surfaces are GENERATED from
  `templates/routing/next.skeleton.md` + `slots.js`; editing the committed surfaces directly reds
  `generate-routing-surfaces.js --check`. n5 edits the skeleton + slots, adds the `required-blocks.js`
  manifest entries (axiom-line block: topic `next`, both/both; scout-model-line block: topic `next`,
  claude-live/command), and REGENERATES all 6 surfaces (`--write`) — all in n5's write set. No new
  forge-noun rename (both lines are forge-neutral), so `rename-table.js` is untouched.
- **Contract-validator byte-pair + forge ports (n6).** `scripts/validate-workflow-contracts.js` and
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are a byte-identical pair (enforced
  by `validate-script-sync.js`) — BOTH declared. Plus the github-codex root
  `scripts/validate-kaola-workflow-contracts.js` and the two forge ports
  `validate-kaola-workflow-{gitlab,gitea}-contracts.js`. All 5 declared; the implementer edits the
  ones each pin genuinely needs (the scout profile-file + placeholder pins are CLAUDE-side; the
  axiom-line presence is covered cross-edition by the manifest-driven route-reachability which reads
  ALL trees) and leaves the rest byte-unchanged (over-declaration of an existing file is allowed).
  None of these are GENERATED_AGGREGATORS → no `generated_port_split` obligation.
- **Cross-edition symbol grep (done at plan time).** `ISSUE_SCOUT_MODEL` is NET-NEW (absent
  everywhere today — confirmed against `install.sh` and the validators); `agents/profiles/higher/`
  currently holds only code-architect / code-reviewer / security-reviewer. The higher-profile file is
  a MODEL-TIER variant of an ALREADY-registered agent (issue-scout has its root `.md`, its 3 `.toml`
  twins, and its `config/agents.toml` registration) — NOT a new agent — so the 22-path
  agent-registration surface does NOT apply. `test-agent-profile-parity.js` is base-agent-driven
  (reads `agents/` + the `.toml` triple, never `profiles/higher/`) → auto-covers, no edit.
- **opencode is additive — D-530-02 (existing) — inherited not authored.** `.opencode/` is gitignored and
  regenerated by `sync-opencode-edition.js` from the root `commands/` (next + init) — so the axiom
  reference/block flow to opencode for free once n5/n4 land. The ONLY opencode write is the additive
  presence assertion in `scripts/test-opencode-edition.js` (n6). NO #307 four-chain coupling for the
  opencode surface; its own suite `node scripts/test-opencode-edition.js` validates it.
- **`.cache` receipts** are recorded parent-side and barrier-exempt; none declared.

### Placement / forge-neutrality / provenance discipline (writers must obey)

- **PROVENANCE-FREE shipped prose.** The axiom file, the reference line, the workflow-init block, and
  the scout dispatch prose carry NO issue refs (`#645`/`#646`), decision IDs (`D-645-01`), or
  invariant tags. State the rule, not its origin. Provenance lives ONLY in CHANGELOG / the decision
  records / commit messages.
- **Forge-neutral plugin surfaces.** In the `plugins/kaola-workflow*` trees, name no forge CLI
  (`gh`/`glab`), no forge brand, no forge-specific request noun — write "the forge CLI" / "the forge".
  `ISSUE_SCOUT_MODEL` is an install placeholder, NOT a forge token. Verify touched plugin files with
  the standalone `--forbidden-only` contract check before waiting on the full chains.
- **Tighten-only hard boundary.** The reference line + the workflow-init block MUST state: an axiom
  may make an agent STRICTER, never looser; no axiom may be cited to skip a typed gate, refusal, or
  barrier. State it everywhere the tie-breaker appears.
- **Tie-breaker derivation stays OPTIONAL.** The one-line `.cache` derivation is a dispatch
  INSTRUCTION only; the evidence contract tolerates its presence but NEVER requires it — no
  close-gate behavior change (AC4). Do NOT touch the evidence-contract close logic.

### Canonical axiom block (n4 authors `templates/axioms.md`; the drift guard pins byte-identity)

Five axioms, plain language, ≤20 lines, zero provenance: (1) Correct first — never trade correctness
for speed/cost; rework is the most expensive outcome. (2) Then save human time. (3) Then spend as
little as possible — cheapest sufficient mechanism; parallelism/extra agents/higher tiers are means,
not goals. (4) Machines decide facts; humans decide values — irreversible/value-laden calls go to the
consent valve. (5) Own your own verdicts — never let a system the workflow does not own (CI, external
service) be the judge of done. The workflow-init block embeds this verbatim; the six next-surface
reference lines POINT to it (pointer + tie-breaker + tighten-only), they do not re-embed the full text.

### Decision records

`docs/decisions/D-645-01.md` (axiom layer: the three-layer model, the tie-breaker protocol, the
tighten-only boundary, why it is prose + one drift guard with zero logic change) and
`docs/decisions/D-646-01.md` (scout tier governance: profile variant + dispatch-side wiring, why NOT a
`REASONING_FLOOR_ROLES` entry, DEFAULT stays sonnet) are the next free numbers (records exist only
through the 644 series). n9-docs also updates `docs/conventions.md` where the axiom/tie-breaker + six-surface
propagation conventions belong.

### Acceptance mapping

- #645 AC1 (canonical axiom file byte-identical across editions + walkthrough drift guard) → n4
  (`templates/axioms.md`) + n6 (`simulate-workflow-walkthrough.js` guard).
- #645 AC2 (all SIX next surfaces carry the reference line; 4-of-6 gap is a machine RED) → n5
  (surfaces + `required-blocks.js` manifest entry) + n6 (`test-route-reachability.js`).
- #645 AC3 (workflow-init produces a CLAUDE.md carrying the block) → n4 (6 init surfaces).
- #645 AC4 (derivation token OPTIONAL, no close-gate change) → dispatch prose only; n8 confirms the
  evidence-contract close logic is untouched.
- #645 AC5 (tighten-only stated everywhere the tie-breaker appears) → n4 + n5, verified by n7.
- #645 AC6 / #646 cross-edition (#307 four chains green) → n10 finalize runs `validation_command`.
- #646 (higher profile lands opus; common keeps sonnet; six-surface install-rendered scout model;
  DEFAULT sonnet + FLOOR unchanged; validators pin the placeholder + profile file) → n3 (profile +
  install wiring) + n5 (scout model line on the 3 next COMMAND surfaces) + n6 (validator pins +
  `test-install-model-rendering.js`).
- opencode additive presence — D-530-02 (existing) — n6 (`test-opencode-edition.js`), validated by its own suite.

Note: on this box `test-adaptive-node.js` (claude chain) can SIGKILL the octopus merge under default
run-chains concurrency — run the chains with `KAOLA_RUN_CHAINS_CONCURRENCY=serial` at finalize.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-architect | code-architect | — | — | 1 | sequence | reasoning | — |
| n2-explore | code-explorer | — | — | 1 | sequence | standard | — |
| n3-scout | implementer | n2-explore | agents/profiles/higher/issue-scout.md, install.sh | 2 | sequence | standard | higher-profile frontmatter variant of an already-registered agent + bash install placeholder/case wiring; no isolated failing unit — the install-render behavior is the RED/GREEN oracle asserted downstream in n6 via test-install-model-rendering.js |
| n4-axiom | implementer | n1-architect | templates/axioms.md, commands/workflow-init.md, plugins/kaola-workflow-gitlab/commands/workflow-init.md, plugins/kaola-workflow-gitea/commands/workflow-init.md, plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md | 7 | sequence | standard | authors the canonical axiom prose file + embeds the byte-identical block into the 6 hand-maintained workflow-init CLAUDE.md-template surfaces; no failing unit — content is the spec, byte-identity is guarded by the walkthrough drift guard authored in n6 |
| n5-next-seam | implementer | n1-architect, n3-scout, n4-axiom | templates/routing/next.skeleton.md, templates/routing/slots.js, templates/routing/required-blocks.js, commands/workflow-next.md, plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md | 9 | sequence | reasoning | regenerates the 6 generated `next` routing surfaces from the skeleton/slots — the axiom reference line (#645, both/both) plus the install-rendered scout model line (#646, command-only) — and adds the required-blocks.js manifest entries; agent-facing prose + generation-seam edit, no behavioral unit under test (machine-enforcement lands in n6) |
| n6-enforcement | tdd-guide | n3-scout, n4-axiom, n5-next-seam | scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-route-reachability.js, scripts/test-install-model-rendering.js, scripts/simulate-workflow-walkthrough.js, scripts/test-opencode-edition.js, scripts/sync-opencode-edition.js | 10 | sequence | reasoning | — |
| n7-review | code-reviewer | n3-scout, n4-axiom, n5-next-seam, n6-enforcement | — | 1 | sequence | reasoning | — |
| n8-adversary | adversarial-verifier | n7-review | — | 1 | sequence | reasoning | — |
| n9-docs | doc-updater | n8-adversary | CHANGELOG.md, docs/decisions/D-645-01.md, docs/decisions/D-646-01.md, docs/conventions.md | 4 | sequence | standard | — |
| n10-finalize | finalize | n9-docs | — | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-architect | complete |
| n2-explore | complete |
| n3-scout | complete |
| n4-axiom | complete |
| n5-next-seam | complete |
| n6-enforcement | complete |
| n7-review | complete |
| n8-adversary | complete |
| n9-docs | complete |
| n10-finalize | in_progress |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer (n2-explore) | subagent-invoked | evidence-binding: n2-explore 84091db98e34 | |
| code-architect (n1-architect) | subagent-invoked | evidence-binding: n1-architect 10e1be01f296 | |
| implementer (n3-scout) | subagent-invoked | deferred_to_group | |
| implementer (n4-axiom) | subagent-invoked | group_passed | |
| implementer (n5-next-seam) | subagent-invoked | evidence-binding: n5-next-seam f41520813c2e | |
| tdd-guide (n6-enforcement) | subagent-invoked | evidence-binding: n6-enforcement 15a8889ca528 | |
| code-reviewer | subagent-invoked | evidence-binding: n7-review c62bf1d57d38 | |
| adversarial-verifier (n8-adversary) | subagent-invoked | evidence-binding: n8-adversary 07997ebe56a7 | |
| doc-updater (n9-docs) | subagent-invoked | evidence-binding: n9-docs c5862c20d49f | |
