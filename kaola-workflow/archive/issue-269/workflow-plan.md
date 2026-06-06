# Workflow Plan — issue-269

<!-- plan_hash: d32a52f71515d0306ed021a1ab56db266aaf4bf560d61d587e83c26191731ddc -->

Wire the USE side of `select(<group>)` (Classify-And-Act). #263 shipped the script-mechanical
side: the grammar (G-SEL-1..4), the fail-closed `--selector-check` validator mode, and the blocking
`selectorCheck` step in `kaola-workflow-commit-node.js` that RETURNS `armsToNa: [<arm-ids>]` in its
JSON (commit-node never mutates the ledger — it returns; the caller transcribes). This issue wires
the contractor so that, when a `selector_source` node completes, it READS `selectorCheck.armsToNa`
from the per-node barrier JSON and writes `## Node Ledger` `n/a` rows for the unselected arms BEFORE
the fused advance — so `next-action` sees those arms as TERMINAL and surfaces only the selected arm
in the new ready set. On `selectorCheck.ok === false` (missing/foreign selector) the orchestrator
halts and does NOT re-dispatch arms.

This is pure prose/documentation wiring across four runtime editions plus a `docs/api.md` section —
NO `scripts/` logic change, NO validator change. The surfaces are: the canonical executor command
`commands/kaola-workflow-plan-run.md` (the `commit+advance` contractor prompt, step 3 — an
additional `(e) SELECTOR ROUTING` instruction that fires only when the completing node is a
`selector_source`), its Codex skill mirror `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`,
its gitea/gitlab command mirrors under `plugins/kaola-workflow-gitea/` and
`plugins/kaola-workflow-gitlab/`, and a new "Selector routing — orchestrator contract" section in
`docs/api.md` documenting the contractor protocol with the REAL `commit-node` JSON shapes (already
documented at `docs/api.md` ~L248-250/L377-386: `{ ok, isSelector, selected, group, armsToNa }`),
the `selectorCheck.ok === false` halt, and how `n/a` arms interact with `next-action`'s TERMINAL
set and resume re-entry.

Topology rationale (why a serialized chain, not a fan-out). Three of the four prose mirrors share
the top-level `plugins/` directory (`plugins/kaola-workflow/…`, `plugins/kaola-workflow-gitea/…`,
`plugins/kaola-workflow-gitlab/…`); fan-out disjointness is checked at top-level-directory
granularity, so any two of those nodes would collide → out-of-grammar (the #263 lesson). All five
prose/doc files (four mirrors + `docs/api.md`) therefore live in ONE `doc-updater` node
(5 ≤ FILE_CEILING 6) — which also keeps the four-edition prompt extension concept-synced in a single
edit. A read-only `code-explorer` runs first to capture the REAL `commit-node --selector-check` JSON
and the exact insertion point in each mirror (directly serving AC#3: real shapes, not fabricated).

Why no `code-reviewer` (G1) node. Every declared write path ends in `.md` (the four mirrors,
`docs/api.md`, and the `CHANGELOG.md` sink), so `isDocsPath` is true for all of them and no node
"produces code" under the validator (`doc-updater` writing only docs is G1-exempt; `tdd-guide` would
flip `producesCode` true regardless of write set, so it is deliberately NOT used — there is no
test/script behavior to drive). G1 is therefore not grammar-required for this all-prose chain.

Sensitivity. Labels are `enhancement, area:scripts, area:workflow-phases` — none in the sensitive
set (auth/payments/secrets/user-data) — and no declared write-set path matches a Phase-5 sensitivity
pattern (markdown prose only; no auth/payments/secrets/filesystem/external-API surface). Therefore no
G2 / `security-reviewer` node is required (same call as #263). The feature being wired is itself
zero-blast-radius: it routes already-validated, script-decided `n/a` ledger rows.

`doc-updater` lands LINEAR before `finalize` (docs change → public-interface/contract docs updated),
and the `finalize` sink writes only `CHANGELOG.md`.

## Meta

labels: enhancement, area:scripts, area:workflow-phases

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
| --- | --- | --- | --- | --- | --- |
| explore | code-explorer | — | — | 1 | sequence |
| wire | doc-updater | explore | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, docs/api.md | 1 | sequence |
| finalize | finalize | wire | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | notes |
| --- | --- | --- |
| explore | complete | |
| wire | complete | |
| finalize | in_progress | |

## Required Agent Compliance

| node | status | evidence | notes |
| --- | --- | --- | --- |
| code-explorer (explore) | subagent-invoked | `.cache/explore.md` — READ-ONLY findings: real `selectorCheck` JSON shapes from commit-node.js (lines 982–1037): non-selector `{ok:true,isSelector:false,armsToNa:[]}`, valid-selector `{ok:true,isSelector:true,selected,group,armsToNa:[…]}`, error `{ok:false,isSelector:true,errors:[…]}`; full commit-node barrier JSON shape (combineResults lines 126–137) with `selectorCheck` field; n/a rows and TERMINAL set interaction in next-action.js (lines 27–82): n/a writes must precede fused advance; exact insertion points in 4 runtime editions and docs/api.md documented; per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow; gateVerify informational:true; verdictCheck informational:true, found:false; selectorCheck ok:true isSelector:false armsToNa:[]; overallOk:true); GREEN n/a (read-only node, no write set) | |
| doc-updater (wire) | subagent-invoked | `.cache/wire.md` — documentation changes applied to 5 files: (1) `commands/kaola-workflow-plan-run.md` line 198: inserted `(e) SELECTOR ROUTING` sub-step after `(d) FUSED ADVANCE`; (2) `plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md` lines 106-107: inserted selector routing paragraph; (3) `plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md` line 198: same `(e) SELECTOR ROUTING` text; (4) `plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md` line 198: same `(e) SELECTOR ROUTING` text; (5) `docs/api.md` after line 397: new `## Selector routing — orchestrator contract` section (lines 399–431) with JSON shape examples, contractor protocol, n/a row interaction, and resume re-entry paragraph; per-node barrier pass (barrierCheck exit:0, 0 errors/sensitiveHits/outOfAllow; gateVerify ok:true informational:true; verdictCheck ok:true found:false informational:true; selectorCheck ok:true isSelector:false armsToNa:[]; overallOk:true); test_thrash:0 | |
