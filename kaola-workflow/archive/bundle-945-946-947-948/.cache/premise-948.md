# Premise check — issue #948 (A30 omits the `{WRITE + SOURCE_EDIT}` mixture)

## VERDICT: **QUALIFIED** (substance CONFIRMED; one sentence of the issue is false)

- **CONFIRMED** — `{WRITE + SOURCE_EDIT}` is absent from `A30.SCENARIOS`.
- **CONFIRMED** — today's footer is **correct** for that mixture. Driven by hand: it advises `--write`
  for the clearable part, separately names the source-edit mismatch, and does **not** imply any flag
  fixes the latter. It is a **coverage gap, not a defect.** Nothing flips here.
- **CONFIRMED** — the taxonomy the issue states: a stale generated artifact is `--write`-clearable;
  an unregistered plugin is cleared by no flag of the script.
- **QUALIFIED** — the issue says *"this is the one mixture it does not exercise."* That is **false as
  written**: two of the seven non-empty subsets are absent, not one. The three-way
  `{WRITE + WRITE_CONFIG + SOURCE_EDIT}` is also absent.
  **But the issue's substance survives**: measured against the branching of the footer producer, the
  three-way has a branch profile *identical* to the already-covered `{WRITE_CONFIG + SOURCE_EDIT}`
  scenario, so it adds no coverage. `{WRITE + SOURCE_EDIT}` is the only **branch-distinct** uncovered
  combination. The issue undercounted the subsets while correctly identifying the only one that matters.
- **Additional uncovered branch, out of the issue's scope** — the footer's plural wording
  (`'their reasons name'`, `sync-opencode-edition.js:823`) is unreachable from the A30 fixture, which
  registers a single `SOURCE_EDIT` class. Measured reachable by hand (see §4). Not claimed by #948;
  recorded so nobody re-discovers it.

## Setup

- Commit: `a339e5df` (`chore: archive bundle-940-941-942-943-944 [sink]`), branch `main`.
- Main checkout **not modified**. `git status --porcelain` before and after: only the pre-existing
  untracked `?? kaola-workflow/bundle-945-946-947-948/`.
- Fixtures (both under the scratchpad, both disposable):
  - `…/scratchpad/mirror948/` — hand-driven mirror (`scripts agents commands hooks templates` +
    `opencode.json`), regenerated with `--write`, asserted green before any plant.
  - `…/scratchpad/suiteclone/` — full `git clone --local` of the repo at `a339e5df`, used for the
    suite baseline (see §5 for why the main checkout could not supply one).
- `KAOLA_OPENCODE_STANDARD_MODEL` / `KAOLA_OPENCODE_REASONING_MODEL` were **unset in the shell** and
  additionally scrubbed from every child env (`env -u …` / `delete childEnv.…`). Neither
  `KAOLA_WORKFLOW_OFFLINE` nor any other `KAOLA_*` var was set — verified with `env | grep -i KAOLA`,
  which returned nothing. The fixture builders are **mine, not the suite's**, so no suite-side env
  default was inherited.
- Driver script: `…/scratchpad/drive948.js`; raw log: `…/scratchpad/drive948.out`.

---

## 1. `A30.SCENARIOS` enumerated exactly

`scripts/test-opencode-edition.js:2708-2714`, verbatim:

```js
    const SCENARIOS = [
      ['stale generated agent'],
      ['stale user-owned opencode.json'],
      ['unregistered canonical plugin'],
      ['stale user-owned opencode.json', 'stale generated agent'],
      ['stale user-owned opencode.json', 'unregistered canonical plugin'],
    ];
```

The three classes it draws from (`CLASSES`, `scripts/test-opencode-edition.js:2676-2706`), each with
its declared `clearedBy`:

| id in `CLASSES` | `rel` planted | `clearedBy` | remedy kind |
|---|---|---|---|
| `stale generated agent` | `.opencode/agent/<first>.md` | `write` | `REMEDY.WRITE` |
| `stale user-owned opencode.json` | `opencode.json` | `write-config` | `REMEDY.WRITE_CONFIG` |
| `unregistered canonical plugin` | `templates/opencode/plugins/zzz-a30-unregistered.js` | `none` | `REMEDY.SOURCE_EDIT` |

Coverage over the 7 non-empty subsets of `{WRITE, WRITE_CONFIG, SOURCE_EDIT}`:

| # | mixture | scenario | covered |
|---|---|---|---|
| 1 | `{WRITE}` | `['stale generated agent']` | YES |
| 2 | `{WRITE_CONFIG}` | `['stale user-owned opencode.json']` | YES |
| 3 | `{SOURCE_EDIT}` | `['unregistered canonical plugin']` | YES |
| 4 | `{WRITE_CONFIG + WRITE}` | `['stale user-owned opencode.json', 'stale generated agent']` | YES |
| 5 | `{WRITE_CONFIG + SOURCE_EDIT}` | `['stale user-owned opencode.json', 'unregistered canonical plugin']` | YES |
| 6 | **`{WRITE + SOURCE_EDIT}`** | — | **NO** ← the issue's claim |
| 7 | `{WRITE + WRITE_CONFIG + SOURCE_EDIT}` | — | **NO** ← the issue did not name this |

**Why #7 is not a second gap worth a row.** `remediationLines` branches on only two things: which
flag (if any) is named, and whether the source-edit line is emitted. Profile per scenario:

| mixture | `flag` chosen | source-edit line | branch profile |
|---|---|---|---|
| 1 `{WRITE}` | `--write` | no | A |
| 2 `{WRITE_CONFIG}` | `--write-config` | no | B |
| 3 `{SOURCE_EDIT}` | `''` (none offered) | yes | C |
| 4 `{WC+W}` | `--write-config` | no | B (dup of 2) |
| 5 `{WC+SE}` | `--write-config` | yes | D |
| **6 `{W+SE}`** | **`--write`** | **yes** | **E — uncovered, unique** |
| 7 `{W+WC+SE}` | `--write-config` | yes | D (dup of 5) |

Profile **E** — a `--write` recommendation printed *alongside* a "no flag clears this" line — is the
only combination no current scenario reaches. #7 is a duplicate of #5's profile. The issue picked the
right mixture; it just miscounted the absent subsets.

---

## 2. The production code that produces the footer

**File: `scripts/sync-opencode-edition.js`.**

- **`REMEDY`** — `scripts/sync-opencode-edition.js:790-794`:
  ```js
  const REMEDY = {
    WRITE: 'write',                 // --write regenerates or prunes it
    WRITE_CONFIG: 'write-config',   // only --write-config clears it: --write preserves the user-owned config
    SOURCE_EDIT: 'source-edit',     // no flag of this script clears it; the reason names the edit
  };
  ```
- **`remediationLines(mismatches, forge)`** — `scripts/sync-opencode-edition.js:808-826`. This is the
  footer producer. Body verbatim:
  ```js
  function remediationLines(mismatches, forge) {
    const remedies = new Set(mismatches.map(m => m.remedy));
    const lines = [];
    const flag = remedies.has(REMEDY.WRITE_CONFIG) ? '--write-config'
      : remedies.has(REMEDY.WRITE) ? '--write' : '';
    if (flag) {
      lines.push('Fix: node scripts/sync-opencode-edition.js --forge=' + forge + ' ' + flag);
      if (flag === '--write-config') {
        lines.push('     (--write preserves the user-owned opencode.json and leaves it stale;'
          + ' --write-config rewrites it, discarding any model pins set there.)');
      }
    }
    const sourceEdits = mismatches.filter(m => m.remedy === REMEDY.SOURCE_EDIT).map(m => m.rel);
    if (sourceEdits.length) {
      lines.push('No flag of this script clears ' + sourceEdits.join(', ') + ' — apply the source edit '
        + (sourceEdits.length === 1 ? 'its reason names' : 'their reasons name') + ' above.');
    }
    return lines;
  }
  ```
- **Caller** — `runCheck(forge)`, `scripts/sync-opencode-edition.js:828-917`; the emission block is
  `:911-916` (reasons on `console.error`, then `for (const line of remediationLines(...)) console.error(line)`,
  then `process.exitCode = 1`).

**The 14 classes `runCheck` can report, and what clears each** (every `mismatches.push` site):

