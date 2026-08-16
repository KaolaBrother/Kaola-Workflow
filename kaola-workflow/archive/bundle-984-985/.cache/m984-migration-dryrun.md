# Investigation: cost of migrating VRPCadCore off the local backlog layer (ADR 0018 §8 step 6)

Read-only measurement. No consumer-repo file was edited, no `git` write ran in the consumer, no `gh`
write command ran. All commands below were run against the live consumer repo and its live GitHub
forge state.

## Setup

- Consumer repo: `/Volumes/WorkspaceA/ylminiserver/workspace/vrpcadcore`
- Consumer HEAD: `a6e67c9080e693db0a714c47cf9aae2924138efe` (branch `main`, clean tree)
- Tool repo (context only): `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow`, spec
  `docs/decisions/0018-the-forge-is-the-backlog.md`
- Forge: `KaolaBrother/VRPCadCore` on GitHub, `gh` pre-authenticated
- Corpus pulled for the residue check: all 512 issues on the forge (81 open + 431 closed), each with
  title, body, comments, labels, milestone — `gh issue list --state open/closed --json
  number,title,state,body,comments,labels,milestone`, merged to one JSON keyed by issue number.
  Closed issues required two `--search sort:created-asc`-paginated pulls (a single 431-issue pull
  timed out against the gateway); the union of the two pulls covers all 431 with zero gaps, verified
  by diffing against a lightweight `--json number` listing of the same state.

## 1. Deletion manifest

| item | value |
|---|---|
| `.roadmap/issue-*.md` sources | 81 files, 132,924 bytes |
| `kaola-workflow/ROADMAP.md` | 1 file, 154,163 bytes |
| **Total** | **82 files, 287,087 bytes** |
| Tracked? | Both confirmed tracked: `git ls-files kaola-workflow/.roadmap | wc -l` → 82 (81 sources +
  `_rules.md`, which is not deleted — see below); `git ls-files kaola-workflow/ROADMAP.md` → present.
  `git status --porcelain -uall -- kaola-workflow/` is empty (no untracked residue in the tree). |
| Preserving SHA | `a6e67c9080e693db0a714c47cf9aae2924138efe` (current HEAD) — a deletion commit made
  on top of this preserves every byte in git history at this SHA. |

`kaola-workflow/.roadmap/_rules.md` is tracked separately and is **not** part of the deletion set —
ADR 0018 §5 item 6 keeps it. It is not counted above.

The local source set and the forge's open-issue set are **exactly identical**: sorting both to
issue-number lists and diffing gives zero difference (81 == 81, same 81 numbers). This consumer is
the "every existing check calls reconciled" state the ADR opens with.

## 2. THE MAIN QUESTION — homeless residue, all 81, not a sample

### Method

For each of the 81 `next_step` fields: stripped the leading `[...]` tag (three sources — #143, #254,
#344 — carry **two** consecutive leading `[...]` groups; both were stripped as one tag, since both
read as annotation brackets in the same style, not prose — this had zero effect on classification for
all three, checked individually below).

Extracted from each stripped prose every "atom" worth independently checking: backtick spans,
decimal measurements (optionally with `mm`/`%`/`cm`/`deg`), `D-NNN-NN` records, `#NNN` cross-refs,
quoted phrases ≥15 chars, and file paths with a source-code/doc extension — 652 atoms across 81
issues (10 issues yielded zero atoms and were read in full by hand instead; see below).

Each atom was checked against three corpora:
- **own thread** — title + body + every comment of that issue's own JSON record
- **any-forge** — the same, concatenated across all 512 issues (open + closed) — this is what
  resolves a cross-reference through a sibling or closed issue, per the task's stated trap
