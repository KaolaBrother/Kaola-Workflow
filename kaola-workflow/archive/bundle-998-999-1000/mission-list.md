# Keep the `## Run gaps` grammar strict and state it where an author writes it (#998, #1000), and stop test-route-reachability.js:1008 stating a count nothing maintains (#999)

Owner ruling, given in conversation before the claim, on the values fork both #998 and #1000 hand
over: **strict + document**. `parseGapSection` is UNTOUCHED — neither the heading regex
(`kaola-workflow-gap-sweep.js:270`, `/^## Run gaps\s*$/`) nor the bullet-only row filter (`:279`)
changes. The grammar gets stated on the surface a finalizing run actually reads. #998 closes as
documented-not-widened; #1000 closes with tables out of grammar and `archive/issue-725`'s record
left wrong and archived. Rationale the owner chose it under: a low observed rate, #997 at `d63fe703`
already converted both silences into `unknown`, and nothing re-reads archived summaries, so the loss
is historical and the value is forward-looking only. **The rate figures first written here were
1-of-128 and 2-of-154; both were later corrected** — they mixed corpora and were stale against the
tree that ships them. Measured over all 160 tracked archived summaries at `83b997e0`: 133 `## Run
gaps` headings, 132 of which the parser can enter, the one it cannot being exactly the parenthetical;
2 of those 132 located sections are tables. The corrected figures are what shipped.

Verified pre-claim, all three issues accurate about their own mechanism: `gap-sweep.js:270` is the
strict heading entry; `:279` counts non-bullet lines into `unaccountedFiled` but never reads them;
the lazy `(.+?)` sample quantifier at `:296` is documented load-bearing in both directions and is
not to be disturbed; the archive sweep is now 127 standalone `## Run gaps` + 1 parenthetical
(`archive/bundle-625-626`), one more than #998's 126 because this run archived another summary; and
`test-route-reachability.js:1008` says "9 of the 30" where the manifest measures 10 content-led of
19 total.

Worktree: `.kw/worktrees/bundle-998-999-1000` on `workflow/bundle-998-999-1000`, based `ecebd5a5`.
Use ABSOLUTE `$WT/` paths in every dispatch.