| # | line | class / reason | remedy | cleared by |
|---|---|---|---|---|
| 1 | `:837` | `missing generated agent` | `WRITE` | `--write` |
| 2 | `:841` | agent `stale — regenerate` | `WRITE` | `--write` |
| 3 | `:847` | `missing generated command` | `WRITE` | `--write` |
| 4 | `:851` | command `stale — regenerate` | `WRITE` | `--write` |
| 5 | `:856` | `missing hook script copy` | `WRITE` | `--write` |
| 6 | `:859` | `drifted from canonical hooks/` | `WRITE` | `--write` |
| 7 | `:864` | `missing generated plugin` | `WRITE` | `--write` |
| 8 | `:868` | `drifted from canonical templates/opencode/plugins/` | `WRITE` | `--write` |
| 9 | `:879-885` | **`unregistered plugin '<f>' … absent from PLUGIN_SCRIPTS`** | **`SOURCE_EDIT`** | **no flag** |
| 10 | `:892` | retired command surface — prune | `WRITE` | `--write` |
| 11 | `:895` | retired agent surface — prune | `WRITE` | `--write` |
| 12 | `:900` | retired hooks artifact — prune | `WRITE` | `--write` |
| 13 | `:903` | retired plugins artifact — prune | `WRITE` | `--write` |
| 14 | `:909` | **`opencode.json` `stale — regenerate via --write-config`** | **`WRITE_CONFIG`** | **`--write-config` only** |

12 × `WRITE`, 1 × `WRITE_CONFIG`, 1 × `SOURCE_EDIT`. This corroborates the band's own comment that
`--write-config` "clears 13 of the 14 classes" (`test-opencode-edition.js:2571`): the 14th is #9.

