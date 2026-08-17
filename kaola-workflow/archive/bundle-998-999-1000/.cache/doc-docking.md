# Documentation docking audit — commit `0d97df5d` (#998 / #999 / #1000)

Read-only audit. No test, suite, chain or npm script was run; every figure below was reproduced with
`git show` / `git ls-tree` / `grep` / read-only `node -e`. `331 assertions` is the one figure that
cannot be reproduced without running the suite, and is treated as such below.

## Checklist

Quoted from `CLAUDE.md:152-153` (the whole documentation obligation the project states):

> On any user-visible change, update: `README.md` · API docs · `CHANGELOG.md` under `[Unreleased]` ·
> architecture docs if structure changed · inline comments where public interfaces changed.

| item | verdict |
|---|---|
| `README.md` | **No update owed.** Its only gap-sweep text is the script-inventory row (`README.md:1023`) describing what the script reconciles; it states no row grammar and no authoring instruction. Nothing in it became false. |
| API docs (`docs/api.md`) | **Deliberately unchanged — defensible.** Verdict and reasoning in *Deliberate non-changes* (2a). |
| `CHANGELOG.md` under `[Unreleased]` | **Docked.** One entry under the existing `### Added` (#998/#1000) and one under the existing `### Fixed` (#999); no new heading added. Every listed figure reproduces — see *CHANGELOG figure re-check* for two precision notes. |
| architecture docs if structure changed | **No structural change; no update owed.** `docs/architecture.md` carries zero matches for `Run gaps`, `gap-sweep`, `run-gap`. No module, seam or artifact was added or moved: the parser is byte-untouched and the change is prose plus one manifest block. |
| inline comments where public interfaces changed | **Docked, and this is the #999 half.** No public interface changed (`parseGapSection` and its three plugin copies are byte-identical to the parent). The one inline-comment change is the #999 deletion at `scripts/test-route-reachability.js:1008`, whose surrounding reasoning is preserved. |

Two further standing rules in `CLAUDE.md` apply and both hold:

- *"Prose changes propagate to generated surfaces … edit the skeleton and regenerate, never a
  rendered surface."* — verified byte-wise: the 11-line block extracted from
  `templates/routing/finalize.skeleton.md:227` is present as an **exact** substring in all 6 tracked
  finalize surfaces (no rendered surface was hand-shaped differently).
- *"Any change touching a prompt surface must state which runtimes it reaches."* — the CHANGELOG entry
  and the commit message both name claude/codex/opencode/kimi × github/gitlab/gitea.

## Changed files reviewed

All 12 files in `0d97df5d` (+167/−2):

- `templates/routing/finalize.skeleton.md` (+11) — the authoring statement, inserted directly after
  the paragraph whose sentence it completes.
- 6 rendered finalize surfaces (+11 each): `commands/kaola-workflow-finalize.md`,
  `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`,
  `plugins/kaola-workflow-gitea/{commands/kaola-workflow-finalize.md,skills/kaola-workflow-finalize/SKILL.md}`,
  `plugins/kaola-workflow-gitlab/{commands/kaola-workflow-finalize.md,skills/kaola-workflow-finalize/SKILL.md}`.
  `git ls-files` shows exactly 6 tracked `kaola-workflow-finalize` surfaces, so the rendered set is
  complete — there is no seventh tracked surface left behind.
- `templates/routing/required-blocks.js` (+18) — the `fn-run-gaps-grammar` block, 4 content tokens.
- `docs/conventions.md` (+4) — the heading rule inside the existing step 2 of § *Run-gap capture at
  finalize (#435)*, immediately under the two row forms it already carried.
- `docs/decisions/0017-the-mission-list.md` (+1) — the declined-widening watch-list row. Row shape
  checked: 3 cells, matching its siblings.
- `scripts/test-route-reachability.js` (+2/−2) — the #999 comment.
- `CHANGELOG.md` (+65) — two entries under existing headings.

## Documents checked

| document | verdict |
|---|---|
| `README.md` | **No impact.** Script-inventory row only (`:1023`); states no grammar. |
| `docs/api.md` | **Deliberately unchanged** — see 2a. Its `## Run-gap sweep` block (`:1420-1431`) documents the CLI contract of `--check`, and remains factually true of the gate. |
| `docs/architecture.md` | **No impact.** Zero gap-sweep / Run-gaps matches; no structure changed. |
| `docs/README.md` | **No impact / out of scope** — see 2b. |
| `docs/workflow-state-contract.md` | **Already docked, correctly, and unchanged.** `:288-302` describes the closure-delta consequence in the shipped parser's terms — "locating a heading is not reading what is under it", "rows carrying no parenthesised sample … a section written as a markdown table all read as present-but-unread", "free-text bullets … keep their measured `0`". It states no row grammar to drift, and it agrees with the new surfaces. |
| `docs/conventions.md` | **Docked** (+4). The heading rule now sits beside the two row forms the surfaces reuse verbatim. |
| `.env.example` | **No impact.** No gap-sweep variable exists; the change adds no configuration. |
| `docs/decisions/D-435-01.md` | **No contradiction; no update owed.** §3 *`## Run gaps` section grammar* (`:82-93`) states the two row forms in the identical spelling the new surfaces ship. It is silent on the heading, and silence is not a contradiction; it is also the historical decision record of a 2026-05-era decision, not a living doc. Its §4 *Vacuous pass* text is superseded by D-653-01 — pre-existing, unrelated to this change. |
| `docs/decisions/D-653-01.md` | **No contradiction; no update owed.** `:128-131` and `:189` state the strict entry grammar as `- <reasonClass> (<sample>): filed:\|noise: ...` and record the by-design free-text tolerance — both consistent with the shipped statement and with `parseGapSection`. |
| `docs/decisions/0017-the-mission-list.md` | **Docked** — the declined widening is recorded as a watch-list row whose trigger is a post-statement improvisation, with the three pre-statement instances named as its reason. Consistent with measurement (all three are long-archived). |
| `CHANGELOG.md` | **Docked**, figures re-checked below. |

## Gaps found

**No documentation gap.** Every document in the assigned set is either docked or legitimately
no-impact, no doc contradicts the shipped surfaces, and no live copy of the T14 imprecision exists
outside the immutable archive. Three precision notes follow; none is a missing doc.

1. **`CHANGELOG.md:46-47` — "so the human doc and the runtime surface cannot drift" names no
   mechanism.** Two sub-points, both measured:
   - Nothing binds `docs/conventions.md` to the skeleton. The only suites that read
     `conventions.md` do so in a *comment pointer* (`validate-workflow-contracts.js:916`,
     `validate-kaola-workflow-contracts.js:685`, `test-opencode-edition.js:615`) for the provenance
     ban; no guard reads it for these tokens. `fn-run-gaps-grammar` pins the 12 runtime surfaces
     against the skeleton and stops there, so a future skeleton edit can diverge from
     `conventions.md` silently. The sentence is true of the present state and false as a mechanism
     claim.
   - "in the same words" is exact for the two row forms (verbatim reuse, confirmed) but partial for
     the heading rule: the skeleton writes "Write the heading exactly `## Run gaps`, with nothing
     else on the line"; `conventions.md:521` writes "The heading itself must read exactly
     `## Run gaps`, with nothing else on the line." The two load-bearing clauses match; the lead-in
     and the consequence clause differ.
   The CHANGELOG entry is on the branch and not yet in a release, so this is amendable; it is a
   values call for the orchestrator, and it does not block. The nearest true wording is "…in the
   same words, so the two do not now disagree."
2. **A wording tension one screen below the new statement, not a contradiction.** The pre-existing
   sentence at `templates/routing/finalize.skeleton.md:270` (and `commands/…:246`, ×12 as rendered)
   ends "…never the `## Run gaps` row, **whose grammar the scanner owns**." Its subject is where the
   post-filing record goes, and "owns" is true of the code — `scripts/kaola-workflow-claim.js:29`
   makes the same single-owner claim about the regex, and the parser is still the only
   implementation. It is not a claim that the grammar is undocumented, and after this change the
   reader has the grammar stated ~40 lines above it. Reported for completeness; changing it would
   cost a 12-surface regeneration for no correctness gain.
3. **Nothing else authors the section.** A tracked-tree sweep for `## Run gaps` outside
   `scripts/`, `CHANGELOG.md` and the archive returns only the 6 finalize surfaces, the skeleton,
   `README.md:1023`, `docs/api.md:1429`, `docs/conventions.md`, and the three decision records. No
   `agents/` surface, no other skeleton, and no script-written summary template authors a gap row —
   so the authoring surface set the change updated is the complete one.

## Deliberate non-changes

### 2a — `docs/api.md:1420-1431` left with the tail-only phrasing: **defensible, not a docking gap**

Verdict: **defensible.** Reasoning, in the order that decided it:

- **The sentence is true of what it documents.** `docs/api.md`'s § *Run-gap sweep* is the CLI
  reference for `kaola-workflow-gap-sweep.js` — usage line, two modes, typed refusals. "The gate
  (`--check`) verifies every swept gap is mapped in `finalization-summary.md` `## Run gaps`, one line
  each, either `filed: #N` or `noise: <justification>`" is an accurate, if incomplete, description of
  the gate's obligation. The defect #998/#1000 fixed was different in kind: the finalize surface's
  sentence was an **instruction to write**, and every literal completion of it parsed to zero rows.
  An incomplete description of a checker misleads nobody into producing an artifact; an incomplete
  instruction does. Same words, different speech act.
- **The stated reason — a third restatement invites N-way drift — holds and is already load-bearing
  here.** The grammar is now stated in prose in `conventions.md`, D-435-01 §3, D-653-01 §D.1, and 12
  runtime surfaces. Only the last group is machine-pinned. Adding a fourth prose home with no guard
  is exactly the (N+1)-way shape this project has recorded as a failure class.
- **What would still be cheap, and is not a restatement:** a pointer clause in `docs/api.md` ("row
  grammar: see `docs/conventions.md` § *Run-gap capture at finalize*"). That adds no fourth wording
  and would catch the one reader this audit can construct — someone debugging a `gaps_unswept`
  refusal from the API reference rather than from the finalize surface. I am not calling its absence
  a gap: the sentence is not false, the authoring path does not run through `api.md`, and the
  orchestrator explicitly weighed this. Optional, non-blocking.

### 2b — `docs/README.md` indexes no gap-sweep section: **out of scope for this change**

`docs/README.md` is an index of **documents**, one line per file (`- [Conventions](conventions.md) —
coding, testing, Git, and review rules.`), not an index of sections. There is no gap-sweep document
to index; the material lives inside `conventions.md`, which is already indexed, and inside ADR 0017,
also indexed. This change added no document. Wanting a section-level index is a separate,
pre-existing preference about `docs/README.md`'s granularity — it neither arose from this change nor
became false because of it.

## CHANGELOG figure re-check

Method: figures reproduced at three revisions — `d63fe703` (the run's base, before the predecessor
archive landed), `ecebd5a5` (parent), `0d97df5d` (the commit).

| figure | verdict |
|---|---|
| **12 obligated surfaces** | **Reproduces.** `deriveObligated` for `topic:finalize, runtime_tag:'both', surface_type_tag:'both'` yields `command`: 3 claude routing editions + 2 additive runtimes × 3 forges = 9, plus `skill`: 3 codex editions = **12**. `MANIFEST_EDITIONS` (`test-route-reachability.js:724-739`) read statically; not executed. |
| **"6 tracked finalize surfaces"** | **Reproduces exactly.** `git ls-files \| grep kaola-workflow-finalize` = 6, and all 6 changed in this commit. The other 6 obligated surfaces live in the gitignored `.opencode`/`.kimi` trees (absent from this worktree) and are supplied to the checker from an in-memory render (`readSurface` at `:975-978`), so the 12-surface obligation is checked without those trees on disk. |
| **20 blocks / 11 content-led / 9 marker-led** | **Reproduces.** `REQUIRED_BLOCKS.length === 20`; classified with the harness's own predicate `/^<!--\s*(?:PIN\|CARD):/` on `content_tokens[0]`: 11 content-led, 9 marker-led. `fn-run-gaps-grammar` is content-led with 4 tokens, `runtime_tag:'both'`, `surface_type_tag:'both'`. |
| **#999: "10 content-led of 19 blocks, 9 marker-led"** (the measurement the deleted comment got wrong) | **Reproduces at the parent.** At `ecebd5a5`: 19 blocks, 10 content-led, 9 marker-led. The deleted comment said "9 of the 30" — numerator and denominator both wrong, denominator off by **11**, as stated. |
| **"its only `(N of the M …)` parenthetical, no siblings to correct"** | **Reproduces.** At `ecebd5a5`, `scripts/test-route-reachability.js` has exactly one such figure (`:1008`); at `0d97df5d`, zero. |
| **`127` standalone + 1 parenthetical = "1 of 128 such headings in the archive"** | **Reproduces at the run's base, `d63fe703`**: over `kaola-workflow/archive/*/finalization-summary.md` excluding the 5 `.archived-*` sibling summaries — 154 files — there are **128** `## Run gaps` headings, **127** standalone and **1** parenthetical (`archive/bundle-625-626`). Two precision notes: (i) at the commit itself the corpus is **129** headings (128 + 1), because `ecebd5a5` archived `bundle-995-996-997` and its summary adds one standalone heading — so the shipped figure is one heading stale against the tree it ships in; (ii) counting all 160 tracked summaries including the `.archived-*` siblings gives **133** (132 + 1). The rate claim is unaffected at any of the three denominators. |
| **"2 sections in 154"** | **Numerator reproduces exactly**; denominator reproduces with a corpus caveat. The only two table-shaped `## Run gaps` sections in the entire tracked archive are `archive/issue-725/finalization-summary.md` and `archive/issue-725.archived-2026-07-19T17-20-09-384Z/finalization-summary.md` — measured by scanning each located section for a `\|`-leading line. `154` is the summary-file count at `d63fe703` **excluding** the 5 `.archived-*` siblings (155 at the commit). One of the two numerator files is a sibling that denominator excludes, so the pair mixes corpora by one file; the same-corpus figures are 2 of 159 at `d63fe703` and 2 of 160 at the commit. |
| **7 `filed: #N` cells in `archive/issue-725/finalization-summary.md`** (and 1 in the sibling) | **Reproduces exactly.** 7 `filed: #\d+` occurrences inside the located section, all in table cells (#735, #734, #719, #720, #722, #724, #736); the `.archived-2026-07-19T17-20-09-384Z` sibling carries **1** (#737), the `.archived-2026-07-20T01-46-03-111Z` sibling 0. |
| **"assertion count unchanged at 331"** | **Not reproducible read-only** — measuring it means running the suite, which this audit is forbidden to do. Two independent supports, both static: (i) the only per-block iterations in `test-route-reachability.js` accumulate and then assert **once** — `checkManifest` pushes into `failures` and the caller asserts at `:981-983` (the per-message loop runs only when failures exist), and the non-vacuity floor at `:1012-1030` collects `violations` and asserts at `:1030`; the other three `REQUIRED_BLOCKS` uses are `.find`/pass-through. So a 20th block adds **0** assertions to a passing run. (ii) A previously shipped CHANGELOG entry (`CHANGELOG.md:1174`) independently measured "the plain total is indeed 331". |
| *(bonus, verified while checking the above)* **"two targeted searches … return nothing"** | **Reproduces.** At `ecebd5a5`, `templates/ commands/ plugins/ docs/ README.md scripts/` carry **zero** matches for `nothing else on the line` / `heading carrying a qualifier` / `exactly \`## Run gaps\``; the row-head form `<reasonClass> (<sample>)` appears only in `conventions.md`, D-435-01, D-653-01 and the four parser comments — **no prompt surface**. The heading rule was stated nowhere at all. |
| *(bonus)* **"the parser is byte-untouched"** | **Reproduces.** `scripts/kaola-workflow-gap-sweep.js` and all three plugin copies are absent from the diff; the shipped `/^## Run gaps\s*$/` at `:270` matches the newly-stated heading rule, and the `unaccountedFiled` bookkeeping at `:279-283`/`:299` matches the CHANGELOG's claim that a malformed *bullet*'s ref is recorded as unaccounted while `- manual:foo: noise: …` leaves no trace. |

## T14/T20 live copies

The imprecise claim — *`test-finalize-door.js` T14 is the free-text-bullet silence pin* — has **no
live copy**. Searched `docs/`, `scripts/`, `templates/`, `commands/`, `plugins/`, `README.md` for
`T14`, `free-text bullet`, `free-text-bullet`.

Live (mutable) tree — all correct, none to fix:

- `scripts/test-gap-sweep.js:752-757` (comment) and `:788` (assertion) — T20 holds the silence:
  `assert((r20.stderr || '').indexOf('- none') === -1, 'T20: "- none" must NOT warn …')`.
- `scripts/test-finalize-door.js:2687-2700` (comment) and `:2736` — T14 is labelled "(#993/#994) —
  THE DEGRADATION PAIR"; its `freetext` leg at `:2819` asserts the **stamp** consequence.
- `docs/decisions/0017-the-mission-list.md:155` — the new watch-list row states the correction
  exactly as measured.
- Other `T14` hits in `docs/` (D-627-01, D-636-01, D-632-01, `docs/investigations/2026-07-08-…`)
  are unrelated T14s in other suites.

Archived (immutable) copies — reported, **not** to be rewritten:

- `kaola-workflow/archive/bundle-995-996-997/mission-list.md:56` — the origin copy in the tree: "the
  deliberate free-text-bullet silence (`:267-281`, pinned by `test-finalize-door.js` T14's
  `freetext` leg asserting `follow_ups_filed: '0'`)". Half-right and thereby misleading: the leg it
  names does assert the stamp, and calling that the silence pin is the imprecision #1000 inherited.
- `kaola-workflow/archive/bundle-992-993-994/.cache/followup-malformed-gap-rows.md:55` — "nor the
  free-text-bullet behaviour pinned by T14"; this is the `.cache` body that became issue #1000.

`CHANGELOG.md` carries no copy of the imprecise claim (checked; its T14 mentions at `:3520-3521` are
the unrelated #627/#636 routing pins). Issue #1000's body on the forge is outside this worktree and
outside this audit's read scope.

## Verdict: DOCKED
