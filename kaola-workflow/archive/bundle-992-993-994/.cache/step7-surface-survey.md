# Step 7 surface survey — finalize.skeleton.md

Read-only survey performed in the worktree
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-992-993-994`.
All paths below are repo-relative to that worktree unless stated otherwise.
No tracked file was edited.

---

## 1. Step 7, quoted in full

`templates/routing/finalize.skeleton.md:227-258` (Step 8's heading is at `:259`).
The file is 467 lines. Verbatim, including blank lines, with line numbers:

```
227  ## Step 7 — Run-gap sweep
228
229  Finishing an issue includes capturing the defects the run itself discovered. Sweep them and reconcile
230  the two sides:
231
232  ```bash
233  <!-- SLOT:fz-scripts-resolver -->
234  <!-- SPLICE:fz-gapsweep-run -->
235  ```
236
237  <!-- PIN: forge-is-the-backlog -->
238  For each real run-discovered defect, file a follow-up and record `filed: #N`. For each non-defect,
239  record `noise: <justification>`. If you hand-typed a `## Run gaps` row the scanner never observed,
240  append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the
241  scanner, so what is written was actually swept.
242
243  When this run's own findings contradict or correct the issue as filed — a wrong premise, a disproved
244  figure, a symptom that never existed, a justification the run replaced — post that correction as a
245  comment on the issue before it closes. Never close quietly against text now known to be wrong. A
246  correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the
247  record of what this issue turned out to be, and it lands on the issue it corrects.
248  <!-- /PIN -->
249
250  **File them as independent slices, not one omnibus issue.** Where the findings sit on disjoint
251  surfaces, they are separate issues; a single issue bundling unrelated surfaces cannot be worked
252  alongside anything, itself included. A later run can only take a set as wide as the backlog's
253  independence allows, so how these are filed sets how wide the next one can be.
254
255  Advisory: export `KAOLA_GOAL`, or set a `goal:` line in the run folder, so the closure receipt
256  records that a goal was DECLARED, with its source. Nothing checks whether it was achieved — do not
257  read it as success.
258
259  ## Step 8 — Closure decision
```

**Structure of Step 7, for edit planning:**

| lines | content | inside pin? |
|---|---|---|
| 227 | H2 heading `## Step 7 — Run-gap sweep` | no |
| 229-230 | lead-in prose | no |
| 232-235 | bash fence, two directives only | no |
| 237 | `<!-- PIN: forge-is-the-backlog -->` open | — |
| 238-241 | **filing paragraph** (`filed: #N` / `noise:` / manual-seed) | YES |
| 243-247 | **correction-comment paragraph** | YES |
| 248 | `<!-- /PIN -->` close | — |
| 250-253 | **independent-slices paragraph** | **NO — outside the pin** |
| 255-257 | `KAOLA_GOAL` advisory | no |

The bash fence resolves to (github/command):

- `fz-scripts-resolver` (`templates/routing/slots.js:41`) — the `kaola_script(){...}` helper +
  `CLAIM_JS=...; KAOLA_SCRIPTS="$(dirname "$CLAIM_JS")"`, keyed `command`/`skill` then forge.
- `fz-gapsweep-run` (`templates/routing/slots.js:148`) — forge-keyed only:
  `node "$KAOLA_SCRIPTS/kaola-workflow-gap-sweep.js" --project {project} --check`
  (`kaola-gitlab-…` / `kaola-gitea-…` on the other two forges).

**Step 6 also touches the gap contract**, `finalize.skeleton.md:218` and `:223-225`:

```
218  ## Run gaps
...
223  `## Validation`, `## Changed Paths` and `## Mission List` are where the finalize transaction's own
224  findings land — do not delete them, and do not soften them. `## Run gaps` carries one line per swept
225  gap, each either `filed: #N` or `noise: <justification>`.
```

Line 218 is inside the fenced ` ```markdown ` summary skeleton opened at `:208`.

---

## 2. PIN structure

### Every PIN in `templates/routing/finalize.skeleton.md`

