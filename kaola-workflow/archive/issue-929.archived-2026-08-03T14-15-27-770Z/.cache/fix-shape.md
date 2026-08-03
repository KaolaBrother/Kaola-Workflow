# Investigation: what fix shape does #929's observation actually demand?

## Setup

- Commit: `1f1e2092` (`chore: release 9.5.1`), branch `main`, tree clean except untracked
  `kaola-workflow/issue-929/`.
- Node `v24.14.0`, darwin 25.6.0. All runs `KAOLA_WORKFLOW_OFFLINE=1`.
- No tracked file was modified. All probes ran in scratch temp roots; the only write is this report.
- Probe scripts (scratch, disposable):
  `…/scratchpad/probe-baseline.js`, `…/scratchpad/probe-classes.js`, `…/scratchpad/e2e.sh`

## Recommendation, up front

**Candidate 4 — contract and vocabulary only. Do not change `projectNameForIssue` in any of the
four editions. Do not add a value gate of any shape.**

The defect is real and I reproduced it end to end. The *filed* diagnosis is false, and the filed
fix hardcodes another repository's private vocabulary into this codebase. More importantly, I
measured that **no lexical rule can separate the bad values from the good ones** — the class is
semantic, so any guard is a guess dressed as a mechanism. The one thing that is genuinely, totally
missing is a statement of what the field may contain: `workflow_project` appears in **zero** prompt
surfaces and **zero** lines of `docs/workflow-state-contract.md`.

---

## Observations

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | Baseline suite | `node scripts/simulate-workflow-walkthrough.js` | 166 `PASSED`, 0 failed | 0 |
| 2 | Unit: shipping `projectNameForIssue` over 51 corpus values | `node probe-baseline.js` | `unclaimed`→`unclaimed`, `TBD`→`TBD`, `—`→`issue-N`; 34/34 real names adopted | 0 |
| 3 | E2E claim, `workflow_project: unclaimed` | `claim.js startup --target-issue 4001` | `{"project":"unclaimed", ...}`; dir `kaola-workflow/unclaimed/` created | **0** |
| 4 | E2E claim, `workflow_project: TBD` | `claim.js startup --target-issue 4002` | `{"project":"TBD", ...}`; dir `kaola-workflow/TBD/` created | **0** |
| 5 | E2E claim, `workflow_project: —` | `claim.js startup --target-issue 4003` | `{"project":"issue-4003"}`; dir `kaola-workflow/issue-4003/` | 0 |
| 6 | Full history of the field | sweep of all 377 commits touching `kaola-workflow/.roadmap/` | **1395 × `—`**, **1 × `TBD`**, 38 distinct real names, **0 × `unclaimed`** | 0 |
| 7 | Literal `unclaimed` in tracked files | `git grep -n -i unclaimed` | 44 hits, **all English prose**; zero are a field value | 0 |
| 8 | Predicate A/B over 63 real + 2 bad values | `node probe-classes.js` | see Narrowing | 0 |
| 9 | Archive-name shape | `ls kaola-workflow/archive/ \| …` | 376/376 names contain `-` | 0 |
| 10 | `cmdProjectName` on the bad values | `roadmap.js project-name --issue N` | `unclaimed`→exit 0 prints `unclaimed`; `TBD`→exit 0 prints `TBD`; `—`→exit 1 | 0/0/1 |
| 11 | Mirror rendering | `roadmap.js generate` then read | `\| #7 \| T \| open \| unclaimed \| q \|` — the bad value **is** displayed | 0 |
| 12 | Mirror validation | `roadmap.js validate` | `ok` | 0 |
| 13 | Archaeology at `ced64384` | `git show ced64384:scripts/kaola-workflow-claim.js` | derivation was `execFileSync(… 'project-name' …)`; roadmap.js at that commit has **zero** `project-name` hits | 0 |
| 14 | Field parser | read `active-folders.js:20-24`, `roadmap.js:10-14` | both `.trim()`; `cmdProjectName` additionally strips `\|`, `projectNameForIssue` does not | — |
| 15 | Write-back check | `grep workflow_project scripts/kaola-workflow-claim.js` | **exactly one hit, `:296`, a read**. claim never writes the field | 0 |
| 16 | Prompt-surface coverage | grep `templates/ commands/ skills/ agents/ .claude .opencode .kimi .codex` | **zero** mentions of `workflow_project` | — |
| 17 | State-contract coverage | grep `docs/workflow-state-contract.md` | **zero** mentions of `workflow_project` | — |
| 18 | `project-name` callers | `grep -rn project-name` over all editions | dispatchers + `README.md:1016` + `docs/api.md:1350` only — **no caller anywhere** | 0 |
| 19 | Routing surface count | `node scripts/generate-routing-surfaces.js --check` | `all 18 surfaces byte-match the skeleton` | 0 |

