# impl-docs-2 — docs group 2 (D3, D7, D2)

**Task:** three prose repairs in `docs/kimi-edition.md`, `docs/opencode-edition.md`, `docs/README.md`.
**Work tree:** `.kw/worktrees/bundle-956-957-958-959-960-961-962` on `workflow/bundle-956-957-958-959-960-961-962`
(confirmed with `git rev-parse --abbrev-ref HEAD`).
**Verification tier:** `build-green` — see the caveat in "Verification" below; this repo has no
markdown build/lint, so the executed checks are the link resolver plus the greps recorded here.

**Files changed (exactly three, nothing else):**

```
 docs/README.md           | 2 +-
 docs/kimi-edition.md     | 4 ----
 docs/opencode-edition.md | 8 ++++----
 3 files changed, 5 insertions(+), 9 deletions(-)
```

---

## EDIT 1 — D3, `docs/kimi-edition.md:97-100` — DELETED, not replaced

**Deviation from the brief, flagged deliberately.** The brief gave a recommended replacement bullet
*and* the condition "check the sibling bullet at ~:90 first — it may already cover the 'skip' fact,
in which case avoid restating it." The condition holds for **every clause** of the recommended
replacement, so the bullet is deleted outright rather than replaced. Reverting to the replacement
text is a 4-line re-add if you disagree.

Before (`:97-100`):

```markdown
- The adaptive planner's per-node tier (`reasoning`/`standard`) survives as **metadata
  only**: it is recorded in the dispatch packet and ledger, and `modelDisplay()` renders it
  as `parent session (<tier> tier metadata)` — the same semantics as the Codex edition. It
  maps to no effort or model at runtime.
```

After: the bullet is gone; the list ends at the `model=` rewrite bullet (`:91-96`) and the
`**Declared runtime divergence.**` paragraph follows.

Clause-by-clause redundancy check against the surviving text of the *same* section
("One model tier — every subagent inherits the session model", `:80-96`):

| clause of the recommended replacement | already carried by |
|---|---|
| "the kimi render drops the field" | `:88` "Generated skills carry **no `model:` field**" **and** `:90` "The canonical `model:` tier markers are skipped entirely" |
| "nothing maps it to a model or effort at runtime" | `:90` "— meaningless under inherit" **and** `:88` "no effort config is seeded anywhere" **and** the section heading itself |
| "declarative metadata only" | a label for the same fact; root `README.md:361` already uses this exact wording for kimi ("a role's tier is declarative metadata only") |
| "(a Skill is a prompt package)" | the only genuinely new nugget — the phrase appears nowhere in the file. Not added: the reason that governs *this* section is inherit, not the prompt-package reason for dropping `tools:`, and adding it would give one fact two competing explanations. |

Nothing reader-facing is lost: the bullet's *subject* — "the adaptive planner's per-node tier …
recorded in the dispatch packet and ledger" — is machinery ADR 0017 retired. There is no planner
node, no dispatch packet and no ledger to describe.

Evidence re-verified in this tree, not taken from the premise report:
- `git grep -nF modelDisplay` over the tracked tree: zero hits in `scripts/`, `plugins/`,
  `templates/`, `commands/`, `agents/`, `hooks/` and the dot trees. Live hits were
  `docs/kimi-edition.md:98` (now gone) and `docs/decisions/D-703-01.md:59` (a decision record —
  history by the stated retention policy, correctly not filed); the rest are `CHANGELOG.md`,
  `kaola-workflow/.origin/` and `kaola-workflow/archive/`.
- `scripts/sync-kimi-edition.js:207-208` confirms the drop verbatim: "`tools:` and `model:` are
  DROPPED: a Kimi Skill is a prompt package, not an agent definition, and every subagent inherits
  the session model (no tiers)."
- `scripts/validate-kaola-workflow-contracts.js:468` reads "their declarative tier metadata remains
  separate while the catalog derives the role SET only" — note this is a **comment inside
  `deriveCodexRoleCatalog()`**, i.e. supporting prose about the Codex catalog, not an executed
  assertion that the tier is inert. The load-bearing evidence for the kimi claim is the render drop
  above, not this line. (Recorded because the brief described `:468` as a check.)

## EDIT 2 — D7, `docs/opencode-edition.md:121-125` — pointer replaces the hand-typed roster

Before:

```markdown
The seeded `opencode.json` carries this as a commented-out scaffold: a top-level `model` for the
standard tier and `agent.<role>.model` overrides for the seven reasoning-tier roles
(`adversarial-verifier`, `build-error-resolver`, `code-architect`, `code-reviewer`, `planner`,
`security-reviewer`, `synthesizer`). With nothing set, every role inherits the model you already
use.
```

After:

```markdown
The seeded `opencode.json` carries this as a commented-out scaffold: a top-level `model` for the
standard tier and `agent.<role>.model` overrides for the reasoning-tier roles. That roster is
derived from the `model:` tier in `agents/*.md` and written into the scaffold, never hand-listed
here — read the current roles from the scaffold comment itself. With nothing set, every role
inherits the model you already use.
```

The count word is out, per the brief. Both halves of the pointer were verified true before writing it:
- derivation — `scripts/sync-opencode-edition.js:565-574`, `reasoningRoles()` maps `listCanonAgents()`
  over `agents/*.md`, filters `roleTier(parseFrontmatter(c).fm.model) === 'reasoning'`, sorts;
- the scaffold comment really is where the list lands — tracked `opencode.json:5-25` carries it as a
  commented block naming the roles at `:8` and the per-role `agent.<role>.model` entries at `:17-25`,
  so "read the current roles from the scaffold comment itself" resolves to something that exists.

## EDIT 3 — D2, `docs/README.md:20`

Before:

```markdown
- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; provider-open two-tier effort mapping; installs via `install-opencode.sh`).
```

After:

```markdown
- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` + `.opencode/` tree; model and effort inherited from the session, opt-in per-tier model pin; installs via `install-opencode.sh`).
```

Verbatim as the brief specified; the clause is kept, not deleted, so the sibling kimi line at `:21`
keeps its symmetry. Wording is the linked doc's own (`opencode-edition.md:88`, `:374`). Line 20 was
found byte-identical to the audit's cited line 17, exactly as the premise report predicted.

---

## Verification

Baseline before: the tree already carried other agents' in-flight edits (`CHANGELOG.md`,
`docs/architecture.md`, `docs/conventions.md`, four `scripts/*`, two deletions staged). Per the brief
no suite or chain was run, before or after — the tree is transiently inconsistent. This is why the
tier is qualified rather than asserted from a suite run.

| check | command | exit | result |
|---|---|---|---|
| V1 `modelDisplay` gone from my file | `grep -n modelDisplay docs/kimi-edition.md` | 1 | absent |
| V1b no orphan "dispatch packet"/"ledger"/"tier metadata" | `grep -nE 'tier metadata\|dispatch packet\|ledger' docs/kimi-edition.md` | 0 | one hit, `:95` "plan-ledger tier tokens" — a **different, live** fact (the portable cross-edition tokens), correctly kept |
| V2 roster no longer hand-listed | `grep -nE 'adversarial-verifier\|build-error-resolver\|security-reviewer\|synthesizer' docs/opencode-edition.md` | 0 | two hits, `:59` and `:73`, both in **## Reviewer behavior derivation** — a different subject (which roles are generated reviewer profiles), not the reasoning-tier roster. The roster passage carries no role names. |
| V2b count word gone | `grep -nw seven docs/opencode-edition.md` | 1 | absent file-wide |
| V3 stale phrase gone | `grep -n 'two-tier effort mapping' docs/README.md` | 1 | absent |
| no other doc hand-lists the roster | `git grep -nP 'adversarial-verifier.{0,80}build-error-resolver\|build-error-resolver.{0,80}code-architect' -- docs README.md` | 1 | no hits — D7's restatement was the only one |
| relative links resolve in all three files | inline node link resolver over `docs/{README,kimi-edition,opencode-edition}.md` | 0 | 18 relative links checked, 0 broken (absolute URLs excluded) |

Consumer sweep (why none of the three stales the receipt):
`git grep -nE 'kimi-edition\.md|opencode-edition\.md|docs/README\.md' -- scripts plugins templates hooks install*.sh package.json`
returns no reader of file *content*. The hits are (a) `scripts/test-kimi-edition.js:398`, a comment
that says the opposite of consumption — "Prose in docs/kimi-edition.md cannot satisfy that: deleting
a paragraph is invisible to every suite", the stated reason the `KIMI_RUNTIME_NATIVE` declaration
lives in the test rather than the doc; and (b) `docs/README.md` named in `templates/routing/`
init.skeleton and its rendered command/SKILL surfaces, which instruct a *new project* to create its
own docs index — they do not read this repo's file. `docs/README.md` is likewise not in
`SELF_HOST_TEST_CONSUMED` (`scripts/kaola-workflow-adaptive-schema.js:905-911`, whose `README.md`
entry is the repo-root README).

## Things that did not match the described state

1. **`validate-kaola-workflow-contracts.js:468` is a comment, not a check** — detail under EDIT 1.
   It does not weaken the edit; the render-drop at `sync-kimi-edition.js:207-208` carries it.
2. **EDIT 1's recommended replacement was fully redundant**, so the bullet was deleted instead —
   the brief's own conditional. Flagged here because it is a deviation from the literal recommendation.
3. Everything else matched byte-for-byte: `docs/README.md:20`, `docs/kimi-edition.md:97-100`,
   `docs/opencode-edition.md:121-125`.
4. Not touched, as instructed: root `README.md`, `docs/api.md`, `docs/conventions.md`,
   `docs/architecture.md`, `docs/workflow-state-contract.md`, anything under `scripts/`.
   Informational only — root `README.md:361` already states the kimi fact accurately ("there is no
   two-tier effort mapping, and a role's tier is declarative metadata only"), so no D2/D3-style
   staleness there for whoever owns that file.
