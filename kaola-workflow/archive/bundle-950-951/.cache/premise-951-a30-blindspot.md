# Investigation: issue #951 — the A30 blind spot on the source-edit footer

**Verdict in one line:** claims 1 and 2 reproduce **exactly**, to the assertion. Claim 3 is
**QUALIFIED** — its mechanical half is right, its "information-preserving" half is wrong as stated,
and it omits a severity fact that cuts in both directions (the footer *reappears* on the re-check).
One finding the issue does not mention at all: the deleted line is **documented verbatim in
`docs/opencode-edition.md`, and no script consumes that doc.**

## Setup

- Commit: `580c6019bfced5a25320705b824451504bfbe82c` (branch `main`; working tree clean apart from
  the untracked `kaola-workflow/bundle-950-951/`).
- Node: `v24.14.0`. Platform: darwin 25.6.0.
- Suite under test: **`node scripts/test-opencode-edition.js`**. It is reachable from
  `package.json` only via `test:kaola-workflow:editions`
  (`node scripts/test-opencode-edition.js && node scripts/test-kimi-edition.js`) and is **absent
  from `npm test`**, confirming the brief's premise. It takes no `--shard` flag; ~10 s wall.
- All mutation work done on scratch mirrors under
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/3f288513-a84e-4ab1-8ed2-b287bafb74c4/scratchpad/`:
  `mirror-pristine`, `mirror-m1`, `mirror-m1b`, `mirror-m2` — **each a fresh `cp -R` from the real
  repo**, never a hand-undo. Real tree verified untouched at the end (`git diff --stat HEAD` empty).

### Commands run (verbatim)

```
node scripts/test-opencode-edition.js                     # in each mirror
node <scratch>/capture.js  <mirror> <scenario>            # harness: A30 fixture, one scenario, raw --check output
node <scratch>/capture2.js <mirror>                       # harness: plant, report, RUN the advice, re-check
```

The two harnesses are scratch-only (`<scratch>/capture.js`, `<scratch>/capture2.js`); they
replicate A30's fixture construction verbatim — same `SOURCE_TREES`, same
`KAOLA_OPENCODE_*_MODEL` scrubbing, same three plant functions.

## Observations

| # | Measurement | Build | Result | Exit |
|---|---|---|---|---|
| 0 | baseline suite | pristine | **563 assertions passed**, 0 FAIL | **0** |
| 1 | claim-1 mutation (`flag ? [] : …`) | m1 | **563 assertions passed**, 0 FAIL | **0** |
| 1b | footer deleted **unconditionally** (`sourceEdits = []`) | m1b | **563 assertions passed**, 0 FAIL | **0** |
| 2 | contrast mutation (prefer `--write-config` on WRITE+SOURCE_EDIT) | m2 | **1 failure, 562 passed** | **1** |

562 + 1 = 563, consistent with the baseline. Three independent runs agree on 563.

Historical note: the archived `premise-948.md` recorded a 555-assertion baseline taken in a clean
clone because `.opencode/agent/synthesizer.md` was stale on main and D0 failed before A30. **That
blocker is gone** — D0 is green on `main` today (`.opencode`, `.opencode-gitlab`, `.opencode-gitea`
all in parity), and the baseline has since moved 555 → 563. The issue's 563 matches today's tree.

---

## 1. Claim 1 — the blind spot: **CONFIRMED, exactly**

### The mutation still applies to today's code

`scripts/sync-opencode-edition.js:842-860`, quoted as it ships:

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

`flag` is declared `const` at line 845 and **is in scope** at line 854 — verified by reading, not
assumed. The mutation applies cleanly; the anchor string was asserted unique before substitution.

### Result

```
$ node scripts/test-opencode-edition.js      # mirror-m1
opencode-edition test passed (563 assertions). [drift-check: 3 tree(s) in parity ...]
EXIT=0    FAILcount=0
```

**Identical to baseline in every digit.** The issue's "exit 0, 563 assertions passed" is exact.

### Positive control — the mutation is a real blind spot, not a no-op

A mutation that changes no output would prove nothing, so I captured the actual report text on both
builds for the `{WRITE + SOURCE_EDIT}` plant:

**pristine:**
```text
sync-opencode-edition[github]: PARITY FAILED (2 file(s)):
  - .opencode/agent/adversarial-verifier.md — stale — regenerate
  - templates/opencode/plugins/zzz-a30-unregistered.js — unregistered plugin 'zzz-a30-unregistered.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
