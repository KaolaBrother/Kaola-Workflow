# Tests — #972: install-all must not report Codex current when the served CONTENT differs

**Baseline: `7e962bdc86d188e1da99af3309a13ae0dd3d9e97`** (worktree `.kw/worktrees/bundle-969-970-971-972`,
branch `workflow/bundle-969-970-971-972`).

## Files changed

- `scripts/test-install-all.js` — the only file touched. No production file was modified.

`git status --porcelain` also shows `simulate-workflow-walkthrough.js`, `test-bash-block-guards.js`
and `test-gap-sweep.js` modified — those are other agents' edits in the shared worktree, untouched
by me.

## Counts

| | cases | assertions | exit |
|---|---|---|---|
| before | 21 (A…R2, Q) | 131 passed | 0 |
| after | 29 (+S1…S8) | 161 passed / **9 failed** | **1** |

`node scripts/test-install-all.js` → **exit 1**.

## The RED (literal output at `7e962bdc`)

```
FAIL: S2: a runtime serving stale content is NOT reported current — tail: ================ install-all summary (unknown) ================ |   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      PASS     (exit 0)  — plugin 5.0.0 |   kimi       PASS     (exit 0) | ================================================================ | install-all: all runtimes OK | 
FAIL: S2: `codex plugin remove <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: S2: `codex plugin add <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: S2: the runtime ends up SERVING the tree content — got "cache content: A run normally carries one issue\n"
FAIL: S5: the refresh was attempted — calls: ["plugin list --json"]
FAIL: S5: a refresh that did not converge the CONTENT makes the wrapper exit non-zero (got 0)
FAIL: S5: the un-converged runtime reads FAIL — tail: ================ install-all summary (unknown) ================ |   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      PASS     (exit 0)  — plugin 5.0.0 |   kimi       PASS     (exit 0) | 
FAIL: S5: no PASS row for a runtime that did not converge
FAIL: S5: the all-clear sentinel is withheld when the served content is not at HEAD

install-all contract test FAILED: 9 failure(s), 161 passed.
```

The `calls: ["plugin list --json"]` in every S2/S5 line is the defect stated as evidence: the wrapper
reads the version, matches, and issues nothing further.

## Stub changes (the expensive part)

