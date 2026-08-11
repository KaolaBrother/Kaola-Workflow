# Investigation: two unmeasured gaps — the walkthrough's sibling comment (A), and kimi's remediation blind spot (B)

Closes the one thing each of `premise-950-route-count.md` and `premise-951-a30-blindspot.md`
left explicitly unmeasured.

---

## Setup

- **Repo:** `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, HEAD
  `580c6019bfced5a25320705b824451504bfbe82c` (clean; only untracked path is
  `kaola-workflow/bundle-950-951/`).
- **Environment:** `node v24.14.0`, darwin 25.6.0.
- **No tracked file in the real repo was modified.** Every mutation leg ran on a fresh
  scratch mirror under
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/3f288513-a84e-4ab1-8ed2-b287bafb74c4/scratchpad/`.

### Two environment faults found while establishing the baseline — read these before re-running

**1. A `git archive | tar -x` mirror is NOT a faithful walkthrough fixture.** It carries no
`.git`, and `scripts/validate-workflow-contracts.js:666` gates its entire tag block on it:

```js
if (process.env.KAOLA_WORKFLOW_OFFLINE !== '1' && exists('.git')) {
```

Measured, with `git` shimmed to `#!/bin/sh\nexit 1` on `PATH` (the same shim the scenario builds):

| tree | command | result | exit |
|---|---|---|---|
| real repo | `KAOLA_WORKFLOW_OFFLINE=0 PATH=<shim>:$PATH node scripts/validate-workflow-contracts.js` | throws `Git tag "kaola-workflow--v9.5.5" must exist for package.json version (9.5.5)` | 1 |
| archive mirror | same | `Workflow contract validation passed` | 0 |

so `testContractValidatorMissingTag` false-reds on an archive mirror
(`contracts script must exit non-zero when git tag is absent, got: 0`). All mirrors below are
therefore `git clone --quiet --no-hardlinks --local` (tag `kaola-workflow--v9.5.5` present).

**2. The full walkthrough outlives a 600 s tool cap.** Two runs launched through the harness with
`timeout: 600000` were reaped mid-suite — partial logs (106 and 127 scenario lines), **no terminal
`Workflow walkthrough simulation passed` marker**, and one of them recorded `EXIT=1` with *no error
text in the log*, which is exactly what a reap looks like and is trivially mistaken for a real red.
The settling runs were detached (`nohup sh -c '...' </dev/null & disown`) and polled across calls.
A full run takes roughly 9 minutes here. **Treat any walkthrough log without the terminal marker as
not-a-measurement.**

---

# GAP A — the walkthrough's sibling comment under the forge-deletion mutation

## The comment, verbatim

`scripts/simulate-workflow-walkthrough.js:12012-12021`, inside `testAxiomBlockByteIdentity`
(function starts at `:11980`):

```
12012:  // ANTI-VACUITY, and its HONEST boundary — the two terms of this width are not equally anchored.
12013:  // The RUNTIME term is independent: it is read off the filesystem (one `sync-<runtime>-edition.js`
12014:  // per additive runtime), so deleting a runtime from any table cannot shrink expectation and
12015:  // measurement together. Deriving it from surfaces.length would be a guard that cannot fail.
12016:  // The FORGE term is NOT independent: it comes from the same registry this measures, so deleting a
12017:  // forge from the edition tables shrinks both sides in lockstep and this floor stays green —
12018:  // mutation-proved. That case is caught one guard over, by test-generate-routing-surfaces.js's
12019:  // "registry derives 18 surfaces" assertion, which is why it is left rather than re-anchored. Do
12020:  // not read this comment as claiming the width is independent of everything; it is independent of
12021:  // the runtime list only.
```

## The assertion it describes, verbatim

`scripts/simulate-workflow-walkthrough.js:12022-12027`:

```
12022:  const runtimeEditionCount = fs.readdirSync(path.join(repoRoot, 'scripts'))
12023:    .filter(f => /^sync-[a-z0-9-]+-edition\.js$/.test(f)).length;
12024:  const expected = routing.FORGES.length * (2 + runtimeEditionCount); // claude + codex + each additive runtime
12025:  assert(surfaces.length === expected,
12026:    'the axiom block must be checked on every runtime x forge init surface — expected ' + expected
12027:      + ', derived ' + surfaces.length + ' (' + surfaces.map(s => s.id).join(', ') + ')');
```

## The mutation

