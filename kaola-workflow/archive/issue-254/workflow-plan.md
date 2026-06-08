# Workflow Plan — issue #254

<!-- plan_hash: 0dbe2dc2fd18ecc08d4907c11d62a5ad8f414f86b506587417e993eb7a1e4d1c -->

## Meta
labels: enhancement, area:scripts, area:workflow-phases, area:workflow-router

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|------------|--------------------|-------------|-------|
| router-plugins | implementer | — | plugins/kaola-workflow-gitlab/commands/workflow-next.md, plugins/kaola-workflow-gitea/commands/workflow-next.md, plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md, plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md | 1 | fanout(impl) |
| core-and-install | implementer | — | commands/workflow-next.md, commands/kaola-workflow-adapt.md, scripts/validate-workflow-contracts.js, plugins/kaola-workflow/scripts/validate-workflow-contracts.js, install.sh | 1 | fanout(impl) |
| harden-editions | implementer | router-plugins, core-and-install | scripts/validate-kaola-workflow-contracts.js, plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js, plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js, scripts/test-install-adaptive-config.js | 1 | sequence |
| code-review | code-reviewer | router-plugins, core-and-install, harden-editions | — | 1 | sequence |
| docs | doc-updater | code-review | README.md, docs/decisions/0007-adaptive-default-under-switch-on.md | 1 | sequence |
| finalize | finalize | docs | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status |
|----|--------|
| router-plugins | complete |
| core-and-install | complete |
| harden-editions | complete |
| code-review | complete |
| docs | complete |
| finalize | complete |

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| implementer (router-plugins) | subagent-invoked | node: router-plugins (implementer) | |

| implementer (core-and-install) | subagent-invoked | node: core-and-install (implementer) — base router/adapt + contract pair + install.sh; includes R1 cross-edition parity repair | |
| code-reviewer | subagent-invoked | node: code-review (code-reviewer, opus) — issue #254, re-review after R1 parity  | |
| doc-updater (docs) | subagent-invoked | node: docs (doc-updater) — issue #254 | |
| finalize (finalize) | subagent-invoked | node: finalize (sink) — issue #254 | |
| implementer (harden-editions) | subagent-invoked | node: harden-editions (implementer) — plan-repair node for the 4 files #254's sc | |
| code-reviewer | subagent-invoked | node: code-review (code-reviewer, opus) — issue #254, re-review after harden-edi | |
| finalize (finalize) | subagent-invoked | node: finalize (sink) — issue #254, re-run to amend CHANGELOG after the harden-e | |
## Plan Notes

Non-author free-text (outside the `plan_hash`, which covers only `## Meta` + `## Nodes`).
Resume-safe specification of issue #254: under an ON adaptive switch, make the adaptive path the
DEFAULT route in `/workflow-next` Step 0a-1 (`fast`/`full` become explicit path-naming escapes);
flip the `install.sh` switch default `no` → `yes` with a REAL `--enable-adaptive=no` write path;
update the contract assertion and docs. Switch-OFF behaviour stays byte-for-byte unchanged.

### DAG shape rationale (a diamond: two disjoint implementers → review → docs → finalize)