- item: Measure what the shipped surfaces actually say about the `## Run gaps` grammar today — the strict standalone-heading form and the bullet-only row form — and name the exact skeleton under `templates/routing/` an author of that section reads, since #998's own body records this as unmeasured and it is upstream of every edit this run makes; note that a row-grammar statement is already known to exist somewhere in the corpus (the strict `- manual:<class> (<sample>): filed: #N` form) so the question is coverage and location, not existence.
  status: done
  dispatched: investigator (read-only, no tracked writes), reading the worktree at `.kw/worktrees/bundle-998-999-1000`; report to land at `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/3bd3d84e-e065-495e-892a-bb0a911da344/scratchpad/m1-grammar-surfaces.md`
  result: Report landed, 557 lines, at that path. Findings that change the plan, four of them:
    (1) **Q1 is stated NOWHERE in the shipped tree.** No surface anywhere says the heading must stand
    alone; two targeted greps return zero. This answers #998's own "unmeasured" hypothesis — nothing
    documents the heading form, so a 1-in-128 rate is not evidence authors were told and improvised.
    (2) **The authoring surface MISLEADS rather than being silent** — the finding neither issue
    reported, and bigger than both. `templates/routing/finalize.skeleton.md:224-225` states the row's
    TAIL and omits its HEAD: "`## Run gaps` carries one line per swept gap, each either `filed: #N` or
    `noise: <justification>`". Every literal completion of that sentence parses to ZERO rows. I re-ran
    the probe myself rather than take it on report; six cases reproduce exactly: `- filed: #998` →
    len=0/unaccounted=1 · `- manual:foo: filed: #998` → len=0/unaccounted=1 · `- manual:foo: noise:
    transient flake` → len=0/unaccounted=**0** · strict form `- manual:foo (transient flake): filed:
    #998` → len=1 · parenthetical heading → **null, section absent** · bare heading + table →
    len=0/unaccounted=2. Only the strict form parses, and no prompt surface states it. I do NOT adopt
    the report's severity ranking for the `noise:` case: an all-`noise:` section stamping zero filings
    is CORRECT (a noise row is not a filing), so that case's real consequence is the sweep reporting a
    mapped gap as unswept, not a wrong count.
    (3) **The ancestor sentence already exists** — `docs/conventions.md:516-521` states the canonical
    two-form grammar in full. So the skeleton reuses that wording verbatim rather than authoring a
    fourth variant; only the heading rule is genuinely new prose.
    (4) Insertion point is skeleton line 225, NOT inside `<!-- PIN: forge-is-the-backlog -->` as I had
    assumed from #992's pattern: that span is the filing duty and already carries 15 tokens, while
    `fn-mission-list-report`'s single token ends at "findings land" and does not cover the `## Run
    gaps` sentence, so an insertion after 225 disturbs no existing pin. Reach measured from the
    generators, not guessed: 6 finalize surfaces of 18 total, `all 18 surfaces byte-match` today, and
    **all four runtimes** — claude/codex directly, opencode/kimi transitively because both edition
    generators read the rendered command surfaces (`sync-opencode-edition.js:194-198`,
    `sync-kimi-edition.js:146`), so the edit needs **three** regeneration steps, not one.
    Two traps I established myself on top of the report: naming a typed refusal code such as
    `gaps_unswept` in the new prose is FORBIDDEN — routing surfaces carry zero typed codes today and
    ADR 0017's lexicon watch-list row arms on "any typed `reason:` code appearing on a runtime surface
    at all" — and nothing anywhere pins `REQUIRED_BLOCKS.length`, so a new pinned block is free.

- item: State the grammar in the skeleton the previous item names — the heading must stand alone and rows must be `- ` bullets in the strict form, tables and trailing parentheticals being out of grammar — landing the owner's ruling for both #998 and #1000; edit the skeleton and regenerate with `generate-routing-surfaces.js`, never a rendered surface, and say which runtimes the change reaches.
  status: done
  dispatched: implementer, with the exact prose dictated by me (I own the wording — one rule, one wording, and it reuses `docs/conventions.md:516-521` verbatim for the two row forms); writing `templates/routing/finalize.skeleton.md` after line 225 plus the agreeing sentence in `docs/conventions.md` step 2, then running all THREE regeneration steps (`generate-routing-surfaces.js --write`, `sync-opencode-edition.js --write`, `sync-kimi-edition.js --write`); output lands in the worktree at `.kw/worktrees/bundle-998-999-1000`, verified by `generate-routing-surfaces.js --check` reporting 18 surfaces byte-matching. The pin that GRADES this prose is deliberately NOT in this dispatch — test custody is `tdd-guide`'s and an implementer must not author the pin on what it built.
  result: Landed in the worktree, additive-only, and verified by me rather than taken on report.
    `templates/routing/finalize.skeleton.md` gained 11 lines after the untouched original paragraph:
    the heading rule (`Write the heading exactly \`## Run gaps\`, with nothing else on the line`), the
    two form bullets reused verbatim from `docs/conventions.md:519-521`, and the consequence sentence
    naming prose and markdown-table lines as not read. `docs/conventions.md` step 2 gained the agreeing
    3-line heading paragraph, indented to its numbered-list continuation. Diff is exactly the predicted
    set — 9 files: skeleton + `conventions.md` + the **6** rendered finalize surfaces + #999's comment
    fix — `83 insertions, 2 deletions`, and **zero** `-` lines anywhere in the routing diff.
    `generate-routing-surfaces.js --check`: `all 18 surfaces byte-match the skeleton`, exit **0**.
    `test-route-reachability.js`: exit **0** at **331** assertions, the same count as baseline. The
    sentence SHIPS, not just authored: `grep -c 'with nothing else on the line'` is 1 on the github
    command, the github SKILL and the gitlab command. Typed-code count on routing surfaces is still
    **0**, so ADR 0017's lexicon watch-list row stays unarmed. One check of mine was invalid and was
    redone: `grep -v '^[+-][+-]'` silently swallowed the two added form bullets, because an added
    markdown bullet begins `+-`; re-read the region directly to confirm both bullets are present.

