# Premise pass — issue #954 (three ADR 0017 watch-list rows)

Worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`
Commit: `483a5e5e` (`chore(roadmap): file #952–#955 — the ponytail-review adoption set`), tree clean.
Target file: `docs/decisions/0017-the-mission-list.md`
Read-only pass. No tracked file was modified.

## Verdicts up front

| row | verdict |
|---|---|
| 1 — subagent rule-carrier gap | **ARMED**, but reword: the carrier already exists here and is fail-open by design; what is absent is *injection*. Sizing is available **internally**, which is stronger than an external pointer. |
| 2 — in-context prose rule measurably not followed | **ARMED only if #524 is named inline.** A strict reading of the ADR's bar makes it ALREADY-OBSERVED: `CHANGELOG.md:2710` records a live instance. Counter-evidence also exists at scale (`docs/conventions.md:846-856`). |
| 3 — load-bearing rule phrase silently absent from a non-byte-comparable rendered surface | **ALREADY-OBSERVED-SO-NOT-A-WATCH-ROW.** Not symmetry-only — it has a real arming observation, and that is the problem: the failure **shipped**, and a mechanism was built for it in #949. |
| pointer material | **None in the repo.** No local artifact describes ponytail's implementation. No size or effort figure exists anywhere locally. Do not invent one. |

---

## 1. The watch list — exact format and existing content

### 1.1 Location

`docs/decisions/0017-the-mission-list.md`

- Section heading, line 121: `## The watch list — derived, never observed, therefore not built`
- Introductory prose: lines 123–132
- Table header: line 134; separator: line 135; **data rows: lines 136–147 (twelve rows)**
- Post-table prose that annotates specific rows: lines 149–181

### 1.2 Column headers (verbatim, line 134)

```
| failure class | observation that would arm it | mechanism already sized |
```

Separator (line 135), verbatim, 13 characters, no alignment colons and no padding:

```
|---|---|---|
```

### 1.3 Formatting facts, measured

| fact | measurement |
|---|---|
| pipe style | leading `\|` and trailing `\|` on every row; single space either side of each cell's content |
| alignment padding | **none** — cells are not padded to a common column width |
| line wrapping | **none** — each row is one physical line. Measured lengths: header 75, separator 13, data rows 154, 297, 149, 144, 249, 309, 431, 552, 451, 559, 762, **2160**. Prose in this document otherwise wraps near 100 columns; table rows are exempt and grow without limit. |
| literal pipes in a cell | escaped as `\|`. One occurrence only: line 144's `/<!--\s*kw:claim\s+(project\|sess)=/`, which is why that line counts 5 pipes rather than 4. |
| cell content | **prose, not pointers.** Full sentences with inline code spans (`` `acquireProjectLock` ``), bold emphasis, `file.js:line` and `file.js:214-217` locators, bare commit SHAs (`c4caa8d3`, `b3bc7acf`), dates (`2026-08-01`, `2026-08-11`), issue refs (`#941`, `#951`), and measured counts (`563/563`, `0 of 62`, `3 of 14`). |
| length trend | rows grew over time. The oldest are one clause each (144–154 chars); the three most recent are 559, 762 and 2160 characters and carry measurement transcripts inline. **A long row is native to this table, not an anomaly.** |
| what column 3 carries | not just a name — the **sizing**: symbol names, the commit to recover from, assertion counts and deltas (`+3 assertions (563→566)`), and explicit refusals of alternatives. |

### 1.4 Every existing row, verbatim

Row 1 (line 136):
```
| stale / replayed / cross-copied evidence | a result that does not correspond to the work claimed | provenance stamps: open, baseline ref, author, time |
```

Row 2 (line 137):
```
| two honest live writers on one file | a successor resuming beside a crashed-but-alive predecessor | CAS with the conflict returned as data; lease with liveness probe — built once as `acquireProjectLock` / `probeLockLiveness`, removed in `c4caa8d3`, recoverable from git history at `b3bc7acf` |
```

Row 3 (line 138):
```
| co-open items sharing a working tree | per-item results that cannot be told apart | label the blend as a blend — a joint result, honestly named |
```

Row 4 (line 139):
```
| an unrecoverable merge | a sink outcome the orchestrator could not repair after the fact | a rescue ref per merge, recording pre-merge state |
```

Row 5 (line 140):
```
| a value call taken by the agent | an irreversible choice a human should have made | the consent valve — built once as the halt marker, its two journals and `consentScopeDigest`, removed in `c4caa8d3`, recoverable from git history at `b3bc7acf` |
```

Row 6 (line 141):
```
| a typed envelope code documented asymmetrically across runtimes | any typed `reason:` code appearing on a runtime surface **at all** — the enforcement domain becoming non-zero. Today it is 0 of 62 | `scripts/test-runtime-lexicon-parity.js`, deleted 2026-08-01, recoverable from git history at `b3bc7acf` |
```

Row 7 (line 142):
```
| retired vocabulary entering an additive edition through its own transform | a retired token on an `.opencode/` or `.kimi/` surface that is **not** present in the canonical source it renders from — i.e. one introduced by the sync transform itself | the scan already applied to the other two render families: import `RETIRED_VOCABULARY_BAN` and run it over the rendered edition tree, as `test-generate-routing-surfaces.js` does |
```

Row 8 (line 143):
```
| a claim-marker delete that matches every project at once | a production call reaching `clearAdvisoryClaim` with a **falsy** `project`, whose generic-regex arm then clears other runs' live markers. All 11 production sites pass a provably non-empty slug, so the arm has no producer today | narrow the falsy arm to match nothing. Note it is **not** dead code: `test-gitlab-forge-helpers.js:214` and `test-gitea-forge-helpers.js:281` pass `null` deliberately and assert match-everything by name, so arming this deletes those two pins with the mechanism |
```

Row 9 (line 144):
```
| a claim marker the detector sees but the deleter cannot clear | a marker blocking a re-claim that no workflow command can remove — the deleter is an exact, case-sensitive, `project=`-only substring while the detector (`classifier.js:215`) is `/<!--\s*kw:claim\s+(project\|sess)=/`. No `sess=` producer exists, so only a hand-written comment reaches the gap | widen the deleter's predicate to the detector's regex, scoped to the run's own project |
```

Row 10 (line 145):
```
| a stranded marker on an issue left open | a `kw:claim` marker outliving its run on an **open** issue with no live folder. `closure-audit.js` repairs stale *labels* and only on `--state closed`; `kw:claim` appears nowhere in it, and the 24h expiry (`classifier.js:216-217`) is the only thing that clears one — a marker with no `updated_at` blocks indefinitely | a marker equivalent to `detectStaleLabels`. Sized as larger than it looks: the artifacts cannot be told from another session's **live** claim without a project-scoped active-folder cross-check |
```

Row 11 (line 146):
```
| an edition-sync mismatch class shipped without a remedy | a `mismatches.push` site in `sync-opencode-edition.js` reaching `remediationLines` with no `remedy` field. `remedies` is a `Set` built by `mismatches.map(m => m.remedy)`, so `undefined` is neither a flag nor a source edit and falls out of **both** branches — the class prints no advice at all, silently reintroducing what #941 closed. Probe-measured on a mirror by adding a fifteenth class; all 14 real classes carry a remedy today, so the arm has no producer | assert at the constructor sites that every pushed mismatch carries a known `remedy`. Note A30's `CLASSES` table is hand-maintained (3 of 14) and structurally cannot notice, so the assertion belongs over the push sites, not in that table |
```

Row 12 (line 147, 2160 chars — the current longest):
```
| an opencode `--check` report that advises a command without scoping out what that command cannot fix | a shipped report naming a `Fix:` invocation while silently omitting the file no flag clears. Mutation-measured 2026-08-11 (#951): dropping the source-edit footer conditionally (`flag ? [] : …`) **or** unconditionally (`sourceEdits = []`) leaves `test-opencode-edition.js` green at 563/563, exit 0, the suite's own output byte-identical to baseline under **both** legs. No assertion in that suite observes the line: A30 quantifies over `ADVICE_RE` runnable invocations and the footer is prose, so it never enters `advised`. A second, independent copy sits on a **prose** surface — `docs/opencode-edition.md:362` carries the line verbatim and its rule at `:349-353`, and no script consumes that doc, so code and documentation can diverge with every suite green. Severity is bounded for the conditional form only: the line reappears on the re-check once the advised command runs. Under the unconditional form it never appears at all | two, neither built. **(1)** A non-wording discriminator: assert the flag-irreducible path is named at least twice wherever `flagProof` is non-empty — +3 assertions (563→566) across those 3 of 6 scenarios, catching the conditional form on 2 of 3 (it survives the scenario that advises no flag) and the unconditional on 3 of 3, and invariant to rewording. Scope it to the flag-advised scenarios instead and it sizes to +2, still catching both forms but losing the flag-free scenario — the pure flag-irreducible case — so the unconditional form reds on 2 of 3 sites rather than 3 of 3. **(2)** The kimi twin's shape: `K12` (`test-kimi-edition.js:1324-1414`) pins that edition's remediation as an **outcome** and reds twice when its line is deleted (521 / exit 0 → 2 failures / 518 passed). So **opencode is the edition missing a guard its sibling already has** — the sharpest fact that would arm this row, and still not an observed failure. A prose-sentence pin is refused outright: A30's header derives against it, and it would be the file's first, though a *token*-level output pin has precedent at `:2818` |
```

