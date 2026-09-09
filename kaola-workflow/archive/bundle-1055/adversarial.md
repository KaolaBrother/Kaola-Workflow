# Adversarial verification — Issue #1055

Surface: worktree `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1055`,
branch `workflow/bundle-1055`, frozen candidate `8791ab55`, baseline `5cb85515`.

Verdicts up front:

| Claim | Verdict |
|---|---|
| A — subtraction is behaviour-preserving | held |
| B — dependency relocation is behaviour-preserving | partially held (one latent divergence, not currently reachable) |

Two side findings outside both claims are recorded at the end. One is a real defect in a
tracked file.

---

## Claim A — the generator subtraction

### A1. Does the oracle exercise the same code paths as a real `--write`?

**No.** The oracle calls `renderAgent` and `renderCommand` in process and hashes the returned
strings. It never writes a file. The real `--write` additionally renders `hooks.json`, copies
launcher shims, creates directories, sets file modes, and prunes retired files. None of that is
covered by the 300 hashes.

I closed the gap with a clean-room tree diff rather than trusting the oracle.

`--write` resolves its output root through `adaptive-schema.getCoordRoot`, which for a linked
worktree returns the **main checkout**, not the worktree. Two `git worktree add` scratch trees
therefore both write to the same place and cannot be compared. I used two standalone clones
instead, whose `.git` is a real directory, so each resolves its tree root to itself.

```
git clone --no-hardlinks --no-checkout "file:///Volumes/.../kaola-workflow" <SP>/clone-base
git -C <SP>/clone-base checkout --detach 5cb85515
cp -R <SP>/clone-base <SP>/clone-cand
git -C <SP>/clone-cand fetch "file://<worktree>" workflow/bundle-1055
git -C <SP>/clone-cand checkout --detach 8791ab55
# in each clone, for r in cursor grok zcode kimi opencode; for f in github gitlab gitea:
node scripts/sync-$r-edition.js --write --forge=$f
```

All 30 writes exited 0. I then built a manifest of every file and symlink under the fifteen
generated trees, recording repo-relative path, octal mode via `stat -f '%Lp'`, and sha256.

| Measure | Baseline | Candidate |
|---|---|---|
| files and symlinks | 308 | 308 |
| mode 644 | 261 | 261 |
| mode 755 | 47 | 47 |
| manifest diff lines | 0 | 0 |

**Zero byte differences and zero mode differences** across 5 runtimes by 3 forges. This covers the
artefacts the oracle cannot see, including `hooks.json`, `config.json`, and the sixteen zcode
launcher shims.

Limits of this attempt:
- The `.zcode` tree carries 1227-byte launcher shims, not the real scripts. Its copy of
  `kaola-workflow-claim.js` is byte-identical between baseline and candidate because it is a shim.
  So this diff does not exercise the Claim B changes at all.
- I did not diff extended attributes, only mode, content, and symlink target.
- `--check` and `--refresh-present` were not driven; only `--write`.

I first ran this same comparison against the shared main checkout and it also showed zero
differences across 3754 files. I discarded that result as evidence because the two runs were
sequential into one directory, so a file the candidate failed to write would have survived from the
earlier baseline run and read as a false match. The clean-room result above has no such hole.

### A2. Is the oracle armed, or does it pass vacuously?

Four mutants, each applied to a disposable clone and reverted:

| Mutant | Injected | Oracle result |
|---|---|---|
| M1 | `renderAgent` throws for role `planner` in `sync-grok-edition.js` | exit 1 |
| M2 | one byte appended in cursor `transformCommandBody` | exit 1, 18 renders drifted |
| M3 | agent render drift for one role in one runtime | exit 1, 3 renders drifted |
| M4 | one command source dropped for the gitea forge | exit 1, count 290 not 300 |

M2's count of 18 is exactly 3 forges by 3 commands by 2 line endings, and M3's count of 3 is
exactly 3 forges by 1 role. The oracle localizes correctly, and the 300-count assertion catches a
silently skipped surface as designed.

