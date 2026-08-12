# Premise check — issue #962 (subtraction-audit lower-value findings S3–S6, D3, D5, D7, D8)

Measured 2026-08-12 in the MAIN tree at `8742f5b8` (clean apart from this bundle's untracked
folder). Every zero-consumer search ran in two parts — `git grep` over the tracked tree
(`:!kaola-workflow/archive`, `:!CHANGELOG.md`) plus an explicit `find` sweep over all seven
dot trees (`.opencode`, `.opencode-gitlab`, `.opencode-gitea`, `.kimi`, `.kimi-gitlab`,
`.kimi-gitea`, `.codex`; 981 files enumerated, positive control: 6 command files matched a
known-present string). Mutation A/B ran in disposable clones under the session scratchpad,
never in this tree. Nothing was piped through `head`/`tail`; real exit codes recorded.

## OVERALL VERDICT: every sub-finding CONFIRMED as a defect; two carry corrections.

- **D5's "TWO sites in a test-consumed doc" is wrong — it is ONE** (the reader's own
  evidence says so; the header slip propagated into the audit table and into issue #962).
- **S6's "exactly three dead symbols" undercounts by three** — the same zero-consumer
  criterion also catches `OUT_HOOKS_DIR` (both sync scripts) and `OUT_PLUGINS_DIR` (opencode).

No sub-finding refuted. The S3 byte-identity claim — the one easiest to fake — was reproduced
concretely with a live positive control.

---

## S3 — three dead `transformCommandBody` strips · VERDICT: CONFIRMED

**Claim as filed:** three strips (Path Intent, Codex-note, Step 0a-1) across
`scripts/sync-opencode-edition.js` and `scripts/sync-kimi-edition.js` match nothing today, and
removing all three renders byte-identical output; 87 canonical lines.

**The six blocks (with their lead comments):**

| file | strip | block | lines |
|---|---|---|---:|
| `scripts/sync-opencode-edition.js` | Path Intent (`/^##\s.*\bPath Intent\b/`) | 459–483 | 26 |
| `scripts/sync-opencode-edition.js` | Codex-note (`/^>\s*\*\*Codex hooks note:/`) | 485–501 | 18 |
| `scripts/sync-opencode-edition.js` | Step 0a-1 (`/ \(Step 0a-1\)\| or Step 0a-1/g`) | 525–535 | 11 |
| `scripts/sync-kimi-edition.js` | Path Intent | 452–465 | 14 |
| `scripts/sync-kimi-edition.js` | Codex-note | 466–477 | 12 |
| `scripts/sync-kimi-edition.js` | Step 0a-1 | 517–522 | 6 |

Total **87 lines** — reproduces the audit's count exactly (measured by anchored regex over the
live files, each anchor matching exactly once).

**Match-nothing, verified over the real render inputs.** The renderers read the 9 command
sources the routing registry returns (`commands/*.md` ×3 github, `plugins/kaola-workflow-gitlab/commands/*.md`
×3, `plugins/kaola-workflow-gitea/commands/*.md` ×3). Per-file counts of all three trigger
patterns:

```
commands/workflow-next.md:          PathIntentHeading=0 CodexNote=0 Step0a1=0
commands/workflow-init.md:          PathIntentHeading=0 CodexNote=0 Step0a1=0
commands/kaola-workflow-finalize.md:PathIntentHeading=0 CodexNote=0 Step0a1=0
(gitlab ×3, gitea ×3: all zeros — 9/9 sources, 0 matches)
```

Tree-wide, the only tracked mentions are the sync scripts themselves (16+8), their test
(`test-opencode-edition.js`, 12), and docs/history; **zero** hits in all seven dot trees.

**Byte-identity, verified concretely** (not asserted). Three clones of this repo at `8742f5b8`
under the scratchpad (`s3-a` baseline, `s3-b` strips removed, `s3-ctrl` control):

- `s3-b`: all six blocks removed by an anchored patch script that hard-errors unless each
  anchor matches exactly once — 6 cuts logged (502+314+60 bytes opencode, 252+314+60 kimi).
- All three legs rendered `sync-opencode-edition.js --write` and `sync-kimi-edition.js --write`
  for all three forges: 18 runs, every exit 0, every stderr empty, **114 generated files per leg**
  (equal, nonzero — capture proven complete).
