# Adaptive Workflow Plan — bundle-436-438

<!-- plan_hash: 9e8f2735941c35d99bed8944c8c2a18ac9abcf39e67a7a9a97b44f730c1a0dc4 -->

bundle(adaptive/parallel): D-419 Part 1 + Part 3 — the `max_concurrent` coordination-kernel
field + kernel-model docs + INV-2/INV-7 byte-identity tests (#436), and the scheduler-default
posture prose across the six plan-run surfaces + planner rubric, preserving the pinned
`frontier unit` literal (#438).

## Meta

labels: enhancement, documentation, area:scripts, area:workflow-phases

Both issues IMPLEMENT the already-accepted ADR D-419-01 (existing) (the record file under `docs/decisions/`, Parts 1 and 3). No
new decision record is created; the ADR is the canonical spec for every node below and binds them
to invariants [INV-1]..[INV-7] (kernel model + crash-resume + write-alone fallback) and
[INV-15]..[INV-18] (six-surface propagation + four-chain green + validator-derived stamp + flag
default unchanged). The bundle's two issues touch DISJOINT files: #436 owns the kernel code/tests
+ `docs/architecture.md`; #438 owns the six plan-run surfaces + the planner rubric. Per the ADR's
build sequence P3 presupposes the P1 kernel model, so every doc/prose node depends on the code node
that NAMES the kernel (`max_concurrent`).

### #436 (P1 — kernel field + tests) — n1, n2

- **n1 (tdd-guide):** add the OPTIONAL `max_concurrent` integer to `running-set.json`
  (`{ state, max_concurrent?, nodes, updatedAt }`), set at OPEN time as the resolved ceiling
  `min(cap, --max || cap)` — NEVER freeze-time, NEVER into `plan_hash`; absence ⟹ 1 (fail-closed,
  the legacy `open-next` default), never "unbounded". `reconcile-running-set` caps its roll-forward
  re-opens at `ceiling − live`; absent field ⟹ 1. Fix `runCloseNode`'s empty-set fallback
  (`{ state:'open', nodes:[] }`) to SPREAD existing top-level fields so `max_concurrent` survives
  the rewrite (it currently DROPS unknown top-level fields). HARD invariant [INV-2]: `open-next`
  MUST NOT begin writing a `running-set.json` — the serial fallback stays byte-identical. Add tests
  to the existing S-CO series in `test-adaptive-node.js`: [INV-2] byte-identity (open-next writes no
  running-set.json), [INV-7] crash-resume with `max_concurrent` present + reconcile honors the
  ceiling, and the close-node empty-set field-survival regression. This is test-first (failing
  byte-identity / field-survival tests precede the field add), so `tdd-guide`. `adaptive-node.js`
  is a GENERATED_AGGREGATOR (#431): canonical + codex twin + gitlab/gitea edition-named ports are
  ONE node / ONE write set, kept in lockstep by `validate-script-sync.js` / `edition-sync.js`.
  `test-adaptive-node.js` is canonical-only (claude chain). Five files = at `FILE_CEILING`.
- **n2 (doc-updater):** extend `docs/architecture.md`'s coordination/running-set subsection
  (already at ~L170 and already citing D-419-01 (existing)) with the named kernel model — serial = running-set
  `max_concurrent = 1` by SUBSUMPTION not deletion; `open-next` / `open-ready --max 1` are the two
  surfaces of one kernel; absence ⟹ 1. Canonical spec = D-419-01 (existing), Part 1. Depends on n1 (names the
  field n1 adds). The sink-only `finalize` cannot carry this prose, so it is its own node.

### #438 (P3 — scheduler-default-posture prose ×6 + planner rubric) — n3, n4

Both are prose mirrors whose canonical spec is D-419-01 (existing), Part 3 (the exact frontmatter/body
replacement prose and the planner-rubric paragraph are quoted verbatim in the ADR). No natural
failing unit test → `doc-updater` (prose propagation), gated by route-reachability + the four
contract validators. PINNED-LITERAL CONSTRAINT (verifier finding, the #254/#291/#328 mid-run
plan-repair class): the contract validators pin the literal phrase `frontier unit` against
`commands/kaola-workflow-plan-run.md` in all four editions (`validate-workflow-contracts.js`,
the codex twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, the gitlab port,
the gitea port). The replacement prose MUST RETAIN the `frontier unit` substring at every pinned
site (cheaper than re-pinning four validators) — verify immediately after editing each surface.

- **n3 (doc-updater):** the SIX plan-run surfaces (3 Claude commands/SKILL + 3 Codex SKILL/command
  packs incl. the two forge-codex packs — the #400 six-surface contract; reaching only 4 of 6 reds
  `test-route-reachability.js`). Six files = at `FILE_CEILING`. Depends on n1.
- **n4 (doc-updater):** the planner rubric — `agents/workflow-planner.md` + the three
  `workflow-planner.toml` twins (#422 token pins). Author the D-419-01 (existing) Part 3 rubric paragraph that
  REWARDS a wide independent frontier but NEVER instructs authoring `parallel_safe` ([INV-17] — that
  annotation is validator-derived). Four files. Depends on n1. Disjoint write set from n2 and n3.

### Gate + finalize — n5, n6

- **n5 (code-reviewer, opus):** post-dominates every write node (G1). The opus tier is earned: it
  must catch the [INV-2] byte-identity regression (any refactor making `open-next` write a
  running-set.json reds the tests and is rejected), the close-node field-survival fix, and the
  `frontier unit` pin preservation across all six surfaces / four validators.
- **n6 (finalize):** docs/state-only sink (CHANGELOG.md + the bundle state file). The CHANGELOG
  entry must reach all six surfaces' worth of editions ("×6", not "×4" — the #400 propagation
  symptom). Four-chain green ([INV-16]) is the executor's finalize obligation.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
|----|------|------------|--------------------|-------------|-------|-------|
| n1 | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 1 | sequence | sonnet |
| n2 | doc-updater | n1 | docs/architecture.md | 1 | sequence | sonnet |
| n3 | doc-updater | n1 | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md | 1 | sequence | sonnet |
| n4 | doc-updater | n1 | agents/workflow-planner.md, plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml | 1 | sequence | sonnet |
| n5 | code-reviewer | n1, n2, n3, n4 | — | 1 | sequence | opus |
| n6 | finalize | n5 | CHANGELOG.md, kaola-workflow/bundle-436-438/workflow-state.md | 1 | sequence | — |

## Node Ledger

| id | role | status |
|----|------|--------|
| n1 | tdd-guide | pending |
| n2 | doc-updater | pending |
| n3 | doc-updater | pending |
| n4 | doc-updater | pending |
| n5 | code-reviewer | pending |
| n6 | finalize | pending |
