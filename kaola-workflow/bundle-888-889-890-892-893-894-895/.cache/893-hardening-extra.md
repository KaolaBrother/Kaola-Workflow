# Two test-only hardenings answering the adversarial verifier's WEAKER-THAN-CLAIMED verdicts

**Baseline commit:** `fa5157b3f62caab0ff8bc13d330d994c0962ceed`
**Worktree:** `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-888-889-890-892-893-894-895`
**Write set (test files only):**

| file | change |
|---|---|
| `scripts/simulate-workflow-walkthrough.js` | `testActiveFoldersExcludesClosedIssue895` — decorrelate the two sub-cases (TASK A) |
| `scripts/test-agent-profile-parity.js` | `+109` lines — the `checkContractVersionPins` sweep test and its wiring pin (TASK B) |

No production file was touched. Verified by `md5`, after every mutation and at the end:

```
scripts/kaola-workflow-active-folders.js      483d381830b9d9c4fdb1bb89505a8284   (unchanged)
scripts/generate-reviewer-profiles.js         ddfee2301a700d582d9162ac4c21fc0f   (unchanged)
scripts/validate-vendored-agents.js           a1228bca41bbbc2582cb0b6707c3802e   (unchanged)
scripts/validate-kaola-workflow-contracts.js  4cba707234fea509eee27d2d2313186b   (unchanged)
```

**Mutation method.** No `git checkout --`, no `git stash`, and no mutation anywhere in the worktree.
A full tar copy of the worktree (minus `.git`) was taken to
`…/scratchpad/hx/m`, every mutation was applied there from a pristine snapshot by an
anchored substitution that asserts its anchor occurs **exactly once** (`…/scratchpad/hx/mutate.js`,
`…/scratchpad/hx/pinmut.js` — a drifted anchor exits 2 rather than silently mutating nothing), and
restore is `cp pristine → target` with `md5` re-verified. `git status --short` is 65 entries and the
four production files above are byte-identical to their pre-run state.

---

## TASK A — #895: the two sub-cases no longer share a numeric assignment

### What changed

`testActiveFoldersExcludesClosedIssue895` planted `open-project` (issue **10**, open) and
`closed-project` (issue **11**, closed) and used that same pair in **both** sub-cases, so any filter
keyed on a fixed property of a folder — its number's parity or magnitude, its name, its sort
position — picked the same survivor the real exclusion picks, in both sub-cases.

The fixture now carries no state in its names and **inverts the roles between the sub-cases**:

| | sub-case A (batched memo) | sub-case B (per-issue probe) |
|---|---|---|
| `alpha-project` / issue 10 | **open** → survives | **closed** → excluded |
| `beta-project` / issue 11 | **closed** → excluded | **open** → survives |

Both sub-cases are otherwise intact — A still starves every `gh issue view` so only
`prefetchIssueStates`' memo can answer, B still returns `[]` from `gh issue list` so only
`issueIsClosed`' own probe can — and the two `control` non-vacuity assertions are unchanged. The
comment in the scenario states the reason and cites the measurement, so a later edit that
re-correlates the pair reads why it must not.

### The confound mutation, before and after

`scripts/kaola-workflow-active-folders.js:260`, applied in the mirror:

```diff
-    if (opts.excludeClosedIssues && state.issue_number != null && issueIsClosed(state.issue_number)) continue;
+    if (opts.excludeClosedIssues && state.issue_number != null && state.issue_number % 2 === 1) continue; /* T2: number-parity confound */
```

**BEFORE** (scenario as it stood, both sub-cases 10-open / 11-closed):

```
$ node scripts/simulate-workflow-walkthrough.js --only testActiveFoldersExcludesClosedIssue895
testActiveFoldersExcludesClosedIssue895: PASSED
Walkthrough --only subset passed (1 scenarios)
EXIT=0
```

**AFTER** (decorrelated scenario, identical mutation, identical mirror):

```
$ node scripts/simulate-workflow-walkthrough.js --only testActiveFoldersExcludesClosedIssue895
Error: #895 (per-issue): default options must keep ONLY the open issue's folder, got ["alpha-project"]
    at assert (…/scripts/simulate-workflow-walkthrough.js:36:25)
    at Object.testActiveFoldersExcludesClosedIssue895 [as fn] (…/scripts/simulate-workflow-walkthrough.js:1482:5)
EXIT=1
```

