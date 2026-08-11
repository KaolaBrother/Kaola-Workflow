# Investigation: premise pass on #953 — "the code-producing roles carry no solution ladder"

## Setup

- Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`
- Commit: `483a5e5e` (branch clean throughout; `git status --short` empty at end — no tracked file touched)
- Box: darwin 25.6.0. `grep` is ugrep (skips dot-directories) — every dot-directory below was reached
  with explicit `find`/`ls` paths, never a bare recursive grep.
- Guard mutations were run against a **scratch mirror** at
  `/private/tmp/claude-501/.../scratchpad/mirror` (copies of `agents/ plugins/ scripts/ templates/`),
  restored and diff-verified clean after each leg.

---

## A. The three claims

### A1. implementer — "zero minimalism guidance"

**Verdict: CONFIRMED on solution minimalism; literally REFUTED if scope restraint counts.**

`agents/implementer.md` (97 lines) contains exactly two passages in the bearing set, both about
**scope**, neither about **solution size**:

> `agents/implementer.md:57`
> ```
> 2. **Make the change**: stay inside the scope you were given.
> ```

> `agents/implementer.md:87-89`
> ```
> ## Scope Discipline
>
> - Stay inside the assigned scope. Do not expand it without explicit approval.
> ```

A full-file grep for `simpl|minimal|minimum|minimize|smallest|speculative|abstraction|over-engineer|
YAGNI|surgical` returns **only those two lines plus the `## Scope Discipline` heading**. There is no
instruction to prefer the smallest construction, no "simplest thing that works", no
anti-speculative-abstraction clause.

The distinction matters and the filed wording blurs it:

- **scope restraint** = do not do more than the assignment. Present, twice, in force.
- **solution minimalism** = within the assignment, build the smallest thing that works. **Absent.**

There is also a **counter-pressure** the issue does not mention. The role's own objective section
pushes toward *more* code, not less:

> `agents/implementer.md:41-43`
> ```
> ## Your objective — be correct, not merely green
>
> **Make the behavior correct for every valid input, not just for the inputs the tests name.**
> ```

"correct for every valid input" is generality guidance. Nothing in the file balances it with a
size or restraint clause. So the implementer is not merely silent on minimalism — it carries one
line that reads as licence to generalise, unopposed.

### A2. planner — "one hit, incidental"

**Verdict: REFUTED on both count and characterisation. Two direct hits; one has its own H2.**

> `agents/planner.md:107,111` — under `## Best Practices`
> ```
> 3. **Minimize Changes**: Prefer extending existing code over rewriting
> ```

> `agents/planner.md:125-134` — its own H2 section
> ```
> ## Sizing and Phasing
>
> When the feature is large, break it into independently deliverable phases:
>
> - **Phase 1**: Minimum viable — smallest slice that provides value
> ...
> Each phase should be mergeable independently. Avoid plans that require all phases to complete
> before anything works.
> ```

Two adjacent passages also bear:

> `agents/planner.md:47` — `- Consider reusable patterns`
> `agents/planner.md:141` — `- Duplicated code` (a Red Flag)
> `agents/planner.md:121` — `3. Preserve existing functionality` (When Planning Refactors)

"one hit" is wrong (two direct). "incidental" is wrong for the second — `## Sizing and Phasing` is a
titled section, not a stray clause.

**The real planner gap is a different one.** Both hits are about **change size** and **delivery
slice size**. Neither is about **abstraction restraint**. `speculative`, `abstraction`, `simplest`
appear nowhere in `agents/planner.md`. So the half of the rule that code-architect carries is the
half planner is missing — and vice versa. Each of the two roles holds one half of one rule.

### A3. code-architect — "a thin second wording"

**Verdict: CONFIRMED. Two lines, both bullets, no heading of their own — and it is at least the
third wording of the same rule in this repo.**

Verbatim, the whole of it:

> `agents/code-architect.md:37-41`
> ```
> ### 2. Architecture Design
>
> - design the feature to fit naturally into current patterns
> - choose the simplest architecture that meets the requirement
> - avoid speculative abstractions unless the repo already uses them
> ```

Plus one adjacent line under `### 1. Pattern Analysis`:

> `agents/code-architect.md:35`
> ```
> - understand the dependency graph before proposing new abstractions
> ```