One caveat on M1: `buildManifest()` runs at module top level, so a throwing runtime module produces
an **uncaught exception and a stack trace**, not the oracle's own `FAIL:` diagnostic. Exit status is
1 either way, so a chain runner keyed on exit code still catches it. The operator just gets a worse
message.

### A3. Is the baseline fixture genuine, or self-certifying?

This is the failure mode where a guard authors the defect and then certifies it. I tested it
directly: I copied the candidate's oracle into the **pristine 5cb85515 clone**, ran
`--write-baseline` there, and compared the result to the committed fixture.

```
cp <worktree>/scripts/test-issue-1055-render-subtraction-oracle.js <SP>/clone-base/scripts/
cd <SP>/clone-base && node scripts/test-issue-1055-render-subtraction-oracle.js --write-baseline
```

All 300 records matched by key and hash, zero mismatches, and both files record
`captured_at_commit: 5cb855153338f7116d691200ad79fb06e553e7f0`. The fixture genuinely reflects the
baseline commit. It is not self-certifying.

### A4. Consumers the grep may have missed

I searched the whole tree, both commits, for each deleted symbol, including non-JavaScript
surfaces (`*.sh`, `*.json`, `*.md`, `*.toml`, `*.yaml`), computed property access, and
concatenated `require` calls.

| Symbol | Baseline call sites outside its own definition |
|---|---|
| `ZERO_HASH` (5 sync scripts) | none; the live `ZERO_HASH` in `generate-agent-profiles.js` is untouched |
| `lowerSet` (grok, cursor, opencode) | none |
| `CURSOR_MODEL_CLASS_PINS` / `cursorModelPin` | none in production; only the old source-regex test |
| sink-merge `getRoot` | none; definition only, not exported |
| sink-merge `requiredArchiveFiles` (4 trees) | none; definition plus one prose mention, not exported |
| `computeLandableBlobEntries` | none; it **was exported**, but `kaola-workflow-plan-validator.js` and `test-interior-gate-freshness.js` are both already deleted |
| `scopeIsFresh` | none; the live predicate is `scopeProfilesFresh`, used at preflight lines 2311, 2411, 2701 |

The two concatenated requires I found resolve to `kaola-workflow-active-folders.js` and are
unrelated. No shell script, hook, template fence, or JSON manifest names any deleted symbol.
Remaining textual hits are all in `CHANGELOG.md` history or archived run notes.

`scopeIsFresh` deserves a note because its own comment calls it "load-bearing" and the #571
CHANGELOG entry describes it as the predicate the gate runs on. Both are stale narration. In
baseline the function had **zero call sites**; the short-circuit runs on `scopeProfilesFresh`.
Deleting it changes nothing.

`computeLandableBlobEntries` is the one deletion that removes a symbol from a module's public
exports. With its only consumer retired, no in-repo caller exists, but a downstream repo requiring
it would break.

### A5. The codex walkthrough test (c)

Test (c) at `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:1133` still
names `scopeIsFresh` in its comments and locks the stale-global behaviour, so I ran the whole
plugin walkthrough in both clones.

```
node plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js
```

Both exited **0** in 9 seconds with 165 spawns each, and `testCodexPreflight571 (#571 global-scope
gate): PASSED`. Normalized output is identical between the two commits.

To confirm the section is armed rather than passing vacuously, I made `scopeProfilesFresh` return
`true` unconditionally in the candidate clone. The walkthrough went to exit 1 with
`#571 test(b): neither scope valid must fail closed, got exit 0`. Limit: the suite is fail-fast, so
this mutant reds at test (b) and test (c) never runs. I proved the #571 section is armed, not test
(c) specifically. Since `scopeIsFresh` had no callers, test (c) never exercised it anyway.

### A6. The edition suites and the new CRLF pins

All five edition suites, run in the candidate clone, pass with the drift check **armed at 3 of 3
trees**, not vacuous:

| Suite | Assertions |
|---|---|
| cursor | 840 |
| grok | 707 |
| kimi | 826 |
| opencode | 877 |
| zcode | 856 |