The stub codex CLI carried **version state only**. It now carries a **content dimension**, modelled on
the real cache layout verified on disk: `<home>/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.

1. **`plugin list --json` emits provenance.** Added `source:{source,path}` and
   `marketplaceSource:{sourceType,source}` to the row, matching a live `codex plugin list --json`
   capture. `sourceType` is per-case: `'local'` (default), `'git'`, or `null` to omit
   `marketplaceSource` **entirely** — measured: live rows exist on this box with no `marketplaceSource`
   object at all, which is why S4 exists.
2. **`plugin remove` now clears the cache**, not just the version state — the real CLI's documented
   behaviour ("Remove an installed plugin from local config **and cache**").
3. **`plugin add` now materializes the cache** at `<cacheRoot>/<market>/<name>/<addVersion>/` by copying
   the tree plugin dir, i.e. what a *local* marketplace add genuinely does. New `addContent` knob
   overrides what lands there — that is what makes the vacuous-proof case (S5) constructible.
4. **`stubRoot` seeds the cache** as a faithful post-`add` state: a copy of the tree plugin dir whose
   own `.codex-plugin/plugin.json` declares the *cached* version. New opts: `treeContent`,
   `installedContent`, `addContent`, `sourceType`, `cacheManifestVersion`.
5. **A content file exists in the tree plugin**: `skills/demo/SKILL.md`, standing in for the SKILL.md
   prose that moved at an unchanged version.
6. **`runWrapper` now redirects `HOME` *and* `CODEX_HOME`** into the fixture on **every** invocation,
   alongside the existing always-set `KAOLA_CODEX_BIN`. `CODEX_HOME` is set to `$HOME/.codex` so both
   plausible derivations resolve to the same fixture dir. Hermeticity verified after the run: the host
   cache is untouched — `~/.codex/.../kaola-workflow/7.8.0/skills/kaola-workflow-next/SKILL.md` still
   carries its `08-10 23:22` mtime.
7. New read helpers: `servedContentNow`, `treeContentNow`, `mutatingCalls`.

**Fixture coherence proved before writing assertions** (scratch walk, sha256 per file):
identical case → tree-vs-cache diff `[]`; drift case → diff `["skills/demo/SKILL.md"]`; after a stub
`plugin add` → diff `[]`. Generated stub passes `bash -n`.

**All 131 pre-existing assertions still pass** — verified with the grown stub *before* any new case was
added (exit 0, 131 assertions), so the stub growth regressed nothing on its own.

## What is pinned

| case | scenario | baseline |
|---|---|---|
| S1 | local, equal version, **identical** content → no churn, reports current, `codex PASS` | green (control) |
| **S2** | local, equal version, **content differs** → remove+add issued, cache ends up serving the tree content, version never moves, `codex PASS`, and the false `already at 5.0.0` line is **not** printed | **RED** |
| S3 | **git** marketplace, equal version, content differs → zero mutating calls, cache untouched, not a FAIL | green (control) |
| S4 | **no `marketplaceSource`**, content differs → zero mutating calls (the gate is "explicitly local", not "not explicitly git") | green (control) |
| **S5** | local, content differs, and `add` leaves content **still** differing → exit non-zero, `codex FAIL`, no PASS row, no `all runtimes OK`. Two fixture controls assert the refresh really did not converge and that the **versions are equal throughout**, so only a content proof can catch it | **RED** |
| S6 | `--check` with a content difference → zero mutating calls, cache and version untouched, dry-run sentinel | green (control) |
| S7 | version inequality with byte-identical content → still refreshes (the version trigger is not replaced) | green (control) |
| S8 | version inequality on a **git** marketplace → still refreshes (the version trigger is not over-gated on local) | green (control) |

## Mutation proof — every control is armed

A green control proves nothing until it can fail. Three method-neutral mutants applied to a **scratch
mirror** of `install-all.sh` (symlinked repo, never the worktree file; the unmutated mirror reproduces
the worktree result exactly: 9 failures / 161 passed):

| mutant | edit | S-cases turned RED |
|---|---|---|
| always-refresh | version-equality branch → `if false` | **S1, S3, S4** |
| refresh-under-check | above + the convergence `--check` guard → `if false` | **S1, S3, S4, S6** (and K) |
| drop-version-trigger | version-equality branch → `if true` | **S7, S8** (and 33 others) |

So: an unconditional refresh fails S1/S3/S4; a refresh that mutates under `--check` fails S6; dropping
the version trigger fails S7/S8. The guard cannot be satisfied by refreshing everything, and cannot be
satisfied by replacing the version trigger with a content one.

## Other suites

- `node scripts/test-spawn-classification.js` → exit 0 (no new spawn site was added; the annotation
  ratchet is unaffected).
- `bash -n install.sh uninstall.sh install-all.sh` → OK (no shell file was touched; the stub bash the
  test *generates* also passes `bash -n`).

## Deliberately NOT pinned — for the orchestrator

1. **How a git-sourced marketplace with differing content is *reported*.** S3 pins only that it does
   not churn and does not FAIL; PASS-vs-PARTIAL is left open. The ruling settled the refresh gate, not
   the reporting, and premise-972 flags a standing PARTIAL as the exact noise `codex_not_applicable`
   was introduced to remove. If a verdict is wanted here, it is a value call, not mine.
2. **Message wording on the content path.** S2/S5 assert status, exit code, call log, and final served
   content — never a new log string, since none exists to pin. S2 *does* assert the absence of the
   existing false `marketplace plugin already at <v>` line, because that line is the filed defect.
3. **Test H no longer isolates the version trigger.** With a faithful cache fixture, a version
   mismatch implies a manifest content mismatch, so H alone can no longer catch a dropped version
   check. S7 is the deliberately-unfaithful control that restores that isolation (it holds the cached
   manifest at the tree version so the installed version string is the only difference).
4. **The stub's `add` copies from the tree even for a `git` marketplace** (S8). A real git add installs
   a remote snapshot. S8 asserts only that remove+add are issued and the version moves, so the
   simplification does not touch the verdict — but it means the fixture is not a faithful git
   marketplace in the content dimension.
5. **`codex plugin add` alone at an already-cached version** is still unmeasured (premise-972's open
   item; settling it needs a mutating call on the live install). The tests pin remove+add as a pair
   only via the call log, and would equally pass an implementation that issues both.

---

# Round 2 — which tree arbitrates: the oracle must be the configured marketplace

**Baseline for this round: the landed implementation** (working tree at `7e962bdc` + the implementer's
`install-all.sh` change). Suite was **green at 170 assertions** before I started; it is now **RED**.

## Files changed

- `scripts/test-install-all.js` — again the only file I touched. `install-all.sh` shows as modified in
  `git status`; that is the implementer's change, not mine (`grep -c source_path install-all.sh` → 0,
  i.e. my shadow never reached the worktree).

## Counts

| | cases | assertions | exit |
|---|---|---|---|
| before (round 2) | 29 | 170 passed | 0 |
| after | 32 (+W1, W2, W3) | 180 passed / **16 failed** | **1** |

All 170 pre-existing assertions still pass — verified twice: once with the restructured stub before any
W case existed (exit 0, 170 assertions), and again under the shadow below (196/196).

## The RED (literal, against the landed implementation)

```
FAIL: W1: a runtime already serving its source is NOT refreshed — calls: ["plugin list --json","plugin remove kaola-workflow@stub-market","plugin add kaola-workflow@stub-market","plugin list --json"]
FAIL: W1: it is reported current — tail:   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      FAIL     (exit 0)  — plugin convergence FAILED: served content is not the tree's (plugin 5.0.0) |   kimi       PASS     (exit 0) | ================================================================ | !!! [codex] plugin does not serve the tree's content after refresh (plugin 5.0.0) — NOT converged | install-all: one or more runtimes FAILED (see summary above) | 
FAIL: W1: the wrapper exits 0 (got 1)
FAIL: W1: codex reads PASS
FAIL: W1: a converged runtime is never FAIL just because the invoking tree differs from its source
FAIL: W1: all-clear on a converged box
FAIL: W2: `codex plugin remove <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: W2: `codex plugin add <pluginId>` was issued — calls: ["plugin list --json"]
FAIL: W2: the runtime ends up serving what its configured source installs — got "worktree content: what the cache also carries\n"
FAIL: W3: the refresh CONVERGED, so the first run exits 0 (got 1) — tail:   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      FAIL     (exit 0)  — plugin convergence FAILED: served content is not the tree's (plugin 5.0.0) |   kimi       PASS     (exit 0) | ================================================================ | !!! [codex] plugin does not serve the tree's content after refresh (plugin 5.0.0) — NOT converged | install-all: one or more runtimes FAILED (see summary above) | 
FAIL: W3: the first run reads PASS
FAIL: W3: a second immediate invocation refreshes NOTHING — a converged runtime can never be asked to converge again — calls: ["plugin remove kaola-workflow@stub-market","plugin add kaola-workflow@stub-market"]
FAIL: W3: the second run exits 0 (got 1)
FAIL: W3: the second run reports the runtime current — tail:   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      FAIL     (exit 0)  — plugin convergence FAILED: served content is not the tree's (plugin 5.0.0) |   kimi       PASS     (exit 0) | ================================================================ | !!! [codex] plugin does not serve the tree's content after refresh (plugin 5.0.0) — NOT converged | install-all: one or more runtimes FAILED (see summary above) | 
FAIL: W3: no permanently-red row
FAIL: W3: the all-clear survives a repeat run
```