Delete the `gitea` row from both `COMMAND_EDITIONS` and `SKILL_EDITIONS` in
`scripts/generate-routing-surfaces.js`.

**Correction to the relayed line numbers:** at HEAD `580c6019` these rows are at **`:69` and `:74`**,
not `:66` and `:71`. Each literal was verified to occur exactly once before removal
(`occurrences: commands=1 skills=1`). Resulting diff on the mirror:

```diff
 const COMMAND_EDITIONS = [
   { forge: 'github', dir: 'commands' },
   { forge: 'gitlab', dir: 'plugins/kaola-workflow-gitlab/commands' },
-  { forge: 'gitea', dir: 'plugins/kaola-workflow-gitea/commands' },
 ];
 const SKILL_EDITIONS = [
   { forge: 'github', dir: 'plugins/kaola-workflow/skills' },
   { forge: 'gitlab', dir: 'plugins/kaola-workflow-gitlab/skills' },
-  { forge: 'gitea', dir: 'plugins/kaola-workflow-gitea/skills' },
 ];
```

`1 file changed, 2 deletions(-)` — nothing else touched.

## Observations

Both legs are **full scope**: bare `node scripts/simulate-workflow-walkthrough.js`, no `--shard`,
no `--only`. Both reached the terminal marker.

| Measurement | Command | Result | Exit |
|---|---|---|---|
| Walkthrough, UNMUTATED | `node scripts/simulate-workflow-walkthrough.js` (mirror `base`) | `##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":209,"ran":209,"passed":209,"failed":0}` · `Workflow walkthrough simulation passed` · `spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2400}` · 173 `: PASSED` lines / 178 total | **0** |
| — the assertion under test | (same run, log line 3) | `testAxiomBlockByteIdentity: PASSED (12 surfaces)` | — |
| Walkthrough, MUTATED | `node scripts/simulate-workflow-walkthrough.js` (mirror `mutA`) | `##KW-SHARD {...,"scenarios":209,"ran":209,"passed":209,"failed":0}` · `Workflow walkthrough simulation passed` · `spawn-census: {...,"spawns":2400}` · 173 `: PASSED` lines / 178 total | **0** |
| — the assertion under test | (same run, log line 3) | `testAxiomBlockByteIdentity: PASSED (8 surfaces)` | — |
| Full-log diff of the two runs | `diff base-run.log mutA-run.log` | exactly one differing line: `< testAxiomBlockByteIdentity: PASSED (12 surfaces)` / `> testAxiomBlockByteIdentity: PASSED (8 surfaces)` | 1 (diff found) |

**Nothing else in the suite moved.** 209/209 both legs; identical spawn census.

### Controls — my mirror reproduces the already-established facts

| Measurement | Command | Result | Exit |
|---|---|---|---|
| `test-generate-routing-surfaces`, unmutated | `node scripts/test-generate-routing-surfaces.js` (base) | `test-generate-routing-surfaces: all 434 assertions passed.` | 0 |
| `test-generate-routing-surfaces`, mutated | same (mutA) | `FAIL: registry derives 18 surfaces (3 topics x 6)` / `expected: 18` / `actual:   12`; plus `finalize: six surfaces` 6→4, `finalize: three command surfaces` 3→2, `finalize: three skill surfaces` 3→2 | **1** |
| `test-route-reachability`, unmutated | `node scripts/test-route-reachability.js` (base) | `Route-reachability test passed (331 assertions).` | 0 |
| `test-route-reachability`, mutated | same (mutA) | `FAIL: T19b universe: the routing instruction ships on 6 generated surfaces — found 4 (plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md, plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md, plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md)` then `Route-reachability test FAILED: 1 failure(s), 324 passed.` | **1** |

**A count correction that lands on `docs/conventions.md:325-326`.** The doc claims
`test-route-reachability` "stays green at an unchanged **325** assertions." Measured baseline at
HEAD `580c6019` is **331**. Under the mutation it is 324 passed + 1 failed = 325 *evaluated*. So
that sentence is stale on the **number** as well as on the **green** — the repair owes both.

## Reproduction

Reproduces. Every relayed fact about `test-generate-routing-surfaces` (18→12) and
`test-route-reachability` (`found 4`, exit 1) came out verbatim, so the mutation applied here is
the same mutation the prior investigation ran.

## Narrowing

