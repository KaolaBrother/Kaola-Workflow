# Documentation Update — bundle-956-957-958-959-960-961-962

Reconciled against `git show HEAD` (commit `902f59a0`, worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-956-957-958-959-960-961-962`, branch
`workflow/bundle-956-957-958-959-960-961-962`) and the shipped tree at that commit. No `npm test` /
chain re-run performed (an existing four-chain receipt was preserved). One read-only script was run
directly — `node scripts/validate-kaola-workflow-contracts.js` — to confirm the new #957 README guard
actually passes against the shipped constants; this is not a chain and writes nothing.

## Checklist (CLAUDE.md "On any user-visible change, update:")

**1. `README.md` — does it describe removed machinery?**
PASS. Grepped root `README.md` for `run-chain-pool`, `fixtures-orphan-legality`,
`--commands-dir`, `--forges`, `FEATURE_TOKENS`, `cmdSinkPr`, `modelDisplay` — zero hits (1580
lines, `wc -l`). The Codex dispatch prose at `README.md:180` (`` `standard` dispatches as
`gpt-5.6-sol` / `medium`, while `reasoning` dispatches as `gpt-5.6-sol` / `xhigh` ``) is
unchanged, as instructed, and I verified it against the live constants by running
`node -e "require('./scripts/kaola-workflow-codex-preflight.js')"` — `CODEX_STANDARD_MODEL`/
`CODEX_STANDARD_EFFORT`/`CODEX_REASONING_MODEL`/`CODEX_REASONING_EFFORT` are exactly
`gpt-5.6-sol`/`medium`/`gpt-5.6-sol`/`xhigh`, matching the prose. The new guard in
`scripts/validate-kaola-workflow-contracts.js` (`+15` lines, `#957`) builds its expected
fragment from those same constants rather than a hardcoded copy, and I ran it directly:
`Kaola-Workflow Codex contract validation passed` (exit 0).

**2. API docs (`docs/api.md`) — any removed CLI mode/function/constant still documented?**
PASS. `docs/api.md` never documented `runtime-edition-forge.js`'s `--commands-dir`/`--forges`
modes, `run-chain-pool.js`, or `fixtures-orphan-legality.js` at all — grepped for all of those
plus `OUT_HOOKS_DIR`/`OUT_SKILLS_DIR`/`OUT_PLUGINS_DIR`/`DEFAULT_STANDARD_MODEL`/
`DEFAULT_REASONING_MODEL`/`transformCommandBody`: zero hits. The two live edits in this file —
`cmdSinkPr` → "The PR sink" (api.md's own bug: that function name never existed in any script)
and the Codex tier-pair paragraph rewritten to point at the four `CODEX_*` constants instead of
restating `gpt-5.6-sol`/`medium`/`xhigh` — both verified true against
`kaola-workflow-codex-preflight.js` and `test-route-reachability.js`/
`validate-kaola-workflow-contracts.js` as named.

**3. `CHANGELOG.md` — every user-visible change recorded, nothing recorded that isn't in the diff?**
PASS. All 7 issues (#956–#962) have a `## [Unreleased]` entry (2 issues — #957 and #962 — span
two subsections each: #957 in both Added and Changed; #962 in both Changed and Removed),
matching the commit's `Closes #956 … #962` line. Cross-checked each bullet's factual claims
against the actual diff:
  - #956 (conventions.md FEATURE_TOKENS → derived-parity rewrite) — matches the conventions.md
    diff exactly (`ROLE_PINS`/two-thirds-consensus language present in both the bullet and the
    file).
  - #957 Added (README guard) + Changed (Codex pair pointed-at-not-restated) — both verified
    live (item 1 above).
  - #958 (architecture.md: additive editions outside render targets but not outside sync
    propagation) — matches the architecture.md diff verbatim.
  - #959 (architecture.md: "four editions ship … across three forge CLIs") — matches; confirmed
    the file now reads exactly that at `docs/architecture.md:288`.
  - #960 (`run-chain-pool.js` removed, 428 lines) — matches `git show --stat` (`428 ---`) and the
    CHANGELOG's claim about the sole consumer being `test-parallel.js`'s self-test, confirmed
    against that file's diff (f6–f9 blocks removed, f1–f5 kept).
  - #961 (`fixtures-orphan-legality.js` removed, 102 lines, both byte-paired install-manifest
    exclusion comments dropped) — matches `git show --stat` (`102 ---`) and I independently
    confirmed **both** copies were touched: `git show --stat --name-only HEAD | grep -i
    install-manifest` returns both `scripts/kaola-workflow-install-manifest.js` and
    `plugins/kaola-workflow/scripts/kaola-workflow-install-manifest.js`.
  - #962 Changed (kimi-edition.md, opencode-edition.md, `LANE_STALENESS_MS` at three sites,
    `PARKED_LANE_PREFIXES`, README opencode-effort-mapping correction, api.md `cmdSinkPr`) — all
    six claims verified against their file diffs; `LANE_STALENESS_MS = 86400000` confirmed
    removed from exactly three live docs (architecture.md, conventions.md,
    workflow-state-contract.md — matching "three live sites"); `PARKED_LANE_PREFIXES` confirmed
    as a real exported constant (`scripts/kaola-workflow-adaptive-schema.js:301,1543`).
  - #962 Removed (three dead `transformCommandBody` strips, two CLI modes, six constants) —
    matches the `sync-opencode-edition.js`/`sync-kimi-edition.js`/`runtime-edition-forge.js`
    diffs; the "3 more than filed, since `OUT_HOOKS_DIR` is defined in both sync scripts" claim
    checks out — `OUT_HOOKS_DIR` was removed from both `sync-kimi-edition.js` and
    `sync-opencode-edition.js` module.exports in the diff.