**Line count: 2 directly on-point (`:40`, `:41`), 4 counting `:35` and `:39`.** No dedicated
heading; they are bullets 2 and 3 of a three-bullet sub-step inside `## Process`.

**"Second wording" undercounts — there are at least four live wordings of one rule:**

| # | wording | where |
|---|---|---|
| 1 | "solve the requested problem, touch only what it requires, and add no speculative abstractions. **There is already too much in this project.**" | `CLAUDE.md:159` |
| 2 | "Keep it simple: solve the requested problem without speculative abstractions." | `templates/routing/init.skeleton.md:127` → renders to `commands/workflow-init.md:107`, 2× `plugins/*/commands/workflow-init.md:107`, 3× `plugins/*/skills/kaola-workflow-init/SKILL.md:62` |
| 3 | "choose the simplest architecture that meets the requirement" / "avoid speculative abstractions unless the repo already uses them" | `agents/code-architect.md:40-41` |
| 4 | "**Minimal Diffs** — Make smallest possible changes to fix errors" + a `### 2. Fix Strategy (MINIMAL CHANGES)` section | `agents/build-error-resolver.md:34,53-57`; as "Make the smallest change that addresses the failing command." in `plugins/*/agents/build-error-resolver.toml:17` |
| 5 | "Minimize Changes: Prefer extending existing code over rewriting" / "Minimum viable — smallest slice that provides value" | `agents/planner.md:111,129` |

`build-error-resolver` is worth reading before authoring anything: it already carries the fullest
ladder in the repo (a numbered fix strategy, a "No Architecture Changes" clause, and a `< 5% of
affected file` diff-size criterion), and #953 does not mention it.

---

## B. THE FINDING #953 DOES NOT NAME

**`agents/code-architect.md:40-41` does not reach the Codex carrier at all — in any forge, in the
repo or on this box's two installed Codex locations.**

Measured presence of each minimalism phrase across every carrier (`grep -c -i`):

| carrier | `simplest architecture` | `speculative abstraction` | `minimize changes` | `minimum viable` |
|---|---|---|---|---|
| `agents/code-architect.md` | 1 | 1 | 0 | 0 |
| `plugins/kaola-workflow/agents/code-architect.toml` | **0** | **0** | 0 | 0 |
| `plugins/kaola-workflow-gitlab/agents/code-architect.toml` | **0** | **0** | 0 | 0 |
| `plugins/kaola-workflow-gitea/agents/code-architect.toml` | **0** | **0** | 0 | 0 |
| `.opencode/agent/code-architect.md` | 1 | 1 | 0 | 0 |
| `.kimi/skills/kaola-role-code-architect/SKILL.md` | 1 | 1 | 0 | 0 |
| `~/.claude/agents/code-architect.md` | 1 | 1 | 0 | 0 |
| `~/.codex/agents/kaola-workflow/code-architect.toml` | **0** | **0** | 0 | 0 |
| `~/.codex/plugins/cache/.../7.6.0/agents/code-architect.toml` | **0** | **0** | 0 | 0 |
| `~/.config/opencode/agent/code-architect.md` | 1 | 1 | 0 | 0 |
| `~/.kimi-code/skills/kaola-role-code-architect/SKILL.md` | 1 | 1 | 0 | 0 |
| `agents/planner.md` and **all ten** of its carriers | 0 | 0 | **1** | **1** |
| `agents/implementer.md` and **all ten** of its carriers | 0 | 0 | 0 | 0 |

The entire `## Process` section of `agents/code-architect.md` — Pattern Analysis, Architecture
Design, Build Sequence — is absent from `code-architect.toml`, which is a from-scratch rewrite
(`Purpose:` / `Output contract:`), not a paraphrase of the canonical body. Planner's two hits, by
contrast, *were* hand-mirrored (`planner.toml:34`, `:42`).

So on Codex today, `code-architect` runs with **no** minimalism instruction. That is a live,
shipping gap independent of whatever #953 decides to add.

---

## C. Complete carrier table

Classification is measured, not eyeballed: `.toml` byte-identity by `shasum -a 256`; opencode/kimi
by calling each sync script's exported `renderAgent()` in-process and comparing the rendered body
against the canonical body byte-for-byte.

### C1. Tracked repo sources — 12 files

