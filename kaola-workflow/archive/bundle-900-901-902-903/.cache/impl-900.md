# Implementation — issue #900 (consumer candidate-hash recorder)

- **Task**: add the missing producer for the consumer finalize arm — a `record` subcommand on
  `scripts/kaola-workflow-validation-runner.js` that writes `verdict`, the exact validation command,
  and a `validated_candidate_hash` the gate accepts; plus make the `final_validation_unbound`
  operator hint name it — and, per the orchestrator's follow-up, `final_validation_stale`'s too
  (see the FOLLOW-UP section at the end).
- **Verification tier**: `tests-green` + `smoke-integration`. The authored suites
  (`test-finalize-door.js`, `simulate-workflow-walkthrough.js` at full scope, `validate-*`) are green
  before AND after, and the new behaviour — which has no authored test yet, see *Where tests are
  needed* — is proven by an executable end-to-end fixture against the gate's own entry point, with
  two mutation controls on my own implementation.
- **Worked in**: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
  (branch `workflow/bundle-900-901-902-903`). Nothing committed.
- **Node** v24.14.0. Scratch fixtures:
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/impl900/`

---

## 1. The CLI contract (stable; this is what the 13 surfaces must render)

```
node <scripts>/kaola-workflow-validation-runner.js record \
  --project <run-folder> \
  --verdict pass|fail \
  --command "<exact validation command you ran>" \
  [--output <path>]
```

### Flags

| flag | required | value | notes |
|---|---|---|---|
| `--project` | yes | one path segment naming the run folder under `kaola-workflow/` | no `/`, no `\`, no NUL, not `.` / `..`. Violation → exit 2. |
| `--verdict` | yes | exactly `pass` or `fail` | anything else → exit 2. `fail` is legal and records a **bound failure** (the gate then reads `final_validation_failed`). |
| `--command` | yes | the exact command, **one line**, non-empty, NUL-free | leading/trailing whitespace is trimmed; a `\r` or `\n` inside → exit 2. |
| `--output` | no | path | writes the JSON result atomically to that path instead of stdout (inherited from the script's existing `writeCliResult`). |

**Inherited parser limitation, pre-existing and NOT introduced here**: `parseCli`
(`:1192-1207`) rejects any flag value beginning with `--`, in both the `--k v` and `--k=v` forms. So a
validation command whose first token starts with `--` cannot be passed to `record` — exactly as it
already cannot be passed to `run --command`. Workaround: wrap it (`--command "sh -c '--odd thing'"`).
Measured: `--command='--flag-only-command run'` → `--command requires a value`, exit 2.

### Output keys (canonical JSON, sorted keys, one line + `\n`)

Always present:

| key | type | meaning |
|---|---|---|
| `kind` | `"final_validation_record"` | discriminator |
| `schema_version` | `1` | the script's `RECEIPT_SCHEMA_VERSION` |
| `outcome` | `"recorded"` \| `"inconclusive"` | whether a binding was written |
| `project` | string | echoed |
| `verdict` | `"pass"` \| `"fail"` | echoed |
| `validation_command` | string | the trimmed command, exactly as written to the file |
| `candidate_root` | absolute path \| `null` | **the working tree that got hashed** |
| `validated_candidate_hash` | 64 lowercase hex \| `null` | the value written at column 0 |
| `record_path` | absolute path \| `null` | the file written |
| `other_candidate_roots` | array of absolute paths | other working trees of the same repo that ALSO carry this run folder; `[]` when none |
| `operator_hint` | string \| `null` | non-null only when something needs the operator's attention |

Present only when `outcome: "inconclusive"`:

| key | values |
|---|---|
| `reasons` | one of `["candidate_root_unresolved"]`, `["project_folder_missing"]`, `["candidate_hash_unresolved"]` |

### Exit codes

| code | meaning |
|---|---|
| `0` | **the record was written.** Read `verdict` for the validation outcome — a `--verdict fail` record is a successful write, so `0` does not mean the project's tests passed. |
| `1` | `outcome: "inconclusive"` — no binding could be recorded. Read `reasons` and `operator_hint`. |
| `2` | argument/usage error (bad `--project`, `--verdict`, `--command`, duplicate flag, missing flag, unknown subcommand). Message on stderr + usage. |

All measured directly with `echo $?` on the bare command, never through a pipe:
`unsafe_project=2 bad_verdict=2 empty_command=2 multiline_command=2 missing_verdict=2 duplicate_flag=2
missing_folder=1 non_git_cwd=1 recorded_pass=0 recorded_fail=0`.

### What lands in the file

`kaola-workflow/<project>/.cache/final-validation.md`, three lines at **column zero**:

```
verdict: pass
validation_command: make test
validated_candidate_hash: bcb9309ec5008fe45ba87473b429792fce2cb75bfd3ca0bb63c8dec743280f1d
```

`od -c` proof that each field byte follows a `\n` with no leading whitespace is in the run log; the
gate's parser is `^`-anchored, so indentation fails silently and this is load-bearing (mutation
control B below).

`findings_blocking:` is **not** written. The gate parses it but `evaluateChainReceipt` does not read
it, so adding it would be an unforced field.

### Existing-file policy — decided and measured

**Merge, never clobber.** The verb owns exactly the three field lines in `RECORD_FIELDS`
(`:1057`), recognised at column zero *anywhere* in the file, fenced or not. On each run every owned
line is removed wherever it sat and one fresh block is appended at the end; all other bytes survive.

- Repeating the recipe verbatim twice is **byte-idempotent** — measured on a bare record and on a
  record over pre-existing markdown prose (`cmp` exit 0 both times). The file does not grow.
- Agent prose survives: a fixture with `# Final Validation`, a `## Command` fence and a `## Result`
  section kept all of it, and a stale `verdict: fail` + a 64-zero `validated_candidate_hash` that sat
  in it were *replaced*, not left below the new block. That matters: the gate is last-match-wins, so a
  superseded binding surviving *after* the new one would win.