| open | close | encloses |
|---|---|---|
| `:3` `<!-- PIN: codex-dispatch-model-routing -->` | `:16` | `## Codex Per-Spawn Model Routing` — model/reasoning-effort per spawn. Sits **inside** `<!-- REGION:skill … -->` (`:2`–`:17`), so it renders on the three SKILL surfaces only. |
| `:23` `<!-- PIN: consent-in-conversation -->` | `:29` | the `**Consent.**` paragraph |
| `:237` `<!-- PIN: forge-is-the-backlog -->` | `:248` | Step 7's filing paragraph + correction-comment paragraph (see table above) |
| `:391` `<!-- PIN: sink-reports-orchestrator-owns -->` | `:431` | `### The sink reports; you own the outcome` |
| `:433` `<!-- PIN: closure-audit -->` | `:460` | the closure-audit step |

There is **exactly one** `forge-is-the-backlog` pin in this skeleton, `:237`–`:248`.
It opens **after** the bash fence and closes **before** the independent-slices paragraph.
The heading, the lead-in, the bash block, the slices paragraph and the `KAOLA_GOAL` advisory are all
**outside** it.

For comparison, the same marker appears twice in `next.skeleton.md` (`:46-51`, `:118-122`) and three
times in `init.skeleton.md` (`:176-181`, `:183-185`, `:190-192`). `init.skeleton.md:508-538` carries a
separate `<!-- PIN: backlog-migration -->`.

### Pin governance

`docs/decisions/0018-the-forge-is-the-backlog.md:235-262` is the governing text. Key rulings, quoted:

> **The rule spans surfaces, so it takes a PIN — and a PIN is not the region.** … §2 is a record of
> what happens when one rule sits on several surfaces with no declared relationship — so this one is
> pinned, e.g. `<!-- PIN: forge-is-the-backlog -->`. That admits per-surface wording (the consent pin
> already differs between next and finalize) while making silent disappearance from one surface
> impossible.

> **Correction, measured during the build.** … the byte-scan (`test-route-reachability.js:550`) is
> purpose-built for `codex-dispatch-model-routing` alone … `consent-in-conversation` is **listed**, in
> the hand-authored `REQUIRED_BLOCKS` array of `templates/routing/required-blocks.js` (16 entries, one
> per surface topic). So a new pin **owes a manifest entry per topic that carries it**, and that entry
> is a test artifact — the party placing the markers must not also author the thing that judges their
> presence.

> Keep the two mechanisms distinct in the build: **the pin** says a rule must appear on the surfaces
> that invoke it (tool-side, cross-surface, tested); **the region** says which lines the tool owns
> inside a user-owned file (consumer-side, an ownership boundary).

**Consequence for any Step 7 edit: `required-blocks.js` is a TEST ARTIFACT.** ADR 0018 states the
party placing markers must not author the thing that judges them — i.e. under the project's test-custody
rule, `tdd-guide` owns `templates/routing/required-blocks.js`, not the implementer.

### The manifest block that judges Step 7

`templates/routing/required-blocks.js:347-364`, verbatim:

```js
  {
    // One span at Step 7 — the run-gap-sweep filing rule and the correction-posting
    // rule that follows it. The correction paragraph is the newer half: it is what
    // makes "the forge is the backlog truth" survive contact with a run that finds
    // the filed issue was wrong, rather than closing quietly over stale text.
    block_id: 'fn-forge-is-the-backlog',
    topic: 'finalize',
    runtime_tag: 'both',
    surface_type_tag: 'both',
    content_tokens: [
      '<!-- PIN: forge-is-the-backlog -->',
      'For each real run-discovered defect, file a follow-up and record `filed: #N`.',
      'append the matching `gap: <class> — <text>` line to `.cache/run-gaps-manual.md` and re-run the scanner, so what is written was actually swept.',
      'post that correction as a comment on the issue before it closes.',
      'Never close quietly against text now known to be wrong.',
      'A correction is not a follow-up: a follow-up is new work with its own `filed: #N`; a correction is the record of what this issue turned out to be, and it lands on the issue it corrects.',
    ],
  },