- item: Stop `scripts/test-route-reachability.js:1008` stating a hand-maintained count of a computable fact — measured 10 content-led of 19, comment says 9 of the 30, and a sweep of that file found this is the only such parenthetical in it, so #999's sibling-drift hypothesis is already answered no; keep the sentence's reasoning and drop the number rather than restating a figure nothing will catch drifting again.
  status: done
  dispatched: tdd-guide (test artifact, so custody is its), editing in place at `.kw/worktrees/bundle-998-999-1000/scripts/test-route-reachability.js` around line 1008; no new assertion — a pin on the count would re-create the drift it is removing
  result: Landed in the worktree at `scripts/test-route-reachability.js:1008-1009`. `(9 of the 30 today)` deleted and the two lines rewrapped to the block's width; the sentence's reasoning — a content-led block is not marker-led and needs no distinctive sibling because its first token is itself the distinctive one — is byte-intact otherwise. Verified by me, not taken on report: `git -C $WT diff -U0` is **4 changed lines, 4 of them comment lines, 0 executable**, and `node scripts/test-route-reachability.js` run explicitly in the worktree exits **0** at **331 assertions**. First attempt at this check was inconclusive (a persisted `cd` meant an empty main-root diff would also have printed `0`); re-run pinned to `git -C` and a subshell `cd`. No assertion added, by decision: a pin on the figure would re-create the hand-maintained count being removed. #999's second hypothesis is also answered — a sweep of `\([0-9]+ of (the )?[0-9]+` over that file returns this line and nothing else, so there were no drifted siblings.