The bundle adds a CRLF pin to each of the five, replacing the retired line loop's only real effect.
I mutated `body.split(/\r?\n/)` to `body.split(/\n/)` in each generator in turn. **All five suites
went red** on exactly `FAIL: CRLF: transformCommandBody(CRLF body) must equal
transformCommandBody(LF body) byte-for-byte`. The pins are armed.

The oracle is registered on `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full`, and
`test-suite-registration.js` passes at 732 assertions.

The cursor test's rewrite is an improvement worth naming: it stopped regex-scraping
`sync-cursor-edition.js` source text for a table and now pins the real chain, the adapter's
`intent_mapping` plus the actual rendered `model:` line. A test that reads production source text
proves nothing about behaviour.

### Verdict A: held

No byte or mode difference in any generated artefact, the oracle is armed on all three axes, its
baseline is genuine, and no deleted symbol had a surviving consumer.

---

## Claim B — the dependency relocation

### B1. `OFFLINE` and `REMOTE_TIMEOUT_MS`

The two new constants in `kaola-workflow-adaptive-schema.js` are **textually identical** to the ones
in `kaola-workflow-claim.js`: same env var names, same `parseInt` radix, same `Number.isInteger(n)
&& n > 0` test, same `Math.min(n, 600000)` clamp, same `30000` default. No parsing or clamping
difference.

I drove `defaultBranch` differentially over five repository shapes in both clones, under
`KAOLA_WORKFLOW_OFFLINE=1` and unset:

| Shape | Result, both commits |
|---|---|
| `origin/HEAD` symbolic-ref to `trunk` | `trunk` |
| `origin/HEAD` symbolic-ref to `master` | `master` |
| no remote at all | `main` |
| origin pointing at a non-existent local path | `main` |

Offline and online JSON outputs were **identical between baseline and candidate** in both modes.

### B2. The one thing that did change — REFUTED as stated, latent in practice

`OFFLINE` is captured at module load. The refactor moves which module's load time that is. Baseline
captures it when `claim.js` loads; the candidate captures it when `adaptive-schema.js` loads. Those
differ whenever the process mutates the env **between** the two requires.

Probe: require `adaptive-schema` first, then set `KAOLA_WORKFLOW_OFFLINE=1`, then require `claim.js`
and call `defaultBranch` against an unroutable remote with the timeout set to 3000 ms.

| Commit | Value | Elapsed | Network probe |
|---|---|---|---|
| 5cb85515 | `main` | 4 ms | no |
| 8791ab55 | `main` | 6012 ms | yes, two probes |

The return value is the same, so no caller sees a wrong answer. What changes is that a caller who
asked for offline makes two network round trips and takes 1500 times longer. That contradicts the
claim's "no error semantics or recovery behaviour changed" in the strict sense, and it is a real
reproducible difference, not a wording quibble.

**Reachability: not currently reachable.** The only in-repo idiom that mutates this env between
requires is the forge helper tests, which bust the claim module cache to re-read `OFFLINE`
(`plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js:325`, and the gitlab twin at
:258). Those two trees keep `defaultBranch` **local to their own claim port**, which this bundle did
not touch, so they are unaffected today. Under normal CLI use the shell sets the variable before
node starts and both modules capture the same value.

The residual risk is that the comment "bust the claim module cache so OFFLINE is re-read" is now
**incomplete for `defaultBranch`** on the canonical and codex trees. Anyone who copies that idiom
there gets network calls in offline mode. `scripts/test-claim-hardening.js` uses the same
set-env-before-require pattern at line 18, but its `defaultBranch` cases at lines 296 to 337 only
exercise the symbolic-ref and no-remote paths, where no probe is timeout-bounded, so it does not
fire today either.

### B3. Load order, circularity, and the sink transaction

No TDZ or circular-import problem. Requiring `sink-merge` first then `claim`, and the reverse, both
succeed. Both `sink-pr` copies load standalone, canonical and codex mirror.

Re-export identity holds:

