# Docs docking — #970's third measurement and #969's regenerate step

Worktree `.kw/worktrees/bundle-969-970-971-972`, branch `workflow/bundle-969-970-971-972`.
**No test file touched. No script under `scripts/` touched. `CHANGELOG.md` untouched.
`install-all.sh` untouched.**

**Verification tier: `regression-green`** — behaviour-preserving prose docking; the full existing
suite set was green before and after. One new manifest pin was additionally **mutation-proven**.

## Files changed

| file | change |
|---|---|
| `docs/api.md` | `### The two reports` → three; new table row; new `mission_list` conditionality paragraph; `mission_list` in the envelope sample; `--refresh-present` on the sync-scripts row |
| `docs/architecture.md` | "Two measurements ride…" → three, plus a third bullet; the `.opencode`/`.kimi` staleness sentence corrected |
| `docs/workflow-state-contract.md` | "two measurements" → three, naming `## Mission List` |
| `docs/conventions.md` | one sentence added to the generated-surface rule: `--write` also refreshes present edition trees, `--check` does not |
| `templates/routing/finalize.skeleton.md` | `## Mission List` in the summary template; the "do not delete them" sentence now covers all three |
| `templates/routing/required-blocks.js` | new block `fn-mission-list-report` |
| 6 rendered surfaces (`commands/` ×3, `skills/` ×3) | **regenerated**, never hand-edited |

Nothing else. The other modified paths in this shared worktree are other agents' work, preserved.

## Line by line

### `docs/api.md`
- `:268` heading `### The two reports` → `### The three reports`.
- `:270` "`probeFinalizeValidationGate` takes two measurements" → "The finalize transaction takes
  three measurements — two from `probeFinalizeValidationGate`, one from `probeMissionListCoherence`."
  The old sentence was true of the *function* and false of the *section*; naming both producers keeps
  it true of both. `Neither`/`both` → `None`/`each`.
- `:279` third table row: `mission_list` / `## Mission List` / `{ items, outcome_while_not_done }` —
  how many missions the record holds, and the `item:` line of each one carrying an outcome while its
  `status` is not `done`.
- `:292` (after the `changed_paths` prose, deliberately not interleaved with it) a paragraph for the
  three calls a reader cannot infer from the row: present only when the run wrote a record; a
  coherent record still reports with an empty list; read and never repaired, with nothing about exit
  code, `status` or `reasons` turning on it.
- `:311` envelope sample gains `"mission_list": { "items": 6, "outcome_while_not_done": [25, 52] }`.
- `:1498` sync-scripts row gains `--refresh-present` — see the audit below.

### `docs/architecture.md`
- `:192` "Two measurements ride the emitted envelope" → "Three".
- `:202` third bullet `**mission_list**` → `## Mission List`, stating the result only.
- `:299` **this one was false, not merely incomplete**, and it is the only correctness fix in the
  batch. It read "so a routing-surface change leaves `.opencode`/`.kimi` stale until regenerated."
  After #969 the mandated `--write` is the regenerate, so it now reads: that same `--write` "brings
  every `.opencode`/`.kimi` tree already on the machine back into parity — always the main
  checkout's trees, and never creating one that is absent."
- **The edition tree root**: nothing in `architecture.md` stated it before. It is now stated once, as
  a result ("always the main checkout's trees"), in that sentence. No mechanism is named.

### `docs/workflow-state-contract.md`
- `:113-115` "own two measurements … (`## Validation` and `## Changed Paths`)" → "own three
  measurements … (`## Validation`, `## Changed Paths` and `## Mission List`)".

### `docs/conventions.md`
- `:141` one sentence inserted immediately after "…then run `node scripts/generate-routing-surfaces.js
  --write`": that one step also brings every edition tree already on the machine back into parity
  (always the main checkout's, never creating an absent one), **and** `--check` reads no edition
  tree, which is what keeps the additive editions out of the four chains. The second half is
  load-bearing: the very next sentence says `--check` is wired into all four chains, and without it a
  reader concludes the editions have entered `npm test`.
- The "**18 surfaces total**" sentence is unchanged and still correct — `--check` is untouched and
  still prints 18.

### `templates/routing/finalize.skeleton.md`
- `:216` `## Mission List` added to the `finalization-summary.md` section template, after
  `## Changed Paths`.
