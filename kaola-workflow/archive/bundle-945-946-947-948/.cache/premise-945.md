# Premise check — issue #945 (routing-surface mutation block: vacuous `exits 1` assertions)

## VERDICT: **CONFIRMED — with two qualifications**

The core claim is **confirmed exactly**, by direct measurement and by the issue's own leg:

- Under a dead sandbox, **all seven `--check exits 1 on a hand-edited <topic> surface` assertions
  PASS** against a process that died at module load, having rendered nothing, read no surface, and
  printed no `DRIFT:` line.
- The 16-failure decomposition the issue gives is **exact**: 7 names-as-drifted + 7 exits-0-after-revert
  + 1 baseline-exits-0 + 1 baseline-18-surfaces.
- The issue's own LEG B decomposition is **exact** in composition: 7 red, split 2 init / 2 next /
  3 finalize.

Two things the issue gets wrong or misattributes — neither touches the core claim:

1. **`426 passed` is wrong. The measured figure is `425`.** (Qualification 1)
2. **The aggregate-control attribution is misattributed.** `clean.status` is neither the only catch
   under the issue's own leg nor a sufficient one in general. (Qualification 2 — see §4.)

Nothing here is understated in the direction of the block being *blind*: the block is genuinely not
blind. But the reason it is not blind is not the one the issue names.

---

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, commit `a339e5dfb816428f3c62e477ee1a8dcba53c409b`
- Working tree at start and end: clean apart from the pre-existing untracked
  `kaola-workflow/bundle-945-946-947-948/`. **No tracked file was modified.**
- Node `v24.14.0`, darwin 25.6.0
- All mutation was done in a scratch mirror at
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad/mirror945/`
  (`rsync -a --exclude .git --exclude node_modules`), never via `git checkout --` and never in place.
- Mirror control: the unmutated mirror reproduces the main checkout exactly (432 / exit 0), and was
  re-verified back to 432 / exit 0 after each leg.

---

## 1. Structure of the assertion block (`scripts/test-generate-routing-surfaces.js:602-678`)

**Sandbox construction** (`:608-635`):

- `sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-routing-check-'))`
- `copy(rel)` copies `repo/rel` → `sandbox/rel`, creating parents.
- `runCheck()` = `spawnSync(process.execPath, [sandbox/scripts/generate-routing-surfaces.js, '--check'], {encoding:'utf8'})`
- Copy list: `scripts/generate-routing-surfaces.js`, `templates/routing/rename-table.js`,
  `templates/routing/slots.js`, `scripts/kaola-workflow-adaptive-schema.js`, plus the 3 distinct
  skeletons and all 18 surface paths.
- The whole block is wrapped in `try/finally { fs.rmSync(sandbox, {recursive:true, force:true}) }`.

**Baseline control** (`:637-646`) — 2 assertions, run ONCE, BEFORE the victim loop:

| # | assertion | message |
|---|---|---|
| B1 | `eq(clean.status, 0, ...)` | `mutation proof: sandbox baseline --check exits 0` (+ first 5 lines of sandbox stderr appended) |
| B2 | `assert(/all 18 surfaces byte-match/.test(clean.stdout), ...)` | `mutation proof: sandbox baseline reports 18 surfaces` |

**Victim loop** (`:651-674`) — 7 victims. The issue calls this a per-topic **triple**; it is in fact
**five assertions per victim**, three of which depend on the spawn:

| # | assertion | message | depends on spawn? |
|---|---|---|---|
| V1 | `assert(!!row, ...)` | `... <topic>/<st>/<forge> is registered` | no |
| V2 | `assert(readFileSync(abs) !== original, ...)` | `... <path> was actually mutated` | no |
| V3 | `eq(red.status, 1, ...)` | `--check exits 1 on a hand-edited <topic> surface` | **yes** |
| V4 | `assert(red.stderr.includes('DRIFT: <path>'), ...)` | `--check names <path> as drifted` | **yes** |
| V5 | `eq(green.status, 0, ...)` | `--check exits 0 again after reverting <path>` | **yes** |

Block total: 2 + (7 × 5) = **37 assertions**.

**The seven victims** (`:651-659`), confirmed as 2 init / 2 next / 3 finalize:

| # | topic / surface_type / forge | derived path |
|---|---|---|
| 1 | init / skill / gitea | `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` |
| 2 | init / command / github | `commands/workflow-init.md` |
| 3 | next / command / github | `commands/workflow-next.md` |
| 4 | next / skill / gitlab | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` |
| 5 | finalize / command / github | `commands/kaola-workflow-finalize.md` |
| 6 | finalize / skill / gitea | `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` |
| 7 | finalize / command / gitlab | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` |