**The W3 line is the ruling's whole point, reproduced literally**: the second invocation, run
immediately after a successful refresh, issues `plugin remove` + `plugin add` again and reports
`codex FAIL` again. That is the non-convergent loop, observed rather than argued.

## Stub changes

The stub previously modelled a marketplace whose source *is* the invoking tree. It now separates the
two, because that identity is exactly the assumption under test.

1. **`plugin add` installs from `SOURCE_PLUGIN`, not the invoking tree** — the configured marketplace's
   plugin directory. This is the faithful behaviour: `add` reads the marketplace, not the caller's cwd.
2. **The row's provenance fields describe the marketplace**: `source.path` = the marketplace's plugin
   dir, `marketplaceSource.source` = the marketplace root. Both are kept mutually consistent, as they
   are on a live install, so an implementation reading *either* field lands on the same content — the
   test does not prescribe which one to read.
3. **`stubRoot({ marketplaceContent })`** gives the marketplace its own checkout: a fresh root whose
   `plugins/<pluginDir>/` is a copy of the invoking tree's with that content substituted. Unset, the
   two are the same directory and every pre-existing case is bit-for-bit unaffected.
4. **The cache is seeded from the marketplace source**, since that is where an `add` would have put it.
   With no separate marketplace this is identical to the previous behaviour.