The prose+config work spans 10 source files (router ×4 + adapt ×4 + contract + install.sh, plus the
contract's #274 byte-identical peer) — over the FILE_CEILING of 6 per node — so the implement work
MUST split across ≥2 nodes. Disjointness is checked by `areaForPath`: for the Claude tree
(`plugins/kaola-workflow/...`) the area is the FIRST THREE segments (e.g.
`plugins/kaola-workflow/skills`, `plugins/kaola-workflow/scripts`); the edition trees
(`plugins/kaola-workflow-gitlab/...`, `plugins/kaola-workflow-gitea/...`) do NOT match that prefix
and coarsen to bare `plugins`; everything else coarsens to its top-level dir. That yields a clean
disjoint split:

- `router-plugins` (implementer) owns the prose editions: 4 edition files (gitlab+gitea router and
  adapt) → area `plugins`, and 2 Claude SKILL files → area `plugins/kaola-workflow/skills`. Total
  6 files (= FILE_CEILING).
- `core-and-install` (implementer) owns lanes {`commands`, `scripts`, `plugins/kaola-workflow/scripts`,
  `install.sh` (root)} = 5 files (`commands/workflow-next.md`, `commands/kaola-workflow-adapt.md`,
  `scripts/validate-workflow-contracts.js`, its #274 byte-identical peer
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`, `install.sh`).

The two area sets — `router-plugins` {`plugins`, `plugins/kaola-workflow/skills`} vs.
`core-and-install` {`commands`, `scripts`, `plugins/kaola-workflow/scripts`, `install.sh`} — share
NO area (the contract peer's `plugins/kaola-workflow/scripts` is a distinct 3-segment area from both
bare `plugins` and `plugins/kaola-workflow/skills`), and the two nodes never write the same file, so
they are genuinely pairwise-disjoint. Both carry `fanout(impl)` with empty `depends_on` — a root
fan-out (origin `*`, label-only bucket). They are batch-eligible siblings the executor opens as one
frontier (width 2, well under FANOUT_CAP). `code-review` (code-reviewer) depends on BOTH implement
nodes, so it post-dominates every code-producing node (G1 satisfied) — it is NOT fanned with
anything; a parallel review path would bypass the gate. `docs` (doc-updater) is sequenced after the
review (document after implement+review; keeps `README.md` + the ADR out of the implementers'
disjointness question entirely). `finalize` writes ONLY `CHANGELOG.md`.

No `code-architect`/`planner` node: the issue fully specifies the design (the Step 0a-1 table, the
keyword split, Branch A/B prose, the install flip + `=no` write path, the exact contract-array
edit), so an architect node would be redundant (#291 precedent for skipping it when the issue is
fully specified). `doc-updater` IS required: docs (ADR, README) and a public surface (the
`--enable-adaptive` default + help) change.

### Implement-role choice — both `implementer`, with `non_tdd_reason`

Both implement nodes are `implementer`, not `tdd-guide`. `non_tdd_reason`: this is prose
(router/adapt markdown ×8, README, ADR), a single concept-array edit in a contract validator (and
its byte-identical peer), and a shell-script default flip — NONE has a natural failing UNIT test to
write first.
- The router/adapt prose change is markdown; the walkthrough's adaptive cases (#227) assert SCRIPT
  behaviour (switch-OFF typed-refusal, `workflow_path` persistence) which the prose does NOT touch,
  so those stay green — there is no RED→GREEN unit test for prose.
- `validate-workflow-contracts.js` is itself the test harness; the `flag-only` → `default` edit is
  a single-line change to its OWN assertion array, not testable by a failing unit test.
- `install.sh` has NO unit-test harness and is explicitly NOT exercised by the walkthrough or the
  contract validator (issue: "install.sh is not exercised … need explicit manual verification");
  it is verified manually, not by a failing unit test.
"Hard to test" is not the reason — there is genuinely NO failing-unit-test seam here; this is
prose/config/script wiring, the textbook `implementer` case.

### `core-and-install` — the contract edit + the install stale-config trap

- `scripts/validate-workflow-contracts.js` (~line 556) AND its #274 byte-identical peer
  `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are a COMMON_SCRIPTS pair: the
  concept-array edit MUST be applied IDENTICALLY to BOTH copies, or `validate-script-sync.js`
  (inside `npm test`) FAILS CLOSED on byte-drift and the Phase-6/finalize barrier refuses (this is
  exactly the drift that bit #291). They are in the SAME node precisely so they move together. The
  `'adaptive path selection'` `assertConcept` targets ONLY `commands/workflow-next.md` (verified —
  it is the sole assertion for that concept), so the edit is fully contained in THIS node alongside
  the file it asserts. Remove `'flag-only'` from the concept array and ADD `'default'`; update the
  comment to the new switch-chooses-default model. KEEP `KAOLA_ENABLE_ADAPTIVE`, `adaptive`,
  `fast|full|adaptive`, `typed refusal`, `mechanical`, `≤ 5`, `design choice` (per the issue's
  Contract bullet). After the edit, `commands/workflow-next.md` (edited in this same node) MUST
  satisfy the new concept array — all three files move together in `core-and-install`, so no
  cross-node coupling.
- `install.sh`: flip `ENABLE_ADAPTIVE` default `no` → `yes`; give the `=no` branch a REAL write
  path that actively writes `enable_adaptive:false` (read-modify-write; preserve `parallel_mode`
  and other keys) so an opt-out survives a re-install/upgrade over a stale `:true` (the
  stale-config trap); update `usage()` and the `--enable-adaptive` help line (default is now
  `yes`). The schema RESOLUTION floor stays `env > config > OFF` — do NOT move it; this is an
  install-written-config change only, so `KAOLA_ENABLE_ADAPTIVE=0` and an absent/cleared config
  stay OFF (kill-switch invariant intact).

  MANUAL VERIFICATION (not covered by walkthrough/contract — the implementer MUST run all three):
  1. bare `./install.sh` → config has `enable_adaptive:true`;
  2. `--enable-adaptive=no` on a fresh machine (no config) → OFF (`:false` or key absent);
  3. `--enable-adaptive=no` over a pre-existing `:true` config → MUST end OFF (actively
     written `:false`) — the stale-config trap; a no-op `=no` branch is the bug being fixed.

### `router-plugins` — the prose flip across the parallel edition surface

The four router files and four adapt files are maintained in PARALLEL (each with its own forge
nouns — `gh`/`glab`/`tea`); `validate-script-sync.js` syncs the `.js` ports, NOT these markdown
routers, so each edition needs the edit with its own forge vocabulary. This node owns the gitlab
`commands/`, gitea `commands/`, and Claude `skills/SKILL.md` editions of BOTH router and adapt;
`core-and-install` owns the base-edition `commands/` copies. The two nodes must apply the SAME
logical Step 0a-1 rewrite (Branch B: explicit `KAOLA_PATH` honored → explicit path-naming verbal
escape → default `adaptive`; the keyword split: path-name phrases escape, task-descriptor phrases
route to adaptive; switch-OFF Branch A unchanged) and the SAME adapt-precondition rewrite (drop
"and the structure question … was affirmatively confirmed"; replace with "adaptive is the default
under an ON switch; `fast`/`full` are explicit path-naming escapes"). `code-review` post-dominates
both and the `npm test` barrier at `finalize` catches any cross-edition drift.

### `docs` (doc-updater) — ADR NUMBER CORRECTION + README

- The issue prose proposes a new ADR `0004-adaptive-default-under-switch-on.md`, but `0004` IS
  ALREADY TAKEN (`0004-script-owned-mechanical-transitions.md`); the highest existing ADR is `0006`
  (`0006-planner-first-entry.md`). The new ADR MUST be authored as
  `docs/decisions/0007-adaptive-default-under-switch-on.md` (this is the declared write-set path).
  It Supersedes the SELECTION / "a custom graph must earn itself" portion of
  `0003-adaptive-front-end-planner.md` and the #227 structure-question gate.
- `README.md`: the adaptive-switch description must DROP "opt-in and OFF by default" and document
  ON-by-default + the `--enable-adaptive=no` opt-out; note the switch now ALSO flips the default
  route (adaptive default; `fast`/`full` explicit escapes).

### Optional / deferred (NOT in this plan's write set)

- The switch-agnostic discoverability bullet in the `workflow-init` `CLAUDE.md` template (init
  SKILL ×3, all under `plugins/`) is explicitly OPTIONAL in the issue (Open Question 3). DEFERRED:
  the issue itself frames it as Optional and notes "making adaptive the default largely moots" the
  awareness gap. Authoring the router default is sufficient for the issue's binding ACs. If the
  orchestrator wants it for completeness, it is a clean follow-up (a separate node) — NOT a release
  blocker.

### Verification reality (G1 gate)

"Verified" = `node scripts/validate-workflow-contracts.js` passes AND
`node scripts/simulate-workflow-walkthrough.js` exits 0 ("Workflow walkthrough simulation passed")
AND `npm test` green (which runs the contract validator + walkthrough + `validate-script-sync.js`
byte-identity of the contract-validator pair), PLUS the three manual `install.sh` cases above.
`code-review` (code-reviewer) post-dominates BOTH implement nodes (G1). `finalize` writes ONLY
`CHANGELOG.md` (docs/state only — a non-docs write there trips code-reviewer).