- Ownership includes column-0 field lines inside a code fence, deliberately: the gate reads them
  fence-blind, so such a line is already a live binding, and leaving one behind would leave a second
  answer in the file.

### Copy a consumer-facing surface can use verbatim

> **Consumer** — no `test:kaola-workflow:*` scripts. Do not invoke the chain runner; it has nothing to
> run. You own verification: run the project's own validation command, then record the result **from
> the working tree you validated**:
>
> ```
> node <path-to>/kaola-workflow-validation-runner.js record \
>   --project {project} --verdict pass --command "<the exact command you ran>"
> ```
>
> This writes `kaola-workflow/{project}/.cache/final-validation.md` with a column-0 `verdict:`, the
> command, and a `validated_candidate_hash` bound to this tree, and prints the `candidate_root` it
> hashed. Run it from the same checkout you will run finalize from: the binding follows the working
> tree the shell is in, and a linked worktree and main have different hashes until the branch merges.
> Exit 0 means the record was written — the `verdict` field carries whether your validation passed.

The new `final_validation_unbound` operator hint (byte-identical in all four kernel copies,
`kaola-workflow-adaptive-schema.js:1206`):

> final-validation.md lacks a column-0 validated_candidate_hash — record one with
> `` `kaola-workflow-validation-runner.js record --project <project> --verdict pass --command "<the validation command you ran>"` ``,
> invoked from the working tree you validated (the gate hashes the tree its own shell is in, so a
> record written from another checkout binds the wrong candidate); if the tree may have moved since,
> re-run the validation command first.

---

## 2. Files and functions changed

All line numbers are post-change.

### `scripts/kaola-workflow-validation-runner.js` (+181 lines, 1142 → 1323)

| where | what |
|---|---|
| `:1030-1051` | header comment: why this verb exists and the two things it must not get wrong (the function, the tree) |
| `:1052` | `FINAL_VALIDATION_FILE = 'final-validation.md'` |
| `:1057` | `RECORD_FIELDS = ['verdict','validation_command','validated_candidate_hash']` — the owned lines |
| `:1062-1066` | `isSafeProjectSegment(name)` — same rule as the shared run-folder name check, inlined so this ×4 byte-identical module keeps its single sibling `require` |
| `:1068-1071` | `gitTopLevel(dir)` — reuses the file's existing `runGit` |
| `:1077-1081` | `resolveCandidateRoot(schema)` — **the gate's own road, in the gate's own order** |
| `:1088-1110` | `otherProjectRoots(root, project)` — sibling working trees carrying the same run folder |
| `:1112-1118` | `renderFinalValidationRecord(existingText, fields)` — **pure**, the merge policy above |
| `:1120-1190` | `recordFinalValidation(options)` — argument validation, resolution, hash, atomic write, typed result |
| `:1226` | new `usage()` line |
| `:1269-1281` | `main()` dispatch for `record`, with the exit-code comment |
| `:1316-1319` | new exports: `FINAL_VALIDATION_FILE`, `RECORD_FIELDS`, `renderFinalValidationRecord`, `recordFinalValidation` |

Byte-copied to the three plugin trees (`plugins/kaola-workflow{,-gitlab,-gitea}/scripts/`), the
`validation-runner module copies` byte-identical group. md5 all four: `96bee64e23db29c5c1bfbc7afd7699c1`.