- **Leg: full walkthrough under the mutation.** Eliminated the hypothesis that
  `testAxiomBlockByteIdentity` behaves like `T19b`. It does not: expectation and measurement both
  fall 12→8 and the assertion passes.
- **Leg: full-log diff.** Eliminated "some *other* walkthrough scenario reds under forge deletion" —
  one line in 178 differs, and it is the surface count.

The mechanical reason the two guards diverge is one line each:

- walkthrough: `routing.FORGES.length` — and `FORGES` is **derived from the edition tables**
  (`scripts/generate-routing-surfaces.js:134-141`: `const cmd = COMMAND_EDITIONS.map(e => e.forge)`,
  with a cross-check that commands and skills agree). Delete a forge and expectation shrinks by
  construction.
- `test-route-reachability.js:141-145`: `codexEditions` is a hand-typed three-row literal. Delete a
  forge and the expectation does not move.

## Verdict

**The comment at `12012-12021` is TRUE. It is NOT a fourth false site.**

- Its load-bearing claim — *"deleting a forge from the edition tables shrinks both sides in lockstep
  and this floor stays green — mutation-proved"* — is exactly what the machine did: `12 surfaces` →
  `8 surfaces`, `PASSED`, suite exit 0.
- Its secondary clause — *"That case is caught one guard over, by test-generate-routing-surfaces.js's
  'registry derives 18 surfaces' assertion"* — is also true, verbatim: that is the first FAIL printed,
  with that exact assertion name.
- So the known-bad set stays at three: `docs/conventions.md:325-326`, `docs/conventions.md:315`,
  `scripts/test-route-reachability.js:757-759`. **This comment needs no repair.**

### Inference (labelled)

- *Inference:* the phrase **"caught one guard over"** now understates the catchers — under this
  mutation the case reds in **two** guards (`test-generate-routing-surfaces` **and**
  `test-route-reachability`), because the latter's expectation has since stopped tracking the
  registry. The comment is not wrong (it names a guard that does catch it, and that guard does
  catch it); it is merely no longer exhaustive, and nothing in it claims to be.
  **Confidence: high** — directly measured above.
  **Refuted by:** a reading of "caught one guard over" as an exclusivity claim; nothing in the
  wording asserts uniqueness, so I do not treat this as a defect.
- *Inference:* this comment is the **only** one of the four sites whose expectation is
  registry-derived, which is why it survived while the other three rotted.
  **Confidence: high.**
  **Refuted by:** a fifth site not yet enumerated. I did not sweep for one — see Open.

---

# GAP B — does the kimi edition share the blind spot?

## Answer to the direct question: there is no equivalent mechanism to delete

`scripts/sync-kimi-edition.js` has **no `remediationLines()`, no `REMEDY` taxonomy, and no remedy
field on its mismatch objects at all**:

```
$ grep -n "remediation\|Remediation\|REMEDY\|remedy" scripts/sync-kimi-edition.js
NO MATCH for remediation/REMEDY/remedy in sync-kimi-edition.js
```

Its whole reporting path is the tail of `runCheck` (`scripts/sync-kimi-edition.js:811-817`),
verbatim:

```js
  if (mismatches.length) {
    console.error('sync-kimi-edition[' + forge + ']: PARITY FAILED (' + mismatches.length + ' file(s)):');
    for (const m of mismatches) console.error('  - ' + m.rel + ' — ' + m.reason);
    console.error('Fix: node scripts/sync-kimi-edition.js --forge=' + forge + ' --write');
    process.exitCode = 1;
    return;
  }
```

One unconditional closing line, no class-derived footer.

**Why the shape differs — it is structural, not an oversight.** The opencode script's *only*
`REMEDY.SOURCE_EDIT` construction site is the unregistered-plugin allowlist guard
(`scripts/sync-opencode-edition.js:918`, reason string at `:915`). kimi has no plugin mechanism to
guard:

```
$ grep -n "PLUGIN_SCRIPTS\|plugins" scripts/sync-kimi-edition.js
NO plugin mechanism in sync-kimi-edition.js
```

and no user-owned config class either — `runWrite` is `writeAgents + writeCommands + writeHooks +
pruneSkills` (`:751-760`), with no `writeConfig`/`--write-config` counterpart. All eight mismatch
classes kimi's `runCheck` can construct (missing/stale role skill, missing/stale command skill,
missing/drifted hook copy, missing/stale hooks fragment, retired skill dir, retired hook artifact)
are cleared by `--write`. So the blanket line is *correct* for kimi's whole class universe.

