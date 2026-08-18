# Implementation — #1005 · axiom convergence for `CLAUDE.md` and `README.md`

**Worktree:** `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1004`
**Base HEAD:** `2d57c604`
**Verification tier:** `tests-green` — the authored guard
(`testAxiomBlockByteIdentity`, uncommitted in `scripts/simulate-workflow-walkthrough.js`) was RED at
baseline and is green after, at full 14-surface scope.

**Files changed (write set honoured exactly):**
`CLAUDE.md` · `README.md` · `CHANGELOG.md`

**Not touched:** `scripts/simulate-workflow-walkthrough.js` (another role's custody — read and run
only; still shows as the same uncommitted diff it arrived with) and `templates/axioms.md`
(byte-untouched — canonical did not move; the two strays came to it).

---

## 1. Verification — four commands, four exit codes read directly (never after a pipe)

Run from the worktree root.

| # | command | before | after |
|---|---|---|---|
| 1 | `node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` | **exit 1** — `2 of 14 surfaces do not embed the canonical …` | **exit 0** — `testAxiomBlockByteIdentity: PASSED (14 surfaces)` |
| 2 | `node scripts/validate-workflow-contracts.js` | exit 0 | **exit 0** — `Workflow contract validation passed` |
| 3 | `node scripts/generate-routing-surfaces.js --check` | exit 0 | **exit 0** — `all 18 surfaces byte-match the skeleton.` |
| 4 | `node scripts/simulate-workflow-walkthrough.js --only testHarnessSelfCheck` | exit 0 | **exit 0** — `testHarnessSelfCheck: PASSED` |

Baseline failure message, in full:

```
Error: 2 of 14 surfaces do not embed the canonical templates/axioms.md First Principles block byte-identically:
    CLAUDE.md — stale: first canonical line absent from it is "These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not …"
    README.md — stale: first canonical line absent from it is "## First Principles"
```

The guard was run **by name**, not via a chain: the fast gate samples the walkthrough at a rotating
1/12 shard, so a green chain would not have been evidence it executed. `npm test` and
`kaola-workflow-run-chains.js` were **not** run — out of scope for this role and ~11 minutes.

## 2. Line counts, reported as a fact

| file | before | after | delta |
|---|---|---|---|
| `CLAUDE.md` | **198** | **195** | −3 |
| `README.md` | 1597 | 1607 | +10 |
| `CHANGELOG.md` | 6182 | 6227 | +45 |

`CLAUDE.md`'s canonical block costs **+2** lines (13 authored lines replaced by canonical's 15) and
the fold in §4 gives back **−5**. Nothing was contorted to fit the 200-line cap: the cap is advisory
(`validate-workflow-contracts.js:347` emits a `notice:` on stderr above 200 and does not throw), and
no rule was deleted to save lines.

`git diff --stat`: `CHANGELOG.md 45+ · CLAUDE.md 29+/−16 · README.md 22+/−6` → 74 insertions,
22 deletions across the three files.

---

## 3. The diff — `CLAUDE.md` `## First Principles`

Lines 52–64 (13 lines) replaced by `templates/axioms.md` verbatim (15 lines). Placement unchanged:
same position, between `## Durable State Contract` and `## Working Principles`.

```diff
 ## First Principles
 
-Tie-breaking axioms, applied in priority order whenever a situation is not already resolved by a rule.
+These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already settled.
 
 1. **Correct first.** Never trade correctness for speed or cost; rework is the most expensive outcome.
 2. **Then save human time.** Remove manual steps and shorten the wait, without weakening axiom 1.
-3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra
-   agents, and higher model tiers are means, not goals.
-4. **Machines decide facts; humans decide values.** Irreversible and value-laden calls belong to the
-   user: ask, in conversation, before taking one. There is no durable consent valve; that sentence is
-   the whole mechanism.
-5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service)
-   be the judge of done. This says do not outsource the judgement — it does not say a door must slam.
+3. **Then spend as little as possible.** Use the cheapest sufficient mechanism — parallelism, extra agents, and higher model tiers are means, not goals.
+4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
+5. **Own your own verdicts.** Never let a system the workflow does not own (CI, an external service) be the judge of done.
+
+**Tie-breaker protocol:** when nothing else covers a situation, resolve it by walking these axioms in order and record a one-line derivation alongside the work. Recording it is useful and never required.
+
+**Dispatch production; keep decisions:** the orchestrator's context is the run's scarcest resource — a handoff costs once, inline residue taxes every later decision — so delegating discretionary production is the default and only the deciding stays inline; weigh the economics per case by judgment, with no justifier, evidence line, or approval attached.
+
+**Parallel by default:** concurrency is the standing default for independent work, and work that genuinely feeds other work runs in order because it has to. Nothing inspects that choice — no proof, no evidence line, no cap: you can tell the difference, and the frontier is in front of you. Width stays sized to the true shape of the task rather than pushed as wide as it will go.
```

