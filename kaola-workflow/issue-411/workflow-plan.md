# Workflow Plan — issue-411 (bundle #411, #412, #413)

<!-- plan_hash: 9b43839f7e3c6ed3529a407ce93bfbd734768213bded18ff2aa4c31b72248144 -->

## Meta
labels: bug, area:scripts, area:workflow-phases
issues: 411, 412, 413
sink: merge (worktree)
run_base: 46640c6

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape | model |
| --- | --- | --- | --- | --- | --- | --- |
| n1-fix-411-node | tdd-guide | — | scripts/kaola-workflow-adaptive-node.js, scripts/test-adaptive-node.js, plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js, plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js, plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js | 1 | sequence | opus |
| n2-fix-412-manifest | tdd-guide | n1-fix-411-node | scripts/kaola-workflow-install-manifest.js, plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js, scripts/test-install-manifest-single-source.js, agents/contractor.md | 1 | sequence | sonnet |
| n3-fix-413-toml | implementer | n2-fix-412-manifest | plugins/kaola-workflow/agents/workflow-planner.toml, plugins/kaola-workflow-gitlab/agents/workflow-planner.toml, plugins/kaola-workflow-gitea/agents/workflow-planner.toml, plugins/kaola-workflow/agents/contractor.toml, plugins/kaola-workflow-gitlab/agents/contractor.toml, plugins/kaola-workflow-gitea/agents/contractor.toml | 1 | sequence | sonnet |
| n4-prose-411-x6 | doc-updater | n3-fix-413-toml | commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md, plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md, plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md | 1 | sequence | sonnet |
| n5-review | code-reviewer | n4-prose-411-x6 | — | 1 | sequence | opus |
| n6-finalize | finalize | n5-review | CHANGELOG.md | 1 | sequence | — |

## Plan Notes

