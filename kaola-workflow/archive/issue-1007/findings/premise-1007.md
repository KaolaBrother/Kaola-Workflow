# Investigation: issue #1007 — is `docs/decisions/D-645-01.md`'s "six" stale, and how far does the problem reach?

Read-only. No tracked file was modified. All mutation work was done in an isolated `git archive`
export under the session scratchpad.

## Setup

- **Commit:** `66ac0442c1f17a7878f19977572269cc4e42bc29` on `main`
- **Tree state:** clean except the untracked run folder
  - `git status --porcelain` → `?? kaola-workflow/issue-1007/`
- **Platform:** darwin 25.6.0, macOS, node via repo scripts. No `timeout` binary.
- **Not run** (per instruction and cost): `npm test`, `kaola-workflow-run-chains.js`.
- **Never run** (volume hazard): `git commit`, `git add -A`, `git write-tree` against the repo.
  Note: `computeCodeTreeHash` in `kaola-workflow-adaptive-schema.js:1058` internally calls
  `git add -A` against a temp `GIT_INDEX_FILE`; I deliberately did **not** invoke it, and measured
  its pure path filter `isValidationInvisible` instead.

Isolated mutation sandbox (used only in Part 3):

```
git archive HEAD | tar -x -C $SCRATCH/mut     # archive-exit=0
cp -R .opencode* .kimi* $SCRATCH/mut/         # gitignored edition trees, so suites are not vacuous
```

---

# Part 1 — re-verify the filed claims at HEAD

All three cited line numbers are **accurate**, and the quoted text matches verbatim.

### `docs/decisions/D-645-01.md:33-34` — ACCURATE