5. New helpers: `marketplaceContentNow`, `servedDirNow`, and `dirsEqual` (byte-for-byte over every
   file — the comparison the wrapper itself must make, used only as a fixture control).

## What the three cases pin

| case | fixture | correct behaviour | why the current code fails it |
|---|---|---|---|
| **W1** | invoking tree differs from the marketplace source; cache **byte-equal to the marketplace source** | no refresh, reports current, `codex PASS` | tree oracle sees a difference, refreshes, reinstalls the source's content, compares against the tree again, reports FAIL — the permanent-red row |
| **W2** | cache equals the **invoking tree**, differs from the marketplace source | refresh fires and the cache ends up serving the marketplace content, `codex PASS` | tree oracle sees no difference and does nothing, while the runtime serves content its own source has moved past |
| **W3** | cache stale against **both** trees; wrapper run **twice** | first run converges (exit 0, PASS); second run issues **zero** mutating calls, exits 0, reports current | first run FAILs, second run churns remove+add and FAILs again — forever |

W1 and W2 discriminate the two oracles in opposite directions, so neither can be satisfied by picking
the wrong tree. W3 pins the ruling's actual property — no reachable state demands a refresh that cannot
converge — by observation rather than by reasoning about the trigger.

## Satisfiability and arming — both proved

A test that cannot go green would be a defect, so I proved these are satisfiable **in a scratch mirror
only** (symlinked repo; the worktree was never written):

- **Shadow of the ruled-for change** — carry the path `add` installs from out of the row, and swap the
  two comparison sites from `$ROOT/$CODEX_PLUGIN_DIR` to it (2 sites) → **196/196 pass, exit 0**. So
  the W cases are satisfiable *and* consistent with all 170 pre-existing assertions; the oracle is the
  only thing that has to move.
- **Anti-cheat mutant** — starting from that green shadow, disable the content trigger entirely
  (`if [[ "$cstate" -ne 1 ]]` → `if true`). Red: **S2 (4), S5 (5), W2 (3), W3 (2)**. So W1's and W3's
  no-churn assertions cannot be satisfied by deleting the feature; the positive cases hold it in place.

## One fact the implementer needs (not a prescription)

`codex_installed_plugin_row` currently emits `version \t pluginId \t sourceType`. It does not carry any
path, so whatever the oracle becomes, something has to plumb it out of the row. Both `source.path` (the
plugin directory) and `marketplaceSource.source` (the marketplace root) are present in the fixture and
mutually consistent, so either is a valid derivation as far as these tests are concerned.

## Round-2 hygiene

- `node scripts/test-spawn-classification.js` → exit 0 (no new spawn site; `runWrapper` is called twice
  in W3, but that is an existing site).
- `bash -n install.sh uninstall.sh install-all.sh` → OK.
- Host `~/.codex` verified untouched after the run: the 7.8.0 `SKILL.md` still carries its
  `08-10 23:22` mtime. HOME/CODEX_HOME redirection held across the repeat invocations.

## Still not pinned

- The reporting shape when a git-sourced marketplace's content differs (unchanged from round 1).
- **The `--check` row's wording under the worktree shape.** W1–W3 are all non-dry runs; S6 still covers
  that `--check` mutates nothing on the content path, but no case pins what a dry run *says* when the
  invoking tree differs from the marketplace source.
- **The forge editions under a separate marketplace.** W1–W3 all run the github edition. The gitlab
  path is covered for the plugin-name derivation (R, R2) but not in combination with a marketplace
  source that differs from the invoking tree.

---

# Round 3 — the silently-disabled check (F1) and the mixed-oracle loop (F2)