- **A vs B: `diff -r` over all six generated trees = exit 0, 0 diff bytes each; `opencode.json`
  `cmp` exit 0. Byte-identical.**
- **Positive control (vacuous-equivalence trap):** `s3-ctrl` removed one LIVE transform instead
  (the opencode `--runtime claude → --runtime opencode` rewrite). A vs CTRL differs in exactly
  the 3 opencode `command/workflow-next.md` files (github/gitlab/gitea) and nowhere else — the
  harness detects change, so the A/B identity is a real result.

**Test custody note:** no test pins the mechanism. `test-kimi-edition.js` has zero mentions.
`test-opencode-edition.js` A22 (`scripts/test-opencode-edition.js:938-952`) asserts the
*absence* of the patterns in generated output — those assertions stay green after the cut, and
in fact become the armed fail-loud net: today a canonical re-add of a "Path Intent" section
would be silently stripped (A22 green); after the cut it would surface in the render and A22
goes red. No synthetic fixture feeds these patterns to `transformCommandBody`.

**Recommended edit:** delete the six blocks listed above (87 lines, ×1 — these two scripts are
not ported). No doc or test change owed; regenerate the edition trees (`--write` ×3 forges ×2
scripts) and run the two edition suites.

---

## S4 — `runtime-edition-forge.js` `--commands-dir` / `--forges` CLI modes · VERDICT: CONFIRMED

**Claim as filed:** the two CLI modes have no caller anywhere; 14 lines.

**Sweep (exact strings `--commands-dir`, `--forges`, `-F -e`, two-part):** tracked hits are only
the script itself (`scripts/runtime-edition-forge.js:29,32,117,120,129,141-151`) plus the audit
record, `kaola-workflow/.roadmap/issue-962.md`, and the `ROADMAP.md` mirror. **Zero** hits in
all seven dot trees; **zero** in the 10 npm scripts (`package.json` scanned by key). All
`runtime-edition-forge` reference sites enumerated: `install-kimi.sh:105-108`,
`install-opencode.sh:135-138` (both call only `--out-suffix` and `--scripts-dir`),
`require()` from the two sync scripts and the two edition test suites (module functions, not
the CLI).

**Positive controls:** the same sweep method finds the live callers of the two sibling modes —
`--scripts-dir` at `install-kimi.sh:117` / `install-opencode.sh:147`, `--out-suffix` at
`install-kimi.sh:113` / `install-opencode.sh:143`.

**Recommended edit** (in `scripts/runtime-edition-forge.js`): drop comment lines 29 and 32,
the two `else if` arms at 117 and 120, the `forges` dispatch at 138, and the `commands-dir`
block at 141–151; update the usage string at 128-129 to
`' (--scripts-dir|--out-suffix)\n'`. ≈14 lines net. The `commandSources()` **function** stays —
it is the live carrier for both sync scripts. No README/docs document the two flags (swept), so
no doc change is owed.

---

## S5 — 8 comment lines naming the deleted `plan-validator.js` · VERDICT: CONFIRMED (corrective, 0 net deletable)

**Deletion proven:** no `*plan-validator*` file exists anywhere in the working tree or the dot
trees — the only matches are three archived DATA artifacts named after a DAG node
(`kaola-workflow/archive/issue-666/.cache/…n1-plan-validator…`), not the script. `git ls-files |
grep plan-validator` = those same 3. Positive control: the same method finds `kaola-workflow-claim.js`.

**The 8 canonical comment lines (each ×4 ported = 32 shipped; plugin copies confirmed at
`plugins/kaola-workflow/scripts/…` same lines, gitlab/gitea at ±1-9 line offsets):**