```
33:2. **Reach: embed, don't copy.** The identical `## First Principles` block is embedded byte-for-byte
34:   into all six workflow-init CLAUDE.md-template surfaces (3 Claude commands + 3 Codex SKILL packs),
```

The issue quotes the reach clause as beginning at `:34`. The sentence *starts* on `:33`; the
words the issue quotes ("into all six workflow-init CLAUDE.md-template surfaces (3 Claude commands
+ 3 Codex SKILL packs)") are all on `:34`. Citation is accurate as a locator for the quoted string.

### `docs/decisions/D-645-01.md:38-39` — ACCURATE

```
38:   (a blanked-file false-green guard) and that its trimmed content is byte-identical inside each of
39:   the six embeds. This is a content-comparison guard, not a `BYTE_IDENTICAL_GROUPS` entry — that
```

"the six embeds" is on `:39`, exactly as cited.

### `docs/decisions/D-645-01.md:69-70` — ACCURATE

```
69:- Future divergence between `templates/axioms.md` and any of the six embeds, or a missing axiom
70:  pointer on any of the six `next` surfaces, reds `npm test` immediately rather than drifting
71:  silently.
```

The issue's quote is accurate. Note the sentence continues onto `:71` (`silently.`), which the
issue's `:69-70` range truncates — immaterial to the claim.

### The counter-fact, measured

```
$ node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity
testAxiomBlockByteIdentity: PASSED (14 surfaces)
Walkthrough --only subset passed (1 scenarios)
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":7}
EXIT=0
```

Exit code read directly (`echo "EXIT=$?"` immediately after the node invocation, no pipe).

**The guard walks 14 surfaces. The ADR says six.** The 14, enumerated by re-deriving the guard's own
selection (`scripts/simulate-workflow-walkthrough.js:11421-11486`):

| # | surface | how the guard gets it |
|---|---|---|
| 1 | `commands/workflow-init.md` | registry row, `topic==='init'` |
| 2 | `plugins/kaola-workflow-gitlab/commands/workflow-init.md` | registry row |
| 3 | `plugins/kaola-workflow-gitea/commands/workflow-init.md` | registry row |
| 4 | `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` | registry row |
| 5 | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` | registry row |
| 6 | `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` | registry row |
| 7 | `.opencode/command/workflow-init.md` | rendered in memory by `sync-opencode-edition.js` |
| 8 | `.kimi/skills/workflow-init/SKILL.md` | rendered in memory by `sync-kimi-edition.js` |
| 9 | `.opencode-gitlab/command/workflow-init.md` | rendered in memory |
| 10 | `.kimi-gitlab/skills/workflow-init/SKILL.md` | rendered in memory |
| 11 | `.opencode-gitea/command/workflow-init.md` | rendered in memory |
| 12 | `.kimi-gitea/skills/workflow-init/SKILL.md` | rendered in memory |
| 13 | `CLAUDE.md` | `NAMED_SURFACES` (added by #1005) |
| 14 | `README.md` | `NAMED_SURFACES` (added by #1005) |

The guard's own width expectation (`simulate-workflow-walkthrough.js:11482`):

```js
const expected = routing.FORGES.length * (2 + runtimeEditionCount) + 2;
```

Measured terms at HEAD: `FORGES.length` = 3, `runtimeEditionCount` = 2
(`ls scripts/sync-*-edition.js` → `sync-kimi-edition.js`, `sync-opencode-edition.js`).
3 × (2 + 2) + 2 = **14**. Matches the printed 14.

**Part 1 verdict: the issue's three citations are accurate and its premise holds.** `D-645-01`
states six where the guard derives fourteen.

---

# Part 2 — the gap the issue did not measure

Scope swept: all 166 files in the named set — `docs/decisions/*.md` (159 ADRs), plus
`docs/architecture.md`, `docs/api.md`, `docs/conventions.md`, `docs/workflow-state-contract.md`,
`docs/README.md`, and repo-root `README.md` + `CLAUDE.md`.

Method: two greps, spelled-number and digit forms, over `(two|three|…|eighteen|[0-9]{1,2})` adjacent
to `(surface|embed|edition|runtime|forge|command|skill|script|agent|chain|role|copy|…)`, plus a
reversed-construction pass for `<noun> … is/are <number>`. 231 spelled hits + a digit pass; reduced
to 29 distinct (number, noun) claim types, each then checked by running or counting.

### Ground truths measured at HEAD

| quantity | true value | how measured |
|---|---|---|
| forges | 3 | `routing.FORGES` → `["github","gitlab","gitea"]` |
| runtimes | 4 | claude, codex + `ls scripts/sync-*-edition.js` = 2 additive |
| editions (script trees) | 4 | `find -name kaola-workflow-adaptive-schema.js` → 4 files, `md5 -q \| sort -u \| wc -l` → **1** (byte-identical) |
| routing surfaces total | 18 | `generate-routing-surfaces.js --check` → "all 18 surfaces byte-match the skeleton", exit 0 |
| routing topics | 3 | `Object.keys(routing.TOPICS)` → `["next","init","finalize"]` |
| tracked surfaces per topic | 6 | registry filter per topic |
| axiom-embed surfaces | 14 | guard output, Part 1 |
| `next` surfaces incl. additive editions | 12 | Part 3 |
| installed commands | 3 | `/workflow-init`, `/workflow-next`, `/kaola-workflow-finalize` |
| agent roles | 14 | `ls agents/*.md`=14; `ls plugins/kaola-workflow/agents/*.toml`=14; `DEFAULT_AGENT_MODELS` keys=14 |
| `SUPPORT_SCRIPTS` | 16 | `require('./scripts/kaola-workflow-install-manifest.js').SUPPORT_SCRIPTS.length` |
| walkthrough family | 6 | `find -name 'simulate-*walkthrough*.js'` (excl. `.git`, run folders) |
| `run-chains.js` copies | 4 | `git ls-files \| grep run-chains` — gitlab/gitea are **rename-normalized** (`kaola-gitlab-workflow-run-chains.js`) |

---

## 2A. STALE counts

### S1 — `docs/decisions/D-645-01.md:34` — "six" should be fourteen

```
34:   into all six workflow-init CLAUDE.md-template surfaces (3 Claude commands + 3 Codex SKILL packs),
```
Asserts **6**. True: **14**. The parenthetical decomposition (3+3) is also incomplete — it omits the
6 additive-edition surfaces and the 2 repo-root prose surfaces.

### S2 — `docs/decisions/D-645-01.md:39` — "the six embeds"

```
39:   the six embeds. This is a content-comparison guard, not a `BYTE_IDENTICAL_GROUPS` entry — that
```
Asserts **6**. True: **14**.

### S3 — `docs/decisions/D-645-01.md:69` — "any of the six embeds"

```
69:- Future divergence between `templates/axioms.md` and any of the six embeds, or a missing axiom
```
Asserts **6**. True: **14**.

### S4 — `docs/conventions.md:849` — "the twelve workflow-init … surfaces" — A SECOND, DIFFERENT STALE COUNT

```
848:humans decide values; own your own verdicts). It reaches consumers by EMBEDDING byte-identically
849:into the twelve workflow-init CLAUDE.md-template surfaces — never per-edition copies, since
```
Asserts **12** as the total reach. True: **14**. This is the same subject as S1-S3 but stuck one
generation later: it absorbed the opencode/kimi expansion (6→12) and missed #1005 (12→14).

**The issue did not know this site existed.** Its body says only `D-645-01` was checked.

### S5 — `docs/conventions.md:852` — "all twelve surfaces"

```
852:`testAxiomBlockByteIdentity`, comparing the canonical file's content against all twelve surfaces —
```
Asserts **12**. True: **14**. This one names the guard by name and states its width — it is the
closest prose analogue to the guard's own printed number, and it disagrees with it.

### S6 — `docs/conventions.md:335` — the guard's width FORMULA is quoted without its `+ 2` term

```
334:forge from both edition tables and it fails at 18→12, while the walkthrough's
335:`testAxiomBlockByteIdentity` passes at 12→8 surfaces, its width `FORGES.length × (2 +
336:runtimeEditionCount)` shrinking in lockstep with the registry it measures.
```
Asserts the width is `FORGES.length × (2 + runtimeEditionCount)`. The code at
`simulate-workflow-walkthrough.js:11482` is `routing.FORGES.length * (2 + runtimeEditionCount) + 2`.
The quoted formula is **missing the `+ 2`**, and the mutation figures follow it: "passes at 12→8"
should be 14→10 (3×4+2=14; delete a forge → 2×4+2=10).

This is a distinct defect class from S1–S5: not a stale cardinal, a **stale transcription of a code
expression**. It is also the one stale statement that could mislead someone reasoning about whether
the floor is anchored.

### S7 (weaker, historical) — ADRs whose counts no longer describe HEAD

These are dated decision records, and several are explicitly framed in past tense. Reporting them
for completeness, not as equivalent to S1–S6:

| file:line | asserts | true at HEAD |
|---|---|---|
| `docs/decisions/D-543-01.md:56` — "the 15 agent profiles are role-based" | 15 agents | **14** |
| `docs/decisions/D-543-01.md:141` — "the 15 agent profiles remain on-disk" | 15 agents | **14** |
| `docs/decisions/D-819-01.md:38` — "all 18 manifest entries (15 agent roles + 3 …)" | 15 roles | **14** |
| `docs/decisions/D-819-01.md:113`, `:158`, `:187` — same "18 manifest entries (15 agent roles …)" | 15 roles | **14** |
| `docs/decisions/D-530-01.md:71`, `D-530-02.md:81`, `D-703-01.md:102` — "CLAUDE.md:103 defines the SIX surfaces" | a line in `CLAUDE.md` | `CLAUDE.md` is 197 lines and contains **no** "six"/"3 Claude"/"3 Codex" text (`grep -ni "six\|3 Claude\|3 Codex" CLAUDE.md` → exit 1). The anchor is gone; the rule it names still holds (see C4). |

---

## 2B. CORRECT counts — the size of the problem

This is the larger half. The overwhelming majority of count statements in the swept corpus are
**true at HEAD**, which bounds the problem: this is a handful of sites about one subject, not a
corpus-wide rot.

### C1 — `README.md:42` — the ONLY prose in the corpus that states the true fourteen

```
42:That block is not a paraphrase of the canonical one — it is a byte-identical copy, and so are the
   twelve `workflow-init` surfaces this project ships (four runtimes × three forges) and the root
   `CLAUDE.md` it runs on. The test suite holds all fourteen to the same bytes, which means the
   axioms you just read are themselves one of the guarded surfaces.
```
"four runtimes × three forges" = 12 ✓. Plus `CLAUDE.md` plus README itself = **14** ✓. Correct, and
correctly decomposed. #1005 updated this file and not the two `docs/` sites.

**This yields a three-generation staleness gradient on one subject:**
`D-645-01` says **6** → `docs/conventions.md` says **12** → `README.md` says **14** (true).

### C2 — `docs/conventions.md:141` — correct, and already uses the derived-quantity idiom

```
141:- **Every routing surface is GENERATED, not hand-authored (issues #630, #812).** There are
    **three topics** — `next`, `init`, `finalize` (`TOPICS` in `scripts/generate-routing-surfaces.js`)
    — over the six edition trees above, so **18 surfaces total**. Read the count off
    `node scripts/generate-routing-surfaces.js --check`, which prints it, rather than from this sentence.
```
3 topics ✓, 18 surfaces ✓ (measured: `--check` prints "all 18 surfaces byte-match the skeleton",
exit 0). See Part 4 — this is the precedent.

### C3 — `docs/conventions.md:139` / `:701` — the #400 six-surface rule

```
139:- **Routing prose propagates to SIX prose surfaces, not ×4 (issue #400).** … the three Claude
    **commands** plus the three Codex **SKILL packs** …
701:The six routing surfaces from §Routing / adaptive prose (#400) are a subset of this set.
```
**TRUE.** 6 tracked surfaces per topic, measured off the registry. This count is *deliberately
forge-scoped* to Claude+Codex and explicitly excludes the additive editions by decision
(`D-530-02.md:81` "Wiring opencode in contradicts all"; `D-703-01.md:118`). It is not stale — it is
scoped.

### C4 — the ~60 "six-surface" hits across `docs/decisions/` — nearly all TRUE

Every one I inspected refers to the **#400 six-surface routing-prose rule** (3 Claude commands + 3
Codex SKILL packs), which is true at HEAD per C3. Sites: `D-419-01:14,152,178,215,237,270`,
`D-419-02:256`, `D-420-02:143`, `D-433-01:8,131,134,145,157`, `D-435-01:129,155`, `D-440-01:176`,
`D-441-01:193`, `D-445-01:19,42,170,230,231`, `D-497-01:54,89`, `D-500-01:11`, `D-500-02:10,30`,
`D-509-01:7`, `D-515-01:8,70`, `D-530-01:6,16`, `D-530-02:8,30,97`, `D-538-01:102`, `D-542-01:18`,
`D-543-01:10`, `D-570-01:9`, `D-591-01:80`, `D-606-01:96`, `D-607-01:10`, `D-611-01:132`,
`D-627-01:80`, `D-630-01:6`, `D-636-01:102`, `D-637-01:34,82`, `D-641-01:162`, `D-645-01:10`,
`D-646-01:53`, `D-653-01:90`, `D-703-01:102,118`, `D-725-01:10`, `D-765-01:10`,
`0013-successor-test…:460,465`.

**Only three of the ~60 are about the axiom embed rather than the routing rule** — and those three
are exactly S1, S2, S3. `D-645-01:10` ("#400 six-surface routing-prose rule") is *correct*, because
it cites #400, not the embed.

### C5 — other verified-correct counts

| file:line | claim | verified |
|---|---|---|
| `README.md:62` | "14 vendored roles across all four runtimes" | 14 ✓, 4 ✓ |
| `README.md:67` | "Four agent runtimes … across three forges" | ✓ |
| `README.md:152`, `:237`, `:1567` | "all four runtimes" | ✓ |
| `README.md:374` | "the three commands become directory-form Skills" | ✓ |
| `README.md:560` | "copies all 14 role TOMLs" | 14 ✓ |
| `CLAUDE.md:148` | "The installed command surface is three" | ✓ |
| `CLAUDE.md:78,132,137,175,181` | "four-chain" / "all four editions" / "all four chains" | ✓ (4 chains in `package.json`; 4 byte-identical schema copies) |
| `docs/architecture.md:83` | "all three commands" | ✓ |
| `docs/architecture.md:133`, `:297` | "four edition chains" / "**Four editions** … across three forge CLIs" | ✓ |
| `docs/architecture.md:316`, `docs/README.md:11` | "four runtimes" | ✓ |
| `docs/api.md:12` | "Three commands ship" | ✓ |
| `docs/api.md:392,393,430,487,501` | "all four editions" | ✓ |
| `docs/api.md:100,805,983,1310,1351,1567,1594` | "three forge editions" / "all three forges" | ✓ |
| `docs/api.md:1411` | "`kaola-workflow-roadmap.js` (all four editions) … are gone" | ✓ past-tense retirement note; ADR 0018 §5 |
| `docs/conventions.md:96` | "ships four editions (claude/codex/gitlab/gitea)" | ✓ |
| `docs/conventions.md:120` | "Four scripts" (generated forge aggregators) | ✓ `GENERATED_AGGREGATORS` len=4 |
| `docs/conventions.md:146` | "byte-identical ×4" | ✓ md5 unique = 1 across 4 copies |
| `docs/conventions.md:333` | "`registry derives 18 surfaces` … fails at 18→12" | ✓ 18 ✓ |
| `docs/conventions.md:695` | "all four editions … plus the opencode and kimi runtime editions" | ✓ |
| `docs/conventions.md:853` | "the six tracked command/skill files, plus the six opencode/kimi surfaces" | ✓ **as a decomposition** (6+6=12); incomplete only because it omits the 2 named surfaces |
| `docs/decisions/D-528-01.md:30` | "the four-copy `run-chains.js` dispatch loop … not the six-copy walkthrough family" | ✓ 4 ✓ 6 — **I initially mis-measured this as 2 copies**; `find -name 'kaola-workflow-run-chains.js'` misses the rename-normalized gitlab/gitea ports. `git ls-files \| grep run-chains` shows all four. |
| `docs/decisions/D-630-01.md:6,41,54,68,100` | "12 of the 18 surfaces" / "all 18 surfaces" | ✓ |

**Size of the problem: 6 live stale statements (S1–S6) across 2 files, all about one subject (the
axiom-block reach), plus a tail of historical ADR counts (S7). Every other count in the swept corpus
that I checked is true at HEAD.**

---

# Part 3 — the second count in `D-645-01:69-70`, which nobody had checked

The sentence carries two counts. The issue is about the first. The second is *"a missing axiom
pointer on any of the **six** `next` surfaces, reds `npm test` immediately."*

**Both halves of that clause are wrong, and the second half is wrong in a way the issue did not
anticipate: it is not a stale number, it is a claim about an enforcement mechanism that no longer
exists.**

### 3A. How many `next` surfaces exist

**6 tracked, 12 total.** Derived from the registry:

```
topic next -> 6 tracked:
  commands/workflow-next.md
  plugins/kaola-workflow-gitlab/commands/workflow-next.md
  plugins/kaola-workflow-gitea/commands/workflow-next.md
  plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
  plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
  plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
```
plus, rendered by the two additive-edition sync scripts, exactly as for `init`:
`.opencode{,-gitlab,-gitea}/command/workflow-next.md` and
`.kimi{,-gitlab,-gitea}/skills/workflow-next/SKILL.md`.

So "six" is true of the tracked registry and undercounts the shipped reach by 6 — the *same* 6→12
drift the `init` half suffered, one expansion behind.

### 3B. How many carry the pointer

**All 12.** Measured with the current wording (`grep -c 'break the tie by the First'`):

```
1  commands/workflow-next.md
1  plugins/kaola-workflow-gitlab/commands/workflow-next.md
1  plugins/kaola-workflow-gitea/commands/workflow-next.md
1  plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md
1  plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md
1  plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md
1  .opencode/command/workflow-next.md
1  .opencode-gitlab/command/workflow-next.md
1  .opencode-gitea/command/workflow-next.md
1  .kimi/skills/workflow-next/SKILL.md
1  .kimi-gitlab/skills/workflow-next/SKILL.md
1  .kimi-gitea/skills/workflow-next/SKILL.md
```
Zero on any `init` or `finalize` surface, as the ADR intends.

The pointer text, `templates/routing/next.skeleton.md:23-26`:

```
23:**First Principles.** When nothing already settles a situation, break the tie by the First
24:Principles axioms (the `## First Principles` block in your project's workflow-init `CLAUDE.md`),
25:applied in priority order. Recording a one-line derivation alongside the work is useful and never
26:required.
```

### 3C. What enforces it — the ADR's named mechanism is GONE

`D-645-01:42-49` says the pointer is:

```
45:   generated `next` surfaces, added as a new `nx-first-principles` entry (`topic:'next'`,
46:   `runtime_tag:'both'`, `surface_type_tag:'both'`) in `templates/routing/required-blocks.js`'s
47:   single-source manifest. The obligated surface set is *derived* from the tag pair by
48:   `scripts/test-route-reachability.js`, never a hand-typed file list — the same mechanism #630
49:   built to make a 4-of-6 propagation gap structurally impossible.
```

**`nx-first-principles` does not exist in `templates/routing/required-blocks.js` at HEAD.**

```
$ git show HEAD:templates/routing/required-blocks.js | grep -c "nx-first-principles"
0
```

A repo-wide grep finds it only in `CHANGELOG.md`, in archived run `.cache` notes from
bundle-645-646, and in `D-645-01:45` itself. It was **removed**, not renamed:

```
$ git log --oneline -S'nx-first-principles' -- templates/routing/required-blocks.js
ea84673d wip(877): extraction, agent prompts, and the routing surfaces
c4ae5c43 feat(adaptive): first-principles axiom layer + issue-scout model-tier governance (#645, #646)
```

`ea84673d` (2026-07-31) deletes the block, `git merge-base --is-ancestor ea84673d HEAD` → true. The
deleted entry, from `git show ea84673d`:

```js
  {
    // #645 axiom pointer — the shared-body First Principles reference line …
    block_id: 'nx-first-principles',
    topic: 'next',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      'First Principles axioms',
      'never cite one to skip a typed gate, refusal, or barrier',
    ],
  },
```

Both of its content tokens are also gone from the shipped prose — `grep -c` for each returns **0 on
all 12 surfaces**. The tighten-only clause was retired deliberately;
`scripts/test-opencode-edition.js:1036-1037` records why: *"The companion tighten-only clause … is
RETIRED with the typed gates it protected: there is no gate an axiom could be cited to skip."*

`docs/conventions.md:855-856` is already **ahead of the ADR** on this point:

```
855:… The six `next` routing surfaces carry a short reference pointer to the block rather than the
856:block itself; that pointer is prose the generator renders, not a `required-blocks.js` entry.
```

So `D-645-01` §3 and its consequence line describe a manifest entry that was deleted 18 days after
the ADR landed, and `conventions.md` documents the true mechanism while still carrying the stale 12
for the *other* count.

### 3D. Mutation proof — what actually reds

In the isolated sandbox, deleted the pointer paragraph from `next.skeleton.md` and regenerated.

Baseline (sandbox, before mutation):
```
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.   GEN_CHECK_BASELINE_EXIT=0
Route-reachability test passed (368 assertions).                              REACH_BASELINE_EXIT=0
```

After removing skeleton lines 23-27 and running `--write` (pointer count → 0 on all 12 surfaces):

| guard | result | exit |
|---|---|---|
| `generate-routing-surfaces.js --check` | "all 18 surfaces byte-match the skeleton." | **0** |
| `test-route-reachability.js` | "Route-reachability test passed (368 assertions)." | **0** |
| `simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` | "PASSED (14 surfaces)" | **0** |
| `test-generate-routing-surfaces.js` | "all 434 assertions passed." | **0** |
| `test-kimi-edition.js` | "kimi-edition test passed (642 assertions)." | **0** |
| **`test-opencode-edition.js`** | **2 failures** | **1** |

The only guard that fires:
```
FAIL: A25 (#645): opencode workflow-next must carry the First Principles axiom pointer (shared-body reference line)
FAIL: A25 (#645): opencode workflow-next must carry the priority-order clause
opencode-edition test FAILED: 2 failure(s), 676 passed.
```

Two facts about that single surviving guard:

1. **It covers 1 surface of 12.** `scripts/test-opencode-edition.js:998` — `const wfNext =
   read('.opencode/command/workflow-next.md');` — the github-forge opencode command only. The 6
   tracked Claude/Codex surfaces the ADR is actually about are unguarded; so are all 3 kimi
   surfaces and the 2 non-github opencode ones. `grep -n "First Principles"
   scripts/test-kimi-edition.js` → exit 1, no matches.
2. **It is not in `npm test`.** From `package.json`:
   - `test` = `test:kaola-workflow:claude && :codex && :gitlab && :gitea`
   - `test-opencode-edition.js` appears **only** in `test:kaola-workflow:editions`, which no other
     script invokes. `grep -rn "test-opencode-edition"` across `*.js`/`*.json`/`*.sh` finds one
     wiring: that opt-in script.

### 3E. Consequence for the issue's scope — stated plainly

**Yes, this materially changes the issue's scope.** The issue is framed as a stale cardinal in one
sentence of one ADR. The measurement says the same sentence also contains a **false mechanism
claim**:

> "a missing axiom pointer on any of the six `next` surfaces, reds `npm test` immediately"

- the count (six) understates the shipped reach (twelve), *and*
- **`npm test` does not red.** Nothing in any of the four chains detects a missing axiom pointer.
  Only the opt-in, never-mandated `test:kaola-workflow:editions` catches it, and only on 1 of 12
  surfaces.

Repairing `six` → `fourteen` in the first clause would leave this second clause asserting an
enforcement that does not exist. A reader trusting `D-645-01:69-70` today would believe the pointer
is machine-held across the fast gate; it is held by one assertion in a suite that is, per
`CLAUDE.md`, deliberately absent from `npm test`.

---

# Part 4 — is the durable fix mechanically available?

Mechanical facts only. No recommendation.

### 4A. Does anything generate or check prose counts in `docs/`?

**Generate: no. Check: once, and not a count of surfaces.**

- No script writes into `docs/`. `generate-routing-surfaces.js` emits only into `commands/` and
  `plugins/` (`[...new Set(GENERATED_SURFACES.map(s => s.path.split('/')[0]))]` → `commands, plugins`).
- Exactly **one** script reads a real file under `docs/`:
  `scripts/test-kernel-conformance.js:137` —
  `const CONTRACT_DOC = path.join(ROOT, 'docs', 'workflow-state-contract.md');`

  It parses a prose table out of that doc and asserts it agrees with a code registry row-for-row,
  **including the row count**:
  ```js
  equal(doc.length, code.length, 'the prose ruling and the registry have the same number of rows');
  ```
  Its own comment (`:140-142`): *"The doc is the human half of a two-sided single source, so it is
  PARSED, never merely eyeballed: a row edited in one place and not the other fails here."*

  Measured: `node scripts/test-kernel-conformance.js` → `kernel conformance tests passed (251
  assertions)`, **exit 0**. It is wired into
  `test:kaola-workflow:claude`, so it runs in the fast gate.

  This is a working precedent for *"a number in `docs/` prose, machine-bound to the code that
  produces it"* — but it binds a **table's row count**, not a cardinality sentence, and it reaches
  exactly one doc file.

### 4B. Is `docs/` reachable from `generate-routing-surfaces.js` or any validator?

**No, on both counts, and for `docs/decisions/` the exclusion is deliberate and documented.**

- `grep -n "docs" scripts/generate-routing-surfaces.js` → **no matches** (exit 0, zero lines).
- `grep -rnE "(readFileSync|readdirSync|existsSync|readFile)\(…docs/…" scripts/ plugins/*/scripts/
  templates/` → **no matches**. Every other `docs` reference in `scripts/` is either a comment or a
  tmp-repo *fixture* (`test-bash-block-guards.js`, `test-finalize-door.js` create their own
  `docs/note.md` inside a sandbox).
- The prompt-surface provenance validator excludes `docs/decisions/` **by construction**, with a
  stated reason — `scripts/validate-workflow-contracts.js:952-956`:
  ```
  // EXEMPT-LIST, NOT ALLOWLIST. Every .md/.toml under every declared root is scanned …
  // History is out of scope by construction — it is not under these roots: docs/decisions/,
  // docs/investigations/, docs/audits/, and CHANGELOG.md record what was decided and when,
  // and rewriting them would falsify the record.
  ```
- `docs/**` is also invisible to the chain-receipt freshness band. Measured directly on the pure
  filter (no git invoked):
  ```
  isValidationInvisible('docs/decisions/D-645-01.md', …, {self_host:true})  -> true
  isValidationInvisible('docs/conventions.md',        …, {self_host:true})  -> true
  isValidationInvisible('docs/architecture.md',       …, {self_host:true})  -> true
  isValidationInvisible('README.md',                  …, {self_host:true})  -> false
  isValidationInvisible('CLAUDE.md',                  …, {self_host:true})  -> false
  isValidationInvisible('CHANGELOG.md',               …, {self_host:true})  -> false
  ```
  So editing `docs/conventions.md` or `docs/decisions/D-645-01.md` does **not** stale a green
  chain receipt; editing `README.md` or `CLAUDE.md` **does** (on self-host). This is pinned:
  `scripts/test-validation-allowband.js:109` asserts
  `isValidationInvisible('docs/decisions/D-547-01.md') === true` with the comment
  *"control: an inert ADR must be excluded"*.

  (Correction to a note in my working context: the code-tree hash does **not** include `docs/` on
  self-host. What `self_host` flips is `README.md` and `CHANGELOG.md`.)

### 4C. Precedent for a doc sentence naming a derived quantity instead of a literal?

**Yes — one, and it is in the same file as two of the stale statements.**
`docs/conventions.md:141`:

> There are **three topics** … so **18 surfaces total**. **Read the count off
> `node scripts/generate-routing-surfaces.js --check`, which prints it, rather than from this
> sentence.**

It still writes the literal (18), but names the producer and instructs the reader to prefer it. The
producer does print it: `--check` → `"generate-routing-surfaces --check: all 18 surfaces byte-match
the skeleton."`, exit 0.

The equivalent producer for the axiom reach also prints its own count:
`simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` →
`"testAxiomBlockByteIdentity: PASSED (14 surfaces)"`. So the same idiom is mechanically available
for this subject.

A weaker second precedent: `docs/conventions.md:336-337` — *"That floor is left derived on purpose,
and says so where it is written."*

### 4D. Does any test read `docs/decisions/`?

**No — no test reads the contents of any file under `docs/decisions/`.** The only two references are
string literals passed to path-classification functions:

```
scripts/test-finalize-door.js:994:      assert(bk('docs/decisions/0017-the-mission-list.md') === true, 'T7: docs/** at any depth is bookkeeping');
scripts/test-validation-allowband.js:109: assert(pv.isValidationInvisible('docs/decisions/D-547-01.md') === true, 'control: an inert ADR must be excluded');
```

`grep -rn "docs/decisions" scripts/ plugins/*/scripts/ | grep -E "readFile|readdir|existsSync|glob"`
→ **no matches** (exit 1).

---

# Verdict on the premise

**HOLDS — and the issue understates the problem on two independent axes.**

1. **The filed claim is correct and its three citations are accurate.** `D-645-01:34`, `:39` and
   `:69` each say **six** where `testAxiomBlockByteIdentity` derives and prints **fourteen** (exit 0,
   run by name). Nothing about the citation is stale or misquoted.

2. **The gap the issue admitted it had not measured is real and non-empty.** Sweeping the whole
   named corpus turned up **three further stale statements in `docs/conventions.md`** — `:849` and
   `:852` asserting **twelve** for the same guard, and `:335` quoting the guard's width expression
   **without its `+ 2` term** along with the mutation figures that follow from it. `README.md:42` is
   correct at fourteen. The result is a three-generation gradient on one subject: **6 → 12 → 14**.

3. **The second, unexamined count in the same sentence is worse than stale.** `D-645-01:69-70`'s
   "a missing axiom pointer on any of the **six** `next` surfaces, reds `npm test` immediately" is
   wrong twice: the reach is **twelve**, and **`npm test` does not red at all**. The manifest entry
   the ADR names as the enforcement — `nx-first-principles` in `templates/routing/required-blocks.js`
   — was **deleted in `ea84673d` (2026-07-31)** and both of its content tokens are gone from every
   shipped surface. Mutation-proved: with the pointer stripped from all 12 surfaces,
   `generate-routing-surfaces --check`, `test-route-reachability`, `testAxiomBlockByteIdentity`,
   `test-generate-routing-surfaces` and `test-kimi-edition` all stay **green at exit 0**. The single
   guard that fires is `test-opencode-edition.js` A25, covering **1 surface of 12**, in a suite that
   is not part of `npm test`.

4. **Bounding the problem: it is narrow.** Of ~60 "six-surface" statements across `docs/decisions/`,
   only the three in `D-645-01` are about the axiom embed; the rest cite the #400 routing-prose rule,
   which is **true** and deliberately forge-scoped. Every other count class I checked — four
   editions, four runtimes, three forges, three commands, 18 surfaces, 14 roles, 16 support scripts,
   the four-copy `run-chains` / six-copy walkthrough family — is **true at HEAD**. The live defect is
   **6 statements across 2 files, all describing one subject**, plus a tail of dated ADR counts (S7).

5. **The durable fix is mechanically available, with a caveat about where it can land.** Both
   producers print their own count; there is an in-repo precedent for pointing prose at a producer
   (`conventions.md:141`) and a stronger one for machine-binding a doc number to code
   (`test-kernel-conformance.js`, parsing `docs/workflow-state-contract.md`, exit 0, in the fast
   gate). But **`docs/` is unreachable from every generator and validator today**, and
   `docs/decisions/` is excluded from the provenance validator *by an explicitly reasoned decision*
   about not rewriting history — so an ADR is the one place in the corpus where a
   machine-bound-count mechanism would cut against a standing design stance. `docs/conventions.md`
   carries no such exclusion.

---

# What I could not establish

- **Whether `ea84673d` intended to retire `nx-first-principles` or dropped it incidentally.** The
  commit is titled `wip(877): extraction, agent prompts, and the routing surfaces` and touches many
  files. I confirmed the deletion and that the pointer prose survived it, but I did not read the
  full diff or #877's record, so I cannot say whether the ADR was meant to be amended at that time.
  This is a values/history question, not a measurement.

- **Whether the retirement of the tighten-only clause was ratified anywhere authoritative.** I have
  only `scripts/test-opencode-edition.js:1036-1037` asserting it "is RETIRED with the typed gates it
  protected". `D-645-01` §5 still presents tighten-only as a hard boundary, and
  `docs/conventions.md:862-866` still documents it. Whether the *pointer* was meant to keep carrying
  it is unresolved by measurement.

- **Full-corpus certainty on ADR count staleness.** I swept the 166 named files with two number-word
  patterns plus a reversed-construction pass, and hand-checked every distinct (number, noun) class.
  A count phrased in a form none of those patterns match — spelled across a line break, embedded in a
  table cell I filtered, or expressed as "every"/"all" with no numeral — would have been missed. The
  S7 list is therefore a floor, not a complete enumeration.

- **`docs/investigations/` and `docs/audits/` were not swept.** They are outside the scope I was
  given (34 further files). Both are excluded from the provenance validator alongside
  `docs/decisions/`, so I would expect the same historical-record framing to apply, but I did not
  measure them.

- **I did not run `npm test` or `run-chains.js`,** so my claim that "nothing in the four chains reds
  on a missing axiom pointer" rests on (a) the per-suite mutation results above and (b) reading
  `package.json`'s chain composition, not on a full chain execution. The chains contain suites I did
  not individually mutate; a catch in one of those would refute this. The specific claim I did prove
  by mutation covers `generate-routing-surfaces --check`, `test-route-reachability`,
  `test-generate-routing-surfaces`, `testAxiomBlockByteIdentity` and `test-kimi-edition`.

- **Whether any consumer-side install surface carries a stale count.** I swept `docs/`, `README.md`
  and `CLAUDE.md` only. The generated command/SKILL surfaces and `AGENTS.md` were not swept for
  count prose.