```
claim.defaultBranch    === adaptiveSchema.defaultBranch     true
claim.readActiveFolders === activeFolders.readActiveFolders true
claim.getCoordRoot     === adaptiveSchema.getCoordRoot      true
claim.mainRootFromCoord === adaptiveSchema.mainRootFromCoord true
claim.resolveMainRoot  === adaptiveSchema.resolveMainRoot   true
```

These are the same function objects, not copies, so the "pure re-export" premise is measured, not
assumed. `claim.js` still exports `defaultBranch`, so any existing importer keeps working.

For the transaction itself I instrumented `runSinkAt` in **both** clones to dump every real
`--sink --json` envelope, then ran the sink suite.

| Measure | Baseline | Candidate |
|---|---|---|
| suite result | pass, 1063 assertions | pass, 1063 assertions |
| sink envelopes captured | 103 | 103 |
| dump size, bytes | 165689 | 165689 |
| distinct `steps` objects | 1 | 1 |

The `steps` object is identical on both sides:
`preflight, push_upstream, merge, finalize, stash_restore, archive_commit, push_main, closure`.
Counts of every `result`, `reason`, and `status` token match exactly. After normalizing timestamps,
paths, and git object IDs, the only residual differences across all 103 envelopes are random
`mkdtemp` suffixes inside symlink targets, for example `kw-sink-mock-SCk2qE` against
`kw-sink-mock-9tht3t`. Nothing structural differs.

Limits: `KAOLA_WORKFLOW_SKIP_TESTGATE=1` is set by the suite's own harness, so the post-rebase test
gate is reported `skipped` in every envelope and was not exercised. `gh` is a mock throughout. I did
not drive a real forge.

### B4. Cross-tree byte parity

All four copies of each shared script are byte-identical at the candidate commit:
`kaola-workflow-adaptive-schema.js` (sha256 `8c61d5af…`), `kaola-workflow-validation-runner.js`,
`kaola-workflow-codex-preflight.js`, and canonical against codex `kaola-workflow-claim.js`.

### B5. A structural point the claim does not mention

The gitlab and gitea trees now carry `defaultBranch` **twice**. Their
`kaola-workflow-adaptive-schema.js` gained the new copy through byte parity, but their claim ports
(`kaola-gitlab-workflow-claim.js`, `kaola-gitea-workflow-claim.js`) were not touched and still
define it locally, and `kaola-gitea-workflow-sink-pr.js:13` still imports it from the claim port.
The adaptive-schema copy has **zero consumers** in both forge trees.

This preserves the byte-identity constraint on the shared schema, which is a defensible trade. But a
bundle whose stated purpose is removing duplication added a dead duplicate to two of four trees. The
claim's premise "claim.js only ever forwarded it" is true for canonical and codex only. Behaviour in
the forge trees is unchanged, so this is a design observation, not a refutation.

### Verdict B: partially held

Values, transaction order, step sequence, error vocabulary, and envelope contents are unchanged
across 103 real sink transactions. Module identity and load order are safe. The exception is the
`OFFLINE` capture-order divergence in B2, which is real and reproducible but not reachable through
any current shipped path or test.

---

## Side findings, outside both claims

### S1. A raw NUL byte in a tracked JavaScript source — defect

`scripts/test-issue-1055-render-subtraction-oracle.js` contains a literal NUL at byte offset 4378,
line 86, inside `recordKey`:

```js
function recordKey(rec) {
  return [rec.runtime, rec.forge, rec.kind, rec.name, rec.lineEnding].join('<NUL>');
}
```

The separator was written as a raw control byte instead of the escape `'\u0000'`. Consequences,
all measured:

- `git diff --numstat` reports `-  -` for the file. Git classifies it as **binary**, so it has no
  textual diff and cannot be reviewed in a normal diff or blame view.
- `git grep` returns `Binary file … matches` with no line context. This silently degraded my own
  consumer hunt for `lowerSet` and `cursorModelPin`.
- There is no `.gitattributes` in the repository to override the classification.