**Baseline: the shipped bytes** (worktree at `7e962bdc` + the implementer's `install-all.sh`, i.e. the
state that was green at 196 assertions). Both findings reproduce against it.

## Files changed

- `scripts/test-install-all.js` — again the only file I touched. `install-all.sh` shows modified in
  `git status`; that is the implementer's work (`grep -c source_version install-all.sh` → 0, so my
  shadow never reached the worktree).

## Counts

| | cases | assertions | exit |
|---|---|---|---|
| before (round 3) | 32 | 196 passed | 0 |
| after | 38 (+X1–X4, Y1, Y2) | 211 passed / **25 failed** | **1** |

All 196 pre-existing assertions still pass: verified once with the stub knobs added and no new case
(exit 0, 196), and again under the shadow below (236/236).

## F1 RED — the row is *byte-identical* to a verified one

The assertion prints both strings, which is the finding stated as evidence:

```
FAIL: X1: the row is DISTINGUISHABLE from a verified PASS — the row declares no install-from path at all — got "codex      PASS     (exit 0)  — plugin 5.0.0", verified reads "codex      PASS     (exit 0)  — plugin 5.0.0"
FAIL: X1: an unmeasured runtime never reads PASS — the row declares no install-from path at all — row: "codex      PASS     (exit 0)  — plugin 5.0.0"
FAIL: X1: a check that applies but could not be completed reads PARTIAL — the row declares no install-from path at all — row: "codex      PASS     (exit 0)  — plugin 5.0.0"
FAIL: X1: the all-clear is withheld when currency was never measured — the row declares no install-from path at all
FAIL: X2: the row is DISTINGUISHABLE from a verified PASS — the declared install-from path is not there — got "codex      PASS     (exit 0)  — plugin 5.0.0", verified reads "codex      PASS     (exit 0)  — plugin 5.0.0"
FAIL: X3: the row is DISTINGUISHABLE from a verified PASS — the source directory cannot be read — got "codex      PASS     (exit 0)  — plugin 5.0.0", verified reads "codex      PASS     (exit 0)  — plugin 5.0.0"
FAIL: X4: the row is DISTINGUISHABLE from a verified PASS — the cache is not where the version-keyed layout says it is — got "codex      PASS     (exit 0)  — plugin 5.0.0", verified reads "codex      PASS     (exit 0)  — plugin 5.0.0"
```

(16 X failures in total — four assertions on each of four doors.)

Four doors, one table-driven block. **X1** the row declares no `source.path` at all; **X2** the declared
path is not there; **X3** the source directory cannot be read (a real `chmod 000`, with a fixture
control asserting the read genuinely throws, so the case cannot pass vacuously as root, and a `finally`
that restores the mode); **X4** the cache is not where the version-keyed layout says — which is the
outcome of the wrong-`CODEX_HOME` and `@`-in-marketplace-name doors as well, covered by result rather
than by cause.

Each door asserts: exit 0 (an unverifiable check is never a wrapper failure), **no mutating calls** (the
no-churn stance is preserved — unknown must not trigger a refresh either), the row is not `PASS`, the
row reads `PARTIAL`, the all-clear is withheld, and — the property itself — **the summary row differs
from a control run of a genuinely verified converged box**. That control is computed in the same block
from a real run, so distinguishability is pinned without pinning any wording.

`PARTIAL` is not my invention: `install-all.sh:124-125` defines it as exactly this case, and the four
existing UNVERIFIED cases (L2, M, R2) already assert it.

## F2 RED — the loop, and `kimi NOT-RUN`

