# #952 subtraction audit — `docs/` — SECOND, INDEPENDENT PASS

> **Why this file exists.** The first `audit-952-docs` agent was believed dead and I was dispatched as
> a retry. It is **alive** — it wrote `reports/audit-952-docs.md` at 23:23 while I was working. I did
> not clobber it. This report is therefore an *independent second measurement* of the same surface,
> written to a separate path. Where we agree, the agreement is worth more than either report alone,
> because the two were arrived at separately.

Report-only. No cut applied. No tracked file edited by this audit.

- **Commit:** `483a5e5e`.
- **Where measured:** all *execution* in an isolated clone at `483a5e5e`
  (`<scratchpad>/clone-b`, `git status` clean, 198 docs). Reading and grepping in the shared worktree
  `.kw/worktrees/bundle-952-953-954-955`.
- **Hazard note, recorded because it nearly bit:** I started a traced `npm run
  test:kaola-workflow:claude:full` *in the shared worktree*. That chain begins with
  `edition-sync.js --materialize-kernel`, which **writes**. I killed it and verified the worktree was
  unharmed. Concurrent agents (`impl-955`) were editing `docs/README.md` and `docs/architecture.md`
  at the same moment. **A read-only audit must not run a suite in a shared worktree.**
- **Surface:** `docs/` — 198 files, all `.md`; 34,397 lines at the moment of measure
  (`find docs -type f -name '*.md' -exec wc -l {} +`). The brief's 34,359 is the same measure before
  `impl-955`'s in-flight edits; nothing turns on the delta.

---

## TASK ZERO — the test-consumed doc set

Established two ways that do not share a source.

### Method A — the declared constants

| constant | file:line | entries |
|---|---|---|
| `SELF_HOST_TEST_CONSUMED` | `scripts/kaola-workflow-adaptive-schema.js:905` | `README.md`, `CHANGELOG.md`, `docs/api.md`, `docs/workflow-state-contract.md`, `docs/agents-source.md` |
| `TEST_CONSUMED_PATHS` | `scripts/kaola-workflow-validation-runner.js:32` | identical five |

### Method B — the shipped predicate, executed over all 198 docs

Not a grep — the actual function the code-tree hash consults, run in the clean clone:

```
$ node -e "const pv=require('./scripts/kaola-workflow-validation-runner.js'); …"
docs tracked: 198
VALIDATION-VISIBLE (test-consumed):
   docs/agents-source.md
   docs/api.md
   docs/workflow-state-contract.md
invisible count: 195
```

Exit 0. This is the authoritative answer to "which doc edits stale the chain receipt".

### The answer — three docs, and how each is consumed

| doc | lines | consumed by | how |
|---|---:|---|---|
| `docs/api.md` | 1,655 | `validate-workflow-contracts.js:375,390–393` · `validate-kaola-workflow-contracts.js:188` · `test-forge-finalize-findings.js:543–662` · `test-validation-allowband.js:110,113` | **content asserted, and parsed.** Concept assertions on closure-contract invariants / receipt schema / audit-labels forge parity; three `assertNotIncludes` negative pins; `test-forge-finalize-findings.js` parses the `findings` table and cross-checks the **per-edition finding-type counts stated in the prose** against the live registries, and requires `archive_unstaged` / `residue_unstaged` rows. |
| `docs/workflow-state-contract.md` | 453 | `validate-workflow-contracts.js:338,361,368,400,442` · `validate-kaola-workflow-contracts.js:183,185` · `test-kernel-conformance.js:137` | **existence + content asserted.** An `exists()` gate, three concept assertions, and `test-kernel-conformance.js` single-sources its PART B ruling against this file (`CONTRACT_DOC`). |
| `docs/agents-source.md` | 139 | `validate-vendored-agents.js:136,138,144,167` · `package.json:24` | **content asserted.** Must carry the pinned upstream commit and an `agents/<name>.md` line per vendored agent; `README.md` must link it; `package.json`'s `files` array must list it. |

**No fourth.** Nothing else under `docs/` is read by any script in the four chains.

### Two strings that look like consumption and are not

Both are in `test-validation-allowband.js`, and both pass the doc path to a **pure, path-shape-only**
predicate. The file's bytes are never opened, so the assertion survives the file's deletion:

- `docs/decisions/D-547-01.md` (line 109) — asserted validation-**invisible**, as the "inert ADR" control.
- `docs/architecture.md` (line 108) — asserted validation-**invisible**, as the "inert narrative doc" control.

A reader who greps for a doc basename and finds one of these will wrongly conclude the doc is
test-consumed. It is not; it is a *string* in a control.

### One trap worth naming for the next reader

`templates/routing/init.skeleton.md` names `docs/README.md`, `docs/architecture.md`,
`docs/conventions.md`, `docs/api.md` and `docs/decisions/` (lines 195–199 and 467–495). Those are the
**consumer repo's** scaffold docs that `/workflow-init` writes — not this repo's. A `git grep
docs/README.md` hits the skeleton and reads as consumption. It is not.

### What this licenses, and what it does not

195 of 198 docs are validation-invisible: editing or deleting one does not stale the chain receipt.
That kills the *receipt-staleness* objection to a cut. It does **not** make a doc deletable — a doc
can be indexed, linked, or load-bearing for a human with no script ever reading it. Every `delete:`
below still owes its own zero-consumer search.

Also, and separately: `package.json`'s `files` array ships exactly one doc — `docs/agents-source.md`.
The other 197 are not in the npm package at all.

---

## Findings

_measurement in progress — findings land here as they are proven_

Ranked by lines, per the brief. None of the three findings below touches a test-consumed doc's
*consumed content*, and each says its test-consumed status explicitly.

---

### F1 · `delete:` — 24 docs with no inbound link from anything outside the archive — 3,831 lines

**Not test-consumed** (all 24 are validation-invisible). **This is a measurement, not a
recommendation** — see the constraint below it, which I think is decisive.

Method: read every tracked file outside `kaola-workflow/archive/**` (503 files) and, for each of the
198 docs, look for its full path, its `docs/`-relative path, or its bare basename anywhere in the
other 502. Run in the clean clone via `git ls-files` + `fs.readFileSync`, so **dot-directories are
included by construction** — no ugrep blind spot, because no grep was used.