- item: Hold the shipped grammar prose with a pin, discovered mid-run: the four sentences now ship on six surfaces and NOTHING grades them, so a future regeneration or reflow could drop the rule with every suite green — the shape my own notes record as a control going green while its message is false, and the shape the sentence they extend already had, which is arguably how it stayed tail-only. Nothing pins `REQUIRED_BLOCKS.length`, so a new block is free; the count moving 19 to 20 and content-led 10 to 11 is harmless precisely because #999 removed the comment that stated those figures.
  status: in-flight
  status: done
  dispatched: tdd-guide (test custody — the implementer that wrote the prose must not author its pin), adding one content-led block `fn-run-gaps-grammar` to `.kw/worktrees/bundle-998-999-1000/templates/routing/required-blocks.js` with four tokens, each mutation-proven armed ONE MUTANT AT A TIME through the skeleton and a regeneration so the mutation reaches what ships; proof transcript to land in its return message, the manifest edit in the worktree.
  result: Block `fn-run-gaps-grammar` landed, `+18` on `templates/routing/required-blocks.js`, content-led,
    `runtime_tag`/`surface_type_tag` both `both` (matched from the adjacent `fn-mission-list-report`
    rather than invented), four tokens: the heading rule, the `filed:` row form with its
    `- <reasonClass> (<sample>):` head, the `noise:` form with its head, and the clause naming prose and
    markdown-table lines as not read as a gap.
    **I proved the arming myself rather than accepting the report**, because one signal looked wrong:
    adding a 4-token block left the suite at **331 assertions**, unchanged. It is not wrong — my own
    mutant explains it. Snapshotted the skeleton and all 6 rendered surfaces first, then removed exactly
    token 1's clause, ran all three regeneration steps so the mutation reached what ships, and the guard
    went **exit 1**: `MANIFEST missing-token: block fn-run-gaps-grammar token "Write the heading exactly
    \`## Run gaps\`, with nothing else on the line" absent from …` on **12 obligated surfaces** —
    claude/codex/opencode/kimi × github/gitlab/gitea — with `13 failure(s), 330 passed`. The 13
    decomposes as 12 per-surface detail lines plus the one rollup assert they belong to (`derived-universe
    presence check clean over 240 obligated file-checks`), and **no other block or token was named**. So
    the per-surface findings are detail under a single assertion, which is exactly why the count stays 331
    — the block adds detail, not assertions, and a stable count is not evidence of a dead pin here.
    One consequence I had to repair: `--write` from a worktree refreshes the **main checkout's** six
    gitignored edition homes (#996's announced cross-checkout write), so my mutant propagated there and
    left all six carrying the mutated prose. Restored from the byte snapshot and re-ran all three write
    steps; verified after: all six main-root homes carry the rule again (`.opencode`, `.opencode-gitlab`,
    `.opencode-gitea`, `.kimi`, `.kimi-gitlab`, `.kimi-gitea` each 1), all 6 tracked surfaces `cmp`-identical
    to the snapshot, `--check` back to `all 18 surfaces byte-match`, suite exit **0** at **331**, and the
    diff back to **11 files, 102 insertions, 2 deletions**.

- item: Dock the docs for a run that ships documentation and a comment rather than a parser change — CHANGELOG under `[Unreleased]`, and wherever the gap-section grammar is described for a human — and check whether ADR 0017's watch list is the right home for the two declined widenings so the reopen trigger is recorded rather than lost.
  status: done
  dispatched: self — the CHANGELOG narrative and the ADR row are decisions, not production, and a doc role given this would need every sentence dictated anyway.
  result: `CHANGELOG.md` `[Unreleased]` gained two entries against the existing `### Added` and `### Fixed`
    headings (no third heading added): the grammar statement under **Added** for #998/#1000 — filed there
    rather than under Fixed on purpose, since no code was repaired and calling a declined widening a fix
    would overstate it — and #999's comment correction under **Fixed**.
    ADR 0017's watch list gained ONE row for both declined widenings. The table's stated criterion is
    "derived, never observed", so the row is worded to keep that honest: the three known instances
    (`bundle-625-626`, `issue-725`, its `.archived-*` sibling) are recorded as the row's **reason**, and
    its **arming observation** is a section improvised after the surface began stating the rule. It
    carries its own recovery information inline as that table requires — what a widening must not
    disturb: the lazy `(.+?)` quantifier, T14's free-text-bullet silence, `samplesMatch`, both refusal
    directions.
    `docs/api.md:1427-1429` repeats the same tail-only phrasing and is **deliberately left alone** — it
    describes what `--check` verifies rather than how to author a row, and a third restatement of a
    grammar is how N-way drift starts. Recorded as a decision, not an oversight. `README.md` and
    `docs/architecture.md` need nothing: no structure changed and no install surface moved.
    Every figure in both entries was re-verified against the tree before writing, because a fix whose own
    summary overstates the defect is the failure this run is closing: 20 blocks now / content-led 11 /
    marker-led 9, so "the 20th block" is right; 127 standalone + 1 parenthetical archive headings; 7
    `filed: #` cells in `issue-725`; 12 obligated surfaces; 331 assertions.

- item: Verify the run at full scope — the walkthrough suite at full scope rather than the 1/12 shard, `generate-routing-surfaces.js --check`, and the suites that pin this grammar (`test-finalize-door.js` T14's free-text-bullet silence, `test-bundle-finalize.js:1097`) — and prove no parser behaviour moved, since the ruling is that none should.
  status: done
  dispatched: investigator (read-only, runs suites, edits nothing), running SERIALLY in `.kw/worktrees/bundle-998-999-1000` — one runner only, because parallel suites in one worktree read as false green; walkthrough at FULL scope plus `test-gap-sweep.js`, `test-finalize-door.js`, `test-bundle-finalize.js`, `test-route-reachability.js`, `generate-routing-surfaces.js --check`, and a byte-check that `kaola-workflow-gap-sweep.js` is untouched; per-suite exit codes to land at `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/3bd3d84e-e065-495e-892a-bb0a911da344/scratchpad/m5-verification.md`
  result: Report at that path. **All six exit 0, none killed** (no 143/137): walkthrough at FULL scope —
    `"index":1,"total":1,"scenarios":184,"ran":184,"passed":184,"failed":0`, so not the rotating 1/12
    fast-gate sample — `test-gap-sweep.js` 173 assertions, `test-finalize-door.js` 675,
    `test-bundle-finalize.js` 192 tests, `test-route-reachability.js` 331,
    `generate-routing-surfaces.js --check` all 18 byte-match.
    **The ruling's central claim is byte-proven: no parser behaviour moved.**
    `git diff --stat` and `git status --short` are both EMPTY for `scripts/kaola-workflow-gap-sweep.js`
    and for all three `plugins/*/scripts/` copies. Final diff is exactly the 12 expected files, 167
    insertions / 2 deletions, with 11/0 on the skeleton and on each of the 6 rendered surfaces — so no
    mutant from either proof survived, and the only deletions in the whole change are #999's 2 comment
    lines.
    It correctly declined to certify one thing and flagged it rather than claiming it: the new pin's
    ARMING, which needs a tracked-file mutation its role forbids. That is already discharged — I
    mutation-proved it myself, above.
    It also corrected a citation I had inherited and had already written into the ADR row, so I fixed the
    row: `test-finalize-door.js` T14 is the #993/#994 degradation pair and holds only the STAMP
    consequence (a free-text section reads as a measured `0`); the free-text-bullet SILENCE — `- none`
    must not warn — is `test-gap-sweep.js` **T20**. Verified both directly at `test-finalize-door.js:2736`
    and `test-gap-sweep.js:788`. #997's constraint list and #1000's body both carry the imprecise version;
    the new watch-list row now names both pins and says they are in different files.

- item: Record the ruling on the forge before closure so each issue's own comments carry why it closed without the code its body proposed — #998 and #1000 each get the owner's strict+document decision stated on it, and comments override the body as the durable record.
  status: done
  dispatched: self — network only, no worktree involvement, so it overlapped verification safely; three bodies drafted to the scratchpad (`comment-998.md`, `comment-1000.md`, `comment-999.md`, the last one not originally planned) and posted with `gh issue comment --body-file`, never a heredoc; posted only AFTER the suites went green, so no comment can describe something that then changed.
  result: All three posted and **verified landed**, not trusted to exit 0 — each issue now reads
    `comments=2` (the startup claim marker plus the ruling) and all three are still `state=OPEN`, which is
    correct: finalize owns closure.
    #998 — https://github.com/KaolaBrother/Kaola-Workflow/issues/998#issuecomment-5317460186 · #999 —
    https://github.com/KaolaBrother/Kaola-Workflow/issues/999#issuecomment-5317460384 · #1000 —
    https://github.com/KaolaBrother/Kaola-Workflow/issues/1000#issuecomment-5317460670
    #998's and #1000's comments state the owner's ruling, why each closes with no parser change, and the
    head/tail finding neither body had. #998's also closes out its own unmeasured hypothesis with the
    answer — no shipped surface stated the heading form anywhere, so the 1-in-128 rate was never evidence
    that authors were told and improvised. #999 was not originally planned a comment and got a short one
    anyway: its body offered two shapes and the record should say which was taken and that no pin was
    added on purpose. No premise correction was needed on #999 — unlike the last bundle, all three of
    these issues were accurate about their own mechanism.

- item: Finalize the run — validate, dock, sweep, close, archive and sink; appended when the finalize phase began, since it is work like any other and a successor interrupted here needs its record too.
  status: done
  dispatched: self, in the worktree `.kw/worktrees/bundle-998-999-1000`; chain receipt to land in the MAIN authority folder `kaola-workflow/bundle-998-999-1000/.cache/chain-receipt.json`, summary beside it, sink from the main root afterwards.
  result: Two commits — `0d97df5d` (12 files, +167/-2) and `83b997e0` (2 files, +11/-5, the audit corrections).
    **Chains run twice, and the second run was owed.** The first receipt was green four-chain at
    `0d97df5d`; the docking audit then found two defects in this run's OWN prose, and fixing them moved
    the code-tree hash (`b19cb926…` → `5517873452…`), so `finalize --check` reported `chains_stale`.
    Re-stamped: green four-chain at `83b997e0`, `scope: all-four / edition_coupling`, every chain
    `exit=0 signal=null acceptedRed=false`, and `codeTreeHash` now matches the tree. Docs are inside the
    hash on a self-host repo BY DESIGN — prose is this repo's product — while the run folder is excluded
    by path, so writing the summary does not re-stale it.
    **Gap sweep reconciled both directions**: `result: pass`, `mapped: 7`, `filed: 2`, `noise: 5`. All
    seven rows parsed, which means the run's own summary is written in the strict grammar this run
    shipped — the rule eating its own cooking.
    **Follow-ups filed and verified per the shipped Step 7 contract** (existence plus non-empty body,
    recorded here and never in the `## Run gaps` row): **#1001** — P2/bug/area:scripts, body **3454**
    bytes, OPEN — the finalize surface splices only the gap-sweep gate, never the scan that produces the
    artifact the gate reads, which is the #998/#1000 defect class one level up. **#1002** — P3/bug/
    area:scripts, body **4171** bytes, OPEN — `finalize --check` reports `chains_stale` as a bare token
    with none of the culprit paths #648 shipped for that blindness; scoped honestly to the `--check`
    path, since the receipt was fresh again before the other two consumers could be observed.
    Five gaps recorded as noise with justifications, including one I had seeded as a defect and
    demoted after reading #648: the docs-commit re-stamp is a shipped rule working, not a defect.
