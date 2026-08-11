# Adversarial review — #954 (watch-list rows in ADR 0017)

Reviewer: adversarial-verifier (review-954). Worktree: `.kw/worktrees/bundle-952-953-954-955`.
Claim under refutation: "Two watch-list rows were added and are factually correct and native to the
table's format; a third proposed row was correctly REFUSED because its failure class has already been
observed and a mechanism was built for it in #949."

Status: IN PROGRESS — findings land incrementally.

## Attack 1 — factual citations in the two new rows

### Row 1 (subagent rule-carrier gap), line 148 of the ADR

| citation | verdict | evidence |
|---|---|---|
| `hooks/hooks.json:18-31` registers `kaola-workflow-subagent-dispatch-log.sh` on `*` SubagentStart | VERIFIED | Read hooks/hooks.json — lines 18-31 are exactly that block, matcher `"*"`, command `bash .../hooks/kaola-workflow-subagent-dispatch-log.sh` |
| fail-open exits at `:6`, `:11`, `:51`, `:118` | VERIFIED | Read the script: `:6` `[ -z "$HOOK_INPUT" ] && exit 0`; `:11` `[ -z "$AGENT_TYPE" ] && exit 0`; `:51` `[ -z "$HOOK_ROOT" ] && [ -z "$AGENT_ROOT" ] && exit 0`; `:118` `exit 0`. Exactly four `exit` statements in the file. |
| `\|\| true` on every JSON extraction | VERIFIED | All four `node -e` JSON extractions (lines 10, 14, 17, 22) end `2>/dev/null \|\| true`. (Line 36's resolver uses `\|\| printf ''` — not a JSON extraction; line 78's JSON *construction* is the `\|\| continue` the row cites separately.) |
| `\|\| continue` at `:78` | VERIFIED | Line 78: `" 2>/dev/null) \|\| continue`. |
| only injector is `SessionStart`/`compact` | VERIFIED | hooks.json holds exactly two events: SessionStart(matcher `compact` → compact-context.js) and SubagentStart(dispatch-log, writes JSONL, injects nothing). compact-context.js emits plain stdout (`scripts/kaola-workflow-compact-context.js:105`). |
| "its three codex copies emit the resume packet as plain stdout" | VERIFIED | Three copies exist under prefixed names: `plugins/kaola-workflow/scripts/kaola-workflow-codex-compact-resume.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-codex-compact-resume.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-codex-compact-resume.js` — all three carry the identical `:166-169` plain-stdout comment and `process.stdout.write` at `:170`. (A naive `find -name "kaola-workflow-codex-compact-resume*"` sees only one — the gitlab/gitea names are prefixed; checked all three by content.) |
| `...codex-compact-resume.js:166-169` records the `hookSpecificOutput.additionalContext` envelope as optional and unused | VERIFIED | Lines 166-169 verbatim: "emit the resume packet as PLAIN stdout... the hookSpecificOutput.additionalContext envelope is optional and not needed here." |
| "no injection envelope is in service anywhere to extend" | VERIFIED | `git grep additionalContext\|hookSpecificOutput` (excl. archive/CHANGELOG) → only the three comments above, the row itself, and `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js:528-529` which ASSERTS the envelope is absent from stdout. |
| **"five plugin copies and the opencode adapter"** | **WRONG (count)** | See CONFIRMED-DEFECT D1 below. |
| `CLAUDE.md` classifies the hook as advisory | VERIFIED | CLAUDE.md §Validation Policy: "Background hooks (subagent-dispatch-log) are advisory; do not re-run their checks redundantly." |

#### D1 — CONFIRMED-DEFECT: "five plugin copies" matches no partition of the tree

Command: `find . -name "kaola-workflow-subagent-dispatch-log.sh"` (excl. .git/node_modules) +
`git ls-files | grep subagent-dispatch-log` + `md5` of each copy.

Real counts:
- **4 tracked copies**, pinned byte-identical by `scripts/validate-script-sync.js:181-187`
  (label `subagent-dispatch-log hook copies`): `hooks/`, `plugins/kaola-workflow/hooks/`,
  `plugins/kaola-workflow-gitlab/hooks/`, `plugins/kaola-workflow-gitea/hooks/`.
- **6 untracked rendered copies** (0 tracked files under `.opencode*`/`.kimi*`): 3 opencode
  byte-copies (md5 = canonical) generated via `sync-opencode-edition.js` `HOOK_SCRIPTS`, and
  3 kimi copies (md5 differs — adapted) generated via `sync-kimi-edition.js` `HOOK_SCRIPTS`
  + `HOOK_ADAPTATIONS` (`sync-kimi-edition.js:698-702` rewrites `p.agent_type||''`).
