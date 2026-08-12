# pins-968 — what REDs or silently fails to propagate when next.skeleton.md:58-60 and :268 change

## Setup

- Commit: `1d892a567e5da8fe501bc9b92d1619ab682a6b78` (main, clean except untracked `kaola-workflow/issue-968/`)
- Target region A: `templates/routing/next.skeleton.md:58-60` — "A run normally carries one issue. … Say which issues you bundled and why."
- Target region B: `templates/routing/next.skeleton.md:268` — "Each run implements exactly one issue, or one explicitly selected same-scope set."
- All measurements are read-only. Nothing tracked was modified; the render mutations below were done
  in memory against the exported render functions (`generate-routing-surfaces.renderSkeleton`,
  `sync-{opencode,kimi}-edition.renderCommand`), never on disk.

| # | Measurement | Command | Result | Exit |
|---|---|---|---|---|
| 1 | generator baseline | `node scripts/generate-routing-surfaces.js --check` | `all 18 surfaces byte-match the skeleton.` | 0 |
| 2 | opencode parity (github) | `node scripts/sync-opencode-edition.js --check` | `14 agent(s) + 3 command(s) + 1 plugin(s) in parity` | 0 |
| 3 | kimi parity (github) | `node scripts/sync-kimi-edition.js --check` | `14 role skill(s) + 3 command skill(s) + 2 hook file(s) in parity` | 0 |
| 4 | opencode parity (gitlab) | `node scripts/sync-opencode-edition.js --forge=gitlab --check` | **PARITY FAILED** — `.opencode-gitlab/command/workflow-init.md` stale | **1** |
| 5 | kimi parity (gitlab) | `node scripts/sync-kimi-edition.js --forge=gitlab --check` | **PARITY FAILED** — `.kimi-gitlab/skills/workflow-init/SKILL.md` stale | **1** |
| 6 | opencode parity (gitea) | `node scripts/sync-opencode-edition.js --forge=gitea --check` | **PARITY FAILED** — `.opencode-gitea/command/workflow-init.md` stale | **1** |
| 7 | kimi parity (gitea) | `node scripts/sync-kimi-edition.js --forge=gitea --check` | **PARITY FAILED** — `.kimi-gitea/skills/workflow-init/SKILL.md` stale | **1** |

