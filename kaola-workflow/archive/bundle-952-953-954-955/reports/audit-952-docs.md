# #952 subtraction audit — the `docs/` half

Report-only. No cut applied, no tracked file edited.

- **Commit measured:** `483a5e5e0071207bf93fae5f1f22f39c2a4e7e9c` (worktree
  `.kw/worktrees/bundle-952-953-954-955`; the worktree carries other agents' in-flight edits to
  `agents/`, `plugins/*/agents/`, `docs/decisions/0017-the-mission-list.md` and
  `scripts/test-agent-profile-parity.js`, so every suite run below was done against a **clean clone
  at 483a5e5e** in the scratchpad, not in the shared worktree).
- **Surface:** `docs/` — 198 tracked files, 34,361 markdown lines (`wc -l`; the brief's 34,359 is
  within rounding of the same measure).
- **Excluded, per the brief:** `kaola-workflow/archive/**`, ADR 0017's "built once, removed,
  recoverable" rows.

---

## TASK ZERO — the test-consumed doc set

Answered three independent ways, because a grep is a hypothesis and the question here gates every
`delete:` finding.

### Method A — the declared list (what the code says)

Two constants declare it, and they must agree (`kaola-workflow-adaptive-schema.js` is the ×4
byte-identical anchor):

| constant | file:line |
|---|---|
| `SELF_HOST_TEST_CONSUMED` | `scripts/kaola-workflow-adaptive-schema.js:905` |
| `TEST_CONSUMED_PATHS` | `scripts/kaola-workflow-validation-runner.js:32` |

Both hold the same five entries: `README.md`, `CHANGELOG.md`, `docs/api.md`,
`docs/workflow-state-contract.md`, `docs/agents-source.md`.

### Method B — the predicate, run over all 198 docs

```
$ node -e "…require('./scripts/kaola-workflow-validation-runner.js')… \
           docs.filter(d => pv.isValidationInvisible(d) === false)"
total docs tracked: 198
VALIDATION-VISIBLE (test-consumed by the code-tree hash):
   docs/agents-source.md
   docs/api.md
   docs/workflow-state-contract.md
validation-INVISIBLE count: 195
```

### Method C — an fs trace of every suite in all four chains + the editions suite

Every `readFileSync`/`existsSync`/`statSync`/`readdirSync`/`openSync`/`accessSync` whose resolved
path landed inside **this repo's** `docs/` tree was logged (fixture repos live under `os.tmpdir()`
and are excluded by the repo-root prefix test). 57 suites, run serially. 56 exit 0; `test-kernel-conformance.js` exited 1 **under the preload only**
— run standalone in the same clone it exits 0 ("kernel conformance tests passed (254 assertions)"),
so the red is an artifact of the instrumentation, not a repo failure. Its doc read was still captured,
and is independently confirmed statically at `scripts/test-kernel-conformance.js:137`.

Preload: `<scratchpad>/fstrace.js`; driver: `<scratchpad>/run-trace.sh`.

**A confound the first pass had, and how it was removed.** The first trace tagged each row with the
*suite name from the environment*, and `NODE_OPTIONS` is inherited by child processes — so
`simulate-workflow-walkthrough.js` appeared to read `docs/api.md` and
`docs/workflow-state-contract.md`, which no static grep of that file can explain (its only `docs/`
mention is a comment at line 10053). Re-run with the tag switched to `process.argv[1] + '#' +
process.pid`, the full walkthrough (209/209 scenarios, exit 0) produced exactly six rows, **all from
two spawned `validate-workflow-contracts.js` children** (pids 15990 and 16246):

```
…/scripts/validate-workflow-contracts.js#15990  readFileSync  docs/api.md
…/scripts/validate-workflow-contracts.js#15990  readFileSync  docs/workflow-state-contract.md
…/scripts/validate-workflow-contracts.js#16246  readFileSync  docs/api.md
                                                (+ 3 existsSync rows)
```

The walkthrough itself opens **no** doc. Without the per-process tag this audit would have named a
fifth consumer that does not exist.