Axiom 3 was **unwrapped** (its text was already identical; only the hard wrap differed) — this is
the wrapping change the brief flagged, and it is load-bearing: mutant **M5** below re-wraps it back
to ~100 columns with no word changed, and the guard reds.

No declared divergent region was added.

## 4. The fold — what I kept, what I dropped, and why

`### Concurrency carries no machinery` (`CLAUDE.md`, was `:90`) and the
`**Dispatch production; keep decisions.**` restatement (was `:96`), 10 lines, became 5:

```diff
 ### Concurrency carries no machinery
 
-No disjointness check, no antichain sweep, no serializer taxonomy, no evidence line, no fan-out cap.
-The frontier is *list minus done minus in-flight*, visible by reading. Decompose to genuine
-independence and dispatch that wide — no wider, no narrower. **You decide, uninspected.**
-
-**Dispatch production; keep decisions.** Your context is the run's scarcest resource, so delegating
-discretionary production is the default and what stays inline is the deciding itself. Subagents and
-worktrees are offered and declinable — **a tool you cannot decline and still finish is a gate wearing
-a tool's name.**
+The frontier is *list minus done minus in-flight*, visible by reading — no disjointness check, no
+antichain sweep, no serializer taxonomy. Subagents and worktrees are offered and declinable —
+**a tool you cannot decline and still finish is a gate wearing a tool's name.**
```

**Dropped — each is the canonical paragraph in different words, now sitting 40 lines above:**

| dropped | the canonical sentence it restates |
|---|---|
| "Decompose to genuine independence and dispatch that wide — no wider, no narrower." | `**Parallel by default:**` … "Width stays sized to the true shape of the task rather than pushed as wide as it will go." |
| "**You decide, uninspected.**" | `**Parallel by default:**` … "Nothing inspects that choice" |
| "no evidence line, no fan-out cap" (2 of the 5 enumerated items) | `**Parallel by default:**` … "no proof, no evidence line, no cap" |
| "**Dispatch production; keep decisions.** Your context is the run's scarcest resource, so delegating discretionary production is the default and what stays inline is the deciding itself." | the whole `**Dispatch production; keep decisions:**` paragraph, which says the same and adds the mechanism ("a handoff costs once, inline residue taxes every later decision") and the licence ("no justifier, evidence line, or approval attached") |

**Kept — canonical says none of these, so removing them would lose content, not duplication:**

1. **The definition of the frontier** — `*list minus done minus in-flight*`. Canonical only says "the
   frontier is in front of you". This names the mission-list mechanic, and the same phrase is the
   pinned vocabulary elsewhere in the tree (`templates/routing/required-blocks.js:83`,
   `validate-workflow-contracts.js:460`, `docs/architecture.md:46`). Dropping it would have made
   `CLAUDE.md` the one place that stopped saying what the frontier *is*.
2. **The three rejected mechanisms canonical does not enumerate** — *disjointness check, antichain
   sweep, serializer taxonomy*. These are the specific machinery this project declined to build
   (ADR 0016/0017); canonical's "no proof, no evidence line, no cap" does not name them. I dropped
   only the two members canonical already covers, and kept the enumeration otherwise intact.