Fix: node scripts/sync-opencode-edition.js --forge=github --write
No flag of this script clears templates/opencode/plugins/zzz-a30-unregistered.js — apply the source edit its reason names above.
```

**m1 (mutated):**
```text
sync-opencode-edition[github]: PARITY FAILED (2 file(s)):
  - .opencode/agent/adversarial-verifier.md — stale — regenerate
  - templates/opencode/plugins/zzz-a30-unregistered.js — unregistered plugin 'zzz-a30-unregistered.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist
Fix: node scripts/sync-opencode-edition.js --forge=github --write
```

The footer is genuinely gone, and the suite is genuinely green. **Blind spot confirmed.**

### Stronger than filed (leg 1b)

The issue's mutation is *conditional* (drops the footer only when a flag was named). I also ran the
**unconditional** deletion — `const sourceEdits = [];` — which removes the line in **every** case,
including the source-edit-only scenario where it is the reader's entire closing guidance and no
`Fix:` line is printed at all:

```
EXIT_1b=0   FAILcount=0   opencode-edition test passed (563 assertions).
```

**Zero assertions in the whole opencode suite — not just in A30 — observe that footer line.** The
blind spot is wider than the issue claims. Mechanically this is expected from reading the two
parsers: `reported()` matches `/^\s*-\s+(\S+)\s+—\s/` (the footer starts `No flag…`, not `- `), and
`ADVICE_RE` requires a literal `node …sync-opencode-edition.js` (the footer has none). Nothing else
in the band touches raw output except line 2818.

---

## 2. Claim 2 — the contrast: **CONFIRMED, exactly**

The producer's preference lives in the same `const flag` ternary (line 845-846). Mutation applied:

```js
  const flag = remedies.has(REMEDY.WRITE_CONFIG) ? '--write-config'
    : remedies.has(REMEDY.WRITE) ? (remedies.has(REMEDY.SOURCE_EDIT) ? '--write-config' : '--write') : '';
```

This changes the advised flag **only** in the WRITE+SOURCE_EDIT mixture — i.e. only the scenario
#948 added.

```
$ node scripts/test-opencode-edition.js      # mirror-m2
FAIL: A30[stale generated agent + unregistered canonical plugin]: --write-config is NOT advised here — nothing in this set needs it, and it rewrites the user-owned opencode.json, destroying the model pins that file invites the user to hand-edit. It clears 13 of the 14 classes, which is exactly what makes it tempting as a blanket answer. Advised: ["--forge=github","--write-config"]