### 1.5 What the ADR says a watch-list row IS

The heading itself (line 121) is the definition:

> `## The watch list — derived, never observed, therefore not built`

Lines 123–125, verbatim:

> Earlier subtractive passes derived mechanisms for failure classes that **have never been observed in
> this methodology**. They are recorded here rather than built, so that if one is ever seen the design
> is a lookup rather than a campaign.

Lines 127–132, verbatim — the recovery-information requirement, which is a **format obligation on
every new row**:

> **This table is the register of record, and the only one.** A backlog issue once mirrored it so the
> analysis was discoverable from the issue list rather than only from a doc nobody opens; that pointer
> is closed, because a permanently-open issue that is explicitly not work is a standing invitation to
> schedule it. Every row therefore carries its own recovery information inline — a row whose mechanism
> was built and later removed names the symbols and the commit to recover them from, so consulting the
> table never requires reading a closed issue or a deleted roadmap entry.

**"Every row therefore carries its own recovery information inline"** is what makes #954's "sizing
carried inline as pointers" a format obligation, not a stylistic preference. Note what the ADR's own
instance of it looks like: *enough to reconstruct without opening another document*. A bare URL to an
external repository is materially weaker than what all twelve existing rows do, and section 3 below
shows there is no local material to make it stronger.

### 1.6 The symmetry refusal is already in the file

Lines 149–156, verbatim. This is the passage #954's hard constraint derives from:

> The additive-edition row was derived by symmetry, and symmetry is exactly the argument this list
> exists to refuse. Both other render families now carry the scan — the twelve reviewer surfaces since
> the retired-vocabulary cleanup, the eighteen routing surfaces since #887 — and each was armed by an
> observed failure: `node-id` reaching twelve surfaces through a generator's own render, and retired
> node/DAG wording reaching the plugin manifests a user reads before installing. **No token has ever
> entered through an opencode or kimi transform.** Their surfaces render from canonical, which is now
> scanned on both sides, so the only uncovered path is a token the transform *introduces* — which is
> the observation named in the row, and until it happens the row is a lookup, not a task.

Two consequences a writer must handle:

1. Proposed row 3 sits **immediately adjacent** to existing row 7 in subject matter (both are about the
   opencode/kimi transforms). Row 7 already needed a defensive paragraph to survive. A second row on the
   same transforms will be read against that paragraph.
2. The sentence **"No token has ever entered through an opencode or kimi transform"** is scoped to
   *tokens entering*. It says nothing about *phrases leaving*, which is proposed row 3's direction — and
   section 2.3 shows a phrase leaving **has** happened and shipped.

### 1.7 Qualifying bar, as the table practises it

Read as a corpus, a row qualifies when all four hold:

1. the failure class is **coherent for this design** — a concrete code path, surface or artifact in this
   repo, not a generic risk;
2. column 2 names an observation that is **checkable and currently false** — several rows say so in
   words: "the arm has no producer today", "Today it is 0 of 62", "All 11 production sites pass a
   provably non-empty slug", "No `sess=` producer exists";
3. column 3 is **sized** — symbols, files, commits, and usually a numeric delta;
4. the derivation is **not symmetry** (line 149), and the class has **not been observed** (line 123).

---

## 2. Testing each row's arming observation

### 2.1 Row 1 — subagent rule-carrier gap · **ARMED (with a required rewording)**

**Does this repo inject rules at subagent start? No. Does a SubagentStart hook exist? Yes.**

Observation A — a `SubagentStart` hook exists and is wired on every edition.
`hooks/hooks.json:18-31` declares exactly two hook events:

| event | matcher | command | purpose per its own `description` |
|---|---|---|---|
| `SessionStart` | `compact` | `kaola-workflow-compact-context.js` | "Inject Kaola-Workflow resume state after context compaction" |
| `SubagentStart` | `*` | `kaola-workflow-subagent-dispatch-log.sh` | "Record subagent spawns (agent_type/agent_id/cwd) to .cache/dispatch-log.jsonl for closure attestation (#277 M1)" |

The same two events appear in all five plugin copies (`plugins/kaola-workflow/config/hooks.json`,
`plugins/kaola-workflow-gitlab/{config,hooks}/hooks.json`,
`plugins/kaola-workflow-gitea/{config,hooks}/hooks.json`). The opencode edition bridges them in
`templates/opencode/plugins/kaola-workflow-hooks.js`, whose header states the mapping:
`tool.execute.before · task → kaola-workflow-subagent-dispatch-log.sh` and
`experimental.session.compacting → inject active kaola-workflow resume state`.

**Correcting the prior audit's recollection:** it is accurate that no `PreToolUse` / `PostToolUse` hook
exists — measured, `hooks.json` declares only `SessionStart` and `SubagentStart` — but "no hooks exist"
would be wrong. A SubagentStart carrier is live on all four runtimes today.

Observation B — that hook **logs; it does not inject**. `hooks/kaola-workflow-subagent-dispatch-log.sh`
appends one JSONL line per active project to `.cache/dispatch-log.jsonl` (`:79`) and returns nothing to
the runtime.

Observation C — **every failure path fails open, by design and in writing.** The file's own header,
`:3`: *"SubagentStart delivers a JSON payload on STDIN; exit 0 always (fail-open)."* Measured exits:
bare `exit 0` on empty stdin (`:6`), on an unparseable/absent `agent_type` (`:11`), when neither the
hook's cwd nor the agent's cwd is a git repo (`:51`), and at the end (`:118`); `|| true` on all four
`node -e` JSON extractions (`:10`, `:14`, `:17`, `:22`); `|| continue` on the JSON line build (`:78`);
and the model-resolver loop is explicitly commented *"a missing or unresolvable resolver never breaks
dispatch logging (empty on failure)"* (`:29`). `CLAUDE.md` classifies it: "Background hooks
(subagent-dispatch-log) are advisory".

Observation D — the **only** injector in the repo is `SessionStart`/`compact`, and it injects into the
main session, not a subagent. Repo-wide, `additionalContext` / `hookSpecificOutput` appear only in the
codex compact-resume plugin copies, and `simulate-kaola-workflow-walkthrough.js:528` asserts the
compact-resume stdout must **not** carry a `hookSpecificOutput` envelope.

Observation E — no recorded incident. Searching `CHANGELOG.md` and `docs/` for a subagent that failed to
carry a project rule returns nothing.

**Inference (high confidence).** The class is coherent and unobserved here, so it qualifies. But the
row as filed — "SubagentStart injection with every failure path failing open" — describes a mechanism
this repo is **one behaviour short of**: the hook, the matcher, the fail-open discipline and the
four-runtime wiring already exist and already run on every dispatch. Sizing this row against an external
repository would understate what is known. **Size it internally:** name `hooks/hooks.json:18-31`, the
`*` matcher, `hooks/kaola-workflow-subagent-dispatch-log.sh` and its four fail-open exits, and state
that the addition is an emitted payload rather than a new hook — plus the five plugin copies and the
opencode adapter that any payload change must reach. That is inline recovery information in the sense
lines 127–132 require.

**Refuted by:** finding a rule-injection path at subagent start on any runtime. None found.

### 2.2 Row 2 — an in-context prose rule measurably not followed · **ARMED only if #524 is named**