| site | today's text (gist) | what it should say instead |
|---|---|---|
| `scripts/kaola-workflow-claim.js:2587` | tag sanitizer "MUST mirror the projectTag computation adaptive-node.js / plan-validator.js use" | "…the projectTag computation the retired DAG-era barrier machinery (`adaptive-node.js`/`plan-validator.js`, both deleted) *used* to anchor `refs/kaola-workflow/barrier/…` — the reaper must still compute exactly the tag those historical refs carry" |
| `scripts/kaola-workflow-claim.js:5786` | "(projTag is recorded EXACTLY as given, plan-validator.js — never case-normalized)" | "(projTag was recorded exactly as given by the retired plan-validator.js — never case-normalized; historical refs keep that shape)" |
| `scripts/kaola-workflow-run-chains.js:42` | "RECEIPT PATH (#546): plan-validator --finalize-check reads the chain receipt from…" | name today's reader: "the finalize transaction (`claim.js` finalize → `adaptiveSchema.evaluateChainReceipt`) reads the chain receipt from…" |
| `scripts/kaola-workflow-run-chains.js:125` | consumer-repo gate "enforced by `plan-validator --finalize-check` (consumer mode)" | "…reported by the finalize chain-receipt check (`evaluateChainReceipt`, consumer mode)" — also swap "enforced" for "reported"; nothing refuses here any more |
| `scripts/kaola-workflow-run-chains.js:867` | same "enforced by `plan-validator --finalize-check` in consumer mode" | same correction as :125 |
| `scripts/kaola-workflow-run-chains.js:1091` | same phrase inside the `chains_config_missing` comment | same correction |
| `scripts/kaola-workflow-run-chains.js:1231` | "a receipt reader (the plan-validator finalize gate, an operator)" | "a receipt reader (the finalize chain-receipt check, an operator)" |
| `scripts/kaola-workflow-run-chains.js:1233` | "Readers index by name/exitCode/accepted_red (plan-validator --finalize-check, #522 schema test)" | "Readers index by name/exitCode/accepted_red (`evaluateChainReceipt`, #522 schema test)" |

Today's actual reader, verified: `evaluateChainReceipt` at
`scripts/kaola-workflow-adaptive-schema.js:1235` ("THE ONE VALIDATION VERDICT"), called from the
finalize transaction at `scripts/kaola-workflow-claim.js:4038`.

**Judgment on deleting vs correcting:** the dispatch asked. Do **not** delete outright. The two
`claim.js` comments carry the *reason* the sanitizer/case-folding must keep their exact historical
shape — deleting them deletes the constraint's rationale while the constraint (existing
`refs/kaola-workflow/barrier/*` refs) still exists. The six `run-chains.js` comments state who
consumes the receipt and the consumer-repo contract; the referent is wrong, the fact is
load-bearing. Corrective, 0 net deletable — as filed.

**Boundary:** the surviving `plan-validator` mentions in `test-finalize-door.js` (T1/T5),
`validate-workflow-contracts.js:561`, and the forge contract validators are **tombstone guards
that keep the retirement enforced** — they name the dead thing on purpose and must not be swept.

---

## S6 — two "legacy alias" exports + one dead constant · VERDICT: CONFIRMED-WITH-CORRECTION (undercounted)

**The three filed symbols, each independently re-swept (two-part, `-F`, archive+CHANGELOG
excluded):**

- `DEFAULT_STANDARD_MODEL` — `scripts/sync-opencode-edition.js:1010`. Tracked hits: **1** (the
  export line itself). Dot trees: 0. Zero consumers.
- `DEFAULT_REASONING_MODEL` — `scripts/sync-opencode-edition.js:1011`. Tracked hits: **1**. Dot
  trees: 0. Zero consumers. (Comment `:1009` "Legacy aliases (env-derived; empty by default now
  that pins are opt-in)." goes with them — 3 lines.)
- `OUT_SKILLS_DIR` — `scripts/sync-kimi-edition.js:61` (definition), `:868` (export). Tracked
  hits: **2** (def + export). Dot trees: 0. Zero consumers. (1 line net: the definition; trim the
  export list entry in the same edit.)

The live originals stay: `ENV_STANDARD_MODEL`/`ENV_REASONING_MODEL` are read at
`sync-opencode-edition.js:589-590` (4 tracked hits each).

**Correction — the criterion catches three more the audit's sweep table missed:**

- `OUT_HOOKS_DIR` (kimi) — `sync-kimi-edition.js:62` + `:868` only.
- `OUT_HOOKS_DIR` (opencode) — `sync-opencode-edition.js:74` + `:1013` only.
- `OUT_PLUGINS_DIR` (opencode) — `sync-opencode-edition.js:75` + `:1013` only.

