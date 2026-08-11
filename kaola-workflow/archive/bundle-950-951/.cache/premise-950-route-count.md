# Investigation: #950 — is `docs/conventions.md`'s "unchanged 325 assertions" stale by 6?

**Verdict in one line: the issue is RIGHT that the sentence is broken, and WRONG about why.
The defect is not an off-by-6 count. The load-bearing claim — "`test-route-reachability` stays
green" — is REFUTED: under the mutation that suite now FAILS, exit 1. Substituting 331 would
produce a sentence that is false in a worse way than the one it replaces.**

## Setup

- Repo: `/Users/ylpromax5/Workspace/Kaola-Workflow`, branch `main`, worktree clean apart from the
  untracked `kaola-workflow/bundle-950-951/`.
- Commit under measurement: `580c6019bfced5a25320705b824451504bfbe82c`
- Node: `v24.14.0`
- Scratch mirror (all mutations; the real tree was never edited):
  `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/3f288513-a84e-4ab1-8ed2-b287bafb74c4/scratchpad/mirror`
- Historical trees extracted with `git archive <commit> | tar -x -C <scratch>` (no `git checkout --`,
  no worktree added to the real repo).

---

## 1. The actual text — CONFIRMED, with a line-number correction

The issue cites `docs/conventions.md:325`. The clause spans **lines 325–326**; the literal token
`325` sits on **line 326**. Verbatim, lines 319–326, under the heading
`## Aiming a guard — what it reads, and how wide (#887)`:

> **A guard reads what ships, not what was authored.** The question worth asking of a content guard is
> not *what does it catch* but *what renders to a consumer that it never reads*. Scanning the authored
> source misses generator prose, and a scanned region is a choice whose complement is where the defect
> sits. Where a universe is derived from the artifact under test, partially anchored is not anchored:
> one **absolute** count belongs in a different file. `test-generate-routing-surfaces`'s `registry
> derives 18 surfaces` is that anchor for the routing registry, and it is mutation-proven — delete a
> forge from both edition tables and it fails at 18→12 while `test-route-reachability` stays green at
> an unchanged 325 assertions.

**What the sentence is arguing.** It is the worked example for the rule *"where a universe is derived
from the artifact under test, partially anchored is not anchored: one absolute count belongs in a
different file."* The rhetorical force is the contrast: the *absolute* anchor (18) catches the
forge deletion, while the *derived* universe (`test-route-reachability`) cannot — its expectation and
its measurement shrink in lockstep, so it stays green. The word **"unchanged"** is doing the work: it
asserts the mutated assertion count equals the plain one, which is the symptom of a blind guard.

**Which check "fails at 18→12":** `scripts/test-generate-routing-surfaces.js:239` —

```js
eq(GENERATED_SURFACES.length, 18, 'registry derives 18 surfaces (3 topics x 6)');
```

**"Both edition tables"** = `COMMAND_EDITIONS` (`scripts/generate-routing-surfaces.js:66`) and
`SKILL_EDITIONS` (`:71`), each a three-row `{ forge, dir }` literal ordered github, gitlab, gitea.
`GENERATED_SURFACES` (`:107`) is their cross-product with the three `TOPICS` → 3 topics × (3+3) = 18.

**Two sibling sites carry the same claim** and are equally affected — see § "What the fix must say":

- `docs/conventions.md:315` (table row): ``| `test-route-reachability` | a universe derived from the
  edition tables | the forge term is the registry measuring itself — 12→8 surfaces, unchanged
  assertion count |``
- `scripts/test-route-reachability.js:757–759` (comment): "deleting a forge from the edition tables
  shrinks the universe from twelve surfaces to eight and **this suite stays green at an unchanged
  assertion count** — mutation-proved."

---

## 2. Plain total — CONFIRMED (331)

| Measurement | Command | Result | Exit |
|---|---|---|---|
| plain total @ `580c6019` | `node scripts/test-route-reachability.js` | `Route-reachability test passed (331 assertions).` | 0 |
| plain total, scratch mirror (unmutated) | same, in mirror | `Route-reachability test passed (331 assertions).` | 0 |
| generator suite baseline, mirror | `node scripts/test-generate-routing-surfaces.js` | `test-generate-routing-surfaces: all 434 assertions passed.` | 0 |

The issue's "331, exit 0" is confirmed at HEAD, and the mirror reproduces it exactly — so the mirror
is a valid substrate for the mutation.

---

## 3. The count under the mutation — the number that actually matters

**Mutation performed:** deleted the `gitea` row from `COMMAND_EDITIONS` and from `SKILL_EDITIONS` in
the mirror's `scripts/generate-routing-surfaces.js` (exactly the two lines; each verified to occur
exactly once before removal). Confirmed effect:

```
GENERATED_SURFACES.length = 12
FORGES = github,gitlab
```

| Measurement | Command | Result | Exit |
|---|---|---|---|
| the 18→12 check | `node scripts/test-generate-routing-surfaces.js` | `FAIL: registry derives 18 surfaces (3 topics x 6)` — `expected: 18 / actual: 12`; 20 FAILs total | **1** |
| **reachability under mutation** | `node scripts/test-route-reachability.js` | `Route-reachability test FAILED: 1 failure(s), 324 passed.` | **1** |

### 3a. `18→12` — CONFIRMED, verbatim

The doc's numbers are exact: the assertion fails reporting expected 18, actual 12. (19 further
downstream assertions in that suite also red; the doc names only the anchor, which is fair — that is
the assertion it is crediting.)

### 3b. `test-route-reachability stays green` — **REFUTED**

It does not stay green. It exits **1** with exactly one failure:

```
FAIL: T19b universe: the routing instruction ships on 6 generated surfaces — found 4
  (plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md,
   plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md,
   plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md,
   plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md)