- `:222` "`## Validation` and `## Changed Paths` are where the finalize transaction's own findings
  land" → "`## Validation`, `## Changed Paths` and `## Mission List` are where…". "do not delete
  them, and do not soften them" now covers the third script-written section.
- No issue number, no vendor, no model, no unresolvable command entered the skeleton.

### `templates/routing/required-blocks.js`
New block `fn-mission-list-report` (topic `finalize`, `both`/`both`, so all six surfaces).

**A premise in the brief is wrong, and it matters.** `:219` does *not* pin the summary-section block
list. It is the content token `'## Changed Paths'` inside `fn-changed-paths-report`, and tokens are
whitespace-normalized **substrings matched anywhere on the surface** — adding a heading to the
template cannot break it. That is why no suite went red; nothing was forcing this file to move.

I added the block anyway, for the asymmetry the brief was reaching for: `## Validation` and
`## Changed Paths` are each pinned on all six surfaces and `## Mission List` would have been the one
durable destination a surface could lose silently.

**The token is the sentence, not the heading — and that came from a failed mutation, not a
preference.** My first attempt used the bare `'## Mission List'`. Deleting the heading from the
summary template of one shipped surface left the suite **green at exit 0**: the token was still
satisfied by the second occurrence, inside the `## Validation`, `## Changed Paths` and
`## Mission List`… sentence. A pin satisfiable by either of two occurrences survives losing one. The
shipped token is the sentence, which occurs once and states the rule.

## Success criteria — literal output, real exit codes

Exit codes captured with `rc=$?` from the process, never through a pipe. (An early run used bash's
`${PIPESTATUS[0]}`, which is empty in zsh; every code below is from the re-run.)

### BEFORE (baseline, this worktree, before any edit of mine)

