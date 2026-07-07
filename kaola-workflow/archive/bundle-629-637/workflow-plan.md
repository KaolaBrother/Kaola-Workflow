# Workflow Plan — bundle-629-637

<!-- plan_hash: c51e09f7aa805c9f0a6cae9e8065bcf654c0560f77e1c9a4eb041215bb89928c -->

## Meta
speculative_open_policy: auto
goal: use kaola-workflow skills to finish all issues; delegate subagents as the workflow demands; all reviewer subagents use fable
labels: area:scripts, area:routing
validation_command: npm test

Bundle of two DISJOINT, diagnosed guard-hardening fixes with genuinely-independent write areas, so the
two implement nodes are authored as an ANTICHAIN (a `parallel_safe` write lane group). Both are DIAGNOSED
build work (each issue body + roadmap next-step carries exact file locations and a prescribed fix
direction), NOT a shape-first investigation. Correctness is the driver (precedence #1): both fixes are
guard hardening whose failure mode is a VACUOUS-GREEN GUARD (a guard that passes while not actually
catching the drift it exists to catch) — #637 IS literally that bug (a content_token that is a substring
of its own marker, so a marker-preserving interior gut stays green), and #629 adds three fences to the
cross-edition guard net whose whole value is that a planted drift ACTUALLY reds a chain. That failure
class is exactly the kind a diff-reading reviewer (dispatched at the weak `fable` tier per the standing
directive) can rubber-stamp, so a read-only `adversarial-verifier` that empirically RUNS the plants/
missing-mirror repros against the LIVE guards ("does the planted drift genuinely red, or is the guard
still vacuous-green?") is a non-redundant gate. Both fixes touch the cross-edition guard/chain surfaces
(`validate-script-sync.js` runs in claude+codex; `edition-sync.js --check` runs in gitlab+gitea;
`test-route-reachability.js` + the routing manifest govern all-edition finalize surfaces) ⇒ the #307
four-chain obligation binds at finalize.

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model | non_tdd_reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| n1-guards | tdd-guide | — | scripts/validate-script-sync.js, scripts/edition-sync.js, scripts/test-validate-script-sync.js, scripts/test-edition-sync.js | 4 | sequence | standard | — |
| n2-manifest | tdd-guide | — | templates/routing/required-blocks.js, scripts/test-route-reachability.js | 2 | sequence | standard | — |
| n3-review | code-reviewer | n1-guards, n2-manifest | — | 1 | sequence | reasoning | — |
| n4-adversary | adversarial-verifier | n3-review | — | 1 | sequence | reasoning | — |
| n5-docs | doc-updater | n3-review | docs/decisions/D-629-01.md, docs/decisions/D-637-01.md, docs/conventions.md | 3 | sequence | standard | — |
| n6-finalize | finalize | n4-adversary, n5-docs | CHANGELOG.md | 1 | sequence | — | — |

## Plan Notes

- **Lane-group shaping (n1 ∥ n2), NOT scope-widening.** The two fixes touch genuinely-disjoint files:
  #629 lives in the build-guard family (`validate-script-sync.js` + `edition-sync.js` + their two test
  surfaces `test-validate-script-sync.js` / `test-edition-sync.js`); #637 lives in the routing manifest
  (`templates/routing/required-blocks.js` + its checker/self-test `test-route-reachability.js`). They are
  an ANTICHAIN (NO dep edge between them) so the validator DERIVES `parallel_safe` and the scheduler
  co-opens them as isolated per-leg worktrees BY DEFAULT (`parallelWritesDefaultOn`). They are
  EXACT-FILE-disjoint (all exact paths, no directory/glob token — verified no exact-file overlap: #629's
  four `scripts/*.js` + #637's `scripts/test-route-reachability.js` share NO filename), so the antichain
  inferred-disjointness check passes: no exact-file overlap, no barrier-invisible allowband collision
  (`CHANGELOG.md` is kept off both legs — on the finalize sink — and the two ADRs + conventions.md are on
  n5, a downstream serial node, not a co-leg), and no PROTECTED file in either set. Both legs sharing the
  `scripts/` AREA is fine — the #593/#546-G2 shared-infra + coarse relaxations co-open exact-file-disjoint
  legs BY DEFAULT under the retained net (NET-1 = the n3 code-reviewer gate post-dominates both legs;
  NET-2 = neither leg carries a PROTECTED file). Parallelism is a means, not a goal (precedence #3): it is
  used here ONLY because the work genuinely decomposes into disjoint files. NEVER hand-add `parallel_safe`
  — it is validator-derived. The #633 tracked-evidence-seeding fix has shipped and been validated in
  production, so a two-write-leg lane group is safe to author (legs merge to `group_passed` with no manual
  pre-seed).
- **n1-guards (tdd-guide, standard) — #629 three edition-guard blind spots, RED-first per AC bullet.**
  Each bullet gets a planted-drift / missing-mirror test that reds BEFORE its fix, so a partial fix cannot
  pass green:
  - **Bullet 1 (hooks.json family parity).** `scripts/validate-script-sync.js:40-41` EXCLUDES
    `hooks/hooks.json` on the obsolete rationale "each forge points at its own compact-context script
    name" — but that is exactly what the existing `normalizeConfigHooks` (`:337`) rename-normalization
    already solves for the sibling `config/hooks.json` family. Verified this run: the ONLY diff between
    root `hooks/hooks.json` and the gitlab/gitea copies is the single compact-context token
    (`kaola-workflow-compact-context.js` → `kaola-{forge}-workflow-compact-context.js`). Fix: add a
    HOOKS_JSON_FAMILY entry (root reference + gitlab + gitea ports) MIRRORING CONFIG_HOOKS_FAMILY,
    normalized by that same compact-context token rewrite; update the stale exclusion comment. The three
    `hooks/hooks.json` files are ALREADY in normalized parity (verified) — the fix is guard CONFIG only,
    so NO write to the hooks.json data files. RED test in `test-validate-script-sync.js`: plant a new
    PreToolUse matcher into a root-copy fixture without the forge copies → validate-script-sync reds.
  - **Bullet 2 (config/agents.toml byte parity).** All three `plugins/*/config/agents.toml` are
    byte-identical at HEAD (md5 verified `579c8575…`), yet no BYTE_IDENTICAL_GROUPS entry covers them —
    only derived NAME parity is checked by the forge validators. Fix: add the three files as a
    BYTE_IDENTICAL_GROUPS entry (green at HEAD since already identical; `edition-sync --write` then
    auto-syncs a future canonical edit). NO write to the toml data files (already identical). RED test in
    `test-validate-script-sync.js`: plant a divergent `developer_instructions` byte into one copy fixture
    → validate-script-sync reds.
  - **Bullet 3 (edition-sync --write create-on-missing).** `scripts/edition-sync.js` steps (b) codex-sync
    (`~:174`) and (c) byte-sync (`~:188`) copy ONLY when the target already `fs.existsSync(...)`, so a
    newly-enrolled COMMON script or byte-group member with an ABSENT mirror is skipped as "tree already in
    sync" while `validate-script-sync` reds with "Missing files" — the documented remedy
    (`npm run sync:editions`) is a dead end for the enrollment workflow it exists to automate. Fix: drop
    the `existsSync` guard in steps (b) and (c) (create-on-missing, matching the aggregator step (a) which
    already handles the missing case correctly). RED test in `test-edition-sync.js` (currently has NO
    missing-mirror coverage — verified `grep existsSync|missing` = 0): enroll a synthetic byte-group /
    COMMON member with an absent mirror, run `--write`, assert the mirror is CREATED (not skipped).
  - `standard` because all three are mechanical implementation against a written spec (exact line numbers +
    an established in-repo precedent — `normalizeConfigHooks` for bullet 1, the aggregator create-on-
    missing step for bullet 3); the reasoning-tier n3/n4 gates are the safety net.
  - **Edition scope of #629 (verified — all four files are ROOT-ONLY).** `validate-script-sync.js` and
    `edition-sync.js` have NO codex twin and are NOT in COMMON_SCRIPTS / GENERATED_AGGREGATORS (the
    aggregator list is the five adaptive scripts only) — so NO `generated_port_split` and NO forge-port
    mirror obligation. `test-validate-script-sync.js` and `test-edition-sync.js` are CLAUDE-ONLY root
    tests (not in any sync family). The `hooks/hooks.json` triple and the `config/agents.toml` triple are
    the DATA the new guards assert on, not files this node rewrites (already in parity), so they are NOT
    declared. The walkthrough is NOT declared: `simulate-workflow-walkthrough.js` does NOT assert on
    validate-script-sync's summary/group-count output (verified `grep -c` = 0), so adding a family/group
    does not force a walkthrough edit.
- **n2-manifest (tdd-guide, standard) — #637 fn-closure-audit vacuous-guard fix, RED-first.** In
  `templates/routing/required-blocks.js` the `fn-closure-audit` block carries content_tokens
  `['<!-- PIN: closure-audit -->', 'closure-audit']`; the second token is a SUBSTRING of the first (the
  marker itself), so a mutation that guts the block's interior prose while surgically preserving the bare
  `<!-- PIN: closure-audit -->` marker stays GREEN. Fix: add a DISTINCTIVE interior content_token that is
  NOT a marker substring. Chosen token: **`sink_incomplete`** — VERIFIED present on ALL SIX finalize
  surfaces this run (`commands/kaola-workflow-finalize.md` + the gitlab/gitea command twins + the three
  `plugins/*/skills/kaola-workflow-finalize/SKILL.md`), so it does not re-introduce the same vacuous-guard
  bug by obligating a token that is missing on some surface. RED test in `scripts/test-route-reachability.js`
  (modeled on the existing T3-style RED-PROOF over a synthetic manifest + fixture surfaces): a plant that
  GUTS the closure-audit interior (removes the `sink_incomplete` prose) while KEEPING the
  `<!-- PIN: closure-audit -->` marker must now red the derived-universe checker (it currently stays
  GREEN — that IS the bug). `tdd-guide` because this is genuine test-first: the gut-plant assertion is the
  acceptance oracle and it fails RED before the token lands. `standard` tier; n3/n4 are the net.
  - **Edition scope of #637 (verified — both files are ROOT-ONLY).** `templates/routing/required-blocks.js`
    and `scripts/test-route-reachability.js` are single-copy root files (no forge port, no byte mirror —
    parity with the issue-630 layout). The manifest content_token governs finalize surfaces ACROSS all
    editions (the checker reads all six from the root repo), which is why the bundle is #307. Keep the
    change forge-neutral: `sink_incomplete` is an existing edition-neutral token already on all six
    surfaces (no new CLI-binary / forge-brand token introduced).
- **n3-review (code-reviewer, reasoning) — post-dominates BOTH code nodes n1 and n2 (G1) and is NET-1 for
  the lane group.** `reasoning` (authored intent; the executor applies the standing model=fable override
  on dispatch) because the review must confirm the accuracy-critical properties a weak reviewer would miss:
  (a) #629 bullet 1's HOOKS_JSON_FAMILY correctly normalizes the compact-context token per forge (parity
  green at HEAD, planted drift reds); (b) the agents.toml byte-group is green at HEAD and its planted-drift
  test reds; (c) the edition-sync `existsSync` drop actually CREATES a missing mirror (matching step (a))
  without regressing the modified-existing case; (d) #637's `sink_incomplete` is genuinely present on all
  six finalize surfaces and the gut-plant red-proof actually reds; and (e) each RED test genuinely fails
  PRE-fix (not a vacuous green assertion — the meta-risk of a guard-hardening task). Runs
  `validation_command` (`npm test` — the four chains, run SEQUENTIALLY; the #307 cross-edition obligation
  since the diff touches `edition-sync.js --check` in the gitlab/gitea chains and the all-edition finalize
  manifest).
- **n4-adversary (adversarial-verifier, reasoning) — read-only with Bash; the change gate on this
  vacuous-guard-risk diff.** RUNS the plants/repros against the LIVE guards: independently plants
  hooks.json / agents.toml drift and confirms `validate-script-sync` reds (not vacuous-green); enrolls a
  missing mirror and confirms `edition-sync --write` CREATES it; guts the closure-audit interior on the
  real finalize surfaces (marker kept) and confirms `test-route-reachability.js` reds — asking "guard
  genuinely catches drift, or symptom-masked green?" This is non-redundant with n3 (diff-reading) and with
  a single four-chain pass, and it is the direct analogue of the #630 adversary that SURFACED #637's own
  bug. Sole unsatisfied dep is the n3 gate ⟹ speculative-open-eligible under `auto` (read node,
  keep-or-discard on a `fail`).
- **n5-docs (doc-updater, standard) — the two NEW decision records + the conventions guard-net note.**
  `docs/decisions/D-629-01.md` (next free id — verified NO existing `D-629-*` on disk) records the
  cross-edition guard-net expansion: `hooks/hooks.json` triple is now rename-normalized parity-guarded,
  the `config/agents.toml` triple is byte-guarded, and `edition-sync --write` creates missing enrolled
  mirrors (closing the enrollment-remedy dead end). `docs/decisions/D-637-01.md` (next free id — verified
  NO existing `D-637-*`) records that `fn-closure-audit` now carries a distinctive non-marker-substring
  interior token, closing the marker-preserving-interior-gut residual explicitly called an accepted
  Non-goal in `D-630-01 (existing)`. `docs/conventions.md` gets a one-line addition under the cross-edition
  validation-policy section noting hooks.json + agents.toml are now parity-guarded families (under-write
  with a skip-reason if the existing generic prose already covers it — barrier-safe). `standard` (NOT
  haiku — haiku fabricates schema/records). Exactly-resolvable write set, NO protected file (CHANGELOG is
  on the sink), sole dep is the n3 gate ⟹ speculative-open-eligible behind n3; disjoint sibling of n4
  (n4 writes nothing) so it overlaps the adversarial gate for free.
- **n6-finalize (finalize) — unique docs/state sink; writes ONLY `CHANGELOG.md`** (`[Unreleased]`, one
  entry covering both #629 guard-net hardening and #637 finalize-manifest token). Depends on BOTH
  n4-adversary AND n5-docs so finalization is provably impossible until the adversarial guard-genuineness
  gate passes AND the ADRs land. The #307 four-chain obligation is discharged here (all four
  `npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains green, run SEQUENTIALLY, recorded before
  the sink); #635 is fixed as of `73ca26db`, so attempt a CLEAN UNWAIVED receipt first — fall back to a
  waiver only if a genuinely-unrelated red appears (never for a chain this bundle is meant to keep green).
- **No security-reviewer (G2)**: neither leg's write set matches a sensitive pattern (no
  auth/token/secret/session/crypto/network/`.env`/CI path — the guard/manifest/test/doc files are inert),
  and the frozen labels (`area:scripts, area:routing`) carry no security sensitivity ⇒ G2 does not fire.
  **No main-session-gate (G3)**: acceptance is FULLY machine-checkable — the RED-first planted-drift /
  missing-mirror / gut-plant tests, the adversary's live repros, and the four chains; there is no
  GPU/visual/device/human-signoff hinge. **No knowledge-lookup**: every fact is confirmable in-repo (the
  `normalizeConfigHooks` precedent, the `edition-sync` aggregator create-on-missing step, the
  `sink_incomplete` presence on all six finalize surfaces, the `fn-closure-audit` token definition). **No
  planner/code-architect node**: both fixes are DIAGNOSED with exact locations and prescribed directions —
  a settled build DAG, not a shape-first investigation.

## Node Ledger

| id | status |
| --- | --- |
| n1-guards | complete |
| n2-manifest | complete |
| n3-review | complete |
| n4-adversary | complete |
| n5-docs | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n2-manifest) | subagent-invoked | deferred_to_group | |
| tdd-guide (n1-guards) | subagent-invoked | group_passed | |
| code-reviewer | subagent-invoked | evidence-binding: n3-review 7ab4b4349e79 | |
| adversarial-verifier (n4-adversary) | subagent-invoked | evidence-binding: n4-adversary 334555f61c9d | |
| doc-updater (n5-docs) | subagent-invoked | evidence-binding: n5-docs 5d431fe5f80a | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 88399f484844 | |