### Bundle shape rationale
Three independent post-v5.15.0 audit bugs (#411 / #412 / #413) bundled on one branch.
The three write-producing implement nodes (n1, n2, n3) and the prose node (n4) all touch
the forge plugin trees (`plugins/kaola-workflow-{gitlab,gitea}/...`), which the disjointness
classifier collapses to coarse-area `plugins` (non-shared-infra). Any two of them are therefore
a **coarse-area RED** overlap if run concurrently — so they are SERIALIZED as a plain `sequence`
spine (n1→n2→n3→n4), not a fan-out. This is correct: the coupling is real at the checker's
granularity, and ordering between the three issues is otherwise arbitrary. A single `code-reviewer`
gate (n5) post-dominates every code- and prose-producing node (G1), then `finalize` (n6).

### Model assignment (#382)
- **n1 = opus**: the #411 fix is a subtle root-cause across the fused-advance opener (Bug A: the
  #392 evidence-binding nonce omission) AND the close-side running-set / excl-batch coordination
  (Bug B: the unrepairable orphan wedge). Reasoning-bound; constrains correctness of every future
  serial-chain adaptive run.
- **n2, n3, n4 = sonnet**: each carries out an already-decided spec (manifest one-line add + unit
  test; byte-identical toml prose mirror; X6 prose propagation against a pinned canonical spec).
- **n5 = opus**: the reviewer is the strong gate over the cheap implementers — it must catch a
  half-mirrored cross-edition port, a forge-vocabulary leak into a toml, and a missed nonce
  derivation. Strong reviewer > strong implementer here.

### n1 — #411 fused-advance nonce + running-set/batch coordination (GENERATED_AGGREGATOR)
`scripts/kaola-workflow-adaptive-node.js` is a `GENERATED_AGGREGATOR` (edition-sync.js:46-56).
**Fix the CANONICAL `scripts/kaola-workflow-adaptive-node.js` ONLY, then run
`npm run sync:editions` to regenerate the 3 forge ports** — the codex port
(`plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`, byte-copied via COMMON_SCRIPTS)
and the two forge-renamed ports (gitlab/gitea). The ports carry a `@generated … do NOT hand-edit`
header; they MUST NOT be hand-edited — they are in the write set only because the regenerate step
lands them in the node diff and the barrier sees them. The S-RT test lives in the canonical
`scripts/test-adaptive-node.js` (not the ports). Verify with the four chains downstream; the
node should `node scripts/edition-sync.js --check` after regenerating.
- **Bug A**: surface `nonce` in the fused-advance `opened` payload inside `runCloseAndOpenNext`
  (~:1400-1414) using the SAME derivation as `open-next` (~:1098) and `open-ready` (~:2228 `opened[].nonce`).
- **Bug A test**: add an S-RT case to `scripts/test-adaptive-node.js` (the existing T14 family,
  ~:718+, exercises `runCloseAndOpenNext`) that drives the FUSED opener end-to-end — open-next n1 →
  close n1 (fused advance opens n2) → assert the returned `opened` payload carries a `nonce` → record
  n2 evidence bound to that nonce → close n2 succeeds. This is the exact false-green channel the
  current S-RTs (open-next→close, open-ready→close-node) never cover. **Write the failing test
  FIRST** (test-first / tdd-guide): assert the fused `opened.nonce` is present (RED on current code),
  then implement Bug A so it passes.
- **Bug B**: make `runCloseAndOpenNext` running-set / batch coordination-aware — when
  `running-set.json` lists the closing node, remove it (mirror `runCloseNode` step (e), ~:2337-2346)
  and suppress the fused advance (return `newlyReady`/`scheduler_active`-style instead of silently
  opening the next node serially while a sibling is still running); teach `reconcile-running-set`
  (or orient's repair pointer) the "in_progress ⊋ running-set" orphan direction so the repair
  converges instead of the `{reconciled:false, reason:not_opening}` no-op wedge. Add the excl-batch
  guard to `runCloseNode`'s guard matrix (~:2253) so it refuses closing an unsealed parallel-batch
  member.

### n2 — #412 install-manifest + contractor.md fallback probe
- `scripts/kaola-workflow-install-manifest.js`: add the single line `'kaola-workflow-ledger-compare.js',`
  to the `SUPPORT_SCRIPTS` frozen list (~:53-74). Forge-neutral — the canonical name exists in all
  three source dirs so the rename transform keeps it as-is; one entry covers all three forges.
- `plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js` is the BYTE-MIRROR of the
  canonical (validate-script-sync COMMON_SCRIPTS / validate-workflow-contracts.js require()s it).
  Mirror the same one-line add byte-identically. (Run `node scripts/validate-script-sync.js` after.)
- `scripts/test-install-manifest-single-source.js`: add a unit asserting
  `kaola-workflow-ledger-compare.js ∈ supportScripts(forge)` for all three forges
  (github/gitlab/gitea). **Write this assertion FIRST** (tdd-guide) — it is RED on the current
  manifest, GREEN after the one-line add. The AC literally asks for this manifest unit.
- `agents/contractor.md` (secondary, #412): extend the `kaola_script` fallback branch (lines 134 +
  169 — there are TWO copies of the helper) so it ALSO probes
  `~/.claude/kaola-workflow-gitlab/scripts/$_n` and `~/.claude/kaola-workflow-gitea/scripts/$_n` in
  the non-dogfood (`else`) branch, so `LEDGER_COMPARE_JS` resolves after a manual forge install, not
  only on github. Edit BOTH helper copies identically. **NOTE: `agents/contractor.md` is touched ONLY
  by #412** — re-reading #413, it edits `contractor.toml` (codex profiles), NOT `contractor.md`. The
  dispatched "known collision" does not materialize: the `.md` (n2) and the `.toml`s (n3) are disjoint
  files. No section-level attribution needed.

### n3 — #413 codex .toml profile parity (byte-identical mirror ×6)
The three `workflow-planner.toml` are byte-identical (one md5); the three `contractor.toml` are
byte-identical (one md5). This is a #309 "shared canonical spec, mirror VERBATIM" change — author
the new prose ONCE and copy it byte-identical across the three trees. `implementer`
(`non_tdd_reason: agent-profile prose mirror with no behavioral logic and no natural failing unit
test`). FORGE-NEUTRAL (#341): name no forge CLI (`gh`/`glab`) or brand — the tomls are edition-neutral.
- **workflow-planner.toml ×3**: append the #381 ("Declare EXACT file paths, never directories …
  SPLIT into sequenced same-role nodes") and #404 ("the one shape the freeze wall cannot catch — a
  bare token that becomes a directory by write-time; always declare the exact files a staged node
  will create") guidance. **Canonical spec = the corresponding `agents/workflow-planner.md` `## The
  grammar …` `FILE_CEILING` bullet (lines 82-97)** — mirror its substance, edition-neutral, so the
  three tomls gain the `write_set_granularity`/"directory" guidance they currently lack (zero
  occurrences today; the .md has 6). Precedent: #382 (be17d51) and #359 (eb302b0) mirrored planner
  prose into the tomls.
- **contractor.toml ×3 (Step-8a, ~:24)**: append a one-sentence #399 reference to the Step-8a
  "copy the project folder contents across to it" line — the worktree→main-FIRST sync-order rule +
  the staler-ledger guard refusal. **Canonical spec = `agents/contractor.md` "Finalization recovery
  contract (#399)" rule 1 (lines 101-107)** condensed to one edition-neutral sentence: "On a worktree
  run, sync worktree→main FIRST (the worktree holds the complete ledger) THEN mirror; the Step-8a
  guard refuses a `cp -R` of a staler main ledger over a more-complete worktree (#399)."

### n4 — #411 X6 plan-run prose propagation (doc-updater)
The #400 SIX-surface contract: 3 Claude commands (canonical `commands/` + gitlab/gitea
`plugins/*/commands/`) + 3 Codex SKILLs (`plugins/*/skills/kaola-workflow-plan-run/SKILL.md`). The
forge `commands/` are NOT byte-identical to canonical (they carry forge vocabulary), so edit each
independently but to a SHARED canonical spec (#309). Add the fused-advance opener as a THIRD nonce
source everywhere the prose names only the other two:
- canonical `commands/…:430` "**Pass the per-open `nonce` (#392) too** — from `open-next` (serial)
  or each `open-ready` opened member" → "…or the fused `close-and-open-next` `opened` payload".
- the SKILL twins carry the equivalent nonce-source prose (~:247 fused payload shape `{opened:{…}}`
  currently shows NO nonce field — also document that the fused `opened` now carries `nonce`).
- document `open-next --node-id <id>` (verified idempotent; returns the reused nonce) as the
  crash-resume nonce recovery, and reconcile/relax the step-4 "do not re-run a standalone `open-next`"
  forbiddance (`commands/…:637`) for the `--node-id` idempotent recovery path. Mirror the SAME edit
  across all 6 surfaces modulo forge nouns. The route-reachability contract
  (`scripts/test-route-reachability.js` + the 4 `validate-*-contracts.js`) machine-enforces 6-of-6.

### Gate coverage
- **G1 (code-reviewer post-dominance)**: n5 post-dominates n1 (code), n2 (code), n3 (profile prose),
  n4 (doc prose) — the spine ensures n5 sits above all four. n5 has an empty write set (read-only
  gate); it emits `verdict: pass` / `findings_blocking: 0`.
- **G2 (security-reviewer)**: not triggered — no security-sensitive surface (no auth, secrets,
  network, or credential code; labels carry no security marker).
- No `main-session-gate`: acceptance is fully verifiable by subagents + the four test chains
  (`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}`); no GPU/visual/device/human sign-off.

### Cross-edition verification (CLAUDE.md Validation Policy, #307)
This bundle touches the edition trees (forge plugin ports, forge commands/skills, forge tomls,
forge install-manifest mirror). Finalization requires ALL FOUR
`npm run test:kaola-workflow:{claude,codex,gitlab,gitea}` chains GREEN, run SEQUENTIALLY (npm test
short-circuits on the first red). n1 must additionally pass `node scripts/edition-sync.js --check`
(generated-aggregator parity) and n2 `node scripts/validate-script-sync.js` (byte-mirror parity).

### Decision records
No `D-411/412/413-NN` decision record — these are bug fixes against shipped behavior, not new
architecture decisions. (`docs/decisions/` has no 411/412/413 entry today.)

## Node Ledger

| id | status |
| --- | --- |
| n1-fix-411-node | complete |
| n2-fix-412-manifest | complete |
| n3-fix-413-toml | complete |
| n4-prose-411-x6 | complete |
| n5-review | complete |
| n6-finalize | complete |
## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-fix-411-node) | subagent-invoked | evidence-binding: n1-fix-411-node e2540583d549 | |
| tdd-guide (n2-fix-412-manifest) | subagent-invoked | evidence-binding: n2-fix-412-manifest dc9df2820806 | |
| implementer (n3-fix-413-toml) | subagent-invoked | evidence-binding: n3-fix-413-toml 4955f25827cb | |
| doc-updater (n4-prose-411-x6) | subagent-invoked | evidence-binding: n4-prose-411-x6 9787ba6feca9 | |
| code-reviewer | subagent-invoked | evidence-binding: n5-review 577040f8d725 | |
| finalize (n6-finalize) | main-session-direct | evidence-binding: n6-finalize 6aaa5a764685 | |
