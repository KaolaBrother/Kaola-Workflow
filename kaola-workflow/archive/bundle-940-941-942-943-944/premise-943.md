# Investigation: premise of GitHub issue #943 — `EXPECTED_ROLE_MODELS` pins 13 of 14 roles; `investigator` unpinned

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`
- Commit: `d2ab06c2800963957d740db1dc9d4f019d0c53b5`
- Tree at start: clean except the untracked run folder `kaola-workflow/bundle-940-941-942-943-944/`
- Node: `v24.14.0`; npm `11.9.0`; platform darwin 25.6.0
- No tracked file in the repository was modified. Every mutation was applied to **scratch mirrors**
  under `/private/tmp/claude-501/.../scratchpad/mirror` and `.../mirror2` (full `cp -R` copies,
  including `.git`), per the project's mutation-proof convention.
- Every `install.sh` invocation and every suite run was executed with `HOME` pointed at a fresh
  `mktemp -d`, so nothing touched the real `~/.claude` install. The one install run against the real
  repo checkout was proven non-mutating by comparing `git status --porcelain` before and after.

## Verdict summary

| # | Claim | Verdict |
|---|---|---|
| 1 | The comment calls the table "THE PINNED TABLE IS THE ACCEPTANCE EVIDENCE", independently derived from `DEFAULT_AGENT_MODELS` | **CONFIRMED** |
| 2 | 13 entries, not 14; `investigator` missing | **CONFIRMED** |
| 3 | `grep -n "investigator" scripts/test-install-model-rendering.js` returns no matches | **CONFIRMED** (verified three independent ways) |
| 4 | `DEFAULT_AGENT_MODELS` has 14 entries, `investigator` among them | **CONFIRMED** |
| 5 | Nothing would catch a silent re-tier of `investigator` at this surface | **CONFIRMED at the named surface; PARTIALLY-CONFIRMED repo-wide** — all four chains stay green under a coherent re-tier, but the opt-in opencode edition suite (outside `npm test`) reds |

**Completeness assertion: ABSENT.** Nothing anywhere asserts that `EXPECTED_ROLE_MODELS` covers
`DEFAULT_AGENT_MODELS`. `scripts/test-install-model-rendering.js` never even `require`s the resolver
module, so the comparison is structurally impossible in that file as written.

---

## Claim 1 — the comment's own framing — CONFIRMED

`scripts/test-install-model-rendering.js:3010-3030`, verbatim:

```js
  // #794: the install-time model axis is retired. A fresh install must (a) write NO
  // .kaola-agent-models.json, and (b) resolve EVERY registered role through the three-step chain
  // (plan column -> frontmatter -> DEFAULT_AGENT_MODELS) to the pinned tier below — the surface the
  // adaptive dispatch path actually reads.
  //
  // THE PINNED TABLE IS THE ACCEPTANCE EVIDENCE, and its required value is FIXED: it is the exact
  // per-role resolution a default install produced BEFORE the axis was removed, carried forward
  // through every deliberate re-tiering since. Retiring a selector must not re-tier a single role,
  // so every entry here is a behavioural pin, not a preference — the retired default was
  // `--profile=higher`, so the three roles that had a `higher` variant (code-architect,
  // code-reviewer, security-reviewer) pin to the reasoning tier and every other role pins to
  // whatever its source frontmatter already declared.
  //
  // #935 (owner-ruled) moved build-error-resolver and adversarial-verifier from the standard tier
  // to the reasoning tier, so those two entries carry the ruled value rather than the pre-removal
  // one. They are the ONLY entries that have moved, and each moved by an explicit ruling — a
  // decision, never a green-suite convenience.
  //
  // This table is INDEPENDENTLY DERIVED from DEFAULT_AGENT_MODELS — do not "fix" a failure here by
  // editing this table to match the resolver. The two agreeing is the whole assertion; if they
  // disagree with no ruling behind the move, the resolver re-tiered a role and that is the bug.
