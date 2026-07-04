# Adaptive Workflow Plan — issue-614

<!-- plan_hash: 2598ed09cedc6aedcc00cbfa4e52c9ab0bfd1bbce1c45c4fbbab53e952a4de08 -->

Prose-only, docs-shaped fix: make the finalize surfaces' **final-validation** instruction
consumer-aware (dual-mode), matching the already-shipped consumer-gate trade. Today the six
finalize surfaces mandate an unconditional full test suite + coverage >= 80% on ALL repos (Step 1
block / Mechanical Finalization step 1), while the SAME files' consumer-mode Validation Gate
section records the opposite accepted trade (agent owns verification; the gate is
`.cache/final-validation.md` with a column-0 `verdict: pass` produced by running the plan's
`## Meta` `validation_command`; "final-validation may run a focused test set rather than the full
suite — the accepted trade"). The two stories contradict; an obedient agent finalizing on a
consumer monorepo re-runs a possibly hour-long full suite + a coverage run that no machine gate
ever checks. This aligns the PROSE with the shipped gate — **zero script/gate changes**.

## Meta

labels: bug, area:docs
validation_command: npm test
speculative_open_policy: auto

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-prose | implementer | — | commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md | 6 | sequence | standard |
| n2-docs | doc-updater | — | CHANGELOG.md | 1 | sequence | standard |
| n3-review | code-reviewer | n1-prose, n2-docs | — | 1 | sequence | reasoning |
| n4-finalize | finalize | n3-review | — | 1 | sequence | — |

## Plan Notes

**Shape — build, not investigation.** The answer and the shape are both known: the issue enumerates
the exact six surfaces, the exact unconditional lines, and the exact consumer-aware direction. No
probe / knowledge-lookup / adversarial-verifier is warranted (nothing external, nothing to falsify).
This is a Case-A build DAG authored up front.

**AC → node map.**
- Six-surface dual-mode edit (all `[ ]` surface ACs) → **n1-prose**. Make each surface's
  final-validation instruction dual-mode: *self-host* (npm, `test:kaola-workflow:*` present) path
  UNCHANGED — the four-chain receipt stays the gate; *consumer* path — run the plan's `## Meta`
  `validation_command` ONCE against the final candidate state, or cite fresh prior evidence under
  the Validation De-Duplication boundary; drop the unconditional full-suite wording; coverage target
  applies only where the project itself defines one. Safety floor unchanged: exactly one whole-tree
  validation pass before merge stays mandatory (narrows breadth, never presence). Concrete targets:
  - **3 command surfaces** (`commands/kaola-workflow-finalize.md` + the two forge ports): the Step 1
    block ("full test suite + type check + lint + build" / "coverage command when available; target
    >= 80%"), plus the three supporting unconditional lines — Operational Guardrails ("Run or
    delegate fresh full validation before claiming completion"), Validation Delegation Policy ("The
    required full relevant project commands must pass"), and Step 2 acceptance ("tests pass and
    coverage target is met or justified"). Make all four consumer-aware.
  - **3 SKILL surfaces** (the codex github + two forge SKILL packs): the condensed Mechanical
    Finalization step 1 line ("Final validation: run the full relevant project commands once against
    the final candidate state") — make it dual-mode (consumer → `validation_command` or cited fresh
    evidence).
- "No remaining unconditional full-suite / coverage >= 80% mandate reachable on the consumer path;
  the consumer-trade paragraph and Step 1 tell one story" → verified by **n3-review**.
- "Zero script changes: `scripts/` untouched; `--finalize-check`, `run-chains.js`, `sink-merge.js`
  byte-identical" → structurally guaranteed — no `scripts/` path is in ANY node's write set.
- "All four chains green sequentially (#307 — the diff touches the gitlab/gitea edition trees)" and
  "`test-route-reachability.js` + all four `validate-*-contracts.js` stay green" → **n4-finalize**
  final-validation via `npm test` (chains the four with `&&`, run sequentially).
- CHANGELOG entry under [Unreleased] → **n2-docs**.

**Why n1-prose is ONE `implementer` node (no split).** The dual-mode instruction is a SINGLE
semantic change mirrored across six agent-facing surfaces (two variants: full command block ×3,
condensed SKILL line ×3). Per the cross-edition-prose invariant, keep it in ONE node so the six
surfaces cannot diverge into two contradictory stories — the exact defect this issue fixes. There
is no file-count ceiling; splitting a coherent cross-edition set only to lower a count is what the
grammar forbids. `implementer` (agent-facing prose + markup; no behavioral unit under test).
- **non_tdd_reason:** prose-consistency edit across six agent-facing finalize command/skill surfaces
  (instructions/markup, no behavioral logic). No natural failing unit test — the AC explicitly
  declines to add a new contract pin for these phrases ("no contract pins these phrases today — keep
  it that way or update pins in the same diff"; keeping it that way). Verification is the four
  cross-edition chains staying green (`npm test`) + the n3-review semantic one-story review.
- **Forge-neutrality:** the four plugin-tree surfaces (`plugins/kaola-workflow-{gitlab,gitea}/...`
  and the codex github SKILL) must stay forge-neutral — no `gh`/`glab`, no forge brand noun; mirror
  the existing edition-neutral finalize prose. Do NOT disturb the OTHER pinned needles the contract
  validators assert on these files; touch only the final-validation lines above.

**Write-set safety (verified, not assumed).**
- No `scripts/` GENERATED_AGGREGATOR is touched → no `generated_port_split` obligation.
- Contract-validator pins: grepped `full test suite` / `coverage command` / `>= 80` / `coverage
  target` / `full relevant project commands` across `scripts/validate-workflow-contracts.js`,
  `scripts/test-route-reachability.js`, and both forge `validate-*-contracts.js` — ZERO matches
  (confirms the AC's "no contract pins these phrases today", verified 2026-07-04). So no
  contract-validator file belongs in the write set; the four chains only need to STAY green.
- The six finalize surfaces are NOT in an `edition-sync.js` byte-mirror group (grep: no `finalize`
  reference), so there is no byte-identical SYNC-group peer to co-move. The command ports differ by
  forge nouns (DIVERGENT hand-ports) and the SKILL variant differs from the command variant — each
  is edited in place within this one node, none is a byte-mirror of another.
- `.cache` receipts are recorded parent-side under `kaola-workflow/issue-614/.cache/` (workflow
  artifact band; not a declared write-set member).

**DAG shape / scheduling rationale.**
- **Opening 2-wide antichain (n1-prose ∥ n2-docs).** n1 writes `commands/` + `plugins/`; n2 writes
  the repo-root `CHANGELOG.md` — pairwise EXACT-PATH disjoint (disjoint top-level dirs), so I add NO
  dependency edge and let the validator derive `parallel_safe` (never hand-annotated). CHANGELOG.md
  is declared on EXACTLY ONE leg (n2). They co-open in isolated legs by default; a host without leg
  capability serial-degrades (still correct). n1 is the critical path; n2 overlaps it for free. The
  CHANGELOG entry's content is knowable from the issue independent of the exact prose wording, so
  parallel is safe.
- **n3-review (`code-reviewer`, reasoning) is the accuracy gate.** The validator does NOT REQUIRE a
  G1 gate here — every write set is `.md`-only, so `producesCode` is false and G1 is trivially
  satisfied — but the issue's semantic goal (six surfaces tell ONE consistent consumer-aware story;
  no leftover unconditional mandate reachable on the consumer path; forge-neutral) is NOT
  machine-checked by any contract (confirmed above). The four chains verify byte-identity + pinned
  needles, none of which cover these phrases. So the review IS the sole verification of the actual
  issue goal — not over-engineering. `reasoning` tier: catching a surface left with the old mandate,
  a divergent edition story, or a leaked forge token is reasoning-bound. It post-dominates both write
  nodes (depends on n1 + n2).
- **n4-finalize (sink)** depends only on n3-review; write set `—` (merge/close + records
  `.cache/final-validation.md`). Its final-validation is `npm test` run once against the final
  candidate state (self-host repo → the four-chain receipt is the gate; #307 four-chain obligation
  applies because the diff touches the gitlab/gitea edition trees — run the four sequentially).
- **Speculation:** under `speculative_open_policy: auto`, no node is deliberately shaped for
  speculative-open — the sole post-gate node (n4-finalize) is the unique sink and carries the
  protected CHANGELOG lineage, so it is not a speculative candidate. No special shaping applies; the
  key stays `auto` as a harmless default.

## Node Ledger

| id | status |
| --- | --- |
| n1-prose | complete |
| n2-docs | complete |
| n3-review | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (n1-prose) | subagent-invoked | deferred_to_group | |
| doc-updater (n2-docs) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review bf6a9ccd0e5a | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 0efcb3ddca25 | |
