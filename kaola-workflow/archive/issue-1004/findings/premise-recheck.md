# Premise recheck — issue #1004, re-measured at HEAD

Read-only investigation. No tracked file was modified. Scratch harnesses live under
`/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/78702dee-4f41-433d-a4c1-d211e999da70/scratchpad/`.

## Setup

- **Repo**: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`
- **HEAD**: `3380cafe48108509cc76f0f02f19c563b5d4ea88` on `main` — `chore: archive bundle-1001-1002 [sink]`
- **Issue's measurement commit**: `b52939f6` (HEAD~1)
- **Working tree**: clean except the untracked active run folder `kaola-workflow/issue-1004/`
- **Second worktree present**: `.kw/worktrees/issue-1004` at the same commit `3380cafe`
  (`git worktree list`) — it is a checkout of the same tree, so it contributes no distinct code.
- Node harnesses used: `guard-probe.js`, `corpus-count.js`, `corpus-count-at-rev.js`, `port-parity.js`.
- No `git commit` / `git add -A` / `git write-tree` was run (broken `F_FULLFSYNC` on this volume).

---

## Claim 1 — The guard

**Claimed**: `appendSummarySection(projectDir, heading, lines, replace)` sits around
`scripts/kaola-workflow-claim.js:3940-3946` and contains an early
`if (existing) { if (!replace) return false; ... }` arm.

### Observation — actual current source

The function occupies `scripts/kaola-workflow-claim.js:3940-3958`. Extracted verbatim by
brace-matching from the shipped file (harness `guard-probe.js`, which prints the byte range it cut):

```
=== EXTRACTED SHIPPED BYTES, lines 3940-3958 ===
function appendSummarySection(projectDir, heading, lines, replace) {
  try {
    const p = path.join(projectDir, 'finalization-summary.md');
    let s = '';
    try { s = fs.readFileSync(p, 'utf8'); } catch (_) { /* create-if-absent */ }
    const existing = s.match(new RegExp('^' + heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'));
    if (existing) {
      if (!replace) return false;
      // Cut the heading through to the next `## ` heading (never a `### ` sub-heading, which is
      // three hashes and so cannot match) or to end of file.
      const after = s.indexOf('\n## ', existing.index + heading.length);
      s = s.slice(0, existing.index) + (after < 0 ? '' : s.slice(after + 1));
      if (!s.trim()) s = '';
    }
    const block = [heading, ''].concat(lines).join('\n') + '\n';
    writeFile(p, s ? (s.trimEnd() + '\n\n' + block) : block);
    return true;
  } catch (_) { return false; }
}
=== END EXTRACT ===
```

The `if (!replace) return false;` arm is at **`:3947`**; the `if (existing)` test is at **`:3946`**.
The guard's intent is documented in the comment block immediately above, `:3929-3939`, which states
it outright: *"Both are idempotent across a crash-resumed re-entry (the heading is checked first)"*
and *"Only the findings flush passes it; every other caller is byte-identical to before."*

### Observation — behavior, measured by executing the shipped bytes

`guard-probe.js` evals the extracted function with real `fs`/`path` and a plain `writeFile`, against
scratch directories. Actual output:

| Case | Pre-existing file | `replace` | Return | File after |
|---|---|---|---|---|
| A | heading **absent** | `undefined` | `true` | section appended at end |
| B | heading **present, empty** (Step 6 template shape) | `undefined` | **`false`** | **byte-unchanged** |
| C | heading **present, empty** | `true` | `true` | section cut and re-appended **at end of file** |
| D | **no file at all** | `undefined` | `true` | file created with the section |
| E | heading present **with hand-written content** | `undefined` | **`false`** | **byte-unchanged; hand content preserved** |

Case B verbatim:

```
--- CASE: B_present_empty_noreplace ---
replace arg   : undefined
return value  : false
file after    :
    | # Summary
    |
    | ## Validation
    |
    | ## Changed Paths
    |
    | ## Mission List
    |
```

### Precise statement of what it does

- **Heading absent (or file absent)**: builds `[heading, ''] + lines`, appends it after the existing
  content (or creates the file), returns **`true`**.
- **Heading present and `replace` falsy**: returns **`false`** immediately, having written nothing.
  The `lines` array is discarded.
- **Heading present and `replace` truthy**: excises the old section from its heading to the next
  `## ` heading (or EOF), then appends the new block **at the end of the file** — so a replaced
  section *moves* to the bottom. (Case C above; not asserted by the issue, recorded here because it
  is a behavioural fact of the same arm.)
- **Any throw**: caught by the outer `catch`, returns **`false`**. A `false` return is therefore
  ambiguous between "declined" and "errored".

**VERDICT: HOLDS.** The arm exists exactly as quoted and behaves exactly as claimed. The only
correction is cosmetic: the function spans `:3940-3958`, not `:3940-3946`; the cited range ends at
the `if (existing)` line rather than at the function's close.

---

## Claim 2 — The three call sites

**Claimed**: three producers call it without `replace` — `## Validation` (~:3976),
`## Changed Paths` (~:3988), `## Mission List` (~:4057).

### Observation — every call site in the repo

`git grep -n "appendSummarySection" -- ':!kaola-workflow/archive' ':!CHANGELOG.md' ':!docs'`

There are **four `claim.js` copies** and **four call sites in each** — **16 call sites repo-wide**,
not three. Full enumeration (comment-only mentions excluded):

| # | File | Line | Heading written | `replace` passed? | Caller does what with the return |
|---|---|---|---|---|---|
| 1 | `scripts/kaola-workflow-claim.js` | 3976 | `## Validation` | **no** | `return`ed from `persistValidationToSummary`; **discarded** at the call site `:4457` |
| 2 | `scripts/kaola-workflow-claim.js` | 3988 | `## Changed Paths` | **no** | `return`ed from `persistChangedPathsToSummary`; **discarded** at `:4458` |
| 3 | `scripts/kaola-workflow-claim.js` | 4057 | `## Mission List` | **no** | `return`ed from `persistMissionListToSummary`; **discarded** at `:4459` |
| 4 | `scripts/kaola-workflow-claim.js` | 4266 | `## Finalize Findings` | **YES — `true`** | return not captured; call is a bare statement inside `flushFinalizeFindings` |
| 5-8 | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 3976 / 3988 / 4057 / 4266 | same four | same | same |
| 9-12 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 3753 / 3765 / 3834 / 4042 | same four | same | same |
| 13-16 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 3750 / 3762 / 3831 / 4039 | same four | same | same |

**12 of 16 call sites pass no `replace`; 4 pass `replace: true`.**

The three consuming call sites in the canonical file, verbatim at `scripts/kaola-workflow-claim.js:4457-4459`:

```js
    persistValidationToSummary(finalizeAuthorityDir, finalizeValidation);
    persistChangedPathsToSummary(finalizeAuthorityDir, finalizeChangedPaths, finalizeChangedProbe);
    persistMissionListToSummary(finalizeAuthorityDir, finalizeMissionList);
```

All three are bare expression statements — no assignment, no `if`, no logging. **The `false` return
is never read by anything.** There is no branch anywhere in the file that observes it.

### The fourth caller is immune, and it is a different mechanism

`scripts/kaola-workflow-claim.js:4266` — `appendSummarySection(result.dest, '## Finalize Findings', lines, true);`
— passes `replace: true` and therefore always writes. Its 8 feeder call sites
(`grep -n "recordFinalizeFinding(" scripts/kaola-workflow-claim.js`) are at `:4694, :4934, :4986,
:5044, :5124, :5151, :5204, :5247` and carry types `claim_release_skipped_offline`,
`archive_unstage_failed`, `archive_stage_failed`, `archive_commit_probe_failed`,
`residue_probe_failed`, `residue_unattributed`, `residue_stage_failed`,
`finalize_commit_probe_failed` — all mechanical git/archive faults. **None of them carries the
validation classification.** So `## Finalize Findings` is not an alternate sink for the finding at
issue in claim 5.

### Port parity

`port-parity.js` brace-extracts the function from all four copies and hashes each body:

```
3940-3958  sha=1b706fc826fe  scripts/kaola-workflow-claim.js
3940-3958  sha=1b706fc826fe  plugins/kaola-workflow/scripts/kaola-workflow-claim.js
3717-3735  sha=1b706fc826fe  plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js
3714-3732  sha=1b706fc826fe  plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js

distinct function bodies: 1
GUARD PRESENT (all four)
```

The two GitHub copies are byte-identical whole files (`cmp` exit 0; md5 `9171c826…` both). The
gitlab/gitea hand-ports differ as whole files (md5 `a0d47dc6…`, `7b98a6d2…`) but carry a
**byte-identical** `appendSummarySection`. No additional copies exist: `find` for `*workflow-claim.js`
outside `.git/` and `.kw/` returns exactly those four, and the additive `.opencode` / `.kimi` edition
homes ship no `claim.js`.

**VERDICT: HOLDS as stated, but the enumeration is materially incomplete.** The issue's three named
call sites and their line numbers are exactly correct for `scripts/kaola-workflow-claim.js`, and the
sentence "all three producers call it without `replace`" is true. **However** — flagging this loudly,
per the prior "named ONE call site; there were TWO" burn — the issue's reader is left with "three
call sites" when the repo has **sixteen**: a **fourth caller per copy** (`## Finalize Findings`,
which passes `replace: true` and is unaffected), multiplied across **four shipped copies of
`claim.js`**, three of which the issue never mentions. The affected population is **12 call sites
across 4 files**, not 3 call sites in 1 file.

---

## Claim 3 — The surface

**Claimed**: Step 6 ships a summary template containing `## Validation`, `## Changed Paths` and
`## Mission List`, with prose saying they "are where the finalize transaction's own findings land —
do not delete them, and do not soften them."

### Observation — the authoring skeleton

`templates/routing/finalize.skeleton.md:203-234`, verbatim:

```markdown
## Step 6 — Write the summary
...
Create `kaola-workflow/{project}/finalization-summary.md`. It is the run's closing record and the
last thing a reader has after the folder is archived:

```markdown
# Finalization — Summary: {project}

## Delivered
## Files Changed
## Test Coverage
## Validation
## Changed Paths
## Mission List
## Documentation Docking
## Run gaps
## Follow-Up Items
## Status: READY FOR FINAL GIT GATE
```

`## Validation`, `## Changed Paths` and `## Mission List` are where the finalize transaction's own
findings land — do not delete them, and do not soften them. `## Run gaps` carries one line per swept
gap, each either `filed: #N` or `noise: <justification>`.
```

The three headings appear in the fenced template as **bare headings with no body** — which is
exactly case B of the claim-1 probe (heading present, empty → `false`, nothing written).

### Observation — every file carrying the template

`git grep -ln "do not delete them, and do not soften them"` plus a check of the untracked additive
edition homes. Each was verified to carry exactly one occurrence of each literal heading and one
occurrence of the prose sentence (`V=1 CP=1 ML=1 prose=1` for all nine):

| # | Path | `## Validation` | prose line | Status |
|---|---|---|---|---|
| 1 | `templates/routing/finalize.skeleton.md` | L223 | L233 | **authoring skeleton** |
| 2 | `commands/kaola-workflow-finalize.md` | L199 | L209 | tracked, generated (github command) |
| 3 | `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | L185 | L195 | tracked, generated (github skill) |
| 4 | `plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md` | L199 | L209 | tracked, generated |
| 5 | `plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md` | L185 | L195 | tracked, generated |
| 6 | `plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md` | L199 | L209 | tracked, generated |
| 7 | `plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md` | L185 | L195 | tracked, generated |
| 8 | `.opencode/command/kaola-workflow-finalize.md` | L196 | L206 | **untracked** (gitignored additive edition) |
| 9 | `.kimi/skills/kaola-workflow-finalize/SKILL.md` | L190 | L200 | **untracked** (gitignored additive edition) |

`plugins/kaola-workflow/commands/` does not exist — the github edition's command surface is the
top-level `commands/`.

The generated family is confirmed by the repo's own guard:

```
$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT=0
```

18 = next×6 + init×6 + finalize×6 (`scripts/generate-routing-surfaces.js:6`), i.e. rows 2-7 above.
Rows 8-9 are rendered from the same rows by `sync-opencode-edition.js` / `sync-kimi-edition.js`
(`scripts/generate-routing-surfaces.js:145, :361`), not by the 18-surface generator.

Also matching the prose string, but not template surfaces: `templates/routing/required-blocks.js`
(the block-presence guard) and three archived run records
(`kaola-workflow/archive/bundle-969-970-971-972/impl-970.md`,
`kaola-workflow/archive/bundle-992-993-994/.cache/step7-surface-survey.md`,
`kaola-workflow/archive/bundle-1001-1002/mission-list.md`).

**VERDICT: HOLDS.** The template and its prose ship verbatim as claimed, in **9 live copies**
(1 skeleton + 6 tracked generated + 2 untracked additive-edition renders). The issue described it as
a single surface; it is a generated family.

---

## Claim 4 — The corpus figure

**Claimed**: of 157 archived summaries, 49 carry `## Validation` and **16** of those are EMPTY
(33 filled).

### Method

`corpus-count.js` scans `kaola-workflow/archive/*/finalization-summary.md`. "Empty" = the heading
line matches exactly, and everything from the line after it to the next line beginning `## `
(or EOF) is whitespace-only. This mirrors the guard's own matcher, which is `^<heading>$` multiline.
`corpus-count-at-rev.js` performs the identical measurement against an arbitrary revision using
`git ls-tree` + `git show`, so no checkout is needed.

Undercount control: `grep -h -E '^##+ *(Validation|Changed Paths|Mission List)' */finalization-summary.md | sort | uniq -c`
returns **only** the three exact forms — `49 ## Validation`, `48 ## Changed Paths`,
`12 ## Mission List`. No qualified headings, no trailing-space variants, no `###` forms, and
`file` reports no CRLF summaries. The exact-match counts are therefore complete.

### Observation — at HEAD (`3380cafe`)

```
archive dirs scanned          : 407
archived finalization-summary : 157

## Validation  present=49  EMPTY=15  filled=34
## Changed Paths  present=48  EMPTY=17  filled=31
## Mission List  present=12  EMPTY=3  filled=9
```

### Observation — at the issue's commit (`b52939f6`), as committed

```
rev: b52939f6
archived finalization-summary files: 156
  ## Validation  present=48  EMPTY=15  filled=33
  ## Changed Paths  present=47  EMPTY=17  filled=30
  ## Mission List  present=11  EMPTY=3  filled=8
```

### The 15 EMPTY `## Validation` runs (identical list at both commits)

```
bundle-888-889-890-892-893-894-895
bundle-911-912-913-914-916-917
bundle-945-946-947-948
bundle-963-964-966
bundle-984-985
bundle-987-988-989
bundle-992-993-994
issue-899
issue-928
issue-929.archived-2026-08-03T14-15-27-770Z
issue-933
issue-936
issue-949
issue-967
issue-968
```

All five "empty examples" the issue lists (`bundle-888-889-890-892-893-894-895`,
`bundle-911-912-913-914-916-917`, `bundle-945-946-947-948`, `bundle-963-964-966`, `bundle-984-985`)
are in this list.

EMPTY `## Changed Paths` (17): the 15 above plus `bundle-896-897-898` and `issue-878`.
EMPTY `## Mission List` (3): `bundle-984-985`, `bundle-987-988-989`, `bundle-992-993-994`.

### `bundle-1001-1002` — the run that filed the issue

**All three sections are FILLED**:

```
=== bundle-1001-1002 ===
  ## Validation: FILLED (5 lines)
      | classification: chains_green
      | green: true
      | mode: chain-receipt
      |
      | 4 chain(s) green over this tree
  ## Changed Paths: FILLED (21 lines)
      | Files this branch changed outside the run-state and documentation bands:
      |
      | - commands/kaola-workflow-finalize.md
      | ...
  ## Mission List: FILLED (2 lines)
      | items: 9
      | carrying an outcome while their status is not `done`: 0
```

`git log --all --oneline --follow -- kaola-workflow/archive/bundle-1001-1002/finalization-summary.md`
returns exactly one commit — `3380cafe` — and `git log --all --oneline -- kaola-workflow/bundle-1001-1002/finalization-summary.md`
(the pre-archive path) returns nothing. **There is no committed state in which this file was empty.**

### Reconciling the discrepancy

| Figure | Issue says | `b52939f6` committed | `3380cafe` (HEAD) |
|---|---|---|---|
| archived summaries | 157 | **156** | **157** ✓ |
| `## Validation` present | 49 | **48** | **49** ✓ |
| `## Validation` EMPTY | **16** | **15** ✗ | **15** ✗ |
| `## Validation` filled | 33 | 33 ✓ | **34** |

The corpus size and denominator (157 / 49) match **HEAD**, not the stated measurement commit — they
include `bundle-1001-1002` itself. The empty count of **16** matches **neither commit**.

**Inference** (labelled as such — confidence: high; refuted by producing any commit or reflog state
where the empty count is 16): the 16th empty was `bundle-1001-1002`'s own summary, counted in the
transient working-tree state the issue calls **Leg A** — after `finalize` had archived the folder
with the three headings still bare, and before **Leg B** deleted the headings and re-ran finalize.
That state was never committed. The arithmetic is exactly consistent: one run moving empty→filled in
each of the three sections accounts for the whole delta (Validation 16→15, Changed Paths 18→17,
Mission List 4→3), and 16+33 = 49 = 15+34.

**VERDICT: DRIFTED.** The denominators are right at HEAD (157 summaries, 49 with `## Validation`) but
the headline **"16 of 49" is now "15 of 49"**, and 16 was never true at any commit — it was true only
in the uncommitted Leg-A tree. The drift is self-inflicted by the filing run's own recovery. The
issue's own statement that the recovery worked is **confirmed**: `bundle-1001-1002`'s three sections
are all filled at HEAD. Two figures the issue did not state, measured here: `## Changed Paths` is
**17 of 48** empty, and `## Mission List` is **3 of 12** empty.

---

## Claim 5 — The claimed consequence

**Claimed**: for a run whose receipt was stale/red/empty/absent, `## Validation` is the ONLY durable
place the finding survives; #1002 shipped `stale_paths`/`stale_kind` into that exact section.

### Observation — the code that builds the `## Validation` content

`scripts/kaola-workflow-claim.js:3959-3977`, verbatim:

```js
function persistValidationToSummary(projectDir, validation) {
  const v = validation || {};
  const lines = ['classification: ' + (v.classification || 'unknown'),
    'green: ' + (v.green === true)];
  if (v.mode) lines.push('mode: ' + v.mode);
  // #1002: the same culprit diagnostics the `--check` envelope carries, in the finding's own field
  // names, because this copy is the one that outlives the process. Bulleted the way `## Changed
  // Paths` below already bullets a path list. Nothing is written when the finding declined to
  // diagnose: an empty list here would read as "measured, nothing changed".
  if (v.stale_kind) lines.push('stale_kind: ' + v.stale_kind);
  if (v.stale_paths_truncated) lines.push('stale_paths_truncated: true');
  if (v.stale_paths && v.stale_paths.length) {
    lines.push('stale_paths:');
    for (const rel of v.stale_paths) lines.push('- ' + rel);
  }
  for (const d of (v.detail || [])) lines.push('', d);
  if (!v.green && v.operator_hint) lines.push('', v.operator_hint);
  return appendSummarySection(projectDir, '## Validation', lines);
}
```

The `#1002` attribution in the issue is confirmed by the in-code comment at `:3964-3967`, which names
the issue and states the rationale — *"because this copy is the one that outlives the process."*