The hand-edit is `original.replace('\n\n', '\n\nHAND EDIT — not in any skeleton.\n\n')` — first
blank-line pair only; V2 guards that it actually changed bytes.

---

## 2. BASELINE

```
$ node scripts/test-generate-routing-surfaces.js
test-generate-routing-surfaces: all 432 assertions passed.
EXIT=0
```

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT=0   (stderr empty)
```

**Surface count: 18.** Pinned three ways — `eq(GENERATED_SURFACES.length, 18, ...)` at
`test-generate-routing-surfaces.js:239`, the `/all 18 surfaces byte-match/` regex at `:646`, and the
CLI's own stdout above. The issue's "18" is correct.

---

## 3. Observations

| Leg | Command | Result | Exit |
|---|---|---|---|
| Baseline (main checkout) | `node scripts/test-generate-routing-surfaces.js` | `all 432 assertions passed` | 0 |
| Baseline (mirror, unmutated) | same, cwd=mirror945 | `all 432 assertions passed` | 0 |
| CLI check (main checkout) | `node scripts/generate-routing-surfaces.js --check` | `all 18 surfaces byte-match the skeleton.` | 0 |
| Probe positive control | `node probe-dead-sandbox.js mirror945` | clean exit 0 + byte-match line; hand-edit → exit 1 + `DRIFT:`; revert → exit 0 | 0 |
| **LEG A** (dead sandbox) | `node scripts/test-generate-routing-surfaces.js`, cwd=mirror945, kernel removed from copy list | **16 FAILED, 416 passed** | **1** |
| **LEG B v1** (`exit(1)` → `return`) | same, generator neutered | **7 FAILED, 425 passed** | **1** |
| **LEG B v2** (`exit(1)` deleted, falls through) | same | **7 FAILED, 425 passed** | **1** |
| **LEG C** (mid-loop death) | `node probe-midloop-death.js mirror945` | baseline PASSES; 7/7 `exits 1` vacuous; caught 7/7 by V4 and V5 | 0 |
| Previous routing commit `f4ff0647` | `git archive` → scratch, run suite | `all 432 assertions passed` | 0 |
| Post-run main checkout | `node scripts/test-generate-routing-surfaces.js` | `all 432 assertions passed` | 0 |

---

## 4. LEG A — the dead sandbox (the core measurement)

**Axis: exactly one.** The kernel `scripts/kaola-workflow-adaptive-schema.js` was removed from the
sandbox copy list at `:626-631`. Nothing else changed. This reproduces the exact historical incident
the block's own comment describes (`:637-643`): `templates/routing/slots.js:84` does
`require('../../scripts/kaola-workflow-adaptive-schema.js')`, and `generate-routing-surfaces.js:56`
requires `slots.js` at top level — before `main()` at `:368`. So the spawned process dies at
**module load**.

```
$ node -e '<strip the kernel line from the copy list>' mirror945/scripts/test-generate-routing-surfaces.js
LEG A mutation applied: kernel removed from sandbox copy list
$ cd mirror945 && node scripts/test-generate-routing-surfaces.js
LEG_A_EXIT=1
test-generate-routing-surfaces: 16 assertion(s) FAILED (416 passed).
```

### Observed failure breakdown — **matches the issue exactly**

| family | count | issue claims |
|---|---|---|
| `--check names <path> as drifted` (V4) | **7** | 7 ✓ |
| `--check exits 0 again after reverting <path>` (V5) | **7** | 7 ✓ |
| `sandbox baseline --check exits 0` (B1) | **1** | 1 ✓ |
| `sandbox baseline reports 18 surfaces` (B2) | **1** | 1 ✓ |
| **total** | **16** | 16 ✓ |

`grep -n "exits 1 on a hand-edited" legA.err` → **no match**. All seven V3 assertions **PASSED**.
Arithmetic closes: 416 + 16 = 432 = the baseline count, so every assertion ran.

### Non-vacuity check on my own mutation (trap (b))

The suite's B1 message carries the sandbox stderr, which printed verbatim:

```
  FAIL: mutation proof: sandbox baseline --check exits 0
    sandbox stderr: node:internal/modules/cjs/loader:1459
        throw err;
        ^
      Error: Cannot find module '../../scripts/kaola-workflow-adaptive-schema.js'
    expected: 0
    actual:   1