```

Matching is **whitespace-normalized**: `scripts/test-route-reachability.js:23`

```js
const norm = s => String(s).replace(/\s+/g, ' ');
```

and the check is `nc.includes(norm(tok))` at `test-route-reachability.js:915`. So a token may be
written on one line in the manifest while the skeleton wraps it — but **re-wrapping Step 7 prose is
safe only as long as the sequence of words is unchanged**. Any edit that inserts a word into, or
deletes a word from, one of those five token strings reds `missing-token` on every obligated surface.

Two sibling blocks name the same marker: `nx-forge-is-the-backlog` (`:310-328`) and
`in-forge-is-the-backlog` (`:329-346`). Header comment at `:299-309` explains why the marker is also
listed as foreign.

`<!-- PIN: forge-is-the-backlog -->` is in `FOREIGN_MARKERS`, `scripts/test-route-reachability.js:848`,
with this rationale at `:844-847`:

> the reverse sentinel keys marker -> single block via a plain Map, so registering
> nx-/in-/fn-forge-is-the-backlog would each overwrite the last one in … (measured: 61 false failures
> before this entry was added). The three FORWARD presence blocks below are what actually enforce each
> topic's wording

So the reverse orphan-sentinel will **not** complain about a second `forge-is-the-backlog` pin in the
finalize skeleton — but the FORWARD block is keyed one-per-topic, and `markerToBlock` is a plain Map,
so a *new, differently-named* pin added to Step 7 **must** get its own `REQUIRED_BLOCKS` entry or the
reverse sentinel reds `orphan-surface` on all 12 obligated finalize surfaces (ADR 0018 measured
331/0 → 330 passing / 73 failing when markers were added without manifest entries).

**Non-vacuity floor** (`test-route-reachability.js:986-1020`): a marker-led block must carry ≥1
distinctive token that is not a substring of its own marker, and an empty `content_tokens` array reds.

---

## 3. `## Run gaps` row grammar — what is parser-owned

### Where the grammar is specified in prose

**It is NOT fully specified anywhere in the skeleton.** The skeleton says only:

- `finalize.skeleton.md:224-225` — "`## Run gaps` carries one line per swept gap, each either
  `filed: #N` or `noise: <justification>`."
- `finalize.skeleton.md:238-241` — the pinned filing paragraph (records `filed: #N` / `noise: <justification>`,
  seeds via `gap: <class> — <text>`).

The full strict row form `- <reasonClass> (<sample>): filed: #N` appears **only** in:

- `scripts/kaola-workflow-gap-sweep.js:253-254` (comment) and `:278` (the stderr warning string)
- the three ported copies: `plugins/kaola-workflow/scripts/…:253`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-gap-sweep.js:254`,
  `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-gap-sweep.js:254`
- `docs/conventions.md:517-518` and `:534`
- `docs/decisions/D-435-01.md:88-89`, `docs/decisions/D-653-01.md:129`

`docs/api.md:1425-1431` documents the two modes but not the strict row form either.

### The parser (`scripts/kaola-workflow-gap-sweep.js`)

**`parseGapSection`, `:234-294`.** Section detection: `/^## Run gaps\s*$/` on the trimmed line
(`:244`) — the heading must be exactly that, nothing appended. It stops at the next `## ` (`:249`) and
skips any line not starting with `- ` (`:251`).

**The row regex, `:265` — parser-owned, do not paraphrase:**

```js
const m = l.match(/^-\s+(\S+)\s+\((.+?)\):\s+(filed:\s*#(\d+)|noise:\s+(.+))$/);
```

Required form, exactly:
- `- ` then **`<reasonClass>` with no whitespace** (`\S+`) — `deferred_red_chain` or `manual:<kebab-slug>`
- one or more spaces
- `(` `<sample>` `)` — lazy, so it takes the **leftmost** `): ` followed by a valid tail
- `: ` (one or more spaces after the colon)
- either `filed:` + optional spaces + `#` + digits, **or** `noise:` + one or more spaces + free text

The comment at `:256-264` says the lazy quantifier is load-bearing in both directions and ends with
**"Do not 'simplify' this quantifier."**