**#4-#7 are PRE-EXISTING drift, not caused by this issue.** The four stale files lag commit
`e4522be9` ("CLAUDE.md length recommends and notifies"): three lines differ (the "Hard limit: …240
lines" → "Recommendation, not a limit" rewrite). `install-all.sh --forge=github` regenerates the
github trees only, which is why the gitlab/gitea edition trees were left behind. The editor will
either have to regenerate them (picking up an unrelated change) or leave them red — say which.

---

## Q1 — Prose pins in tests

**Nothing pins this wording. Zero hits in any test script.**

`git grep -n -F` over `scripts/`, `plugins/*/scripts/` for `normally carries`, `coherent scope`,
`shape judgement`, `issues you bundled`, `Each run implements`, `Completion contract`, `Say which`,
`all-or-nothing`, `await explicit`, `auto-route`:

| needle | hits in test/validator scripts |
|---|---|
| `normally carries` | none |
| `coherent scope` | none |
| `shape judgement` | none |
| `issues you bundled` | none |
| `Each run implements` | none |
| `Completion contract` / `Completion Contract` | none |
| `Say which` | none |
| `same-scope` | `scripts/test-bundle-claim.js:1233` — **a comment only**, not an assertion |
| `exactly one issue` | `scripts/simulate-workflow-walkthrough.js:628` — asserts `files.length === 1` on roadmap source files; **the string is an assertion *message*, not a pin on prose** |

The six next-surface prose pin sets that DO exist (`scripts/validate-workflow-contracts.js:232-279`,
substring `assertIncludes` over all six surfaces) pin these and none of ours:
`The user named an issue`, `Never substitute another, and never adopt an active folder`,
`The user described a task but named no issue`, `roadmap priority`,
`State the selection aloud before you claim it`, `Everything before the claim is free`,
`The claim is bookkeeping`, `reports a fact about the target rather than a verdict`,
`--target-issue`, `--target-issues`, `kaola-workflow/{project}/mission-list.md`,
`nothing depends on a stable ID`, `absent fields are simply absent`, `status: todo`,
`dispatched: self`, `before the work goes`, `mission, not a specification`,
`no disjointness proof`, `no evidence line, no cap, no approval`,
`Subagents and worktrees are tools, offered and declinable`,
`Look for the work, not for the worker`, `if the output the dispatch promised has landed`,
`Irreversible and value-laden calls belong to the user`.
Plus an ORDER pin: `assertBefore(file, 'Write the mission list', 'Run it')`.

Two skeleton-level absence pins (`validate-workflow-contracts.js:282-283`):
`assertNotIncludes('templates/routing/next.skeleton.md', 'Backlog Inventory')` and
`… 'What You May Read'`.

**ACTIONABLE:** the two sentences are free text — reword them however the design requires. Do not
touch any of the 23 pinned strings above, and keep the literal heading text `Write the mission
list` before `Run it`.

---

## Q2 — Required-blocks / slots / rename-table

Measured by intersecting every `next`-topic `content_tokens` entry against skeleton lines 54-65 and
260-274: **zero tokens fall inside either region.**

- `templates/routing/required-blocks.js` — four `next` blocks (`nx-consent-in-conversation`,
  `nx-mission-list`, `nx-resume-rule`, `nx-concurrency-is-judgment`, `nx-claim-is-bookkeeping`).
  None of their tokens live at :58-60 or :268. Tokens are matched **whitespace-normalized**
  (`norm() = replace(/\s+/g,' ')`), so re-wrapping elsewhere is safe.
- `templates/routing/slots.js` — no SLOT or SPLICE directive occurs at :58-60 or :268. Nearest
  directives are `<!-- SPLICE:nx-issue-fetch -->` at :81 and
  `<!-- SPLICE:nx-required-next -->` at :258 / `<!-- REGION:command … -->` at :261-265. Region B's
  edit target (:268) sits **after** the `<!-- /REGION -->` close at :265, i.e. in unconditional
  shared text.
- `templates/routing/rename-table.js` — `RENAMES` is `{}` and `applyRenames` is identity for github
  and a no-op for gitlab/gitea against an empty table. Irrelevant to this edit.

**Structural freedom:** the renderer (`renderLines`, generate-routing-surfaces.js:214-245) emits any
line that is not a SLOT/SPLICE/REGION directive **verbatim**. Adding a paragraph, a bulleted list,
or a numbered list at :58-60 or :268 violates nothing — as long as no added line is itself a
`<!-- SLOT:… -->` / `<!-- SPLICE:… -->` / `<!-- REGION:… -->` / `<!-- /REGION -->` comment.

Two structural traps if you add markup:
- A line matching `<!-- /REGION -->` outside an open region **throws** `unmatched /REGION`.
- A `<!-- REGION:… -->` open whose condition has a typo fails `RE_REGION_OPEN`, is emitted as
  literal prose, and its close then throws.

**ACTIONABLE:** free to add paragraphs or lists. Do not introduce any HTML-comment directive line.
Do not add a `<!-- PIN: … -->` marker — the reverse orphan-sentinel in
`scripts/test-route-reachability.js:913-940` REDs on any `PIN:` marker that has no manifest block in
`required-blocks.js` (`orphan-surface: marker … has no manifest block`).

---

## Q3 — Retired-vocabulary bans

Three separate ban lists reach these surfaces. New prose must avoid all of them.

**(a) `RETIRED_VOCABULARY_BAN`** — `scripts/generate-reviewer-profiles.js:221`, applied to the 18
routing surfaces (both the RENDER and the COMMITTED bytes) by
`scripts/test-generate-routing-surfaces.js:415-425`:

```
\bnode-id\b | \bgate_effect\b | \bgate_mode\b | \bgate_aggregation\b | \bchange_gate\b |
\breplicated_majority\b | \bpartitioned_all\b | \bexecution_status\b | \bclaim_outcome\b |
\breview_scope_expanded\b | \bdomain_outcome:
```

**(b) `retiredExecutor`** — `scripts/validate-workflow-contracts.js:173`, applied to all six next
surfaces (`assertNotIncludes`) and to the init KW-CLAUDE-TEMPLATE region:

```
workflow-plan.md · Node Ledger · plan_hash · workflow-planner · post-dominat ·
parallel_safe · running-set · fan-out cap
```

`fan-out cap` is the live hazard here: any new bundle-width prose that says "no fan-out cap" REDs.
Use "nothing caps it" / "no cap" (already used by `nx-concurrency-is-judgment`) instead.

**(c) `retired` + `retiredPathSelector`** — `validate-workflow-contracts.js:133-166`, applied to
`commands/workflow-next.md`:

```
.locks · .sessions · .tickers · heartbeat · ticker · derive-session · verify-startup ·
can-handoff · "startup receipt" · session_id · last_heartbeat · "## Lease" · KAOLA_SESSION_ID ·
target_mismatch · "Advisor Gate" · "advisor ideation gate" · "advisor plan gate" ·
"advisor critical gate" · "closure advisor gate"
KAOLA_PATH · --workflow-path · path_not_installed · workflow_path_refused · bundle_requires_adaptive
```

Note `bundle_requires_adaptive` — a retired bundle refusal code. Do not resurrect it as an example.

Scan (b) runs only over `commands/workflow-next.md` for the `retired`/`retiredPathSelector` lists
and over all six for `retiredExecutor`. Scan (a) is the only one that reads the RENDER as well.
There is no scan of the retired lists over the `.opencode*`/`.kimi*` trees — those trees are
gitignored and the four contract validators are explicitly forbidden from reading them
(`test-opencode-edition.js:533-536`, `test-kimi-edition.js:1183-1185`).

**ACTIONABLE:** avoid the 40-odd tokens above. In practice for bundle-width prose the only realistic
collisions are `fan-out cap`, `parallel_safe`, and `bundle_requires_adaptive`.

---

## Q4 — Sync transforms keyed on source text

**No transform in either sync script matches text in the region. Measured, not inferred.**

`HOOK_ADAPTATIONS` (`scripts/sync-kimi-edition.js:664-668`) is keyed to `hooks/*.sh` **shell**
scripts only (`p.agent_type||''` inside `kaola-workflow-subagent-dispatch-log.sh`). It never sees a
command body, and it already fails loud (`anchor not found` / `anchor is not unique`) rather than
silently. It is not a hazard for this edit.

The complete rule set that DOES see the next command body — `transformCommandBody`
(sync-opencode-edition.js:437-493 / sync-kimi-edition.js:422-502), applied in this order:

| # | Rule | Match | Applies to region? |
|---|---|---|---|
| 1 | `rewriteModelDispatchInstructions` | any PROSE paragraph containing `model=` → replaced from that sentence's start to end of paragraph | **no** (no `model=` in region) |
| 2 | `MODEL_DISPATCH_HEADING` | `/^##\s+Agent Model Dispatch\s*$/` → whole section replaced/stripped | **no** (next skeleton has no such heading) |
| 2b | `MODEL_DISPATCH_HEADING_NEAR_MISS` | `/^##\s+.*\bModel\b/` → **THROWS** the render | no today; would fire if you add an `## … Model …` H2 |
| 3 | dispatch-card rewrite | `/^Agent\(\n(\s+subagent_type=)/gm` (opencode) / `Agent(\n…subagent_type="<role>",…prompt="` (kimi) | **no** |
| 4 | `stripCardModelPlaceholders` | `/^[ \t]*model="\{[^"\n]*\}",?[ \t]*\r?\n/gm` | **no** |
| 5 | trailing-whitespace strip | `/[ \t]+\n/g → '\n'` | **YES — see hazard below** |
| 6 | runtime flag | `/--runtime claude\b/g` → `--runtime opencode` / `--runtime kimi` | **no** |
| 7 | `rewriteClaudeScriptPaths` | `/^([ \t]*)kaola_script\(\)\{.*\}\s*$/gm` | **no** |
| 8 | `assertNoModelDispatchResidue` | any surviving `model=`, or an empty `` `` `` code span → **THROWS** | no |
| 9 | `renderCommand` frontmatter + `.trim().replace(/\s+$/,'')` | file head/tail only | **no** |

Measured pass-through (in-memory, `probe.js`):

```
opencode render == on-disk: true          kimi render == on-disk: true
opencode carries SENT_A verbatim: true    kimi carries SENT_A verbatim: true
opencode carries SENT_B verbatim: true    kimi carries SENT_B verbatim: true
```

…and with a representative candidate rewrite (default 3-5, independent-closure admission,
blast-radius runs-alone test) spliced in:

```
opencode carries NEW_A verbatim: true     kimi carries NEW_A verbatim: true
opencode carries NEW_B verbatim: true     kimi carries NEW_B verbatim: true
opencode --check would RED: true          kimi --check would RED: true
```

Trip-wire scan over both the current and the candidate text returned `[]` for both.

### The one real hazard: trailing whitespace

Rule 5 is the only rule that fires on ordinary prose. Measured:

```
canonical keeps a 2-space markdown hard break: true
opencode keeps it: false
kimi     keeps it: false
```

A markdown hard line break (two trailing spaces) survives on the six generated surfaces and is
**silently deleted** on all six edition trees. Both sides stay self-consistent, so `--check` stays
green — the divergence is invisible to every guard.

**ACTIONABLE:** do not use trailing whitespace anywhere in the new prose — no markdown hard breaks.
Use a blank line for a paragraph break. Do not introduce `model=`, `--runtime claude`,
`kaola_script(){`, a top-level `Agent(` card, or an `## …Model…` heading into the region.

---

## Q5 — Generator check, and who regenerates what

`node scripts/generate-routing-surfaces.js --check` → exit **0**,
`generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.`
(18 = 3 topics × [3 command editions + 3 skill editions].)

### Regenerated from `next.skeleton.md` by `generate-routing-surfaces.js --write` (6 files)

1. `commands/workflow-next.md` (command/github)
2. `plugins/kaola-workflow-gitlab/commands/workflow-next.md` (command/gitlab)
3. `plugins/kaola-workflow-gitea/commands/workflow-next.md` (command/gitea)
4. `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` (skill/github)
5. `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` (skill/gitlab)
6. `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md` (skill/gitea)

All six are **tracked**. In-memory mutation proof: every one is byte-identical to its render today
and every one differs after a skeleton edit — so `--check` (which runs in **all four chains**) reds
if the edit lands without a `--write`.

### NOT the generator — the two sync scripts (6 more files, all gitignored/untracked)

`sync-opencode-edition.js` / `sync-kimi-edition.js` read the **rendered command surfaces** (via
`forgeLayout.commandSources(forge)` → the routing registry's command rows, i.e. items 1-3 above) and
emit, per forge:

7. `.opencode/command/workflow-next.md` (:47, :248)
8. `.opencode-gitlab/command/workflow-next.md` (:47, :248)
9. `.opencode-gitea/command/workflow-next.md` (:47, :248)
10. `.kimi/skills/workflow-next/SKILL.md` (:48, :249)
11. `.kimi-gitlab/skills/workflow-next/SKILL.md` (:48, :249)
12. `.kimi-gitea/skills/workflow-next/SKILL.md` (:48, :249)

**Twelve surfaces, not eight** — the issue body's `next_step` undercounts by 4 (it names only the
github opencode/kimi trees; gitlab and gitea trees exist too).

**Propagation blind spot.** `generate-routing-surfaces.js --check` is in **all four** `npm test`
chains. The two sync `--check`s are in **none** of them — they live only in
`npm run test:kaola-workflow:editions` (`test-opencode-edition.js && test-kimi-edition.js`), which
is not part of `npm test` or of `test:full`. So a skeleton edit that regenerates the six tracked
surfaces and stops leaves the six edition trees stale with **four green chains**. The installers do
self-heal (`install-opencode.sh:158-159`, `install-kimi.sh:128-129` run `--check || --write`), but
only for the forge passed on the command line.

**ACTIONABLE (order matters):**
1. edit `templates/routing/next.skeleton.md` (and `init.skeleton.md`, see Q6)
2. `node scripts/generate-routing-surfaces.js --write`
3. `node scripts/generate-routing-surfaces.js --check` → expect `all 18 surfaces byte-match`
4. `node scripts/sync-opencode-edition.js --forge={github,gitlab,gitea} --write` (×3)
5. `node scripts/sync-kimi-edition.js --forge={github,gitlab,gitea} --write` (×3)
6. `npm run test:kaola-workflow:editions`
7. four-chain receipt (this is an edition-touching diff)

Step 4/5 for gitlab and gitea will ALSO pick up the pre-existing `workflow-init.md` staleness from
`e4522be9` (three CLAUDE.md-length lines). That is unrelated to #968 but unavoidable if you
regenerate. Untracked files, so it does not enter the commit.

---

## Q6 — The init surfaces: yes, and there is a second sentence nobody named

`plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md:88` renders from
**`templates/routing/init.skeleton.md:153`**, inside the `<!-- KW-CLAUDE-TEMPLATE-START/END -->`
region — the text injected verbatim into a **consumer repo's CLAUDE.md**. It must change for
one-rule-one-wording.

### Sentence 1 — `A run claims one issue — or one explicitly selected same-scope set — …` (9 sites)

| # | file | line |
|---|---|---|
| src | `templates/routing/init.skeleton.md` | 153 |
| 1 | `commands/workflow-init.md` | 133 |
| 2 | `plugins/kaola-workflow-gitlab/commands/workflow-init.md` | 133 |
| 3 | `plugins/kaola-workflow-gitea/commands/workflow-init.md` | 133 |
| 4 | `plugins/kaola-workflow/skills/kaola-workflow-init/SKILL.md` | 88 |
| 5 | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-init/SKILL.md` | 88 |
| 6 | `plugins/kaola-workflow-gitea/skills/kaola-workflow-init/SKILL.md` | 88 |
| 7 | `.opencode/command/workflow-init.md` | 132 |
| 8 | `.opencode-gitlab/command/workflow-init.md` | 132 |
| 9 | `.opencode-gitea/command/workflow-init.md` | 132 |
| 10 | `.kimi/skills/workflow-init/SKILL.md` | 133 |
| 11 | `.kimi-gitlab/skills/workflow-init/SKILL.md` | 133 |
| 12 | `.kimi-gitea/skills/workflow-init/SKILL.md` | 133 |

(12 rendered + 1 skeleton.)

### Sentence 2 — the one that actually contradicts a widened default

`templates/routing/init.skeleton.md:167`, same KW-CLAUDE-TEMPLATE region, same 12 rendered sites
(`commands/workflow-init.md:147`, the two forge commands `:147`, the three SKILLs `:102`,
`.opencode*/command/workflow-init.md:146`, `.kimi*/skills/workflow-init/SKILL.md:147`):

> That objective prompt must not use "next issue in line" or any phrasing that implies automatic
> cross-issue continuation. **Each workflow run targets one issue; finishing it is the terminal
> event. The single-issue completion contract requires explicit re-direction for the next issue.**

This is a flat one-issue assertion with no bundle escape clause. If the default becomes 3-5, this
sentence becomes false and is a second, contradicting wording of the same rule. **It was not in the
brief and it must change with the rest.**

### Adjacent restatements in the same region

- `init.skeleton.md:176` — "workflow runs implement **one selected item** and refresh the mirror."
  (12 rendered sites; softer, but reads single-issue.)

### Guards that constrain the init template region

`validate-workflow-contracts.js:480-511` runs over `commands/workflow-init.md` AND
`templates/routing/init.skeleton.md`:
- region must be non-empty and markers present (anti-vacuity)
- `retiredExecutor` banned inside the region
- positive tokens required inside the region: `mission-list.md`, `` `item` ``, `` `status` ``,
  `` `dispatched` ``, `` `result` ``, `Three write moments`, `the list minus done minus in-flight`

`validate-kaola-workflow-contracts.js:273-300` (and the gitlab/gitea twins):
- the extracted template must be **byte-identical within each forge pair** (command vs SKILL)
- `PHASE_NUMBER_BAN = /Phase\s+\d/` and `PHASE_FILE_BAN = /phase file|phase artifact/i`

`test-opencode-edition.js:537-561` (A24) and `test-kimi-edition.js:1186-1209` (K11):
- edition template **byte-identical to the canonical GitHub template**
- vendor/runtime leak ban on the canonical template:
  `!/\bClaude\b|\bOpus\b|\bSonnet\b|\/workflow-next|\/goal|Stop-hook/`

**ACTIONABLE:** edit `init.skeleton.md:153` AND `:167` (and consider `:176`). Inside the template
region: no `Phase <n>`, no "phase file/artifact", no `Claude`/`Opus`/`Sonnet`, no `/workflow-next`,
no `/goal`, no `Stop-hook`, none of `retiredExecutor`, and keep all seven mission-list tokens.
Regenerating init.skeleton widens the render from 6 to 12 tracked surfaces (next 6 + init 6).

---

## Q7 (not asked, found anyway) — hand-maintained restatements in README.md

`README.md` is not generated and no test pins this wording, so these drift silently:

| line | text |
|---|---|
| 131 | "Each `/workflow-next` run targets one issue and ends at Finalization closure." |
| 883-884 | "A run normally carries one issue. Several may share a run when they are all open, unclaimed, and share a coherent scope — see [Multi-issue bundle lane](#multi-issue-bundle-lane)." |
| 1176 | "`/workflow-next` … advances **one selected item** …" |
| 1298 | "The bundle lane lets N same-scope issues share one worktree … The **single-issue path is unchanged**." |
| 1306 | "several issues share a run when they are all open, unclaimed, and coherent in scope. That is a shape judgement and nothing caps it — say which issues you bundled and why." |

`docs/decisions/0017-the-mission-list.md`, `docs/architecture.md` and
`docs/workflow-state-contract.md` carry **no** restatement of the bundle-width rule (checked).
`CLAUDE.md` (this repo's own) carries none either.

**ACTIONABLE:** README lines 883-884 and 1306 are near-verbatim copies of the two edited sentences
and must be updated by hand. Keep the `#multi-issue-bundle-lane` anchor (`README.md:1296`) intact —
line 884 links to it. Lines 131, 1176 and 1298 are softer single-issue framings that will read as
stale under a widened default.

---

## Inferences

- **The wording is unpinned; the propagation is what bites.** Confidence: high. Refuted by any
  `assertIncludes` on one of the six phrases — none exists at this commit.
- **The four-chain gate cannot see the six edition trees.** Confidence: high (package.json shows
  the sync checks only under `test:kaola-workflow:editions`). Refuted by finding a chain step that
  invokes either sync script — none does.
- **Trailing whitespace is the only prose-shaped transform hazard.** Confidence: high, measured
  directly. Refuted by a new token matching rules 1-4 or 6-8.

## Open

- Whether the gitlab/gitea edition-tree staleness (#4-#7) should be repaired in this run is a
  **scope decision for the orchestrator**, not a fact I can settle. It is untracked drift from
  `e4522be9`; regenerating fixes it, but nothing forces the choice.
- I did not run `npm test` or `npm run test:kaola-workflow:editions` end-to-end — the arming
  evidence above is per-check, measured against the exported render functions rather than by
  driving a full chain.