- The opencode adapter is real: `templates/opencode/plugins/kaola-workflow-hooks.js` (tracked
  canonical) → `.opencode/plugins/kaola-workflow-hooks.js`.

No partition yields "five plugin copies": tracked = 4, plugin-tree copies = 3, working-tree total
= 10, sync-rendered = 6. The sizing sentence also **omits the kimi surface entirely** — kimi's
copies are not byte-copies; `HOOK_ADAPTATIONS` is keyed on the exact source string
`"p.agent_type||''"`, so a payload change touching the extraction lines must also update that
transform (the class of silent kimi/opencode transform failure this repo has recorded before).
The row's sizing is therefore wrong in the exact way the dispatch flagged: a confident count
(“five”) that the tree does not support, plus a missing member (kimi) of the propagation set.

### Row 2 (in-context rule not followed), line 149 of the ADR

| citation | verdict | evidence |
|---|---|---|
| `CHANGELOG.md:2710` is the #524 issue-scout entry | **STALE IN THE SHIPPED TREE** | See CONFIRMED-DEFECT D2 below. |
| the #524 account (no roadmap-priority axis; "the closest actionable proxy" substituted for drive-order) | VERIFIED (content) | The entry text matches the row's paraphrase exactly: "scored candidates on cohesion + actionability alone, with no roadmap-priority axis... rationalizing them as 'the closest actionable proxy' — a silent substitution that violated the drive-order". |
| `issue-scout` not among the 14 profiles in `agents/` | VERIFIED | `ls agents/*.md` → exactly 14 files, no issue-scout. |
| "survives only in test fixtures" | VERIFIED in substance | No live profile, no dispatchable registration. Remaining tracked hits outside history docs: test scripts (fixtures), installer/validator *comments* naming the "issue-scout class" (`scripts/validate-kaola-workflow-contracts.js:424`, `plugins/*/scripts/install-codex-agent-profiles.js:875`), and a sample user-config-drift output in `docs/opencode-edition.md:254`. Comments naming a failure class are not the role surviving; minor pedantry, not a defect. |
| `git grep -iP 'LLM.?judge\|three.?arm'` returns only unrelated refusal-taxonomy and code "arms" | VERIFIED in substance | Ran it. Hits: CHANGELOG "three arms" (code), D-419-01/D-594-01 (refusal taxonomy), parallelism-v3 (code), claim.js ×4 + tests (code arms) — plus the row itself and #954's own roadmap text ("three-arm real-session benchmark with LLM judge"), which are self-referential and the roadmap source is removed at closure. No benchmark material exists. |
| `docs/conventions.md:846-856` — failures were the brief being wrong, each corrected by the receiving agent | VERIFIED | Lines 846-855: result statements "held without exception"; mechanism statements "failed four times out of four"; "Every one was corrected by the agent that received it." Range and content match. |

#### D2 — CONFIRMED-DEFECT: the `CHANGELOG.md:2710` line number is invalidated by the same bundle that ships the row

