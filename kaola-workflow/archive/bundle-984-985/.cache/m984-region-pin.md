# m984 — region + pin (ADR 0018 §5 item 9 / §8 step 3)

## Task A — measured, before building

**Finding: for the general `<!-- PIN: X -->` mechanism, the universe is LISTED, not derived from
shipped bytes.** There are two *distinct* presence-checking mechanisms inside
`scripts/test-route-reachability.js`, and `consent-in-conversation` (the pin the brief pointed at as
precedent) uses the **listed** one, not the byte-derived one:

1. **T19b (`codex-dispatch-model-routing` roster only).** This ONE pin's surface universe really is
   derived from shipped bytes: `GENERATED_SURFACES.filter(s => content.includes(CODEX_MODEL_ROUTING_MARKER))`
   (test-route-reachability.js:548-550). No registry entry names this pin anywhere; the check just
   greps every generated surface for the literal marker string. This is narrow and purpose-built
   (Codex per-spawn model routing only) — it is not the general pin mechanism.

2. **The MANIFEST (`templates/routing/required-blocks.js` + `checkManifest` in
   `test-route-reachability.js`).** This is what actually owns `consent-in-conversation`,
   `closure-audit`, `sink-reports-orchestrator-owns`, etc. — and it is **hand-listed**: each pin is a
   `{ block_id, topic, runtime_tag, surface_type_tag, content_tokens }` entry a person adds to the
   `REQUIRED_BLOCKS` array. What *is* derived (never hand-typed) is the **file set** a given block
   obligates (`deriveObligated()`, from `topic` + `runtime_tag` + `surface_type_tag` against the
   edition tables) — not the existence of the pin itself. A **reverse orphan-sentinel** then scans
   every in-scope surface for any `<!-- PIN: ... -->` / `<!-- CARD: ... -->` marker and requires it to
   map back to a listed block (unless it's in `FOREIGN_MARKERS`, reserved for pins owned by a
   *different* test elsewhere, which does not apply here).

**Consequence, confirmed by running the suite (not just reasoning about it):** adding
`<!-- PIN: forge-is-the-backlog -->` to the skeletons and regenerating turns
`node scripts/test-route-reachability.js` from 331 passing / 0 failing to **330 passing / 73
failing** — 72 `orphan-surface` failures (one per marker occurrence × obligated tree) plus the
`MANIFEST: ... clean over N obligated file-checks` roll-up. Reproduced and captured in
`/tmp/trr.log` during this task; sample:

```
FAIL: MANIFEST orphan-surface: marker "<!-- PIN: forge-is-the-backlog -->" on commands/kaola-workflow-finalize.md has no manifest block
Route-reachability test FAILED: 73 failure(s), 330 passed.
```

**So: it is listed, and a new pin requires a test-authored edit.** What a new pin owes:
1. One (or more) entries in `REQUIRED_BLOCKS` (`templates/routing/required-blocks.js`) per topic that
   carries it — `block_id`, `topic: 'next'|'init'|'finalize'`, `runtime_tag: 'both'`,
   `surface_type_tag: 'both'`, and `content_tokens` starting with
   `<!-- PIN: forge-is-the-backlog -->` plus at least one token that is **not a substring of the
   marker itself** (the file's own NON-VACUITY FLOOR, test-route-reachability.js:977-1024, reds a
   marker-only/substring-only block).