**Malformed-row warning, `:275-280`:** a line matching `/^-\s+.*\(.*\):\s*(filed:|noise:)/` but failing
the strict regex writes an advisory to stderr and is otherwise ignored. Free-text bullets (`- none`,
prose notes) never reach that branch and are ignored silently by design.

**`samplesMatch`, `:307-312`:**

```js
function samplesMatch(a, b) {
  const left  = String(a === undefined || a === null ? '' : a).trim();
  const right = String(b === undefined || b === null ? '' : b).trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
```

Symmetric containment after trim; an empty side never matches. Per the comment at `:296-306`, this
**loosens the SAMPLE comparison and nothing else** — `reasonClass` stays `===` at both call sites
(`:347` reverse, `:408` forward).

**Both directions gate:**
- `:345-368` reverse containment — a strict-grammar row with no matching swept `(reasonClass, sample)`
  refuses `observed_gap_unseeded`.
- `:406-433` forward — a swept tuple with no matching row refuses `gaps_unswept`.
- `:371-381` vacuous pass requires **both** sides empty.

Seeding grammar, `scanManual` `:87-115`: lines starting `gap:`, split on `—` or ` - `; the class is
kebab-slugged (`toKebab`, `:58-63`) into `manual:<slug>`; the text becomes the sample.

### Text that MUST NOT be touched

Parser-owned literals appearing in prose that the parser or its tests key on:

1. The heading `## Run gaps` — `finalize.skeleton.md:218` (inside the summary template fence). The
   regex is anchored and whitespace-trimmed; renaming or suffixing it makes `parseGapSection` return
   `null`.
2. `filed: #N` and `noise: <justification>` as the two row tails — `finalize.skeleton.md:225` and `:238-239`.
3. `gap: <class> — <text>` and `.cache/run-gaps-manual.md` — `finalize.skeleton.md:240`. The em dash is
   the separator the scanner splits on (an ASCII ` - ` also works, but the prose teaches the em dash).
4. The five `fn-forge-is-the-backlog` `content_tokens` strings listed in §2 — a guard, not the parser,
   but equally binding.

Text that is **free prose** and safe to edit: the Step 7 heading text, lines 229-230, the
independent-slices paragraph (250-253), the `KAOLA_GOAL` advisory (255-257), and line 223-224's framing
sentence up to the `` `## Run gaps` `` literal.

---

## 4. Rendering pipeline

`scripts/generate-routing-surfaces.js` (412 lines).

### Directives (header comment `:6-51`)

- `<!-- SLOT:name -->` — whole-line replacement, resolved for `(surface_type × forge)`.
- `<!-- SPLICE:name -->` — whole-line, mid-paragraph variant, same keying.
- `<!-- REGION:cond — why -->` … `<!-- /REGION -->` — keep body only when `cond` matches; `cond` is a
  `,`-joined OR of `+`-joined ANDs over `surface_type`/`forge` tags.

The engine's own ruling on which to use, `:29-37`:

> REGION vs SPLICE is not a style choice. A SPLICE always emits exactly one value, so its smallest
> possible rendering is one line — it cannot express "these lines exist on some contexts and not
> others". Lines that are ABSENT on a context must therefore be a REGION, and lines that merely READ
> DIFFERENTLY across contexts should be a SPLICE.

And on the region's justification tail, `:21-27`:

> A REGION open directive carries its own justification after an em dash: the capability difference
> that makes the divergence real, in one clause, on the same line as the condition. It is authoring
> metadata — the renderer reads the condition and drops the rest, so no reason ever reaches a shipped
> surface. A region records THAT a surface diverges; the reason records WHY, and a region whose reason
> cannot name a runtime difference is drift to be collapsed rather than a divergence to be kept.

Regex: `RE_REGION_OPEN = /^<!--\s*REGION:([A-Za-z0-9_+,-]+)(?:\s+—\s+.*?)?\s*-->$/` (`:167`). The
em dash is **required syntax** for the tail — a hyphen there fails the match, the line emits as literal
text, and the matching `<!-- /REGION -->` throws `unmatched /REGION` (`:163-168`, `:227-229`).