```

**Why it now catches what the doc says it cannot.** `scripts/test-route-reachability.js:551` asserts
`routingSurfaces.length === codexEditions.length * 2`, and `codexEditions`
(`scripts/test-route-reachability.js:141–145`) is a **hand-typed three-row literal**, not read from
the generator's tables. So the expectation stays 6 while the measurement falls to 4 — the two terms
do *not* shrink in lockstep. That is precisely the "one absolute count" the surrounding rule
prescribes, and it now lives **inside the suite the doc holds up as the unanchored counter-example.**

### 3c. The trap the issue warns about — and a sharper one

The issue warns that 325 is "the count observed under the mutation, not the plain suite total".
Measurement says that framing is **QUALIFIED / partly wrong**: at the commit where the sentence was
written, plain and mutated were *the same number*, 325 — that identity is what "unchanged" asserts
(see § 4). So 325 was legitimately both.

There is a nastier coincidence to flag, because it will mislead the next reader:

- plain @ HEAD = **331** assertions (331 passed, 0 failed)
- under mutation @ HEAD = 324 passed + 1 failed = **325 assertions executed**

The mutated tree drops 6 assertions (the `for (const { row, content } of routingSurfaces)` loop at
`:559` runs 4 rows instead of 6, at 3 assertions each ⇒ −6), so the total lands on 325 again — **the
doc's exact number, arrived at for an unrelated reason, while the suite is RED.** Anyone
"verifying" the doc by reading a total of 325 under the mutation would confirm a sentence whose
central claim is false. The "unchanged" property is also gone: the count now *changes*, 331 → 325.

---

## 4. Historical check — 325 was RIGHT, and the whole sentence was TRUE when written

`git log -S"unchanged 325 assertions" -- docs/conventions.md` → written at **`40486659`**
(2026-08-01, *"fix(bundle): close #886 and #887 — verdicts, corrections, and one real gap"*).

| Commit | Date | plain | under mutation | exit |
|---|---|---|---|---|
| `40486659` (sentence written) | 2026-08-01 | **325** assertions | **325 assertions, GREEN** | 0 |
| `97df0d6f^` | 2026-08-10 | — | 298 assertions, GREEN | 0 |
| `97df0d6f` | 2026-08-10 | — | **324 passed, 1 failure** | **1** |
| `a339e5df` (pre-bundle base) | 2026-08-10 | **331** | **324 passed, 1 failure** | **1** |
| `580c6019` (HEAD) | 2026-08-11 | **331** | **324 passed, 1 failure** | **1** |

So: at `40486659` the plain total was 325 **and** the mutated run was green at 325 — "stays green at
an unchanged 325 assertions" was **exactly, literally true**, both the number and the claim.

**Break point pinned by bisect on one axis (commit), mutation held constant:** `97df0d6f^` green
under mutation, `97df0d6f` red. `git log -S"T19b universe: the routing instruction ships on"` confirms
that assertion was **added at `97df0d6f`** (2026-08-10, *"fix(resolver,editions,routing): close the
five #935 audit findings"*). `git merge-base --is-ancestor 97df0d6f a339e5df` → YES, so the sentence
was already false at the pre-bundle base — **independently of the #945–#948 bundle, as the issue
claims, though for a reason the issue does not identify.**

### The 12→8 figure (line 315 / the source comment) — still numerically CORRECT

Computed on the mutated mirror: `FORGES.length(2) × (trackedRuntimes(2) + runtimeEditionModules(2)) = 8`,
down from `3 × 4 = 12`. That MANIFEST-universe assertion did **not** fail (the run had exactly one
failure, T19b). So the *mechanism* described is intact; only the enclosing "unchanged assertion
count / stays green" claim is now false at suite level.

---

## Inferences (labelled — these are mine, not measurements)

- **The doc sentence was not stale-by-drift; it was invalidated by a fix.** `97df0d6f` anchored the
  forge term inside `test-route-reachability`, which is the very repair the surrounding rule
  prescribes. The prose still describes the pre-fix world. — confidence: **high**; refuted by showing
  `codexEditions` is registry-derived (it is a literal at `:141`) or that some other commit between
  `97df0d6f^` and `97df0d6f` caused the red.
- **The walkthrough's sibling comment (`simulate-workflow-walkthrough.js:~12017`, "this floor stays
  green") is probably still true**, because its expectation and measurement are both registry-derived
  (`FORGES.length * (2 + runtimeEditionCount)` vs `surfaces.length`). — confidence: **medium**;
  **UNMEASURED** — I did not run the walkthrough under the mutation (cost). Do not repair that comment
  on my say-so; measure it.

---

## What the fix must say

Both candidate repairs the brief offers are **wrong as stated**, because both assume the only defect
is the numeral:

- **(a) "write the count the mutation actually yields" — REJECT.** The mutation yields 325 executed
  assertions *with one failure and exit 1*. Writing "325" back (or "331") keeps the clause
  "`test-route-reachability` stays green", which measurement refutes. This is the trap in §3c: the
  arithmetic accidentally still lands on 325.
- **(b) "restate the clause to carry no absolute" — INSUFFICIENT ALONE.** Dropping the numeral leaves
  "stays green", which is the false part. Removing the number removes the falsifiable half and keeps
  the wrong half — the opposite of what `docs/conventions.md`'s own *specify the result, never the
  method* rule wants.

**What the measurement supports is (c): the example must be re-pointed, because its factual basis
has moved.** The rule it illustrates is unchanged and still correct; what changed is that
`test-route-reachability` is no longer an instance of the failure. Two honest options, in preference
order:

1. **Tell it as a resolved case** — the strongest version, and the one the evidence hands you: the
   derived universe *was* blind (green at an unchanged 325 across the mutation, at `40486659`), and
   `97df0d6f` fixed it by giving the forge term its own absolute (`codexEditions`, a hand-typed
   literal at `test-route-reachability.js:141`), so the mutation now reds **both** guards — 18→12 in
   `test-generate-routing-surfaces`, and `T19b universe: … 6 … found 4` in `test-route-reachability`.
   This keeps the anchor claim for `registry derives 18 surfaces` (measured true, exit 1 at 18→12) and
   states the second guard's status as it now is.
2. **If the example must stay a live counter-example**, it needs a *different* guard that is still
   registry-derived — and that guard must be measured before it is named. Do not reuse
   `test-route-reachability`.

**Whichever is chosen, three sites must move together, or the repair reintroduces the divergence:**

| Site | Current text | Status |
|---|---|---|
| `docs/conventions.md:325–326` | "stays green at an unchanged 325 assertions" | **false** (suite reds, and the count changes 331→325) |
| `docs/conventions.md:315` (table row) | "12→8 surfaces, unchanged assertion count" | **half false** — 12→8 confirmed; "unchanged assertion count"/blind is false |
| `scripts/test-route-reachability.js:757–759` | "…twelve surfaces to eight and this suite stays green at an unchanged assertion count — mutation-proved" | **false at suite level** — and it is the comment *inside the suite that now catches it* |

The third is the one most likely to be missed: it is a source comment asserting a mutation proof that
no longer holds, sitting 200 lines from the assertion that broke it.

## Open / not measured

- The walkthrough (`simulate-workflow-walkthrough.js:~12010–12021`) under the forge-deletion mutation
  — not run; its comment's "this floor stays green" is inferred, not measured.
- Whether `97df0d6f`'s author knew the T19b anchor invalidated this prose (a review question, not a
  measurement).
- Which of the 20 generator-suite failures beyond the named anchor are load-bearing — out of scope;
  the doc credits only `registry derives 18 surfaces`, which was verified individually.
- The mutation used `gitea` as the deleted forge. A different forge choice was not tested; the
  arithmetic (3→2 forges) is symmetric, but I did not measure `github` or `gitlab` deletion.