## The analogous deletion, and whether kimi catches it

Since there is no source-edit footer to delete, the true analog is deleting kimi's remediation line
itself (`:814`). Measured on fresh mirrors; the opencode leg is re-run here as the matched control
rather than relayed.

| Measurement | Command | Result | Exit |
|---|---|---|---|
| kimi BASELINE | `node scripts/test-kimi-edition.js` (mirror `mutB`) | `kimi-edition test passed (521 assertions).` | **0** |
| opencode BASELINE | `node scripts/test-opencode-edition.js` (mirror `mutB`) | `opencode-edition test passed (563 assertions).` | **0** |
| kimi, `Fix:` line DELETED | `node scripts/test-kimi-edition.js` (mirror `mutC`) | **2 failures**, `kimi-edition test FAILED: 2 failure(s), 518 passed.` | **1** |
| opencode, `sourceEdits = []` | `node scripts/test-opencode-edition.js` (mirror `mutD`) | `opencode-edition test passed (563 assertions).` — output **byte-identical** to baseline (`diff` clean) | **0** |

The two kimi failures, verbatim:

```
FAIL: K12: --check hands the reader a runnable command — every class this edition reports is cleared by one, so offering none would be a regression, not a repair
FAIL: K12: running what --check advised clears the whole report — exit 1, left [".kimi/skills/kaola-role-adversarial-verifier/SKILL.md",".kimi/skills/zzz-k12-retired"]. This is the property the opencode twin lost: the closing line names a command that does not fix what the lines above it reported
```

Mirror diffs applied (1 line each, verified unique before edit):

```diff
--- a/scripts/sync-kimi-edition.js        (mutC)
-    console.error('Fix: node scripts/sync-kimi-edition.js --forge=' + forge + ' --write');

--- a/scripts/sync-opencode-edition.js    (mutD)
-  const sourceEdits = mismatches.filter(m => m.remedy === REMEDY.SOURCE_EDIT).map(m => m.rel);
+  const sourceEdits = [];
```

**kimi's guard is K12** (`scripts/test-kimi-edition.js:1324-1414`), and its header comment says the
divergence is deliberate, in these words:

```
// K12 — THIS EDITION'S REMEDIATION LINE IS CORRECT, AND STAYS CORRECT.
//
// runCheck closes a failed report with one command for the whole mismatch set. On the opencode
// twin that line is wrong for two of its classes, and the repair there is to derive the line from
// the classes actually present. HERE IT IS RIGHT, and the reason is structural: every class this
// runCheck can report is a generator-owned artifact, there is no user-owned tracked file among
// them, and `--write` is the only write mode this script has. So the line is pinned as an
// OUTCOME — run what it advised, and the report it advised on must be gone — rather than left to
// be "fixed" in sympathy with a sibling whose problem this file does not have.
```

**Why opencode's A30 cannot see its own footer.** A30 parses advice with
`scripts/test-opencode-edition.js:2613`:

```js
const ADVICE_RE = /node\s+\S*sync-opencode-edition\.js[^\n`'"&;]*/g;
```

Every A30 property (`advised.length >= 1`, `advised.length === 0`, "run what it advised and see what
is left", "nothing it advised may be a no-op", "no `--write-config` here") is quantified over
**runnable invocations of the script**. The SOURCE_EDIT footer is prose — `No flag of this script
clears <paths> — apply the source edit its reason names above.` — so it never enters `advised`, and
deleting it moves none of those assertions. That is the whole mechanism of the blind spot.

## The docs

| Measurement | Command | Result |
|---|---|---|
| kimi doc documents the footer? | `grep -n "No flag of this script\|Fix: node scripts/sync-kimi-edition\|remediation" docs/kimi-edition.md` | **NO MATCH** |
| kimi doc has a PARITY FAILED sample? | `grep -n "PARITY FAILED" docs/kimi-edition.md` | **none** |
| opencode doc has one? | `sed -n '355,362p' docs/opencode-edition.md` | yes — a fenced sample block ending in the exact footer `No flag of this script clears templates/opencode/plugins/probe-unregistered.js — apply the source edit its reason names above.` |
| any executable surface consumes the kimi doc? | `git grep -l "kimi-edition\.md" -- scripts templates hooks agents commands plugins install*.sh` | `scripts/test-kimi-edition.js` only — and that is a **comment** at `:398` (*"Prose in docs/kimi-edition.md cannot satisfy that: deleting a paragraph is invisible to every suite"*), not a consumption |
| any executable surface consumes the opencode doc? | same, for `opencode-edition\.md` | **none** |

`docs/kimi-edition.md:307` mentions `--check` only as a command to run
(`node scripts/sync-kimi-edition.js --check   # parity assert: skills + hooks fragment`); it never
quotes the output. So kimi carries **no doc surface that would go stale** if its line changed.

