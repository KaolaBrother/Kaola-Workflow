# Acceptance suite for #1053 — RED baseline evidence

## Revision 2 (reviewer R1, same candidate `51890a2e`)

Third fix in the same file, same rules (test file only, no production change). Assertion count:
**255 -> 264**.

Reviewer R1 confirmed the `BASELINE_SHA`/`git show` removal from Revision 1 was correct (and noted
the concrete failure mode: a `git archive` export has no `.git` object store at all, so the old
suite would exit 1 on "could not read baseline" — failing the whole `&&`-chained claude chain for a
reason unrelated to #1053). No further action needed there.

Second observation: the "no new required step about 'what to remember'" negative pin banned the
bare words `remember` / `memoriz*` / `"lessons learned"` **anywhere** in `init.skeleton.md` /
`finalize.skeleton.md`, which is broader than #1053's actual non-goal ("no routine 'anything to
remember?' step and no learning phase added to init/finalize") and could false-RED on an unrelated
legitimate sentence later (e.g. "Remember to run the tests," or a code-style comment referencing a
past "#700 ... lesson" — both idioms already exist harmlessly elsewhere in this repository today).

**Judgment: narrowed, did not drop.** I judged this pinnable mechanically at the level of STEP
*structure* rather than bare vocabulary: a heading naming the concept, a routine question form
("anything to remember?" / "what should you remember"), or an imperative instruction to
write/log/record something to a memory or learning-loop artifact. That is what "a routine step" or
"a learning phase" actually LOOKS like in this file family (compare the shape of the real Mission
List table pin elsewhere in this suite — structural, not lexical), so I did not consider it in the
"cannot be pinned mechanically without freezing wording" category the reviewer offered as the
alternative.

Verified with a standalone probe before editing the suite:
- **False-positive guard (must NOT flag) — all four passed clean on the new detector:**
  `"Remember to run the tests before you finalize."`;
  `"// #700 collision-suffix lesson) so the in-place base restore is fine."`;
  `"merge-lane close-deferral must not rest ENTIRELY on the caller remembering --keep-worktree."`;
  `"Pick a memorable, short branch name."` — all four are REAL sentences already present verbatim
  in `scripts/kaola-workflow-claim.js` today (grepped first), so this is not a hypothetical.
- **Actual non-goal shape (must flag) — all five caught:** a `## What to remember` heading; the
  routine question form `"is there anything to remember before closing?"`; `"What should you
  remember from this run?"`; an imperative `"Log lessons learned to the personal-memory file..."`;
  and a `### Learning loop` heading.
- Re-ran against the current `templates/routing/init.skeleton.md` and `finalize.skeleton.md` — both
  still report zero hits, exactly as the original (broader) pin did, so nothing already-legitimate
  in either file was affected by narrowing.

Both probe classes (4 false-positive-guard + 5 actual-violation-shape) are now permanent assertions
inside the suite. `node scripts/test-issue-1053-next-task-quality.js`: **264/264 green**.
`node scripts/test-suite-registration.js`: 677 assertions, unchanged (`package.json` untouched;
`git diff --stat package.json` empty). No production file needs to change.

## Revision (post-freeze, candidate `51890a2e`)

Supervisor review raised two concerns against `scripts/test-issue-1053-next-task-quality.js`. Only
that file was edited (per instruction: no production files, `package.json` untouched — `git diff
--stat package.json` is empty). No `npm test` chain run was disturbed. Assertion count: **247 -> 255**.

### 1. "Semantic" fragment regexes — false RED / false GREEN, measured concretely

Wrote a standalone probe script (`sentenceWindows`/`conceptPresent` copied verbatim from the suite)
and ran it against synonym rewrites and polarity-inverted adversarial sentences for every clause
before touching the suite. Measured results (BEFORE the fix):

**False RED (a legitimate synonymous rewrite of the real landed text failed to match):**
- clause (a): `"already settled and authorized"` instead of `"already clear and authorized"` — FAILED.
- clause (b): `"consult the documentation"` instead of `"look it up"` (isolated, no `reproduce`/`read
  the code` present) — FAILED.
- clause (d): `"ordinary prose"` instead of `"plain language"` — FAILED.
- clause (c): `"independent of the answer"` instead of `"does not depend on the answer"` — FAILED
  (found during the fix pass, same class).
- addition-2: `"does not lower acceptance"` instead of `"never lowers acceptance"` — FAILED (same
  class).

**False GREEN (an inverted/adversarial sentence containing all fragment WORDS, unattached to their
negation, incorrectly passed):**
- clause (a): `"...continue: no other option remains except to demand a fixed requirement format
  and rewrite the issue every time."` — PASSED (bug). The old fragment set checked a standalone
  `/\b(?:not|never|no)\b/i` token anywhere in the sentence, so an unrelated "no" satisfied it while
  the target phrase ("fixed requirement format") was actually being DEMANDED, not forbidden.
- clause (e): `"A research or design request that does not authorize anything at all is
  meaningless; it authorizes only implementation, forge writes, and a claim."` — PASSED (bug). The
  old set checked `does not authoriz` and `implementation`/`forge writ`/`claim` as SEPARATE,
  unattached fragments, so a negation governing an unrelated clause plus an affirmative mention of
  the forbidden objects elsewhere in the same window satisfied all fragments.

**Already correctly rejected (no bug found — the supervisor's own two named examples), because
these two were already single-bigram-anchored rather than split into separate fragments:**
- `"A research or design request DOES authorize implementation, forge writes, and a claim."` (the
  literal `does not authoriz` bigram was absent, so clause (e) already failed this one correctly —
  its OTHER, unattached-negation form above is what was actually broken).
- `"A short explanation or a small change MAY lower acceptance, and existing evidence is never
  sufficient."` — addition-2's `never\s+lowers?\s+acceptance` was already a single bound bigram, so
  this was already rejected; only its synonym set needed widening.

**Fix applied:** every negation-bearing clause ((a), (e), addition-2) now requires the negation
token (`do not` / `does not` / `never` / `need not`) to be **immediately followed, within a bounded
span containing no sentence-ending punctuation (`.?!;`), by the exact phrase it governs** — one
combined regex per negated relationship, not a standalone negation token plus a separately-checked
object. Synonym sets were widened where a measured false RED showed a real gap: clause (a)
(`already clear/settled/known/established/determined`), clause (b) (`consult/check the
documentation`, `search for it`, `look something up`), clause (c) (`independent of`/`regardless of
the answer`), clause (d) (`ordinary prose`), addition-2 (`does not`/`do not lower acceptance`). All
five clauses' boundary/near-miss self-tests, the real landed text, and both new probe classes
(synonym-acceptance + adversarial-rejection) were re-verified in isolation before editing the suite
file, then re-verified again by running the edited suite (255/255 green). Both probe classes are now
also encoded as permanent regression-guard assertions inside the suite itself (10 synonym-acceptance
+ 4 adversarial-rejection assertions), so a future regression to a loose negation token is caught
automatically rather than depending on a one-off manual measurement.

**Known, accepted limitation** (stated rather than pretended away): this remains a mechanical
approximation of meaning, not a meaning oracle. A sufficiently unusual rewrite that negates a
concept through sentence structure the fragments do not anticipate (e.g. a rhetorical question, a
double negative, cross-sentence anaphora) can still slip past. Bare `"no"` was deliberately excluded
from the negation-token alternation (only `do not`/`does not`/`never`/`need not`) because even
distance-bounded, `"no"` alone was measured to still satisfy the clause-(a) adversarial case above
(it appears too close to the target phrase to distinguish). This narrows the accepted synonym set
for that one negation form; documented here rather than silently widened back.

### 2. `BASELINE_SHA` / `git show` runtime dependency on a historical commit

Removed entirely. The suite previously read
`git show d02f82b7:templates/agents/behavior-contracts.json` at runtime to compare the role roster
count against the pre-#1053 baseline, which is wrong for a permanent suite for the two reasons the
review named: (a) a shallow clone, an unpacked source tree, or ordinary future history rewriting
could make that historical object unreachable, and (b) pinning a specific role COUNT freezes every
future legitimate role addition as a false "#1053 non-goal violation" forever after, not just for
this issue's lifetime.

Chose the "simply drop" option the review offered, rather than inventing a self-consistency
replacement check, because: #1053's actual scope (`templates/routing/next.skeleton.md` +
`docs/task-quality.md`) never touches `templates/agents/behavior-contracts.json` at all, and
`node scripts/generate-agent-profiles.js --check` already runs as a standing step in both
`test:kaola-workflow:claude` and `:claude:full` — it is the correct, history-independent guard
against a role profile drifting from its own authority, and adding a second, weaker,
#1053-scoped copy of that guard here would not measure anything the chain doesn't already measure.
Confirmed via `grep` that no other `git show`/`git rev-parse <sha>` call remains anywhere in the
file, and `execFileSync`/`BASELINE_SHA` were removed as now-dead imports/constants (`node -c`
syntax-checks clean).

The RED-on-baseline evidence itself (the `git worktree add ... d02f82b7` procedure documented
below) remains exactly what it always was: a one-time, out-of-band PROOF that the suite fails
before #1053's changes exist, run once by the test author and recorded here as history — never a
dependency the suite itself carries at runtime. That distinction is what this revision restores.

## Test file
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1053/scripts/test-issue-1053-next-task-quality.js`
- Registered in `package.json` on both `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full`
  (inserted right after `test-issue-1052-cursor-cli-startup-prep.js`, before `test-zcode-install-trust.js`,
  in both chain strings). `node scripts/test-suite-registration.js` passes (677 assertions) with the
  new file counted as registered (was 58 suites/55 registered before this change; now 59/56).

## Assertion count
- 247 assertions total when run against the current worktree (post-landing state).
- 145 assertions execute before the RED baseline run halts on the first structural absence it can no
  longer probe past (see below); of those, 95 passed (structural/registry checks + all mutation
  self-tests) and 142 failed, exit code 1.

## RED baseline proof
- Baseline commit: `d02f82b7` (`chore: release 10.5.0`), exactly the worktree's starting commit.
- Procedure run exactly as specified: `git worktree add /private/tmp/claude-501/kw-1053-baseline d02f82b7`,
  copied only `scripts/test-issue-1053-next-task-quality.js` into that tree, ran it there, then
  `git worktree remove --force /private/tmp/claude-501/kw-1053-baseline` (confirmed removed via
  `git worktree list`).
- Command: `node scripts/test-issue-1053-next-task-quality.js` in the baseline tree.
- Exit code: `1`.
- Failure signature (representative excerpt of 142 failures):
  ```
  FAIL: opencode/github: rendered Next carries addition-1 clause (a_continue_when_clear_no_fixed_format)
  FAIL: opencode/github: rendered Next carries addition-1 clause (b_investigate_before_asking)
  FAIL: opencode/github: rendered Next carries addition-1 clause (c_ask_only_unresolved_scope)
  FAIL: opencode/github: rendered Next carries addition-1 clause (d_maintain_issue_plain_language)
  FAIL: opencode/github: rendered Next carries addition-1 clause (e_research_design_scope_only)
  FAIL: opencode/github: rendered Next carries the addition-2 proportional explain/verify sentence
  ... (same six failures repeated for kimi/grok/cursor/zcode x github/gitlab/gitea = 90 lines)
  FAIL: plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md: renders addition-1 clause (a_continue_when_clear_no_fixed_format)
  ... (same for the other 2 `next` skill surfaces = 18 lines; command surfaces silently render but the
      run stops registering NEW distinct failure classes there because the canonical-paragraph lookup
      below already reports absence)
  FAIL: the addition-1 paragraph (all five clauses in one paragraph) is found in the github/command canonical render
  FAIL: the addition-2 paragraph is found in the github/command canonical render
  FAIL: docs/task-quality.md exists
  FAIL: docs/task-quality.md is non-empty
  FAIL: docs/README.md links to task-quality.md
  FAIL: docs/task-quality.md covers concept: wrong_premise_to_original_issue_comment
  FAIL: docs/task-quality.md covers concept: proven_defect_fix_plus_regression_test
  FAIL: docs/task-quality.md covers concept: no_learning_loop_no_memory_write_no_auto_rule_rewrite
  FAIL: docs/task-quality.md restates the PASS-invalidation-by-mutation rule
  FAIL: docs/task-quality.md restates the never-claim-unexecuted-UAT rule

  test-issue-1053-next-task-quality: 142 assertion(s) FAILED (95 passed).
  ```
  Full captured output: `/private/tmp/claude-501/-Volumes-WorkspaceA-ylminiserver-workspace-kaola-workflow/9c76cf4c-865e-479e-8386-fa1b8a580d28/scratchpad/red-baseline-output.txt`
  (145 lines; session-scratchpad, not part of the repo).

## What each assertion group pins, and why it is semantic rather than wording

1. **Addition-1 clause detectors (a–e)** — `ADDITION_1_CLAUSES` in the test file. Each clause is a
   small array of paraphrase-tolerant regex fragments (e.g. clause (a): `/already\s+clear/i`,
   `/authoriz/i`, `/\bcontinue\b/i`, a negation token, and `/(?:fixed\s+requirement\s+format|rewrite\s+the\s+issue)/i`)
   that must all match within one sentence-or-adjacent-sentence-pair window
   (`sentenceWindows`/`conceptPresent`). None pins the author's literal clause; each is proven both
   to accept a hand-written compliant boundary sentence and to reject a believable near-miss that
   drops exactly the clause it exists to catch (10 mutation self-tests for the five clauses, run
   before any repo file is even read).
2. **Addition-2 detector** — same mechanism, one concept (proportional explain/verify judgment,
   "never lowers acceptance").
3. **Skeleton location** — `section()` extracts the "## Intake, freshness, claim, and resume" and
   "## Run it" H2 bodies from the current `templates/routing/next.skeleton.md` at run time (no
   hardcoded copy of the file), then runs the clause/addition-2 detectors against those bodies.
4. **All 18-registry `next` rows (6 files)** — reads `GENERATED_SURFACES` from
   `scripts/generate-routing-surfaces.js` at run time, filters `topic === 'next'`, asserts exactly
   six rows, renders each via the real `renderSkeleton()` and applies the same detectors. A
   paragraph-level byte-identity check (not whole-section, since the Intake section legitimately
   varies per forge via `SLOT:nx-scripts-resolver` and a gitea-only `REGION`) asserts the exact
   addition-1 paragraph found in the github/command canonical render appears byte-for-byte in the
   other five `next` renders, and likewise for addition-2 — this is the strongest true invariant
   given how `renderSkeleton` actually works (confirmed by inspecting `generate-routing-surfaces.js`
   before writing the check; a whole-section byte-identity assertion was tried first and correctly
   went red on legitimate per-forge content, so it was narrowed to paragraph scope).
5. **Five additive editions x three forges (15 renders)** — inspected each `sync-<edition>-edition.js`
   for its exported pure `renderCommand(...)` function and its exact parameter order (opencode:
   `(canonContent, forge, label)`; kimi/grok/cursor/zcode: `(canonContent, commandName, forge)` — the
   order differs between opencode and the other four, confirmed by reading each source). Canonical
   content is produced **purely in-memory** via `renderSkeleton()` for each forge, then fed straight
   into each edition's own `renderCommand`. **No `--write` is ever invoked and nothing is written to
   disk anywhere in this suite.** This matters because `TREE_ROOT` in every `sync-*-edition.js`
   resolves, under a linked worktree, to the **main checkout** (not this worktree) — confirmed by
   reading the `TREE_ROOT` IIFE and its comment in `sync-opencode-edition.js` and cross-checking
   against `kaola-workflow-adaptive-schema.js`'s `getCoordRoot`/`mainRootFromCoord`. A `--write` run
   from this worktree would therefore mutate the shared main checkout's gitignored `.opencode`/
   `.kimi`/`.grok`/`.cursor`/`.zcode` trees — avoided entirely by calling the exported render
   functions directly instead of spawning `--write`.
6. **Compact-recovery prompts** — inspected `compact-recovery.skeleton.md` and
   `renderCompactRecoveryPrompt()`; confirmed (and asserted) they render from a **separate** skeleton
   that only instructs "reload the installed Workflow Next prompt" and does **not** embed the
   Intake/Run-it passages. Recorded as a non-pin per the brief's instruction not to assert what is
   not true, with one assertion confirming the non-embedding so a future accidental inlining is
   caught either way.
7. **`docs/task-quality.md`** — existence, non-emptiness, a markdown link from `docs/README.md`
   (`/\]\(task-quality\.md\)/`), and three concept detectors (wrong-premise-to-original-issue-comment,
   proven-defect-plus-regression-test, no-learning-loop/no-personal-memory/no-auto-rule-rewrite),
   each with its own mutation boundary/near-miss self-test.
8. **Negative pins**, each scoped to the exact named artifact:
   - `GENERATED_SURFACES.length === 18` and `Object.keys(TOPICS) === {finalize,init,next}`.
   - Role roster count: read via `git show d02f82b7:templates/agents/behavior-contracts.json` (not a
     hardcoded "14") compared against the current file's role count — derived from the repo's own
     history rather than this suite's private guess.
   - Mission List: the exact table header/field-name substrings plus "Three writes only" plus an
     exact count of 4 matching field rows (regex `^\|\s*\`(?:item|status|dispatched|result)\`/`).
   - `init.skeleton.md` / `finalize.skeleton.md`: negative regex scan for
     `remember|learning loop|memoriz*|lesson(s) learned|personal-memory` — verified against the
     ACTUAL current file contents first (zero hits today) so the pin isn't a false-positive trap.
   - `kaola-workflow-claim.js` CLI flags: every `args.<field>`/`args['<field>']` access is extracted
     from the live source via regex (not a hand-typed flag list) and checked against
     `/remember|memory|learn|personal.?rule|note.?to.?self/i`.
   - The global contract's own "never claim an unexecuted... UAT" sentence, pinned verbatim in
     `templates/global/kaola-workflow-global.md` (its actual home — grepped the whole `templates/`
     tree first and confirmed this sentence does **not** literally appear inside
     `next.skeleton.md` itself, only a reference to "the loaded machine-global workflow contract";
     both are pinned at their real locations rather than asserting a false literal-text claim
     against `next.skeleton.md`).
   - `docs/task-quality.md` additionally restates both the PASS-invalidation-by-mutation and the
     never-claim-unexecuted-UAT rules as concepts — this is where the brief's "must still be present
     in the rendered Next surface" requirement for the UAT rule is actually satisfiable, since the
     Next skeleton itself only cross-references the global contract by name.

