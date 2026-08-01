# tdd-parity — pins for the closure-audit F1 edition parity fix and the F2 project-name validation

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-900-901-902-903`
Branch: `workflow/bundle-900-901-902-903` · baseline commit **`9b68b0962f52443e2b4ca91c2fa924440cea829b`** · **nothing committed**
Scratch: `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/037a4418-0c87-497c-95ca-200a8a6b607f/scratchpad/tddparity/`

**Write set — three test files, nothing else.** No production code, no `*closure-audit.js`, no
`*active-folders.js`, no docs. `git status --short` carries the same 42 entries it did before I started.

| file | +/− vs HEAD (whole file, all agents) | what I added |
|---|---|---|
| `scripts/simulate-workflow-walkthrough.js` | +821 / −5 | fixture (v), source-text required-set pin, throw-list entry, one new scenario, prose cleanup |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | +846 / −0 | two new scenarios (§8.12, §8.13), throw-list entry |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | +846 / −0 | two new scenarios (§8.12, §8.13), throw-list entry |

**14 pins across 3 editions: 10 baseline-red, 4 mutation-armed.** Every mutation-armed pin is one the
canonical or the port could not be red on, for a stated reason.

---

## Method — how a PRE-FIX state was reached without reverting anything

Nothing in the worktree was reverted; `git checkout --` was never used. Two scratch tools:

- `mkmirror.js <dest> <relDir>` — copies one edition's script directory into scratch and **symlinks**
  every other top-level entry (and every uncopied sibling at each level of the path), so only the
  copied scripts can be edited. `.git` is deliberately not linked.
- `transform.js <file> <mode>` — applies exactly one named transform, asserting each replacement fires
  **exactly once** or throwing:

| mode | what it does | what it is |
|---|---|---|
| `pre2` | removes the `isSafeName` assert from `parseArgs` and its import | the **true pre-fix state** for change 2, all editions |
| `mut1` | replaces the shipped one-file `archiveRequiredContent` with the plan-demand form | for a **port**, its true pre-fix state — verified **byte-identical to `git show HEAD:<port>`** (`diff` clean, 24 lines, both ports). For the **canonical** it is an arming mutation: HEAD's canonical function is *already* the one-file form, so the canonical never had the defect |
| `mut1b` | the same plan demand with the plan filename assembled (`'workflow-plan' + '.' + 'md'`) so no `'*.md'` literal appears | isolates the **behavioural** fixture arm — under `mut1` the source-text pin reds first and would mask it |
| `mut1c` | a second required name keyed on `active_plan_hash` alone, which **no fixture plants** | isolates the **source-text** pin — the behavioural arms stay green by construction |

- `isolate.js` — comments out top-level test invocations in a **mirrored** port suite so an unrelated
  environment-sensitive test cannot mask the measurement (`testInstallProfilesFeaturesTableHandling`
  reads paths outside the mirror and fails there for reasons that have nothing to do with this work).
  Only invocation **lines** are touched: `diff` of the mirror against the shipped file, with all
  top-level invocation lines stripped from both sides, is **empty** — every test function body in the
  mirror is byte-identical to the one that ships.

All measurements ran with `KAOLA_WORKFLOW_OFFLINE=1` set **explicitly** by the runner
(`runClosureAuditOffline` and `runClosureAuditRaw` both set it, they do not inherit it). Neither guard
under test is disabled by it: `archiveRequiredContent` reads disk only, and `parseArgs` throws before
`getRoot()` and before any remote call. Those are the same conditions `impl-parity` measured under.

---

## Pin 1 — the F1 parity fix: a `plan_hash`-bearing, plan-less archive is not a finding

### Canonical — `testClosureAuditArchiveContentDrift832`, fixture (v) `issue-8328`

State carries `plan_hash: cccc…(64)`, no `workflow-plan.md`, nothing else. Asserted absent from
`archive_content_incomplete`, with `issue-8324` (anchor-less, same sweep) asserted **present** as the
control that the class is live.

**Green on both baselines, as expected — the canonical never had the demand. MUTATION-ARMED:**

```
RED: testClosureAuditArchiveContentDrift832 (mirror m-canon-mut1b, mut1b)
  #832: a plan_hash-bearing archive with NO workflow-plan.md must produce NO finding … got:
  {"project":"issue-8328","missing":["workflow-plan.md"]}