Commands:
- worktree: `grep -n "closest actionable proxy" CHANGELOG.md` → the #524 entry is at **2759**
  (the phrase also appears at 1708/1721 in an unrelated #86x entry).
- HEAD: `git show HEAD:CHANGELOG.md | grep -n ...` → **2710**.
- worktree line 2710 now holds the **#545** entry ("the scout is now the SOLE backlog reader").

The row cites `CHANGELOG.md:2710`, correct at HEAD — but the bundle's own `[Unreleased]` insertion
(+49 lines at the top of CHANGELOG.md, including #954's own entry) shifts the target to 2759 in the
tree the row ships in. The citation self-invalidates at commit time, and lands on a *different
issue-scout entry* (#545), which makes the wrong-line failure mode plausible rather than obvious.
The `(#524)` anchor keeps the target findable, so severity is medium-low — but the claim under test
is "factually correct", and a line citation that is wrong in the shipped tree refutes that as
written. (Same class as D1: a number authored against a tree the change itself mutates.)

## Attacks 2–5 — pending (written incrementally below)

## Attack 2 — is the refusal of row 3 correct? CLAIM-HOLDS

The refusal ground ("the failure has actually been observed; #949 built the mechanism") is verified
against the tree AND against #949's own run records:

- **The four layers exist.** Anchor: the whole-heading-anchored model-dispatch rewrite
  (`sync-opencode-edition.js:298-`, `sync-kimi-edition.js:280-`). Near-miss:
  `MODEL_DISPATCH_HEADING_NEAR_MISS = /^##\s+.*\bModel\b/` (`sync-opencode:422`, `sync-kimi:407`),
  "deliberately looser than the anchor, because its whole job is to notice that the anchor no longer
  matches". Throw: `assertModelDispatchAnchorMatched` (`sync-opencode:427-437` throwing at `:433`,
  call site `:507`; `sync-kimi:412-421` throwing at `:418`, call site `:483`). Suite anchors:
  `test-kimi-edition.js:336-388` (K2-anchor: canonical must still carry `## Agent Model Dispatch`,
  and the generated Skill must carry the inherit guidance) and `test-opencode-edition.js` S2 +
  A22 canaries (`:949-955`). Both regexes were born in `340351c5` (#949's impl commit; confirmed
  via `git log -S`).
- **The arming observation is real, and it was NOT a mirror probe.** The distinction matters
  because rows 146/147 record probe/mutation results as explicitly still-unobserved.
  `kaola-workflow/archive/issue-949/.cache/impl-sync.md:32-42`: "The skeleton rename to
  `## Agent Model Dispatch` had already landed in the working tree" — all six sync legs exited 0
  silently, and `grep -c '^## Model and effort are inherited$'` on the rendered surface returned
  **0** ("the edition block was NOT shipped"). Real canonical input (the run's actual rename),
  real generators, real broken render, silence. The class fired on the tree, in-run. mission-list
  item C corroborates: "REPRODUCED the briefed hazard first (6 × exit 0, no throw), then
  re-anchored". So the watch-list bar ("never been observed in this methodology") excludes the
  class, and recording it as never-observed would indeed be false. The refusal is correct on its
  stated ground.
- **Wording nuance, not a defect:** "the surface shipped without the paragraph" (CHANGELOG entry
  and `sync-opencode:417`) reads as release-shipped; the event was generated-in-working-tree,
  never committed (rename and re-anchor landed in one commit). But #949's own record uses
  "shipped" for "emitted into the render" (impl-sync.md:42 "NOT shipped" = not emitted), so the
  #954 text quotes the tree's own established usage.

**The other side — residual uncovered variants I looked for:**

- The near-miss regex only notices renames that keep "Model" in a `##` heading — but a rename that
  drops the word reds the suite layer anyway (K2-anchor pins the canonical heading string;
  opencode S2 pins the rendered block; the four contract validators pin `## Agent Model Dispatch`
  by name). Covered.
- The kimi `HOOK_ADAPTATIONS` transform hard-errors on a missing or ambiguous anchor
  (`sync-kimi-edition.js:710-716`). Covered.
- **Genuinely uncovered (non-blocking observation):** the *deletion* transforms have no over-match
  observer. `sync-opencode-edition.js:478` strips any canonical `##` heading matching
  `\bPath Intent\b` plus its body; `:496` strips any `**Codex hooks note:**` blockquote. A future
  canonical section that happens to match either pattern while carrying opencode-relevant rules
  would be silently stripped, and the A22 canaries observe only the two known leak literals — the
  absence direction of an over-strip is observed by nothing. This is the same failure *class* as
  the refused row, at a different transform site, and it is unobserved to date. It does NOT make
  the refusal wrong: a row for it would claim "never observed" about a class whose sibling site
  HAS been observed — precisely the falsehood the refusal avoided — and deriving a row from "the
  strip might over-match someday" is the symmetry derivation the list exists to refuse. If the
  orchestrator wants it recorded anywhere, it is a candidate for a differently-worded, genuinely
  unobserved narrow class ("an anchored deletion that over-matches future canonical content"),
  which is a user/orchestrator call, not a defect in #954.

finding: id=R3 scope=out_of_scope action=user_decision status=open severity=low fix_role=none rationale=over-strip direction of the opencode deletion transforms (Path Intent, Codex-note) has no absence observer; same class as refused row 3 at an unobserved site; recording it would need a narrower unobserved wording — orchestrator's call

## Attack 3 — format nativeness: CLAIM-HOLDS

- `awk` unescaped-pipe count (literal `\|` removed first): **every** row 134-149 has exactly 4
  unescaped pipes → 3 columns, none orphaned. Literal pipes in row 148 (`\|\| true`,
  `\|\| continue`) and row 149 (grep pattern `LLM.?judge\|three.?arm`) are correctly escaped.
- One physical line per row (awk is line-based; the diff adds exactly 2 lines).
- Table contiguous 134-149, header at 134, separator `|---|---|---|` at 135, blank line 150 ends
  it; the closing paragraphs ("The additive-edition row...", :151) are outside the table. Parses
  as one table.
- No alignment padding, matching all 12 existing rows.
- Register: both rows carry lowercase failure-class phrases, backticked file:line pointers in the
  observation cell, and inline sizing in the mechanism cell — the same recovery-information-inline
  shape as rows 141-147 (the densest existing rows). Native.

## Attack 4 — does each row survive the table's own bar? CLAIM-HOLDS (both rows)

- **Row 1 unobserved claim.** Independent counter-example sweep over `CHANGELOG.md`, `docs/`,
  `docs/decisions/` (patterns: "never received/passed/told", "not in its brief", "brief omitted",
  "without the rule") plus known near-candidates from run history:
  - `CHANGELOG.md:1966` (role refuses readable files): the brief was *silent* on a permission and
    the role held a capability_gap instruction — no orchestrator-held rule was withheld. Not the class.
  - #935's tier-carrier gap (authored tier reached 1 of 3 runtimes' dispatch): dispatch
    *configuration* failing to propagate, not a project rule the work product then violated.
    Adjacent, distinct.
  - `CHANGELOG.md:1015`, `:3190`, `D-804-01:31` ("never received"): code ports, not subagents.
  No recorded instance found. The row's claim survives.
- **Row 2 self-refutation question.** The row names #524 while claiming the class open. Ruling:
  **coherent, not self-refuting.** The table's definition is scoped — "failure classes that
  **have never been observed in this methodology**" (ADR :123-124) — and the row scopes its
  instance out on both axes: #524 predates ADR 0017 (CHANGELOG position ~2710 of ~2800, the 6.6.x
  era) and sits on `issue-scout`, retired (absent from the 14 live profiles). The table already
  has precedent for naming near-evidence while holding the class unobserved: row 147 records "the
  sharpest fact that would arm this row, and still not an observed failure." Omitting #524 would
  have made the row MORE refutable, not less. Counter-check for a current-design instance
  (#930/#931 implementers' wrong mutation proofs; #888-#895 fixture rewrite): each is a wrong
  verification or a wrong brief, not a rule provably in context and measurably disobeyed. Survives.

## Attack 5 — the CHANGELOG [Unreleased] #954 entry: CLAIM-HOLDS (one inherited caveat)

Checked every mechanism claim in `CHANGELOG.md:35-50` (worktree):
- "carries [the two rows]" — true (ADR :148-149).
- "the first names the SubagentStart carrier that already runs on every dispatch and its four
  fail-open exits" — true; and "every dispatch" holds cross-runtime: SubagentStart is registered
  in `hooks/hooks.json:18` (Claude), all three codex `plugins/*/config/hooks.json:17`, both forge
  `plugins/*/hooks/hooks.json:18`, the kimi `[[hooks]] event = "SubagentStart"`
  (`sync-kimi-edition.js:568`), and the opencode adapter
  (`templates/opencode/plugins/kaola-workflow-hooks.js`).
- "the second names `CHANGELOG.md:2710` (#524)" — an accurate *description of the row*; the
  staleness of that citation is D2 (the row's defect, faithfully described).
- The refusal paragraph — verified in Attack 2, including the four named layers and "on both
  editions". "The surface shipped without the paragraph" carries the render-jargon reading noted
  above.
- No claim in the entry describes behavior the tree does not have.

## Receipt

Analytical result: **REFUTED** — the completion claim as worded ("factually correct") is disproved
by two concrete citation defects (D1, D2) in exactly the category the dispatch prioritized. The
other three limbs of the claim — the refusal of row 3, format nativeness, and bar-compliance —
survived strong falsification attempts and are individually NOT REFUTED. Execution: complete; all
planned attacks ran; no capability gaps.

finding: id=R1 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=row 1 sizing "five plugin copies and the opencode adapter" matches no partition of the tree (4 tracked copies pinned by validate-script-sync.js:181-187, 6 sync-rendered, 10 total) and omits the kimi HOOK_ADAPTATIONS surface
finding: id=R2 scope=in_scope action=fix status=open severity=medium fix_role=doc-updater rationale=row 2 citation CHANGELOG.md:2710 is invalidated by the same bundle's own +49-line [Unreleased] insertion — in the shipped tree :2710 is the #545 entry and #524 sits at :2759
finding: id=R3 scope=out_of_scope action=user_decision status=open severity=low fix_role=none rationale=unobserved over-strip variant of the refused class (see Attack 2) — non-blocking, orchestrator's call

verdict: fail
findings_blocking: 2

Confidence: high on D1/D2 (both mechanically measured); high on the refusal ruling (grounded in
issue-949's own archived run records, not inference); moderate-high on the two judgement calls in
Attack 4 (argued above, both sides shown).