Also relevant to the scope of any fix: `ls scripts/sync-*-edition.js` returns exactly two files —
`sync-kimi-edition.js` and `sync-opencode-edition.js`. There is no third additive runtime to owe.

## Verdict

**A fix to opencode alone would be COMPLETE. It does not owe a kimi twin.**

- kimi has no `REMEDY.SOURCE_EDIT` class, therefore no footer of that shape, therefore nothing to
  delete and nothing to guard against deleting.
- kimi's *own* remediation line is already pinned — deleting it takes the suite from
  521 assertions / exit 0 to **2 failures / 518 passed / exit 1**, in K12, twice.
- The asymmetry runs the other way from the naive "one rule, one wording" reading: **opencode is
  the edition missing a guard kimi already has**, not kimi missing a remedy opencode is about to
  get. K12's own header says the sympathy-fix would be the error.
- Nothing in `docs/kimi-edition.md` documents a line that would need re-wording alongside it, and
  no script consumes either edition doc.

### Inferences (labelled)

- *Inference:* K12 plants exactly two classes (a stale role skill + a retired directory,
  `test-kimi-edition.js:1377-1385`), both `--write`-clearable. If kimi ever grew a class that no
  flag clears, K12 would not automatically exercise it — the new class would have to be planted.
  So kimi is protected **for the classes it has**, not by construction for classes it might gain.
  **Confidence: high** for the mechanism, **moderate** for it mattering — it is a future risk, not
  a present defect. **Refuted by:** a class-enumeration assertion in K12 that I did not find.
- *Inference:* the shape opencode is missing is precisely K12's — pinning the remediation as an
  **outcome that includes the non-runnable part of the advice**, rather than only the runnable
  invocations `ADVICE_RE` can see. **Confidence: moderate-high.**
  **Refuted by:** an A30 assertion, outside the `advised` family, that already reads the footer —
  I grepped `advised` across `test-opencode-edition.js` and found none, and the mutation leg agrees
  (byte-identical output). I name this as what the measurement rules in; **choosing the fix is not
  mine.**

---

## Open (unmeasured, and why)

- **Whether a fifth "stays green under forge deletion" site exists elsewhere.** I measured the four
  sites named in the brief and did not sweep the repo for others. Not measured because it was not
  asked and a grep for the claim is a hypothesis, not a measurement.
- **The edition suites ran on fresh clones, where the generated trees are gitignored and absent**, so
  every `D0` drift check reported `SKIPPED — ... absent from disk`. Baseline and mutated legs share
  that condition identically, so the A/B is sound; but neither leg exercised D0. The opencode
  baseline (563) matches the number established previously, which suggests the prior run had the
  same condition.
- **`docs/conventions.md:325-326`'s assertion count** is stale at 331-vs-325 (measured above), but I
  did not check whether `:315` or `test-route-reachability.js:757-759` carry stale counts too — only
  the green/red claim was in scope for those.
- **I did not verify the mutation against an installed tree**, only the repo checkout. Every
  assertion measured here reads repo files.

## Artifacts

All under
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/3f288513-a84e-4ab1-8ed2-b287bafb74c4/scratchpad/`:

| file | what |
|---|---|
| `base-run.log` / `base-run.exit` | full unmutated walkthrough (178 lines, `EXIT=0`) |
| `mutA-run.log` / `mutA-run.exit` | full mutated walkthrough (178 lines, `EXIT=0`) |
| `base-grs.log` / `mutA-grs.log` | `test-generate-routing-surfaces` both legs |
| `base-rr.log` / `mutA-rr.log` | `test-route-reachability` both legs |
| `mutB-kimi.log` / `mutC-kimi.log` | kimi suite baseline / footer-deleted |
| `mutB-oc.log` / `mutD-oc.log` | opencode suite baseline / footer-deleted |
| `base/ mutA/ mutB/ mutC/ mutD/` | the five clones (`mutA`, `mutC`, `mutD` carry the 1–2 line diffs shown above) |