Regions nest (`extractRegion`, `:197-212`). Rendering order: regions/slots/splices resolved first, then
`applyRenames(out, forge)` (`:251`).

### The 18 output files

`GENERATED_SURFACES` (`:107-130`) = 3 topics × (3 command editions + 3 skill editions). Paths are
**computed**, never hand-typed (`deriveSurfacePath`, `:101-103`). Editions at `:66-75`.

The six that render from `finalize.skeleton.md`, with Step 7 line offsets as shipped today:

| path | Step 7 | PIN open | `/PIN` | Step 8 |
|---|---|---|---|---|
| `commands/kaola-workflow-finalize.md` | 202 | 213 | 224 | 235 |
| `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | 202 | 213 | 224 | 235 |
| `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | 202 | 213 | 224 | 235 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | 188 | 199 | 210 | 221 |
| `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | 188 | 199 | 210 | 221 |
| `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | 188 | 199 | 210 | 221 |

The other 12 (`next` × 6, `init` × 6) render from the other two skeletons; a Step 7 edit does not
touch them.

### Which runtimes the six reach

- **claude** — the three `commands/…` surfaces (github at repo root, gitlab/gitea under `plugins/`).
- **codex** — the three `…/skills/kaola-workflow-finalize/SKILL.md` surfaces.
- **opencode** and **kimi** — *not* tracked files. They render **from the command surfaces**:
  `scripts/runtime-edition-forge.js:99-108`

  > The command surfaces a runtime edition renders FROM, for one forge … Sourced from the routing
  > registry, so these are exactly the generated, byte-checked surfaces — a runtime edition never reads
  > a hand-maintained command list.

  `commandSources(forge)` calls `routing.commandSurfacesForForge(forge)`. Output trees:
  `.opencode[-<forge>]/command/` (`sync-opencode-edition.js:89-104`) and `.kimi[-<forge>]/skills/<name>/`
  (`sync-kimi-edition.js:34,86-90`). Both trees are gitignored.

  `cmdWrite` refreshes only **already-present** edition trees (`generate-routing-surfaces.js:358-371`),
  by spawning `sync-opencode-edition.js --refresh-present` / `sync-kimi-edition.js --refresh-present`.
  Comment at `:345-353`: this belongs to `--write` alone, because "a check that read an edition tree
  would put the editions inside `npm test`".

So **one Step 7 edit reaches 6 tracked surfaces + 6 generated edition trees = 12 finalize surfaces**,
across claude / codex / opencode / kimi × github / gitlab / gitea.

### What `--check` verifies

`cmdCheck` (`:321-343`): for each of the 18 rows, read the committed file, render in memory, and
**byte-compare**. A missing file reports `MISSING:`; a mismatch reports `DRIFT:` plus a bounded
first-differing-lines diff (`minimalDiff`, `:303-319`) and exits 1. Success prints
`generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.` `--check` is the default
with no args (`:384`). It **does not** read the opencode/kimi trees.

### Slot / rename mechanics affecting Step 7

- `templates/routing/slots.js` — `fz-scripts-resolver` (`:41`, keyed `command`/`skill` → forge) and
  `fz-gapsweep-run` (`:148`, forge-keyed). `resolveKeyed` (`generate-routing-surfaces.js:182-192`)
  descends `surface_type` then `forge` and **throws** on any unresolvable branch.
- `templates/routing/rename-table.js` — `RENAMES = {}` (`:25`). Empty, deliberately:

  > RENAMES IS EMPTY TODAY, and that is a state rather than a retirement. Every forge-specific
  > basename the three surviving skeletons name is already written out per forge in slots.js …
  > A post-render string substitution is the weaker of the two mechanisms (it cannot see whether it hit
  > prose or a path), so the table is kept as the escape hatch for a basename that genuinely cannot be
  > forge-keyed at source, not as the default route. (`:10-18`)

  **Practical consequence: a forge-specific script name written into Step 7 prose will NOT be renamed.**
  It must go through a forge-keyed SLOT/SPLICE in `slots.js`.
