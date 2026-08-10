# Test artifact — issue #941 (`sync-opencode-edition.js` remediation footer)

**Baseline:** `d2ab06c2800963957d740db1dc9d4f019d0c53b5`
**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944` (branch
`workflow/bundle-940-941-942-943-944`). Nothing committed.

**Files written (both are test paths):**

- `scripts/test-opencode-edition.js` — new band **A30**, `:2536-2816` (+283 lines, appended before the
  suite summary). This is the pin for #941.
- `scripts/test-kimi-edition.js` — new band **K12**, `:1261-1350` (+92 lines). The anti-sympathy pin
  the brief asked for. Its own suite is its home; putting a kimi assertion in the opencode suite
  would give the kimi footer a second place to be described.

**Headline:**

```
RED: A30[stale user-owned opencode.json] — after running what --check advised, the only mismatches
     left are the ones NO flag of this script can clear. Advised [["--forge=github","--write"]];
     left behind ["opencode.json"], irreducible [].
baseline: d2ab06c2800963957d740db1dc9d4f019d0c53b5
```

Full opencode suite on baseline: **7 failures, 550 passed, exit 1** — every failure is A30's.
Full kimi suite on baseline: **516 assertions, exit 0** — K12 is green on arrival, by design.

---

## What is pinned, and why in this shape

The band states the property as an **outcome, never a wording**: take whatever runnable invocation of
this script `--check` offers, **run it**, and re-check. Two rules follow, and they are the whole test:

1. **Sufficiency.** After running what was advised, the only mismatches left may be the ones no flag
   of this script can clear. The reference is measured per scenario by running `--write-config` (the
   maximal flag: `runWrite(true)`, a strict superset) against an identically planted tree — not
   assumed, because a fixture where the flag silently did nothing would excuse advice that also does
   nothing.
2. **No no-op advice.** Each advised command, run **individually** against a fresh plant, must clear
   at least one of the mismatches reported alongside it. Individually, so the rule is
   order-independent: a second command is not condemned for finding the first one's work done.

Plus three per-set expectations:

- when **some** flag clears part of the set, a runnable command must still be offered (constraint 2 —
  the 12 write-clearable classes must not be regressed into vague prose);
- when **no** flag clears anything in the set, **no runnable invocation of this script may be offered
  at all** (constraint 3, and the C9-alone discriminator);
- when the set contains **no** `opencode.json` mismatch, `--write-config` must not be advised
  (constraint 1 — it clears 13/14 and overwrites the model pins the config invites the user to set,
  which is exactly what makes it tempting as a blanket answer).

And one reason-line pin: a report containing the unregistered-plugin class must still name
`PLUGIN_SCRIPTS`, because the allowlist edit is the only remedy that class has.

### Scenarios (5)

| # | planted | flag-irreducible remainder | baseline |
|---|---|---|---|
| 1 | stale generated agent (write-clearable) | `[]` | green — anti-regression |
| 2 | stale user-owned `opencode.json` (C14) | `[]` | **RED** |
| 3 | unregistered canonical plugin (C9) | the plugin | **RED** |
| 4 | MIXTURE C14 + write-clearable | `[]` | **RED** |
| 5 | MIXTURE C14 + C9 | the plugin | **RED** |

Three of the 14 classes are planted, one per **remedy kind** (`--write` / `--write-config` / none), not
all 14. The property is per remedy kind; a fourteen-way pin would rot on the fifteenth class and would
pin prose rather than outcome. The `clearedBy` field on each class is a claim the band **measures**
every run — it is never read as fact.

### Deliberately NOT pinned

- **Exact footer prose.** No assertion reads a sentence. The advice parser accepts any runnable
  invocation of the script anywhere in the output, in any wording, one or several.
- **Whether the footer should warn that `--write-config` destroys a user's model pin.** For a C14
  mismatch `--write-config` is the *only* clearing flag, so the band requires it there — but whether
  the reader must also be warned that it erases a documented, user-owned edit is a value call about
  what the product should do. Left to the user; flagged here rather than frozen into an oracle.
- **The pre-existing gitlab/gitea parity red on `main`** (premise §c). Out of scope for #941; the band
  never touches the real trees.

### Fixture design

`runCheck` resolves `REPO` from its own `__dirname` and both write modes mutate that tree, so the only
way to plant a mismatch is to plant it **in a repo** — never this one. Each band copies the five source
trees the generator reads (`scripts agents commands hooks templates`) plus the tracked `opencode.json`
into `mkdtemp`, regenerates, and **asserts the scratch repo is GREEN before anything is planted**. One
scratch repo serves every leg via an exact snapshot/restore of the volatile surface
(`opencode.json`, `.opencode/`, `templates/opencode/plugins/`), so no leg inherits another's repair.
Cost: ~1s, 5.3 MB, cleaned up in `finally`.

Two traps the brief named, and what was done about them:

- **Ambient env silently changing the subject.** The two `KAOLA_OPENCODE_*_MODEL` pins are **scrubbed
  from the child environment**: they change what `renderOpencodeJson` emits, so a developer with one
  exported would find the fixture's config stale before anything was planted. Verified: with
  `KAOLA_OPENCODE_STANDARD_MODEL=anthropic/claude-sonnet-4-5` exported, the band's verdict is
  byte-identical (7 failures, same assertions). No suite fixture builder is reused.
- **Vacuous assertions.** Each scenario asserts the planted tree is red **and** that `--check` reported
  *exactly* the planted set, so an unparseable mismatch list reds loudly instead of comparing empty to
  empty. A suite-level control asserts at least one advised command was parsed anywhere, so the
  no-op-advice and no-blanket-`--write-config` checks can never pass by having read nothing. Both are
  mutation-proven below.

**D0 is untouched.** The band is appended at the end of the file; D0's drift check still runs first,
still ahead of the self-provision `--write`, and still `process.exit(1)`s on drift. The band writes
only under `os.tmpdir()`.

---

## Failing baseline — verbatim

```
$ cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944
$ node scripts/test-opencode-edition.js
$ echo $?
1
```

The seven failures (exit code captured on its own line, not off a pipeline tail):

```
FAIL: A30[stale user-owned opencode.json]: after running what --check advised, the only mismatches
left are the ones NO flag of this script can clear. Advised [["--forge=github","--write"]]; left
behind ["opencode.json"], irreducible []. A reader who does exactly what the last line of the report
tells them must not be left holding a mismatch a different flag would have fixed