### `scripts/kaola-workflow-adaptive-schema.js` (1 line)

`:1206` — the `final_validation_unbound` hint template, text above. Propagated by
`node scripts/edition-sync.js --materialize-kernel` (3 copies written); md5 all four:
`54e0791e3045edeb381539fb8bb8cef0`.

### The three decisions that were traps

1. **The hash comes from the canonical `computeCodeTreeHash`** in the adaptive-schema anchor
   (`:1163`), never this script's own `computeLandableTreeDigest`. Measured on one tree:
   runner `80ce3d9c…275b` vs gate `bcb9309e…0f1d`. Recording the runner's value buys
   `final_validation_stale` — proven as mutation control A.
2. **The band is read from the constant, not typed.** The call is
   `schema.computeCodeTreeHash(candidateRoot, project, schema.VALIDATION_TEST_CONSUMES)` with no 4th
   arg, so the self-host probe and the band both resolve exactly as the gate's own default does. A
   hardcoded `[]` matches *today* only because `VALIDATION_TEST_CONSUMES` is `[]`; the day it is not,
   a 2-arg call silently addresses a narrower band.
3. **The root follows the gate, not the run folder.** `resolveCandidateRoot` (`:1077-1081`) performs
   the gate's two steps in order: the invoking shell's `git rev-parse --show-toplevel` (what
   `getRoot()` resolves for `cmdFinalize`), then `resolveFinalizeCheckRoot`, then the top-level
   re-resolution `evaluateChainReceipt` does at `adaptive-schema:1310` before hashing.

---

## 3. Proof — the consumer fixture earns a green receipt

Fixture: fresh git repo, **no `package.json`** (⇒ consumer arm), one code file, one commit,
`kaola-workflow/issue-330/.cache/`. Gate probe reproduces `claim.js:3438-3444` exactly — `getRoot()`
→ `resolveFinalizeCheckRoot` → `evaluateChainReceipt(gateRoot, { cacheDir, project })`. No internal
`require()` of the hash function anywhere in the recipe, and no hand-copied value.

| leg | classification | green |
|---|---|---|
| the shipped recipe **verbatim** (`verdict: pass` + `command:` only) | `final_validation_unbound` | `false` |
| **`record`**, nothing else | **`chains_green`** | **`true`** |

```json
{ "classification": "chains_green", "green": true, "mode": "final-validation",
  "detail": ["agent validation recorded and bound to this tree"], "operator_hint": null,
  "validated_candidate_hash": "bcb9309ec5008fe45ba87473b429792fce2cb75bfd3ca0bb63c8dec743280f1d" }
```

That hash is byte-equal to the `validated_candidate_hash` `record` printed. **Acceptance criterion met.**

All four shipped copies of the runner produce the identical binding on the same fixture (exit 0 each),
so no forge tree reaches across trees for its schema sibling.

### Positive controls on the fixture

| control | result |
|---|---|
| edit a code file after recording | `final_validation_stale`, `recorded ≠ current` — the binding is a live content address, not a constant |
| the runner's own `computeLandableTreeDigest` on the same tree | `80ce3d9c…275b` ≠ gate `bcb9309e…0f1d` |
| record twice, `cmp` the file | exit 0 — byte-idempotent |
| record over pre-existing prose, twice | prose intact, no duplicate fields, `cmp` exit 0, gate `chains_green` |
| `--verdict fail` | written and bound; gate reads `final_validation_failed` |

---

## 4. Proof — the linked-worktree case (issue criterion 3)

