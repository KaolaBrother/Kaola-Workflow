# Badge census — cosmetic vs functional

Investigator report. **No tracked file was edited.** All mutation testing was done in a scratch
mirror at
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/badge-census/mirror`
(`git archive HEAD | tar -x`), never in the worktree or main checkout.

## Setup

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-949`, branch
  `workflow/issue-949`, HEAD `a348ff5c683845c212d15bdcac1740c640809f9b`, clean.
- All searches used `git grep -n -i -P` (case-INSENSITIVE, PCRE). Case-insensitivity was
  load-bearing: **4 tracked files match `Badge` but not `badge`** — the four
  `validate-*-contracts.js` copies — and those carry the hardest guard in the whole census. A
  case-sensitive sweep would have missed the only assertion that fails the `claude` chain.
- `node scripts/generate-routing-surfaces.js --check` → **exit 0**,
  `all 18 surfaces byte-match the skeleton.`

## Count correction

The sketch said "21 tracked files, ~118 hits". The real numbers, case-insensitive:

| scope | hits | files |
|---|---|---|
| **TOTAL, whole tracked tree** | **358** | 120 |
| `kaola-workflow/archive/**` (run records) | 218 | 82 |
| `CHANGELOG.md` | 19 | 1 |
| `docs/investigations/` | 16 | 4 |
| `docs/audits/` | 5 | 1 |
| `docs/decisions/` | 1 | 1 |
| **LIVE (everything else)** | **99** | **22** |

Case-SENSITIVE `badge`, excluding archive, gives 70 hits / 18 files — which is roughly the sketch's
number and is the count that hides the validators. **Use 99 live hits / 22 files as the working
figure.** All 358 are accounted for below (218 + 19 + 16 + 5 + 1 + 99 = 358).

---

## 1. Complete classification table

### 1a. LIVE surfaces — 99 hits

#### `README.md` — 12 hits, all COSMETIC

| line(s) | text | class | reason |
|---|---|---|---|
| 204–207 | "This makes Claude Code's built-in model badge render on every subagent dispatch (the badge renders only when a concrete `model=` literal differs from the agent's frontmatter). **After installing or re-running `install.sh`, restart Claude Code for the model badges to take effect.**" | **MIXED** | Split falls at "This makes". The two preceding sentences (`:201-204`, "their frontmatter `model:` field is rewritten to `inherit`. Command files render each agent's concrete assigned model … via install-time substitution") are **FUNCTIONAL** — they describe the tier-selection mechanism. From "This makes Claude Code's built-in model badge render…" to the end of the paragraph is **COSMETIC**. |
| 209–219 | The whole `> **Badge visibility by session model…**` blockquote (Sonnet/Opus visibility rules, roster lists, "The badge is a model-switch indicator") | **COSMETIC** | Pure platform-rendering behaviour. Deleting changes what a reader is told and nothing else. Note the roster lists are also a second, unguarded copy of the tier assignment — they will rot regardless. |
| 260 | "so spawned subagents can show Claude Code's built-in model badge." | **MIXED** | Split at "so spawned subagents can show". `:258-260` "During install, slash commands render each installed Kaola agent's frontmatter model into concrete `Agent(..., model="...")` examples" is FUNCTIONAL; the trailing purpose clause is COSMETIC. |
| 1264–1266 | "Model badges are enforced by slash-command dispatch, not by a status-line override: the installer renders each installed agent's resolved model into concrete `model="..."` lines in the slash commands." | **MIXED** | Split at the colon. Subject ("Model badges are enforced by…, not by a status-line override") is COSMETIC; the clause after the colon states the live install-time substitution and is FUNCTIONAL. |
| 1267–1269 | "**Badge not showing for some subagents?** By design: on a Sonnet session, only Opus subagents show a badge. On an Opus session, all subagents badge. See the vendored-agents note above for details." | **COSMETIC** | Troubleshooting entry for a visual artifact only. |

**No test asserts on any of this.** See §5.

#### `commands/` + `plugins/*/commands/` + `templates/routing/` — 8 hits