baseline: 9b68b0962f52443e2b4ca91c2fa924440cea829b (canonical scripts/, plan demand re-introduced)
```

That is the *identical* finding shape the two ports emitted before the fix.

### Canonical — the source-text required-set pin (same scenario)

Extracts every `'*.md'` literal from the shipped `archiveRequiredContent` body and asserts the set is
exactly `['workflow-state.md']`. This is the arm that would have caught the ports' drift **without any
fixture**: the demand there was conditional on a field nothing planted. MUTATION-ARMED, twice:

```
RED (mut1):  … got ["workflow-plan.md","workflow-state.md"]
RED (mut1b): … got []          ← stale-LOUD: an unreadable/renamed set reds, it does not pass quietly
baseline: 9b68b096 canonical scripts/ + the named transform
```

### Both ports — `testClosureAuditPlanHashArchiveNeedsNoPlan903` (§8.12)

Archive `issue-777` (`plan_hash` set, plan-less) beside `issue-778` (anchor-less) in **one sweep**, so
the control proving the class still reports sits in the same measurement. Unscoped list, counts, the
**scoped verdict term**, the out-of-scope half, and this edition's own source-text required-set pin.

**BASELINE-RED on the port's genuine pre-fix function** (byte-identical to `git show HEAD:`):

```
RED: testClosureAuditPlanHashArchiveNeedsNoPlan903 — gitlab (mirror m-gl-mut1)
  AssertionError: #832: a plan_hash-bearing, plan-LESS archive must produce NO finding … got:
  [{"project":"issue-777","missing":["workflow-plan.md"]},{"project":"issue-778","missing":["workflow-state.md"]}]
  + actual - expected:  [ + 'issue-777',  'issue-778' ]