Fixture: consumer repo, `.kw/` gitignored exactly as the real repo does (without that the nested
worktree enters main's snapshot as a gitlink and the measurement is an artifact), a real
`git worktree add`, and **one un-merged code commit on the branch** so the two trees genuinely diverge.

| leg | result |
|---|---|
| D1 — the two hashes | main `d4451c69…1183`, worktree `2710b69d…d1e0`, **identical: false** |
| D2 — `record` invoked **from the worktree** | binds `2710b69d…d1e0` (the worktree), `candidate_root` = the worktree path, exit 0 |
| D3 — gate **from the worktree** | `chains_green`, `green: true` |
| D4 — the SAME file, gate **from main** (folder mirrored as the finalize transaction does) | `final_validation_stale`, `current_candidate_hash: d4451c69…1183` — i.e. the recorded value is provably the **worktree's**, not main's |
| D5 — record from the worktree with the folder now in **both** trees | still binds the worktree; reports `other_candidate_roots: ["<main>"]` + an operator hint |
| D6 — record **from main** while the folder lives only in the worktree | `outcome: inconclusive`, `reasons: ["project_folder_missing"]`, exit 1 — **it refuses to bind the wrong checkout** rather than silently hashing main |
| D7 — after main merges the branch | the worktree's record reads `chains_green` from **both** trees |

D6 is the ambiguity criterion in its sharpest form: standing in the wrong checkout produces a typed
report naming the path it looked for and telling the operator to record from the worktree, not a
plausible-looking hash bound to the wrong tree.

---

## 5. Mutation controls on my own implementation

Run in a scratch mirror (`git archive HEAD` + only my 8 files), so the real worktree was never
mutated and no sibling agent's work was at risk. If either mutation still read green, the acceptance
proof above would be vacuous.

| leg | gate says |
|---|---|
| pristine mirror | `chains_green` |
| **A** — swap the shared `computeCodeTreeHash` for the runner's own `computeLandableTreeDigest` | `final_validation_stale` |
| **B** — indent the three recorded field lines by two spaces | `final_validation_failed` |
| mirror restored | `chains_green` |

B lands on `final_validation_failed` rather than `unbound` because indenting breaks `verdict:` too and
the verdict rung is checked first. Both mutations flip the acceptance to a refusal, so both the
shared-function requirement and column zero are load-bearing.

---

## 6. Suites — real exit codes

| command | before | after |
|---|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, 1/1 shard) | **exit 0** — 184/184 scenarios, 1958 spawns | **exit 0** — 184/184 scenarios, 1958 spawns |
| `node scripts/test-finalize-door.js` | **exit 0** — 156 assertions | **exit 0** — 156 assertions (T7 included) |
| `node scripts/validate-workflow-contracts.js` | not run before | **exit 0** (`:889-901` `require()`s the runner and checks its manifest entry) |
| `node scripts/test-validation-runner.js` | not run before | **exit 0** |
| `node scripts/test-validate-script-sync.js` | not run before | **exit 0** |
| `node scripts/test-install-manifest-single-source.js` | not run before | **exit 0** |
| `node scripts/test-spawn-classification.js` | not run before | **exit 0** |
| `node scripts/validate-script-sync.js` | **exit 0** | **exit 1 — sibling agents' files, not mine** (below) |
| `node scripts/validate-kaola-workflow-contracts.js` | not run before | **exit 1 — sibling agents' files, not mine** (below) |

Every exit code read with `echo $?` directly on the command, never through a pipe.

### The two reds are concurrent sibling work, and I proved my own families clean three ways

At the time of the runs the worktree also carried uncommitted `scripts/kaola-workflow-claim.js`,
`scripts/kaola-workflow-sink-merge.js` and `scripts/kaola-workflow-closure-audit.js` from sibling
agents, none of them mirrored into `plugins/kaola-workflow/scripts/` yet. Both validators compare
those `COMMON_SCRIPTS` copies.

1. `validate-script-sync.js` **accumulates every drift** before reporting (`:527-614`), and the only
   entry it printed was `kaola-workflow-sink-merge.js` — so my byte groups, the rename families, the
   export supersets and the committed-kernel check all passed inside that very run.
2. Scoped re-check in the real worktree via the module's own exported helpers:
   `validation-runner module copies → drift: [] missing: []`,
   `adaptive-schema kernel copies (cross-edition drift anchor) → drift: [] missing: []`,
   `checkCommittedKernelParity → {"drift":[],"skipped":null}`.
3. Scratch mirror of `HEAD` + **only my 8 files**: `validate-script-sync.js` **exit 0**
   (`OK: 15 common scripts, 27 byte-identical groups, …`) and `validate-kaola-workflow-contracts.js`
   **exit 0** (`Kaola-Workflow Codex contract validation passed`). The latter's runner-distribution
   assertions live at `:655-662`, past the `:147` claim.js assert that threw in the real worktree.

I did **not** touch either sibling file to make the checks pass — that is their agents' mirroring step.

---

## 7. What I deliberately did not change

- **No refusal added anywhere.** The classification still does not block finalize
  (`claim.js:3743-3751` records and proceeds), and `record`'s non-zero exits report "no binding could
  be written", never a verdict on the work.
- ~~**`final_validation_stale`'s hint (`adaptive-schema:1207`) still names no command.**~~
  **SUPERSEDED — done in the follow-up below, on the orchestrator's instruction.**