### The answer

| doc | lines | consumed by | how |
|---|---:|---|---|
| `docs/api.md` | 1,655 | `validate-workflow-contracts.js:375,390-393` · `validate-kaola-workflow-contracts.js:188` · `test-forge-finalize-findings.js:543-662` · `test-validation-allowband.js:110,113` (control) | **content asserted.** Concept assertions (closure-contract invariants, receipt schema, audit-labels/repair-labels forge parity); three `assertNotIncludes` negative pins; and `test-forge-finalize-findings.js` parses the `findings` table, cross-checks per-edition finding-type **counts** stated in prose against the registries, and requires `archive_unstaged` / `residue_unstaged` rows. Also in `TEST_CONSUMED_PATHS`. |
| `docs/workflow-state-contract.md` | 453 | `validate-workflow-contracts.js:338,361,368,400,442` · `validate-kaola-workflow-contracts.js:183` · `test-kernel-conformance.js:137` | **existence + content asserted.** `exists()` gate, three concept assertions (durable sources / generated mirrors; legacy coordination as transitional; closure-contract cross-ref), and `test-kernel-conformance.js` single-sources its PART B ruling against this file. Also in `TEST_CONSUMED_PATHS`. |
| `docs/agents-source.md` | 139 | `validate-vendored-agents.js:136,138,144,167` | **content asserted.** Must contain the pinned upstream commit and an `agents/<name>.md` line per vendored agent; `README.md` must link it; `package.json` `files` must list it (`package.json:24`). Also in `TEST_CONSUMED_PATHS`. |

**Complete. Three docs. No fourth.** The trace independently found exactly these three and nothing
else — Method C is not a restatement of Method A, because the trace instruments the filesystem, not
the constant.

### Two near-misses that are NOT test-consumed, and why the distinction matters

- **`docs/decisions/D-547-01.md`** — named at `test-validation-allowband.js:109`, but only as an
  argument to the **pure, path-shape-only** predicate `isValidationInvisible('docs/decisions/D-547-01.md')`.
  The file's *content* is never read; the trace confirms it (never opened). It is a control input, not
  a consumed doc. The assertion would still pass with the file deleted.
- **`docs/architecture.md`** — `test-validation-allowband.js:108` asserts it is validation-**invisible**
  ("an inert narrative doc must be excluded"). Same shape: the string, not the file.

### One consumed non-`docs/` file worth naming

`templates/routing/init.skeleton.md` is parsed by `validate-workflow-contracts.js:1089-1107`
(CONSUMER_DOCS_PATH) to derive the doc tree a consumer repo will have. It contains `docs/README.md`,
`docs/architecture.md`, `docs/conventions.md` etc. — **these are the consumer's scaffold docs, not
this repo's.** A reader grepping for `docs/README.md` hits this skeleton and can wrongly conclude
`docs/README.md` is consumed. It is not.

### Consequence for the rest of this audit

195 of 198 docs are validation-invisible: editing or deleting one does **not** stale the chain
receipt. That removes the receipt-staleness objection from every finding below, but it is not a
licence to delete — a doc can be linked, indexed, or load-bearing for a human reader without any
script reading it.

---

## Findings

### F1 — `yagni:` `docs/conventions.md:271-293` documents a guard mechanism that was deleted, and instructs the reader to use it — 9 net deletable lines (in a 23-line block)

**Not test-consumed** (validation-invisible; the trace never opened it). **Net deletable: 9 lines** —
lines 281-285 (part 2 entire) plus the `FEATURE_TOKENS` clause of 291-293 and the blank lines that go
with them. The surrounding 23-line block is quoted for context; parts 1 and 3 stay.

`docs/conventions.md` lines 271-293 describe a "Three-part machine-enforced contract" for
agent-profile `md↔toml` parity. **Part 2 and the Workflow paragraph describe a mechanism that no
longer exists**, and the Workflow paragraph is an instruction to operate it:

```
281 2. **Feature-token mirroring** — for non-generated roles, `scripts/test-agent-profile-parity.js` enforces that any
282    token in the curated `FEATURE_TOKENS` list that is present in an `agents/<name>.md` MUST
283    also appear in all three `.toml` twins. Add a token to `FEATURE_TOKENS` only after it is
284    GREEN at HEAD (present in both the `.md` and all three `.toml` twins). …
…
291 **Workflow:** For a non-generated role, mirror a new feature paragraph/token into all three `.toml`
292 twins first, then pin it in `FEATURE_TOKENS`. …
```

**The mechanism is gone.**

```
$ git grep -l -F "FEATURE_TOKENS" -- scripts plugins templates      # at 483a5e5e
(no output — 0 files)
```

The only surviving occurrences repo-wide are `CHANGELOG.md` (2 history entries) and
`docs/decisions/D-422-01.md` (the ADR that recorded it) — both correct as history.

**Positive control** — the same detector, run at the commit before the removal:

```
PRE-removal: f8034b6c (2026-07-31)
  FEATURE_TOKENS in code at f8034b6c: 2 file(s)
  FEATURE_TOKENS in code at HEAD:     0 file(s)
```

Removed by `523f1241` — *"fix(bundle): close the 2026-07-31 runtime-consistency audit — #881-#885"*.
That commit **did** edit `docs/conventions.md`; the FEATURE_TOKENS paragraph survived the edit.

**What makes this worse than ordinary rot: the replacement is described correctly in the same file,
70 lines later, and the two descriptions contradict each other.**
`scripts/test-agent-profile-parity.js:8-11` states the replacement's design point as the negation of
the old one — *"both DERIVED from what the corpus actually contains rather than from a curated
allowlist … nobody has to remember a list."* And `docs/conventions.md` already says so:

- `docs/conventions.md:311` — "`test-agent-profile-parity` consensus | policy shared across ≥⌈2N/3⌉ of 11 profiles"
- `docs/conventions.md:344-346` — "**A threshold cannot see a rule beneath its bar.** … pin (`ROLE_PINS`), never a derivation."

So one file tells a contributor both *"maintain the curated `FEATURE_TOKENS` list"* (dead) and
*"enforcement is derived, nobody has to remember a list"* (live). Line 344 is the wording CLAUDE.md
quotes as authoritative, which settles which one owns the fact.

Parts 1 and 3 of the contract are still true and are **not** part of this finding
(`BYTE_IDENTICAL_GROUPS` → 11 files, `test-agent-profile-parity.js` → 6 files, both live).

**Caveat for whoever cuts this:** `scripts/test-agent-profile-parity.js` is being edited in this
worktree right now by another agent in this run (`M scripts/test-agent-profile-parity.js`).
Re-run the `git grep` above at the merge commit before acting.

---

### F2 — `yagni:` `docs/README.md:17` sells the opencode edition on a mechanism that was removed — 1 line

**Not test-consumed.** `docs/README.md` is **not** in `TEST_CONSUMED_PATHS`, is validation-invisible,
and is never opened by any suite (fs trace). The `docs/README.md` hits a reader gets from grepping
the script surface are all `templates/routing/init.skeleton.md` naming the **consumer's** scaffold.

The index line, at `483a5e5e`:

```
17 - [opencode Edition](opencode-edition.md) — additive opencode runtime (`opencode.json` +
     `.opencode/` tree; provider-open two-tier effort mapping; installs via `install-opencode.sh`).
```