**It has been observed here, once, and it is recorded.** `CHANGELOG.md:2710` (#524):

> Before this fix, the `issue-scout` agent profile scored candidates on cohesion + actionability alone,
> with no roadmap-priority axis. This caused live mis-rankings (observed on `vrpai-cli`): the scout
> picked adjacent environment/SDK issues (vrpai-cli 82, then 652) over the vrpai-cli `488/502/561` epic
> frontier that the roadmap drives, rationalizing them as "the closest actionable proxy" — **a silent
> substitution that violated the drive-order the `### Project rules` guardrails and master-epic `Next
> Step` ordering encode.**

The fix's wording concedes the prior state directly: "A documented `### Project rules` guardrail … is
honored as a hard constraint, **not a suggestion**." `docs/decisions/D-524-01.md:82` records the same:
"The prior silent substitution ('the closest actionable proxy') is retired."

Two qualifications, both measured:

- **The rule lived in the material the scout read, not in the scout's own prompt.** The roadmap's
  `### Project rules` guardrails and `next_step:` ordering were in its context; its profile carried no
  priority axis. So "in-context prose rule not followed" is a fair reading, and so is "its instructions
  never told it to". Both readings are available from the same paragraph.
- **`issue-scout` is no longer a role.** `agents/` holds 14 profiles
  (adversarial-verifier, build-error-resolver, code-architect, code-explorer, code-reviewer,
  doc-updater, implementer, investigator, knowledge-lookup, metric-optimizer, planner,
  security-reviewer, synthesizer, tdd-guide) and `issue-scout` is not among them; it survives only in
  `test-install-upgrade-rewrite.js`, `test-kimi-edition.js`, `test-opencode-edition.js` and
  `validate-kaola-workflow-contracts.js`. The observation is historical, on a retired role, and predates
  the mission-list design.

**Counter-evidence, and it is stronger than the row expects.** `docs/conventions.md:840-882`
(#900–#903) already contains a compliance measurement at scale, and it points the other way:

> Statements about the *result* … held without exception, and each time the agent found a route the
> orchestrator had not thought of. Statements about *mechanism* failed **four times out of four** …
> **Every one was corrected by the agent that received it**, and could only be corrected because nothing
> obliged it to comply.

Note what that measured: the four failures were the *brief* being wrong, not the agent disobeying, and
the agent repaired each. The same section names the error class that would actually matter — "the two
defects that survived every suite were **invisible from inside the task**" — and observes "Iterating
never finds those, because the feedback signal is itself wrong."

**Inference (medium-high confidence).** The class is real and open, and no benchmark of any kind exists
here (`git grep -iP 'LLM.?judge|three.?arm'` returns only unrelated refusal-taxonomy "arms" and code
"arms" — no benchmark material anywhere in the repo). But a row claiming the class is unobserved is
**refutable on its face by `CHANGELOG.md:2710`**. Write the row so it survives that: name #524 in
column 2 as the one recorded instance, state that it predates the mission-list design and that the role
is retired, and scope the arming observation to something currently false — e.g. *a rule present in a
live role profile, demonstrably in context, measurably not followed under the current design*. Column 3
should also concede `conventions.md:846-856` as a partial measurement already taken, or a reader will
find it and conclude the row was written without reading it.

**Refuted by:** treating #524 as an instance of the same class under the current design — which would
make this ALREADY-OBSERVED rather than a watch row.

### 2.3 Row 3 — load-bearing rule phrase silently absent from a non-byte-comparable rendered surface · **ALREADY-OBSERVED-SO-NOT-A-WATCH-ROW**

This row is **not** symmetry-only. It has a genuine arming observation. That is precisely why it fails:
**the observation is of the failure actually shipping, and a mechanism was built for it.**

**The observation, recorded twice.**

`scripts/sync-opencode-edition.js:415-421`, in the source, above the near-miss regex:

> A heading that READS like that section without being it. The substitution below is a plain `if`, and
> **a canonical rename once moved the heading out from under it: nothing threw, the block was simply
> never substituted, and the surface shipped without the one paragraph telling an opencode reader how a
> role is dispatched** on a runtime whose task tool takes no model.

`CHANGELOG.md:20-24` (v9.6.0, #949):

> The heading was renamed rather than deleted because its **string** is a live anchor: six code sites
> match on it, three of them edition transforms with no fallback. Deleting it reds three of the four
> chains, and — measured — **the opencode and kimi transforms do not fail at all; they silently no-op**,
> dropping the sentence that tells those runtimes their task tool has no model parameter. Those
> transforms are **re-anchored and now report a stale anchor instead of missing it in silence.**

That is proposed row 3's failure class, word for word, and it **shipped**. Under line 123's bar
("failure classes that have never been observed in this methodology") it is a bug that was found and
fixed, not a watch-list entry.

**The mechanism already exists.** Measured, four layers over that anchor:

| layer | site |
|---|---|
| the anchor | `sync-opencode-edition.js:413` / `sync-kimi-edition.js:398` — `MODEL_DISPATCH_HEADING = /^##\s+Agent Model Dispatch\s*$/` |
| the missing `else` | `sync-opencode-edition.js:422` / `sync-kimi-edition.js:407` — `MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/`, described in its own comment as "the missing `else` — deliberately looser than the anchor, because its whole job is to notice that the anchor no longer matches" |
| the throw | `assertModelDispatchAnchorMatched` (`sync-opencode-edition.js:427-437`), called at `:507` |
| suite anchors | `test-opencode-edition.js:824` (`S2: at least ONE canonical command carries \`## Agent Model Dispatch\``) and `test-kimi-edition.js:373` (`K2-anchor: …`) |

Plus `validate-workflow-contracts.js:179` asserts the heading's presence, and
`templates/routing/finalize.skeleton.md:43` and `commands/kaola-workflow-finalize.md:29` carry it.

**Which surfaces are byte-comparable, and which are not.** Byte-comparable, and therefore already
covered: `kaola-workflow-adaptive-schema.js` (byte-identical ×4, the cross-edition drift anchor); the
18 routing surfaces, checked by `generate-routing-surfaces.js --check` in every chain; the `.toml`
forge ports (byte-identical to the prose blocks governing them); the opencode init template (`A24`
/ #812 asserts byte-identity to canonical) and its kimi twins (`K4` / `K11`).
**Not byte-comparable:** exactly the *transformed regions* of the opencode and kimi command renders —
the substituted and stripped sections inside `transformCommandBody`. That set is small and enumerable,
not open-ended.

**I enumerated it, and every prose-keyed transform site has a net except one.**

| transform site | keyed on | net |
|---|---|---|
| `sync-opencode-edition.js:450` / `sync-kimi-edition.js` model-dispatch substitution | `## Agent Model Dispatch` | near-miss throw + `S2` + `K2-anchor` + contract validator |
| `sync-opencode-edition.js:474` / `sync-kimi-edition.js:459` Path Intent strip | `/^##\s.*\bPath Intent\b/` | A22 negative assertions, named in the comment at `:473`; `Path Intent` ×9 and `KAOLA_ENABLE_ADAPTIVE` ×3 in `test-opencode-edition.js` |
| `sync-opencode-edition.js:535` inline residue strip | `" (Step 0a-1)"` / `" or Step 0a-1"` | `Step 0a-1` ×7 in `test-opencode-edition.js` |
| `sync-opencode-edition.js:540` runtime-label rewrite | `--runtime claude` | `runtime opencode` ×3 in `test-opencode-edition.js` |
| **`sync-opencode-edition.js:494` / `sync-kimi-edition.js:470` Codex-note strip** | `/^>\s*\*\*Codex hooks note:/` | **none — zero references in either edition suite** |

And that last one is **already dead**, measured: `git grep -n 'Codex hooks note' -- commands/ templates/`
returns nothing; repo-wide the string survives only inside the two sync scripts and five archived run
records under `kaola-workflow/archive/`; the rendered `.opencode/command/workflow-init.md` contains 0
occurrences. Both strips match nothing today and nothing observes them.

Two reasons that residue does not rescue row 3:

1. **Wrong direction.** A strip that silently no-ops leaves a phrase wrongly *present* on the rendered
   surface (Codex-only install guidance pointing at `install-codex-agent-profiles.js`, meaningless on
   opencode). Row 3 is about a load-bearing phrase going *absent*.
2. **It is a `delete:` finding, not a watch row.** Dead code with no consumer and no observer is exactly
   #952's grammar. It belongs in the subtraction audit.

**And the generic form of the proposed mechanism is already refused in writing.**
`docs/conventions.md:350-353`:

> What is deliberately **not** built is a generic anti-vacuity harness that reports enforcement-domain
> size alongside every result. Measured against the five observations above it catches one, and it is a
> mechanism justified by *"a guard might be aimed wrong"* — the shape this project's derivation rule
> rejects.

A canary-phrase sweep over rendered surfaces is that shape: a generic net over a class whose one
observed instance already has a specific, mutation-relevant guard.

**Corroboration that the downgrade to a watch row was itself premise-driven.** The only local record of
this row's provenance (the 2026-08-11 session memory, outside the repo) states that the invariant-phrase
canary was demoted from a buildable issue because the recalled "kimi init parity guard unarmed" fact was
**stale** — `A24` / #812 and `K4` / `K11` already cover it. So the row exists because its build case
collapsed, not because a new failure class was found.

**Inference (high confidence).** Row 3 as filed cannot be written honestly against this table's own bar.
Three options, in the order I would recommend them:

1. **Drop row 3.** The class is observed, the instance is fixed, the generic mechanism is pre-refused,
   and the only uncovered site is dead code that belongs to #952. This is the answer the ADR's own
   derivation rule gives.
2. **Rewrite it as the narrow, still-unobserved residue** — *a prose-keyed transform site with no suite
   assertion over its outcome*, arming on a **second** such site appearing, with column 2 recording that
   the one that exists today (`:494` / `:470`) is dead and routed to #952, and column 3 pointing at the
   `assertModelDispatchAnchorMatched` shape as the per-site remedy already built once. This is defensible
   and it is not symmetry — but it is a materially different row from the one #954 describes.
3. Write it as filed. It will be refuted by the first reader who opens `CHANGELOG.md:20`.

**Refuted by:** showing the #949 incident is a different class from the one row 3 names. I could not
construct that argument — the CHANGELOG sentence and the row's wording describe the same event.

---

## 3. The external pointers — **no local material exists**

Searched, all measured on the main tree at `483a5e5e`:

| search | scope | result |
|---|---|---|
| `ponytail` (tracked) | whole repo | **2 files**, 1 occurrence each: `kaola-workflow/.roadmap/issue-954.md`, `kaola-workflow/ROADMAP.md` |
| `ponytail` (all files, dot-dirs included, `node_modules`/`.git` pruned) | whole tree + worktree | the same two files, their worktree copies, `bundle-952-953-954-955/mission-list.md`, and this report |
| `DietrichGebert` | same | identical result set |
| `ponytail` | `git log --all -i --grep` | **one commit**, `483a5e5e`, the roadmap filing |
| `kaola-workflow/archive/**` (~390 run folders) | content search | **no hit** |
| `docs/**` | content search | **no hit** |
| `LLM judge` | whole repo | **no hit** |
| `three-arm` | whole repo | 7 hits, **all unrelated** — refusal-taxonomy "three arms" (`D-419-01.md:133`, `D-594-01.md:97`, `2026-06-12-parallelism-v3-design.md:101`) and code "arms" (`kaola-workflow-claim.js:1423`, `test-claim-hardening.js:1390`, `test-sink-merge.js:4011`) |
| `INVARIANTS` | whole repo | present, but in unrelated contexts (`D-617-01.md`, an investigation doc, archived run records) — no canary construct |

**The complete pointer material available locally, verbatim:**

1. `kaola-workflow/.roadmap/issue-954.md:5` — one clause per row, no figures:
   *"(1) subagent rule-carrier gap — SubagentStart injection with every failure path failing open; (2)
   in-context prose rule measurably not followed — three-arm real-session benchmark with LLM judge; (3)
   load-bearing rule phrase silently absent from a non-byte-comparable rendered surface — INVARIANTS
   canary phrases with the ceiling declared in place."*
2. `kaola-workflow/ROADMAP.md` — the generated mirror of the same line.
3. Commit `483a5e5e`'s message — *"Four issues from the 2026-08-11 external design review of
   DietrichGebert/ponytail"* plus the four one-line titles. Nothing about the implementation.
4. **Outside the repo**, the 2026-08-11 session memory
   (`~/.claude/projects/-Users-ylpromax5-Workspace-Kaola-Workflow/memory/project_2026-08-11_ponytail_review_filed_952-955.md`)
   holds two facts and no more: *"ponytail (100k stars in 2 months; YAGNI-ladder skill + 20-host adapter
   distribution). Its core product is orthogonal to us; adopted only what observed needs ground"*, and
   row 3's downgrade rationale (§2.3 above).

**No local artifact describes what ponytail's SubagentStart injection does, what its benchmark measured,
what its INVARIANTS canary looks like, or any size or effort figure for any of the three.** The review
that produced #952–#955 left no report in the repo — the four `issue-*.md` files *are* its only durable
output.

**Consequence for the write.** A "pointer to the reviewed external implementation" can, from local
material, be no more than a repository name plus the clause already in `issue-954.md`. Every existing
row's column 3 is sized from *this* repo's symbols, files, commits and counts. Sizing rows 1 and 3 that
way is possible and is documented above (§2.1, §2.3). Row 2 has no local sizing available at all, since
no benchmark or judge harness exists here.

**Do not write a figure.** No number about ponytail is recoverable from this machine.

---

## 4. CHANGELOG state — **no `[Unreleased]` section; it must be created**

- Top section: `CHANGELOG.md:3` → `## [9.6.0] - 2026-08-11`.
- Version headings in order: `[9.6.0]` (3), `[9.5.5]` (223), `[9.5.4]` (317), `[9.5.3]` (388),
  `[9.5.2]` (462). **No `## [Unreleased]` heading exists.**
- The string `Unreleased` occurs 7× in the file: six are prose *inside* historical entries
  (`:1238`, `:1594`, `:2304`, `:2316`, `:2322`, `:2872`), and one is a legacy `## Unreleased` heading at
  `:4788` — the bottom of the file, from early history, not the active section.

This matches the known behaviour that `--prepare` consumes the section at release. An `[Unreleased]`
section must be created above line 3.

---

## Open — what I did not measure

- I did not run any suite. Nothing in this pass required execution: every claim above is a file read or
  a `git grep`, and the mutation evidence I cite (#949, #951) was recorded by earlier runs, not
  reproduced here.
- I did not verify that the `Codex hooks note` strips are unreachable by *execution* (e.g. by running
  `sync-opencode-edition.js --check` with instrumentation). The claim rests on the marker being absent
  from `commands/` and `templates/` and from the rendered `.opencode/command/workflow-init.md`. If that
  finding is routed to #952, it should be confirmed by execution before anything is deleted.
- I did not search GitHub for `DietrichGebert/ponytail`. This was a read-only local pass and no
  network call was authorized; if the rows are to carry real external sizing, that fetch is a separate
  decision for the orchestrator.

---

## Addendum — measurement provenance (recorded at end of pass)

- Both validator filenames cited above exist and are distinct: `scripts/validate-workflow-contracts.js`
  (the `:179` citation) and `scripts/validate-kaola-workflow-contracts.js`.
- `kaola-workflow/archive/` holds **388** run folders; the content searches in section 3 covered all of
  them.
- **The "tree clean" note in the header was true when this pass began and is no longer true of the
  worktree.** At the end of the pass, `git status` in
  `.kw/worktrees/bundle-952-953-954-955` shows modifications to `agents/{code-architect,implementer,
  planner}.md` and their nine `.toml` edition ports — #953's solution-ladder work by another agent, not
  this pass. **No file in this report's evidence set was touched by it.**
- Most measurements in this report were taken in the **main tree**
  (`/Users/ylpromax5/Workspace/Kaola-Workflow`), which sits at the same commit `483a5e5e` and carries no
  in-flight bundle edits — the correct pristine baseline for a premise pass. The ADR itself was read in
  the worktree; both copies are at `483a5e5e` and `docs/decisions/0017-the-mission-list.md` is unmodified
  in either.
- This pass modified **no tracked file**. Its only write is this report.

## 3. The external pointer material — does a local artifact exist?

### 3.0 The search, and what it found

Exhaustive, by content, never by guessing a folder name. Every command run from the repo root
(`/Users/ylpromax5/Workspace/Kaola-Workflow`) unless noted.

| # | command | result |
|---|---|---|
| 1 | `git log --all --oneline -i --grep=ponytail` | 1 commit: `483a5e5e` |
| 2 | `git log --all --oneline -S ponytail` | 1 commit: `483a5e5e` |
| 3 | `git log --all --oneline -i --grep=Gebert` | 1 commit: `483a5e5e` |
| 4 | `git grep -il ponytail HEAD` | 2 files: `kaola-workflow/.roadmap/issue-954.md`, `kaola-workflow/ROADMAP.md` |
| 5 | `git grep -il gebert HEAD` | same 2 files |
| 6 | `find kaola-workflow/archive -type f -print0 \| xargs -0 grep -il -e ponytail -e gebert` | **zero hits over 8592 files in 388 archived folders** (find used deliberately: hidden `.cache/` dirs exist under archived folders and `grep` here is ugrep) |
| 7 | `find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -print0 \| xargs -0 grep -il -e ponytail -e gebert` | 6 files, all of them the issue source, the mirror, the mission list and this report — in the main tree and its worktree copy. **Nothing in `docs/`, nothing in `docs/investigations/` (32 files), nothing in `docs/decisions/`.** |
| 8 | `find <memory-dir> -type f \| xargs grep -il -e ponytail -e gebert` | 2 files: `MEMORY.md`, `project_2026-08-11_ponytail_review_filed_952-955.md` |

**So: no artifact of the review exists anywhere in the repository — tracked, untracked or archived.**
`docs/investigations/` holds 32 files, none of them this review; the newest is dated 2026-08-03.

Two local artifacts of the review do exist, both outside the repo:

- **A** — `/Users/ylpromax5/.claude/projects/-Users-ylpromax5-Workspace-Kaola-Workflow/memory/project_2026-08-11_ponytail_review_filed_952-955.md`
  (the session memory). Prose summary only; carries **no size or effort figure** for any of the
  three mechanisms.
- **B** — `/Users/ylpromax5/.claude/projects/-Users-ylpromax5-Workspace-Kaola-Workflow/4cdd97ae-77cc-44b9-a6b0-60abc03af93d.jsonl`
  (the transcript of the review session, 664 173 bytes, 2026-08-11), **plus** its scratchpad, which
  survives at `/private/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/4cdd97ae-77cc-44b9-a6b0-60abc03af93d/scratchpad/`
  (4 files; `issue-a4-watchlist.md`, 2977 bytes, is the drafted #954 issue body).

Artifact B is the one that matters: the review fetched ponytail's files with `gh api …/contents/… | base64 -d`
and the transcript therefore carries **the external source verbatim**, not a paraphrase of it.

**Fidelity check of the capture (measured, not assumed).** Three fetched files were extracted from
the transcript and byte-counted against the sizes the repo's own git-tree listing reported in the
same transcript:

| file | tree-reported bytes | extracted bytes | extracted lines |
|---|--:|--:|--:|
| `scripts/check-rule-copies.js` | 2981 | 2980 | 75 |
| `hooks/ponytail-subagent.js` | 2683 | 2682 | 76 |
| `scripts/check-versions.js` | 3310 | 3309 | 77 |

Each is short by exactly one byte — a trailing newline lost in extraction, uniformly. The captures
are **complete, not truncated**. Extracted copies for reference:
`/tmp/claude-501/-Users-ylpromax5-Workspace-Kaola-Workflow/ae503519-d8a2-430d-afed-2e0890cfab35/scratchpad/{check-rule-copies.js,ponytail-subagent.js,check-versions.js}`.

**The complete list of what the review fetched** (every `gh api` call in the transcript, so the
outer bound of the local evidence):

1. repo metadata; 2. the full recursive file tree **with per-blob byte sizes**; 3. `skills/ponytail/SKILL.md`
(`head -120`, and my extraction of that entry truncates at 6000 chars — this one is **partial**);
4. `scripts/check-rule-copies.js` (**complete**); 5. `hooks/ponytail-subagent.js` (**complete**);
6. `docs/agent-portability.md` (`head -80`; the adapter table is complete, the tail of "Portable
Behavior" is cut); 7. stargazer timestamps; 8. `benchmarks/README.md` (`head -70`); 9.
`scripts/check-versions.js` (**complete**); 10. the four auxiliary SKILL.md files (review, audit,
debt complete; gain truncated mid-frontmatter).

Nothing else was fetched. In particular **`benchmarks/agentic/README.md`, `judge.py`, `run.py`,
`tasks.py` and `tests/hooks.test.js` were never read** — this bounds row 2 and is treated as a
finding in §3.2.

---

### 3.1 Row 1 — subagent rule-carrier gap

**Local pointer material: EXISTS, complete.** Source: transcript B, tool result at record 48
(`gh api repos/DietrichGebert/ponytail/contents/hooks/ponytail-subagent.js`).

**What the external implementation actually does.** `hooks/ponytail-subagent.js` is a Claude Code
**SubagentStart** hook. Its header states the failure class it was built for, verbatim:

> ```
> // ponytail — Claude Code SubagentStart hook
> //
> // SessionStart context is parent-thread only and never reaches subagents, so
> // without this every Task-spawned agent runs ponytail-unaware (issue #252).
> // When ponytail mode is active, inject the same ruleset into each subagent.
> //
> // Scoping (opt-in, issue #506): set PONYTAIL_SUBAGENT_MATCHER to a regex and
> // the ruleset is injected only into subagents whose agent_type matches. The
> // regex is unanchored and case-insensitive — "explore|general" matches either,
> // "^general$" is exact. Unset means inject into every subagent, as before.
> ```

Control flow, as shipped:

- reads the mode flag (`readMode()` from `./ponytail-runtime`); absent or `'off'` → `process.exit(0)`,
  inject nothing;
- `inject()` = `writeHookOutput('SubagentStart', mode, getPonytailInstructions(mode))`, wrapped in
  `try/catch` whose comment is *"Silent fail — a stdout error at hook exit must not surface as a hook failure."*;
- **no matcher set** → inject synchronously and exit; the comment names why the default path must
  never touch stdin: *"On Windows the PowerShell `if {}` wrapper can swallow the piped JSON so stdin
  'end' never fires (#443); the default path must not wait on stdin or it would stall every subagent spawn."*
- **matcher set** → read `agent_type` from stdin, strip a UTF-8 BOM before `JSON.parse`, and **skip
  only on a definite mismatch**.

**The "every failure path fails open" property, enumerated from the shipped source — four paths
inject anyway, one refuses to escalate:**

| # | failure | behaviour | in-source comment |
|---|---|---|---|
| 1 | `PONYTAIL_SUBAGENT_MATCHER` is not a valid regex | `matcherRe = null` → treated as no matcher → inject | *"A bad regex must never crash the hook; treat it as 'no matcher' and inject."* |
| 2 | stdin payload unparseable / `agent_type` missing | `agentType = ''` → predicate not reached → inject | *"Unparseable payload — fall through and inject to be safe."* |
| 3 | stdin `error` event | `finish(); process.exit(0)` → inject | *"Never block the session (#443): recover on stdin error or a short fallback."* |
| 4 | stdin never ends | `setTimeout(…, 1000).unref()` → `finish()` → inject | same comment |
| 5 | `writeHookOutput` throws at exit | swallowed; hook exits 0 | *"a stdout error at hook exit must not surface as a hook failure"* |

The skip is guarded by `if (agentType && !matcherRe.test(agentType))` — the truthiness test is what
makes 2/3/4 fail open, and the summarising comment says so: *"Missing/unparseable agent_type, a stdin
error, or the timeout all fail open (inject), so scoping never silently drops the persona."*

**Size / effort figures recorded (all from the transcript's own tree listing with byte sizes):**

- `hooks/ponytail-subagent.js` — **2683 bytes, 76 lines** (measured on the extracted copy).
- It is not self-contained: it requires `./ponytail-instructions` (`hooks/ponytail-instructions.js`,
  **5487 bytes**) and `./ponytail-runtime` (`hooks/ponytail-runtime.js`, **3249 bytes**) — i.e. the
  injection payload builder and the mode/output plumbing are shared modules, not part of the hook.
- The full hook family is **6 JS files / 26 575 bytes**: `ponytail-activate.js` 3957,
  `ponytail-config.js` 5881, `ponytail-instructions.js` 5487, `ponytail-mode-tracker.js` 5318,
  `ponytail-runtime.js` 3249, `ponytail-subagent.js` 2683.
- Registration is data, not code: `hooks/claude-codex-hooks.json` (**966 bytes**), plus
  `hooks/qoder-hooks.json` (704) and `hooks/copilot-hooks.json` (539).
- Tests: `tests/hooks.test.js` is **20 957 bytes** — the largest test file in the repo listing — and
  `tests/hooks-windows.test.js` is 5596. **How much of that covers the subagent hook specifically is
  unknown: neither file was fetched.** Do not convert these into an assertion count.

**A second carrier shape for the same failure class, also recorded locally** —
`docs/agent-portability.md` (transcript record 49), Qoder row, verbatim:

> `hooks/qoder-hooks.json` template registers `UserPromptSubmit` (mode activation + ruleset injection)
> and `PreToolUse` with `task|Task` matcher (subagent injection).

i.e. where no SubagentStart event exists, the same injection is carried by a `PreToolUse` hook
matched on the task-spawning tool. The same doc records two further tiers worth naming if the row
ever needs them: OpenCode *"injects the ruleset each turn via `experimental.chat.system.transform`"*,
and Grok, where *"lifecycle hooks are not used because passive hook output cannot inject instructions"* —
a runtime on which this mechanism is **not available at all**.

---

### 3.2 Row 2 — in-context prose rule measurably not followed

**Local pointer material: PARTIAL — and the issue's own phrase is not fully supported by it.**

**What exists locally.** Transcript record 63 carries `benchmarks/README.md` (`head -70`), verbatim
on the method:

> Three arms (no skill, [caveman](https://github.com/JuliusBrussee/caveman), ponytail), three models,
> five everyday tasks, **10 runs per cell, median reported**. Code LOC is counted from fenced code
> blocks; tokens, cost, and latency come straight from the API.

- harness: `npx promptfoo@latest eval -c promptfooconfig.yaml --env-file ../.env --repeat 10`;
  a no-API-key local path exists via `python benchmarks/benchmark-local.py --model llama3.2 --repeat 3`;
- tasks: email validator, JS debounce, CSV sum, React countdown, FastAPI rate-limit;
- single-shot completions, default temperature;
- results captured verbatim (median, 10 runs, 2026-06-13; cost re-verified at 30 runs 2026-06-17) —
  code lines baseline 518/693/256 → ponytail **39/44/51** across Haiku/Sonnet/Opus; cost and latency
  tables likewise;
- **the honest-downgrade paragraph**, which is the part the review actually valued, verbatim:

> **Read this number honestly (updated 2026-06-18).** The gap above is single-shot, against a bare
> model that answers with several options plus commentary, so it counts prose, not just code, and
> overstates the win. [#126] was right about that. The [agentic benchmark](agentic/) re-runs the
> comparison as a *real Claude Code session on a real public repo*: ponytail cuts **60-94%** on
> features with an over-build trap (custom component vs native input), is a wash on already-minimal
> code, never writes more, and stays **100% safe** while the bare "one-liner" prompt drops a guard.
> That is the honest, defensible number.

**Size / effort figures recorded** (from the tree listing, so these are solid):

- `benchmarks/agentic/` — **5 files, 105 418 bytes**: `tasks.py` 50 646, `run.py` 26 677,
  `README.md` 10 164, `judge.py` 9 987, `complete.py` 7 944.
- `benchmarks/` single-shot side — `README.md` 6202, `correctness.js` 10 228, `robustness-audit.js`
  14 150, `behavior.js` 2785, `benchmark-local.py` 6173, 4 promptfoo configs (1815/1400/1399/1390),
  3 arm files (`baseline.js` 113, `caveman.js` 315, `ponytail.js` 373) plus `caveman-SKILL.md` 3654.
- `benchmarks/results/` — **9 dated result files, 56 126 bytes**, spanning 2026-06-12 → 2026-06-22.

**The finding — what the local evidence does NOT support.** The issue text sizes this row as a
*"three-arm real-session benchmark with LLM judge"*, a single composite. Locally:

- **"three arms"** is documented for the **single-shot promptfoo** benchmark only (no skill / caveman
  / ponytail). No captured text states the arm count of the **agentic** benchmark.
- **"real session"** is documented for the **agentic** benchmark ("a real Claude Code session on a
  real public repo").
- **"LLM judge"** is supported by **a filename and nothing else** — `benchmarks/agentic/judge.py (9987)`.
  `judge.py` was never fetched; `benchmarks/agentic/README.md` was never fetched. What the judge
  judges, how it is prompted, and whether it is used in the arm comparison are **not in local evidence**.

The composite phrase originates in the review session's own draft, not in a quoted source: scratchpad
`issue-a4-watchlist.md` line 10 reads *"ponytail `benchmarks/agentic/` — three-arm comparison (no rule
/ control rule / this rule) in real sessions with an LLM judge"*. That sentence merges the single-shot
arm structure with the agentic re-run. **Writing it into the ADR verbatim would state as measured
something the local record does not carry.** Two honest options, both fully local: size the row on
the single-shot method (three arms, 3 models, 5 tasks, 10 runs/cell, median) *and* on the agentic
re-run as a **named directory with byte sizes**, without asserting its internal arm count; or drop
"three-arm" from the agentic clause. Fetching `benchmarks/agentic/README.md` would settle it, and
that is a network call I did not make.

---

### 3.3 Row 3 — load-bearing rule phrase silently absent from a non-byte-comparable surface

**Local pointer material: EXISTS, complete — this is the best-sized of the three.** Source:
transcript B, tool result at record 43 (`gh api …/contents/scripts/check-rule-copies.js`), captured
whole (2980 of 2981 bytes; 75 lines).

**What the external implementation actually does.** Two checks in one 75-line script:

1. **Byte comparison where it is possible** — `AGENTS.md` is canonical (minus a trailing
   parenthetical stripped by `.replace(/\n\n\(Yes, this file also applies[\s\S]*?\)$/, '')`), and
   **7 host copies** are compared against it after a per-copy normalizer:

   ```
   const copies = [
     ['.cursor/rules/ponytail.mdc', stripFrontmatter],
     ['.windsurf/rules/ponytail.md', text => text.trim()],
     ['.clinerules/ponytail.md', text => text.trim()],
     ['.agents/rules/ponytail.md', text => text.trim()],
     ['.qoder/rules/ponytail.md', text => text.trim()],
     ['.github/copilot-instructions.md', text => text.trim()],
     ['.kiro/steering/ponytail.md', stripFrontmatter],
   ];
   ```
   Failure message: `` `${relPath} drifted from AGENTS.md` ``. (The tree listing corroborates the
   byte-comparability: five of those copies are **2495 bytes each**, exactly.)

2. **The canary, where byte comparison is structurally impossible** — and the ceiling is declared in
   place, in the comment immediately above the array, verbatim:

   > ```
   > // SKILL.md is the runtime source of truth and is longer than the compact body,
   > // so it cannot be byte-compared. ponytail: canary, not full equality. Assert the
   > // load-bearing rules survive verbatim in both the source and AGENTS.md. Changing
   > // a rule's wording trips this, which is the reminder to propagate it everywhere.
   > // Upgrade path: generate the copies from SKILL.md if this ever misses a real drift.
   > ```

   Note the ceiling comment is itself written in ponytail's own `ponytail: <ceiling>, <upgrade path>`
   marker convention — the mechanism declares its own limitation using the repo-wide convention for
   deliberate corner-cuts.

   The pinned set, verbatim including its provenance comments:

   > ```
   > const INVARIANTS = [
   >   'in this codebase',                      // ladder rung: reuse what already exists (#217)
   >   'naive heuristic',                       // ceiling-comment rule
   >   'ONE runnable check',                    // test reflex
   >   'flimsier algorithm',                    // robust-variant rule
   >   // the four "not lazy about" safety carve-outs: pin each so a reword in either
   >   // file can't silently drop one. Only validation was pinned before. These are the
   >   // continuous substrings present in both files ("prevents data loss" because the
   >   // full "error handling that prevents data loss" wraps a line in SKILL.md).
   >   'input validation at trust boundaries',
   >   'prevents data loss',
   >   'security',
   >   'accessibility',
   >   'Lazy code without its check is unfinished', // one-check promoted to headline
   > ];
   > ```

   Each phrase is asserted as a **continuous substring** (`text.includes(phrase)`) over **2 sources**
   — `skills/ponytail/SKILL.md` and `AGENTS.md`. Failure message:
   `` `${label} is missing rule invariant: "${phrase}"` ``; joint remediation line: *"Update the copied
   rule text, AGENTS.md, or SKILL.md so the shared rules match."*; success line:
   `` `Rule copies match AGENTS.md; ${INVARIANTS.length} rule invariants present in SKILL.md and AGENTS.md.` ``

**Size / effort figures recorded:**

- **75 lines / 2981 bytes** total, covering both checks.
- **7** byte-compared copies; **2** normalizer functions (`stripFrontmatter`, `trim`) for **20+**
  supported hosts.
- **9** invariant phrases × **2** sources = **18** substring assertions. That is the whole canary.
- **Growth delta, stated in the source**: *"Only validation was pinned before"* — the four safety
  carve-outs went from **1 phrase to 4**, i.e. **+3**, and the surrounding set is 5 more (4 rule
  phrases + 1 headline). So the mechanism grew incrementally, one observed reword at a time.
- **Phrase-selection rule, stated in the source**: pin the *continuous substring present in both
  files* — `'prevents data loss'` rather than the full `'error handling that prevents data loss'`,
  because the full phrase **wraps a line in SKILL.md**. This is the non-obvious engineering fact of
  the mechanism and is exactly the kind of detail the ADR's *"recovery information inline"* obligation
  wants: a future implementer who does not know it will pin phrases that fail for formatting reasons.
- **The ceiling and the upgrade path are named in place** — "canary, not full equality" / "generate
  the copies from SKILL.md if this ever misses a real drift".

**One correction to carry forward.** The issue and the draft both write the script's name as
`check-rules-copies.js` in one place (draft §B table, transcript record 132). The shipped filename is
**`scripts/check-rule-copies.js`** — singular `rule`. Anything written into the ADR must use the
shipped spelling.

---

### 3.4 Section 3 verdict, per row

| row | local pointer material | quality |
|---|---|---|
| 1 — subagent rule-carrier gap | **EXISTS, complete** — `hooks/ponytail-subagent.js` verbatim (2683 B / 76 lines), 5 fail-open paths enumerable from the source, dependency and registration files sized, plus a second carrier shape (`PreToolUse` `task\|Task`) and a runtime where the mechanism is impossible | strong; test-assertion counts are **not** available |
| 2 — in-context rule not followed | **PARTIAL** — method and honest-downgrade prose captured for the **single-shot** benchmark; the **agentic** benchmark is sized only as 5 files / 105 418 bytes. "LLM judge" rests on the filename `judge.py` alone; the agentic arm count is **not in local evidence** | weakest; the issue's composite phrase overstates what is locally supported |
| 3 — phrase absent from a non-byte-comparable surface | **EXISTS, complete** — `scripts/check-rule-copies.js` verbatim (2981 B / 75 lines): 7 byte-compared copies, 9 phrases × 2 sources = 18 assertions, the +3 growth delta, the substring-selection rule, and the ceiling + upgrade path declared in place | strongest of the three |

No figure above was inferred from what the external repo "probably" does, and no network call was
made. Every quoted string is reproducible from the two extraction commands recorded in §3.0.

## 2. The arming observations — is each proposed row actually a watch-list row?

Measured in the worktree `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-952-953-954-955`,
HEAD `483a5e5e`.

### 2.0 A live-tree change observed mid-pass — rows 1 and 2 have already landed

**Observation.** When section 1 was written the worktree was clean. It is not now. At the time of
this measurement `git status --short` reports 15 modified files, including
`docs/decisions/0017-the-mission-list.md` (+2 lines) and `CHANGELOG.md`. The two added lines are
**watch-list rows 13 and 14**, at lines 148 and 149 — so the table is now fourteen rows, not twelve,
and the row-numbering in section 1 (rows 1–12 at lines 136–147) still holds for the pre-existing
rows only.

- **new row 13** (line 148, 1150 chars): *"a subagent that never receives a project rule its work depends on"*
- **new row 14** (line 149, 1153 chars): *"a rule an agent demonstrably held in context and measurably did not follow"*

`CHANGELOG.md` now carries an `[Unreleased] / ### Changed` entry titled *"The ADR 0017 watch list
gains two rows, and refuses a third — #954."*

**Two consequences worth naming, since they change what this section can be for.**

1. **The sizing changed away from what #954 specified.** The issue says the sizing is *"carried
   inline as pointers to the reviewed external implementation (DietrichGebert/ponytail)"*. Neither
   landed row mentions ponytail; both are sized against evidence in this repo, and the CHANGELOG
   states that as the deliberate choice (*"Both are sized inline against evidence in this repo, as
   every existing row is"*). That is consistent with the ADR's *"every row carries its own recovery
   information inline"* obligation quoted in §1.5, and inconsistent with the issue text. It is a
   value call, not a fact — flagging it, not ruling on it. Section 3 stands either way: it is the
   record of what pointer material a ponytail-sized row *could* have used.
2. **This section is therefore verification, not authorship, for rows 1 and 2.** Every citation in
   the two landed rows was re-measured below, independently of them.

---

### 2.1 Row 1 — subagent rule-carrier gap

#### Does this repo inject rules at subagent start?

**Observation — the complete hook inventory.** `hooks/` contains exactly two files:

```
hooks/hooks.json
hooks/kaola-workflow-subagent-dispatch-log.sh
```

`hooks/hooks.json` registers exactly **two** hook entries, and no others:

| event | matcher | command | id |
|---|---|---|---|
| `SessionStart` (line 6) | `"compact"` | `node "$CLAUDE_PLUGIN_ROOT/scripts/kaola-workflow-compact-context.js"` | `kaola-workflow:compact-context` |
| `SubagentStart` (line 18) | `"*"` (line 20) | `bash "${CLAUDE_PLUGIN_ROOT}/hooks/kaola-workflow-subagent-dispatch-log.sh"` | `kaola-workflow:subagent-dispatch-log` (line 29) |

Event-name sweep over the tracked tree (`git grep -P`): `UserPromptSubmit` **0 files**,
`SubagentStop` **0 files**, `PreCompact` **0 files**. `PreToolUse`/`PostToolUse` appear only in prose
and in retirement records — `docs/decisions/0011-oracle-test-and-kernel-extraction.md:27-29` states
it outright: *"there are no `PreToolUse` / `PostToolUse` hooks in any edition. All six `hooks.json`
carry only `SessionStart` + `SubagentStart`; the interception hooks were retired in #372 and #725."*

**So: yes, a SubagentStart hook exists and fires on every dispatch — and it injects nothing.** It
reads the payload from stdin and appends one JSONL line per active project to
`.cache/dispatch-log.jsonl`. It writes nothing to stdout. This is the exact shape of ponytail's
`hooks/ponytail-subagent.js` **minus the payload**: same event, same `*` scope, same fail-open
posture, opposite direction of data flow.

**The fail-open exits, re-counted from the source** (118 lines total) — the landed row cites `:6`,
`:11`, `:51`, `:118`; all four verified:

| line | construct |
|---|---|
| 6 | `[ -z "$HOOK_INPUT" ] && exit 0` |
| 11 | `[ -z "$AGENT_TYPE" ] && exit 0` |
| 51 | `[ -z "$HOOK_ROOT" ] && [ -z "$AGENT_ROOT" ] && exit 0` |
| 118 | `exit 0` (unconditional final) |

`|| true` on all **four** JSON extractions (`:10`, `:14`, `:17`, `:22`), `|| continue` at `:78`, and
the resolver lookup at `:35-42` is commented *"a missing or unresolvable resolver never breaks
dispatch logging (empty on failure)"*. The header states the posture: *"SubagentStart delivers a JSON
payload on STDIN; exit 0 always (fail-open)."* **Verified as cited.**

**The only injector is the other hook.** `kaola-workflow-compact-context.js` runs on
`SessionStart`/`compact` and emits **plain text** on stdout — and the walkthrough pins that shape:
`plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:528` asserts
`!r.stdout.includes('"hookSpecificOutput"')`, with `:526` asserting the output is not a JSON object
at all, and `:534` asserting it is non-empty. **Verified as cited.** That injection reaches the main
session, never a subagent.

#### Has the failure class been observed here?

Searching `CHANGELOG.md` and `docs/` for a dispatched subagent that failed to carry a project rule
returns nothing. The nearest recorded relatives are both a different class:

- **#944 / the tier-carrier gap** — a *model tier* not reaching a runtime's dispatch, not a *rule*;
  and it is closed.
- **#524** (see §2.2) — a role whose profile lacked the rule in the first place.

**VERDICT — row 1: correctly a watch-list row.** The failure class is coherent (a real event, a real
hook, a real absence), currently unobserved, and column 3 is genuinely sized. One qualification for
the record: the carrier is not merely "already sized", it is **already running**, which makes this
the cheapest row in the table — the landed wording says so (*"one behaviour short, not a build"*),
and that is accurate.

**Local ponytail pointer material for this row: EXISTS and is complete** (§3.1) — but the landed row
does not use it.

---

### 2.2 Row 2 — an in-context prose rule measurably not followed

#### Has it ever been observed and recorded here?

**The one candidate, verified.** `CHANGELOG.md:2710` (#524), verbatim in the material part:

> Before this fix, the `issue-scout` agent profile scored candidates on cohesion + actionability
> alone, with no roadmap-priority axis. This caused live mis-rankings (**observed on `vrpai-cli`**):
> the scout picked adjacent environment/SDK issues (vrpai-cli 82, then 652) over the vrpai-cli
> `488/502/561` epic frontier that the roadmap drives, rationalizing them as "the closest actionable
> proxy" — a silent substitution that violated the drive-order the `### Project rules` guardrails and
> master-epic `Next Step` ordering encode.

`issue-scout` is **not** among the 14 profiles in `agents/` (measured: `adversarial-verifier`,
`build-error-resolver`, `code-architect`, `code-explorer`, `code-reviewer`, `doc-updater`,
`implementer`, `investigator`, `knowledge-lookup`, `metric-optimizer`, `planner`, `security-reviewer`,
`synthesizer`, `tdd-guide`). **Verified as cited.**

**Inference — and it cuts against calling this an instance of the class** — confidence: high;
refuted by: any record showing the priority rule was present in the scout's profile at the time.
The CHANGELOG's own root cause is *"the profile scored candidates on cohesion + actionability alone,
**with no roadmap-priority axis**"* — the scoring rule was **absent from the agent's instructions**.
The roadmap content (`### Project rules` guardrails, `next_step:` ordering) was in context; the rule
telling the scout to rank by it was not. That makes #524 an incomplete-brief failure, which is the
class `docs/conventions.md:846-856` already measured — verified verbatim: *"Statements about
mechanism failed **four times out of four** … Every one was corrected by the agent that received it,
and could only be corrected because nothing obliged it to comply."*

The landed row already concedes both halves (predates the design, retired role, and the conventions
citation), so it does not overclaim. The concession is what keeps it a watch-list row rather than a
bug report.

#### Does a mechanism already exist that makes it moot?

No. Measured: `git grep -iP 'LLM.?judge|three.?arm'` over the tracked tree returns only unrelated
refusal-taxonomy text and the word "arms" in code. There is no benchmark harness of any kind here —
no promptfoo config, no `benchmarks/` directory, no judge.

**VERDICT — row 2: correctly a watch-list row, and it is the row whose arming bar is hardest to
meet.** The failure class is coherent and unobserved *under the current design*; the one recorded
near-instance is on a retired role and is better read as a wrong instruction than as disobedience.
The mechanism is unbuilt and, per conventions.md, an arm that cannot separate *disobedience* from
*a wrong instruction* would re-measure a question already answered — which is a real design
constraint on the mechanism, correctly recorded in the landed row rather than discovered later.

**Local ponytail pointer material for this row: PARTIAL, and the issue's own phrase overstates it**
(§3.2). This is the row where the missing pointer material would have mattered most, and it is the
row where local evidence is thinnest.

---

### 2.3 Row 3 — a load-bearing rule phrase silently absent from a non-byte-comparable rendered surface

This is the row the brief flagged as critical, and it resolves decisively — but not on the axis
either the issue or the pre-existing row 7 anticipated.

#### (a) Which rendered surfaces are byte-comparable to canonical, and which are not?

Measured, by rendering family:

| family | check | byte-comparable to canonical? |
|---|---|---|
| the 18 routing surfaces (`commands/`, skills) rendered from `templates/routing/` skeletons | `node scripts/generate-routing-surfaces.js --check` → **`all 18 surfaces byte-match the skeleton`, exit 0** (run just now); the header at `:44` says *"render in-memory, byte-compare against the committed surface"* | **YES** — re-render and compare, unconditionally |
| `scripts/kaola-workflow-adaptive-schema.js` across the four editions | byte-identity anchor | **YES** |
| the opencode / kimi generated trees (`.opencode*/`, `.kimi*/`) | `sync-*-edition.js --check` compares the on-disk file to a fresh render: `sync-opencode-edition.js:875` `if (read(rel) !== expected) mismatches.push({ … 'stale — regenerate' … })` | **NO — and the suites say so in their own words** (below) |

**The decisive fact about the third family, quoted from the suite that owns it**
(`scripts/test-kimi-edition.js:1108-1112`, the K11 header):

> // This is TEMPLATE-CONTENT parity against the canonical source, which K3 structurally
> // cannot prove: this suite self-provisions .kimi/ via `sync --write`, so K3's
> // `sync --check` compares the generated tree against the tree it just wrote — that is
> // sync **IDEMPOTENCY, never content parity**. A template-mangling transform added to
> // sync-kimi-edition.js keeps K3 green (both sides mangled) and is caught only here.

So the `--check` drift gate is **not** a canonical-parity check inside the suite, because the suite
materializes the tree itself first. That is precisely the "non-byte-comparable rendered surface" the
proposed row names — and the repo has already identified it, in the shipped comment, and built
against it.

**What is asserted against canonical, per region:**

| region of the transformed surface | canonical-parity assertion | direction |
|---|---|---|
| the injected `KW-CLAUDE-TEMPLATE` block | `A24` (`test-opencode-edition.js:555`) `ocTpl === canonTpl`; `K11` (`test-kimi-edition.js:1135`) `kimiTpl === canonTpl` | **exact byte identity, survival direction** |
| the `## Agent Model Dispatch` answer | `K2-anchor` (`test-kimi-edition.js:360-392`) and its opencode twin `S2` (`test-opencode-edition.js:824-845`) | **survival direction** — carrier list *derived from canonical*, phrase must be present |
| the stripped sections (`Path Intent`, `Codex hooks note`) | `A22` (`test-opencode-edition.js:949-955`), content-anchored **leak** canaries | **arrival direction** (row 7's direction) |

**Correction to a claim in the drafted issue.** The scratchpad draft (`issue-a4-watchlist.md`, item 3)
states: *"kimi's transformed template carries negative pins only — K11 pins what must not appear,
nothing pins survival."* **That is refuted.** `test-kimi-edition.js:1134-1136` is
`assert(kimiTpl === canonTpl, 'K11 (#812): kimi workflow-init template is BYTE-IDENTICAL to the
canonical GitHub template')` — byte identity is the strongest possible survival pin, and it is the
exact twin of opencode's A24. The stale-memory correction recorded in
`project_2026-08-11_ponytail_review_filed_952-955.md` got this right; the draft issue text did not
carry the correction all the way through.

#### (b) Is there a recorded incident of a load-bearing phrase silently vanishing from a rendered surface?

**Yes. Two independent records, one of them in shipped code.**

**Record 1 — the shipped source comment**, `scripts/sync-opencode-edition.js:415-419`, verbatim:

> ```
> // A heading that READS like that section without being it. The substitution below is a plain `if`,
> // and a canonical rename once moved the heading out from under it: nothing threw, the block was
> // simply never substituted, and the surface shipped without the one paragraph telling an opencode
> // reader how a role is dispatched on a runtime whose task tool takes no model. This regex is the
> // missing `else` — deliberately looser than the anchor, because its whole job is to notice that the
> // anchor no longer matches.
> ```

and its kimi twin, `scripts/sync-kimi-edition.js:400-404`, verbatim:

> ```
> // A heading that READS like that section without being it. The strip below is a plain `if`, and a
> // canonical rename once moved the heading out from under it: nothing threw, the section was simply
> // never stripped, and the surface shipped a Claude-shaped heading over prose about a per-dispatch
> // model this runtime does not have.
> ```

*"a canonical rename **once** moved the heading out from under it … and the surface **shipped**
without the one paragraph"* — that is the proposed failure class, stated as a past event, on a
transformed surface, in the code that now guards it.

**Record 2 — the v9.6.0 CHANGELOG (#949)**, `CHANGELOG.md:69-73`, verbatim:

> The heading was renamed rather than deleted because its **string** is a live anchor: six code sites
> match on it, three of them edition transforms with no fallback. Deleting it reds three of the four
> chains, and — measured — the opencode and kimi transforms do not fail at all; they silently no-op,
> **dropping the sentence that tells those runtimes their task tool has no model parameter.** Those
> transforms are re-anchored and now report a stale anchor instead of missing it in silence.

**A third, adjacent measurement** — `test-kimi-edition.js:342-345`, verbatim: *"Measured: with the
section removed from the skeleton, this suite stayed green at 516 assertions and said nothing, while
the opencode twin went red. The count assertion below is the missing red."* A suite blind to the
same disappearance, measured and then closed.

#### (c) The mechanism is not merely sized — it is built, on both editions, in three layers

1. **Generator-side, fail-loud.** `assertModelDispatchAnchorMatched` exists in **both** sync scripts
   (`sync-opencode-edition.js:427-438`, `sync-kimi-edition.js:412-423`), with
   `MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/` as the deliberately-looser "missing
   `else`". It throws:
   *"model-dispatch anchor missed in <label> — canonical carries a section this transform did not
   substitute at, so the edition would ship without its dispatch instruction. Re-anchor
   MODEL_DISPATCH_HEADING to the heading canonical now uses: …"*
   Called at `sync-opencode-edition.js:507` and `sync-kimi-edition.js:481`, after the transform loop.
   A surface with no such section stays silent by design (`if (!nearMiss.length) return;`).
2. **Suite-side survival pin.** `K2-anchor` / `S2` derive the carrier set from canonical
   (`canonCommands.filter(canonCarriesSection)`), assert the set is non-empty first (*"with none,
   every per-file check below ranges over an empty expectation and this guard reports green by having
   had nothing to read"*), assert the replacement phrase constant is non-trivial (*"which an empty or
   missing constant would make true of every file"*), and then assert presence per carrier. The
   heading is a **literal** in the test, not the generator's exported constant — stated reason:
   *"sourcing the expectation from the subject's own constant would make this agree with the
   generator by construction."*
3. **Template-region byte identity.** A24 / K11, as above.

Layer 2 is, functionally, a **stronger** version of ponytail's `INVARIANTS` canary: ponytail
hand-maintains a 9-phrase list (§3.3); `K2-anchor`/`S2` derive *which surfaces must carry the phrase*
from canonical, so a new carrier is covered the moment it exists — the suite comment gives the
reason: *"a typed carrier list is a second place for that truth to live, and the copy that stops
being true without saying so."*

#### Verdict on row 3

**ALREADY-OBSERVED-SO-NOT-A-WATCH-ROW.** It fails **both** clauses of the watch list's own
definition — *"derived, never observed, therefore not built"*:

- **not "never observed"** — the failure shipped, and is recorded twice (a shipped-code comment in
  both sync scripts, and `CHANGELOG.md:69-73`);
- **not "not built"** — #949 built the anchor, the near-miss `else` and the throw on both editions,
  and the suites carry survival pins on both.

Writing the row would record a false claim in the register of record, which is a worse outcome than
omitting it. **It is not `SYMMETRY-ONLY`** — that was the risk the issue anticipated, and the
measurement rules it out from the other side: there is a real observation, it is just too strong for
this table. **It is not `DUPLICATE-OF-ROW-7`** either: the brief's framing is right that row 7 is the
*arrival* direction and this is the *departure* direction, and the two are covered by different
mechanisms here (A22-style leak canaries vs K2-anchor/S2 survival pins). Duplication is not the
reason it fails.

*Independently reached, then found to agree with the `[Unreleased]` CHANGELOG entry a parallel agent
had already written (§2.0), which names the same #949 observation. The agreement is a check, not a
source: every citation above was measured from the tree.*

**What remains genuinely uncovered, for the record.** The built guard covers **one** anchor
(`MODEL_DISPATCH_HEADING`). Of the transforms in `transformCommandBody`, only the model-dispatch one
*replaces* canonical content, so only it can *drop* a phrase when the anchor misses; the others
(`Path Intent`, `Codex hooks note:`) *strip*, so an anchor miss makes content **leak in** — row 7's
direction, covered by A22. A future *replacing* transform added without its own anchor assertion
would reopen the gap. That is narrower than the proposed row, has no observation behind it, and is a
candidate for a future row only if it is ever seen — recording it here rather than in the ADR is the
additive-derivation answer.

---

### 2.4 Section 2 verdict, per row

| row | ruling | basis |
|---|---|---|
| 1 — subagent rule-carrier gap | **correctly a watch-list row** (unobserved; carrier exists, payload does not) | `hooks/hooks.json:18-31` + the 118-line logger with 4 fail-open exits; no injecting SubagentStart hook exists on any edition; nothing recorded in `CHANGELOG.md` or `docs/` |
| 2 — in-context rule measurably not followed | **correctly a watch-list row**, with the thinnest arming of the three | `CHANGELOG.md:2710` (#524) is the one near-instance — retired role, and its root cause is a *missing* rule, i.e. the wrong-brief class `docs/conventions.md:846-856` already measured; no benchmark material exists here |
| 3 — phrase silently absent from a non-byte-comparable surface | **ALREADY-OBSERVED-SO-NOT-A-WATCH-ROW** | it shipped: `sync-opencode-edition.js:415-418` and `sync-kimi-edition.js:400-403` record it in code, `CHANGELOG.md:69-73` records the measurement, and #949 **built** the mechanism — anchor + near-miss `else` + throw on both editions, plus `K2-anchor`/`S2` survival pins and `A24`/`K11` byte identity |