```

An independent standalone probe (`probe-dead-sandbox.js`) rebuilt the identical sandbox and captured
the child process directly, in both arms of a single-axis A/B:

| | kernel PRESENT (control) | kernel OMITTED |
|---|---|---|
| clean `--check` status | 0 | **1** |
| clean stdout | `...all 18 surfaces byte-match the skeleton.\n` | **`""` (empty)** |
| after hand-edit: status | 1 | **1 (identical)** |
| after hand-edit: stderr has `DRIFT:` | true | **false** |
| after hand-edit: stdout | `""` | `""` |
| after revert: status | 0 | **1** |
| stderr | empty | `Cannot find module '../../scripts/kaola-workflow-adaptive-schema.js'` |

This is a genuinely **non-rendering** sandbox, not a differently-broken one: empty stdout (no
byte-match line), no `DRIFT:` line, and a `node:internal/modules/cjs/loader` failure — so `cmdCheck`
never executed a single byte comparison. The only difference between the two arms is the kernel file.

**The confirming fact: a Node module-load failure exits with status 1 — byte-identical to the exit
code `cmdCheck` uses to signal detected drift.** V3 cannot distinguish them.

---

## 5. LEG B — the issue's own leg (`process.exit(1)` neutered, DRIFT printing intact)

Run in two variants because "neuter `process.exit(1)`" is ambiguous:

- **v1** — `process.exit(1);` → `return;` (DRIFT printed, no spurious success line)
- **v2** — `process.exit(1);` deleted outright (control falls through to the
  `all 18 surfaces byte-match` success `console.log`)

**Both give identical results: 7 FAILED, 425 passed, exit 1.** (No assertion reads `red.stdout`, so
the fall-through does not change the count.)

The seven reds, verbatim from v1:

```
  FAIL: mutation proof: --check exits 1 on a hand-edited init surface      (expected 1, actual 0)
  FAIL: mutation proof: --check exits 1 on a hand-edited init surface      (expected 1, actual 0)
  FAIL: mutation proof: --check exits 1 on a hand-edited next surface      (expected 1, actual 0)
  FAIL: mutation proof: --check exits 1 on a hand-edited next surface      (expected 1, actual 0)
  FAIL: mutation proof: --check exits 1 on a hand-edited finalize surface  (expected 1, actual 0)
  FAIL: mutation proof: --check exits 1 on a hand-edited finalize surface  (expected 1, actual 0)
  FAIL: mutation proof: --check exits 1 on a hand-edited finalize surface  (expected 1, actual 0)
