evidence-binding: n6-enforcement 15a8889ca528

## task
Make every earlier bundle change (n3 scout-model wiring, n4 axiom layer, n5 next-surface
seam) machine-guarded: the enforcement pins, the axiom byte-identity drift guard, the
cross-edition parity decision, and the opencode regen/validation. Each new pin proven
LOAD-BEARING (reds when the guarded thing is absent, greens on the real tree).

## RED (load-bearing proof)
RED (scout dispatch pin, validate-workflow-contracts.js): blanked the governed placeholder in
a scratch perturbation of commands/workflow-next.md (`model="{ISSUE_SCOUT_MODEL}"` -> `model=""`)
and ran `node scripts/validate-workflow-contracts.js` ->
  `Error: commands/workflow-next.md must include: model="{ISSUE_SCOUT_MODEL}"`
  at validate-workflow-contracts.js:811 (assertIncludes), exit 1.
Restored the placeholder via exact-reverse Edit -> `Workflow contract validation passed`, exit 0
(git diff confirms the scout line is a clean single-`+` n5 addition, no perturbation residue).

RED (axiom byte-identity guard, simulate-workflow-walkthrough.js): perturbed one character of the
embedded axiom block in commands/workflow-init.md (`**Correct first.**` -> `**Correct FIRST.**`)
and ran `node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` ->
  `Error: commands/workflow-init.md must embed the canonical templates/axioms.md First Principles
   block byte-identically (drift from templates/axioms.md detected)`
  at simulate-workflow-walkthrough.js:47 (assert), exit 1.
Restored with `git checkout -- commands/workflow-init.md` (committed file; empty diff-stat = exact
restore) -> `testAxiomBlockByteIdentity: PASSED`, exit 0. No transient break left in the tree.

RED (R1 repair — opencode scout-dispatch mangle guard, test-opencode-edition.js A27): the generic
{X_MODEL} strip in sync-opencode-edition.js was mangling the scout paragraph on the generated
opencode surface (empty inline-code span `Dispatch it with `` ` + two install.sh/placeholder
sentences that are FALSE for opencode). Added a paragraph-level rewrite in sync-opencode-edition.js
and tightened the test (A27). To prove A27 load-bearing, temporarily neutralized the new rewrite
(prefixed its regex with `NOMATCH_RED_PROOF_`), regenerated `.opencode/*`, and ran
`node scripts/test-opencode-edition.js` -> 4 FAILs, exit 1:
  `FAIL: A27 (R1): ... must NOT carry the empty inline-code span residue "Dispatch it with ``"`
  `FAIL: A27 (R1): ... must NOT carry the false "install.sh renders this placeholder" sentence`
  `FAIL: A27 (R1): ... must NOT carry the false "router itself never substitutes it" sentence`
  `FAIL: A27 (R1): ... must carry the opencode-true scout-dispatch rewrite`
  (opencode-edition test FAILED: 4 failure(s), 512 passed).