| file:line | text | class | reason |
|---|---|---|---|
| `templates/routing/finalize.skeleton.md:42` | `<!-- REGION:command — the `model="{...}"` placeholders are filled at install time for this surface; the skill surface has no placeholder to fill and resolves each role's model from its installed profile at spawn time -->` | **FUNCTIONAL** | Not a badge line at all (no word "badge"). It is the generator directive that scopes the block to command surfaces only. Deleting the region wrapper without deleting its body would ship the block to the 3 Codex SKILL surfaces, which have **zero** `Agent(` cards. |
| `templates/routing/finalize.skeleton.md:43` | `## Agent Model Badge` | **FUNCTIONAL** (by consequence, not by content) | The heading text is cosmetic; the heading **string** is a live anchor read by 6 code sites. See §4. |
| `templates/routing/finalize.skeleton.md:45-48` | "Every subagent dispatch below carries an explicit `model=` line — the installer fills each `model="{...}"` placeholder from the agent's own installed profile, and it is what shows the model badge. You MUST pass `model="{...}"` in every Agent call exactly as shown; never omit the `model=` line on any dispatch." | **MIXED** | Split falls at **", and it is what shows the model / badge"** (line 46 tail → line 47 head). Everything before that comma is FUNCTIONAL (it states that the placeholder is installer-filled from the profile). The `and it is what shows the model badge` clause is COSMETIC. The following sentence — `You MUST pass model="{...}" in every Agent call exactly as shown; never omit the model= line on any dispatch` — is **FUNCTIONAL**: it is pinned verbatim by four validators (`assertIncludes(file, 'You MUST pass \`model=')`) and it is the instruction that stops a dispatch collapsing to the session model. |
| `commands/kaola-workflow-finalize.md:29,33`; `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:29,33`; `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:29,33` | rendered copies of the above | **GENERATED — do not edit** | See §3. |

#### `docs/architecture.md` — 1 hit

| line | text | class | reason |
|---|---|---|---|
| 341–343 | "For Claude Code, commands carry an explicit `model="{...}"` placeholder on every dispatch, which the installer fills from the agent's own installed profile; **that is what renders the model badge.** opencode applies its resolved tier dynamically." | **MIXED** | Split at the semicolon. The first clause is FUNCTIONAL and, **measured, it is TRUE, not an overclaim** — see the correction in §6. The trailing `that is what renders the model badge` is COSMETIC. |

#### `install.sh` — 1 hit

| line | text | class | reason |
|---|---|---|---|
| `install.sh:786` | `print("Removed the managed Kaola subagentStatusLine; model badges use explicit Agent model dispatch.", file=sys.stderr)` | **MIXED** | The `print(...)` call sits inside live removal code (`install.sh:784-786`) that pops a legacy `subagentStatusLine` key out of the user's `~/.claude/settings.json` — that code is **FUNCTIONAL**. Only the message text after the semicolon (`model badges use explicit Agent model dispatch.`) is COSMETIC. **Measured: the string is asserted nowhere** (`git grep -F "Removed the managed Kaola subagentStatusLine"` → only its own definition; `git grep "model badges use explicit"` in `scripts/` and `plugins/*/scripts/` → exit 1). Rewording it is free. |

#### `scripts/validate-workflow-contracts.js` + 3 copies — 8 hits, **FUNCTIONAL**