FAIL: A30[stale user-owned opencode.json]: the advised command ["--forge=github","--write"] clears at
least one of the mismatches reported alongside it — run on its own it left ["opencode.json"] of
["opencode.json"] standing. Naming a command that changes nothing is worse than naming none: it exits
0 and reports the tree already in sync

FAIL: A30[unregistered canonical plugin]: the advised command ["--forge=github","--write"] clears at
least one of the mismatches reported alongside it — run on its own it left
["templates/opencode/plugins/zzz-a30-unregistered.js"] of
["templates/opencode/plugins/zzz-a30-unregistered.js"] standing. Naming a command that changes
nothing is worse than naming none: it exits 0 and reports the tree already in sync

FAIL: A30[unregistered canonical plugin]: NO flag of this script clears anything in this set, so
--check offers no runnable invocation of it at all — it offered [["--forge=github","--write"]]. The
per-mismatch reason already names the real remedy; a command line printed under it is read as the fix
and exits 0 having done nothing

FAIL: A30[stale user-owned opencode.json + stale generated agent]: after running what --check
advised, the only mismatches left are the ones NO flag of this script can clear. Advised
[["--forge=github","--write"]]; left behind ["opencode.json"], irreducible []. …

FAIL: A30[stale user-owned opencode.json + unregistered canonical plugin]: after running what --check
advised, the only mismatches left are the ones NO flag of this script can clear. Advised
[["--forge=github","--write"]]; left behind
["opencode.json","templates/opencode/plugins/zzz-a30-unregistered.js"], irreducible
["templates/opencode/plugins/zzz-a30-unregistered.js"]. …

FAIL: A30[stale user-owned opencode.json + unregistered canonical plugin]: the advised command
["--forge=github","--write"] clears at least one of the mismatches reported alongside it — run on its
own it left ["opencode.json","templates/opencode/plugins/zzz-a30-unregistered.js"] of
["opencode.json","templates/opencode/plugins/zzz-a30-unregistered.js"] standing. …