```

3 finalize, 2 init, 2 next — **exactly as the issue states**.

### QUALIFICATION 1 — the issue's "426 passed" is wrong; it is **425**

432 total assertions, 7 red → 425 green. 426 is arithmetically impossible for a 432-assertion suite
with 7 failures. Checked whether this was a stale-commit artifact: the previous commit that touched
this area, `f4ff0647`, also runs **432** assertions. So it is a transcription slip in the issue, not
a different measurement. Immaterial to the claim, but the number should not be carried forward.

### What LEG B also establishes (in the block's favour)

LEG B is the case where **V3 is the sole catch**: DRIFT still prints, so V4 passes; the revert still
yields exit 0, so V5 passes. So V3 is not a useless assertion — it is the only thing that catches a
"prints the drift but does not fail" regression. Its defect is conditional: it is vacuous **under a
dead sandbox specifically**, not vacuous always. The issue's "PASS VACUOUSLY" wording is accurate for
the condition it names.

---

## 6. QUALIFICATION 2 — the aggregate control is misattributed

The issue asserts the seven are "caught in aggregate by the `clean.status` baseline control, so the
block as a whole is not blind."

**The block as a whole is not blind — that part is right, and the issue does not understate it.**
But the attribution to `clean.status` is wrong in both directions:

**(a) `clean.status` is not the only catch under LEG A.** Four distinct assertion families fired:
B1 (`clean.status`), B2 (18-surfaces), V4 (names-as-drifted, 7×) and V5 (exits-0-after-revert, 7×).
The catch is over-determined.

**(b) `clean.status` is not sufficient. It is a ONE-SHOT, PRE-LOOP control** (`:637`, before the
victim loop at `:660`), so it only covers a sandbox that is dead **from the start**. LEG C measured a
sandbox that starts healthy and dies mid-loop (kernel deleted after the baseline):

```
baseline clean.status === 0            -> PASS (status=0)
baseline "18 surfaces byte-match"      -> PASS
*** kernel deleted from the sandbox AFTER the baseline ***
"exits 1" assertions passing vacuously   : 7 / 7
caught by "names as drifted"             : 7 / 7
caught by "exits 0 after revert"         : 7 / 7
baseline control caught the dead sandbox : NO (it passed)
```

Both baseline assertions pass while the sandbox is dead for every one of the 14 subsequent spawns.
The load-bearing controls are **V4 and V5**, which are per-victim and catch a dead sandbox 7/7 in
both LEG A and LEG C. `clean.status` catches nothing that V4 and V5 do not already catch, in either
leg measured.

This matters for the design call: any remedy reasoned from "the baseline control has it covered"
rests on a control that LEG C shows passing on a dead sandbox.

---

## 7. Adjacent observation the issue does not mention

V3's message is `--check exits 1 on a hand-edited ${v.topic} surface` — it names only the **topic**,
where its two siblings V4 and V5 both name `row.path`. Consequence, visible verbatim in the LEG B
output above: the same message string appears **twice identically for init, twice for next, and three
times for finalize**, with nothing distinguishing which of the seven surfaces failed. A reader of that
output cannot tell which forge/surface_type regressed. Reported as an observation only; no remedy
proposed.

---

## 8. Inferences (labelled — these are mine, not measurements)

- **The failure mode is structural, not incidental** — confidence: high. `cmdCheck` signals detected
  drift with `process.exit(1)`, and an uncaught Node exception also exits 1. An assertion whose entire
  content is `status === 1` cannot separate "the guard fired" from "the guard never ran". *Refuted by:*
  any measurement showing a dead sandbox exiting with something other than 1 — the three dead-sandbox
  runs above all showed exactly 1.
- **The block's copy list is the live fragility** — confidence: medium-high. It is a hand-maintained
  enumeration of transitive requires (the comment at `:626-631` says so), so any new `require` under
  `templates/routing/` re-arms this exact condition. *Refuted by:* evidence that the copy list is
  derived rather than enumerated — it is not; I read it.
- **The suite's aggregate output is legible today** — confidence: medium. On LEG A the suite printed
  the child's `Cannot find module` line inside B1's message, so the cause was visible without
  reconstruction. That carrying of `clean.stderr` was itself added in response to the historical
  incident (`:637-643`). *Refuted by:* a dead-sandbox variant where B1 passes — which is exactly
  LEG C, where the cause is printed nowhere.

---

## 9. Open / not measured

- I did not measure whether a mid-loop sandbox death (LEG C) is **reachable** by any realistic change
  to the tree. LEG C establishes the control's temporal coverage, not that the scenario occurs.
- I did not measure the other five spawning suites in the repo for the same pattern; scope was #945.
- No remedy was designed, evaluated, or costed — out of scope by instruction.

## Commands run (verbatim, in order)

```
git rev-parse HEAD
node scripts/test-generate-routing-surfaces.js
node scripts/generate-routing-surfaces.js --check
grep -nP "require\(" templates/routing/slots.js templates/routing/rename-table.js
rsync -a --exclude '.git' --exclude 'node_modules' /Users/ylpromax5/Workspace/Kaola-Workflow/ $SP/mirror945/
cd $SP/mirror945 && node scripts/test-generate-routing-surfaces.js
node $SP/probe-dead-sandbox.js $SP/mirror945                 # positive control
node $SP/probe-dead-sandbox.js $SP/mirror945 --omit-kernel   # dead sandbox, direct
# LEG A
node -e '<remove kernel from copy list>' $SP/mirror945/scripts/test-generate-routing-surfaces.js
cd $SP/mirror945 && node scripts/test-generate-routing-surfaces.js
# restore + control
cp $SP/test-orig.js $SP/mirror945/scripts/test-generate-routing-surfaces.js
cd $SP/mirror945 && node scripts/test-generate-routing-surfaces.js
# LEG B v1 / v2
node -e '<exit(1) -> return>'  $SP/mirror945/scripts/generate-routing-surfaces.js
cd $SP/mirror945 && node scripts/test-generate-routing-surfaces.js
node -e '<exit(1) deleted>'    $SP/mirror945/scripts/generate-routing-surfaces.js
cd $SP/mirror945 && node scripts/test-generate-routing-surfaces.js
# LEG C
node $SP/probe-midloop-death.js $SP/mirror945
# prior-commit assertion count
git -C /Users/ylpromax5/Workspace/Kaola-Workflow archive f4ff0647 -o $SP/old945.tar
tar -x -f $SP/old945.tar -C $SP/old945 && cd $SP/old945 && node scripts/test-generate-routing-surfaces.js
# final: main checkout untouched
git status --porcelain && node scripts/test-generate-routing-surfaces.js
```

Artifacts: `$SP` =
`/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/f850139c-e3c6-4391-be0f-fedc312a0b1b/scratchpad`
— `mirror945/` (restored to pristine), `probe-dead-sandbox.js`, `probe-midloop-death.js`,
`legA.err`, `legB1.err`, `legB2.err`, `baseline.out`.