### Exactly what is discarded when the write is declined

The whole `lines` array is built and then thrown away. Content lost, per line of the function above:

1. `classification: <token>` (`:3961`) — one of `chains_unverified` / `chains_stale` /
   `chains_empty` / `chains_red` / `chains_green` (precedence documented at
   `scripts/kaola-workflow-adaptive-schema.js:1278`).
2. `green: true|false` (`:3962`).
3. `mode: <chain-receipt|final-validation>` (`:3963`).
4. `stale_kind: <code|prose-only|mixed>` (`:3968`) — computed at
   `scripts/kaola-workflow-adaptive-schema.js:1148`.
5. `stale_paths_truncated: true` (`:3969`) — set at `adaptive-schema.js:1150` when the culprit list
   exceeds `STALE_PATHS_LIMIT`.
6. `stale_paths:` followed by one `- <rel>` bullet per culprit (`:3970-3973`) — the list produced at
   `adaptive-schema.js:1145-1149` by `visibleChangedPathsSince(root, project, stampedHead, extra)`.
7. Every `detail` line (`:3974`).
8. The `operator_hint` — but **only when not green** (`:3975`). For `chains_stale` this is the
   kind-aware sentence added by `b52939f6` (`adaptive-schema.js:1178-1190`), e.g.
   *"Chain receipt is stale — only test-consumed prose changed since the chains ran, and that prose
   is inside the code-tree hash, so the receipt is stale all the same…"*

