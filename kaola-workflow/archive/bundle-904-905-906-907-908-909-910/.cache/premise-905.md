# Investigation: #905 — "red receipts carry only output hashes, so a failed run has no diagnosable content"

## VERDICT

**THE PREMISE HOLDS, in full, and is not already solved by any flag.**

Measured, not inferred:

1. The receipt for a failing command carries **zero bytes** of the child's output. Only
   `stdout_sha256`, `stderr_sha256`, `failure_signature_sha256`.
2. The runner prints **nothing** of the child's output. With `--output`, its own terminal stdout and
   stderr are **0 bytes each**. Without `--output`, stdout is the receipt JSON and still contains no
   child output.
3. **No raw log is retained anywhere.** A full-disk search for the child's marker text after the run
   found it only in the fixture's own source file. The sandbox tmp/home dirs hold nothing.
4. **No flag changes this.** The `run` verb has exactly six options (`--command`,
   `--timeout-minutes`, `--repo-root`, `--cwd`, `--repetitions`, `--env-allowlist`, `--output`);
   `--output` redirects the *receipt*, not the child output. No env var affects retention. This is a
   code problem, not a documentation problem.
5. **The diagnostic text was in hand at hash time and was deliberately dropped.**
   `normalizeFailureSignature` returns `{ normalized, digest }`; the caller binds both and uses only
   `.digest`. I reproduced the exact `failure_signature_sha256` from the receipt by re-normalizing the
   child's output out-of-band — proof the human-readable preimage was a live local at the moment the
   hash was taken.

**One correction to the issue's own text.** #905 says *"the same truncation cap could bound the
retained text."* There is **no truncation cap**. `MAX_OUTPUT_BYTES` (16 MiB) is `spawnSync`'s
`maxBuffer`, and exceeding it **SIGTERMs the child** and forces `outcome: "inconclusive"` (measured
below). A cap that bounds retained text would be **new** code, not a reuse.

---

## Setup

- Commit: `2018521f`, branch `main`, clean tree. No tracked file was modified.
- Platform: darwin 25.6.0, Node = the repo's `node` on PATH.
- Fixtures (scratchpad only):
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/8070a702-f33f-4c74-8c66-4434a7ea9c6d/scratchpad/fix905`
  — a git repo with `package.json` (`"test": "node ./failing-test.js"`) and `failing-test.js`, which
  writes a distinctive marker to **both** stdout and stderr and exits 1.
  A second fixture `.../scratchpad/bigout` emits ~20 MB of stdout to probe the buffer cap.

---

## The real receipt (ground truth)

Command, verbatim, run from inside the fixture:

```
node /Users/ylpromax5/Workspace/Kaola-Workflow/scripts/kaola-workflow-validation-runner.js run \
  --command 'node ./failing-test.js' \
  --timeout-minutes 1 \
  --repo-root "$SP/fix905" \
  --output "$SP/receipt-905.json"