opencode-edition test FAILED: 1 failure(s), 562 passed.
EXIT=1   FAILcount=1
```

**Exactly one failure, 562 passed, on the new `{WRITE + SOURCE_EDIT}` scenario alone**, at the
`!needsConfigFlag` assertion (`scripts/test-opencode-edition.js:2808-2816`). Every digit of the
issue's claim 2 holds. The new scenario is doing real work: it is the sole detector of that
mutation.

---

## 3. Claim 3 — the reasoning: **QUALIFIED** (the load-bearing one; verified independently)

The issue makes three sub-claims. They do not all fare alike.

### 3a. "names no runnable command, so it has no outcome to drive" — **CONFIRMED**

The footer contains no invocation of the script. And there is no invocation that *could* clear the
class: `usage()` (`scripts/sync-opencode-edition.js:958-969`) offers exactly `--write`,
`--write-config`, `--write-config-to PATH`, `--check`, and A30 itself **measures per scenario**
that the maximal flag leaves this class standing (lines 2761-2768: run `--write-config`, then
assert the survivors equal `flagProof`). So the property A30 is built on — *run what was advised,
re-check* — structurally cannot reach this line. That part of the reasoning is sound.

### 3b. "information-preserving" — **REFUTED as stated**

The two lines, quoted from real output:

- reason line: `  - templates/opencode/plugins/zzz-a30-unregistered.js — unregistered plugin 'zzz-a30-unregistered.js' present in templates/opencode/plugins/ but absent from PLUGIN_SCRIPTS — add it to the allowlist`
- footer: `No flag of this script clears templates/opencode/plugins/zzz-a30-unregistered.js — apply the source edit its reason names above.`

What survives the deletion: the path, the token `PLUGIN_SCRIPTS`, and the positive remedy ("add it
to the allowlist"). The issue is right about all three.

What does **not** survive is the footer's only unique content: **the negative scope claim** — that
the `Fix:` command printed immediately above does *not* cover this file. The reason line states
what the remedy *is*; it says nothing about what the advised command *fails to do*. In the mutated
combined report the reader is handed **two mismatches, one `Fix:` line, and no marking of which
mismatch that line covers**. That is precisely the property the band is named for ("THE REMEDY
--check ADVISES IS THE REMEDY THAT CLEARS WHAT IT REPORTED", line 2542), so calling the deletion
information-preserving is not accurate. It is *path*-preserving and *remedy*-preserving; it is not
*scope*-preserving.

### 3c. Not in the issue: **the loss is first-report only** — the footer comes back

Measured with the follow-the-advice harness on m1: the reader runs the advised
`--forge=github --write` (exit 0, "write complete (1 file(s) updated)"), then re-checks. The
remaining set is the source-edit alone, so `flag` is `''`, the mutation's guard no longer fires,
and the footer **reappears verbatim**:

```text
--- RE-CHECK AFTER FOLLOWING THE ADVICE (exit 1) ---      [m1, mutated]
sync-opencode-edition[github]: PARITY FAILED (1 file(s)):
  - templates/opencode/plugins/zzz-a30-unregistered.js — unregistered plugin ... — add it to the allowlist
No flag of this script clears templates/opencode/plugins/zzz-a30-unregistered.js — apply the source edit its reason names above.
```

This cuts both ways and belongs in the decision. It **lowers** the severity: a reader who follows
the advice and re-checks is not stranded — `--check` still exits 1 and the guidance returns. It
also **confirms** the loss is real where it matters: the combined report is exactly where a reader
decides whether one command finishes the job, and that is the report the mutation degrades. Note
this is *not* true of the unconditional variant (1b), where the line never appears at all — and 1b
is equally green.

### 3d. "which A30 does assert" — **QUALIFIED**

A30 asserts two separate things, not the conjunction the phrasing suggests:

- the **file** is named on a per-mismatch line — via `reported()` (line 2605-2607) plus the
  equality assert at line 2747-2751;
- **`PLUGIN_SCRIPTS`** appears *somewhere in `c0.out`* — line 2817-2821:
  ```js
  if (ids.includes('unregistered canonical plugin')) {
    assert(c0.out.includes('PLUGIN_SCRIPTS'),
      tag + ': the report still names PLUGIN_SCRIPTS — the allowlist edit is the ONLY remedy '
      + 'for this class, so the reason line that names it is the whole of what the reader gets');
  }
  ```

It does **not** assert they are on the same line. Today they coincide (the reason line is the only
place `PLUGIN_SCRIPTS` occurs in output), so that assertion is *incidentally* armed on the reason
line — a coupling of fact, not of construction. The issue's sentence is true of today's output but
overstates what the band pins.

---

## 4. Scope of the options (factual; no recommendation)

### (a) A wording pin on the footer

- **Where it would live:** inside the A30 per-scenario loop, alongside the existing
  `ids.includes('unregistered canonical plugin')` guard at lines 2817-2821, or guarded by
  `flagProof.length > 0` which is already computed at line 2736.
- **How many assertions:** `flagProof` is non-empty in **3 of the 6** scenarios (`['unregistered
  canonical plugin']`, `['stale user-owned opencode.json', 'unregistered canonical plugin']`,
  `['stale generated agent', 'unregistered canonical plugin']`). One assert per such scenario →
  **+3, taking the suite 563 → 566.**