No CHANGELOG entry names anything absent from the diff.

**4. Architecture docs — script inventory and anything referencing the deleted files.**
NO-IMPACT + PASS. `docs/architecture.md` never carried a "Key Scripts" style inventory listing
`run-chain-pool.js` or `fixtures-orphan-legality.js` before this diff — grepped the file for both
names: zero hits, before or after. So there was no stale inventory line to remove; the file's
three substantive corrections (Codex tier-pair framing already said "authored twice" pre-diff at
architecture.md:396 — consistent with, not contradicted by, the api.md/conventions.md rewrite;
the additive-edition propagation sentence; the four-editions/three-CLIs sentence) are the
complete set of architecture-doc changes this diff needed, and all three read cleanly with their
surrounding paragraphs.

**5. Inline comments where public interfaces changed.**
PASS. `scripts/runtime-edition-forge.js`'s header comment block and its `usage:` stderr string
were both updated in the diff to drop `--commands-dir`/`--forges` (confirmed in the shown diff:
the CLI comment block and the `process.stderr.write('runtime-edition-forge: usage: --forge=...')`
line now list only `--scripts-dir|--out-suffix`). Comment sites in `kaola-workflow-claim.js` and
`kaola-workflow-run-chains.js` naming the retired `plan-validator.js` were reworded across all
four trees (canonical `scripts/`, `plugins/kaola-workflow/`, `plugins/kaola-workflow-gitlab/`,
`plugins/kaola-workflow-gitea/` — confirmed all four appear in `git show --stat`), now saying
"the retired DAG-era barrier machinery (adaptive-node.js / plan-validator.js, both since
deleted)" instead of presenting it as a live co-reader.

**6. Tree-wide sweep for stale references to removed machinery.**
PASS — nothing live. Ran `git grep -n -P` (not plain `grep`, per the ugrep dot-dir caveat) for
`run-chain-pool`, `fixtures-orphan-legality`, `--commands-dir`, `--forges\b`, `FEATURE_TOKENS`,
`modelDisplay`, `cmdSinkPr`, `plan-validator` across the whole tree. Every hit outside the
declared-historical surfaces resolves as one of:
  - `docs/audits/2026-08-11-subtraction-audit.md`, `kaola-workflow/.roadmap/issue-95{6,7,8,9}.md`
    /`issue-96{0,1,2}.md`, `kaola-workflow/ROADMAP.md`, `CHANGELOG.md` history — the audit that
    filed these issues and the roadmap entries describing them; explicitly HISTORY/roadmap
    record per your framing, not touched.
  - `docs/investigations/*.md` and `kaola-workflow/.origin/877/*.md` — pre-#877 (ADR 0017)
    design/audit records describing the *retired DAG executor itself*, dated 2026-06 through
    2026-08 origin materials for a different, already-closed run. These are point-in-time
    investigation records the same way `docs/decisions/` is — not live doc surfaces this diff's
    subject touches, and not in your explicit list, but I'm flagging the omission rather than
    silently deciding: if you want them added to the retention policy explicitly, they read the
    same way `docs/decisions/**` does. I did not edit them.
  - `docs/conventions.md:471,565` — both already say "retired plan-validator" / "moved here from
    the retired plan-validator" — correct, historical-in-tone, live prose (not touched by this
    diff and not stale).
  - `scripts/test-finalize-door.js` — its own header comment and in-code strings describe testing
    that `claim.js`/`run-chains.js` **do not** require the plan-validator (T1) and that
    `--release-check` **reproduces** its refusals (T5) — i.e., asserting the retirement, not
    claiming it's live. Correct as-is.
  - `scripts/validate-workflow-contracts.js` (and its gitlab/gitea siblings) line ~561 — asserts
    `commands/kaola-workflow-finalize.md` does **NOT** contain `plan-validator` (a
    `assertNotIncludes` over a retired-vocabulary list) — correct, not a live-machinery claim.
    Note: `scripts/validate-workflow-contracts.js` is byte-identical to
    `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (`diff` empty) and untouched
    by this commit — out of scope, a code file not a doc surface.
  - `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:356` and the
    gitlab sibling — comment naming "the forge plan-validator refusal-matrix anchor" in a context
    about the forge-specific finalize check; not asserting the module still exists as a live file,
    reads consistently with the run-chains.js comment rewording pattern.

No edits were needed for item 6 — every non-historical hit already reads correctly.

## Edits made

None. This bundle's own diff was thorough enough that no gap survived the checklist sweep — the
dedicated docs reviewer's work held up under a second, independent pass focused specifically on
completeness/consistency rather than prose accuracy.

## Reported, not fixed

One thing worth your attention rather than an edit: `docs/investigations/*.md` (18 files) and
`kaola-workflow/.origin/877/*.md` (6 files) contain the bulk of the remaining `plan-validator`
mentions in the tree (~90 lines) — all describing the *since-retired* DAG executor accurately as
of when they were written. They fall outside both your explicit HISTORY list and my checklist's
live-doc-surface scope, so I left them alone, but they're the same shape as `docs/decisions/**`
and may be worth folding into that retention policy explicitly so a future sweep doesn't have to
re-derive that they're exempt.

## Verdict

PASS — all six checklist items satisfied; CHANGELOG complete and accurate against the diff; no
gaps found; zero edits required.