## What I could not cover / judgment calls made explicit
- The brief's phrase "must still be present in the rendered Next surface" for the never-claim-
  unexecuted-UAT rule does not hold literally: that sentence lives only in
  `templates/global/kaola-workflow-global.md` and (as landed) in `docs/task-quality.md`, not inside
  `templates/routing/next.skeleton.md`. I verified this by grepping the full `templates/` tree before
  writing any assertion, and pinned the rule at its two real locations instead of asserting a false
  claim against next.skeleton.md's own bytes. Flagging this explicitly rather than silently
  reinterpreting the brief.
- Byte-parity across all six `next` renders is asserted at PARAGRAPH granularity, not whole-section,
  because the Intake section legitimately differs per forge (script-resolver SLOT, gitea REGION).
  This is the strongest true invariant, confirmed by first attempting whole-section byte-identity and
  observing it fail on legitimate (non-defective) content.
- Did not attempt to render the Cursor CLI/App "native variant" surfaces separately from the standard
  Next command render: inspected `sync-cursor-edition.js` and found only ONE Next command surface per
  forge (`renderCommand`), with `cursorCliStartupResumePrepProse()` appended as trailing prose keyed
  off the `workflow-next.md` basename rather than a second, distinct Next surface. The single render
  this suite already produces per forge covers that path.
- This suite was developed and run entirely in-process (no disk writes to any gitignored edition
  tree, no `--write` invocation anywhere), so it carries zero risk to the shared main checkout even
  though several `sync-*-edition.js` scripts would resolve their `TREE_ROOT` there if invoked with
  `--write` from this worktree.

## Files touched by this task
- New: `scripts/test-issue-1053-next-task-quality.js`
- Modified: `package.json` (two chain-string insertions only)
- All other working-tree changes visible via `git status` (`next.skeleton.md`, the six rendered
  `next` surfaces, `docs/task-quality.md`, `docs/README.md`, `docs/api.md`, `README.md`,
  `CHANGELOG.md`) are the orchestrator's concurrent production work, not mine.