Restored the rewrite regex, regenerated -> the scout line reads cleanly ("Dispatch the read-only
issue-scout agent; its effort variant resolves centrally from `opencode.json` — the governed
issue-scout tier.") and `test-opencode-edition.js` -> passed (516 assertions), exit 0. No transient
break left in the tree.

## GREEN (final verify — all nine, real exit codes)
GREEN: node scripts/validate-workflow-contracts.js            -> Workflow contract validation passed (exit 0)
GREEN: node scripts/validate-kaola-workflow-contracts.js      -> Kaola-Workflow Codex contract validation passed (exit 0)
GREEN: node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js -> GitLab contract validation passed (exit 0)
GREEN: node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js   -> Gitea contract validation passed (exit 0)
GREEN: node scripts/validate-script-sync.js                   -> OK: 24 common scripts, 27 byte-identical groups ... in sync (exit 0) [#1==#2 byte-mirror intact]
GREEN: node scripts/test-route-reachability.js                -> Route-reachability test passed (333 assertions) (exit 0)
GREEN: node scripts/test-install-model-rendering.js           -> Install model rendering tests passed (exit 0)
GREEN: node scripts/simulate-workflow-walkthrough.js          -> Workflow walkthrough simulation passed (exit 0; testAxiomBlockByteIdentity: PASSED)
GREEN: node scripts/test-opencode-edition.js                  -> opencode-edition test passed (516 assertions incl. A27) (exit 0)

## GREEN (R1 repair verification)
GREEN: node scripts/sync-opencode-edition.js --write          -> regen OK; .opencode/command/workflow-next.md scout paragraph reads cleanly (no empty span, no false install.sh/placeholder sentences)
GREEN: node scripts/test-opencode-edition.js                  -> opencode-edition test passed (516 assertions) (exit 0) [A27 now catches the mangled residue]
GREEN: node scripts/generate-routing-surfaces.js --check      -> all 12 surfaces byte-match the skeleton (exit 0)
GREEN: node scripts/validate-script-sync.js                   -> in sync (exit 0) [sync-opencode-edition.js edit did not perturb any byte-mirror]
GREEN: node scripts/test-route-reachability.js                -> passed (exit 0)
GREEN: node scripts/simulate-workflow-walkthrough.js          -> Workflow walkthrough simulation passed (exit 0)
GREEN: node scripts/test-install-model-rendering.js           -> Install model rendering tests passed (exit 0)

## what was pinned / to which files (6 of the 9 write-set paths edited)
(1) Scout dispatch pin — scripts/validate-workflow-contracts.js (+ byte-mirror
    plugins/kaola-workflow/scripts/validate-workflow-contracts.js, identical bytes). workflow-next.md
    is NOT in phaseCommands so assertEveryDispatchHasModel never scans it; added an explicit pin
    mirroring the fixed-dispatch pattern (~:813-814): assertIncludes('commands/workflow-next.md',
    'the governed issue-scout tier') + assertIncludes(..., 'model="{ISSUE_SCOUT_MODEL}"'). Byte-mirror
    verified by validate-script-sync.js (green).
(2) Manifest tier assertions — scripts/test-install-model-rendering.js. Higher-profile manifest block:
    assert(manifest['issue-scout'] === 'opus', ...) (proves profiles/higher/issue-scout.md model:opus
    lands under --profile=higher). Common-profile block: assert(manifest['issue-scout'] === 'sonnet',
    ...) (proves the base sonnet tier under --profile=common).
(3) Axiom byte-identity drift guard — scripts/simulate-workflow-walkthrough.js. New self-contained
    scenario testAxiomBlockByteIdentity (registered in buildRegistry): asserts templates/axioms.md
    opens with '## First Principles' (blanked-file false-green guard) AND is embedded byte-identically
    (via `.includes(axioms)`) in all SIX workflow-init CLAUDE.md surfaces (3 commands + 3 SKILLs). Any
    future divergence in the canonical file OR any embed reds under npm test.
(4) test-route-reachability.js — added a proactive #634-style sanity spot-check for the new
    nx-first-principles block: block exists, obligates all 6 next surfaces (both/both), and its
    distinctive tokens are not vacuous substrings of its own marker (#637 lesson — a correctness class
    the manifest presence-check does NOT cover) + templates/axioms.md exists. 329 -> 333 assertions.
(6) test-opencode-edition.js — after `node scripts/sync-opencode-edition.js --write` regenerated the
    gitignored .opencode/command/* : added A25 (axiom pointer 'First Principles axioms' + tighten-only
    clause propagate into .opencode/command/workflow-next.md) and A26 ({ISSUE_SCOUT_MODEL} placeholder
    must NOT leak — the sync transform strips it; verified grep -rc ISSUE_SCOUT_MODEL .opencode == 0).
    512 assertions green (516 after the R1 repair below).

## R1 repair (reviewer gate — write-set widened to include scripts/sync-opencode-edition.js)
Defect: A26 checked only the placeholder TOKEN absence, which green-lit a MANGLED scout paragraph on
the generated opencode surface — the generic {X_MODEL} strip (sync-opencode-edition.js) left an empty
inline-code span plus two sentences FALSE for opencode (no install.sh render step, no placeholder in
view). Two-file fix:
  - scripts/sync-opencode-edition.js — added a paragraph-level rewrite (placed with the 3 existing
    ~L337-355 paragraph rewrites, BEFORE the generic {X_MODEL} strip) that replaces the whole scout
    sentence with opencode-true wording: "Dispatch the read-only issue-scout agent; its effort variant
    resolves centrally from `opencode.json` — the governed issue-scout tier." No empty code span, no
    false install.sh/placeholder prose; provenance-free; opencode-only (never touches canonical).
  - scripts/test-opencode-edition.js — tightened with A27: asserts NO empty "Dispatch it with ``"
    span, NO "renders this placeholder"/"router itself never substitutes it" sentences, AND the clean
    opencode-true rewrite is present. Proven load-bearing (RED above catches the exact residue).

## (5) cross-edition parity decision — NO edit to the 3 edition contract validators
The codex/gitlab/gitea contract validators need NO new pin, and adding one would be redundant or
wrong. Reasons: (a) agent counts stay 16 (issue-scout already registered; only its higher-profile
FILE is new, and that is a CLAUDE-only install artifact — no plugins/*/profiles/higher tree exists —
guarded by the install-rendering manifest test, not a contract validator); (b) the {ISSUE_SCOUT_MODEL}
placeholder is CLAUDE-command-only by design (install.sh renders {X_MODEL} in commands only) — codex
skills dispatch the scout via PROSE, and grep confirms 0 occurrences in every plugin skill, so pinning
it in an edition validator would forbid the correct state; (c) the #645 axiom pointer's six-surface
propagation is already centrally machine-enforced by required-blocks.js (nx-first-principles) +
test-route-reachability.js, which read every edition tree; (d) each edition validator's generic
"every agent .md/.toml has a dispatch table / [agents.*] entry" guard already auto-covers issue-scout.
The claude-side has no higher-profile issue-scout FILE pin to mirror (the 869-877 array is
finding-emission reviewers only). All three edition validators pass green with n5's changes present.

## write-set containment
7 tracked write-set files modified (the 2 validators #1/#2, test-install-model-rendering.js,
simulate-workflow-walkthrough.js, test-route-reachability.js, test-opencode-edition.js, and — after
the R1 write-set widening — scripts/sync-opencode-edition.js); the 3 edition
contract validators intentionally untouched (allowed, not required). No file outside the 9-path set
was touched (commands/workflow-init.md restored byte-exact via git checkout; .opencode/* is gitignored
/ barrier-invisible). n5's 8 next-topic files remain as the baseline carried them.