| path | runtime | byte-render or transform | anchor keyed on |
|---|---|---|---|
| `agents/implementer.md` | claude (canonical) | **SOURCE** | — |
| `agents/code-architect.md` | claude (canonical) | **SOURCE** | — |
| `agents/planner.md` | claude (canonical) | **SOURCE** | — |
| `plugins/kaola-workflow/agents/implementer.toml` | codex / github | **TRANSFORM** — hand-maintained paraphrase, structure preserved | none (hand-written) |
| `plugins/kaola-workflow/agents/code-architect.toml` | codex / github | **TRANSFORM** — independent rewrite; `## Process` dropped entirely | none (hand-written) |
| `plugins/kaola-workflow/agents/planner.toml` | codex / github | **TRANSFORM** — hand-maintained paraphrase, structure preserved | none (hand-written) |
| `plugins/kaola-workflow-gitlab/agents/{3}.toml` | codex / gitlab | **BYTE-IDENTICAL** to the github toml (sha256 equal, all 3 roles) | — |
| `plugins/kaola-workflow-gitea/agents/{3}.toml` | codex / gitea | **BYTE-IDENTICAL** to the github toml (sha256 equal, all 3 roles) | — |

sha256 (16-char prefix), proving the codex triple:
`implementer 072e7aeda5e10105` · `code-architect 5db48d70e206c4ee` · `planner 2e3ba53ca3c3b71a`
— identical across all three plugin trees.

### C2. Generated repo trees — 18 files (untracked, gitignored: `.gitignore:5-10`)

Produced by `scripts/sync-opencode-edition.js --write` / `scripts/sync-kimi-edition.js --write`,
which both installers call as `--check || --write`.

| path | runtime | byte-render or transform | anchor keyed on |
|---|---|---|---|
| `.opencode/agent/{3}.md` | opencode / github | **BODY BYTE-IDENTICAL** to canonical body; frontmatter replaced | frontmatter `---` fences only |
| `.opencode-gitlab/agent/{3}.md` | opencode / gitlab | same | same |
| `.opencode-gitea/agent/{3}.md` | opencode / gitea | same | same |
| `.kimi/skills/kaola-role-{implementer,code-architect}/SKILL.md` | kimi / github | **BODY BYTE-IDENTICAL** | frontmatter fences only |
| `.kimi/skills/kaola-role-planner/SKILL.md` | kimi / github | **BODY VERBATIM + one prepended line** | canonical `tools:` list (no `bash` ⇒ restriction line) |
| `.kimi-gitlab/…`, `.kimi-gitea/…` (3 roles each) | kimi / gitlab, gitea | same as `.kimi` | same |

Proof (in-process `renderAgent`, all three forges):

```
implementer     opencode/{github,gitlab,gitea}  bodyIdentical=true   canonSha=6e499dfe80587004
code-architect  opencode/{github,gitlab,gitea}  bodyIdentical=true   canonSha=7e1ce26a0e8f0789
planner         opencode/{github,gitlab,gitea}  bodyIdentical=true   canonSha=a67aecaf8ce9e261
implementer     kimi/{github,gitlab,gitea}      bodyIdentical=true   canonSha=6e499dfe80587004
code-architect  kimi/{github,gitlab,gitea}      bodyIdentical=true   canonSha=7e1ce26a0e8f0789
planner         kimi/{github,gitlab,gitea}      bodyIdentical=false  bodyContainsCanonVerbatim=true
```

The planner/kimi delta is exactly one prepended paragraph and nothing else (suffix delta = `""`):

```
**Tool restriction:** this role may not run shell commands. If the task cannot be completed
without that, report it as a finding and stop — never do it yourself.
```

**On the silent-anchor risk.** The transforms *do* carry anchor-keyed rewrites — the
`## Agent Model Dispatch` heading (`sync-opencode-edition.js:413`, `sync-kimi-edition.js:398`,
both `/^##\s+Agent Model Dispatch\s*$/`), `--runtime claude`, and Claude script-path patterns.
**None of the three roles' bodies contains any of them** (measured: grep for
`Agent Model Dispatch|model=|--runtime claude|scripts/kaola-workflow` over the three canonical
files returns nothing). `opencodeAgentSuffix()` returns `''` for every role. So for these three
roles the body transform is the identity function, and a new section added to `agents/<role>.md`
reaches opencode and kimi **automatically and byte-for-byte, with no anchor to miss** — provided
the new section does not itself use the heading `## Agent Model Dispatch`, which would be
rewritten/stripped.

