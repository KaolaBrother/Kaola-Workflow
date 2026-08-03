# Badge-block heading rename + S2 re-anchor (issue #927)

Test author, custody of `scripts/test-opencode-edition.js`. No production file was touched.

Baseline commit: `c39381748ad80cc09afbc42ac07ff4f65ff18012` (worktree `.kw/worktrees/issue-927`,
branch `workflow/issue-927`, with the other agents' in-flight edits present).

---

## 1. The heading

**Chosen heading, verbatim:**

```
## Effort is configured, not passed
```

**Why.**

- **It names the result, not the method.** The block's two facts are (a) a role's reasoning effort
  is configured centrally and applies on every call that role makes, and (b) there is therefore no
  per-call `model=` to pass. "Effort is configured, not passed" is those two facts and nothing else.
  It says nothing about *how* the effort is delivered, so it cannot rot the way `variant` did.
- **`Variant` is gone from the heading**, which is the only place the word survived after the
  implementer rewrote the body (verified: the whole generated tree — `.opencode/agent/*.md`,
  `.opencode/command/*.md`, `.opencode/hooks/`, `.opencode/plugins/` — contains exactly ONE
  occurrence of `variant`, at `.opencode/command/kaola-workflow-finalize.md:28`, the heading line).
- **It matches how this repo words such surfaces.** The generated command surface already carries
  declarative-clause headings alongside noun phrases — `## What finalization is`,
  `## Completion contract`, `### The sink reports; you own the outcome`. And the "X, not Y" /
  "X; not Y" construction is the house idiom for stating a rule as a result (`CLAUDE.md`:
  "Missing is a routing problem, never a stop", "Dispatch production; keep decisions",
  "One rule, one wording"; `docs/conventions.md`: "specify the result, never the method").
- Sentence case, matching the non-`Step` headings on the same surface.

**Where the implementer applies it** (I did not):

- `scripts/sync-opencode-edition.js:275` — the first element of `OPENCODE_BADGE_BLOCK`.
- Two prose comments naming the old heading, which become stale on rename:
  - `scripts/sync-opencode-edition.js:263` — "…with an opencode-native "Effort Variant Resolution" note".
  - `scripts/sync-kimi-edition.js:405` — "where opencode substitutes its / Effort Variant Resolution block".

Nothing else in the repo depends on the string. A repo-wide sweep for `Effort Variant Resolution`
returns only: those two comments, the constant, `scripts/test-opencode-edition.js` (mine, now
re-anchored), and history (`CHANGELOG.md`, `kaola-workflow/archive/**`), which must not be edited.
The canonical trigger heading `## Agent Model Badge` in `commands/kaola-workflow-finalize.md:29`
and `templates/routing/finalize.skeleton.md:41` is **not** renamed — it is the Claude-side heading
the generator substitutes *at*, and it stays.

---

## 2. What changed in `scripts/test-opencode-edition.js` (S2 block)

### 2a. The skip-becomes-red fix — the actual defect

Before, the locator returned `null` when the heading did not match and the caller did this:

```js
const sec = badgeSection(body);
if (sec !== null) {
  assert(...);   // 3 content assertions
}
```

A heading rename therefore deleted three assertions and produced no red. Now presence is
**asserted in both directions**, and — critically — the expectation of *which* files must carry a
block is **derived from the canonical source**, not hand-listed:

```js
const canonCarriesBadge = file =>
  /^##\s+Agent Model Badge\s*$/m.test(fs.readFileSync(sync.canonCommandPath(file), 'utf8'));
```

- `canonCarriesBadge(file) === true`  → `assert(sec !== null, ...)` — a locate failure is a RED.
- `canonCarriesBadge(file) === false` → `assert(sec === null, ...)` — a stale block is also a RED.

This matters because only **1 of the 3** generated commands legitimately carries the block
(`kaola-workflow-finalize.md`; `workflow-init.md` and `workflow-next.md` have no
`## Agent Model Badge` in their canonical sources). An unconditional per-file assert would have
been a permanent false red on two files; deriving the expectation makes the check exact.

Plus a vacuity guard on the corpus itself:

```js
assert(badgeCarriers.length > 0, 'S2: at least ONE canonical command carries `## Agent Model Badge` …');
```

so the whole band cannot report green by ranging over an empty expectation.

The anchor is now a single named literal at the top of the block, `BADGE_HEADING`, with the regex
built from it via a local `escapeRe` — one place to move, and the comment says to move it in the
same change as the generator.

### 2b. The mechanism-word assertion — block-scoped, heading included

Inside the located section (the extractor includes the heading line, which is the point — the
heading is where the word survived a rewrite of the body):

```js
const MECHANISM_WORD = /\bvariants?\b/i;
assert(!MECHANISM_WORD.test(sec),
  'S2[' + file + ']: the effort block names NO `variant` anywhere, heading included — …');
```

The leading `\b` keeps `invariant`/`invariants` out (no word boundary after `in`).

### 2c. The mechanism-word assertion — body-wide sweep, no anchor to lose

A block-scoped check is exactly what an anchor miss disarms, so the same claim is also enforced
with no anchor at all, over every generated agent and command file, reported with `file:line`
(mirrors the existing `(d)` `Opus`/`Sonnet` B2 sweep pattern in the same block):

```js
const sweptFiles = [...ocAgentRels, ...ocCommandRels];
assert(sweptFiles.length > 0, 'S2 (#927): the mechanism-word sweep read at least one generated file …');
for (const rel of sweptFiles) { /* per-line MECHANISM_WORD match → assert(false, rel + ':' + line …) */ }
```

**Why this is safe (not over-broad):** `variant` appears **zero** times in `commands/` and
`agents/` — the canonical sources the generator renders from — so canonical prose cannot introduce
a false red. The only producer of the word on this surface is the generator itself.

This is the assertion that would have caught the class in the first place: it is red *today*,
before any rename, and it stays armed even if the anchor ever breaks again.

---

## 3. RED proof

Command (exit code read directly from `$?`, never through a pipe):

```
cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927
node scripts/test-opencode-edition.js ; echo "EXIT=$?"
```

**Exact output (the two new failures, verbatim):**

```
FAIL: S2[kaola-workflow-finalize.md]: the effort block is LOCATABLE under the exact heading "## Effort is configured, not passed" — its canonical source carries `## Agent Model Badge`, so the generator substituted a block into this file and every check below must be reading it. Found no such heading: the checks would assert over nothing, which is a disarmed guard with no red. If the heading was renamed deliberately, BADGE_HEADING here moves in the same change.
FAIL: S2 (#927): .opencode/command/kaola-workflow-finalize.md:28: mechanism word "Variant" in generated opencode prose — effort tiers were never applied to a dispatched subagent through opencode `variant`s, so naming them states a mechanism that does not happen. State the RESULT (the role's effort is configured centrally; never pass a per-call `model=`): ## Effort Variant Resolution

opencode-edition test FAILED: 2 failure(s), 813 passed. [drift-check: 3 tree(s) in parity (.opencode, .opencode-gitlab, .opencode-gitea)]
EXIT=1
```

Full log: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/e5bef84f-998c-4766-a21b-c0b1d082b10a/scratchpad/s2-red.log`

Only these two assertions fail. Nothing else in the suite regressed.

---

## 4. Positive control — the suite is satisfiable, and the old defect is measured

A red alone does not prove the assertions can ever pass, nor that the anchor regex is correct. So
the rename was applied **in a scratch mirror only** (`cp -R` of the worktree, `.git` removed, the
three generated trees deleted so the suite self-provisions from the mirror's own generator):

```
mirror: …/scratchpad/mirror   (production file in the mirror only; the worktree's
                               scripts/sync-opencode-edition.js is UNTOUCHED)
node <mirror>/scripts/test-opencode-edition.js ; echo "EXIT=$?"
→ opencode-edition test passed (817 assertions). [drift-check: NO tree verified; 3 ABSENT …]
→ EXIT=0
```

The assertion arithmetic is the measurement of the old defect:

| run | passed | failed | total |
|---|---|---|---|
| worktree, old heading | 813 | 2 | **815** |
| mirror, new heading | 817 | 0 | **817** |

`815 − 1 (the sweep's fired assert) + 3 (the content asserts the null locator skipped) = 817`.
Three assertions were silently evaporating under an anchor miss, and the old code produced **no**
red for it. That is exactly the gap now closed.

Control log: `…/scratchpad/s2-green-control.log`

---

## 5. Files touched

- **Written:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927/scripts/test-opencode-edition.js` (S2 block only).
- **Not written (implementer's):** `scripts/sync-opencode-edition.js`, `scripts/sync-kimi-edition.js`.
- No `git checkout --`, `git stash`, or any reverting command was run at any point.

---
---

# PART TWO — A28: adopting a config must not destroy the one it replaces

Second narrow change, requested by implementer B, who reported the gap rather than letting a green
suite imply coverage. Same custody: `scripts/test-opencode-edition.js` only.

Baseline commit: `c39381748ad80cc09afbc42ac07ff4f65ff18012`. By the time this ran, implementer A had
landed the Part One heading rename (`sync-opencode-edition.js:275` now reads
`'## Effort is configured, not passed'`) and the S2 band was green.

## A28 — what is asserted

A new block after A27, `scripts/test-opencode-edition.js`, four claims. A27 proves the opt-in
**adopts**; A28 is the recovery half of the same ruling.

**Nothing about the mechanism is pinned**, for A27's stated reason. The flag is discovered from the
report; the backup is identified **by its content** (the bytes that were replaced), never by name;
the promised path is matched as a **shape lifted from the report itself**. An implementation that
named backups by PID, counter or hash passes every assertion here — what it may not do is lose the
file.

### (1) The replaced config is recoverable, byte for byte
- adoption keeps the replaced config in a file beside it — found by scanning every non-`opencode.json`
  file in the destination for content `=== USER_CONFIG`.
- guarded by a non-vacuity precondition that the adoption **actually replaced** the config.

### (2) A second adoption inside the SAME clock second does not clobber the first backup
This is B's measured defect, and it is only testable under an adversarial clock: two real installs
are seconds apart, so a clock-derived name is unique by accident and the suite would pass against
the very code that loses the file. So **the clock is frozen on `PATH`** — a `date` shim that answers
*any* `+format` request with one fixed stamp and `exec`s the real `date` otherwise (format-agnostic
on purpose: pinning `+%Y%m%d%H%M%S` would re-introduce the mechanism coupling and would silently
un-freeze the day the format changed).
- **fixture control**: two `date` reads through the shimmed PATH must return one value, else the two
  adoptions are not in the same second and prove nothing.
- **non-vacuity**: the second adoption must have written a backup of its own (side-file count must
  increase) — with no second write there is no collision to survive.
- **the defect**: after the second adoption, the user's ORIGINAL config is still recoverable.
- and the second adoption also kept what *it* replaced — the rule is per adoption.

### (3) A backup that cannot be written aborts instead of replacing anyway
The destination directory is chmod `0555` **after** a normal install has populated it: no new entry
(the backup) can be created, while the existing config file stays writable — so the only thing
between the user and a silent loss is the installer refusing.
- **fixture control**: a probe write into the directory must actually fail (under root, or a
  filesystem ignoring the mode, the scenario is not the scenario — say so plainly).
- **attribution control**: with the directory read-only, a **non-adopting** install must still exit 0.
  Without this the non-zero exit below proves nothing — it could be the tree deploy failing before
  adoption is ever reached, and the assertion would hold with no backup guard at all. (Measured: it
  does exit 0; the deploy writes inside the pre-existing `.opencode/`.)
- the adopting install exits non-zero, **and** the config is left byte-identical.

### (4) The cost is disclosed BEFORE the opt-in
Asserted against the **no-flag** run's output, which is what the user reads while deciding:
- it states that adopting **replaces** rather than merges — `/\breplac(e|es|ed|ing)\b/i`, any wording
  carries; silence does not;
- it names **where** the replaced file goes (a path token beyond the config itself);
- **the promise is the practice**: the shape the report named must match a file adoption actually
  writes. This is the assertion that catches a report advertising a recovery path the writer does
  not produce.

## Mutation proof — every assertion armed

Mutations were applied **in a scratch mirror** (`cp -R` of the worktree, `.git` removed, generated
trees deleted so the suite self-provisions). `install-opencode.sh` in the worktree was never written
to; no revert command was ever run. Harness: `…/scratchpad/mutate.js`. Exit codes read from `$?` on
the process, never through a pipe.

| run | A28 failures | exit |
|---|---|---|
| mirror, unmutated (control) | 0 — `passed (837 assertions)` | **0** |
| `M-a` remove the backup `cp` entirely | 7 | **1** |
| `M-b` revert `config_backup_path` to the clock-only name `"$1.$2.bak"` | 2 | **1** |
| `M-c` `cp … \|\| true` — backup failure no longer aborts | 2 | **1** |
| `M-d` delete the disclosure sentence, keep the flag actionable | 3 | **1** |
| **`M6` (B's own: neuter the backup AND delete the disclosure)** | **9** | **1** |

`M6` **was green, exit 0** before this block existed. That is the gap, and it is closed.

**M-b is the sharpest one** — it is the exact first cut B measured as broken, and it reds *only*
because of the frozen clock:

```
FAIL: A28: the second adoption inside the same clock second wrote its own backup — with no second
      write there is no collision for the check below to survive (files beside the config went
      ["opencode.json.19700101000000.bak"] → ["opencode.json.19700101000000.bak"])
FAIL: A28: after a SECOND adoption inside the SAME clock second, the user's ORIGINAL config is STILL
      recoverable — a backup name derived from the clock alone collides here, and the second adoption
      then overwrites the first backup with the generated config: a reassuring file holding nothing
      worth recovering. Files beside the config: ["opencode.json.19700101000000.bak"]
opencode-edition test FAILED: 2 failure(s), 835 passed.
EXIT=1
```

M6's signature (first and last lines of nine):

```
FAIL: A28: the pre-flag drift report discloses that adopting REPLACES the existing config rather than
      merging into it — the disclosure has to arrive before the user runs the flag …
FAIL: A28: adoption keeps the config it replaced, byte-for-byte, in a file beside it … Files left
      beside it: []
FAIL: A28: …and the config it could not back up is left BYTE-IDENTICAL. Replacing a file after
      failing to keep a copy of it is the exact outcome the backup exists to prevent.
opencode-edition test FAILED: 9 failure(s), 829 passed.
EXIT=1
```

M-c, the narrowest, reds exactly the abort pair and nothing else:

```
FAIL: A28: an adoption whose backup CANNOT be written fails loudly instead of proceeding — exit 0.
FAIL: A28: …and the config it could not back up is left BYTE-IDENTICAL.
opencode-edition test FAILED: 2 failure(s), 836 passed.
EXIT=1
```

## Worktree state

```
cd /Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927
node scripts/test-opencode-edition.js ; echo "EXIT=$?"
→ opencode-edition test passed (838 assertions). [drift-check: 3 tree(s) in parity]
→ EXIT=0
```

Green here is a lock-in over behaviour that already shipped, not my verdict on it — the mutation
table above is the evidence that the lock is armed. Runtime cost of the block: ~8 s total suite
(9 additional installer spawns).

## Files touched (Part Two)

- **Written:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-927/scripts/test-opencode-edition.js` (A28 block appended after A27).
- **Not written:** `install-opencode.sh` — mutated in a scratch mirror only, which was deleted after
  the runs. Its worktree diff is B's alone.
- Logs: `…/scratchpad/a28-final.log`; harness `…/scratchpad/mutate.js`.