The parity filter drops the odd number in both sub-cases; sub-case B now demands the odd number be
the survivor, so it cannot agree with both. Every other number-keyed confound dies the same way, and
so does a name-keyed one — `'closed-project'` was a substring a mutation could have read.

### The original arming mutations, re-run against the hardened scenario

Both still red, unchanged in meaning; the hardening cost nothing that was already proven.

| mutation | result |
|---|---|
| **M1** — `if (false && opts.excludeClosedIssues && …)` (the exclusion is a no-op) | **EXIT=1** — `#895 (batched): default options must keep ONLY the open issue's folder, got ["alpha-project","beta-project"]` |
| **M4** — `if (state.issue_number != null && issueIsClosed(…))` (the option is ignored) | **EXIT=1** — `#895 fixture (per-issue): both folders must be visible with the filter OFF, got ["beta-project"]` |
| restored, unmutated (`md5 483d3818…`) | **EXIT=0** — `testActiveFoldersExcludesClosedIssue895: PASSED` |

**Not addressed** (and out of this task's scope): the verifier's T3/T4/T5 — three regressions inside
`issueIsClosed` (unreachable issue read as closed, empty `gh` answer read as closed, the `OFFLINE`
short-circuit removed) that the scenario still cannot see.

---

## TASK B — #889: `checkContractVersionPins` is held by a test, and so is its wiring

### Where it went, and why there

`scripts/test-agent-profile-parity.js`, appended after the existing reviewer-generator block.

A new `scripts/test-*.js` file would have had to be registered in the `package.json` chains to
satisfy `scripts/test-suite-registration.js` (check A: an unregistered suite is RED on arrival),
which is a shared production-surface edit this task does not own. `test-agent-profile-parity.js` is
the natural home regardless: it already `require`s `generate-reviewer-profiles.js`, already exercises
the generator's other sweep (`checkGeneratedProfiles`) against temp-dir fixtures and in-memory
mutations, and it runs in **both** `test:kaola-workflow:claude` (the fast gate) and
`test:kaola-workflow:claude:full`. No registration change was needed; `test-suite-registration.js`
is green.

### What it asserts

Fixtures in a temp dir (`kw-contract-version-pins-*`), rebuilt per case, swept via
`checkContractVersionPins(pinRoot)` — the root parameter the function already exposes. The real pin
sites are neither read nor written.

| case | assertion |
|---|---|
| non-vacuity | `CONTRACT_VERSION_PIN_SITES` is non-empty and `REVIEWER_BEHAVIOR_CONTRACT_VERSION` is a positive integer — every case below is a difference against those two |
| clean tree | a tree pinning the rendered version at all seven sites returns `[]` |
| stale pin | exactly one `contract_version_pin_stale: <file> …`, naming the file **and** both versions (the pinned one and the rendered one) |
| missing site | `contract_version_pin_site_missing: <file>` — asserted for **every one of the seven**, not just the first, so a sweep that stopped after one entry is caught |
| duplicate declaration | `contract_version_pin_not_unique: <file> declarations=2` |
| declaration reshaped (`const` → `let`) | `contract_version_pin_not_unique: <file> declarations=0` |
| all seven stale | the error count equals the site count — the sweep's stated purpose is one message, not one site per round |
| **wiring** | each of the three call sites still calls the sweep, and the pin is proven to move on its own disarm |

The wiring pin covers the verifier's E1 finding directly. The three call sites are
`scripts/generate-reviewer-profiles.js` (`--check`), `scripts/validate-vendored-agents.js` (claude,
gitlab and gitea chains) and `scripts/validate-kaola-workflow-contracts.js` (the codex chain, the one
chain that does not run the former). Each call is a plain expression, so `[]` disarms it with no
syntax error. **Stated bound:** this is a source-text pin — it sees the call, not whether the caller
acts on the result. It is self-arming: the same regex is applied to an in-memory copy with every call
struck out, and the pin must stop matching, which also proves it is reading the call rather than the
function's own `checkContractVersionPins(root = ROOT)` signature.

### Disarm proof

The verifier's exact disarm, plus the body disarm the brief asked for, each applied alone in the
mirror from a pristine snapshot:

| mutation | suite BEFORE this change | suite AFTER |
|---|---|---|
| **P1** — `checkContractVersionPins`' body replaced by `return [];` | **EXIT=0**, `agent-profile parity tests passed (768 assertions)` | **EXIT=1**, `12 failures, 780 passed` |
| **P2** — `generate-reviewer-profiles.js:882` call → `[]` | (unheld) | **EXIT=1**, `1 failures, 791 passed` |
| **P3** — `validate-vendored-agents.js:109` call → `[]` | (unheld) | **EXIT=1**, `1 failures, 791 passed` |
| **P4** — `validate-kaola-workflow-contracts.js:604` call → `[]` | (unheld) | **EXIT=1**, `1 failures, 791 passed` |
| restored (all three files back to their pristine `md5`) | — | **EXIT=0**, `792 assertions` |

The BEFORE row is the finding reproduced: `git show HEAD:scripts/test-agent-profile-parity.js` run
against the P1-disarmed generator is green at 768 assertions.

First failures under each:

```
P1  FAIL: a site pinning 4 must be reported as contract_version_pin_stale naming
          scripts/kaola-workflow-codex-preflight.js, got []
    FAIL: the stale report must carry BOTH the version the site pins and the version the
          generator renders, got []
    FAIL: a renamed or deleted scripts/kaola-workflow-codex-preflight.js must be reported as
          contract_version_pin_site_missing, got []
    …12 in total

P2  FAIL: scripts/generate-reviewer-profiles.js must still CALL checkContractVersionPins — with
          the call gone the sweep is dead code and a half-finished contract bump reaches a chain
          that reads green
P3  FAIL: scripts/validate-vendored-agents.js must still CALL checkContractVersionPins — …
P4  FAIL: scripts/validate-kaola-workflow-contracts.js must still CALL checkContractVersionPins — …
```

### Not built, deliberately

The verifier's **D9** (`CONTRACT_VERSION_PIN_SITES` is a hand-typed list with no completeness guard,
so an eighth declaration at an unlisted path is invisible) and **D8** (the sweep pins the
*declaration*, not the *use*) are not covered here. Both are outside the brief, and D9's exposure is
a future port rather than an observed failure — recorded, not built.