### C3. Installed copies on this box — 15 files (+2 stale legacy)

| path | runtime | relation to repo source |
|---|---|---|
| `~/.claude/agents/{3}.md` | claude | canonical `.md` with exactly one line changed: `model: sonnet\|opus` → `model: inherit`. Body identical (`diff` shows only line 4/5). |
| `~/.codex/agents/kaola-workflow/{3}.toml` | codex | **byte-identical** to `plugins/kaola-workflow/agents/*.toml` |
| `~/.codex/plugins/cache/kaolabrother-kaola-workflow/kaola-workflow/7.6.0/agents/{3}.toml` | codex | **byte-identical** to the same |
| `~/.config/opencode/agent/{3}.md` | opencode | **byte-identical** to `.opencode/agent/*.md` |
| `~/.kimi-code/skills/kaola-role-{3}/SKILL.md` | kimi | **byte-identical** to `.kimi/skills/kaola-role-*/SKILL.md` |
| `~/.codex/archive/legacy-codex-workflow-.../0.2.1/agents/{code-architect,planner}.toml` | codex (legacy) | stale archive of codex-workflow 0.2.1; not on any live path |

Note there are **two** live installed Codex locations, not one: `~/.codex/agents/kaola-workflow/`
*and* the versioned plugin cache. Both must be counted when checking "did it ship".

Kimi installs to `~/.kimi-code/skills/`, **not** `~/.kimi/` (`~/.kimi` on this box holds only
`kimi-claw/log`).

### C4. Not carriers (checked and excluded)

`commands/workflow-init.md:139,141,144`, `templates/routing/init.skeleton.md:159,161,164` and
`templates/reviewers/behavior-contracts.json:140` mention the role **names** only — dispatch and
custody prose, not role prompt text. `templates/axioms.md` is the CLAUDE.md/AGENTS.md axioms
template. `templates/routing/` holds command and SKILL skeletons only; **no agent text renders
from a skeleton.**

### C5. Total

**45 live files** carry these three roles' prompt text: 12 tracked repo sources, 18 generated repo
files, 15 installed (+2 stale legacy). Per role: 15 live carriers each.

---

## D. The authoring surface

**No agent prompt renders from a `templates/` skeleton.** The `templates/routing/` regenerate rule
in `CLAUDE.md` covers command and SKILL surfaces, not agents. There is also **no generator that
writes the hand-maintained `plugins/*/agents/*.toml`** — `generate-reviewer-profiles.js` owns
exactly 12 output paths, all for the three reviewer roles (`code-reviewer`,
`adversarial-verifier`, `security-reviewer`). `implementer`, `code-architect` and `planner` are
hand-maintained on both sides.

| role | author the new section in | then hand-mirror into | regenerate the rest with |
|---|---|---|---|
| implementer | `agents/implementer.md` | `plugins/kaola-workflow/agents/implementer.toml`, `-gitlab/`, `-gitea/` (3 files, must stay byte-identical) | opencode+kimi follow automatically |
| code-architect | `agents/code-architect.md` | `plugins/kaola-workflow{,-gitlab,-gitea}/agents/code-architect.toml` | opencode+kimi follow automatically |
| planner | `agents/planner.md` | `plugins/kaola-workflow{,-gitlab,-gitea}/agents/planner.toml` | opencode+kimi follow automatically |

Regeneration commands for the additive editions (per forge — `github`, `gitlab`, `gitea`):

```
node scripts/sync-opencode-edition.js --forge=<f> --write
node scripts/sync-kimi-edition.js     --forge=<f> --write
```

Reinstall (which does `--check || --write` for both, then deploys): `./install-all.sh --global --yes`.

**Consequence for #953's proposed remedy.** "Author it once, render to every carrier" is achievable
for **10 of the 15** carriers per role (canonical → opencode ×3 → kimi ×3 → the installed copies of
those). It is **not** achievable for the 3 Codex `.toml` files with current machinery: they are
hand-written prose with no generator and no anchor. The choices are (a) hand-mirror + pin, or
(b) enrol these roles in a generator like the reviewers — a much larger change. This is exactly the
seam that already dropped `code-architect`'s existing two lines.

