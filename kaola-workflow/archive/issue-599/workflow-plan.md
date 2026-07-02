# Workflow Plan — issue-599

<!-- plan_hash: f37ebc6b29cd425dff292ab906f4e382caf1a0a8dd5f9a1ac73c154aefc2bd37 -->

Single-issue fix: `selectSpeculativeWriteGroup` in the adaptive-node aggregator is **fail-open** on a
`--parallel-safe` subprocess error. On a non-ok validator result WITHOUT an `overlapping` array
(validator crash, or the `node_not_found` / `too_few_nodes` shapes), the loop
`for (const o of (ps.overlapping || []))` excludes NOTHING, so every speculative write candidate
proceeds to open — asymmetric with the normal co-open path `tryFormLaneGroup`, which returns
`ok:false` on any non-ok result and degrades to a single serial write (**fail-closed**). Fix: mirror
`tryFormLaneGroup`'s posture — treat any non-ok `--parallel-safe` result that lacks a usable
`overlapping` field as conservative (exclude the candidate(s) / degrade to no speculative open) so the
two callsites of the same predicate share one error posture. Add a RED test injecting a validator
subprocess failure at speculative open-time and asserting no speculative member opens.

Found by the issue-596 review gate (LOW, non-blocking). Cross-edition: the change lands in the
`kaola-workflow-adaptive-node.js` GENERATED_AGGREGATOR group (×4 editions; four-chain obligation, #307).

## Meta

labels: enhancement, area:scripts
validation_command: npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea
speculative_open_policy: consent

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js, scripts/test-adaptive-node.js | 5 | sequence | sonnet |
| n2-review | code-reviewer | n1-fix | — | 1 | sequence | opus |
| n3-docs | doc-updater | n2-review | docs/decisions/D-599-01.md, docs/api.md, docs/architecture.md | 3 | sequence | sonnet |
| n4-finalize | finalize | n3-docs | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### DAG shape / scheduling rationale
- **Deliberately serial, deliberately DOCS-BELOW-GATE.** This is a small, well-specified,
  single-branch error-posture change; there is no genuinely-independent write work to fan out. The
  topology is a straight chain `n1-fix → n2-review → n3-docs → n4-finalize` with ONE deliberate twist:
  the docs node is placed DOWNSTREAM of the review gate (not upstream, the usual position) so that its
  ONLY unsatisfied dependency is the in-progress `code-reviewer` gate.
- **`speculative_open_policy: consent` (this run is the live #596 exercise #597 needs).** With docs
  below the gate, `n3-docs` satisfies every speculative-write eligibility guard (`next-action.js`
  `speculativePending`): it is pending, not already normally-ready (its ancestor gate is `in_progress`),
  its declared set is EXACTLY resolvable (three concrete files, no dir/glob), it declares NO PROTECTED
  file (CHANGELOG.md is PROTECTED and is therefore deliberately kept OFF this node — see below), it is
  NOT the unique sink, and its single unsatisfied direct dep is an open gate-verdict-role node. So while
  `n2-review` is open the executor can run `open-ready --speculative-consent`, which fires
  `selectSpeculativeWriteGroup` (the very function this issue fixes) and opens `n3-docs` WITH a
  provisioned per-member leg — a speculative WRITE leg observed end-to-end (open → fence →
  pass-merge on the gate's `verdict: pass`, or fail-teardown on a fail). Record THIS run's project id
  (`issue-599`) in issue #597, whose hard precondition is exactly "#596 shipped AND exercised in at
  least one live adaptive run (leg speculation observed end-to-end)".
- **Why this is a SOUND speculative bet (planner's own judgement, not an imposed one).** (a) The gate
  is high-probability-pass: it reviews a mechanical single-conditional change that mirrors an existing,
  already-reviewed sibling function (`tryFormLaneGroup`) plus one RED-first unit test — not novel
  machinery. This is the exact inverse of the #596-shipping run, whose only gate reviewed brand-new
  speculative-write machinery (genuinely uncertain → correctly NOT self-exercised). (b) The candidate
  is low-rework-cost: `n3-docs` writes only an ADR + doc notes; on a gate fail it is DISCARD-ONLY (leg
  torn down, evidence purged) and the run re-plans — bounded, cheap rework. (c) A post-gate node whose
  sole unsatisfied predecessor is the gate exists (n3). All three rubric conditions hold, so the key is
  not a no-op. `speculative_open_policy: consent` is the ONLY authoring control set; NO `speculative:`
  or `parallel_safe` annotation is hand-added to any row (eligibility stays validator/runtime-derived).
- **CHANGELOG.md is the finalize sink's write, NOT the docs node's.** `CHANGELOG.md` is a PROTECTED
  basename (`classifier.isProtected`), so declaring it on `n3-docs` would fail the speculative
  write-axis guard and silently disqualify the whole speculative exercise. The `[Unreleased]` entry is
  therefore written by the `n4-finalize` sink (docs/state only — allowed sink write), and `n3-docs`
  carries the non-protected docs (the ADR + api/architecture notes).
- **Gates (G1).** `n2-review` (code-reviewer) post-dominates the only code-producing node, `n1-fix`:
  the sole path from n1 to the sink is `n1 → n2 → n3 → n4`, and n2 is on it. `n3-docs` and
  `n4-finalize` write docs/state only (not code-producing) → no further code-reviewer obligation. No
  security-reviewer (labels are `enhancement, area:scripts`; no security label; the change is an
  error-posture hardening of a workflow-internal scheduler predicate, not a sensitive surface). No
  main-session-gate (every acceptance check — the RED test, the four chains — is delegable). No
  knowledge-lookup (all behavior confirmable locally: the fix mirrors `tryFormLaneGroup` in the same
  file). No adversarial-verifier (a heavier, genuinely-uncertain gate would both be over-engineered for
  a mechanical mirror-fix — cheapest-sufficient-mechanism — AND undercut the high-probability-pass
  premise the speculative bet rests on; the RED-first test is the external adversary here).

### Model-tier rationale
- **n1-fix = sonnet.** The decision is already made (mirror `tryFormLaneGroup`: on a non-ok
  `--parallel-safe` result lacking a usable `overlapping` array, exclude ALL candidates). The node
  carries out that written spec + a RED-first unit test — mechanical implementation against a spec,
  below the opus reasoning floor.
- **n2-review = opus.** A strong reviewer over a cheap implementer is the right asymmetry: opus verifies
  RED-first evidence, the fail-closed posture actually mirrors `tryFormLaneGroup` for EVERY non-ok shape
  (crash / `node_not_found` / `too_few_nodes` / missing-`overlapping`), the disjoint-siblings-still-open
  behavior on a GENUINE `overlapping` refuse is NOT regressed, edition parity, and four-chain greenness.
- **n3-docs = sonnet** (doc authoring against the shipped behavior). **n4-finalize = —** (the sink runs
  main-session-direct; it is never dispatched as a subagent, so it carries no model).

### n1-fix (tdd-guide, sonnet) — the fail-open → fail-closed fix + RED test
- Target: `selectSpeculativeWriteGroup` in `scripts/kaola-workflow-adaptive-node.js` (~line 4306). The
  non-ok branch currently only iterates `ps.overlapping || []` and excludes named pairs; when the result
  is non-ok AND carries no usable `overlapping` array it excludes nothing → every candidate opens.
- **Fix (mirror `tryFormLaneGroup`'s fail-closed posture):** in the `if (!(ps.exitCode === 0 &&
  ps.result === 'ok'))` branch, when `ps.overlapping` is a usable array KEEP the existing exact-pair
  exclusion (a genuine `overlapping_write_sets` refuse still excludes only the overlapping candidate(s),
  so disjoint siblings still open — the AC5 behavior); OTHERWISE (validator crash / `node_not_found` /
  `too_few_nodes` / any non-ok shape missing `overlapping`) EXCLUDE ALL candidates (`candIds`) so zero
  speculative writers open. This is the conservative, tryFormLaneGroup-symmetric direction. The
  implementer states in evidence the exact predicate chosen and confirms the disjoint-siblings-open path
  is untouched.
- **RED-first test (`scripts/test-adaptive-node.js`):** `selectSpeculativeWriteGroup` takes an injected
  `shell`. Add a unit case injecting a `shell` that returns a non-ok validator result with NO
  `overlapping` field (e.g. `{ exitCode: 1, result: 'error' }`, mimicking a validator subprocess
  crash), with ≥1 disjoint write candidate, and assert `chosen` is empty (no speculative member opens)
  and `excluded` names every candidate. Against pre-fix code this FAILS (the candidate is chosen); post-
  fix it passes. Include a CONTROL asserting a genuine `overlapping`-bearing refuse still excludes only
  the named overlapping candidate and leaves a disjoint sibling in `chosen` (no over-blocking
  regression). Match the suite's existing `selectSpeculativeWriteGroup` unit-injection style.
- **Cross-edition mechanics (generated_port_split):** after editing canonical, regenerate the forge
  ports via `npm run sync:editions` (the gitlab/gitea `kaola-{forge}-workflow-adaptive-node.js` files
  are rename-generated, never hand-edited) and byte-copy the codex twin
  (`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`). `edition-sync.js --check` +
  `validate-script-sync.js` must be green before the node closes. `test-adaptive-node.js` is root-only
  (no forge port). No contract validator pins a `selectSpeculativeWriteGroup` needle or the suite's
  assertion count (verified at authoring), so the RED test's count bump needs no pin update.

### n2-review (code-reviewer, opus) — G1 gate, high-probability-pass
Post-dominates `n1-fix`. Verifies: RED-first evidence (the injected-failure test genuinely failed
pre-fix); the fail-closed posture covers EVERY non-ok shape, not just the crash example; the genuine-
overlap path still opens disjoint siblings (AC5 not regressed); edition parity (`edition-sync --check`,
`validate-script-sync` green); all four `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains
green (run sequentially — on this box the octopus-merge test in `test-adaptive-node.js` can be
SIGKILL'd by the default `run-chains.js` concurrency, so use `KAOLA_RUN_CHAINS_CONCURRENCY=serial` if
`run-chains.js` is used); no contract-validator needle broken. This gate is the speculative bet's
predecessor — it is expected to pass, and `n3-docs` may be opened speculatively against it.

### n3-docs (doc-updater, sonnet) — non-protected docs, the speculative-write candidate
- `docs/decisions/D-599-01.md`: NEW ADR (the D-599 series is empty — next free is 01; verified against
  `docs/decisions/` at authoring). Records the fail-open→fail-closed decision, the `tryFormLaneGroup`
  symmetry, the three redundant nets that made it non-blocking (freeze grammar refuses concurrent
  antichain siblings sharing an exact path; each candidate opens in an isolated leg; a real textual
  overlap fails closed at the merge-conflict refusal on the pass path), and why fail-closed is still the
  correct posture (belt-and-suspenders, symmetric error posture across the two callsites).
- `docs/api.md`: the speculative-open kernel section (~line 318) documents `selectSpeculativeWriteGroup`
  RE-VERIFYING disjointness and EXCLUDING overlapping candidates; add the error-posture note — a non-ok
  `--parallel-safe` result missing `overlapping` now excludes ALL candidates (no speculative open),
  mirroring `tryFormLaneGroup`.
- `docs/architecture.md`: the speculative-write mechanics section (~lines 300-310) — add the fail-closed
  note only if the section describes the selection/disjointness re-check posture; DECLARED so the note
  is in-set if needed (declared-but-unwritten is legal — the barrier refuses only out-of-set writes).
- Do NOT touch CHANGELOG.md (PROTECTED — finalize owns it; also required for this node's speculative
  eligibility). Do NOT touch the 6 routing surfaces (commands/skills) or the operator card
  `docs/plan-run-cards/speculative-open.md` — this is behavior hardening beneath the CLI surface, no
  routing/card prose changes. If a doc surface not in this write set is discovered to pin changed prose,
  that is a finding to route back, not a silent extra write. No provenance (`#NNN`/`D-599-01`) in any
  agent-facing prompt surface — the ADR id lives only in the ADR/CHANGELOG/docs, never in a prompt.

### n4-finalize (finalize, sink) — CHANGELOG + four-chain evidence
Writes the `CHANGELOG.md` `[Unreleased]` `### Fixed` entry (the fail-open→fail-closed fix, the cross-
edition four-chain #307 obligation, the `docs/decisions/D-599-01.md` pointer) plus any docs/state
attribution touch-ups. The four-chain #307 evidence must be recorded BEFORE finalize per the
`validation_command` above (write the CHANGELOG entry first, THEN run the chains, so the validation
receipt is not left stale over a post-chain CHANGELOG edit).

## Node Ledger

| id | status |
| --- | --- |
| n1-fix | complete |
| n2-review | complete |
| n3-docs | complete |
| n4-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix) | subagent-invoked | evidence-binding: n1-fix 5438e5cbd7f4 | |
| code-reviewer | subagent-invoked | evidence-binding: n2-review 9e1aca4615d1 | |
| doc-updater (n3-docs) | subagent-invoked | group_passed | |
| finalize (n4-finalize) | main-session-direct | evidence-binding: n4-finalize 776090e028c8 | |