The name `OUT_HOOKS_DIR` exists in **both** files, so a name-keyed sweep reads 4 hits and can
mistake the sibling file's definition for a consumer — the likely reason the audit's "exactly
three symbols survive as genuinely dead" stopped where it did. **Positive controls:** the same
sweep shows `OUT_AGENT_DIR`/`OUT_COMMAND_DIR` genuinely live (5 consuming sites each in
`test-opencode-edition.js:200-887`) and `OPENCODE_JSON` live internally (`:695,699,942`).

**Recommended edit:** delete `:1009-1011` (opencode) and the `OUT_SKILLS_DIR` definition +
export entry (kimi) as filed — 4 canonical lines. Whether to widen the cut to the three
additional dead `OUT_*` constants is the orchestrator's call; they are the same class and the
evidence is above.

---

## D3 — `docs/kimi-edition.md` credits a deleted renderer · VERDICT: CONFIRMED

**The function: `modelDisplay()`**, credited at `docs/kimi-edition.md:98`:

> 97  - The adaptive planner's per-node tier (`reasoning`/`standard`) survives as **metadata
> 98    only**: it is recorded in the dispatch packet and ledger, and `modelDisplay()` renders it
> 99    as `parent session (<tier> tier metadata)` — the same semantics as the Codex edition. It
> 100   maps to no effort or model at runtime.

**Absent tree-wide:** `git grep -F modelDisplay` over the tracked tree (archive/CHANGELOG
excluded) hits only `docs/kimi-edition.md:98`, `docs/decisions/D-703-01.md:59` (a decision
record — history by the stated retention policy, not filed), and `.origin` audit records. Zero
hits in `scripts/`, `plugins/`, `templates/`, and all seven dot trees. The rendered string is
equally dead: `git grep -F 'tier metadata'` finds no live code emitting it, and `model_display`
(the payload sibling) has zero tracked hits.

**What actually renders it now: nothing — and nothing ever did.** The repo's own dead-exports
audit (`kaola-workflow/.origin/dead-exports-audit.md:103`) records `modelDisplay` as "0 external,
0 internal code refs" *while it existed* (deleted in the ADR 0017 demolition follow-up,
`a9cf4756`). The whole bullet describes retired machinery: there is no dispatch packet and no
ledger any more. Today's truth: the canonical `model:` frontmatter tier is declarative metadata
(checked by `scripts/validate-kaola-workflow-contracts.js:468`), and the kimi render **drops** it
(`scripts/sync-kimi-edition.js:207-208`).

**Recommended edit** (2–4 lines at `docs/kimi-edition.md:97-100`): replace the bullet with —
"The canonical `model:` role tier is declarative metadata only: the kimi render drops the field
(a Skill is a prompt package), and nothing maps it to a model or effort at runtime." (The
sibling bullet at `:90` already covers the skip; outright deleting `:97-100` is also defensible.)

---

## D5 — `LANE_STALENESS_MS = 86400000` restated in three live docs · VERDICT: CONFIRMED-WITH-CORRECTION

**Home and value verified:** `scripts/kaola-workflow-adaptive-schema.js:238`
(`const LANE_STALENESS_MS = 86400000; // 24 hours in milliseconds`); live module read returns
`86400000`; byte-identical in all three `plugins/*/scripts/` copies (`:238` in each).

**The three live-doc restatement sites (value inlined):**

| site | test-consumed? |
|---|---|
| `docs/architecture.md:114` — "(`session_marker`, `claim_ts`, and `LANE_STALENESS_MS = 86400000`)" | no |
| `docs/conventions.md:770` — "`LANE_STALENESS_MS = 86400000` (24 hours) is the single staleness constant exported from…" | no |
| `docs/workflow-state-contract.md:295` — "`LANE_STALENESS_MS = 86400000` (24 hours, exported from `kaola-workflow-adaptive-schema.js`)" | **YES — receipt-staling** |