**Issue's taxonomy: CONFIRMED.** A stale generated artifact is `--write`-clearable (#2 here, and the
class A30 actually plants). An unregistered plugin (#9) is cleared by **no** flag — the allowlist
`PLUGIN_SCRIPTS` (`scripts/sync-opencode-edition.js:88-90`) is source, so neither write mode touches
it; the reason line naming `PLUGIN_SCRIPTS` *is* the remedy.

---

## 3. THE CORE MEASUREMENT — the footer for `{WRITE + SOURCE_EDIT}`, driven by hand

Fixture: `mirror948/`, regenerated and asserted green (`--check` exit **0**,
`14 agent(s) + 3 command(s) + 1 plugin(s) in parity with canonical.`), then planted with
**exactly two** mismatches:

- `WRITE`: appended `\n<!-- premise948 planted drift -->\n` to `.opencode/agent/adversarial-verifier.md`
- `SOURCE_EDIT`: wrote `templates/opencode/plugins/zzz-948-unregistered.js`

Command:
```
env -u KAOLA_OPENCODE_STANDARD_MODEL -u KAOLA_OPENCODE_REASONING_MODEL \
  node <mirror948>/scripts/sync-opencode-edition.js --forge=github --check
```

**Verbatim output (stdout+stderr), exit code `1`:**

```
sync-opencode-edition[github]: PARITY FAILED (2 file(s)):
  - .opencode/agent/adversarial-verifier.md — stale — regenerate
  - templates/opencode/plugins/zzz-948-unregistered.js — unregistered plugin 'zzz-948-unregistered.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
Fix: node scripts/sync-opencode-edition.js --forge=github --write
No flag of this script clears templates/opencode/plugins/zzz-948-unregistered.js — apply the source edit its reason names above.
```

### Judgement: the behaviour is **CORRECT**. The issue is a coverage gap, not a defect.

Point by point against what #948 asserts:

- **Advises `--write` for the clearable part** — YES. `Fix: node scripts/sync-opencode-edition.js --forge=github --write`.
- **Separately names the source-edit mismatch** — YES, on its own line, naming the exact path.
- **Without implying any flag fixes the latter** — YES, and stronger than "does not imply": it states
  the negative outright — *"No flag of this script clears …"* — and points back to the reason line,
  which names `PLUGIN_SCRIPTS`.
- **Does not blanket-advise the stronger flag** — YES. `--write-config` is absent, correctly: nothing
  in this set needs it, and naming it would clobber the user-owned `opencode.json` model pins.

Not taken on faith — the outcome property A30 actually asserts was driven end-to-end for this mixture:

| leg | measurement | result |
|---|---|---|
| plant took | `--check` exit | `1` |
| reported == planted | parsed vs planted | `true` |
| advised commands parsed | `ADVICE_RE` | `[["--forge=github","--write"]]` |
| flag-irreducible remainder | replant → `--write-config` → `--check` | `["templates/opencode/plugins/zzz-948-unregistered.js"]` (== expected) |
| **the property** | replant → run what was advised → `--check` | surviving == irreducible → **HOLDS** |
| advice is not a no-op | replant → run advised alone | left 1 of 2 → **non-no-op** |
| never blanket `--write-config` | advised contains `--write-config`? | `false` → correct |

All seven mixtures (the five covered plus the two absent) were driven the same way; **every leg held
in every mixture.** Full log: `…/scratchpad/drive948.out`. The two absent ones, verbatim:

`{WRITE + WRITE_CONFIG + SOURCE_EDIT}` (exit `1`):
```
sync-opencode-edition[github]: PARITY FAILED (3 file(s)):
  - .opencode/agent/adversarial-verifier.md — stale — regenerate
  - templates/opencode/plugins/zzz-948-unregistered.js — unregistered plugin 'zzz-948-unregistered.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
  - opencode.json — stale — regenerate via --write-config
Fix: node scripts/sync-opencode-edition.js --forge=github --write-config
     (--write preserves the user-owned opencode.json and leaves it stale; --write-config rewrites it, discarding any model pins set there.)
No flag of this script clears templates/opencode/plugins/zzz-948-unregistered.js — apply the source edit its reason names above.
```

---

## 4. Extra observation — the plural source-edit wording is unreachable from A30's fixture

`sync-opencode-edition.js:823` branches on `sourceEdits.length === 1`. A30 declares exactly one
`SOURCE_EDIT` class, so `sourceEdits.length ∈ {0, 1}` for every scenario and the plural arm is dead
in the band. It is reachable in production — driven by hand with two rogue plugins (exit `1`):

```
sync-opencode-edition[github]: PARITY FAILED (3 file(s)):
  - .opencode/agent/adversarial-verifier.md — stale — regenerate
  - templates/opencode/plugins/zzz-948-a.js — unregistered plugin 'zzz-948-a.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
  - templates/opencode/plugins/zzz-948-b.js — unregistered plugin 'zzz-948-b.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
Fix: node scripts/sync-opencode-edition.js --forge=github --write
No flag of this script clears templates/opencode/plugins/zzz-948-a.js, templates/opencode/plugins/zzz-948-b.js — apply the source edit their reasons name above.
```

Correct there too. **Not part of #948** and not proposed as scope — recorded so it is not
re-discovered as a surprise. Note that A30's property is stated as an outcome, never as a wording, so
a plural-wording pin would be against the band's own design.

---

## 5. Baseline suite run

**The main checkout cannot produce a baseline today — and that is a real, pre-existing finding.**

```
$ node scripts/test-opencode-edition.js   # in /Users/ylpromax5/Workspace/Kaola-Workflow
REAL EXIT CODE: 1
opencode-edition test FAILED: D0[github]: .opencode is present on disk and has DRIFTED from canonical (sync --check exit 1).
Regenerate it deliberately: node scripts/sync-opencode-edition.js --forge=github --write
The suite stops here rather than continue into its own sync --write, which would repair this tree and erase the finding.
```

Cause, measured:
```
$ node scripts/sync-opencode-edition.js --forge=github --check     # exit 1
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - .opencode/agent/synthesizer.md — stale — regenerate
```
`agents/synthesizer.md` mtime **Aug 10 21:56** (last touched by commit `97df0d6f`, the #935 audit-findings
fix); `.opencode/agent/synthesizer.md` mtime **Jul 31 15:20**. The canonical source moved and the
gitignored generated tree was never regenerated. **Not caused by this investigation** — every write
here went to the scratch mirror, whose `sync` resolves `REPO` from its own `__dirname`
(`sync-opencode-edition.js:52`), and `git ls-files .opencode` returns **0** tracked files.

I did **not** repair it: D0 exists precisely to report this, and regenerating would erase the finding.
Whoever picks it up runs `node scripts/sync-opencode-edition.js --forge=github --write` deliberately.

**Baseline taken in a clean full clone at the same commit** (`suiteclone/`, `git clone --local`,
`.opencode` regenerated, `--check` exit 0):

```
$ node <suiteclone>/scripts/test-opencode-edition.js
REAL EXIT CODE: 0
D0: .opencode is present and in parity with canonical.
D0: SKIPPED — .opencode-gitlab is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
D0: SKIPPED — .opencode-gitea is absent from disk, so nothing was compared (gitignored generated tree; a fresh clone has none).
opencode-edition test passed (555 assertions). [drift-check: 1 tree(s) in parity (.opencode); 2 ABSENT, not checked (.opencode-gitlab, .opencode-gitea)]
```

- **Pass: 555 assertions. Fail: 0. Real exit code: 0** (captured to a file, not through a pipe).
- opencode is an additive runtime edition — absent from `npm test`, `edition-sync.js` and
  `install.sh` — so this suite is the relevant gate; no four-chain run is owed for an edition-only diff.

**Correction to the brief's tooling note:** `--shard N/999999` does **not** work here.
`scripts/test-opencode-edition.js` has **no** `shard` handling at all (`git grep -nP "shard"` on that
file returns nothing) — that trick belongs to `simulate-workflow-walkthrough.js`. To isolate A30,
run the whole file; the band is last and takes the tail of the runtime.

---

## 6. How a scenario is added — facts for the test author (NOT the test)

**A scenario is one array of `CLASSES` keys.** Verbatim template — an existing entry, the closest
structural sibling to what is missing (`scripts/test-opencode-edition.js:2713`):

```js
      ['stale user-owned opencode.json', 'unregistered canonical plugin'],
```

Inserted into the `SCENARIOS` array at `scripts/test-opencode-edition.js:2708-2714`. The strings must
be exact keys of `CLASSES` (`:2676`); a typo yields `undefined` and throws at `CLASSES[i].rel` in the
`planted` map (`:2719`).

**Fixture setup implied: none.** Both classes the missing mixture needs already exist and are already
planted by other scenarios:

- `'stale generated agent'` — `CLASSES` entry at `:2677-2685`; `clearedBy: 'write'`; plants by
  appending a comment to the first `.md` in `.opencode/agent/` (`agentMd`, resolved at `:2670-2671`
  and guarded non-empty at `:2672`).
- `'unregistered canonical plugin'` — `CLASSES` entry at `:2697-2705`; `clearedBy: 'none'`; plants
  `ROGUE_PLUGIN = 'zzz-a30-unregistered.js'` (`:2675`) into `templates/opencode/plugins/`.

No new `CLASSES` entry, no new `VOLATILE` path (`:2615` already covers `.opencode` and
`templates/opencode/plugins`), no new snapshot/restore work. The loop at `:2717` derives everything
else from the ids: `planted`, `flagProof`, `needsConfigFlag`, `someFlagHelps`, and the
`ids.includes('unregistered canonical plugin')` branch at `:2801` that asserts the report still names
`PLUGIN_SCRIPTS`.

**What the added scenario would exercise that nothing does today** (all measured green in §3, so it
arrives green — like the two other green-on-arrival assertions the band already declares out loud at
`:2568-2572`): `someFlagHelps === true` **and** `flagProof.length === 1` **and**
`needsConfigFlag === false` simultaneously — i.e. the `!needsConfigFlag` never-blanket check at
`:2792-2800` runs against a non-empty `advised` **while** a source-edit mismatch is present. Today
that check only ever ranges over sets with no source edit.

**Assertion-count effect:** the band emits, per scenario,
`4 + advised.length (no-op) + 1 (per-set) + advised.length (never-blanket, when !needsConfigFlag) + 1 (PLUGIN_SCRIPTS, when applicable)`.
For this mixture `advised.length === 1`, `needsConfigFlag === false`, plugin present → **8 assertions**,
so the suite's printed total moves 555 → 563 if nothing else changes. Useful as a sanity check that
the scenario actually ran rather than being skipped.

---

## Open / unmeasured

- Only the `github` forge was driven. `remediationLines` takes `forge` solely to interpolate
  `--forge=<f>` into the Fix line, and A30 itself only runs `--forge=github`, so the per-forge axis is
  not expected to differ — but it was **not measured**.
- The suite baseline was taken in a clone, not the working checkout, because of the pre-existing D0
  drift (§5). The two are byte-identical for tracked files (`git status --porcelain` clean apart from
  the untracked bundle dir), so the 555/exit-0 result should reproduce in the main checkout once
  `.opencode` is regenerated — **not verified**, deliberately, to leave the D0 finding intact.
- `.opencode-gitlab` / `.opencode-gitea` are absent from disk, so D0 skipped them in the baseline. That
  is the normal fresh-clone state, not a gap introduced here.