- `templates/routing/required-blocks.js` — see §2.

### How #985 declared divergence

#985 needed a per-forge divergence in `next.skeleton.md` and used a **named REGION plus a forge-keyed
SPLICE**. `templates/routing/next.skeleton.md:118-129`:

```
118  <!-- PIN: forge-is-the-backlog -->
119  Before claiming, read each shortlisted candidate's own body and comments — the handful you are
120  ranking for this claim, never the full list fetched above. Comments are current state: where a
121  comment contradicts the body, the comment wins, and you say so aloud when you state the selection.
122  <!-- /PIN -->
123
124  ```bash
125  <!-- REGION:gitea — tea has no porcelain comments view; the gitea read goes through kaola-gitea-forge.js's tea api transport instead, which needs $KAOLA_SCRIPTS to find the module -->
126  <!-- SLOT:nx-scripts-resolver -->
127  <!-- /REGION -->
128  <!-- SPLICE:nx-issue-detail-fetch -->
129  ```
```

The splice, `templates/routing/slots.js:116`:

```js
"nx-issue-detail-fetch": {"github":"gh issue view {N} --json body,comments","gitlab":"glab issue view {N} --comments -F json","gitea":"node -e \"…kaola-gitea-forge.js…\" \"$KAOLA_SCRIPTS\" {N}"},
```

Note the shape: the **prose is one wording under one pin, shared by all six surfaces**; only the
mechanism line diverges. The REGION exists solely because gitea needs an *extra line* (the resolver)
that the other forges do not — lines that are ABSENT on a context, per the engine's own rule.

`CHANGELOG.md:69-79` records it, and states the reason in the region's own terms:

> `gh` and `glab` read body-plus-comments through their own porcelain flag (`gh issue view {N} --json
> body,comments`, `glab issue view {N} --comments -F json`); `tea` has no such view, so the gitea
> variant runs through `kaola-gitea-forge.js`'s existing `tea api` transport instead of a second
> owner/repo-resolution copy in shell. Prose-only, in `next.skeleton.md` plus one new slot entry;
> renders to the 18 tracked routing surfaces via `generate-routing-surfaces.js --write`.

---

## 5. Prior art for a typed body / structured section contract

**There is no `searched:` line anywhere in the repo** (grep over `templates/`, `scripts/`, `agents/`,
`commands/` returns zero hits).

**No routing skeleton prescribes issue-body structure.** Grep for `acceptance` / `issue body` /
`gh issue create` / `--body-file` / `title:` over the three skeletons returns only
`finalize.skeleton.md:144` (`## Step 3 — Acceptance`, an unrelated step heading) and `:267` (prose).

The closest prior art in kind, and the model an edit would follow:

1. **A prescribed structured section, as a fenced template** — `finalize.skeleton.md:205-225`:

   ```
   205  Create `kaola-workflow/{project}/finalization-summary.md`. It is the run's closing record and the
   206  last thing a reader has after the folder is archived:
   207
   208  ```markdown
   209  # Finalization — Summary: {project}
   210
   211  ## Delivered
   212  ## Files Changed
   213  ## Test Coverage
   214  ## Validation
   215  ## Changed Paths
   216  ## Mission List
   217  ## Documentation Docking
   218  ## Run gaps
   219  ## Follow-Up Items
   220  ## Status: READY FOR FINAL GIT GATE
   221  ```
   ```

   This is a **bare heading list in a fenced block, plus a prose sentence per contract-bearing
   heading** — no per-field grammar in the fence itself.