```
=== node scripts/generate-routing-surfaces.js --check ===
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
REAL_EXIT=0
=== node scripts/test-generate-routing-surfaces.js ===
test-generate-routing-surfaces: all 434 assertions passed.
REAL_EXIT=0
=== node scripts/test-route-reachability.js ===
Route-reachability test passed (331 assertions).
REAL_EXIT=0
=== node scripts/test-bash-block-guards.js ===
test-bash-block-guards: all 49 assertions passed (#361 bash-block execution)
REAL_EXIT=0
=== node scripts/validate-workflow-contracts.js ===
Workflow contract validation passed
REAL_EXIT=0
=== node scripts/validate-script-sync.js ===
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
REAL_EXIT=0
```

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2432}
WALKTHROUGH_BASE_EXIT=0
```

**210 scenarios, full scope** — not the 1/12 fast-gate shard. The brief's expectation of 210 matches
(main at `7e962bdc` is 209; this worktree carries #970's authored scenario on top).

### The regenerate step

```
generate-routing-surfaces --write: rendered 18 surfaces.
generated  .opencode/command/kaola-workflow-finalize.md
generated  .opencode-gitlab/command/kaola-workflow-finalize.md
generated  .opencode-gitea/command/kaola-workflow-finalize.md
sync-opencode-edition: refreshed 3 present tree(s): .opencode, .opencode-gitlab, .opencode-gitea.
generated  .kimi/skills/kaola-workflow-finalize/SKILL.md
generated  .kimi-gitlab/skills/kaola-workflow-finalize/SKILL.md
generated  .kimi-gitea/skills/kaola-workflow-finalize/SKILL.md
sync-kimi-edition: refreshed 3 present tree(s): .kimi, .kimi-gitlab, .kimi-gitea.
REAL_EXIT_write=0
```

**18 surfaces.** The six edition lines are #969's step working as designed — main's six trees, six
finalize surfaces, none created. Not a defect. Main's **tracked** tree is untouched by it
(`git status --porcelain` in main shows only the untracked, main-resident run folder).

### AFTER (final bytes)

```
=== node scripts/generate-routing-surfaces.js --check ===
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
REAL_EXIT=0
=== node scripts/test-generate-routing-surfaces.js ===
test-generate-routing-surfaces: all 434 assertions passed.
REAL_EXIT=0
=== node scripts/test-route-reachability.js ===
Route-reachability test passed (331 assertions).
REAL_EXIT=0
=== node scripts/test-bash-block-guards.js ===
test-bash-block-guards: all 49 assertions passed (#361 bash-block execution)
REAL_EXIT=0
=== node scripts/validate-workflow-contracts.js ===
Workflow contract validation passed
REAL_EXIT=0
=== node scripts/validate-script-sync.js ===
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
REAL_EXIT=0
=== node scripts/test-forge-finalize-findings.js ===     (extra — it pins docs/api.md statements)
133 passed, 0 failed
REAL_EXIT=0
```

Full-scope walkthrough on the final bytes:

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2432}
WALKTHROUGH_CERT_REAL_EXIT=0
```

**210 ran / 210 passed, full scope, exit 0** — identical to the baseline, which is the point: this is
a behaviour-preserving docking. Three separate full-scope runs were made (baseline, post-edit, and
this one on the final bytes after the last `docs/api.md` paragraph move); all three were 210/210 at
exit 0.

### Mutation proof of the one new pin

Control, unmutated: `Route-reachability test passed (331 assertions).` `REAL_EXIT=0`

Mutated — the sentence reverted to its two-heading form on **one** shipped surface
(`plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md`):

```
FAIL: MANIFEST missing-token: block fn-mission-list-report token "`## Validation`, `## Changed Paths` and `## Mission List` are where the finalize transaction's own findings land" absent from plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md
FAIL: MANIFEST: derived-universe presence check clean over 180 obligated file-checks
Route-reachability test FAILED: 2 failure(s), 330 passed.
MUTATED_REAL_EXIT=1
```

Restored from the pre-mutation copy; `--check` back to `all 18 surfaces byte-match` at exit 0 and
route-reachability back to 331 at exit 0. The mutation was applied to a **generated** file and
reverted from a byte copy — no authored source was mutated in place.

### Coverage I could not run, named rather than skipped

`test-opencode-edition.js` / `test-kimi-edition.js` **cannot run from this linked worktree** — the
known #969 consequence impl-969 reproduced and routed back to the test author. So the six refreshed
edition trees carrying my sentence are not suite-verified here. What I checked instead, statically:
the opencode prose guard's forbidden vocabulary is `/\bvariants?\b/i`
(`scripts/test-opencode-edition.js:840`), scoped to one block heading; my added sentence contains no
`variant` and no other mechanism word, no vendor, no model, and no command.

## docs/api.md IS test-consumed, and this change stales the chain receipt

Asked for explicitly, so stated plainly. `scripts/kaola-workflow-adaptive-schema.js:905`
`SELF_HOST_TEST_CONSUMED` lists `README.md`, `CHANGELOG.md`, **`docs/api.md`**,
**`docs/workflow-state-contract.md`**, `docs/agents-source.md`. On a self-host repo those are
**validation-visible — they count as code** in `computeCodeTreeHash`, so editing them changes the
code-tree hash and a receipt taken before this change reads **stale**.

I did not work around it: two of the six files I edited are on that list, plus the skeleton, the
manifest and six shipped surfaces, which are ordinary code paths. **The chains must run after this
lands** — which the bundle owes anyway, since three implementers changed `scripts/`.
`docs/architecture.md` and `docs/conventions.md` are *not* on the list and are validation-invisible.

## Stale prose found that was NOT on the list

1. **`docs/architecture.md:299` was FALSE, not incomplete** — see above. Every other item in the
   brief was an undercount; this one asserted a staleness that #969 removed. Fixed (it is in a file
   I own).
2. **`docs/opencode-edition.md:333-335` and `docs/kimi-edition.md:307-308`** — the "Develop /
   regenerate" bash blocks enumerate `--write`, `--check` (and opencode's `--write-config`) and do
   **not** carry `--refresh-present`. This is the class impl-969 flagged, and it is the only place in
   the repo where the sync CLI is enumerated as a command list. **Both files are outside my write
   set — NOT changed.** Neither states the tree root anywhere, so neither carries a false root claim;
   the gap is the missing mode only.
3. **The audit result for `docs/api.md` itself**: it enumerates the two sync scripts in exactly one
   row (`:1498`) and lists no flags for them, and it does not mention `generate-routing-surfaces.js`
   at all. So there was no flag enumeration to correct — I added `--refresh-present` to that row's
   contract because a reader of the row learns there what the scripts are for, and the mandated
   regenerate step now calls them.
4. **`docs/conventions.md:488` and `README.md:961`** describe `changed_paths` alone and never claim
   the measurements are exactly two. Checked, **not stale**, left alone.

## Calls I made, stated rather than buried

- **No Step-2 prose added to the skeleton.** The brief scoped the skeleton to `:215` and `:222`, and
  Step 2 is where `validation` and `changed_paths` get a paragraph each. A third paragraph is the
  natural symmetry, and I did not write it: the heading plus the amended "do not delete them, do not
  soften them" sentence already tells an orchestrator the section is script-owned, and the project's
  standing rule is that there is already too much in it. If you want the third measurement explained
  on the prompt surface rather than only in `docs/api.md`, that is one added sentence in Step 2 and
  a regenerate — say so and I will do it.
- **`fn-mission-list-report` is a new block, not a token bolted onto `fn-changed-paths-report`.** A
  `## Mission List` token inside a block named for changed paths reads as a mistake to the next
  person. One entry in an existing manifest is not new machinery.

---

# Appendix — second task: `--refresh-present` docked into the two edition docs

Assigned after the report above, to close the gap I had named outside my original write set.

**Verification tier: `regression-green`.** Two files, prose only.

## Confirmed rather than assumed: nothing is generated from these two docs

Asked for explicitly, because being wrong in that direction means a rendered surface diverges
silently. Three independent checks, all negative:

- **Not generated.** Neither file carries an `@generated` header; both open with hand-authored prose.
- **Nothing writes them.** No script under `scripts/`, no template, no installer writes either path.
- **No suite reads them.** The single repo-wide match in a suite is a **comment** at
  `scripts/test-kimi-edition.js:439` ("Prose in docs/kimi-edition.md cannot satisfy that…") — its
  point is precisely that the prose is *not* checked, which is why the K2 declaration was bound to a
  table instead. Neither edition suite performs a read of either file.
- Repo-wide, the only other references are prose links in `README.md` and historical entries in
  `CHANGELOG.md`. **Neither doc is in `SELF_HOST_TEST_CONSUMED`**, so unlike `docs/api.md` these two
  are validation-invisible and do **not** move the code-tree hash.

So: pure prose, no generated surface behind them, no regenerate needed and none run.

## Files changed

| file | change |
|---|---|
| `docs/opencode-edition.md` | `--refresh-present` row in the "Develop / regenerate" block; one sentence under it |
| `docs/kimi-edition.md` | same, and the block's comment column re-aligned to fit the longer flag |

Wording taken from the scripts' own usage text (`sync-kimi-edition.js:852`,
`sync-opencode-edition.js:968`) rather than invented: *regenerate every forge tree that already
exists; create none*, and **it ignores `--forge`** — worth stating, since the block directly above it
in both docs demonstrates `--forge=`.