```
tracked files: 9095 | corpus (archive excluded): 503 | docs: 198
DOCS WITH ZERO INBOUND REFERENCE: 24
   578 docs/investigations/2026-06-01-full-audit.md
   282 docs/decisions/D-802-01.md
   273 docs/investigations/2026-06-05-workflow-planner-adaptive-plan.md
   229 docs/investigations/2026-06-11-379-map-dynamic-fanout-design.md
   221 docs/investigations/2026-06-07-strict-lean-orchestrator-boundary.md
   215 docs/investigations/init-architecture-fit-2026-05-17.md
   214 docs/investigations/startup-target-issue-2026-05-17.md
   189 docs/investigations/sink-entry-consolidation-2026-05-17.md
   160 docs/investigations/2026-06-11-378-optimistic-lane-concurrency-design.md
   159 docs/investigations/2026-06-15-472-dispatch-fidelity-probe.md
   137 docs/decisions/0014-free-origin.md
   123 docs/decisions/D-497-01.md
   118 docs/decisions/D-803-01.md
   115 docs/investigations/2026-06-11-367-prose-dedup-install-rendering-design.md
   107 docs/decisions/D-509-01.md
   102 docs/decisions/D-475-01.md
   100 docs/decisions/D-552-01.md
    97 docs/decisions/D-806-01.md
    96 docs/investigations/headless-runtime-study-2026-06-03.md
    92 docs/investigations/issue-selection-gap-2026-05-17.md
    75 docs/decisions/D-818-01.md
    67 docs/decisions/D-476-01.md
    52 docs/decisions/0001-legacy-session-lock-cleanup.md
    30 docs/decisions/D-514-01.md
```

**Every one of the 24 lives in `decisions/` or `investigations/`. Not one live doc is an orphan** —
the eight top-level docs and `audits/` are all linked. That is the real result of this sweep, and it
is a good result for the tree.

**Two things that must be said with this number, or it will mislead:**

1. **"No inbound link" is not "unreachable."** `docs/README.md:41` links the *directory*
   `investigations/` and `docs/README.md:22` links the *directory* `decisions/`. Every one of the 24
   is reachable by browsing its folder. What the measurement shows is that no *prose* names them.
2. **The repo has already ruled on this corpus, and the ruling is against deletion.**
   `docs/README.md:34–37`: *"Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017.
   **They remain accurate as history** and as rationale for machinery that still ships…"* Twelve of
   the 24 are exactly those (1,290 lines). Deleting them is a **value call the user owns**, not a fact this audit
   can settle, and it contradicts a decision already written down. I file the number; I do not
   recommend the cut.

The twelve `investigations/` orphans (2,541 lines) carry no such retention sentence — `docs/README.md`
describes the folder only as "investigation notes and analysis documents". If the user wants a cut
here, that is the subset with no rule standing against it. Still their call.

---

### F2 · `shrink:` — the Codex model/effort pair is restated in two docs, and neither copy is bound to the constant — 7 lines

**`docs/api.md` IS test-consumed** — but *not for this table*. See the mutation proof below, which is
the whole point of the finding. `docs/conventions.md` is not test-consumed at all.

**The fact's owner is code**, `scripts/kaola-workflow-codex-preflight.js:89–92`:

```js
const CODEX_STANDARD_MODEL = 'gpt-5.6-sol';
const CODEX_STANDARD_EFFORT = 'medium';
const CODEX_REASONING_MODEL = 'gpt-5.6-sol';
const CODEX_REASONING_EFFORT = 'xhigh';
```

They are real constants with real consumers (`codex-preflight.js:1737`, `test-route-reachability.js:543–544`),
and they are cross-bound to the installer's copies by `validate-kaola-workflow-contracts.js:444–452`.
That guard is **code↔code**. Nothing binds either doc.

**Copy 1 — `docs/api.md:1535–1538`** (4 lines):

```markdown
| Role tier | Codex model | Reasoning effort |
|---|---|---|
| `standard` | `gpt-5.6-sol` | `medium` |
| `reasoning` | `gpt-5.6-sol` | `xhigh` |
```

**Copy 2 — `docs/conventions.md:45–47`** (3 lines):

```markdown
- `reasoning_effort` — paired with that model for this spawn: standard uses `medium` and reasoning uses
  `xhigh`
```

(`docs/conventions.md:45` carries the model half: "both tiers use `gpt-5.6-sol`".)

**Why this is the class the brief prizes.** `CLAUDE.md` states the rule — *"a mechanism claim in a
brief rots and makes the agent wrong, where the same fact as evidence only makes it check"* — and
`docs/api.md` itself already demonstrates the correct handling **for a different fact**: the
per-edition finding-type **counts** stated in its prose are parsed and cross-checked against the live
registries by `test-forge-finalize-findings.js:570–578`. So this repo knows how to bind a restated
number to its source. The tier table is the same shape of claim with none of that binding.

**Corroboration from a concurrent agent, which I did not solicit.** `impl-955` is, right now,
rewriting `docs/architecture.md:382–387` to delete a **third** copy of this same pair. Before:

> Codex keeps the same role classification but maps it at spawn time: `standard` to
> `gpt-5.6-sol` / `medium`, and `reasoning` to `gpt-5.6-sol` / `xhigh`.

After: the values are gone and replaced by a pointer. Two agents reached the same judgement about
the same fact from different directions. The two copies above are what that edit leaves behind.

#### F2 — mutation proof (this is the finding; the rest is context)

A green suite is not proof a guard is armed, so I ran an A/B in disposable clones of `483a5e5e`.
**One axis: the doc bytes.** Two mutations of the *same file*, one on the fact I claim is unbound and
one on a fact I know is bound — so the run doubles as its own positive control.

**Mutation A — the tier restatement.** `docs/api.md`: `gpt-5.6-sol`→`gpt-4o-mini`, `medium`/`xhigh`→`low`.
`docs/conventions.md`: the same two values. Both docs now state a Codex contract that contradicts the
constants.