Note the asymmetry this creates: on a **green** run the discarded block is 3-4 lines of low
consequence; on a **not-green** run it is the classification, the culprit paths, the drift kind and
the operator instruction — i.e. the loss grows precisely with the severity of the finding.

### Observation — is `## Validation` really the only durable sink?

Three candidate alternate sinks checked:

1. **The envelope.** `scripts/kaola-workflow-claim.js:5293` — `validation: finalizeValidation` inside
   the `finalizeEmit` object. This is stdout JSON; nothing writes it to disk. The code comment at
   `:5285-5288` states the division explicitly: *"All are durable in the archived
   finalization-summary.md under `## Validation` / `## Changed Paths` / `## Mission List` — the
   envelope copies are for whoever is reading the run right now."*
2. **`## Finalize Findings`** (the `replace: true` section). Its 8 feeder types are all mechanical
   git/archive faults — `claim_release_skipped_offline`, `archive_unstage_failed`,
   `archive_stage_failed`, `archive_commit_probe_failed`, `residue_probe_failed`,
   `residue_unattributed`, `residue_stage_failed`, `finalize_commit_probe_failed`. **The validation
   classification is not among them.** Not an alternate sink.
3. **The archived chain receipt.** 158 of the archived runs carry `.cache/chain-receipt.json`. Its
   top-level keys, read from `bundle-1001-1002`'s copy, are
   `headSha, workTreeHash, codeTreeHash, validationTestConsumes, startedAt, completedAt, source, scope, preamble, chains`
   — it has **no** `classification`, **no** `stale_paths`, **no** `stale_kind`. It preserves the
   *inputs* to the finding (notably `headSha`), never the finding. And because `stale_paths` is a
   diff from that `headSha` to the tree as it stood **at finalize time**, the culprit list is not
   re-derivable later once HEAD has moved.