3. **The declinability rule** — "Subagents and worktrees are offered and declinable — **a tool you
   cannot decline and still finish is a gate wearing a tool's name.**" This appears **nowhere** in
   the axiom layer; it is ADR 0016's rule (`0016-…md:157`) and is restated on the `workflow-next`
   surfaces. It is genuinely additional.

The heading `### Concurrency carries no machinery` was **kept as-is**: it is the project's own name
for the stance (ADR 0017 §"Concurrency carries no machinery at all", `docs/README.md:31`), and no
script asserts on it — verified by grep, so keeping it costs nothing and preserves navigability. The
two survivors still cohere under it: subagents and worktrees *are* the concurrency tools.

## 5. The diff — `README.md`

Lines 22–30 (9 lines) replaced by lead-in + canonical block + a corrected embedding sentence
(19 lines). The block sits exactly where the old list sat, so the reading order is unchanged:
creed → lead-in → axioms → standing paragraphs → "A few beliefs follow from that order."

```diff
-It is codified as five **first-principles axioms** (`templates/axioms.md`), applied in priority order whenever a situation is not already settled. When they conflict, the higher one wins:
+It is codified as five **first-principles axioms**, canonical in `templates/axioms.md` and reproduced here byte-for-byte. When they conflict, the higher one wins.
+
+## First Principles
+
+These are the workflow's tie-breaking axioms, applied in priority order whenever a situation is not already settled.
 
-1. **Correct first.** … rework is the most expensive outcome there is.
+1. **Correct first.** … rework is the most expensive outcome.
 2. **Then save human time.** … (unchanged)
 3. **Then spend as little as possible.** … (unchanged)
-4. **Machines decide facts; humans decide values.** Irreversible or value-laden calls go to you; leave everything checkable to run automatically.
-5. **Own your own verdicts.** … does not own — CI, an external service — be the judge of done.
+4. **Machines decide facts; humans decide values.** Take irreversible and value-laden calls to the user and ask, in conversation; leave everything checkable to run automatically.
+5. **Own your own verdicts.** … does not own (CI, an external service) be the judge of done.
+
+**Tie-breaker protocol:** …
+**Dispatch production; keep decisions:** …
+**Parallel by default:** …
 
-The axiom layer is embedded byte-identically into every generated project's guidance (all twelve `workflow-init` surfaces, with a machine-enforced drift guard).
+That block is not a paraphrase of the canonical one — it is a byte-identical copy, and so are the twelve `workflow-init` surfaces this project ships (four runtimes × three forges) and the root `CLAUDE.md` it runs on. The test suite holds all fourteen to the same bytes, which means the axioms you just read are themselves one of the guarded surfaces.
```

Axiom 4's restored clause **"and ask, in conversation"** is the substantive correction: the shipped
README said only "Irreversible or value-laden calls go to you", which asserts *that* a value-laden
call reaches the user and drops *how*.

### One structural consequence, and why I made that call

The canonical block **is** an H2 (`## First Principles`), so inserting it closes `## Philosophy`.
`### What you get` (was `:46`) would then have nested under First Principles, which is wrong. I
promoted it to `## What you get` — a one-character change, and the safest of the options I
considered:

- Checked first: **nothing** references a `#what-you-get` anchor anywhere in the repo
  (`grep -rn` over `*.md`/`*.js`/`*.sh`, excluding a CHANGELOG mention of the section's text), and
  GitHub slugs are heading-level independent, so no link changes.
- `validate-workflow-contracts.js` asserts on README's `Active folder coordination`,
  `Parallel active work`, `No lease/session layer remains.` and a three-token concept — none touched;
  check 2 is green.
- The alternative (placing the block after `### What you get`) would have separated the axioms from
  the sentence that introduces them and from "A few beliefs follow from that order", which reads
  worse for no gain.

### The out-of-block sentence the guard cannot see

`README.md:30` claimed "all twelve `workflow-init` surfaces". Verified independently rather than
taken on trust: `routing.FORGES` = `["github","gitlab","gitea"]` and
`scripts/sync-{kimi,opencode}-edition.js` are the two additive runtimes, so
`3 × (2 + 2) = 12` derived surfaces, plus the two named = **14**. The replacement sentence says
fourteen, names both new surfaces, and — the pleasing part — is written in one of the files it
describes.

I deliberately wrote "The test suite holds all fourteen to the same bytes" rather than "on every
local chain": the fast gate samples the walkthrough at a rotating 1/12 shard, so a per-chain claim
would have been an overstatement I could not defend.

## 6. Mutation proof — both new surfaces red independently

Files were snapshotted to the scratchpad before each plant and restored by `cp` (never
`git checkout`, which would have taken the uncommitted work with it); `cmp` confirms byte-exact
restoration afterwards. **One mutation at a time** — an N-site mutant would prove ≥1, never N.

| # | mutation | guard verdict |
|---|---|---|
| M1 | drop only `**Parallel by default:**` from `CLAUDE.md` | RED — `1 of 14`, names **CLAUDE.md**, first missing line = that paragraph |
| M2 | one word in `CLAUDE.md` axiom 1 (`outcome` → `result`) | RED — `1 of 14`, names **CLAUDE.md**, first missing line = axiom 1 |
| M3 | drop only `**Parallel by default:**` from `README.md` | RED — `1 of 14`, names **README.md** |
| M4 | one word in README's intro (`not already settled` → `not yet settled`) | RED — `1 of 14`, names **README.md**, first missing line = the intro |
| M5 | re-wrap `CLAUDE.md` axiom 3 to ~100 cols, **no word changed** | RED — `1 of 14`, names **CLAUDE.md**, first missing line = axiom 3 |

Every mutant named **exactly one** surface — never the other named surface, never a derived one — so
the two additions are independently armed and the 12 derived surfaces are unaffected by either.

**One methodological correction on my own harness:** my first mutation script printed
`-> guard exit=${PIPESTATUS[0]}` from outside the subshell containing the pipe, so it reported the
`grep`'s status (always 0) rather than node's. The verdicts above are read from the printed
assertion text, which is unambiguous, **and** M2 was replayed with the exit code read directly and
no pipe: `mutant guard exit=1`, `restored guard exit=0`, `cmp … exit=0`.

## 7. FINDING — the "22 days" figure in the brief does not reproduce; I wrote 13

The brief (and `findings/premise-1005-history.md:242`, heading *"They agreed. For 22 days."*) says
`CLAUDE.md` and canonical agreed for **22 days**. The dates in that same document are the dates I
measure independently, and they span **13 days**:

- byte-identity begins `06d22d35` — **2026-07-09 21:07:03 +0800** (`docs: refresh CLAUDE workflow-init wording`)
- byte-identity ends `ad196273` — **2026-07-22 17:46:42 +0800** (`docs(principle): propagate Parallel by Default … to axioms template (+6 init embeds) …`)

12 days 20h 39m. The `22` looks like the day-of-month `07-22` transcribed as a duration; the
underlying evidence in `premise-1005-history.md` is sound and only its heading arithmetic is off.

I therefore wrote **13 days** into `CHANGELOG.md`, with both SHAs and both dates so the figure is
checkable, rather than repeating a number I could not reproduce. Method: replayed every commit
touching any of the three files (394 of them) and recorded each transition of
`surface.includes(canonical)` — three transitions total, which also independently confirms
**`README.md` never matched at any commit in which `templates/axioms.md` existed**.

The drift mechanism is worth recording: `CLAUDE.md` **was never edited**. `ad196273` grew canonical
by the three standing paragraphs and propagated to "+6 init embeds" and the generated surfaces; root
`CLAUDE.md` was simply not on that commit's list, so it went stale by standing still.

## 8. Other measurements I took, and what they confirm

Measured against canonical at the pre-fix commit (`HEAD:` blobs, `CLAUDE.md` unwrapped first so the
comparison is of words, not columns):

| | axioms differing | which | standing paragraphs | intro clause |
|---|---|---|---|---|
| `CLAUDE.md` | **2 of 5** | 4, 5 | all 3 **absent** | differs — "not already resolved by a rule" |
| `README.md` | **3 of 5** | 1, 4, 5 | all 3 **absent** | **agrees** — "not already settled" |

That last column is the pairwise inconsistency in its sharpest form: on the intro sentence README was
right where `CLAUDE.md` was wrong, while on axiom 1 `CLAUDE.md` was right where README was wrong.
Neither was a subset of the other.

I also swept for a **fifth** wording: `grep -rln "Correct first" --include=*.md` returns only the 6
tracked init surfaces, `templates/routing/init.skeleton.md` (their source), `templates/axioms.md`,
and the two files in my write set. There is no other prose statement of the axioms in the tree.

## 9. Deliberately not touched

- **`scripts/simulate-workflow-walkthrough.js`** — another role's custody. Read and run only. It
  still carries exactly the uncommitted diff it arrived with; `git status` shows it modified from
  the base commit and unmodified by me.
- **`templates/axioms.md`** — canonical, and its content belongs to a separate issue. Byte-untouched.
- **The 12 derived surfaces** and `templates/routing/init.skeleton.md` — already byte-identical to
  canonical; check 3 confirms all 18 rendered surfaces still match their skeleton.
- **`README.md:46` and `:48`** — see the finding below. Left intact.

## 10. FINDING — a duplication in `README.md` I did **not** fold, and want a ruling on

Now that `README.md` carries the canonical `**Parallel by default:**` paragraph, its own belief
paragraph eight lines further down is a competing wording of the same rule, in the same file:

- `README.md:46` — "**Concurrency carries no machinery at all.** There is no disjointness proof, no
  serializer taxonomy, no evidence line, no fan-out cap, and nothing inspects the decision. The
  frontier is not computed — it is the list minus done minus in-flight, visible by reading.
  Independent work runs concurrently because that is faster; work that feeds other work runs in
  order because it has to. The agent can already tell the difference."
- Canonical, now at `README.md:38` — "…Nothing inspects that choice — no proof, no evidence line, no
  cap: you can tell the difference, and the frontier is in front of you…"

This is exactly the structure step 3 asked me to fold — but step 3 scoped the fold to `CLAUDE.md`
("its own re-authored versions elsewhere in the **same file**") and enumerated only the two
`CLAUDE.md` instances. I did not expand it on my own initiative. Two things argue for leaving it
that I could not settle myself, which is why this is a finding and not an edit:

1. The register genuinely differs — README's version is a pitch to a prospective reader, canonical's
   is an instruction to an orchestrator. That may be a legitimate reason for both to exist.
2. `README.md:48` ("**Tools stay tools.**") is *not* a duplicate — canonical says nothing about
   declinability — so the surrounding block is not uniformly redundant.

**The guard is green either way**: it compares the canonical block only and is blind to the
paragraphs around it. If the owner wants README folded to match the `CLAUDE.md` treatment, that is a
small follow-up edit to `:46` alone and nothing else moves.

---

## Output contract

- **task** — issue #1005: converge root `CLAUDE.md` and `README.md` on `templates/axioms.md`
  byte-for-byte with no declared divergent region, fold the surviving second wordings in
  `CLAUDE.md`, correct README's out-of-block surface-count sentence, and add a `[Unreleased]`
  CHANGELOG entry.
- **verification tier** — `tests-green`
- **files changed** — `CLAUDE.md`, `README.md`, `CHANGELOG.md` (write set exactly; nothing else)
- **verification commands** —
  `node scripts/simulate-workflow-walkthrough.js --only testAxiomBlockByteIdentity` → **0**;
  `node scripts/validate-workflow-contracts.js` → **0**;
  `node scripts/generate-routing-surfaces.js --check` → **0**;
  `node scripts/simulate-workflow-walkthrough.js --only testHarnessSelfCheck` → **0**
- **before** — axiom guard **exit 1**, `2 of 14 surfaces` stale (`CLAUDE.md`, `README.md`); the other
  three checks green.
- **after** — axiom guard **exit 0**, `PASSED (14 surfaces)`; the other three checks green.
- **not run** — `npm test` / `kaola-workflow-run-chains.js` (not this role's, ~11 min). Nothing was
  committed and no `git add` was issued; the orchestrator owns the commit.