| suite | reads `docs/api.md`? | exit with mutation A |
|---|---|---|
| `validate-workflow-contracts.js` | yes | **0** |
| `validate-kaola-workflow-contracts.js` | yes | **0** |
| `test-forge-finalize-findings.js` | yes — parses it | **0** |
| `test-kernel-conformance.js` | no (reads `workflow-state-contract.md`) | 0 |
| `test-validation-allowband.js` | path-shape only | 0 |
| `test-route-reachability.js` | no — reads the *constants* | 0 |
| `test-agent-model-resolver.js` | no — reads the *constants* | 0 |
| `test-spawn-classification.js` | no | 0 |
| `generate-routing-surfaces.js --check` | no | 0 |

**Positive control — mutation B, same file, a bound fact.** `docs/api.md`: `raise **seven**` →
`raise **five**` (the per-edition finding-type count).

```
$ node scripts/test-forge-finalize-findings.js
FAIL: static: docs/api.md says the forge ports raise five finding types; measured 7
      (["archive_commit_probe_failed","archive_stage_failed","claim_release_skipped_offline",
        "finalize_commit_probe_failed","main_roadmap_mirror_not_regenerated","residue_probe_failed",
        "residue_stage_failed"])
132 passed, 1 failed
POSITIVE_CONTROL_EXIT=1
```

**So the runner is not blind and the file is not unread.** The very same suite, opening the very same
doc, catches a false *count* and does not catch a false *model and effort pair*. The difference is
not coverage — it is that one claim was bound to its source and the other was copied.

**Baseline control:** the unmutated clone runs the whole fast gate (`npm run test:kaola-workflow:claude`)
green, so a green result above is a real green and not a broken clone.

**What the cut is.** Seven lines of restated values, replaced by a pointer to
`kaola-workflow-codex-preflight.js:89–92` — the treatment `impl-955` is applying to the third copy in
`architecture.md` as I write. Alternatively, bind them the way the finding-type counts are already
bound. **Both are cuts the user chooses between; this audit only shows the copies are unbound.**

---

### F3 · `yagni:` — `docs/README.md`'s opencode index line advertises a capability that was removed — 1 line

**Not test-consumed** (`docs/README.md` is validation-invisible, and nothing reads it — the
`docs/README.md` hits in `templates/routing/init.skeleton.md` are the *consumer's* scaffold, per Task
Zero). Freely editable; no receipt impact.

The line (`docs/README.md:20` at the moment of measure — `impl-955`'s in-flight edit above it shifts
the number, so it is quoted rather than cited by line):

```markdown
- [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` +
  `.opencode/` tree; provider-open two-tier effort mapping; installs via `install-opencode.sh`).
```

**The doc it links to records the removal in its own § "Model and effort — inherited from the
session"** (`docs/opencode-edition.md:102–108`):

> The edition previously seeded a per-role effort tier — a `provider.*.variants` block and an
> `agent.<role>.variant` or `.options` entry for each role. That is **removed**, not merely
> deprecated…

So the index advertises the removed half of the thing its own target says is gone.

**Measured, not read off the prose.** I rendered the config the installer actually seeds and scanned
the emitted bytes:

```
$ node -e "require('./scripts/sync-opencode-edition.js').renderOpencodeJson({})"
--- renderOpencodeJson({}) — DEFAULT seeded config ---
  bytes: 1507 | variant key: false | effort: false | model: true
```

**Positive control for the detection method** (the brief requires one, and this repo has been burned
verifying a deletion without it): the same render, the same scan, *finds* the capability that does
exist — `model: true`, and the emitted comment block enumerates the reasoning tier by name:

```
  // Kaola-Workflow · opencode edition — TWO model tiers:
  //   普通模型 (standard tier)  → top-level "model".
  //   推理模型 (reasoning tier) → "agent.<role>.model" overrides for
  //                               the reasoning roles: adversarial-verifier, build-error-resolver,
  //                               code-architect, code-reviewer, planner, security-reviewer, synthesizer.
```

A method that reports `effort: false` while reporting `model: true` on the same bytes is not blind to
the key it is looking for.

**Second, independent confirmation** — `scripts/test-opencode-edition.js:791` ships a guard whose
whole job is that the mechanism word is gone:

```js
const MECHANISM_WORD = /\bvariants?\b/i;
```

and `scripts/sync-opencode-edition.js` emits no `variant`, no `variants`, and no effort key anywhere.

**What survives, precisely** — this is why the line cannot simply be deleted: there *is* a two-tier
structure, but it is a **model** pin, it is **opt-in**, and it is **off by default** (both tiers
inherit the session's model unless you set `KAOLA_OPENCODE_STANDARD_MODEL` /
`KAOLA_OPENCODE_REASONING_MODEL`). The word that has to go is `effort`. "provider-open" is accurate.

**Why it survived to now:** nothing reads `docs/README.md`. No guard, no test, no `--check`. The
sibling line directly beneath it — the kimi entry, "roles as Skills, inherit-only model tier" — I
checked against `KIMI_RUNTIME_NATIVE` in `scripts/test-kimi-edition.js:411–413` and it is **accurate**.
The opencode line is the only stale one in the index.

---

### F4 · `shrink:` — `docs/opencode-edition.md` re-types the reasoning-tier roster the generator derives — 3 lines

**Not test-consumed.** Verified two ways: validation-invisible under the shipped predicate, and

```
$ git grep -l "opencode-edition.md" -- 'scripts/*.js' 'plugins/*/scripts/*.js' 'hooks/' \
      'templates/' 'package.json' 'install*.sh'
EXIT=1
```

(exit 1 = no match). Every reference to this doc is prose or archive. **No script reads it.**

`docs/opencode-edition.md:122–124` hand-types the roster:

> `agent.<role>.model` overrides for the seven reasoning-tier roles (`adversarial-verifier`,
> `build-error-resolver`, `code-architect`, `code-reviewer`, `planner`, `security-reviewer`,
> `synthesizer`)

The roster is **derived**, not authored — `sync-opencode-edition.js:565–574` computes it by reading
each `agents/<role>.md`'s frontmatter tier:

```
$ node -e "require('./scripts/sync-opencode-edition.js').reasoningRoles()"
["adversarial-verifier","build-error-resolver","code-architect","code-reviewer","planner",
 "security-reviewer","synthesizer"]
