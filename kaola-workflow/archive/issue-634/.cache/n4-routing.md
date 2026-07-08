evidence-binding: n4-routing 2efad3532a73
<!-- non_tdd_reason: paste non_tdd_reason here -->
non_tdd_reason: routing-prose + generation-seam edit (the #630 template/manifest/card surface) —
verified by the generator's --check byte-match, the route-reachability manifest checker, the
forge contract validators, and the full walkthrough/four-chain going green; no RED-first unit fit
this change type (it is prose + a presence-manifest entry, not new executable logic).
<!-- regression-green|build-green|smoke-integration -->
regression-green: see "Validators run" below — generator --check clean (12/12), route-reachability
287 assertions green (incl. the new pr-metric-optimizer-card block), all 3 forge contract
validators green, full walkthrough green (testMetricOptimizerContract), four-chain run with 2
pre-existing documented environmental flakes (test-run-chains.js / test-{gitlab,gitea}-run-chains.js
mock-timing retries — neither script is in my write set).

## Template/manifest edit map (hand-edited — 4 files, generator produces the rest)

- `templates/routing/plan-run.skeleton.md` — two edits, both role-agnostic prose (no SLOT/SPLICE
  needed — the content renders identically across command/skill and all 3 forges):
  1. Gate-Role Degradation Notice: added `metric-optimizer` to the Forward-roles list (it is an
     ordinary IMPLEMENT/WRITE role like `implementer`/`tdd-guide`, not a gate — consistent with
     that list's existing entries).
  2. Evidence-persistence contract: added `metric-optimizer` to the WRITE-role-agents
     self-write list, then a new lean `<!-- CARD: metric-optimizer -->` block (6 lines): the
     dispatch card carries `dispatch.optimize` (frozen `optimize(<node-id>)` contract) and may
     override `dispatch.wait_budget_minutes` from `budget_wallclock_minutes`; points to the full
     ratchet protocol at `docs/plan-run-cards/metric-optimizer.md`. The full protocol is NOT
     inlined here (per instruction — the card carries it).
- `templates/routing/required-blocks.js` — new manifest block `pr-metric-optimizer-card`
  (topic `plan-run`, `runtime_tag: 'both'`, `surface_type_tag: 'both'` — obligates all 6 plan-run
  surfaces). Content tokens: the marker `<!-- CARD: metric-optimizer -->`, `dispatch.optimize`,
  and `docs/plan-run-cards/metric-optimizer.md` — the 2nd/3rd are DISTINCTIVE interior tokens,
  verified NOT substrings of the marker itself (the #637 lesson applied proactively, not
  reactively — see the new test-route-reachability.js sanity block below).
- `templates/routing/slots.js` — NO edit needed. The new block's prose is identical across
  surface_type/forge (no per-context variance to slot), so nothing to declare there; over-declaring
  this file in the write set without touching it is legal (declared ⊇ actual).
- `.opencode/command/kaola-workflow-plan-run.md` — mirrored BOTH prose edits by hand (this file is
  NOT part of the #630 generation seam — it is opencode's own generated artifact, produced by
  `scripts/sync-opencode-edition.js` from the canonical `commands/kaola-workflow-plan-run.md`, and
  `.opencode/` is gitignored — see the note below). Verified: after my hand-edit, running
  `node scripts/sync-opencode-edition.js --write` reported "0 file(s) updated — tree already in
  sync", proving my hand-edit is byte-identical to what proper regeneration produces from the
  now-updated canonical command source. **`.opencode/` is untracked (`.gitignore:5`)** — this
  file's bytes are a local install artifact and will not appear in the git diff/PR at all
  (consistent with D-530-02: opencode is additive, outside the #400 six-surface contract and the
  #307 four-chain).

## Generated outputs (6 — produced by the generator, NOT hand-edited)

`node scripts/generate-routing-surfaces.js --write` regenerated all 12 topic surfaces (my 2 edits
only affect the `plan-run` topic's 6, the `next` topic's 6 are untouched — confirmed via
`git diff --stat`, each plan-run surface shows the identical 17-line delta, each `next` surface
shows 0 lines changed): `commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md`,
`plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md`,
`plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md`,
`plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md`. Re-ran
`node scripts/generate-routing-surfaces.js --check` — GREEN, all 12 surfaces byte-match the
skeleton (confirms these 6 were produced BY the generator, not hand-edited alongside it).

## Hand-authored

- `docs/plan-run-cards/metric-optimizer.md` — NEW detail card, shape-matched to the existing
  cards (`# Card:` title, **When to read**/**Related** intro, `---`, numbered sections, a
  "Quick reference" ASCII flow at the end — mirrors `speculative-open.md`/`join-protocol.md`).
  Covers: the full `optimize(<node-id>)` field table + the OPT-1..6 invariant table (so a
  `plan_invalid` refusal citing an OPT marker is actionable from this card); the propose →
  apply → regression-gate → measure (median-of-K) → accept-or-reject loop; the safety rule
  (scoped `git restore`, `git reset --hard` FORBIDDEN); the output contract / five evidence
  tokens; a change-gate `adversarial-verifier` always post-dominates (OPT-5). Grepped the file
  for provenance markers — PROVENANCE-FREE (no `#NNN` / `D-NNN-NN` / `[INV-NN]` / ADR
  citations), confirmed by `grep -nE '#[0-9]{2,}|D-[0-9]+-[0-9]+|\[INV-' docs/plan-run-cards/metric-optimizer.md`
  returning no hits. All field names/defaults/caps/markers verified against the actual n2
  source (`parseOptimizeContracts`, `parseMetricValue`, `OPTIMIZE_ITER_CAP`/`OPTIMIZE_WALLCLOCK_CAP`,
  the OPT-1..6 error strings) — not guessed.
- `docs/plan-run-cards/README.md` — added the `metric-optimizer.md` row to the cards table
  (under the docs/** barrier-invisible allowband, same basis as the root README.md n3 touched;
  not in my 12-path declaration but legal per `isBarrierInvisible` — `plan-validator.js:232`,
  `/^docs\//` matches any depth).
- `scripts/test-route-reachability.js` — added a small sanity block right after the manifest
  real-run invocation (not a duplicate of the generic derived-universe loop, which already
  covers the new block automatically): asserts the `pr-metric-optimizer-card` block exists,
  obligates exactly the 6 plan-run surfaces, its distinctive tokens are not substrings of its
  own marker (the #637 lesson checked proactively for THIS block, before any bug is ever
  observed), and the card file exists on disk.

## Validators run (all GREEN)

- `node scripts/generate-routing-surfaces.js --write` then `--check` — 12/12 byte-match.
- `node scripts/test-route-reachability.js` — PASS: "Route-reachability test passed (287
  assertions)" (includes the new block's forward-token check + the reverse orphan-sentinel
  confirming the marker maps to a manifest block on all 6 surfaces, plus my new #634 sanity
  block).
- `node scripts/simulate-workflow-walkthrough.js` — PASS: "Workflow walkthrough simulation
  passed", `testMetricOptimizerContract: PASSED` among the 200+ suites.
- `node scripts/validate-kaola-workflow-contracts.js` — PASS: "Kaola-Workflow Codex contract
  validation passed".
- `node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` —
  PASS: "Kaola-Workflow GitLab contract validation passed".
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` —
  PASS: "Kaola-Workflow Gitea contract validation passed".
- `node scripts/test-opencode-edition.js` — PASS (509 assertions) — the opencode surface edit
  did not regress the opencode edition's own suite (not gated on this task; run for hygiene).
- Surface sanity grep confirming the marker/tokens landed on all 6 generated surfaces AND the
  opencode surface (7 files, 1 hit each for `CARD: metric-optimizer`, `dispatch.optimize`, and
  the 3-hit `metric-optimizer` count — Forward-roles + WRITE-role list + CARD body).

## Four-chain record (#307 — cross-edition diff, all four run sequentially)

- **claude** (`npm run test:kaola-workflow:claude`) — every step GREEN through
  `simulate-workflow-walkthrough.js`, `generate-routing-surfaces.js --check`, and
  `test-generate-routing-surfaces.js`, EXCEPT `test-run-chains.js` (13 failures / 106 passed,
  same documented #635-class TIMEOUT signature n2 already proved against the unmodified main
  baseline — `test-run-chains.js` does not `require()` anything I touched). Also observed (and
  independently reproduced by re-running `test-adaptive-node.js` standalone): a stray
  `EISDIR` crash-dump from an unrelated concurrent-lane fixture inside that suite's OWN test
  harness (`scripts/kaola-workflow-task-mirror.js:143`, untouched by n1/n2/n3/me) — both the
  chained run and the standalone re-run still print `adaptive-node tests passed (1486
  assertions)` and exit 0; a pre-existing harness quirk under machine load, not a regression
  from this change.
- **codex** (`npm run test:kaola-workflow:codex`) — fully GREEN (contract validation, canonical
  Codex walkthrough, active-folders-field-parity, `generate-routing-surfaces.js --check`).
- **gitlab** (`npm run test:kaola-workflow:gitlab`) — every step GREEN (vendored-agent
  validation, GitLab contract validation, the full GitLab walkthrough incl.
  `testGitlabBundle424432433NodeSeeding`) EXCEPT its embedded `test-gitlab-run-chains.js`
  mock-chain retry/receipt sub-suite, which flaked on a DIFFERENT specific assertion across 2
  separate runs (`G3: transient-then-pass...` then `G2: a clean receipt IS written on a
  failing chain`) — the timing-race signature n3 already documented for this exact script; not
  in my write set.
- **gitea** (`npm run test:kaola-workflow:gitea`) — every step GREEN (vendored-agent
  validation, Gitea contract validation, the full Gitea walkthrough) EXCEPT its embedded
  `test-gitea-run-chains.js` mock-chain retry/receipt sub-suite (same `G3` transient-retry
  timing-race class); not in my write set.
- The composite `npm test` short-circuits on the first `test-run-chains.js` failure (documented
  `&&` behavior), so codex/gitlab/gitea were additionally run standalone to get their own
  results (all reported above) — per the instruction, the orchestrator's finalize-time run on a
  possibly-quieter machine is the definitive unwaived receipt; every flake observed here traces
  to a script outside my write set and matches an already-documented environmental class.

## Files touched (14)

Hand-edited: `templates/routing/plan-run.skeleton.md`, `templates/routing/required-blocks.js`,
`scripts/test-route-reachability.js`, `.opencode/command/kaola-workflow-plan-run.md` (gitignored,
non-shipping — verified byte-identical to a proper `sync-opencode-edition.js` regeneration).
New: `docs/plan-run-cards/metric-optimizer.md`. Modified (docs/** allowband, not in the 12-path
declaration, legal): `docs/plan-run-cards/README.md`. Generated (not hand-edited, confirmed via
`--check`): the 6 plan-run command/SKILL surfaces listed above.