2. **A prescribed line-level contract stated as prose, not a template** — the two closest are
   `finalize.skeleton.md:225` (`each either `filed: #N` or `noise: <justification>``) and
   `:272-274` in Step 8:

   > The durable signal is one optional line in the `## Sink` block of `workflow-state.md`:
   > `issue_action: comment_keep_open` (absent means close), written by you at the closure decision
   > with the user's agreement.

3. **A typed field on a consumer-facing config**, `init.skeleton.md:190-192`, inside its own
   `forge-is-the-backlog` pin:

   ```
   190  <!-- PIN: forge-is-the-backlog -->
   191  - Top-priority labels: declare in `kaola-workflow/config.json` (`priority_top_tier_labels`) when the repo uses something other than P0–P3 naming.
   192  <!-- /PIN -->
   ```

4. **File-body scaffolding as fenced markdown** — `init.skeleton.md:446-482`, six `docs/*` and
   `CHANGELOG.md` bodies. This is scaffolding for files, not a schema for issue bodies.

**Notable gap:** ADR 0018 §8 item 8 asserts a duty that Step 7 does not currently carry —

> **The run loop's only new duty is tagging what it files.** Finalize Step 7 mandates a follow-up per
> real defect; an issue filed without a `P` label is tier 99 and invisible to the sorter item 2
> connects. So the tier is written in the same breath as `filed: #N`. **That is the whole of it.**

Grep of `templates/routing/finalize.skeleton.md` for `P0` / `tier` / `label` / `priority` finds
**no priority-tier mention anywhere in Step 7** (the only hits are the codex model-tier region at
`:2-14`, `doc-updater`'s tier at `:182`, and `workflow:in-progress` at `:279`/`:437`/`:446`). The
"tier in the same breath as `filed: #N`" duty was never written into the shipped prose.

---

## 6. Tests and guards covering this skeleton

### Byte-identity — would fail on skeleton/surface divergence

- **`node scripts/generate-routing-surfaces.js --check`** — the direct guard. Runs in **all four
  chains**: `package.json:40` (claude), `:41` (codex), `:42` (gitlab), `:43` (gitea), and `:46`
  (`claude:full`). Reports `DRIFT: <path>` with a line diff, exits 1.
- **`scripts/test-generate-routing-surfaces.js`** — claude chain only (`package.json:40`, `:46`).
  Asserts each topic derives exactly six surfaces and that a required-token list reaches all six.
  Its `finalize` list (`:313-328`) is:
  `<!-- PIN: consent-in-conversation -->`, `<!-- PIN: sink-reports-orchestrator-owns -->`,
  `<!-- PIN: closure-audit -->`, `finalization-summary.md`, `workflow-state.md`, `mission-list.md`,
  `## Validation`, `## Changed Paths`, `chain-receipt.json`, `final-validation.md`, `--issue-numbers`,
  `closure-audit`, `sink-merge`, `doc-updater`, `kaola-workflow/archive/`.
  **`forge-is-the-backlog` is NOT in this list** and neither is any Step 7 phrase.

### Pin presence — the block that reds on a Step 7 wording change

- **`scripts/test-route-reachability.js`** — claude chain only (`package.json:40`, `:46`).
  `checkManifest` (`:890-953`) enforces `fn-forge-is-the-backlog`'s five tokens over its **derived**
  obligated set. `MANIFEST_EDITIONS` (`:724-739`) = 3 claude commands + (opencode, kimi) × 3 forges
  = 9 command surfaces, plus 3 codex skill surfaces → **12 obligated finalize files**.
  The opencode/kimi halves are **rendered in memory**, `:794-812`:

  > The SIX generated trees are gitignored and absent from a fresh checkout, so they are rendered IN
  > MEMORY through the sync modules' own renderers … there is no "skip when absent" path here, because
  > a check that quietly enforces nothing when its subject is missing is the defect, not the safeguard.

  So this suite is **not** vacuous in a fresh worktree for the routing surfaces (unlike
  `test-opencode-edition.js` / `test-kimi-edition.js`, which read the gitignored trees).
  Also enforced here: the reverse orphan-sentinel (`:922-950`), the non-vacuity floor (`:986-1020`),
  and the universe anti-vacuity floor (`:741-792`).

### Prose bans and other surface guards

- **`scripts/validate-workflow-contracts.js`** — claude chain (`package.json:40`, `:46`). Sweeps
  `commands/kaola-workflow-finalize.md` for retired vocabulary. `phaseCommands` = that one file
  (`:156-158`); bans applied at `:176-191` are the `retired` array (`:140-154`) and
  `retiredPathSelector` (`:165-166` — `KAOLA_PATH`, `--workflow-path`, `path_not_installed`,
  `workflow_path_refused`, `bundle_requires_adaptive`). `retiredExecutor` (`:173-174` —
  `workflow-plan.md`, `Node Ledger`, `plan_hash`, `workflow-planner`, `post-dominat`, `parallel_safe`,
  `running-set`, `fan-out cap`) is applied to the **next** surfaces and the init template region, not
  to finalize. Also asserts a fixed set of finalize literals (`:491-522`).
- **`scripts/validate-kaola-workflow-contracts.js`** — codex chain (`package.json:41`); the
  third contract-validator copy.
- **`scripts/test-bash-block-guards.js`** — claude chain (`package.json:40`, `:46`).
  `FINALIZE_SURFACES` (`:177-183`) is all six finalize surfaces; it guards bash-block content.
  Step 7's fence contains only the two directives, so a prose-only edit does not reach it.

### Gap-sweep parser behaviour

- **`scripts/test-gap-sweep.js`** — claude chain (`package.json:40`, `:46`). Covers the row grammar
  directly: `:189` (basic `filed: #N`), `:645` (paren-bearing sample `retryAfter(from:)`),
  `:668-703` (lazy-vs-greedy discrimination — a `noise:` justification containing `): filed: #700`
  must yield `noise:1 filed:0`), `:726` (never-seeded → `observed_gap_unseeded`),
  `:753-786` (malformed row → stderr advisory, one line, exit code unchanged).
  It asserts on **the parser**, never on skeleton prose.

### What does NOT cover Step 7's specific wording

Measured by grep over `scripts/`:

- `independent slices` — **zero** hits in `scripts/`. The phrase exists only in the skeleton, the six
  rendered surfaces, and two archived run records (`kaola-workflow/archive/issue-968/…`).
- `disjoint surfaces` — zero hits in `scripts/`.
- `omnibus` — zero hits in `scripts/`.
- `Run gaps` in `scripts/` — only `kaola-workflow-gap-sweep.js` and `test-gap-sweep.js`.
- `scripts/simulate-workflow-walkthrough.js` — no reference to `kaola-workflow-finalize.md` or
  `finalize.skeleton`.
- `scripts/test-opencode-edition.js` / `test-kimi-edition.js` — assert `closure-audit`,
  `sink-reports-orchestrator-owns` and `consent-in-conversation` markers on the finalize surface
  (`test-opencode-edition.js:774-785`); **no** `forge-is-the-backlog`, no Step 7 phrase.

### Summary of what reds on which kind of edit

| edit | reds |
|---|---|
| skeleton edited, surfaces not regenerated | `generate-routing-surfaces.js --check` — all four chains |
| any word added/removed inside one of the five `fn-forge-is-the-backlog` tokens | `test-route-reachability.js` `missing-token` × 12 files — claude chain only |
| paragraph 250-253 (independent slices) rewritten or deleted | **nothing** — unguarded today |
| a new PIN marker added to Step 7 without a `required-blocks.js` entry | `test-route-reachability.js` `orphan-surface` × 12 — claude chain only |
| `## Run gaps` heading renamed | **no test** on the prose; `gap-sweep --check` silently returns `null` for the section at runtime |
| a retired-vocabulary token introduced | `validate-workflow-contracts.js` (claude), `validate-kaola-workflow-contracts.js` (codex) |
| pure prose edit to a routing skeleton | **edition-touching** — `run-chains.js` diff-scopes to all four chains |

### Documentation surfaces that mirror Step 7 and would go stale

- `docs/api.md:1420-1431` — the gap-sweep two-mode description.
- `docs/conventions.md:496-540` — the full three-step orchestrator contract, including the strict row
  grammar at `:517-518` and the `observed_gap_unseeded` / `gaps_unswept` semantics at `:528-540`.
- `docs/workflow-state-contract.md:55`, `:183` — `.cache/run-gaps-manual.md` as a record.
- `docs/decisions/D-435-01.md`, `docs/decisions/D-653-01.md` — the originating records.
- `CHANGELOG.md` `[Unreleased]`.