```

**The copy is correct today** — all seven match, and it also matches
`CODEX_PINNED_REASONING_ROLES`. It is filed anyway, because its correctness is a coincidence of
maintenance rather than a property: adding a reasoning-tier role, or flipping one role's `model:`
frontmatter, changes `reasoningRoles()` and silently leaves this sentence — and the word "seven" —
behind. The generated `opencode.json` already prints the live list in its own comment block, so the
doc could point at that instead of re-typing it.

Rot proximity, measured, not asserted: `impl-953` is editing `agents/code-architect.md`,
`agents/implementer.md` and `agents/planner.md` in this very worktree right now. I checked their
diffs — **no `model:` frontmatter line changes**, so this sentence is not rotting today. It was one
frontmatter line away from doing so.

---

### F5 · `shrink:` — `docs/architecture.md` inlines `PARKED_LANE_PREFIXES`'s values without naming it — 1 line

**Not test-consumed.**

`docs/architecture.md:121` writes the three values as prose:

> another lane's scratch under `kaola-workflow/`, `.kw/worktrees/` or `.kw/legs/` does not read as

`scripts/kaola-workflow-adaptive-schema.js:301`:

```js
const PARKED_LANE_PREFIXES = Object.freeze(['kaola-workflow/', '.kw/worktrees/', '.kw/legs/']);
```

**The contrast is the finding, and it is inside this repo already.** `docs/conventions.md:785–788`
states the *same three values* but leads with the constant and its home —
"**`PARKED_LANE_PREFIXES`** (exported from `kaola-workflow-adaptive-schema.js`)" — so a reader who
finds a fourth prefix in the code knows immediately which text is authoritative. `architecture.md`
gives the reader no such handle. One line; smallest finding here; listed because the fix is to copy
the neighbouring doc's phrasing, not to invent anything.

---

## The classes that came up EMPTY, and what was actually run

Recorded plainly rather than padded, per the brief.

| class | result |
|---|---|
| `delete:` against any **live** doc | **empty.** All eight top-level docs and `docs/audits/` are linked and reachable. The only zero-inbound docs are the 24 history files in F1. |
| `yagni:` against the documented **CLI surface** | **empty — and proven so.** See below. |
| `yagni:` against `docs/audits/` | **empty.** `opencode-edition-audit.md` is explicitly datelined (`**Date:** 2026-06-19`, `at commit 77e88c38`). Its 17 `effort`/`variant` mentions describe the state *then*. A dated audit that records a since-removed mechanism is doing its job. |
| `stdlib:` / `native:` | **structurally empty.** These name a code replacement producing identical output. A markdown file has no stdlib equivalent. No finding of this class is possible in `docs/`, and none is filed. |
| retired-machinery prose in `decisions/` / `investigations/` | **not filed, on purpose.** `docs/README.md:34–37` rules these retained as history. Filing against them would be re-litigating a decision the repo has already written down. |

**The CLI check, because "empty" is only worth anything if the method could have found something.**
I parsed the documented subcommand list out of `docs/api.md`'s usage block and the implemented
dispatch literals out of `scripts/kaola-workflow-claim.js`, then diffed both directions:

```
documented: 21 · implemented: 22
POSITIVE CONTROL — in BOTH (the method must find these): 21
DOCUMENTED but NOT implemented: (none)
IMPLEMENTED but NOT documented: discard
```

Twenty-one documented subcommands, twenty-one of them real. The method demonstrably finds matches, so
the empty result is a measurement and not a silent failure. (`discard` is documented nowhere in the
usage block — that is an *addition*, out of scope for a subtraction audit, and noted only so the next
reader does not re-derive it.)

---

## Two things found in passing that belong to other agents

Neither is a #952 finding. Both are measured, and both would be expensive to rediscover.

### 1. `impl-955`'s in-flight `docs/architecture.md` rewrite points at the wrong constants

The new text (uncommitted, in the shared worktree) reads:

> Codex keeps the same role classification but maps it to a model / reasoning-effort pair at spawn
> time. That pair is declared once, by `CODEX_PINNED_STANDARD_ROLES` and
> `CODEX_PINNED_REASONING_ROLES` in `kaola-workflow-adaptive-schema.js` …

**Those two constants do not declare the pair.** Measured:

```
CODEX_PINNED_STANDARD_ROLES   array[7] ["code-explorer","investigator","knowledge-lookup",…]
CODEX_PINNED_REASONING_ROLES  array[7] ["planner","code-architect","build-error-resolver",…]
```

They are **role rosters** — which roles sit in which tier. The model/reasoning-effort *pair* is
declared by four different constants in a different file,
`scripts/kaola-workflow-codex-preflight.js:89–92` (`CODEX_STANDARD_MODEL`, `CODEX_STANDARD_EFFORT`,
`CODEX_REASONING_MODEL`, `CODEX_REASONING_EFFORT`). The edit correctly removes a restated value and
replaces it with a pointer — the right move, and the same judgement as F2 — but the pointer lands on
the wrong constants, so a reader who follows it finds no model and no effort. Worth one line to
`impl-955` before that edit lands.

### 2. `docs/README.md`'s stale opencode line survives `impl-955`'s edit

`impl-955` is editing the line directly *above* the F3 line (the Architecture entry, to add the new
capability-table pointer). The opencode entry is untouched. F3 is not being fixed incidentally.

---

## The two findings the ranking should lead with

I found these last, by a sweep I nearly did not run, and they outrank everything above on *kind* even
though F1 outranks them on lines. Both are the class the brief called dominant — **documentation of
machinery that is gone** — and one of them is an instruction a reader can try to follow and fail.

### The sweep that found them

For each of the eight live docs, extract every backtick-quoted token that looks like a code
identifier — `CONSTANT_CASE`, `functionName()`, `KAOLA_*` env var, or a `*.js|.sh|.json|.toml|.md`
path — and check it against the concatenated bytes of the whole executable surface (281 files:
`scripts/`, `plugins/`, `templates/`, `hooks/`, `commands/`, `agents/`, the four installers,
`package.json`, `.opencode`, `.kimi`, `.claude-plugin`). Dot-directories reached by construction —
`git ls-files`, no grep.

```
code surface files: 281 | bytes: 11,396,916
docs/README.md                   identifiers checked:    3 | NOT FOUND in code: 0
docs/api.md                      identifiers checked:  106 | NOT FOUND in code: 1
docs/architecture.md             identifiers checked:   50 | NOT FOUND in code: 2
docs/conventions.md              identifiers checked:  113 | NOT FOUND in code: 13
docs/workflow-state-contract.md  identifiers checked:   43 | NOT FOUND in code: 3
docs/agents-source.md            identifiers checked:   14 | NOT FOUND in code: 0
docs/opencode-edition.md         identifiers checked:   32 | NOT FOUND in code: 1
docs/kimi-edition.md             identifiers checked:   36 | NOT FOUND in code: 1
```

397 identifiers checked, 21 unresolved. **The method's positive control is the other 376** — it
resolves the overwhelming majority, so a miss is a signal rather than a broken matcher. Of the 21, 17
are `docs/decisions/D-NNN-NN.md` cross-references (my code surface deliberately excludes `docs/`, so
those are expected and were discarded), one is a runtime-created path (`.roadmap/_rules.md`), and one
is `run-progress.json` — which turns out to be **correctly** documented as removed
(`docs/workflow-state-contract.md:80` lists it under what "went with them", so it is a record of a
deletion, not a stale reference; **not a finding**).

That leaves two.

---

### F6 · `yagni:` — `docs/conventions.md` documents a guard mechanism that no longer exists, and tells the reader to add to it — 13 lines

**Not test-consumed.** `docs/conventions.md` is validation-invisible and no script reads it.

`docs/conventions.md:281–293` documents `FEATURE_TOKENS`:

> 2. **Feature-token mirroring** — for non-generated roles, `scripts/test-agent-profile-parity.js`
>    enforces that any token in the curated `FEATURE_TOKENS` list that is present in an
>    `agents/<name>.md` MUST also appear in all three `.toml` twins. **Add a token to
>    `FEATURE_TOKENS` only after it is GREEN at HEAD** …
>
> **Workflow:** For a non-generated role, mirror a new feature paragraph/token into all three `.toml`
> twins first, **then pin it in `FEATURE_TOKENS`.**

**`FEATURE_TOKENS` does not exist.** Measured in the clean clone at `483a5e5e`:

```
$ git grep -l "FEATURE_TOKENS" | grep -v '^docs/\|^kaola-workflow/'
CHANGELOG.md
```

CHANGELOG only — i.e. the historical record of the mechanism, not the mechanism. The constants that
file actually declares are `ROLE_PINS`, `SAFETY_BASELINE_RULES`, `MIN_RULE_CHARS`,
`CONSENSUS_NUMERATOR`, `CONSENSUS_DENOMINATOR`, `TOML_TREES`, `CODEX_ROLE_SCHEMA_FIELDS`.

**Positive control, from the adjacent paragraph of the same doc.** Twelve lines further on,
`docs/conventions.md:297–298` names `CONFIG_HOOKS_FAMILY` and `normalizeConfigHooks()`:

```
$ git grep -c "CONFIG_HOOKS_FAMILY" -- scripts/validate-script-sync.js
scripts/validate-script-sync.js:6
```

Same doc, same section, same method — that one resolves six times. The method is not blind; the
mechanism is gone.

**Provenance** (for the follow-up issue, not for the doc): introduced by #422 at `28183f2d`, removed
at `523f1241` — "close the 2026-07-31 runtime-consistency audit — #881–#885". The removal took the
code and left the instructions.

**Why this one is worse than a stale sentence.** F3 misdescribes a capability. This *directs an
action*: "mirror the token into all three twins first, then pin it in `FEATURE_TOKENS`". A reader who
follows it opens `test-agent-profile-parity.js`, finds no such list, and has to reconstruct which
half of the paragraph is still true. That is precisely the cost `CLAUDE.md` names — *"a mechanism
claim in a brief rots and makes the agent wrong"*.

**Verified against the in-flight edit, because it would have been easy to get wrong.**
`scripts/test-agent-profile-parity.js` is modified *right now* in the shared worktree by `impl-953`.
Every measurement above was taken in the clean clone at `483a5e5e`, so the absence is pre-existing
and is **not** something a concurrent agent just deleted.

---

### F7 · `yagni:` — `docs/kimi-edition.md` names a renderer that was deleted as a dead export — 3 lines

**Not test-consumed.** Validation-invisible; nothing reads it.

`docs/kimi-edition.md:97–100`:

> The adaptive planner's per-node tier (`reasoning`/`standard`) survives as **metadata only**: it is
> recorded in the dispatch packet and ledger, and `modelDisplay()` renders it as
> `parent session (<tier> tier metadata)` — the same semantics as the Codex edition.

Neither the function nor the string it is said to render exists:

```
$ git grep -l "modelDisplay" -- scripts/ plugins/ templates/ commands/ agents/ hooks/ .opencode .kimi
REAL_EXIT=1                       # no match