The sentence under each block states the result a reader acts on: a routing-prose change needs no
separate refresh, because the mandated `generate-routing-surfaces.js --write` already leaves every
`.opencode*` / `.kimi*` tree on the machine in parity and still creates none — reach for
`--refresh-present` directly only when refreshing the trees is the whole errand. No mechanism: no
claim about what invokes what, no child processes, no root resolution.

## The false-claim check you asked for: I found none. Two near-misses, named not fixed

Neither file carries a sentence that #969 made **false** the way `docs/architecture.md:299` was. Two
are now *incomplete*, and per your instruction I left both and am naming them:

1. **`docs/opencode-edition.md:30-33` / `docs/kimi-edition.md:31-34`** — "the edition stays out of
   `npm test`, `edition-sync.js`, `install.sh`, **and the routing-surface contract**". Still true on
   the reading that can be checked: the contract is the `--check` byte-compare wired into the four
   chains, `--check` is deliberately untouched, and no chain gained edition coverage. It is
   incomplete only in that the generator's `--write` now touches the trees — which my added sentence
   states a few sections later. **Judgement call, and it is yours if you disagree:** a reader who
   takes "routing-surface contract" to mean "routing-surface machinery" would now be misled.
2. **`docs/opencode-edition.md:240`** — `./install-opencode.sh --regenerate  # refresh in-repo
   .opencode/ from canonical`. "in-repo" is accurate for the documented posture (run from the main
   checkout) and misleading from a linked worktree, where impl-969 **measured** the installer now
   failing loudly with `no agent sources found`. I deliberately did **not** touch it: that is the
   open installer exposure impl-969 routed back for a test author, and rewording the doc to describe
   the current worktree behaviour would document a defect as if it were the design. It should be
   docked *with* the installer fix, not ahead of it.

