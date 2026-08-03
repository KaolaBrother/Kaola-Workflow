# #927 — implementer B: `install-opencode.sh`

**Artifact**: `install-opencode.sh` (worktree `.kw/worktrees/issue-927`, branch `workflow/issue-927`).
One file changed, `+166/−20`. No test file touched. No file belonging to implementer A touched.

**Opt-in flag chosen: `--adopt-config`.**

**Verification tier**: `tests-green`.

---

## 1. What changed

### 1a. Effort-tier sidecar deployment (`copy_tree`, `uninstall_edition`)

The sidecar is generated to a **temp file** and moved into `"$layout_root/kaola-workflow/effort-tiers.json"`.
One relative path covers both scopes because the layout root already differs by scope:

| scope | deployed to | matches A's `deployedPath()` candidate |
|---|---|---|
| global (`--global`) | `<OPENCODE_CONFIG_DIR>/kaola-workflow/effort-tiers.json` | `SELF_DIR/../<dir>/<name>` (#3) **and** `OPENCODE_CONFIG_DIR/<dir>/<name>` (#4) |
| project (`--target`/`$PWD`) | `<project>/.opencode/kaola-workflow/effort-tiers.json` | `root/.opencode/<dir>/<name>` (#1) |

Read off A's shipped `templates/opencode/plugins/kaola-workflow-hooks.js:66-82` (`deployedPath(root, dir, name)`),
not guessed. This closes test-authoring §4.4 (project sidecar location was unspecified): the project
sidecar lands under `.opencode/`, **not** under `<project>/kaola-workflow/` (candidate #2) — that path
is the workflow *state* dir and a generated artifact does not belong in it. Candidate #1 wins first
anyway, so #2 is never reached.

Placement decisions, each with the failure it prevents:

- **Written in `copy_tree`, beside the plugin — NOT in `install_support_scripts`.** This closes
  test-authoring §4.5: `--no-scripts` would otherwise deploy a plugin with no tier map and silently
  un-tier every role. Measured: a `--target … --no-scripts` install deploys the sidecar (§3, PROJECT case).
- **Written BEFORE the self-dev guard**, like the plugin `cp` it sits next to, so a self-dev install
  gets a live sidecar. `.opencode/` is gitignored (`.gitignore:5`), so this leaves no repo noise.
- **Temp file + `[[ -s … ]]`, not the exit code.** Measured, and it would have shipped a false claim:
  today's `sync-opencode-edition.js` **prints usage and still exits 0** for a mode it does not know.
  My first draft gated on `$?` and printed `Installed effort-tier map → …` for a file that was never
  written. A guard reads what ships.
- A failed regeneration **does not delete** a map a previous install left working (the temp file is
  discarded; the deployed file is untouched) and is a warning, not a fatal error — the plugin treats
  an absent sidecar as a no-op and the seeded `opencode.json` still carries each role's effort.
- The generator's own stdout/stderr is suppressed. This is not cosmetic: its `usage()` text contains
  six `--flag` tokens, and A27 harvests `--flag` tokens from the install output and tries only the
  first six — leaked usage text would have crowded out `--adopt-config` and produced a spurious red.
- Uninstall removes the sidecar and reclaims its dir. At global scope the dir is shared with the
  deployed `scripts/`, so that `rmdir` no-ops and the existing support-scripts block reclaims it.

### 1b. Config drift detection (`report_config_drift`, `seed_config`)

`seed_config` still preserves an existing `opencode.json` by default and now reports how it differs.
Comparison is by the **role-name set of the `agent` block** in both directions, printed by name.
Nothing is written; regenerating is `--adopt-config`, which replaces the file with
`--write-config-to … --adapt` output (byte-identical to `renderOpencodeJson({inheritModel})`).

The flag is spelled **once**, in `ADOPT_CONFIG_FLAG`, read by both the argument parser and the drift
report, so the flag the report names can never be one the parser rejects.

Two edge cases the test author flagged, both handled and both separately proven:

- **§4.6 — no detectable inherited model.** The generator falls through to the neutral template,
  which carries no `agent` block, so every role in the user's file would read as "extra". The check
  requires a **non-empty generated role set** before it says anything. Positive control below.
- **Negative control.** A config the generator itself just wrote reports nothing. Mutation M5 proves
  that assertion is armed against an over-firing check.

Robustness (none of it asserted by the suite, all of it measured in §4): JSONC parsing via a
**string-aware** comment stripper (a line-anchored or naive `//` strip eats the `https://` inside
`$schema`); unparseable config → silent, exit 0; `agent` present but an array → treated as no roles;
the whole node call is `|| true` so it can never fail an install.

### 1c. Retired prose (as instructed)

Removed the two `⚠ Switched your opencode model? … regenerate the variant definitions` echo lines —
the model-switch staleness class Layer 2 retires. The header "Models:" paragraph and the `seed_config`
comment no longer claim the *variant* mechanism. The `--adopt-config` drift reporting added here is a
**different and still-real** staleness and was not removed.

---

## 2. Suites — real exit codes (`$?` read directly; no piped `| tail` anywhere)

Command: `node scripts/<suite>` from the worktree root.

| suite | before (baseline `c3938174` + test author's red) | after |
|---|---|---|
| `scripts/test-opencode-edition.js` | **exit 1** — 232 failure(s), 563 passed | **exit 0** — passed (811 assertions) |
| `scripts/test-install-adaptive-config.js` | **exit 0** — passed | **exit 0** — passed |
| `scripts/test-install-all.js` | **exit 0** — 131 assertions | **exit 0** — 131 assertions |
| `scripts/test-kimi-edition.js` | **exit 0** — 507 assertions | **exit 0** — 507 assertions |

Baseline failures attributable to **my** file were 11 of 232: 4 × `A26-sidecar`, 7 × `A27`.
The other 221 (166 `A12-options`, 47 `A26-hook`, 8 `A26-degraded`) were A's surface.
Both blocks are green now, and the full suite is green with A's work landed.

Also checked without a pipe: `--help` → exit 0 (lists `--adopt-config` and the CONFIG DRIFT section);
an unknown flag → exit 2 (unchanged).

---

## 3. Deployment proof (scratch mirror; the shared worktree was never reverted)

Run before A's generator flag landed, against an `rsync` mirror of the worktree in the scratchpad
with a **stub** `--write-effort-tiers-to` added to the mirror's copy only. All four exit 0:

```
GLOBAL install            → Installed effort-tier map → <cfg>/kaola-workflow/effort-tiers.json   (0644)
                            <cfg>/kaola-workflow/scripts/ still present (they coexist)
GLOBAL --uninstall        → sidecar gone; <cfg>/kaola-workflow/ reclaimed
PROJECT + --no-scripts    → Installed effort-tier map → <proj>/.opencode/kaola-workflow/effort-tiers.json
                            "Support scripts skipped (--no-scripts)."  ← §4.5 hazard closed
PROJECT --uninstall       → <proj>/.opencode removed entirely, no leftovers
```

---

## 4. Edge cases measured against the live worktree installer (all exit 0)

| case | result |
|---|---|
| E1 no detectable inherited model (empty `HOME`, no env) | **silent** — no drift report, config unchanged |
| E2 malformed JSON config | silent, no crash, config unchanged |
| E3 config with no `agent` block at all | 14 roles reported missing, config unchanged |
| E4 JSONC with a header comment **and** a trailing `// roles` comment | parsed; 1 extra + 13 missing; `$schema`'s `https://` not eaten |
| E5 unrecognized provider (`acme/unknown-model`) | real baseline, drift reported |
| E6 `--adopt-config` | config **rewritten**, exit 0 |
| E7 `agent` is an array (hostile shape) | treated as no roles, no crash |

---

## 5. Mutation proof — five mutations, one positive control

All run in a scratch mirror of the worktree (`rsync`, `.git`/`kaola-workflow/` excluded). The shared
worktree file was never reverted, stashed, or checked out; after every mutation the mirror was
restored from a pre-mutation copy and verified `cmp`-identical to the worktree file.

**Positive control (unmutated mirror)**: `exit 0`, 811 assertions — the harness can be green, so a
red below is the mutation and not the environment.

| # | mutation | result |
|---|---|---|
| M1 | drift check **cannot see a missing role** (`const missing = []`) | **exit 1 — 3 red**, exactly the three MISSING-role assertions. The EXTRA-role half stayed green → the two directions are independently covered, not one assertion firing twice. |
| M2 | `report_config_drift` returns before printing anything | **exit 1 — 7 red**: 3 extra + 3 missing + "the report names an explicit opt-in flag" |
| M3 | sidecar deploy block disabled in `copy_tree` | **exit 1 — 21 red**: 4 `A26-sidecar` + 17 `A26-hook`. My one deploy block is what makes A's per-call Layer-2 resolution reachable at all — the §4.5 hazard, measured. |
| M4 | `--adopt-config` accepted by the parser but **inert** (report still names it) | **exit 1 — 1 red**: "the flag the drift report names actually regenerates the config". Separates *named* from *works* — M2 could not, because an empty report skips the adoption block entirely. |
| M5 | check **over-fires** (reports roles when nothing drifted) | **exit 1 — 1 red**: `A27-neg`. The negative control is armed. |

**Positive control for the empty-baseline guard (§4.6)**: with `if (emitted.length === 0) process.exit(0)`
removed, E1 (no detectable inherited model) prints
`1 role(s) it carries that are no longer shipped: contractor` — the exact false alarm the guard
suppresses. Verifying a *suppression* needs a control that shows the thing being suppressed.

---

## 6. Failures that were A's, not mine

- **Baseline**: 221 of 232 reds (`A12-options`, `A26-hook`, `A26-degraded`) — A's surface throughout.
- **Mid-run halt**: the suite refused to run with
  `D0[github]: .opencode is present on disk and has DRIFTED from canonical` — A's in-flight
  `templates/opencode/plugins/kaola-workflow-hooks.js` edit had staled the generated trees. Resolved
  with `node scripts/sync-opencode-edition.js --forge=<f> --write` for all three forges. That writes
  only the **gitignored** generated trees from canonical (it seeds `opencode.json` only if absent, and
  the repo's is present), so no source file of A's was modified. Not a defect — a race with A saving.
- **Transient 2 reds**, seen once: `A26-sidecar: the sidecar's top set === topTierRoles()` — got
  `synthesizer` in `second`. Invoking the generator directly straight afterwards produced the correct
  set, and the next full run was green. A mid-edit save by A, not a real disagreement. **Flagging it
  anyway** so it can be re-checked once A's file settles.
- I did not fix, edit, or work around anything in A's three files.

---

## 7. Open concerns / not done

1. **Docs and CHANGELOG are outstanding** — a new installer flag is user-visible, and my brief fixed
   my file set at exactly one file, so I did not touch them. The surfaces that list installer flags
   and now under-describe the install: `README.md:364-365`, `docs/opencode-edition.md:359,376-377`,
   and `CHANGELOG.md` `[Unreleased]`. `docs/opencode-edition.md` also documents the deployed layout,
   which now includes `kaola-workflow/effort-tiers.json`.
2. **`--adopt-config` rewrites the WHOLE file, not just the `agent` block.** That is what
   `--write-config-to` does, and the test pins byte-equality with `renderOpencodeJson(…)`, so a
   merge-preserving adoption is not available without changing the generator (A's file). The report
   says so in as many words ("that rewrites the WHOLE file, so save any hand edits first"). If the
   owner wants a surgical merge instead, that is a design decision, not a defect I should take
   unilaterally.
3. **A config with no `agent` block at all reports every role as missing** (E3). I judged this true
   and actionable rather than noisy — such a config genuinely has no effort tiers — but it means a
   plain user `opencode.json` (`{"model": "…"}`) will report 14 missing roles on every install.
   Untested by the suite; flagging the judgement rather than hiding it.
4. **The sidecar/plugin path match is a source read, not an end-to-end measurement made by me.** I
   verified my deploy paths equal candidates #1/#3/#4 of A's `deployedPath()` and proved the files
   land there; the *runtime* resolution is measured by A26-hook/A26-degraded, which are green.
5. **Test-authoring §4.1/§4.2/§4.3 are A's calls**, not mine, and I did not act on them.

---

# Follow-up (same session): disclose what adopting costs

**Ask**: the drift report named `--adopt-config` without saying what running it destroys. Make it
disclose that adoption regenerates rather than merges (so model pins go), and — if cheap — where the
old content can be recovered from. Same file only: `install-opencode.sh`.

**Decision: I keep a backup.** It is two lines, and it converts an irreversible action into a
reversible one, which is the difference between an opt-in and a trap. The report names it.

## What changed (4 edits, all in `install-opencode.sh`)

1. **The two report lines now disclose the cost and the recovery**, in the same two lines as before:

   ```
         Nothing was changed. Re-run with --adopt-config to adopt it: that REPLACES this
         file rather than merging (hand edits and model pins go), after copying it to opencode.json.<timestamp>.bak.
   ```

2. **`config_backup_path()`** — new 5-line helper, the single spelling of the backup name. The drift
   report renders its shape (`<basename>.<timestamp>.bak`) and `seed_config` writes exactly it, so
   the recovery path the user is promised is the one that exists.

3. **`seed_config` copies before replacing**, and prints the actual path:
   `Your previous config, hand edits and model pins included → <path>`. A backup that cannot be
   written **fails loudly and does not replace the file** — this is the one place here that destroys
   something, and that is the project's stated exception to "nothing refuses".

4. **`usage()` CONFIG DRIFT** and the header "Models:" paragraph now say the same thing as the
   runtime output — replaces rather than merges, keeps a timestamped `.bak`.

## A defect my own measurement caught, before it shipped

My first cut named the backup `<config>.<timestamp>.bak` with second granularity, and the comment
asserted that this stops a second adoption overwriting the first backup. **It does not.** Measured:

```
adopt #1 → opencode.json.20260803144747.bak   (the user's original)
adopt #2 → opencode.json.20260803144747.bak   (SAME name — the generated config)
result   : one file on disk; the user's model pin GONE despite a "backup" existing
```

Both installs landed inside one clock second. That is the disclosed promise being breakable — the
trap re-created one level down, with a reassuring filename on it. `config_backup_path()` now returns
only a path that does not already exist (`-1`, `-2`, … on collision). Re-measured with three
consecutive adoptions inside the same second:

```
adopt #1 → opencode.json.20260803144855.bak     ← still byte-identical to the user's ORIGINAL
adopt #2 → opencode.json.20260803144855-1.bak
adopt #3 → opencode.json.20260803144855-2.bak
```

(Note for anyone re-running this: `ls | head -1` picks the `-1` file, because `-` sorts before `.`.
That fooled my first check into reporting the original lost. The installer prints the actual path.)

The comment in the file now states the measured fact rather than the assumption that was wrong.

## Suites — real exit codes (`$?` read directly, no piped `| tail`)

| suite | result |
|---|---|
| `scripts/test-opencode-edition.js` | **exit 0** — passed (817 assertions) |
| `scripts/test-install-adaptive-config.js` | **exit 0** — passed |
| `scripts/test-install-all.js` | **exit 0** — 131 assertions |
| `scripts/test-kimi-edition.js` | **exit 0** — 507 assertions |

No existing assertion matched the old report wording, so **nothing was broken and nothing was
weakened to stay green**. A27 harvests `--flag` tokens from the output and the new text still yields
exactly `--adopt-config` (plus the pre-filtered `--no-scripts`).

**One red was A's, not mine**, exactly as forewarned: the first run halted at
`D0[github]: .opencode … has DRIFTED from canonical` — A's badge-heading rename had staled the
generated trees. Cleared with `sync-opencode-edition.js --forge=<f> --write` ×3 (gitignored trees
only, no source file of A's touched); the suite then went green with zero failures.

## Arming re-checked, and one honest gap

Fresh scratch mirror, positive control green first (817, exit 0); mirror restored `cmp`-identical
after each mutation. The worktree file was never reverted, stashed, or checked out.

| # | mutation | result |
|---|---|---|
| M4' | `--adopt-config` accepted but inert | **exit 1 — 1 red** (`A27: the flag … actually regenerates the config`). Still armed after the change. |
| M6 | backup `cp` neutered **and** the disclosure sentence deleted | **exit 0 — no failures.** |

**M6 is the gap, stated plainly: the backup and the disclosure text are not covered by any
assertion.** The test author deliberately did not pin the report's wording, and the backup did not
exist when the suite was written. So my evidence for both is the direct observation above, not a
green suite — and a future edit could silently remove either without turning anything red. If that
should be pinned, it is the test author's call and their artifact; I did not add an assertion.

## Open (unchanged from above unless noted)

- **Docs now lag the installer by one fact.** The doc agent landed `--adopt-config` documentation
  while I was working, written against the pre-backup behaviour: `docs/opencode-edition.md:401-405`
  says "so save any hand edits first" with no mention that a backup is kept, and `README.md:369` and
  `CHANGELOG.md:7` describe the whole-file replace the same way. All three are accurate about the
  replace and silent about the recovery path. Not my file — flagging for whoever owns that seam.
- Concern 2 from the first report is **narrowed, not closed**: adoption still replaces rather than
  merges (that is what `--write-config-to` does, and A27 pins byte-equality with
  `renderOpencodeJson(…)`), but it is now disclosed in advance and reversible. Whether adoption
  should *merge* remains a design decision for the owner, not one for me.

---

# Review round: two defects fixed (`install-opencode.sh` only)

## Defect 1 — HIGH — adoption could replace working tiers with none, and call it success

**Reproduced first, exactly as reported.** Hermetic `HOME`, no `KAOLA_OPENCODE_INHERIT_MODEL`, a
global config carrying `"model": "openai/gpt-5"`, then `--global --yes --adopt-config` twice:

```
start          : 1 role,  top-level "model" present
adopt run 1    : exit 0   roles now 14   "Seeded … — effort tiers adapted to your inherited model (contract-keyed)."
adopt run 2    : exit 0   roles now  0   "Seeded … — effort tiers adapted to your inherited model (contract-keyed)."
```

The adaptive render pins no top-level `"model"` by design, so run 2's `detectInheritModel()` found
nothing, `renderOpencodeJson` fell through to `renderNeutralConfig`, and my whole-file replace landed
a config with no `agent` block — printing the adapted-tiers line over the top of it.

**Fix.** `seed_config` no longer renders straight onto the user's file. It renders to a **temp file**,
asks `config_probe roles` what would actually land, and only then decides — the same
generate-to-temp-then-inspect shape the sidecar deploy already uses in this file:

- **would land 0 roles while the existing file has some → refuse.** Nothing is written, no backup is
  taken, `exit 1`, and the message says how to fix it
  (`Set KAOLA_OPENCODE_INHERIT_MODEL=<provider>/<model> and re-run. Nothing was changed.`).
  The condition is *would remove roles*, not merely *would be neutral*: replacing a 0-role config
  with the neutral template loses nothing and is still allowed.
- **the success message is chosen from what landed**, so it can no longer describe an outcome that
  did not happen. A neutral seed now says so in as many words and tells the user how to get tiers.

The refusal is reachable only under the explicit opt-in — the default install path still never
refuses. This is the "an operation that would **destroy** something fails loudly" exception, and it
matches the backup-failure refusal already in this function.

**Re-measured, same sequence:**

```
adopt run 1 : exit 0   roles 14   "…adapted to your inherited model (14 roles, contract-keyed)."
adopt run 2 : exit 1   roles 14   "Refusing to replace them with none. … Nothing was changed."
adopt run 3 : exit 1   roles 14   (idempotent; 1 backup on disk, from run 1 only)
```

Adjacent cases measured: the **one-step** variant (global config with roles but no top-level
`"model"`, adopted) → `exit 1`, 2 roles kept; a **fresh seed with no model anywhere** → `exit 0`,
neutral template written with the honest message.

## Defect 2 — MEDIUM — detector blind to `OPENCODE_CONFIG_DIR`

**Reproduced**: the same drifted config reported 3 extra + 13 missing under `$HOME/.config/opencode`,
and produced **no drift report at all** under `OPENCODE_CONFIG_DIR`.

**Fix.** The installer now resolves the inherited model from the config dir **it actually deploys
to** (`${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}/opencode.json`) and hands it to the renderer
through `KAOLA_OPENCODE_INHERIT_MODEL` — the variable `detectInheritModel()` already honours FIRST.
One export fixes the detector *and* the writer, because both go through that same function, and A's
file is untouched. An explicit env value still wins; when nothing is found the renderer's own lookup
still runs, so this only ever **adds** a place to look.

**A trap I found while writing it, and avoided.** `detectInheritModel()` matches
`/"model"\s*:\s*"([^"]+)"/` against **raw text**, and the neutral template contains commented-out
example lines — so on a neutral config it returns the literal string
`<inherits your opencode default>` as if it were a real pin (measured). My resolution therefore reads
the model from **parsed JSON**, where a commented-out example cannot be mistaken for a pin. Harmless
downstream today (that string has no `/`, so it parses to nothing and still renders neutral), but it
is why I did not simply copy the regex. **Not fixed — it is A's function.**

**Re-measured:** drift now reported under `$HOME` **and** under `OPENCODE_CONFIG_DIR`. Chained with
fix 1: adopting under `OPENCODE_CONFIG_DIR` with a real model now produces 14 tiered roles where it
previously wrote the neutral template.

## Also: the dead `mapTier` reference

Censused repo-wide (quoted globs — an unquoted `--include=*.js` is glob-expanded by this shell and
silently matches nothing): `mapTier` is **defined and exported in the schema but called from
nowhere**; every other live reference is prose. My `seed_config` comment named it as the mechanism.
It now states the **result** — *which knob carries the effort follows your provider's API contract,
not its brand* — and names no symbol at all. `grep -n "mapTier" install-opencode.sh` → no matches.

## One refactor, so this is one rule and not three

The three questions this installer asks of an `opencode.json` — *how many roles*, *what model*, *what
drifted* — are one parse, so they are now one function, `config_probe <mode> <file>`, with the JSONC
parser written once. Without it, fix 1 and fix 2 would each have added another copy of it, and a
third answer to "what counts as a role" is how these two defects arise in the first place.

## Suites — real exit codes from `$?`

| suite | result |
|---|---|
| `scripts/test-opencode-edition.js` | **exit 1** — 3 failure(s), 835 passed — **all three are A's**, see below |
| `scripts/test-install-adaptive-config.js` | **exit 0** |
| `scripts/test-install-all.js` | **exit 0** — 131 assertions |
| `scripts/test-kimi-edition.js` | **exit 0** — 507 assertions |

**The 3 reds are A's, and I proved it rather than asserting it.**
`templates/opencode/plugins/kaola-workflow-hooks.js` has lost `export { hookPath, findRoot };` (only
`export default` remains at `:256`; I read that named export at `:152` earlier in this session).
H1 does `const { hookPath } = await import(...)`, gets `undefined`, and throws.

Isolation experiment: in a scratch mirror I restored **only that one export line**, leaving my
`install-opencode.sh` byte-identical to the worktree — **the suite went fully green, exit 0, 838
assertions, zero failures.** So the reds are entirely that missing export and none of them is mine.
Not fixed, not touched: it is A's file. Whether it is mid-edit or a real regression is for A.

## Mutation proofs

Scratch mirror (`rsync`, `.git`/`kaola-workflow/` excluded, A's export restored so the baseline is
green). No revert command was ever run against the shared worktree; the mirror installer was restored
from a pre-mutation copy after every run and verified `cmp`-identical to the worktree file.

| # | mutation | suite | direct measurement |
|---|---|---|---|
| M1' | drift blinded to MISSING roles | **exit 1 — 3 red** | — |
| M2' | drift report suppressed | **exit 1 — 10 red** | — |
| N1 | **defect-1 guard made unreachable** | **exit 0 — 0 failures** | two consecutive adopts: **14 → 0** (the wipe returns). With the guard: **14 → 14** |
| N2 | **defect-2 resolution deleted** | **exit 0 — 0 failures** | drift under `OPENCODE_CONFIG_DIR`: **NO**. With it: **YES** |

M1'/M2' confirm the drift guards survived the `config_probe` refactor still armed.

**N1 and N2 are the honest part: neither new fix is covered by any assertion.** A27 always sets
`KAOLA_OPENCODE_INHERIT_MODEL`, so the guard never fires and the config-dir lookup is never taken,
and mutating either leaves the suite green. Their proof is the paired direct measurement above —
remove the fix and the reported defect comes straight back, restore it and it does not. Same standing
as the backup and the disclosure text (M6): real, measured, unpinned. Pinning them is the test
author's call and their artifact; **I added no assertion.**

## Not done / open

- **The third finding is untouched, as instructed.** Nothing here decides whether calling a
  first-install comparison "drift" is right, or whether recommending a whole-file replace over a
  config carrying `model` + `mcp` keys is right. Both fixes are orthogonal to that ruling: fix 1 only
  ever makes adoption *less* destructive, and fix 2 only makes the report *appear* where it already
  should have. If the ruling changes what the report says or when it fires, neither fix needs redoing.
- **`detectInheritModel()`'s raw-text match reads commented-out examples as real pins.** Measured,
  currently harmless, A's file — reported, not fixed.
- Docs still lag: `docs/opencode-edition.md:401-405`, `README.md:369`, `CHANGELOG.md:7` describe the
  whole-file replace without the backup, and none of them mentions the new refusal or that a
  no-model install seeds the neutral template. Not my file.

---

# Pivot round: per-role effort tiering removed from `install-opencode.sh`

Read `pivot-brief.md` and `deletion-blast-radius.md` first, and verified their claims about my file
against the file rather than trusting either.

## Deleted

| what | why |
|---|---|
| `EFFORT_TIERS_DIR_NAME` / `EFFORT_TIERS_NAME` | the sidecar's path constants |
| the sidecar deploy block in `copy_tree` (~30 lines) | the map it wrote has no reader once the `chat.params` hook goes |
| the sidecar removal in `uninstall_edition` | nothing left to remove |
| `--adapt` on the render invocation | A is removing the flag; `--write-config-to` alone renders the surviving template |
| **the tier-protection refusal** | measured: post-deletion the render always carries 0 roles, so it fired for every user with an agent block. It guarded tiers and went with them. **Not replaced with another refusal** — the surviving destructive-write protection is the backup. |
| the two tier success/failure message branches | one outcome now, so one message |
| `config_probe`'s `roles` and `model` modes | their only callers were the two items above |
| **the `KAOLA_OPENCODE_INHERIT_MODEL` resolution block** | see the re-examination below |

Residue check on my file — `effort-tiers`, `EFFORT_TIERS`, `--write-effort-tiers-to`, `--adapt`,
`mapTier`, `CONTRACT_EFFORT`, `contractForProvider`, `detectInheritModel`, `INHERIT_MODEL`: **0 hits
each**.

## The re-examination you asked for, not an assumption

**The role-less-config guard** — its two halves separate cleanly. The *refusal* is deleted (above).
The *render-to-temp-then-move* survives and is kept, but restated for what it now is: not a tier
check, just "a render that fails partway must not leave a truncated config behind". The role counting
that fed the refusal is gone with it.

**The `OPENCODE_CONFIG_DIR` resolution** — I measured whether it still has a subject rather than
carrying it forward. It exists to hand an inherited model to the renderer; post-deletion nothing in
the install path reads one. `renderNeutralConfig` reads only `KAOLA_OPENCODE_STANDARD_MODEL` /
`_REASONING_MODEL` — never `inheritModel` (read from the source). Direct measurement, two installs:

```
KAOLA_OPENCODE_INHERIT_MODEL unset  vs  = zhipuai-coding-plan/glm-5.2
  seeded opencode.json : BYTE-IDENTICAL
  install output       : identical
```

So the block was inert and I deleted it. **This is a listed "Keep" that I cut on measurement — say
the word and it is one block to restore.** Note the variable itself keeps its consumer outside this
file (`resolveRuntime()` in `kaola-workflow-claim.js`); my export was process-local to the installer
and never reached it, so nothing that reads it is affected.

## Reframed: drift now reports what the config still carries

The mirror image, with **no baseline from the generator** — which is what makes it survive. Subject:
an `agent.<role>` entry carrying `variant` or `options` (the only two per-role shapes this edition
ever wrote). An entry that only pins a `model` is the user's own supported choice and is **not**
counted or named — that is the over-fire boundary.

Measured, real installer, one fixture holding all three cases (`planner` with `options`, `contractor`
with `variant`, `issue-scout` with `variant`, `my-own-agent` with only a `model`):

| # | case | result |
|---|---|---|
| P1 | stale config | exit 0, **config unchanged**, names `contractor, issue-scout, planner` — and **not** `my-own-agent` |
| P2 | **the deleted blocker**: `--adopt-config` over that same config | **exit 0**, rewritten, backup taken (was exit 1, `Refusing to replace them with none`) |
| P3 | negative control — entries pin only `model` | **silent** |
| P4 | negative control — no `agent` block | **silent** |
| P5 | fresh seed | exit 0, honest message: *nothing is pinned per role; a subagent runs the model and reasoning effort of the session that dispatched it* |
| R2 | negative control — a config the generator itself just wrote | **silent** |
| R3 | install → uninstall | exit 0/0, `.opencode` fully removed (0 entries), `opencode.json` preserved |

Header prose and the `usage()` CONFIG DRIFT paragraph were rewritten to the same wording, so the
three surfaces agree.

## Suites — real exit codes from `$?`

| suite | result |
|---|---|
| `scripts/test-opencode-edition.js` | **exit 1** — 4 failure(s), 487 passed |
| `scripts/test-kimi-edition.js` | **exit 0** — 507 assertions |
| `scripts/test-install-adaptive-config.js` | **exit 0** |
| `scripts/test-install-all.js` | **exit 0** — 131 assertions |
| `generate-routing-surfaces.js --check` | **exit 0** — 18 surfaces byte-match |
| `validate-script-sync.js` | **exit 0** — 4 kernel copies identical |

**The 4 opencode failures, classified.** None is a defect in my file, and I am not claiming that
loosely — here is what each one is:

- **3 × `A27: … names the MISSING role "<X>" the generator emits`.** They pin the half of the old
  comparison whose subject the pivot removed: the generator emits no role set, so no such name can
  be printed by anything. A test deleted with its mechanism — the test author's artifact.
  **A27's other legs pass against the reframed report**: the EXTRA-role assertions, the
  byte-identical assertion, the opt-in-flag assertion, the adoption assertion and `A27-neg` are all
  green, which is direct evidence the reframe lands correctly on the pins that still have a subject.
- **1 × `S2[kaola-workflow-finalize.md]: the effort block is LOCATABLE under "## Effort is configured,
  not passed"`.** A's badge rework plus the `BADGE_HEADING` literal in the suite — exactly hazard D4
  in the blast radius ("if the badge block is reworded, `981` must move in the same change"). Not my
  file.

Mid-round I also hit a hard **load-time crash** (`TypeError: schema.effortForProvider is not a
function`) when A's anchor deletion landed ahead of the suite's block removals. It cleared on its own
as the test author worked; recorded because it makes the failure count non-comparable across runs
(3 → crash → 3 → 4 while three agents edited).

## Mutation proofs

Scratch mirror (`rsync`, `.git`/`kaola-workflow/` excluded); installer restored from a pre-mutation
copy after each and verified `cmp`-identical to the worktree file. No revert command was ever run
against the shared worktree.

| # | mutation | suite | direct measurement |
|---|---|---|---|
| N3 | stale detection blinded (never finds an entry) | **4 → 11 failures**, incl. **3 A27 EXTRA-role reds** | stale config → **silent** (the finding disappears) |
| N4 | over-fire (`variant`/`options` filter removed) | **4 → 4, unchanged** | a config with only a user `model` pin → **names `mine`** (a false alarm) |

**N3 is a genuine suite-level proof** — better than last round, where both new fixes were uncovered.
**N4 is the honest gap**: over-firing is invisible to the suite, because its negative control uses a
config with no `agent` block. The `variant`/`options` filter is load-bearing and unpinned; the direct
measurement above is its only evidence.

## Told the test author — but I could not send it

I have **no tool for messaging another agent**. I wrote the contract to
`kaola-workflow/issue-927/.cache/drift-feature-shape-for-tdd-guide.md`, addressed to
`aab0cc2d7354ed326`: the subject and its explicit non-subject, the six-row observable contract, the
verbatim output, a request **not** to pin the sentences, what to delete rather than re-base (the
refusal and the inherit-model resolution), and where coverage is missing (the over-fire boundary,
with the fixture that would close it). **It needs relaying — please pass it on.**

## Open

- The badge prose (`## Effort is configured, not passed`) is A's surface; the `BADGE_HEADING` literal
  is the test author's. Both are named in the S2 failure above.
- Docs still describe the sidecar, the tiers and the deploy-layout column
  (`docs/opencode-edition.md`, `README.md:369`, `CHANGELOG.md`, `docs/kimi-edition.md:323`). Not my
  file; the blast radius lists every line.