```

Both quoted phrases from #943 are present verbatim: "THE PINNED TABLE IS THE ACCEPTANCE EVIDENCE"
(`:3015`) and "INDEPENDENTLY DERIVED from `DEFAULT_AGENT_MODELS`" / "The two agreeing is the whole
assertion" (`:3028-3029`). Note the comment's own scope claim at `:3011`: the install must resolve
**"EVERY registered role"** to the pinned tier — a claim the table cannot deliver, since it is short
one role.

The issue's line reference `~3031` is correct: the declaration opens at `:3031`.

---

## Claim 2 — 13 entries, `investigator` missing — CONFIRMED

**`EXPECTED_ROLE_MODELS` — `scripts/test-install-model-rendering.js:3031-3045` (13 entries)**

| # | key | value | line |
|---|---|---|---|
| 1 | `code-explorer` | `sonnet` | 3032 |
| 2 | `knowledge-lookup` | `sonnet` | 3033 |
| 3 | `planner` | `opus` | 3034 |
| 4 | `code-architect` | `opus` | 3035 |
| 5 | `tdd-guide` | `sonnet` | 3036 |
| 6 | `implementer` | `sonnet` | 3037 |
| 7 | `build-error-resolver` | `opus` | 3038 |
| 8 | `code-reviewer` | `opus` | 3039 |
| 9 | `security-reviewer` | `opus` | 3040 |
| 10 | `doc-updater` | `sonnet` | 3041 |
| 11 | `adversarial-verifier` | `opus` | 3042 |
| 12 | `synthesizer` | `opus` | 3043 |
| 13 | `metric-optimizer` | `sonnet` | 3044 |

Command and output:

```
$ node -e '<parse both tables and diff>'
EXPECTED_ROLE_MODELS count: 13
```

---

## Claim 4 — `DEFAULT_AGENT_MODELS` has 14, including `investigator` — CONFIRMED

**`DEFAULT_AGENT_MODELS` — `scripts/kaola-workflow-resolve-agent-model.js:13-43` (14 entries)**

| # | key | value | line |
|---|---|---|---|
| 1 | `code-explorer` | `sonnet` | 14 |
| 2 | **`investigator`** | **`sonnet`** | **15** |
| 3 | `knowledge-lookup` | `sonnet` | 16 |
| 4 | `planner` | `opus` | 17 |
| 5 | `code-architect` | `opus` | 22 |
| 6 | `tdd-guide` | `sonnet` | 23 |
| 7 | `implementer` | `sonnet` | 24 |
| 8 | `build-error-resolver` | `opus` | 25 |
| 9 | `code-reviewer` | `opus` | 26 |
| 10 | `security-reviewer` | `opus` | 27 |
| 11 | `doc-updater` | `sonnet` | 28 |
| 12 | `adversarial-verifier` | `opus` | 33 |
| 13 | `metric-optimizer` | `sonnet` | 37 |
| 14 | `synthesizer` | `opus` | 42 |

```
DEFAULT_AGENT_MODELS count: 14
```

### Both-directions key-set diff

```
in DEFAULT not in EXPECTED: [ 'investigator' ]
in EXPECTED not in DEFAULT: []
value disagreements:        []
```

- `investigator` is the **only** missing role. No other role is absent.
- There is **no** role in `EXPECTED_ROLE_MODELS` that is absent from `DEFAULT_AGENT_MODELS` — the
  pinned table is a strict subset, never a superset.
- For the 13 roles present in both, **every value agrees**. The table is short, not stale.

---

## Claim 3 — `investigator` appears nowhere in the file — CONFIRMED

Verified three ways, deliberately using three different scanning mechanisms, because the box's
`grep` is `ugrep` and this repo's `git grep -E` lacks `\b`/`\s`.

**(a) `git grep -nP` (PCRE, exit code checked directly, not through a pipe):**

```
$ git grep -nP 'investigator' -- scripts/test-install-model-rendering.js
exit=1        # no output, no matches
```

**(b) Node byte-read + case-insensitive regex over every line:**

```
matches for /investigat/i: 0
file bytes: 222043 lines: 3904
```

**(c) Python raw-bytes substring count, no regex engine at all:**

```
bytes: 222043
b'investigator' count: 0
b'investigat'   count: 0
control b'code-explorer' count: 5      # positive control — the scanner does find things
```

The `code-explorer` control proves the scanner is not silently reading an empty or wrong file.

**Widened, same measurement on the sibling test:** `scripts/test-agent-model-resolver.js` also
contains **zero** occurrences of `investigator`. Neither of the two model-tier test files names the
role at all.

---

## Claim 5 — nothing catches a silent re-tier — CONFIRMED at this surface

### Every consumer of `EXPECTED_ROLE_MODELS` in the repository

`git grep -nP 'EXPECTED_ROLE_MODELS'` finds exactly **four** live code sites, all in one file
(remaining hits are prose inside `kaola-workflow/archive/issue-935/`):

```
scripts/test-install-model-rendering.js:3031:  const EXPECTED_ROLE_MODELS = {
scripts/test-install-model-rendering.js:3060:      for (const [role, expected] of Object.entries(EXPECTED_ROLE_MODELS)) {
scripts/test-install-model-rendering.js:3069:        assert(got === EXPECTED_ROLE_MODELS[role],
scripts/test-install-model-rendering.js:3071:            + EXPECTED_ROLE_MODELS[role] + '; got ' + got + ')');
```

**Consumer 1 — the fresh-install resolution loop (`:3060-3063`):**

```js
      for (const [role, expected] of Object.entries(EXPECTED_ROLE_MODELS)) {
        const got = resolveRole(agentDir, role);
        assert(got === expected, 'fresh install must resolve ' + role + ' -> ' + expected + '; got ' + got);
      }
```

It iterates **the pinned table**, not the source registry. A role absent from the pinned table is
never passed to `resolveRole`, so no assertion about it can ever execute or fail.

**Consumer 2 — the planted-manifest inertness loop (`:3067-3072`):**

```js
      for (const role of ['implementer', 'code-reviewer', 'planner']) {
        const got = resolveRole(agentDir, role);
        assert(got === EXPECTED_ROLE_MODELS[role],
          'a planted .kaola-agent-models.json must not affect ' + role + ' (expected '
            + EXPECTED_ROLE_MODELS[role] + '; got ' + got + ')');
      }
```

Iterates a hardcoded 3-role list. Narrower still.

### Is there a completeness assertion? **NO — absent, not merely weak.**

Two independent facts establish this:

1. **The loop iterates the pinned table.** `Object.entries(EXPECTED_ROLE_MODELS)` at `:3060` — the
   direction that structurally cannot notice a missing key. Had it iterated
   `DEFAULT_AGENT_MODELS`, or asserted key-set equality, the table could not be short.
2. **The file never imports the resolver.** Its complete `require` list is `assert`,
   `child_process`, `crypto`, `fs`, `os`, `path`, plus
   `../plugins/kaola-workflow/scripts/install-codex-agent-profiles`,
   `./kaola-workflow-codex-preflight`, and `./generate-reviewer-profiles`
   (`scripts/test-install-model-rendering.js:12-23`). `kaola-workflow-resolve-agent-model.js` is
   invoked only as a **subprocess per role name** (`:3047-3049`), never loaded as a module, so
   `DEFAULT_AGENT_MODELS` is not in scope and no comparison against it is possible without a code
   change. The "independently derived" comment is honest about intent, and there is no mechanism
   holding the derivation complete.

The nearest thing to a completeness assertion in the repo is in a *different* file,
`scripts/test-agent-model-resolver.js:27-31`, and it covers the Codex class table, not the pinned
install table:

```js
assert.deepStrictEqual(
  [...schema.CODEX_PINNED_STANDARD_ROLES, ...schema.CODEX_PINNED_REASONING_ROLES].sort(),
  Object.keys(resolver.DEFAULT_AGENT_MODELS).sort(),
  'Codex profile classes must cover exactly the resolver role registry'
);
```

That one *is* a completeness assertion over the 14-role registry — which is why the Codex class
lists carry `investigator` and the install pin table does not.

### Mutation proof — A/B legs on a scratch mirror

Baseline on the mirror at `d2ab06c2`, `HOME` sandboxed:

| Measurement | Command | Result | Exit |
|---|---|---|---|
| resolver suite baseline | `node scripts/test-agent-model-resolver.js` | `Agent model resolver tests passed` | 0 |
| install-rendering baseline | `node scripts/test-install-model-rendering.js` | `Install model rendering tests passed` (17.6s real) | 0 |
| editions baseline (fresh-clone-equivalent: `.opencode*`/`.kimi*` removed) | `npm run test:kaola-workflow:editions` | `kimi-edition test passed (507 assertions)` | 0 |

**Leg A — flip `investigator` `sonnet`→`opus` in the root `DEFAULT_AGENT_MODELS` only** (1 file, 1 line):

| Suite | Exit | Message |
|---|---|---|
| `test-agent-model-resolver.js` | **1** | `investigator declarative tier must match its Codex profile class` (`:48-49`) |
| `test-install-model-rendering.js` | **0** | `Install model rendering tests passed` |

*Eliminated:* the hypothesis that a lone resolver-map edit is invisible. It is caught — but **not by
the acceptance surface #943 names**, which stayed green.

**Leg B — leg A + move `investigator` STANDARD→REASONING in the root schema; frontmatter untouched:**

| Suite | Exit | Message |
|---|---|---|
| `test-agent-model-resolver.js` | **1** | `investigator source frontmatter (sonnet) must equal its DEFAULT_AGENT_MODELS tier (opus) — installed agents resolve through the default map alone, so a divergence silently re-tiers the role` (`:59-66`) |

*Eliminated:* the hypothesis that the Codex-class check is the only guard. The frontmatter-equality
loop is a second one. Both are **cross-table consistency** checks, not value pins.

**Leg C — the coherent re-tier: every carrier moved together, exactly as a deliberate change would.**
16 files, 23 lines: `agents/investigator.md` frontmatter `sonnet`→`opus`; all four
`kaola-workflow-resolve-agent-model.js` copies; all four `kaola-workflow-adaptive-schema.js` copies;
all four `kaola-workflow-codex-preflight.js` copies; all three
`install-codex-agent-profiles.js` copies.

| Suite | Command | Exit |
|---|---|---|
| `test-agent-model-resolver.js` | `node scripts/test-agent-model-resolver.js` | **0** |
| `test-install-model-rendering.js` | `node scripts/test-install-model-rendering.js` | **0** |
| `validate-vendored-agents.js` | `node scripts/validate-vendored-agents.js` | **0** |
| `validate-kaola-workflow-contracts.js` | `node scripts/validate-kaola-workflow-contracts.js` | **0** |
| `validate-workflow-contracts.js` | `node scripts/validate-workflow-contracts.js` | **0** |
| **all four chains** | `KAOLA_RUN_CHAINS_CONCURRENCY=serial npm test` | **0** |

The four-chain log (439 lines) shows all four chains completing:
`test:kaola-workflow:claude` → `:codex` → `:gitlab` → `:gitea`, ending
`generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.`

**`investigator` can be moved from the standard tier to the reasoning tier with a full, unwaived
four-chain green receipt.** That is claim 5, measured.

**Leg D — positive control.** The identical coherent re-tier applied instead to `code-explorer`, a
role that **is** in the pinned table, same 16 files, same 23 lines:

| Suite | Exit | Message |
|---|---|---|
| `test-install-model-rendering.js` | **1** | `fresh install must resolve code-explorer -> sonnet; got opus` |
| `test-agent-model-resolver.js` | **1** | at `:134` — `resolveAgentModel('code-explorer', …)` expected `'sonnet'`, got `'opus'` (a second, incidental by-name pin inside the retired-manifest inertness block) |

The control proves the pinned table is **armed**, not vacuous, and that `investigator`'s absence
from it is the entire difference between a caught re-tier and an uncaught one.

---

## Widening: is `investigator` pinned at any other acceptance surface?

Every file mentioning `investigator` outside the run archive (`git grep -nP -il 'investigator' -- . ':!kaola-workflow/'`), classified:

| Surface | Site | Kind |
|---|---|---|
| `scripts/kaola-workflow-resolve-agent-model.js:15` | `'investigator': 'sonnet'` | **source of truth**, not a pin |
| `agents/investigator.md:5` | `model: sonnet` | **source of truth**, not a pin |
| `scripts/kaola-workflow-adaptive-schema.js:48` | `CODEX_PINNED_STANDARD_ROLES` | cross-table consistency (leg A/C: moves with the re-tier) |
| `scripts/kaola-workflow-codex-preflight.js:80` | same list, compact form | ditto |
| `plugins/*/scripts/{adaptive-schema,codex-preflight,install-codex-agent-profiles,resolve-agent-model}.js` | 12 copies | ditto, byte-identity mirrors |
| `scripts/validate-vendored-agents.js:32` | `localAgents` array | pins **existence + provenance class**, never a tier |
| `install.sh:40`, `uninstall.sh:8` | `REQUIRED_AGENTS` | pins **existence**; `validate-workflow-contracts.js:830-842` asserts only install/uninstall parity |
| `install.sh:544, 576` | `INVESTIGATOR_MODEL` placeholder | **dead placeholder** — see below |
| `plugins/*/agents/investigator.toml`, `plugins/*/config/agents.toml` | prompt/registration | no tier |
| `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:825, 1320` | two comments | no assertion |
| `README.md:146` | table row: tier documented as `standard` | prose, unasserted |
| `scripts/test-install-model-rendering.js`, `scripts/test-agent-model-resolver.js` | — | **zero mentions** |

**The `{INVESTIGATOR_MODEL}` placeholder is dead.** `install.sh` registers it in both
`model_for_placeholder()` (`:544`) and the `render_command_file` placeholder list (`:576`), but
`git grep -ohP '\{[A-Z_]+_MODEL\}' -- commands/ templates/ skills/` returns only:

```
   2 {TDD_GUIDE_MODEL}
   2 {DOC_UPDATER_MODEL}
   2 {BUILD_ERROR_RESOLVER_MODEL}
```

carried by `commands/kaola-workflow-finalize.md` and `templates/routing/finalize.skeleton.md`. No
command or skill surface renders `investigator`'s tier, so the rendered-command surface pins nothing
either.

### The one place a coherent re-tier does red: the opt-in opencode edition suite

`npm run test:kaola-workflow:editions` under leg C, on a fresh-clone-equivalent tree (all six
generated `.opencode*`/`.kimi*` trees removed first, since per #942 the suite materializes them):

```
editions exit=1
FAIL: A7: committed opencode.json is byte-equal to renderOpencodeJson() (regenerate via --write-config)
FAIL: A-prune(b): --check exits 0 after the retired surface is pruned
FAIL: FA3[github]: sync --check is green after --write
FAIL: FA3[gitlab]: sync --check is green after --write
FAIL: FA3[gitea]: sync --check is green after --write
opencode-edition test FAILED: 5 failure(s), 512 passed.
```

Baseline on the same fresh tree, unmutated: **exit 0**. The failure is attributable to the re-tier.

The carrier is the **tracked** `opencode.json`, whose reasoning-role roster is rendered into a
comment at `opencode.json:8`:

```
  //   推理模型 (reasoning tier) → "agent.<role>.model" overrides for
  //                               the reasoning roles: adversarial-verifier, build-error-resolver, code-architect, code-reviewer, planner, security-reviewer, synthesizer.
```

`investigator` is absent from that roster, i.e. implicitly standard, and `renderOpencodeJson()`
derives the roster from the agent frontmatter — so a re-tier makes the committed bytes stale.

Three qualifiers on how much this closes the gap:

1. **It is outside `npm test`.** Per `CLAUDE.md`, opencode and kimi are additive editions, absent
   from the four chains. Leg C's four-chain receipt was green; the editions suite is opt-in.
2. **It is a propagation guard, not a value pin.** Its stated remedy is *"regenerate via
   `--write-config`"* — precisely what an author performing a deliberate re-tier would do, after
   which it goes green. Contrast `EXPECTED_ROLE_MODELS`, which explicitly forbids editing the table
   to match the resolver.
3. **The `.opencode` drift-check leg is inert on a fresh tree.** The run reported
   `[drift-check: NO tree verified; 3 ABSENT, not checked]` — the catch came from the tracked
   `opencode.json` (A7/FA3), not from the drift check (that is issue #942's territory).

---

## Currently rendered tier for `investigator` — `sonnet` (standard)

Measured from artifacts, not from the source table.

**(a) The live installed artifact at `~/.claude/agents/investigator.md`:**

```
name: investigator
model: inherit          # the installer rewrites frontmatter to `inherit`
```

```
$ node scripts/kaola-workflow-resolve-agent-model.js investigator --agent-dir "$HOME/.claude/agents" --raw
sonnet
$ … code-explorer …        → sonnet
$ … build-error-resolver … → opus     # control: the #935 re-tier is live in the real install
```

**(b) A fresh install into a sandboxed `HOME`**, replicating exactly what
`test-install-model-rendering.js:3055` does:

```
$ HOME=$DTMP bash install.sh --yes --forge=github --no-settings-merge   # exit 0
$ head -6 $DTMP/.claude/agents/investigator.md → model: inherit
```

Resolved tier for all 14 roles against the fresh install:

| role | rendered | in pinned table? |
|---|---|---|
| **investigator** | **sonnet** | **NO** |
| code-explorer | sonnet | yes |
| knowledge-lookup | sonnet | yes |
| planner | opus | yes |
| code-architect | opus | yes |
| tdd-guide | sonnet | yes |
| implementer | sonnet | yes |
| build-error-resolver | opus | yes |
| code-reviewer | opus | yes |
| security-reviewer | opus | yes |
| doc-updater | sonnet | yes |
| adversarial-verifier | opus | yes |
| synthesizer | opus | yes |
| metric-optimizer | sonnet | yes |

`.kaola-agent-models.json` absent from the fresh install, as required. Repo mutation check after the
install: `git status --porcelain` byte-identical before and after — **no repo mutation**.

`investigator`'s rendered tier therefore **agrees** with `DEFAULT_AGENT_MODELS`, with
`agents/investigator.md`, with `CODEX_PINNED_STANDARD_ROLES`, with `opencode.json`'s roster, and
with `README.md:146` ("standard"). Nothing is currently wrong; the gap is that nothing at the
acceptance surface would notice if it changed.

---

## Inferences

- **The gap is a missing key, not a stale value.** — confidence: high. Refuted by finding any value
  disagreement between the two tables; the diff shows none.
- **The direction of the loop is the mechanism.** `Object.entries(EXPECTED_ROLE_MODELS)` can only
  test what the table already lists, so the table's shortness is self-concealing: adding a role to
  the registry produces no failure anywhere in this file. — confidence: high. Refuted by producing
  any assertion in the repo that iterates or compares against the resolver registry from
  `test-install-model-rendering.js`; there is none, and the module is not even imported.
- **The three guards that do fire (legs A and B) are consistency checks between carriers, not
  acceptance pins of a value.** They enforce "all carriers agree", which a coherent edit satisfies.
  Only `EXPECTED_ROLE_MODELS` (and, incidentally, `test-agent-model-resolver.js:134-135` for
  `code-explorer`/`implementer`) asserts a *fixed* value that a coherent edit cannot satisfy. —
  confidence: high; demonstrated by legs C (green) vs D (red).
- **The practical blast radius is smaller than "nothing would catch it", but the four-chain receipt
  is genuinely blind.** — confidence: high. The opencode suite reds, but it is opt-in and its remedy
  is regeneration.

## Open

- **Whether the omission was deliberate.** `investigator` was added in #798, after the #794 comment
  block was authored. No ADR, comment, or exemption naming `investigator` was found at this surface.
  I did not search the issue tracker (no forge call made), so I cannot rule out a recorded ruling.
- **The `{INVESTIGATOR_MODEL}` dead placeholder** is a separate, unfiled observation — registered in
  `install.sh` at two sites with zero consuming templates. Out of #943's scope; recorded here
  because it is the other half of "investigator's tier reaches no rendered surface".
- **Leg C was not run against `test:kaola-workflow:claude:full`.** The four chains (which include
  the `--shard auto/12` sampled walkthrough) were green; the deferred heavyweight suites
  (`test-claim-hardening`, `test-sink-merge`, `test-run-chains`, full-scope walkthrough) were not
  separately run under mutation. None of them mention `investigator`, so the expected result is
  green, but that is inference, not measurement.