- **No repo-kind field on the output.** Measured: in a *self-host* fixture (`package.json` declaring
  `test:kaola-workflow:claude`) `record` succeeds, exit 0, but the gate takes the chain-receipt arm
  (`mode: "chain-receipt"`, `chains_unverified`) and never reads the file. So a self-host operator who
  runs `record` gets a file nothing consumes. I left it silent because the routing already prevents it
  (the recipe lives in the finalize surfaces' *Consumer* paragraph, conditioned on the absence of
  those very scripts) and the gate tells the operator the truth at the door. Flagging it as a watch
  item rather than building a field no observed failure demanded.
- **`other_candidate_roots` does not distinguish "probe failed" from "none found"** (both `[]`). The
  `git worktree list` probe can only fail when git is already broken, in which case
  `computeCodeTreeHash` returns null and the run ends at `candidate_hash_unresolved` first — the
  branch is effectively unreachable. No `*_probe` field added.
- **`parseCli`'s `--`-prefixed-value limitation left alone** — fixing it would change the existing
  `run --command`'s parsing. Documented above instead.
- Untouched, as instructed: `templates/routing/**`, every rendered command/skill surface, `README.md`,
  `CHANGELOG.md`, `docs/**`, `validate-workflow-contracts.js`, `kaola-workflow-sink-merge.js`,
  `kaola-workflow-claim.js`, `kaola-workflow-closure-audit.js`, and **every test file**.

## 8. Where tests are needed (for `tdd-guide` — I authored none)

There is currently **no test at all** for this verb, and per the premise study no consumer-arm
producer==gate test existed because there was no producer. The gaps, in the order I would rank them:

1. **The end-to-end consumer leg**: consumer fixture (no `package.json`) → shell out to
   `record` → `evaluateChainReceipt` returns `chains_green` / `green: true`. This is the acceptance
   criterion and the only test that proves the recipe works without an internal `require()`. Natural
   home: a new scenario in `simulate-workflow-walkthrough.js`, or `test-finalize-door.js` beside T7 as
   the consumer twin of its self-host producer==gate leg.
2. **Producer==gate for the consumer arm**, mirroring T7 (`test-finalize-door.js:896-915`): the
   recorded hash must equal `computeCodeTreeHash(root, project, VALIDATION_TEST_CONSUMES)`, and a code
   edit must flip it. Include the **negative control that matters**: recording
   `computeLandableTreeDigest`'s value instead must produce `final_validation_stale` — a green test
   that only asserts equality cannot tell the right function from a lucky one.
3. **The linked-worktree binding**: main and worktree with divergent hashes, `record` from the
   worktree, assert the recorded hash equals the *worktree's* and that the gate standing in main reads
   `final_validation_stale`. Asserting only "green from the worktree" passes on a recorder that hashes
   main. `simulate-workflow-walkthrough.js:10933` already builds a worktree fixture of this shape.
4. **`renderFinalValidationRecord` as a pure unit** (exported at `:1318`): idempotence over two calls,
   prose preservation, and — the load-bearing one — that a pre-existing `validated_candidate_hash`
   line *after* the insertion point does not survive to win last-match-wins.
5. **Column zero is load-bearing**: assert the written lines start at column 0. Mutation-prove it by
   indenting; an assertion that only greps the field name passes on an indented file.
6. **Typed non-binding reports**: `project_folder_missing` (exit 1) when standing in the wrong
   checkout, `candidate_root_unresolved` (exit 1) outside a git tree, and exit **2** for each argument
   violation. The exit-code split (0 = written even for `--verdict fail`) is contract, so pin it.
7. **A contract-test needle** that a shipped consumer surface names the recorder. The existing pin
   (`validate-workflow-contracts.js:512-513`) asserts only `final-validation.md` + `verdict: pass` —
   green while the recipe was unusable, the "a threshold cannot see a rule beneath its bar" corollary.
   That extension was assigned to the contract-and-operator agent, not to me.

**Do not** build a fixture by reusing the suite's existing seeders for these: the premise work and my
own controls both depended on a *positive control*, and a fixture that inherits
`KAOLA_WORKFLOW_OFFLINE` or an already-correct seeded hash will read green against a broken recorder.

## 9. Unverified / explicitly not measured

- **A full `cmdFinalize` transaction** over a consumer repo. I reproduced the gate's exact in-process
  call (`claim.js:3444`), not the whole finalize (which needs a claimed `workflow-state.md`, a branch
  and an authority folder). That `probeFinalizeValidationGate` is reached and persisted is read from
  `claim.js:3743-3749`, not run.
- **`npm test` / the four chains.** Not run — my diff touches the cross-edition kernel, so a
  four-chain receipt is owed at finalize; that is the orchestrator's call, not something I can bind.
- **Windows.** `record` inherits the file's existing `runGit`/`spawnSync` posture; no Windows box here.
- **A `final-validation.md` that exists as a directory or symlink.** `writeFileAtomicReplace`'s
  `renameSync` would throw and the process would exit 2 with the errno message. Not typed, not
  measured — no observed failure demanded it.

