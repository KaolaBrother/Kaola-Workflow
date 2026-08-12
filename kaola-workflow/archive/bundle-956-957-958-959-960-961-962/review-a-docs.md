# Review A — documentation accuracy (bundle 956–962)

VERDICT: FAIL — 1 confirmed defect (one root cause, two doc sites). Everything else in the
doc diff verified TRUE against the shipped tree; the full per-item verification record follows
the finding.

Reviewed: full `git diff HEAD` of the worktree, docs scope (`docs/api.md`, `docs/conventions.md`,
`docs/architecture.md`, `docs/workflow-state-contract.md`, `docs/kimi-edition.md`,
`docs/opencode-edition.md`, `docs/README.md`, `CHANGELOG.md`), every factual claim checked against
the code in the same worktree. No suites run (per brief); read-only throughout.

---

## DEFECT 1 (medium) — the #957 repair re-introduces the single-source claim a previous review already corrected, and now contradicts `docs/architecture.md`

**Sites (both authored by this diff):**

- `docs/api.md:1533-1538` — "The per-tier model/effort pair is **defined once**, by the four
  constants in `scripts/kaola-workflow-codex-preflight.js` (…) — cross-bound to the installer by
  `validate-kaola-workflow-contracts.js` **and to the shipped Codex SKILL prose by
  `test-route-reachability.js`**."
- `docs/conventions.md:45-47` — "the per-tier pair is **defined solely by** the
  `CODEX_STANDARD_*`/`CODEX_REASONING_*` constants in `kaola-workflow-codex-preflight.js`…"

**Why it is false (measured):**

1. **"Defined once/solely" is not true of the tree.** The same four constants, same names, same
   literal values, are independently authored in
   `plugins/kaola-workflow/scripts/install-codex-agent-profiles.js:92-95` (no import — authored
   literals; that is *why* the validator's cross-bind exists:
   `scripts/validate-kaola-workflow-contracts.js:444-453` asserts installer === literal AND
   preflight === installer). The values are additionally authored as prose literals in
   `templates/routing/next.skeleton.md` and `finalize.skeleton.md` — the dispatch-routing pin that
   actually ships to the six Codex SKILL surfaces.
2. **The SKILL-prose binding claim is true only of the effort half.**
   `scripts/test-route-reachability.js:534-545` builds `EXPECTED_EFFORTS` from
   `codexPreflight.CODEX_STANDARD_EFFORT`/`CODEX_REASONING_EFFORT` and asserts them against the
   SKILL prose — but the model in that regex is literally `model: "[^"]+"` (line 538): **any model
   string passes**. The model sentence is pinned by T19 against the test's *own hardcoded literal*
   (`test-route-reachability.js:119-120`), not against the constants. A model-constant change with
   stale SKILL prose leaves `test-route-reachability.js` entirely green on that surface.
