# Implementation — issue #944

> The Codex routing PIN asked the orchestrator for a role's tier and shipped no membership.
> The roster is now RENDERED into that PIN block from `CODEX_PINNED_*`, on all six Codex skills.

**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944`
**Branch:** `workflow/bundle-940-941-942-943-944` (nothing committed)
**Verification tier:** `tests-green` — the authored T19b suite passes, plus the four collateral
suites the brief named and the walkthrough at full scope.

**One test outside my custody red as a direct consequence of the ruling's design. I did not work
around it** — it was routed to `test-944` and `team-lead`, who repaired the fixture in parallel. The
finding, its measurement and the repair are recorded in full below. Final state: green.

---

## Mechanism, and why this one

### A derived SLOT, not prose and not a TOML

`templates/routing/slots.js` gains one slot, `codex-tier-roster`, whose value is **computed at
render time** from the kernel's own registry:

```js
const {
  CODEX_PINNED_STANDARD_ROLES,
  CODEX_PINNED_REASONING_ROLES,
} = require('../../scripts/kaola-workflow-adaptive-schema.js');
```

Both skeletons place `<!-- SLOT:codex-tier-roster -->` inside the existing
`<!-- PIN: codex-dispatch-model-routing -->` block, which is already wrapped in the declared
`<!-- REGION:skill — … -->`. `node scripts/generate-routing-surfaces.js --write` then carries it to
the six shipped surfaces and to nowhere else.

Three constraints shaped this and are worth recording:

1. **The ruling's two rejected routes stay rejected.** Hand-written prose would have been a seventh
   enumeration; emitting a tier into the role TOMLs is refused by the installed validators
   themselves (`install-codex-agent-profiles.js:736-737` — `model` and `model_reasoning_effort`
   "must be omitted to inherit the parent session").
2. **`kaola-workflow-adaptive-schema.js` was READ, never modified.** It is the byte-identical
   cross-edition anchor; `validate-script-sync.js` still reports 4 identical Oracle Kernel copies.
3. **The block's existing prose is byte-for-byte untouched**, and this is load-bearing rather than
   conservatism — see the next section.

### Why the roster names no model and no effort literal

The obvious "nicer" rendering folds the pair into the roster line
(``Standard-tier roles dispatch with `model: "…"` and `reasoning_effort: "medium"`: `code-explorer`, …``).
Measured against the existing suite, that breaks T19 twice:

- `test-route-reachability.js:119-120` requires the normalized block to contain the sentence
  **terminated by a period** — a trailing colon fails it.
- `test-route-reachability.js:362-364` mutates the block through an exact-wrap needle,
  `'Reasoning-tier roles dispatch with\n`model: "gpt-5.6-sol"`'`. A re-wrap makes that `.replace()`
  a no-op, the "mutated" block stays valid, and the mutation assertion inverts into a false pass —
  the guard would still be green while no longer armed.

The same measurement rules out repeating a model or effort literal inside the roster at all: T19's
mutations use `String.replace` with a **string** needle, which substitutes only the FIRST
occurrence. A second copy of `reasoning_effort: "medium"` in the block would leave the routing
contract satisfiable after the mutation, again disarming a live guard.

So the roster carries tier labels and role names only. The tier→effort binding the brief asked for
therefore lives where the test author put it: `effortDefects` in T19b reads the shipped block and
compares against `CODEX_STANDARD_EFFORT` / `CODEX_REASONING_EFFORT` from
`kaola-workflow-codex-preflight.js`, in both directions, with its own mutation battery. Changing
either constant without updating the prose reds by name. **Nothing was re-typed and no literal was
added**; the binding is enforced, just not by a second render path that would have cost two armed
mutations to buy.

### The wrap is computed, not hand-set

`tierRoster(label, roles)` wraps at a 100-column budget, so a registry change re-flows instead of
overrunning the column or leaving a stale hand-wrap behind. Every continuation line carries role
names only — the tier word stays on the label line. That is what lets T19b's reader attribute each
name to exactly one tier via its "nearest preceding unambiguous tier word" rule, and it is why a
future 15th role cannot silently land under the wrong heading.

The slot is the only one with no topic prefix (`nx-`/`in-`/`fz-`), because it is the same answer on
two topics: the PIN ships on both the next and the finalize skill. That is stated in the comment at
the definition.

---

## Files changed

| file | change |
|---|---|
| `templates/routing/slots.js` | +39: the kernel require, `tierRoster()`, and `SLOTS['codex-tier-roster']` |
| `templates/routing/next.skeleton.md` | +2: `<!-- SLOT:codex-tier-roster -->` inside the routing PIN |
| `templates/routing/finalize.skeleton.md` | +2: same |
| `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-next/SKILL.md` | +6 each — **regenerated, never hand-edited** |
| `plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-finalize/SKILL.md` | +6 each — regenerated |

`git diff --stat`: 9 files, 79 insertions, 0 deletions. No test file was written, and no file listed
as another agent's lane was touched.

---

## Verification

Every exit code below was read from `$?` on its own line, never from a pipeline's tail. All commands
were run with an explicit `cd` into the **worktree** — this box resets bash `cwd` to the main
checkout between calls, and one walkthrough run had to be discarded and repeated for exactly that
reason.

| command | before | after |
|---|---|---|
| `node scripts/test-route-reachability.js` | **exit 1** — 6 failures, 325 passed | **exit 0** — 331 passed |
| `node scripts/generate-routing-surfaces.js --check` | exit 0 — all 18 byte-match | **exit 0 — all 18 surfaces byte-match the skeleton** |
| `node scripts/test-generate-routing-surfaces.js` | exit 0 — 432 assertions | **exit 1 — 16 failed / 416 passed**, then **exit 0 — 432 assertions** once `test-944` repaired the fixture (see finding) |
| `node scripts/validate-script-sync.js` | exit 0 | exit 0 — 4 Oracle Kernel copies identical at HEAD |
| `node scripts/simulate-workflow-walkthrough.js` | exit 0 — 209/209 | exit 0 — 209/209 |

Collateral, run after the change (not required by the brief, all exit 0): `validate-workflow-contracts.js`,
`validate-kaola-workflow-contracts.js`, `validate-kaola-workflow-gitlab-contracts.js`,
`validate-kaola-workflow-gitea-contracts.js`, `test-suite-registration.js` (527 assertions).

**Surface count reported by `--check`: 18** (6 of which carry the routing PIN and now the roster;
the other 12 are unchanged — the `REGION:skill` gate held).

---

## Proof it reaches what ships

Read out of the committed surface bytes, not the skeleton — this issue exists precisely because an
authored-only answer never reached dispatch.

`plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`, and byte-identically in
`…/kaola-workflow-finalize/SKILL.md`:

```markdown
<!-- PIN: codex-dispatch-model-routing -->
## Codex Per-Spawn Model Routing

Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.