```
FAIL: Y1: a runtime serving exactly its source is not FAIL — tail:   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      FAIL     (exit 0)  — plugin convergence FAILED: still 6.0.0, tree 5.0.0 |   kimi       PASS     (exit 0) | ================================================================ | !!! [codex] plugin still reports 6.0.0 after refresh (tree 5.0.0) — NOT converged | install-all: one or more runtimes FAILED (see summary above) | 
FAIL: Y1: the first run exits 0 (got 1)
FAIL: Y1: the box is healthy — the check completed and the answer was "converged"
FAIL: Y1: a second immediate invocation refreshes NOTHING — the runtime already serves its source and no repair could change that — calls: ["plugin remove kaola-workflow@stub-market","plugin add kaola-workflow@stub-market"]
FAIL: Y1: the second run exits 0 (got 1)
FAIL: Y1: no permanently-red row
FAIL: Y2: --strict does not abort over a runtime that serves its source — kimi still installed
FAIL: Y2: --strict exits 0 on a converged box (got 1)
FAIL: Y2: no strict abort — tail:   claude     PASS     (exit 0) |   opencode   PASS     (exit 0) |   codex      FAIL     (exit 0)  — plugin convergence FAILED: still 6.0.0, tree 5.0.0 |   kimi       NOT-RUN  (exit -) | ================================================================ | install-all: --strict abort after codex marketplace-plugin convergence failed | 
```

`kimi NOT-RUN` in Y2's summary is the aggravated cost stated as evidence: a false FAIL under `--strict`
stops the sequence before a healthy runtime is installed at all.

**Y1** asserts the refresh converges the cache **byte-exactly** to its source (`dirsEqual`), the run
exits 0, and a second immediate invocation issues zero mutating calls. Worth noting for the fix: on the
shipped code the second run reaches the loop through the *version* door, not the content one — installed
`6.0.0` vs invoking tree `5.0.0` — so this is not only about the post-refresh proof. The assertions
speak only to the outcome, so any single-oracle arrangement satisfies them.

Fixture change enabling it: `opts.marketplaceVersion` lets the marketplace checkout declare its own
plugin version and makes `add` install *that*. Unset — every pre-existing case — the two versions are
the same by construction, which is exactly the assumption W1–W3 could not see past.

## Satisfiability and arming — both proved, scratch mirror only

- **Shadow of both fixes** → **236/236, exit 0**. F2: one oracle — the version the source declares
  governs the trigger *and* the post-refresh proof, falling back to the invoking tree when there is no
  source manifest, so every same-checkout case is untouched. F1: `cstate == 2` reports and returns
  instead of falling into the current branch. Both new families are satisfiable together and consistent
  with all 196 pre-existing assertions.
- **Mutant `drop-version-proof`** (from the green shadow, delete the post-refresh version comparison) →
  **test I red** (5 assertions). Y1/Y2 cannot be satisfied by deleting the protection that catches an
  `add` which exits 0 without moving the version.
- **Mutant `unknown-means-differ`** (unknown falls through to a refresh instead of a report) →
  **X1–X4 red** (13 assertions, including every no-churn one). F1 cannot be satisfied by churning.

## Round-3 hygiene

- `node scripts/test-install-all.js` → exit **1** (the RED). `test-spawn-classification.js` → exit 0.
  `bash -n install.sh uninstall.sh install-all.sh` → exit 0. All captured as real exit codes, never
  through a pipe.
- Host `~/.codex` verified untouched: 7.8.0 `SKILL.md` still at `08-10 23:22`. HOME/CODEX_HOME
  redirection held across every run, including the repeat invocations and the `chmod 000` case.
- No stray fixture directories left in `TMPDIR`; X3 restores the mode in a `finally`.
- **A process note worth recording**: `cwd` resets between tool calls, and one verification run in this
  round silently executed *main's* copy of the suite (131 assertions — the pre-implementation number)
  instead of the worktree's. Caught by the assertion count being impossible. Every result above was
  re-run with absolute paths.

## Still not pinned, after round 3

- **An over-broad degrade would pass X1–X4.** If a fix reports PARTIAL for *any* content check it did
  not complete — including a git-sourced marketplace, where the check does not apply rather than
  failing — nothing here catches it, because S3/S4 assert only exit 0, no churn, and not-FAIL. That is
  the same git-reporting value call flagged in round 1, now with a second way to get it wrong.
- **`Y1`'s `all runtimes OK` assertion forecloses one reading.** It asserts the box is fully healthy,
  which rules out reporting the source/invoking-tree version divergence as a standing PARTIAL. My
  reasoning: the check completed and its answer was "converged", and this state is reachable on every
  pre-release worktree run, so a standing PARTIAL would be the permanently-lit warning the file already
  ruled against. It is one assertion and easy to relax if that call goes the other way.