## Success criteria — real exit codes, after these two edits

```
=== node scripts/generate-routing-surfaces.js --check ===
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
REAL_EXIT=0
=== node scripts/test-generate-routing-surfaces.js ===
test-generate-routing-surfaces: all 434 assertions passed.
REAL_EXIT=0
=== node scripts/test-route-reachability.js ===
Route-reachability test passed (331 assertions).
REAL_EXIT=0
=== node scripts/validate-workflow-contracts.js ===
Workflow contract validation passed
REAL_EXIT=0
=== node scripts/validate-script-sync.js ===
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
REAL_EXIT=0
=== node scripts/test-bash-block-guards.js ===
test-bash-block-guards: all 49 assertions passed (#361 bash-block execution)
REAL_EXIT=0
```

Full-scope walkthrough on the final bytes of both tasks:

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2432}
WALKTHROUGH_FINAL2_REAL_EXIT=0
```

**210 ran / 210 passed, full scope, exit 0** — the fourth full-scope run of this task and identical
to the baseline, which is what a behaviour-preserving docking should look like.

The two edition suites still cannot run from this linked worktree (the #969 consequence), so these
two docs — which no suite reads — are covered by inspection only. That is the honest limit of what
I verified.

---

# Appendix 2 — the additive-boundary sentence, qualified

Third and last instruction: qualify "the routing-surface contract", and leave `opencode:240` alone.

## `docs/opencode-edition.md:30-35` and `docs/kimi-edition.md:31-35`

Both now read: *…the edition stays out of `npm test`, `edition-sync.js`, `install.sh`, and the
routing-surface `--check` contract, and keeps its own suite. The mandated
`generate-routing-surfaces.js --write` still refreshes a tree that already exists, and creates
none.*

**Two changes, not one, and the second was mine to justify.** The qualifier alone states only half
of the boundary — that the edition is outside the `--check` contract — and says nothing about
`--write`, so a reader could still leave that paragraph believing the generator never touches their
tree. Since the paragraph sits ~300 lines above the "Develop / regenerate" section where the
`--write` result is stated, I made the boundary complete where the claim is made. That is your own
stated rationale (the ruling is `npm test` **while** the mandated `--write` does touch the trees)
carried through to both halves.

**One ambiguity closed before it shipped.** My first draft said "The mandated `--write`…", which in
a paragraph whose other flag is `--forge` reads naturally as *the sync script's* `--write` — a
different command that does something else. It is now named in full,
`generate-routing-surfaces.js --write`, matching the sentence lower in each file.

## `docs/opencode-edition.md:240` — untouched, and it self-resolves

Left exactly as it was, per your instruction and for the reason on record. Noting for the file that
you reported the exposure is worse than impl-969 measured: `install-kimi.sh` from a worktree exits
**0** having deployed **zero** skills — a silent empty install, not a loud failure. Once the
installer fix lands, `./install-opencode.sh --regenerate` from a worktree works and that line is
accurate again with no edit. I touched neither installer nor their docs; another agent owns them.

## Success criteria — real exit codes, final bytes

```
=== node scripts/generate-routing-surfaces.js --check ===
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
REAL_EXIT=0
=== node scripts/test-generate-routing-surfaces.js ===
test-generate-routing-surfaces: all 434 assertions passed.
REAL_EXIT=0
=== node scripts/test-route-reachability.js ===
Route-reachability test passed (331 assertions).
REAL_EXIT=0
=== node scripts/validate-workflow-contracts.js ===
Workflow contract validation passed
REAL_EXIT=0
=== node scripts/validate-script-sync.js ===
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
REAL_EXIT=0
=== node scripts/test-bash-block-guards.js ===
test-bash-block-guards: all 49 assertions passed (#361 bash-block execution)
REAL_EXIT=0
```

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2432}
WALKTHROUGH_FINAL3_REAL_EXIT=0
```

**210 ran / 210 passed, full scope, exit 0** — the fifth full-scope run across this agent's three
instructions, and identical to the baseline every time. That invariance *is* the evidence for
`regression-green`: nothing I wrote moved a behaviour.

## Complete file list for this agent, across all three instructions

`docs/api.md` · `docs/architecture.md` · `docs/workflow-state-contract.md` · `docs/conventions.md` ·
`docs/opencode-edition.md` · `docs/kimi-edition.md` · `templates/routing/finalize.skeleton.md` ·
`templates/routing/required-blocks.js` · and the six **regenerated** routing surfaces
(`commands/kaola-workflow-finalize.md`, the two per-forge `commands/` copies, and the three
`skills/kaola-workflow-finalize/SKILL.md` copies).

Never touched: `CHANGELOG.md`, any test file, anything under `scripts/`, `install-all.sh`, both
edition installers and their surrounding prose.

---

# Appendix 3 — `--print-tree-root`

New surface that landed with the installer fix, after my audit — so this is new, not a miss.

## Verified before documented

The flag's behaviour was measured, not taken from the brief. Run read-only **from the linked
worktree**:

```
=== opencode --print-tree-root (from the WORKTREE) ===
/Users/ylpromax5/Workspace/Kaola-Workflow
REAL_EXIT=0
=== kimi ===
/Users/ylpromax5/Workspace/Kaola-Workflow
REAL_EXIT=0
=== does --forge change it? ===   (--forge=gitea)
/Users/ylpromax5/Workspace/Kaola-Workflow
REAL_EXIT=0
```

One absolute directory, the **main checkout** and not the worktree it was invoked from, identical
across editions, unchanged by `--forge`, nothing else on stdout, exit 0. Matches the brief exactly.

## `docs/api.md:1498` — the row, extended

Added, after the `--refresh-present` sentence already there: `--print-tree-root` prints the single
absolute directory that edition's generated tree lands in and writes nothing; **both** modes ignore
`--forge`, because the answer is the same for all three; and each edition installer takes its source
tree from that answer instead of assuming one beside itself, so an install run from a linked
worktree finds the tree.

The "why" sentence is included because this table's neighbours carry exactly that kind of context —
the install-manifest row explains why an empty list refuses, the preflight row explains what never
invokes it. A bare mode list would have been the wrong shape *for this table*.

## The two edition docs: `--print-tree-root` deliberately LEFT OUT

My call, as invited, and the reasoning so you can reverse it in one edit:

Every entry in those "Develop / regenerate" blocks is something a developer types **to change the
tree or to verify it** — `--write`, `--write-config`, `--refresh-present`, `--check`, and the suite.
`--print-tree-root` does neither: it changes nothing, verifies nothing, and answers a question those
same two files already answer in prose two paragraphs below ("always the main checkout's trees") and
again under the block ("already leaves every tree on the machine in parity"). Listing it there would
be the third statement of one fact, in the two files least in need of it.

It is documented once, in the `docs/api.md` script-contract table, which is where the installer
contract it exists to serve already lives. One rule, one wording.

The counter-argument, stated because it is real: the tree root moving to main is genuinely
surprising from inside a worktree, and "which directory am I actually refreshing?" is a fair
developer question. If you think a developer will hit that, one row in each block is the fix and I
have no objection to it.

## `docs/opencode-edition.md:240` — re-verified, ACCURATE, untouched

The line is `./install-opencode.sh --regenerate            # refresh in-repo .opencode/ from canonical`.

Three checks, all clean:

1. **The shipped installer says the same words.** `install-opencode.sh:86` — the usage text a user
   actually sees — reads `--regenerate     refresh the in-repo .opencode/ tree from canonical, then
   exit`. The doc mirrors the shipped surface verbatim rather than paraphrasing it.
2. **"in-repo" is contrasting with the deploy destination, not with the worktree.** Every other row
   in that block is `deploy into …` (the current project, a `--target`, or `--global`). `--regenerate`
   is the one row that touches the repo's own generated tree instead of a deploy target, which is
   what "in-repo" distinguishes. That contrast is untouched by where the tree root resolves.
3. **The installer now asks rather than assumes.** `install-opencode.sh:155` /
   `install-kimi.sh:125` take `TREE_ROOT` from `--print-tree-root` and build `SOURCE_TREE` from it,
   so the tree it refreshes and the tree it deploys from are the same directory by construction.

**Left exactly as it was.** It is accurate, and it needed no edit — the outcome you predicted.

## Success criteria — real exit codes

```
=== node scripts/generate-routing-surfaces.js --check ===
generate-routing-surfaces --check: all 18 surfaces byte-match the skeleton.
REAL_EXIT=0
=== node scripts/test-generate-routing-surfaces.js ===
test-generate-routing-surfaces: all 434 assertions passed.
REAL_EXIT=0
=== node scripts/test-route-reachability.js ===
Route-reachability test passed (331 assertions).
REAL_EXIT=0
=== node scripts/validate-workflow-contracts.js ===
Workflow contract validation passed
REAL_EXIT=0
=== node scripts/validate-script-sync.js ===
OK: 15 common scripts, 27 byte-identical groups, 1 rename-normalized families, 2 hooks.json families (config + hooks dir), and 6 forge export-superset families in sync.
    committed kernel parity: 4 Oracle Kernel copies identical at HEAD.
REAL_EXIT=0
=== node scripts/test-bash-block-guards.js ===
test-bash-block-guards: all 49 assertions passed (#361 bash-block execution)
REAL_EXIT=0
=== node scripts/test-forge-finalize-findings.js ===   (it pins docs/api.md statements)
133 passed, 0 failed
REAL_EXIT=0
```

```
##KW-SHARD {"suite":"simulate-workflow-walkthrough","index":1,"total":1,"scenarios":210,"ran":210,"passed":210,"failed":0}
Workflow walkthrough simulation passed
spawn-census: {"suite":"simulate-workflow-walkthrough","spawns":2432}
WALKTHROUGH_FINAL4_REAL_EXIT=0
```

**210 ran / 210 passed, full scope, exit 0** — sixth full-scope run, identical to baseline.

**`docs/api.md` was edited again, so the code-tree hash moved again** — the chain receipt still has
to be produced after the bundle's last write. Nothing about that changed.