$ git grep -n "parent session (" -- scripts/ plugins/ templates/ commands/ agents/ .opencode .kimi
REAL_EXIT=1                       # no match
```

(Real exit codes, taken without a pipe — a `| head` would have reported `head`'s 0 and I would have
recorded the opposite result.)

**Positive control** — three other identifiers this doc names, checked the same way, all resolve:
`KIMI_RUNTIME_NATIVE` → `scripts/test-kimi-edition.js`; `inherit_session_model` →
`scripts/test-kimi-edition.js`; `sync-kimi-edition.js` → referenced from
`scripts/simulate-workflow-walkthrough.js`.

**Provenance:** `modelDisplay` left at `a9cf4756` — *"refactor(kernel): drop the exports the ADR 0017
demolition left with no consumer."* It was removed *as* a dead export; the doc kept citing it.

**Precision about the cut, because the paragraph is not wholly wrong.** The *claim* around it
survives: the tier really is declarative metadata, and `validate-kaola-workflow-contracts.js:420,468`
still speaks of "declarative tier metadata". What is dead is the named renderer and its exact output
string — the mechanism half of the sentence, not the fact half.

---

## F2's decisive leg — the whole fast gate, A/B, one axis

Run after the per-suite table above, in two disposable clones of `483a5e5e`, **serially** (this
suite is spawn-bound and a concurrent second run produces false reds — I had two runs overlap in one
clone early on, killed both, and re-ran clean rather than read the result).

| leg | `docs/api.md` + `docs/conventions.md` | command | wall | exit |
|---|---|---|---|---|
| **baseline** | unmodified | `npm run test:kaola-workflow:claude` | 7:10.66 | **0** |
| **mutation A** | Codex tier stated as `gpt-4o-mini` / `low` | same | 6:33.92 | **0** |
| **positive control** | `raise **seven**` → `raise **five**` | `node scripts/test-forge-finalize-findings.js` | — | **1** |

**The entire fast gate passes while two shipped docs state a Codex model and reasoning effort that
contradict the constants.** The same gate, the same file, catches a false count. The finding is not
"the docs are wrong" — they are right today — it is that **nothing would tell anyone when they stop
being right**, and the repo already owns the mechanism that would.

One scope caveat, stated because the gate itself states it: `test:kaola-workflow:claude` samples the
walkthrough at `--shard auto/12`. Both legs sampled it. Nothing in the walkthrough reads either doc
(Task Zero), so the sampling does not weaken the conclusion — but a reader should not take "the fast
gate is green" as "everything ran".

---

## Findings in rank order

Ranked by lines, as the brief specifies. No doc here is ported, so no multiplier applies to any of
them.

| # | class | doc | lines | test-consumed? | what the measurement shows |
|---|---|---|---:|---|---|
| **F1** | `delete:` | 24 files in `decisions/` + `investigations/` | **3,831** | no | zero inbound prose links; **but the repo has already ruled these retained as history — user's call, not a recommendation** |
| **F6** | `yagni:` | `docs/conventions.md:281–293` | **13** | no | documents `FEATURE_TOKENS`, which exists only in `CHANGELOG.md`; includes an instruction to add to it |
| **F2** | `shrink:` | `docs/api.md:1535–1538` + `docs/conventions.md:45–47` | **7** | api.md yes (not for this table) | Codex model/effort pair restated in two docs; whole fast gate green with both lying |
| **F7** | `yagni:` | `docs/kimi-edition.md:97–100` | **3** | no | names `modelDisplay()` and its output string; neither exists — removed as a dead export |
| **F4** | `shrink:` | `docs/opencode-edition.md:122–124` | **3** | no | re-types the 7-role reasoning roster that `reasoningRoles()` derives; correct today, unbound |
| **F3** | `yagni:` | `docs/README.md` opencode index line | **1** | no | advertises a "two-tier **effort** mapping" that was removed, not deprecated |
| **F5** | `shrink:` | `docs/architecture.md:121` | **1** | no | inlines `PARKED_LANE_PREFIXES`'s three values without naming the constant; the neighbouring doc does it right |

**3,859 lines total; 28 of them outside the history corpus.**

**If the ranking by lines is read as a ranking by value, it will mislead** — the brief warns against
exactly this. By value the order is **F6, F2, F7, F3, F4, F5**, and F1 is not a recommendation at
all. F6 is 13 lines and is the only finding that can make a reader act on a mechanism that is not
there.

## One pointer to the other half of this audit

`docs/api.md:1399–1410` documents `claim.js barrier-ref-sweep`, "a one-shot collector for
`refs/kaola-workflow/barrier/*` refs stranded by the retired node executor". The command exists, so
documenting it is correct and **this is not a docs finding**. But if the scripts half of #952 files
against the command itself, its 12 lines of API documentation go with it — a test is deleted with its
mechanism, and so is a doc. Flagged so the two halves do not double-count or, worse, disagree.

## What I did not measure, and why

- **`docs/decisions/` and `docs/investigations/` content** was not audited for internal accuracy —
  178 files, ~29,600 lines, explicitly retained as history by `docs/README.md:34–37`. Auditing prose
  the repo has already decided to keep would have produced findings that cannot be filed.
- **ADR 0017's watch-list and "built once, removed, recoverable" rows** — excluded by the brief, and
  `docs/decisions/0017-the-mission-list.md` was being edited by another agent throughout this run.
  Nothing here touches it.
- **`docs/api.md`'s 1,655 lines were not read end to end.** The identifier sweep covered its 106 code
  references and the CLI diff covered its command surface; a prose claim naming no identifier could
  still be stale and this audit would not have seen it.

---

# Second pass — the three assigned leads, plus the retired-machinery sweep

Assigned after the first pass, with the instruction to treat all three as hypotheses. Lead 1 (the
opencode index line) is **F3 above** — confirmed independently, with a positive control, before the
lead was given to me. Leads 2 and 3 are new and are filed below as F8 and F9. All measurements at
`483a5e5e` in the clean clone; `docs/architecture.md` is being edited in the shared worktree by
`impl-955`, so **every line number below is the audited commit's, not the worktree's**.

---

### F8 · `yagni:` — `docs/architecture.md:295–296` says opencode/kimi are outside the routing-surface propagation; they are its consumers — 2 lines

**Not test-consumed.** Verdict: **the lead's "only half true" is correct, and the false half is the
half a reader acts on.**

The sentence (`docs/architecture.md:295–297`):

> **Two additive runtime editions** — opencode and Kimi — are runtimes, not forges. They are not
> wired into `npm test`, `edition-sync.js`, `install.sh`, **or the routing-surface propagation set**,
> and they carry their own suites…

Four sub-claims. I measured each separately:

| sub-claim | measurement | verdict |
|---|---|---|
| not in `npm test` | `package.json` `test` = `claude && codex && gitlab && gitea` | **true** |
| not in `edition-sync.js` | `grep -c -i "opencode\|kimi"` → **0** | **true** |
| not in `install.sh` | `grep -c -i "opencode\|kimi"` → **0** | **true** |
| not in the routing-surface propagation set | see below | **FALSE as written** |

**What the propagation set is.** `generate-routing-surfaces.js` writes 3 topics × 6 edition dirs = 18
surfaces, and `--check` verifies exactly those:

```
TOPICS: 3 ["next","init","finalize"]
COMMAND_EDITIONS: 3  commands | plugins/kaola-workflow-gitlab/commands | plugins/kaola-workflow-gitea/commands
SKILL_EDITIONS:   3  plugins/kaola-workflow/skills | …-gitlab/skills | …-gitea/skills
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
```

No `.opencode`, no `.kimi`. **So the doc is right that they are not among the 18 render targets.**

**But they consume that registry, by design and by their own comments.** `sync-opencode-edition.js:18–21`:

> the command sources come from the routing-surface registry via `runtime-edition-forge.js`, so each
> forge renders from the same byte-checked surfaces the Claude/Codex editions ship

and `sync-opencode-edition.js:153–157`: *"the runtime edition holds no command list of its own to drift."*
`sync-kimi-edition.js:31,112–121` says the same. Measured, not read:

```
routing registry command basenames: ["kaola-workflow-finalize","workflow-init","workflow-next"]
opencode listCanonCommands():       ["kaola-workflow-finalize.md","workflow-init.md","workflow-next.md"]
kimi     listCanonCommands():       ["kaola-workflow-finalize.md","workflow-init.md","workflow-next.md"]
SHIPPED .opencode/command/:          kaola-workflow-finalize.md workflow-init.md workflow-next.md
```

**Operational proof for opencode — an A/B on one axis.** Baseline, clean clone:
`sync-opencode-edition.js --check` → **exit 0**. Then append one comment line to the canonical
routing surface `commands/workflow-next.md` and re-run:

```
opencode --check exit=1
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - .opencode/command/workflow-next.md — stale — regenerate
```

A routing-surface edit propagates into the opencode tree and its own guard says so by name.

**Negative control** (so "consumes the registry" is a discriminating test, not a universal yes):
`grep -c commandSources` → `kaola-workflow-classifier.js: 0`, `kaola-workflow-sink-merge.js: 0`.

**Honest limit — kimi's operational leg does NOT hold, and I am not claiming it.** `.kimi` is
**untracked** (`git ls-files .kimi` → 0), so `sync-kimi-edition.js --check` is red in *both* legs —
19 "missing generated …" entries — and `diff baseline mutated` is **empty**. The kimi A/B carries no
signal. Kimi's coupling rests on the direct `listCanonCommands()` measurement and its source comment,
which is weaker evidence than opencode's and is reported as such.

**The cut is one or two words.** The code says the precise thing — "it stays out of `npm test`,
`edition-sync.js`, `install.sh`, and **the SIX routing surfaces**" — which is true, because six is the
render-target count. The doc reworded that to "the routing-surface propagation **set**", which reads
as the whole mechanism and is false. Restoring the code's own phrasing fixes it. **A reader who
believes the current sentence will edit a routing skeleton and never regenerate the opencode tree.**

---

### F9 · `yagni:` — `docs/architecture.md:287` calls the Codex tree a forge edition — 1 line

**Not test-consumed.** Filed as the lead instructed: **not** as "four editions is wrong", but as the
one clause that is actually false.

> **Four forge editions** ship the same workflow **against a different forge CLI**: the canonical
> GitHub tree in `scripts/` plus `plugins/kaola-workflow/` (Codex), `plugins/kaola-workflow-gitlab/`,
> and `plugins/kaola-workflow-gitea/`.

**Measured — which forge CLI each of the four trees actually calls:**

| tree | `gh` | `glab` | `tea` |
|---|---:|---:|---:|
| `scripts/` (canonical) | **127** | 0 | 0 |
| `plugins/kaola-workflow/scripts/` (Codex) | **64** | 0 | 0 |
| `plugins/kaola-workflow-gitlab/scripts/` | 0 | **34** | 0 |
| `plugins/kaola-workflow-gitea/scripts/` | 0 | 0 | **41** |

**Four trees, three forge CLIs.** The Codex tree calls `gh` — the *same* CLI as the canonical tree —
so "four … against a different forge CLI" is false precisely on the member the lead flagged. The
distinguishing axis for `plugins/kaola-workflow/` is the **runtime** (Codex), not the forge.

**Positive control:** the same method correctly finds `glab` only in the gitlab tree and `tea` only in
the gitea tree, with zero cross-contamination in any cell. It discriminates.

**Blast radius — measured, because the lead was right to ask and it is answerable with a number.**

```
$ git grep -n -i "four forge edition"        # excluding kaola-workflow/archive/
CHANGELOG.md:4137                            # history
docs/architecture.md:287                     # ← the only LIVE doc
docs/decisions/D-530-02.md:76                # history (ADR)
```

**The phrase appears in exactly one live doc.** The load-bearing vocabulary is the *different* phrase
"four editions", which appears in `CLAUDE.md`, `docs/api.md` (×3), `docs/conventions.md` (×3),
`CHANGELOG.md` (×133) and ~20 ADRs — and **none of them is touched** by removing the word "forge"
from this one line. So the rewording the lead worried about is not required: "four editions" survives
untouched, and only the false clause moves.

Corroboration, arrived at independently by another agent in this run: the #955 premise pass recorded
the same trap in this bundle's mission list — *"four RUNTIMES != four EDITIONS; routing surfaces
render over SIX edition trees because the forge axis multiplies claude and codex but not
opencode/kimi."*

---

## Hypotheses CHECKED AND CLEARED — filed so nobody re-files them

Every one of these looked like a retired-machinery hit and is not. Silence is an answer, and an
unfiled non-finding gets rediscovered by the next reader.

| suspected retired thing | live-doc hits | verdict |
|---|---|---|
| **the consent valve** | `docs/api.md:193` calls the dirty-tree stop "the consent valve" | **NOT stale.** The deleted thing is the ***durable*** consent valve, and every live text that names the deletion says "durable" — `CLAUDE.md:60`, `docs/architecture.md:67`, `templates/routing/required-blocks.js:34`. The live valve is real: `dirty_tree_refused` is in `kaola-workflow-claim.js` (3 hits), classified `consent` at `docs/api.md:80`, and the phrase is the code's own vocabulary (`claim.js:1251`, `simulate-workflow-walkthrough.js:1898–99`, `test-outcome-recorder.js:251,687`). |
| **the `--profile` axis** | `docs/conventions.md:71` | **NOT stale.** It names **Codex's own** ephemeral `--profile`/`-c` launch overrides, in a sentence about what the doctor diagnostic *cannot* see. Not Kaola's retired install flag. |
| **the model badge (#949)** | none | **clear.** `grep -i badge` over all eight live docs → `REAL_EXIT=1`, no match. |
| **`issue-scout`** | `docs/kimi-edition.md:344`, `docs/opencode-edition.md:254` | **NOT stale.** The role is gone (`git grep issue-scout -- agents/ plugins/*/agents/ commands/ templates/ .opencode` → `REAL_EXIT=1`), and both hits are *about* its absence: kimi asserts "no retired issue-scout dispatch prose"; opencode quotes sample installer output for a config written by an **older** install, which is exactly where a retired role name legitimately appears. |
| **the DAG / node-id era** | `docs/conventions.md:314`, `docs/workflow-state-contract.md:309,448–451`, `docs/architecture.md:62–67` | **NOT stale.** Every live mention is inside an explicit removal record — `## What was deleted, and what it cost`, `### What this file no longer carries`. `workflow-state-contract.md:80` records `run-progress.json` the same way. This is the correct handling, and it is the reason the whole class yields so little in the live set. |