## Reproduction

**Reproduces.** Measurements 3 and 4 are the whole defect, end to end, at exit 0:

```
value=[unclaimed] exit=0
{"verdict":"green","claim":"acquired","selected_project":"unclaimed","selected_issue":4001,
 "status":"acquired","issue":4001,"project":"unclaimed","branch":"workflow/issue-4001", ...}
-- kaola-workflow/ dir listing --
unclaimed
```

`TBD` behaves identically (`kaola-workflow/TBD/`). `—` correctly yields `issue-4003`. Nothing warns,
nothing refuses, and `roadmap.js validate` reports `ok` afterwards (measurement 12).

---

## Narrowing

### Leg 1 — is `unclaimed` really a sentinel this codebase emits? (the issue's root cause)

**No. This eliminates the issue's entire diagnosis.** The issue states it twice:

> "`workflow_project: unclaimed` (the value the roadmap generator writes for every unassigned issue)"
> "The roadmap writes `workflow_project: unclaimed` as the sentinel for unassigned issues."

Measurement 7: `git grep -i unclaimed` returns 44 hits across every tracked file in all four
editions. Every one is English prose — `"open, unclaimed, and coherent in scope"`
(`commands/workflow-next.md:49`), `reason:'no-unclaimed-issues'` (a CHANGELOG entry),
`edge unclaimed -> planning` (an ADR state diagram at
`docs/decisions/0013-successor-test-two-gate-target-architecture.md:333`). **Not one is a
`workflow_project` value.** Measurement 6 confirms from the other direction: across 1395 committed
values of the field in this repo's entire history, `unclaimed` appears **zero** times.

The writers, all four editions:
- `scripts/kaola-workflow-roadmap.js:78` `readRoadmapIssues` → `|| '—'`
- `scripts/kaola-workflow-roadmap.js:89` `buildTableRow` → `|| '—'`
- `scripts/kaola-workflow-roadmap.js:335` `cmdInitIssue` → `(args['workflow-project'] || '—')`
- gitea/gitlab `issueRecordContent:222` → `(workflowProject || 'issue-' + issueIid)`

`unclaimed` is **KaolaVPN's local hand-authored convention.** The filed fix
(`name !== 'unclaimed'`) therefore proposes to hardcode a downstream repository's private
vocabulary into this codebase's claim path, in four hand-maintained copies. That is wrong in kind,
not merely incomplete.

The issue's own "optional companion" — *"have the roadmap generator stop emitting the literal
`unclaimed`"* — is a **no-op**: it never emitted it.

### Leg 2 — did `TBD` ever actually fail here? (surface-map §6, flagged unproven)

**No — it was inert at the time. I proved the flagged timeline.** At `ced64384`
(2026-05-15 18:27), when `issue-23.md` carried `workflow_project: TBD`, `claim.js` did not read
the file at all. It shelled out (`ced64384:scripts/kaola-workflow-claim.js:498-512`):

```js
let proj = 'issue-' + N;
try {
  const name = execFileSync(process.execPath, [… 'kaola-workflow-roadmap.js', 'project-name', …])
  if (name) proj = name;
} catch (_) {}
```

