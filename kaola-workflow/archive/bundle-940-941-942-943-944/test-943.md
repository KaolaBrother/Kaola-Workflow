# Tests for #943 — pin `investigator`, and close the missing-key class

Baseline: `d2ab06c2800963957d740db1dc9d4f019d0c53b5`.
Worktree: `.kw/worktrees/bundle-940-941-942-943-944` on `workflow/bundle-940-941-942-943-944`.
**One file touched: `scripts/test-install-model-rendering.js` (+23 lines, 0 deletions).** No production
file, no other test file. Main checkout never mutated (`git status --porcelain` = the untracked run
folder alone, before and after). Every install and suite run used `HOME=$(mktemp -d)`.

## What landed

| site | line | what |
|---|---|---|
| `const resolver = require('./kaola-workflow-resolve-agent-model.js')` | `:26` | the registry import the file previously lacked; comment states it is loaded **for the role registry only**, since tiers are still resolved by spawning the resolver against an installed tree |
| `investigator: 'sonnet',` | `:3046` | the missing 14th pin, placed after `code-explorer` to match the registry's reading order |
| `assert.deepStrictEqual(Object.keys(EXPECTED_ROLE_MODELS).sort(), Object.keys(resolver.DEFAULT_AGENT_MODELS).sort(), …)` | `:3063-3067` | the completeness assertion, reusing the shape at `test-agent-model-resolver.js:27-31` |
| comment paragraph | `:3034-3043` | extends the block honestly: names why "EVERY registered role" was undeliverable, and that the new assertion compares **KEYS ONLY** so every value stays independently pinned |

None of the 13 existing values changed; nothing was weakened or deleted.

### Why `sonnet`, derived without copying the resolver

Measured from artifacts on a pristine baseline mirror, `HOME` sandboxed:

```
$ HOME=$DTMP bash install.sh --yes --forge=github --no-settings-merge      # exit 0
$ node scripts/kaola-workflow-resolve-agent-model.js investigator \
      --agent-dir "$DTMP/.claude/agents" --raw
sonnet
```

14 agents installed; `.kaola-agent-models.json` absent as required; the same sweep reproduced all 13
pre-existing pins exactly, which is what makes the artifact a valid independent derivation rather
than a coincidence. Corroborated by two carriers that are not the resolver map:
`agents/investigator.md:5` → `model: sonnet`, and `README.md:146` → tier column `standard`.

## Mutation proofs (scratch mirrors under `scratchpad/t943/`; never `git checkout --` on a real tree)

### Part 1 — the new pin is ARMED

Leg C is the premise report's **coherent** re-tier of `investigator` standard→reasoning: frontmatter
plus every carrier moved together. Reproduced independently at **16 files, 23 insertions, 23
deletions** — byte-for-byte the premise's leg C. Coherence oracle: `test-agent-model-resolver.js`
exits **0** under it in both legs, so every cross-table consistency check is satisfied and the pin is
the only thing that can object.

| leg | tree | `node scripts/test-install-model-rendering.js` | exit |
|---|---|---|---|
| **A** | baseline + leg C, **without** my change | `Install model rendering tests passed` | **0** |
| **B** | baseline + leg C, **with** my change | `AssertionError: fresh install must resolve investigator -> sonnet; got opus` | **1** |

The A leg reproduces the exact blindness #943 reports; the B leg is the fix, and the two differ only
by my 23 added lines.

### Part 2 — the completeness assertion is armed in BOTH directions

| mutation | exit | failure signature |
|---|---|---|
| delete `'metric-optimizer': 'sonnet'` from the table | **1** | `AssertionError: the pinned install-tier table must cover exactly the resolver role registry` — diff shows `- 'metric-optimizer'` (`:3063`) |
| add bogus `'retired-ghost-role': 'sonnet'` to the table | **1** | same assertion — diff shows `+ 'retired-ghost-role'` |

Table-short and table-long both red. This is the direction the old `Object.entries(EXPECTED_ROLE_MODELS)`
loop structurally could not see.

### Green on the unmutated tree

`node scripts/test-install-model-rendering.js` → **exit 0**, `Install model rendering tests passed`,
run twice on the worktree: once before and once after the concurrent reasoning-floor removal landed
in `kaola-workflow-resolve-agent-model.js`. My import touches `DEFAULT_AGENT_MODELS` only
(14 keys, `investigator: sonnet` post-removal), so it is unaffected by that work.

Neighbouring fast-gate steps, run on a mirror carrying **only** my change — all exit 0:
`validate-script-sync.js`, `test-agent-model-resolver.js`, `test-spawn-classification.js`
(644 spawn sites; my line adds none), `test-suite-registration.js`, `validate-workflow-contracts.js`,
`validate-kaola-workflow-contracts.js`. `test-install-model-rendering.js` has **no duplicate copy**
in the tree, so byte-identity sync does not apply to it.

## Notes for the orchestrator

- The full four chains were **not** run from here — the worktree carries several other agents'
  in-flight edits, so a chain run would not have isolated this change.
- Out of scope, recorded from the premise report: `{INVESTIGATOR_MODEL}` is a dead placeholder,
  registered in `install.sh:544,576` with zero consuming templates.