**Why the sweep is credible when it says "clear".** The same method, over the same eight docs, did
find F3 (`effort`), F6 (`FEATURE_TOKENS`) and F7 (`modelDisplay()`). A sweep that returns nothing is
only worth reading if it has returned something.

## Revised ranking, both passes

| # | class | doc | lines | value rank |
|---|---|---|---:|---|
| F1 | `delete:` | 24 history docs | 3,831 | not a recommendation |
| F6 | `yagni:` | `docs/conventions.md:281–293` | 13 | **1** |
| F2 | `shrink:` | `docs/api.md` + `docs/conventions.md` | 7 | **2** |
| F8 | `yagni:` | `docs/architecture.md:295–296` | 2 | **3** |
| F7 | `yagni:` | `docs/kimi-edition.md:97–100` | 3 | 4 |
| F9 | `yagni:` | `docs/architecture.md:287` | 1 | 5 |
| F3 | `yagni:` | `docs/README.md` opencode line | 1 | 6 |
| F4 | `shrink:` | `docs/opencode-edition.md:122–124` | 3 | 7 |
| F5 | `shrink:` | `docs/architecture.md:121` | 1 | 8 |

**F8 enters the value ranking at 3** — above four findings with more lines — because it is the only
finding that can make a reader *skip a required regeneration step*. F6 stays first for the same
reason: both misdirect an action rather than merely misdescribe a fact.