2. Until that lands, `test-route-reachability.js` — and therefore `npm test` /
   `test:kaola-workflow:claude` (it's in that chain) — is red on this branch.

Per the brief and this repo's test-custody rule (`tdd-guide` holds the test artifact;
`required-blocks.js` is that artifact's assertion data, not production prose), **I did not touch
`templates/routing/required-blocks.js`.** I stop at reporting this; it is not one of the four gates I
was asked to run, and I did not run `npm test` / the full chain as a gate for that reason — I only
confirmed the specific, predictable consequence above so the finding is evidence, not a guess.

## Task B — the pin

Added `<!-- PIN: forge-is-the-backlog -->` … `<!-- /PIN -->` around the backlog rule, wherever it is
currently stated, across all three skeletons. Per-surface wording differs, matching the existing
`consent-in-conversation` precedent:

- **`next.skeleton.md`** — two spans (the rule is stated in two non-contiguous places):
  - Step 1's `**The user named neither**` bullet (the "read the backlog and rank it" arm) — 4 lines.
  - Step 2's shortlist-read paragraph (`Before claiming, read each shortlisted candidate's own body
    and comments...`) — the paragraph the brief flagged as landing in Step 2 this run. 3 lines.
- **`init.skeleton.md`** — three spans inside the injected `## Kaola-Workflow` block (see judgment
  call below for why three, not one).
- **`finalize.skeleton.md`** — one span, around Step 7's `For each real run-discovered defect, file a
  follow-up and record filed: #N...` paragraph.

**Judgment call flagged, not silently made:** the ADR (§5 item 9) describes finalize's statement of
the rule as *"tag what you file, **comment what you corrected**"*. I searched `finalize.skeleton.md`
for any existing text about posting a run's corrections back to the forge as issue comments and found
**none** — only the "tag what you file" half (`filed: #N`) currently exists. The brief's own framing
("wrap ... **wherever it is stated**") reads as *find and protect existing text*, not *author new
rule content* — and P-tier tagging itself (§5 item 2 / §8 step 2, which "tag what you file" will
eventually depend on) is explicitly out of my scope this run (owned by the concurrent agent on
`claim.js`/`slots.js`). So I pinned what exists and am reporting the gap rather than inventing
"comment what you corrected" prose under this brief. **This is a real content gap against the ADR's
target description, left for whoever lands §5 item 8.**

**Judgment call on `init.skeleton.md`'s span count:** the injected `## Kaola-Workflow` block mixes
roadmap/backlog facts with unrelated run-record facts (active-folder location, resume-rule, worktree
path) in one bullet list, non-contiguously. Rather than invent a debatable exact split, or bundle
everything (including run-record facts the ADR explicitly calls a *different, untouched* source —
"What this run owns" vs. "What the work is"), I used three pin spans around the clearly
roadmap/backlog-specific bullets: (1) the source-of-truth splice line +
`ROADMAP.md is generated...` + `workflow_project` naming + `Do not purge...` (contiguous, 4 lines);
(2) `Roadmap/research sessions create or refine issues...` (1 line); (3) `Top-priority labels:
declare in kaola-workflow/config.json...` (1 line). This is close to, not exactly, the ADR's own
"roughly five roadmap rules" language (ADR's own hedge — "roughly").

## Task C — the region

**Marker chosen:** `<!-- KW-CLAUDE-MANAGED-START -->` … `<!-- KW-CLAUDE-MANAGED-END -->`, wrapping the
whole `## Kaola-Workflow` heading + its bullet list inside the `<!-- KW-CLAUDE-TEMPLATE-START/END -->`
fenced block in `init.skeleton.md`. Named distinctly from `PIN` (cross-surface obligation) and from
the skeleton's own authoring-side `REGION:` directive (which is intercepted and stripped by
`generate-routing-surfaces.js`'s renderer — using that keyword here would have been silently consumed
at render time, exactly the trap the brief warned about) so the two mechanisms in this build can never
be confused with each other or with the render-time DSL.

A one-line prose statement sits just inside `KW-CLAUDE-MANAGED-START`, in the injected content itself
(not a hidden comment), stating the ownership boundary the brief asked for:

> Everything between this marker and its matching END below is owned by `workflow-init`: a later run
> may replace it in full. Nothing outside the two markers is touched — that content, wherever you have
> added or changed it in this file, is yours.

**Evidence the marker survives rendering (verified, not assumed):**

