# Premise investigation — issue #900 (consumer candidate-hash recorder)

- **Baseline**: `9b68b0962f52443e2b4ca91c2fa924440cea829b` (`main`), clean except untracked
  `kaola-workflow/bundle-900-901-902-903/`.
- **Linked worktree measured**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
  (branch `workflow/bundle-900-901-902-903`, HEAD `9b68b096` — no branch commits yet).
- **Node**: v24.14.0. **Scratch**: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/p900/`
- Read-only on tracked files. Every hash below is reproducible by the recorded command.

---

## VERDICT

**PREMISE HELD** — every factual claim in #900 reproduces exactly: the gate requires a column-zero
`validated_candidate_hash: <64-hex>`, the shipped consumer recipe on all 9 surfaces asks only for
`verdict: pass` + the command, no invocable producer exists anywhere in the repo, the operator hint
names no command, and the candidate hash is bound to whichever working tree the caller stands in.

Two corrections to the framing, neither of which weakens the premise:

1. **This gap is already recorded in the repo's own docs.** `docs/conventions.md:424-427` states it
   outright: *"the retired plan-validator's `--candidate-hash` CLI went with it, so a consumer repo
   currently has no shipped command that prints the value it is asked to record."* #900 is not a
   discovery; it is a known, documented hole that no surface was updated to route around.
2. **The classification does not block finalize.** `cmdFinalize` records the finding and proceeds to
   archive (`scripts/kaola-workflow-claim.js:3743-3751`) — nothing refuses. The consumer's cost is a
   durable `green: false` / `final_validation_unbound` in `finalization-summary.md` plus an
   unactionable hint, not a dead-ended run. #900 says "gets classified", which is accurate.

---

## The gate's actual requirement

`scripts/kaola-workflow-adaptive-schema.js` (byte-identical across all four editions — md5
`3f221dea0665d0c61c9d482a46b29cf8` for `scripts/`, `plugins/kaola-workflow/scripts/`,
`plugins/kaola-workflow-gitlab/scripts/`, `plugins/kaola-workflow-gitea/scripts/`).

The issue's cited range `L1373-1405` is **exact**: `:1373` is `const fvPath = …`, `:1405` is the
green return carrying `validated_candidate_hash`.

| requirement | where | detail |
|---|---|---|
| file exists, non-blank | `:1373-1380` | else `final_validation_unverified` |
| column-0 `verdict: pass` | `:1381-1385` (parser `:404-416`) | else `final_validation_failed` |
| **column-0 `validated_candidate_hash:` present AND well-formed** | `:1390-1394` (parser `:418-425`) | else `final_validation_unbound` |
| recorded hash **equals** a fresh `computeCodeTreeHash` | `:1395-1402` | else `final_validation_stale`, payload carries `recorded_candidate_hash` + `current_candidate_hash` |

Parser semantics, `:418-425`:

```js
function parseValidatedCandidateHash(text) {
  const src = String(text || '');
  const present = /^validated_candidate_hash:/m.test(src);
  const re = /^validated_candidate_hash:[ \t]*([0-9a-fA-F]{64})[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(src)) !== null) { last = m[1].toLowerCase(); }
  return { present, hash: last };
}
```

- **Column zero, fence-blind by anchor** (`^`, no leading whitespace) — documented at `:393-398`.
- **Exactly 64 hex**, case-insensitive, lowercased on read. Trailing spaces/tabs tolerated.
- **Last-match-wins**; `present` reports any column-0 field line even if malformed, so a mangled hash
  fails closed identically to an absent one (`!bind.present || !bind.hash`, `:1391`).
- Comparison at `:1396-1397` is `currentCandidate !== bind.hash` against
  `computeCodeTreeHash(hashRoot, projTag, extra)`; `extra` defaults to `VALIDATION_TEST_CONSUMES`
  (`:1395`), which is `[]` today.

### `computeCodeTreeHash` — signature and root

`scripts/kaola-workflow-adaptive-schema.js:1088`

```js
function computeCodeTreeHash(root, project, testConsumedExtra, opts)
```

- `root` — a git working tree. The gate does **not** use the caller's `root` directly: `:1309-1310`
  re-resolves `hashRoot` via `git -C root rev-parse --show-toplevel`, so the hash addresses the
  **top level of whichever working tree it was handed**.
- `project` — the project tag, used by `isValidationInvisible` (`:1002-1009`) to drop that project's
  own run-state tree.
- `testConsumedExtra` — band widening; `opts.self_host` overrides the npm probe (`:1093`).
- Algorithm (`:1096-1106`): `snapshotWorktree(root,'validation')` (throwaway index seeded from HEAD,
  then `git add -A` — committed + working landable set, gitignored-and-untracked stays out) →
  `git ls-tree -r <tree>` → drop `isValidationInvisible` lines → sort → sha256 of `lines.join('\n')`.
- Returns `null` on any git failure, so the caller fails closed.

The workaround call in #900 passes only two args. Measured equivalent **today** because
`VALIDATION_TEST_CONSUMES === []` (asserted at `scripts/test-finalize-door.js:870`):

```
VALIDATION_TEST_CONSUMES = []
2-arg (issue workaround): 38cbfebfebdc5173c2a0ec9dd6e309698cbc86c6eec582ff19cdc6109d8c8819
3-arg (gate default)    : 38cbfebfebdc5173c2a0ec9dd6e309698cbc86c6eec582ff19cdc6109d8c8819
EQUAL TODAY             : true
```

It is a latent hazard, not a current defect: the gate substitutes `VALIDATION_TEST_CONSUMES` when
`testConsumedExtra` is not an array, so the day that constant becomes non-empty, a 2-arg workaround
call silently computes a different band than the gate.

### Where the finding lands

- Envelope + durable: `probeFinalizeValidationGate` → `persistValidationToSummary` writes
  `## Validation` with `classification`, `green`, `mode`, detail and — when not green — the operator
  hint (`scripts/kaola-workflow-claim.js:3438-3452`, `:3471-3479`, called at `:3743-3749`).