---

# FOLLOW-UP — `final_validation_stale` hint now names the recorder

Instructed by the orchestrator after the report above flagged it. Rationale accepted as stated:
`stale` is exactly the classification a consumer lands on when they *did* record but bound the wrong
checkout — the most likely way to get this wrong given the measured pre-merge divergence — so leaving
it naming no producer stranded the very operator criterion 6 was written for. Inside #900's stated
goal, not scope creep.

- **Verification tier**: `regression-green`. A hint-text change alters no behaviour; the two suites
  that exercise the gate are green before AND after, and both hints were rendered through the real
  code path rather than read out of the source.
- **No test pins the old text.** Searched for all three of its distinctive phrases across every
  tracked path: the only non-kernel hit is `kaola-workflow/archive/issue-653/.cache/n1-design.md:66`,
  an archived design note (historical run state, not a test). Reported rather than edited — I do not
  hold test custody.

## The change

One line, `scripts/kaola-workflow-adaptive-schema.js:1207`, propagated by
`node scripts/edition-sync.js --materialize-kernel` (3 copies written).

**Before**

> A relevant source/test/test-consumed file changed after validation — re-run the recorded validation
> command and re-record final-validation.md (including a fresh hash); never hand-patch the hash.

**After** (rendered through `validationHint` on a live fixture, not extracted from source)

> A relevant source/test/test-consumed file changed after validation — or the record was written from a
> different checkout than this one. Re-run the validation command, then re-record with
> `` `kaola-workflow-validation-runner.js record --project <project> --verdict pass --command "<the validation command you ran>"` ``,
> invoked from the working tree you validated (the gate hashes the tree its own shell is in, and a
> linked worktree and main differ until the branch merges); never hand-patch the hash.

Register matched to the `unbound` hint deliberately: same command spelling, the same
"invoked from the working tree you validated (the gate hashes the tree its own shell is in…)"
parenthetical, and each keeps its own closing clause — `unbound` ends on "re-run the validation
command first", `stale` keeps its original "never hand-patch the hash". Nothing structural changed:
no new key, no `ctx` parameter, no classification, no refusal.

## Cross-edition parity — md5 of all four kernel copies

```
57e83365115aa84fc3bf82ffad2cff8a  scripts/kaola-workflow-adaptive-schema.js
57e83365115aa84fc3bf82ffad2cff8a  plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
57e83365115aa84fc3bf82ffad2cff8a  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
57e83365115aa84fc3bf82ffad2cff8a  plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
```

Independently confirmed by sha256 (all four `e525165fbdb3…`) and by the sync module's own helpers:
`adaptive-schema kernel copies (cross-edition drift anchor) → drift: [] missing: []`,
`validation-runner module copies → drift: [] missing: []`,
`checkCommittedKernelParity → {"drift":[],"skipped":null}`.

## Rendered proof — both hints, and the loop actually closes