**"provider-open two-tier effort mapping" is the removed mechanism**, named in the vocabulary of
`docs/decisions/D-544-01.md:39-40` ("migrates … to opencode's **provider-open** world by mapping each
tier to an **effort variant**"). Its implementation was `mapTier` / `CONTRACT_EFFORT_TABLE` /
`effortForProvider` / `contractForProvider`.

**Positive control** — same detector, pre-removal commit `c3938174` vs `HEAD`:

| symbol | files @ pre-removal | files @ HEAD |
|---|---:|---:|
| `mapTier` | 4 | 1 |
| `CONTRACT_EFFORT_TABLE` | 4 | 1 |
| `effortForProvider` | 3 | 1 |
| `contractForProvider` | 4 | 1 |

Every HEAD hit is the *same single file* — `scripts/test-opencode-edition.js` — and every one is a
comment saying the thing was deleted, e.g. line 27: *"`effortForProvider` / `contractForProvider` /
`CONTRACT_EFFORT_TABLE`, all removed with per-role effort tiering"*, and line 660: *"A12 /
S1-contract / A12-options — **DELETED WITH THEIR MECHANISM**."* Zero live code.

**The doc it indexes already contradicts it.** `docs/opencode-edition.md:88` — "## Model and effort —
inherited from the session"; `:102` — "The edition previously seeded a per-role effort tier … since
removed"; `:374` — "**inherited** — a subagent runs the model and reasoning effort of the session
that dispatched it".

**How it survived, measured:**

```
line written : fb8cf344  2026-06-19  fix(opencode): #530-audit follow-up bundle (#532…#536)
mechanism removed: 162135a8  2026-08-03  fix(opencode): remove per-role effort tiering
$ git merge-base --is-ancestor fb8cf344 162135a8  →  ORDER CONFIRMED
$ git show --name-only 162135a8 | grep -c '^docs/README.md$'  →  0
```

`162135a8` updated **eight** doc files (`opencode-edition.md` −293/+…, `kimi-edition.md`,
`D-544-01.md`, `D-610-01.md`, the investigation, the audit, `README.md`, `CHANGELOG.md`) and missed
the one-line index entry.

The sibling line 18 (kimi) is **correct** — "inherit-only model tier" matches `README.md:361` and
`docs/kimi-edition.md:82`. This finding is line 17 alone.

**Live-tree caveat:** another agent in this run has `docs/README.md` modified in the worktree; the
diff touches the Architecture entry only and does **not** touch line 17 (`git diff -- docs/README.md
| grep -i opencode` → no match).

---
### F3 — `yagni:` `docs/kimi-edition.md:98-100` credits the rendering to a function that was deleted — 2 lines

**Not test-consumed** (validation-invisible; never opened by any suite).

```
 97   - The adaptive planner's per-node tier (`reasoning`/`standard`) survives as **metadata
 98     only**: it is recorded in the dispatch packet and ledger, and `modelDisplay()` renders it
 99     as `parent session (<tier> tier metadata)` — the same semantics as the Codex edition. It
100     maps to no effort or model at runtime.
```

**`modelDisplay()` does not exist.**

```
$ git grep -l -F "modelDisplay" -- scripts plugins templates   # at 483a5e5e
(no output — 0 files)
```

**Positive control** — same detector at the commit before its removal:

```
removal: a9cf4756  2026-07-31  refactor(kernel): drop the exports the ADR 0017 demolition left with no consumer
  b08a8b35 (pre): 4 file(s)
  HEAD:           0 file(s)
$ git show --name-only a9cf4756 | grep '^docs/'  →  (no docs/ files)
```

`a9cf4756` deleted it and touched **no documentation at all**.

**The rendered output is also gone**, so this is not a rename:

```
$ git grep -n -F "tier metadata" -- scripts plugins templates agents commands
(4 hits, all the phrase "declarative tier metadata" inside validator comments — none render
 "parent session (<tier> tier metadata)")
```

And the repo's own dead-export audit (`kaola-workflow/.origin/dead-exports-audit.md:103,196`) records
`modelDisplay` as class **A — "0 external, 0 internal code refs"**: it was never called even while it
existed, so the doc's claim was never observable behaviour.

**Scope of the cut:** the first clause ("recorded in the dispatch packet and ledger") is not measured
here and is not part of this finding. Only the `modelDisplay()` rendering clause is dead.
`docs/decisions/D-703-01.md:59` carries the same claim but is a historical ADR that `docs/README.md`
declares history — **not filed**.

---

### F4 — `yagni:` `docs/api.md:1002-1003` attributes behaviour to a function that never existed — 2 lines · **TEST-CONSUMED DOC**

**`docs/api.md` IS test-consumed** — it is in `TEST_CONSUMED_PATHS`, so **any** edit to it changes
`computeCodeTreeHash` and stales the chain receipt. Not freely deletable; a cut must be sequenced
before the receipt run.

```
1002 - `cmdSinkPr` emits no closure receipt — the authoritative receipt for a `sink: pr` project is
1003   emitted by the watcher at merge. This is documented behavior, not a gap.
```

**`cmdSinkPr` has never existed in this repository's code.** Not "was removed" — never present:

```
$ git grep -n -F "cmdSinkPr" -- scripts plugins        # at 483a5e5e → exit 1, no hits
$ git log --format=%H -S "cmdSinkPr"                   # every commit that changed its count
  bbacd271  2026-07-31  docs: rewrite the documentation set onto the mission list
  fa609dd0  2026-05-25  feat(#164): unify closure execution behind a shared closure receipt
$ git grep -l -F "cmdSinkPr" <each of those commits>
  docs/api.md
  kaola-workflow/archive/issue-164/{.cache/advisor-ideation.md,.cache/planner.md,phase1-research.md,phase2-ideation.md}
```

Every occurrence, at every point in history, is `docs/api.md` or an **archived planning note** from
issue #164. The name came from a design document and was written into the API doc as though it were
the shipped symbol. The only `cmdSink*` function in the tree is `cmdSinkFallback`.

**The stated RESULT is still true** — `scripts/kaola-workflow-sink-pr.js` emits no receipt (its whole
function list is `assert`, `isSafeName`, `ghExec`, `getRoot`, `readConfig`, `parseArgs`,
`updateStateSinkBlock`, `appendSummary`, `resolveProjectDir`, `recordPrResult`, `main`). Only the
**method attribution** is fiction. This is the exact failure `CLAUDE.md` names — *"specify the result,
never the method — a mechanism claim in a brief rots and makes the agent wrong."* Here it did not rot;
it was wrong on the day it was written.

**No assertion pins it.** The two `assertConcept('docs/api.md', …)` token lists are
`['## Closure Contract','closure invariants','roadmap_source_removed','remote_issue_closed',
'claim_label_removed','kaola-workflow-closure-contract.js','kept_open','#162','#163','#164','#165']`
and `['audit-labels','repair-labels','parity','kaola-gitlab-workflow-claim.js',
'kaola-gitea-workflow-claim.js']`. `cmdSinkPr` is in neither, so the clause can go without reding a
validator — but it still moves the code-tree hash.

---

### F5 — `shrink:` `LANE_STALENESS_MS = 86400000` is restated in three live docs — 2 net deletable lines · **two sites in a TEST-CONSUMED doc**

The value is **correct today** — this is a restated-constant finding, not a wrong-value finding.

```
$ node -e "console.log(require('./scripts/kaola-workflow-adaptive-schema.js').LANE_STALENESS_MS)"
86400000
```

Three docs restate the literal:

| site | text | test-consumed? |
|---|---|---|
| `docs/architecture.md:114` | "(`session_marker`, `claim_ts`, and `LANE_STALENESS_MS = 86400000`)" | no |
| `docs/conventions.md:770` | "`LANE_STALENESS_MS = 86400000` (24 hours) is the single staleness constant exported from …" | no |
| `docs/workflow-state-contract.md:295` | "`LANE_STALENESS_MS = 86400000` (24 hours, exported from `kaola-workflow-adaptive-schema.js`)" | **YES** |

**Who owns the fact:** `scripts/kaola-workflow-adaptive-schema.js` — and two of the three sites already
say so in the same sentence, which is what makes the numeral redundant rather than informative. The
name alone carries the fact; the numeral is a second copy that can only ever disagree with it.
`docs/workflow-state-contract.md:338-339` demonstrates the shorter form already in use in the same
file — it states the rule as "`claim_ts` absent or older than `LANE_STALENESS_MS`", with no numeral,
and loses nothing.

Two of the three sites are in `docs/workflow-state-contract.md` / `docs/architecture.md`; only the
`workflow-state-contract.md` one is test-consumed and therefore receipt-staling.

Ranked last deliberately: it is 2 lines and nothing is currently wrong. It is filed because the
repo's stated rule is that a restated fact rots, and three copies of one integer is the shape that
rule describes.

---

## Classes that came up EMPTY, with the search that found nothing

### `delete:` — **EMPTY. No doc in `docs/` is deletable.**

The zero-consumer search was run and it does return results — 26 of 198 docs have **zero inbound
references** anywhere in `docs/`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `CHANGELOG.md`, `templates/`,
`commands/`, `agents/`, `plugins/`, `scripts/`, `hooks/`, `package.json`, `opencode.json`, `.agents`,
and the five install/uninstall scripts (archive excluded, self excluded):

```
0  921  docs/decisions/0013-successor-test-two-gate-target-architecture.md
0  578  docs/investigations/2026-06-01-full-audit.md
0  282  docs/decisions/D-802-01.md
…  (23 more)
zero-inbound count: 26 of 198
```

Full table: `<scratchpad>/reach.tsv`.

**None of them is a finding**, because all 26 live under `docs/decisions/` or `docs/investigations/`,
and `docs/README.md` indexes both **as directories** and states the retention policy explicitly:

- `docs/README.md:22` — "[`decisions/`](decisions/) holds the full catalog."
- `docs/README.md:34-37` — "Everything numbered 0001–0015 and every `D-NNN-NN` record predates 0017.
  **They remain accurate as history** and as rationale for machinery that still ships…"
- `docs/README.md:41` — "[Investigations](investigations/) — investigation notes and analysis documents."

A `delete:` finding against them would be filing against a stated retention decision, not against
waste. The brief's own criterion — "it is not indexed by `docs/README.md`" — is not met: they are
indexed, by directory.

**Method caveat, recorded because it nearly shipped a wrong answer.** The first run of this sweep
reported **all 198 docs** as zero-inbound, including `docs/api.md`. The cause was
`git grep -- $ROOTS` with an unquoted variable: zsh does not word-split, so the entire root list
was passed as one pathspec and matched nothing. Every hit count was a silent 0. Caught by a positive
control (`git grep -l -F "api.md" -- <roots>` must return `CHANGELOG.md`, `CLAUDE.md`, `README.md`,
`commands/workflow-init.md`, …), which it did once the list was passed as separate arguments.

### `stdlib:` — **EMPTY, and structurally inapplicable.** Markdown has no standard library.

### `native:` — **EMPTY, and structurally inapplicable** for the same reason.

### Retired-machinery sub-hunts that found nothing

Each of these was searched and each is silent. Reported so the next reader does not re-run them.

| retired thing | searched for | live-doc result |
|---|---|---|
| opencode per-role effort tiering | `two-tier`, `provider-open`, `mapTier`, `CONTRACT_EFFORT_TABLE`, `effortForProvider` | **one** hit → F2. No siblings: `README.md:361` and `docs/kimi-edition.md:82` both state the *correct* "no two-tier mapping"; `docs/audits/`, `D-544-01`, `D-703-01` are history |
| `issue-scout` role (absent from `agents/`) | `issue-scout` in `docs/*.md` | 2 hits, **both correctly framed as retired** — `docs/kimi-edition.md:344` ("carrying no retired issue-scout dispatch prose"), `docs/opencode-edition.md:254` (a quoted sample of the drift warning) |
| the `--profile` axis | `--profile` in `docs/*.md` | 1 hit, `docs/conventions.md:71`, and it refers to **Codex's own** `--profile` launch flag, not the retired Kaola axis |
| the durable consent valve | `consent valve` in `docs/*.md` | 2 hits, both sound. `docs/architecture.md:67` lists it among things **removed**; `docs/api.md:193` names a *live* mechanism — `dirty_tree_refused` is present in all four claim scripts |
| the model badge (#949) | `model badge` | 0 hits in any doc |
| legacy `## Lease` fields | `session_id`/`last_heartbeat`/`owner_session_id` | 1 hit, `docs/workflow-state-contract.md:292`, and it is a live **prohibition** — `removeLegacyStateBlocks` exists in all four claim scripts |
| the deleted `test-runtime-lexicon-parity.js` guard | basename search over all live docs | 1 hit, `docs/conventions.md:384`, correctly framed as deleted-and-recoverable and pointed at ADR 0017's watch list — **excluded by the brief** |
| DAG-era `upstream_read` | dead-identifier sweep | 1 hit, `docs/architecture.md:72`, framed as an **accepted loss** ("has no analogue") |

### The dead-identifier sweep, stated as a measurement

Every backticked identifier of ≥5 characters in the eight live top-level docs, checked against
`scripts/ plugins/ templates/ agents/ commands/ hooks/ install*.sh opencode.json package.json`. Nine
came back absent; six were sound on inspection (external names, accepted-loss statements, live
prohibitions) and three became findings:

| identifier | doc | verdict |
|---|---|---|
| `FEATURE_TOKENS` | `conventions.md` | **F1** |
| `modelDisplay` | `kimi-edition.md` | **F3** |
| `cmdSinkPr` | `api.md` | **F4** |
| `upstream_read` | `architecture.md` | sound — accepted loss |
| `session_id` / `last_heartbeat` / `owner_session_id` | `workflow-state-contract.md` | sound — live prohibition |
| `b3bc7acf` | `conventions.md` | sound — a git SHA, not an identifier |
| `nothink` / `TaskTool` | `opencode-edition.md` | sound — opencode's own vocabulary |

---

## Rank order

| # | class | site | net deletable lines | test-consumed |
|---:|---|---|---:|---|
| 1 | `yagni:` | `docs/conventions.md:271-293` | 9 | no |
| 2 | `yagni:` | `docs/kimi-edition.md:98-100` | 2 | no |
| 3 | `yagni:` | `docs/api.md:1002-1003` | 2 | **yes — receipt-staling** |
| 4 | `shrink:` | `LANE_STALENESS_MS` ×3 | 2 | 1 of 3 sites |
| 5 | `yagni:` | `docs/README.md:17` | 1 | no |

**15 net deletable lines out of 34,361.** That is the honest headline: the `docs/` tree is not
carrying dead weight by volume. What it is carrying is **four wrong mechanism claims** — three
naming symbols that do not exist and one instructing a contributor to operate a deleted list — and
their cost is not the lines, it is that an agent reading `docs/conventions.md` will go looking for
`FEATURE_TOKENS` and find the file telling it two contradictory things about the same guard.

## Open — what this half did not measure

- **`docs/decisions/` and `docs/investigations/` content was not audited for internal accuracy**,
  only for reachability. `docs/README.md` declares them history, so a stale mechanism claim inside
  one is in-policy by construction. If that policy is ever revisited, 189 files become in-scope.
- **`docs/audits/opencode-edition-audit.md` (437 lines)** is reachable and is a one-off record of an
  audit whose subject (per-role effort tiering) was subsequently removed. It is history by the same
  policy, so no finding was filed — but it is the single largest doc whose *subject* no longer exists.
- **Numeric claims other than `LANE_STALENESS_MS` were spot-checked, not swept.** The two checked
  are correct: `docs/conventions.md:136`'s "18 surfaces" matches
  `generate-routing-surfaces.js --check` ("all 18 surfaces byte-match the skeleton"), and
  `docs/kimi-edition.md:55`'s "14 canonical roles" matches `ls agents/` (14).
- **`test-kernel-conformance.js` exited 1 under the fs-trace preload** and exits 0 standalone (254
  assertions). The cause of the instrumentation-induced red was not investigated; it does not affect
  any conclusion here, since that suite's doc read is independently confirmed statically at
  `scripts/test-kernel-conformance.js:137`.
- **Two docs are being edited by other agents in this run** (`docs/README.md`,
  `docs/architecture.md`, plus `docs/decisions/0017-the-mission-list.md`). All measurements above
  are at `483a5e5e`; F2's line 17 is not touched by the in-flight diff, but re-verify at merge.