---

## F2 STRENGTHENED — the pointer conflict between the two reports, resolved by measurement

The lead's synthesis says the Codex model/effort pair "is authored in the routing skeletons'
dispatch-routing pin". F2 above says its source is `kaola-workflow-codex-preflight.js:89–92`. I
flagged the mismatch rather than let two reports point readers at different owners, then measured it.

**Both are right. There are two independent authorings of the same four values**, and the full
carrier set is wider than F2 first stated:

```
$ git grep -l -P "gpt-5\.6-sol" -- templates/ commands/ agents/ plugins/ scripts/ .opencode
templates/routing/next.skeleton.md            ← PROSE authoring surface
templates/routing/finalize.skeleton.md        ← PROSE authoring surface
plugins/{kaola-workflow,-gitlab,-gitea}/skills/kaola-workflow-{next,finalize}/SKILL.md   ← 6 rendered
scripts/kaola-workflow-codex-preflight.js  (+ its 3 ported copies)                       ← CONSTANTS
plugins/*/scripts/install-codex-agent-profiles.js  (×3)                                  ← CONSTANTS
scripts/{validate-kaola-workflow-contracts,test-route-reachability,test-agent-model-resolver,
         test-agent-profile-parity,test-install-model-rendering}.js                      ← GUARDS
```