- The `--check` row's wording under the worktree shape, and the forge editions combined with a
  differing marketplace source (both carried over from round 2).

---

# Round 4 — Z1: the other edge of the PARTIAL rule

Ruling 1 recorded: Y1's `all runtimes OK` assertion stays as written; it is no longer an open question.

## Files changed

- `scripts/test-install-all.js` — the only file I touched (`grep -c source_version install-all.sh` → 0).

## Counts

| | cases | assertions | exit |
|---|---|---|---|
| before (round 4) | 38 | 211 passed / 25 failed | 1 |
| after | 39 (+Z1) | 220 passed / **25 failed** | **1** |

**Z1 is GREEN on the shipped bytes, by design.** It is a discriminating control, not a RED case: today
a git-sourced marketplace never enters the content check at all, so nothing degrades it. Its entire
value is in what it catches once a fix exists, so the mutation evidence below is the case's real
justification — an assertion of this shape that could not distinguish the two would license the
over-broad shape rather than forbid it.

## What Z1 pins

Fixture is S3's — git-sourced marketplace, content differing from the tree, equal version — plus a
fixture control asserting the served content really does differ, so any content check that ran at all
would have had something to say. It then asserts: exit 0; **no churn**; the cache untouched;
`codex PASS`; **not `codex PARTIAL`**; no `convergence is UNVERIFIED` line; nothing describing the
plugin as `STALE` or `PENDING`; and `all runtimes OK`.

The distinction, in the file's own vocabulary: X1–X4 are a check that **applies** and could not be
completed → PARTIAL (`install-all.sh:124-125`). Z1 is a check that **does not apply** → not PARTIAL,
which is what `codex_not_applicable` exists for and what its comment already records
("reporting it as permanently UNVERIFIED was noise, not a signal").

## Discrimination — proved, and this is the load-bearing part

All against a scratch mirror; the worktree was never written.

| shape | result |
|---|---|
| **correctly-scoped fix** — degrade only when the comparison was *attempted* (local) and returned unanswerable | **245/245 pass, exit 0** — Z1 green alongside X1–X4 |
| **over-broad B: `degrade-non-local`** — an explicit else-arm degrading every marketplace no local tree arbitrates | **Z1 alone fires — 4 assertions, and nothing else in the entire suite** |
| **over-broad A: `unconfirmed-by-default`** — anything the check did not positively confirm degrades | Z1 fires (4) alongside A, S1, W1, W3 and the X control — a cruder mutation that trips many cases |

Mutant B is the exact shape the gap describes, and the measurement is unambiguous: **before Z1 existed
it was invisible to all 236 assertions; with Z1 it is caught, and Z1 is the only thing that catches
it.** X1–X4 stay green under it, which is precisely why they could not be relied on here.

## Round-4 hygiene

- `node scripts/test-install-all.js` → exit **1**; `test-spawn-classification.js` → exit 0;
  `bash -n install.sh uninstall.sh install-all.sh` → exit 0. Real exit codes, absolute paths.
- Host `~/.codex` untouched: 7.8.0 `SKILL.md` still `08-10 23:22`. No stray fixtures in `TMPDIR`.

## The one boundary still unpinned, now measured