- `checks.validation` on the finalize-readiness probe: `scripts/kaola-workflow-claim.js:3569-3572`.

---

## Producer inventory

**Definitive answer: NO invocable producer exists. The internal-module `require()` is the only path.**

Search method: `git grep` over all tracked files (covers dot-directories, which ugrep skips);
`find` on `.opencode`/`.kimi` excluding `node_modules`; `computeCodeTreeHash` caller enumeration; a
programmatic scan of every `package.json` script.

| candidate | checked how | result |
|---|---|---|
| `scripts/kaola-workflow-validation-runner.js record` (the script #900 proposes) | file exists, 1142 lines; `usage()` read at `:1061-1067`; `main()` at `:1069-1107` | **Script exists; the `record` subcommand does not.** Only `run` and `qualify-local`. Anything else throws `unknown subcommand`, exit 2. Neither verb writes `final-validation.md` nor prints a `validated_candidate_hash`. |
| `validation-runner`'s own tree digest, as a substitute value | `computeLandableTreeDigest` `:509-546` vs `computeCodeTreeHash`, measured side by side | **Different algorithm, different value.** Runner joins records with a NUL byte and sorts as Buffers; the schema joins with `\n`. Measured on the same tree: runner `dabe6e7b…3dd9`, gate `38cbfebf…8819`, `EQUAL = false`. A consumer who copied the runner's `candidate_digest` gets `final_validation_stale`. |
| `kaola-workflow-run-chains.js` | it is the **only** non-test production caller of `computeCodeTreeHash` (`scripts/kaola-workflow-run-chains.js:1086`); run against the scratch consumer fixture | Writes the hash into `chain-receipt.json`, never into `final-validation.md`, and **refuses in a consumer repo**: `{"result":"refuse","reason":"chains_config_missing",…}`, **real exit code 1** (measured without a pipe). Has no hash-printing flag. |
| `kaola-workflow-claim.js` any subcommand | grep for candidate/hash subcommand | none |
| retired `kaola-workflow-plan-validator.js --candidate-hash` | `ls scripts/`; `git grep -- "--candidate-hash"` | **Script is gone.** Surviving references are all `CHANGELOG.md`, `docs/decisions/D-653-01.md`, and archived run folders. `docs/conventions.md:426` records the removal and the resulting hole. |
| any `package.json` script | programmatic scan of `scripts` keys+values for `hash|candidate|final-valid|validation` | only the two `test:kaola-workflow:claude*` chain aggregates; no producer |
| every other `computeCodeTreeHash` caller | `git grep computeCodeTreeHash -- scripts/ plugins/*/scripts/` | `simulate-workflow-walkthrough.js:122,134`, `test-bundle-finalize.js:126`, `test-finalize-door.js:904,910,914` — **all test fixtures, all reaching it by `require()`**, i.e. the suite itself uses #900's workaround. The comment at `simulate-workflow-walkthrough.js:127-131` states the `--candidate-hash` verb is gone and the function moved to the anchor. |

---

## Surface enumeration

**Search method** (auditable): `git grep -ln` for `validated_candidate_hash`, `final_validation_unbound`
and `final-validation` across all tracked paths — `git grep` reads the index, so it does **not** skip
`.opencode`/`.kimi` the way this box's ugrep-backed `grep` does. Then a per-file `grep -c` loop over
an explicitly named list of every candidate surface, with `.opencode/` and `.kimi/` paths spelled out
literally. Then a 90-file sweep of every agent/role surface (`agents/*.md`, all three plugins'
`agents/*.toml` + `config/agents.toml`, `.opencode/agent/*.md`, `.kimi/skills/*/SKILL.md`). Surfaces
that state the recipe were located by the recipe's own wording, `"You own verification"`, not by a
code token.

### Surfaces that state the consumer final-validation recipe

| # | surface | kind | mentions `validated_candidate_hash`? |
|---|---|---|---|
| 1 | `templates/routing/finalize.skeleton.md:121-124` | **AUTHORING skeleton** | **NO** |
| 2 | `commands/kaola-workflow-finalize.md` | rendered (github) | **NO** |
| 3 | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md:113-116` | rendered (github) | **NO** |
| 4 | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | rendered (gitlab) | **NO** |
| 5 | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | rendered (gitlab) | **NO** |
| 6 | `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | rendered (gitea) | **NO** |
| 7 | `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | rendered (gitea) | **NO** |
| 8 | `.opencode/command/kaola-workflow-finalize.md` | rendered (opencode edition) | **NO** |
| 9 | `.kimi/skills/kaola-workflow-finalize/SKILL.md` | rendered (kimi edition) | **NO** |
| 10 | `README.md:957-960` | user-facing overview | **NO** — says consumers "record their own `verdict: pass`" only |

Surfaces 2-7 are generated from surface 1; `node scripts/generate-routing-surfaces.js --check` →
`all 18 surfaces byte-match the skeleton`, exit 0. Surfaces 8-9 are downstream edition copies
(`sync-opencode-edition.js` / `sync-kimi-edition.js`), outside the 18. **The fix is one skeleton edit
plus regeneration plus two edition syncs — 10 surfaces, 1 authoring point.**

The exact shipped text on all 9 recipe surfaces (skeleton wording; #900's cited SKILL range
`109-117` is exact):

> **Consumer** — no `test:kaola-workflow:*` scripts. Do not invoke the chain runner; it has nothing
> to run. You own verification: run the project's own validation command and record
> `kaola-workflow/{project}/.cache/final-validation.md` with a column-0 `verdict: pass` line and the
> exact command you ran.

### Surfaces checked and found silent on the whole mechanism

| surface group | files | any of the three names? |
|---|---|---|
| `agents/*.md` (14) | root role definitions | **0 hits** |
| `plugins/kaola-workflow{,-gitlab,-gitea}/agents/*.toml` (42) + `config/agents.toml` (×3) | codex profiles — the known-missed propagation surface | **0 hits** |
| `.opencode/agent/*.md` (14) | opencode roles | **0 hits** |
| `.kimi/skills/kaola-role-*/SKILL.md` (14) + `.kimi/skills/workflow-{init,next}/SKILL.md` | kimi roles | **0 hits** |
| `commands/workflow-init.md`, `commands/workflow-next.md`, both `*-init`/`*-next` SKILLs ×3 | non-finalize commands | **0 hits** |
| `templates/routing/{init,next}.skeleton.md`, `slots.js`, `rename-table.js` | other skeletons | **0 hits** |
| `.opencode/plugins/kaola-workflow-hooks.js`, `.kimi/hooks/*` | hook surfaces | **0 hits** |
| `docs/workflow-state-contract.md` | contract doc | mentions `final-validation` (×2), **not** the field |

These are silent on the whole mechanism rather than stating an incomplete recipe — they are not
undercounted surfaces, they simply never had the recipe.

### Surfaces that DO name the field (documentation only, none invocable)

| surface | what it says |
|---|---|
| `docs/api.md:447-452` | the consumer arm requires the column-0 field; names **no producer** |
| `docs/api.md:454-469` | documents `validation-runner` as "the owned local gate for a consumer repo" with `run` / `qualify-local` only; receipts land under `.cache/validation-vectors/` — **never** `final-validation.md` |
| `docs/architecture.md:133-135` | consumer records `verdict: pass` and "a `validated_candidate_hash` bound to the tree" |
| `docs/conventions.md:412-427` | full classification family **and** the explicit admission that no shipped command prints the value |
| `CHANGELOG.md` (#653 entry), `docs/decisions/D-653-01.md` | historical: name the retired `plan-validator --candidate-hash` producer |

**The consumer never reads `docs/`.** The three docs that name the field are self-host repository
documentation; the ten surfaces a consumer actually receives on install name it zero times.

---

## Reproduction

Fixture: a git repo with **no `package.json`** (⇒ consumer arm), one code file, one commit, and
`kaola-workflow/issue-330/.cache/`. Probe script requires the shipped anchor module and calls
`evaluateChainReceipt(root, { cacheDir, project })` — the identical call `claim.js:3444` makes.

| leg | `final-validation.md` content | classification | green |
|---|---|---|---|
| 1 — the shipped recipe **verbatim** | `verdict: pass` + `command: npm run verify` | `final_validation_unbound` | `false` |
| 2 — leg 1 + correct hash | `+ validated_candidate_hash: 38cbfebf…8819` | `chains_green` | `true` |

**Leg 1**, verbatim gate output:

```json
{
  "classification": "final_validation_unbound",
  "green": false,
  "mode": "final-validation",
  "detail": [
    ".cache/final-validation.md carries no well-formed column-0 `validated_candidate_hash:` line — the pass verdict is not bound to a candidate snapshot; record one computed after the last relevant edit"
  ],
  "operator_hint": "final-validation.md lacks a column-0 validated_candidate_hash — recompute the candidate hash and re-record after confirming the tree still matches the validated candidate; if uncertain, re-run the validation command."
}
```

**Leg 2**, verbatim gate output:

```json
{
  "classification": "chains_green",
  "green": true,
  "mode": "final-validation",
  "detail": [ "agent validation recorded and bound to this tree" ],
  "operator_hint": null,
  "validated_candidate_hash": "38cbfebfebdc5173c2a0ec9dd6e309698cbc86c6eec582ff19cdc6109d8c8819"
}
```

Both match #900's report exactly.

### Positive controls (the parser is genuinely armed, not vacuously passing)

| control | mutation | classification |
|---|---|---|
| A | correct hash **indented two spaces** | `final_validation_unbound` — column-zero anchor is real |
| B | hash truncated to **63 hex** | `final_validation_unbound` — malformed fails closed like absent |
| C | well-formed but **wrong** hash (64 zeros) | `final_validation_stale`, payload `recorded_candidate_hash: 0000…`, `current_candidate_hash: 38cbfebf…8819` — the comparison is live, not a presence check |
| D | `validation-runner`'s `computeLandableTreeDigest` on the same tree | `dabe6e7b…3dd9` ≠ gate `38cbfebf…8819` — the only other shipped landable digest is not a substitute |

---

## Root-selection finding

### The live pair (as requested)

| root | `computeCodeTreeHash(root, 'bundle-900-901-902-903')` |
|---|---|
| `/Users/ylpromax5/Workspace/Kaola-Workflow` (main) | `f96f0ac40c23ec105d980029d03f907c59749abbe0e990e35574ee3b6a10970d` |
| `…/.kw/worktrees/bundle-900-901-902-903` | `f96f0ac40c23ec105d980029d03f907c59749abbe0e990e35574ee3b6a10970d` |

**Identical today**, exactly as the dispatch anticipated. Both trees are at `9b68b096`; the branch
carries no commits; main's only untracked path is `kaola-workflow/bundle-900-901-902-903/`, which
`isValidationInvisible` drops (`:1007`, `^kaola-workflow/`); and `.kw/` is gitignored
(`.gitignore:16`), so the nested worktree never enters main's snapshot. This is a coincidence of
timing, not agreement by construction.

### What makes them diverge — measured, not reasoned

Scratch repo with `.kw/` gitignored (mirroring the real repo) and a real `git worktree add`:

| leg | main root hash | worktree hash | identical |
|---|---|---|---|
| 1 — branch has **no** commits | `45f93f4e…f288` | `45f93f4e…f288` | **yes** |
| 2 — branch carries **one code commit**, main un-merged | `45f93f4e…f288` | `bd5edd13…10f1` | **no** |
| 3 — after main merges the branch | `bd5edd13…10f1` | `bd5edd13…10f1` | **yes** |

**The claim holds.** The hashes agree only while the branch has nothing main lacks. From the first
code commit until the merge — i.e. for the entire window in which a finalize happens — they differ.
A recorder that hashed "whichever checkout the operator is standing in" would write main's
pre-merge hash and the gate would then read `final_validation_stale` (or vice versa).

**A correction to my own first measurement:** my initial scratch fixture omitted `.gitignore`, so the
nested worktree entered main's snapshot as a gitlink (`160000 commit da9bf7fb… .kw/worktrees/issue-330`)
and the hashes differed even at leg 1. That divergence was a fixture artifact — `.kw/` is not in
`isValidationInvisible`'s band, it is merely gitignored, so the result is real but only in a repo that
does not gitignore `.kw/`. The table above is the controlled measurement.

### Which root the gate actually picks — and it is **cwd**, not the run folder

`resolveFinalizeCheckRoot` (`scripts/kaola-workflow-adaptive-schema.js:1022-1046`) is driven by
`process.cwd()`, proven against `git worktree list`:

| `process.cwd()` | `planRoot` argument | resolved |
|---|---|---|
| main | main | main |
| **worktree** | main | **worktree** |
| main | worktree | main |

So the binding follows the **shell the finalize was invoked from**, and `evaluateChainReceipt` then
re-resolves that to its git top level (`:1309-1310`). A recorder must take the same road — resolve
the worktree that was actually validated and hash *that* — or producer and gate will disagree in
precisely the pre-merge window where finalize runs. #900's root-selection point is correct and is the
sharpest constraint on any fix.

---

## Existing coverage

**There is no contract test asserting any shipped surface mentions `validated_candidate_hash`.**
Measured: `git grep -n "validated_candidate_hash" -- 'scripts/validate*' 'plugins/*/scripts/validate*'
'scripts/test-*' 'templates/'` returns only two lines in `scripts/test-bundle-finalize.js` (:129 a
fixture write, :394 a comment). No validator needle, in any of the four editions.

What does exist:

| test | what it pins | why it does not catch this |
|---|---|---|
| `scripts/validate-workflow-contracts.js:512-513` (+ the `plugins/kaola-workflow/` copy) | `commands/kaola-workflow-finalize.md` includes `.cache/final-validation.md` **and** `verdict: pass` | It pins exactly the two things the incomplete recipe already states and is silent on the third the gate requires. **Green while the recipe is wrong** — the "a threshold cannot see a rule beneath its bar" corollary in `docs/conventions.md`. |
| `templates/routing/required-blocks.js:207` | the token `final-validation.md` must appear in a block | filename only |
| `scripts/test-finalize-door.js:859-916` (T7) | the module exports `computeCodeTreeHash` / `evaluateChainReceipt`; the band is `[]`; and **producer == gate** for the **self-host** arm (`produceGreenReceipt` via run-chains, `:896-907`) plus a mutation control that a code edit flips the hash (`:913-915`) | Module-level and self-host-only. There is no consumer-arm producer==gate test **because there is no consumer producer to test.** |
| `scripts/simulate-workflow-walkthrough.js:117-135`, `test-bundle-finalize.js:126-129`, and the gitlab/gitea/codex walkthrough + sink suites | consumer fixtures seed a **correct** hash | They seed it by `require()`-ing the anchor module — the suite is a standing user of #900's workaround, which is precisely why the suite is green while the shipped recipe is unusable. |
| `scripts/simulate-workflow-walkthrough.js:295-298` | comment: the #653 negative leg (wrong hash → refuse before archive) was **deleted** when the refusal became a report | the binding check is still classified; only the refusal is gone |

---

## Could not establish

- **End-to-end `cmdFinalize` on a consumer repo.** I reproduced the gate in process — the identical
  call `claim.js:3444` makes — but did not drive a full `finalize` transaction, which needs a claimed
  `workflow-state.md`, a branch and an authority folder. Read (`claim.js:3743-3751`) rather than
  measured: the finding is persisted and the archive proceeds. If the bundle wants that asserted
  rather than read, it needs a fixture build.
- **Whether a real consumer repo has ever hit this.** No telemetry or issue history was searched;
  #900's own report is the only field observation I can point to.
- **What the fix should be.** Out of scope by instruction; not proposed here.