3. **Internal contradiction, shipping today.** `docs/architecture.md:396-404` (repaired by the
   previous bundle's adversarial review, unchanged here) states the opposite, correctly: the pair
   "is **authored twice**, as named constants (…) in `kaola-workflow-codex-preflight.js`, and as
   typed literals in the dispatch-routing pin of `templates/routing/next.skeleton.md` and
   `finalize.skeleton.md`, **which is what ships** to the SKILL surfaces… Note the shape of that
   binding — it pins the **effort** and accepts any model string, so a model change is caught by
   the contract validator rather than by the prose check." Two shipped docs now give a reader
   contradictory answers to "where is the Codex pair defined, and what catches drift".

The run's own premise pass recorded both facts before the wording shipped
(`premise-957.md`: "any model string passes this check"; carrier table rows 5-7: installer copies
bound by validator equality) and the previous bundle's archived record states "the pair has NO
single source… my first TWO repairs of this both named a single wrong source". This diff's wording
is the third occurrence of the same wrong-pointer defect class the bundle exists to fix.

**Impact:** bounded but real — a reader following api.md/conventions.md edits preflight alone and
learns the topology only from a chain of validator reds; a reader trusting the route-reachability
attribution believes the SKILL model prose is constant-bound when it is literal-pinned. Uncertainty
counts against the change; the sibling doc already carries the accurate wording, so there is no
cost to matching it.

**Minimal correct wording** (mirror `docs/architecture.md:396-404`):

- api.md: "The per-tier model/effort pair is authored as bound copies: the four constants in
  `scripts/kaola-workflow-codex-preflight.js` (`CODEX_STANDARD_MODEL`/`CODEX_STANDARD_EFFORT`,
  `CODEX_REASONING_MODEL`/`CODEX_REASONING_EFFORT`), cross-bound to the installer's copies by
  `validate-kaola-workflow-contracts.js`, and the values shipped on the Codex next/finalize SKILLs,
  whose effort halves `test-route-reachability.js` builds from those constants (the model sentence
  is literal-pinned there, and a model change is caught by the contract validator). This document
  does not restate the values."
- conventions.md: drop "solely"; e.g. "the per-tier pair is carried by the
  `CODEX_STANDARD_*`/`CODEX_REASONING_*` constants in `kaola-workflow-codex-preflight.js` (bound to
  the installer's copies) and shipped on the Codex next/finalize SKILLs".

Secondary anchor: the CHANGELOG #957 narrative ("had its per-tier model and effort pair bound to
`kaola-workflow-codex-preflight.js` except three") repeats the full-pair-binding framing; it reads
correctly once the two doc sentences are repaired to the effort-half precision, so it repairs with
them or stands as acceptable summary — orchestrator's call.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=implementer rationale=api.md and conventions.md state the Codex pair is defined once/solely in codex-preflight.js and fully cross-bound to SKILL prose by test-route-reachability.js; measured: installer authors the same four constants (install-codex-agent-profiles.js:92-95), the skeletons author the shipped prose values, and test-route-reachability binds only the effort halves (model regex is "[^"]+", line 538; model pinned by test literal 119-120) — contradicting docs/architecture.md:396-404 which states the accurate two-source, effort-only-bound topology.

---

## Verified TRUE — the rest of the assigned scope (no defects)

1. **`docs/conventions.md` derived-sentence-parity block** — matches
   `scripts/test-agent-profile-parity.js` exactly: threshold is
   `Math.ceil(corpus * 2/3)` (lines 145-154, "at least two thirds" ✓); reverse obligation = every
   hand-maintained `.md` (lines 284-286), forward = all three `.toml` twins of every hand-maintained
   role (lines 288-297); `ROLE_PINS` is presence-FIRST in the source `.md` (lines 257-265) before
   twins are checked, exactly as the doc says. Surrounding claims still true: `.toml` triple
   byte-identity (lines 393-396), chain pinning — guard present in the claude chain
   (`package.json:40`) and pinned by all four `validate-*-contracts.js` (root
   `validate-kaola-workflow-contracts.js:603`, plugin `validate-workflow-contracts.js:884`,
   gitlab :545, gitea :547); "Three-part" still three parts. New Workflow paragraph accurate.
2. **`docs/architecture.md` (a)** "Four editions … three forge CLIs" — measured: exactly the CLIs
   `gh`/`glab`/`tea`; the Codex tree's `gh` call sites are 6 files, all rename-normalized canonical
   copies. Coheres with (does not contradict) the capability table's "claude and codex each ship
   against three forges" note — same axis statement. **(b)** — render targets: 18
   `GENERATED_SURFACES`, none under `.opencode`/`.kimi`; both sync scripts derive command surfaces
   from the routing registry via `runtime-edition-forge.js` `commandSources()`
   (`sync-opencode-edition.js:160,164`; `sync-kimi-edition.js:115,119` →
   `routing.commandSurfacesForForge`). True of BOTH editions. **(c)** `PARKED_LANE_PREFIXES` exists
   at `kaola-workflow-adaptive-schema.js:301`, exported (:1543), values exactly the three prefixes
   the old prose named (`kaola-workflow/`, `.kw/worktrees/`, `.kw/legs/`).
3. **Codex pointers resolve** — the four constants exist and are exported
   (`kaola-workflow-codex-preflight.js:89-92, 4013-4016`); `validate-kaola-workflow-contracts.js`
   does cross-bind installer↔preflight (444-453); `test-route-reachability.js` does bind the SKILL
   prose efforts to the constants (543-544). The pointers are good; the *claims about* them are
   Defect 1.
4. **`docs/api.md` PR-sink sentence** — true of `scripts/kaola-workflow-sink-pr.js`: it writes no
   closure receipt (its only receipt mention reads sink-merge's `sink-fallback.json`, line 204);
   the watcher (`cmdWatchPr`, `kaola-workflow-claim.js:6266`) appends the terminal receipt at
   merge (:6331, :6364). `cmdSinkPr` now appears nowhere outside the CHANGELOG narrative.
5. **`docs/kimi-edition.md` deleted bullet** — deletion sound. `modelDisplay` exists NOWHERE in
   `scripts/`, `plugins/`, `templates/`, or live `docs/` (git grep: zero hits), so the bullet's
   central clause was false of the tree, not merely redundant. The true clauses survive in the same
   section: no two-tier mapping / tier inert ("There is no Reasoning/Standard two-tier mapping",
   "Because the tier is inert here"), ledger tier tokens remain (the `opus`/`sonnet` plan-ledger
   parenthetical), Codex-precedent semantics ("follows the Codex inherit precedent"). Nothing true
   and reader-facing was lost.
6. **`docs/opencode-edition.md` roster pointer** — both halves true: `reasoningRoles()`
   (`sync-opencode-edition.js:508-517`) derives from `agents/*.md` frontmatter `model:` via
   `roleTier` (opus → reasoning) and writes the roster into the scaffold comment (lines 553-554,
   577-583); the repo-root `opencode.json` comment carries exactly the derived seven
   (adversarial-verifier, build-error-resolver, code-architect, code-reviewer, planner,
   security-reviewer, synthesizer — byte-matched against `reasoningRoles()` output), and the #F8
   parity check (:885) holds the seeded file to the renderer.
7. **`docs/README.md` opencode entry** — "model and effort inherited from the session, opt-in
   per-tier model pin" matches `opencode.json` ("nothing is pinned, so BOTH tiers inherit"),
   `sync-opencode-edition.js:519-520` ("Every role runs the model and reasoning effort of the
   session"), and opencode-edition.md's env-pin section.
8. **`LANE_STALENESS_MS` name-only at three sites** — constant real:
   `kaola-workflow-adaptive-schema.js:238` (`= 86400000; // 24 hours`), exported (:1541); all three
   edited sites keep "(24 hours)" and the correct home; none reads incoherently *as a result of
   this diff*. (Pre-existing, not candidate-caused: `architecture.md` §Lane classification calls
   the constant one of "three claim-time fields… written once at claim time", which was equally
   odd with the value inline.) The remaining `= 86400000` restatements are in `docs/decisions/`
   history, consistent with the "three live sites" claim.
9. **CHANGELOG `### Removed`** — both entries accurate, verified at HEAD: `run-chain-pool.js` was
   428 lines, `SHARDED_SUITES = {}` (HEAD:scripts/run-chain-pool.js:68), sole live consumer
   `scripts/test-parallel.js:349` inside `selfTest()` — that pool section (f6-f9 + the require)
   removed while `--self-test` itself survives and still runs in the chain; the walkthrough's
   `KAOLA_TEST_TIMEOUT_SCALE` read is unchanged, fail-open, and nothing now exports the variable
   (tracked tree + all six rendered edition trees swept). `fixtures-orphan-legality.js` was 102
   lines with exactly 8 exports; `1fc33c9d` deleted `scripts/test-parallel-batch.js` and `c0b48043`
   deleted `scripts/test-adaptive-node.js` (both confirmed via `--diff-filter=D`); no live-code
   reference remains; the install-manifest exclusion comment removed in both byte-paired copies.
   #962's removals verified (three strips match nothing in the nine canonical command sources;
   `--commands-dir`/`--forges` gone; six constants incl. both `OUT_HOOKS_DIR`). #956's "removed at
   `523f1241`… replaced in the same commit and the same file" verified in that commit's diff.
   Nothing user-visible unrecorded — the remaining diff hunks (claim.js ×4, run-chains.js ×4,
   test-suite-registration.js) are comment-only re-attributions of retired plan-validator/DAG
   references.
10. **Cross-cutting sweeps** — no dangling references introduced (`FEATURE_TOKENS` survives only in
    decisions/history + the audit + CHANGELOG history, per the stated retention policy;
    `provider-open` only in D-544-01's own prose; deleted scripts referenced by no live doc); no
    new prose absolute (the parity guard is forge-neutral; the preflight pointer's 4 copies are
    byte-identical); the only internal contradiction found is Defect 1.

verdict: fail
findings_blocking: 1
review_conclusion: One confirmed defect: the #957 pointer sentences in api.md and conventions.md restate the single-source and full-binding topology that architecture.md, the tree, and this run's own premise record all refute — every other claim the doc diff adds or rewrites verified true against the shipped code.