```

Exit code **1**. Runner terminal stdout: **0 bytes**. Runner terminal stderr: **0 bytes**.

Complete receipt as written (2964 bytes, canonical single line — reflowed here for reading; the
`runs[0]` block is byte-exact):

```json
{"audit":{"runs":[{"duration_ms":19,"ended_at":"2026-08-01T16:59:12.466Z","index":1,"started_at":"2026-08-01T16:59:12.447Z"}]},
"candidate_digest":"ce35a6adf614eefcbbb62d83ab6ad1699e4f7f909e89cbcb23f2ae65f98a4491",
"command_id":"bc38f8fd73c4b29656a3a347c8e65bd9f081f381a6032fa75c9a1a2d7ab01e5c",
"command_identity":{"effective_environment":[{"key":"HOME","value_sha256":"04d8f7906bb639ed417b062fb4037b9e5680bc4b734bccd7fed02c20a4c5131b"},{"key":"LANG","value_sha256":"6b23c0d5f35d1b11f9b683f0b0a617355deb11277d91ae091d399c655b87940d"},{"key":"LC_ALL","value_sha256":"6b23c0d5f35d1b11f9b683f0b0a617355deb11277d91ae091d399c655b87940d"},{"key":"PATH","value_sha256":"4911f8053a2f768cdc96a7ccbcbca2815c5c1c0508820256cb0bb137bf9740f3"},{"key":"TMPDIR","value_sha256":"4eb0417d67c6d9bc4ecf539daafce3857bd1057c79b4a9f0f28ce0bb58aa2453"},{"key":"TZ","value_sha256":"7e5f76c94a635c217e282f79db4fc7ee4bfd9b64044166714067602cc4be620c"}],
"executables":[{"command_head":"node","mode":33261,"realpath_sha256":"62802ba765911ed0f3b8ae68fdbf5826014cff2cd91e22c45e9211311202624f","version_output_sha256":"43da4b4f52ba2814d8d940ae333d8209221decf00d8fbfd447c67f9835dda62e"}],
"execution_shell":{"command_head":"execution-shell","mode":33261,"realpath_sha256":"77bafa9e3a8a092afc4f1dd84e6e1cc58b68f42eb934bf0f6b73deb2518f78a3","version_output_sha256":"90adf1dede8ecd06109511949b80aa556df159b971b266b280a7759d7e709e0e"},
"policy":{"command":"node ./failing-test.js","cwd":".","env_allowlist":[],"pass_rule":"all","repetitions":1,"timeout_minutes":1},
"runner_node":{"command_head":"node","mode":33261,"realpath_sha256":"62802ba765911ed0f3b8ae68fdbf5826014cff2cd91e22c45e9211311202624f","version_output_sha256":"43da4b4f52ba2814d8d940ae333d8209221decf00d8fbfd447c67f9835dda62e"},
"toolchains":[{"content_sha256":"4835c2e1340d7200126e050985e4ab10a33f233b6010bc94f2078966de73ddfa","mode":33188,"path":"package.json"}]},
"execution_identity":{"comparable":true,"digest":"2f78ddc8a7bd617916828e30fd62247a91d7ec2e5f4fad093c8b5e683e0b9401","incomparability_classes":[]},
"execution_identity_incomparability_classes":[],
"kind":"validation_vector",
"outcome":"fail",
"receipt_sha256":"7e81d6860016413abe0220b4107fff923123e8a0de6b67185d8f38e536e9c4e1",
"reduction_reasons":[],
"runs":[{"execution_error_sha256":null,"execution_identity_digest":"2f78ddc8a7bd617916828e30fd62247a91d7ec2e5f4fad093c8b5e683e0b9401","exit_code":1,"failure_signature_sha256":"0e7860bbdffad65d5812d62159b5cc416de8b71eeab5bcdb83c44110ef926183","index":1,"post_candidate_digest":"ce35a6adf614eefcbbb62d83ab6ad1699e4f7f909e89cbcb23f2ae65f98a4491","pre_candidate_digest":"ce35a6adf614eefcbbb62d83ab6ad1699e4f7f909e89cbcb23f2ae65f98a4491","signal":null,"stderr_sha256":"244db78fb8134d2df190aa325053d68fcfbced5a0d0d6655e1523d1cf4561abe","stdout_sha256":"28e2c8d4b5145818d24bf1236630f83dc66105007b53a3862f87806608d3db70","timed_out":false}],
"schema_version":1,
"vector_id":"02fa06d4c8f90a9dc657633c9ac76145727602c637365713bf148291f6e25514"}
```

That receipt says **`outcome: "fail"`, `reduction_reasons: []`** — a clean, unambiguous red — and a
reader has no way at all to learn *what failed*. The issue's field list was accurate.

### The information that was thrown away

Re-derived out-of-band with the module's own exported `normalizeFailureSignature`:

```
normalized TEXT (165 bytes):
{"stderr":"DISTINCTIVE_STDERR_MARKER: Error: boom at line 42\n","stdout":"DISTINCTIVE_STDOUT_MARKER: assertion 7 of 9 failed\n  expected: alpha\n  actual:   beta\n"}
digest:        0e7860bbdffad65d5812d62159b5cc416de8b71eeab5bcdb83c44110ef926183
stdout_sha256: 28e2c8d4b5145818d24bf1236630f83dc66105007b53a3862f87806608d3db70
stderr_sha256: 244db78fb8134d2df190aa325053d68fcfbced5a0d0d6655e1523d1cf4561abe
```

All three digests are **identical** to the receipt's. The complete diagnosis — assertion 7 of 9,
expected alpha, actual beta, `Error: boom at line 42` — fitted in **165 bytes** and was in memory when
the 64-byte hash was taken.

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | Receipt content for a failing command | `run --command 'node ./failing-test.js' --timeout-minutes 1 --output ...` | receipt above; no child output in any field | 1 |
| 2 | Runner terminal output with `--output` | same, stdout/stderr captured to files | stdout **0 bytes**, stderr **0 bytes** | 1 |
| 3 | Runner terminal output without `--output` (`npm test`) | `run --command 'npm test' --timeout-minutes 1` | stdout 2950 bytes = the receipt only; `grep -c DISTINCTIVE` on both streams = **0** and **0** | 1 |
| 4 | Any retained raw log | `grep -rl DISTINCTIVE_STDOUT_MARKER` over `$TMPDIR/kaola-workflow-validation` and the whole scratchpad | only hit is the fixture's own `failing-test.js` | 0 |
| 5 | Digest preimage recoverable from the module | `normalizeFailureSignature(stdout, stderr, …)` re-run out-of-band | all three digests match the receipt exactly | 0 |
| 6 | `vector_id` determinism across two identical runs | `run …` twice to `det-1.json` / `det-2.json` | `vector_id` **equal** (`02fa06d4…`); `receipt_sha256` **differs** (audit timestamps) | 1,1 |
| 7 | Sensitivity to an added field (pure `buildValidationVector` calls) | field added inside `runs[]` vs inside `audit` | semantic add **changes** `vector_id`; audit add **does not**, but changes `receipt_sha256`; self-hash still verifies in both | 0 |
| 8 | Behaviour above `MAX_OUTPUT_BYTES` (~20 MB child) | `run --command 'node ./big.js' --timeout-minutes 2` | `outcome: "inconclusive"`, `reduction_reasons: ["missing_exit_code","signal"]`, `signal: "SIGTERM"`, `exit_code: null` | 1 |
| 9 | Bytes actually retained at the cap | direct `spawnSync(…, {maxBuffer: 16*1024*1024})` replication | stdout **16 779 000** bytes retained; stderr 0; `status: null`, `signal: SIGTERM`, `error.code: ENOBUFS` | 0 |
| 10 | Four-copy byte identity | `shasum -a 256` over all four runner paths | all four `992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7` | 0 |
| 11 | Real green-suite output size (scale anchor) | `simulate-workflow-walkthrough.js --shard 1/12` | 927 bytes stdout for 17 scenarios | 0 |
| 12 | `.cache` tracking | `git ls-files \| grep -c '\.cache/'` | **6593 tracked files** under `kaola-workflow/**/.cache/` | 0 |

### Reproduction

**Reproduces.** Rows 1–4 are the issue verbatim: a red receipt with a clean `reduction_reasons: []`
and no recoverable content, plus a silent runner. Row 5 is the aggravating fact the issue only
implies — the text existed and was discarded, not "was never available."

---

## Code trace: where the output goes

`scripts/kaola-workflow-validation-runner.js` (all four copies identical, so line numbers hold
everywhere):

- **Captured into memory, not streamed, not /dev/null.** `defaultExecute` at **:704–724** runs
  `spawnSync(shell, ['-c', command], { encoding: 'buffer', maxBuffer: MAX_OUTPUT_BYTES, … })` and
  returns `stdout` / `stderr` as Buffers (**:720–721**). `spawnSync` with `encoding: 'buffer'` and no
  `stdio` option pipes both streams into the parent's memory; nothing is echoed to the terminal.
- **The failure-signature text is a live local at hash time.** At **:807–809**:

  ```js
  const failure = normalizeFailureSignature(stdout, stderr, {
    absolute_paths: [repoRoot, cwdAbs, sandbox.home, sandbox.tmp],
  });
  ```

  `normalizeFailureSignature` (**:633–641**) returns **both** halves:

  ```js
  const normalized = canonicalJson(value);
  return { normalized, digest: sha256(normalized) };
  ```

  and the run record (**:810–822**) consumes only the digest:

  ```js
  stdout_sha256: sha256(stdout),
  stderr_sha256: sha256(stderr),
  failure_signature_sha256: failure.digest,
  ```

  `failure.normalized` is never read. The Buffers and the normalized string go out of scope at the end
  of the loop iteration. **This is the single line where the fix lands for direction 3.**
- **Normalization is path-redaction only** (**:621–631**): ANSI strip, CRLF→LF, explicit absolute
  paths and any path-shaped token → `<ABS_PATH>`, trailing-whitespace trim. **No secret redaction and
  no truncation.**
- **The receipt is the only artifact.** `writeCliResult` (**:1392–1404**) atomically writes the
  canonical JSON to `--output` or to stdout. Nothing else is written.

---

## Existing flags that affect retention or verbosity

Read from `parseCli` (**:1375–1390**), `main` (**:1421–1437**), `normalizePolicy` (**:132–162**) and
the `usage()` text (**:1406–1413**):

| flag | effect on child output |
|---|---|
| `--command` | the command itself |
| `--timeout-minutes` | 1..120, kill deadline |
| `--repo-root` | hash/sandbox root |
| `--cwd` | repo-relative child cwd |
| `--repetitions` | 1..5, more runs → more discarded output |
| `--env-allowlist` | which env keys reach the child |
| `--output` | destination of the **receipt**, not the child output |

**None retains or prints child output.** `process.env` is read at only four points (**:424, :500,
:942, :1433**) and none is a retention or verbosity switch — there is no `KAOLA_*` escape hatch.
`normalizePolicy` accepts no other key. **Row 3 above is the positive control**: the run with no
`--output` printed 2950 bytes, all of it receipt, `grep -c DISTINCTIVE` = 0 on both streams.

→ **Not a documentation problem.**

---

## What pins the receipt's SHAPE

Searched canonical `scripts/`, all three plugin trees, every `*.js`, `*.md`, `*.json`, `*.toml`,
including dot-directories (ugrep skips them by default; `find` was used to enumerate copies).

**No test asserts an exact field set on the receipt or on `runs[]`. An ADDED field breaks no pin.**

- `scripts/test-validation-runner.js` — the only receipt-shape suite (539 lines). Its single
  `Object.keys(...)` equality (**:78**) is over the *scrubbed environment*, not the receipt. Every
  receipt assertion is either a `match(HEX)` or a recomputation with the module's own function:
  - **:154** `vectorA.vector_id === vectorB.vector_id` — audit timestamps must not move `vector_id`
  - **:155** `vectorA.receipt_sha256 !== vectorB.receipt_sha256` — but they must move `receipt_sha256`
  - **:156-157** `computeReceiptSha256(vectorA) === vectorA.receipt_sha256` — *"receipt_sha256 must
    bind every durable field other than its self-hash slot"*
  - **:158-159** changing `stdout_sha256` must change `vector_id`
  - **:350** `RECORD_FIELDS` deep-equals `['verdict','validation_command','validated_candidate_hash']`
    — that is the `record` verb's file, unrelated to the `run` receipt.
  Because the expected values are *computed*, not literal, an added field leaves every assertion
  green. Measurement 7 confirms `computeReceiptSha256` still verifies after an addition on either
  side.
- `scripts/validate-workflow-contracts.js:900–912` — asserts the file exists, is in the install
  manifest, exports seven named functions, and that `test:kaola-workflow:claude` runs
  `test-validation-runner.js`. All additive-safe.
- `scripts/validate-kaola-workflow-contracts.js:655–662` — asserts the four copies exist and are in
  each forge's support-script list. Additive-safe.
- `scripts/test-finalize-door.js:1062` — asserts the module is `require`-able. Additive-safe.
- `scripts/test-install-manifest-single-source.js:150` / `kaola-workflow-install-manifest.js:66` —
  the file name is in the shipped support list. Additive-safe.
- **No test pins the `usage()` text**, in any edition. A new flag string breaks nothing.
- **Chain reach:** `test-validation-runner.js` runs in `test:kaola-workflow:claude` and
  `:claude:full` **only**. The codex/gitlab/gitea chains verify the runner solely through
  `validate-script-sync.js` byte identity.

### `docs/api.md`

**Yes, it documents the receipt surface** — `docs/api.md:478–496`, including the verbatim `run` usage
block at **:486–488** and *"Receipts land under `.cache/validation-vectors/`. Exit 1 when the outcome
is not `pass`."* No validator asserts on that block (the two `assertConcept('docs/api.md', …)` calls
in both contract validators are about the **closure contract**, not the runner).

**But `docs/api.md` is in `TEST_CONSUMED_PATHS`** (`kaola-workflow-validation-runner.js:16–22`, with
`README.md`, `CHANGELOG.md`, `docs/workflow-state-contract.md`, `docs/agents-source.md`). Editing it
moves the candidate hash on a self-host repo, so **any `final-validation.md` / chain receipt taken
before the doc edit reads stale.** Order the work: prose first, receipt last.

Other prose surfaces naming the runner: `README.md:959–964` and `:1031`, `docs/architecture.md:153`,
`docs/conventions.md:243–247`, `docs/workflow-state-contract.md:52`,
`commands/kaola-workflow-finalize.md:63` + `templates/routing/finalize.skeleton.md:138` (both cite the
`record` verb only — untouched by any of the three directions).

---

## Four-copy byte identity

All four are **byte-identical right now**:

```
992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7  scripts/kaola-workflow-validation-runner.js
992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7  plugins/kaola-workflow/scripts/…
992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7  plugins/kaola-workflow-gitlab/scripts/…
992fad7193324f203d139bae4357bba080e70566190515565df61ac9627db2e7  plugins/kaola-workflow-gitea/scripts/…
```

(A fifth set exists under `.kw/worktrees/bundle-904-…/` — that is the live worktree, not an edition.)

**Enforced by** `scripts/validate-script-sync.js:135–145`, `BYTE_IDENTICAL_GROUPS` entry labelled
`validation-runner module copies`, with the comment *"The validation runner carries no runtime- or
forge-specific names, paths, or imports."* `scripts/test-validate-script-sync.js:304–309` mutation-
proves that group (missing-copy and drift cases, both in tmpdirs). `validate-script-sync.js` runs in
the **claude and codex** chains.

**Porting is one command, not three edits.** The runner is **not** in `MATERIALIZED_SHARED`
(`edition-sync.js:84–86` — only `kaola-workflow-adaptive-schema.js` is), so `--materialize-kernel`
does *not* touch it. But `edition-sync.js --write` step (c) (**:261–275**) copies every
`BYTE_IDENTICAL_GROUPS` member from the group's first path to all the others. So:
**`npm run sync:editions` propagates a runner change to all three plugin trees automatically.**

---

## The constraint that dominates all three fix directions

**`docs/decisions/D-697-01.md:57`, in the Decision section, states:**

> *"Raw allowlisted values and **raw child output are not persisted**."*

and **:68–70**:

> *"`vector_id` excludes audit timestamps and addresses **deterministic** semantic fields;
> `receipt_sha256` binds the complete durable receipt including audit time. Inherited obligations are
> `{command_id, required_pass_vector_id}` and **may not be silently dropped or changed**."*

That sentence is **not machine-pinned** — no validator or test references `D-697-01` or that phrase,
so nothing goes red. But all three fix directions reverse a recorded design decision, and the reason
behind it is a real exposure, not ceremony:

- `buildScrubbedEnvironment` exists so an allowlisted secret (`--env-allowlist TOKEN`) reaches the
  **child** but appears in the receipt only as `value_sha256`. A child that echoes that token into
  its output puts it in the retained text.
- `normalizeOutputText` (**:621–631**) redacts **absolute paths only**. It has no secret redaction.
- `kaola-workflow/**/.cache/` is **tracked**: 6593 such files are committed today, and archived run
  folders keep them forever. A retained log or an inlined text under a run folder is committed to git
  history permanently.

**Per axiom 4, that is a value call and belongs to the owner: diagnosability vs. an
unredacted-secret surface in permanent history.** It is settled by amending or superseding D-697-01,
not by a test.

---

## Cost of each fix direction

### Direction 1 — `--keep-output <path>` flag

| | |
|---|---|
| **Receipt shape** | **unchanged**. `vector_id` and `receipt_sha256` untouched, `schema_version` stays 1. |
| **Determinism risk** | **zero** — measurement 6 stands unchanged. |
| **Code** | `kaola-workflow-validation-runner.js`: read the flag in `main` (**:1421–1437**), thread it through `runValidation` (**:738–848**) to the per-repetition loop (**:795–822**) — the Buffers are already there — and extend `usage()` (**:1406–1413**). One file. |
| **Editions** | 3 copies, via `npm run sync:editions`. |
| **Prose** | `docs/api.md:486–488` (usage block) — **test-consumed, stales prior receipts**. Optionally `README.md:1031`. `CHANGELOG.md`. |
| **Tests** | New cases in `scripts/test-validation-runner.js` (test custody: authored by `tdd-guide`, not the implementer). |
| **Pins broken** | **none found.** |
| **New decisions the implementer must not make alone** | multi-repetition file naming (`--repetitions 2..5` needs 2..5 files or one concatenation); overwrite-vs-refuse on an existing path; whether a path inside `kaola-workflow/**/.cache/` (tracked) is permitted at all. |

### Direction 2 — `raw_output_path` receipt field

Everything in direction 1, **plus**:

| | |
|---|---|
| **Placement decides determinism (measured, row 7)** | inside `runs[]`/semantic → **`vector_id` changes with the path**, so two identical validations that wrote their logs to different paths get different `vector_id`s. That directly contradicts D-697-01:68 (`vector_id` "addresses **deterministic** semantic fields"). Inside `audit` → `vector_id` unaffected, `receipt_sha256` changes — which is already true of the audit timestamps, and is exactly the split `test-validation-runner.js:145–155` pins. **`audit` is the field's only determinism-safe home.** |
| **Breaks the receipt's self-containment** | every field today is content-addressed; the receipt can be verified in isolation (`computeReceiptSha256` round-trips). A path is the **first field whose referent can go missing, move, or be edited** without the receipt noticing — no hash of the log is implied by the design, so a dangling or tampered pointer reads as valid. Adding a `raw_output_sha256` alongside restores that, at the price of a second field. |
| **Artifact classification** | `classifyDurableArtifact` measured: a **flat** `.cache/foo.log` classifies today as `record/evidence/**agent**` via the broad band `/^\.cache\/[^/]+\.(?:md\|log\|txt\|json\|jsonl\|diff\|patch)$/` — no registry edit needed, but the writer attribution is wrong (a script wrote it). A **nested** `.cache/validation-logs/run-1.log` returns **`ruling: "unclassified"`**, which would require a new row in `kaola-workflow-adaptive-schema.js` (near **:817**) *and* a witness in `test-kernel-conformance.js:112` (`PATTERN_WITNESSES`), or `partA`'s coverage assertion fails. |

### Direction 3 — inline the normalized failure-signature text

| | |
|---|---|
| **Smallest code change of the three** | one line: `failure.normalized` is already bound at **:807**. |
| **Determinism property: preserved by construction** | the text is exactly the preimage of `failure_signature_sha256`, already a semantic field. If it varied between two comparable runs, the digest would already vary and `reduceRuns` (**:666**) would already return `mixed_results_or_failure_signatures`. So placing it in `runs[]` is determinism-safe in a way a path is not. |
| **But it changes every `vector_id` *value* once** | adding any semantic field re-keys `vector_id` (measured, row 7). D-697-01:70 says an inherited `required_pass_vector_id` "may not be silently dropped or changed" — a pre-change obligation could never be satisfied after. **Practical blast radius today is zero**: no live script reads `vector_id` back (only the runner writes it; `docs/decisions/D-697-01.md` and `test-validation-runner.js` are the only other mentions), and **no `.cache/validation-vectors/*.json` file is tracked anywhere in the repo**. Note that bumping `schema_version` does *not* dodge this — `schema_version` is itself inside the semantic block. |
| **Size is genuinely unbounded** | up to **16 779 000 bytes** (measured, row 9) on a single line of canonical JSON in a tracked file. For scale: the walkthrough's own green output is **927 bytes** for 17 scenarios; the incident's 27-minute consumer suite is unmeasured here. Whatever cap is chosen is **new code** — no truncation exists today, and hitting `MAX_OUTPUT_BYTES` SIGTERMs the child into `inconclusive` (rows 8–9) rather than truncating. `--repetitions N` multiplies the cost by N. |
| **Largest secret exposure of the three** | the text goes into the *receipt* itself, which is durable, tracked, and archived — no opt-in path, no way for a consumer to decline it. Directions 1 and 2 at least make retention explicit. |

---

## Inferences

- **The issue is a real, unmitigated code gap, not a doc gap** — confidence: **high**. Refuted by: any
  flag, env var, or side-effect file that surfaces child output; I found none across the CLI parser,
  the policy normalizer, all four `process.env` reads, and a filesystem-wide marker search.
- **Direction 1 is the only one with zero effect on the receipt's hash properties** — confidence:
  **high** (rows 6–7 measured; the receipt is untouched by definition).
- **`audit` is the only determinism-safe home for a path field** — confidence: **high**; measured
  directly, and it is what `test-validation-runner.js:145–155` already pins.
- **Direction 3 is determinism-property-preserving but re-keys every `vector_id` once, at zero
  practical cost today** — confidence: **high** for the property (it follows from `reduceRuns`),
  **high** for the blast radius (no tracked vector file, no live reader).
- **All three require the owner to amend `docs/decisions/D-697-01.md:57`** — confidence: **high** that
  the sentence says what it says and that nothing enforces it; the question of whether to reverse it
  is a **values** call, not a measurement.
- **The real trap in the work is ordering, not correctness**: `docs/api.md` is test-consumed, so a
  doc edit after a green receipt stales it. Refuted by: `TEST_CONSUMED_PATHS` no longer containing
  `docs/api.md`.

## Open

- **Red-suite output size for a real consumer repo is unmeasured.** I measured a green walkthrough
  shard (927 bytes) and the hard 16.78 MB ceiling, but not the incident's 27-minute GPU suite, which
  lives in another repository I have no access to. Any truncation cap chosen from my numbers alone
  would be chosen from the wrong distribution.
- **Whether the "child output may contain secrets" risk has ever materialised here** — not measurable
  from this repo; the runner's own suite uses no allowlisted secrets.
- **Direction 2's dangling-pointer behaviour is untested** because no such field exists; I inferred it
  from the absence of any content-address on the referent, not from a run.
- **I did not mutation-prove that an added field leaves the suite green**, because that requires
  editing a tracked file, which is outside my write set. The claim rests on reading every assertion in
  `test-validation-runner.js` plus measurement 7 (the self-hash still verifies after an addition on
  either side). An implementer should confirm it by running `node scripts/test-validation-runner.js`
  against the real change.
