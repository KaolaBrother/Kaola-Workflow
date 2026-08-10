# Test artifact — issue #944

> The Codex routing block asks the orchestrator for a role's tier and ships no membership.
> This pins the roster into the shipped bytes and binds it to `CODEX_PINNED_*` in both directions.

**Baseline commit:** `d2ab06c2800963957d740db1dc9d4f019d0c53b5`
**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-940-941-942-943-944`
**File written (the only one):** `scripts/test-route-reachability.js`, +232 lines, 0 deletions. Nothing
else in the tree was touched; nothing was committed.

```
RED: T19b roster — 6 surface(s), 14 roles each: "code-explorer: absent from the roster (registry: standard) …"
baseline: d2ab06c2800963957d740db1dc9d4f019d0c53b5
```

---

## Where it landed, and why there

`scripts/test-route-reachability.js`, as a new block **T19b**, immediately after T19 (the existing
Codex per-spawn model-routing contract). Not a new file, and not
`scripts/test-generate-routing-surfaces.js`.

T19 already owns this exact artifact: `CODEX_MODEL_ROUTING_MARKER`, the `codexModelRoutingBlock()`
extractor that bounds the PIN region, the six-surface Codex universe, and the effort-literal pins
with their mutation battery. The roster lives *inside that block*, so extending the file that
already reads it reuses the extractor and puts the membership pin next to the mapping pin it has to
join with. `test-generate-routing-surfaces.js` is the render-**engine** self-test (SLOT / SPLICE /
REGION semantics plus byte-identity); a Codex dispatch-contract property is not an engine property.

### Chain coverage — say it plainly

`test-route-reachability.js` runs in **`test:kaola-workflow:claude`** (the fast gate) and in
`test:kaola-workflow:claude:full`. It runs in **no other chain** — measured:

```
test:kaola-workflow:claude       -> RUNS test-route-reachability
test:kaola-workflow:codex        -> does NOT run it
test:kaola-workflow:gitlab       -> does NOT run it
test:kaola-workflow:gitea        -> does NOT run it
test:kaola-workflow:claude:full  -> RUNS test-route-reachability
```

That is the same coverage `test-generate-routing-surfaces.js` has, so the alternative home would not
have improved it. The fix's diff touches `templates/routing/*.skeleton.md` and six files under
`plugins/`, which is edition-touching, so `run-chains.js` fails closed to all four chains at
finalize — but only the claude chain actually executes these assertions. Note also that the fast
gate **samples**; T19b is not part of the sampled walkthrough shard, it runs at full coverage every
time this suite runs.

---

## What is pinned

### 1. The obligated universe is DERIVED, not listed

```js
const routingSurfaces = GENERATED_SURFACES
  .map(row => ({ row, content: fs.readFileSync(path.join(REPO, row.path), 'utf8') }))
  .filter(s => s.content.includes(CODEX_MODEL_ROUTING_MARKER));
```

Every generated surface whose **committed bytes** carry the routing PIN owes the roster. Asserted to
be exactly six, all `surface_type === 'skill'`, topics exactly `{finalize, next}` — which is the
premise report's finding (the PIN ships on *both* `kaola-workflow-next/SKILL.md` and
`kaola-workflow-finalize/SKILL.md`, across all three forge editions). Independently confirmed:

```
$ git grep -rln 'Per-Spawn Model Routing'
plugins/kaola-workflow{,-gitlab,-gitea}/skills/kaola-workflow-{next,finalize}/SKILL.md   (6)
templates/routing/{next,finalize}.skeleton.md                                            (2, authored)
```

No command surface asks the question, so none is obligated. A seventh surface that later acquires
the instruction acquires the obligation with it, with no edit here.

Read from the **shipped** bytes (`row.path` on disk), never from the skeleton. #944 is precisely the
failure of an answer that exists in the tree without reaching the reader, so an authored-only
assertion would restage the defect.

### 2. The roster equals `CODEX_PINNED_*`, both directions

`EXPECTED_TIER` is built from `scripts/kaola-workflow-adaptive-schema.js`'s
`CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` — the kernel copy, which is the
byte-identical cross-edition anchor and the constant the ruling names as the generation source.
This gives that documented dead export its first shipping consumer *and* its first test that reads
the split rather than the union.

`rosterDefects(block, expected, universe)` is a pure detector reporting four defect kinds:

| kind | meaning |
|---|---|
| `absent from the roster` | registry has the role, the shipped block does not carry it |
| `roster says X, registry says Y` | present under the wrong tier |
| `claimed as X AND Y` | listed under both tiers — never last-one-wins |
| `on the roster but not in the Codex tier registry` | the reverse direction |

**Format is deliberately not pinned.** A role takes the tier named on its own line; failing that,
the nearest preceding *unambiguous* tier word. A line naming both tiers **clears** the context
rather than guessing, so an unlabelled role reads `(no tier)` and reds instead of inheriting a stale
heading. One line per tier, a heading plus a bullet list, and a table all read identically, and a
re-wrap cannot redden it. Both rendering shapes are asserted green in the harness so the pin is
demonstrably satisfiable rather than an unmeetable shape.

Two lexical details that had to be right:
- role names carry hyphens, so the boundary is `[^A-Za-z0-9_-]`, not `\b` — `\bcode-reviewer\b`
  would also fire inside a longer hyphenated token;
- `\breasoning\b` does **not** match inside `reasoning_effort` (the underscore is a word
  character), so the existing effort sentences cannot masquerade as tier labels.

The scan is bounded to the PIN block. That is both the ruling (the roster is generated into that
block) and a correctness requirement: role names occur in ordinary prose elsewhere on these surfaces
— `doc-updater` in finalize, for one — and a whole-file scan would tier them by accident.

**Stated bound on the reverse direction.** "On the roster but not in the registry" needs a universe
of names to recognise; deriving it from `EXPECTED_TIER` alone would make that direction structurally
undetectable. The universe is therefore `EXPECTED_TIER.keys() ∪ agents/*.md` — two independent
enumerations. A roster naming something that is neither a registered tier member nor an agent in the
tree is not seen by this pin; `generate-routing-surfaces.js --check` byte-equality is what covers
that case. The mutation proof injects such a name to show the direction bites.

### 3. Tier → effort, bound to the constant rather than to a literal

`effortDefects(block, {standard, reasoning})` checks the block states each tier's pair, with the
expected efforts taken from `kaola-workflow-codex-preflight.js`'s `CODEX_STANDARD_EFFORT` (`medium`)
and `CODEX_REASONING_EFFORT` (`xhigh`) — the same constants the Codex installer and preflight
validate installed profiles against. T19 already pins these two sentences as literals; the new fact
is the **binding**, so prose and validator cannot drift apart, and the roster's tier names are
joinable to an actual effort at dispatch.

**This is the one assertion that is GREEN on baseline**, and it is stated as such rather than
claimed as a red: the mapping is already correct today, so it is a retention pin. It is proved to
bite by mutation instead (see g below).

---

## Baseline — failing run, verbatim

`d2ab06c2`, in the worktree. The suite exits **1** with six failures; each names one surface and all
fourteen roles. Elided for length after the first:

```
$ node scripts/test-route-reachability.js
FAIL: T19b roster: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md must ship the role->tier
membership its own instruction demands — 14 defect(s): code-explorer: absent from the roster (registry:
standard); investigator: absent from the roster (registry: standard); knowledge-lookup: absent from the
roster (registry: standard); tdd-guide: absent from the roster (registry: standard); implementer: absent
from the roster (registry: standard); doc-updater: absent from the roster (registry: standard);
metric-optimizer: absent from the roster (registry: standard); planner: absent from the roster (registry:
reasoning); code-architect: absent from the roster (registry: reasoning); build-error-resolver: absent from
the roster (registry: reasoning); code-reviewer: absent from the roster (registry: reasoning);
security-reviewer: absent from the roster (registry: reasoning); adversarial-verifier: absent from the
roster (registry: reasoning); synthesizer: absent from the roster (registry: reasoning)
FAIL: T19b roster: plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md …
FAIL: T19b roster: plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md …
FAIL: T19b roster: plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md …
FAIL: T19b roster: plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md …
FAIL: T19b roster: plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md …

Route-reachability test FAILED: 6 failure(s), 325 passed.
$ echo $?
1
```

### Control — the six reds are mine

The reasoning-floor removal landed in this worktree while I was working, so the control was re-taken
against the **current** tree: same tree, HEAD's version of the suite (`git show HEAD:…` into a
scratch mirror, the real tree never reverted).

```
== CONTROL: current worktree + HEAD version of the suite ==
Route-reachability test passed (298 assertions).
exit=0

== BASELINE RED: current worktree + my suite ==
Route-reachability test FAILED: 6 failure(s), 325 passed.
exit=1
```

298 → 325 passed + 6 failed: T19b contributes 33 assertions, and every red in the file is one of
mine. It also confirms T19b does not depend on the `REASONING_FLOOR_ROLES` / `isReasoningClass` /
`enforceReasoningFloor` cluster being removed concurrently, nor on `synthesizer`'s retired
"non-lowerable reasoning-tier floor" prose.

No collateral damage, same tree:

```
test-suite-registration            exit=0
validate-script-sync               exit=0
generate-routing-surfaces --check  exit=0
test-generate-routing-surfaces     exit=0
```

---

## Positive control — the oracle is satisfiable

A test that only reds is not yet an oracle. On a disposable **scratch mirror** (rsync of the
worktree; the real tree was never written and `git checkout --` was never used), a realistic fix was
applied: the roster generated from `CODEX_PINNED_*` at render time, spliced into both skeletons'
PIN blocks, then `generate-routing-surfaces.js --write`.

```
generate-routing-surfaces --write: rendered 18 surfaces.
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.  exit=0
Route-reachability test passed (331 assertions).  exit=0
```

The rendered block that satisfies it — offered as evidence the shape is reachable, **not** as a
required format; the detector accepts any layout that names each role under its tier:

```markdown
<!-- PIN: codex-dispatch-model-routing -->
## Codex Per-Spawn Model Routing

Keep every installed role's existing standard-tier or reasoning-tier classification, and set the
model and reasoning effort explicitly on each spawn. Standard-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "medium"`. Reasoning-tier roles dispatch with
`model: "gpt-5.6-sol"` and `reasoning_effort: "xhigh"`.

Standard-tier roles: `code-explorer`, `investigator`, `knowledge-lookup`, `tdd-guide`,
`implementer`, `doc-updater`, `metric-optimizer`.

Reasoning-tier roles: `planner`, `code-architect`, `build-error-resolver`, `code-reviewer`,
`security-reviewer`, `adversarial-verifier`, `synthesizer`.

These mappings are fixed for every spawn. …
<!-- /PIN -->
```

---

## Mutation proofs

### On the fixed mirror — where the guard becomes load-bearing

| # | mutation | result |
|---|---|---|
| **M1** | add a 15th role to `CODEX_PINNED_REASONING_ROLES`, **do not regenerate** | RED on all six: `flow-auditor: absent from the roster (registry: reasoning)`, exit 1 |
| **M2** | hand-move `implementer` to the reasoning list in **one** surface | RED on that one surface only: `implementer: roster says reasoning, registry says standard` (+ T19's byte-identity), exit 1 |
| **M3** | delete the roster from **one** of the six surfaces | RED on exactly **1** surface (`grep -c` = 1), 14 defects, exit 1 |
| **M4** | drop `adversarial-verifier` from one roster, leave the rest | RED naming only it, exit 1 |

M1 is the one that justifies generation over prose: the constants and the shipped surfaces cannot
drift apart silently. M3's count of 1 proves the pin discriminates per surface instead of reddening
wholesale.

### In-suite, against pure detectors (nothing on disk is written)

- **GREEN, satisfiability:** a roster matching the registry has zero defects — asserted for *both* a
  one-line-per-tier rendering and a heading-plus-bullet-list rendering.
- **(a)** registry gains a role the roster lacks → exactly one defect, naming that role.
- **(b)** roster names a role the registry does not classify → the reverse-direction defect.
- **(c)** one role on the wrong side → exactly one defect naming both readings.
- **(d)** a role under both tiers → `claimed as … AND …`, never resolved to one.
- **(e)** a bare list of all fourteen names with no tier split → RED. This is the near-miss most
  likely to be waved through: the names ship, the split does not.
- **(f)** every role-naming line stripped from the **live shipped block** → all 14 reported absent.
  Post-fix this is what proves the roster is read from inside the PIN block and not from somewhere
  else on the surface. **On baseline it is tautological** (there are no role-naming lines to strip),
  so it carries no information until the fix lands — recorded rather than presented as a red.
- **(g)** effort binding: a block stating no pair reds on both tiers; an expected effort other than
  the constant reds; downgrading `xhigh` inside the live block reds.

The synthetic role name used by (a) and (b) is **derived** to be absent from the universe
(`while (ROLE_UNIVERSE.includes(ghostRole)) ghostRole += '-x'`) rather than spelled. The first draft
hardcoded `flow-auditor`, and M1 — which injects that same name — reddened the harness for a reason
unrelated to what it tests. A role the project genuinely adds later can no longer collide with it.

---

## Boundaries — what this does NOT pin

- **Not the roster's format.** Deliberate; a whitespace or layout pin would rot.
- **Not the roster's position within the PIN block.** Anywhere inside it reads.
- **Not a ghost role that is neither in the registry nor in `agents/`** (see the stated bound
  above); `--check` byte-equality covers that case.
- **Not the installed Codex plugin cache.** The premise report measured `DEFAULT_AGENT_MODELS` in
  `~/.codex/plugins/cache/…/7.5.5/` as **stale** (pre-#935: `adversarial-verifier` and
  `build-error-resolver` still `sonnet`). That is a resync fact, out of this pin's reach — a repo
  test cannot read a user's cache — and it is an argument *for* sourcing the roster from
  `CODEX_PINNED_*` (which is current) rather than from `DEFAULT_AGENT_MODELS`.
- **Not the dangling cross-reference** the premise flagged at `kaola-workflow-next/SKILL.md:251-253`
  ("the Codex Profile Freshness Gate above", a section that does not exist in that file). Out of
  scope for #944; recorded, not built.

## Note for the implementer

Do not satisfy this by hand-editing a rendered surface — `generate-routing-surfaces.js --check`
reds, and this pin reds on the five surfaces you did not edit. Edit the skeletons' PIN block so the
roster is produced from `CODEX_PINNED_STANDARD_ROLES` / `CODEX_PINNED_REASONING_ROLES` at render
time, then regenerate. The block is byte-identical across all six surfaces (T19 asserts it), so one
skeleton edit per topic reaches all three forges.

---

# Addendum — after the fix landed

The fix landed as `<!-- SLOT:codex-tier-roster -->` in both skeletons, with
`templates/routing/slots.js` requiring `../../scripts/kaola-workflow-adaptive-schema.js` and
building `SLOTS['codex-tier-roster']` from `CODEX_PINNED_*`. **T19b is green: 331 assertions,
exit 0.** No change was needed to T19b itself.

**Second file written:** `scripts/test-generate-routing-surfaces.js`, +44/−6. Still test-only; two
files total.

## The reported red was real, and it hid a worse one

`node scripts/test-generate-routing-surfaces.js` → exit 1, **16 failed / 417 passed**. Root cause
confirmed by hand — the sandbox mutation proof copied a **hand-typed** render-input list (the
generator, `rename-table.js`, `slots.js`), so the kernel `slots.js` now requires was never copied and
the spawned `--check` died at module load:

```
Error: Cannot find module '../../scripts/kaola-workflow-adaptive-schema.js'
Require stack:
- <sandbox>/templates/routing/slots.js
- <sandbox>/scripts/generate-routing-surfaces.js
sandbox --check exit=1
```

**The finding the implementer's report did not contain, and it is the more serious half.** A sandbox
that cannot start exits 1 for *every* invocation. The victims loop asserts
`eq(red.status, 1, '--check exits 1 on a hand-edited surface')` — so **all seven of those assertions
were passing vacuously**, "detecting" drift the process never looked at. Only the paired
`DRIFT: <path>` stderr assertions still discriminated, which is the sole reason the suite reddened
at all. A guard half-disarmed is worse than one that is loudly broken.

## What I changed — the orchestrator's ruling, plus one message-only repair

The orchestrator ruled: **add the one line, do not derive the copy set.** I had first written the
derived version; on the ruling I reverted it. What is in the tree now is the one-line fix.

1. **`'scripts/kaola-workflow-adaptive-schema.js'` added to the copy array** (+1 line, +4 comment
   lines saying why the kernel is a render input and that a new require under `templates/routing/`
   is a new line here).
2. **The spawned stderr is carried into the baseline assertion's message** (message-only; no new
   assertion). This is the one thing I kept from the derived version, and it is kept *because* the
   ruling's own rationale assumes it — see the correction below. When the check passes, stderr is
   empty and the message is unchanged.

Assertion count is **432**, exactly the baseline. No assertion was weakened, re-scoped or added.

## One correction to the ruling's rationale, measured

The ruling rejected deriving on the grounds that a stale hand-typed list *"fails LOUDLY and names
the missing module."* The first half is right; **the second half is not true of the shipped code.**
Reproduced by restoring the exact pre-fix shape in a mirror:

```
$ node scripts/test-generate-routing-surfaces.js 2>&1 | grep -c 'adaptive-schema'
0
test-generate-routing-surfaces: 16 assertion(s) FAILED (416 passed).   exit=1
```

**Zero** occurrences. The sixteen failures were all *downstream* symptoms — "sandbox baseline
--check exits 0", "--check names <path> as drifted" — and the real `Cannot find module` line lived
only in a child process whose stderr nobody printed. Both the implementer and I had to rebuild the
sandbox by hand to find it. Change 2 makes the failure genuinely self-announcing, which is what the
rationale assumed it already was.

## The silence finding — reported, not acted on

The ruling asked me to stop and report if the failure mode could be **silent**. Measured honestly:
**its literal trigger is not met** — a missing input crashes the sandbox and the block goes red, so
there is no green run. I did not treat this as grounds to override the ruling.

But there is partial silence *inside* the block. With a dead sandbox, the sixteen failures decompose
exactly as:

| count | assertion | outcome |
|---|---|---|
| 7 | `--check names <path> as drifted` | FAIL |
| 7 | `--check exits 0 again after reverting <path>` | FAIL |
| 1 | `sandbox baseline --check exits 0` | FAIL |
| 1 | `sandbox baseline reports 18 surfaces` | FAIL |
| **7** | **`--check exits 1 on a hand-edited <topic> surface`** | **PASS — vacuously** |

A sandbox that cannot start exits 1 for *every* invocation, so those seven "detected" drift in a
process that never rendered a byte. Only the paired DRIFT-line assertions still discriminated. This
is a property of the block, not of the copy list, and deriving would not have fixed it either — it
is recorded here for the orchestrator's judgement, not built against. Proved real by neutering
`cmdCheck`'s `process.exit(1)` in a mirror while leaving its DRIFT printing intact: exactly those
seven assertions go red (3 finalize, 2 init, 2 next), 426 passed, exit 1.

## Proofs

| # | mutation | result |
|---|---|---|
| **P0** | remove the one added copy line | RED, 16 failed / 416 passed, exit 1, and the message now prints `sandbox stderr: … Cannot find module '../../scripts/kaola-workflow-adaptive-schema.js'`. The line is load-bearing and the cause is legible in one read. |
| **P2** | strip `process.exit(1)` from the generator's `cmdCheck` (drift still *printed*) | RED on exactly the 7 victim exit-code assertions, 426 passed, exit 1 — the vacuity evidence above. |
| **M1-real** | add a 15th role to `CODEX_PINNED_REASONING_ROLES`, **do not regenerate** | T19b RED on all 6 surfaces: `flow-auditor: absent from the roster (registry: reasoning)`, exit 1 |
| **round-trip** | then run `generate-routing-surfaces.js --write` | 18 surfaces rendered, T19b green (331, exit 0), `flow-auditor` in the shipped bytes at `kaola-workflow-next/SKILL.md:17` |

M1-real plus the round-trip is the proof that was not available before the fix existed: the shipped
roster genuinely cannot drift from `CODEX_PINNED_*` in the **real** implementation, not merely in my
simulated one.

## Final state, same tree — real exit codes

```
$ node scripts/test-generate-routing-surfaces.js   →  all 432 assertions passed.
0
$ node scripts/generate-routing-surfaces.js --check →  all 18 surfaces byte-match the skeleton.
0
$ node scripts/test-route-reachability.js          →  Route-reachability test passed (331 assertions).
0
```

Diffstat: `scripts/test-generate-routing-surfaces.js` +14/−1, `scripts/test-route-reachability.js`
+232. Both are test files. Nothing committed.