- **Would it be the first wording pin?** The issue says the band avoids wording pins. Reading it:
  **substantively yes, literally no.** There is no *sentence* pin anywhere in A30, and the band's
  header derives that deliberately (lines 2556-2560): *"the property is stated as an OUTCOME, never
  as a wording … That is checkable without pinning one sentence of the message … a fourteen-way
  string pin would rot on the next class."* But line 2818 **is already a string assertion on raw
  output**, at token granularity (`'PLUGIN_SCRIPTS'` — a code identifier, which changes only when
  the constant is renamed). Across the whole file the only other output-text assertions are lines
  2120/2127/2189, all on role-name identifiers. So a *token*-level pin has precedent in this very
  band; a *prose-sentence* pin would be the first in the file.
- **A non-wording discriminator exists, and I measured it.** Counting occurrences of the
  flag-irreducible path in the report distinguishes the builds without pinning any wording:

  | build | source-only | writeconfig+source | write+source |
  |---|---|---|---|
  | pristine | 2 | 2 | 2 |
  | m1 (claim-1 mutation) | 2 | **1** | **1** |
  | m1b (unconditional) | **1** | **1** | **1** |

  A "named at least twice when flag-irreducible" check catches m1 on 2 of 3 scenarios and m1b on
  all 3, and is invariant to rewording. Reported as an observed fact about the option space, not as
  a proposal.

### (b) Restating the report so the footer carries a drivable outcome

**Not possible without a new capability**, measured rather than reasoned: no flag clears the class
(A30's own `irreducible` leg proves it per scenario; `usage()` enumerates only four modes, none of
which touches `PLUGIN_SCRIPTS`). The remedy is a source edit to an allowlist in the script's own
file. For the footer to have an outcome A30 could drive, the script would need a new mode that
edits `PLUGIN_SCRIPTS` — a capability change, not a report change, and one that would put the
generator in the business of editing its own source.

### (c) Leaving it and recording a watch-list row

Zero code change; the row would go on ADR 0017's watch list per the *derive additively* rule
("mechanisms derived for failure classes never actually observed are recorded, not built"). Note
what stays unpinned under this option, which the issue does not mention:

**`docs/opencode-edition.md` documents this exact line, and no test consumes that doc.** Line 362
carries the footer verbatim inside a `text` transcript block, and the prose bullet above it
(lines 348-352) states the rule: *"→ the file is named with a line saying no flag of this script
clears it. When the set contains nothing else, no invocation of this script is offered at all, so a
command printed under the reasons is never mistaken for the fix."* `git grep -n "opencode-edition\.md" -- scripts/`
returns **nothing** — no script reads it. So under mutation 1b the shipped documentation describes
behaviour the shipped code no longer has, with every suite green. That is a second, independent
copy of the same blind spot, on a prose surface.

---

## Inferences (labelled; separate from the measurements above)

- **The blind spot is structural, not accidental** — confidence: high. Both A30 parsers are
  keyed to shapes the footer deliberately does not have (`- <path> — ` and `node …js`), and the
  band's header states the outcome-only design as a choice. Refuted by: finding any assertion
  elsewhere that reads the line — I looked and mutation 1b says there is none in this suite.
- **The `{WRITE + SOURCE_EDIT}` scenario #948 added is not redundant** — confidence: high. It is
  the unique detector of the m2 mutation (1 failure, on it alone). Refuted by: showing another
  scenario also reds under m2 — it did not.
- **The issue's framing understates the gap and overstates the harm** — confidence: medium-high.
  Understates: the unconditional deletion is equally green, and a prose doc surface is equally
  unpinned. Overstates: "information-preserving" is wrong about scope, but the footer returns on
  the re-check, so a reader following the loop is not permanently misled. Refuted by: a reader
  workflow that consumes the first report and never re-checks — I did not measure whether any
  caller of `--check` does that.

## Open (unmeasured, and why)

- Whether any **caller** of `sync-opencode-edition.js --check` (installer, chain, CI-less gate)
  consumes only the first report and never re-checks. That would settle the severity question 3c
  leaves open; it is out of the brief's scope and needs a caller census, not a mutation.
- The **kimi** edition's equivalent (`scripts/sync-kimi-edition.js`, `test-kimi-edition.js`) was
  not examined. If it shares the `remediationLines` shape, the same blind spot may exist there; the
  brief scoped this to opencode.
- Whether a `flagProof.length`-guarded assertion would stay green across the other two forges
  (`--forge=gitlab|gitea`). A30 drives `--forge=github` only; unmeasured for the others.