Driven on a live consumer fixture through `evaluateChainReceipt` (the gate's own hint path):

| leg | classification | hint names the recorder |
|---|---|---|
| verdict recorded, no hash | `final_validation_unbound` | yes |
| bound, then a code file changes | `final_validation_stale` | **yes (new)** |
| re-record over the changed tree | `chains_green`, `green: true` | n/a |

The third row is the point of the change: the hint's own instruction, followed literally, takes the
operator from `stale` back to green.

## Suites — real exit codes, bare `echo $?`, no pipe

| command | before (pre-#900 baseline) | after the hint change |
|---|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**, 1/1 shard) | exit 0 — 184/184, 1958 spawns | **exit 0 — 184/184, 1958 spawns** |
| `node scripts/test-finalize-door.js` | exit 0 — 156 assertions | **exit 0 — 156 assertions** |
| `node scripts/validate-workflow-contracts.js` | — | **exit 0** |

A first walkthrough invocation was started without an explicit `cd` and I could not prove which
working tree it had entered, so I killed it (exit 144) rather than report a possibly-main-root run as
evidence, and re-ran it. `lsof -p <pid> -a -d cwd` on the replacement confirmed
`…/.kw/worktrees/bundle-900-901-902-903` before it finished, and `pwd` confirmed the worktree for the
door suite. Only one walkthrough ran at a time — the suite is spawn-bound and concurrent runs give
false reds.

## Sibling reds, again not mine

`validate-script-sync.js` exits 1 in the worktree, now on
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` omitting nine canonical
exports — the closure-audit agent's forge port, in progress. Earlier in the run the same check reded on
`kaola-workflow-sink-merge.js`. Neither is mine, and I touched neither. Proven the same three ways as
before, including a fresh scratch mirror of `HEAD` + only my 8 files:
`validate-script-sync.js` **exit 0**, `validate-kaola-workflow-contracts.js` **exit 0**,
`validate-workflow-contracts.js` **exit 0**.

## Files touched by the follow-up

`scripts/kaola-workflow-adaptive-schema.js` `:1207` plus its three materialized plugin copies. Nothing
else — no test file, no `templates/routing/**`, no rendered surface, no `docs/`, and none of the three
files siblings are editing. Still uncommitted.

## One consequence for the doc/prose agent

Both consumer-arm remediation hints now spell the same command, so the recorder's name appears in the
kernel twice. If the command's spelling ever changes, `adaptive-schema.js:1206` **and** `:1207` must
change together, in all four copies. There is no guard on that — worth one line in the notes for
whoever owns the surfaces.

---

# FOLLOW-UP 2 — `project_folder_missing` now names the ARCHIVED case

Driven by a second, independent reproduction (Kimi edition, consumer run vrpai-cli #1042): the operator
stamped the binding **after** the finalize transaction had already archived the run, and so edited the
archived record post-hoc. The recorder already prevents that by construction — the recipe places
`record` in the pre-finalize validation step — but the message an operator hits when they arrive late
named only the linked-worktree case. It now names the archived one too.

- **Verification tier**: `smoke-integration`. A message + a read-only detection; proven by a six-leg
  fixture with two negative controls, and every suite that touches the runner or the finalize door is
  green (four of them now carrying another agent's fresh pins).
- **No new write path.** Nothing in this change can write inside `kaola-workflow/archive/**`. Measured:
  the archived record is byte-unchanged after two `record` invocations, and no live folder is created.

## What changed, in `scripts/kaola-workflow-validation-runner.js`

| where | what |
|---|---|
| `:1109-1141` | new `archivedProjectPaths(root, project, schema)` — **read-only**. Mirrors the finalize authority resolver's own search: `kaola-workflow/archive/<project>` **or** a `<project>.archived-*` sibling, looked for in this working tree **and** in main via the already-exported `schema.resolveMainRoot` (the transaction lands the archive in main first, so a caller in the linked worktree may only find it there). |
| `:1189-1200` | the `project_folder_missing` branch now picks one of two messages on that detection, and carries the measured paths |

`archivedProjectPaths` adds no dependency: `resolveMainRoot` is already exported from the kernel the
runner requires, and is the same resolver `claim.js` imports.

### The new message (verbatim, rendered from a live fixture)

> No live run folder at `<root>/kaola-workflow/<project>` — this run is already archived at
> `<archive path(s)>`. The binding belongs in the record BEFORE finalize, as part of the validation step
> that produces the verdict; once the transaction has archived the run its record is closed evidence and
> must not be edited retroactively. The finding on the archived run stands as recorded — a bound
> validation for this work is a fresh run, not an amendment to this one.

All three of the requested points are in it: the archived case is named specifically (with the path),
the record belongs **before** finalize, and an archived record must not be edited retroactively. The
closing clause deliberately names **no procedure**: there is no `reopen` or `unarchive` verb anywhere in
`claim.js` (searched), so telling the operator to re-open the run would have invented a capability.

The pre-existing wrong-checkout message is **unchanged** and still fires when no archive is found.

### Output-shape change — additive, and honest about what was measured

New key `archived_project_paths` (array of absolute paths), present **only** on a
`project_folder_missing` result — the one place it is actually probed. It is deliberately *absent* from
the success path and from the other two `inconclusive` reasons rather than defaulting to `[]`, because a
`[]` we never looked for would read as "no archive exists".

`reasons` is **still exactly the three published tokens** — `project_folder_missing` covers both the
wrong-checkout and the archived case. I chose not to mint a fourth token: 13 consumer surfaces are being
written against the contract I published, and mutating an enum mid-flight is far more expensive than
adding an optional key. **If you would rather have a distinct token** (e.g. `project_archived`) so a
script can branch without string-matching the hint, say so — that is a contract call, and it is yours,
not mine. The detection is already separated in the code, so it is a one-line change either way.

## Proof — six legs, including two negative controls

| leg | setup | result |
|---|---|---|
| A1 | exact `kaola-workflow/archive/<project>/` | archived message + the path; exit **1**; **archived record byte-unchanged**; no live folder created |
| A2 | suffixed `<project>.archived-20260801T101500Z/` | archived message + the suffixed path |
| A3 | archive in **main**, caller standing in the **linked worktree** | archived message + main's path — the `resolveMainRoot` reach works |
| **A4** | **no archive anywhere** | the original wrong-checkout message, `archived_project_paths: []` |
| **A5** | a **different** project (`issue-999`) archived | the original wrong-checkout message, `archived_project_paths: []` — the detection is project-specific, not a blanket rewrite |
| A6 | a **live** folder alongside an archive | `outcome: recorded`, exit 0, `record_path` is the **live** folder, `archived_project_paths` key absent, **nothing written into the archive** |

A4 and A5 are the controls that matter: without them, a detection that always fired would produce the
archived message on every wrong-checkout run and read as "passing".

## Cross-edition parity — md5 of all four `validation-runner.js` copies

```
8a781aeda1ad244125f8073964b1ca82  scripts/kaola-workflow-validation-runner.js
8a781aeda1ad244125f8073964b1ca82  plugins/kaola-workflow/scripts/kaola-workflow-validation-runner.js
8a781aeda1ad244125f8073964b1ca82  plugins/kaola-workflow-gitlab/scripts/kaola-workflow-validation-runner.js
8a781aeda1ad244125f8073964b1ca82  plugins/kaola-workflow-gitea/scripts/kaola-workflow-validation-runner.js
```

The kernel copies are untouched by this follow-up and remain `57e83365115aa84fc3bf82ffad2cff8a` ×4.

**Correction to the instruction I was given**: `edition-sync.js --materialize-kernel` does **not**
propagate the validation runner. `MATERIALIZED_SHARED` (`edition-sync.js:84-86`) contains
`kaola-workflow-adaptive-schema.js` and nothing else; the runner travels in
`validate-script-sync.js`'s `BYTE_IDENTICAL_GROUPS`, which `edition-sync.js --write` step (c) copies.
Measured: running `--materialize-kernel` after my copy reported *"0 file(s) already present"* — it never
looked at the runner. I propagated by `cp`, as in the original change, **deliberately not `--write`**:
`--write` also syncs `COMMON_SCRIPTS` and every other byte group, which would have pulled three sibling
agents' in-flight files into the plugin trees. Confirmed clean by the sync module's own helpers:
`validation-runner module copies → drift: [] missing: []`.

## Suites — real exit codes, bare `echo $?`, no pipe

| command | result |
|---|---|
| `node scripts/test-validation-runner.js` | **exit 0** — `test-validation-runner: PASSED` |
| `node scripts/test-finalize-door.js` | **exit 0** — 208 assertions (was 156; the other agent's **T8** "the consumer arm's `record` producer and the finalize gate agree on one candidate hash" and **T8l** "`record` binds the working tree it was invoked from, provably not the other one" are green against this implementation) |
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**) | **exit 0** — 197/197 scenarios, 2052 spawns (was 184/184 — the growth is the other agent's new scenarios) |
| `node scripts/test-claim-hardening.js` | **exit 0** — 514 assertions |
| `node scripts/test-bundle-finalize.js` | **exit 0** — 149 tests |
| `node scripts/validate-script-sync.js` | **exit 0** — and `committed kernel parity: 4 Oracle Kernel copies identical at HEAD` (the sibling reds from earlier in the run are gone; their agents finished mirroring) |

`lsof -p <pid> -a -d cwd` confirmed the walkthrough ran in
`…/.kw/worktrees/bundle-900-901-902-903` before it finished, and only one walkthrough ran at a time.

**None of the four suites the other agent is authoring in reded.** I edited no test file.

Fresh scratch mirror of `HEAD` + only my 8 files, as the attribution control:
`validate-script-sync.js` **0**, `validate-kaola-workflow-contracts.js` **0**,
`test-validation-runner.js` **0**.

## Files touched by this follow-up

`scripts/kaola-workflow-validation-runner.js` plus its three byte copies. Nothing else — no test file,
no kernel copy, no `templates/routing/**`, no rendered surface, no `docs/`, and none of the files the
sink/claim/closure-audit or doc agents are editing. Still uncommitted.

## Added to *where tests are needed* (for the test author)

8. **The archived branch of `project_folder_missing`**, with A4/A5 as the controls — a test that only
   asserts the archived message appears when an archive exists will pass on a detection that always
   fires. Pin all three: archived-exact, archived-suffixed, and archive-in-main-while-in-the-worktree.
9. **That `record` never writes inside `kaola-workflow/archive/**`** — assert the archived record is
   byte-unchanged across two invocations, and that no live folder is created. This is the observed
   failure (post-hoc editing of archived evidence) turned into a pin.
10. **That a live folder wins over an archive** (A6), so a legitimately re-claimed run still records.
