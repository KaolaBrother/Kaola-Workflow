# Fable coverage & regression sweep — bundle 881/882/883/884/885

role: adversarial-verifier (coverage/regression member)
candidate: uncommitted worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-881-882-883-884-885` (116 files, +3239/−2872, 2 deletions)
claim under test: the bundle is complete — nothing missed, nothing broken, docs true against code
method: read-only diff + tree inspection; no suites, validators, or npm scripts executed (per dispatch constraint); every sweep named `.opencode* .kimi* .agents` explicitly (ugrep skips dot-dirs; rg absent)

## Verdict

domain_outcome: refuted
claim_outcome: refuted

The completeness claim breaks on four concrete counterexamples (C1–C4 below). None is
ships-broken-today and none should red a chain after commit — the top two are a doc-vs-code
contradiction the bundle created with its own two hands, and a guard hole inside #883's own
subject. Confidence: high on every cited fact (each verified against the tree, not a diff hunk);
the no-chain-red prediction is reasoned, not executed, per the no-run constraint.

## Findings (new — none appears in the dispatch's known list or in sibling evidence)

finding: id=C1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=deferred-suite count contradiction: package.json fast gate now runs test-release.js (#881 bullet says so) so full-minus-fast is THREE, but docs/architecture.md:336 (edited BY this bundle to "four non-samplable suites are deferred whole") and docs/conventions.md:303 (untouched; "Four are deferred whole — test-claim-hardening, test-sink-merge, test-release, test-run-chains") both still say four and name test-release as deferred
finding: id=C2 scope=in_scope action=fix status=open severity=medium fix_role=tdd-guide rationale=#883 rearm left the LIVE restriction axis unguarded: generators now emit bash-deny for 3 roles (.opencode/agent/{code-explorer,knowledge-lookup,planner}.md:5 `bash: deny`; 3 kimi skills carry "may not run shell commands") but test-opencode-edition.js guards only the EMPTY edit axis (A3/A3-domain, :161-201) and test-kimi-edition.js has zero restriction assertions — a PERMISSION_AXES/restrictionNote predicate regression ships 3 roles with shell access on two runtimes, both suites green ("the emitter was fine; the predicate was the defect" is this bundle's own diagnosis); corroborating: restrictedRoles() added+exported "for inspection" (sync-kimi-edition.js:184,830) with ZERO consumers — the test hook landed, its test did not
finding: id=C3 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=edition docs describe retired reviewer-resolution machinery as LIVE, in lines this bundle edited: docs/kimi-edition.md:126-130 ("At runtime reviewerProfilePath resolves ... review-gated plan ... hard-refusing review_profile_unavailable") and :358-362 (K9 listed as a live test; test-kimi-edition.js:852 marks K9 RETIRED WITH ITS RESOLVER); docs/opencode-edition.md:78-88 same class; reviewerProfilePath / resolveReviewerProfileIdentity / detectReviewRuntime exist in NO production script (verified worktree AND HEAD); present-tense comment residue: sync-opencode-edition.js:66,:225; test-opencode-edition.js:316
finding: id=C4 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=half-corrected line: docs/kimi-edition.md:332 edited 15→14 roles but "exactly 5 command skills" left on the SAME line (actual: 3; K1 derives so the suite is green); :44 "(5 commands)" and "the canonical Path Intent section is stripped" both stale (canonical carries no Path Intent section — the strip's subject is gone)
finding: id=C5 scope=in_scope action=fix status=open severity=low fix_role=doc-updater rationale=roster-count stragglers in files this bundle edited: install-kimi.sh:24 comment "all 15 kaola-role-* skills" (operative glob is fine), sync-kimi-edition.js:20 "The 15 canonical roles", test-kimi-edition.js:90 example names retired kaola-workflow-adapt.md — everything else says 14

## Category accounts

### 1. Deletion fallout — CLEARED (with the survivors accounted for)

Swept `reviewer-conformance-fixtures` and `runtime-lexicon|lexicon-parity` over the full tree
plus `.agents .kimi .kimi-gitea .kimi-gitlab .opencode .opencode-gitea .opencode-gitlab`.
Every survivor is deliberate: docs/conventions.md:311 ("Nothing currently enforces this" + recovery
pointer), docs/decisions/0017:134 (watch-list row), CHANGELOG history entries, the
measure-site-execution.js:277 trailing-newline anecdote, test-kimi-edition.js:253 retirement note,
and frozen archives/census (`prose-census-baseline.json` is a snapshot at 83e17e97 — retired tokens
persisting there is its design). Recovery hash `b3bc7acf` verified: is a commit and contains both
deleted files. The four known second-order breaks (package.json ×2 chains, test-kimi require,
drivers.txt, docs) are all fixed in this tree. `reviewer-conformance-fixtures.json` had ZERO live
textual consumers even at HEAD outside archives — an orphan data file; its deletion is clean by
construction. Bonus: test-suite-registration.js gains the reverse-direction guard (G) so a future
dangling `node <path>` invocation in ANY npm script reds the chain.

### 2. Cross-edition — CLEARED (mechanical vs. remembered established)

- Mechanically policed and verified here: `cmp` byte-identity claude↔codex for
  kaola-workflow-release.js, kaola-workflow-sink-merge.js, validate-workflow-contracts.js,
  kaola-workflow-run-chains.js, kaola-workflow-claim.js — all IDENTICAL. gitlab/gitea
  release ports are edition-sync GENERATED_AGGREGATORS; #881 carry-over needle present in all
  four release scripts. Kernel untouched, byte-identical ×4, export count 55 (matches the #880
  claim; docs/api.md kernel-symbol mentions all resolve to live code).
- Hand-maintained and all moved: the three per-edition contract validators (#882 ban+anchor in
  each); the forge walkthroughs (lane-group scenarios deleted in all three; zero `lane_group`
  survivors in scripts/ or plugins/ outside the frozen census).
- `.opencode*`/`.kimi*` trees are UNTRACKED generated artifacts (git ls-files = 0; .gitignore:5-10)
  and were regenerated: they carry the new "next useful entry point" phrase and the new behavior
  contract hash cf46d80d… byte-equal across canonical agents/, 3 plugin toml sets, and all 6
  dot-dir trees. Zero `domain_outcome|gate_mode|gate_effect|execution_status|Domain receipt`
  residue on any rendered reviewer surface.
- #884 verified: all three Codex init SKILLs end with the `kaola-workflow-next` route; the
  MultiAgentV2/Codex operator note is gone from the claude command surfaces and survives on the
  Codex SKILL surfaces where its commands resolve.
- #881 coherence: `evaluateReleaseReceipt` lives in the unchanged kernel with exactly the shape
  `receiptBindsTo` consumes (refusal payload spreads `carryOver.failed` to top level,
  adaptive-schema.js:1515-1666); run-chains.js:823 calls the same function; chainCheck now
  delegates whole and binds `chainHeadSha` from the carry-over receiptSha.
- #882 verified: five manifests (github claude manifest genuinely absent — floor ≥5 correct)
  all carry `adaptive` + `mission list`, none trips the new bans; marketplace.json is prose-free.

### 3. Test/mechanism pairing — CLEARED except C2

`lingeringLaneGroupRefusal` (#552/#561) deleted from all four sink-merges WITH its walkthrough
scenarios in all three editions — deleted together, never repaired ahead. The lexicon suite was
deleted with a watch-list row and an explicit "nothing enforces this" doc note — the correct
posture for a guard with an empty subject. No surviving test pins a gone mechanism. The one
orphaned mechanism-side hook is restrictedRoles() (C2).

### 4. Prose-pass truth — TWO REAL MISSES (C1, C3/C4), remainder verified TRUE

Verified true against code: README six→twelve init surfaces (matches the rearmed
testAxiomBlockByteIdentity: 3 forges × (2 + 2 sync generators) = 12, anti-vacuity width derived
independently); 15→14 role TOMLs; three→four runtimes; conventions.md 18-surface claim (3 topics ×
6 trees); .env.example's own new rule holds — all 18 KAOLA_* vars documented there have readers;
retired-DAG lexicon (workflow-plan.md / running-set / lane group / role node / review-gated) is
ABSENT from every prompt surface and survives in docs only as past-tense retirement records.
docs/README.md:35-38 supersession note is accurate.

### 5. Half-landed work — ONE HIT (inside C2), rest clean

Orphan scan over added functions in the 8 most-changed scripts: only `restrictedRoles` has zero
call sites. All symbols the rearmed guards call exist and are exported (TOPICS, FORGES,
commandSurfacesForForge; outDirs/renderCommand opencode; skillRel/renderCommand kimi — signatures
match call sites). assertNoBadgeResidue IS invoked in both render paths (opencode:524, kimi:500).
KAOLA_PARALLEL_WRITES echo removed from all three installers and the token is extinct tree-wide.
active-folders rearm: no bumpable count survives; key-set equality + serialized-probe design is
sound as read.

### 6. Residual judgments

- init.skeleton REGION pair: the command-side reason names a real capability (argument channel);
  the skill side is its declared complement. Internally consistent; correctly scoped.
- `receipt_contract.domain_outcomes` internal name: confined to behavior-contracts.json and
  generate-reviewer-profiles.js exactKeys (:354-358); zero leakage into rendered surfaces
  (verified over all 9 runtime trees). Correctly scoped.
- Three dead strips kept in the sync scripts: consistent in code (absence asserts remain
  anti-reintroduction pins) but UNDER-SCOPED in docs — kimi-edition.md:44 still narrates the Path
  Intent strip as doing work whose subject left canonical (folded into C4).
- Lexical-only contradiction check: generate-reviewer-profiles.js:233-242 states its boundary
  honestly; the heading blind spot is already sibling finding R1 (fable-guards.md); nothing further.

## Blast-radius ranking

1. C2 — a guard hole inside the guard-rearmament issue's own scope (silent capability grant on
   regression, two runtimes, both suites green).
2. C1 — the bundle's own left and right hands disagree about the testing contract (docs say four
   deferred incl. test-release; package.json + FULL_ONLY say three).
3. C3 — user-facing edition docs assert refusals and resolvers that no longer exist anywhere.
4. C4/C5 — user-facing counts wrong by ~2× / stale comments; cosmetic.

Nothing found in the ships-broken-to-user or breaks-a-chain classes.

---

## Execution round (embargo lifted)

Everything below was RUN, not reasoned. Exit codes captured directly; mutations verified as
applied in the regenerated trees before reading the suite result. Worktree untouched — all
mutations and installs on a scratch mirror / scratch HOMEs.

### Finding status after the mid-flight repairs

- C1 — RESOLVED in tree: docs/architecture.md:336 now "three non-samplable"; docs/conventions.md:303
  now lists three and records the #881 promotion.
- C2 — OPEN, now MUTATION-PROVEN on both runtimes:
  * opencode: deleted the bash row from PERMISSION_AXES on the mirror → regenerated tree carries
    ZERO `bash: deny` (mutation demonstrably applied; code-explorer/knowledge-lookup/planner ship
    with shell access) → `test-opencode-edition.js` exit 0, 481/481 — same count as baseline.
  * kimi: forced restrictionNote() to return '' → regenerated tree carries ZERO "Tool restriction"
    lines → `test-kimi-edition.js` exit 0, 490/490 — same count as baseline.
  Both suites are green over the exact regression they exist to catch. restrictedRoles() called
  directly: returns exactly {code-explorer, knowledge-lookup, planner} — functional, consumerless.
- C3 — NARROWED: both edition docs are clean now; surviving residue is three present-tense comments —
  sync-opencode-edition.js:66, :225 and test-opencode-edition.js:381 ("can bind" / "refuses with
  review_profile_identity_unavailable, hard-blocking") describing the retired resolver as live.
- C4 — RESOLVED (kimi-edition.md:44 now "(3 commands)"; the "exactly 5 command skills" line is gone).
- C5 — RESOLVED except one cosmetic: test-kimi-edition.js:90 example comment still names retired
  `kaola-workflow-adapt.md`.

### Suites executed (all exit 0)

- Deferred-whole tier (never run by the chains): test-sink-merge 170, test-claim-hardening 464,
  test-run-chains 238 assertions.
- Edition suites (scratch mirror, baseline): test-opencode-edition 481, test-kimi-edition 490.
- Post-repair guard re-runs in the worktree (the chains ran BEFORE the mid-flight repairs to
  generate-reviewer-profiles.js and the docs, so these needed a fresh run): generate-reviewer-profiles
  --check PASS; test-agent-profile-parity 768; validate-workflow-contracts PASS;
  validate-kaola-workflow-contracts PASS; generate-routing-surfaces --check (18 surfaces byte-match);
  test-generate-routing-surfaces 430; test-route-reachability 325; test-suite-registration 472;
  validate-script-sync PASS (4 kernel copies identical at HEAD); test-validate-script-sync 59;
  edition-sync --check (8 aggregator ports in parity); test-edition-sync 30; validate-vendored-agents
  14 agents; test-active-folders-field-parity 119.

### Fresh-install integrity (scratch HOMEs, mirror as source — all exit 0)

- install.sh --forge=github: 3 commands + 14 agents into scratch ~/.claude; zero `{X_MODEL}`
  placeholder residue; zero retired grammar in installed prompts; all 14 agents `model: inherit`
  (by design).
- install.sh --forge=gitea: 3 commands + 14 agents + kaola-workflow-gitea support tree with 12
  renamed `kaola-gitea-*` ports installed.
- install-opencode.sh --target: 14 agents + 3 commands; the 3 `bash: deny` restrictions PRESENT in
  the installed tree.
- install-kimi.sh --target: 17 skills (3 command + 14 role); the 3 "Tool restriction" lines PRESENT.
- 34 installed support scripts: node --check 0 failures; require-load smoke (offline) 0
  ReferenceError/SyntaxError/module-not-found.

### Module export-call sweep (TDZ hunt)

12 call groups over the changed library modules — sync-kimi-edition (restrictedRoles, skillRel,
renderCommand), sync-opencode-edition (outDirs, renderCommand, deniedPermissionAxes),
generate-routing-surfaces (commandSurfacesForForge ×3 forges), generate-reviewer-profiles (ROLES),
run-chain-pool, templates/routing/slots.js, validate-script-sync (renameNormalize), edition-sync —
no ReferenceError, no TDZ.

### Residue found in the MAIN checkout (not the worktree)

`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw-probe-twin.js` — untracked, 54KB, byte-identical to
main's scripts/validate-workflow-contracts.js, mtime during this execution round. No script anywhere
contains the string `kw-probe-twin`, so an agent wrote it by hand as a relocation probe and left it.
Harmless but it sits at the main checkout root; it should be deleted deliberately by whoever owns it.

### Correction on my own harness

One intermediate readout showed generate-routing-surfaces --check and edition-sync --check exiting 1;
both pass standalone. The reds were my zsh unquoted-variable trap (`node scripts/$s` with flags in
$s — zsh does not word-split, node got a filename with a space). The tree was never red.

### Updated verdict

domain_outcome: refuted (unchanged in kind, narrowed in scope)
The bundle plus mid-flight repairs now clears C1/C4/C5. What remains open and proven:
C2 (both edition suites green over the killed restriction emission — run-proven, not reasoned)
and the C3/C5 comment residue (three present-tense comments + one stale example). Every suite,
validator, installer and export in scope executes green on the current tree; fresh installs are
intact on all four runtimes.