---

## Verification, real exit codes, in the worktree

| command | exit |
|---|---|
| `node scripts/simulate-workflow-walkthrough.js --only testActiveFoldersExcludesClosedIssue895` | **0** — `PASSED`, `spawns: 7` |
| `node scripts/test-agent-profile-parity.js` | **0** — `agent-profile parity tests passed (792 assertions)` (768 before) |
| `node scripts/test-suite-registration.js` | **0** — `40 test-*.js files, 37 registered, 3 exempt`; `472 assertions` |
| `node scripts/validate-vendored-agents.js` | **0** — `Vendored agent validation passed for 14 agents` |
| `node scripts/generate-reviewer-profiles.js --check` | **0** — `Reviewer profile generation check passed.` |
| `node scripts/validate-kaola-workflow-contracts.js` | **0** — `Kaola-Workflow Codex contract validation passed` |
| `node scripts/test-spawn-classification.js` | **1** — **not mine**, see below |

**The one red, attributed.** `test-spawn-classification.js` reports
`scripts/test-sink-merge.js: 4 unclassified spawn site(s) exceeds the ceiling of 3 … lines 101, 227,
786, 1323`. That file is held by another agent in this worktree and is not in my write set. Measured,
not assumed: in the mirror, with `git show HEAD:scripts/test-sink-merge.js` in place **and my edited
walkthrough**, the suite is `EXIT=0` — `587 spawn sites across 60 files, 165 classified, 136 slot(s)
of slack`. The violation belongs entirely to the concurrent `test-sink-merge.js` edits; whoever owns
those four new spawn sites owes them a classification.

The full walkthrough was **not** run at full scope — other agents are concurrently editing production
scripts here, so a full-scope red could not be attributed. That run belongs to whoever integrates the
bundle.