opencode-edition test FAILED: 7 failure(s), 550 passed. [drift-check: NO tree verified; 3 ABSENT, not
checked (.opencode, .opencode-gitlab, .opencode-gitea)]
```

The non-A30 assertions are unchanged by this diff — measured, not assumed: the suite at `d2ab06c2`
(run from `git show HEAD:scripts/test-opencode-edition.js`) passes **516 assertions, exit 0**, and
with A30 it is 550 passed + 7 failed, i.e. A30 contributes 41 assertions and nothing else moved.
Scenario 1 — the write-clearable class alone — is **green on
baseline and must stay green**: it is what stops the repair being made by regressing the 12 classes
today's line is right about.

---

## Mutation proofs

Method: a scratch **mirror** of the worktree per mutation (`fs.cpSync` of the five source trees +
`opencode.json` into the scratchpad), one patch applied to the mirror's `sync-opencode-edition.js`,
and the band run with `REPO` resolving to that mirror. **No `git checkout --`, and no production file
in the repo was written.** The control implementations below exist only in
`/private/tmp/.../scratchpad/t941/` and are proof artifacts, not proposed fixes.

Driver: `scratchpad/t941/mutate.js` · extracted band: `scratchpad/t941/band.js`
(`BAND_SYNC=<path> node band.js`).

| mutation | band | which assertion caught it |
|---|---|---|
| **`fixed`** — footer derived from the classes present (`--write-config` if `opencode.json` is in the set, else `--write` if anything write-clearable is, plus a no-flag line for the unregistered plugin) | **39 passed, 0 failed, exit 0** | — **this is the discrimination proof: baseline red → correct implementation green** |
| `blanket_write_config` — swap the footer to the strictly stronger flag | 37 passed, **4 failed** | the never-blanket check (scenarios 1 and 3) + no-no-op + no-invocation-when-no-flag-helps |
| `vague_prose_footer` — drop the command, describe it in prose | 25 passed, **9 failed** | sufficiency on all four flag-helped sets, the "still hands the reader a runnable command" check on each, and the suite-level "at least one advised command was parsed" control |
| `fixed_unparseable_list` — correct footer, but the per-mismatch line shape changed | 32 passed, **7 failed** | the "reports EXACTLY the planted mismatches" control, on every scenario — it reds instead of comparing empty to empty |
| `fixed_writeconfig_inert` — correct footer, but `--write-config` stops rewriting the config | 34 passed, **5 failed** | the maximal-flag control (`irreducible` measured ≠ expected) |
| `fixed_reason_drops_allowlist` — correct footer, but the C9 reason no longer names `PLUGIN_SCRIPTS` | 37 passed, **2 failed** | the reason-line pin, on both sets containing C9 |
| `fixed_fixture_missing_tree` — correct footer, fixture built with `hooks/` deleted | 21 passed, **20 failed** | the source-tree presence control names the cause **first** |

Every assertion that is green on baseline is proven armed by a mutation: the never-blanket check by
`blanket_write_config`, the runnable-command check by `vague_prose_footer`, the reason-line pin by
`fixed_reason_drops_allowlist`, the parse control by `fixed_unparseable_list`, the maximal-flag
control by `fixed_writeconfig_inert`, the fixture control by `fixed_fixture_missing_tree`.

### One defect the mutations found in the band itself, and its repair

`fixed_fixture_missing_tree` originally **crashed the suite** with an uncaught `ENOENT` out of
`cpSync` — a stack trace where a named cause belongs, and this band runs last, so it took the suite's
own summary line with it. Repaired in the band: the source trees are checked for presence before the
copy is made, the generated-agent probe tolerates an empty tree, and the rogue-plugin plant creates
its directory. Re-measured: **20 named failures, no crash**, with the cause first:

```
FAIL: A30: every source tree this fixture copies is present in the repo — ["hooks"] is not, so the
scratch repo below is missing an input the generator reads and every scenario would be reporting on a
tree of absent files rather than on planted drift
```

This is the same defect class the file's own A0 comment warns about, found by mutating rather than by
reading.

### K12 (kimi) — green on baseline, armed

Driver: `scratchpad/t941/kmutate.js`. Baseline: **9 passed, 0 failed, exit 0**.

| mutation | band | caught by |
|---|---|---|
| `sympathy_write_config` — the opencode repair copied across, naming a flag kimi does not have | 7 passed, **2 failed** | the no-`--write-config` pin + the outcome check |
| `sympathy_prose` — drop the command, describe it in prose | 6 passed, **2 failed** | the runnable-command check + the outcome check |
| `write_stops_pruning` — footer unchanged, but `--write` stops pruning retired skills | 8 passed, **1 failed** | the outcome check: what it advised no longer clears what it reported |

So K12 demands **no change** to `sync-kimi-edition.js` and reds if someone changes its footer in
sympathy with the opencode repair, or if `--write` stops being sufficient there.

---

## Other verification

- `node scripts/test-spawn-classification.js` → **exit 0**. Both new spawn sites carry
  `// spawn-class: environment` on the line above the call; neither suite has a CEILINGS row, so an
  unclassified site would have reded.
- `node scripts/test-kimi-edition.js` → **exit 0** (516 assertions).
- `git status --porcelain` in the worktree: only the two `scripts/test-*.js` files modified. The main
  checkout is unchanged apart from this run folder. No `.opencode*` or `.kimi*` tree in either
  checkout was planted into; every plant went to `os.tmpdir()`.
- Runtime cost of A30 inside the suite: the whole opencode suite runs in **9.0s** wall (A30 ≈ 1s).

## For the implementer

Read A30's header comment first — it states the property and why it is an outcome check. The band is
`scripts/test-opencode-edition.js:2536-2816`. To iterate without the rest of the suite:

```
sed -n '2535,2816p' scripts/test-opencode-edition.js   # the band, extractable as in scratchpad/t941/band.js
```

The reference implementation used as the `fixed` mutation is in `scratchpad/t941/mutate.js`
(`FOOTER_FIXED`). It is a proof that the band is satisfiable, **not a design**: it derives
"needs config flag" from `m.rel === 'opencode.json'` and "no flag helps" from a
`templates/opencode/plugins/` prefix, both of which are the cheapest predicates that happen to work
today, not necessarily the ones the repair should ship.