**VERDICT: HOLDS.** `## Validation` is the only durable sink for the validation finding, the #1002
attribution is confirmed in code by name, and the discarded content is precisely the eight items
listed above. Corroborated beyond what the issue asserted: the two plausible alternate sinks
(`## Finalize Findings`, the archived chain receipt) were checked and neither carries it.

---

## Summary of verdicts

| # | Claim | Verdict |
|---|---|---|
| 1 | The guard declines when the heading exists | **HOLDS** — reproduced by executing shipped bytes; range is `:3940-3958`, guard at `:3947` |
| 2 | Three call sites without `replace` | **HOLDS, enumeration materially incomplete** — 4 callers per copy × 4 copies = **16 call sites**; 12 affected across 4 files, not 3 in 1 |
| 3 | Step 6 template ships the three headings + the prose | **HOLDS** — in **9 live copies** (1 skeleton, 6 tracked generated, 2 untracked additive editions) |
| 4 | 16 of 49 archived `## Validation` sections empty | **DRIFTED** — now **15 of 49** at HEAD; **15 of 48** at `b52939f6` as committed; 16 true only in the uncommitted Leg-A tree. `bundle-1001-1002` is FILLED — recovery confirmed |
| 5 | `## Validation` is the only durable sink; #1002 shipped `stale_paths`/`stale_kind` there | **HOLDS** — confirmed, and strengthened by ruling out two alternate sinks |