| file:line | text | class |
|---|---|---|
| `scripts/validate-workflow-contracts.js:179` | `assertIncludes(file, '## Agent Model Badge');` | **FUNCTIONAL — hard guard, measured red** |
| `scripts/validate-workflow-contracts.js:183` | `assertNotIncludes(file, 'Agent Model Badge Contract');` | **FUNCTIONAL (inert)** — a negative pin on a retired older heading. Passes trivially today and would keep passing after removal. |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:179,183` | byte-identical copy | **FUNCTIONAL** — see the sync note below |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:204,208` | same two assertions | **FUNCTIONAL — hard guard, measured red** |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:203,207` | same two assertions | **FUNCTIONAL — hard guard, measured red** |

Adjacent lines that do **not** contain the word "badge" but belong to the same block and are equally
load-bearing:

- `scripts/validate-workflow-contracts.js:180` `assertIncludes(file, 'You MUST pass \`model=');` — **FUNCTIONAL**, measured ABSENT after removal.
- `:181` `assertIncludes(file, 'model="{');` — **FUNCTIONAL**, measured still PRESENT after removal (the three dispatch cards keep their placeholders).
- `:182` `assertEveryDispatchHasModel(file);` — **FUNCTIONAL**, unaffected. Defined at `scripts/validate-workflow-contracts.js:70-83`: for every `^Agent($` block with a `subagent_type=`, requires a `model="{[A-Z_]+_MODEL}"` line. This is the guard that actually protects tier routing, and it is **independent of the badge prose**.

**Sync constraint (measured):** `scripts/validate-workflow-contracts.js` and
`plugins/kaola-workflow/scripts/validate-workflow-contracts.js` are **byte-identical** and policed by
`scripts/validate-script-sync.js:54`. Editing only the root copy →
`validate-script-sync` exit **1**, `Out of sync (scripts/ vs plugins/kaola-workflow/scripts/): - validate-workflow-contracts.js`.

#### `scripts/sync-opencode-edition.js` — 26 hits, **FUNCTIONAL**

The whole cluster is one mechanism: a Claude-only instruction must not ship to a runtime whose task
tool has no model parameter.

| line(s) | what | class |
|---|---|---|
| 232–250 | transform header comment (`badge` at :234, :237) | FUNCTIONAL (documents a live transform) |
| 251–261 | `OPENCODE_BADGE_BLOCK` — the emitted `## Model and effort are inherited` section | **FUNCTIONAL** |
| 263–268 | `OPENCODE_BADGE_GUIDANCE` — the one-sentence prose replacement | **FUNCTIONAL** |
| 273 | `const MODEL_MENTION = /model=/;` (no "badge" in the line) | **FUNCTIONAL** — the residue predicate |
| 278–296 | `sentenceStart` / `rewriteBadgeParagraph` | **FUNCTIONAL** |
| 298–334 | `rewriteBadgeInstructions` — the anchored prose rewrite | **FUNCTIONAL** |
| 341–343 | `stripCardModelPlaceholders` (no "badge" in the line) | **FUNCTIONAL** |
| 345–367 | `assertNoBadgeResidue` — throws `sync-opencode-edition: model-badge residue in <label>` | **FUNCTIONAL** |
| 411–425 | `transformCommandBody`: the `/^##\s+Agent Model Badge\s*$/` trigger at **:420** and block substitution at **:421** | **FUNCTIONAL** |
| 432–433, 480 | cross-references in neighbouring transforms' comments | COSMETIC-adjacent (comment text only; deleting the reference does not change behaviour, but the referenced transform must survive) |
| 514 | `assertNoBadgeResidue(text, label);` — the post-condition call | **FUNCTIONAL** |
| 966–967 | module exports of the above | **FUNCTIONAL** |

#### `scripts/sync-kimi-edition.js` — 20 hits, **FUNCTIONAL**

Same mechanism, one difference: kimi substitutes a single line rather than a block.

| line(s) | what | class |
|---|---|---|
| 247–250 | `KIMI_BADGE_GUIDANCE = 'Never pass a per-call model override; sub-agents inherit the session model.'` | **FUNCTIONAL** |
| 272–298 | `rewriteBadgeParagraph` / `rewriteBadgeInstructions` | **FUNCTIONAL** |
| 334–345 | `assertNoBadgeResidue` (throws `sync-kimi-edition: model-badge residue in …`) | **FUNCTIONAL** |
| 397–420 | `transformCommandBody`: the `/^##\s+Agent Model Badge\s*$/` trigger at **:412**, guidance emitted at **:415** | **FUNCTIONAL** |
| 478, 500 | comment cross-reference; `assertNoBadgeResidue` call | FUNCTIONAL (:500), comment (:478) |
| 822–823 | exports | **FUNCTIONAL** |

#### `scripts/test-opencode-edition.js` — 21 hits

| line(s) | what | class |
|---|---|---|
| 387, 515, 757, 765, 875 | comments naming the mechanism | COSMETIC-adjacent (comment text) |
| 784–786 | `const BADGE_HEADING = 'Model and effort are inherited';` + regex | **FUNCTIONAL** — locator for S2 |
| 795–808 | `badgeSection()` extractor | **FUNCTIONAL** |
| 811–820 | `canonCarriesBadge` + **`assert(badgeCarriers.length > 0, …)`** | **FUNCTIONAL — measured red on removal** |
| 822–841 | the both-directions presence pin (`sec !== null` / `sec === null`) | **FUNCTIONAL** |
| 845–867 | tier-noun leak checks scoped to the block | **FUNCTIONAL** |

#### `scripts/test-kimi-edition.js` — 2 hits

| line | what | class |
|---|---|---|
| 297 | comment: "locks transformCommandBody's badge strip + placeholder strip + comma collapse" | COSMETIC-adjacent (comment) |
| 326 | comment: "…that surface is retired and no generated skill carries a per-call model override to strip" | COSMETIC-adjacent (comment), and **it is already true**: this comment (`:320-332`) states that the POSITIVE half of the kimi check has no carrier left. §4 measures that this is exactly why the kimi suite stays green on removal. |

The armed kimi assertions live at `:308-309` (`!/MUST pass \`model=|do not omit\s+the \`model=\` line/`)
and `:335-374` (`K2-declaration` / `KIMI_RUNTIME_NATIVE.inherit_session_model`). Neither contains the
word "badge"; both are **FUNCTIONAL** and both keep passing after removal.

### 1b. OUT-OF-SCOPE — 259 hits, confirmed

| scope | hits | class | verification |
|---|---|---|---|
| `kaola-workflow/archive/**` (82 files) | 218 | **OUT-OF-SCOPE** | Dated run records (mission lists, `.cache/` subagent reports, finalization summaries). Same precedent as the retired `--profile` axis. |
| `CHANGELOG.md` (`:95, :1719, :1962` and 16 more) | 19 | **OUT-OF-SCOPE** | `docs/README.md:43` — "Changelog — user-visible changes"; dated history. |
| `docs/investigations/2026-06-11-367-…md` (7), `lean-orchestrator-contractor-2026-06-04.md` (6), `2026-06-05-workflow-planner-adaptive-plan.md` (2), `dynamic-workflow-composition-2026-06-02.md` (1) | 16 | **OUT-OF-SCOPE** | `docs/README.md:41` — "Investigations — investigation notes and analysis documents." |
| `docs/audits/opencode-edition-audit.md` (`:61, :68, :70, :365, :367`) | 5 | **OUT-OF-SCOPE** | `docs/README.md:42` — "Audits — one-off audit records." |
| `docs/decisions/0003-adaptive-front-end-planner.md:53` | 1 | **OUT-OF-SCOPE** | `docs/README.md:34-37` — "Everything numbered 0001–0015 … remain accurate as history." |

**The classification holds.** `docs/README.md:20-43` names each of these directories as history or
record; there is no live-doc claim on any of them.

---

## 2. Search beyond the literal word `badge`

All case-insensitive `git grep -P`, archive and CHANGELOG excluded unless noted.

### `subagentStatusLine` / `statusline` — 11 live hits, and this is REAL MACHINERY

| file:line | what | class |
|---|---|---|
| `install.sh:746-750` | `def is_managed_subagent_statusline(entry)` — matches `kaola-workflow-subagent-statusline.js` in the command | **FUNCTIONAL** |
| `install.sh:784-786` | pops the key from the user's `settings.json` | **FUNCTIONAL** (message text cosmetic — see §1a) |
| `uninstall.sh:137, 168-172, 191-192` | the same removal on uninstall | **FUNCTIONAL** |
| `scripts/validate-workflow-contracts.js:324` (+ 3 copies) | `assertNotIncludes('hooks/hooks.json', 'subagentStatusLine')` | **FUNCTIONAL** |
| `scripts/validate-workflow-contracts.js:325` (+ copies) | `assertNotIncludes('hooks/hooks.json', 'kaola-workflow-subagent-statusline.js')` | **FUNCTIONAL** |
| `scripts/validate-workflow-contracts.js:329` (+ copies) | **`assertIncludes('uninstall.sh', 'subagentStatusLine')`** | **FUNCTIONAL — a POSITIVE pin.** Deleting the uninstall-side cleanup reds this guard. |
| `scripts/validate-workflow-contracts.js:332` (+ copies) | `assert(!exists('scripts/kaola-workflow-subagent-statusline.js'))` | **FUNCTIONAL** |
| `README.md:1278-1280` | "`install.sh` and `uninstall.sh` remove the legacy managed Kaola `subagentStatusLine` entry from earlier issue #141 installs when it is still present. User-owned status lines are preserved." | **FUNCTIONAL prose** — a true statement about live behaviour, not a badge promise. **Keep.** |

**Verdict: this cluster is not badge cosmetics.** It is upgrade hygiene that mutates a user-owned
settings file. It survives a badge retirement untouched. The only badge-flavoured token in it is the
stderr message at `install.sh:786`.

### `status line` / `status-line`

`README.md:1264` (covered above, MIXED) plus three `docs/decisions/D-538-01.md:111`,
`D-725-01.md:172`, `D-765-01.md:68` — all OUT-OF-SCOPE ADR history.

### `model switch indicator`

`README.md:218` "The badge is a model-switch indicator" — COSMETIC (covered). Two other hits
(`CHANGELOG.md:2587`, `docs/decisions/D-544-01.md:146`) are about opencode model *switching*, an
unrelated sense — OUT-OF-SCOPE.

### `Agent Model Badge` (the exact heading string)

Exactly **10 live sites**, and this is the complete removal blast list:

```
templates/routing/finalize.skeleton.md:43                                     (authoring source)
commands/kaola-workflow-finalize.md:29                                        (generated)
plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md:29          (generated)
plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md:29           (generated)
scripts/validate-workflow-contracts.js:179                                    (guard)
plugins/kaola-workflow/scripts/validate-workflow-contracts.js:179             (guard, byte-copy)
plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js:204  (guard)
plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js:203    (guard)
scripts/sync-opencode-edition.js:420                                          (transform trigger)
scripts/sync-kimi-edition.js:412                                              (transform trigger)
scripts/test-opencode-edition.js:815                                          (test oracle)
```

Plus the negative pins on the retired variant `Agent Model Badge Contract` at
`scripts/validate-workflow-contracts.js:183`, `plugins/kaola-workflow/…:183`, gitlab `:208`,
gitea `:207` — inert, pass either way.

### `inherit` in frontmatter-rewriting context — FUNCTIONAL, keep entirely

| file:line | what |
|---|---|
| `install.sh:261` | `const rewritten = source.replace(/^model:\s*\S+\s*$/m, 'model: inherit');` |
| `install.sh:392, 447` | the awk twin and the byte-equal-to-source re-rewrite note |
| `install.sh:524-534` | `resolve_agent_model_for_install()` — "The source agent frontmatter is the ONLY model authority for the install." |
| `install.sh:540-546` | `model_for_placeholder()` — the 3 registered placeholders |
| `install.sh:561-597` | `render_command_file()` — fills `{X_MODEL}`; drops the whole line when the source says `inherit`; **hard-errors** (`exit 1`) if an inherit resolves in a non-`model=` context |
| `install-opencode.sh:596` | echo about opencode tier inheritance |

**This is why the placeholders are not cosmetic.** `install.sh:261` rewrites every *installed*
agent's frontmatter to `model: inherit`, and `docs/architecture.md:331-339` records that the
frontmatter step then skips `inherit`. So for an installed agent the explicit `model=` line in the
command is the **only** thing that sets the tier. Delete the placeholders and all three finalize
dispatches silently collapse to the session model. `docs/investigations/lean-orchestrator-contractor-2026-06-04.md:96-97`
records the same chain in the repo's own words: `resolver → '' → model= omitted → no badge → Opus`.

### `model=` in PROSE (as opposed to inside fenced dispatch cards)

Measured across `commands/`: **three prose lines, all inside the badge section**
(`commands/kaola-workflow-finalize.md:31,32,33`). The three card placeholders sit at `:87, :96, :155`
inside `` ```text `` fences. There is **no other prose `model=` on any canonical command surface.**
Related prose that carries the instruction without the word "badge":

- `docs/kimi-edition.md:91` — "All \"You MUST pass `model=` …\" dispatch instructions are rewritten to *\"Never pass a per-call model override; sub-agents inherit the session model.\"*" — **FUNCTIONAL doc of a live transform**; it would become false if the canonical instruction disappears.
- `docs/kimi-edition.md:332` — the K2 test description, same status.
- `docs/opencode-edition.md:44` — the rewrite-map table row: "Claude install-time `model=\"{...}\"` placeholders + all \"pass `model=`\" instructions rewritten to opencode's inheritance". Same status.
- `docs/opencode-edition.md:388` — "**model-prose consistency** (no contradictory \"pass `model=`\"…)".

**Neither `docs/kimi-edition.md` nor `docs/opencode-edition.md` contains the word "badge" at all.**
They are badge machinery under another name and the sketch did not list them.

---

## 3. Generated-surface map

`generate-routing-surfaces.js --check` → **exit 0, 18 surfaces byte-match**. Verified on both the
worktree and the scratch mirror.

`templates/routing/finalize.skeleton.md` renders 6 of the 18 surfaces:

| surface_type | forge | path | carries `## Agent Model Badge`? |
|---|---|---|---|
| command | github | `commands/kaola-workflow-finalize.md` | **yes** (`:29`) |
| command | gitlab | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | **yes** (`:29`) |
| command | gitea | `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | **yes** (`:29`) |
| skill | github | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | no |
| skill | gitlab | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | no |
| skill | gitea | `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | no |

**Every cosmetic badge hit in a rendered surface comes from exactly one place:**

- **Skeleton:** `templates/routing/finalize.skeleton.md`
- **Region:** `<!-- REGION:command … -->` at line **42**, closing `<!-- /REGION -->` at line **50**
- **Body:** lines **43–49** (the `## Agent Model Badge` heading, a blank, and the 4-line paragraph)

Two further `REGION:command` blocks in the same skeleton carry the dispatch cards and are
**FUNCTIONAL, not part of the badge section**: `:95-116` (tdd-guide + build-error-resolver cards) and
`:165-175` (doc-updater card), each paired with a `REGION:skill` counterpart at `:176`.

The other two skeletons (`init.skeleton.md`, `next.skeleton.md`) carry **no** badge content — their
6 surfaces each have zero `Agent(` blocks and zero `model=`.

---

## 4. Blast radius of deleting the canonical `## Agent Model Badge` section

**Method.** Scratch mirror of `HEAD`. Baselined all four relevant suites (all exit 0). Then removed
skeleton lines 42–50 (the REGION wrapper and its body, leaving `## Step 1 — Final validation`
intact), ran `generate-routing-surfaces.js --write` (rendered 18 surfaces, exit 0), confirmed the
heading is gone from all four files, and re-ran. Generated `.opencode/` and `.kimi/` trees were
deleted between runs so the edition suites self-provisioned from the mutated canonical rather than
stopping at their own D0 drift check.

### Measured results

| check | baseline | after removal | evidence |
|---|---|---|---|
| `generate-routing-surfaces.js --check` | exit 0, 18 surfaces | **exit 0**, 18 surfaces | no impact |
| `scripts/validate-workflow-contracts.js` (**claude chain**) | exit 0 | **exit 1** | `Error: commands/kaola-workflow-finalize.md must include: ## Agent Model Badge` at `:179` |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` (**gitlab chain**) | exit 0 | **exit 1** | `Error: plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge` at `:204` |
| `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` (**gitea chain**) | exit 0 | **exit 1** | `Error: plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md must include: ## Agent Model Badge` at `:203` |
| `scripts/test-opencode-edition.js` | exit 0, 563 assertions | **exit 1**, 560 passed / 1 failed | `FAIL: S2: at least ONE canonical command carries \`## Agent Model Badge\` (found 0 of 3) — with none, every per-file check below ranges over an empty expectation and this guard reports green by having had nothing to read` — `scripts/test-opencode-edition.js:817` |
| `scripts/test-kimi-edition.js` | exit 0, 516 assertions | **exit 0**, 516 assertions | **kimi is silent.** |
| `scripts/test-install-model-rendering.js` | (claude chain) | **exit 0** | `Install model rendering tests passed` |
| `scripts/edition-sync.js --check` | — | **exit 0** | `8 forge aggregator ports in parity` |
| `scripts/validate-kaola-workflow-contracts.js` (**codex chain**) | — | unaffected | contains no badge assertion (`git grep -i badge` → exit 1) |

Additional string-level result on the mutated command file:

```
PRESENT : workflow-state.md
ABSENT  : ## Agent Model Badge        -> validate-workflow-contracts.js:179 reds
ABSENT  : You MUST pass `model=       -> validate-workflow-contracts.js:180 reds (second failure)
PRESENT : model="{                    -> :181 and assertEveryDispatchHasModel(:182) still pass
```

**So three of the four `npm test` chains go red; the codex chain stays green.**

### The specific question: does the opencode/kimi anchored rewrite (a) throw, (b) silently no-op, or (c) leave a stale constant?

**Measured answer: (b) AND (c). It does NOT throw.**

Direct in-memory probe (`transformCommandBody` called on the canonical body with the section
excised; no files written):

```
badge sections removed from canonical body: 1
prose `model=` lines left in mutated body: 0  (only the 3 fenced card placeholders remain)

===== opencode =====
  baseline: OK, length=25483, carries edition marker=true
  mutated : NO THROW, length=25005, carries edition marker=false
  mutated : surviving `model=` lines: 0

===== kimi =====
  baseline: OK, length=25386, carries edition marker=true
  mutated : NO THROW, length=25309, carries edition marker=false
  mutated : surviving `model=` lines: 0
```

Why it does not throw, read from the code rather than inferred:

1. `sync-opencode-edition.js:415` runs `rewriteBadgeInstructions` first. Its predicate is
   `MODEL_MENTION = /model=/` scanned **per prose paragraph, fenced blocks excluded**
   (`:318-331`). With the badge section gone there is no prose `model=` paragraph left, so it
   returns the body unchanged and `OPENCODE_BADGE_GUIDANCE` is never emitted.
2. The heading match at `:420` (`/^##\s+Agent Model Badge\s*$/`) never fires, so
   `OPENCODE_BADGE_BLOCK` is never pushed. **This is a plain `if` with no `else` — the miss is
   silent by construction.**
3. `stripCardModelPlaceholders` (`:341-343`) is **line-anchored** on
   `^[ \t]*model="\{[^"\n]*\}",?[ \t]*$`, so it still removes the three card lines regardless.
4. `assertNoBadgeResidue` (`:350-367`) subtracts the two edition constants (a no-op, since neither
   was inserted) and then scans for `/model=/`. Zero matches. **No throw.** The `` `` `` empty-code-span
   probe also finds nothing, because a whole-section deletion cuts no code span.
5. `sync-kimi-edition.js` is the identical shape at `:399`, `:412-415`, `:334-345`.

**Stale constants left behind (dead code, unreachable, exported):**

- `scripts/sync-opencode-edition.js:251-261` `OPENCODE_BADGE_BLOCK` — never emitted
- `scripts/sync-opencode-edition.js:266-268` `OPENCODE_BADGE_GUIDANCE` — never emitted
- `scripts/sync-kimi-edition.js:250` `KIMI_BADGE_GUIDANCE` — never emitted
- exported at `sync-opencode-edition.js:966-967` and `sync-kimi-edition.js:822-823`

**Net effect on shipped output if the guards were also removed:** the generated opencode command
loses its `## Model and effort are inherited` block entirely, and the generated kimi skill loses its
`Never pass a per-call model override; sub-agents inherit the session model.` line. Both runtimes
would then ship a finalize surface that says nothing at all about model selection. Nothing in either
tree would object.

### Which assertions red, exactly

| file:line | assertion | fires? |
|---|---|---|
| `scripts/validate-workflow-contracts.js:179` | `assertIncludes(file, '## Agent Model Badge')` | **RED** (measured) |
| `scripts/validate-workflow-contracts.js:180` | `assertIncludes(file, 'You MUST pass \`model=')` | **RED** (string measured absent; masked by :179 throwing first) |
| `plugins/kaola-workflow/scripts/validate-workflow-contracts.js:179,180` | byte-copy | not chain-invoked — **fails on a pristine tree too** (`Error: commands/kaola-workflow-finalize.md is missing`, path-resolution under the plugin root). Must still be edited in lockstep for `validate-script-sync.js`. |
| `plugins/kaola-workflow-gitlab/…-contracts.js:204,205` | same two | **RED** (measured) |
| `plugins/kaola-workflow-gitea/…-contracts.js:203,204` | same two | **RED** (measured) |
| `scripts/test-opencode-edition.js:817` | `assert(badgeCarriers.length > 0, …)` | **RED** (measured) |
| `scripts/test-opencode-edition.js:831` / `:838` | the `sec !== null` / `sec === null` both-directions pin | not reached — the loop is entered but `canonCarriesBadge` is false for all 3, so it takes the `sec === null` arm, which passes. `:817` is the only failure. |
| `scripts/validate-script-sync.js:54` | root↔plugin byte-identity of `validate-workflow-contracts.js` | **RED if only one copy is edited** (measured: exit 1, `Out of sync (scripts/ vs plugins/kaola-workflow/scripts/)`) |
| `scripts/test-kimi-edition.js:308` | `!/MUST pass \`model=/` (negative) | passes — negative pin |
| `scripts/test-opencode-edition.js:396` | `!/MUST pass \`model=/` (negative) | passes — negative pin |
| `scripts/validate-workflow-contracts.js:183` (+3 copies) | `assertNotIncludes(file, 'Agent Model Badge Contract')` | passes — inert |
| `scripts/validate-workflow-contracts.js:181,182` | `model="{` + `assertEveryDispatchHasModel` | **pass** — the dispatch cards are untouched |

### The asymmetry worth flagging

The opencode suite catches the removal; the **kimi suite does not**, and this is already documented
in the kimi suite's own comment at `scripts/test-kimi-edition.js:320-332`:

> "THE INHERIT-MODEL PROSE REPLACEMENT HAS NO CARRIER LEFT. … The BAN half still runs … so what is
> lost is the positive half: nothing confirms the replacement PROSE is still emitted, because there
> is nothing left for it to replace."

Measured, that comment is accurate. If the badge section is removed and the kimi guidance stops
being emitted, **no kimi assertion notices.**

---

## 5. Anything that asserts on README badge prose

**Nothing.** Measured.

`scripts/validate-workflow-contracts.js` is the only script that content-asserts the repo's own
`README.md`, and its four assertions are:

```
:434  assertIncludes('README.md', 'Active folder coordination');
:435  assertIncludes('README.md', 'Parallel active work');
:436  assertIncludes('README.md', 'No lease/session layer remains.');
:437  assertConcept('README.md', 'pointer to detailed state contract', [...]);
:592  assertIncludes('README.md', 'Codex `' + name + '` plugin manifest: `' + manifest.version + '`');
```

None touches badge prose. `scripts/kaola-workflow-release.js:214` rewrites two version lines in
`README.md` at release time; neither is in a badge paragraph.

**But README.md is still test-consumed in the receipt sense.** It is a member of
`SELF_HOST_TEST_CONSUMED` (`scripts/kaola-workflow-adaptive-schema.js:905-906`, plus the three
byte-identical edition copies), so `isValidationInvisible()` returns **false** for it
(`:941`) — editing `README.md` **is** a code-relevant change and **will stale a chain receipt**.
`scripts/test-validation-allowband.js:103` pins that membership.

Practical consequence for the removal: the README edit is safe from any content assertion, but it
must land **before** the receipt run, not after.

---

## 6. Correction to the brief

The sketch stated that `docs/architecture.md:341-343` is "an overclaim ('every dispatch'), measured
false: only 3 dispatches carry a placeholder."

**Measured, the sentence is TRUE.** The full census of Claude Code command dispatch cards:

```
commands/kaola-workflow-finalize.md   ^Agent( = 3   subagent_type = 3   model= = 6 (3 prose + 3 card)
commands/workflow-init.md             ^Agent( = 0   subagent_type = 0   model= = 0
commands/workflow-next.md             ^Agent( = 0   subagent_type = 0   model= = 0
(same for both plugin forge editions)
plugins/*/skills/*/SKILL.md           ^Agent( = 0   subagent_type = 0   model= = 0
```

There are **3 dispatch cards in total across all Claude Code command surfaces, and all 3 carry a
placeholder**. "Every dispatch" is 3 of 3 — not a partial claim. `assertEveryDispatchHasModel`
(`scripts/validate-workflow-contracts.js:70-83`) is what keeps it true. The *cosmetic* half of that
sentence is only the trailing clause after the semicolon.

---

## 7. What I could not classify confidently

1. **`install.sh:786` message text — cosmetic, but its removal is a user-visible string change on
   an upgrade path.** The clause "model badges use explicit Agent model dispatch" is cosmetic by the
   owner's rule and is asserted nowhere (measured). What I cannot decide is whether the *sentence*
   should be reworded or dropped: the removal code around it is functional and its stderr line is
   how an operator learns a key was popped from their settings. This is a values call, not a fact.

2. **Whether the `## Agent Model Badge` heading string should be renamed rather than deleted.** The
   heading is the anchor for six code sites, three of which (`sync-opencode:420`,
   `sync-kimi:412`, `test-opencode:815`) are functional triggers with no fallback. A rename keeps
   every mechanism and changes only the word; a deletion requires rewriting all three transforms and
   removing the two opencode/kimi guidance constants. Which one the owner wants is not something a
   measurement decides. `scripts/test-opencode-edition.js:774-783` explicitly documents that the
   *opencode-side* heading has already moved twice and that both moves were caught by that suite —
   which is an argument that the anchor is worth keeping under some name.

3. **Comment text inside the sync/test scripts that names "badge".** I classified 12 such lines as
   "COSMETIC-adjacent" (`sync-opencode:234,237,298,308,413-414,423,432-433,480`;
   `sync-kimi:247,280,291,397,404-405,478`; `test-opencode:387,515,757,765,875`;
   `test-kimi:297,326`). Deleting a comment changes no behaviour, so by the strict rule they are
   cosmetic — but they are the *only* record of why each transform exists, and this repo's
   conventions treat a comment stating an observed failure as load-bearing. I did not treat them as
   removal targets; I flag them as a judgement the owner should make explicitly rather than have
   swept up by a `grep -i badge` pass.

4. **Whether the 218 archive hits should be verified individually.** I confirmed the category
   (dated run records under `kaola-workflow/archive/`, 82 files) and the precedent, but I did not
   read all 218 lines. If the owner wants a per-line archive audit, that is a separate measurement.

---

## Appendix — commands run, verbatim

```
git -C <worktree> rev-parse HEAD
git -C <worktree> grep -n -i -P 'badge' -- .                                   # 358
git -C <worktree> grep -n -i -P 'badge' -- . ':!kaola-workflow/archive'        # 140
git -C <worktree> grep -n  -P 'badge' -- . ':!kaola-workflow/archive'          # 70 (case-sensitive)
git -C <worktree> grep -n -i -P 'subagentstatusline|status[ -]?line|model[- ]switch' -- . ':!kaola-workflow/archive'
node <worktree>/scripts/generate-routing-surfaces.js --check                   # exit 0, 18 surfaces
git -C <worktree> archive HEAD | tar -x -C <scratch>/mirror
(cd mirror && node scripts/validate-workflow-contracts.js)                     # baseline exit 0
(cd mirror && node scripts/test-opencode-edition.js)                           # baseline exit 0, 563
(cd mirror && node scripts/test-kimi-edition.js)                               # baseline exit 0, 516
# mutate: splice out skeleton lines 42-50, then
(cd mirror && node scripts/generate-routing-surfaces.js --write)               # exit 0, 18 surfaces
(cd mirror && node scripts/generate-routing-surfaces.js --check)               # exit 0
(cd mirror && node scripts/validate-workflow-contracts.js)                     # exit 1
(cd mirror && node plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js)  # exit 1
(cd mirror && node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js)    # exit 1
rm -rf mirror/.opencode* mirror/.kimi*
(cd mirror && node scripts/test-opencode-edition.js)                           # exit 1, 560 passed 1 failed
(cd mirror && node scripts/test-kimi-edition.js)                               # exit 0, 516
(cd mirror && node scripts/test-install-model-rendering.js)                    # exit 0
(cd mirror && node scripts/edition-sync.js --check)                            # exit 0
# separate leg: restore scripts, delete only validate-workflow-contracts.js:179-180 in the ROOT copy
(cd mirror && node scripts/validate-script-sync.js)                            # exit 1, out of sync
node <scratch>/probe-delete-badge.js                                           # in-memory transform probe
```

Scratch artifacts (logs, probe script, mirror) are under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/badge-census/`.