Behaviour is correct and no guard catches it. `test-spawn-classification.js`,
`validate-workflow-contracts.js`, and `test-bash-block-guards.js` all pass. The fix is one
character: write the escape. I did not apply it; repair is not mine.

### S2. `--write` from a worktree targets the main checkout

`TREE_ROOT` in the four non-cursor generators resolves through `getCoordRoot`, so
`node scripts/sync-<r>-edition.js --write` run **inside a linked worktree** writes the generated
trees into the shared main checkout, exits 0, and prints nothing. This is deliberate, and
`--print-tree-root` reports it honestly, but it is a sharp edge: the command looks local and is not.
Only `sync-cursor-edition.js` offers `--tree-root=PATH` staging; the other four have no way to
redirect output.

I hit this myself. See the disclosure below.

---

## Mutations made, and proof of reversal

### Disclosure

My first tree-comparison attempt ran `--write` from inside the bundle worktree and from a scratch
worktree. Because of S2, those 30 commands **wrote to the shared main checkout** at
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`, which the task told me not to touch.
The trees are gitignored generated artefacts that already existed, so no tracked file was affected,
but the state was mine and the last writer was the candidate generator.

I restored it by re-running all fifteen baseline generators from a 5cb85515 checkout, then verified
the result against the manifest I had captured, 3754 files by path, mode, and sha256:

```
diff <SP>/trees-baseline.tsv <SP>/trees-mainroot-now.tsv    # exit 0, zero lines
```

The main checkout is byte-restored to the state its own HEAD produces. Its tracked status is
`?? kaola-workflow/bundle-1055/` only, and HEAD is `5cb85515`, both unchanged.

### Temporary mutations, all in disposable clones

Every code mutation was made in `<SP>/clone-base` or `<SP>/clone-cand`, never in the bundle
worktree. Each was reverted with `git checkout --` and each clone verified at
`dirty=0` afterwards:

- M1 through M4, the oracle mutants, in `sync-grok-edition.js`, `sync-cursor-edition.js`,
  `sync-zcode-edition.js`, `runtime-edition-forge.js`.
- M5, `scopeProfilesFresh` forced true, in the codex `kaola-workflow-codex-preflight.js`.
- Five CRLF mutants, one per `sync-*-edition.js`, restored from backups.
- Envelope-dump instrumentation in `test-sink-merge.js`, both clones.
- The candidate oracle and fixture copied into the baseline clone for A3, removed after.

### Scratch state

- `git worktree remove --force <SP>/base-5cb85515` — removed. `git worktree list` now shows only the
  main checkout and this bundle worktree.
- `<SP>/clone-base` and `<SP>/clone-cand` are standalone clones under the session scratchpad, not
  registered worktrees of this repository. They hold no unique work.

### Bundle worktree

I made **no edit to any tracked file** in the bundle worktree and committed nothing. My only durable
write is this report.

At the time of writing, `git status --short` in the worktree shows modifications to `CHANGELOG.md`,
`docs/api.md`, `docs/architecture.md`, and `kaola-workflow/bundle-1055/mission-list.md`, plus
untracked `docs.md` and `review.md` under the bundle folder. **None of those are mine.** They
appeared during my session from concurrent agents working the same worktree, and I deliberately left
them untouched.

---

## What remains unverified

- I did not run `npm test`, the four-forge chains, or `test:kaola-workflow:claude:full`, per
  instruction. No chain receipt is bound to `8791ab55` by this work.
- No installer was run. `install-all.sh` and the live runtime homes under `~` were not exercised, so
  installed-surface parity is unmeasured.
- The sink evidence uses a mocked `gh` and skips the post-rebase test gate. No real forge round trip
  was made.
- The generated-tree diff covers `--write` only. `--check` and `--refresh-present` were not driven.
- Test (c) of the codex #571 section was not independently witnessed by a mutant, because the
  walkthrough is fail-fast and my mutant reds at test (b).
- Uncertainty here counts against the claims, not for them. What the verdicts mean for the bundle is
  the orchestrator's call.