No claim was found **FALSE**. The single numeric drift (claim 4) is the filing run's own recovery
changing the corpus it had just measured.

---

## What I could not establish

- **Whether the 16th empty was `bundle-1001-1002`.** No commit or archived artifact preserves the
  Leg-A state; `git log --follow` on the file shows one commit only. My reconstruction rests on
  arithmetic consistency across all three sections plus the issue's own Leg-A narrative. It is an
  inference, not a measurement. It would be refuted by any reachable state showing 16.
- **Whether the guard predates the Step 6 template** (the issue's first Hypothesis). I did not run
  the archaeology — it needs `git log -S` over both `claim.js` and the skeleton's rename history, and
  the issue itself flags it as "Not established". Nothing here confirms or refutes it.
- **Whether the 34 filled `## Validation` sections are exactly the runs that did not pre-create the
  heading** (the issue's second Hypothesis). I measured the empty/filled split but did not, per run,
  determine whether the heading came from the template or from the script's append. Distinguishing
  them needs each run's pre-finalize summary, which is not archived.
- **Whether any test arms this behaviour.** I did not run `simulate-workflow-walkthrough.js` or
  `npm test`, and did not attempt a mutation to see whether a suite catches the declined write. Per
  this repo's standing rule that a green suite is not proof a guard is armed, I am not willing to
  infer either way from the code alone. This is the largest unmeasured item; it was outside the five
  claims and would cost a full walkthrough run.
- **Runtime behaviour of the gitlab/gitea hand-ports.** I proved their
  `appendSummarySection` bodies and call-site shapes are identical to canonical by extraction and
  hashing, but I executed only the canonical bytes. No forge other than github is configured on this
  machine, so an end-to-end finalize on those ports was not available to me.