**Correction:** issue #962 and the audit table say "TWO SITES IN A TEST-CONSUMED DOC". **Exactly
one** of the three sites is in a test-consumed doc. The archived reader's own evidence
(`archive/bundle-952-953-954-955/reports/audit-952-docs.md`, F5) carries the contradiction
internally: its section *header* says "two sites in a TEST-CONSUMED doc" while its table marks
one YES / two no and its prose says "only the `workflow-state-contract.md` one is test-consumed"
and the summary row says "1 of 3 sites". The header slip is what propagated.

**Test-consumed sets re-read directly:** `SELF_HOST_TEST_CONSUMED`
(`scripts/kaola-workflow-adaptive-schema.js:905-911`) and `TEST_CONSUMED_PATHS`
(`scripts/kaola-workflow-validation-runner.js:32-38`) are identical **five**-entry lists:
`README.md`, `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md`,
`docs/agents-source.md`. (The audit's "three docs" statement counts only the `docs/` members.)
Neither `architecture.md` nor `conventions.md` is in them.

Two further value copies sit in decision records (`docs/decisions/0016…:242`,
`docs/decisions/D-579-01.md:67`) — history by the stated retention policy, correctly not filed.

**Recommended edit:** at all three sites drop the `= 86400000` numeral and keep the name (the
shorter form is already in use in the same contract file at
`docs/workflow-state-contract.md:338-339`). Sequencing cautions: the `workflow-state-contract.md:295`
edit **stales the chain receipt** — make it before the finalize chain run, never after; and
`docs/conventions.md` is opened by at least one fast-gate test (`test-forge-finalize-findings.js`
asserts other strings in that file), so touch only the numeral. `test-claim-hardening.js:1996`
asserts the constant from the module, not from any doc — unaffected.

---

## D7 — `docs/opencode-edition.md` re-types the derived reasoning-tier roster · VERDICT: CONFIRMED

**The re-typed copy**, `docs/opencode-edition.md:121-124` (quoted):

> The seeded `opencode.json` carries this as a commented-out scaffold: a top-level `model` for the
> standard tier and `agent.<role>.model` overrides for the seven reasoning-tier roles
> (`adversarial-verifier`, `build-error-resolver`, `code-architect`, `code-reviewer`, `planner`,
> `security-reviewer`, `synthesizer`). With nothing set, every role inherits the model you already
> use.

**Where the generator derives it:** `scripts/sync-opencode-edition.js:565-574` —
`reasoningRoles()` reads `agents/*.md` and filters by `roleTier(fm.model) === 'reasoning'`
(`model: opus` → reasoning); `renderNeutralConfig` writes the roster into the seeded config
(`:611`, `:628-640`). Live derived carrier in the tree: `opencode.json:8` lists the same seven.

**Current accuracy check:** the derived roster today is exactly the doc's seven names, in the
same order (`reasoningRoles()` returns 7: adversarial-verifier, build-error-resolver,
code-architect, code-reviewer, planner, security-reviewer, synthesizer) — so nothing is wrong
*yet*; this is a drift-risk restatement, `shrink:` as filed. The doc is not test-consumed and no
script reads it (verified by the archived reader and consistent with the declared sets above).

**Recommended edit** (3 lines): replace the parenthetical role list with a pointer — e.g. "…and
`agent.<role>.model` overrides for the reasoning-tier roles (the roster is derived from the
`model:` tier in `agents/*.md` and written into the seeded `opencode.json` — see the scaffold
comment there)". Keep "seven" out of the sentence or it re-types the count.

---

## D8 — `docs/architecture.md` inlines `PARKED_LANE_PREFIXES` without naming it · VERDICT: CONFIRMED

**Site:** `docs/architecture.md:121`:

> another lane's scratch under `kaola-workflow/`, `.kw/worktrees/` or `.kw/legs/` does not read as
> dirt.

**Constant's home:** `scripts/kaola-workflow-adaptive-schema.js:301` —
`const PARKED_LANE_PREFIXES = Object.freeze(['kaola-workflow/', '.kw/worktrees/', '.kw/legs/']);`
(byte-identical ×4; the doc line inlines exactly those three values, constant unnamed anywhere
in the paragraph — `:118-121` names `isParkedLanePath` but not the list). Positive contrast:
`docs/conventions.md:785` states the same fact correctly by naming the constant and its home.

Note: `docs/architecture.md:198`'s `kaola-workflow/**` is a **different** list (the
`changed_paths` bookkeeping band) and is not this finding.