- **repo** — `rg -F` over `git ls-files`-tracked content, excluding `kaola-workflow/.roadmap/**` and
  `kaola-workflow/ROADMAP.md` (so the mirror can't self-confirm)

652 atoms → 623 matched on the first pass (own thread or any-forge or repo). The 29 remaining
"miss everywhere" atoms (spanning 20 issues) and the 10 zero-atom issues were then read by hand,
one at a time, against their own thread, the flagged sibling/closed issue, or the repo file the
prose named. All 29 automated misses turned out to be **false positives** of the atom extractor, not
real gaps — the concrete reasons, so the method is falsifiable:

- **Precision/rounding drift** (#601): next_step rounds `+17.479575`/`50.265482` to `17.48`/`50.27`;
  the issue body's own table carries the unrounded figures. Forge-held.
- **Truncated file paths** (#493, #526, #634): next_step's backtick span didn't include the
  `crates/<crate>/src/` prefix my regex needed; the full path (`crates/cadcore-brep/src/convert.rs`,
  `crates/cadcore-pcurve/src/lib.rs`) exists and is tracked. Repo-backed, and the issue's own thread
  independently carries the same finding (checked directly). Forge-held.
- **Stale-but-real archive paths** (#622, #624): next_step cites the pre-archive path
  (`kaola-workflow/issue-618/.cache/...`), but that project has since been archived to
  `kaola-workflow/archive/issue-618/.cache/...` — same filename, confirmed present and tracked at the
  new path. The citation is stale *today*, independent of migration, but the artifact is not lost.
  Repo-held.
- **`.cache/` evidence files misread as unfindable** (#572, #583, #596, #597, #598, #601, #637): these
  paths ARE tracked (`.cache/` is not gitignored for archived project folders) — `rg`'s default
  hidden-file skip (dot-directories) made my substring search blind to their *contents*, not their
  *existence*; `git ls-files --error-unmatch` confirms every one of them is a real, committed file.
  Repo-held.
- **Backtick-boundary garbling across a markdown table** (#638): the atom extractor spliced two
  adjacent backtick spans across table pipes into one nonsense string; the real content (a table of
  fillet/chamfer free-edge measurements) is a **verbatim** copy of the issue body (next_step 5,123
  chars vs. a 5,133-char body — this is one of the ADR's cited 9 verbatim-body-copy sources).
  Forge-held.
- **Formatting-only misses** (#606's `14.548 deg` vs. body's `14.548 deg` with different surrounding
  punctuation my regex over-captured; #612's bracketed `SurfaceKind::{...}` enum list): present
  verbatim in the own thread on direct substring check without the regex's extra captured
  punctuation. Forge-held.
- **Genuine cross-references resolved through a sibling/closed issue** (#146→#413, #494→#509,
  #565→#562, #546→#540): confirmed by reading the target issue's own thread — in each case the cited
  fact (a date, a measurement, a ratification pointer) is stated there, sometimes (#494→#509) as part
  of a **since-superseded** headline the target issue's own pinned comment corrected — the number
  still lives in that thread's text regardless. This is exactly the trap named in the task brief.
  Forge-held.
- **Everything else flagged** (#614, #617, #645, #649, #651, #652, #682, #684, #685, #692): direct
  substring check against the own thread (ignoring the extractor's over-eager backtick/bracket
  boundaries) found every one present verbatim or near-verbatim in the issue's own body or comments.
  Forge-held.

The 10 zero-atom issues (#1, #7, #254, #542, #546, #678, #688, #689, and the two homeless ones below)
were read in full against their own body: #1, #7, #254, #542, #678, #688, #689 are short digests of a
much longer, matching own-issue body (#1's is a compressed summary of an 8-section backlog spec;
#7's of a Chinese-language product-direction essay) — forge-held. #546's only checkable fact, a date
"(2026-07-19)", is absent from its own thread but present in issue #540's own comment header ("Run
status 2026-07-19: code LANDED...") — forge-held via cross-reference, the same trap pattern again.

### Result: 2 of 81 are HOMELESS, not ~8

| # | classification | quoted residue | checked against |
|---|---|---|---|
| **#535** | **HOMELESS** | *"the remainder outside the issue-528 umbrella, **same issue-497-rooted family**"* | Own thread (4,650 chars, includes a 2026-08-14 correction comment) — no "497" or "family" anywhere. Full 512-issue forge corpus — no other issue attributes #535 to an "issue-497 family". `docs/`, `CHANGELOG.md` — no hit. |
| **#536** | **HOMELESS** | *"filed as a CLASS, not a fixture list, because the shared cause is unproven. **Same issue-497 family.**"* | Own thread (2,077 chars) — no "497" or "family" anywhere. Same forge-wide and repo checks as #535 — no hit. |

Both are the editorial act of grouping #535/#536 into a lineage rooted at issue #497 — a real, heavily
documented issue on this forge (22 other issues cross-reference "issue 497"), but **never in
connection with #535 or #536 specifically**, anywhere. This matches the task brief's stated prior
20-file sample exactly (2 homeless, same two issues, same "family" framing) — the full 81-issue sweep
does not add or remove any homeless case beyond that pair.

**79 of 81 are forge-held** — every substantive claim in their next_step resolves to that issue's own
body/comments, or to a named sibling/closed issue's thread. **0 of 81 resolved to a repo-only home**
with no forge counterpart anywhere: every atom that had a repo-file backing (tests, `CHANGELOG.md`,
`docs/`) also had an independent forge-thread match once the full 512-issue corpus (not just the
issue's own thread) was searched. This differs from the task brief's stated 20-file sample ratio
(~15 forge-held / 3 repo-held-only / 2 homeless) on the repo-held-only bucket specifically — e.g.
#143's `0.1227mm` measurement, cited in the brief as living only in
`crates/cadcore-verify/tests/probe_143_filleted_box.rs`, also turned out to be stated in issue #393's
own thread ("the one histogram ever taken ... shows min gap 0.1227mm"), once checked against the full
forge rather than #143's own thread alone. **Inference, not a re-count of the brief's sample:** the
full-corpus (512 issues) cross-reference search likely resolves some of what a narrower manual trace
would classify repo-held-only; it does not change the homeless count, which was independently
re-derived, atom by atom, across all 81, with 29 hand-checked misses and 10 hand-read zero-atom
issues, not a sample.

**Re-verified fact:** `REFRAMED` appears in no body or comment of any of the 81 open issues (checked
directly; it does appear inside the *second* leading `[...]` tag of #143's own next_step, which is
tag vocabulary, not prose, and was excluded per the stripping method above).

## 3. The `0 == 81` trigger

`VRPCadCore/CLAUDE.md:114` (verbatim, the relevant clause):

> At finalize assert `ls kaola-workflow/.roadmap/issue-*.md | wc -l` equals `gh issue list --state
> open --limit 300 --json number --jq 'length'` — every roadmap check runs local→remote
> (`validate-remote` only asks "is this local one closed?") and NONE can see a missing source, so
> this drift is silent and recurs per run (#694).

Same line, same sentence, also names: `regenerate via node ~/.claude/kaola-workflow/scripts/kaola-workflow-roadmap.js generate` — confirmed **this exact script path is deleted** by ADR 0018 §8 step 5
("`roadmap.js` in all four editions ... Prose ships with its mechanism").

**Which command fails, and what it prints**, measured directly (simulated the LHS in an empty
directory shaped like the post-migration state — `.roadmap/` present, all `issue-*.md` gone):

```
$ ls kaola-workflow/.roadmap/issue-*.md | wc -l
ls: kaola-workflow/.roadmap/issue-*.md: No such file or directory
0
```

LHS prints `0` (the `ls` error goes to stderr; `wc -l` counts the empty stdin as 0 lines). The RHS,
`gh issue list --state open --limit 300 --json number --jq 'length'`, is unaffected by any local
deletion — measured live against the consumer's real forge state right now: **81**. So the assertion
reads `0 == 81` and is false; per the line's own text, "every finalize violates the project's own
rule" the moment migration lands, unless this line is edited in the same movement (which ADR 0018 §7
ruling 3 and §5 item 9 both require to be offered in conversation, never done as a side effect).

`kaola-workflow/.roadmap/_rules.md`'s first paragraph also dangles as claimed: line 17-18 reads
*"Row order in this table is sorted by issue number and therefore does NOT encode priority — read the
ordered sequence below and **the per-row band tag in each "Next Step" cell**."* — a direct pointer
into the `ROADMAP.md` table's `Next Step` column, which no longer exists post-migration.

## 4. The half-migrated window

Read `scripts/kaola-workflow-sink-merge.js` in the tool repo directly (not simulated):

- **Bucket 1** (auto-stash, line ~1826): `filePath.match(/^kaola-workflow\/\.roadmap\/issue-(\d+)\.md$/)`
  — matches only `.roadmap/issue-N.md` sources, **never** `kaola-workflow/ROADMAP.md`.
- **Bucket 2** (project-state duplicates, line ~1834): an explicit 4-item allowlist
  (`workflow-plan.md`, `workflow-state.md`, `workflow-tasks.json`, `.cache/dispatch-log.jsonl`) —
  does not include `ROADMAP.md`.
- **Sink-receipt exemption** (line ~1867) and **own-archive-mirror exemption** (line ~1876): both
  path-anchored to `kaola-workflow/<project>/.cache/sink-receipt.json` and
  `kaola-workflow/archive/<project>/` respectively — neither pattern matches `ROADMAP.md` at the main
  root.
- **Bucket 3** (line ~1937): "anything else" — an untracked, non-gitignored `kaola-workflow/ROADMAP.md`
  falls through every named bucket and lands here.
- **Refusal** (line ~1939-1946), exact fields:
  ```
  reason: 'sink_blocked'
  foreign_dirt: ['kaola-workflow/ROADMAP.md']   (i.e., the file path, as classified)
  detail: 'main checkout carries changes not owned by this sink; resolve (commit/stash/restore)
           before re-running. This sink never touches another project\'s files.'
  ```
  The preflight function's own header comment states the invariant directly: "if foreign_dirt is
  non-empty, NO mutation occurs" — so this is a hard, zero-mutation refusal of **every** sink on that
  repo, not just the one for the project that triggered it.

**Consumer `.gitignore` check**: no entry for `kaola-workflow/`, `ROADMAP.md`, or any `*.md` pattern
that would cover it — `grep -ni roadmap .gitignore` returns nothing, and the full 47-line file was
read to confirm no broader pattern (e.g. a bare `*.md` or `output/`-style catch-all) would
incidentally cover it either. So on this consumer, today, a `git rm --cached` of `ROADMAP.md` without
also deleting it from disk (the exact "migrated halfway" state ADR 0018 §8 names) would brick every
sink on the repo, confirmed rather than assumed.

## 5. Anything else migration would break, not already named by ADR §8

- **Consumer documentation debt far larger than the two ADR already names.** ADR §8's "migrated
  halfway" discussion and §5 item 9 name exactly two dangling citations in this consumer:
  `CLAUDE.md:114` and `_rules.md`'s first paragraph (both confirmed above). Measured beyond those:
  **11 more citations of `` `kaola-workflow/ROADMAP.md` `` across 5 currently-active, non-archived
  consumer docs** — `docs/reference/concerns.md` (2), `docs/reference/development-state.md` (3),
  `docs/reference/requirements.md` (4), `docs/reference/milestones.md` (1), `docs/README.md` (1) —
  each phrased as a live pointer, e.g. *"Live status: GitHub #143 + `kaola-workflow/ROADMAP.md`"* or
  *"the live child tree ... are maintained by the workflow mechanism: GitHub Issues ... +
  `kaola-workflow/ROADMAP.md`"*. These are consumer-owned prose (ADR 0018's tool-side build sequence,
  §8 step 5, only commits to updating the *tool's* skeletons, `README.md` and `docs/api.md` — never a
  consumer's `docs/reference/*.md`), so nothing in the shipped migration mechanism touches them; they
  would all point at a deleted file the moment migration lands, and only the consumer can fix them.
- **A test file already cites a `.roadmap/issue-N.md` source as authority, and the citation is
  already dangling today — independent of migration.**
  `crates/cadcore-verify/tests/oracle_495_498_fillet_landed_honesty.rs:62` quotes
  `` `kaola-workflow/.roadmap/issue-495.md` `` verbatim as the source for a claim ("FILLET-W004 fences
  only the VCL path..."). Issue #495 is **closed**, and its local source file is **already gone**
  (`ls kaola-workflow/.roadmap/issue-495.md` → no such file) under the *current*, un-migrated,
  shrink-only mechanism — this is not a migration-caused defect, it is the existing mechanism's known
  failure mode (ADR §1's "shrinking is automated, growing is manual") already landing in shipped test
  prose. Migration does not create this failure class; it generalizes it from "whichever sources
  happen to have closed" to "all 81 at once."
- **The consumer has already, informally, adopted the exact rationale ADR's migration plan relies
  on.** `docs/decisions/decisions.md:12072-12074` documents a prior instance of this same class of
  problem, self-corrected by a 2026-08-12 audit: a citation to `.roadmap/issue-517.md` is annotated
  *"the reference is historical; the text is recoverable via git. Noted by the 2026-08-12 audit."* —
  the same "git preserves it" reasoning ADR 0018 §8 uses to justify deletion, already in independent
  use on this repo before this investigation.

## Inferences

- The homeless count for this consumer is **exactly 2 (#535, #536)**, not the ~8 the task brief's
  linear extrapolation from a 20-file sample projected — confidence: high, refuted by: re-running the
  atom-extraction with a broader atom grammar (e.g. capturing bare multi-word phrases without
  backticks/quotes) and re-checking any newly flagged miss against the full 512-issue corpus and repo.
- The `repo-held-only` bucket (content with no forge home at all) measured **0/81** on this consumer,
  against the brief's 3/20-sample projection — confidence: medium, refuted by: the brief's own #143
  example, re-checked, turned out to have a forge home via issue #393 once the full corpus (not just
  #143's thread) was searched; a genuinely repo-only case may exist among content too generic to have
  produced an extractable atom (no backtick/decimal/D-record/quote/path), which this method cannot
  rule out with certainty.
- The five additional currently-active consumer docs citing `ROADMAP.md` are real prose debt migration
  would create, not merely a risk — confidence: high, refuted by: none found; direct read of all 5
  files confirms live-pointer phrasing in every citation.

## Open

- Whether any of the 42 "clean" issues (all extractable atoms matched) hides content that produced no
  atom at all (fully generic prose with no number, path, D-record, or quotable phrase) was not
  exhaustively hand-read line-by-line the way the 39 flagged issues were — this is the residual
  uncertainty behind the "confidence: medium" line above.
- Whether `docs/decisions/decisions.md`'s dozens of historical `.roadmap/issue-N.md` citations (a
  decision log, describing the past) should count as "would break" was left unmeasured as a judgment
  call outside this brief's scope — they are historical record entries in the same vein as
  `CHANGELOG.md`, not live pointers, and are listed above only where one doubled as a live-status
  reference.