```
$ sed -n '/KW-CLAUDE-TEMPLATE-START/,/KW-CLAUDE-TEMPLATE-END/p' commands/workflow-init.md \
    | grep -n 'KW-CLAUDE-MANAGED\|markdown$\|^```$'
2:```markdown
47:<!-- KW-CLAUDE-MANAGED-START -->
88:<!-- KW-CLAUDE-MANAGED-END -->
114:```
```

The markers sit *inside* the fenced ```` ```markdown ```` block that is the literal content
`workflow-init` writes into a consumer's `CLAUDE.md` — not in the surrounding SKILL/command
instructions, which is where `<!-- SPLICE:in-shared-001 -->` lives and which, per the brief, is
authoring-side and never reaches a consumer file. Confirmed present (`grep -l`) on all 6 tracked
generated init surfaces (`commands/workflow-init.md`, both plugin forges' `commands/workflow-init.md`,
and all three `.../skills/kaola-workflow-init/SKILL.md`). I did **not** migrate any consumer
`CLAUDE.md` (e.g. VRPCadCore's) — confirmed by reading it that it still carries **no** `PIN`/region
marker at all (`grep -n "PIN\|REGION\|<!--"` returned nothing), matching the ADR's own claim, and left
untouched per the brief ("tool-side only").

## Files changed (by me)

| file | insertions |
|---|---|
| `templates/routing/init.skeleton.md` | +12 |
| `templates/routing/next.skeleton.md` | +17 |
| `templates/routing/finalize.skeleton.md` | +2 |
| 18 regenerated surfaces (`commands/*.md` ×3 topics ×3 forges, `plugins/*/skills/*/SKILL.md` ×3 topics ×3 forges) | mechanical mirror of the above, via `--write` |

No hand-edits to any generated surface; all 18 came from `--write`. Nothing under `.roadmap` or
`roadmap.js` touched. `templates/routing/slots.js` and `scripts/kaola-workflow-claim.js` (all three
copies) were **not** touched by me — they show as modified in `git status` because another agent is
concurrently editing them in this shared worktree (confirmed below).

## Gates — each exit code, run separately

```
$ node scripts/generate-routing-surfaces.js --write
generate-routing-surfaces --write: rendered 18 surfaces.
EXIT: 0

$ node scripts/generate-routing-surfaces.js --check
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
EXIT: 0
(surface count: 18)

$ node scripts/validate-workflow-contracts.js
Workflow contract validation passed
EXIT: 0

$ node scripts/validate-kaola-workflow-contracts.js
Kaola-Workflow Codex contract validation passed
EXIT: 0
```

**One transient red observed and re-verified, not caused by me:** an earlier run of
`validate-kaola-workflow-contracts.js` failed with `plugins/kaola-workflow/scripts/kaola-workflow-claim.js
must match scripts/kaola-workflow-claim.js`. `diff` on the two files at that moment showed **no
difference** — i.e. the failure was a snapshot of the other agent's concurrent in-progress edit to
`claim.js` (a file I was told not to touch and did not touch), not a real drift. Re-running the
validator immediately after passed clean (`EXIT: 0`, shown above). Did not commit, per instruction.

## Where this leaves things — owed follow-ups, not built here

- `templates/routing/required-blocks.js` needs `forge-is-the-backlog` manifest block(s) (one per
  topic that carries the pin) before `test-route-reachability.js` is green again on this branch. Test
  custody — I flagged it, did not author it.
- `finalize.skeleton.md` is missing the "comment what you corrected" half of the rule the ADR
  describes for that surface; only "tag what you file" exists today. Flagged above, not invented.

## What in the brief turned out to be wrong or needed a judgment call

- Nothing in the brief was factually wrong. Two things needed a judgment call I'm flagging rather than
  silently resolving: (1) `finalize.skeleton.md`'s "comment what you corrected" text does not exist
  yet — see Task B; (2) the exact bullet-level boundary of "the backlog rule" inside
  `init.skeleton.md`'s mixed bullet list is not textually self-evident — see Task B's three-span
  decision and rationale.