**Recommended edit** (1 line, `docs/architecture.md:121`): "another lane's scratch under the
`PARKED_LANE_PREFIXES` paths (`kaola-workflow-adaptive-schema.js`) does not read as dirt" — or
keep the three values and add the constant's name; either way the constant is named.
`architecture.md` is not test-consumed (not in either declared set).

---

## Recorded observation 1 — opencode/kimi deletion transforms have no over-match observer · STILL TRUE

**Confirmed.** The three strips fire silently: no fired-count, no per-surface expectation, and
the only anchored fail-loud machinery in `transformCommandBody` is model-dispatch-scoped
(`assertModelDispatchAnchorMatched` + `assertNoModelDispatchResidue` — both observe the
*substitution*, not the strips). The suites cannot see an over-strip either:
`test-opencode-edition.js` A22 asserts the **absence** of the stripped strings in output — an
assertion that passes identically whether the strip removed the intended section or a future
unrelated one. `stripCardModelPlaceholders` (both scripts) is a fourth silent deletion
transform: any line matching `model="{…}"` is excised before the residue assert runs, so a
future canonical line legitimately carrying that shape would vanish unobserved. A future
canonical heading matching `^##\s.*\bPath Intent\b`, or a blockquote opening
`> **Codex hooks note:**`, would be silently dropped from all six rendered opencode/kimi trees
with every suite green.

**Interaction with S3:** if the S3 cut lands, the three section/residue triggers cease to exist
and the exposure narrows to `stripCardModelPlaceholders` alone.

**Proposed narrower wording** (fits the ADR 0017 watch-list three-column register; distinct from
the row #954 refused, because this class is measurably *unobserved* — the refused row described
an already-observed fact):

> | a canonical addition that matches an edition deletion-transform trigger written for other
> bytes | a canonical command line silently excised from an `.opencode*`/`.kimi*` render by a
> strip nobody re-aimed at it. The silent triggers today are the card-placeholder line shape
> `model="{…}"` (`stripCardModelPlaceholders`, both sync scripts) — plus, only until the #962 S3
> cut lands, `^##\s.*\bPath Intent\b`, `^>\s*\*\*Codex hooks note:` and the literal
> `Step 0a-1`. Measured 2026-08-12: all triggers match zero bytes across the nine canonical
> command sources, and no over-strip has ever shipped — the model-dispatch substitution is the
> only transform observed in both directions | a per-strip fired-set check in
> `transformCommandBody`, the two-direction discipline `assertModelDispatchAnchorMatched`
> already applies: record which surface each strip fired on and fail the render when a strip
> fires on a surface it has no expectation for, naming the excised text. ~a dozen lines per sync
> script; nothing to build until a trigger matches something |

## Recorded observation 2 — no Node version floor declared · CONFIRMED

`package.json` has no `engines` key (module read prints `engines: null`; `grep -n 'engines'
package.json` exits 1). No `.nvmrc`, `.node-version`, or `.tool-versions`. No CI config of any
kind exists to imply one: `.github/`, `.gitlab-ci.yml`, `.gitea/`, `.circleci/`, `Jenkinsfile`,
`azure-pipelines.yml`, `.woodpecker.yml` are all absent (consistent with the repo's
no-CI/self-sufficient stance). The audit's `native:` class therefore remains unmeasurable as it
states. Note for any follow-up: declaring an `engines` floor is a change to a user-owned
contract surface (it alters what installs where) — per the escalation rule it needs the owner's
explicit decision, and the audit's own caveat stands that the one `native:` candidate examined
(`fs.cpSync` for `copyDir`) is NOT a safe swap on symlinks even on Node 24.

---

## Method notes

- Two-part sweeps throughout; searches on stems and exact `-F` strings, `-e` guarding
  flag-shaped patterns. One harness slip caught and redone: a zsh unquoted-variable pass handed
  `diff` a single six-tree argument (the known no-word-splitting trap) — re-run with explicit
  lists; file counts asserted nonzero-and-equal before trusting any zero-diff.
- Clones (`s3-a`/`s3-b`/`s3-ctrl`) and render logs remain under the session scratchpad for
  inspection; nothing in the main tree was written except this report.