**A row with NO marketplace provenance at all** (S4's shape) is also degraded by mutant B, and nothing
catches that either — Z1 covers the git-sourced row, per the ruling, and does not speak to this one.
I left it deliberately, because unlike the git case it is genuinely arguable: with unknown provenance
the wrapper cannot tell whether any local directory arbitrates the plugin, so "could not be determined"
is a defensible UNVERIFIED rather than a clear N/A. If asked, I would lean the same way as git —
nothing was attempted, so nothing was left incomplete, and live rows without `marketplaceSource` are
ordinary rather than broken — but that is a value call and one assertion away either way.

Also still unpinned, carried forward: the `--check` row's wording under the worktree shape, and the
forge editions combined with a marketplace source that differs from the invoking tree.

---

# Round 5 — the no-provenance row pinned, and every guard re-armed against what ships

Ruling recorded: a row with **no marketplace provenance** is treated the same as git — not degraded,
no PARTIAL. The counter-argument ("could not be determined is a defensible UNVERIFIED") is on the
record as rejected, on the grounds that UNVERIFIED must keep meaning *"I tried and could not tell"*
rather than *"there was nothing to try"*.

## What changed

Rather than duplicate the block, Z1 is now a **two-row table over the provenance shapes** —
`Z1[git]` and `Z1[no-provenance]` — running one identical assertion body. The rule is stated once and
each failure names its shape. `scripts/test-install-all.js` remains the only file I touched.

## It is not noise — the second shape catches a mutation the first cannot

I ran the check the ruling asked for before claiming the assertion earns its place. The decisive
mutant is **the rejected counter-argument implemented faithfully**: git is treated as clearly N/A while
an unknown provenance is degraded as "could not be determined".

| mutant | cases red |
|---|---|
| `degrade-non-local` — an else-arm degrading every marketplace no local tree arbitrates | `Z1[git]` 4 + `Z1[no-provenance]` 4 = **8**, nothing else |
| **`degrade-unknown-only`** — git left alone, unknown provenance degraded | **`Z1[no-provenance]` alone — 4 assertions, 250 passed** |

`Z1[git]` stays green under `degrade-unknown-only`. So the second row is the only observer of the exact
shape the ruling rejected, and it is not redundant with the first.

## Every guard re-armed against the SHIPPED bytes, not against my shadow

The implementer landed the fix while this round was in progress (`install-all.sh` mtime 08-13 01:58).
That makes the earlier shadow-based arming evidence obsolete as proof — a guard reads what ships — so I
re-ran all four mutations against the landed code:

| mutant against the landed implementation | cases red |
|---|---|
| `unknown-means-differ` — delete the unanswerable arm so unknown falls through to a refresh | **X1, X2, X3, X4** — 16 |
| `revert-to-invoking-tree` — remove the one-oracle re-derivation | **Y1** 6 + **Y2** 3 = 9 |
| `degrade-non-local` | **Z1[git]** 4 + **Z1[no-provenance]** 4 = 8 |
| `degrade-unknown-only` | **Z1[no-provenance]** 4 |

Every family fires, each on its own mutation, none on another's. The guards are armed against the code
that actually ships.

Worth recording: the implementer's F2 fix is **better than the shadow I proved satisfiability with**.
Mine plumbed a separate `source_version` alongside `$tree`; theirs re-derives `$tree` itself from the
source's manifest, so the trigger and the post-refresh proof cannot diverge by construction rather than
by discipline. My assertions spoke only to the outcome, which is why the better arrangement satisfied
them unchanged.

## Status of the suite — stated, not graded

At the bytes these cases were authored against, the suite was RED: 25 failures across X1–X4, Y1, Y2,
captured literally in rounds 3 and 4. The tree has since moved and the suite now reports 254 passing
assertions. **That is an observation about the current tree, not my verdict** — I hold the test artifact
and am not the grader of the implementation it judges. What I can attest to is the arming evidence
above: each guard was made to fail against the shipped code by a targeted mutation, so none of them is
green because it cannot fail.

## Round-5 hygiene

- `test-spawn-classification.js` → exit 0; `bash -n install.sh uninstall.sh install-all.sh` → exit 0.
  `grep -c source_version install-all.sh` → 0: no shadow ever reached the worktree.
- Host `~/.codex` untouched: 7.8.0 `SKILL.md` still `08-10 23:22`.
- Scratch mirror and all shadow scripts removed; `TMPDIR` fixture count back to 0.
- **Second trap worth recording, alongside the cwd one**: a zsh glob that matches nothing aborts the
  *entire* command line, so a `rm -rf <glob-a> <glob-b>` where only one glob is empty silently deletes
  nothing while appearing to run. It left 71 fixtures behind from SIGTERM'd mutant runs and I read the
  count as a cleanup failure before spotting the cause. `find -maxdepth 1 -name ... -exec rm -rf {} +`
  is the form that does not have this failure mode.

## Carried forward, still unpinned

- The `--check` row's wording under the worktree shape (S6 pins that it mutates nothing, not what it
  says).
- The forge editions combined with a marketplace source that differs from the invoking tree — W1–W3 and
  Y1–Y2 all run the github edition.