Standard-tier roles: `code-explorer`, `investigator`, `knowledge-lookup`, `tdd-guide`,
`implementer`, `doc-updater`, `metric-optimizer`.

Reasoning-tier roles: `planner`, `code-architect`, `build-error-resolver`, `code-reviewer`,
`security-reviewer`, `adversarial-verifier`, `synthesizer`.

These mappings are fixed for every spawn. Do not escalate, downgrade, or otherwise override a
standard-tier role's model or reasoning effort based on task breadth, latency, prior results, risk,
or any other condition. The role classification remains unchanged.
<!-- /PIN -->
```

An independent check — parsing the roster back out of each shipped file and comparing to the kernel
arrays, not going through T19b:

```
OK   plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md          | standard 7 reasoning 7
OK   plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md   | standard 7 reasoning 7
OK   plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md    | standard 7 reasoning 7
OK   plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md      | standard 7 reasoning 7
OK   plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md | standard 7 reasoning 7
OK   plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md  | standard 7 reasoning 7
carriers: 6 of 18 | distinct routing blocks: 1
```

Membership AND order match the kernel exactly, one byte-identical block across all six, and the
scan reported no roster leaking outside the PIN block on any of the other 12 surfaces.

### Mutation proof — the roster is DERIVED, not a literal that happens to agree

Run on a **disposable mirror** in the scratchpad (the render inputs plus the kernel, copied out);
the real tree was never written and `git checkout --` was never used. The mirror was deleted
afterwards and the real tree re-checked green.

1. mirror baseline `--check` → `all 18 surfaces byte-match the skeleton`, exit 0
2. add `'flow-auditor'` to the **mirror's** `CODEX_PINNED_REASONING_ROLES`, regenerate nothing
3. `--check` → **exit 1**, drift on exactly the 6 carriers:
   ```
   DRIFT: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md (next/skill/github)
       L17:
         committed: "`security-reviewer`, `adversarial-verifier`, `synthesizer`."
         rendered:  "`security-reviewer`, `adversarial-verifier`, `synthesizer`, `flow-auditor`."
   generate-routing-surfaces --check: 6 surface(s) drifted from the skeleton.
   ```
4. `--write` → the shipped roster follows the registry with no prose edit:
   ``Reasoning-tier roles: `planner`, …, `synthesizer`, `flow-auditor`.``
5. real tree afterwards: `grep -c flow-auditor` → 0 in both the kernel and the surfaces;
   `--check` → exit 0.

A registry change cannot leave the shipped instruction behind, which is the property the ruling was
after.

---

## FINDING — a test outside my custody now reds (routed to `test-944`)

`node scripts/test-generate-routing-surfaces.js` → **exit 1, 16 failed / 416 passed** (baseline exit
0, 432 passed). Every failure descends from one: `mutation proof: sandbox baseline --check exits 0`.

**Cause, measured rather than inferred.** That block (`:608-666`) copies render inputs into a
disposable sandbox from a **hand-typed list** at `:622-626`:

```js
for (const rel of [
  'scripts/generate-routing-surfaces.js',
  'templates/routing/rename-table.js',
  'templates/routing/slots.js',
]) copy(rel);
```

…then spawns `--check` inside the copy. The ruling's design necessarily adds a fourth render input —
the kernel that `slots.js` now reads the roster from — and the sandbox did not copy it, so the
spawned process died at module load before rendering anything:

```
Error: Cannot find module '../../scripts/kaola-workflow-adaptive-schema.js'
Require stack:
- <sandbox>/templates/routing/slots.js
- <sandbox>/scripts/generate-routing-surfaces.js
```

I reproduced this by rebuilding the sandbox by hand with exactly that copy set (crash, exit 1), then
copying the kernel in and re-running: `generate-routing-surfaces --check: all 18 surfaces byte-match
the skeleton.`, **exit 0**. So `'scripts/kaola-workflow-adaptive-schema.js'` added to that array is
sufficient, and that is what shipped.

**The assertions are sound; the fixture is stale.** It is a test file, so it is the author's to
repair and I did not touch it.

**Repaired by `test-944` while this was being written.** The repair also records something my
report understated: a sandbox that dies at module load exits 1 for *every* mutation, so the
exit-code half of each proof below it was passing **vacuously**, "detecting" drift it never looked
at. Only the DRIFT-line assertions still discriminated — that is why the suite reddened at all.

The shipped repair is the **one-line add**, `'scripts/kaola-workflow-adaptive-schema.js'` appended
to the copy list, plus the spawned child's stderr carried into the baseline assertion's message so
the `Cannot find module` line appears in the suite's own output instead of having to be rebuilt by
hand. A `require.cache`-derived copy set briefly landed and was reverted: the orchestrator declined
it on the ground that a stale hand-typed list already fails loudly and names the missing module, so
a require-graph walker would be machinery guarding a failure that announces itself.

Final measured state: `node scripts/test-generate-routing-surfaces.js` → **exit 0, 432
assertions** (the baseline count; the derived variant's extra anti-vacuity assert went with it).

**The alternative I deliberately did NOT take.** The render could be kept self-contained by holding
the 14 roles as literal data inside `slots.js`, which needs no test edit — T19b would still catch
any disagreement with the kernel, in both directions, on the shipped bytes. I did not do it: it
reinstates the hand-maintained duplicate the ruling rejected, and swapping a user's ruled mechanism
for my own convenience is not mine to decide. It is a one-function change if the owner prefers it.

---

## Left undone, deliberately

- **`CHANGELOG.md` has an `[Unreleased]` section and this change is user-visible**, so an entry is
  owed. I did not write one: four other implementers are live in this bundle and a shared CHANGELOG
  is a known conflict surface. Proposed entry, ready to lift:

  > - **The Codex per-spawn routing block now ships the role→tier roster (#944).** It ordered every
  >   spawn at its role's "existing standard-tier or reasoning-tier classification" while no
  >   installed Codex prompt surface said which roles were in which tier — the membership existed
  >   only as JS constants nothing rendered. The roster is now generated from
  >   `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` into that block on both the
  >   next and the finalize skill, so the surface that asks the question ships the answer.

- **`docs/conventions.md:136`** enumerates the render inputs and could name the roster slot. That
  file is currently modified by another agent in this bundle; left to the orchestrator rather than
  raced.