and `git show ced64384:scripts/kaola-workflow-roadmap.js | grep project-name` returns **nothing** —
the subcommand did not exist, so `main()` threw `Unknown subcommand`, the empty `catch (_) {}`
swallowed it, and `proj` stayed `issue-N`. `TBD` was removed at `90ef58a1`, 43 minutes later.

**Consequence for the evidence base — this is a correction worth making:** the number of *realized*
failures in this repository's history is **zero**. `TBD` is a demonstration that the *value class*
reaches the field here (which measurement 4 proves would fail today), not a second realized
incident. The only realized failure is external (KaolaVPN#3), and I cannot re-measure it — it is
outside this repository.

### Leg 3 — can a placeholder CLASS be defined? (candidate 2)

**No. This is the decisive structural result.** Measurement 8, all four predicates run against the
63 real values from surface-map §7 plus the archive and live test fixtures:

```
A: filed blocklist  (n !== "unclaimed")
   positive control: 63/63 real values kept   PASS
   negative control: 1/2 bad values rejected   MISSES: ["TBD"]        → FAILS

B: kebab allow-list (^[a-z0-9][a-z0-9-]*$)
   positive control: 63/63 real values kept   PASS
   negative control: 1/2 bad values rejected   MISSES: ["unclaimed"]  → FAILS

C: kebab + must contain "-"
   positive control: 63/63 real values kept   PASS
   negative control: 2/2 bad values rejected   PASS                   → both pass

D: case-insensitive placeholder blocklist
   positive control: 63/63 real values kept   PASS
   negative control: 2/2 bad values rejected   PASS                   → both pass
```

The structural reason B fails is the whole finding:

```
"unclaimed"          len=9   kebab=true hasDash=false allAlpha=true dictWordOnly=true
"pr-sink"            len=7   kebab=true hasDash=true  allAlpha=true dictWordOnly=false
"claim-hardening"    len=15  kebab=true hasDash=true  allAlpha=true dictWordOnly=false
```

`unclaimed` and `pr-sink` are the same lexical object. **Any regex that accepts `pr-sink` accepts
`unclaimed`.** The distinction is semantic — "is this word a name or an excuse?" — and no charset,
casing, or length rule can see it.

**C passes both controls, and C is a trap.** It even holds across the whole archive (measurement 9:
376/376 names contain a hyphen). But that is correlation, not capture. Driven directly:

```
--- Candidate C: placeholders it WOULD STILL ADOPT ---
ADOPT  not-yet        ADOPT  to-be-decided   ADOPT  tbd-later     ADOPT  not-assigned
ADOPT  no-project     ADOPT  fill-me         ADOPT  place-holder  ADOPT  un-claimed
ADOPT  to-do          ADOPT  not-set
--- Candidate C: legitimate single-word names it WOULD REJECT ---
REJECT sink   REJECT roadmap   REJECT parity   REJECT hardening   REJECT finalize   REJECT chains
```

10/10 plausible placeholders adopted; 6/6 plausible legitimate names rejected. C passes the
historical controls because every project so far happened to be multi-word. It is exactly the
mechanism `docs/conventions.md` warns about — it *specifies the method, not the result*, and it
would rot the moment someone names a project `sink`.

**D is honest about being a blocklist**, and it is unbounded by construction: the class is "English
tokens meaning not-yet-decided", which has no closed membership. D would have to be maintained,
across four hand-ported copies, forever, against a class nobody can enumerate.

### Leg 4 — does a write-side fix reach the observation? (candidate 3)

**No, and it cannot.** `.roadmap/issue-N.md` is plain markdown. Both observed values were
hand-authored, not passed through `init-issue`. A guard in `cmdInitIssue:335` or
`issueRecordContent:222` guards one writer among unboundedly many. And the forge editions already
default to `issue-N` at `issueRecordContent:222` — the very value a fallback would produce — yet
hand-authoring bypasses that too. **The read side is the only chokepoint**, which is why the issue
correctly located the site even while misdiagnosing the cause.

### Leg 5 — is the field input or output? (a restructure I checked for and did not find)

Measurement 15: `workflow_project` appears in `scripts/kaola-workflow-claim.js` at **exactly one
line, `:296`, and it is a read**. The claim never writes it back; it only calls
`roadmapModule.regenerateRoadmap` (`:2385`, `:2404`). So the field is a pure input hint that lets a
planner direct an issue into an existing or intended project (bundles: `bundle-540-541` across
several sources; stages: `issue-244-stage-a`). Reading it is architecturally correct, and
"require the folder to already exist" would break the first claim of every bundle — the field's
main legitimate use. **No structural fix is available here.**

### Leg 6 — what is actually missing? (candidate 4)

**A vocabulary, and the measurement is total.** Measurement 16: `workflow_project` appears in
**zero** files under `templates/`, `commands/`, `skills/`, `agents/`, `.claude/`, `.opencode/`,
`.kimi/`, `.codex/`. Measurement 17: **zero** mentions in `docs/workflow-state-contract.md`, the
document whose entire job is what durable fields may contain.

The only specification anywhere in the repo is `docs/api.md:1350`:

> `project-name --issue N` | print the `workflow_project` field from `.roadmap/issue-{N}.md`. Exit 1 if the field is missing or `—`

— which documents a **subcommand that has no caller** (measurement 18: `project-name` appears only
in the four dispatchers, `README.md:1016`'s subcommand list, and this api.md row). The one
statement in the codebase that implies `—` is the unassigned token is attached to a CLI surface
nothing invokes.

So the authoring agent in KaolaVPN had no way to learn that `—` means "not yet decided". It invented
`unclaimed`, which is a perfectly reasonable word for the concept. **That is the observed failure:
not a missing guard, a missing sentence.** And measurement 11 shows the value was never even
hidden — `ROADMAP.md` renders `| #7 | T | open | unclaimed | q |` directly above a row reading `—`.
The information was on screen; nothing said which one was right.

---

## The recommended shape

### Exact changes

| # | File / line | Change | Why |
|---|---|---|---|
| 0 | `scripts/kaola-workflow-claim.js:293-300` and its three ports (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js:293-300`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:187-194`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:187-194`) | **NO CHANGE** | Leg 3 proves no correct predicate exists. Crossing a 4-copy surface where two ports have *no* automated body check (`validate-script-sync.js:485` compares export key sets only) to install a rule that is provably a guess is the worst trade available. |
| 1 | `docs/workflow-state-contract.md` | **ADD** a `workflow_project` entry: the field names a directory that **will be created verbatim** at claim time; `—` is the sole "not yet assigned" token; absent/empty is equivalent to `—`; any other value is adopted as-is and becomes the project folder, worktree, archive band and sink receipt name. | Measurement 17: the contract document does not mention the field at all. This is its home. |
| 2 | `docs/api.md:1350` | **AMEND** so the row specifies the *field*, not only the subcommand's exit rule; state `—` as the unassigned token and cross-reference the state contract. | Today the only specification in the repo hangs off a callerless subcommand (measurement 18). |
| 3 | `templates/routing/init.skeleton.md`, at the `.roadmap` bootstrap block (`:455-462`, the `mkdir -p kaola-workflow/.roadmap` step) | **ADD** one sentence naming `—` as the unassigned token and warning that any other value becomes a real directory name. Then `node scripts/generate-routing-surfaces.js --write`. | This is the surface that creates `.roadmap/` **in a consumer repo** — the exact place the KaolaVPN authoring session would have read it. Nothing else reaches that reader. |

**Runtimes reached by change 3** (CLAUDE.md requires this be stated): the skeleton renders 6 of the
18 committed surfaces — `commands/workflow-init.md`, `plugins/kaola-workflow-gitea/commands/workflow-init.md`,
`plugins/kaola-workflow-gitlab/commands/workflow-init.md`, and the three
`skills/kaola-workflow-init/SKILL.md` copies — plus the opencode and Kimi editions, which per
`generate-routing-surfaces.js:145-147` render their own tree from the same registry at install
time rather than being hand-ported. `--check` must still print `all 18 surfaces byte-match the
skeleton` (measurement 19 is the clean baseline).

**Consumer-facing wording constraint**: changes 1–3 land in `docs/` and a rendered command/skill
surface, so they must name no vendor, no model, and no command that will not resolve on the
reader's runtime.

### Resulting behaviour

**Unchanged at runtime — deliberately.** `—`, empty and absent still fall through to `issue-N`.
Every non-`—` value is still adopted verbatim. `unclaimed` and `TBD` still produce
`kaola-workflow/unclaimed/` and `kaola-workflow/TBD/` **if someone writes them anyway** — but they
are now wrong against a written contract instead of wrong against nothing, and a reviewer, a
successor orchestrator, or an adversarial verifier has a rule to check them against.

This is the "nothing refuses" posture applied exactly as written: the failure destroys nothing, it
misleads. The remedy for misleading is a stated vocabulary, not a gate.

### Positive control

The values that must keep working are §7's corpus, and they keep working **by construction: the
code does not change.** Verified anyway under the shipping implementation (measurement 2) so the
claim is measured rather than asserted:

```
ADOPT  pr-sink                       ADOPT  claim-hardening            ADOPT  goal-driven-autonomy
ADOPT  parallel-classifier           ADOPT  issue-244-stage-a          ADOPT  bundle-540-541
ADOPT  issue-815-probe               ADOPT  minimal-ecc-config         ADOPT  claim-hardening-followups
ADOPT  bundle-414-418-422            ADOPT  bundle-423-425-431         ADOPT  bundle-429-434
ADOPT  bundle-612-613                ADOPT  cross-machine-hardening    ADOPT  branch-issue-merge-sink
ADOPT  codex-parity                  ADOPT  cross-machine-followups    ADOPT  multi-session-substrate
ADOPT  roadmap-open-issues           ADOPT  roadmap-per-issue-regenerator
```

All eight the parent named explicitly (`pr-sink`, `claim-hardening`, `goal-driven-autonomy`,
`parallel-classifier`, `issue-244-stage-a`, `bundle-540-541`, `issue-815-probe`,
`minimal-ecc-config`) are in that set. The live test fixtures also survive — `filename-authority-project`,
`mismatch-project`, `pipe-escape-project`, `rules-append-fixture`, `roadmap-guard-fixture`,
`empty-source-guard`, `atomic-roadmap-fixture`, `exclusive-init-fixture`, `sink-test`, `bundle-test`,
and the gitea/gitlab equivalents — as does `plantRoadmapIssue`'s `'—'` at
`simulate-workflow-walkthrough.js:888` and the single pinning assertion at `:180`
(`assert(first.project === 'issue-63')`). Baseline: 166 `PASSED`, exit 0 (measurement 1); a
docs-and-skeleton change leaves that untouched apart from `generate-routing-surfaces --check`,
which every chain runs.

### Negative control — and its honest limit

**What the shape newly rejects at runtime: nothing.** I will not dress this up. The negative control
for this shape is a *contract* control, not a runtime one:

- The contract states `—` is the sole unassigned token and that any other value becomes a directory.
- `unclaimed` ≠ `—` and names no directory anyone intended → **wrong by contract.**
- `TBD` ≠ `—` and names no directory anyone intended → **wrong by contract.**

Both observed values are inside the rejected set, and so is every member of the unbounded class C
and D miss (`not-yet`, `to-be-decided`, `no-project`, `fill-me`, `WIP`, …) — which is precisely the
advantage a stated result has over an enumerated method.

**A runtime negative control is unavailable, and that is a measured result, not a concession.**
Leg 3 proves it: any predicate that rejects `unclaimed` at runtime either rejects `pr-sink` too
(same lexical shape) or is a blocklist that misses the next word. If the owner wants a runtime
rejection anyway, that is a value call about accepting a knowingly-incomplete guard — it belongs to
the user, not to me.

---

## `docs/api.md:1350` and `cmdProjectName:369` — must they move in step?

**Under the recommendation: no behavioural change to either, so no divergence arises.** Change 2
rewrites the api.md row for accuracy, not to alter the rule.

**But the parent asked what happens if the rule widens, and the answer matters.** Measured today
(measurement 10), the two implementations agree *exactly* on the predicate and differ only in
consequence:

| value | `projectNameForIssue:297` | `cmdProjectName:369` |
|---|---|---|
| `pr-sink` | adopt → `pr-sink` | exit 0, prints `pr-sink` |
| `unclaimed` | adopt → `unclaimed` | **exit 0, prints `unclaimed`** |
| `TBD` | adopt → `TBD` | **exit 0, prints `TBD`** |
| `—` | fall through → `issue-N` | exit 1 |

So `unclaimed`/`TBD` are wrong in *both* places today. **If a guard is added to
`projectNameForIssue` and not to `cmdProjectName`, the repo ships one rule with two wordings** —
`project-name --issue N` would print `unclaimed` at exit 0 while a claim on the same issue silently
produced `issue-N`. Nothing *automated* would break, because `project-name` has no caller anywhere
(measurement 18) — which is exactly what makes the divergence dangerous: it is undetectable by the
suite and discoverable only by a human running the documented CLI and being lied to. That is the
"One rule, one wording" failure in its purest form.

**Therefore: if any code change is chosen over my recommendation, `projectNameForIssue`,
`cmdProjectName`, and `docs/api.md:1350` must move together, in all four editions — eight script
files plus the doc.** That is a further argument against a guard whose predicate cannot be written
correctly.

**Pre-existing divergence, out of scope, flagged not fixed** (measurement 14): `cmdProjectName:369`
does `.replace(/\|/g, '').trim()`; `projectNameForIssue:296` gets `.trim()` from the shared
`field()` (`active-folders.js:20-24`) but **no pipe strip**. So `workflow_project: a|b` yields
exit 0 / `ab` from the subcommand and a directory literally named `a|b` from the claim. Unrelated to
#929, unobserved in the corpus, and additive derivation says record it rather than build for it.

---

## Contradictions of the facts I was given

1. **CONFIRMED and extended.** "No roadmap tool in this repo emits the literal `unclaimed`" is
   correct — I measured it from both directions (measurements 6 and 7). What was not stated: **the
   issue text itself asserts the opposite twice and builds its whole root-cause section on it.**
   That makes the filed fix wrong in kind, not just incomplete.
2. **CORRECTION — surface-map §6's flagged claim is now proven, and it changes the evidence
   count.** `TBD` never produced a folder: at `ced64384` the derivation was `execFileSync(… 'project-name' …)`
   into a `roadmap.js` with no such subcommand, and the empty `catch (_) {}` kept `proj = 'issue-N'`
   (measurement 13). So "this repo actually had `TBD`" is true of the **value** and false of the
   **failure**. Realized failures in this repo's history: **zero**. That does not invalidate the
   defect — measurement 4 proves `TBD` would fail today — but anyone writing this up should not
   describe it as a second incident.
3. **NEW — the issue's contract-contradiction claim is unsupported.** It says the behaviour
   *"Contradicts the documented contract that project names are generated (project `CLAUDE.md`:
   'generated project names … are selected automatically and recorded')."* The cited sentence is
   `commands/workflow-init.md:148` / `templates/routing/init.skeleton.md:168`:
   *"Treat nonessential workflow bookkeeping as autonomous: generated project names, collision
   suffixes like `-2`, cache/artifact paths, and harmless ordering choices are selected
   automatically and recorded."* That is a statement about **not asking the user**, not a guarantee
   that names are machine-generated. No contract is contradicted.
4. **NEW — `cmdProjectName` / `project-name` has zero callers** (measurement 18). The repo's only
   written specification of the field hangs off dead-ish CLI surface. This is what made the
   vocabulary invisible in the first place.
5. **REFINEMENT of §7.** Its two lists are different populations and should not be merged: the
   first is *archive folder names* (which include names never written to `.roadmap`), the second is
   *values committed to `.roadmap/issue-*.md`*. My full-history sweep (measurement 6) reproduces the
   second list exactly and adds counts — `—` 1395, `issue-244-stage-a` 24, `issue-250` 12,
   `bundle-414-418-422` 7, `parallel-classifier` 5, `pr-sink` 3, `TBD` 1. §7 is accurate; the
   distinction just matters when someone builds a control set.
6. **CONFIRMED.** "The issue's cited fallback at 5196/5227 is a misattribution" — those are
   `collectStale`, which never calls `projectNameForIssue`. Correctly out of scope.
7. **CONFIRMED.** `workflow-next` really does prescribe a claim with no `--project`:
   `commands/workflow-next.md:115` → `node "$CLAIM_JS" startup --runtime claude --target-issue "$KAOLA_TARGET_ISSUE"`.

---

## Candidate scorecard

| Candidate | Answers KaolaVPN `unclaimed` | Answers in-repo `TBD` | Answers the next placeholder | Cost | Verdict |
|---|---|---|---|---|---|
| 1. Blocklist `'unclaimed'` (as filed) | yes | **no** | no | 4 hand-ported copies, 2 unguarded | **Reject** — encodes a foreign repo's vocabulary; misses the only value this repo ever had; looks complete and is not |
| 2a. Kebab allow-list | **no** (`unclaimed` is valid kebab) | yes | partly | same | **Reject** — fails its own negative control |
| 2b. Kebab + must-contain-`-` | yes | yes | **no** (10/10 adopted) | same, + rejects 6/6 legitimate single-word names | **Reject** — passes the historical controls by coincidence; specifies the method, not the result |
| 2c. Placeholder blocklist (ci) | yes | yes | **no**, unboundedly | same, + perpetual maintenance | **Reject** — the class has no closed membership |
| 3. Fix at the roadmap write | **no** (hand-authored) | **no** (hand-authored) | no | roadmap.js ×4 | **Reject** — does not reach either observation |
| **4. Contract + vocabulary** | **at authoring time, yes** | **at authoring time, yes** | **yes — a stated result covers the unbounded class** | 3 docs/skeleton edits, zero runtime risk | **RECOMMEND** |
| 5. Close as invalid | — | — | — | — | **Reject the verdict, accept half the reasoning** — the defect is real (measurements 3–4) but the filed *diagnosis* and *fix* are both invalid |

**On a combination:** candidate 4 *is* the combination the parent anticipated, minus the guard —
it pairs a documented contract with the existing, already-tested fallback. I looked hard for a
narrow guard worth adding alongside it and found none that is a rule rather than a guess. Adding
one anyway would be a mechanism justified by *"an agent might get this wrong"*, which CLAUDE.md
names as an argument against the design's premise.

**On fail-loud vs fall-through:** fail-loud is wrong here on the project's own terms. `claimProject`
refusing an unrecognised project name would refuse a *legitimate first claim of a new project*,
because a new name is indistinguishable from a bad one (Leg 3). Refusal is reserved for operations
that would destroy something nobody agreed to lose; a misleading folder name destroys nothing and
is recoverable by rename.

---

## Open

- **KaolaVPN#3 is not re-measurable from here.** It is a separate repository, outside this
  repository's tree, and reaching into it is not something I will do without the user asking. I
  take the issue's quoted envelope as reported; every claim I make about *this* codebase is
  measured independently of it.
- **Who authored KaolaVPN's `.roadmap/` sources, and whether `unclaimed` came from a tool there,
  is unmeasured.** It does not change the recommendation — measurement 7 settles that nothing in
  *this* codebase emits it — but it would settle whether that repo also needs a local fix.
- **I did not run the four-chain receipt or the gitea/gitlab/codex suites.** Not needed: the
  recommended shape changes no script. If the owner overrides toward a code change, all four chains
  become mandatory and the two forge ports need hand verification (`validate-script-sync.js:485`
  compares export key sets only — a body divergence there is silent).
- **The exact wording of the three doc/skeleton additions is not drafted here.** That is authoring
  work for the role that owns the write; this report fixes the shape and the sites.
- **Whether `workflow_project` should remain free text at all is a value call, not a fact.** A
  closed vocabulary for the field would be a user-owned contract change to a durable state format,
  and belongs to the user in conversation — I am not deciding it.