`templates/routing/next.skeleton.md:8–9` carries the values literally:

```markdown
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.
```

**And that prose copy IS bound to the constants.** `test-route-reachability.js:530–545`, T19b:

```js
// effortDefects — PURE. The tier->effort mapping, bound to the constants the Codex installer and
// preflight validate installed profiles against, so the prose and the validator cannot drift apart.
const EXPECTED_EFFORTS = {
  standard: codexPreflight.CODEX_STANDARD_EFFORT,
  reasoning: codexPreflight.CODEX_REASONING_EFFORT,
};
```

It regex-asserts that each shipped Codex SKILL states `reasoning_effort: "<effort>"` matching the
constant, over an obligated universe it computes rather than hand-lists. `test-route-reachability.js`
runs in the fast gate (`package.json` → `true`).

**This makes F2 a sharper finding than I first filed it.** The claim is no longer "nobody binds this
fact". It is:

> **The repo binds this fact in every prose surface it ships — six Codex SKILLs, from two skeletons,
> to the constants, inside the same gate — and the two `docs/` copies are the sole exception.**

The mutation proof already showed exactly this and I under-read it: with `docs/api.md` and
`docs/conventions.md` stating `gpt-4o-mini`/`low`, `test-route-reachability.js` exits **0**, because
it reads the constants and the SKILL prose and never opens a doc. The binding mechanism exists, runs
today, and is nine lines long. The docs are simply not in its universe.

**Neither report was wrong; each named one of two real authorings.** The synthesis should say the
pair is authored twice — as constants in `codex-preflight.js:89–92` and as prose in
`templates/routing/{next,finalize}.skeleton.md` — with the prose bound to the constants by T19b, and
`docs/api.md:1535–1538` + `docs/conventions.md:45–47` as the unbound copies that escalate.
