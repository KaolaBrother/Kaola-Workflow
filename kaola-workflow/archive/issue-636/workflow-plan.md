# Workflow Plan — issue 636

<!-- plan_hash: 65055a6d9974fa4cf7ba79dc8653677e0d0d64087c3c18554d05cb9acba32e22 -->

## Meta
speculative_open_policy: auto
goal: use kaola-workflow skills to finish all issues; delegate subagents as the workflow demands; all reviewer subagents use fable
labels: refactor, area:scripts, area:routing
validation_command: npm test

## Plan Notes

**Goal (636).** Single-source the cross-runtime dispatch pins so #627's deferred fix#2
(runtime-dead-prose fencing) becomes possible. Two prose blocks are resident on all six #400
plan-run routing surfaces (3 Claude commands + 3 Codex SKILLs) even though each is DEAD on the
other runtime; their exact tokens are machine-pinned on ALL six surfaces, so fencing either block
out of its non-native runtime currently reds the contract chains. This run RELOCATES each pin to
its native runtime, THEN fences the dead block out of its non-native surfaces. Authored from the
settled, adversarially-validated shaping run
(`docs/investigations/2026-07-08-630-636-routing-generation-seam.md`, §"Build Run 1 — #636
(corrected write-set)"). #636 ships FIRST, standalone; #630 (the generation seam) is a fresh
re-plan on this fenced base — NOT in scope here.

### DAG shape / scheduling rationale

- **Single serial spine with one overlap.** The change is inherently serial:
  `n1-plan → n2-fence → n3-review → {n4-adversary ∥ n5-docs} → n6-finalize`. The only parallelism
  is the post-review antichain (n4-adversary read-only ∥ n5-docs writing a disjoint decision
  record) — both depend on n3-review, are pairwise EXACT-PATH disjoint, so I add NO edge between
  them and let the validator derive `parallel_safe` (never hand-annotated). n5-docs overlaps the
  adversarial gate for free.
- **Why ONE builder node, never parallel legs (the load-bearing shape decision).** The prose
  fences and their validator/test edits are TIGHTLY COUPLED: a fence without its matching validator
  edit reds the contract chains, and a validator edit without its fence reds too. They MUST move
  atomically. Additionally, the four contract validators + the byte mirror are a "hidden shared
  surface" (`docs/conventions.md:263` — the false-disjoint trap): several of them pin BOTH the
  command AND the SKILL surface of the same topic, so splitting the fences into per-surface legs
  would force the shared validator files to overlap concurrent writers (not disjoint). Therefore
  ALL 12 files (6 prose surfaces + 6 validator/test files) live in ONE node, ONE serialized write
  frontier. There is no file-count ceiling; splitting a coherent cross-edition set only to lower a
  count is exactly what the grammar forbids.
- **Why a `planner` node above the builder.** The load-bearing part of this task is the CORRECTED
  validator relocation map — the shaping run's adversary proved the first-draft map MISSED the
  #611-fork SKILL-only split and that omission REDS ALL FOUR CHAINS. n1-plan (read-only, reasoning)
  re-verifies the CURRENT line numbers against the six validators (the doc's line numbers have
  drifted) and emits the precise per-file, assertion-level edit map + the fence boundaries, so the
  Sonnet builder EXECUTES a verified map rather than re-deriving a subtle one. Accuracy-first
  (precedence #1): a mis-applied split is four-chain-red rework, the most expensive outcome.
- **`implementer`, not `tdd-guide`, for the build.** This is a behavior-preserving relocation of
  contract assertions + a prose fence; the contract validators being EDITED are themselves the
  acceptance oracle, so there is no separable failing-unit-test that precedes the change (editing
  the assertion and the prose is one atomic contract move). `non_tdd_reason` recorded on n2.
- **Gates.** `code-reviewer` (n3) post-dominates the sole code node n2 on every path to the sink
  (G1 satisfied: n2 → n3 → {n4|n5} → n6, both paths through n3). `adversarial-verifier` (n4) is the
  design-mandated change-gate on this subtle four-chain-red-risk diff. Both reviewer subagents are
  dispatched at model=fable by the executor per the standing directive; authored here at `reasoning`
  (their accuracy-critical INTENT) — the executor applies the fable override on dispatch.
- **No `security-reviewer` (no G2), no `main-session-gate`.** No write-set file matches a sensitive
  pattern (no auth/token/secret/session/`fs/`/`.env`/CI paths) and labels are non-sensitive → no G2.
  Acceptance is fully MACHINE-CHECKABLE (all four chains green sequentially + fenced-block-absent
  proof), so no non-delegable gate is warranted. No `knowledge-lookup` — every fact is confirmable
  locally and already settled in the shaping doc.

### The corrected fence + relocation map (builder MUST re-verify all line numbers before editing)

**Prose fences (6 surfaces).**
- 3 plan-run COMMANDS (`commands/kaola-workflow-plan-run.md` + gitlab/gitea twins): remove the
  Codex v1/v2 dispatch + `turn_context.effort` proof paragraph (github twin ≈ :221–239) but
  PRESERVE the always-live role-instruction tail beginning `Instruct the role to:` (≈ :241) — the
  fence boundary is a SUB-SENTENCE splice at ≈ :239/:240 (the dead clause shares its final sentence
  with the live `Pass dispatch.nonce … Instruct the role to:` tail); splice cleanly, keep the tail.
- 3 plan-run SKILLs (`plugins/{kaola-workflow,kaola-workflow-gitlab,kaola-workflow-gitea}/skills/
  kaola-workflow-plan-run/SKILL.md`): remove the `#### Teammate-Mode Dispatch` block (github ≈ :241),
  preserving surrounding live prose.
- **Semantic markers (in-scope; the PIN convention already exists in these files).** Delimit exactly
  what is fenced with `<!-- PIN: codex-dispatch -->` (SKILLs, around the retained Codex block) and
  `<!-- PIN: teammate-mode -->` (commands, around the retained teammate block) for orphan-sentinel
  completeness and to set up #630's clean slot boundaries. PROVENANCE_BAN-safe (no issue refs).

**Validator/test relocation (the corrected map — includes the #611-fork SKILL-only split the
adversary proved MISSING; omitting it REDS ALL FOUR CHAINS).**
- `scripts/test-route-reachability.js` — **T5b** array (Codex effort tokens: `fork_turns:"none"`,
  descriptor-effort, fresh child-session proof, `codex_effort_override_unavailable`) → **SKILL-only**;
  **T14** array (NAMED-teammate sentinel + one-nudge idle-race) → **command-only**.
- `scripts/validate-workflow-contracts.js` **AND its byte-identical mirror**
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (edit BOTH identically): delete the
  command-side T5b assertion; shrink the #606 teammate assertion to **command-only**; **shrink the
  #611-fork loop to SKILL-only** (the single largest correction).
- `scripts/validate-kaola-workflow-contracts.js` (codex/github validator; NOT byte-mirrored under
  plugins): delete the #606-teammate-on-github-SKILL assertion; shrink the #611-fork assertion to
  **SKILL-only**.
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` +
  `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — **three-way
  split** each shared `[command, SKILL]` loop: symmetric families stay on both; the #606 teammate
  pin → **command-only**; the #611-fork pin → **SKILL-only**. **DO NOT touch the gitea/gitlab
  `mr|pr)` contract pins** — they are deliberate machine-pinned contracts, NOT drift; acting on them
  reds the forge chain.

### Write-set completeness (recurring-overflow checklist, walked)

- **Byte-identical SYNC-GROUP pair.** `scripts/validate-workflow-contracts.js` and
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are byte-identical (verified this
  run); every edit lands identically in BOTH — BOTH are in n2.
- **No `generated_port_split` obligation.** None of the six validator/test files is a
  GENERATED_AGGREGATOR (verified against `edition-sync.js`: the aggregator list is the five adaptive
  scripts only), so there is no forge-renamed port or four-edition split obligation. The codex/github
  `validate-kaola-workflow-contracts.js` has NO plugin byte-mirror (verified — single copy at
  `scripts/`); the gitlab/gitea validators are hand-authored forge ports, each declared explicitly.
- **All four contract validators + the byte mirror + route-reachability are declared in n2** — the
  complete pinning surface for the two relocated blocks. No `.cache` receipt is declared (recorded
  parent-side, barrier-exempt).
- **Cross-edition symbol scope.** The fenced tokens (`fork_turns:"none"`, the effort-proof tokens,
  the NAMED-teammate sentinel, the one-nudge rule) live ONLY on the six plan-run surfaces + the six
  validator/test files enumerated here; no other edition tree, command, or skill references them for
  a decision (verified this run).

### Forge-neutrality / provenance discipline (builder must obey)

- The plugin plan-run surfaces stay forge-neutral: no `gh`/`glab` CLI token, no forge brand — the
  fenced blocks and any retained prose use edition-neutral phrasing already present.
- PROVENANCE_BAN: NO issue refs (`#636`, `#627`), decision IDs (format `D-NNN-NN`), or invariant
  tags in ANY command/SKILL surface. State the rule, not its origin; provenance lives in CHANGELOG /
  the decision record / commit messages only.
- After editing forge-touching files, run the standalone forbidden-token check per edition
  (`node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js
  --forbidden-only <changed-file>...` and the gitea twin) before the full chains.

### Decision record (n5-docs)

`docs/decisions/D-636-01.md` — next free number (`D-627-01 (existing)` is the only decision record
on disk; no `D-636-*` recorded). Records: the deferred #627 fix#2 is now shipped; the pin-relocation
approach was chosen over the deeper generation/include seam (which is deferred to #630,
ship-#636-first sequencing); the corrected relocation map including the #611-fork SKILL-only split;
and the deliberate non-touch of the gitea/gitlab `mr|pr)` contract pins. n5-docs depends on
n3-review (overlaps the adversarial gate); the record documents the settled APPROACH (stable
regardless of adversary findings).

### Acceptance mapping

- AC1 (T5b Codex effort tokens → 3 SKILLs only) → n2 (route-reachability + validators), verified n3/n4.
- AC2 (T14 teammate sentinel → 3 commands only) → n2, verified n3/n4.
- AC3 (four `validate-*-contracts.js` mirror the relocated pins) → n2 (all four + byte mirror).
- AC4 (Codex dispatch block removed from 3 commands) → n2 prose fence.
- AC5 (Teammate-Mode block removed from 3 SKILLs) → n2 prose fence.
- AC6 (#307: all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run
  SEQUENTIALLY and recorded) → n3/n4 run `validation_command` (`npm test` chains the four with `&&`);
  the #635 run-chains flake is fixed as of `73ca26db`, expect a clean unwaived receipt.
- AC7 (six surfaces measurably closer to the ~150-line skeleton target) → n2 fences shrink each surface.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-plan | planner | — | — | 1 | sequence | reasoning | — |
| n2-fence | implementer | n1-plan | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, scripts/test-route-reachability.js, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js | 12 | sequence | standard | Behavior-preserving relocation of contract assertions + a sub-sentence prose fence across six routing surfaces; the contract validators being edited ARE the acceptance oracle (four chains green + fenced-block-absent), so no separable failing-unit-test precedes the change — editing each assertion and its paired prose is one atomic cross-edition contract move |
| n3-review | code-reviewer | n2-fence | — | 1 | sequence | reasoning | — |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning | — |
| n5-docs | doc-updater | n3-review | docs/decisions/D-636-01.md | 1 | sequence | standard | — |
| n6-finalize | finalize | n4-adversary, n5-docs | CHANGELOG.md | 1 | sequence | — | — |

## Node Ledger

| id | status |
| --- | --- |
| n1-plan | complete |
| n2-fence | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner (n1-plan) | subagent-invoked | evidence-binding: n1-plan 32d4fb4eb0b9 | |
| implementer (n2-fence) | subagent-invoked | evidence-binding: n2-fence 62cc1b1e58b1 | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review d287751ce0c9 | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary a79443223a4f | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 8b07cd59c8de | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize f1743e979744 | |