---

## E. The parity guard

`scripts/test-agent-profile-parity.js` (732 lines). Wired into **both** test tiers
(`package.json:40` fast gate, `:46` full) and pinned by `validate-workflow-contracts.js:884` and
`validate-kaola-workflow-contracts.js:588`. It runs at full coverage in the fast gate — it is not
one of the sampled suites.

**What it compares.** Only `agents/*.md` ↔ `plugins/{kaola-workflow,-gitlab,-gitea}/agents/*.toml`.
Three mechanisms:

1. **Consensus baseline.** A normalized *sentence* carried by ≥ `ceil(11 × 2/3) = 8` of the 11
   hand-maintained canonical `.md` files becomes a shared rule, then required in every `.md` **and**
   all 33 `.toml` twins.
2. **Role pins** (`ROLE_PINS`, lines 37-56): 8 pins over 3 roles — `implementer` ×3 (test custody),
   `tdd-guide` ×3, `metric-optimizer` ×2. Presence-FIRST: the pin must match its source `.md`
   before twins are checked. **No pin touches minimalism.**
3. **Safety baseline** (6 verbatim prompt-defense sentences) + Codex TOML grammar + `.toml`
   byte-identity across the three trees.

**Baseline:** `node scripts/test-agent-profile-parity.js` → `784 assertions`, exit 0.

### Would it catch a new section landing in some carriers but not others?

**Not at #953's scope. Measured, not reasoned.** Threshold sweep — the same 126-char sentence added
to N canonical `.md` files, **no `.toml` touched**, guard run after each:

| `.md` roles carrying the new rule | guard exit | |
|---|---|---|
| **3 / 11 (implementer + code-architect + planner — exactly #953's scope)** | **0** | **GREEN — blind** |
| 4 / 11 | 0 | GREEN — blind |
| 5 / 11 | 0 | GREEN — blind |
| 6 / 11 | 0 | GREEN — blind |
| 7 / 11 | 0 | GREEN — blind |
| 8 / 11 | 1 | RED — caught |
| 9–11 / 11 | 1 | RED — caught |

At 11/11 the failure is explicit and useful (33 `md↔toml drift` failures, one per twin, each naming
the missing sentence). At 3/11 the run is indistinguishable from baseline: `784 assertions`, exit 0,
no line mentions the new rule.

### Blind spots, each measured

1. **Sub-threshold distribution.** A rule in fewer than 8 of the 11 hand-maintained profiles is
   invisible — the guard never learns it is a rule. **#953's scope is 3.**
2. **`MIN_RULE_CHARS = 48` (line 93).** A 37-char rule ("Prefer the smallest thing that works.")
   added to **all 11** `.md` and **zero** `.toml` → exit 0, `784 assertions`. Below the bar the
   distribution does not matter. This is the repo's own recorded pattern: *a threshold cannot see a
   rule beneath its bar.* Any new section must therefore state its rule in a sentence of **≥ 48
   normalized characters** to be guardable at all.
3. **Headings are never units.** `## Solution ladder` is 18 chars, so it is dropped like any short
   fragment. A `.toml` could carry the sentence with no heading and pass; a heading with no sentence
   is invisible entirely. Confirmed: every failure message in the 11/11 leg names the sentence,
   never the heading.
4. **opencode and kimi are outside this guard completely.** They are covered instead by
   `test-opencode-edition.js` / `test-kimi-edition.js`, which re-render from canonical and compare —
   a *stronger* check, but one that **skips loudly when the tree is absent** (`.opencode*`/`.kimi*`
   are gitignored, so absent in a fresh clone and in every worktree — `test-opencode-edition.js:58-64`).
   These suites are also not in `npm test` (opencode/kimi are additive editions).
5. **Self-approving deletion has a margin of 3, not immunity.** The guard's own comment says sitting
   below unanimity stops a one-profile deletion being self-approving. True — but deleting a shared
   rule from **4** of 11 profiles at once drops it to 7/11, below threshold, and it silently stops
   being a baseline rule with no failure.
6. **NOT blind by capitalization.** `carriesRule` (line 124) lowercases both sides. Probed directly:
   the rule in the `.md` and an **ALL-CAPS** spelling in all 9 `.toml` files → exit 0, i.e. the
   ALL-CAPS spelling satisfies the guard. The prior capitalization-blindness defect class does not
   apply here.

### The remedy route works — measured

Adding three `ROLE_PINS` entries (one per role) arms it. Two legs, on the scratch mirror:

| leg | result |
|---|---|
| pins added, rule **not yet** in the `.md` | exit 1 — `role pin "…" is NO LONGER in agents/implementer.md` (presence-FIRST fires) |
| pins added + rule in all 3 `.md`, **no** `.toml` | exit 1 — **9 failures**, one per `<tree>/<role>.toml`: `role pin "…" is in agents/implementer.md but MISSING from plugins/…` |

So a pin per role closes the codex seam and makes the mirror obligation loud, at 3 lines of guard
change. That is the only mechanism in the repo that would have caught the existing
`code-architect` drop.

---

## Observations table

| measurement | command | result | exit |
|---|---|---|---|
| minimalism vocabulary, 3 canonical + 3 toml | `grep -n -i -E 'simpl\|minimal\|minimum\|minimize\|smallest\|speculative\|abstraction\|surgical\|scope'` | implementer 3 (scope only); code-architect 3; planner 3; implementer.toml 3 (scope only); **code-architect.toml 0**; planner.toml 3 | 0 |
| codex toml byte-identity ×3 trees | `shasum -a 256` | identical for all 3 roles | 0 |
| opencode/kimi body render ×3 roles ×3 forges | in-process `renderAgent()` | 17/18 body byte-identical; planner/kimi = +1 prepended restriction line | 0 |
| carrier presence matrix (11 paths × 3 roles) | `grep -c -i` on 4 phrases | code-architect minimalism absent from all 3 repo toml + both installed codex locations | 0 |
| parity guard baseline | `node scripts/test-agent-profile-parity.js` | `784 assertions` | 0 |
| mutation A — 1/11 `.md`, 0 `.toml` | scratch mirror | `784 assertions`, no mention of the rule | 0 |
| mutation B — 11/11 `.md`, 0 `.toml` | scratch mirror | `33 failures, 785 passed`, each naming a `.toml` | 1 |
| mutation C — 37-char rule, 11/11 `.md`, 0 `.toml` | scratch mirror | `784 assertions` | 0 |
| threshold sweep N=3..11 | scratch mirror | flips RED at exactly **8/11** | 0/1 |
| role-pin proof, leg 1 (source missing) | scratch mirror | pin fails by name | 1 |
| role-pin proof, leg 2 (3 `.md`, 0 `.toml`) | scratch mirror | 9 toml failures | 1 |
| case-sensitivity probe (ALL-CAPS toml) | scratch mirror | passes ⇒ case-folded | 0 |
| installed claude vs canonical | `diff` | only `model:` line differs | 1 (diff) |
| installed codex/opencode/kimi vs repo | `shasum -a 256` | byte-identical, all 3 roles, all runtimes | 0 |

## Inferences

- **The load-bearing defect for #953 is a mirroring gap, not an authoring gap.** code-architect's
  two lines exist and are correct; they simply never reached Codex. Adding a fourth wording without
  a pin reproduces that failure at four times the scale. — confidence: high; refuted by finding a
  generator or transform that populates the hand-maintained `.toml` (I found none:
  `generate-reviewer-profiles.js` owns 12 paths, none of them these roles).
- **implementer and planner each hold one half of one rule** — planner has change-size, no
  abstraction restraint; code-architect has abstraction restraint, no change-size; implementer has
  neither, plus an unopposed generality instruction. — confidence: high; the grep is exhaustive over
  the vocabulary set and the files are short enough to have been read in full.
- **A section authored only across these three roles is unguarded unless pinned**, and its rule
  sentence must be ≥ 48 normalized characters to be pinnable at all. — confidence: high; both
  measured directly.

## Open

- I did not check the **gitlab/gitea `commands/`** and **`skills/`** trees for a fifth wording
  beyond the `workflow-init` rendering already found; the grep covered them but only for the exact
  phrases listed.
- I did not run `test-opencode-edition.js` / `test-kimi-edition.js` (spawn-heavy, and the worktree
  has no generated trees so D0 would skip). Their `--check` semantics were read, not executed.
- Whether the owner wants a fourth wording at all, versus consolidating the five that exist, is a
  values call and not mine.