RED: testClosureAuditPlanHashArchiveNeedsNoPlan903 — gitea (mirror m-gt-mut1), same signature
baseline: 9b68b096 (each port's archiveRequiredContent restored, diff-clean against HEAD)
```

**The scoped leg was measured separately**, because the unscoped assertion above it reds first and
would otherwise hide whether the scoped one is armed. Same fixture, the two pre-fix mirrors' CLIs run
directly (`scratchpad/tddparity/scopedfx/`):

| edition | PRE-FIX `current_project_drift.archive_content_incomplete` (`--project issue-777`) | SHIPPED |
|---|---|---|
| gitlab | `[{"project":"issue-777","missing":["workflow-plan.md"],"attribution":"name_match"}]` | `[]` |
| gitea | `[{"project":"issue-777","missing":["workflow-plan.md"],"attribution":"name_match"}]` | `[]` |

So `deepStrictEqual(…, [])` provably reds pre-fix on both. (`current_project_clean` reads `false` in
both states offline — the two remote classes return `skipped_offline` and fail-closed forbids clean —
so the pin is on the **term**, not the boolean, exactly as `impl-parity` qualified it.)

**The ports' source-text pins are MUTATION-ARMED, re-verified per port** rather than assumed to
transfer:

```
RED: testClosureAuditPlanHashArchiveNeedsNoPlan903 — gitlab (mirror m-gl-mut1c)
  #832: this edition's required set must be exactly the identity anchor … got ["workflow-plan.md","workflow-state.md"]
RED: … — gitea (mirror m-gt-mut1c), same signature
```

`mut1c` keys the demand on `active_plan_hash`, which no fixture in either suite sets — so the
behavioural arms ran green and the red is the source pin alone. That is the drift class that survived
here: a conditional requirement nobody built a fixture for.

### The "second unconditional requirement" concern

Covered two ways, both proven: the source-text pin reds on *any* second required name (`mut1`,
`mut1c`), and behaviourally the canonical's fixture (iv) `issue-8327` (state-only archive) already
reds if anything unconditional is added. I did not add a further pin for it — it is not an
unobserved-failure gap, it is the same pin twice.

### Coverage note

The **codex** copy `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` is not pinned by a
suite of its own; it inherits these pins through `validate-script-sync.js`'s byte-identity assertion
against the canonical (green, 27 byte-identical groups). That is pre-existing structure, not something
this work changed.

---

## Pin 2 — the F2 project-name validation, both halves

### The exported-`parseArgs` throw lists — BASELINE-RED in all three

`['--project', '../../outside']` added to the existing lists. The **accepting control** is already in
the same function three/four assertions above (`--project b` still parses), so none of these lists can
be satisfied by a validator that rejects every name; I added no duplicate control.

```
RED: testClosureAuditScopingHelpers903 — canonical (m-canon-pre2)
  Error: #903: parseArgs must throw for ["--project","../../outside"]
RED: testClosureAuditScopingHelpers903 — gitlab (m-gl-pre2b) / gitea (m-gt-pre2-helpers)
  AssertionError: Missing expected exception: #903: a --project value that is a PATH rather than a folder name must throw
baseline: 9b68b096 + pre2
```

### The CLI-level case — `testClosureAuditProjectNameIsNotAPath903`, new in all three

Exit **1**, **empty stdout**, stderr naming the rule, and the outside record's issue number absent
from stdout. **BASELINE-RED in all three:**

```
RED: testClosureAuditProjectNameIsNotAPath903 — canonical (m-canon-pre2), gitlab (m-gl-pre2), gitea (m-gt-pre2-cli)
  #903: a --project that is a PATH must exit 1 — `../../outside` reported a verdict on a
  workflow-state.md outside the repository at exit 0, got 0
  stdout: { … "scope": { "project": "../../outside", "issue_numbers": [4242],
                          "state_file": "../outside/workflow-state.md" } … }
baseline: 9b68b0962f52443e2b4ca91c2fa924440cea829b + pre2
```

**Why it is not in the `:8370` / port malformed-value loops.** I placed it in a dedicated scenario
instead, deliberately. Those loops run on a bare git-repo fixture with no traversal target, and
**pre-fix that argv exits 1 there anyway** — for the unrelated "no workflow-state.md found for
project" reason (or exit 0 if OS-tempdir residue happens to sit at `<tmpdir>/outside/`, which makes it
non-deterministic as well). A loop entry there would have been a pin that passes against the very
defect it names. The new scenario's fixture is a **container** holding `repo/` and `outside/` as
siblings, so `../../outside` lands on a file the scenario planted — which is what makes the red above
real. It asserts exactly what the brief asked for (exit 1 + empty stdout), in a place where it means
something.

**POSITIVE CONTROL, same fixture and same runner, in all three:** `--project issue-555` exits **0**
and resolves `scope.state_file = kaola-workflow/issue-555/workflow-state.md` with the record's own
members (`[555]` canonical, `[555,556]` ports). The control is a *different* argv through the *same*
process, and the env var is set by the runner, not inherited or defaulted — no `|| 'default'` fallback
is in play anywhere in these three scenarios.

---

## Cleanup — the stale prose reference is gone

`simulate-workflow-walkthrough.js:7644` named `listRecordedNodeEvidence`, and the two prose bullets
beside it described the plan demand and the ledger demand — both mechanisms are gone from all four
closure-audits (`grep -c 'plan_hash\|workflow-plan'` = **0** in each). The comment block now states
the required set as it ships (one file) and points at fixture (v).

Repo-wide `listRecordedNodeEvidence` in `*.js`: **0 hits.** The only remaining mentions are in
archived run records (`kaola-workflow/archive/issue-877/*`, `kaola-workflow/.origin/877/*`) — historical
documents, not code, and not in my write set.

I removed prose alongside a mechanism that was already gone. I edited and relaxed **no existing
assertion**; the `// DELETED:` note the earlier `tdd-guide` left at `:7708` is untouched.

---

## Suites — real exit codes, serial, bare `echo $?` (no pipes anywhere)

| suite | exit | detail | vs. the state I was handed |
|---|---|---|---|
| `node scripts/simulate-workflow-walkthrough.js` (**full scope**) | **0** | `{"index":1,"total":1,"scenarios":198,"ran":198,"passed":198,"failed":0}`, 2059 spawns | 197→198 scenarios (+1 new), 2052→2059 spawns (+7 = 5 `initGitRepo` + 2 audit runs) |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | **0** | **15** × `903: PASSED`, 561 spawns | 13→15 (+2 new), 547→561 (+14 = 2 × (5 + 2)) |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | **0** | **15** × `903: PASSED`, 562 spawns | 13→15, 548→562 (+14) |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | **0** | 112 spawns | **identical** — nothing silently skipped |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | **0** | 127 spawns | **identical** |
| `node scripts/validate-script-sync.js` | **0** | 15 common scripts, 27 byte-identical groups, 6 forge export-superset families; 4 Oracle Kernel copies identical at HEAD | unchanged |
| `node scripts/test-spawn-classification.js` | **0** | 10 mutation assertions, **601 spawn sites, 176 classified**, 133 slots slack | **byte-for-byte the same counts** — every new call reuses an existing annotated helper, so no spawn site was added and no ceiling was touched |
| `node scripts/validate-workflow-contracts.js` | **0** | — | unchanged |
| `node scripts/test-shard-lib.js` | **0** | — | run because the registry grew by one scenario; nothing pins the count |

Every spawn-count delta is fully accounted for by the new scenarios, and the two forge walkthroughs are
unchanged — so no suite silently skipped work.

---

## Implementation defects found: none. Two observations, reported not fixed.

1. **`isSafeName` accepts a whitespace-only `--project` value** (`' '` passes: non-empty, no slash, not
   `.`/`..`). It then falls through to the unresolvable-project path and exits 1 with the "no
   workflow-state.md found" message rather than the safe-folder-name message. Same exit code, same
   empty stdout, so the published contract holds — this is a message-precision observation, not a
   defect, and I did not pin it.
2. **`archive_summary_citation_missing` and `archive_content_incomplete` are the only two archive
   classes attributed by name**, and both now report from a required set of one file. Nothing about
   that is wrong; noting it because the two classes are now the entire archive-content story and a
   future demand added to either is only visible to a source-text pin, not to a fixture.

## Not verified / out of scope

- I ran no chain (`npm test`), no `test:kaola-workflow:claude:full`, and no opencode/kimi suite. The
  diff is test-only in three files, two of them edition copies; scheduling a receipt is the
  orchestrator's call.
- The scoped `current_project_clean` **boolean** still flips only on an online run (both remote classes
  return `skipped_offline` offline and fail-closed forbids clean). I pinned the class **term** that
  feeds it, and said so above; I built no online forge mock. **Superseded by round 2 below** — the
  boolean is now pinned on the online axis, with a mock, in all three editions.
- Nothing was committed.

---
---

# ROUND 2 — the two C4-adjacent scoped-verdict defects (D1 false clean, D2 ambiguity blindness)

Same three files, same baseline commit **`9b68b0962f52443e2b4ca91c2fa924440cea829b`**, nothing
committed. Repairs under pin are described in `.cache/fix-audit.md`.

**16 pins added across the three editions: 13 baseline-red, 3 mutation-armed** (the mock-liveness
assertion in each edition, which no state of the shipped code can red — only a broken mock can).

Three legs needed **isolation** because an earlier assertion in the same scenario reds first on the
pre-fix state and masks them; each was proven separately rather than assumed, with a one-line partial
revert or a direct CLI measurement. Those are marked below.

| edition | file |
|---|---|
| canonical | `scripts/simulate-workflow-walkthrough.js` (+960/−5 vs HEAD, whole file, all agents) |
| gitlab | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (+984/−0) |
| gitea | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (+986/−0) |

Nothing else touched. The worktree's dirty count moved 42 → 44 while I worked; the two additions are
`CLAUDE.md` and `docs/conventions.md`, **another agent's**, not mine. The main root holds no code
change of mine at all (its only dirty entry is the untracked run folder `kaola-workflow/bundle-900-901-902-903/`).

## A method error I made, caught, and corrected

My bash calls' working directory is **not stable across calls** in this harness, and the main root at
`/Users/ylpromax5/Workspace/Kaola-Workflow` holds a *pre-bundle* copy of all three files (no `#903`
work in it at all — `runClosureAuditRaw` does not exist there). So a relative `node scripts/…` run can
silently execute the wrong copy. It bit me twice:

- A `grep -c 'spawnSync('` I ran to check my spawn-site count read **main's** copy and appeared to show
  a site had been deleted. Re-measured with absolute paths: **115 / 63 / 62 sites, byte-identical to the
  counts before my round-2 edits** — I added none.
- A `test-spawn-classification.js` run reported 591 sites / 169 classified. That was main. Against the
  worktree it is **603 / 176**.

Every suite result in the table below was then **re-run with absolute worktree paths**. The earlier
runs were in fact against the worktree — provable independently, because their logs name
`testClosureAuditProjectNameIsNotAPath903`, a scenario that exists only there — but the table reports
the absolute-path re-runs, not those.

---

## Pin 1 (D1) — a mistyped `--project` plus any `--issue` must never read clean, and the pin MUST be online

### The vacuity trap, measured on all three editions

Same argv (`--project bundle-700-71 --issue 701`), same fixture, both axes
(`scratchpad/tddparity/d1-axis.sh`):

| edition | PRE-FIX online | PRE-FIX **offline** | SHIPPED online | SHIPPED offline |
|---|---|---|---|---|
| canonical | **clean=true**, `project_unresolved` ABSENT | clean=false | clean=false, `project_unresolved=true` | clean=false, `project_unresolved=true` |
| gitlab | **clean=true**, ABSENT | clean=false | clean=false, `=true` | — |
| gitea | **clean=true**, ABSENT | clean=false | clean=false, `=true` | — |

The offline column is the trap: pre-fix it already reads `false`, for the unrelated `skipped_offline`
reason. **An assertion written through `runClosureAuditRaw` (which hardcodes
`KAOLA_WORKFLOW_OFFLINE=1`) passes against the defect.** Every verdict leg therefore goes through
`runClosureAudit`, which sets `OFFLINE=0` explicitly, plus a mock on each forge's own hook. In all
three runs `extra_classes=[]` — no `unresolved_closed_state` — so every probe resolved and the axis was
genuinely live.

### The pins, per edition

| pin | proof |
|---|---|
| `scope.project_unresolved === true` on the unresolvable online run | **BASELINE-RED** (all 3) |
| `current_project_clean === false` on that run | **BASELINE-RED** by direct measurement (table above), and **isolated** — see below |
| every scoped class is an evaluated empty array / exact key set, so `clean:false` is the *unresolved* verdict and not a failed probe | **MUTATION-ARMED** (dead-mock, all 3) |
| unit: `driftIsClean({a:[]}, {project_unresolved:true}) === false` | **BASELINE-RED** (all 3) |
| `scope.project_unresolved === true` on the **offline** answer too (the label is a fact about the NAME) | **BASELINE-RED** (all 3) |

```
RED: testClosureAuditMistypedProjectExitsOne903 — canonical / gitlab / gitea (mirrors m2-*-pre)
  canonical: Error: #903: an unresolvable --project accepted via --issue must SAY the name resolved to
             nothing, got: {"project":"bundle-700-71","issue_numbers":[701],"state_file":null}
  ports:     AssertionError: #903: the scope of an UNRESOLVED --project accepted via --issue must carry
             exactly these keys in this order, got: ["project","issue_numbers","state_file"]
RED: testClosureAuditScopingHelpers903 — all three
  #903: a scope whose --project resolved to NOTHING can never read clean, whatever the classes say
  about the issue numbers that came in beside it
baseline: 9b68b096 + fix-audit's reverse.js applied in a scratch mirror (exactly-once per replacement)
```

**ISOLATED — the verdict leg.** In the full pre-fix state the scope-key assertion above reds first and
hides it. `scratchpad/tddparity/unwire-verdict.js` reverts exactly one line — the call site
`driftIsClean(inScope, scope)` → `driftIsClean(inScope)` — leaving `project_unresolved` in the scope so
the key assertions pass and only the verdict is taken away:

```
RED: testClosureAuditMistypedProjectExitsOne903 — canonical / gitlab / gitea (mirrors m4-*)
  #903: and it must never read clean — nothing was read for the name the operator typed, so no class
  speaks for that project. This answered TRUE, got: true
  scope: {"project":"bundle-700-71","issue_numbers":[701],"state_file":null,"project_unresolved":true}
```

### POSITIVE CONTROLS — same fixture, same runner, same mock, same `--issue`

- a **resolvable** `--project` over the zero-drift repo reads **`clean === true`** (all 3). Without it
  every assertion above is satisfied by a verdict that never says clean.
- its scope carries exactly the **three** keys it always did — `project_unresolved` is omit-when-false,
  so the ports' existing `assertKeys903(scope, ['project','issue_numbers','state_file'])` is untouched
  and I added the **four**-key variant only for the unresolved case, as the fix intends.
- unit: `driftIsClean({a:[]}, {project_unresolved:false}) === true`, and the one-argument form still
  reads clean, so the optional-scope contract is pinned too.

### The online axis is LIVE in BOTH forge editions — proven by breaking it

`scratchpad/tddparity/break-mock.js` rewrites **only my shim** (anchored on the block's own following
line, taking the last match, because sibling scenarios reuse the same shim text) to the wrong CLI verb
for that edition — the exact mistake the implementer hit, `gh`/`glab` say `issue view` and `tea` says
`issues view`:

```
RED: canonical (issue -> issues): #903: stale_in_progress_labels must be an EVALUATED array on this
     axis, not a skip token — a token here is the offline masking reappearing, got: {}
RED: gitlab   (issue -> issues): #903: the in-scope drift of the unresolved run (an extra class here
     means the mock never answered) must carry exactly these keys …, got: [… "unresolved_closed_state"]
RED: gitea    (issues -> issue): same signature, same extra class
```

So in each edition the mock demonstrably **answers** — breaking its verb changes the result and my own
assertion names why. gitea's shim uses `issues view` / `issues list`, matching that suite's existing
convention, and its comment states the trap so the next reader does not re-key it.

---

## Pin 2 (D2) — ambiguity across two timestamped siblings, flag AND stamp

Fully observable offline (the class is local), so these legs use the offline runner. Both suffix shapes
are driven, because the suffix set has two members and a rule can be written for one of them.

| pin | proof |
|---|---|
| `.archived-*` + `.archived-*`, no bare `P` → `archive_name_ambiguous === true` | **BASELINE-RED** (all 3) |
| `.archived-*` + `.discarded-*`, no bare `P` → same | **BASELINE-RED** (all 3), **isolated** by direct CLI measurement — the loop's first iteration reds first |
| the timestamped sibling's finding is stamped `ambiguous_name_match` | **BASELINE-RED** in the full pre-fix state, and **isolated** so the stamp half is proven on its own |
| the scope still resolves through the sibling that HAS a record | baseline-red with the flag |

```
RED: testClosureAuditScopedArchiveAmbiguousMatch903 — canonical / gitlab / gitea (mirrors m2-*-pre)
  #903 (archived): two archive folders match `proj-c` and no bare `P` exists — the scope must REPORT
  the ambiguity instead of adopting one record silently, got: {"project":"proj-c",
  "issue_numbers":[941],"state_file":"kaola-workflow/archive/proj-c.archived-2026-01-01…"}
```

**ISOLATED — the second suffix shape.** The `for` loop reds on `archived` first, so `discarded` never
runs. Measured directly instead, on a `.discarded-*` pair with no bare `P`
(`scratchpad/tddparity/discfx`):

| edition | PRE-FIX | SHIPPED |
|---|---|---|
| canonical | flag **ABSENT**, attribution `name_match` | flag **true**, `ambiguous_name_match` |
| gitlab | flag ABSENT, `name_match` | true, `ambiguous_name_match` |
| gitea | flag ABSENT, `name_match` | true, `ambiguous_name_match` |

**ISOLATED — the stamp half.** Pre-fix the flag is false, so the flag assertion masks the stamp one.
`scratchpad/tddparity/unwire-stamp.js` reverts exactly one line — `annotateAttribution`'s test back to
`finding.project === scope.project` — leaving the flag fixed:

```
RED: testClosureAuditScopedArchiveAmbiguousMatch903 — canonical / gitlab / gitea (mirrors m6-*)
  #903 (archived): a TIMESTAMPED sibling's finding must carry the ambiguous stamp too — keyed on the
  bare project name it read as an unqualified name_match while the scope itself said ambiguous, so the
  two halves of one report disagreed; got: {"project":"proj-c.archived-2026-02-02…",…}
```

### NEGATIVE CONTROLS

- **one matching archive folder** → flag omitted **and** its finding keeps the unqualified `name_match`
  stamp, in a fixture beside the flag legs. This rules out both an always-true count and an
  always-ambiguous stamp. It repeats the name-match scenario's fixture shape on purpose: a control
  belongs beside the assertions it discriminates, not one scenario away.
- **a DOTTED sibling**, added to `testClosureAuditScopedArchiveNameMatch903` in all three editions
  (`proj-a.something` / `bundle-700-701.something`), beside the existing `…-extra` prefix-adjacent
  neighbour. A naive "more than one archive mentions this project" count would flag the project on
  these two neighbours alone. Planted **complete**, so it adds no finding and every existing exact
  finding-list assertion in that scenario is untouched. That scenario passes on **both** baselines, as a
  control should.

---

## Suites — absolute worktree paths, serial, real exit codes via bare `echo $?`

| suite | exit | detail | vs. before round 2 |
|---|---|---|---|
| `simulate-workflow-walkthrough.js` (**full scope**) | **0** | `{"scenarios":198,"ran":198,"passed":198,"failed":0}`, 2079 spawns | 2059 → 2079 (+20 = D1's 2 audit runs + D2's 2 pair fixtures × (5 git + 1 audit) + solo (5 git + 1 audit)) |
| `test-gitlab-workflow-scripts.js` | **0** | **15** × `903: PASSED`, 581 spawns | 561 → 581 (+20, same accounting) |
| `test-gitea-workflow-scripts.js` | **0** | **15** × `903: PASSED`, 582 spawns | 562 → 582 (+20) |
| `simulate-gitlab-workflow-walkthrough.js` | **0** | 112 spawns | **identical** |
| `simulate-gitea-workflow-walkthrough.js` | **0** | 127 spawns | **identical** |
| `validate-script-sync.js` | **0** | 27 byte-identical groups, 6 export-superset families, 4 kernel copies identical at HEAD | unchanged |
| `test-spawn-classification.js` | **0** | 603 sites, **176 classified**, 427 grandfathered, 131 slack | classified count unchanged; **my three files are still 115 / 63 / 62 sites**, so I added none and no ceiling was touched. The +2 sites vs my round-1 run are another agent's |
| `validate-workflow-contracts.js` | **0** | — | unchanged |
| `test-shard-lib.js` | **0** | — | unchanged |

## Implementation defects found in round 2: none.

One observation, reported not fixed: `archiveNameIsAmbiguous` remains **unexported**, so the count rule
has no unit pin — the four CLI legs above cover it, and adding an export to make it unit-testable would
widen a module surface for a test's convenience. I did not add one.

## Round 2 — not verified

- Still no chain run, no `claude:full`, no opencode/kimi suite (they ship no closure-audit copy).
- The online legs use a **mock**, not a live forge. A forge that *lies* about issue state is out of
  scope here, as `fix-audit.md` also declares.
- The prose surfaces `fix-audit.md` lists as now understating the rule (`docs/api.md`,
  `templates/routing/finalize.skeleton.md` and its four rendered surfaces, `CHANGELOG.md`) are **not
  mine** and I did not touch them. Nothing I added pins their wording, so they will not red when
  someone fixes them.
